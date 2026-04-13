import { isSummitPlatformRouteSlug } from './summitPlatformSlugs.js';

export function isSummitScopedOrg(org) {
  const slug = String(org?.slug || org?.portal_url || org?.portalUrl || '').trim().toLowerCase();
  const parent = String(org?.parent_slug || org?.parentSlug || '').trim().toLowerCase();
  const orgType = String(org?.organization_type || org?.organizationType || '').trim().toLowerCase();
  return (
    isSummitPlatformRouteSlug(slug) ||
    isSummitPlatformRouteSlug(parent) ||
    (orgType === 'affiliation' && isSummitPlatformRouteSlug(parent))
  );
}

/**
 * Resolve Summit platform URL segment (e.g. sstc) from org context, current agency, or memberships.
 */
export function resolveSummitStatsSlug({ organizationContext, currentAgency, orgs }) {
  const ctx = organizationContext || null;
  const contextSlug = String(ctx?.slug || '').trim().toLowerCase();
  const contextParent = String(ctx?.parentSlug || ctx?.parent_slug || '').trim().toLowerCase();
  if (isSummitPlatformRouteSlug(contextSlug)) return contextSlug;
  if (isSummitPlatformRouteSlug(contextParent)) return contextParent;

  const cur = currentAgency || null;
  const currentSlug = String(cur?.slug || cur?.portal_url || cur?.portalUrl || '').trim().toLowerCase();
  const currentParent = String(cur?.parent_slug || cur?.parentSlug || '').trim().toLowerCase();
  if (isSummitPlatformRouteSlug(currentSlug)) return currentSlug;
  if (isSummitPlatformRouteSlug(currentParent)) return currentParent;

  const list = Array.isArray(orgs) ? orgs : [];
  for (const org of list) {
    const slug = String(org?.slug || org?.portal_url || org?.portalUrl || '').trim().toLowerCase();
    const parent = String(org?.parent_slug || org?.parentSlug || '').trim().toLowerCase();
    const orgType = String(org?.organization_type || org?.organizationType || '').trim().toLowerCase();
    if (isSummitPlatformRouteSlug(slug)) return slug;
    if (isSummitPlatformRouteSlug(parent)) return parent;
    if (orgType === 'affiliation' && parent) return parent;
  }
  return null;
}

export function isDualHomedSummitUser({ summitSlug, orgs }) {
  if (!summitSlug || !Array.isArray(orgs) || orgs.length < 2) return false;
  const hasNonSummit = orgs.some((o) => !isSummitScopedOrg(o));
  const hasSummit = orgs.some((o) => isSummitScopedOrg(o));
  return hasNonSummit && hasSummit;
}
