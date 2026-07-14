<template>
  <LifeCoachClientDashboardView v-if="isLifeCoach" />
  <ConsultantClientDashboardView v-else-if="isConsultant" />
  <div v-else class="client-dashboard-fallback">
    <p>This organization does not use the practitioner client dashboard.</p>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useOrganizationStore } from '../store/organization';
import { isConsultantOrgType, isLifeCoachOrgType } from '../utils/practitionerVertical.js';
import LifeCoachClientDashboardView from './practitioner/LifeCoachClientDashboardView.vue';
import ConsultantClientDashboardView from './practitioner/ConsultantClientDashboardView.vue';

const route = useRoute();
const organizationStore = useOrganizationStore();

const organizationType = computed(() => {
  return organizationStore.organizationContext?.organizationType || 'agency';
});

const isLifeCoach = computed(() => isLifeCoachOrgType(organizationType.value));
const isConsultant = computed(() => isConsultantOrgType(organizationType.value));

const ensureOrgLoaded = async () => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) {
    if (organizationStore.organizationContext?.slug !== slug) {
      await organizationStore.fetchBySlug(slug);
    }
  }
};

watch(() => route.params.organizationSlug, async () => {
  await ensureOrgLoaded();
}, { immediate: true });

onMounted(async () => {
  await ensureOrgLoaded();
});
</script>

<style scoped>
.client-dashboard-fallback {
  padding: 2rem;
  color: #64748b;
}
</style>
