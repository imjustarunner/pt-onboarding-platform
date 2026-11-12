// Branding is decorative. Start it immediately, but let the first screen mount
// while the host/theme APIs are slow. Never clear a tenant theme on a timeout.
export function startStartupBranding(branding, agency, pathname, currentPath = () => window.location.pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const isLogin = path === '/login';
  if (isLogin) agency.setCurrentAgency(null);
  void branding.fetchPlatformBranding(isLogin && !branding.portalHostPortalUrl).catch(() => {});
  void branding.initializePortalTheme().then(() => {
    if ((currentPath().replace(/\/+$/, '') || '/') !== path) return;
    const nested = path.match(/^\/[a-z0-9-]+\/([a-z0-9-]+)\/login$/i);
    const flat = path.match(/^\/([a-z0-9-]+)\/login$/i);
    const slug = (nested?.[1] || flat?.[1] || '').toLowerCase();
    if (slug && !branding.portalHostPortalUrl && !branding.portalAgency) {
      void branding.fetchAgencyTheme(slug).catch(() => {});
    }
    if (isLogin && !branding.portalHostPortalUrl) branding.clearPortalTheme();
  }).catch(() => {});
}
