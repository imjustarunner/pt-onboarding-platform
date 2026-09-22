import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,release:m.release})}}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:async()=>({url:'https://tenant.test/join/invitation/personal'})}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async()=>({email:'participant@tenant.test'})}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://tenant.test'}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantMessageMailboxes:async()=>({notifications:{id:6}})}));
vi.mock('../supervisionReplyMailbox.service.js',()=>({ensureSupervisionReplyMailbox:async()=>({from_email:'supervision-replies@tenant.test'})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../priorityEventEmail.service.js',()=>({priorityEventEmailRecipient:async({to})=>({to})}));
import {sendSupervisionEmail} from '../supervisionEmail.service.js';
const session={id:10,agency_id:2,session_type:'group',supervisor_user_id:3,status:'SCHEDULED',start_at:'2099-01-01 18:00:00',end_at:'2099-01-01 19:00:00',notify_participants:1};
const user={id:8,first_name:'Ada'};
beforeEach(()=>{vi.clearAllMocks();m.send.mockResolvedValue({id:'sent',internetMessageId:'<actual@test>',communicationId:123});m.execute.mockImplementation(async sql=>{
 if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
 if(sql.startsWith('SELECT * FROM supervision_email_deliveries'))return [[]];
 if(sql.startsWith('SELECT u.id'))return [[{id:3,first_name:'Host'},{id:8,first_name:'Ada',status:'INVITED',participant_role:'supervisee'}]];
 return [{affectedRows:1}];
});});
it('sends branded HTML from notifications, uses the app reply route, and records the actual RFC id',async()=>{await sendSupervisionEmail({session,user});expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:6,replyToOverride:'"Host via the app" <supervision-replies@tenant.test>',templateType:'meeting_invited',to:'participant@tenant.test',attachments:[expect.objectContaining({filename:'supervision.ics'})]}));expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_email_deliveries SET delivery_status='),expect.arrayContaining(['sent','<actual@test>']));});
it('claims delivery before sending and holds uncertain network failures for review instead of resending',async()=>{m.send.mockRejectedValue(new Error('timeout'));await expect(sendSupervisionEmail({session,user})).rejects.toThrow('timeout');const claim=m.execute.mock.calls.findIndex(([sql])=>sql.startsWith('INSERT INTO supervision_email_deliveries'));expect(claim).toBeGreaterThan(-1);expect(m.execute.mock.invocationCallOrder[claim]).toBeLessThan(m.send.mock.invocationCallOrder[0]);expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("delivery_status='review'"),expect.any(Array));expect(m.release).toHaveBeenCalled();});
it('does not duplicate a sent or uncertain delivery and honors notification opt-out',async()=>{m.execute.mockResolvedValueOnce([[{acquired:1}]]).mockResolvedValueOnce([[{delivery_status:'sent'}]]);expect((await sendSupervisionEmail({session,user})).id).toBe('already_sent');expect(m.send).not.toHaveBeenCalled();await sendSupervisionEmail({session:{...session,notify_participants:0},user});expect(m.send).not.toHaveBeenCalled();});

it('uses the polished CPA body, huddle calendar and its own delivery receipt',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.startsWith('SELECT * FROM huddle_email_deliveries')?[[]]:sql.startsWith('SELECT u.id')?[[{id:3,first_name:'Aunya',role:'clinical_practice_assistant'},{id:8,first_name:'Ada',is_required:1}]]:[{affectedRows:1}]);
 await sendSupervisionEmail({session:{...session,kind:'HUDDLE',provider_id:3,status:'ACTIVE',meeting_subtype:'cpa'},user});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({subject:'Invitation: CPA Meeting with Aunya',attachments:[expect.objectContaining({filename:'huddle.ics'})],html:expect.stringContaining('Clinical Practice Assistant')}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE huddle_email_deliveries SET delivery_status='),expect.any(Array));
});
