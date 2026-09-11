/**
 * Public portal / login URLs for tenant agencies (mirrors backend publicPortalUrl.js).
 */

export const DEDICATED_APP_HOSTS = Object.freeze({
  itsco: 'app.itsco.health',
  nextlevelup: 'app.nextleveluplcc.com',
  nextleveluplcc: 'app.nextleveluplcc.com',
  nlu: 'app.nextleveluplcc.com',
  tisi: 'app.theinnerstrengthinstitute.com'
});

function norm(value) {
  return String(value || '').trim().toLowerCase();
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
  return DEDICATED_APP_HOSTS[norm(slug)] || '';
}

/** Reverse map: app.theinnerstrengthinstitute.com → tisi */
export function dedicatedSlugForHost(hostname) {
  const host = hostnameFromCustomDomain(hostname);
  if (!host) return '';
  for (const [slug, dedicated] of Object.entries(DEDICATED_APP_HOSTS)) {
    if (host === dedicated) return slug;
  }
  return '';
}

/**
 * Absolute login URL when the agency has a custom / dedicated host; otherwise /{slug}/login.
 */
export function buildPublicPortalLoginUrl(agency = {}) {
  const slug = norm(agency?.portal_url || agency?.portalUrl || agency?.slug);
  const ownCustom = hostnameFromCustomDomain(agency?.custom_domain || agency?.customDomain);
  const host = ownCustom || dedicatedAppHostForSlug(slug);
  if (host) return `https://${host}/login`;
  if (!slug) return '/login';
  return `/${encodeURIComponent(slug)}/login`;
}
