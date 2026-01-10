<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <h2>Copy Module: {{ module.title }}</h2>
      
      <div v-if="loadingPreview" class="loading">Loading preview...</div>
      <div v-else-if="previewError" class="error">{{ previewError }}</div>
      
      <form v-else @submit.prevent="handleCopy">
        <div class="form-group">
          <label>Target Agency *</label>
          <select v-model="targetAgencyId" @change="loadPrograms" required>
            <option value="">Select agency</option>
            <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>
        
        <div class="form-group" v-if="targetAgencyId">
          <label>Target Track (Optional)</label>
          <select v-model="targetTrackId" @change="loadPreview">
            <option value="">No track (Agency-level)</option>
            <option v-for="track in availableTracks" :key="track.id" :value="track.id">
              {{ track.name }}
            </option>
          </select>
        </div>
        
        <div v-if="preview" class="preview-section">
          <h3>Preview</h3>
          <div class="preview-item">
            <label>Original Title:</label>
            <p class="original-text">{{ preview.originalTitle }}</p>
          </div>
          <div class="preview-item">
            <label>Copied Title:</label>
            <p class="preview-text">{{ preview.previewTitle }}</p>
          </div>
          <div v-if="preview.originalDescription" class="preview-item">
            <label>Original Description:</label>
            <p class="original-text">{{ preview.originalDescription }}</p>
          </div>
          <div v-if="preview.previewDescription" class="preview-item">
            <label>Copied Description:</label>
            <p class="preview-text">{{ preview.previewDescription }}</p>
          </div>
        </div>
        
        <div class="form-group" v-if="targetAgencyId">
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
            {{ assignAsOnDemand ? 'The copied module will be assigned as on-demand for the selected agency.' : 'Click to assign the copied module as on-demand for the selected agency.' }}
          </small>
        </div>
        
        <div class="info-box">
          <p><strong>Note:</strong> This will create a completely independent copy of the module. All content (videos, slides, quizzes) will be copied with variable substitutions applied.</p>
        </div>
        
        <div class="modal-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="!targetAgencyId || copying">
            {{ copying ? 'Copying...' : 'Copy Module' }}
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
  module: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close', 'copied']);

const agencyStore = useAgencyStore();
const availableAgencies = ref([]);
const availableTracks = ref([]);
const targetAgencyId = ref('');
const targetTrackId = ref('');
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

const loadTracks = async () => {
  if (!targetAgencyId.value) {
    availableTracks.value = [];
    return;
  }
  
  try {
    const response = await api.get(`/tracks?agencyId=${targetAgencyId.value}`);
    availableTracks.value = response.data;
    targetTrackId.value = '';
    await loadPreview();
  } catch (err) {
    console.error('Failed to load tracks:', err);
  }
};

const loadPreview = async () => {
  if (!targetAgencyId.value) return;
  
  try {
    loadingPreview.value = true;
    previewError.value = '';
    const response = await api.get(`/modules/${props.module.id}/copy-preview`, {
      params: {
        targetAgencyId: targetAgencyId.value,
        targetTrackId: targetTrackId.value || undefined
      }
    });
    preview.value = response.data;
  } catch (err) {
    previewError.value = err.response?.data?.error?.message || 'Failed to load preview';
  } finally {
    loadingPreview.value = false;
  }
};

watch([targetAgencyId, targetTrackId], () => {
  if (targetAgencyId.value) {
    loadTracks();
    loadPreview();
  }
});

const toggleOnDemandAssignment = () => {
  assignAsOnDemand.value = !assignAsOnDemand.value;
};

const handleCopy = async () => {
  if (!targetAgencyId.value) return;
  
  try {
    copying.value = true;
    const response = await api.post(`/modules/${props.module.id}/copy`, {
      targetAgencyId: parseInt(targetAgencyId.value),
      targetTrackId: targetTrackId.value ? parseInt(targetTrackId.value) : null
    });
    
    // If on-demand assignment is requested, assign the copied module
    if (assignAsOnDemand.value && response.data && response.data.id) {
      try {
        await api.post('/agency-on-demand-training/module', {
          agencyId: parseInt(targetAgencyId.value),
          moduleId: response.data.id
        });
      } catch (onDemandErr) {
        console.error('Failed to assign copied module as on-demand:', onDemandErr);
        // Don't fail the copy operation if on-demand assignment fails
        alert('Module copied successfully, but failed to assign as on-demand. You can assign it manually from the edit modal.');
      }
    }
    
    emit('copied');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to copy module');
  } finally {
    copying.value = false;
  }
};

onMounted(async () => {
  await loadAgencies();
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

