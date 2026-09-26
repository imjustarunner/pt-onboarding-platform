/** Old company-profile URLs remain bookmarks into the unified Settings feature. */
export function normalizeSettingsDestination({ category, item, agencyTab } = {}) {
  if (item !== 'company-profile' && item !== 'business-details') return { category, item, agencyTab };
  if (agencyTab === 'features') return { category: 'general', item: 'tenant-features', agencyTab: 'features' };
  if (agencyTab === 'payroll') return { category: 'workflow', item: 'payroll-schedule' };
  if (item === 'company-profile' && !agencyTab) return { category: 'platform', item: 'tenant-ws-home' };
  return { category: 'general', item: 'business-details', agencyTab: agencyTab || 'general' };
}

/** Preserve explicit agency scope, including flat routes on dedicated agency hosts. */
export function settingsLocationForAgency(agency, { platform = false } = {}) {
  const slug = String(agency?.slug || agency?.portal_url || '').trim();
  if (platform || !agency?.id) return { path: '/admin/settings', query: { scope: 'platform', category: 'platform', item: 'platform-ws-home' } };
  return {
    path: slug ? `/${encodeURIComponent(slug)}/admin/settings` : '/admin/settings',
    query: { agencyId: String(agency.id), category: 'platform', item: 'tenant-ws-home' }
  };
}
