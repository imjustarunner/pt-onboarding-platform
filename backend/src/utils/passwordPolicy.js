/**
 * Password expiry policy.
 *
 * Roles subject to the 120-day credential rotation:
 *   Password-based users only (including school_staff and SSO-override accounts).
 *
 * Pure Google SSO users (agency requires Workspace sign-in and admin has NOT
 * enabled sso_password_override) never rotate an app password — leftover
 * password_hash rows must not trap them on /change-password.
 */

const PASSWORD_POLICY_DAYS = 120;
const EXPIRY_WARNING_DAYS = 14;

const EMPTY_POLICY = {
  requiresPasswordChange: false,
  passwordExpiresAt: null,
  passwordExpired: false,
  passwordExpiresSoon: false,
  passwordExpiresInDays: null,
  passwordPolicyDays: null
};

export function isTemporaryPasswordActive(u) {
  if (!u?.temporary_password_hash) return false;
  if (!u?.temporary_password_expires_at) return true;
  const expiresAt = new Date(u.temporary_password_expires_at);
  if (Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() > Date.now();
}

/**
 * @param {object} u
 * @param {{ ssoRequired?: boolean }} [opts]
 *   When ssoRequired is true (Workspace SSO enforced, no password override),
 *   never require a password change — the user authenticates via Google only.
 */
export function calcPasswordExpiry(u, { ssoRequired = false } = {}) {
  if (ssoRequired) {
    return { ...EMPTY_POLICY };
  }

  // SSO / passwordless-only users have no system-managed password to expire.
  if (!u?.password_hash) {
    return { ...EMPTY_POLICY };
  }

  const changedAt = u?.password_changed_at
    ? new Date(u.password_changed_at)
    : u?.created_at
      ? new Date(u.created_at)
      : null;

  if (!changedAt || Number.isNaN(changedAt.getTime())) {
    return {
      requiresPasswordChange: false,
      passwordExpiresAt: null,
      passwordExpired: false,
      passwordExpiresSoon: false,
      passwordExpiresInDays: null,
      passwordPolicyDays: PASSWORD_POLICY_DAYS
    };
  }

  const expiresAt = new Date(changedAt.getTime());
  expiresAt.setDate(expiresAt.getDate() + PASSWORD_POLICY_DAYS);

  const now = Date.now();
  const msUntilExpiry = expiresAt.getTime() - now;
  const daysUntilExpiry = Math.ceil(msUntilExpiry / (1000 * 60 * 60 * 24));

  const expired = msUntilExpiry <= 0;
  const expiresSoon = !expired && daysUntilExpiry <= EXPIRY_WARNING_DAYS;

  return {
    requiresPasswordChange: expired,
    passwordExpiresAt: expiresAt.toISOString(),
    passwordExpired: expired,
    passwordExpiresSoon: expiresSoon,
    passwordExpiresInDays: expired ? 0 : daysUntilExpiry,
    passwordPolicyDays: PASSWORD_POLICY_DAYS
  };
}

/**
 * Effective "must change password" for auth payloads.
 * SSO-required users never get forced into password change (expiry or temp).
 */
export function resolveRequiresPasswordChange(u, { ssoRequired = false } = {}) {
  if (ssoRequired) {
    return {
      ...EMPTY_POLICY,
      requiresPasswordChange: false
    };
  }
  const pw = calcPasswordExpiry(u, { ssoRequired: false });
  const tempActive = isTemporaryPasswordActive(u);
  return {
    ...pw,
    requiresPasswordChange: pw.requiresPasswordChange || tempActive
  };
}
