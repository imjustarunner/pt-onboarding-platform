import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),release:vi.fn(),signup:vi.fn(),signupState:vi.fn(),sms:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,release:m.release})}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{resolveByJoinRef:async()=>({participant_join_token:'s'.repeat(32)})}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{resolveByJoinRef:async()=>({participant_join_token:'h'.repeat(32)})}}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:async()=>({url:'https://tenant.test/join/invitation/personal'})}));
vi.mock('../supervisionSignup.service.js',()=>({canUserSignup:m.signup,getViewerSignupState:m.signupState}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async()=>({email:'participant@tenant.test'})}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://tenant.test'}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantMessageMailboxes:async()=>({domain:'tenant.test',notifications:{id:6,from_email:'notifications@tenant.test'}})}));
vi.mock('../supervisionReplyMailbox.service.js',()=>({ensureSupervisionReplyMailbox:async()=>({from_email:'supervision-replies@tenant.test'})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../priorityEventEmail.service.js',()=>({priorityEventEmailRecipient:async({to})=>({to})}));
vi.mock('../supervisionRsvpSms.service.js',()=>({sendSupervisionRsvpSms:m.sms}));
import {sendSupervisionEmail,sendSupervisionDayAheadReminders,prepareSupervisionEmail,signupInvitationDue} from '../supervisionEmail.service.js';
const session={id:10,agency_id:2,session_type:'group',supervisor_user_id:3,status:'SCHEDULED',start_at:'2099-01-01 18:00:00',end_at:'2099-01-01 19:00:00',notify_participants:1};
const user={id:8,first_name:'Ada'};
beforeEach(()=>{vi.clearAllMocks();m.signup.mockResolvedValue({ok:true});m.signupState.mockResolvedValue({signedUp:false,status:null});m.send.mockResolvedValue({id:'sent',internetMessageId:'<actual@test>',communicationId:123});m.execute.mockImplementation(async sql=>{
 if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
 if(sql.startsWith('SELECT * FROM supervision_email_deliveries'))return [[]];
 if(sql.startsWith('SELECT u.id'))return [[{id:3,first_name:'Host'},{id:8,first_name:'Ada',status:'INVITED',is_required:1,participant_role:'supervisee'}]];
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
it('suppresses late optional registration reminders and clearly labels the last three-day email',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT u.id')?[[{id:3,first_name:'Host'},{id:8,first_name:'Ada',status:'INVITED',is_required:0}]]:[[]]);
 for(const kind of ['day_before','join:60','join:5'])expect(await prepareSupervisionEmail({session,user,kind})).toEqual({skipped:true,reason:'optional_registration_reminder_schedule'});
 expect(await prepareSupervisionEmail({session,user,kind:'join:4320'})).toMatchObject({subject:expect.stringContaining('[Optional] Final reminder'),text:expect.stringContaining('This is your final reminder for this optional session')});
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

it('requires explicit opt-in for the single signup invitation and isolates it from regular supervision',()=>{
 const tick=new Date('2098-12-31T18:00:00Z');
 const signup={...session,enrollment_mode:'signup_only'};
 expect(signupInvitationDue(signup,tick)).toBe(false);
 signup.meeting_settings_json={signupInvitationEnabled:true};
 expect(signupInvitationDue(signup,tick)).toBe(true);
 expect(signupInvitationDue({...signup,enrollment_mode:'invited'},tick)).toBe(false);
 expect(signupInvitationDue({...signup,status:'CANCELLED'},tick)).toBe(false);
 expect(signupInvitationDue({...signup,notify_participants:0},tick)).toBe(false);
});
it('rechecks signup eligibility and uses a durable receipt so repeated ticks send one invitation',async()=>{
 const event={...session,enrollment_mode:'signup_only',meeting_settings_json:{signupInvitationEnabled:true}};
 const receipts=new Set();m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT * FROM supervision_sessions'))return [[event]];
  if(sql.startsWith('SELECT u.id'))return [[user]];
  if(sql.startsWith('SELECT * FROM supervision_email_deliveries'))return [receipts.has(args.join('|'))?[{delivery_status:'sent'}]:[]];
  if(sql.startsWith('INSERT INTO supervision_email_deliveries'))receipts.add(args.join('|'));
  return [{affectedRows:1}];
 });
 const tick=new Date('2098-12-31T18:00:00Z');
 await sendSupervisionDayAheadReminders(tick);await sendSupervisionDayAheadReminders(tick);
 expect(m.send).toHaveBeenCalledOnce();
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({subject:expect.stringContaining('sign up'),text:expect.stringContaining('not been registered automatically')}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('ua.agency_id=? AND ua.is_active=1'),[2]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('COALESCE(u.is_demo,0)=0'),[2]);
 m.signup.mockResolvedValue({ok:false});
 expect(await prepareSupervisionEmail({session:event,user,kind:'signup_invitation'})).toMatchObject({skipped:true});
});

it('pairs RSVP texts only with successfully sent reminder emails',async()=>{
 await sendSupervisionEmail({session,user,kind:'join:60'});
 expect(m.sms).toHaveBeenCalledWith({session,user,kind:'join:60'});
 expect(m.sms.mock.invocationCallOrder[0]).toBeGreaterThan(m.send.mock.invocationCallOrder[0]);
});
it.each([{pendingApproval:true},{id:'redirected',redirected:true},{skipped:true}])('does not text when email is held or redirected: %j',async result=>{
 m.send.mockResolvedValue(result);
 await sendSupervisionEmail({session,user,kind:'join:60'});
 expect(m.sms).not.toHaveBeenCalled();
});
it('can finish the paired text after an already-sent email without emailing twice',async()=>{
 m.execute.mockResolvedValueOnce([[{acquired:1}]]).mockResolvedValueOnce([[{delivery_status:'sent'}]]);
 await sendSupervisionEmail({session,user,kind:'join:60'});
 expect(m.send).not.toHaveBeenCalled();expect(m.sms).toHaveBeenCalledOnce();
});

it('catches up a delayed signup invitation within the same 24h window and never sends before it',()=>{
 const event={...session,enrollment_mode:'signup_only',meeting_settings_json:{signupInvitationEnabled:true}};
 expect(signupInvitationDue(event,new Date('2098-12-31T17:59:59Z'))).toBe(false);
 expect(signupInvitationDue(event,new Date('2099-01-01T00:00:00Z'))).toBe(true);
 expect(signupInvitationDue(event,new Date('2099-01-01T17:00:00Z'))).toBe(false);
});
it('never sends the signup broadcast after an optional participant dismisses it',async()=>{
 m.signupState.mockResolvedValue({signedUp:false,status:'DECLINED'});
 expect(await prepareSupervisionEmail({session:{...session,enrollment_mode:'signup_only',meeting_settings_json:{signupInvitationEnabled:true}},user,kind:'signup_invitation'})).toEqual({skipped:true,reason:'not_interested'});
 expect(m.send).not.toHaveBeenCalled();
});

it('keeps legacy copied signup invitees out of generic invitations and week/three-day reminders',async()=>{
 const event={...session,enrollment_mode:'signup_only',meeting_settings_json:{signupInvitationEnabled:true}};
 for(const kind of ['invitation','join:10080','join:4320','day_before','join:5']) {
  expect(await prepareSupervisionEmail({session:event,user,kind})).toEqual({skipped:true,reason:'signup_registration_required'});
 }
 expect(await prepareSupervisionEmail({session:event,user,kind:'signup_invitation'})).toMatchObject({subject:expect.stringContaining('sign up')});
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT u.id')?[[{id:3,first_name:'Host',status:'INVITED',is_required:1},{id:8,first_name:'Ada',status:'SIGNED_UP',is_required:0}]]:[[]]);
 expect(await prepareSupervisionEmail({session:event,user,kind:'join:5'})).toMatchObject({to:'participant@tenant.test'});
 expect(await prepareSupervisionEmail({session:event,user:{id:3,first_name:'Host'},kind:'invitation'})).toMatchObject({to:'participant@tenant.test'});
});


it('loads recipient-specific eligibility and balances for the invitation instead of assuming mandatory means paid',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT u.id')?[[{id:3,first_name:'Host'},{id:8,first_name:'Ada',credential:'LPCC',status:'INVITED',is_required:1,supervision_is_prelicensed:1,is_compensable_snapshot:0,supervision_individual_hours:31.12,supervision_group_hours:7.84}]]:[[]]);
 const email=await prepareSupervisionEmail({session:{...session,session_type:'individual',supervisee_user_id:8,recurrence_series_id:'series',recurrence_frequency:'BIWEEKLY'},user});
 expect(email.html).toContain('Mandatory · Not compensated');expect(email.text).toContain('Frequency: Every two weeks');
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN supervision_accounts'),expect.arrayContaining([2]));
});

it.each([[1,'Mandatory · Compensated'],[0,'Mandatory · Not compensated']])('uses hourly status when describing candidate supervision pay (hourly=%s)', async (hourly,label) => {
 m.execute.mockImplementation(async sql => sql.startsWith('SELECT u.id') ? [[
  {id:3,first_name:'Host'},
  {id:8,first_name:'Ada',status:'INVITED',is_required:1,participant_role:'supervisee',credential:'LPCC',is_hourly_worker:hourly,supervision_is_prelicensed:1,is_compensable_snapshot:1,supervision_individual_hours:0,supervision_group_hours:0}
 ]] : [[]]);
 const result=await prepareSupervisionEmail({session,user,kind:'invitation'});
 expect(result.text).toContain(label);expect(result.html).toContain(label);
 expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT u.id'))[0]).toContain('u.is_hourly_worker');
});
