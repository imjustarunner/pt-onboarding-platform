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

/** Service-type pay bucket / Log Time category group. */
export function normalizePayBucket(raw) {
  const b = String(raw || '').trim().toLowerCase();
  if (b === 'other_1') return 'other_1';
  if (b === 'support' || b === 'support_activity') return 'support';
  if (b === 'supervision_note' || b === 'supervision_note_time') return 'supervision_note';
  return 'indirect';
}

/** Map service-type pay_bucket → claim categoryGroup + pay serviceCode. */
export function categoryGroupFromPayBucket(payBucket) {
  const b = normalizePayBucket(payBucket);
  if (b === 'support') return 'support_activity';
  if (b === 'supervision_note') return 'supervision_note';
  if (b === 'other_1') return 'support_activity'; // legacy Other 1 → support semantics
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

export function normalizeTimeClaimBucket(raw) {
  const b = String(raw || 'indirect').trim().toLowerCase();
  if (b === 'direct') return 'direct';
  // Legacy Other 1 claims retain other_1; new Support Activity uses indirect for PTO.
  if (b === 'other_1' || b === 'other_2' || b === 'other_3') return b;
  return 'indirect';
}
