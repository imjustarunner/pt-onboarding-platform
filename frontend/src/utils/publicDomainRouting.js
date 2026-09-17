/** Public-domain address adapter. App and Quick View hosts are deliberately excluded. */
export const ITSCO_PUBLIC_HOSTS = ['itsco.health', 'www.itsco.health'];
export const ITSCO_PUBLIC_SECTIONS = ['', 'community-standards', 'live-chat-support', 'services', 'providers', 'schools', 'about', 'growth', 'impact', 'team', 'insurance', 'resources', 'referral-network', 'contact'];
export function isItscoPublicHost(host = '') {
  return ITSCO_PUBLIC_HOSTS.includes(String(host).toLowerCase().split(':')[0]);
}
export function cleanItscoPath(value) {
  return String(value).replace(/^\/p\/itsco(?=\/|[?#]|$)/, '').replace(/^\/careers\/itsco(?=\/|[?#]|$)/, '/careers').replace(/^([?#]|$)/, '/$1');
}
export function internalItscoPath(value) {
  const path = String(value);
  if (/^\/careers(?:\/jobs\/[^/?#]+)?\/?(?:[?#]|$)/.test(path)) return path.replace(/^\/careers/, '/careers/itsco');
  const pathname = path.split(/[?#]/)[0].replace(/\/$/, '');
  if (ITSCO_PUBLIC_SECTIONS.some(s => pathname === (s ? `/${s}` : ''))) return `/p/itsco${path === '/' ? '' : path}`;
  return path;
}
export const PUBLIC_SITE_DOMAINS = {
 'nextleveluplcc.com': 'nlu',
 'plottwistco.com': 'ptco',
 'mentalrange.org': 'range',
 'mh4kidz.org': 'mh4kidz',
 'theinnerstrengthinstitute.com': 'tisi',
 'kimicain.com': 'kimi',
 'risereviveco.com': 'rise'
};
export function publicSiteSlug(host = '') {
 const normalized = String(host).toLowerCase().split(':')[0].replace(/^www\./, '');
 return PUBLIC_SITE_DOMAINS[normalized] || null;
}
export function publicSitePaths(host) {
 if (isItscoPublicHost(host)) return {clean: cleanItscoPath, internal: internalItscoPath};
 const slug = publicSiteSlug(host);
 if (!slug) return null;
 const prefix = `/p/${slug}`;
 return {
  clean(value) {
   const path = String(value);
   return path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?') || path.startsWith(prefix + '#')
    ? (path.slice(prefix.length).replace(/^([?#]|$)/, '/$1')) : path;
  },
  internal(value) {
   const path = String(value);
   const pathname = path.split(/[?#]/)[0];
   // Only root and single-segment marketing pages are adapted. Enrollment,
   // provider directories, API and cross-site /p links retain their routes.
   if (pathname === '/' || pathname === '') return prefix + path.replace(/^\//, '');
   if (/^\/[^/]+\/?$/.test(pathname) && !/^\/(login|app|logout|dashboard|support|join|intake|careers|api|uploads)(\/|$)/.test(pathname)) return prefix + path;
   return path;
  }
 };
}
/** Keep route identity/params and analytics stable; expose clean URLs in browser and links. */
export function publicDomainHistory(history, host) {
 const paths = publicSitePaths(host);
 if (!paths) return history;
 return {
  ...history,
  get location() { return paths.internal(history.location); },
  get state() { return history.state; },
  push(to, data) { history.push(paths.clean(to), data); },
  replace(to, data) { history.replace(paths.clean(to), data); },
  createHref(to) { return history.createHref(paths.clean(to)); },
  listen(callback) { return history.listen((to, from, info) => callback(paths.internal(to), paths.internal(from), info)); }
 };
}
