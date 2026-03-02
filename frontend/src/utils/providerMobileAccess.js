export const PROVIDER_MOBILE_ALLOWED_ROLES = [
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant',
  'admin',
  'super_admin',
  'support'
];

export const hasProviderMobileAccess = (user) => {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (PROVIDER_MOBILE_ALLOWED_ROLES.includes(role)) return true;
  return user.has_provider_access === true || user.has_provider_access === 1 || user.has_provider_access === '1';
};
