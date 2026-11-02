import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({name:'ITSCO',portal_url:'itsco'}))}}));
vi.mock('../../models/MessageLog.model.js',()=>({default:{createOutbound:vi.fn(async()=>({id:9})),markSent:vi.fn(),markFailed:vi.fn()}}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn(async()=>({sid:'sent'}))}}));
import pool from '../../config/database.js';
import MessageLog from '../../models/MessageLog.model.js';
import Vonage from '../vonage.service.js';
import {sendConversationStartNotice,OUT_OF_OFFICE_SMS} from '../smsCommunicationNotice.service.js';
let db,introduced,disabled,notified;
const input={agencyId:450,numberId:6,clientId:4,userId:7,from:'+17195550100',to:'+17195550101',inboundLogId:6};
beforeEach(()=>{
 vi.clearAllMocks();introduced=false;disabled=false;notified=new Set();
 db={execute:vi.fn(async(sql,args)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('$.communicationNotice'))return [introduced?[{id:8}]:[]];
  if(sql.includes('$.outOfOfficeNoticesDisabled'))return [disabled?[{id:10}]:[]];
  if(sql.includes('$.absenceKey'))return [notified.has(args[3])?[{id:11}]:[]];
  return [[]];
 }),release:vi.fn()};pool.getConnection.mockResolvedValue(db);
 MessageLog.markSent.mockImplementation(async(id,sid,meta)=>{if(meta.communicationNotice)introduced=true;if(meta.absenceKey)notified.add(meta.absenceKey);});
});
it('sends one initial explanation through the consent and STOP gate, keeping texting available',async()=>{
 expect(await sendConversationStartNotice(input)).toBe(true);
 const request=Vonage.sendSms.mock.calls[0][0];expect(request).toMatchObject({purpose:'care',agencyId:450});
 expect(request.body).toContain('https://app.itsco.health/community-standards');
 expect(request.body).toContain('portal is recommended');expect(request.body).toContain('you can still text here');
 expect(request.body).toContain('protected care record');expect(request.body).toContain('STOP');
 expect(request.body).not.toMatch(/encrypted|HIPAA.protected texts/);
 expect(Vonage.sendSms).toHaveBeenCalledTimes(1);expect(db.release).toHaveBeenCalled();
});
it('does not repeat the introduction on later messages, another linked client, or carrier retries',async()=>{
 await sendConversationStartNotice(input);
 expect(await sendConversationStartNotice({...input,clientId:5,inboundLogId:100})).toBe(false);
 expect(Vonage.sendSms).toHaveBeenCalledTimes(1);
 const [sql,params]=db.execute.mock.calls.find(([sql])=>sql.includes('$.communicationNotice'));
 expect(sql).not.toMatch(/INTERVAL|client_id=/);expect(params).toEqual([450,6,input.to]);
});
it('combines the first introduction and away notice into one send, then stays silent for that absence',async()=>{
 await sendConversationStartNotice({...input,absenceKey:'7:schedule:42'});
 expect(Vonage.sendSms).toHaveBeenCalledTimes(1);
 expect(Vonage.sendSms.mock.calls[0][0].body).toContain(OUT_OF_OFFICE_SMS);
 expect(await sendConversationStartNotice({...input,inboundLogId:10,absenceKey:'7:schedule:42'})).toBe(false);
 await sendConversationStartNotice({...input,inboundLogId:11,absenceKey:'7:schedule:99'});
 expect(Vonage.sendSms).toHaveBeenCalledTimes(2);
 expect(Vonage.sendSms.mock.calls[1][0].body).not.toContain("You've contacted");
});
it('honors NOOO across later absences without changing appointment or provider-text permissions',async()=>{
 introduced=true;disabled=true;
 expect(await sendConversationStartNotice({...input,absenceKey:'7:manual:later'})).toBe(false);
 expect(Vonage.sendSms).not.toHaveBeenCalled();expect(MessageLog.createOutbound).not.toHaveBeenCalled();
 expect(db.execute.mock.calls.every(([sql])=>!/^UPDATE|^INSERT/.test(sql))).toBe(true);
 expect(OUT_OF_OFFICE_SMS).toContain('NOOO ("No out-of-office notices")');
 expect(OUT_OF_OFFICE_SMS).toContain('direct texting stays on');expect(OUT_OF_OFFICE_SMS).not.toContain('NOREMIND');
 expect(OUT_OF_OFFICE_SMS).toContain('911');expect(OUT_OF_OFFICE_SMS).toContain('988');
 expect(OUT_OF_OFFICE_SMS.length+7).toBeLessThanOrEqual(306);
});
it('does not send for an unknown client or without a serialization lock',async()=>{
 await sendConversationStartNotice({...input,clientId:null});expect(pool.getConnection).not.toHaveBeenCalled();
 db.execute.mockResolvedValue([[{acquired:0}]]);expect(await sendConversationStartNotice(input)).toBe(false);
 expect(Vonage.sendSms).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});
it('records a suppressed send as failed and releases the lock without claiming an introduction',async()=>{
 Vonage.sendSms.mockRejectedValueOnce(Object.assign(new Error('suppressed'),{code:'sms_opted_out'}));
 expect(await sendConversationStartNotice(input)).toBe(false);expect(MessageLog.markFailed).toHaveBeenCalledWith(9,'sms_opted_out');
 expect(introduced).toBe(false);expect(db.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)',expect.any(Array));expect(db.release).toHaveBeenCalled();
});
