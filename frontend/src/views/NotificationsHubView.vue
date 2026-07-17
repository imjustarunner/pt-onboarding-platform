<template>
  <UnifiedNotificationsHubView v-if="notificationsV2Enabled" />
  <SupervisorNotificationsView v-else-if="useSupervisorLegacy" />
  <LegacyAdminNotificationsView v-else />
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import UnifiedNotificationsHubView from './UnifiedNotificationsHubView.vue';
import SupervisorNotificationsView from './SupervisorNotificationsView.vue';
import LegacyAdminNotificationsView from './admin/NotificationsView.vue';

const route = useRoute();
const authStore = useAuthStore();

// Local/default builds use V2. Deployments can explicitly set the flag to false
// while retaining the compatibility views for a staged rollout.
const notificationsV2Enabled = import.meta.env.VITE_NOTIFICATIONS_V2 !== 'false';
const useSupervisorLegacy = computed(() => (
  String(route.query.scope || '') === 'team'
  || String(authStore.user?.role || '').toLowerCase() === 'supervisor'
));
</script>
