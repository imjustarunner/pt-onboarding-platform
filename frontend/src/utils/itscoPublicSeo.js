import { isItscoPublicHost, cleanItscoPath, internalItscoPath, ITSCO_PUBLIC_SECTIONS } from './publicDomainRouting.js';
// Preserve the canonical hostname advertised by the existing Wix site.
export const ITSCO_ORIGIN = 'https://www.itsco.health';
export const ITSCO_REDIRECTS = {
  '/all-careers': '/careers', '/jobs': '/careers',
  '/schools-we-are-in': '/schools', '/inofficetherapy': '/services',
  '/intake': '/join/itsco/counseling', '/privacy-policy': '/itsco/privacypolicy'
};
const titles = {
  '': 'ITSCO | Counseling in Colorado Springs and Denver',
  services: 'Counseling Services | ITSCO', providers: 'Find a Counselor | ITSCO',
  schools: 'School-Based Counseling | ITSCO', about: 'About ITSCO',
  growth: 'Our Growth | ITSCO', impact: 'Our Impact | ITSCO', team: 'Our Team | ITSCO',
  insurance: 'Insurance and Counseling | ITSCO', resources: 'Family Resources | ITSCO',
  contact: 'Contact ITSCO', careers: 'Careers at ITSCO'
};
export function itscoPublicResponse(host, originalUrl) {
  if (!isItscoPublicHost(host)) return null;
  const url = new URL(originalUrl, ITSCO_ORIGIN);
  const clean = cleanItscoPath(url.pathname).replace(/\/$/, '') || '/';
  const destination = ITSCO_REDIRECTS[clean] || clean;
  if (destination === '/app' || destination === '/login' || destination === '/itsco/login') {
    return { redirect: `https://app.itsco.health/itsco/login${url.search}`, status: 302 };
  }
  if (String(host).toLowerCase().split(':')[0] !== 'www.itsco.health' || destination !== url.pathname) {
    return { redirect: `${ITSCO_ORIGIN}${destination}${url.search}`, status: 301 };
  }
  const section = clean.slice(1);
  const indexable = Object.hasOwn(titles, section);
  // Existing enrollment and policy URLs remain functional, but are outside the public sitemap.
  const functional = /^\/(join|intake|careers|itsco|sign|public|secure-message|preferences-form)(\/|$)/.test(clean);
  return {
    status: indexable || functional ? 200 : 404,
    internalPath: internalItscoPath(clean),
    canonical: `${ITSCO_ORIGIN}${clean}`,
    title: titles[section] || (functional ? 'ITSCO' : 'Page not found | ITSCO'),
    description: section === 'careers'
      ? 'Explore open positions at ITSCO and join our counseling and support team.'
      : `Explore ${section ? section.replace(/-/g, ' ') : 'counseling and mental health support'} with ITSCO for children, teens, adults, families, and school communities in Colorado.`,
    noindex: !indexable || url.searchParams.has('provider') || url.searchParams.has('school')
  };
}
export function itscoSitemap() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    [...ITSCO_PUBLIC_SECTIONS, 'careers'].map(s => `<url><loc>${ITSCO_ORIGIN}/${s}</loc></url>`).join('') + '</urlset>';
}

/** Keep metadata accurate after SPA navigation as well as a direct page load. */
export function updateItscoDocumentMeta(document, host, internalPath) {
  if (!isItscoPublicHost(host)) return;
  const page = itscoPublicResponse('www.itsco.health', cleanItscoPath(internalPath));
  if (!page || page.redirect) return;
  document.title = page.title;
  for (const [attribute, key, content] of [
    ['name', 'description', page.description], ['name', 'robots', page.noindex ? 'noindex' : 'index,follow'],
    ['property', 'og:title', page.title], ['property', 'og:description', page.description],
    ['property', 'og:url', page.canonical], ['name', 'twitter:title', page.title],
    ['name', 'twitter:description', page.description]
  ]) {
    let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!node) { node = document.createElement('meta'); node.setAttribute(attribute,key); document.head.append(node); }
    node.content = content;
  }
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
  canonical.href = page.canonical;
}
