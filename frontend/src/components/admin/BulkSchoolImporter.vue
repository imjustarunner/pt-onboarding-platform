<template>
  <div class="bulk-school-importer">
    <div class="importer-header">
      <h2>Bulk School Importer</h2>
      <p class="importer-description">
        Upload a CSV or XLSX file to enrich school records with contacts, ITSCO email, schedule, address, and district.
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
          <label for="school-file" class="file-label">
            <div class="file-input-area" :class="{ dragover: isDragging }">
              <input
                id="school-file"
                type="file"
                ref="fileInput"
                @change="handleFileSelect"
                @dragenter.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @dragover.prevent
                @drop.prevent="handleFileDrop"
                accept=".csv,.xlsx"
                required
              />
              <div v-if="!selectedFile" class="file-placeholder">
                <span class="file-icon">📋</span>
                <p>Click to select or drag and drop CSV/XLSX file</p>
                <p class="file-hint">CSV or XLSX (Max 25MB)</p>
              </div>
              <div v-else class="file-selected">
                <span class="file-icon">📋</span>
                <p>{{ selectedFile.name }}</p>
                <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
              </div>
            </div>
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
              <strong>Expected headers:</strong>
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
            <p class="stat-success"><strong>Succeeded:</strong> {{ importResults.successRows || 0 }}</p>
            <p class="stat-error"><strong>Failed:</strong> {{ importResults.failedRows || 0 }}</p>
          </div>
          <div v-if="importResults.errors && importResults.errors.length > 0" class="error-details">
            <h4>Row Errors</h4>
            <ul>
              <li v-for="(errorDetail, index) in importResults.errors" :key="index">
                Row {{ errorDetail.row }}: {{ errorDetail.error }}
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
            <span v-else>Import Schools</span>
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
  if (file) validateAndSetFile(file);
};

const handleFileDrop = (event) => {
  isDragging.value = false;
  const file = event.dataTransfer.files[0];
  if (file) validateAndSetFile(file);
};

const validateAndSetFile = (file) => {
  const name = String(file?.name || '').toLowerCase();
  const isCsv = name.endsWith('.csv');
  const isXlsx = name.endsWith('.xlsx');
  if (!isCsv && !isXlsx) {
    error.value = 'Please upload a CSV or XLSX file';
    return;
  }

  const maxSize = 25 * 1024 * 1024; // 25MB (backend limit)
  if (file.size > maxSize) {
    error.value = 'File size must be less than 25MB';
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
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const handleImport = async () => {
  if (!selectedFile.value) {
    error.value = 'Please select a CSV/XLSX file';
    return;
  }
  if (isSuperAdmin.value && !selectedAgencyId.value) {
    error.value = 'Please select an agency for this import';
    return;
  }

  importing.value = true;
  error.value = '';
  errorMeta.value = null;
  importResults.value = null;

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    if (isSuperAdmin.value) {
      formData.append('agencyId', selectedAgencyId.value);
    } else if (agencyStore.currentAgency?.id) {
      formData.append('agencyId', String(agencyStore.currentAgency.id));
    }

    const response = await api.post('/bulk-school-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    if (!response.data?.success) {
      throw new Error(response.data?.error?.message || 'Import failed');
    }

    const jobId = response.data.jobId;
    const createdSchools = Array.isArray(response.data.createdSchools) ? response.data.createdSchools : [];

    importResults.value = {
      totalRows: response.data.totalRows,
      successRows: response.data.successRows,
      failedRows: response.data.failedRows,
      errors: [],
      message: `Upload completed. Job #${jobId}: ${response.data.successRows} succeeded, ${response.data.failedRows} failed.` +
        (createdSchools.length ? ` (${createdSchools.length} school(s) created)` : '')
    };

    // Fetch per-row results for actionable feedback
    if (jobId) {
      try {
        const rowsResp = await api.get(`/bulk-school-upload/jobs/${jobId}/rows`, {
          params: { agencyId: isSuperAdmin.value ? selectedAgencyId.value : undefined }
        });
        const jobRows = Array.isArray(rowsResp.data) ? rowsResp.data : [];
        const failed = jobRows
          .filter((r) => String(r.status || '').toLowerCase() === 'failed')
          .map((r) => ({
            row: r.row_number,
            error: r.message || 'Row failed'
          }));
        importResults.value.errors = failed;
      } catch (e) {
        // Non-fatal
      }
    }

    emit('imported');
  } catch (err) {
    console.error('Bulk school import error:', err);
    const apiErr = err.response?.data?.error;
    error.value = apiErr?.message || 'Failed to import schools. Please check the file format and try again.';
    errorMeta.value =
      apiErr && (apiErr.row || apiErr.missingFields || apiErr.foundHeaders || apiErr.expectedHeaders)
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
    await agencyStore.fetchAgencies();
  }
});
</script>

<style scoped>
.bulk-school-importer {
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

.form-group {
  margin-bottom: 24px;
}

.agency-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.help-text {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.file-input-area {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
  background: var(--bg);
}

.file-input-area.dragover {
  border-color: var(--primary);
  background: rgba(79, 70, 229, 0.05);
}

input[type='file'] {
  display: none;
}

.file-icon {
  font-size: 28px;
  display: inline-block;
  margin-bottom: 8px;
}

.file-hint,
.file-size {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.error-message {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #b91c1c;
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 18px;
}

.import-results {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

.results-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin: 12px 0 8px 0;
}

.stat-success {
  color: #166534;
}

.stat-error {
  color: #b91c1c;
}

.success-message {
  margin-top: 10px;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.25);
  color: #166534;
  padding: 10px;
  border-radius: 10px;
}

.error-details {
  margin-top: 10px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>

