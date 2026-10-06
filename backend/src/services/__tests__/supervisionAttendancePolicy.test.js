import { describe, it, expect } from 'vitest';
import { supervisionAttendance, normalizeAttendanceReminders, supervisionReminderEvent } from '../supervisionAttendancePolicy.js';
import { meetingReminderSchedule } from '../meetingReminderPolicy.js';
const session = { session_type:'group', supervisor_user_id:1, co_facilitator_user_id:2, start_at:'2026-10-20 18:00:00', reminder_minutes:5 };
describe('group supervision attendance notification policy', () => {
  it('labels both tiers independently of presenter duties', () => {
    expect(supervisionAttendance(session,{id:3,is_required:1,isPresenter:true})).toMatchObject({tier:'mandatory',label:'Mandatory · Compensated'});
    expect(supervisionAttendance(session,{id:4,is_required:'0',isPresenter:true})).toMatchObject({tier:'optional',label:'Optional · Not compensated'});
    expect(supervisionAttendance(session,{id:2})).toMatchObject({tier:'mandatory'});
  });
  it('does not alter individual supervision or huddle compensation messaging', () => {
    expect(supervisionAttendance({...session,session_type:'individual'},{is_required:1})).toBeNull();
    expect(supervisionAttendance({...session,kind:'HUDDLE'},{is_required:1})).toBeNull();
  });
  it('validates both lists, supports no reminders, and removes duplicates', () => {
    expect(normalizeAttendanceReminders({mandatory:[1440,60,60],optional:[]})).toEqual({mandatory:[1440,60],optional:[]});
    for (const invalid of [null,[],{mandatory:[5]},{mandatory:[-1],optional:[]},{mandatory:[],optional:['bogus']}]) {
      expect(() => normalizeAttendanceReminders(invalid)).toThrow();
    }
  });
  it('selects only the recipient’s list without changing persisted settings', () => {
    const event={...session,meeting_settings_json:JSON.stringify({reminders:[5],attendanceReminders:{mandatory:[1440,60],optional:[]}})};
    expect(meetingReminderSchedule(supervisionReminderEvent(event,{is_required:1})).map(r=>r.key)).toEqual(['1440','60']);
    expect(meetingReminderSchedule(supervisionReminderEvent(event,{is_required:0}))).toEqual([]);
    expect(meetingReminderSchedule(event).map(r=>r.key)).toEqual(['5']);
    expect(meetingReminderSchedule(supervisionReminderEvent(session,{is_required:1})).map(r=>r.key)).toEqual(['5']);
  });
});
