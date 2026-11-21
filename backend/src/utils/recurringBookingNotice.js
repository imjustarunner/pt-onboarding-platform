import { parseUtcDate } from './officeEventDateTime.util.js';
/** Derived by booking services after the full selection is saved, never from request facts. */
export function recurringBookingNoticeFacts(bookingId, appointments, now = new Date()) {
  if (!bookingId || appointments.length < 2) return {};
  const upcoming = appointments.filter(a => ['scheduled', 'confirmed', 'client_confirmed'].includes(String(a.status || 'scheduled').toLowerCase())
    && +parseUtcDate(a.startAt || a.start_at) > +now)
    .sort((a, b) => +parseUtcDate(a.startAt || a.start_at) - +parseUtcDate(b.startAt || b.start_at) || Number(a.id)-Number(b.id));
  return { recurringBooking: { id: String(bookingId), nextAppointmentId: upcoming[0]?.id || null, occurrenceCount: appointments.length } };
}
export const isLaterRecurringBooking = (appointmentId, facts) => !!facts?.recurringBooking
  && Number(facts.recurringBooking.nextAppointmentId || 0) !== Number(appointmentId);

export function bookingNoticePreferenceFacts(sendBookingNotice) {
  return sendBookingNotice === false
    ? { notificationMode: 'none', suppressionReason: 'Booking notice turned off.' }
    : {};
}
