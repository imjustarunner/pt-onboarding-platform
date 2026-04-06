/**
 * Password expiry policy.
 *
 * Roles subject to the 120-day financial-data / payments-API expiry:
 *   All roles EXCEPT school_staff.
 *
 * school_staff accounts are school-portal-only users who do not have access
 * to billing, payments, or financial data, so the credential-rotation
 * requirement does not apply to them. Their passwords do not expire.
 */

const PASSWORD_POLICY_DAYS = 120;
const EXPIRY_WARNING_DAYS  = 14;

// Roles explicitly exempt from password expiry.
const EXPIRY_EXEMPT_ROLES = new Set(['school_staff']);

export function calcPasswordExpiry(u) {
  const role = String(u?.role || '').toLowerCase();

  // Exempt roles: no expiry at all.
  if (EXPIRY_EXEMPT_ROLES.has(role)) {
    return {
      requiresPasswordChange: false,
      passwordExpiresAt: null,
      passwordExpired: false,
      passwordExpiresSoon: false,
      passwordExpiresInDays: null,
      passwordPolicyDays: null
    };
  }

  // SSO / passwordless-only users have no system-managed password to expire.
  // Forcing them to a change-password screen would leave them stuck with no action to take.
  if (!u?.password_hash) {
    return {
      requiresPasswordChange: false,
      passwordExpiresAt: null,
      passwordExpired: false,
      passwordExpiresSoon: false,
      passwordExpiresInDays: null,
      passwordPolicyDays: null
    };
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
  const msUntilExpiry  = expiresAt.getTime() - now;
  const daysUntilExpiry = Math.ceil(msUntilExpiry / (1000 * 60 * 60 * 24));

  const expired     = msUntilExpiry <= 0;
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
