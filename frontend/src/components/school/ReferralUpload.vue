<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Upload Referral Packet</h2>
        <button @click="$emit('close')" class="btn-close" aria-label="Close">×</button>
      </div>
      
      <div class="modal-body">
        <form @submit.prevent="handleUpload" class="upload-form">
          <div class="form-group">
            <label for="file-input" class="file-label">
              <div class="file-input-area" :class="{ 'dragover': isDragging }">
                <input
                  id="file-input"
                  type="file"
                  ref="fileInput"
                  @change="handleFileSelect"
                  @dragenter.prevent="isDragging = true"
                  @dragleave.prevent="isDragging = false"
                  @dragover.prevent
                  @drop.prevent="handleFileDrop"
                  accept=".pdf,.jpg,.jpeg,.png"
                  required
                />
                <div v-if="!selectedFile" class="file-placeholder">
                  <span class="file-icon">📄</span>
                  <p>Click to select or drag and drop</p>
                  <p class="file-hint">PDF, JPG, PNG (Max 10MB)</p>
                </div>
                <div v-else class="file-selected">
                  <span class="file-icon">📄</span>
                  <p>{{ selectedFile.name }}</p>
                  <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
                </div>
              </div>
            </label>
          </div>

          <div v-if="error" class="error-message">
            {{ error }}
          </div>

          <div v-if="success" class="success-message">
            {{ success }}
          </div>

          <div v-if="clientId && phiDocumentId" class="ocr-panel">
            <h3>Extract Handwritten Data</h3>
            <p class="muted">Use OCR to extract text and quickly copy details for EHR entry.</p>
            <div class="ocr-actions">
              <button class="btn btn-secondary" type="button" :disabled="ocrLoading" @click="runOcr">
                {{ ocrLoading ? 'Extracting...' : 'Extract Text' }}
              </button>
              <button v-if="ocrText" class="btn btn-secondary" type="button" @click="copyText(ocrText)">
                Copy All Text
              </button>
            </div>
            <div v-if="ocrError" class="error-message">{{ ocrError }}</div>
            <textarea v-if="ocrText" class="ocr-text" readonly :value="ocrText"></textarea>

            <div class="profile-builder">
              <div class="form-group">
                <label>First name (for initials)</label>
                <input v-model="firstName" type="text" placeholder="First name" />
              </div>
              <div class="form-group">
                <label>Last name (for initials)</label>
                <input v-model="lastName" type="text" placeholder="Last name" />
              </div>
              <div class="abbr-row">
                <div class="abbr-code">{{ abbreviatedName || '---' }}</div>
                <button class="btn btn-secondary btn-sm" type="button" :disabled="!abbreviatedName" @click="copyText(abbreviatedName)">
                  Copy Code
                </button>
                <button class="btn btn-primary btn-sm" type="button" :disabled="!abbreviatedName || ocrLoading" @click="applyInitials">
                  Set Client Initials
                </button>
              </div>
              <p class="muted">Format: first three of first name + first three of last name (e.g., AbcDef).</p>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="$emit('close')" class="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!selectedFile || uploading">
              <span v-if="uploading">Uploading...</span>
              <span v-else>Upload Referral Packet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'uploaded']);

const fileInput = ref(null);
const selectedFile = ref(null);
const isDragging = ref(false);
const uploading = ref(false);
const error = ref('');
const success = ref('');
const clientId = ref(null);
const phiDocumentId = ref(null);
const ocrLoading = ref(false);
const ocrError = ref('');
const ocrText = ref('');
const ocrRequestId = ref(null);
const firstName = ref('');
const lastName = ref('');

const abbreviatedName = computed(() => {
  const clean = (value) => String(value || '').replace(/[^A-Za-z]/g, '');
  const part = (value) => {
    const raw = clean(value);
    if (!raw) return '';
    const slice = raw.slice(0, 3);
    return slice.charAt(0).toUpperCase() + slice.slice(1).toLowerCase();
  };
  const code = `${part(firstName.value)}${part(lastName.value)}`.trim();
  return code || '';
});

const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (file) {
    validateAndSetFile(file);
  }
};

const handleFileDrop = (event) => {
  isDragging.value = false;
  const file = event.dataTransfer.files[0];
  if (file) {
    validateAndSetFile(file);
  }
};

const validateAndSetFile = (file) => {
  // Validate file type
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    error.value = 'Please upload a PDF, JPG, or PNG file';
    return;
  }

  // Validate file size (10MB max)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    error.value = 'File size must be less than 10MB';
    return;
  }

  selectedFile.value = file;
  error.value = '';
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const handleUpload = async () => {
  if (!selectedFile.value) {
    error.value = 'Please select a file';
    return;
  }

  uploading.value = true;
  error.value = '';
  success.value = '';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);

    const response = await api.post(`/organizations/${props.organizationSlug}/upload-referral`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    success.value = 'Referral packet uploaded successfully!';
    clientId.value = response.data?.clientId || null;
    phiDocumentId.value = response.data?.phiDocumentId || null;
    
    emit('uploaded', response.data);
  } catch (err) {
    console.error('Upload error:', err);
    error.value = err.response?.data?.error?.message || 'Failed to upload referral packet. Please try again.';
  } finally {
    uploading.value = false;
  }
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text || ''));
  } catch (e) {
    error.value = 'Copy failed. Please try again.';
  }
};

const runOcr = async () => {
  if (!clientId.value) return;
  ocrLoading.value = true;
  ocrError.value = '';
  ocrText.value = '';
  try {
    const req = await api.post(`/referrals/${clientId.value}/ocr`, {
      phiDocumentId: phiDocumentId.value || null
    });
    ocrRequestId.value = req.data?.request?.id || null;
    const result = await api.post(`/referrals/${clientId.value}/ocr/${ocrRequestId.value}/process`);
    ocrText.value = result.data?.request?.result_text || '';
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'OCR failed. Please try again later.';
  } finally {
    ocrLoading.value = false;
  }
};

const applyInitials = async () => {
  if (!clientId.value || !ocrRequestId.value || !abbreviatedName.value) return;
  ocrLoading.value = true;
  ocrError.value = '';
  try {
    await api.post(`/referrals/${clientId.value}/ocr/${ocrRequestId.value}/identify`, {
      firstName: firstName.value,
      lastName: lastName.value
    });
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to set initials.';
  } finally {
    ocrLoading.value = false;
  }
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
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 0;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-bottom: 2px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
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
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.modal-body {
  padding: 32px;
}

.upload-form {
  width: 100%;
}

.ocr-panel {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.ocr-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.ocr-text {
  width: 100%;
  min-height: 180px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  margin-bottom: 12px;
}

.profile-builder {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.abbr-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.abbr-code {
  font-weight: 700;
  letter-spacing: 1px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 6px;
}

.muted {
  color: var(--text-secondary);
}
.form-group {
  margin-bottom: 24px;
}

.file-label {
  display: block;
  width: 100%;
}

.file-input-area {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 60px 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  background: var(--bg-alt);
}

.file-input-area:hover {
  border-color: var(--primary);
  background: white;
}

.file-input-area.dragover {
  border-color: var(--primary);
  background: rgba(var(--primary-rgb, 198, 154, 43), 0.1);
}

.file-input-area input[type="file"] {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
  z-index: -1;
}

.file-placeholder,
.file-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.file-icon {
  font-size: 48px;
  line-height: 1;
}

.file-placeholder p,
.file-selected p {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
}

.file-hint {
  font-size: 14px;
  color: var(--text-secondary);
}

.file-size {
  font-size: 14px;
  color: var(--text-secondary);
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #fcc;
}

.success-message {
  background: #efe;
  color: #3c3;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #cfc;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark, var(--primary));
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--border);
}
</style>
