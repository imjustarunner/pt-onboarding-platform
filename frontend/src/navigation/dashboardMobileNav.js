import { ref } from 'vue';

/**
 * Dashboard rail cards shared by the hamburger and desktop dashboard menu.
 */
export const dashboardMobileNavItems = ref([]);
export const dashboardNavContext = ref('');

export function dashboardNavigationContextKey(user, agencyId, dashboardPath = '', agency = null, platform = null) {
  // Stable keys avoid dropping the rail just because auth refreshed capability
  // property order. Include every access gate and route scope so an old tenant's
  // links or permissions cannot survive a context switch.
  const stable = value => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return JSON.stringify(stable([
    user?.id || null, user?.role || '', agencyId || null, dashboardPath,
    user?.workspaceServiceContext || null, user?.capabilities || {}, user?.status || '', user?.type || '',
    user?.has_supervisor_privileges || user?.hasSupervisorPrivileges || false,
    user?.has_clinical_supervision || false, user?.skill_builder_eligible || false,
    user?.has_skill_builder_coordinator_access || false,
    agency?.organization_type || agency?.organizationType || '',
    agency?.feature_flags ?? agency?.featureFlags ?? {},
    agency?.tenant_available_agency_features_json ?? agency?.tenantAvailableAgencyFeaturesJson ?? null,
    platform?.available_agency_features_json ?? platform?.availableAgencyFeaturesJson ?? null
  ]));
}

function copyCard(c) {
  return {
    id: c.id, label: c.label, kind: c.kind || 'content', to: c.to || null,
    iconUrl: c.brandIconUrl || c.iconUrl || null, toolsTab: c.toolsTab || null,
    badgeCount: Number(c.badgeCount) || 0, nestedUnder: c.nestedUnder || null,
    children: Array.isArray(c.children) ? c.children.map(copyCard) : null
  };
}

export function setDashboardMobileNavItems(items, context = '') {
  dashboardNavContext.value = context;
  dashboardMobileNavItems.value = Array.isArray(items)
    ? items.map(copyCard)
    : [];
}

export function clearDashboardMobileNavItems() {
  dashboardNavContext.value = '';
  dashboardMobileNavItems.value = [];
}
