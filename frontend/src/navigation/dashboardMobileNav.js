import { ref } from 'vue';

/**
 * Dashboard rail cards shared by the hamburger and desktop dashboard menu.
 */
export const dashboardMobileNavItems = ref([]);
export const dashboardNavContext = ref('');

export function dashboardNavigationContextKey(user, agencyId) {
  return JSON.stringify([user?.id || null, user?.role || '', agencyId || null, user?.capabilities || {}, user?.has_supervisor_privileges || false]);
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
