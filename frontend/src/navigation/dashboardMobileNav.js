import { ref } from 'vue';

/**
 * Dashboard rail cards mirrored into the global hamburger on mobile.
 * DashboardView writes this when mounted; App.vue reads it in the sidebar.
 */
export const dashboardMobileNavItems = ref([]);

export function setDashboardMobileNavItems(items) {
  dashboardMobileNavItems.value = Array.isArray(items)
    ? items.map((c) => ({
        id: c.id,
        label: c.label,
        kind: c.kind || 'content',
        to: c.to || null,
        badgeCount: Number(c.badgeCount) || 0,
        nestedUnder: c.nestedUnder || null,
        children: Array.isArray(c.children)
          ? c.children.map((ch) => ({
              id: ch.id,
              label: ch.label,
              kind: ch.kind || 'content',
              to: ch.to || null,
              badgeCount: Number(ch.badgeCount) || 0
            }))
          : null
      }))
    : [];
}

export function clearDashboardMobileNavItems() {
  dashboardMobileNavItems.value = [];
}
