<template>
  <div class="container">
    <div class="page-header">
      <h1>Client Management</h1>
      <div class="header-actions">
        <button @click="showBulkImportModal = true" class="btn btn-secondary">Bulk Import</button>
        <button @click="showCreateModal = true" class="btn btn-primary">Create Client</button>
      </div>
    </div>

    <!-- Filters and Search -->
    <div class="table-controls" v-if="!loading && clients.length > 0">
      <div class="filter-group">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by initials..."
          class="search-input"
          @input="applyFilters"
        />
        <select v-model="statusFilter" @change="applyFilters" class="filter-select">
          <option value="">All Statuses</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="DECLINED">Declined</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select v-model="organizationFilter" @change="applyFilters" class="filter-select">
          <option value="">All Schools</option>
          <option v-for="org in availableOrganizations" :key="org.id" :value="org.id">
            {{ org.name }}
          </option>
        </select>
        <select v-model="providerFilter" @change="applyFilters" class="filter-select">
          <option value="">All Providers</option>
          <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
            {{ provider.first_name }} {{ provider.last_name }}
          </option>
        </select>
        <select v-model="sortBy" @change="applyFilters" class="filter-select">
          <option value="submission_date-desc">Sort: Submission Date (Newest)</option>
          <option value="submission_date-asc">Sort: Submission Date (Oldest)</option>
          <option value="initials-asc">Sort: Initials (A-Z)</option>
          <option value="initials-desc">Sort: Initials (Z-A)</option>
          <option value="status-asc">Sort: Status</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading clients...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredClients.length === 0" class="empty-state">
      <p v-if="clients.length === 0">No clients found. Create your first client or import from CSV.</p>
      <p v-else>No clients match your filters.</p>
    </div>

    <div v-else class="clients-table-container">
      <table class="clients-table">
        <thead>
          <tr>
            <th>Initials</th>
            <th>School</th>
            <th>Status</th>
            <th>Provider</th>
            <th>Submission Date</th>
            <th>Document Status</th>
            <th>Last Activity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="client in filteredClients" 
            :key="client.id"
            @click="openClientDetail(client)"
            class="client-row"
          >
            <td>{{ client.initials }}</td>
            <td>{{ client.organization_name || '-' }}</td>
            <td>
              <ClientStatusBadge :status="client.status" />
            </td>
            <td>
              <select
                v-if="editingProviderId === client.id"
                v-model="editingProviderValue"
                @change="saveProvider(client.id, editingProviderValue)"
                @blur="cancelEdit"
                class="inline-select"
                @click.stop
              >
                <option :value="null">Not assigned</option>
                <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
                  {{ provider.first_name }} {{ provider.last_name }}
                </option>
              </select>
              <span v-else @click.stop="startEditProvider(client)" class="editable-field">
                {{ client.provider_name || 'Not assigned' }}
              </span>
            </td>
            <td>{{ formatDate(client.submission_date) }}</td>
            <td>
              <span :class="['doc-status-badge', `doc-${client.document_status?.toLowerCase()}`]">
                {{ formatDocumentStatus(client.document_status) }}
              </span>
            </td>
            <td>{{ formatDate(client.last_activity_at) || '-' }}</td>
            <td class="actions-cell" @click.stop>
              <button @click="openClientDetail(client)" class="btn btn-primary btn-sm">View</button>
              <select
                v-if="editingStatusId === client.id"
                v-model="editingStatusValue"
                @change="saveStatus(client.id, editingStatusValue)"
                @blur="cancelEdit"
                class="inline-select status-select"
              >
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="DECLINED">Declined</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <button 
                v-else
                @click.stop="startEditStatus(client)" 
                class="btn btn-secondary btn-sm"
              >
                Change Status
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Client Detail Panel -->
    <ClientDetailPanel
      v-if="selectedClient"
      :client="selectedClient"
      @close="closeClientDetail"
      @updated="handleClientUpdated"
    />

    <!-- Create Client Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal-content" @click.stop>
        <h3>Create New Client</h3>
        <form @submit.prevent="createClient">
          <div class="form-group">
            <label>School Organization *</label>
            <select v-model="newClient.organization_id" required>
              <option value="">Select school...</option>
              <option v-for="org in availableOrganizations" :key="org.id" :value="org.id">
                {{ org.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Initials *</label>
            <input 
              v-model="newClient.initials" 
              type="text" 
              required 
              maxlength="10"
              placeholder="ABC"
              style="text-transform: uppercase;"
            />
            <small>Client initials (max 10 characters)</small>
          </div>
          <div class="form-group">
            <label>Provider</label>
            <select v-model="newClient.provider_id">
              <option :value="null">Not assigned</option>
              <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
                {{ provider.first_name }} {{ provider.last_name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Status *</label>
            <select v-model="newClient.status" required>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="DECLINED">Declined</option>
            </select>
          </div>
          <div class="form-group">
            <label>Submission Date *</label>
            <input v-model="newClient.submission_date" type="date" required />
          </div>
          <div class="form-group">
            <label>Document Status</label>
            <select v-model="newClient.document_status">
              <option value="NONE">None</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeCreateModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="creating">
              {{ creating ? 'Creating...' : 'Create Client' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Bulk Import Modal -->
    <BulkClientImporter
      v-if="showBulkImportModal"
      @close="showBulkImportModal = false"
      @imported="handleBulkImported"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import ClientStatusBadge from '../../components/admin/ClientStatusBadge.vue';
import ClientDetailPanel from '../../components/admin/ClientDetailPanel.vue';
import BulkClientImporter from '../../components/admin/BulkClientImporter.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const clients = ref([]);
const loading = ref(false);
const error = ref('');
const searchQuery = ref('');
const statusFilter = ref('');
const organizationFilter = ref('');
const providerFilter = ref('');
const sortBy = ref('submission_date-desc');
const selectedClient = ref(null);
const showCreateModal = ref(false);
const showBulkImportModal = ref(false);
const creating = ref(false);

// Inline editing state
const editingStatusId = ref(null);
const editingStatusValue = ref(null);
const editingProviderId = ref(null);
const editingProviderValue = ref(null);

// New client form
const newClient = ref({
  organization_id: null,
  initials: '',
  provider_id: null,
  status: 'PENDING_REVIEW',
  submission_date: new Date().toISOString().split('T')[0],
  document_status: 'NONE'
});

// Get available organizations (schools only)
const availableOrganizations = computed(() => {
  if (authStore.user?.role === 'super_admin') {
    return agencyStore.agencies?.filter(a => (a.organization_type || 'agency') === 'school') || [];
  }
  return agencyStore.userAgencies?.filter(a => (a.organization_type || 'agency') === 'school') || [];
});

// Get available providers
const availableProviders = ref([]);

const fetchClients = async () => {
  try {
    loading.value = true;
    error.value = '';
    
    const params = new URLSearchParams();
    if (statusFilter.value) params.append('status', statusFilter.value);
    if (organizationFilter.value) params.append('organization_id', organizationFilter.value);
    if (providerFilter.value) params.append('provider_id', providerFilter.value);
    if (searchQuery.value) params.append('search', searchQuery.value);

    const response = await api.get(`/clients?${params.toString()}`);
    clients.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch clients:', err);
    error.value = err.response?.data?.error?.message || 'Failed to load clients';
  } finally {
    loading.value = false;
  }
};

const fetchProviders = async () => {
  try {
    const response = await api.get('/users');
    const allUsers = response.data || [];
    // Filter to providers/clinicians
    availableProviders.value = allUsers.filter(u => 
      ['provider', 'clinician', 'supervisor', 'admin'].includes(u.role?.toLowerCase())
    );
  } catch (err) {
    console.error('Failed to fetch providers:', err);
  }
};

const filteredClients = computed(() => {
  let filtered = [...clients.value];

  // Apply sort
  const [sortField, sortOrder] = sortBy.value.split('-');
  filtered.sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'submission_date' || sortField === 'last_activity_at') {
      aVal = new Date(aVal || 0);
      bVal = new Date(bVal || 0);
    } else {
      aVal = (aVal || '').toString().toLowerCase();
      bVal = (bVal || '').toString().toLowerCase();
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  return filtered;
});

const applyFilters = () => {
  fetchClients();
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

const formatDocumentStatus = (status) => {
  const statusMap = {
    'NONE': 'None',
    'UPLOADED': 'Uploaded',
    'APPROVED': 'Approved',
    'REJECTED': 'Rejected'
  };
  return statusMap[status] || status;
};

const startEditStatus = (client) => {
  editingStatusId.value = client.id;
  editingStatusValue.value = client.status;
};

const startEditProvider = (client) => {
  editingProviderId.value = client.id;
  editingProviderValue.value = client.provider_id;
};

const cancelEdit = () => {
  editingStatusId.value = null;
  editingStatusValue.value = null;
  editingProviderId.value = null;
  editingProviderValue.value = null;
};

const saveStatus = async (clientId, newStatus) => {
  try {
    await api.put(`/clients/${clientId}/status`, { status: newStatus });
    await fetchClients();
    cancelEdit();
  } catch (err) {
    console.error('Failed to update status:', err);
    alert(err.response?.data?.error?.message || 'Failed to update status');
    cancelEdit();
  }
};

const saveProvider = async (clientId, providerId) => {
  try {
    await api.put(`/clients/${clientId}/provider`, { provider_id: providerId });
    await fetchClients();
    cancelEdit();
  } catch (err) {
    console.error('Failed to assign provider:', err);
    alert(err.response?.data?.error?.message || 'Failed to assign provider');
    cancelEdit();
  }
};

const openClientDetail = (client) => {
  selectedClient.value = client;
};

const closeClientDetail = () => {
  selectedClient.value = null;
};

const handleClientUpdated = () => {
  fetchClients();
  closeClientDetail();
};

const createClient = async () => {
  try {
    creating.value = true;
    error.value = '';

    // Get user's agency ID
    // The agency_id should be the agency organization (not school) that manages the school
    let agencyId = null;
    
    if (authStore.user?.role === 'super_admin') {
      // Super admin: Get first agency (not school) organization
      const allAgencies = agencyStore.agencies || [];
      const agencies = allAgencies.filter(a => (a.organization_type || 'agency') === 'agency');
      if (agencies.length > 0) {
        agencyId = agencies[0].id;
      } else {
        // Fallback: use organization id (not ideal, but allows creation)
        agencyId = newClient.value.organization_id;
      }
    } else {
      // Regular users: use their assigned agency (not school)
      const userAgencies = agencyStore.userAgencies || [];
      const agencies = userAgencies.filter(a => (a.organization_type || 'agency') === 'agency');
      if (agencies.length > 0) {
        agencyId = agencies[0].id;
      } else if (userAgencies.length > 0) {
        // Fallback: use first organization (may be a school - not ideal)
        agencyId = userAgencies[0].id;
      }
    }

    if (!agencyId) {
      error.value = 'Unable to determine agency. Please ensure you are associated with an agency.';
      creating.value = false;
      return;
    }

    await api.post('/clients', {
      ...newClient.value,
      agency_id: agencyId,
      source: 'ADMIN_CREATED'
    });

    await fetchClients();
    closeCreateModal();
  } catch (err) {
    console.error('Failed to create client:', err);
    error.value = err.response?.data?.error?.message || 'Failed to create client';
  } finally {
    creating.value = false;
  }
};

const closeCreateModal = () => {
  showCreateModal.value = false;
  newClient.value = {
    organization_id: null,
    initials: '',
    provider_id: null,
    status: 'PENDING_REVIEW',
    submission_date: new Date().toISOString().split('T')[0],
    document_status: 'NONE'
  };
};

const handleBulkImported = () => {
  fetchClients();
};

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
  await fetchProviders();
  await fetchClients();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.table-controls {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.filter-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.filter-select {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  min-width: 150px;
}

.clients-table-container {
  overflow-x: auto;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.clients-table {
  width: 100%;
  border-collapse: collapse;
}

.clients-table thead {
  background: var(--bg-alt);
}

.clients-table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}

.clients-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.client-row {
  cursor: pointer;
  transition: background 0.2s;
}

.client-row:hover {
  background: var(--bg-alt);
}

.actions-cell {
  white-space: nowrap;
}

.inline-select {
  padding: 4px 8px;
  border: 2px solid var(--primary);
  border-radius: 4px;
  font-size: 13px;
  background: white;
}

.editable-field {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.editable-field:hover {
  background: var(--bg-alt);
}

.doc-status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.doc-none {
  background: #e2e3e5;
  color: #383d41;
}

.doc-uploaded {
  background: #fff3cd;
  color: #856404;
}

.doc-approved {
  background: #d4edda;
  color: #155724;
}

.doc-rejected {
  background: #f8d7da;
  color: #721c24;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
