export function isHirePortalOnly(user) {
  if (user?.passwordless_token_purpose === 'reset') return false;
  return user?.passwordless_token_purpose === 'prehire_portal'
    || ['PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING'].includes(user?.status);
}
