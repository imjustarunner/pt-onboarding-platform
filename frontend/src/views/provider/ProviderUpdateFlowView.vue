<template>
  <div class="pu-auth-flow">
    <p v-if="!ready" class="muted">Loading…</p>
    <ProviderUpdateDashboard
      v-else-if="agencyId"
      access-mode="auth"
      :agency-id="agencyId"
      :agency-name="agencyName"
    />
    <p v-else class="muted">Select an agency context to continue your Provider Update.</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import ProviderUpdateDashboard from '../../components/provider/ProviderUpdateDashboard.vue';

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
  const first = (list || []).find(
    (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
  );
  return first?.id ? Number(first.id) : null;
});

const agencyName = computed(() => {
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return current?.name || 'ITSCO';
});

onMounted(async () => {
  try {
    await agencyStore.fetchUserAgencies?.();
  } finally {
    ready.value = true;
  }
});
</script>

<style scoped>
.pu-auth-flow {
  min-height: 100vh;
  background: #f7f8f6;
}
.muted { color: #64748b; padding: 1.5rem; }
</style>
