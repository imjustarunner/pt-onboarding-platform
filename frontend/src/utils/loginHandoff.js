import { buildOrgLoginPath } from './orgLoginPath';

export const isLoginEntryRoute = route => ['Login', 'OrganizationLogin', 'ParentOrganizationLogin'].includes(String(route?.name || ''));

// These pages validate their own credential; an existing account must not redirect them.
export const isTokenAuthenticationRoute = route => ['ResetPassword', 'OrganizationResetPassword', 'PasswordlessTokenLogin', 'OrganizationPasswordlessTokenLogin', 'InitialSetup', 'NewAccount'].includes(String(route?.name || ''));
export const isSessionEntryRoute = route => isLoginEntryRoute(route) || isTokenAuthenticationRoute(route) || route?.name === 'PasswordlessLogin';

export function safeLoginDestination(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : null;
}

// Preserve meeting links, school destinations, query strings and hashes through SSO.
export function getSsoArrivalRoute(to, hostSlug = '') {
  const orgSlug = String(to.query?.ssoOrg || to.params?.organizationSlug || hostSlug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(orgSlug)) return null;
  const query = { ...to.query };
  delete query.sso;
  delete query.ssoOrg;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item != null) params.append(key, String(item));
    }
  }
  const redirect = `${to.path}${params.size ? `?${params}` : ''}${to.hash || ''}`;
  return {
    path: buildOrgLoginPath(orgSlug, to.params?.parentOrgSlug || null, hostSlug || null),
    query: { sso: '1', ssoOrg: orgSlug, redirect },
    replace: true
  };
}
