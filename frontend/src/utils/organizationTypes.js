/**
 * Tenant vs nested organization helpers.
 * Full app tenants own My Dashboard / nav / theme.
 * Nested orgs are portal/affiliation surfaces under a parent tenant.
 */
import { isBookClubAgency } from './bookClubAgency.js';

const TENANT_ORG_TYPES = new Set(['agency', 'life_coach', 'consultant']);
const NESTED_ORG_TYPES = new Set([
  'school',
  'program',
  'learning',
  'clinical',
  'affiliation',
  'clubwebapp'
]);

export function normalizeOrganizationType(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function getOrganizationType(orgOrType) {
  if (orgOrType && typeof orgOrType === 'object') {
    return normalizeOrganizationType(orgOrType.organization_type || orgOrType.organizationType || 'agency');
  }
  return normalizeOrganizationType(orgOrType || 'agency');
}

/** Full tenants: agency, life_coach, consultant (empty/legacy treated as agency). */
export function isTenantOrganizationType(orgOrType) {
  const t = getOrganizationType(orgOrType);
  if (!t) return true;
  return TENANT_ORG_TYPES.has(t);
}

export function isNestedOrganizationType(orgOrType) {
  const t = getOrganizationType(orgOrType);
  return NESTED_ORG_TYPES.has(t);
}

export function getOrgSlug(org) {
  const slug = String(org?.slug || org?.portal_url || org?.portalUrl || '').trim();
  return slug || null;
}

export function nestedOrganizationTypeLabel(org) {
  if (isBookClubAgency(org)) return 'Book Club';
  const t = getOrganizationType(org);
  if (t === 'school') return 'School';
  if (t === 'program') return 'Program';
  if (t === 'learning') return 'Learning';
  if (t === 'clinical') return 'Clinical';
  if (t === 'affiliation' || t === 'clubwebapp') return 'Club';
  if (t) return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  return 'Organization';
}

/** Orgs that should appear as Portals bubbles / Affiliations links. */
export function isPortalBubbleOrg(org) {
  if (!org || typeof org !== 'object') return false;
  if (!getOrgSlug(org) && !isBookClubAgency(org)) return false;
  if (isBookClubAgency(org)) return true;
  return isNestedOrganizationType(org);
}

export function getParentAgencyFromOrg(org, agencyList = []) {
  if (!org || typeof org !== 'object') return null;
  const list = Array.isArray(agencyList) ? agencyList : [];
  const parentId = Number(org.affiliated_agency_id || org.affiliatedAgencyId || 0);
  if (parentId > 0) {
    const byId = list.find((a) => Number(a?.id || 0) === parentId);
    if (byId) return byId;
  }
  const parentSlug = String(org.parent_slug || org.parentSlug || '')
    .trim()
    .toLowerCase();
  if (parentSlug) {
    const bySlug = list.find((a) => {
      const s = String(a?.slug || a?.portal_url || a?.portalUrl || '')
        .trim()
        .toLowerCase();
      return s === parentSlug && isTenantOrganizationType(a);
    });
    if (bySlug) return bySlug;
  }
  return null;
}

/**
 * Resolve navigation for a nested org without promoting it to currentAgency
 * (except SSTC clubs, which still use summit chrome via my_club_dashboard).
 */
export function resolveNestedOrgNavigation(org, agencyList = []) {
  const parent = getParentAgencyFromOrg(org, agencyList);
  const nestedSlug = getOrgSlug(org);
  const parentSlug =
    getOrgSlug(parent) || String(org?.parent_slug || org?.parentSlug || '').trim() || null;

  if (isBookClubAgency(org)) {
    const path = parentSlug ? `/${parentSlug}/bookclub` : nestedSlug ? `/${nestedSlug}/bookclub` : '/bookclub';
    return {
      parent,
      path,
      setCurrentAgencyToParent: true,
      setCurrentAgencyToNested: false
    };
  }

  const t = getOrganizationType(org);
  if (t === 'affiliation' || t === 'clubwebapp') {
    // SSTC / summit clubs use parent-scoped my_club_dashboard and hydrate the club.
    const path = parentSlug
      ? `/${parentSlug}/my_club_dashboard`
      : nestedSlug
        ? `/${nestedSlug}/dashboard`
        : '/dashboard';
    return {
      parent,
      path,
      setCurrentAgencyToParent: false,
      setCurrentAgencyToNested: true
    };
  }

  // Clinical nested orgs have no dedicated portal shell — open under parent tenant.
  if (t === 'clinical') {
    const path = parentSlug ? `/${parentSlug}/dashboard` : nestedSlug ? `/${nestedSlug}/dashboard` : '/dashboard';
    return {
      parent,
      path,
      setCurrentAgencyToParent: true,
      setCurrentAgencyToNested: false
    };
  }

  // school / program / learning portals
  const path = nestedSlug ? `/${nestedSlug}/dashboard` : parentSlug ? `/${parentSlug}/dashboard` : '/dashboard';
  return {
    parent,
    path,
    setCurrentAgencyToParent: true,
    setCurrentAgencyToNested: false
  };
}

export function listNestedPortalOrgs(agencyList = []) {
  const list = Array.isArray(agencyList) ? agencyList : [];
  return list
    .filter((org) => isPortalBubbleOrg(org))
    .slice()
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
}
