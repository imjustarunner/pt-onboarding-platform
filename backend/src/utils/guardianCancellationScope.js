export const activeAppointment = a => ['scheduled','confirmed','client_confirmed'].includes(a?.status);
export function appointmentServiceKind(a, client = {}) {
  const kind = a.businessType || a.business_type || (['learning','tutoring'].includes(client.client_type) ? 'learning' : 'mental_health');
  return ({ mental_health:'counseling', healthcare:'counseling', learning:'tutoring', tutoring:'tutoring', consulting:'consultation' })[kind] || kind;
}
export function cancellationSeries(a = {}) {
  if (String(a.source || '').startsWith('reserved_office_session:')) return { kind:'source', key:a.source };
  if (a.recurrenceSeriesId || a.recurrence_series_id) return { kind:'provider', key:String(a.recurrenceSeriesId || a.recurrence_series_id) };
  if (a.officeBookingPlanId || a.booking_plan_id) return { kind:'office_plan', key:String(a.officeBookingPlanId || a.booking_plan_id) };
  return null;
}
export function sameCancellationSeries(a, b) {
  const x = cancellationSeries(a), y = cancellationSeries(b);
  return !!x && !!y && x.kind === y.kind && x.key === y.key;
}
export function guardianCancellationDetails(input) {
  const reason = String(input.reason || '').trim(), personalNote = String(input.personalNote || '').trim();
  if (!reason || reason.length > 500) throw Object.assign(new Error('Choose a reason or enter one, up to 500 characters.'), { status:400 });
  if (personalNote.length > 1000) throw Object.assign(new Error('Keep your optional personal note within 1,000 characters.'), { status:400 });
  return { reason, personalNote };
}
