<template>
  <!-- Unscoped /admin-dashboard: platform command center for superadmin; otherwise tenant beta dashboard -->
  <SuperadminPlatformDashboard v-if="showPlatformCommandCenter" />
  <TenantAdminDashboard v-else />
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { isPlatformWorkspaceHost, isLocalWorkspaceHost } from '../../utils/workspaceDestination';
import SuperadminPlatformDashboard from './SuperadminPlatformDashboard.vue';
import TenantAdminDashboard from './TenantAdminDashboard.vue';

const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const route = useRoute();

const isSuperAdmin = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'superadmin';
});

const showPlatformCommandCenter = computed(() => {
  // Org-scoped route always uses tenant dashboard
  if (route.params.organizationSlug) return false;
  if (!isSuperAdmin.value) return false;
  if (!isPlatformWorkspaceHost(window.location.hostname) && !isLocalWorkspaceHost(window.location.hostname)) return false;
  return !brandingStore.portalHostPortalUrl;
});
</script>
