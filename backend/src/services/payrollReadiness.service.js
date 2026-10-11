const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);

/** Read-only launch checks. A configured rate table is not evidence of activation. */
export function assessPayrollReadiness({ agency, period, previousPeriod, staff, amendments, salaries }) {
  const findings = [];
  const add = (code, message, userIds = []) => findings.push({ code, message, userIds });
  const assigned = staff.filter(row => row.category && row.level);
  const latest = new Map();
  for (const row of amendments) if (!latest.has(row.user_id) || row.id > latest.get(row.user_id).id) latest.set(row.user_id, row);
  const unexecuted = assigned.filter(row => !Number(latest.get(row.id)?.executed));
  const unenabled = assigned.filter(row => !Number(row.pay_system_enabled));
  const undated = assigned.filter(row => !row.effective_start || day(row.effective_start)<day(period?.period_start) || day(row.effective_start)>day(period?.period_end));
  const noHandoff = staff.filter(row => !row.training_adp_confirmed_at || day(row.training_adp_through_date) !== day(previousPeriod?.period_end));
  const noLeaveAccount = staff.filter(row => !row.leave_account_user_id);
  const salaryConflicts = salaries.filter(row => assigned.some(user => user.id === row.user_id &&
    (!row.effective_end || day(row.effective_end)>=day(user.effective_start||period?.period_start))) && !Number(row.include_service_pay));
  if (!period) add('PERIOD_MISSING', 'Create the requested service pay period.');
  if (period && !['draft', 'raw_imported', 'staged', 'ran'].includes(period.status)) add('PERIOD_LOCKED', 'The requested service period is already posted or finalized.');
  if (!Number(agency.new_pay_system_enabled)) add('AGENCY_NOT_ENABLED', 'The new compensation engine is not enabled.');
  if (unenabled.length) add('STAFF_NOT_ENABLED', 'Assigned employees have not been enrolled in the new compensation engine.', unenabled.map(row => row.id));
  if (undated.length) add('START_DATE_REVIEW', 'Assigned employees need an explicit service-date activation boundary within this period.', undated.map(row => row.id));
  if (unexecuted.length) add('SIGNATURES_PENDING', 'Assigned employees need an executed amendment or an individually reviewed exception before activation.', unexecuted.map(row => row.id));
  if (salaryConflicts.length) add('SALARY_OVERRIDES_SERVICE_PAY', 'An active salary excludes service pay for an employee assigned to the new service-rate matrix.', salaryConflicts.map(row => row.user_id));
  if (noHandoff.length) add('TRAINING_HANDOFF_PENDING', 'People Operations must confirm the Training PTO balance through the prior period, or document a nonparticipant exception.', noHandoff.map(row => row.id));
  if (noLeaveAccount.length) add('LEAVE_ACCOUNT_MISSING', 'Create and classify leave accounts for applicable staff.', noLeaveAccount.map(row => row.id));
  return {
    configurationChecksPassed: findings.length === 0,
    period: period || null,
    previousPeriod: previousPeriod || null,
    counts: { staff: staff.length, assigned: assigned.length, enabled: assigned.length - unenabled.length,
      executedAssignedAmendments: assigned.length - unexecuted.length,
      leaveAccounts: staff.length - noLeaveAccount.length,
      confirmedTrainingHandoffs: staff.length - noHandoff.length },
    findings
  };
}
