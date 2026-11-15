import { expect,it } from 'vitest';
import {recurringBookingNoticeFacts,isLaterRecurringBooking} from '../recurringBookingNotice.js';
import {appointmentNoticeKind,batchAppointmentNoticeKind} from '../appointmentNoticeKind.js';
it('selects the nearest eligible occurrence from saved appointments and rejects past/canceled anchors',()=>{
 const facts=recurringBookingNoticeFacts('series',[{id:1,startAt:'2030-01-10T17:00:00Z'},{id:2,start_at:'2030-01-02 17:00:00',status:'confirmed'},{id:3,startAt:'2029-12-01T17:00:00Z'},{id:4,startAt:'2030-01-01T17:00:00Z',status:'canceled_by_provider'}],new Date('2030-01-01T10:00:00Z'));
 expect(facts.recurringBooking.nextAppointmentId).toBe(2);expect(isLaterRecurringBooking(1,facts)).toBe(true);expect(isLaterRecurringBooking(2,facts)).toBe(false);
 expect(recurringBookingNoticeFacts('one',[{id:1}])).toEqual({});
});
it('keeps new bookings distinct from moves, cancellations, and mixed digests',()=>{
 expect(appointmentNoticeKind('created')).toBe('appointment_scheduled');expect(appointmentNoticeKind('moved')).toBe('appointment_rescheduled');expect(appointmentNoticeKind('moved',true)).toBe('appointment_scheduled');expect(appointmentNoticeKind('canceled',true)).toBe('appointment_canceled');expect(appointmentNoticeKind('rescheduled',true)).toBe('appointment_rescheduled');
 expect(batchAppointmentNoticeKind([{payload:{eventType:'created'}},{payload:{eventType:'canceled'}}])).toBe('appointment_schedule_updated');
});
