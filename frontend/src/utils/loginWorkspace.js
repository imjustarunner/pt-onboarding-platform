const slugOf = org => String(org?.slug || org?.portal_url || org?.portalUrl || '').trim().toLowerCase();
const typeOf = org => String(org?.organization_type || org?.organizationType || '').toLowerCase();
const portalTypes = new Set(['school', 'program', 'learning']);

// Call only after authentication, with the membership list returned for this
// account. The page's requested tenant is a preference, never a membership.
export function authenticatedLoginOrganization({ agencies, role, requestedSlug, currentAgency }) {
  const list = Array.isArray(agencies) ? agencies.filter(Boolean) : [];
  if (!list.length || ['super_admin', 'superadmin'].includes(String(role || '').toLowerCase())) return null;
  const schoolStaff = String(role || '').toLowerCase() === 'school_staff';
  const candidates = schoolStaff ? list.filter(org => portalTypes.has(typeOf(org))) : list;
  const eligible = candidates.length ? candidates : list;
  const requested = String(requestedSlug || '').trim().toLowerCase();
  return eligible.find(org => requested && slugOf(org) === requested)
    || eligible.find(org => Number(org.id) > 0 && Number(org.id) === Number(currentAgency?.id))
    || eligible.find(org => org.is_default === true || Number(org.is_default) === 1)
    || eligible.find(org => ['agency', 'life_coach', 'consultant'].includes(typeOf(org)))
    || eligible[0];
}
