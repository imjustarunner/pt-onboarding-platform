<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <h2>Upload & Assign Document</h2>
      <p class="subtitle">Upload a document that will only be visible to this user</p>
      
      <form @submit.prevent="handleUpload">
        <div class="form-group">
          <label>Document Name *</label>
          <input v-model="formData.name" type="text" required />
        </div>
        
        <div class="form-group">
          <label>Description</label>
          <textarea v-model="formData.description" rows="3"></textarea>
        </div>

        <div class="form-group">
          <label>Document Type *</label>
          <select v-model="formData.documentType" required>
            <option value="">Select document type</option>
            <option value="acknowledgment">Acknowledgment</option>
            <option value="authorization">Authorization</option>
            <option value="agreement">Agreement</option>
            <option value="compliance">Compliance</option>
            <option value="disclosure">Disclosure</option>
            <option value="consent">Consent</option>
            <option value="administrative">Administrative</option>
          </select>
        </div>

        <div class="form-group">
          <label>Document Action Type *</label>
          <div class="action-type-buttons">
            <button
              type="button"
              @click="formData.documentActionType = 'signature'"
              :class="['action-btn', { active: formData.documentActionType === 'signature' }]"
            >
              Require Electronic Signature
            </button>
            <button
              type="button"
              @click="formData.documentActionType = 'review'"
              :class="['action-btn', { active: formData.documentActionType === 'review' }]"
            >
              Review/Acknowledgment Only
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>PDF File *</label>
          <input
            type="file"
            accept=".pdf"
            @change="handleFileSelect"
            required
            ref="fileInput"
          />
          <small v-if="selectedFile">Selected: {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</small>
        </div>

        <div class="form-group">
          <label>Due Date (Optional)</label>
          <input v-model="formData.dueDate" type="datetime-local" />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="uploading || !selectedFile || !formData.documentType">
            {{ uploading ? 'Uploading & Assigning...' : 'Upload & Assign' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';

const authStore = useAuthStore();

const props = defineProps({
  userId: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['close', 'uploaded']);

const formData = ref({
  name: '',
  description: '',
  documentType: 'administrative',
  documentActionType: 'signature',
  dueDate: ''
});

const selectedFile = ref(null);
const fileInput = ref(null);
const uploading = ref(false);
const error = ref('');

const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (file) {
    if (file.type !== 'application/pdf') {
      error.value = 'Please select a PDF file';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      error.value = 'File size must be less than 10MB';
      return;
    }
    selectedFile.value = file;
    error.value = '';

    // Auto-fill name from filename if not set
    if (!formData.value.name) {
      formData.value.name = file.name.replace('.pdf', '');
    }
  }
};

const handleUpload = async () => {
  if (!selectedFile.value) {
    error.value = 'Please select a PDF file';
    return;
  }

  if (!formData.value.documentType) {
    error.value = 'Please select a document type';
    return;
  }

  try {
    uploading.value = true;
    error.value = '';

    const formDataToSend = new FormData();
    const resolvedName =
      (formData.value.name || '').trim() ||
      (selectedFile.value?.name ? selectedFile.value.name.replace(/\.pdf$/i, '') : '');
    formDataToSend.append('file', selectedFile.value);
    formDataToSend.append('name', resolvedName);
    formDataToSend.append('description', formData.value.description || '');
    formDataToSend.append('documentType', formData.value.documentType);
    formDataToSend.append('userId', props.userId.toString());
    formDataToSend.append('documentActionType', formData.value.documentActionType);
    if (formData.value.dueDate) {
      formDataToSend.append('dueDate', formData.value.dueDate);
    }

    // First create the task
    const TaskAssignmentService = (await import('../../store/tasks')).default;
    const taskData = {
      taskType: 'document',
      documentActionType: formData.value.documentActionType,
      title: formData.value.documentActionType === 'signature' ? `Sign ${formData.value.name}` : `Review ${formData.value.name}`,
      description: formData.value.description || '',
      referenceId: null, // Will be set after user-specific document is created
      assignedByUserId: authStore.user.id,
      assignedToUserId: props.userId,
      dueDate: formData.value.dueDate || null
    };
    
    const taskResponse = await api.post('/tasks', taskData);
    const task = taskResponse.data;

    // Now create the user-specific document
    formDataToSend.append('userId', props.userId.toString());
    formDataToSend.append('taskId', task.id.toString());

    // NOTE: do not set Content-Type manually for FormData; the browser must include boundary
    const response = await api.post('/user-specific-documents/upload', formDataToSend);

    // Update task with reference to user-specific document
    await api.put(`/tasks/${task.id}`, {
      referenceId: response.data.id
    });

    // Success - user-specific document and task were created
    if (response.data) {
      emit('uploaded', { document: response.data, task });
      emit('close');
    } else {
      error.value = 'Document uploaded but task assignment failed. Please try assigning manually.';
    }
    
    // Reset form
    formData.value = {
      name: '',
      description: '',
      documentType: 'administrative',
      documentActionType: 'signature',
      dueDate: ''
    };
    selectedFile.value = null;
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to upload and assign document';
  } finally {
    uploading.value = false;
  }
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.subtitle {
  color: var(--text-secondary);
  margin-bottom: 24px;
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input[type="text"],
.form-group input[type="file"],
.form-group input[type="datetime-local"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.radio-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
  cursor: pointer;
}

.radio-group input[type="radio"] {
  width: auto;
  margin: 0;
}

.error-message {
  color: #dc3545;
  margin-bottom: 16px;
  padding: 12px;
  background: #f8d7da;
  border-radius: 8px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.action-type-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.action-btn {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--border, #ddd);
  border-radius: 8px;
  background: white;
  color: var(--text-primary, #333);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--primary-color, #007bff);
  background: #f8f9fa;
}

.action-btn.active {
  border-color: var(--primary-color, #007bff);
  background: var(--primary-color, #007bff);
  color: white;
}

.info-text {
  color: var(--text-secondary, #666);
  font-size: 13px;
  margin: 0;
}
</style>

