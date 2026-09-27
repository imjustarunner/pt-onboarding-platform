import api from './api';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { appendBrandSwitchHandoff } from '../utils/brandSwitchUrl';
import {
  isLocalWorkspaceHost, isSuperadminRole,
  tenantWorkspaceDestination, platformWorkspaceDestination
} from '../utils/workspaceDestination';

export async function navigateWorkspace(destination, router, { agencyId, replace = false } = {}) {
  const { hostname, ...route } = destination;
  const here = window.location.hostname;
  if (isLocalWorkspaceHost(here)) return router[replace ? 'replace' : 'push'](route);
  let url = new URL(router.resolve(route).href, `https://${hostname}`).toString();
  if (hostname !== here && isSuperadminRole(useAuthStore().user?.role)) {
    try {
      const { data } = await api.post('/auth/brand-switch/handoff', {
        targetHost: hostname, ...(agencyId ? { agencyId } : {})
      }, { skipGlobalLoading: true });
      url = appendBrandSwitchHandoff(url, data?.handoffToken);
    } catch {
      // The destination's auth guard will require sign-in if handoff is unavailable.
    }
  }
  // Reload across workspaces, including HQ slug changes, to discard tenant-local view state.
  window.location[replace ? 'replace' : 'assign'](url);
}

export function openTenantWorkspace(agency, router, options = {}) {
  const destination = tenantWorkspaceDestination({
    agency, role: useAuthStore().user?.role,
    hostname: window.location.hostname,
    hostPortalSlug: useBrandingStore().portalHostPortalUrl,
    ...options
  });
  return navigateWorkspace(destination, router, { agencyId: Number(agency.id) });
}

export function openPlatformWorkspace(router, options = {}) {
  return navigateWorkspace({ ...platformWorkspaceDestination(window.location.hostname), ...options }, router);
}
