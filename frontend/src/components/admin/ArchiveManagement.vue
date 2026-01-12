<template>
  <div class="archive-management">
    <div class="section-header">
      <h2>Archive Management</h2>
      <p class="section-description">
        View and manage archived items. Archived items can be permanently deleted from here.
      </p>
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
const archivedAgencies = ref([]);
const loadingTrainingFocuses = ref(false);
const loadingModules = ref(false);
const loadingUsers = ref(false);
const loadingDocuments = ref(false);
const loadingAgencies = ref(false);

const tabs = computed(() => {
  const allTabs = [
    { id: 'training-focuses', label: 'Training Focuses', count: archivedTrainingFocuses.value.length },
    { id: 'modules', label: 'Modules', count: archivedModules.value.length },
    { id: 'users', label: 'Users', count: archivedUsers.value.length },
    { id: 'documents', label: 'Documents', count: archivedDocuments.value.length }
  ];
  
  // Only show agencies tab for super admins
  if (authStore.user?.role === 'super_admin') {
    allTabs.push({ id: 'agencies', label: 'Agencies', count: archivedAgencies.value.length });
  }
  
  return allTabs;
});

// Watch for agency changes and refetch archived items
watch(() => agencyStore.currentAgency, () => {
  fetchAllArchived();
});

const fetchArchivedTrainingFocuses = async () => {
  try {
    loadingTrainingFocuses.value = true;
    const params = {};
    // If an agency is selected, filter by that agency's archived items
    if (agencyStore.currentAgency?.id) {
      params.archivedByAgencyId = agencyStore.currentAgency.id;
    }
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
    if (agencyStore.currentAgency?.id) {
      params.archivedByAgencyId = agencyStore.currentAgency.id;
    }
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
    if (agencyStore.currentAgency?.id) {
      params.archivedByAgencyId = agencyStore.currentAgency.id;
    }
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
    if (agencyStore.currentAgency?.id) {
      params.archivedByAgencyId = agencyStore.currentAgency.id;
    }
    const response = await api.get('/document-templates/archived', { params });
    archivedDocuments.value = response.data || [];
  } catch (err) {
    console.error('Failed to load archived documents:', err);
    archivedDocuments.value = [];
  } finally {
    loadingDocuments.value = false;
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

const fetchAllArchived = async () => {
  const promises = [
    fetchArchivedTrainingFocuses(),
    fetchArchivedModules(),
    fetchArchivedUsers(),
    fetchArchivedDocuments()
  ];
  
  // Only fetch agencies for super admins
  if (authStore.user?.role === 'super_admin') {
    promises.push(fetchArchivedAgencies());
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

onMounted(async () => {
  // Ensure agencies are loaded
  await agencyStore.fetchUserAgencies();
  // Fetch archived items
  await fetchAllArchived();
});
</script>

<style scoped>
.archive-management {
  padding: 24px;
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
  padding: 32px;
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
  min-width: 800px;
}

.archive-table thead {
  background: var(--bg-alt);
}

.archive-table th {
  padding: 10px 8px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.archive-table td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 14px;
  vertical-align: middle;
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
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions-cell {
  white-space: nowrap;
  width: 1%;
}

.actions-cell .btn-sm {
  padding: 4px 8px;
  font-size: 11px;
  margin: 0 2px;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}
</style>

