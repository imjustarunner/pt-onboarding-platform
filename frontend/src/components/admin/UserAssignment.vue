<template>
  <div class="user-assignment">
    <div class="section-header">
      <h2>User Assignments</h2>
      <div class="header-controls">
        <select v-model="filterAgencyId" class="filter-select">
          <option value="">All Agencies</option>
          <option
            v-for="agency in agencies"
            :key="agency.id"
            :value="agency.id"
          >
            {{ agency.name }}
          </option>
        </select>
        <select v-model="sortBy" class="sort-select">
          <option value="none">Sort by...</option>
          <option value="agency">Sort by Agency</option>
          <option value="name">Sort by Name</option>
          <option value="email">Sort by Email</option>
        </select>
      </div>
    </div>
    
    <div v-if="loading" class="loading">Loading users...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="users-table-container">
      <table class="users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Agencies</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in sortedUsers"
            :key="user.id"
            class="user-row"
          >
            <td class="user-name">{{ user.first_name }} {{ user.last_name }}</td>
            <td class="user-email">{{ user.email }}</td>
            <td>
              <span :class="['badge', getRoleBadgeClass(user.role)]">
                {{ user.role }}
              </span>
            </td>
            <td class="agencies-cell">
              <div v-if="userAgencies[user.id]?.length" class="assignment-list">
                <span
                  v-for="agency in userAgencies[user.id]"
                  :key="agency.id"
                  class="assignment-tag"
                >
                  {{ agency.name }}
                  <button @click="removeAgency(user.id, agency.id)" class="remove-btn" title="Remove agency">×</button>
                </span>
              </div>
              <span v-else class="no-agencies">No agencies</span>
            </td>
            <td class="actions-cell">
              <select v-model="selectedAgencies[user.id]" @change="addAgency(user.id)" class="assignment-select">
                <option value="">Add agency...</option>
                <option
                  v-for="agency in agencies"
                  :key="agency.id"
                  :value="agency.id"
                  :disabled="userAgencies[user.id]?.some(a => a.id === agency.id)"
                >
                  {{ agency.name }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';

const users = ref([]);
const agencies = ref([]);
const userAgencies = ref({});
const selectedAgencies = ref({});
const loading = ref(true);
const error = ref('');
const sortBy = ref('none');
const filterAgencyId = ref('');

const fetchUsers = async () => {
  try {
    loading.value = true;
    const response = await api.get('/users');
    users.value = response.data;
    
    // Fetch agencies for each user
    for (const user of users.value) {
      await fetchUserAgencies(user.id);
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load users';
  } finally {
    loading.value = false;
  }
};

const fetchUserAgencies = async (userId) => {
  try {
    const response = await api.get(`/users/${userId}/agencies`);
    userAgencies.value[userId] = response.data;
  } catch (err) {
    userAgencies.value[userId] = [];
  }
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    agencies.value = response.data;
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

// Computed properties removed - using direct references

const addAgency = async (userId) => {
  const agencyId = selectedAgencies.value[userId];
  if (!agencyId) return;
  
  try {
    await api.post('/users/assign/agency', { userId, agencyId: parseInt(agencyId) });
    await fetchUserAgencies(userId);
    selectedAgencies.value[userId] = '';
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to assign agency');
  }
};

const removeAgency = async (userId, agencyId) => {
  if (!confirm('Remove this agency assignment?')) return;
  
  try {
    await api.post('/users/remove/agency', { userId, agencyId });
    await fetchUserAgencies(userId);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to remove agency');
  }
};


const getRoleBadgeClass = (role) => {
  const classes = {
    'super_admin': 'badge-warning',
    'admin': 'badge-info',
    'supervisor': 'badge-success',
    'clinician': 'badge-secondary',
    'facilitator': 'badge-secondary',
    'intern': 'badge-secondary'
  };
  return classes[role] || 'badge-secondary';
};

const filteredUsers = computed(() => {
  if (!filterAgencyId.value) {
    return users.value;
  }
  
  const agencyId = parseInt(filterAgencyId.value);
  return users.value.filter(user => {
    const userAgenciesList = userAgencies.value[user.id] || [];
    return userAgenciesList.some(agency => agency.id === agencyId);
  });
});

const sortedUsers = computed(() => {
  let usersToSort = filteredUsers.value;
  
  if (sortBy.value === 'none') {
    return usersToSort;
  }
  
  const sorted = [...usersToSort];
  
  if (sortBy.value === 'agency') {
    sorted.sort((a, b) => {
      const aAgencies = userAgencies.value[a.id] || [];
      const bAgencies = userAgencies.value[b.id] || [];
      
      // Users with no agencies go to the end
      if (aAgencies.length === 0 && bAgencies.length === 0) {
        return 0;
      }
      if (aAgencies.length === 0) return 1;
      if (bAgencies.length === 0) return -1;
      
      // Sort by first agency name alphabetically
      const aFirstAgency = aAgencies[0]?.name || '';
      const bFirstAgency = bAgencies[0]?.name || '';
      return aFirstAgency.localeCompare(bFirstAgency);
    });
  } else if (sortBy.value === 'name') {
    sorted.sort((a, b) => {
      const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim();
      const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim();
      return aName.localeCompare(bName);
    });
  } else if (sortBy.value === 'email') {
    sorted.sort((a, b) => {
      return (a.email || '').localeCompare(b.email || '');
    });
  }
  
  return sorted;
});

onMounted(async () => {
  await fetchAgencies();
  await fetchUsers();
});
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.header-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-select,
.sort-select {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  min-width: 150px;
}

.users-table-container {
  overflow-x: auto;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
}

.users-table thead {
  background: var(--bg-alt);
}

.users-table th {
  padding: 10px 8px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.users-table td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 14px;
  vertical-align: middle;
}

.users-table tbody tr:hover {
  background: var(--bg-alt);
}

.user-name {
  font-weight: 600;
  color: var(--text-primary);
}

.user-email {
  color: var(--text-secondary);
}

.agencies-cell {
  min-width: 200px;
}

.assignment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.assignment-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.remove-btn {
  background: none;
  border: none;
  color: var(--error);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 2px;
}

.remove-btn:hover {
  color: #dc2626;
}

.no-agencies {
  color: var(--text-secondary);
  font-style: italic;
  font-size: 13px;
}

.actions-cell {
  white-space: nowrap;
  width: 1%;
}

.assignment-select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: white;
  cursor: pointer;
  min-width: 150px;
}

.assignment-select:focus {
  outline: none;
  border-color: var(--primary);
}

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-warning {
  background: #fef3c7;
  color: #92400e;
}

.badge-info {
  background: #dbeafe;
  color: #1e40af;
}

.badge-success {
  background: #d1fae5;
  color: #065f46;
}

.badge-secondary {
  background: #e5e7eb;
  color: #374151;
}
</style>

