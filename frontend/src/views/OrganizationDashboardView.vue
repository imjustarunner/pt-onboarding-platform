<template>
  <!-- Programs get a dedicated dashboard tuned for events; schools/learning use the school portal; agencies use the standard dashboard. -->
  <ProgramPortalView v-if="isProgramPortal" :preview-mode="isSuperadminPreview" />
  <SchoolPortalView v-else-if="isPortalOrg" :preview-mode="isSuperadminPreview" />
  <DashboardView
    v-else
    :preview-mode="isSuperadminPreview"
    :preview-status="previewStatus"
    :preview-data="previewData"
  />
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useOrganizationStore } from '../store/organization';
import { useSuperadminPlatformPreview } from '../composables/useSuperadminPlatformPreview';
import { createMockDashboardData } from '../utils/previewUtils';
import DashboardView from './DashboardView.vue';
import SchoolPortalView from './school/SchoolPortalView.vue';
import ProgramPortalView from './program/ProgramPortalView.vue';

const route = useRoute();
const organizationStore = useOrganizationStore();
const { isSuperadminPreview } = useSuperadminPlatformPreview({ route });

const previewStatus = computed(() => {
  if (!isSuperadminPreview.value) return null;
  const raw = String(route.query?.previewStatus || 'ACTIVE_EMPLOYEE').trim().toUpperCase();
  const allowed = new Set(['PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING', 'ACTIVE_EMPLOYEE']);
  return allowed.has(raw) ? raw : 'ACTIVE_EMPLOYEE';
});

const previewData = computed(() => {
  if (!isSuperadminPreview.value || !previewStatus.value) return null;
  return createMockDashboardData(previewStatus.value);
});

const organizationType = computed(() => {
  return organizationStore.organizationContext?.organizationType || 'agency';
});

const isPortalOrg = computed(() => {
  const t = String(organizationType.value || '').toLowerCase();
  return t === 'school' || t === 'program' || t === 'learning';
});

const isProgramPortal = computed(() => {
  return String(organizationType.value || '').toLowerCase() === 'program';
});

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
