<template>
  <!-- Unscoped /admin-dashboard: platform command center for superadmin; otherwise tenant beta dashboard -->
  <SuperadminPlatformDashboard v-if="showPlatformCommandCenter" />
  <TenantAdminDashboard v-else />
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import SuperadminPlatformDashboard from './SuperadminPlatformDashboard.vue';
import TenantAdminDashboard from './TenantAdminDashboard.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();

const isSuperAdmin = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'superadmin';
});

const showPlatformCommandCenter = computed(() => {
  // Org-scoped route always uses tenant dashboard
  if (route.params.organizationSlug) return false;
  if (!isSuperAdmin.value) return false;
  // Explicit platform HQ request
  if (String(route.query?.platform || '') === '1') return true;
  // Platform mode / no tenant selected
  return !agencyStore.currentAgency;
});

onMounted(() => {
  if (!isSuperAdmin.value || route.params.organizationSlug) return;

  // Prefer keeping the selected tenant: bounce to org-scoped management dashboard.
  // (Previously this cleared the tenant and showed a gold shell without global nav.)
  const agency = agencyStore.currentAgency;
  if (agency && String(route.query?.platform || '') !== '1') {
    const slug = String(agency.slug || agency.portal_url || '').trim();
    if (slug) {
      router.replace(`/${slug}/admin-dashboard`).catch(() => {});
      return;
    }
  }

  // Explicit platform HQ only
  if (String(route.query?.platform || '') === '1' && agency) {
    agencyStore.setPlatformMode();
  }
});
</script>
