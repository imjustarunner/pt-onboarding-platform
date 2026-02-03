<template>
  <!-- For portal orgs (schools/programs/learning), use the school portal dashboard; otherwise use standard dashboard -->
  <SchoolPortalView v-if="isPortalOrg" />
  <DashboardView v-else />
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useOrganizationStore } from '../store/organization';
import DashboardView from './DashboardView.vue';
import SchoolPortalView from './school/SchoolPortalView.vue';

const route = useRoute();
const organizationStore = useOrganizationStore();

const organizationType = computed(() => {
  return organizationStore.organizationContext?.organizationType || 'agency';
});

const isPortalOrg = computed(() => {
  const t = String(organizationType.value || '').toLowerCase();
  return t === 'school' || t === 'program' || t === 'learning';
});

const ensureOrgLoaded = async () => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) {
    // Best-effort: if already loaded for this slug, avoid refetch.
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

