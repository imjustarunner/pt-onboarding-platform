export function isHirePortalOnly(user) {
  if (user?.passwordless_token_purpose === 'reset') return false;
  return user?.passwordless_token_purpose === 'prehire_portal'
    || ['PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING'].includes(user?.status);
}

/** A prepared password is not approval to enter the employee app. */
export function requiresHireActivation(user) {
  const pending = ['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING'].includes(String(user?.status || '').toUpperCase());
  return pending && ([true, 1, '1'].includes(user?.login_is_group_email)
    || user?.passwordless_token_purpose === 'prehire_portal');
}

export const HIRE_ACTIVATION_MESSAGE = 'Your employee account is waiting for People Operations activation. Continue onboarding using your personal portal link. Setting a password does not activate app access.';
