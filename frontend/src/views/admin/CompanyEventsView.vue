<template>
  <div class="container company-events-page">
    <div class="page-head">
      <h1>Club Events</h1>
      <p class="muted">Create RSVPs for virtual or in-person events, run club meetups, and potlucks.</p>
    </div>

    <div v-if="!agencyId" class="error">No club selected. Choose a club first.</div>
    <div v-else-if="sscManagerOnlyDenied" class="error">
      Only club managers and assistant managers can manage club events in this tenant.
    </div>
    <CompanyEventsManager v-else :agency-id="agencyId" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import CompanyEventsManager from '../../components/admin/CompanyEventsManager.vue';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);
const sscManagerOnlyDenied = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  if (slug !== 'ssc' && slug !== 'sstc') return false;
  const role = String(authStore.user?.role || '').trim().toLowerCase();
  return !['admin', 'super_admin', 'provider_plus', 'club_manager'].includes(role);
});
</script>

<style scoped>
.company-events-page {
  display: grid;
  gap: 12px;
}
.page-head h1 {
  margin: 0;
}
</style>

