/**
 * Book Club affiliations share organization_type=affiliation with SSTC clubs.
 * Prefer agencies.club_kind = 'book_club'; fall back to slug/name heuristics.
 */
export function isBookClubAgency(agency) {
  if (!agency || typeof agency !== 'object') return false;
  const kind = String(agency.club_kind || agency.clubKind || '')
    .trim()
    .toLowerCase();
  if (kind === 'book_club') return true;
  const slug = String(agency.slug || agency.portal_url || agency.portalUrl || '')
    .trim()
    .toLowerCase();
  if (slug.includes('book-club') || slug.includes('book_club') || slug === 'bookclub') {
    return true;
  }
  const name = String(agency.name || '').trim().toLowerCase();
  return name.includes('book club');
}

/** Parent tenant portal slug when org is a nested book-club affiliation. */
export function getBookClubParentSlug(org, agencyList = []) {
  if (!org || !isBookClubAgency(org)) return null;
  const direct = String(org.parent_slug || org.parentSlug || '').trim();
  if (direct) return direct;
  const list = Array.isArray(agencyList) ? agencyList : [];
  const parentId = Number(org.affiliated_agency_id || org.affiliatedAgencyId || 0);
  if (parentId > 0) {
    const byId = list.find((a) => Number(a?.id || 0) === parentId);
    const slug = String(byId?.slug || byId?.portal_url || byId?.portalUrl || '').trim();
    if (slug) return slug;
  }
  return null;
}

/** Work-tenant slug for routing — never a nested book-club affiliation slug. */
export function resolveWorkTenantSlug(org, agencyList = []) {
  if (!org) return null;
  const parentSlug = getBookClubParentSlug(org, agencyList);
  if (parentSlug) return parentSlug;
  return String(org.slug || org.portal_url || org.portalUrl || '').trim() || null;
}
