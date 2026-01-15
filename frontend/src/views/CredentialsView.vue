<template>
  <div class="container credentials-view">
    <h2>My Credentials</h2>
    <p class="subtitle">Upload licenses, insurance, TB tests, and other required credentials.</p>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="card">
      <h3>Add / Update Credential</h3>
      <form @submit.prevent="createDoc" class="form">
        <div class="row">
          <div class="field">
            <label>Document Type *</label>
            <input v-model="form.documentType" type="text" placeholder="e.g., license, insurance, tb_test" required />
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
      <h3>Current Credentials</h3>
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="docs.length === 0" class="empty">No credentials uploaded yet.</div>
      <div v-else class="list">
        <div v-for="doc in docs" :key="doc.id" class="item">
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
import { ref, onMounted } from 'vue';
import api from '../services/api';

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const docs = ref([]);
const file = ref(null);

const form = ref({
  documentType: '',
  expirationDate: '',
  isBlocking: false,
  notes: ''
});

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
  const f = e.target.files?.[0] || null;
  file.value = f;
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

const createDoc = async () => {
  if (!file.value) return;
  try {
    saving.value = true;
    error.value = '';
    const fd = new FormData();
    fd.append('file', file.value);
    fd.append('documentType', form.value.documentType);
    if (form.value.expirationDate) fd.append('expirationDate', form.value.expirationDate);
    fd.append('isBlocking', form.value.isBlocking ? '1' : '0');
    if (form.value.notes) fd.append('notes', form.value.notes);

    await api.post('/user-compliance-documents', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
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

