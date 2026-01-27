<template>
  <div class="archive-management">
    <div class="section-header">
      <h2>Archive Management</h2>
      <p class="section-description">
        View and manage archived items. Archived items can be permanently deleted from here.
      </p>
    </div>

    <!-- Super admin agency filter -->
    <div v-if="authStore.user?.role === 'super_admin'" class="archive-filters">
      <label class="filter-label">Agency:</label>
      <select v-model="archiveAgencyFilter" class="filter-select">
        <option value="">All agencies</option>
        <option v-for="a in allAgenciesForFilter" :key="a.id" :value="String(a.id)">
          {{ a.name }}
        </option>
      </select>
    </div>

    <div class="archive-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="['tab-button', { active: activeTab === tab.id }]"
      >
        {{ tab.label }}
        <span v-if="tab.count > 0" class="tab-badge">{{ tab.count }}</span>
      </button>
    </div>

    <div class="archive-content">
      <!-- Training Focuses Archive -->
      <div v-if="activeTab === 'training-focuses'" class="archive-section">
        <h3>Archived Training Focuses</h3>
        <div v-if="loadingTrainingFocuses" class="loading">Loading archived training focuses...</div>
        <div v-else-if="archivedTrainingFocuses.length === 0" class="empty-state">
          <p>No archived training focuses.</p>
        </div>
        <div v-else class="archive-table-container">
          <table class="archive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Archived Date</th>
                <th>Archived By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="focus in archivedTrainingFocuses" :key="focus.id">
                <td class="name-cell">{{ focus.name }}</td>
                <td class="description-cell">{{ focus.description || '-' }}</td>
                <td>{{ formatDate(focus.archived_at) }}</td>
                <td>
                  <span v-if="focus.archived_by_user_name">{{ focus.archived_by_user_name }}</span>
                  <span v-else-if="focus.archived_by_user_id">User ID: {{ focus.archived_by_user_id }}</span>
                  <span v-else>-</span>
                </td>
                <td class="actions-cell">
                  <button @click="restoreTrainingFocus(focus.id)" class="btn btn-success btn-sm">Restore</button>
                  <button @click="permanentlyDeleteTrainingFocus(focus.id)" class="btn btn-danger btn-sm">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modules Archive -->
      <div v-if="activeTab === 'modules'" class="archive-section">
        <h3>Archived Modules</h3>
        <div v-if="loadingModules" class="loading">Loading archived modules...</div>
        <div v-else-if="archivedModules.length === 0" class="empty-state">
          <p>No archived modules.</p>
        </div>
        <div v-else class="archive-table-container">
          <table class="archive-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Description</th>
                <th>Archived Date</th>
                <th>Archived By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="module in archivedModules" :key="module.id">
                <td class="name-cell">{{ module.title }}</td>
                <td class="description-cell">{{ module.description || '-' }}</td>
                <td>{{ formatDate(module.archived_at) }}</td>
                <td>
                  <span v-if="module.archived_by_user_name">{{ module.archived_by_user_name }}</span>
                  <span v-else-if="module.archived_by_user_id">User ID: {{ module.archived_by_user_id }}</span>
                  <span v-else>-</span>
                </td>
                <td class="actions-cell">
                  <button @click="restoreModule(module.id)" class="btn btn-success btn-sm">Restore</button>
                  <button @click="permanentlyDeleteModule(module.id)" class="btn btn-danger btn-sm">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Users Archive -->
      <div v-if="activeTab === 'users'" class="archive-section">
        <h3>Archived Users</h3>
        <div v-if="loadingUsers" class="loading">Loading archived users...</div>
        <div v-else-if="archivedUsers.length === 0" class="empty-state">
          <p>No archived users.</p>
        </div>
        <div v-else class="archive-table-container">
          <table class="archive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Archived Date</th>
                <th>Archived By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in archivedUsers" :key="user.id">
                <td class="name-cell">{{ user.first_name }} {{ user.last_name }}</td>
                <td>{{ user.email }}</td>
                <td>{{ user.role }}</td>
                <td>{{ formatDate(user.archived_at) }}</td>
                <td>
                  <span v-if="user.archived_by_user_name">{{ user.archived_by_user_name }}</span>
                  <span v-else-if="user.archived_by_user_id">User ID: {{ user.archived_by_user_id }}</span>
                  <span v-else>-</span>
                </td>
                <td class="actions-cell">
                  <button @click="restoreUser(user.id)" class="btn btn-success btn-sm">Restore</button>
                  <button @click="permanentlyDeleteUser(user.id)" class="btn btn-danger btn-sm">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Documents Archive -->
      <div v-if="activeTab === 'documents'" class="archive-section">
        <h3>Archived Documents</h3>
        <div v-if="loadingDocuments" class="loading">Loading archived documents...</div>
        <div v-else-if="archivedDocuments.length === 0" class="empty-state">
          <p>No archived documents.</p>
        </div>
        <div v-else class="archive-table-container">
          <table class="archive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Type</th>
                <th>Archived Date</th>
                <th>Archived By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="document in archivedDocuments" :key="document.id">
                <td class="name-cell">{{ document.name }}</td>
                <td class="description-cell">{{ document.description || '-' }}</td>
                <td>{{ document.document_type || 'N/A' }}</td>
                <td>{{ formatDate(document.archived_at) }}</td>
                <td>
                  <span v-if="document.archived_by_user_name">{{ document.archived_by_user_name }}</span>
                  <span v-else-if="document.archived_by_user_id">User ID: {{ document.archived_by_user_id }}</span>
                  <span v-else>-</span>
                </td>
                <td class="actions-cell">
                  <button @click="restoreDocument(document.id)" class="btn btn-success btn-sm">Restore</button>
                  <button @click="permanentlyDeleteDocument(document.id)" class="btn btn-danger btn-sm">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Clients Archive -->
      <div v-if="activeTab === 'clients'" class="archive-section">
        <h3>Archived Clients</h3>
        <div v-if="loadingClients" class="loading">Loading archived clients...</div>
        <div v-else-if="archivedClients.length === 0" class="empty-state">
          <p>No archived clients.</p>
        </div>
        <div v-else class="archive-table-container">
          <table class="archive-table">
            <thead>
              <tr>
                <th>Initials</th>
                <th>Client Code</th>
                <th>School</th>
                <th>Agency</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in archivedClients" :key="c.id">
                <td class="name-cell">{{ c.initials }}</td>
                <td>{{ c.identifier_code || '-' }}</td>
                <td>{{ c.organization_name || ('Org ID: ' + c.organization_id) }}</td>
                <td>{{ c.agency_name || ('Agency ID: ' + c.agency_id) }}</td>
                <td class="actions-cell">
                  <button @click="restoreClient(c.id)" class="btn btn-success btn-sm">Restore</button>
                  <button @click="permanentlyDeleteClient(c.id)" class="btn btn-danger btn-sm">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Agencies Archive -->
      <div v-if="activeTab === 'agencies'" class="archive-section">
        <h3>Archived Agencies</h3>
        <div v-if="loadingAgencies" class="loading">Loading archived agencies...</div>
        <div v-else-if="archivedAgencies.length === 0" class="empty-state">
          <p>No archived agencies.</p>
        </div>
        <div v-else class="archive-table-container">
          <table class="archive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Archived Date</th>
                <th>Archived By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="agency in archivedAgencies" :key="agency.id">
                <td class="name-cell">{{ agency.name }}</td>
                <td>{{ agency.slug || '-' }}</td>
                <td>{{ formatDate(agency.archived_at) }}</td>
                <td>
                  <span v-if="agency.archived_by_user_name">{{ agency.archived_by_user_name }}</span>
                  <span v-else-if="agency.archived_by_user_id">User ID: {{ agency.archived_by_user_id }}</span>
                  <span v-else>-</span>
                </td>
                <td class="actions-cell">
                  <button @click="restoreAgency(agency.id)" class="btn btn-success btn-sm">Restore</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Buildings Archive -->
      <div v-if="activeTab === 'buildings'" class="archive-section">
        <h3>Archived Buildings</h3>
        <div v-if="loadingBuildings" class="loading">Loading archived buildings...</div>
        <div v-else-if="archivedBuildings.length === 0" class="empty-state">
          <p>No archived buildings.</p>
        </div>
        <div v-else class="archive-table-container">
          <table class="archive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Primary Agency</th>
                <th>Archived Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in archivedBuildings" :key="b.id">
                <td class="name-cell">{{ b.name }}</td>
                <td>Agency ID: {{ b.agency_id }}</td>
                <td>{{ formatDate(b.archived_at || b.updated_at) }}</td>
                <td class="actions-cell">
                  <button @click="restoreBuilding(b.id)" class="btn btn-success btn-sm">Restore</button>
                  <button @click="permanentlyDeleteBuilding(b.id)" class="btn btn-danger btn-sm">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const activeTab = ref('training-focuses');
const archivedTrainingFocuses = ref([]);
const archivedModules = ref([]);
const archivedUsers = ref([]);
const archivedDocuments = ref([]);
const archivedClients = ref([]);
const archivedAgencies = ref([]);
const archivedBuildings = ref([]);
const loadingTrainingFocuses = ref(false);
const loadingModules = ref(false);
const loadingUsers = ref(false);
const loadingDocuments = ref(false);
const loadingClients = ref(false);
const loadingAgencies = ref(false);
const loadingBuildings = ref(false);

// For super_admin: allow choosing "All agencies" vs a specific agency.
// Do NOT implicitly filter by agencyStore.currentAgency for super_admin, since it's persisted in localStorage
// and unintentionally hides "global" results.
const archiveAgencyFilter = ref(''); // '' = all
const allAgenciesForFilter = computed(() => {
  const list = Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [];
  // Stable sort for nicer UX.
  return list.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const tabs = computed(() => {
  const allTabs = [
    { id: 'training-focuses', label: 'Training Focuses', count: archivedTrainingFocuses.value.length },
    { id: 'modules', label: 'Modules', count: archivedModules.value.length },
    { id: 'users', label: 'Users', count: archivedUsers.value.length },
    { id: 'documents', label: 'Documents', count: archivedDocuments.value.length },
    { id: 'clients', label: 'Clients', count: archivedClients.value.length }
  ];
  
  // Only show agencies tab for super admins
  if (authStore.user?.role === 'super_admin') {
    allTabs.push({ id: 'agencies', label: 'Agencies', count: archivedAgencies.value.length });
    allTabs.push({ id: 'buildings', label: 'Buildings', count: archivedBuildings.value.length });
  }
  
  return allTabs;
});

const getSelectedArchivedByAgencyId = () => {
  if (authStore.user?.role === 'super_admin') {
    const raw = String(archiveAgencyFilter.value || '').trim();
    const id = raw ? parseInt(raw, 10) : null;
    return Number.isFinite(id) ? id : null;
  }
  return agencyStore.currentAgency?.id ? Number(agencyStore.currentAgency.id) : null;
};

// Watch for agency changes and refetch archived items
watch([() => agencyStore.currentAgency, () => archiveAgencyFilter.value], () => {
  fetchAllArchived();
});

const fetchArchivedTrainingFocuses = async () => {
  try {
    loadingTrainingFocuses.value = true;
    const params = {};
    // If an agency is selected, filter by that agency's archived items
    const selectedId = getSelectedArchivedByAgencyId();
    if (selectedId) params.archivedByAgencyId = selectedId;
    const response = await api.get('/training-focuses/archived', { params });
    archivedTrainingFocuses.value = response.data || [];
  } catch (err) {
    console.error('Failed to load archived training focuses:', err);
    archivedTrainingFocuses.value = [];
  } finally {
    loadingTrainingFocuses.value = false;
  }
};

const fetchArchivedModules = async () => {
  try {
    loadingModules.value = true;
    const params = {};
    // If an agency is selected, filter by that agency's archived items
    const selectedId = getSelectedArchivedByAgencyId();
    if (selectedId) params.archivedByAgencyId = selectedId;
    const response = await api.get('/modules/archived', { params });
    archivedModules.value = response.data || [];
  } catch (err) {
    console.error('Failed to load archived modules:', err);
    archivedModules.value = [];
  } finally {
    loadingModules.value = false;
  }
};

const fetchArchivedUsers = async () => {
  try {
    loadingUsers.value = true;
    const params = {};
    // If an agency is selected, filter by that agency's archived items
    const selectedId = getSelectedArchivedByAgencyId();
    if (selectedId) params.archivedByAgencyId = selectedId;
    const response = await api.get('/users/archived', { params });
    archivedUsers.value = response.data || [];
  } catch (err) {
    console.error('Failed to load archived users:', err);
    archivedUsers.value = [];
  } finally {
    loadingUsers.value = false;
  }
};

const fetchArchivedDocuments = async () => {
  try {
    loadingDocuments.value = true;
    const params = {};
    // If an agency is selected, filter by that agency's archived items
    const selectedId = getSelectedArchivedByAgencyId();
    if (selectedId) params.archivedByAgencyId = selectedId;
    const response = await api.get('/document-templates/archived', { params });
    archivedDocuments.value = response.data || [];
  } catch (err) {
    console.error('Failed to load archived documents:', err);
    archivedDocuments.value = [];
  } finally {
    loadingDocuments.value = false;
  }
};

const fetchArchivedClients = async () => {
  try {
    loadingClients.value = true;
    const params = {};
    const selectedId = getSelectedArchivedByAgencyId();
    if (selectedId) params.agency_id = selectedId;
    const response = await api.get('/clients/archived', { params });
    archivedClients.value = response.data || [];
  } catch (err) {
    console.error('Failed to load archived clients:', err);
    archivedClients.value = [];
  } finally {
    loadingClients.value = false;
  }
};

const fetchArchivedAgencies = async () => {
  // Only super admins can view archived agencies
  if (authStore.user?.role !== 'super_admin') {
    archivedAgencies.value = [];
    return;
  }
  
  try {
    loadingAgencies.value = true;
    const response = await api.get('/agencies/archived');
    archivedAgencies.value = response.data || [];
  } catch (err) {
    console.error('Failed to load archived agencies:', err);
    archivedAgencies.value = [];
  } finally {
    loadingAgencies.value = false;
  }
};

const fetchArchivedBuildings = async () => {
  // Only super admins can view archived buildings
  if (authStore.user?.role !== 'super_admin') {
    archivedBuildings.value = [];
    return;
  }

  try {
    loadingBuildings.value = true;
    const response = await api.get('/offices/archived');
    archivedBuildings.value = response.data || [];
  } catch (err) {
    console.error('Failed to load archived buildings:', err);
    archivedBuildings.value = [];
  } finally {
    loadingBuildings.value = false;
  }
};

const fetchAllArchived = async () => {
  const promises = [
    fetchArchivedTrainingFocuses(),
    fetchArchivedModules(),
    fetchArchivedUsers(),
    fetchArchivedDocuments(),
    fetchArchivedClients()
  ];
  
  // Only fetch agencies for super admins
  if (authStore.user?.role === 'super_admin') {
    promises.push(fetchArchivedAgencies());
    promises.push(fetchArchivedBuildings());
  }
  
  await Promise.all(promises);
};

const restoreTrainingFocus = async (id) => {
  if (!confirm('Are you sure you want to restore this training focus? It will be set to active.')) {
    return;
  }
  
  try {
    await api.post(`/training-focuses/${id}/restore`);
    await fetchArchivedTrainingFocuses();
    alert('Training focus restored successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to restore training focus');
  }
};

const permanentlyDeleteTrainingFocus = async (id) => {
  if (!confirm('Are you sure you want to permanently delete this training focus? This action CANNOT be undone.')) {
    return;
  }
  
  try {
    await api.delete(`/training-focuses/${id}`);
    await fetchArchivedTrainingFocuses();
    alert('Training focus permanently deleted');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to delete training focus');
  }
};

const restoreModule = async (id) => {
  if (!confirm('Are you sure you want to restore this module? It will be set to active.')) {
    return;
  }
  
  try {
    await api.post(`/modules/${id}/restore`);
    await fetchArchivedModules();
    alert('Module restored successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to restore module');
  }
};

const permanentlyDeleteModule = async (id) => {
  if (!confirm('Are you sure you want to permanently delete this module? This action CANNOT be undone.')) {
    return;
  }
  
  try {
    await api.delete(`/modules/${id}`);
    await fetchArchivedModules();
    alert('Module permanently deleted');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to delete module');
  }
};

const restoreUser = async (id) => {
  if (!confirm('Are you sure you want to restore this user? They will be set to active.')) {
    return;
  }
  
  try {
    await api.post(`/users/${id}/restore`);
    await fetchArchivedUsers();
    alert('User restored successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to restore user');
  }
};

const permanentlyDeleteUser = async (id) => {
  if (!confirm('Are you sure you want to permanently delete this user? This action CANNOT be undone.')) {
    return;
  }
  
  try {
    await api.delete(`/users/${id}`);
    await fetchArchivedUsers();
    alert('User permanently deleted');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to delete user');
  }
};

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleString();
};

const restoreDocument = async (id) => {
  if (!confirm('Are you sure you want to restore this document? It will be set to active.')) {
    return;
  }
  
  try {
    await api.post(`/document-templates/${id}/restore`);
    await fetchArchivedDocuments();
    alert('Document restored successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to restore document');
  }
};

const permanentlyDeleteDocument = async (id) => {
  if (!confirm('Are you sure you want to permanently delete this document? This action CANNOT be undone.')) {
    return;
  }
  
  try {
    await api.delete(`/document-templates/${id}`);
    await fetchArchivedDocuments();
    alert('Document permanently deleted');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to delete document');
  }
};

const restoreClient = async (id) => {
  if (!confirm('Are you sure you want to restore this client? They will be removed from the archive.')) {
    return;
  }
  try {
    await api.post(`/clients/${id}/unarchive`);
    await fetchArchivedClients();
    alert('Client restored successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to restore client');
  }
};

const permanentlyDeleteClient = async (id) => {
  if (!confirm('Are you sure you want to permanently delete this client? This action CANNOT be undone.')) {
    return;
  }
  try {
    await api.delete(`/clients/${id}`);
    await fetchArchivedClients();
    alert('Client permanently deleted');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to delete client');
  }
};

const restoreAgency = async (id) => {
  if (!confirm('Are you sure you want to restore this agency? It will be set to active.')) {
    return;
  }
  
  try {
    await api.post(`/agencies/${id}/restore`);
    await fetchArchivedAgencies();
    // Also refresh the agency store so the restored agency appears in the main list
    await agencyStore.fetchAgencies();
    alert('Agency restored successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to restore agency');
  }
};

const restoreBuilding = async (id) => {
  if (!confirm('Are you sure you want to restore this building? It will be set to active.')) {
    return;
  }

  try {
    await api.post(`/offices/${id}/restore`);
    await fetchArchivedBuildings();
    alert('Building restored successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to restore building');
  }
};

const permanentlyDeleteBuilding = async (id) => {
  if (!confirm('Are you sure you want to permanently delete this building? This action CANNOT be undone.')) {
    return;
  }

  try {
    await api.delete(`/offices/${id}`);
    await fetchArchivedBuildings();
    alert('Building permanently deleted');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to delete building');
  }
};

onMounted(async () => {
  // Ensure agencies are loaded
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
  }
  // Fetch archived items
  await fetchAllArchived();
});
</script>

<style scoped>
.archive-management {
  padding: 16px;
}

.archive-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px 0;
}

.filter-label {
  font-weight: 600;
  color: var(--text-primary);
}

.filter-select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 260px;
}

.section-header {
  margin-bottom: 32px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.section-description {
  color: var(--text-secondary);
  margin: 0;
}

.archive-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
}

.tab-button {
  position: relative;
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--accent);
}

.tab-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  background: #dc2626;
  color: white;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  min-width: 18px;
  text-align: center;
}

.archive-content {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.archive-section h3 {
  margin: 0 0 24px 0;
  color: var(--text-primary);
}

.archive-table-container {
  overflow-x: auto;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.archive-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.archive-table thead {
  background: var(--bg-alt);
}

.archive-table th {
  padding: 6px 6px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.archive-table td {
  padding: 6px 6px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 14px;
  vertical-align: middle;
  word-break: break-word;
}

.archive-table tbody tr:hover {
  background: var(--bg-alt);
}

.name-cell {
  font-weight: 600;
  color: var(--text-primary);
}

.description-cell {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
}

.actions-cell {
  white-space: nowrap;
  width: 1%;
}

.actions-cell .btn-sm {
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1.1;
  min-height: 0;
  height: auto;
  margin: 0 2px;
}

/* Some global button styles set large padding; keep archive actions compact. */
.actions-cell .btn {
  padding: 2px 6px;
  line-height: 1.1;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}
</style>

