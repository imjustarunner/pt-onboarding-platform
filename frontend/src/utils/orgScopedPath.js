import { getCurrentPortalSlugFromHostCache } from './loginRedirect.js';
import { getPortalUrl } from './subdomain.js';

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

const PATH_SEGMENT_RESERVED = new Set([
  'login', 'admin', 'dashboard', 'logout', 'schools', 'kiosk',
  'passwordless-login', 'reset-password', 'change-password', 'intake',
  'join', 'office-intake', 'i', 'preferences-form', 'careers', 'public',
  'registration-receipt', 'counseling', 'tutoring', 'coaching', 'consulting'
]);

/**
 * Portal slug from the current path. `/join/itsco/counseling` must resolve to
 * `itsco`, not `join` — otherwise tenant pickers snap to the first alphabetized
 * agency (Burning Sage).
 */
export function resolvePortalSlugFromPath(pathname = '') {
  const parts = String(pathname || '').split('/').filter(Boolean).map((p) => norm(p));
  if (!parts.length) return '';
  const first = parts[0];
  if (first === 'join' || first === 'office-intake') {
    const second = parts[1] || '';
    if (second && !PATH_SEGMENT_RESERVED.has(second)) return second;
    return '';
  }
  if (PATH_SEGMENT_RESERVED.has(first)) return '';
  return first;
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
  // qv.{portal}.app.{base}
  if (parts.length >= 5 && parts[0] === 'qv' && parts[2] === 'app') {
    return parts[1] || '';
  }
  // qv.app.{tenant}.{tld} → resolve via API; no slug here
  if (parts.length === 3 && parts[0] === 'app' && parts[1] && parts[1] !== 'www') {
    return parts[1];
  }
  return '';
}

/**
 * Host-implied agency portal slug (app.itsco.health → itsco), without route params.
 * Mirrors router resolveHostPortalSlug for login redirects on dedicated app hosts.
 */
export function resolveHostImpliedPortalSlug(brandingStore = null) {
  const fromStore = norm(brandingStore?.portalHostPortalUrl);
  if (fromStore) return fromStore;
  const fromCache = norm(getCurrentPortalSlugFromHostCache());
  if (fromCache) return fromCache;
  return guessPortalSlugFromHostname();
}

/**
 * Hub switcher / org-scoped prefix. Dedicated app hosts (app.itsco.health) stay
 * flat so Workforce Ops does not jump to another tenant's slug path.
 */
export function hubPathPrefix({ routeSlug = '', agency = null, branding = null } = {}) {
  const route = norm(routeSlug);
  const host = resolveHostImpliedPortalSlug(branding);
  if (host && (!route || route === host)) return '';
  if (route) return `/${route}`;
  const agencySlug = norm(agency?.slug || agency?.portal_url);
  if (agencySlug && agencySlug !== host) return `/${agencySlug}`;
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

export function buildSchoolReferralFinderPath(portalSlug, hostImpliedAgencySlug = null) {
  return buildOrgScopedPath(portalSlug, '/school-referral', null, hostImpliedAgencySlug);
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
