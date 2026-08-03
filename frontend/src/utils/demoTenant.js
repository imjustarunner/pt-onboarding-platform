/**
 * Heuristics for sandbox / demo tenants (Demo ITSCO, demo tutors, etc.).
 * Used to avoid snapping real admins onto demo branding when they have production access.
 */
export function isLikelyDemoTenant(org) {
  const hay = [
    org?.name,
    org?.official_name,
    org?.officialName,
    org?.slug,
    org?.portal_url,
    org?.portalUrl
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return ['demo', 'fake', 'sandbox', 'training', 'sample', 'test'].some((k) => hay.includes(k));
}

export function pickOrgSlug(org) {
  return String(org?.portal_url || org?.portalUrl || org?.slug || '').trim();
}

function isWorkTenantOrg(org) {
  const t = String(org?.organization_type || org?.organizationType || '').toLowerCase();
  return !t || t === 'agency' || t === 'life_coach' || t === 'consultant';
}

/**
 * Prefer a production work tenant over demo/sandbox rows when the user has both.
 */
export function pickFirstNonDemoTenant(orgs, opts = {}) {
  const arr = Array.isArray(orgs) ? orgs.filter(Boolean) : [];
  if (!arr.length) return null;

  const preferredSlug = String(opts.preferredSlug || '').trim().toLowerCase();
  if (preferredSlug) {
    const preferred = arr.find((o) => pickOrgSlug(o).toLowerCase() === preferredSlug);
    if (preferred) return preferred;
  }

  const workTenants = arr.filter(isWorkTenantOrg);
  const nonDemo = workTenants.filter((o) => !isLikelyDemoTenant(o));
  if (nonDemo.length) return nonDemo[0];

  if (opts.allowDemo) return workTenants[0] || arr[0] || null;
  return workTenants[0] || arr[0] || null;
}

/**
 * Nav / default-slug helper: keep explicit route slug, otherwise avoid demo currentAgency
 * when the membership list includes a production tenant.
 */
export function resolvePreferredAgencySlug(agency, orgList, routeSlug = '') {
  const route = String(routeSlug || '').trim().toLowerCase();
  if (route) return route;

  const fromAgency = pickOrgSlug(agency);
  if (fromAgency && !isLikelyDemoTenant(agency)) return fromAgency;

  const preferred = pickFirstNonDemoTenant(orgList);
  const preferredSlug = preferred ? pickOrgSlug(preferred) : '';
  if (preferredSlug) return preferredSlug;

  return fromAgency || '';
}
