const kinds = new Set(['appointment_scheduled', 'appointment_rescheduled', 'appointment_updated', 'appointment_canceled', 'appointment_missed', 'appointment_schedule_updated']);
export function appointmentNoticeKind(eventType, initialBooking = false) {
  if (eventType === 'canceled') return 'appointment_canceled';
  if (eventType === 'no_show') return 'appointment_missed';
  if (eventType === 'rescheduled') return 'appointment_rescheduled';
  if (initialBooking || eventType === 'created') return 'appointment_scheduled';
  if (['moved', 'rescheduled'].includes(eventType)) return 'appointment_rescheduled';
  if (eventType === 'updated') return 'appointment_updated';
  return null;
}
export const publicAppointmentNoticeKind = value => kinds.has(value) ? value : null;
export function batchAppointmentNoticeKind(entries) {
  const types = new Set(entries.map(e => appointmentNoticeKind(e.payload.eventType, e.payload.initialBooking)));
  return types.size === 1 ? [...types][0] || 'appointment_schedule_updated' : 'appointment_schedule_updated';
}
