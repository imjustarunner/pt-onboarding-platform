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
            <th style="width: 160px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>{{ formatDateTime(d.uploaded_at) }}</td>
            <td>{{ d.original_name || d.storage_path }}</td>
            <td>{{ d.mime_type || '-' }}</td>
            <td class="actions">
              <button class="btn btn-primary btn-sm" @click="confirmOpen(d)">View</button>
            </td>
          </tr>
        </tbody>
      </table>
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
const opening = ref(false);
const uploading = ref(false);
const error = ref('');
const docs = ref([]);
const confirmingDoc = ref(null);
const fileInput = ref(null);

const reload = async () => {
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

const confirmOpen = (doc) => {
  confirmingDoc.value = doc;
};

const openDoc = async (doc) => {
  if (!doc?.id) return;
  try {
    opening.value = true;
    error.value = '';
    const resp = await api.get(`/phi-documents/${doc.id}/view`);
    const url = resp.data?.url;
    if (!url) throw new Error('Missing URL');
    window.open(url, '_blank', 'noopener');
    confirmingDoc.value = null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to open packet';
  } finally {
    opening.value = false;
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

