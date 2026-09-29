export const SCB_PREFIX = '/schoolcarebridge';
export const SCB_HOSTS = ['schoolcarebridge.org', 'www.schoolcarebridge.org'];
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
