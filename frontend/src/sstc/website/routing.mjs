export const SSTC_ORIGIN = 'https://summitstatstc.com';
export const SSTC_SECTIONS = ['', 'features', 'how-it-works', 'groups', 'tour', 'pricing', 'faq', 'about', 'contact'];
export const SSTC_LINKS = Object.freeze({
  signup: `${SSTC_ORIGIN}/sstc/signup/club-manager`,
  login: `${SSTC_ORIGIN}/sstc/login`,
  clubs: `${SSTC_ORIGIN}/sstc/clubs`,
  support: `${SSTC_ORIGIN}/support`,
  terms: `${SSTC_ORIGIN}/sstc/terms`,
  privacy: `${SSTC_ORIGIN}/sstc/privacypolicy`
});
export function isSstcPublicHost(host = '') {
  return ['summitstatstc.com', 'www.summitstatstc.com'].includes(String(host).toLowerCase().split(':')[0]);
}
// An explicit allowlist: invitations, OAuth callbacks, login, clubs, support,
// legal documents, and authenticated routes are never claimed by marketing.
export function sstcMarketingPage(host, value = '/') {
  const path = String(value).split(/[?#]/)[0].replace(/\/$/, '');
  const alias = path === '/p/sstc' || path.startsWith('/p/sstc/');
  if (!alias && !isSstcPublicHost(host)) return null;
  const section = alias ? path.slice('/p/sstc'.length).replace(/^\//, '') : path.replace(/^\//, '');
  return SSTC_SECTIONS.includes(section) ? {section, base: alias ? '/p/sstc' : ''} : null;
}
export const sstcPublicPaths = {
  clean: value => String(value).replace(/^\/p\/sstc(?=\/|[?#]|$)/, '').replace(/^([?#]|$)/, '/$1'),
  internal: value => sstcMarketingPage('summitstatstc.com', value) && !String(value).startsWith('/p/sstc')
    ? `/p/sstc${String(value) === '/' ? '' : value}` : String(value)
};
