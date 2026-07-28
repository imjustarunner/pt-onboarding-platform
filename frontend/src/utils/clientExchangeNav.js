export const CLIENT_EXCHANGE_ROLES = [
  'admin',
  'support',
  'staff',
  'super_admin',
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant',
  'supervisor'
];

export function canSeeClientExchangeNav(role) {
  return CLIENT_EXCHANGE_ROLES.includes(String(role || '').toLowerCase());
}

export function clientExchangePath(orgSlug) {
  const slug = String(orgSlug || '').trim();
  return slug ? `/${slug}/client-exchange` : '/client-exchange';
}
