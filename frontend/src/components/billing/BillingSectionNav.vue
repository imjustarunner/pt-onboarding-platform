<template>
  <nav class="billing-section-nav" aria-label="Billing setup">
    <router-link v-for="item in items" :key="item.id" :to="destination(item.id)" custom v-slot="{href,navigate:routeNavigate}"><a :href="href" :aria-current="item.id === current ? 'page' : null" @click="navigate($event,item.id,routeNavigate)">{{ item.label }}</a></router-link>
  </nav>
</template>

<script setup>
import { useRoute } from 'vue-router';
import { inject } from 'vue';

defineProps({
  current: { type: String, required: true }
});

const route = useRoute();
const selectBillingSection=inject('selectBillingSettings',null);
function navigate(event,item,routeNavigate){if(selectBillingSection && event.button===0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey){event.preventDefault();selectBillingSection(item);return;}routeNavigate(event);}
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
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 8px;
  margin-bottom: 22px;
}
.billing-section-nav a {
  white-space: nowrap;
  flex-shrink: 0;
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
