<template>
  <div class="bulk-client-importer">
    <div class="importer-header">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <h2 style="margin:0;">Bulk Client Importer</h2>
        <button type="button" class="btn btn-secondary" @click="emit('close')" :disabled="importing">
          Close
        </button>
      </div>
      <p class="importer-description">
        One-time import: upload three CSVs (Clients, Providers, Roster). This will create/update clients, providers, and schedules.
      </p>
    </div>

    <div class="importer-content">
      <form @submit.prevent="handleImport" class="import-form">
        <div class="form-group">
          <label for="agency-select"><strong>Agency</strong></label>
          <select id="agency-select" v-model="selectedAgencyId" required>
            <option value="" disabled>Select an agency</option>
            <option v-for="a in availableAgencies" :key="a.id" :value="String(a.id)">
              {{ a.name }}
            </option>
          </select>
          <p class="file-hint" style="margin-top: 6px;">
            All imported schools will be affiliated with the selected agency.
          </p>
        </div>

        <div class="form-group">
          <label for="clients-csv" class="file-label">
            <div class="file-input-area" :class="{ 'dragover': isDragging }">
              <input
                id="clients-csv"
                type="file"
                ref="clientsInput"
                @change="(e) => handleFileSelect(e, 'clients')"
                @dragenter.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @dragover.prevent
                @drop.prevent="(e) => handleFileDrop(e, 'clients')"
                accept=".csv"
                required
              />
              <div v-if="!clientsCsv" class="file-placeholder">
                <span class="file-icon">📊</span>
                <p><strong>Clients CSV</strong></p>
                <p class="file-hint">CSV format only (Max 10MB)</p>
              </div>
              <div v-else class="file-selected">
                <span class="file-icon">📊</span>
                <p>{{ clientsCsv.name }}</p>
                <p class="file-size">{{ formatFileSize(clientsCsv.size) }}</p>
              </div>
            </div>
          </label>
        </div>

        <div class="form-group">
          <label for="providers-csv" class="file-label">
            <div class="file-input-area" :class="{ 'dragover': isDraggingProviders }">
              <input
                id="providers-csv"
                type="file"
                ref="providersInput"
                @change="(e) => handleFileSelect(e, 'providers')"
                @dragenter.prevent="isDraggingProviders = true"
                @dragleave.prevent="isDraggingProviders = false"
                @dragover.prevent
                @drop.prevent="(e) => handleFileDrop(e, 'providers')"
                accept=".csv"
                required
              />
              <div v-if="!providersCsv" class="file-placeholder">
                <span class="file-icon">📄</span>
                <p><strong>Providers CSV</strong></p>
                <p class="file-hint">CSV format only (Max 10MB)</p>
              </div>
              <div v-else class="file-selected">
                <span class="file-icon">📄</span>
                <p>{{ providersCsv.name }}</p>
                <p class="file-size">{{ formatFileSize(providersCsv.size) }}</p>
              </div>
            </div>
          </label>
        </div>

        <div class="form-group">
          <label for="roster-csv" class="file-label">
            <div class="file-input-area" :class="{ 'dragover': isDraggingRoster }">
              <input
                id="roster-csv"
                type="file"
                ref="rosterInput"
                @change="(e) => handleFileSelect(e, 'roster')"
                @dragenter.prevent="isDraggingRoster = true"
                @dragleave.prevent="isDraggingRoster = false"
                @dragover.prevent
                @drop.prevent="(e) => handleFileDrop(e, 'roster')"
                accept=".csv"
                required
              />
              <div v-if="!rosterCsv" class="file-placeholder">
                <span class="file-icon">🗓️</span>
                <p><strong>Roster CSV</strong></p>
                <p class="file-hint">CSV format only (Max 10MB)</p>
              </div>
              <div v-else class="file-selected">
                <span class="file-icon">🗓️</span>
                <p>{{ rosterCsv.name }}</p>
                <p class="file-size">{{ formatFileSize(rosterCsv.size) }}</p>
              </div>
            </div>
          </label>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <div v-if="importResults" class="import-results">
          <h3 v-if="importResults.mode === 'preview'">Preview Results</h3>
          <h3 v-else>Import Results</h3>
          <div class="results-stats">
            <p>
              <strong>Total rows processed:</strong>
              Clients {{ importResults.totals?.clients || 0 }},
              Providers {{ importResults.totals?.providers || 0 }},
              Roster {{ importResults.totals?.roster || 0 }}
            </p>
            <p v-if="importResults.mode === 'preview'" class="stat-info">
              <strong>Pending approvals:</strong> {{ importResults.pending || 0 }}
            </p>
            <p v-else class="stat-success"><strong>Created:</strong> {{ importResults.created || 0 }}</p>
            <p v-else class="stat-info"><strong>Updated:</strong> {{ importResults.updated || 0 }}</p>
            <p class="stat-error"><strong>Errors:</strong> {{ (importResults.errors || []).length }}</p>
          </div>
          <div v-if="importResults.errors && importResults.errors.length > 0" class="error-details">
            <h4>Error Details:</h4>
            <ul>
              <li v-for="(errorDetail, index) in importResults.errors" :key="index">
                {{ (errorDetail.sheet || 'unknown').toUpperCase() }} row {{ errorDetail.row }}:
                {{ errorDetail.error }}
              </li>
            </ul>
          </div>
          <div v-if="importResults.message" class="success-message">
            {{ importResults.message }}
          </div>

          <div v-if="importResults.mode === 'preview' && importResults.jobId" class="approve-actions">
            <div class="approve-row">
              <button
                type="button"
                class="btn btn-primary"
                @click="approveAll"
                :disabled="importing || (importResults.errors || []).length > 0"
                title="Applies all pending rows (disabled if there are errors in the preview)"
              >
                Approve All
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                @click="rollbackJob"
                :disabled="importing"
                title="Undo applied rows for this preview job"
              >
                Undo (Rollback Job)
              </button>
            </div>
            <p class="file-hint" style="margin: 8px 0 0 0;">
              Tip: Fix the CSV and re-run Preview until errors are 0, then Approve All.
            </p>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" @click="resetForm" class="btn btn-secondary" :disabled="importing">
            Reset
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="handlePreview"
            :disabled="!selectedAgencyId || !clientsCsv || !providersCsv || !rosterCsv || importing"
            title="Validates and stages a preview job (no DB writes)"
          >
            <span v-if="importing && activeAction === 'preview'">Previewing...</span>
            <span v-else>Preview</span>
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="!selectedAgencyId || !clientsCsv || !providersCsv || !rosterCsv || importing"
          >
            <span v-if="importing">Importing...</span>
            <span v-else>Run One-Time Import</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const emit = defineEmits(['imported', 'close']);

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const clientsInput = ref(null);
const providersInput = ref(null);
const rosterInput = ref(null);

const clientsCsv = ref(null);
const providersCsv = ref(null);
const rosterCsv = ref(null);

const isDragging = ref(false);
const isDraggingProviders = ref(false);
const isDraggingRoster = ref(false);
const importing = ref(false);
const activeAction = ref(null); // preview | import | approveAll | rollback
const error = ref('');
const importResults = ref(null);

const selectedAgencyId = ref('');

const availableAgencies = computed(() => {
  // For super_admin/support, the API may allow listing all agencies. For admins, use assigned agencies.
  return agencyStore.userAgencies?.length ? agencyStore.userAgencies : agencyStore.agencies;
});

onMounted(async () => {
  try {
    // Prefer user-scoped agencies for non-superadmin.
    if (authStore.user?.role === 'super_admin' || authStore.user?.role === 'support') {
      await agencyStore.fetchAgencies();
    } else {
      await agencyStore.fetchUserAgencies();
    }

    if (!selectedAgencyId.value && agencyStore.currentAgency?.id) {
      selectedAgencyId.value = String(agencyStore.currentAgency.id);
    } else if (!selectedAgencyId.value && availableAgencies.value?.length) {
      selectedAgencyId.value = String(availableAgencies.value[0].id);
    }
  } catch (e) {
    console.error(e);
  }
});

const handleFileSelect = (event, kind) => {
  const file = event.target.files?.[0];
  if (file) validateAndSetFile(file, kind);
};

const handleFileDrop = (event, kind) => {
  if (kind === 'clients') isDragging.value = false;
  if (kind === 'providers') isDraggingProviders.value = false;
  if (kind === 'roster') isDraggingRoster.value = false;
  const file = event.dataTransfer.files[0];
  if (file) {
    validateAndSetFile(file, kind);
  }
};

const validateAndSetFile = (file, kind) => {
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

  if (kind === 'clients') clientsCsv.value = file;
  if (kind === 'providers') providersCsv.value = file;
  if (kind === 'roster') rosterCsv.value = file;
  error.value = '';
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
  if (!selectedAgencyId.value) {
    error.value = 'Please select an agency';
    return;
  }
  if (!clientsCsv.value || !providersCsv.value || !rosterCsv.value) {
    error.value = 'Please select Clients, Providers, and Roster CSV files';
    return;
  }

  importing.value = true;
  activeAction.value = 'import';
  error.value = '';
  importResults.value = null;

  try {
    const formData = new FormData();
    formData.append('agencyId', selectedAgencyId.value);
    formData.append('clientsCsv', clientsCsv.value);
    formData.append('providersCsv', providersCsv.value);
    formData.append('rosterCsv', rosterCsv.value);

    const response = await api.post('/bulk-import/clients-one-time', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    if (response.data.success) {
      importResults.value = {
        mode: 'import',
        jobId: response.data.jobId,
        totals: response.data.totals,
        created: response.data.created,
        updated: response.data.updated,
        errors: response.data.errors || [],
        message: response.data.message
      };
      emit('imported');
    } else {
      throw new Error(response.data.error?.message || 'Import failed');
    }
  } catch (err) {
    console.error('Bulk import error:', err);
    error.value = err.response?.data?.error?.message || 'Failed to import clients. Please check the CSV format and try again.';
  } finally {
    importing.value = false;
    activeAction.value = null;
  }
};

const handlePreview = async () => {
  if (!selectedAgencyId.value || !clientsCsv.value || !providersCsv.value || !rosterCsv.value) {
    error.value = 'Please select agency and all three CSV files';
    return;
  }

  importing.value = true;
  activeAction.value = 'preview';
  error.value = '';
  importResults.value = null;

  try {
    const formData = new FormData();
    formData.append('agencyId', selectedAgencyId.value);
    formData.append('clientsCsv', clientsCsv.value);
    formData.append('providersCsv', providersCsv.value);
    formData.append('rosterCsv', rosterCsv.value);

    const response = await api.post('/bulk-import/clients-one-time/preview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    if (response.data.success) {
      importResults.value = {
        mode: 'preview',
        jobId: response.data.jobId,
        totals: response.data.totals,
        pending: response.data.pending,
        errors: response.data.errors || [],
        message: response.data.message
      };
    } else {
      throw new Error(response.data.error?.message || 'Preview failed');
    }
  } catch (err) {
    console.error('Preview error:', err);
    error.value = err.response?.data?.error?.message || 'Failed to preview import. Please check the CSV format and try again.';
  } finally {
    importing.value = false;
    activeAction.value = null;
  }
};

const approveAll = async () => {
  if (!importResults.value?.jobId) return;
  importing.value = true;
  activeAction.value = 'approveAll';
  error.value = '';
  try {
    const resp = await api.post(`/bulk-import/jobs/${importResults.value.jobId}/apply`);
    importResults.value = {
      ...importResults.value,
      mode: 'preview',
      message: `Approved ${resp.data.applied || 0} rows. ${resp.data.errors?.length ? `${resp.data.errors.length} errors during apply.` : ''}`
    };
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to approve all';
  } finally {
    importing.value = false;
    activeAction.value = null;
  }
};

const rollbackJob = async () => {
  if (!importResults.value?.jobId) return;
  importing.value = true;
  activeAction.value = 'rollback';
  error.value = '';
  try {
    const resp = await api.post(`/bulk-import/jobs/${importResults.value.jobId}/rollback`);
    importResults.value = {
      ...importResults.value,
      message: `Rollback completed. Rolled back ${resp.data.rolledBack || 0} applied rows.`
    };
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to rollback job';
  } finally {
    importing.value = false;
    activeAction.value = null;
  }
};

const resetForm = () => {
  clientsCsv.value = null;
  providersCsv.value = null;
  rosterCsv.value = null;
  error.value = '';
  importResults.value = null;
  activeAction.value = null;
  if (clientsInput.value) clientsInput.value.value = '';
  if (providersInput.value) providersInput.value.value = '';
  if (rosterInput.value) rosterInput.value.value = '';
};
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
