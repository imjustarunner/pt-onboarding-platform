<template>
  <div class="dashboard-preview" ref="previewContainer">
    <PreviewBrandingProvider :agency-id="agencyId">
      <DashboardView 
        :key="`dashboard-${status}`"
        :preview-mode="true"
        :preview-status="status"
        :preview-data="mockData"
      />
    </PreviewBrandingProvider>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useAgencyStore } from '../../../store/agency';
import { useBrandingStore } from '../../../store/branding';
import PreviewBrandingProvider from './PreviewBrandingProvider.vue';
import DashboardView from '../../../views/DashboardView.vue';
import api from '../../../services/api';
import { createMockDashboardData } from '../../../utils/previewUtils';

const props = defineProps({
  agencyId: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    required: true,
    validator: (value) => ['PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING', 'ACTIVE_EMPLOYEE'].includes(value)
  }
});

const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const previewContainer = ref(null);
const mockData = ref(createMockDashboardData(props.status));

// Update mock data when status changes
watch(() => props.status, (newStatus) => {
  mockData.value = createMockDashboardData(newStatus);
});

onMounted(async () => {
  // Fetch agency data if not already set
  if (!agencyStore.currentAgency || agencyStore.currentAgency.id !== props.agencyId) {
    try {
      const response = await api.get(`/agencies/${props.agencyId}`);
      agencyStore.setCurrentAgency(response.data);
    } catch (error) {
      console.error('Failed to fetch agency for preview:', error);
    }
  }
  
  // Fetch platform branding
  await brandingStore.fetchPlatformBranding();
  
  // Disable interactions
  if (previewContainer.value) {
    previewContainer.value.style.pointerEvents = 'none';
  }
});
</script>

<style scoped>
.dashboard-preview {
  pointer-events: none;
  user-select: none;
  min-height: 600px;
}
</style>
