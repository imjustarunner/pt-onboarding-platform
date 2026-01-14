<template>
  <div class="client-list-grid">
    <div v-if="loading" class="loading-state">
      <p>Loading students...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="clients.length === 0" class="empty-state">
      <p>No students found.</p>
    </div>

    <div v-else class="clients-table">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Assigned Provider</th>
            <th>Admin Notes</th>
            <th>Submission Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="client in clients" :key="client.id">
            <td>
              <span :class="['status-badge', `status-${client.status.toLowerCase().replace('_', '-')}`]">
                {{ formatStatus(client.status) }}
              </span>
            </td>
            <td>{{ client.provider_name || 'Not assigned' }}</td>
            <td>{{ client.admin_notes || '-' }}</td>
            <td>{{ formatDate(client.submission_date) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  },
  organizationId: {
    type: Number,
    default: null
  }
});

const clients = ref([]);
const loading = ref(false);
const error = ref('');

const fetchClients = async () => {
  if (!props.organizationId) {
    loading.value = false;
    error.value = 'Organization ID is required';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    // TODO: Update endpoint when clients API is ready (Step 2)
    // For now, this is a placeholder that will work once the clients table exists
    const response = await api.get(`/school-portal/${props.organizationId}/clients`);
    clients.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch clients:', err);
    // For now, show empty state until clients API is implemented
    // This is expected until Step 2 (Client Management) is complete
    if (err.response?.status === 501) {
      error.value = 'Client management will be available in Step 2 (Client Management Module).';
    } else {
      error.value = 'Failed to load students. Please try again later.';
    }
    clients.value = [];
  } finally {
    loading.value = false;
  }
};

const formatStatus = (status) => {
  const statusMap = {
    'PENDING_REVIEW': 'Pending Review',
    'ACTIVE': 'Active',
    'ON_HOLD': 'On Hold',
    'DECLINED': 'Declined',
    'ARCHIVED': 'Archived'
  };
  return statusMap[status] || status;
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

onMounted(() => {
  fetchClients();
});
</script>

<style scoped>
.client-list-grid {
  width: 100%;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.error-state {
  color: #c33;
}

.clients-table {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: var(--bg-alt);
}

th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
}

td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}

.status-pending-review {
  background: #fff3cd;
  color: #856404;
}

.status-active {
  background: #d4edda;
  color: #155724;
}

.status-on-hold {
  background: #ffeaa7;
  color: #856404;
}

.status-declined {
  background: #f8d7da;
  color: #721c24;
}

.status-archived {
  background: #e2e3e5;
  color: #383d41;
}
</style>
