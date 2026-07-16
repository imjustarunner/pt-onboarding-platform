import { getCurrentPortalSlugFromHostCache } from './loginRedirect.js';
import { getPortalUrl } from './subdomain.js';

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function cachePortalSlugForHost(portalSlug) {
  const resolved = norm(portalSlug);
  if (!resolved || typeof window === 'undefined') return;
  try {
    const cacheKey = `__pt_portal_host__:${window.location.hostname}`;
    const payload = JSON.stringify({ portalUrl: resolved, ts: Date.now() });
    sessionStorage.setItem(cacheKey, payload);
    localStorage.setItem(cacheKey, payload);
  } catch {
    /* ignore */
  }
}

/**
 * Best-effort portal slug from app.{portal}.{tld} custom domains (e.g. app.ltsco.health → ltsco).
 */
export function guessPortalSlugFromHostname(hostname = null) {
  const h = norm(hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).replace(/:\d+$/, '');
  if (!h || h === 'localhost' || h === '127.0.0.1') return '';
  const parts = h.split('.').filter(Boolean);
  if (parts.length === 3 && parts[0] === 'app' && parts[1] && parts[1] !== 'www') {
    return parts[1];
  }
  return '';
}

/**
 * Portal slug for API calls and storage keys when the route may omit :organizationSlug
 * (e.g. flat /kiosk on app.{agency}.health).
 */
export function resolvePortalSlug(routeParams = {}, hostImpliedAgencySlug = null) {
  const fromRoute = norm(routeParams?.organizationSlug);
  if (fromRoute) return fromRoute;

  const fromHost = norm(hostImpliedAgencySlug);
  if (fromHost) return fromHost;

  const fromCache = norm(getCurrentPortalSlugFromHostCache());
  if (fromCache) return fromCache;

  const fromSubdomain = norm(getPortalUrl());
  if (fromSubdomain) return fromSubdomain;

  return guessPortalSlugFromHostname();
}

/**
 * Resolve portal slug for kiosk/public flows, including async host lookup when sync sources fail.
 */
export async function ensurePortalSlugResolved(routeParams = {}, brandingStore = null) {
  let slug = resolvePortalSlug(routeParams, brandingStore?.portalHostPortalUrl);
  if (slug) return slug;

  if (brandingStore?.initializePortalTheme) {
    try {
      await brandingStore.initializePortalTheme();
    } catch {
      /* ignore */
    }
    slug = resolvePortalSlug(routeParams, brandingStore?.portalHostPortalUrl);
    if (slug) return slug;
  }

  if (typeof window !== 'undefined') {
    try {
      const api = (await import('../services/api.js')).default;
      const resp = await api.get('/agencies/resolve', {
        params: { host: window.location.hostname },
        skipGlobalLoading: true,
        skipAuthRedirect: true,
        timeout: 15000
      });
      slug = norm(resp.data?.portalUrl || resp.data?.slug);
      if (slug) {
        if (brandingStore) brandingStore.portalHostPortalUrl = slug;
        cachePortalSlugForHost(slug);
        return slug;
      }
    } catch {
      /* ignore */
    }
  }

  slug = guessPortalSlugFromHostname();
  if (slug) {
    if (brandingStore) brandingStore.portalHostPortalUrl = slug;
    cachePortalSlugForHost(slug);
  }
  return slug;
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

export function buildSchoolEventsKioskPath(portalSlug, parentOrgSlug = null, hostImpliedAgencySlug = null) {
  return buildOrgScopedPath(portalSlug, '/school-events/kiosk', parentOrgSlug, hostImpliedAgencySlug);
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
