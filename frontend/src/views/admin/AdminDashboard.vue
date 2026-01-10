<template>
  <div v-if="!user">
    <div class="container">
      <div class="loading">Loading...</div>
    </div>
  </div>
  <SuperAdminDashboard v-else-if="user?.role === 'super_admin'" />
  <AgencyAdminDashboard v-else-if="user?.role === 'admin' || user?.role === 'support' || isSupervisor(user) || user?.role === 'clinical_practice_assistant'" />
  <div v-else class="container">
    <div class="error">Access denied. This dashboard is only available to administrators, supervisors, and clinical practice assistants.</div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { isSupervisor } from '../../utils/helpers.js';
import SuperAdminDashboard from './SuperAdminDashboard.vue';
import AgencyAdminDashboard from './AgencyAdminDashboard.vue';

const authStore = useAuthStore();
const user = computed(() => authStore.user);

onMounted(() => {
  console.log('AdminDashboard mounted');
  console.log('User:', user.value);
  console.log('User role:', user.value?.role);
});
</script>

