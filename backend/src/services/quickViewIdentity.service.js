import { getPasswordRecoverySsoState } from './passwordRecoveryPolicy.service.js';

// Claims come from verified middleware, never from request body/query hints.
// Google accounts can retain an old or pre-provisioned password hash.
export async function quickViewRequiresPassword(user, claims = {}) {
  if (!user?.password_hash) return false;
  if ((claims.authMethod || claims.loginMethod) === 'google') return false;
  const policy = await getPasswordRecoverySsoState(user);
  return !policy.ssoRequired;
}
