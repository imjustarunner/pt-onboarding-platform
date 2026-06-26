<template>
  <div class="container credentials-view">
    <h2>My Credentials</h2>
    <p class="subtitle">Upload your practicing license and other required credentials. Your license ties to the Credential field on your account profile.</p>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="card card-license">
      <h3>Practicing license</h3>
      <p class="card-hint">
        Upload a PDF of your current license (LPC, LPCC, LMFT, LCSW, Psychologist, etc.). This appears on your account profile and supports insurance credentialing.
      </p>
      <form @submit.prevent="createLicenseDoc" class="form">
        <div class="row">
          <div class="field">
            <label>Expiration date</label>
            <input v-model="licenseForm.expirationDate" type="date" />
          </div>
        </div>
        <div class="field">
          <label>Notes (optional)</label>
          <input v-model="licenseForm.notes" type="text" placeholder="e.g., Colorado LPCC" />
        </div>
        <div class="field">
          <label>License PDF *</label>
          <input type="file" accept=".pdf,application/pdf" @change="onLicenseFileChange" required />
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit" :disabled="saving || !licenseFile">
            {{ saving ? 'Uploading…' : 'Upload license' }}
          </button>
        </div>
      </form>
      <div v-if="licenseDoc" class="current-license">
        <div class="title">
          <strong>Current license on file</strong>
          <span v-if="isExpired(licenseDoc)" class="badge badge-expired">Expired</span>
        </div>
        <div class="meta">
          <span v-if="licenseDoc.expiration_date">Expires: {{ formatDate(licenseDoc.expiration_date) }}</span>
          <span v-else>Expires: —</span>
          <span>Uploaded: {{ formatDate(licenseDoc.uploaded_at || licenseDoc.created_at) }}</span>
        </div>
        <div class="item-actions" style="margin-top: 8px;">
          <button class="btn btn-danger btn-sm" @click="deleteDoc(licenseDoc)" :disabled="saving">Remove</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Other credentials</h3>
      <form @submit.prevent="createDoc" class="form">
        <div class="row">
          <div class="field">
            <label>Document Type *</label>
            <input v-model="form.documentType" type="text" placeholder="e.g., insurance, tb_test" required />
          </div>
          <div class="field">
            <label>Expiration Date</label>
            <input v-model="form.expirationDate" type="date" />
          </div>
          <div class="field checkbox">
            <label>
              <input v-model="form.isBlocking" type="checkbox" />
              Blocking if expired
            </label>
          </div>
        </div>

        <div class="field">
          <label>Notes</label>
          <input v-model="form.notes" type="text" placeholder="Optional notes" />
        </div>

        <div class="field">
          <label>PDF File *</label>
          <input type="file" accept=".pdf" @change="onFileChange" required />
        </div>

        <div class="actions">
          <button class="btn btn-primary" type="submit" :disabled="saving || !file">
            {{ saving ? 'Saving...' : 'Save Credential' }}
          </button>
          <button class="btn btn-secondary" type="button" @click="load" :disabled="saving">Refresh</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h3>All uploaded credentials</h3>
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="otherDocs.length === 0 && !licenseDoc" class="empty">No credentials uploaded yet.</div>
      <div v-else class="list">
        <div v-for="doc in otherDocs" :key="doc.id" class="item">
          <div class="item-main">
            <div class="title">
              <strong>{{ doc.document_type }}</strong>
              <span v-if="doc.is_blocking" class="badge badge-urgent">Blocking</span>
            </div>
            <div class="meta">
              <span v-if="doc.expiration_date">Expires: {{ formatDate(doc.expiration_date) }}</span>
              <span v-else>Expires: —</span>
              <span v-if="isExpired(doc)" class="badge badge-expired">Expired</span>
            </div>
            <div v-if="doc.notes" class="notes">{{ doc.notes }}</div>
          </div>
          <div class="item-actions">
            <button class="btn btn-danger btn-sm" @click="deleteDoc(doc)" :disabled="saving">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../services/api';

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const docs = ref([]);
const file = ref(null);
const licenseFile = ref(null);

const form = ref({
  documentType: '',
  expirationDate: '',
  isBlocking: false,
  notes: ''
});

const licenseForm = ref({
  expirationDate: '',
  notes: ''
});

const isLicenseDoc = (doc) => {
  const t = String(doc?.document_type || '').trim().toLowerCase();
  return t === 'license' || t === 'license_upload';
};

const licenseDoc = computed(() => (docs.value || []).find(isLicenseDoc) || null);
const otherDocs = computed(() => (docs.value || []).filter((d) => !isLicenseDoc(d)));

const formatDate = (d) => {
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
};

const isExpired = (doc) => {
  if (!doc?.expiration_date) return false;
  return new Date(doc.expiration_date) < new Date(new Date().toISOString().slice(0, 10));
};

const onFileChange = (e) => {
  file.value = e.target.files?.[0] || null;
};

const onLicenseFileChange = (e) => {
  licenseFile.value = e.target.files?.[0] || null;
};

const uploadComplianceDoc = async ({ uploadFile, documentType, expirationDate, isBlocking, notes }) => {
  const fd = new FormData();
  fd.append('file', uploadFile);
  fd.append('documentType', documentType);
  if (expirationDate) fd.append('expirationDate', expirationDate);
  fd.append('isBlocking', isBlocking ? '1' : '0');
  if (notes) fd.append('notes', notes);
  await api.post('/user-compliance-documents', fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/user-compliance-documents/me');
    docs.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load credentials';
  } finally {
    loading.value = false;
  }
};

const createLicenseDoc = async () => {
  if (!licenseFile.value) return;
  try {
    saving.value = true;
    error.value = '';
    if (licenseDoc.value) {
      await api.delete(`/user-compliance-documents/${licenseDoc.value.id}`);
    }
    await uploadComplianceDoc({
      uploadFile: licenseFile.value,
      documentType: 'license',
      expirationDate: licenseForm.value.expirationDate,
      isBlocking: false,
      notes: licenseForm.value.notes
    });
    licenseForm.value = { expirationDate: '', notes: '' };
    licenseFile.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to upload license';
  } finally {
    saving.value = false;
  }
};

const createDoc = async () => {
  if (!file.value) return;
  try {
    saving.value = true;
    error.value = '';
    await uploadComplianceDoc({
      uploadFile: file.value,
      documentType: form.value.documentType,
      expirationDate: form.value.expirationDate,
      isBlocking: form.value.isBlocking,
      notes: form.value.notes
    });

    form.value = { documentType: '', expirationDate: '', isBlocking: false, notes: '' };
    file.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save credential';
  } finally {
    saving.value = false;
  }
};

const deleteDoc = async (doc) => {
  try {
    saving.value = true;
    error.value = '';
    await api.delete(`/user-compliance-documents/${doc.id}`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete credential';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.card-license {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.card-hint {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
}
.current-license {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #bbf7d0;
}
.credentials-view .subtitle {
  color: var(--text-secondary);
  margin-bottom: 16px;
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin: 14px 0;
}
.row {
  display: grid;
  grid-template-columns: 1fr 200px 200px;
  gap: 12px;
  align-items: end;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0;
}
.field input[type='text'],
.field input[type='date'] {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.field.checkbox {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  margin-top: 28px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
}
.meta {
  display: flex;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  margin-top: 4px;
}
.notes {
  margin-top: 6px;
  color: var(--text-secondary);
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  margin-left: 8px;
}
.badge-urgent {
  background: #ffe6e6;
  color: #b00020;
  border: 1px solid #ffb3b3;
}
.badge-expired {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeeba;
}
.btn-sm {
  padding: 6px 10px;
  font-size: 13px;
}
</style>

