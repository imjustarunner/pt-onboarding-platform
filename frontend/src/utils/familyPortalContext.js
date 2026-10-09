const slugOf = org => String(org?.portal_url || org?.slug || org?.portalUrl || '').trim().toLowerCase();
const typeOf = org => String(org?.organization_type || org?.organizationType || '').toLowerCase();

// URL context can select an existing membership, never grant a new one.
export function resolveFamilyPortalOrganization(organizations, requestedSlug) {
  const list = Array.isArray(organizations) ? organizations : [];
  const requested = String(requestedSlug || '').trim().toLowerCase();
  const match = requested ? list.find(org => slugOf(org) === requested) : null;
  if (match && ['agency', 'learning', 'life_coach', 'consultant', ''].includes(typeOf(match))) return match;
  return null;
}

export function familyPortalDashboardPath(organization) {
  const slug = slugOf(organization);
  if (!slug) return null;
  const panel = ['life_coach', 'consultant'].includes(typeOf(organization)) ? 'client-dashboard' : 'guardian';
  return `/${encodeURIComponent(slug)}/${panel}?portal=${encodeURIComponent(slug)}`;
}

export function familyPortalClients(clients, organization) {
  const list = Array.isArray(clients) ? clients : [];
  const id = Number(organization?.id || 0);
  if (!id) return list;
  const childOrganization = ['school', 'program', 'learning', 'clinical'].includes(typeOf(organization));
  return list.filter(client => Number(childOrganization ? client.organization_id : client.agency_id) === id);
}
