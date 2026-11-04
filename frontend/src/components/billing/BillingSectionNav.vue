<template>
  <nav class="billing-section-nav" aria-label="Billing setup">
    <router-link v-for="item in items" :key="item.id" :to="destination(item.id)" :aria-current="item.id === current ? 'page' : null">
      {{ item.label }}
    </router-link>
  </nav>
</template>

<script setup>
import { useRoute } from 'vue-router';

defineProps({
  current: { type: String, required: true }
});

const route = useRoute();
const items = [
  { id: 'service-codes', label: 'Service codes' },
  { id: 'fee-schedule', label: 'Fee schedule' },
  { id: 'billing-rules', label: 'Billing rules' },
  { id: 'billing-settings', label: 'Billing settings' }
];

function destination(item) {
  return { path: route.path, query: { ...route.query, category: 'general', item } };
}
</script>

<style scoped>
.billing-section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 22px;
}
.billing-section-nav a {
  border: 1px solid var(--line, #e4e7ec);
  border-radius: 999px;
  color: var(--brand-ink, #1d2633);
  padding: 7px 12px;
  text-decoration: none;
  background: #fff;
}
.billing-section-nav a[aria-current='page'] {
  background: var(--brand-ink, #1d2633);
  border-color: var(--brand-ink, #1d2633);
  color: #fff;
}
</style>
