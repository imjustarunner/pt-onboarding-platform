import { getAgencyAppHostname, getPlatformAppHostname, normalizeHostname } from './brandSwitchUrl.js';

export const workspaceSlug = (agency) => String(agency?.slug || agency?.portal_url || agency?.portalUrl || '').trim().toLowerCase();
export const isSuperadminRole = (role) => ['super_admin', 'superadmin'].includes(String(role || '').toLowerCase());
export const isLocalWorkspaceHost = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

// A family can have authorized profiles at several agencies. Keep their session
// on its current origin while the guardian route selects the person's branding.
export function isFamilyPortalRoute({ role, path }) {
  return ['client_guardian', 'client'].includes(String(role || '').toLowerCase())
    && /^\/(?:[^/]+\/)?guardian(?:\/|$)/.test(String(path || ''));
}

export function isPlatformWorkspaceHost(host) {
  const normalized = normalizeHostname(host);
  return normalized === getPlatformAppHostname() || normalized === `www.${getPlatformAppHostname()}`;
}

// This persistent QA agency exercises the full provider UI on the shared ITSCO
// host. Keep its slug in the URL; it must never inherit ITSCO's flat routes.
// This chooses an address only. Membership and role authorization still apply.
export function isItscoQaWorkspace(agency, hostname) {
  let flags = agency?.feature_flags ?? agency?.featureFlags;
  if (typeof flags === 'string') {
    try { flags = JSON.parse(flags); } catch { return false; }
  }
  return normalizeHostname(hostname) === 'app.itsco.health'
    && Number(agency?.id) === 450
    && workspaceSlug(agency) === 'auricwell-qa-demo'
    && flags?.qaSandbox?.syntheticOnly === true;
}

/** The URL owns workspace identity; selecting an agency alone never changes it. */
export function tenantWorkspaceDestination({ agency, role, hostname, hostPortalSlug, path = '/admin', query = {}, hash = '' }) {
  const slug = workspaceSlug(agency);
  if (!slug) throw new Error('This tenant has no portal address.');
  const here = normalizeHostname(hostname);
  const local = isLocalWorkspaceHost(here);
  const sharedQa = isItscoQaWorkspace(agency, here);
  const sameTenantHost = String(hostPortalSlug || '').toLowerCase() === slug && !isPlatformWorkspaceHost(here);
  const superadmin = isSuperadminRole(role);
  const targetHost = local || sameTenantHost || sharedQa
    ? here
    : superadmin ? getPlatformAppHostname() : getAgencyAppHostname(agency);
  if (!targetHost) throw new Error('This tenant has no configured app domain.');
  const scoped = local || sharedQa || (superadmin && isPlatformWorkspaceHost(targetHost));
  const suffix = path === '/' ? '/admin' : path;
  return { hostname: targetHost, path: `${scoped ? `/${slug}` : ''}${suffix}`, query, hash };
}

export function platformWorkspaceDestination(hostname) {
  return {
    hostname: isLocalWorkspaceHost(hostname) ? hostname : getPlatformAppHostname(),
    path: '/admin', query: {}, hash: ''
  };
}
