import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {canonicalAppointmentWindow,appointmentEventOverlapsWindow,canonicalCalendarMoveWindows} from '../../utils/canonicalAppointmentWindow.js';
import {appointmentCalendarFallbacks} from '../appointmentCalendarFallback.service.js';
const appointment={startAt:'2026-12-04 00:00:00',endAt:'2026-12-04 01:00:00',sourceTimezone:'America/Denver'};
it('uses each saved appointment for both series-move checks and the windows returned for persistence',async()=>{
 const rows=[{id:80,start_at:'2026-12-03 17:00:00'},{id:81,start_at:'2026-12-10 17:00:00'}];
 const findAppointment=vi.fn(async id=>({id, startAt:id===80?appointment.startAt:'2026-12-11 00:00:00'}));
 const assertMovable=vi.fn(),assertAvailable=vi.fn();
 const windows=await canonicalCalendarMoveWindows(rows,{originalStartAt:appointment.startAt,startAt:'2026-12-03 23:00:00',endAt:'2026-12-04 00:00:00',timeZone:'America/Denver'},{findAppointment,assertMovable,assertAvailable});
 expect(windows.get(80)).toEqual({startAt:'2026-12-03 23:00:00',endAt:'2026-12-04 00:00:00'});
 expect(windows.get(81)).toEqual({startAt:'2026-12-10 23:00:00',endAt:'2026-12-11 00:00:00'});
 expect(assertAvailable.mock.calls[1][1]).toEqual(windows.get(81));expect(assertMovable).toHaveBeenCalledTimes(2);
});
it('uses the saved December 3 5 PM booking while retaining the incorrect 10 AM copy as evidence',()=>{
 const event={id:80,startAt:'2026-12-03T17:00:00Z',endAt:'2026-12-03T18:00:00Z'};
 expect(canonicalAppointmentWindow(event,appointment)).toMatchObject({id:80,startAt:'2026-12-04T00:00:00.000Z',endAt:'2026-12-04T01:00:00.000Z',calendarStartAt:'2026-12-03T17:00:00.000Z',calendarTimingMismatch:true});
 expect(event.startAt).toBe('2026-12-03T17:00:00Z');expect(appointment.startAt).toBe('2026-12-04 00:00:00');
});
it('compares instants, preserves all-day events, and filters the corrected week',()=>{
 const matched=canonicalAppointmentWindow({startAt:'2026-12-03T17:00:00-07:00',endAt:'2026-12-03T18:00:00-07:00'},appointment);
 expect(matched.calendarTimingMismatch).toBe(false);
 expect(appointmentEventOverlapsWindow(matched,'2026-11-30 07:00:00','2026-12-07 07:00:00')).toBe(true);
 expect(appointmentEventOverlapsWindow(matched,'2026-12-07 07:00:00','2026-12-14 07:00:00')).toBe(false);
 expect(appointmentEventOverlapsWindow({allDay:true},'from','until')).toBe(true);
});
it('does not treat a longer covering office reservation as an incorrect appointment time',()=>{
 const event={startAt:'2026-12-03T23:00:00Z',endAt:'2026-12-04T03:00:00Z'};
 expect(canonicalAppointmentWindow(event,appointment,{reservation:true})).toMatchObject({startAt:'2026-12-04T00:00:00.000Z',calendarTimingMismatch:false});
 expect(canonicalAppointmentWindow(event,{startAt:'2026-12-04 04:00:00',endAt:'2026-12-04 05:00:00'},{reservation:true}).calendarTimingMismatch).toBe(true);
});
it('does not guess when the canonical time is unavailable',()=>{
 const event={id:80,startAt:'2026-12-03T17:00:00Z'};
 expect(canonicalAppointmentWindow(event,{id:1})).toBe(event);
});
it('recovers a linked calendar copy outside the requested week at the canonical time',async()=>{
 const row={id:41,provider_user_id:7,agency_id:2,status:'scheduled',start_at:'2026-12-07 08:00:00',end_at:'2026-12-07 09:00:00',calendar_event_id:80,calendar_start_at:'2026-12-07 01:00:00',calendar_end_at:'2026-12-07 02:00:00'};
 const db={execute:vi.fn().mockResolvedValue([[row]])};
 const events=await appointmentCalendarFallbacks({providerId:7,agencyId:2,windowStart:'2026-12-07 07:00:00',windowEnd:'2026-12-14 07:00:00'},db);
 expect(events).toMatchObject([{id:80,appointmentId:41,startAt:'2026-12-07T08:00:00.000Z',calendarTimingMismatch:true}]);
 expect(db.execute.mock.calls[0][1]).toEqual([7,0,2,'2026-12-14 07:00:00','2026-12-07 07:00:00']);
 expect(db.execute.mock.calls.every(([sql])=>/^SELECT/.test(sql))).toBe(true);
});
it.each([{existingEventIds:[80]},{existingOfficeIds:[90]}])('does not duplicate an already represented facet',async represented=>{
 const db={execute:vi.fn().mockResolvedValue([[{id:41,calendar_event_id:80,office_event_id:90,status:'scheduled'}]])};
 expect(await appointmentCalendarFallbacks({providerId:7,agencyId:2,windowStart:'start',windowEnd:'end',...represented},db)).toEqual([]);
});
it('keeps recovered private calendar titles private and applies linked archive references',async()=>{
 const db={execute:vi.fn(async sql=>sql.includes('FROM appointments a')?[[{id:41,provider_schedule_event_id:80,calendar_event_id:80,is_private:1,title:'Private title',notes:'Private details',start_at:appointment.startAt,end_at:appointment.endAt}]]:[])};
 let result=await appointmentCalendarFallbacks({providerId:7,agencyId:2,windowStart:'start',windowEnd:'end'},db);
 expect(result[0]).toMatchObject({isPrivate:true,title:'Busy',description:null});
 db.execute.mockImplementation(async sql=>sql.includes('FROM appointments a')?[[{id:41,provider_schedule_event_id:80,calendar_event_id:80,start_at:appointment.startAt,end_at:appointment.endAt}]]:[[{resource_type:'provider_schedule_event',resource_id:80,archive_id:4}]]);
 expect(await appointmentCalendarFallbacks({providerId:7,agencyId:2,windowStart:'start',windowEnd:'end'},db)).toEqual([]);
});
