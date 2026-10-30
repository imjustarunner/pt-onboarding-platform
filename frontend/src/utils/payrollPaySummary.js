const SUM_KEYS = ['salary_amount', 'service_pay_amount', 'service_pay_paid_amount', 'adjustments_total', 'taxable_adjustments_total', 'non_taxable_total', 'total_pay', 'sick_leave_hours', 'ordinary_earnings'];
/** Combine period earnings once, then derive a weighted allocation rate. */
export function mergePayrollPaySummaryRows(rows) {
  const byUser = new Map();
  for (const row of rows || []) {
    const key = row.user_id ? `id:${row.user_id}` : `name:${row.provider_name || ''}`;
    const combined = byUser.get(key) || { ...row, ...Object.fromEntries(SUM_KEYS.map(key => [key, 0])), actual_worked_hours: 0, actual_hours_review_required: 'NO' };
    for (const key of SUM_KEYS) combined[key] += Number(row[key] || 0);
    combined.sick_leave_calculation_active = combined.sick_leave_calculation_active !== false && row.sick_leave_calculation_active !== false;
    combined.salary_include_service_pay = Number(combined.salary_include_service_pay || 0) || Number(row.salary_include_service_pay || 0) ? 1 : 0;
    if (row.actual_worked_hours === null || row.actual_worked_hours === undefined || row.actual_hours_review_required === 'YES') {
      combined.actual_worked_hours = null;
      combined.actual_hours_review_required = 'YES';
    } else if (combined.actual_worked_hours !== null) combined.actual_worked_hours += Number(row.actual_worked_hours || 0);
    combined.adp_allocation_rate = combined.sick_leave_hours > 0 ? combined.ordinary_earnings / combined.sick_leave_hours : null;
    byUser.set(key, combined);
  }
  return [...byUser.values()].map(row => row.sick_leave_calculation_active === false ? { ...row, sick_leave_hours: null, ordinary_earnings: null, adp_allocation_rate: null, sick_leave_summary: null, actual_hours_review_required: '' } : row);
}
