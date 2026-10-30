import { createHash } from 'node:crypto';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value || {};
const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
export function payrollHoursSourceFingerprint(summary) {
  const breakdown = { ...parse(summary.breakdown) };
  for (const key of ['__sickLeaveHours', '__actualWorkedHours', '__statutorySickBasisHours', '__actualHoursReview']) delete breakdown[key];
  const source = { breakdown, directHours: Number(Number(summary.direct_hours || 0).toFixed(2)), indirectHours: Number(Number(summary.indirect_hours || 0).toFixed(2)), totalHours: Number(Number(summary.total_hours || 0).toFixed(2)), totalAmount: Number(Number(summary.total_amount || 0).toFixed(2)) };
  return createHash('sha256').update(JSON.stringify(normalize(source))).digest('hex');
}
export function validateActualHoursReview(body, maximumHours) {
  if (body?.attested !== true) throw Object.assign(new Error('Confirm that you reviewed complete actual work-time records and the applicable sick-leave basis.'), { status: 400 });
  if (body.actualWorkedHours === '' || body.actualWorkedHours === null || body.actualWorkedHours === undefined) throw Object.assign(new Error('Enter verified actual work hours; enter zero explicitly only when the records support zero.'), { status: 400 });
  const actual = Number(body.actualWorkedHours);
  const statutory = body.statutorySickBasisHours === '' || body.statutorySickBasisHours === null || body.statutorySickBasisHours === undefined ? actual : Number(body.statutorySickBasisHours);
  if (!Number.isFinite(actual) || actual < 0 || actual > maximumHours || !Number.isFinite(statutory) || statutory < actual || statutory > maximumHours) throw Object.assign(new Error('Enter valid hours within the pay period. The statutory sick-leave basis cannot be below verified actual work time.'), { status: 400 });
  const sourceReference = String(body.sourceReference || '').trim(), reconciliationNote = String(body.reconciliationNote || '').trim();
  if (sourceReference.length < 5 || sourceReference.length > 500 || reconciliationNote.length < 10 || reconciliationNote.length > 4000) throw Object.assign(new Error('Provide a source reference and a reconciliation note explaining the review. Keep client details out of these fields.'), { status: 400 });
  return { actualWorkedHours: Number(actual.toFixed(6)), statutorySickBasisHours: Number(statutory.toFixed(6)), sourceReference, reconciliationNote };
}
export function applyActualHoursReview(summary, review) {
  const breakdown = { ...parse(summary.breakdown) };
  delete breakdown.__actualWorkedHours;
  delete breakdown.__statutorySickBasisHours;
  delete breakdown.__actualHoursReview;
  if (!review) return { ...summary, breakdown };
  const current = review.summary_fingerprint === payrollHoursSourceFingerprint(summary);
  breakdown.__actualHoursReview = { id: Number(review.id), current, reviewedByUserId: Number(review.reviewed_by_user_id), reviewedAt: review.reviewed_at || null };
  if (current) {
    breakdown.__actualWorkedHours = Number(review.actual_worked_hours);
    breakdown.__statutorySickBasisHours = Number(review.statutory_sick_basis_hours);
  }
  return { ...summary, breakdown };
}

export function payrollPeriodIsLocked(period) {
  return ['posted', 'finalized'].includes(String(period?.status || '').toLowerCase()) || !!(period?.posted_at || period?.finalized_at || period?.posted_by_user_id || period?.finalized_by_user_id);
}
