import User from '../models/User.model.js';
import { passwordRecoverySsoState } from './passwordRecoveryPolicy.service.js';
import { usesPasswordLogin } from '../utils/passwordLogin.js';
import { passkeyRoleAllowed } from '../utils/passkeyPolicy.js';

const retainedRoles = new Set(['admin', 'agency_admin', 'super_admin', 'support', 'supervisor', 'clinical_practice_assistant', 'provider_plus', 'internship_mentor']);
const enabled = value => [true, 1, '1'].includes(value);
const flagsFor = org => typeof org?.feature_flags === 'string' ? JSON.parse(org.feature_flags || '{}') : (org?.feature_flags || {});

// Presentation policy only: this never changes login permissions or a migration date.
export function providerUpdateSignIn(user, organizations, agencyId) {
  const role = String(user.role || '').toLowerCase();
  const agency = organizations.find(org => Number(org.id) === Number(agencyId));
  const flags = flagsFor(agency);
  const override = flags.providerUpdateGoogleRetentionOverrides?.[String(user.id)];
  const retainedByRole = retainedRoles.has(role) || enabled(user.has_supervisor_privileges)
    || /\b(?:internship|student training) mentor\b/i.test(`${user.title || ''} ${agency?.agency_position || ''}`);
  const retainsGoogle = typeof override === 'boolean' ? override : retainedByRole;
  const policy = passwordRecoverySsoState(user, organizations);
  const usesGoogle = policy.ssoRequired || (policy.ssoEnabled && retainsGoogle && !usesPasswordLogin(user));
  return {
    method: usesGoogle ? 'google' : 'password',
    retainsGoogle: policy.ssoEnabled && retainsGoogle,
    transitionPlanned: usesGoogle && !retainsGoogle,
    showCredentialSetup: !(policy.ssoEnabled && retainsGoogle),
    passkeyEligible: !(policy.ssoEnabled && retainsGoogle) && passkeyRoleAllowed(user)
  };
}

export async function getProviderUpdateSignIn(userId, agencyId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('Provider account not found');
  return providerUpdateSignIn(user, await User.getAgencies(userId), agencyId);
}
