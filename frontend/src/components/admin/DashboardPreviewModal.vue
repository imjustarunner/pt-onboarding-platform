<template>
  <div v-if="show" class="modal-overlay" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Preview Dashboard</h2>
        <button @click="handleClose" class="btn-close" aria-label="Close">×</button>
      </div>
      
      <div class="modal-body">
        <div class="preview-selector">
          <label for="dashboard-type">Select Dashboard Type:</label>
          <select 
            id="dashboard-type" 
            v-model="selectedDashboard" 
            class="dashboard-select"
          >
            <option value="login">Login Dashboard</option>
            <option value="prehire_open">Pre-hire Welcome Dashboard (PREHIRE_OPEN)</option>
            <option value="prehire_review">Pre-hire Review/Waiting Dashboard (PREHIRE_REVIEW)</option>
            <option value="onboarding">Onboarding Dashboard (ONBOARDING)</option>
            <option value="active_employee">Regular User Dashboard (ACTIVE_EMPLOYEE)</option>
            <option value="admin">Admin Dashboard</option>
          </select>
        </div>
        
        <div class="preview-container" ref="previewContainer">
          <div v-if="loading" class="loading">Loading preview...</div>
          <div v-else class="preview-content">
            <LoginPreview 
              v-if="selectedDashboard === 'login'"
              :agency-id="agencyId"
            />
            <DashboardPreview 
              v-else-if="selectedDashboard.startsWith('prehire_') || selectedDashboard === 'onboarding' || selectedDashboard === 'active_employee'"
              :agency-id="agencyId"
              :status="getStatusForDashboard(selectedDashboard)"
            />
            <AdminDashboardPreview 
              v-else-if="selectedDashboard === 'admin'"
              :agency-id="agencyId"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import LoginPreview from './preview/LoginPreview.vue';
import DashboardPreview from './preview/DashboardPreview.vue';
import AdminDashboardPreview from './preview/AdminDashboardPreview.vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: {
    type: Number,
    required: true
  },
  show: {
    type: Boolean,
    required: true
  }
});

const emit = defineEmits(['close']);

const agencyStore = useAgencyStore();
const selectedDashboard = ref('login');
const loading = ref(true);
const previewContainer = ref(null);
const originalAgency = ref(null);

const getStatusForDashboard = (dashboardType) => {
  const statusMap = {
    'prehire_open': 'PREHIRE_OPEN',
    'prehire_review': 'PREHIRE_REVIEW',
    'onboarding': 'ONBOARDING',
    'active_employee': 'ACTIVE_EMPLOYEE'
  };
  return statusMap[dashboardType] || 'ACTIVE_EMPLOYEE';
};

const handleClose = () => {
  // Restore original agency context
  if (originalAgency.value) {
    agencyStore.setCurrentAgency(originalAgency.value);
  } else {
    agencyStore.setCurrentAgency(null);
  }
  emit('close');
};

const setupAgencyContext = async () => {
  // Save current agency context
  originalAgency.value = agencyStore.currentAgency;
  
  // Fetch and set agency for preview
  try {
    const response = await api.get(`/agencies/${props.agencyId}`);
    agencyStore.setCurrentAgency(response.data);
    loading.value = false;
  } catch (error) {
    console.error('Failed to fetch agency for preview:', error);
    loading.value = false;
  }
};

watch(() => props.show, async (newValue) => {
  if (newValue) {
    await setupAgencyContext();
  }
});

onMounted(async () => {
  if (props.show) {
    await setupAgencyContext();
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 95vw;
  max-height: 95vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 2px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 24px;
}

.btn-close {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.modal-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-selector {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
}

.preview-selector label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.dashboard-select {
  width: 100%;
  padding: 10px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s;
}

.dashboard-select:hover {
  border-color: var(--primary);
}

.dashboard-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(198, 154, 43, 0.1);
}

.preview-container {
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: var(--bg-alt);
  position: relative;
}

.preview-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border: 2px solid var(--border);
  min-height: 500px;
  position: relative;
  overflow: hidden;
}

.preview-content::before {
  content: 'PREVIEW';
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(198, 154, 43, 0.1);
  color: var(--primary);
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  z-index: 10;
  pointer-events: none;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>
