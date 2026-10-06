import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),db:vi.fn(),send:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.db,release:m.release})}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async id=>({id,email:`person${id}@example.test`})}}));
vi.mock('../../models/PhoneNumber.model.js',()=>({default:{normalizePhone:()=>null}}));
vi.mock('../vonage.service.js',()=>({default:{}}));
vi.mock('../communicationRouting.service.js',()=>({resolveReminderNumber:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:vi.fn()}));
vi.mock('../notificationGatekeeper.service.js',()=>({default:{decideChannels:async()=>({email:true,sms:false})}}));
vi.mock('../video.service.js',()=>({isVideoConfigured:()=>true}));
vi.mock('../emailSettings.service.js',()=>({getAgencyEmailSettings:async()=>({quickViewEnabled:false})}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:async()=>({url:'https://tenant.test/join/invitation/personal'})}));
vi.mock('../meetingParticipants.service.js',()=>({meetingReplyTo:async()=> 'host@tenant.test'}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://tenant.test'}));
vi.mock('../supervisionEmail.service.js',()=>({sendSupervisionEmail:m.send}));
import {runJoinReminderTick} from '../joinReminder.service.js';
let session,sent,attendees;
beforeEach(()=>{
 vi.clearAllMocks();sent=new Set();attendees=[];
 session={id:10,agency_id:2,supervisor_user_id:7,supervisee_user_id:8,notify_participants:1,start_at:'2026-10-05 18:00:00',reminder_minutes:5,meeting_settings_json:JSON.stringify({reminders:[1440,30,5]}),event_timezone:'America/Denver'};
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('FROM supervision_session_attendees'))return [attendees];
  if(sql.includes('FROM supervision_sessions'))return [[session]];
  if(sql.includes('SELECT 1 FROM join_reminder_sent'))return [sent.has(args.join('|'))?[{sent:1}]:[]];
  if(sql.includes('INSERT INTO join_reminder_sent')){sent.add([args[0],args[1],args[3]].join('|'));return [{}];}
  return [[]];
 });
 m.db.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]]);m.send.mockResolvedValue({ok:true});
});
describe('supervision multiple reminder delivery',()=>{
 it('sends separate tier schedules, includes cohosts, and respects optional opt-out',async()=>{
  session.session_type='group';session.co_facilitator_user_id=9;
  session.meeting_settings_json=JSON.stringify({reminders:[5],attendanceReminders:{mandatory:[60],optional:[30]}});
  attendees=[{user_id:8,is_required:1,status:'INVITED'},{user_id:10,is_required:0,status:'INVITED'},{user_id:11,is_required:0,status:'DECLINED'}];
  await runJoinReminderTick({now:new Date('2026-10-05T17:00:00Z')});
  expect(m.send.mock.calls.map(([p])=>p.user.id).sort()).toEqual([7,8,9]);
  expect(m.send.mock.calls.every(([p])=>p.kind==='join:60')).toBe(true);
  m.send.mockClear();await runJoinReminderTick({now:new Date('2026-10-05T17:30:00Z')});
  expect(m.send.mock.calls.map(([p])=>p.user.id)).toEqual([10]);
  m.send.mockClear();session.meeting_settings_json=JSON.stringify({attendanceReminders:{mandatory:[],optional:[]}});
  await runJoinReminderTick({now:new Date('2026-10-05T17:55:00Z')});expect(m.send).not.toHaveBeenCalled();
 });
 it('delivers each chosen offset once to each participant, including after repeat scheduler ticks',async()=>{
  for(const time of ['2026-10-04T18:00:00Z','2026-10-05T17:30:00Z','2026-10-05T17:55:00Z']){
   await runJoinReminderTick({now:new Date(time)});await runJoinReminderTick({now:new Date(time)});
  }
  expect(m.send).toHaveBeenCalledTimes(6);expect(sent.size).toBe(6);
  expect([...new Set(m.send.mock.calls.map(([p])=>p.kind))]).toEqual(['join:1440','join:30','join:5']);
 });
 it('sends nothing outside the due window, when disabled, or with no selected reminders',async()=>{
  await runJoinReminderTick({now:new Date('2026-10-05T17:00:00Z')});
  session.notify_participants=0;await runJoinReminderTick({now:new Date('2026-10-05T17:55:00Z')});
  session.notify_participants=1;session.meeting_settings_json='{"reminders":[]}';await runJoinReminderTick({now:new Date('2026-10-05T17:55:00Z')});
  expect(m.send).not.toHaveBeenCalled();
 });
});
