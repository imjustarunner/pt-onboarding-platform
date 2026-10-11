// Explicit configured slugs only; never infer a tenant from its display name.
export function handbookTenant(agency) {
  const slug = String(agency?.slug || '').toLowerCase();
  if (slug === 'itsco') return 'itsco';
  if (['nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up'].includes(slug)) return 'nlu';
  if (['tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'].includes(slug)) return 'isi';
  return null;
}
