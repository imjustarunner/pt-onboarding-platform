<template>
  <div class="bulk-client-importer">
    <div class="importer-header">
      <h2>Bulk Client Importer</h2>
      <p class="importer-description">
        Upload a CSV file to import multiple clients at once. This tool is designed for legacy data migration.
      </p>
    </div>

    <div class="importer-content">
      <form @submit.prevent="handleImport" class="import-form">
        <div v-if="isSuperAdmin" class="form-group">
          <label for="agency-select"><strong>Target Agency</strong></label>
          <select id="agency-select" v-model="selectedAgencyId" class="agency-select" required>
            <option value="">Select an agency…</option>
            <option v-for="agency in agencies" :key="agency.id" :value="String(agency.id)">
              {{ agency.name }}
            </option>
          </select>
          <small class="help-text">Super Admin accounts must select which agency the import should be applied to.</small>
        </div>

        <div class="form-group">
          <label for="csv-file" class="file-label">
            <div class="file-input-area" :class="{ 'dragover': isDragging }">
              <input
                id="csv-file"
                type="file"
                ref="fileInput"
                @change="handleFileSelect"
                @dragenter.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @dragover.prevent
                @drop.prevent="handleFileDrop"
                accept=".csv"
                required
              />
              <div v-if="!selectedFile" class="file-placeholder">
                <span class="file-icon">📊</span>
                <p>Click to select or drag and drop CSV file</p>
                <p class="file-hint">CSV format only (Max 10MB)</p>
              </div>
              <div v-else class="file-selected">
                <span class="file-icon">📊</span>
                <p>{{ selectedFile.name }}</p>
                <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
              </div>
            </div>
          </label>
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" v-model="updateExisting" />
            Update existing clients if match found (by agency + school + initials)
          </label>
        </div>

        <div v-if="error" class="error-message">
          <div>{{ error }}</div>
          <div v-if="errorMeta" style="margin-top: 8px;">
            <div v-if="errorMeta.row"><strong>Row:</strong> {{ errorMeta.row }}</div>
            <div v-if="errorMeta.missingFields && errorMeta.missingFields.length">
              <strong>Missing fields:</strong> {{ errorMeta.missingFields.join(', ') }}
            </div>
            <div v-if="errorMeta.foundHeaders && errorMeta.foundHeaders.length" style="margin-top: 6px;">
              <strong>Found headers:</strong>
              <div style="margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px;">
                {{ errorMeta.foundHeaders.join(', ') }}
              </div>
            </div>
            <div v-if="errorMeta.expectedHeaders && errorMeta.expectedHeaders.length" style="margin-top: 6px;">
              <strong>Expected headers (examples):</strong>
              <ul style="margin: 6px 0 0 18px;">
                <li v-for="(h, idx) in errorMeta.expectedHeaders" :key="idx">{{ h }}</li>
              </ul>
            </div>
          </div>
        </div>

        <div v-if="importResults" class="import-results">
          <h3>Import Results</h3>
          <div class="results-stats">
            <p><strong>Total rows processed:</strong> {{ importResults.totalRows || 0 }}</p>
            <p class="stat-success"><strong>Created:</strong> {{ importResults.created || 0 }}</p>
            <p class="stat-info"><strong>Updated:</strong> {{ importResults.updated || 0 }}</p>
            <p class="stat-error"><strong>Errors:</strong> {{ (importResults.errors || []).length }}</p>
          </div>
          <div v-if="importResults.errors && importResults.errors.length > 0" class="error-details">
            <h4>Error Details:</h4>
            <ul>
              <li v-for="(errorDetail, index) in importResults.errors" :key="index">
                Row {{ errorDetail.row }} ({{ errorDetail.initials || 'Unknown' }}): {{ errorDetail.error }}
              </li>
            </ul>
          </div>
          <div v-if="importResults.message" class="success-message">
            {{ importResults.message }}
          </div>
        </div>

        <div class="form-actions">
          <button type="button" @click="resetForm" class="btn btn-secondary" :disabled="importing">
            Reset
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="!selectedFile || importing || (isSuperAdmin && !selectedAgencyId)"
          >
            <span v-if="importing">Importing...</span>
            <span v-else>Import Clients</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const emit = defineEmits(['imported']);

const fileInput = ref(null);
const selectedFile = ref(null);
const isDragging = ref(false);
const importing = ref(false);
const updateExisting = ref(true);
const error = ref('');
const errorMeta = ref(null);
const importResults = ref(null);
const selectedAgencyId = ref('');

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const agencies = computed(() => agencyStore.agencies || []);

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
  if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
    error.value = 'Please upload a CSV file';
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
  errorMeta.value = null;
  importResults.value = null;
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const handleImport = async () => {
  if (!selectedFile.value) {
    error.value = 'Please select a CSV file';
    return;
  }
  if (isSuperAdmin.value && !selectedAgencyId.value) {
    error.value = 'Please select an agency for this bulk import';
    return;
  }

  importing.value = true;
  error.value = '';
  errorMeta.value = null;
  importResults.value = null;

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('updateExisting', updateExisting.value);
    if (isSuperAdmin.value) {
      formData.append('agencyId', selectedAgencyId.value);
    } else if (agencyStore.currentAgency?.id) {
      // For agency admins, pass through for consistency (backend can also infer)
      formData.append('agencyId', String(agencyStore.currentAgency.id));
    }

    // Use the authoritative bulk client upload pipeline (supports auto-create school/provider + jobs)
    const response = await api.post('/bulk-client-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    if (!response.data?.success) {
      throw new Error(response.data?.error?.message || 'Import failed');
    }

    const jobId = response.data.jobId;
    importResults.value = {
      totalRows: response.data.totalRows,
      created: response.data.successRows, // approximate: successful rows processed
      updated: 0,
      errors: [],
      message: `Upload completed. Job #${jobId}: ${response.data.successRows} succeeded, ${response.data.failedRows} failed.`
    };

    const createdSchools = Array.isArray(response.data.createdSchools) ? response.data.createdSchools : [];
    const createdProviders = Array.isArray(response.data.createdProviders) ? response.data.createdProviders : [];
    if (createdSchools.length || createdProviders.length) {
      const schoolLine = createdSchools.length ? `${createdSchools.length} school(s) created` : null;
      const providerLine = createdProviders.length ? `${createdProviders.length} provider(s) created` : null;
      const extra = [schoolLine, providerLine].filter(Boolean).join(', ');
      importResults.value.message = `${importResults.value.message} (${extra})`;
    }

    // Fetch per-row results for actionable feedback
    if (jobId) {
      try {
        const rowsResp = await api.get(`/bulk-client-upload/jobs/${jobId}/rows`, {
          params: { agencyId: isSuperAdmin.value ? selectedAgencyId.value : undefined }
        });
        const jobRows = Array.isArray(rowsResp.data) ? rowsResp.data : [];
        const failed = jobRows
          .filter((r) => String(r.status || '').toLowerCase() === 'failed')
          .map((r) => ({
            row: r.row_number,
            initials: null,
            error: r.message || 'Row failed'
          }));
        importResults.value.errors = failed;
      } catch (e) {
        // Non-fatal; base summary is still useful
      }
    }

    emit('imported');
  } catch (err) {
    console.error('Bulk import error:', err);
    const apiErr = err.response?.data?.error;
    error.value = apiErr?.message || 'Failed to import clients. Please check the CSV format and try again.';
    errorMeta.value = apiErr && (apiErr.row || apiErr.missingFields || apiErr.foundHeaders || apiErr.expectedHeaders)
      ? {
          row: apiErr.row || null,
          missingFields: Array.isArray(apiErr.missingFields) ? apiErr.missingFields : null,
          foundHeaders: Array.isArray(apiErr.foundHeaders) ? apiErr.foundHeaders : null,
          expectedHeaders: Array.isArray(apiErr.expectedHeaders) ? apiErr.expectedHeaders : null
        }
      : null;
  } finally {
    importing.value = false;
  }
};

const resetForm = () => {
  selectedFile.value = null;
  error.value = '';
  errorMeta.value = null;
  importResults.value = null;
  selectedAgencyId.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

onMounted(async () => {
  if (isSuperAdmin.value) {
    await agencyStore.fetchAgencies(); // fetch all agencies for super admin
  }
});
</script>

<style scoped>
.bulk-client-importer {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.importer-header {
  margin-bottom: 32px;
}

.importer-header h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.importer-description {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.importer-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.import-form {
  width: 100%;
}

.form-group {
  margin-bottom: 24px;
}

.agency-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.help-text {
  display: block;
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
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
  position: relative;
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

.form-group label input[type="checkbox"] {
  margin-right: 8px;
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #fcc;
}

.import-results {
  background: var(--bg-alt);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
}

.import-results h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.results-stats p {
  margin: 8px 0;
  color: var(--text-primary);
}

.stat-success {
  color: #155724;
}

.stat-info {
  color: #0c5460;
}

.stat-error {
  color: #721c24;
}

.success-message {
  margin-top: 16px;
  padding: 12px 16px;
  background: #d4edda;
  color: #155724;
  border-radius: 6px;
  border: 1px solid #c3e6cb;
}

.error-details {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.error-details h4 {
  margin: 0 0 8px 0;
  color: #c33;
}

.error-details ul {
  margin: 0;
  padding-left: 20px;
}

.error-details li {
  margin: 4px 0;
  color: #c33;
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

.btn-secondary:hover:not(:disabled) {
  background: var(--border);
}
</style>
