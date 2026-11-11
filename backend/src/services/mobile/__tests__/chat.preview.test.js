import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),decrypt:vi.fn(),refresh:vi.fn(),rows:[],attachments:true}));
vi.mock('../../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../../models/User.model.js',()=>({default:{findById:vi.fn(async()=>({id:1,role:'provider'})),getAgencies:vi.fn(async()=>[{id:20}])}}));
vi.mock('../../../models/ClientGuardian.model.js',()=>({default:{}}));
vi.mock('../../../models/Notification.model.js',()=>({default:{}}));
vi.mock('../../guardianSharedMessages.service.js',()=>({refreshSharedChildMemberships:vi.fn()}));
vi.mock('../../clientSecureConversation.service.js',()=>({ensureClientSecureConversation:vi.fn(),resolveClientForSecureRecipients:vi.fn(),refreshClientSecureAccess:mocks.refresh}));
vi.mock('../../secureMessageRecord.service.js',()=>({resolveSecureMessageClient:vi.fn(),recordSecureMessageInChart:vi.fn()}));
vi.mock('../../secureMessageBoundary.service.js',()=>({defaultChatChannel:vi.fn(),recordSecureMessageEvent:vi.fn(),recordSecureThreadOpen:vi.fn()}));
vi.mock('../../teamMeetingStart.service.js',()=>({startAdhocTeamMeeting:vi.fn()}));
vi.mock('../../chatEncryption.service.js',()=>({decryptChatText:mocks.decrypt,encryptChatText:vi.fn(),isChatEncryptionConfigured:vi.fn()}));
vi.mock('../agencyScope.service.js',()=>({listMobileAgencies:vi.fn(async()=>({agencies:[{id:20}]}))}));
import {listMyThreads,listFilesInbox,findExistingDirectThreadBetweenUsers} from '../../../controllers/chat.controller.js';
import {mobileThreadItem} from '../conversa.service.js';
beforeEach(()=>{
 vi.clearAllMocks();mocks.attachments=true;mocks.rows=[];mocks.refresh.mockResolvedValue();mocks.decrypt.mockReturnValue('Decrypted internal update');
 mocks.execute.mockImplementation(async(sql)=>{
  if(sql.startsWith('SELECT t.id FROM chat_threads t JOIN chat_thread_participants p'))return [mocks.rows.filter(row=>row.thread_type==='group' && row.company_event_id).map(row=>({id:row.thread_id}))];
  if(sql.startsWith('SELECT e.* FROM chat_threads')){const group=mocks.rows.find(row=>row.thread_type==='group' && row.company_event_id);return [group?[{id:group.company_event_id,agency_id:group.agency_id,is_active:1,operations_json:{invitedAgencyIds:[20]}}]:[]];}
  if(sql.includes('FROM users u JOIN user_agencies ua'))return [[{id:1,first_name:'Current',last_name:'User',role:'provider',is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE',agency_id:20,agency_name:'Invited agency'}]];
  if(sql.includes('FROM company_event_audiences'))return [[{audience_type:'user',target_id:1}]];
  if(sql.includes('information_schema.tables'))return [mocks.attachments?[{1:1}]:[]];
  if(sql.includes('information_schema.columns'))return [sql.includes("column_name = 'body_ciphertext'") || sql.includes("column_name = 'slug'")?[{1:1}]:[]];
  if(sql.includes('SELECT t.id AS thread_id'))return [mocks.rows];
  if(sql.includes('SELECT tp.thread_id'))return [[{thread_id:10,user_id:1,first_name:'Current',last_name:'User'},{thread_id:10,user_id:2,first_name:'Avery',last_name:'Example',profile_photo_path:'photos/avery.png'}]];
  throw new Error('Unexpected fixture query');
 });
});
const base={thread_id:10,agency_id:20,thread_type:'direct',message_channel:'internal',last_message_id:90,last_message_body:null,last_message_at:'2026-11-06T12:00:00Z',last_message_sender_user_id:2,last_message_attachment_count:1};
async function read(){const res={json:vi.fn()},next=vi.fn();await listMyThreads({user:{id:1,role:'provider'},quickView:{mobileDeviceSessionId:8},query:{}},res,next);expect(next).not.toHaveBeenCalled();return res.json.mock.calls[0][0];}
it('passes the real listMyThreads author and attachment metadata to the mobile preview',async()=>{
 mocks.rows=[base];const [thread]=await read();expect(thread.participants).toEqual([expect.objectContaining({id:2,first_name:'Avery'})]);
 expect(mobileThreadItem(thread,1)).toMatchObject({title:'Avery Example',sender:'Avery Example',preview:'Attachment · open to view',at:base.last_message_at});
});
it('decrypts internal previews without returning encryption fields and never decrypts secure previews',async()=>{
 mocks.rows=[{...base,preview_ciphertext:'CIPHER',preview_iv:'IV',preview_tag:'TAG'},{...base,thread_id:11,message_channel:'secure',last_message_body:'Secure message — open to read',preview_ciphertext:'PRIVATE CIPHER'}];
 const threads=await read();expect(mocks.decrypt).toHaveBeenCalledTimes(1);expect(threads[0].last_message.body).toBe('Decrypted internal update');expect(JSON.stringify(threads)).not.toMatch(/CIPHER|preview_iv|preview_tag/);expect(mobileThreadItem(threads[1],1).preview).toBe('Secure message · tap to unlock');
});
it('does not return ciphertext when decryption fails and tolerates unavailable attachment metadata',async()=>{
 mocks.attachments=false;mocks.rows=[{...base,last_message_attachment_count:0,preview_ciphertext:'PRIVATE CIPHER'}];mocks.decrypt.mockImplementation(()=>{throw new Error('Key unavailable');});
 const [thread]=await read();expect(mobileThreadItem(thread,1).preview).toBe('Message unavailable');const query=mocks.execute.mock.calls.find(([sql])=>sql.includes('SELECT t.id AS thread_id'))[0];expect(query).toContain('0 AS last_message_attachment_count');
});
it('keeps a named event conversation visible after checking a cross-agency invitee’s current membership',async()=>{
 mocks.rows=[{...base,thread_type:'group',company_event_id:12,agency_id:10,channel_name:'Our second anniversary',last_message_body:'Choose a date together.'}];
 const [thread]=await read();expect(mobileThreadItem(thread,1)).toMatchObject({title:'Our second anniversary',category:'groups',isGroupDirect:true,agencyId:10,preview:'Choose a date together.'});
 const calls=mocks.execute.mock.calls,query=calls.find(([sql])=>sql.includes('SELECT t.id AS thread_id'))[0];
 expect(query).toContain("OR (t.thread_type='group' AND t.company_event_id IS NOT NULL AND t.message_channel='internal')");
 expect(calls.some(([sql])=>sql.startsWith('SELECT e.* FROM chat_threads'))).toBe(true);
 expect(calls.some(([sql])=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(sql))).toBe(false);
});
it('applies QA scope to attachment lookup and direct-thread reuse before returning IDs',async()=>{
 mocks.execute.mockImplementation(async sql=>sql.includes('information_schema')?[[{1:1}]]:[[]]);
 const res={json:vi.fn()},next=vi.fn();await listFilesInbox({user:{id:1433},quickView:{mobileDeviceSessionId:8,agencyId:450,qaAgencyIds:[450]},query:{}},res,next);expect(next).not.toHaveBeenCalled();
 const files=mocks.execute.mock.calls.find(([sql])=>sql.includes('FROM chat_message_attachments a'));expect(files[0]).toContain('AND t.agency_id=?');expect(files[1].at(-1)).toBe(450);
 await findExistingDirectThreadBetweenUsers(1433,1440,{requestedAgencyId:450,messageChannel:'internal',strictAgencyId:450});const lookup=mocks.execute.mock.calls.at(-1);expect(lookup[0]).toContain('AND t.agency_id = ? AND t.organization_id IS NULL');expect(lookup[1].at(-1)).toBe(450);
});
