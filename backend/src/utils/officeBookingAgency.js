export function officeBookingAgencyId(event) {
  let context = event?.session_context_json;
  if (typeof context === 'string') {
    try { context = JSON.parse(context); } catch { context = null; }
  }
  const id = Number(context?.agencyId || event?.booking_agency_id || 0);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
