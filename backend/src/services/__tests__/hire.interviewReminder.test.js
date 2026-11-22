import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({interview:vi.fn(),prepare:vi.fn(),send:vi.fn()}));
vi.mock('../../models/HiringInterview.model.js',()=>({default:{findByScheduleEventId:m.interview}}));
vi.mock('../../models/HiringProfile.model.js',()=>({default:{findByCandidateUserId:async()=>({applied_role:'Mental Health Provider - Denver',job_description_id:10})}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async id=>({id,first_name:'Host'})}}));
vi.mock('../hiringInterviewInviteEmail.service.js',()=>({prepareHiringInterviewInviteEmail:m.prepare}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({slug:'tenant'})}}));
vi.mock('../hiringInterviewSender.service.js', () => ({ resolveInterviewSender: async () => ({ id: 2, from_email: 'po@tenant.test' }) }));
vi.mock('../meetingRecipientIdentity.service.js', () => ({ resolveMeetingRecipient: async ({ user }) => ({ email: user.email }) }));
import { meetingReminderSchedule } from '../meetingReminderPolicy.js';
import {sendHiringInterviewReminder, sendStaffInterviewEmail} from '../hiringInterviewReminder.service.js';
beforeEach(()=>{vi.clearAllMocks();m.interview.mockResolvedValue({id:7,agency_id:4,guest_join_token:'guest',candidate_user_id:30,interviewer_user_ids_json:[3],public_join_url:'https://tenant.test/join/team-meeting/guest',display_title:'Initial interview'});m.prepare.mockResolvedValue({from:'po@tenant.test',senderIdentityId:2,subject:'Initial interview',html:'Styled candidate body',attachments:[{filename:'interview.ics'}]});});
it('uses the same candidate body, applied role, guest link, and calendar attachment for a reminder',async()=>{await sendHiringInterviewReminder({id:240,agency_id:2,start_at:'2026-09-22 18:30:00',end_at:'2026-09-22 19:30:00'},{id:30,email:'candidate@example.test'});expect(m.prepare).toHaveBeenCalledWith(expect.objectContaining({jobTitle:'Mental Health Provider - Denver',publicJoinUrl:'https://plotlinepo.com/interview/tenant/video/guest'}));expect(m.send).toHaveBeenCalledWith(expect.objectContaining({html:'Styled candidate body',subject:'Interview reminder: Initial interview',attachments:[{filename:'interview.ics'}]}));});
it('does not send a cancelled interview or another candidate’s invitation',async()=>{m.interview.mockResolvedValue({candidate_user_id:31});expect(await sendHiringInterviewReminder({id:240},{id:30})).toMatchObject({skipped:true});m.interview.mockResolvedValue({candidate_user_id:30,status:'cancelled'});await sendHiringInterviewReminder({id:240},{id:30});expect(m.send).not.toHaveBeenCalled();});

it('uses Plotline branding, the agency sender, and an RSVP link for a new interviewer', async () => {
  await sendStaffInterviewEmail({
    id:240, agency_id:4, start_at:'2026-09-22 18:30:00', end_at:'2026-09-22 19:30:00'
  }, { id:3, email:'panel@example.test' }, 'https://tenant.test/join/invitation/personal');
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({
    senderIdentityId:2, replyToOverride:'po@tenant.test', to:'panel@example.test',
    html:expect.stringContaining('Plotline'),
    text:expect.stringContaining('https://tenant.test/join/invitation/personal?rsvp=1&eventId=240')
  }));
});

it('defaults interviews to four reminders and respects explicitly empty settings', () => {
  const event = { meeting_subtype:'interview', start_at:'2026-09-22 18:30:00' };
  expect(meetingReminderSchedule(event).map(reminder => reminder.at.toISOString())).toEqual([
    '2026-09-15T18:30:00.000Z', '2026-09-21T18:30:00.000Z', '2026-09-22T17:30:00.000Z', '2026-09-22T18:25:00.000Z'
  ]);
  expect(meetingReminderSchedule({ ...event, meeting_settings_json:{ reminders:[] } })).toEqual([]);
});
