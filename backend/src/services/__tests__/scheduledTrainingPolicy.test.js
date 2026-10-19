import {describe,it,expect} from 'vitest';
import {canScheduleTraining,trainingRequirement,trainingAttendancePolicy,validateTrainingInput} from '../scheduledTrainingPolicy.js';
import {defaultMeetingSettings} from '../meetingSettingsPolicy.js';
import {meetingInvitationContent} from '../meetingInvitationPolicy.js';
import {meetingReminderSchedule} from '../meetingReminderPolicy.js';
const base={title:'Crisis Training',topic:'Crisis response',proctorId:496,timeZone:'America/Denver',sessions:[{startAt:'2026-10-27T17:00:00-06:00',endAt:'2026-10-27T19:00:00-06:00'}]};
describe('scheduled training permissions and attendance',()=>{
 it.each(['admin','super_admin','superadmin','clinical_practice_assistant','provider_plus'])('allows %s to schedule',role=>expect(canScheduleTraining({role})).toBe(true));
 it.each(['provider','intern','intern_plus','support','staff','assistant_admin','supervisor','schedule_manager','client_guardian'])('does not allow %s to schedule',role=>expect(canScheduleTraining({role})).toBe(false));
 it('classifies students separately from paid bachelor staff and clinical candidates',()=>{
  for(const u of [{role:'intern'},{role:'provider',title:'Practicum student',credential:'BA'},{role:'provider',employment_type:'intern'}]){expect(trainingRequirement(u)).toBe('mandatory');expect(trainingAttendancePolicy(u,true)).toEqual({credit:'indirect',payable:false});}
  expect(trainingAttendancePolicy({role:'provider',credential:'BA'},true)).toEqual({credit:'support_activity',payable:true});
  for(const credential of ['MA, LPCC','LPC','LCSW'])expect(trainingRequirement({credential})).toBe('optional');
  expect(trainingAttendancePolicy({credential:'LPC'},false).payable).toBe(false);
 });
 it('stores multiple days as separate UTC attendance windows',()=>{const result=validateTrainingInput({...base,sessions:[...base.sessions,{startAt:'2026-11-03T17:00:00-07:00',endAt:'2026-11-03T19:00:00-07:00'}]});expect(result.sessions).toEqual([{startAt:'2026-10-27 23:00:00',endAt:'2026-10-28 01:00:00'},{startAt:'2026-11-04 00:00:00',endAt:'2026-11-04 02:00:00'}]);});
 it('rejects overlapping, unzoned, or multi-day continuous windows',()=>{
  expect(()=>validateTrainingInput({...base,sessions:[...base.sessions,...base.sessions]})).toThrow(/overlap/);
  expect(()=>validateTrainingInput({...base,sessions:[{startAt:'2026-10-27T17:00',endAt:'2026-10-27T19:00'}]})).toThrow(/offset/);
  expect(()=>validateTrainingInput({...base,sessions:[{startAt:'2026-10-27T17:00:00Z',endAt:'2026-10-29T19:00:00Z'}]})).toThrow(/24 hours/);
 });
 it('defaults to transcription and matching reminders with mandatory/optional wording',()=>{
  const settings=defaultMeetingSettings('training');expect(settings.transcription).toBe(true);expect(settings.reminders).toEqual([10080,1440,60]);
  const event={id:4,meeting_subtype:'training',title:base.title,start_at:'2026-10-27 23:00:00',end_at:'2026-10-28 01:00:00',event_timezone:'America/Denver',meeting_settings_json:settings};
  const content=id=>meetingInvitationContent({events:[event],joinUrl:'https://app.test/join/invitation/personal',recipientUserId:id,participants:[{id:1,name:'Required',is_required:1},{id:2,name:'Optional',is_required:0}]});
  expect(content(1).subject).toBe('Mandatory training invitation: Crisis Training');expect(content(1).text).toContain('Your attendance is required');expect(content(2).subject).toContain('Optional training');expect(content(2).text).toContain('welcome to attend');
  expect(meetingReminderSchedule(event).map(r=>r.at.toISOString())).toEqual(['2026-10-20T23:00:00.000Z','2026-10-26T23:00:00.000Z','2026-10-27T22:00:00.000Z']);
 });
});
it('stops registration prompts after RSVP and sends only one day and five-minute join reminders',()=>{
 const event={meeting_subtype:'training',start_at:'2026-10-27 23:00:00',meeting_settings_json:{reminders:[10080,1440,60]}};
 expect(meetingReminderSchedule(event,{rsvp:'accepted'}).map(r=>r.key)).toEqual(['1440','5']);
 expect(meetingReminderSchedule(event,{rsvp:'declined'})).toEqual([]);
 expect(meetingReminderSchedule(event,{rsvp:'pending'}).map(r=>r.key)).toEqual(['10080','1440','60']);
 const content=meetingInvitationContent({events:[{...event,id:4,title:'Crisis Training',end_at:'2026-10-28 01:00:00'}],recipientUserId:1,recipientRsvp:'accepted',participants:[{id:1,is_required:1}],joinUrl:'https://app.test/personal-join'});
 expect(content.text).toContain('Your RSVP is confirmed');expect(content.text).not.toContain('RSVP attending or decline');expect(content.text).toContain('https://app.test/personal-join');
});
