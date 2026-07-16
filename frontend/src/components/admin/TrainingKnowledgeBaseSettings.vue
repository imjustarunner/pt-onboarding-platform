<template>
  <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
    <div class="kb-modal">
      <div class="kb-header">
        <div>
          <h2>Training Reference Documents</h2>
          <p class="muted">
            Link a public Google Doc or upload PDF/TXT for AI module generation and Ask Assistant answers.
          </p>
        </div>
        <button type="button" class="btn btn-secondary" @click="$emit('close')">Close</button>
      </div>

      <div v-if="!agencyId" class="empty-state">
        Select an agency in the module filters to manage training reference documents.
      </div>

      <div v-else-if="!trainingAiEnabled" class="empty-state">
        <strong>Training AI Module Builder is disabled</strong>
        <p class="muted">Enable it in Agency Management → Features for this organization.</p>
      </div>

      <div v-else>
        <div v-if="error" class="error">{{ error }}</div>

        <div class="kb-section">
          <h3>Link Google Doc</h3>
          <p class="muted kb-help">
            Share the doc as <strong>Anyone with the link can view</strong>, paste the link below, and we’ll keep a snapshot
            for Ask Assistant. Edits in Google Docs are pulled in automatically about every 15 minutes, or tap Refresh.
          </p>
          <div class="kb-upload-row">
            <select v-model="linkFolder" class="input">
              <option value="handbook">Handbook</option>
              <option value="policies">Policies</option>
            </select>
            <input
              v-model="googleDocUrl"
              type="url"
              class="input kb-url"
              placeholder="https://docs.google.com/document/d/…"
            />
            <button class="btn btn-primary" :disabled="linking" @click="linkGoogleDoc">
              {{ linking ? 'Linking…' : 'Link doc' }}
            </button>
          </div>
          <small v-if="linkSuccess" class="hint success">{{ linkSuccess }}</small>
        </div>

        <div class="kb-section">
          <h3>Upload PDF or TXT</h3>
          <div class="kb-upload-row">
            <select v-model="uploadFolder" class="input">
              <option value="handbook">Handbook</option>
              <option value="policies">Policies</option>
            </select>
            <input ref="fileInput" type="file" class="input" accept=".pdf,.txt,application/pdf,text/plain" />
            <button class="btn btn-primary" :disabled="uploading" @click="uploadDocument">
              {{ uploading ? 'Uploading…' : 'Upload' }}
            </button>
          </div>
          <small v-if="uploadSuccess" class="hint success">{{ uploadSuccess }}</small>
        </div>

        <div class="kb-section">
          <h3>Documents ({{ documents.length }})</h3>
          <div v-if="loading" class="muted">Loading…</div>
          <div v-else-if="!documents.length" class="muted">
            No documents yet. Link your workplace handbook Google Doc or upload a PDF to get started.
          </div>
          <div v-else class="kb-file-list">
            <div v-for="doc in documents" :key="doc.id" class="kb-file-row">
              <div>
                <div class="kb-file-name">{{ doc.fileName }}</div>
                <div class="kb-file-meta">
                  {{ doc.folder }} · {{ formatSize(doc.sizeBytes) }}
                  <span v-if="doc.sourceKind === 'google_doc'"> · Google Doc</span>
                  <span v-if="doc.lastSyncedAt"> · synced {{ formatWhen(doc.lastSyncedAt) }}</span>
                  <span v-else-if="doc.uploadedByName"> · {{ doc.uploadedByName }}</span>
                </div>
                <a
                  v-if="doc.sourceUrl"
                  class="kb-source-link"
                  :href="doc.sourceUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >Open in Google Docs</a>
              </div>
              <div class="kb-file-actions">
                <button
                  v-if="doc.sourceKind === 'google_doc'"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="refreshingId === doc.id"
                  @click="refreshDoc(doc)"
                >
                  {{ refreshingId === doc.id ? '…' : 'Refresh' }}
                </button>
                <button type="button" class="btn btn-danger btn-sm" :disabled="deletingId === doc.id" @click="removeDoc(doc)">
                  {{ deletingId === doc.id ? '…' : 'Delete' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: Number, default: null },
  trainingAiEnabled: { type: Boolean, default: false }
});

defineEmits(['close', 'updated']);

const loading = ref(false);
const uploading = ref(false);
const linking = ref(false);
const error = ref('');
const uploadSuccess = ref('');
const linkSuccess = ref('');
const uploadFolder = ref('handbook');
const linkFolder = ref('handbook');
const googleDocUrl = ref('');
const fileInput = ref(null);
const documents = ref([]);
const deletingId = ref(null);
const refreshingId = ref(null);

const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  return `${Math.round(n / 1024)} KB`;
};

const formatWhen = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

const loadDocuments = async () => {
  if (!props.agencyId || !props.trainingAiEnabled) {
    documents.value = [];
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/training-builder/kb/documents', {
      params: { agencyId: props.agencyId }
    });
    documents.value = Array.isArray(res?.data?.documents) ? res.data.documents : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load documents';
    documents.value = [];
  } finally {
    loading.value = false;
  }
};

const linkGoogleDoc = async () => {
  if (!props.agencyId) return;
  const docUrl = String(googleDocUrl.value || '').trim();
  if (!docUrl) {
    error.value = 'Paste a Google Docs link first.';
    return;
  }
  try {
    linking.value = true;
    error.value = '';
    linkSuccess.value = '';
    await api.post('/training-builder/kb/link-google-doc', {
      agencyId: props.agencyId,
      folder: linkFolder.value,
      docUrl
    });
    linkSuccess.value = 'Google Doc linked. Ask Assistant will use this snapshot (auto-refreshes about every 15 minutes).';
    googleDocUrl.value = '';
    await loadDocuments();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not link Google Doc';
  } finally {
    linking.value = false;
  }
};

const refreshDoc = async (doc) => {
  try {
    refreshingId.value = doc.id;
    error.value = '';
    await api.post(`/training-builder/kb/documents/${doc.id}/refresh`);
    linkSuccess.value = `Refreshed “${doc.fileName}” from Google Docs.`;
    await loadDocuments();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Refresh failed';
  } finally {
    refreshingId.value = null;
  }
};

const uploadDocument = async () => {
  if (!props.agencyId) return;
  const file = fileInput.value?.files?.[0];
  if (!file) {
    error.value = 'Select a file to upload.';
    return;
  }
  try {
    uploading.value = true;
    error.value = '';
    uploadSuccess.value = '';
    const fd = new FormData();
    fd.append('agencyId', String(props.agencyId));
    fd.append('folder', uploadFolder.value);
    fd.append('file', file, file.name);
    await api.post('/training-builder/kb/upload', fd);
    uploadSuccess.value = 'Uploaded successfully.';
    if (fileInput.value) fileInput.value.value = '';
    await loadDocuments();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
};

const removeDoc = async (doc) => {
  if (!confirm(`Delete "${doc.fileName}"?`)) return;
  try {
    deletingId.value = doc.id;
    error.value = '';
    await api.delete(`/training-builder/kb/documents/${doc.id}`);
    await loadDocuments();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Delete failed';
  } finally {
    deletingId.value = null;
  }
};

watch(
  () => [props.open, props.agencyId, props.trainingAiEnabled],
  ([isOpen]) => {
    if (isOpen) loadDocuments();
  },
  { immediate: true }
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}
.kb-modal {
  background: var(--surface, #fff);
  border-radius: 12px;
  max-width: 720px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}
.kb-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.kb-header h2 {
  margin: 0 0 4px;
  font-size: 1.25rem;
}
.muted {
  color: var(--text-secondary, #64748b);
  font-size: 0.875rem;
}
.kb-help {
  margin: 0 0 10px;
  line-height: 1.4;
}
.kb-section {
  margin-bottom: 24px;
}
.kb-section h3 {
  margin: 0 0 8px;
  font-size: 1rem;
}
.kb-upload-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.input {
  flex: 1;
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
}
.kb-url {
  flex: 2;
  min-width: 220px;
}
.kb-file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kb-file-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}
.kb-file-name {
  font-weight: 600;
}
.kb-file-meta {
  font-size: 0.8rem;
  color: var(--text-secondary, #64748b);
  margin-top: 2px;
}
.kb-source-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.8rem;
}
.kb-file-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.hint.success {
  color: #15803d;
  display: block;
  margin-top: 8px;
}
.error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.empty-state {
  padding: 24px 8px;
  text-align: center;
}
</style>
