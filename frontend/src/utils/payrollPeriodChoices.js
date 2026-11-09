const day = value => String(value || '').slice(0, 10);

export const payrollToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

export function payrollPeriodLocked(period) {
  return ['posted', 'finalized'].includes(String(period?.status || '').toLowerCase())
    || Boolean(period?.posted_at || period?.finalized_at || period?.posted_by_user_id || period?.finalized_by_user_id);
}

export function scheduledPayrollPeriods(periods = []) {
  // Only fall back for legacy responses that omit alignment altogether. An
  // explicit zero must never be treated as a gap in the payroll schedule.
  const hasAlignment = periods.some(p => p.schedule_aligned != null);
  return periods.filter(p => !hasAlignment || Number(p.schedule_aligned) === 1)
    .slice().sort((a, b) => day(a.period_start).localeCompare(day(b.period_start)) || Number(a.id) - Number(b.id));
}

export function payrollPeriodChoices(periods, { today = payrollToday(), includeOlder = false,
  includeLocked = false, selectedId = null } = {}) {
  const scheduled = scheduledPayrollPeriods(periods);
  const past = scheduled.filter(p => day(p.period_end) < today);
  const upcoming = scheduled.filter(p => day(p.period_end) >= today).slice(0, 3);
  const recent = includeOlder ? past : past.slice(-2);
  const choices = [...recent, ...upcoming].filter(p => includeLocked || !payrollPeriodLocked(p));
  const selected = scheduled.find(p => Number(p.id) === Number(selectedId));
  if (selected && (includeLocked || !payrollPeriodLocked(selected)) && !choices.some(p => p.id === selected.id)) choices.push(selected);
  return choices.sort((a, b) => day(b.period_start).localeCompare(day(a.period_start)) || Number(b.id) - Number(a.id));
}
