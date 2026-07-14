<template>
  <!-- Unscoped /admin-dashboard: platform command center for superadmin; otherwise tenant beta dashboard -->
  <SuperadminPlatformDashboard v-if="showPlatformCommandCenter" />
  <TenantAdminDashboard v-else />
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import SuperadminPlatformDashboard from './SuperadminPlatformDashboard.vue';
import TenantAdminDashboard from './TenantAdminDashboard.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

const isSuperAdmin = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'superadmin';
});

const showPlatformCommandCenter = computed(() => {
  // Org-scoped route always uses tenant dashboard
  if (route.params.organizationSlug) return false;
  if (!isSuperAdmin.value) return false;
  // Platform mode / no tenant selected
  return !agencyStore.currentAgency;
});

onMounted(() => {
  // If a tenant slug somehow lands here without org param but currentAgency is set,
  // keep tenant dashboard. If superadmin hits /admin-dashboard with a tenant still
  // selected, clear tenant context so the platform command center can render.
  if (isSuperAdmin.value && !route.params.organizationSlug && agencyStore.currentAgency && route.query.keepTenant !== '1') {
    agencyStore.setPlatformMode();
  }
});
</script>
