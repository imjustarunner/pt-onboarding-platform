import User from '../models/User.model.js';
import { passwordRecoverySsoState } from './passwordRecoveryPolicy.service.js';
import { usesPasswordLogin } from '../utils/passwordLogin.js';

// Use the account's persisted sign-in policy, including password overrides and
// managed group addresses. A Google-looking email alone is not an SSO account.
export async function usesGoogleSchedule(user) {
  if (!user?.id || usesPasswordLogin(user)) return false;
  return passwordRecoverySsoState(user, await User.getAgencies(user.id)).ssoRequired === true;
}

export async function googleScheduleAllowedForEmail(email) {
  const user = await User.findByEmail(String(email || '').trim().toLowerCase());
  return usesGoogleSchedule(user);
}

export const GOOGLE_SCHEDULE_DISABLED = Object.freeze({
  ok: false,
  skipped: true,
  reason: 'non_sso_calendar_subscription',
  busy: [],
  events: []
});
