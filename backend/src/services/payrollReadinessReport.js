const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const dollars = value => value == null ? 'Not entered' : `$${Number(value).toFixed(2)}`;

/** Plain-language, private operator report. Never changes payroll or infers opening balances. */
export function renderPayrollReadinessReport(report) {
  const staff = report.staff || [];
  const assigned = staff.filter(row => row.category && row.level);
  const latest = new Map();
  for (const row of report.amendments || []) {
    if (!latest.has(Number(row.user_id)) || Number(row.id) > Number(latest.get(Number(row.user_id)).id)) latest.set(Number(row.user_id), row);
  }
  const lines = [
    'ITSCO PAYROLL SETUP — WHAT IS DONE AND WHAT NEEDS ACTION',
    `Checked: ${report.auditedAt || 'See audit timestamp'}`,
    `New service period: ${day(report.period?.period_start)} through ${day(report.period?.period_end)}.`,
    `Earlier work stays in the prior period: ${day(report.previousPeriod?.period_start)} through ${day(report.previousPeriod?.period_end)}.`,
    '',
    'WHAT THE WORDS MEAN',
    'Planned start = the earliest service date selected for the new system. Saving it does not activate pay or backdate signatures.',
    'Leave record = the employee’s sick-leave, Training PTO and school support-hour balances and transaction history. It is not a login or bank account.',
    'Saved fallback sick rate = the existing leave-record rate, not proof of the correct rate for every leave date. Signed terms and eligibility still need to be checked.',
    'ADP balance confirmation = People Operations confirms the actual Training PTO hours and the last pay period already included, so the app does not accrue those hours twice.',
    '',
    'WHAT IS ALREADY SAVED',
    `${assigned.length} active employees have a category and level. Their approved assignments do not need to be entered again.`,
    `${assigned.filter(row => row.effective_start).length} of those assignments have an individual planned start saved; later individual transition dates are shown below.`,
    `${staff.filter(row => row.leave_account_user_id).length} of ${staff.length} active internal accounts have a leave record. This roster includes administrative/system accounts; it is not a count of everyone moving to service pay.`,
    '',
    'PRIORITY 1 — SOFTWARE AND PAYROLL REVIEW BEFORE ACTIVATION',
    'Protect older service dates from being repriced with the new matrix; reconcile carryovers and dated units.',
    'Make activation validate the signed agreement and saved assignment before enabling anyone; prevent partially completed activation.',
    'Stop and show an actionable error if a payroll calculation fails instead of silently falling back to another calculation.',
    'Run a non-posting payroll rehearsal once the actual import is available. Neither saved settings nor unit tests replace reconciliation.',
    '',
    'PRIORITY 2 — COMPLETE THE NORMAL PAYROLL HANDOFF',
    'Finish the September 26–October 9 payroll under the existing terms.',
    'Review and countersign completed amendments. Drafts are not executed agreements. Do not invent or backdate signatures.',
    'For participating employees: open their staff profile > Payroll > PTO (Sick + Training) > Edit.',
    'Compare Current Training balance (hours) with ADP; enter the actual balance. After the prior period is posted, set ADP training balance includes pay periods through to October 9, 2026, then Save.',
    'Do not replace an unknown opening balance with zero. A displayed balance without a confirmed coverage date still needs reconciliation.',
    'Review submitted time in Payroll > Pending submissions and apply each approved claim to the correct period. Submitted time is not approved pay.',
    '',
    'PRIORITY 3 — INDIVIDUAL EXCEPTIONS',
    'Jacquelyne: salary runs through October 10; her new-pay start is October 11, as confirmed by Michael. Review the salary/service-pay split for October 10–23 so the remaining salary does not suppress service pay.',
    'Hannah and Loriana: deferred at Michael’s direction; leave their existing arrangements unchanged.',
    'Kaitlyn O’Connell: Training PTO opening-balance task 1923 is due October 22. Kaitlyn and Melissa Mendez have ADP tracking-retirement tasks 1924 and 1925 due October 23. Verify the app handoff before retiring active ADP Training PTO tracking; preserve history and earned balances.',
    'Elizabeth remains outside the new matrix as instructed. Salary and other nonparticipant exceptions keep their existing arrangements.',
    'Check new leave records and their employment classifications. The app currently defaults a newly created record to Hourly when no classification is supplied.',
    '',
    'BEFORE YEAR END / PROCESSOR HANDOFF',
    'Implement and test school support-hour calendar-year expiration before December year end. The 20-hour cap is already configured.',
    'The supported processor handoff is CSV. Automatic ADP API submission is not implemented.',
    '',
    'EMPLOYEE SETUP — EACH VALUE HAS A LABEL'
  ];
  for (const row of assigned) {
    const agreement = latest.get(Number(row.id));
    lines.push('', `${row.name} — Category ${row.category}, Level ${row.level}`,
      `  Planned start: ${row.effective_start ? day(row.effective_start) : 'NOT SAVED — prepare the approved service start date'}. New engine: ${Number(row.pay_system_enabled) ? 'enabled' : 'off'}.`,
      `  Amendment: ${Number(agreement?.executed) ? 'signed and countersigned' : 'awaiting execution/countersignature'}.`,
      `  Sick rate recorded in amendment: ${dollars(agreement?.draft_sick_rate)}${agreement?.draft_sick_rate_date ? ` as of ${day(agreement.draft_sick_rate_date)}` : ''}. A draft rate is not yet active payroll.`,
      `  Leave record: ${row.leave_account_user_id ? 'exists' : 'NOT CREATED — initialize the record, then reconcile opening balances'}.`,
      `  Leave classification: ${{fee_for_service:'paid per service/credit',hourly:'hourly',salaried:'salary'}[row.employment_type] || 'not yet set'}. Saved fallback sick rate: ${dollars(row.pto_pay_rate)}.`,
      `  Training ADP confirmation: ${row.training_adp_confirmed_at ? `confirmed through ${day(row.training_adp_through_date)}` : 'PENDING — confirm actual hours and coverage date; do not assume zero'}.`);
  }
  return `${lines.join('\n')}\n`;
}
