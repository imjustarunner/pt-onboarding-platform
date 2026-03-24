/**
 * Superadmin "Switch Brand" — full host navigation so the browser URL, cookies, and
 * portal resolution match the selected agency (or platform), instead of only
 * swapping Pinia state on the current host.
 */

export function normalizeHostname(host) {
  if (!host) return '';
  let h = String(host).trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '');
  h = h.split('/')[0].split(':')[0];
  return h;
}

/** Primary app hostname for an agency (custom domain / app bucket). */
export function getAgencyAppHostname(agency) {
  const cd = agency?.custom_domain ?? agency?.customDomain;
  if (cd && String(cd).trim()) return normalizeHostname(cd);
  return null;
}

/** Platform (PlotTwist HQ) host — override with VITE_PLATFORM_APP_HOST. */
export function getPlatformAppHostname() {
  const v = import.meta.env.VITE_PLATFORM_APP_HOST || import.meta.env.VITE_PLATFORM_SITE_HOST;
  if (v && String(v).trim()) return normalizeHostname(v);
  return 'plottwisthq.com';
}

function serializeQuery(query) {
  if (!query || typeof query !== 'object') return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Strip /:parentOrgSlug and /:organizationSlug prefixes so paths work on a
 * dedicated agency hostname (flat) or on the platform host.
 */
export function pathWithoutOrgSlugParams(route) {
  let p = route.path || '/';
  const pslug = route.params?.parentOrgSlug;
  const slug = route.params?.organizationSlug;
  if (pslug && typeof pslug === 'string') {
    const pref = `/${pslug}`;
    if (p === pref) p = '/';
    else if (p.startsWith(`${pref}/`)) p = p.slice(pref.length) || '/';
  }
  if (slug && typeof slug === 'string') {
    const pref = `/${slug}`;
    if (p === pref) p = '/';
    else if (p.startsWith(`${pref}/`)) p = p.slice(pref.length) || '/';
  }
  if (p === '') p = '/';
  return p;
}

function protocolForHost(host) {
  const h = normalizeHostname(host);
  if (h === 'localhost' || h.startsWith('127.')) return typeof window !== 'undefined' ? window.location.protocol : 'http:';
  return 'https:';
}

export function shouldHardRedirectBrandSwitch() {
  if (import.meta.env.VITE_DISABLE_BRAND_HARD_REDIRECT === '1') return false;
  if (typeof window === 'undefined') return false;
  const hn = window.location.hostname;
  if (hn === 'localhost' || hn === '127.0.0.1') return false;
  return true;
}

/**
 * @returns {string|null} full URL to assign, or null to keep in-app router navigation
 */
export function buildSuperadminAgencyBrandUrl(agency, route) {
  if (!agency || !shouldHardRedirectBrandSwitch()) return null;
  const targetHost = getAgencyAppHostname(agency);
  if (!targetHost) return null;
  const here = normalizeHostname(typeof window !== 'undefined' ? window.location.hostname : '');
  if (targetHost === here) return null;

  const path = pathWithoutOrgSlugParams(route);
  const qs = serializeQuery(route.query);
  const proto = protocolForHost(targetHost);
  return `${proto}//${targetHost}${path}${qs}`;
}

/**
 * @returns {string|null}
 */
export function buildSuperadminPlatformBrandUrl(route) {
  if (!shouldHardRedirectBrandSwitch()) return null;
  const targetHost = getPlatformAppHostname();
  const here = normalizeHostname(typeof window !== 'undefined' ? window.location.hostname : '');
  if (targetHost === here) return null;

  const path = pathWithoutOrgSlugParams(route);
  const qs = serializeQuery(route.query);
  const proto = protocolForHost(targetHost);
  return `${proto}//${targetHost}${path}${qs}`;
}
