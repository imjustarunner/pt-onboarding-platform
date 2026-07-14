<template>
  <div v-if="checking" class="coach-gate">
    <div class="coach-gate-spinner" />
    <span>Loading…</span>
  </div>
  <PublicTeamFinderShell
    v-else-if="isMulti"
    service-type="coaching"
    filter-mode="coaching"
    page-title="Find a Coach"
    provider-noun="coaches"
    search-placeholder="Name or keyword…"
  />
  <PublicPractitionerBookingView v-else />
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import PublicTeamFinderShell from '../../components/publicServices/PublicTeamFinderShell.vue';
import PublicPractitionerBookingView from './PublicPractitionerBookingView.vue';
import { normalizePublicProviders } from '../../utils/publicAgencyServices.js';

const route = useRoute();
const checking = ref(true);
const isMulti = ref(false);

onMounted(async () => {
  const slug = String(route.params.organizationSlug || '').trim();
  if (!slug) {
    checking.value = false;
    return;
  }
  try {
    const weekStart = new Date().toISOString().slice(0, 10);
    const res = await api.get(`/public/agency-services/${encodeURIComponent(slug)}/coaches`, {
      params: {
        bookingMode: 'NEW_CLIENT',
        programType: 'VIRTUAL',
        weekStart
      },
      skipAuthRedirect: true
    });
    const providers = normalizePublicProviders(res.data?.providers);
    isMulti.value = providers.length > 1;
  } catch {
    isMulti.value = false;
  } finally {
    checking.value = false;
  }
});
</script>

<style scoped>
.coach-gate {
  min-height: 40vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: #64748b;
}
.coach-gate-spinner {
  width: 1.75rem;
  height: 1.75rem;
  border: 3px solid #e2e8f0;
  border-top-color: #4338ca;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
