export function officeBookingAgencyId(event) {
  let context = event?.session_context_json;
  if (typeof context === 'string') {
    try { context = JSON.parse(context); } catch { context = null; }
  }
  // A linked appointment/client is authoritative; otherwise use the saved
  // booking context and then its recurring office assignment.
  const id = Number(event?.appointment_agency_id || event?.client_agency_id || context?.agencyId || event?.booking_agency_id || 0);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
