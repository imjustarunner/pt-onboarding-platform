<template>
  <div class="pyu-flow-page">
    <div class="pyu-flow-bar">
      <router-link class="muted" :to="hubTo">← Provider Year Update</router-link>
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
const hubTo = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}/provider/year-update` : '/provider/year-update';
});
</script>

<style scoped>
.pyu-flow-page {
  min-height: 100vh;
  background: #f8fafc;
}
.pyu-flow-bar {
  max-width: 1100px;
  margin: 0 auto;
  padding: 12px 20px 0;
}
.pyu-flow-bar a {
  text-decoration: none;
  font-size: 0.9rem;
}
.muted { color: #64748b; }
</style>
