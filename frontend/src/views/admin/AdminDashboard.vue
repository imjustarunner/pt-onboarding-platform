<template>
  <div>
    <!-- Dashboard switcher bar — always visible, no opt-in required -->
    <div v-if="user && !isSstcContext" class="beta-banner">
      <span class="beta-banner-text">
        ✨ New admin dashboard available.
      </span>
      <button class="beta-banner-try" @click="goToBetaDashboard">
        Try New Dashboard →
      </button>
    </div>

    <!-- Classic dashboards (default experience) -->
    <div v-if="!user">
      <div class="container">
        <div class="loading">Loading...</div>
      </div>
    </div>
    <!-- SuperAdmin with no tenant selected → Platform Dashboard -->
    <SuperAdminDashboard
      v-else-if="isSuperAdmin && !currentAgency && !isSuperadminPreview"
    />
    <!-- SuperAdmin with a tenant selected → show that tenant's classic dashboard -->
    <AgencyAdminDashboard
      v-else-if="isSuperAdmin && currentAgency && !isSuperadminPreview"
    />
    <AgencyAdminDashboard
      v-else-if="isSuperadminPreview"
      :preview-mode="true"
    />
    <AgencyAdminDashboard
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
import { useSummitStatsChallengeChrome } from '../../composables/useSummitStatsChallengeChrome';
import { isSupervisor } from '../../utils/helpers.js';
import api from '../../services/api';
import SuperAdminDashboard from './SuperAdminDashboard.vue';
import AgencyAdminDashboard from './AgencyAdminDashboard.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();
const user = computed(() => authStore.user);
const { isSuperadminPreview } = useSuperadminPlatformPreview({ route, authStore, agencyStore });
const isSstcContext = useSummitStatsChallengeChrome();

const isSuperAdmin = computed(() => {
  const role = String(user.value?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'superadmin';
});

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
  const role = String(user.value?.role || '').toLowerCase();
  const dashboardType = role === 'super_admin' || role === 'superadmin' ? 'super_admin' : 'agency';
  const agencyId = agencyStore.currentAgency?.value?.id ?? agencyStore.currentAgency?.id ?? null;
  api.post('/auth/activity-log', {
    actionType: 'admin_dashboard_view',
    metadata: { dashboardType, path: '/admin', agencyId }
  }).catch(() => {});
});

const goToBetaDashboard = () => {
  // Super admins go to the global new dashboard; tenant admins go to their scoped one
  const slug = route.params.organizationSlug
    || agencyStore.currentAgency?.slug
    || agencyStore.currentAgency?.portal_url;
  if (slug) {
    router.push(`/${slug}/admin-dashboard`);
  } else {
    router.push('/admin-dashboard');
  }
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
  background: #0ea5e9;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.beta-banner-try:hover {
  background: #0284c7;
}

</style>
