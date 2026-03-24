import { buildOrgLoginPath } from './orgLoginPath';

function coalesceOrgs(user, userAgencies) {
  let orgs = userAgencies;
  if (!Array.isArray(orgs) || !orgs.length) orgs = user?.agencies;
  if (!Array.isArray(orgs) || !orgs.length) {
    try {
      const raw = localStorage.getItem('userAgencies');
      if (raw) orgs = JSON.parse(raw);
    } catch {
      orgs = [];
    }
  }
  return Array.isArray(orgs) ? orgs : [];
}

function portalSlugOf(o) {
  return String(o?.slug || o?.portal_url || o?.portalUrl || '').trim().toLowerCase();
}

function orgType(o) {
  return String(o?.organization_type || o?.organizationType || '').toLowerCase();
}

function isPortalChildType(t) {
  return t === 'school' || t === 'program' || t === 'learning';
}

/**
 * Login path from user + agencies (timeout / logout) — agency bucket for staff/admin, nested school path for school_staff.
 */
function resolveLoginPathFromUserAgencies(user, userAgencies, hostImplied) {
  if (!user) return null;
  const role = String(user.role || '').toLowerCase();
  if (role === 'super_admin') return '/login';

  const orgs = coalesceOrgs(user, userAgencies);
  if (orgs.length > 1) return '/login';

  if (orgs.length === 1) {
    const o = orgs[0];
    const t = orgType(o);
    const slug = portalSlugOf(o);
    const parent = String(o.parent_slug || o.parentSlug || '').trim().toLowerCase();

    if (role === 'school_staff') {
      if (!slug) return '/login';
      return buildOrgLoginPath(slug, parent || null, hostImplied);
    }

    if (isPortalChildType(t)) {
      if (parent) return hostImplied && parent === hostImplied ? '/login' : `/${parent}/login`;
      if (slug) return hostImplied && slug === hostImplied ? '/login' : `/${slug}/login`;
      return '/login';
    }

    if (!slug) return '/login';
    if (hostImplied && hostImplied === slug) return '/login';
    return `/${slug}/login`;
  }

  return null;
}

function resolveLoginPathFromStoredAgency(user, hostImplied) {
  try {
    const raw = localStorage.getItem('currentAgency');
    if (!raw) return null;
    const o = JSON.parse(raw);
    const role = String(user?.role || '').toLowerCase();
    const t = orgType(o);
    const slug = portalSlugOf(o);
    const parent = String(o.parent_slug || o.parentSlug || '').trim().toLowerCase();

    if (role === 'school_staff' && slug) {
      return buildOrgLoginPath(slug, parent || null, hostImplied);
    }
    if (role !== 'school_staff' && isPortalChildType(t) && parent) {
      return hostImplied && parent === hostImplied ? '/login' : `/${parent}/login`;
    }
    if (slug) {
      return hostImplied && slug === hostImplied ? '/login' : `/${slug}/login`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Utility to determine the appropriate login URL based on user's organization membership
 * 
 * Rules:
 * - Users with exactly 1 organization that has a slug → redirect to /{slug}/login
 * - Users with multiple organizations or no slug → redirect to /login (platform branding)
 * - Super admins → always use /login (platform branding)
 * - Supports both portal_url (legacy) and slug (new) for backward compatibility
 */

/** Path segments that are NOT organization slugs (first segment of path) */
const NON_SLUG_SEGMENTS = [
  'join',
  'login',
  'logout',
  'schools',
  'intake',
  'kiosk',
  'timeout',
  'public',
  'public-intake',
  'dashboard',
  'mydashboard',
  'admin',
  'buildings',
  'office',
  'schedule',
  'notifications',
  'tickets',
  'guardian',
  'tracks',
  'tasks',
  'preferences',
  'credentials',
  'change-password',
  'reset-password',
  'initial-setup',
  'passwordless-login',
  'onboarding',
  'on-demand-training',
  'account-info'
];

/**
 * Get the current portal slug from the URL path (e.g. /nlu/dashboard → 'nlu').
 * Use this for logout/timeout/401 redirects so users stay in the same branded portal.
 * @returns {string|null} The slug or null if path doesn't indicate a branded portal
 */
export function getCurrentPortalSlugFromPath() {
  if (typeof window === 'undefined' || !window.location?.pathname) return null;
  const parts = window.location.pathname.split('/').filter(Boolean);
  const first = parts[0];
  if (!first || NON_SLUG_SEGMENTS.includes(first.toLowerCase())) return null;
  return first;
}

/**
 * Best-effort portal slug from persisted current agency context.
 * Useful when route path is generic (/dashboard) but user is in a branded portal context.
 */
export function getCurrentPortalSlugFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('currentAgency');
    if (!raw) return null;
    const agency = JSON.parse(raw);
    const slug = String(agency?.portal_url || agency?.portalUrl || agency?.slug || '').trim();
    return slug || null;
  } catch {
    return null;
  }
}

/**
 * Best-effort portal slug resolved for the current host and cached in sessionStorage
 * by branding initialization.
 */
export function getCurrentPortalSlugFromHostCache() {
  if (typeof window === 'undefined') return null;
  try {
    const host = String(window.location?.hostname || '').trim();
    if (!host) return null;
    const cacheKey = `__pt_portal_host__:${host}`;
    let cachedRaw = sessionStorage.getItem(cacheKey);
    if (!cachedRaw) {
      cachedRaw = localStorage.getItem(cacheKey);
    }
    if (!cachedRaw) return null;
    const cached = JSON.parse(cachedRaw);
    const portal = String(cached?.portalUrl || '').trim();
    return portal || null;
  } catch {
    return null;
  }
}

/**
 * Get the appropriate login URL for a user
 * @param {Object} user - User object (may be null if logged out)
 * @param {Array} userAgencies - Array of user's organizations (may be from localStorage)
 * @returns {string} Login URL path
 */
export function getLoginUrl(user = null, userAgencies = null) {
  // Super admins always use platform login
  if (user?.role === 'super_admin') {
    return '/login';
  }

  // Try to get organizations from parameter, localStorage, or user object
  let organizations = userAgencies;
  
  if (!organizations) {
    // Try to get from localStorage (stored by agency store)
    try {
      const storedAgencies = localStorage.getItem('userAgencies');
      if (storedAgencies) {
        organizations = JSON.parse(storedAgencies);
      }
    } catch (e) {
      console.warn('Failed to parse stored agencies:', e);
    }
  }

  // If still no organizations and we have a user, try to get from user object
  if (!organizations && user?.agencies) {
    organizations = user.agencies;
  }

  // If no organizations found, use platform login
  if (!organizations || organizations.length === 0) {
    return '/login';
  }

  // If user has multiple organizations, use platform login
  if (organizations.length > 1) {
    return '/login';
  }

  // User has exactly 1 organization - check for slug or portal_url
  const org = organizations[0];

  const portalSegment = String(org?.slug || org?.portal_url || org?.portalUrl || '')
    .trim()
    .toLowerCase();
  if (!portalSegment) {
    return '/login';
  }

  const hostParent = String(getCurrentPortalSlugFromHostCache() || '')
    .trim()
    .toLowerCase();
  // Host already identifies the agency bucket — paths stay flat (no /itsco/ prefix on app.itsco.health).
  if (hostParent) {
    if (hostParent === portalSegment) {
      return '/login';
    }
    return `/${portalSegment}/login`;
  }

  const parentFromOrg = String(org?.parent_slug || org?.parentSlug || '')
    .trim()
    .toLowerCase();
  if (parentFromOrg && parentFromOrg !== portalSegment) {
    return buildOrgLoginPath(portalSegment, parentFromOrg, null);
  }

  return `/${portalSegment}/login`;
}

/**
 * Get login URL for redirects (logout, timeout, 401), preferring the current path's portal slug.
 * This preserves brand: e.g. /nlu/dashboard timeout → /nlu/login?timeout=true
 * @param {Object} user - User object (may be null)
 * @param {Array} userAgencies - User's organizations (may be from localStorage)
 * @param {Object} opts - Options: { timeout: true } to append ?timeout=true
 * @returns {string} Login URL path
 */
export function getLoginUrlForRedirect(user = null, userAgencies = null, opts = {}) {
  const hostImplied = String(getCurrentPortalSlugFromHostCache() || '').trim().toLowerCase() || null;
  const withTimeout = (base) => {
    if (!opts?.timeout) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}timeout=true`;
  };

  const pathSlug = getCurrentPortalSlugFromPath();
  if (pathSlug) {
    const role = String(user?.role || '').toLowerCase();
    const orgs = coalesceOrgs(user, userAgencies);
    if (user && role !== 'school_staff' && orgs.length) {
      const match = orgs.find((o) => portalSlugOf(o) === pathSlug.toLowerCase());
      const t = orgType(match);
      if (match && isPortalChildType(t)) {
        const parent = String(match.parent_slug || match.parentSlug || '').trim().toLowerCase();
        if (parent) {
          const base = hostImplied && parent === hostImplied ? '/login' : `/${parent}/login`;
          return withTimeout(base);
        }
      }
    }
    if (hostImplied && pathSlug.toLowerCase() === hostImplied) {
      return withTimeout('/login');
    }
    return withTimeout(`/${pathSlug}/login`);
  }

  if (hostImplied) {
    return withTimeout('/login');
  }

  let resolved = resolveLoginPathFromUserAgencies(user, userAgencies, hostImplied);
  if (resolved) return withTimeout(resolved);

  resolved = resolveLoginPathFromStoredAgency(user, hostImplied);
  if (resolved) return withTimeout(resolved);

  const storedSlug = getCurrentPortalSlugFromStorage();
  if (storedSlug) {
    return withTimeout(`/${String(storedSlug).trim()}/login`);
  }

  const base = getLoginUrl(user, userAgencies);
  return withTimeout(base);
}

/**
 * Store user's agencies in localStorage for use after logout
 * @param {Array} agencies - Array of agency objects
 */
export function storeUserAgencies(agencies) {
  try {
    if (agencies && agencies.length > 0) {
      localStorage.setItem('userAgencies', JSON.stringify(agencies));
    } else {
      localStorage.removeItem('userAgencies');
    }
  } catch (e) {
    console.warn('Failed to store user agencies:', e);
  }
}

/**
 * Clear stored user agencies (call on logout)
 */
export function clearStoredAgencies() {
  try {
    localStorage.removeItem('userAgencies');
  } catch (e) {
    // Ignore errors
  }
}
