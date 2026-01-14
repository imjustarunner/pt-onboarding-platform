<template>
  <div class="admin-dashboard-preview" ref="previewContainer">
    <PreviewBrandingProvider :agency-id="agencyId">
      <AgencyAdminDashboard 
        :preview-mode="true"
        :preview-stats="mockStats"
      />
    </PreviewBrandingProvider>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAgencyStore } from '../../../store/agency';
import { useBrandingStore } from '../../../store/branding';
import PreviewBrandingProvider from './PreviewBrandingProvider.vue';
import AgencyAdminDashboard from '../../../views/admin/AgencyAdminDashboard.vue';
import api from '../../../services/api';
import { createMockAdminStats } from '../../../utils/previewUtils';

const props = defineProps({
  agencyId: {
    type: Number,
    required: true
  }
});

const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const previewContainer = ref(null);
const mockStats = ref(createMockAdminStats());

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
.admin-dashboard-preview {
  pointer-events: none;
  user-select: none;
  min-height: 600px;
}
</style>
