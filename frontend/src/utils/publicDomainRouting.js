/** Public-domain address adapter. App and Quick View hosts are deliberately excluded. */
export const ITSCO_PUBLIC_HOSTS = ['itsco.health', 'www.itsco.health'];
export const ITSCO_PUBLIC_SECTIONS = ['', 'services', 'providers', 'schools', 'about', 'growth', 'impact', 'team', 'insurance', 'resources', 'contact'];
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
/** Keep route identity/params and analytics stable; expose clean URLs in browser and links. */
export function publicDomainHistory(history, host) {
  if (!isItscoPublicHost(host)) return history;
  return {
    ...history,
    get location() { return internalItscoPath(history.location); },
    get state() { return history.state; },
    push(to, data) { history.push(cleanItscoPath(to), data); },
    replace(to, data) { history.replace(cleanItscoPath(to), data); },
    createHref(to) { return history.createHref(cleanItscoPath(to)); },
    listen(callback) { return history.listen((to, from, info) => callback(internalItscoPath(to), internalItscoPath(from), info)); }
  };
}
