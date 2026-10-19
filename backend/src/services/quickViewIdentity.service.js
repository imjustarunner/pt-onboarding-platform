import { getPasswordRecoverySsoState } from './passwordRecoveryPolicy.service.js';

export function assertQuickViewAccountMatch(req) {
  if (req.user.switchedFromUserId) throw Object.assign(new Error('Return to your own account to change Quick View credentials.'), { status: 403 });
  if (req.body?.expectedUserId != null && Number(req.body.expectedUserId) !== Number(req.user.id)) {
    throw Object.assign(new Error('Sign in to the account named on this Provider Update before resetting its code.'), { status: 403 });
  }
}

// Claims come from verified middleware, never from request body/query hints.
// Google accounts can retain an old or pre-provisioned password hash.
export async function quickViewRequiresPassword(user, claims = {}) {
  if (!user?.password_hash) return false;
  if ((claims.authMethod || claims.loginMethod) === 'google') return false;
  const policy = await getPasswordRecoverySsoState(user);
  return !policy.ssoRequired;
}
