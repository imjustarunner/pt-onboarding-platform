/** Roles that use Forgot Password on external portals (not agency Workspace SSO). */
export const NON_AGENCY_RECOVERY_ROLES = new Set([
  'school_staff',
  'client_guardian',
  'guardian',
  'client'
]);

/** Roles that become fully active when they set a password (not employee pre-hire). */
export const EXTERNAL_PORTAL_PASSWORD_ROLES = new Set([
  'school_staff',
  'client_guardian',
  'guardian'
]);

/**
 * True when the account has never had a lasting password, or only an expired temporary password.
 * Used to word Forgot Password emails as "set" vs "reset".
 */
export function userNeedsFirstPasswordSet(user, nowMs = Date.now()) {
  if (!user?.password_hash) return true;
  if (!user?.temporary_password_hash || !user?.temporary_password_expires_at) return false;
  const expiresAt = new Date(user.temporary_password_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < nowMs;
}

/**
 * Status to apply after school staff / guardian sets a password for the first time.
 */
export function statusAfterExternalPortalPasswordSet(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  if (!EXTERNAL_PORTAL_PASSWORD_ROLES.has(role)) return null;
  const status = String(user?.status || '').trim().toUpperCase();
  if (status !== 'PENDING_SETUP' && status !== 'PREHIRE_OPEN') return null;
  return 'ACTIVE_EMPLOYEE';
}

/**
 * Whether a passwordless token purpose is valid for the Forgot Password / reset endpoint.
 * Missing purpose (older DBs) is allowed; explicit 'setup' is not.
 */
export function isPasswordResetTokenPurpose(purpose) {
  if (purpose == null || purpose === '') return true;
  return String(purpose).trim().toLowerCase() === 'reset';
}
