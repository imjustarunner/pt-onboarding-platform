/**
 * Helpers for Log Time category groups (Indirect Service / Support Activity / Supervision Note).
 * Legacy dual-rate Other 1 helpers retained for older claims.
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
  if (b === 'other_1') return 'other_1';
  if (b === 'support' || b === 'support_activity') return 'support';
  if (b === 'supervision_note' || b === 'supervision_note_time') return 'supervision_note';
  return 'indirect';
}

export function categoryGroupFromPayBucket(payBucket) {
  const b = normalizePayBucket(payBucket);
  if (b === 'support' || b === 'other_1') return 'support_activity';
  if (b === 'supervision_note') return 'supervision_note';
  return 'indirect_service';
}

export function serviceCodeForCategoryGroup(categoryGroup) {
  const g = String(categoryGroup || '').trim().toLowerCase();
  if (g === 'support_activity') return 'MEETING';
  if (g === 'supervision_note') return 'Admin Time';
  return null;
}

export function categoryGroupLabel(categoryGroup) {
  const g = String(categoryGroup || '').trim().toLowerCase();
  if (g === 'support_activity') return 'Support Activity';
  if (g === 'supervision_note') return 'Supervision Note Time';
  if (g === 'indirect_service') return 'Indirect Service';
  return 'Indirect Service';
}
