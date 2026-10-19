vi.mock('../hiringInterviewReminder.service.js',()=>({sendHiringInterviewReminder:async(event,user)=>m.send({to:user.email,replyToOverride:'host@tenant.test',text:'RSVP /interview-rsvp/guest',html:'Styled interview reminder'})}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async({user})=>({email:user.email,displayName:[user.first_name,user.last_name].filter(Boolean).join(' '),calendarAccountEmail:user.email})}));
import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),db:vi.fn(),send:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.db,release:m.release})}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:m.send}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:async()=>({url:'https://tenant.test/join/invitation/personal'})}));
vi.mock('../meetingParticipants.service.js',()=>({meetingReplyTo:async()=> 'host@tenant.test',meetingParticipantRows:async()=>[],meetingEmailDetails:async()=>''}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://tenant.test'}));
import {sendConfiguredMeetingReminders} from '../meetingConfiguredReminders.service.js';
const event={id:10,agency_id:2,provider_id:1,title:'Interview',meeting_subtype:'interview',start_at:'2026-09-22 18:30:00',meeting_settings_json:{reminders:[5]}};
beforeEach(()=>{vi.clearAllMocks();m.execute.mockImplementation(async sql=>sql.includes('FROM provider_schedule_events')?[[event]]:[[{id:1,email:'host@tenant.test'},{id:2,email:'guest@example.test',guest_join_token:'guest'}]]);m.db.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]]);m.send.mockResolvedValue({ok:true});});
describe('configured meeting reminders',()=>{
 it('reminds both host and interview candidate at the same UTC instant with host reply-to',async()=>{await sendConfiguredMeetingReminders(new Date('2026-09-22T18:25:00Z'));expect(m.send).toHaveBeenCalledTimes(2);expect(m.send.mock.calls[1][0]).toMatchObject({to:'guest@example.test',replyToOverride:'host@tenant.test'});expect(m.send.mock.calls[1][0].text).toContain('/interview-rsvp/guest');expect(m.send.mock.calls[1][0].text).not.toContain('Sign in with your invited account');});
 it('does not send early, late, or duplicate reminders',async()=>{await sendConfiguredMeetingReminders(new Date('2026-09-22T18:24:59Z'));await sendConfiguredMeetingReminders(new Date('2026-09-22T18:29:00Z'));expect(m.send).not.toHaveBeenCalled();m.db.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT 1')?[[{sent:1}]]:[[]]);await sendConfiguredMeetingReminders(new Date('2026-09-22T18:25:00Z'));expect(m.send).not.toHaveBeenCalled();});
 it('records pending approval without claiming the email was sent',async()=>{m.send.mockResolvedValue({pendingApproval:true});await sendConfiguredMeetingReminders(new Date('2026-09-22T18:25:00Z'));expect(m.db.mock.calls.filter(([sql])=>sql.startsWith('INSERT')).every(([,args])=>args[4]==='pending_approval')).toBe(true);});
 it('keeps legacy staff delivery separate while including the candidate',async()=>{m.execute.mockImplementation(async sql=>sql.includes('FROM provider_schedule_events')?[[{...event,meeting_settings_json:null}]]:[[{id:1,email:'host@tenant.test'},{id:2,email:'guest@example.test',guest_join_token:'guest'}]]);await sendConfiguredMeetingReminders(new Date('2026-09-22T18:25:00Z'));expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0].to).toBe('guest@example.test');});
});
it('uses RSVP status to switch training from registration reminders to 24-hour and 5-minute join links',async()=>{
 const training={...event,title:'Crisis Training',meeting_subtype:'training',end_at:'2026-09-22 20:30:00',meeting_settings_json:{reminders:[10080,1440,60]}};
 m.execute.mockImplementation(async sql=>sql.includes('FROM provider_schedule_events')?[[training]]:[[{id:1,email:'pending@test.local',training_rsvp:'pending'},{id:2,email:'confirmed@test.local',training_rsvp:'accepted'},{id:3,email:'declined@test.local',training_rsvp:'declined'}]]);
 await sendConfiguredMeetingReminders(new Date('2026-09-22T17:30:00Z'));expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0].to).toBe('pending@test.local');
 m.send.mockClear();await sendConfiguredMeetingReminders(new Date('2026-09-21T18:30:00Z'));expect(m.send).toHaveBeenCalledTimes(2);expect(m.send.mock.calls.find(([c])=>c.to==='confirmed@test.local')[0].subject).toContain('join reminder');
 m.send.mockClear();await sendConfiguredMeetingReminders(new Date('2026-09-22T18:25:00Z'));expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0]).toMatchObject({to:'confirmed@test.local',text:expect.stringContaining('Your RSVP is confirmed')});
 m.db.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT 1')?[[{sent:1}]]:[[]]);m.send.mockClear();await sendConfiguredMeetingReminders(new Date('2026-09-22T18:25:30Z'));expect(m.send).not.toHaveBeenCalled();
});
