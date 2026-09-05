/**
 * Secure messaging eligibility: active clinical/school clients (and their guardians).
 * Pre-active intake / everyone else uses normal email.
 */

const ACTIVE_STATUS_KEYS = new Set([
  'active',
  'being_seen',
  'current',
  'scheduled',
  'onboarded',
  'in_process'
]);

const NON_ACTIVE_STATUS_KEYS = new Set([
  'waitlist',
  'received',
  'intake',
  'pending',
  'confirmation_pending',
  'spring_update_pending',
  'terminated',
  'archived',
  'not_returning',
  'unable_to_reach',
  'recommend_termination',
  'continuation_unknown',
  'returning',
  'needs_day_assignment',
  'ready_to_schedule',
  'confirmed_returning',
  'other_transfer'
]);

/** Client is actively in care — secure messages are appropriate. */
export function isActiveClientStatusKey(statusKey) {
  const k = String(statusKey || '')
    .trim()
    .toLowerCase();
  if (!k) return false;
  if (NON_ACTIVE_STATUS_KEYS.has(k)) return false;
  if (ACTIVE_STATUS_KEYS.has(k)) return true;
  // Unknown keys: do not assume active (prefer normal email)
  return false;
}

export function isSecureMessageClientType(clientType) {
  const t = String(clientType || '')
    .trim()
    .toLowerCase();
  return t === 'clinical' || t === 'school';
}

/**
 * Provider→client secure notify / hub Secure default.
 * Requires active status + clinical/school type.
 */
export function shouldDefaultToSecureMessage({
  clientStatusKey = null,
  clientType = null,
  isClientOrGuardian = false
} = {}) {
  if (!isClientOrGuardian) return false;
  if (!isSecureMessageClientType(clientType)) return false;
  return isActiveClientStatusKey(clientStatusKey);
}
