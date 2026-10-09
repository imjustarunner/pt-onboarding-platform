import { beforeEach, expect, it, vi } from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>db,execute:db.execute},onTableWrite:vi.fn()}));
import { withMeetingWindow } from '../meetingWindowConflict.service.js';
vi.mock('../appointmentContext.service.js',()=>({ensureAppointmentContext:vi.fn()}));
vi.mock('../appointmentClinicalLink.service.js',()=>({assertAppointmentClients:vi.fn()}));
import { officeSessionPlanDates } from '../officeSessionPlan.service.js';
import { assertMeetingBookingWindow } from '../../utils/recurringWindow.js';
import { assertRoomBookingStart } from '../../utils/roomBookingWindow.js';
import { appointmentMode } from '../../utils/officeSchedulingPolicy.js';
import { withClientSchedulingLock, assertClientNotTerminated } from '../clientSchedulingGuard.service.js';
const now=new Date('2026-10-09T18:00:00Z');
beforeEach(()=>{
 vi.clearAllMocks();db.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]]);
});
it('counts three biweekly occurrences without counting off-weeks',()=>{
 const assignment={weekday:5,assigned_frequency:'BIWEEKLY',available_since_date:'2026-10-09'};
 const plan={booking_start_date:'2026-10-09',booked_frequency:'BIWEEKLY',booked_occurrence_count:3,session_context_json:{clientId:8}};
 expect(officeSessionPlanDates(plan,assignment)).toEqual(['2026-10-09','2026-10-23','2026-11-06']);
});
it('uses the original calendar-month anchor through February and changing weekdays',()=>{
 const assignment={weekday:0,assigned_frequency:'MONTHLY',available_since_date:'2027-01-31'};
 const plan={booking_start_date:'2027-01-31',booked_frequency:'MONTHLY',booked_occurrence_count:4,session_context_json:{clientId:8}};
 expect(officeSessionPlanDates(plan,assignment)).toEqual(['2027-01-31','2027-02-28','2027-03-31','2027-04-30']);
 expect(officeSessionPlanDates({...plan,skipped_dates_json:['2027-02-28']},assignment)).toEqual(['2027-01-31','2027-03-31','2027-04-30']);
});
it('allows the six-week start boundary in office local time and rejects the next date',()=>{
 expect(()=>assertRoomBookingStart('2026-11-20','America/Denver',now)).not.toThrow();
 expect(()=>assertRoomBookingStart('2026-11-21','America/Denver',now)).toThrow('six weeks');
 expect(()=>assertRoomBookingStart('2026-11-21 06:30:00','America/Denver',now)).not.toThrow();
 expect(()=>assertRoomBookingStart('2026-11-21 07:00:00','America/Denver',now)).toThrow('six weeks');
});
it('caps both one-time and recurring meetings at the calendar-year boundary',()=>{
 for(const recurrenceSeriesId of [null,'series']) {
  expect(()=>assertMeetingBookingWindow({recurrenceSeriesId,startAt:'2027-10-08 16:00:00'},now)).not.toThrow();
  expect(()=>assertMeetingBookingWindow({recurrenceSeriesId,startAt:'2027-10-09 16:00:00'},now)).toThrow('next year');
 }
});
it('keeps released client assignments available even under legacy automatic-booking policy',()=>{
 expect(appointmentMode({transition_date:null,client_booking_released_at:'2026-10-09 12:00:00'},'2026-10-12')).toBe(true);
 expect(appointmentMode({transition_date:null,client_booking_released_at:'2026-10-10 01:00:00'},'2026-10-09')).toBe(true); // same office-local evening
});
it('does not write an extension over an existing provider appointment',async()=>{
 const base=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT id FROM appointments')?[[{id:1}]]:base(sql,...args));
 const save=vi.fn();
 await expect(withMeetingWindow({userIds:[9],startAt:'2027-01-01 16:00:00',endAt:'2027-01-01 17:00:00'},save)).rejects.toMatchObject({code:'PROVIDER_TIME_CONFLICT'});
 expect(save).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});
it('does not write a meeting over required supervision attendance',async()=>{
 const base=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT s.id FROM supervision_sessions')?[[{id:1}]]:base(sql,...args));
 await expect(withMeetingWindow({userIds:[9],startAt:'2027-01-01 16:00:00',endAt:'2027-01-01 17:00:00'},vi.fn())).rejects.toMatchObject({code:'PROVIDER_TIME_CONFLICT'});
});
it('shares a reentrant client lock across plan/context/appointment creation and releases it on failure',async()=>{
 await expect(withClientSchedulingLock([8],()=>withClientSchedulingLock([8],()=>{throw new Error('test');}))).rejects.toThrow('test');
 expect(db.execute.mock.calls.filter(([sql])=>sql.includes('GET_LOCK'))).toHaveLength(1);
 expect(db.execute.mock.calls.filter(([sql])=>sql.includes('RELEASE_LOCK'))).toHaveLength(1);
});
it('rejects new bookings for terminated clients',()=>{
 expect(()=>assertClientNotTerminated({client_status_key:'terminated'})).toThrow('terminated');
 expect(()=>assertClientNotTerminated({client_status_key:'current',terminated_at:'2020-01-01'})).not.toThrow();
});
it('preserves four-week dates for migrated legacy Monthly assignments',()=>{
 const assignment={weekday:0,assigned_frequency:'MONTHLY',legacy_monthly_four_weeks:1,available_since_date:'2027-01-31'};
 const plan={booking_start_date:'2027-01-31',booked_frequency:'EVERY_4_WEEKS',booked_occurrence_count:3,session_context_json:{clientId:8}};
 expect(officeSessionPlanDates(plan,assignment)).toEqual(['2027-01-31','2027-02-28','2027-03-28']);
});
it('blocks a reactivated client from booking until earlier termination cleanup finishes',async()=>{
 const base=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...args)=>sql.includes('FROM client_schedule_termination_jobs')?[[{id:1}]]:base(sql,...args));
 const save=vi.fn();await expect(withClientSchedulingLock([8],save)).rejects.toMatchObject({code:'CLIENT_TERMINATION_PENDING'});
 expect(save).not.toHaveBeenCalled();
 await withClientSchedulingLock([8],save,{allowCleanup:true});expect(save).toHaveBeenCalledOnce();
});
