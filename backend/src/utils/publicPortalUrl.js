/**
 * Public app URLs for emails and login/reset links.
 *
 * Dedicated agency hosts (e.g. app.itsco.health ≡ ITSCO) stay flat: /login, not /itsco/login.
 * Child orgs on a parent host use /{child}/login.
 * Everyone else keeps path-based links on the platform frontend host.
 */

export const DEDICATED_APP_HOSTS = Object.freeze({
  itsco: 'app.itsco.health',
  nextlevelup: 'app.nextleveluplcc.com',
  nextleveluplcc: 'app.nextleveluplcc.com',
  nlu: 'app.nextleveluplcc.com'
});

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

export function platformFrontendBase() {
  const raw = String(
    process.env.FRONTEND_URL
    || String(process.env.CORS_ORIGIN || '').split(',')[0]
    || 'http://localhost:5173'
  ).trim();
  return raw.replace(/\/$/, '');
}

export function hostnameFromCustomDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    if (/^https?:\/\//.test(raw)) {
      return new URL(raw).hostname.replace(/^www\./, '').replace(/:\d+$/, '');
    }
  } catch {
    /* fall through */
  }
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .replace(/:\d+$/, '');
}

export function dedicatedAppHostForSlug(slug) {
  const key = norm(slug);
  return DEDICATED_APP_HOSTS[key] || '';
}

function orgSlug(agency) {
  return norm(agency?.portal_url || agency?.portalUrl || agency?.slug);
}

function parentSlug(agency) {
  return norm(
    agency?.parent_portal_url
    || agency?.parentPortalUrl
    || agency?.affiliated_agency_slug
    || agency?.parent_slug
  );
}

function isChildOrg(agency) {
  const type = norm(agency?.organization_type || agency?.organizationType || 'agency');
  return Boolean(type && type !== 'agency');
}

function platformBase(platformBaseUrl) {
  return String(platformBaseUrl || platformFrontendBase()).replace(/\/$/, '');
}

/**
 * Origin + optional child path for an org (no trailing slash, no /login).
 * ITSCO → https://app.itsco.health
 * Hogwarts under ITSCO → https://app.itsco.health/hogwarts
 * Other agencies → {FRONTEND_URL}/{slug}
 */
export function buildPublicPortalBaseUrl(agency, { platformBaseUrl } = {}) {
  const slug = orgSlug(agency);
  const parent = parentSlug(agency);
  const ownCustom = hostnameFromCustomDomain(agency?.custom_domain || agency?.customDomain);
  const parentCustom = hostnameFromCustomDomain(agency?.parent_custom_domain || agency?.parentCustomDomain);
  const child = Boolean(slug && parent && parent !== slug && isChildOrg(agency));

  if (child) {
    const host = parentCustom || dedicatedAppHostForSlug(parent) || ownCustom || dedicatedAppHostForSlug(slug);
    if (host) return `https://${host}/${slug}`;
    return `${platformBase(platformBaseUrl)}/${parent}/${slug}`;
  }

  const host = ownCustom || dedicatedAppHostForSlug(slug);
  if (host) return `https://${host}`;

  const base = platformBase(platformBaseUrl);
  if (!slug) return base;
  return `${base}/${slug}`;
}

export function buildPublicAppUrl(agency, path = '', { platformBaseUrl } = {}) {
  const base = buildPublicPortalBaseUrl(agency, { platformBaseUrl });
  const suffix = String(path || '').replace(/^\//, '');
  if (!suffix) return base || '';
  if (!base) return `/${suffix}`;
  return `${base}/${suffix}`;
}

export function buildPublicPortalLoginUrl(agency, opts = {}) {
  return buildPublicAppUrl(agency, 'login', opts);
}

export function buildPublicResetPasswordUrl(agency, token, opts = {}) {
  return buildPublicAppUrl(agency, `reset-password/${token}`, opts);
}

export function buildPublicPasswordlessLoginUrl(agency, token, opts = {}) {
  return buildPublicAppUrl(agency, `passwordless-login/${token}`, opts);
}

export function buildPublicDistrictScheduleUrl(agency, districtSlug, opts = {}) {
  const slug = String(districtSlug || '').trim().toLowerCase();
  if (!slug) return buildPublicAppUrl(agency, 'district-schedule', opts);
  return buildPublicAppUrl(agency, `district-schedule/${encodeURIComponent(slug)}`, opts);
}

/**
 * Prefer a dedicated Quick View host: qv.{tenantAppHost} or qv.{slug}.app.{platform}.
 * Falls back to {tenantPortal}/qv when we cannot form a safe host.
 */
export function buildQuickViewTenantBaseUrl(agency, { platformBaseUrl } = {}) {
  const slug = orgSlug(agency);
  const ownCustom = hostnameFromCustomDomain(agency?.custom_domain || agency?.customDomain);
  const parentCustom = hostnameFromCustomDomain(agency?.parent_custom_domain || agency?.parentCustomDomain);
  const parent = parentSlug(agency);
  const dedicated = ownCustom || dedicatedAppHostForSlug(slug) || parentCustom || dedicatedAppHostForSlug(parent);

  if (dedicated) {
    // app.itsco.health → https://qv.app.itsco.health
    return `https://qv.${dedicated}`;
  }

  const base = platformBase(platformBaseUrl);
  let platformHost = 'plottwisthq.com';
  try {
    const u = new URL(base.includes('://') ? base : `https://${base}`);
    platformHost = u.hostname.replace(/^www\./, '') || platformHost;
  } catch {
    /* keep default */
  }

  if (slug) {
    // Matches "{portal}.app.{platform}" portals → "qv.{portal}.app.{platform}"
    return `https://qv.${slug}.app.${platformHost}`;
  }

  return `${buildPublicPortalBaseUrl(agency, { platformBaseUrl })}/qv`;
}

/** Persistent token URL on the tenant Quick View origin. */
export function buildQuickViewTokenUrl(agency, token, { platformBaseUrl, joinType = null, joinId = null } = {}) {
  const base = buildQuickViewTenantBaseUrl(agency, { platformBaseUrl }).replace(/\/$/, '');
  const params = new URLSearchParams();
  if (joinType && joinId) {
    params.set('join', joinType);
    params.set('id', String(joinId));
  }
  const q = params.toString();
  return `${base}/t/${encodeURIComponent(token)}${q ? `?${q}` : ''}`;
}

/** PIN-only home URL (no token in path) — for Add to Home Screen. */
export function buildQuickViewHomeUrl(agency, opts = {}) {
  return buildQuickViewTenantBaseUrl(agency, opts).replace(/\/$/, '') || '';
}
