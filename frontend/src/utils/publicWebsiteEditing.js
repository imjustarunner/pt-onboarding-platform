import { publicSitePaths } from './publicDomainRouting';

export function marketingEditorPath(slug) {
  return `/admin/public-marketing-pages?page=${encodeURIComponent(slug)}`;
}

export function editableWebsiteSlug({ user, route, hostname, framed = false }) {
  if (!['super_admin', 'superadmin'].includes(String(user?.role || '').toLowerCase()) || user?.demoMode || framed) return null;
  if (!route?.meta?.publicMarketingHub) return null;
  if (route.path?.startsWith('/schoolcarebridge')) return 'schoolcarebridge';
  return /^\/p\/([a-z0-9-]+)(?:\/|$)/i.exec(route.path || '')?.[1] || null;
}

export function websiteManagementUrl(route, hostname) {
  if (route.path?.startsWith('/schoolcarebridge')) return 'https://plottwisthq.com/admin/public-marketing-pages?page=schoolcarebridge';
  const slug = /^\/p\/([a-z0-9-]+)(?:\/|$)/i.exec(route.path || '')?.[1];
  if (!slug) return '';
  const relative = `${route.path}?${new URLSearchParams({ ...route.query, editWebsite: '1' })}`;
  return publicSitePaths(hostname) ? `https://app.${hostname.replace(/^www\./, '')}${relative}` : relative;
}
