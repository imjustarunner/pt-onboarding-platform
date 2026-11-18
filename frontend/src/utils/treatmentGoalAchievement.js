export function objectiveTargetReached({ value, target, direction, baseline, status } = {}) {
  if (['achieved', 'met', 'completed'].includes(String(status || '').toLowerCase())) return true;
  if ([value, target].some(item => item == null || item === '' || !Number.isFinite(Number(item)))) return false;
  const trend = direction || (baseline != null && Number(baseline) !== Number(target) ? Number(target) > Number(baseline) ? 'increase' : 'decrease' : null);
  return trend === 'increase' ? Number(value) >= Number(target) : trend === 'decrease' ? Number(value) <= Number(target) : Number(value) === Number(target);
}
