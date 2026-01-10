<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <h2>{{ copyToAgency ? 'Copy Training Focus to Agency' : 'Duplicate Training Focus' }}: {{ track.name }}</h2>
      
      <div v-if="loadingPreview" class="loading">Loading preview...</div>
      <div v-else-if="previewError" class="error">{{ previewError }}</div>
      
      <form v-else @submit.prevent="handleCopy">
        <div class="form-group" v-if="copyToAgency">
          <label>Target Agency *</label>
          <select v-model="targetAgencyId" @change="loadPreview" required>
            <option value="">Select agency</option>
            <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>
        
        <div class="form-group">
          <label>New Training Focus Name *</label>
          <input v-model="newTrackName" type="text" required />
        </div>
        
        <div v-if="preview" class="preview-section">
          <h3>Preview</h3>
          <div class="preview-item">
            <label>Original Name:</label>
            <p class="original-text">{{ preview.originalName }}</p>
          </div>
          <div class="preview-item">
            <label>New Training Focus Name:</label>
            <p class="preview-text">{{ preview.previewName || newTrackName }}</p>
          </div>
          <div v-if="preview.originalDescription" class="preview-item">
            <label>Original Description:</label>
            <p class="original-text">{{ preview.originalDescription }}</p>
          </div>
          <div v-if="preview.previewDescription" class="preview-item">
            <label>New Description:</label>
            <p class="preview-text">{{ preview.previewDescription }}</p>
          </div>
          <div class="preview-item">
            <label>Modules to Copy:</label>
            <p class="preview-text">{{ preview.moduleCount }} modules</p>
          </div>
        </div>
        
        <div class="form-group" v-if="copyToAgency && targetAgencyId">
          <label>Assign as On-Demand</label>
          <button 
            type="button"
            @click="toggleOnDemandAssignment"
            :class="['btn', 'btn-sm', assignAsOnDemand ? 'btn-danger' : 'btn-info']"
            :disabled="copying"
          >
            {{ assignAsOnDemand ? 'Remove as On-Demand' : 'Assign as On-Demand' }}
          </button>
          <small style="display: block; margin-top: 4px; color: var(--text-secondary);">
            {{ assignAsOnDemand ? 'The copied training focus will be assigned as on-demand for the selected agency.' : 'Click to assign the copied training focus as on-demand for the selected agency.' }}
          </small>
        </div>
        
        <div class="info-box">
          <p><strong>Note:</strong> This will create a completely independent copy of the training focus. All modules (videos, slides, quizzes) will be copied with variable substitutions applied if copying between agencies.</p>
        </div>
        
        <div class="modal-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="!newTrackName || copying">
            {{ copying ? 'Copying...' : (copyToAgency ? 'Copy Track' : 'Duplicate Track') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  track: {
    type: Object,
    required: true
  },
  copyToAgency: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'copied']);

const agencyStore = useAgencyStore();
const availableAgencies = ref([]);
const targetAgencyId = ref('');
const newTrackName = ref('');
const preview = ref(null);
const loadingPreview = ref(false);
const previewError = ref('');
const copying = ref(false);
const assignAsOnDemand = ref(false);

const loadAgencies = async () => {
  try {
    await agencyStore.fetchAgencies();
    availableAgencies.value = agencyStore.agencies;
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const loadPreview = async () => {
  if (copyToAgency && !targetAgencyId.value) return;
  
  try {
    loadingPreview.value = true;
    previewError.value = '';
    const response = await api.get(`/training-focuses/${props.track.id}/copy-preview`, {
      params: {
        targetAgencyId: targetAgencyId.value || undefined
      }
    });
    preview.value = response.data;
    if (!newTrackName.value) {
      newTrackName.value = preview.value.previewName || `${props.track.name} (Copy)`;
    }
  } catch (err) {
    previewError.value = err.response?.data?.error?.message || 'Failed to load preview';
  } finally {
    loadingPreview.value = false;
  }
};

watch([targetAgencyId], () => {
  if (copyToAgency && targetAgencyId.value) {
    loadPreview();
  }
});

watch(() => newTrackName.value, () => {
  if (preview.value && newTrackName.value) {
    preview.value.previewName = newTrackName.value;
  }
});

const toggleOnDemandAssignment = () => {
  assignAsOnDemand.value = !assignAsOnDemand.value;
};

const handleCopy = async () => {
  if (!newTrackName.value) return;
  
  try {
    copying.value = true;
    let response;
    
    if (props.copyToAgency) {
      if (!targetAgencyId.value) return;
      response = await api.post(`/training-focuses/${props.track.id}/copy`, {
        targetAgencyId: parseInt(targetAgencyId.value),
        newTrackName: newTrackName.value
      });
      
      // If on-demand assignment is requested, assign the copied training focus
      if (assignAsOnDemand.value && response.data && response.data.id) {
        try {
          await api.post('/agency-on-demand-training/training-focus', {
            agencyId: parseInt(targetAgencyId.value),
            trainingFocusId: response.data.id
          });
        } catch (onDemandErr) {
          console.error('Failed to assign copied training focus as on-demand:', onDemandErr);
          // Don't fail the copy operation if on-demand assignment fails
          alert('Training focus copied successfully, but failed to assign as on-demand. You can assign it manually from the edit modal.');
        }
      }
    } else {
      await api.post(`/training-focuses/${props.track.id}/duplicate`, {
        newTrackName: newTrackName.value
      });
    }
    
    emit('copied');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to copy training focus');
  } finally {
    copying.value = false;
  }
};

onMounted(async () => {
  newTrackName.value = `${props.track.name} (Copy)`;
  if (props.copyToAgency) {
    await loadAgencies();
  } else {
    // For duplication, load preview immediately
    await loadPreview();
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
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 700px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 24px;
  color: var(--text-primary);
}

.preview-section {
  margin: 24px 0;
  padding: 20px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px solid var(--border);
}

.preview-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--text-primary);
  font-size: 18px;
}

.preview-item {
  margin-bottom: 16px;
}

.preview-item label {
  display: block;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.original-text {
  color: var(--text-secondary);
  font-style: italic;
  margin: 0;
  padding: 8px;
  background: white;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.preview-text {
  color: var(--text-primary);
  font-weight: 500;
  margin: 0;
  padding: 8px;
  background: white;
  border-radius: 4px;
  border: 2px solid var(--primary);
}

.info-box {
  margin: 24px 0;
  padding: 16px;
  background: #fef3c7;
  border-left: 4px solid var(--warning);
  border-radius: 4px;
}

.info-box p {
  margin: 0;
  color: #92400e;
  font-size: 14px;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}
</style>

