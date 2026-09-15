/** Old company-profile URLs remain bookmarks into the unified Settings feature. */
export function normalizeSettingsDestination({ category, item, agencyTab } = {}) {
  if (item !== 'company-profile' && item !== 'business-details') return { category, item, agencyTab };
  if (agencyTab === 'features') return { category: 'general', item: 'tenant-features', agencyTab: 'features' };
  if (agencyTab === 'payroll') return { category: 'workflow', item: 'payroll-schedule' };
  if (item === 'company-profile' && !agencyTab) return { category: 'platform', item: 'tenant-ws-home' };
  return { category: 'general', item: 'business-details', agencyTab: agencyTab || 'general' };
}
