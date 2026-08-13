/**
 * When portalAgency theme should win over currentAgency / platform gold.
 *
 * Dedicated app hosts (app.itsco.health) stay on that portal's branding even if
 * the super-admin Platform chip is selected, as long as the URL has no other
 * tenant slug.
 */
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

  if (host && portal && host === portal) {
    return true;
  }

  if (platformMode && !currentAgency) return false;
  if (!currentAgency) return true;
  return false;
}
