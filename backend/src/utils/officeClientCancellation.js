export function reservationContextAfterClientCancellation(context,date) {
  if (!context?.clientUnscheduleFromDate || date < context.clientUnscheduleFromDate) return context;
  return {agencyId:context.agencyId,bookingSource:'office_assignment',bookingLimitsExplicit:context.bookingLimitsExplicit,
    officeCancellationDisposition:context.officeReservationDisposition||'keep'};
}
function eventContext(event) {
  try { return typeof event?.session_context_json === 'string' ? JSON.parse(event.session_context_json) : event?.session_context_json; }
  catch { return null; }
}
export function isBorrowableOfficeRelease(event) {
  return event?.status === 'RELEASED' && event.slot_state === 'ASSIGNED_AVAILABLE'
    && !!event.standing_assignment_id && !event.booked_provider_id && !event.client_id && !event.clinical_session_id
    && !event.billing_context_id && !event.note_context_id
    && eventContext(event)?.officeCancellationDisposition === 'release';
}
export function isAvailableOfficeRelease(event) {
  return isBorrowableOfficeRelease(event) && !Number(event.office_gap_blocked);
}
export function isDetachedOfficeReservation(event) {
  const context = eventContext(event);
  return !event.client_id&&!event.clinical_session_id&&event.status!=='CANCELLED'&&['keep','release'].includes(context?.officeCancellationDisposition);
}
