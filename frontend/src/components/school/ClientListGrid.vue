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
import { ref, onMounted, watch } from 'vue';
import api from '../../services/api';
import ClientStatusBadge from '../admin/ClientStatusBadge.vue';

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
const clientNotes = ref({}); // Map of clientId -> shared notes

const fetchClients = async () => {
  if (!props.organizationId) {
    loading.value = false;
    error.value = 'Organization ID is required';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const response = await api.get(`/school-portal/${props.organizationId}/clients`);
    clients.value = response.data || [];
    
    // Fetch shared notes for each client (for admin notes column)
    for (const client of clients.value) {
      try {
        const notesResponse = await api.get(`/clients/${client.id}/notes`);
        const notes = notesResponse.data || [];
        // Only show shared notes (non-internal)
        const sharedNotes = notes.filter(n => !n.is_internal_only);
        // Get the most recent shared note as "admin notes"
        if (sharedNotes.length > 0) {
          clientNotes.value[client.id] = sharedNotes[0].message;
        }
      } catch (err) {
        console.error(`Failed to fetch notes for client ${client.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Failed to fetch clients:', err);
    if (err.response?.status === 404) {
      error.value = 'Organization not found.';
    } else if (err.response?.status === 403) {
      error.value = 'You do not have access to this school\'s client list.';
    } else {
      error.value = 'Failed to load students. Please try again later.';
    }
    clients.value = [];
  } finally {
    loading.value = false;
  }
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

const getAdminNotes = (clientId) => {
  return clientNotes.value[clientId] || '-';
};

watch(() => props.organizationId, () => {
  if (props.organizationId) {
    fetchClients();
  }
});

onMounted(() => {
  if (props.organizationId) {
    fetchClients();
  }
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

.client-row {
  cursor: pointer;
  transition: background 0.2s;
}

.client-row:hover {
  background: var(--bg-alt);
}
</style>
