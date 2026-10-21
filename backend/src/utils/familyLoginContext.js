const familyRoles = new Set(['client', 'client_guardian', 'guardian']);
const slugOf = org => String(org?.portal_url || org?.portalUrl || org?.slug || '').trim().toLowerCase();
const typeOf = org => String(org?.organization_type || org?.organizationType || 'agency').toLowerCase();

export function portalSignInUsername(user) {
  return String(familyRoles.has(String(user?.role).toLowerCase())
    ? user?.email || user?.username || ''
    : user?.username || user?.email || '').trim();
}

// Only select an existing membership. A child's school is context inside their
// family profile; it is not a school-staff sign-in destination for the parent.
export function familyLoginOrganization(user, organizations, requestedSlug) {
  if (!familyRoles.has(String(user?.role).toLowerCase())) return null;
  const list = Array.isArray(organizations) ? organizations : [];
  const eligible = list.filter(org => ['agency', 'learning', 'life_coach', 'consultant', ''].includes(typeOf(org)));
  const requested = list.find(org => slugOf(org) === String(requestedSlug || '').toLowerCase());
  if (requested && eligible.includes(requested)) return requested;
  const parent = requested && eligible.find(org => Number(org.id) === Number(requested.affiliated_agency_id));
  return parent || eligible.find(org => typeOf(org) === 'agency') || eligible[0] || null;
}
