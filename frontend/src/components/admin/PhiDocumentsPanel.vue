<template>
  <div class="panel">
    <div class="header">
      <h3>Documentation (PHI)</h3>
      <p class="hint">Opening documentation requires confirmation and will be audited.</p>

      <div v-if="canUpload" class="upload-row">
        <input
          ref="fileInput"
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/jpg"
          style="display:none;"
          @change="onFileSelected"
        />
        <button class="btn btn-secondary btn-sm" type="button" :disabled="uploading" @click="fileInput?.click()">
          {{ uploading ? 'Uploading…' : 'Upload document' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="docs.length === 0" class="empty">No packets found.</div>

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Uploaded</th>
            <th>Filename</th>
            <th>Type</th>
            <th>Status</th>
            <th style="width: 220px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>{{ formatDateTime(d.uploaded_at) }}</td>
            <td>{{ d.original_name || d.storage_path }}</td>
            <td>{{ d.mime_type || '-' }}</td>
            <td>
              <span v-if="d.removed_at" class="pill pill-removed">Removed</span>
              <span v-else-if="d.scan_status && d.scan_status !== 'clean'" class="pill pill-pending">Scanning</span>
              <span v-else class="pill pill-ready">Ready</span>
            </td>
            <td class="actions">
              <button class="btn btn-primary btn-sm" :disabled="!!d.removed_at" @click="confirmOpen(d)">View</button>
              <button class="btn btn-secondary btn-sm" type="button" :disabled="!!d.removed_at" @click="markExported(d)">
                Export
              </button>
              <button class="btn btn-secondary btn-sm" type="button" :disabled="!!d.removed_at" @click="removeDoc(d)">
                Remove
              </button>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="ocrSubmitting || !canRequestOcr(d)"
                :title="ocrDisabledReason(d)"
                @click="requestOcr(d)"
              >
                Extract Text
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="auditError" class="error">{{ auditError }}</div>
    <div v-else-if="auditStatements.length" class="audit-panel">
      <div class="audit-title">Document audit statements</div>
      <div class="audit-list">
        <div v-for="s in auditStatements" :key="s.documentId" class="audit-item">
          <div class="audit-name">{{ s.originalName || `Document ${s.documentId}` }}</div>
          <div class="audit-line">Uploaded: {{ formatDateTime(s.uploadedAt) }}{{ s.uploadedBy ? ` by ${s.uploadedBy}` : '' }}</div>
          <div class="audit-line">Downloaded: {{ s.downloadedAt ? formatDateTime(s.downloadedAt) : '—' }}{{ s.downloadedBy ? ` by ${s.downloadedBy}` : '' }}</div>
          <div class="audit-line">Exported to EHR: {{ s.exportedToEhrAt ? formatDateTime(s.exportedToEhrAt) : '—' }}{{ s.exportedToEhrBy ? ` by ${s.exportedToEhrBy}` : '' }}</div>
          <div class="audit-line">
            Removed: {{ s.removedAt ? formatDateTime(s.removedAt) : '—' }}{{ s.removedBy ? ` by ${s.removedBy}` : '' }}
            <span v-if="s.removedReason"> · {{ s.removedReason }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="ocr-panel">
      <div class="ocr-header">
        <h4>Extracted Text</h4>
        <div v-if="ocrLoading" class="muted">Loading…</div>
      </div>
      <div v-if="ocrError" class="error">{{ ocrError }}</div>
      <div v-else-if="ocrRequests.length === 0" class="empty">No OCR requests yet.</div>
      <div v-else class="ocr-list">
        <div v-for="r in ocrRequests" :key="r.id" class="ocr-item">
          <div class="ocr-meta">
            <div>
              <strong>{{ formatDateTime(r.created_at) }}</strong>
              <span class="ocr-status">{{ r.status }}</span>
            </div>
            <div class="ocr-actions">
              <button
                v-if="r.result_text"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="copyOcrText(r.result_text)"
              >
                Copy
              </button>
              <button
                v-if="r.result_text"
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="ocrWiping"
                @click="clearOcrRequest(r)"
              >
                {{ ocrWiping ? 'Wiping…' : 'Wipe' }}
              </button>
            </div>
          </div>
          <div v-if="r.error_message" class="error">{{ r.error_message }}</div>
          <pre v-else-if="r.result_text" class="ocr-text">{{ r.result_text }}</pre>
          <div v-else class="muted">Queued…</div>
        </div>
      </div>
    </div>

    <div v-if="confirmingDoc" class="modal-overlay" @click.self="confirmingDoc = null">
      <div class="modal" @click.stop>
        <h3>PHI Warning</h3>
        <p>
          This packet may contain PHI. Access is logged. Only open if you have a legitimate need and are authorized.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="confirmingDoc = null">Cancel</button>
          <button class="btn btn-primary" @click="openDoc(confirmingDoc)" :disabled="opening">
            {{ opening ? 'Opening…' : 'I Understand — Open' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  clientId: { type: Number, required: true }
});

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canUpload = computed(() => ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm.value));

const loading = ref(false);
const auditLoading = ref(false);
const ocrLoading = ref(false);
const opening = ref(false);
const uploading = ref(false);
const ocrSubmitting = ref(false);
const ocrWiping = ref(false);
const error = ref('');
const auditError = ref('');
const ocrError = ref('');
const docs = ref([]);
const auditStatements = ref([]);
const ocrRequests = ref([]);
const confirmingDoc = ref(null);
const fileInput = ref(null);

const reloadDocs = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/phi-documents/clients/${props.clientId}`);
    docs.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load packets';
  } finally {
    loading.value = false;
  }
};

const reloadAudit = async () => {
  try {
    auditLoading.value = true;
    auditError.value = '';
    const resp = await api.get(`/phi-documents/clients/${props.clientId}/audit`);
    auditStatements.value = resp.data?.documents || [];
  } catch (e) {
    auditError.value = e.response?.data?.error?.message || 'Failed to load document audit';
  } finally {
    auditLoading.value = false;
  }
};

const reloadOcr = async () => {
  try {
    ocrLoading.value = true;
    ocrError.value = '';
    const resp = await api.get(`/referrals/${props.clientId}/ocr`);
    ocrRequests.value = resp.data?.requests || [];
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to load OCR history';
  } finally {
    ocrLoading.value = false;
  }
};

const reload = async () => {
  await Promise.all([reloadDocs(), reloadOcr(), reloadAudit()]);
};

const confirmOpen = (doc) => {
  confirmingDoc.value = doc;
};

const openDoc = async (doc) => {
  if (!doc?.id) return;
  try {
    opening.value = true;
    error.value = '';
    const resp = await api.get(`/phi-documents/${doc.id}/view`, { responseType: 'blob' });
    const contentType = resp.headers?.['content-type'] || '';
    if (contentType.includes('application/json')) {
      const text = await resp.data.text();
      const data = JSON.parse(text);
      const url = data?.url;
      if (!url) throw new Error('Missing URL');
      window.open(url, '_blank', 'noopener');
    } else {
      const blobUrl = URL.createObjectURL(resp.data);
      window.open(blobUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }
    confirmingDoc.value = null;
  } catch (e) {
    if (e.response?.data instanceof Blob) {
      try {
        const text = await e.response.data.text();
        const data = JSON.parse(text);
        error.value = data?.error?.message || e.message || 'Failed to open packet';
      } catch {
        error.value = e.message || 'Failed to open packet';
      }
    } else {
      error.value = e.response?.data?.error?.message || e.message || 'Failed to open packet';
    }
  } finally {
    opening.value = false;
  }
};

const markExported = async (doc) => {
  if (!doc?.id) return;
  if (!window.confirm('Mark this document as exported to EHR?')) return;
  try {
    await api.post(`/phi-documents/${doc.id}/export`);
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to mark as exported';
  }
};

const removeDoc = async (doc) => {
  if (!doc?.id) return;
  if (!window.confirm('Remove this document from the system? This cannot be undone.')) return;
  try {
    await api.delete(`/phi-documents/${doc.id}`);
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to remove document';
  }
};

const onFileSelected = async (evt) => {
  const file = evt?.target?.files?.[0] || null;
  if (!file) return;
  try {
    uploading.value = true;
    error.value = '';
    const form = new FormData();
    form.append('file', file);
    await api.post(`/phi-documents/clients/${props.clientId}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to upload document';
  } finally {
    uploading.value = false;
    try {
      if (fileInput.value) fileInput.value.value = '';
    } catch {
      // ignore
    }
  }
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '-');

const canRequestOcr = (doc) => {
  if (!doc) return false;
  if (doc.scan_status && doc.scan_status !== 'clean') return false;
  return true;
};

const ocrDisabledReason = (doc) => {
  if (!doc) return 'Document not available';
  if (doc.scan_status && doc.scan_status !== 'clean') return 'Waiting for security scan';
  return 'Request OCR';
};

const requestOcr = async (doc) => {
  if (!doc?.id) return;
  try {
    ocrSubmitting.value = true;
    ocrError.value = '';
    const existing = await api.get(`/referrals/${props.clientId}/ocr`);
    const requests = existing.data?.requests || [];
    const latest = requests.find((r) => Number(r.phi_document_id) === Number(doc.id)) || requests[0];
    if (latest?.status === 'completed' && latest?.result_text) {
      await reloadOcr();
      return;
    }
    if (latest?.status && latest.status !== 'completed') {
      ocrError.value = latest.error_message || 'Extraction already queued. Please wait.';
      return;
    }
    const req = await api.post(`/referrals/${props.clientId}/ocr`, { phiDocumentId: doc.id });
    const reqId = req.data?.request?.id;
    if (reqId) {
      await api.post(`/referrals/${props.clientId}/ocr/${reqId}/process`);
    }
    await reloadOcr();
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to extract text';
  } finally {
    ocrSubmitting.value = false;
  }
};

const copyOcrText = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text || ''));
  } catch {
    // ignore
  }
};

const clearOcrRequest = async (request) => {
  if (!request?.id) return;
  if (!window.confirm('Wipe extracted OCR text for this request? This cannot be undone.')) return;
  try {
    ocrWiping.value = true;
    ocrError.value = '';
    await api.post(`/referrals/${props.clientId}/ocr/${request.id}/clear`);
    await reloadOcr();
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to wipe OCR text';
  } finally {
    ocrWiping.value = false;
  }
};

onMounted(reload);
watch(() => props.clientId, reload);
</script>

<style scoped>
.panel {
  padding: 8px 0;
}
.upload-row {
  margin-top: 10px;
}
.header h3 {
  margin: 0;
}
.hint {
  margin: 6px 0 12px;
  color: var(--text-secondary);
}
.table-wrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
  vertical-align: middle;
}
.actions {
  text-align: right;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.ocr-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.loading {
  padding: 12px;
  color: var(--text-secondary);
}
.error {
  padding: 10px 0;
  color: var(--danger);
}
.empty {
  padding: 12px 0;
  color: var(--text-secondary);
}

.pill {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.pill-ready {
  background: rgba(60, 200, 90, 0.12);
  color: #1b7d3a;
}

.pill-pending {
  background: rgba(255, 193, 7, 0.16);
  color: #7a5a00;
}

.pill-removed {
  background: rgba(220, 53, 69, 0.12);
  color: #a51f2d;
}

.audit-panel {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.audit-title {
  font-weight: 700;
  margin-bottom: 8px;
}

.audit-list {
  display: grid;
  gap: 10px;
}

.audit-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
}

.audit-name {
  font-weight: 600;
  margin-bottom: 6px;
}

.audit-line {
  color: var(--text-secondary);
  font-size: 13px;
}

.ocr-panel {
  margin-top: 18px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.ocr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ocr-header h4 {
  margin: 0;
}

.ocr-list {
  margin-top: 10px;
  display: grid;
  gap: 12px;
}

.ocr-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-alt);
}

.ocr-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ocr-status {
  margin-left: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 12px;
  color: var(--text-secondary);
}

.ocr-text {
  margin: 10px 0 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 13px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: 520px;
  max-width: 92vw;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px;
}
.modal h3 {
  margin: 0 0 10px;
}
.modal p {
  margin: 0 0 14px;
  color: var(--text-secondary);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>

