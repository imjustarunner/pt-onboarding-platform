import { buildOrgLoginPath } from './orgLoginPath';

export const isLoginEntryRoute = route => ['Login', 'OrganizationLogin', 'ParentOrganizationLogin', 'ConversaLogin'].includes(String(route?.name || ''));

// These pages validate their own credential; an existing account must not redirect them.
export const isTokenAuthenticationRoute = route => ['ResetPassword', 'OrganizationResetPassword', 'PasswordlessTokenLogin', 'OrganizationPasswordlessTokenLogin', 'InitialSetup', 'NewAccount'].includes(String(route?.name || ''));
export const isSessionEntryRoute = route => isLoginEntryRoute(route) || isTokenAuthenticationRoute(route) || route?.name === 'PasswordlessLogin' || /^\/school-onboarding(?:\/|$)/.test(String(route?.path || ''));

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

// Consume successful cookie handoffs before entering any workspace. Keeping sso
// in the URL makes ordinary query navigation look like another fresh login.
export async function consumeSsoHandoff(to, bootstrap) {
  if (String(to.query?.sso || '') !== '1' || !await bootstrap()) return null;
  const { sso, ssoOrg, ...query } = to.query;
  return { path: to.path, query, hash: to.hash, replace: true };
}

// AuricWell has its own HTML entry and router; hand off with a document navigation.
export function auricwellLoginDestination(value, hostname = window.location.hostname) {
  const safe = safeLoginDestination(value);
  if (!safe || /[\u0000-\u0020]/.test(safe)) return null;
  const publicHost = /^(www\.)?auricwell\.com$/i.test(hostname);
  if (/^\/auricwell\/app(?:[/?#]|$)/.test(safe)) return publicHost ? safe.slice('/auricwell'.length) : safe;
  if (/^\/app(?:[/?#]|$)/.test(safe)) {
    if (publicHost) return safe;
    // Old Google returns carried the public-site path onto the central callback host.
    if (String(hostname).toLowerCase() === 'app.itsco.health') return `/auricwell${safe}`;
  }
  return null;
}

// Google can return on the central callback origin. Reuse its verified-cookie
// login bootstrap, then choose the correct interface for the authenticated role.
export function auricwellSsoDestination(value, hostname = window.location.hostname) {
  const safe = safeLoginDestination(value);
  if (value && (!safe || /[\u0000-\u0020]/.test(safe))) return null;
  const destination = auricwellLoginDestination(safe, hostname);
  const publicHost = /^(www\.)?auricwell\.com$/i.test(hostname);
  if (!destination && !(publicHost && !safe)) return safe;
  const params = new URLSearchParams({ workspace: 'auricwell' });
  if (destination) params.set('redirect', destination.startsWith('/app') ? `/auricwell${destination}` : destination);
  return `/login?${params}`;
}
