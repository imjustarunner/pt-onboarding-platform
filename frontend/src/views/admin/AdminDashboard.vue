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
import { isSupervisor } from '../../utils/helpers.js';
import SuperAdminDashboard from './SuperAdminDashboard.vue';
import AgencyAdminDashboard from './AgencyAdminDashboard.vue';

const authStore = useAuthStore();
const user = computed(() => authStore.user);

onMounted(() => {
  console.log('AdminDashboard mounted');
  console.log('User:', user.value);
  console.log('User role:', user.value?.role);
  console.log('User status:', user.value?.status);
  console.log('Is super_admin?', user.value?.role === 'super_admin');
  
  // Debug: Check if role is set correctly
  if (user.value?.role !== 'super_admin' && user.value?.role !== 'admin') {
    console.warn('⚠️ User role is not admin or super_admin:', user.value?.role);
    console.warn('Full user object:', JSON.stringify(user.value, null, 2));
  }
});
</script>

