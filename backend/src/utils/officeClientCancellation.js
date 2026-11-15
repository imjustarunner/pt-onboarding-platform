export function reservationContextAfterClientCancellation(context,date) {
  if (!context?.clientUnscheduleFromDate || date < context.clientUnscheduleFromDate) return context;
  return {agencyId:context.agencyId,bookingSource:'office_assignment',bookingLimitsExplicit:context.bookingLimitsExplicit,
    officeCancellationDisposition:context.officeReservationDisposition||'keep'};
}
export function isDetachedOfficeReservation(event) {
  let context=event.session_context_json;
  if(typeof context==='string'){try{context=JSON.parse(context);}catch{return false;}}
  return !event.client_id&&!event.clinical_session_id&&event.status!=='CANCELLED'&&['keep','release'].includes(context?.officeCancellationDisposition);
}
