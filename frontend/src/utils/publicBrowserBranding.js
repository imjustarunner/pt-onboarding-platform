import { publicSupportSlugFromHost } from './publicDomainRouting.js';
import { tenantFaviconUrl } from './tenantBrandAssets.js';

export const PUBLIC_WEBSITE_TITLES = {
  itsco: 'ITSCO | In The School Counselors',
  nlu: 'Next Level Up | Learning and Counseling Centers',
  ptco: 'Plot Twist Co. | Your Next Chapter',
  tisi: 'The Inner Strength Institute',
  range: 'Mental Range Collective | Stronger Together',
  mh4kidz: 'MH4Kidz | Stronger Kids. Brighter Tomorrows.',
  rise: 'Rise Revive | Counseling and Coaching',
  kimi: 'Kimi Cain | Life Coaching'
};

/** Public website identity must not depend on the visitor's selected app agency. */
export function publicBrowserBranding(host, path = '/') {
  const slug = publicSupportSlugFromHost(host) || String(path).match(/^\/p\/([^/?#]+)/)?.[1];
  const title = PUBLIC_WEBSITE_TITLES[slug];
  return title ? { slug, title, favicon: tenantFaviconUrl(slug) } : null;
}

/** Repair legacy public-page links; keep the app's explicit website editor in place. */
export function legacyTisiPublicDestination(href) {
  const url = new URL(href);
  if (url.hostname !== 'app.theinnerstrengthinstitute.com' || !/^\/p\/tisi(?:\/|$)/.test(url.pathname)) return null;
  if (url.searchParams.has('editWebsite') || url.searchParams.has('marketingPreview') || url.searchParams.has('bs')) return null;
  url.hostname = 'theinnerstrengthinstitute.com';
  url.pathname = url.pathname.replace(/^\/p\/tisi/, '') || '/';
  return url.href;
}

export function injectPublicFavicon(html, host) {
  const icon = publicBrowserBranding(host)?.favicon;
  if (!icon) return html;
  return html.replace(/(<link\b[^>]*id="app-(?:favicon|apple-touch-icon)"[^>]*href=")[^"]*(")/g, `$1${icon}$2`);
}
