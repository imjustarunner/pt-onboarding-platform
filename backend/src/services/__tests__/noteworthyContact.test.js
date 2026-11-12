import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {createNoteworthyContact} from '../noteworthyContact.service.js';
import {createNoteworthyLifecycle} from '../noteworthyLifecycle.service.js';
import {noteworthyTrialDb} from './fixtures/noteworthyTrialDb.js';
let fixture,service,notify;
const input=()=>({requestId:crypto.randomUUID(),name:'Example Owner',practiceName:'Example Practice',email:'owner@example.test',message:'Please help with my NoteWorthy setup.',category:'setup',consent:true});
beforeEach(()=>{vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));vi.stubEnv('BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,8).toString('base64'));fixture=noteworthyTrialDb();notify=vi.fn();service=createNoteworthyContact({db:fixture.db,access:createNoteworthyLifecycle({db:fixture.db}),notify});});
afterEach(()=>{fixture.close();vi.unstubAllEnvs();});
it('creates one encrypted, platform-routed ticket per public inquiry reference and alerts the team',async()=>{
  const payload=input(),saved=await service.inquiry(payload);expect(await service.inquiry(payload)).toEqual(saved);
  expect(fixture.sql.prepare('SELECT COUNT(*) n FROM support_tickets').get().n).toBe(1);
  const ticket=fixture.sql.prepare('SELECT * FROM support_tickets').get();expect(ticket).toMatchObject({target_scope:'platform',source_channel:'public_web',agency_id:100,question:null});
  expect(ticket.question_ciphertext).not.toContain(payload.message);expect(fixture.sql.prepare('SELECT contact_enc FROM noteworthy_contact_threads').get().contact_enc).not.toContain(payload.email);
  expect(notify).toHaveBeenCalledOnce();expect(notify.mock.calls[0][0]).toMatchObject({userId:10,relatedEntityId:saved.ticketId});
});
it('requires contact consent and preserves idempotency without accepting a changed payload',async()=>{
  await expect(service.inquiry({...input(),consent:false})).rejects.toMatchObject({code:'INQUIRY_CONSENT_REQUIRED'});
  const payload=input();await service.inquiry(payload);await expect(service.inquiry({...payload,message:'Different'})).rejects.toMatchObject({status:409});
});
it('uses the owner identity, returns only that practice’s non-internal replies, and retries a reply once',async()=>{
  const saved=await service.ownerMessage(1,1,{requestId:crypto.randomUUID(),message:'My question',email:'spoof@example.test'});
  const reply={threadId:saved.id,requestId:crypto.randomUUID(),message:'A follow-up'};await service.ownerMessage(1,1,reply);await service.ownerMessage(1,1,reply);
  fixture.sql.prepare('INSERT INTO support_ticket_messages(ticket_id,author_user_id,author_role,body,is_internal) VALUES(?,10,\'super_admin\',\'Visible staff reply\',0),(?,10,\'super_admin\',\'INTERNAL STAFF ONLY\',1)').run(saved.ticketId,saved.ticketId);
  const result=await service.threads(1,1);expect(result.threads[0].messages.map(m=>m.body)).toEqual(['My question','A follow-up','Visible staff reply']);
  expect(result.threads[0].messages.at(-1).sender).toBe('fundthred');
  await expect(service.ownerMessage(2,2,{...reply,requestId:crypto.randomUUID()})).rejects.toMatchObject({status:404});
  await expect(service.threads(2,1)).rejects.toMatchObject({status:403});
});
it('requires operator authority to expose contact details and fails closed without encryption',async()=>{
  await service.inquiry(input());await expect(service.operatorThreads(1)).rejects.toMatchObject({status:403});
  expect((await service.operatorThreads(10)).inquiries[0].contact.email).toBe('owner@example.test');
  const disabled=createNoteworthyContact({db:fixture.db,encryptionReady:()=>false,notify});await expect(disabled.inquiry(input())).rejects.toMatchObject({code:'MESSAGE_ENCRYPTION_UNAVAILABLE'});
  expect(fixture.sql.prepare('SELECT COUNT(*) n FROM support_tickets').get().n).toBe(1);
});
