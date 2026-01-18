// Agency "service code dictionary" defaults.
// These values are used as fallbacks when an agency has not yet configured
// `payroll_service_code_rules` (or when new codes were auto-inserted by imports).
//
// IMPORTANT:
// - These defaults affect hours/credits math, but fee-for-service pay should still
//   be driven by per-code rates (units * rate) rather than hours.
// - Agency-specific edits in the DB always take precedence over these defaults.
export const PAYROLL_SERVICE_CODE_DEFAULTS = new Map(
  [
    // Direct CPTs
    ['90785', { category: 'direct', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['90791', { category: 'direct', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['90832', { category: 'direct', otherSlot: 1, durationMinutes: 30, payDivisor: 2, creditValue: 0.5 }],
    ['90834', { category: 'direct', otherSlot: 1, durationMinutes: 45, payDivisor: 1, creditValue: 0.75 }],
    // 90837 is fee-for-service for our company: pay should be flat-per-service via per-code rate.
    // Duration exists only to compute/report hours, not to compute fee-for-service pay.
    ['90837', { category: 'direct', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['90839', { category: 'direct', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['90840', { category: 'direct', otherSlot: 1, durationMinutes: 30, payDivisor: 1, creditValue: 0.5 }],
    ['90846', { category: 'direct', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['90847', { category: 'direct', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['90853', { category: 'direct', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['97535', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],
    ['99051', { category: 'direct', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],

    // Indirect / admin / meeting
    ['99414', { category: 'indirect', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['99415', { category: 'indirect', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['99416', { category: 'indirect', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['H0002', { category: 'indirect', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],

    // H-codes (mixture of 15-min and minute-based)
    ['H0004', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],
    ['H0023', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],
    ['H0025', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],
    ['H0031', { category: 'direct', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['H0032', { category: 'direct', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['H2014', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],
    ['H2015', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],
    ['H2016', { category: 'direct', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['H2017', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],
    ['H2018', { category: 'direct', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['H2021', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],
    ['H2022', { category: 'direct', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['H2033', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],

    // Other direct CPT-ish
    ['S9454', { category: 'direct', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['T1017', { category: 'direct', otherSlot: 1, durationMinutes: 15, payDivisor: 4, creditValue: 0.25 }],

    // Named codes
    ['ADMIN TIME', { category: 'admin', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['IMATTER', { category: 'direct', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['INDIRECT TIME', { category: 'indirect', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['INDIVIDUAL MEETING', { category: 'meeting', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['MEDCANCEL', { category: 'other_pay', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['MISSED APPT', { category: 'other_pay', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['OUTREACH', { category: 'indirect', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['SALARY', { category: 'direct', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['MILEAGE', { category: 'mileage', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['BONUS', { category: 'bonus', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['COMMISSION', { category: 'other_pay', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['MEETING', { category: 'meeting', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['PRO-BONO SERVICE', { category: 'direct', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['REIMBURSEMENT', { category: 'reimbursement', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }],
    ['INDIRECT HOURS', { category: 'indirect', otherSlot: 1, durationMinutes: 1, payDivisor: 60, creditValue: 0.01666666667 }],
    ['TUTORING', { category: 'tutoring', otherSlot: 1, durationMinutes: 60, payDivisor: 1, creditValue: 1 }],
    ['HOMEWORK', { category: 'indirect', otherSlot: 1, durationMinutes: 45, payDivisor: 1, creditValue: 1 }],
    ['HOLIDAY BONUS', { category: 'bonus', otherSlot: 1, durationMinutes: 0, payDivisor: 1, creditValue: 0 }]
  ].map(([k, v]) => [String(k).trim().toUpperCase(), v])
);

export function payrollDefaultsForCode(code) {
  const key = String(code || '').trim().toUpperCase();
  if (!key) return null;
  return PAYROLL_SERVICE_CODE_DEFAULTS.get(key) || null;
}

