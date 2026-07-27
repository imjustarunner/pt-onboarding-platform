<template>
  <div class="container pyu-admin-page">
    <header class="pyu-admin-page__head">
      <router-link class="muted back" :to="hubTo">← School Portals</router-link>
      <h1>Provider Year Update</h1>
    </header>
    <p v-if="!ready" class="muted">Loading agency context…</p>
    <ProviderYearUpdateAdminPanel v-else-if="agencyId" :agency-id="agencyId" />
    <p v-else class="muted">Select an agency context to manage Provider Year Update.</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import ProviderYearUpdateAdminPanel from '../../components/admin/ProviderYearUpdateAdminPanel.vue';

const route = useRoute();
const agencyStore = useAgencyStore();
const ready = ref(false);

const agencyId = computed(() => {
  const fromQuery = Number(route.query.agencyId || 0);
  if (fromQuery > 0) return fromQuery;
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const fromCurrent = Number(current?.id || agencyStore.currentAgencyId || 0);
  if (fromCurrent > 0) return fromCurrent;
  const list = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
  const firstAgency = (list || []).find(
    (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
  );
  return firstAgency?.id ? Number(firstAgency.id) : null;
});

onMounted(async () => {
  try {
    await agencyStore.fetchUserAgencies?.();
  } catch {
    // keep going with whatever agency context is already available
  } finally {
    ready.value = true;
  }
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
