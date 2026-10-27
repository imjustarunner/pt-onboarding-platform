import { describe, it, expect } from 'vitest';
import { supervisionAttendance, normalizeAttendanceReminders, supervisionReminderEvent } from '../supervisionAttendancePolicy.js';
import { meetingReminderSchedule } from '../meetingReminderPolicy.js';
const session = { session_type:'group', supervisor_user_id:1, co_facilitator_user_id:2, start_at:'2026-10-20 18:00:00', reminder_minutes:5 };
describe('group supervision attendance notification policy', () => {
  it('always marks presenters mandatory, while other participants use their chosen tier', () => {
    expect(supervisionAttendance(session,{id:3,is_required:1,isPresenter:true,is_compensable_snapshot:1})).toMatchObject({tier:'mandatory',label:'Mandatory · Compensated'});
    expect(supervisionAttendance(session,{id:4,is_required:'0',isPresenter:true,is_compensable_snapshot:1})).toMatchObject({tier:'mandatory',label:'Mandatory · Compensated'});
    expect(supervisionAttendance(session,{id:2})).toMatchObject({tier:'mandatory'});
    expect(supervisionAttendance(session,{id:2,is_required:0})).toMatchObject({tier:'mandatory'});
  });
  it('marks individual supervision expected while leaving huddles separate', () => {
    expect(supervisionAttendance({...session,session_type:'individual'},{is_required:1})).toMatchObject({tier:'mandatory'});
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
  it('ends unanswered optional reminders after the three-day final reminder without changing confirmed or mandatory schedules',()=>{
    const event={...session,meeting_settings_json:{attendanceReminders:{mandatory:[1440,60],optional:[1440,5]}}};
    expect(meetingReminderSchedule(supervisionReminderEvent(event,{is_required:0,status:'INVITED'})).map(r=>r.key)).toEqual(['10080','4320']);
    expect(meetingReminderSchedule(supervisionReminderEvent(event,{is_required:0,status:'SIGNED_UP'})).map(r=>r.key)).toEqual(['1440','5']);
    expect(meetingReminderSchedule(supervisionReminderEvent(event,{is_required:1,status:'INVITED'})).map(r=>r.key)).toEqual(['1440','60']);
    expect(meetingReminderSchedule(supervisionReminderEvent({...event,enrollment_mode:'signup_only'},{is_required:0,status:'SIGNED_UP'})).map(r=>r.key)).toEqual(['1440','5']);
  });
});


it.each([[31.12,7.84],[49,60],[50,49]])('does not promise pay below the individual/total hours gate (%s + %s)',(individual,group)=>{
 const policy=supervisionAttendance({...session,session_type:'individual'},{id:9,credential:'MEd, LPCC, NCC',supervision_is_prelicensed:1,is_compensable_snapshot:1,supervision_start_date:'2025-05-06',supervision_individual_hours:individual,supervision_group_hours:group});
 expect(policy.label).toBe('Mandatory · Not compensated');
 expect(policy.description).toContain('50 individual supervision hours and 100 total');
});
it('requires confirmed eligibility even for a mandatory presenter and preserves unpaid internship guidance',()=>{
 expect(supervisionAttendance(session,{id:9,isPresenter:true}).label).toBe('Mandatory');
 expect(supervisionAttendance(session,{id:9,isPresenter:true,is_compensable_snapshot:0}).label).toBe('Mandatory · Not compensated');
 expect(supervisionAttendance(session,{id:9,isPresenter:true,is_compensable_snapshot:1,role:'intern'}).label).toBe('Mandatory · Unpaid internship time');
});
it('allows approved post-threshold compensation only on or after the effective date',()=>{
 const person={id:9,credential:'LPCC',is_required:1,is_compensable_snapshot:1,supervision_individual_hours:50,supervision_group_hours:50,supervision_start_date:'2026-10-20'};
 expect(supervisionAttendance(session,person).label).toBe('Mandatory · Compensated');
 expect(supervisionAttendance(session,{...person,supervision_start_date:'2026-10-21'}).label).toBe('Mandatory · Not compensated');
 expect(supervisionAttendance(session,{...person,is_required:0}).label).toBe('Optional · Not compensated');
 expect(supervisionAttendance(session,{...person,id:1,supervision_individual_hours:0}).label).toBe('Mandatory · Compensated');
});

it.each([{title:'Licensed professional counselor candidate'}, {credential:'Pre-licensed counselor'}, {credential:'LPCC',title:'Facilitator',is_hourly_worker:0}])('does not promise compensation for candidates despite a saved paid flag: %j', person => {
 expect(supervisionAttendance(session,{id:9,is_required:1,is_compensable_snapshot:1,supervision_is_prelicensed:0,...person}).label).toBe('Mandatory · Not compensated');
});

it('refreshes candidate eligibility for recurring invitations created before the threshold', () => {
 const person={id:9,credential:'LPCC',is_required:1,is_compensable_snapshot:0,supervision_is_compensable:1,supervision_start_date:'2025-01-01',supervision_individual_hours:50,supervision_group_hours:50};
 expect(supervisionAttendance(session,person).label).toBe('Mandatory · Compensated');
 expect(supervisionAttendance(session,{...person,supervision_group_hours:49}).label).toBe('Mandatory · Not compensated');
 expect(supervisionAttendance(session,{...person,is_compensable_snapshot:1,supervision_is_compensable:0}).label).toBe('Mandatory · Not compensated');
});

it.each([{credential:'LPCC',supervision_is_prelicensed:1}, {title:'Counseling intern'}, {credential:'BA'}])('marks mandatory hourly supervision compensated without the candidate hour gate: %j', person => {
 const hourly={id:9,is_hourly_worker:1,is_required:1,is_compensable_snapshot:0,supervision_is_compensable:0,supervision_individual_hours:0,supervision_group_hours:0,...person};
 expect(supervisionAttendance(session,hourly).label).toBe('Mandatory · Compensated');
 expect(supervisionAttendance(session,{...hourly,is_required:0}).label).toBe('Optional · Not compensated');
});
