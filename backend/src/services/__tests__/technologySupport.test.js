import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute:vi.fn(),getConnection:vi.fn(),notify:vi.fn(),attachments:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn() }));
vi.mock('../../config/database.js',()=>({default:{getConnection:m.getConnection,execute:m.execute}}));
vi.mock('../../models/Notification.model.js',()=>({default:{create:m.notify}}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({prepareEncryptedTicketText:text=>({plain:null,ciphertext:`encrypted:${text}`,iv:'iv',authTag:'tag',keyId:'key1'})}));
vi.mock('../unifiedEmail/ticketInboundAttachments.service.js',()=>({persistGmailAttachmentsForTicket:m.attachments}));
import {ingestTechnologyEmail,technologyOwner,isTechnologyIdentity,assignTechnologyTicket,prioritizeTechnologyAddresses,ignoreOutboundTechnologyCopy} from '../technologySupport.service.js';
import {allowedTopicsForCreatorRole,normalizeTicketTopic} from '../../utils/ticketTopics.js';
const email={identity:{id:7,agency_id:2,identity_key:'technology',from_email:'Technology@itsco.health'},fromEmail:'marcia.mcgirr@d11.org',subject:'Re: Keller portal is ready',bodyText:'I cannot see the upload option',messageId:'<reply1@d11.org>',threadId:'thread1',gmailMessageId:'g1',gmail:{},payload:{},recipients:['Technology@itsco.health','schools@itsco.health']};
let receipts,threadTicket,owners;
beforeEach(()=>{
 vi.resetAllMocks();receipts=new Map();threadTicket=null;owners=[{id:501}];
 m.getConnection.mockResolvedValue({execute:m.execute,beginTransaction:m.begin,commit:m.commit,rollback:m.rollback,release:m.release});
 m.notify.mockResolvedValue({id:1});m.attachments.mockResolvedValue({});
 m.execute.mockImplementation(async(sql,params=[])=>{
  expect((sql.match(/\?/g)||[]).length).toBe(params.length);
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('FROM technology_ticket_email_receipts'))return [receipts.has(params[1])?[{ticket_id:receipts.get(params[1])}]:[]];
  if(sql.includes('SELECT DISTINCT u.id') && sql.includes('LOWER(TRIM(u.email))')) return [[{id:1226}]];
  if(sql.includes('SELECT DISTINCT u.id'))return [owners];
  if(sql.includes('SELECT id FROM support_tickets'))return [threadTicket?[{id:threadTicket}]:[]];
  if(sql.includes('SELECT DISTINCT sc.school_organization_id'))return [[{school_organization_id:430}]];
  if(sql.includes('INSERT INTO support_tickets')){threadTicket=88;return [{insertId:88}];}
  if(sql.includes('INSERT INTO technology_ticket_email_receipts'))receipts.set(params[1],params[2]);
  return [{affectedRows:1}];
 });
});
it('recognizes Technology aliases but not other departments',()=>{
 expect(isTechnologyIdentity(email.identity)).toBe(true);expect(isTechnologyIdentity({...email.identity,identity_key:'login_recovery'})).toBe(true);
 expect(isTechnologyIdentity({identity_key:'schools',from_email:'schools@itsco.health'})).toBe(false);
});
it('creates an encrypted Technology ticket assigned to Michael with attachments',async()=>{
 expect(await ingestTechnologyEmail(email)).toEqual({ingested:true,ticketId:88,duplicate:false});
 const create=m.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO support_tickets'));
 expect(create[0]).toContain("'technology','open'");expect(create[1]).toContain(501);expect(create[1]).toContain(430);
 expect(create[1]).toContain(`encrypted:${email.bodyText}`);expect(create[1]).not.toContain(email.bodyText);
 expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({userId:501,agencyId:2,relatedEntityId:88}));
 expect(m.commit).toHaveBeenCalledOnce();expect(m.attachments).toHaveBeenCalledWith(expect.objectContaining({ticketId:88,gmailMessageId:'g1'}));
});
it('deduplicates polling and appends later replies to the same scoped ticket',async()=>{
 await ingestTechnologyEmail(email);await ingestTechnologyEmail({...email,gmailMessageId:'group-copy-of-g1'});
 expect(m.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO support_ticket_messages'))).toHaveLength(1);
 await ingestTechnologyEmail({...email,gmailMessageId:'g2',messageId:'<reply2@d11.org>'});
 expect(m.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO support_tickets'))).toHaveLength(1);
 expect(m.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO support_ticket_messages'))).toHaveLength(2);
 const lookup=m.execute.mock.calls.find(([sql])=>sql.includes('SELECT id FROM support_tickets'));
 expect(lookup[0]).toContain('agency_id=?');expect(lookup[0]).toContain('LOWER(source_email_from)=?');
});
it('rolls back for retry when Michael is unavailable',async()=>{
 owners=[];await expect(ingestTechnologyEmail(email)).rejects.toThrow('Michael Mendez');
 expect(m.rollback).toHaveBeenCalled();expect(m.commit).not.toHaveBeenCalled();expect(m.attachments).not.toHaveBeenCalled();
});
it('does not guess between duplicate eligible owners',async()=>{
 owners=[{id:501},{id:502}];await expect(technologyOwner(2)).rejects.toThrow('uniquely resolved');
});
it('routes new school portal Technology tickets to Michael too',async()=>{
 expect(allowedTopicsForCreatorRole('school_staff')).toContain('technology');expect(normalizeTicketTopic('Technology')).toBe('technology');
 expect(await assignTechnologyTicket({ticketId:88,agencyId:2})).toBe(501);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("topic='technology'"),[501,88,2]);
});
it('leaves non-Technology mail alone',async()=>{
 expect(await ingestTechnologyEmail({...email,identity:{identity_key:'schools',from_email:'schools@itsco.health',agency_id:2}})).toEqual({ingested:false});expect(m.getConnection).not.toHaveBeenCalled();
});

it('prioritizes Technology on reply-all, accepts internal staff requests, and ignores its own outgoing copies',()=>{
 expect(prioritizeTechnologyAddresses(['schools@itsco.health','keller@itsco.health','Technology@itsco.health'])[0]).toBe('Technology@itsco.health');
 const senders=['technology@itsco.health','michael@plottwistco.com'];
 expect(ignoreOutboundTechnologyCopy('michael@plottwistco.com',senders,true)).toBe(false);
 expect(ignoreOutboundTechnologyCopy('Technology@itsco.health',senders,true)).toBe(true);
 expect(ignoreOutboundTechnologyCopy('michael@plottwistco.com',senders,false)).toBe(true);
});
