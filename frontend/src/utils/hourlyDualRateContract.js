/**
 * Helpers for dual-rate hourly contracts (Indirect + Other 1 Log Time split).
 */

/** Canonical employee number for Jacquelyne / EMP-0485 dual-rate pilot. */
export const DUAL_RATE_PILOT_EMPLOYEE_NUM = '485';

/**
 * Normalize employee_id / EMP-#### display to digits-only without leading zeros
 * (e.g. "EMP-0485" / "0485" → "485").
 */
export function normalizeEmployeeNumber(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  const stripped = s.replace(/^EMP-?/i, '').replace(/\D/g, '');
  if (!stripped) return '';
  return String(Number(stripped));
}

/** True when this user is the EMP-0485 pilot (or users.id === 485). */
export function isDualRateContractPilotUser(user) {
  if (!user) return false;
  const id = Number(user.id || user.userId || 0);
  if (id === 485) return true;
  const emp = normalizeEmployeeNumber(user.employee_id || user.employeeId || '');
  return emp === DUAL_RATE_PILOT_EMPLOYEE_NUM;
}

export function isHourlyDualRateEnabled(user) {
  if (!user) return false;
  const flag = user.hourly_dual_rate_enabled ?? user.hourlyDualRateEnabled;
  return flag === true || flag === 1 || flag === '1';
}

export function normalizePayBucket(raw) {
  const b = String(raw || '').trim().toLowerCase();
  return b === 'other_1' ? 'other_1' : 'indirect';
}
