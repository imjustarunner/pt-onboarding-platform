import test from 'node:test';
import assert from 'node:assert/strict';
import { applyActualHoursReview, payrollHoursSourceFingerprint, payrollPeriodIsLocked, validateActualHoursReview } from '../payrollActualHoursReview.js';
import { calculateSickLeaveHours } from '../payrollSickLeaveHours.js';
const body = { actualWorkedHours: 0, sourceReference: 'Approved daily time report', reconciliationNote: 'All daily entries reviewed; no compensable work in this period.', attested: true };
test('zero must be explicit and cannot be inferred from a blank input', () => {
  assert.equal(validateActualHoursReview(body, 336).actualWorkedHours, 0);
  for (const actualWorkedHours of ['', null, undefined, -1, 337, 'abc']) assert.throws(() => validateActualHoursReview({ ...body, actualWorkedHours }, 336));
  assert.throws(() => validateActualHoursReview({ ...body, attested: false }, 336));
});
test('requires a source and note and preserves a separate statutory basis', () => {
  assert.throws(() => validateActualHoursReview({ ...body, sourceReference: 'x' }, 336));
  assert.throws(() => validateActualHoursReview({ ...body, actualWorkedHours: 10, statutorySickBasisHours: 9 }, 336));
  assert.equal(validateActualHoursReview({ ...body, actualWorkedHours: 20, statutorySickBasisHours: 40 }, 336).statutorySickBasisHours, 40);
});
test('a reviewed statutory basis raises leave accrual without inventing actual work hours', () => {
  const summary = { total_amount: 44, direct_hours: 1, total_hours: 1, breakdown: { '90837': { hours: 1, amount: 44 } } };
  const review = { id: 1, actual_worked_hours: 1, statutory_sick_basis_hours: 40, summary_fingerprint: payrollHoursSourceFingerprint(summary), reviewed_by_user_id: 3 };
  const reviewed = applyActualHoursReview(summary, review), result = calculateSickLeaveHours(reviewed);
  assert.equal(result.actualWorkedHours, 1);
  assert.equal(result.sickLeaveHours, 40);
  assert.equal(result.statutorySickBasisHours, 40);
  assert.equal(result.actualHoursReviewRequired, false);
  const changed = applyActualHoursReview({ ...reviewed, total_amount: 45 }, review);
  assert.equal(changed.breakdown.__actualHoursReview.current, false);
  assert.equal(calculateSickLeaveHours(changed).actualWorkedHours, null);
  assert.equal(review.actual_worked_hours, 1);
});
test('fingerprints ignore derived review data and key order but detect changed source entries', () => {
  const first = { total_amount: 44, total_hours: 1, breakdown: { '90837': { amount: 44, hours: 1 } } };
  const second = { ...first, breakdown: { __sickLeaveHours: { sickLeaveHours: 1.2 }, '90837': { hours: 1, amount: 44 }, __actualWorkedHours: 2 } };
  assert.equal(payrollHoursSourceFingerprint(first), payrollHoursSourceFingerprint(second));
  assert.notEqual(payrollHoursSourceFingerprint(first), payrollHoursSourceFingerprint({ ...first, breakdown: { '90837': { amount: 44, hours: 2 } } }));
  assert.equal(payrollPeriodIsLocked({ status: 'ran', posted_at: '2026-10-29' }), true);
  assert.equal(payrollPeriodIsLocked({ status: 'finalized' }), true);
  assert.equal(payrollPeriodIsLocked({ status: 'ran' }), false);
});
