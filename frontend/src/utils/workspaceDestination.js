import { getAgencyAppHostname, getPlatformAppHostname, normalizeHostname } from './brandSwitchUrl.js';

export const workspaceSlug = (agency) => String(agency?.slug || agency?.portal_url || agency?.portalUrl || '').trim().toLowerCase();
export const isSuperadminRole = (role) => ['super_admin', 'superadmin'].includes(String(role || '').toLowerCase());
export const isLocalWorkspaceHost = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

export function isPlatformWorkspaceHost(host) {
  const normalized = normalizeHostname(host);
  return normalized === getPlatformAppHostname() || normalized === `www.${getPlatformAppHostname()}`;
}

/** The URL owns workspace identity; selecting an agency alone never changes it. */
export function tenantWorkspaceDestination({ agency, role, hostname, hostPortalSlug, path = '/admin', query = {}, hash = '' }) {
  const slug = workspaceSlug(agency);
  if (!slug) throw new Error('This tenant has no portal address.');
  const here = normalizeHostname(hostname);
  const local = isLocalWorkspaceHost(here);
  const sameTenantHost = String(hostPortalSlug || '').toLowerCase() === slug && !isPlatformWorkspaceHost(here);
  const superadmin = isSuperadminRole(role);
  const targetHost = local || sameTenantHost
    ? here
    : superadmin ? getPlatformAppHostname() : getAgencyAppHostname(agency);
  if (!targetHost) throw new Error('This tenant has no configured app domain.');
  const scoped = local || (superadmin && isPlatformWorkspaceHost(targetHost));
  const suffix = path === '/' ? '/admin' : path;
  return { hostname: targetHost, path: `${scoped ? `/${slug}` : ''}${suffix}`, query, hash };
}

export function platformWorkspaceDestination(hostname) {
  return {
    hostname: isLocalWorkspaceHost(hostname) ? hostname : getPlatformAppHostname(),
    path: '/admin', query: {}, hash: ''
  };
}
