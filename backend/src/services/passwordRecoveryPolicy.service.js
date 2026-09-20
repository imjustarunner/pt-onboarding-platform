import User from '../models/User.model.js';

const excludedRoles = new Set(['school_staff', 'client_guardian', 'client', 'guardian', 'kiosk']);
const enabled = (value) => value === true || value === 1 || value === '1';

export function passwordRecoverySsoState(user, organizations) {
  const role = String(user?.role || '').trim().toLowerCase();
  const aliases = ['provider_plus', 'clinical_practice_assistant'].includes(role)
    ? ['provider_plus', 'clinical_practice_assistant'] : [role];
  let ssoEnabled = false;
  let ssoPolicyRequired = false;
  for (const org of organizations || []) {
    const flags = typeof org.feature_flags === 'string'
      ? JSON.parse(org.feature_flags || '{}') : (org.feature_flags || {});
    if (flags.googleSsoEnabled !== true) continue;
    ssoEnabled = true;
    const roles = (flags.googleSsoRequiredRoles || []).map((r) => String(r).trim().toLowerCase());
    if (!excludedRoles.has(role) && aliases.some((r) => roles.includes(r))) ssoPolicyRequired = true;
  }
  const ssoPasswordOverride = enabled(user?.sso_password_override);
  return { ssoEnabled, ssoPolicyRequired, ssoPasswordOverride, ssoRequired: ssoPolicyRequired && !ssoPasswordOverride };
}

// Let lookup errors propagate: recovery must not bypass an unavailable SSO policy.
export async function getPasswordRecoverySsoState(user) {
  return passwordRecoverySsoState(user, await User.getAgencies(user.id, { includeInactive: true }));
}

export function passwordResetRequiresSignIn(user) {
  return enabled(user?.is_archived) || enabled(user?.pending_access_locked) ||
    ['ARCHIVED', 'INACTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED', 'TERMINATED_PENDING'].includes(String(user?.status || '').toUpperCase());
}
