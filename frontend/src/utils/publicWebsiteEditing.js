import { publicSitePaths } from './publicDomainRouting';

export function marketingEditorPath(slug) {
  return `/admin/public-marketing-pages?page=${encodeURIComponent(slug)}`;
}

export function editableWebsiteSlug({ user, route, hostname, framed = false }) {
  if (user?.role !== 'super_admin' || user?.demoMode || framed || publicSitePaths(hostname)) return null;
  if (!route?.meta?.publicMarketingHub) return null;
  return /^\/p\/([a-z0-9-]+)(?:\/|$)/i.exec(route.path || '')?.[1] || null;
}
