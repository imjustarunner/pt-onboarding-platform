/** Employee presentation only: payroll keeps its original audit statuses. */
export function isTimeAppliedToPayroll(row) {
  const status = String(row?.status ?? row?.claim_status ?? '').toLowerCase();
  const amount = row?.applied_amount;
  return ['approved', 'applied', 'paid'].includes(status)
    && Number(row?.target_payroll_period_id) > 0
    && amount !== null && amount !== undefined && amount !== ''
    && Number.isFinite(Number(amount)) && Number(amount) >= 0;
}

export function employeeTimeStatusLabel(row) {
  const status = String(row?.status ?? row?.claim_status ?? '').toLowerCase();
  if (isTimeAppliedToPayroll(row)) return status === 'paid' ? 'Paid' : 'Applied to payroll';
  if (['approved', 'applied', 'paid'].includes(status)) return 'Accepted — awaiting payroll application';
  if (['submitted', 'pending', 'pending_approval'].includes(status)) return 'Awaiting payroll review';
  if (status === 'deferred') return 'Needs changes';
  if (status === 'rejected') return 'Not accepted';
  if (status === 'withdrawn') return 'Withdrawn';
  return 'Recorded — awaiting confirmation';
}
