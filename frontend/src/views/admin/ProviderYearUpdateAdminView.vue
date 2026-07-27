<template>
  <div class="container pyu-admin-page">
    <header class="pyu-admin-page__head">
      <router-link class="muted back" :to="hubTo">← School Portals</router-link>
      <h1>Provider Year Update</h1>
    </header>
    <ProviderYearUpdateAdminPanel v-if="agencyId" :agency-id="agencyId" />
    <p v-else class="muted">Select an agency context to manage Provider Year Update.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../stores/agency';
import ProviderYearUpdateAdminPanel from '../../components/admin/ProviderYearUpdateAdminPanel.vue';

const route = useRoute();
const agencyStore = useAgencyStore();

const agencyId = computed(() => {
  const fromStore = Number(agencyStore.currentAgencyId || agencyStore.currentAgency?.id || 0);
  if (fromStore > 0) return fromStore;
  return Number(route.query.agencyId || 0) || null;
});

const hubTo = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}/admin/school-portals-hub` : '/admin/school-portals-hub';
});
</script>

<style scoped>
.pyu-admin-page {
  padding-top: 1rem;
  padding-bottom: 2.5rem;
  max-width: 1200px;
}
.pyu-admin-page__head h1 {
  margin: 4px 0 16px;
  color: #0c4a6e;
}
.back {
  text-decoration: none;
  font-size: 0.9rem;
}
.muted { color: #64748b; }
</style>
