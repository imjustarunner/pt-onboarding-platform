export const SCB_PREFIX = '/schoolcarebridge';
export const SCB_ORIGIN = 'https://schoolcarebridge.org';
export const schoolCareBridgeUrl = (school = '') => `${SCB_ORIGIN}/app${school ? `/${encodeURIComponent(school)}` : ''}`;
export const SCB_HOSTS = ['schoolcarebridge.org', 'www.schoolcarebridge.org', 'app.schoolcarebridge.org'];
export const isSchoolCareBridgeHost = (host = '') => SCB_HOSTS.includes(host.toLowerCase().split(':')[0]);
export const isSchoolCareBridgePath = (path = '') => /^\/schoolcarebridge(?:[/?#]|$)/.test(path);
export const schoolCareBridgePath = (school = '', suffix = '') => `${SCB_PREFIX}/app${school ? `/${encodeURIComponent(school)}` : ''}${suffix}`;
export function schoolCareBridgeExternalPath(path, host = globalThis.location?.hostname || '') {
  return isSchoolCareBridgeHost(host) ? path.replace(/^\/schoolcarebridge(?=\/|[?#]|$)/, '') || '/' : path;
}
// Keep existing school workflows in this surface without changing their route identity.
export function schoolCareBridgeWorkflowPath(path, school) {
  if (!school || !path.startsWith(`/${school}/`)) return null;
  const rest = path.slice(school.length + 2);
  if (/^(dashboard|login)([?#]|$)/.test(rest)) return schoolCareBridgePath(school) + rest.replace(/^(dashboard|login)/, '');
  if (/^(change-password|providers|tasks\/documents|school-reinit)(\/|[?#]|$)/.test(rest)) return schoolCareBridgePath(school, `/${rest}`);
  return null;
}

/** Honor the server's configured school origin while rejecting unrelated URLs. */
export function schoolCareBridgeOnboardingUrl(value, school = '') {
  const fallback = schoolCareBridgeUrl(school);
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return fallback;
    const prefix = url.hostname === 'mh4kidz.org' ? SCB_PREFIX : isSchoolCareBridgeHost(url.hostname) ? '' : null;
    if (prefix === null || url.pathname !== `${prefix}/app${school ? `/${encodeURIComponent(school)}` : ''}`) return fallback;
    return url.href;
  } catch { return fallback; }
}
