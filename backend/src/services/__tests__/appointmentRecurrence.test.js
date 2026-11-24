import {expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db}));
import {appointmentRecurrence,getAppointmentRecurrence} from '../appointmentRecurrence.service.js';
it('uses a session cadence independently of weekly standing office reservations',()=>{
  expect(appointmentRecurrence({session_context_json:JSON.stringify({reservedSessionBookingKey:'key',reservedSessionBookingFrequency:'MONTHLY'}),booked_frequency:'WEEKLY'})).toEqual({recurrenceSeriesId:'office-session:key',recurrenceFrequency:'MONTHLY'});
  expect(appointmentRecurrence({session_context_json:{reservedSessionBookingKey:'key',reservedSessionBookingFrequency:'ONCE'},booked_frequency:'WEEKLY'})).toEqual({recurrenceSeriesId:null,recurrenceFrequency:'ONCE'});
  expect(appointmentRecurrence({booked_frequency:'WEEKLY'}).recurrenceFrequency).toBe('ONCE');
});
it('preserves provider schedule cadence and does not invent a frequency for legacy series',()=>{
  expect(appointmentRecurrence({recurrence_series_id:'series',recurrence_frequency:'BIWEEKLY'})).toEqual({recurrenceSeriesId:'series',recurrenceFrequency:'BIWEEKLY'});
  expect(appointmentRecurrence({recurrence_series_id:'series'}).recurrenceFrequency).toBe(null);
  expect(appointmentRecurrence({session_context_json:'invalid json'}).recurrenceFrequency).toBe('ONCE');
});
it('shows a detached, individually moved occurrence as one-time',()=>{
  expect(appointmentRecurrence({session_context_json:{appointmentMoveDetached:true,reservedSessionBookingFrequency:'WEEKLY',reservedSessionBookingKey:'old'}})).toEqual({recurrenceSeriesId:null,recurrenceFrequency:'ONCE'});
});
it('reads recurrence through the scoped canonical appointment, not an arbitrary room ID',async()=>{
  db.execute.mockResolvedValue([[{recurrence_series_id:'s',recurrence_frequency:'WEEKLY'}]]);
  expect(await getAppointmentRecurrence({id:70,agencyId:2,providerScheduleEventId:90})).toEqual({recurrenceSeriesId:'s',recurrenceFrequency:'WEEKLY'});
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE a.id=? AND a.agency_id=?'),[70,2]);
});
