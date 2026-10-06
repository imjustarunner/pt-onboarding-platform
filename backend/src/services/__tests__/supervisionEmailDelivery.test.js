import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,release:m.release})}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{resolveByJoinRef:async()=>({participant_join_token:'s'.repeat(32)})}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{resolveByJoinRef:async()=>({participant_join_token:'h'.repeat(32)})}}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:async()=>({url:'https://tenant.test/join/invitation/personal'})}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async()=>({email:'participant@tenant.test'})}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://tenant.test'}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantMessageMailboxes:async()=>({domain:'tenant.test',notifications:{id:6,from_email:'notifications@tenant.test'}})}));
vi.mock('../supervisionReplyMailbox.service.js',()=>({ensureSupervisionReplyMailbox:async()=>({from_email:'supervision-replies@tenant.test'})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../priorityEventEmail.service.js',()=>({priorityEventEmailRecipient:async({to})=>({to})}));
import {sendSupervisionEmail,sendSupervisionDayAheadReminders,prepareSupervisionEmail} from '../supervisionEmail.service.js';
const session={id:10,agency_id:2,session_type:'group',supervisor_user_id:3,status:'SCHEDULED',start_at:'2099-01-01 18:00:00',end_at:'2099-01-01 19:00:00',notify_participants:1};
const user={id:8,first_name:'Ada'};
beforeEach(()=>{vi.clearAllMocks();m.send.mockResolvedValue({id:'sent',internetMessageId:'<actual@test>',communicationId:123});m.execute.mockImplementation(async sql=>{
 if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
 if(sql.startsWith('SELECT * FROM supervision_email_deliveries'))return [[]];
 if(sql.startsWith('SELECT u.id'))return [[{id:3,first_name:'Host'},{id:8,first_name:'Ada',status:'INVITED',participant_role:'supervisee'}]];
 return [{affectedRows:1}];
});});
it('sends branded HTML from notifications, replies to tenant leadership, and records the actual RFC id',async()=>{await sendSupervisionEmail({session,user});expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:6,replyToOverride:'leadership@tenant.test',templateType:'meeting_invited',to:'participant@tenant.test',attachments:[expect.objectContaining({filename:'supervision.ics'})]}));expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_email_deliveries SET delivery_status='),expect.arrayContaining(['sent','<actual@test>']));});
it('claims delivery before sending and holds uncertain network failures for review instead of resending',async()=>{m.send.mockRejectedValue(new Error('timeout'));await expect(sendSupervisionEmail({session,user})).rejects.toThrow('timeout');const claim=m.execute.mock.calls.findIndex(([sql])=>sql.startsWith('INSERT INTO supervision_email_deliveries'));expect(claim).toBeGreaterThan(-1);expect(m.execute.mock.invocationCallOrder[claim]).toBeLessThan(m.send.mock.invocationCallOrder[0]);expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("delivery_status='review'"),expect.any(Array));expect(m.release).toHaveBeenCalled();});
it('does not duplicate a sent or uncertain delivery and honors notification opt-out',async()=>{m.execute.mockResolvedValueOnce([[{acquired:1}]]).mockResolvedValueOnce([[{delivery_status:'sent'}]]);expect((await sendSupervisionEmail({session,user})).id).toBe('already_sent');expect(m.send).not.toHaveBeenCalled();await sendSupervisionEmail({session:{...session,notify_participants:0},user});expect(m.send).not.toHaveBeenCalled();});
it('sends personal presenter reminders once and checks the current assignment every tick',async()=>{
 const sent=new Set();let assigned=true;
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT * FROM supervision_sessions'))return [[session]];
  if(sql.startsWith('SELECT u.id'))return [[{id:3,first_name:'Host'},{id:8,first_name:'Ada',status:'INVITED',isPresenter:assigned?1:0}]];
  if(sql.startsWith('SELECT * FROM supervision_email_deliveries'))return [sent.has(args.join('|'))?[{delivery_status:'sent'}]:[]];
  if(sql.startsWith('INSERT INTO supervision_email_deliveries'))sent.add(args.join('|'));
  return [{affectedRows:1}];
 });
 const start=new Date('2099-01-01T18:00:00Z');
 const tick=new Date(start.getTime()-10080*60000);
 await sendSupervisionDayAheadReminders(tick);await sendSupervisionDayAheadReminders(tick);
 expect(m.send).toHaveBeenCalledOnce();
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({subject:expect.stringContaining('You’re presenting'),html:expect.stringContaining('Edit Your Presentation'),replyToOverride:'leadership@tenant.test'}));
 assigned=false;await sendSupervisionDayAheadReminders(new Date(start.getTime()-2880*60000));
 expect(m.send).toHaveBeenCalledOnce();
});
it('does not double-send generic attendee reminders to presenters or use stale assignments',async()=>{
 m.execute.mockResolvedValue([[{id:8,isPresenter:1}]]);
 expect(await prepareSupervisionEmail({session,user,kind:'join_reminder'})).toEqual({skipped:true,reason:'presenter_reminder_schedule'});
 m.execute.mockResolvedValue([[{id:8,isPresenter:0}]]);
 expect(await prepareSupervisionEmail({session,user,kind:'presenter:60'})).toEqual({skipped:true,reason:'no_longer_presenting'});
});

it('does not add a legacy day-before email over editable tier schedules, but keeps presenter reminders',async()=>{
 const event={...session,reminder_minutes:5,meeting_settings_json:JSON.stringify({attendanceReminders:{mandatory:[],optional:[]}})};
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT * FROM supervision_sessions'))return [[event]];
  if(sql.startsWith('SELECT u.id'))return [[{id:3,first_name:'Host',is_required:1},{id:8,first_name:'Ada',status:'INVITED',isPresenter:1},{id:9,first_name:'Optional',is_required:0}]];
  if(sql.startsWith('SELECT * FROM supervision_email_deliveries'))return [[]];
  return [{affectedRows:1}];
 });
 await sendSupervisionDayAheadReminders(new Date('2098-12-31T18:00:00Z'));
 expect(m.send).toHaveBeenCalledOnce();expect(m.send).toHaveBeenCalledWith(expect.objectContaining({userId:8,subject:expect.stringContaining('You’re presenting')}));
});

it('uses the polished CPA body, huddle calendar and its own delivery receipt',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.startsWith('SELECT * FROM huddle_email_deliveries')?[[]]:sql.startsWith('SELECT u.id')?[[{id:3,first_name:'Aunya',role:'clinical_practice_assistant'},{id:8,first_name:'Ada',is_required:1}]]:[{affectedRows:1}]);
 await sendSupervisionEmail({session:{...session,kind:'HUDDLE',provider_id:3,status:'ACTIVE',meeting_subtype:'cpa'},user});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({subject:'Invitation: CPA Meeting with Aunya',attachments:[expect.objectContaining({filename:'huddle.ics'})],html:expect.stringContaining('Clinical Practice Assistant')}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE huddle_email_deliveries SET delivery_status='),expect.any(Array));
});
