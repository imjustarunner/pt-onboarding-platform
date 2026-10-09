import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({name:'ITSCO',portal_url:'itsco'}))}}));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/MessageLog.model.js', () => ({ default: { createInbound: vi.fn(), createOutbound: vi.fn(), markSent: vi.fn(), markFailed: vi.fn() } }));
vi.mock('../../models/SmsCareThread.model.js', () => ({ default: { upsert: vi.fn() } }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: vi.fn() } }));
vi.mock('../smsCompliance.service.js', () => ({ recordInboundConversation: vi.fn() }));
vi.mock('../smsRequestedSupport.service.js', () => ({ alertRequestedSupport: vi.fn() }));
vi.mock('../smsProfileAudit.service.js', () => ({ recordSmsProfileAudit: vi.fn() }));
import { alertRequestedSupport } from '../smsRequestedSupport.service.js';
import pool from '../../config/database.js';
import MessageLog from '../../models/MessageLog.model.js';
import SmsCareThread from '../../models/SmsCareThread.model.js';
import Vonage from '../vonage.service.js';
import { offerOutOfOfficeSupport, handleOutOfOfficeSupportReply, OUT_OF_OFFICE_SMS } from '../smsOutOfOffice.service.js';
const route = { agencyId: 2, clientId: 4, number: { id: 1 }, careOwnerUserId: 10, numberPurpose: 'clinical_care' };
const incoming = { agencyId: 2, numberId: 1, clientId: 4, from: '+17195550100', to: '+17195550200', body: 'SUPPORT', messageId: 'reply1' };
let db, offer, newer;
beforeEach(() => {
 vi.clearAllMocks(); newer = false; alertRequestedSupport.mockResolvedValue(undefined);
 offer = { id: 50, user_id: 10, client_id: 4, sms_thread_key: 'thread', metadata: { supportChoiceOffer: true, triggerInboundId: 40 } };
 db = { beginTransaction: vi.fn(), rollback: vi.fn(), commit: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
  if (sql.includes('FOR UPDATE')) return [offer ? [offer] : []];
  if (sql.includes('SELECT id FROM message_logs')) return [newer ? [{id:51}] : []];
  if (sql.includes('INSERT INTO support_tickets')) return [{insertId:60}];
  return [{affectedRows:1}];
 }) };
 pool.getConnection.mockResolvedValue(db); pool.execute.mockResolvedValue([[]]);
 MessageLog.createInbound.mockResolvedValue({id:40}); MessageLog.createOutbound.mockResolvedValue({id:50});
 Vonage.sendSms.mockResolvedValue({sid:'sent1'});
});
it('stores the original for both providers without any ticket or forwarding', async () => {
 await offerOutOfOfficeSupport({route,...incoming,body:'Can we talk tomorrow?'});
 expect(MessageLog.createInbound).toHaveBeenCalledWith(expect.objectContaining({body:'Can we talk tomorrow?',clientId:4,metadata:expect.objectContaining({awaitingProviderReturn:true})}));
 expect(SmsCareThread.upsert).toHaveBeenCalledWith(expect.objectContaining({careState:'under_care',supportAccess:'observe'}));
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({body:expect.stringContaining(OUT_OF_OFFICE_SMS)}));
 expect(MessageLog.createInbound.mock.invocationCallOrder[0]).toBeLessThan(Vonage.sendSms.mock.invocationCallOrder[0]);
 expect(OUT_OF_OFFICE_SMS).toContain('saved in their app now');
 expect(pool.getConnection).not.toHaveBeenCalled();
});
it('retains the original when the offer cannot be sent', async () => {
 Vonage.sendSms.mockRejectedValueOnce(Object.assign(new Error('blocked'),{code:'sms_opted_out'}));
 await offerOutOfOfficeSupport({route,...incoming,body:'Hi'});
 expect(MessageLog.createInbound).toHaveBeenCalled(); expect(MessageLog.markFailed).toHaveBeenCalled();
 expect(pool.getConnection).not.toHaveBeenCalled();
});
it('does not repeat an offer for a carrier retry', async () => {
 pool.execute.mockResolvedValueOnce([[{id:40}]]);
 await offerOutOfOfficeSupport({route,...incoming});
 expect(MessageLog.createInbound).not.toHaveBeenCalled(); expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it.each(['Y','YES','N','No','Can you help?'])('does not forward without acceptance: %s', async body => {
 expect(await handleOutOfOfficeSupportReply({...incoming,body})).toBe(false);
 expect(pool.getConnection).not.toHaveBeenCalled();
});
it.each(['SUPPORT','support',' SUPPORT '])('creates a ticket and consent evidence for %s', async body => {
 expect(await handleOutOfOfficeSupportReply({...incoming,body})).toBe(true);
 expect(db.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO support_tickets'))).toHaveLength(1);
 expect(db.execute.mock.calls.some(([sql,args])=>sql.includes('JSON_SET') && args[0]===60 && args[1]==='reply1')).toBe(true);
 expect(db.commit).toHaveBeenCalled();
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({body:expect.stringContaining('queued for urgent support review')}));
});
it('requires a matching sent offer; an ordinary Y remains available to appointment handling', async () => {
 offer=null; expect(await handleOutOfOfficeSupportReply(incoming)).toBe(false);
 expect(db.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO support_tickets'))).toHaveLength(0);
 expect(db.execute.mock.calls[0][1]).toEqual([2,1,4,incoming.to,incoming.from]);
});
it('consumes a duplicate carrier reply without opening another ticket or confirming an appointment', async () => {
 offer.metadata.supportChoiceTicketId=60;offer.metadata.supportChoiceReplyId='reply1';
 expect(await handleOutOfOfficeSupportReply(incoming)).toBe(true);
 expect(db.commit).not.toHaveBeenCalled();expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('does not create another ticket for a later SUPPORT on the completed offer', async () => {
 offer.metadata.supportChoiceTicketId=60;offer.metadata.supportChoiceReplyId='old';
 expect(await handleOutOfOfficeSupportReply(incoming)).toBe(false);
});
it('allows explicit SUPPORT despite a newer appointment request', async () => {
 newer=true; expect(await handleOutOfOfficeSupportReply({...incoming,body:'SUPPORT'})).toBe(true);expect(db.commit).toHaveBeenCalled();
});
it('rolls back on ticket storage failure without claiming successful forwarding', async () => {
 db.execute.mockImplementation(async sql=>{if(sql.includes('FOR UPDATE'))return [[offer]];if(sql.includes('INSERT INTO support_tickets'))throw new Error('Storage down');return [[]];});
 await expect(handleOutOfOfficeSupportReply(incoming)).rejects.toThrow('Storage down');
 expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();expect(Vonage.sendSms).not.toHaveBeenCalled();
});

it('alerts support only after persisting the high-priority ticket', async () => {
 await handleOutOfOfficeSupportReply(incoming);
 expect(db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO support_tickets'))[0]).toContain("'open', 'high', 0");
 expect(alertRequestedSupport).toHaveBeenCalledWith(50);
 expect(db.commit.mock.invocationCallOrder[0]).toBeLessThan(alertRequestedSupport.mock.invocationCallOrder[0]);
 expect(OUT_OF_OFFICE_SMS).toContain('Reply SUPPORT');
 expect(OUT_OF_OFFICE_SMS).toContain('988'); expect(OUT_OF_OFFICE_SMS).toContain('911');
});
it('retains the queued request when alert dispatch fails', async () => {
 alertRequestedSupport.mockRejectedValueOnce(new Error('offline'));
 expect(await handleOutOfOfficeSupportReply(incoming)).toBe(true);
 expect(db.commit).toHaveBeenCalled();
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({body:expect.stringContaining('does not confirm someone has read it')}));
});
