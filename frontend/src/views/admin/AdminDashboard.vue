<template>
  <div>
    <!-- Classic dashboards (default experience) -->
    <div v-if="!user">
      <div class="container">
        <div class="loading">Loading...</div>
      </div>
    </div>

    <!-- Platform superadmin: dark Plot Twist HQ command center (opt into classic via ?classic=1) -->
    <SuperadminPlatformDashboard
      v-else-if="isSuperAdmin && !currentAgency && !isSuperadminPreview && !useClassicPlatform"
    />
    <div v-else-if="isSuperAdmin && !currentAgency && !isSuperadminPreview && useClassicPlatform">
      <div class="beta-banner">
        <span class="beta-banner-text">Classic platform dashboard</span>
        <button class="beta-banner-try" @click="goModernPlatform">Use Plot Twist HQ dashboard →</button>
      </div>
      <SuperAdminDashboard />
    </div>

    <!-- SuperAdmin with a tenant selected → ops dashboard (classic via ?classic=1) -->
    <AgencyAdminDashboard
      v-else-if="isSuperAdmin && currentAgency && !isSuperadminPreview && useClassicTenant"
    />
    <TenantAdminDashboard
      v-else-if="isSuperAdmin && currentAgency && !isSuperadminPreview"
    />
    <AgencyAdminDashboard
      v-else-if="isSuperadminPreview"
      :preview-mode="true"
    />
    <AgencyAdminDashboard
      v-else-if="isTenantAdminRole && useClassicTenant"
    />
    <TenantAdminDashboard
      v-else-if="isTenantAdminRole"
    />
    <div v-else class="container">
      <div class="error">Access denied. This dashboard is only available to administrators, supervisors, and clinical practice assistants.</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useSuperadminPlatformPreview } from '../../composables/useSuperadminPlatformPreview';
import { isSupervisor } from '../../utils/helpers.js';
import { setRememberedGoogleLogin } from '../../utils/loginRemember';
import api from '../../services/api';
import SuperAdminDashboard from './SuperAdminDashboard.vue';
import SuperadminPlatformDashboard from './SuperadminPlatformDashboard.vue';
import AgencyAdminDashboard from './AgencyAdminDashboard.vue';
import TenantAdminDashboard from './TenantAdminDashboard.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();
const user = computed(() => authStore.user);
const currentAgency = computed(() => agencyStore.currentAgency);
const { isSuperadminPreview } = useSuperadminPlatformPreview({ route, authStore, agencyStore });

const isSuperAdmin = computed(() => {
  const role = String(user.value?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'superadmin';
});

const useClassicPlatform = computed(() => String(route.query.classic || '') === '1');
const useClassicTenant = computed(() => String(route.query.classic || '') === '1');

const isTenantAdminRole = computed(() => {
  const role = String(user.value?.role || '').toLowerCase();
  return (
    role === 'admin'
    || role === 'support'
    || role === 'club_manager'
    || role === 'provider_plus'
    || role === 'clinical_practice_assistant'
    || isSupervisor(user.value)
  );
});

onMounted(() => {
  // Fresh Google SSO (or any hit with sso=1): enter platform mode so a sticky
  // localStorage tenant does not hide the full Plot Twist HQ dashboard.
  if (isSuperAdmin.value && String(route.query?.sso || '') === '1') {
    const ssoOrg = String(route.query?.ssoOrg || '').trim().toLowerCase();
    const username = String(authStore.user?.username || authStore.user?.email || '').trim();
    if (ssoOrg && username) {
      setRememberedGoogleLogin({ username, orgSlug: ssoOrg });
    }
    agencyStore.setPlatformMode();
    const nextQuery = { ...route.query };
    delete nextQuery.sso;
    delete nextQuery.ssoOrg;
    router.replace({ path: '/admin', query: nextQuery }).catch(() => {});
  }

  const role = String(user.value?.role || '').toLowerCase();
  const dashboardType = role === 'super_admin' || role === 'superadmin' ? 'super_admin' : 'agency';
  const agencyId = agencyStore.currentAgency?.value?.id ?? agencyStore.currentAgency?.id ?? null;
  api.post('/auth/activity-log', {
    actionType: 'admin_dashboard_view',
    metadata: { dashboardType, path: '/admin', agencyId }
  }, { skipGlobalLoading: true }).catch(() => {});
});

const goModernPlatform = () => {
  router.push('/admin');
};
</script>

<style scoped>
.beta-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(90deg, #0f172a 0%, #1e3a5f 100%);
  color: white;
  padding: 10px 20px;
  font-size: 14px;
  position: sticky;
  top: 0;
  z-index: 200;
}

.beta-banner-text {
  flex: 1;
  font-weight: 500;
}

.beta-banner-try {
  background: #7c3aed;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
</style>
