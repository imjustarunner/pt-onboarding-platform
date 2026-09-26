/** Explicit platform selection wins on an agency host; agency routes and guest logins retain their identity. */
export function shouldApplyPortalAgencyThemeFirst({
  hasPortalAgency = false,
  isAuthenticated = false,
  platformMode = false,
  currentAgency = null,
  routeSlug = '',
  portalSlug = '',
  hostImpliedSlug = ''
} = {}) {
  if (!hasPortalAgency) return false;
  if (!isAuthenticated) return true;

  const route = String(routeSlug || '').trim().toLowerCase();
  const portal = String(portalSlug || '').trim().toLowerCase();
  const host = String(hostImpliedSlug || '').trim().toLowerCase();

  if (route) {
    return !!(portal && route === portal);
  }

  if (platformMode && !currentAgency) return false;

  if (host && portal && host === portal) {
    return true;
  }

  if (platformMode && !currentAgency) return false;
  if (!currentAgency) return true;
  return false;
}
