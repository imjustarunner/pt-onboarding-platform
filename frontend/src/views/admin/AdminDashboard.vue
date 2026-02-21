<template>
  <div v-if="!user">
    <div class="container">
      <div class="loading">Loading...</div>
    </div>
  </div>
  <SuperAdminDashboard v-else-if="user?.role === 'super_admin' || user?.role?.toLowerCase() === 'superadmin'" />
  <AgencyAdminDashboard v-else-if="user?.role === 'admin' || user?.role === 'support' || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" />
  <div v-else class="container">
    <div class="error">Access denied. This dashboard is only available to administrators, supervisors, and clinical practice assistants.</div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { isSupervisor } from '../../utils/helpers.js';
import api from '../../services/api';
import SuperAdminDashboard from './SuperAdminDashboard.vue';
import AgencyAdminDashboard from './AgencyAdminDashboard.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const user = computed(() => authStore.user);

onMounted(() => {
  const role = String(user.value?.role || '').toLowerCase();
  const dashboardType = role === 'super_admin' || role === 'superadmin' ? 'super_admin' : 'agency';
  const agencyId = agencyStore.currentAgency?.value?.id ?? agencyStore.currentAgency?.id ?? null;
  api.post('/auth/activity-log', {
    actionType: 'admin_dashboard_view',
    metadata: { dashboardType, path: '/admin', agencyId }
  }).catch(() => {});
});
</script>

