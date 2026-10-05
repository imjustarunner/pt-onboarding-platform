import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),artifact:vi.fn(),send:vi.fn(),recipient:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../myMeetings.service.js',()=>({requireAttendedMeeting:m.access}));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js',()=>({default:{findByEventId:m.artifact}}));
vi.mock('../../models/SupervisionSessionArtifact.model.js',()=>({default:{findBySessionId:m.artifact}}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://app.test/itsco'}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:m.recipient}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantMessageMailboxes:async()=>({notifications:{id:9}})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {deliverMeetingFollowup} from '../meetingFollowup.service.js';
let meeting,claimed;
beforeEach(()=>{
 vi.clearAllMocks();meeting={id:7,agency_id:2,title:'CPA',meeting_completed_at:'2026-10-05 18:00:00'};claimed=false;
 m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT *'))return [[meeting]];
  if(sql.startsWith('SELECT DISTINCT'))return [[{id:10,email:'attendee@test'},{id:11,email:'waiting@test'}]];
  if(sql.startsWith('INSERT IGNORE')){const affectedRows=claimed?0:1;claimed=true;return [{affectedRows}];}
  return [{affectedRows:1}];
 });
 m.access.mockImplementation(async(_type,_id,userId)=>{if(userId===11)throw Object.assign(new Error('denied'),{status:403});return meeting;});
 m.artifact.mockResolvedValue({summary_text:'## Tasks by person\n- Pat: send schedule',transcript_text:'not sent',private_notes_text:'private'});
 m.recipient.mockResolvedValue({email:'attendee@test'});m.send.mockResolvedValue({id:'sent',communicationId:22});
});
describe('automatic meeting follow-ups',()=>{
 it('sends only to authorized attendees and never includes personal notes or the raw transcript',async()=>{
  expect(await deliverMeetingFollowup('team',7)).toBe(true);expect(m.send).toHaveBeenCalledTimes(1);
  expect(m.send.mock.calls[0][0]).toMatchObject({to:'attendee@test',agencyId:2,userId:10,templateType:'meeting_summary_ready',linkUrl:'https://app.test/itsco/my-meetings?type=team&meetingId=7&tab=Summary'});
  expect(m.send.mock.calls[0][0].text).not.toContain('private');expect(m.send.mock.calls[0][0].text).not.toContain('not sent');
 });
 it('does not send again on a generation rerun or worker retry',async()=>{
  await deliverMeetingFollowup('team',7);await deliverMeetingFollowup('team',7);expect(m.send).toHaveBeenCalledTimes(1);
 });
 it('waits for a completed meeting and respects disabled participant notifications',async()=>{
  meeting.meeting_completed_at=null;expect(await deliverMeetingFollowup('team',7)).toBe(false);expect(m.send).not.toHaveBeenCalled();
  meeting.meeting_completed_at='done';meeting.notify_participants=0;expect(await deliverMeetingFollowup('team',7)).toBe(true);expect(m.send).not.toHaveBeenCalled();
 });
 it('does not retry ambiguous provider failures and records them for review',async()=>{
  m.send.mockRejectedValue(new Error('provider error'));await deliverMeetingFollowup('team',7);await deliverMeetingFollowup('team',7);
  expect(m.send).toHaveBeenCalledTimes(1);expect(m.execute.mock.calls.some(([sql])=>sql.includes("delivery_status='review'"))).toBe(true);
 });
 it('supports finalized supervision sessions',async()=>{
  meeting={id:7,agency_id:2,status:'FINALIZED'};await deliverMeetingFollowup('supervision',7);expect(m.send.mock.calls[0][0].linkUrl).toContain('type=supervision');
 });
 it('does not claim delivery when an access check fails unexpectedly',async()=>{
  m.access.mockRejectedValue(new Error('database unavailable'));await expect(deliverMeetingFollowup('team',7)).rejects.toThrow('database unavailable');expect(m.send).not.toHaveBeenCalled();expect(claimed).toBe(false);
 });
});
