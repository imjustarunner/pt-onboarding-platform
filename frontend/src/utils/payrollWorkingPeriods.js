export function workingPeriods(periods, selectedId) {
  const current = periods.find(p=>Number(p.id)===Number(selectedId));
  if (!current) return [];
  const start = String(current.period_start).slice(0,10);
  return periods.filter(p=>String(p.period_start).slice(0,10)<=start)
    .sort((a,b)=>String(b.period_start).localeCompare(String(a.period_start))).slice(0,3);
}
export function claimInWorkingPeriods(claim, periods) {
  const id = Number(claim.target_payroll_period_id || claim.suggested_payroll_period_id || 0);
  if (id) return periods.some(p=>Number(p.id)===id);
  const date=String(claim.claim_date || claim.trip_date || claim.request_date || '').slice(0,10);
  return periods.some(p=>date>=String(p.period_start).slice(0,10) && date<=String(p.period_end).slice(0,10));
}
