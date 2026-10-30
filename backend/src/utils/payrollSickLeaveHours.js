/** Processor reporting equivalents. These never replace actual work-time records. */
export const SICK_LEAVE_HOURS_VERSION = 'sick-leave-hours-1-to-30-v1';
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value, places = 6) => Number(number(value).toFixed(places));
const parse = value => {
  if (typeof value !== 'string') return value && typeof value === 'object' ? value : {};
  try { return JSON.parse(value) || {}; } catch { return {}; }
};
const TIME_TYPES = new Set(['time_claim', 'manual_pay_line', 'other_rate_1', 'other_rate_2', 'other_rate_3']);
const BONUS_TYPES = new Set(['bonus', 'holiday_bonus', 'shift_perfect_attendance', 'shift_coverage']);

export function uniformSickLeavePolicyApplies({ policy, periodStart }) {
  const effective = String(policy?.sickLeaveHoursEffectiveOn || '').slice(0, 10);
  const start = periodStart instanceof Date ? periodStart.toISOString().slice(0, 10) : String(periodStart || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(effective) && /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= effective;
}

/** One audited calculation shared by reports, processor CSV and employee pay detail.
 * Credits are multiplied once; H-code equivalents and separately paid indirect time
 * are added once. Dollar-only compensation never manufactures work or leave hours. */
export function calculateSickLeaveHours(summaryRow) {
  const breakdown = parse(summaryRow?.breakdown);
  const adjustments = breakdown.__adjustments || {};
  let clinicalCredits = 0, directHours = 0, indirectHours = 0, supportHours = 0;
  let automaticIndirectHours = 0, automaticIndirectPay = 0;
  let ordinaryEarnings = 0, extraTaxablePay = 0, bonusPay = 0, ptoPay = 0, salaryPay = 0, nonTaxablePay = 0;
  let ledgerHours = 0;
  for (const [key, row] of Object.entries(breakdown)) {
    if (key.startsWith('_') || !row || typeof row !== 'object' || row.supervisionTrackingOnly) continue;
    const code = String(row.displayServiceCode || row.serviceCode || key).toUpperCase();
    const category = String(row.category || '').toLowerCase();
    const bucket = String(row.bucket || '').toLowerCase();
    const payType = String(row.payType || '').toLowerCase();
    const hours = number(row.hourEquivalent ?? row.creditsHours ?? row.hours);
    const amount = number(row.amount);
    if (['mileage', 'reimbursement'].includes(category)) { nonTaxablePay += amount; continue; }
    if (category === 'bonus') { bonusPay += amount; continue; }
    if (payType === 'skip') continue;
    if (payType === 'flat' || bucket === 'flat' || category === 'other_pay') { extraTaxablePay += amount; continue; }
    const isClinical = payType ? payType === 'credit' : (/^9\d{4}(?:\D|$)/.test(code) && !/^9941[456]/.test(code) && !['indirect', 'admin', 'meeting'].includes(category));
    ledgerHours += hours;
    ordinaryEarnings += amount;
    if (code === 'AUTO INDIRECT' || row.rateSource === 'pay_system_auto_indirect') { automaticIndirectHours += hours; automaticIndirectPay += amount; }
    if (isClinical) clinicalCredits += hours;
    else if (row.payType === 'indirect' || ['indirect', 'admin', 'meeting'].includes(category) || bucket === 'indirect' || code === 'AUTO INDIRECT') indirectHours += hours;
    else if (row.payType === 'support_activity') supportHours += hours;
    else directHours += hours;
  }
  const serviceOrdinaryEarnings = ordinaryEarnings;
  const lines = Array.isArray(adjustments.lines) ? adjustments.lines : [];
  for (const line of lines) {
    const amount = number(line?.amount), type = String(line?.type || '').toLowerCase();
    const hours = number(line?.meta?.creditsHours ?? line?.meta?.hours);
    if (line.taxable === false) { nonTaxablePay += amount; continue; }
    if (BONUS_TYPES.has(type)) { bonusPay += amount; continue; }
    if (type === 'pto') { ptoPay += amount; continue; }
    if (type === 'salary') { salaryPay += amount; continue; }
    if (TIME_TYPES.has(type) && Math.abs(hours) > 1e-9) {
      ledgerHours += hours;
      ordinaryEarnings += amount;
      if (line.bucket === 'direct') directHours += hours;
      else if (line.bucket === 'indirect') indirectHours += hours;
      else supportHours += hours;
    } else extraTaxablePay += amount;
  }
  // Older snapshots can include only some detailed adjustment lines. Add each
  // stored bucket only when its corresponding detail is absent.
  const missing = (type, key) => lines.some(line => line.type === type) ? 0 : number(adjustments[key]);
  bonusPay += missing('bonus', 'bonusAmount') + missing('holiday_bonus', 'holidayBonusClaimsAmount') + missing('shift_perfect_attendance', 'shiftPerfectAttendanceAmount') + missing('shift_coverage', 'shiftCoverageAmount');
  salaryPay += missing('salary', 'salaryAmount');
  nonTaxablePay += missing('mileage', 'mileageAmount') + missing('reimbursement', 'reimbursementAmount') + missing('tuition_reimbursement', 'tuitionReimbursementAmount');
  if (!lines.some(line => line.taxable === false) && !nonTaxablePay) nonTaxablePay = number(adjustments.nonTaxableAmount);
  ptoPay += missing('pto', 'ptoPay');
  extraTaxablePay += missing('medcancel', 'medcancelAmount') + missing('other_taxable', 'otherTaxableAmount') + missing('imatter', 'imatterAmount') + missing('missed_appointments', 'missedAppointmentsAmount') + missing('shift_on_call', 'shiftOnCallPayAmount');
  // Kiosk shifts are stored outside service/adjustment line arrays.
  const shiftHours = number(breakdown.__paySystem?.shiftDirectHours) + number(breakdown.__paySystem?.shiftIndirectHours);
  const paidLedgerTotal = number(summaryRow?.direct_hours) + number(summaryRow?.indirect_hours) + number(breakdown.otherPaidTimeHours);
  const residual = paidLedgerTotal - ledgerHours;
  const residualHours = residual > 0.00501 ? residual : 0;
  supportHours += Math.max(shiftHours, residualHours);
  if (salaryPay > 0 && !adjustments.salaryIncludeServicePay) ordinaryEarnings -= serviceOrdinaryEarnings;
  else ordinaryEarnings += number(adjustments.shiftHoursPay);
  const equivalentHours = Math.max(0, clinicalCredits * 1.2 + directHours + indirectHours + supportHours);
  const actualRaw = breakdown.__actualWorkedHours ?? summaryRow?.actual_worked_hours ?? breakdown.actualWorkedHours;
  const actualWorkedHours = actualRaw === undefined || actualRaw === null ? null : Math.max(0, number(actualRaw));
  const statutoryRaw = breakdown.__statutorySickBasisHours;
  const statutorySickBasisHours = statutoryRaw === undefined || statutoryRaw === null ? actualWorkedHours : Math.max(number(actualWorkedHours), number(statutoryRaw));
  const reconciliationHours = statutorySickBasisHours === null ? 0 : Math.max(0, statutorySickBasisHours - equivalentHours);
  const sickLeaveHours = round(equivalentHours + reconciliationHours);
  // Preserve explicit payroll dollars; do not recompute dollars from a rounded rate.
  const amount = round(ordinaryEarnings, 2);
  const totalPay = round(number(summaryRow?.total_amount), 2);
  const classifiedTotal = round(amount + bonusPay + ptoPay + salaryPay + nonTaxablePay + extraTaxablePay, 2);
  const unclassifiedPay = round(totalPay - classifiedTotal, 2);
  return {
    version: SICK_LEAVE_HOURS_VERSION,
    clinicalCredits: round(clinicalCredits), clinicalSickLeaveHours: round(clinicalCredits * 1.2),
    directHours: round(directHours), indirectHours: round(indirectHours), supportHours: round(supportHours),
    automaticIndirectHours: round(automaticIndirectHours), automaticIndirectPay: round(automaticIndirectPay, 2),
    additionalIndirectHours: round(indirectHours - automaticIndirectHours),
    equivalentHours: round(equivalentHours), reconciliationHours: round(reconciliationHours),
    sickLeaveHours, projectedSickLeaveAccrual: round(sickLeaveHours / 30), actualWorkedHours, statutorySickBasisHours,
    actualHoursReviewRequired: actualWorkedHours === null || breakdown.__actualHoursReview?.current === false,
    actualHoursReviewId: breakdown.__actualHoursReview?.id || null,
    ordinaryEarnings: amount,
    adpAllocationRate: sickLeaveHours > 0 ? round(amount / sickLeaveHours) : null,
    bonusPay: round(bonusPay, 2), ptoPay: round(ptoPay, 2), salaryPay: round(salaryPay, 2),
    nonTaxablePay: round(nonTaxablePay, 2), extraTaxablePay: round(extraTaxablePay, 2),
    unclassifiedPay, reconciliationRequired: Math.abs(unclassifiedPay) > 0.005,
    allocationRateIsLegalHourlyRate: false,
    processorMappingReviewRequired: true
  };
}

export function withSickLeaveHours(summaryRow, { policy, periodStart } = {}) {
  const breakdown = { ...parse(summaryRow?.breakdown) };
  const active = policy !== undefined || periodStart !== undefined
    ? uniformSickLeavePolicyApplies({ policy, periodStart })
    : summaryRow?.sick_leave_calculation_active !== false;
  if (!active) {
    // Hide previously generated reporting projections without rewriting saved payroll.
    delete breakdown.__sickLeaveHours;
    return { ...summaryRow, breakdown, sick_leave_summary: null, sick_leave_calculation_active: false };
  }
  return { ...summaryRow, breakdown, sick_leave_summary: breakdown.__sickLeaveHours || calculateSickLeaveHours(summaryRow), sick_leave_calculation_active: true };
}

export function uniformSickLeaveAccrual({ summaryRow, alreadyCreditedSickHours = 0, preservePriorEarn = 0 }) {
  const summary = parse(summaryRow?.breakdown).__sickLeaveHours || calculateSickLeaveHours(summaryRow);
  // Existing leave ledger/account columns store hundredths. Round the total up
  // before subtracting prior credits so repeated manual lines cannot lose leave.
  const totalEntitlement = Math.ceil((number(summary.sickLeaveHours) / 30) * 100 - 1e-9) / 100;
  return { sickEarn: round(Math.max(0, number(preservePriorEarn), totalEntitlement - number(alreadyCreditedSickHours)), 2), summary };
}
