<template>
  <!-- For portal orgs (schools/programs/learning), use the school portal dashboard; otherwise use standard dashboard -->
  <SchoolPortalView v-if="isPortalOrg" />
  <SummitStatsDashboardView v-else-if="useTenantMobileDashboardSurface" />
  <DashboardView v-else />
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useOrganizationStore } from '../store/organization';
import DashboardView from './DashboardView.vue';
import SchoolPortalView from './school/SchoolPortalView.vue';
import SummitStatsDashboardView from './SummitStatsDashboardView.vue';
import { isStandalonePwa } from '../utils/pwa.js';
import { useTenantAppProfile } from '../composables/useTenantAppProfile';

const route = useRoute();
const organizationStore = useOrganizationStore();
const { tenantAppProfile } = useTenantAppProfile();

const organizationType = computed(() => {
  return organizationStore.organizationContext?.organizationType || 'agency';
});

const isPortalOrg = computed(() => {
  const t = String(organizationType.value || '').toLowerCase();
  return t === 'school' || t === 'program' || t === 'learning';
});

const viewportWidth = ref(1280);
const previewViewport = ref('desktop');

const syncViewportState = () => {
  try {
    viewportWidth.value = Math.max(0, window.innerWidth || 0);
  } catch {
    viewportWidth.value = 1280;
  }
  try {
    previewViewport.value = String(document.documentElement?.dataset?.previewViewport || 'desktop').toLowerCase();
  } catch {
    previewViewport.value = 'desktop';
  }
};

const isMobileLikeViewport = computed(() => {
  if (previewViewport.value === 'mobile' || previewViewport.value === 'tablet') return true;
  return viewportWidth.value <= 1024;
});

const useTenantMobileDashboardSurface = computed(() => {
  const wantsSummitStatsMobileDashboard = tenantAppProfile.value.mobileDashboard === 'summit_stats';
  return wantsSummitStatsMobileDashboard && (isMobileLikeViewport.value || isStandalonePwa());
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
  syncViewportState();
  window.addEventListener('resize', syncViewportState, { passive: true });
  window.addEventListener('superadmin-preview-updated', syncViewportState);
  await ensureOrgLoaded();
});

onUnmounted(() => {
  window.removeEventListener('resize', syncViewportState);
  window.removeEventListener('superadmin-preview-updated', syncViewportState);
});
</script>

