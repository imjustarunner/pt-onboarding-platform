<template>
  <div class="pyu-flow-page">
    <div class="pyu-flow-bar">
      <router-link class="muted" :to="dashboardTo">← My Dashboard</router-link>
    </div>
    <ProviderYearUpdateDashboard mode="provider" :initial-section="initialSection" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ProviderYearUpdateDashboard from '../../components/provider/ProviderYearUpdateDashboard.vue';

const route = useRoute();
const initialSection = computed(() => String(route.query.section || ''));
const dashboardTo = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}/dashboard` : '/dashboard';
});
</script>

<style scoped>
.pyu-flow-page {
  min-height: 100vh;
  background: #f8fafc;
}
.pyu-flow-bar {
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 12px 28px 0;
  box-sizing: border-box;
}
.pyu-flow-bar a {
  text-decoration: none;
  font-size: 0.9rem;
}
.muted { color: #64748b; }
</style>
