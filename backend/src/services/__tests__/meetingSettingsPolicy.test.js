import {describe,it,expect} from 'vitest';
import {defaultMeetingSettings,normalizeMeetingSettings} from '../meetingSettingsPolicy.js';
import {meetingReminderSchedule} from '../meetingReminderPolicy.js';
describe('meeting defaults and reminders',()=>{
 it('enables attendance, transcription and sharing and omits interview workspace sections',()=>{expect(defaultMeetingSettings('interview')).toMatchObject({attendance:true,transcription:true,screenShare:true,agenda:false,goals:false,actionItems:false});});
 it('preserves opt-outs and rejects malformed or excessive reminder values',()=>{expect(normalizeMeetingSettings({screenShare:false,reminders:[]})).toMatchObject({screenShare:false,reminders:[]});expect(()=>normalizeMeetingSettings({reminders:[-1]})).toThrow();expect(()=>normalizeMeetingSettings({attendance:'false'})).toThrow();});
 it('counts business days in the event timezone across a DST weekend',()=>{
  const schedule=meetingReminderSchedule({start_at:'2026-03-10 18:30:00',event_timezone:'America/Denver',meeting_settings_json:{reminders:['business_days_3',1440,5]}});
  expect(schedule.map(r=>r.at.toISOString())).toEqual(['2026-03-05T19:30:00.000Z','2026-03-09T18:30:00.000Z','2026-03-10T18:25:00.000Z']);
 });
 it('keeps explicit legacy reminder off',()=>expect(meetingReminderSchedule({start_at:'2026-09-22 18:30:00',reminder_minutes:null})).toEqual([]));
});
