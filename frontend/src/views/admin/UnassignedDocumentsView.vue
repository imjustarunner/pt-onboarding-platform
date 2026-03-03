<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Submitted Documents</h1>
        <p class="subtitle">
          Documents from public digital forms (e.g. additional driver, consent, medical records). Assignable documents can be moved to a client; view-only documents (e.g. medical records requests) stay here for reference.
        </p>
      </div>
      <button class="btn btn-secondary" type="button" @click="fetch" :disabled="loading">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div class="filters">
      <select v-model="filterAgencyId" @change="fetch" class="filter-select">
        <option value="">All agencies</option>
        <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
      </select>
      <select v-model="filterAssignable" class="filter-select">
        <option value="all">All</option>
        <option value="assignable">Assignable</option>
        <option value="view_only">View-only</option>
      </select>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredDocuments.length === 0" class="empty-state">
      <p>No documents.</p>
      <p class="muted">Documents from public forms (Create Client = No) will appear here when completed.</p>
    </div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Form</th>
            <th>Type</th>
            <th>Signer</th>
            <th>Signed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in filteredDocuments" :key="doc.id">
            <td>{{ doc.document_template_name || 'Document' }}</td>
            <td>{{ doc.intake_link_title || '—' }}</td>
            <td>
              <span :class="['badge', isAssignable(doc) ? 'badge-info' : 'badge-secondary']">
                {{ isAssignable(doc) ? 'Assignable' : 'View-only' }}
              </span>
            </td>
            <td>
              {{ doc.signer_name || '—' }}
              <span v-if="doc.signer_email" class="muted" style="font-size: 11px;">{{ doc.signer_email }}</span>
            </td>
            <td>{{ formatDate(doc.signed_at) }}</td>
            <td class="actions">
              <button class="btn btn-secondary btn-sm" type="button" @click="downloadDoc(doc)">Download</button>
              <button v-if="isAssignable(doc)" class="btn btn-primary btn-sm" type="button" @click="openAssign(doc)">Assign to Client</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showAssignModal" class="modal-overlay" @click.self="closeAssignModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>Assign to Client</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeAssignModal">Close</button>
        </div>
        <div class="modal-body">
          <div v-if="assigning" class="loading">Assigning…</div>
          <div v-else>
            <div v-if="guardianClients.length" class="form-group">
              <label>Quick assign (signer is guardian)</label>
              <div class="guardian-clients">
                <button
                  v-for="c in guardianClients"
                  :key="c.client_id"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="assignToClientId(c.client_id)"
                >
                  {{ c.initials || c.client_id }} — {{ c.organization_name || '' }}
                </button>
              </div>
              <small class="form-help">Signer email matches a guardian. Assign to one of their clients.</small>
            </div>
            <div class="form-group">
              <label>Or search for client</label>
              <input
                v-model="clientSearch"
                type="text"
                placeholder="Search by initials, name, or ID…"
                @input="debouncedSearchClients"
              />
              <select v-model="selectedClientId" class="form-control" size="5">
                <option value="">Select a client</option>
                <option v-for="c in clientSearchResults" :key="c.id" :value="String(c.id)">
                  #{{ c.id }} — {{ c.initials || 'Client' }} ({{ c.status || 'active' }})
                </option>
              </select>
              <small v-if="clientSearchError" class="error">{{ clientSearchError }}</small>
            </div>
            <div class="actions">
              <button
                class="btn btn-primary"
                type="button"
                :disabled="!selectedClientId || assigning"
                @click="assignToClientId(parseInt(selectedClientId, 10))"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const route = useRoute();
const loading = ref(false);
const error = ref('');
const documents = ref([]);
const agencies = ref([]);
const filterAgencyId = ref('');
const filterAssignable = ref('all');

const isAssignable = (d) => d.requires_assignment !== false && d.requires_assignment !== 0;
const filteredDocuments = computed(() => {
  const list = documents.value;
  if (filterAssignable.value === 'assignable') return list.filter(isAssignable);
  if (filterAssignable.value === 'view_only') return list.filter((d) => !isAssignable(d));
  return list;
});
const showAssignModal = ref(false);
const docToAssign = ref(null);
const assigning = ref(false);
const guardianClients = ref([]);
const clientSearch = ref('');
const clientSearchResults = ref([]);
const clientSearchError = ref('');
const selectedClientId = ref('');
let searchTimeout = null;

const formatDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(d);
  }
};

const fetch = async () => {
  try {
    loading.value = true;
    error.value = '';
    const params = {};
    if (filterAgencyId.value) params.agencyId = filterAgencyId.value;
    const r = await api.get('/unassigned-documents', { params });
    documents.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load unassigned documents';
    documents.value = [];
  } finally {
    loading.value = false;
  }
};

const downloadDoc = async (doc) => {
  try {
    const r = await api.get(`/unassigned-documents/${doc.id}/download`, { responseType: 'blob' });
    const blob = new Blob([r.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(doc.document_template_name || 'document').replace(/[^a-zA-Z0-9_-]/g, '_')}-${doc.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Download failed';
  }
};

const openAssign = async (doc) => {
  docToAssign.value = doc;
  showAssignModal.value = true;
  guardianClients.value = [];
  clientSearch.value = '';
  clientSearchResults.value = [];
  selectedClientId.value = '';
  clientSearchError.value = '';
  try {
    const r = await api.get(`/unassigned-documents/${doc.id}/guardian-clients`);
    guardianClients.value = r.data?.clients || [];
  } catch {
    guardianClients.value = [];
  }
};

const closeAssignModal = () => {
  showAssignModal.value = false;
  docToAssign.value = null;
};

const searchClients = async () => {
  const q = String(clientSearch.value || '').trim();
  if (!q || q.length < 2) {
    clientSearchResults.value = [];
    return;
  }
  try {
    clientSearchError.value = '';
    const r = await api.get('/clients', {
      params: { search: q, limit: 20 }
    });
    const data = r.data?.data ?? r.data?.clients ?? r.data;
    clientSearchResults.value = Array.isArray(data) ? data : [];
  } catch (e) {
    clientSearchError.value = e.response?.data?.error?.message || 'Search failed';
    clientSearchResults.value = [];
  }
};

const debouncedSearchClients = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(searchClients, 300);
};

const assignToClientId = async (clientId) => {
  if (!clientId || !docToAssign.value) return;
  try {
    assigning.value = true;
    await api.post(`/unassigned-documents/${docToAssign.value.id}/assign`, { clientId });
    closeAssignModal();
    await fetch();
  } catch (e) {
    clientSearchError.value = e.response?.data?.error?.message || 'Failed to assign';
  } finally {
    assigning.value = false;
  }
};

onMounted(async () => {
  try {
    const r = await api.get('/agencies');
    agencies.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    agencies.value = [];
  }
  const agencyIdFromQuery = route.query?.agencyId;
  if (agencyIdFromQuery) filterAgencyId.value = String(agencyIdFromQuery);
  await fetch();
});
</script>

<style scoped>
.guardian-clients {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.form-control {
  width: 100%;
  margin-top: 8px;
}
</style>
