/**
 * Helpers for dual-rate hourly contracts (Indirect + Other 1 Log Time split).
 */

export const DUAL_RATE_PILOT_EMPLOYEE_NUM = '485';

export function normalizeEmployeeNumber(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  const stripped = s.replace(/^EMP-?/i, '').replace(/\D/g, '');
  if (!stripped) return '';
  return String(Number(stripped));
}

export function isDualRateContractPilotUser(user) {
  if (!user) return false;
  const id = Number(user.id || user.userId || 0);
  if (id === 485) return true;
  const emp = normalizeEmployeeNumber(user.employee_id || user.employeeId || '');
  return emp === DUAL_RATE_PILOT_EMPLOYEE_NUM;
}

export function isHourlyDualRateEnabled(userOrRow) {
  if (!userOrRow) return false;
  const flag = userOrRow.hourly_dual_rate_enabled ?? userOrRow.hourlyDualRateEnabled;
  return flag === true || flag === 1 || flag === '1';
}

export function normalizePayBucket(raw) {
  const b = String(raw || '').trim().toLowerCase();
  return b === 'other_1' ? 'other_1' : 'indirect';
}

export function normalizeTimeClaimBucket(raw) {
  const b = String(raw || 'indirect').trim().toLowerCase();
  if (b === 'direct') return 'direct';
  if (b === 'other_1') return 'other_1';
  return 'indirect';
}
