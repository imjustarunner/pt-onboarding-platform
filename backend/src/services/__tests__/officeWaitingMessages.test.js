import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),access:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.getConnection}}));
vi.mock('../privateVirtualOffice.service.js',()=>({assertOfficeAccess:mocks.access}));
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:mocks.audit}));
import {readOfficeMessages,sendOfficeMessage} from '../officeWaitingMessages.service.js';
import {encryptChatText} from '../chatEncryption.service.js';
const room={id:1,userId:5,agencyId:2},actor={role:'guest',credential:'a'.repeat(43)},nonce='retry-1234567890123456';
let visit,stored,db,authorized;
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,1).toString('base64'));visit={id:8,status:'waiting',expires_at:new Date(Date.now()+60000)};stored=[];authorized=true;db={execute:mocks.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};mocks.getConnection.mockResolvedValue(db);mocks.execute.mockImplementation(async(sql,args)=>{
 if(sql.includes('FROM private_virtual_office_appointment_visits'))return [[]];
 if(sql.includes('FROM private_virtual_office_visits'))return [authorized&&args[0]===8&&args[1]===1?[visit]:[]];
 if(sql.includes('SELECT id FROM'))return [stored.length?[{id:99}]:[]];
 if(sql.includes('COUNT(*)'))return [[{total:0}]];
 if(sql.startsWith('SELECT id,'))return [stored.map(r=>({...r}))];
 if(sql.startsWith('INSERT')){stored.push({id:99,author_role:args[2],body_envelope:args[4],created_at:new Date()});return [{insertId:99}];}
 return [{affectedRows:1}];
});});
describe('private waiting room messages',()=>{
 it('requires the exact visit credential, room and visitor; no numeric ID access',async()=>{
  for(const invalid of [{role:'guest'},{role:'provider',userId:7}])await expect(readOfficeMessages(room,8,invalid)).rejects.toMatchObject({status:403});
  await expect(readOfficeMessages(room,9,actor)).rejects.toMatchObject({status:403});
  await expect(readOfficeMessages({...room,id:2},8,actor)).rejects.toMatchObject({status:403});
  authorized=false;await expect(readOfficeMessages(room,8,actor)).rejects.toMatchObject({status:403});
  expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('FROM private_virtual_office_messages'))).toBe(false);
  expect(mocks.execute.mock.calls.at(-1)[0]).toContain('credential_hash=? AND expires_at>UTC_TIMESTAMP()');
 });
 it('encrypts visitor messages and returns one message when a send is retried',async()=>{
  const input={body:'I am waiting outside.',nonce};
  expect(await sendOfficeMessage(room,8,actor,input)).toEqual({id:99});expect(await sendOfficeMessage(room,8,actor,input)).toEqual({id:99});
  expect(stored).toHaveLength(1);expect(stored[0].body_envelope).not.toContain(input.body);
  const result=await readOfficeMessages(room,8,{role:'provider',userId:5});expect(result.messages[0].body).toBe(input.body);expect(result.canSend).toBe(true);
  expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(input.body);
 });
 it('allows an owner reply while the guest is waiting and reads only that visit',async()=>{
  await sendOfficeMessage(room,8,{role:'provider',userId:5},{body:'I will be with you shortly.',nonce});
  const result=await readOfficeMessages(room,8,actor);expect(result.messages[0].author).toBe('provider');
  const read=mocks.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT id,author_role'));expect(read[0]).toContain('WHERE room_id=? AND visit_id=?');expect(read[1]).toEqual([1,8]);
 });
 it('rejects messages after a visit ends or expires, without inserting',async()=>{
  visit.status='ended';await expect(sendOfficeMessage(room,8,actor,{body:'Hello',nonce})).rejects.toMatchObject({status:409});
  visit.status='waiting';visit.expires_at=new Date(0);await expect(sendOfficeMessage(room,8,{role:'provider',userId:5},{body:'Hello',nonce})).rejects.toMatchObject({status:409});expect(stored).toHaveLength(0);expect(db.rollback).toHaveBeenCalled();
 });
 it('rejects blank/oversized messages and fails closed without an encryption key',async()=>{
  for(const body of ['', 'a'.repeat(2001)])await expect(sendOfficeMessage(room,8,actor,{body,nonce})).rejects.toMatchObject({status:400});
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');await expect(sendOfficeMessage(room,8,actor,{body:'private',nonce})).rejects.toThrow('encryption key');expect(stored).toHaveLength(0);
 });
 it('acknowledges only the messages actually returned, preserving a new incoming unread message',async()=>{
  stored=[{id:20,author_role:'provider',body_envelope:JSON.stringify(encryptChatText('Reply')),created_at:new Date()}];
  await readOfficeMessages(room,8,actor);expect(mocks.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE'))[1]).toEqual([1,8,'guest',20]);
 });
});
