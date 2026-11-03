import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../smsRequestedSupport.service.js',()=>({alertRequestedSupport:vi.fn()}));
vi.mock('../providerSmsRelay.service.js',()=>({forwardClientSmsToProviders:vi.fn()}));
vi.mock('../smsCommunicationNotice.service.js',()=>({sendConversationStartNotice:vi.fn(),OUT_OF_OFFICE_SMS:''}));
vi.mock('../../models/MessageLog.model.js',()=>({default:{createOutbound:vi.fn(async()=>({id:99})),markSent:vi.fn(),markFailed:vi.fn()}}));
vi.mock('../../models/SmsCareThread.model.js',()=>({default:{}}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn(async()=>({sid:'synthetic'}))}}));
vi.mock('../smsCompliance.service.js',()=>({recordInboundConversation:vi.fn()}));
vi.mock('../smsProfileAudit.service.js',()=>({recordSmsProfileAudit:vi.fn()}));
import pool from '../../config/database.js';
import { alertRequestedSupport } from '../smsRequestedSupport.service.js';
import { requestRelaySupport } from '../providerRelaySupport.service.js';
import { handleOutOfOfficeSupportReply } from '../smsOutOfOffice.service.js';

const input={enrollment:{id:1,agency_id:450,provider_user_id:501,number_id:6},route:{id:1,client_id:2271,family_phone:'+12025550100'},inboundLogId:80};
const familyRequest={agencyId:450,numberId:6,clientId:2271,from:input.route.family_phone,to:'+12025550101',body:'SUPPORT',messageId:'family-support'};
let db,original,offer,tickets,eligible,snapshot;
beforeEach(()=>{
 vi.clearAllMocks();tickets=0;eligible=true;
 original={id:40,agency_id:450,number_id:6,client_id:2271,direction:'INBOUND',from_number:input.route.family_phone,
  user_id:1433,assigned_user_id:1433,created_at:'2026-11-02 18:00:00',metadata:{}};
 offer={id:50,client_id:2271,user_id:1433,sms_thread_key:'synthetic',metadata:{supportChoiceOffer:true,triggerInboundId:40}};
 db={beginTransaction:vi.fn(async()=>{snapshot=structuredClone({original,offer,tickets});}),commit:vi.fn(),
  rollback:vi.fn(async()=>{({original,offer,tickets}=snapshot);}),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
   if(sql.startsWith('SELECT original.id'))return[eligible?[{id:40}]:[]];
   if(sql.includes("direction='INBOUND' FOR UPDATE"))return[JSON.stringify(args)===JSON.stringify([40,original.agency_id,original.number_id,original.client_id])&&original.direction==='INBOUND'?[original]:[]];
   if(sql.startsWith('SELECT * FROM message_logs'))return[[offer]];
   if(sql.includes('INSERT INTO support_tickets')){tickets++;return[{insertId:90}];}
   if(sql.includes('supportRequestedByUserId'))original.metadata.supportChoiceTicketId=args[0];
   if(sql.includes('supportCanonicalInboundId')&&args.at(-1)===offer.id){offer.metadata.supportChoiceTicketId=args[0];offer.metadata.supportChoiceReplyId=args[1];}
   return[{affectedRows:1}];
  })};
 pool.getConnection.mockResolvedValue(db);alertRequestedSupport.mockResolvedValue();
});
it('persists the original-message ticket before alerting and preserves the thread owner',async()=>{
 expect(await requestRelaySupport(input)).toBe(90);
 expect(db.execute.mock.calls[0][1]).toEqual([1,450,6,2271,input.route.family_phone]);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("direction='INBOUND' FOR UPDATE"),[40,450,6,2271]);
 const thread=db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO sms_care_threads'));
 expect(thread[1]).toEqual([450,6,2271,1433,90,original.created_at]);
 expect(thread[0]).not.toContain('owner_user_id=VALUES');
 expect(db.commit.mock.invocationCallOrder[0]).toBeLessThan(alertRequestedSupport.mock.invocationCallOrder[0]);
 expect(alertRequestedSupport).toHaveBeenCalledWith(40);
});
it('shares one ticket between two providers and the actual family SUPPORT handler',async()=>{
 expect(await requestRelaySupport(input)).toBe(90);
 expect(await requestRelaySupport({...input,enrollment:{...input.enrollment,id:2,provider_user_id:1438},inboundLogId:81})).toBe(90);
 expect(await handleOutOfOfficeSupportReply(familyRequest)).toBe(true);
 expect(tickets).toBe(1);expect(offer.metadata.supportChoiceTicketId).toBe(90);
 expect(db.commit).toHaveBeenCalledTimes(3);
 expect(alertRequestedSupport.mock.calls).toEqual([[40],[40],[40]]);
});
it('also reuses the ticket when the family accepts before either provider',async()=>{
 expect(await handleOutOfOfficeSupportReply(familyRequest)).toBe(true);
 expect(await requestRelaySupport(input)).toBe(90);expect(tickets).toBe(1);
});
it('rejects missing or mismatched family messages before committing or alerting',async()=>{
 eligible=false;await expect(requestRelaySupport(input)).rejects.toMatchObject({code:'handoff_message_unavailable'});
 eligible=true;original.from_number='+12025550199';
 await expect(requestRelaySupport(input)).rejects.toMatchObject({code:'handoff_recipient_changed'});
 expect(tickets).toBe(0);expect(db.commit).not.toHaveBeenCalled();expect(alertRequestedSupport).not.toHaveBeenCalled();
});
it('rolls back storage failures without claiming a successful handoff',async()=>{
 const execute=db.execute.getMockImplementation();
 db.execute.mockImplementation(async(...args)=>{if(args[0].includes('INSERT INTO support_tickets'))throw new Error('db unavailable');return execute(...args);});
 await expect(requestRelaySupport(input)).rejects.toThrow('db unavailable');
 expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();expect(alertRequestedSupport).not.toHaveBeenCalled();
});
it('retains a committed ticket as the retry source when alert delivery fails',async()=>{
 alertRequestedSupport.mockRejectedValue(new Error('dispatch unavailable'));
 expect(await requestRelaySupport(input)).toBe(90);expect(db.commit).toHaveBeenCalled();expect(db.rollback).not.toHaveBeenCalled();
 expect(await requestRelaySupport(input)).toBe(90);expect(tickets).toBe(1);
});
