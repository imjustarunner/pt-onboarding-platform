import { getCurrentPortalSlugFromHostCache } from './loginRedirect.js';

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Portal slug for API calls and storage keys when the route may omit :organizationSlug
 * (e.g. flat /kiosk on app.{agency}.health).
 */
export function resolvePortalSlug(routeParams = {}, hostImpliedAgencySlug = null) {
  const fromRoute = norm(routeParams?.organizationSlug);
  if (fromRoute) return fromRoute;
  return norm(hostImpliedAgencySlug ?? getCurrentPortalSlugFromHostCache());
}

/**
 * Build a public path that respects custom-domain flat URLs (mirrors buildOrgLoginPath).
 *
 * @param {string} portalSlug
 * @param {string} suffixPath — must start with / (e.g. /kiosk, /skill-builders/kiosk/12)
 * @param {string|null|undefined} parentOrgSlug
 * @param {string|null|undefined} hostImpliedAgencySlug
 */
export function buildOrgScopedPath(
  portalSlug,
  suffixPath,
  parentOrgSlug = null,
  hostImpliedAgencySlug = null
) {
  const o = norm(portalSlug);
  const suffix = String(suffixPath || '').startsWith('/') ? suffixPath : `/${suffixPath || ''}`;
  if (!o) return suffix || '/';
  const p = norm(parentOrgSlug);
  const h = norm(hostImpliedAgencySlug ?? getCurrentPortalSlugFromHostCache());

  // Dedicated app host for this agency (e.g. app.ltsco.health): /kiosk not /ltsco/kiosk.
  if (h && h === o && !p) {
    return suffix;
  }

  // Child portal on parent custom domain: /school/kiosk not /parent/school/kiosk.
  if (p && h && p === h) {
    return `/${o}${suffix}`;
  }

  if (p && p !== o) {
    return `/${p}/${o}${suffix}`;
  }

  return `/${o}${suffix}`;
}

export function buildEventKioskEntryPath(portalSlug, parentOrgSlug = null, hostImpliedAgencySlug = null) {
  return buildOrgScopedPath(portalSlug, '/kiosk', parentOrgSlug, hostImpliedAgencySlug);
}

export function buildEventKioskStationPath(
  portalSlug,
  { eventId, kind = 'skill_builders' },
  parentOrgSlug = null,
  hostImpliedAgencySlug = null
) {
  const id = encodeURIComponent(String(eventId || ''));
  const suffix =
    kind === 'program_event' ? `/program-event/kiosk/${id}` : `/skill-builders/kiosk/${id}`;
  return buildOrgScopedPath(portalSlug, suffix, parentOrgSlug, hostImpliedAgencySlug);
}
