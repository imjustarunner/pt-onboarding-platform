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
            <th>Client Status</th>
            <th>Doc Status</th>
            <th>Assigned Provider</th>
            <th>Assigned Day</th>
            <th></th>
            <th>Submission Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="client in clients" :key="client.id" class="client-row">
            <td>
              <span :class="['status-badge', `status-${String(client.client_status_key || 'unknown').toLowerCase().replace('_', '-')}`]">
                {{ client.client_status_label || '—' }}
              </span>
            </td>
            <td>{{ formatDocStatus(client.document_status) }}</td>
            <td>{{ client.provider_name || 'Not assigned' }}</td>
            <td>{{ client.service_day || '—' }}</td>
            <td>
              <button class="btn btn-secondary btn-sm comment-btn" @click="openClient(client)">
                <span v-if="(client.unread_notes_count || 0) > 0" class="unread-dot" aria-hidden="true" />
                View & Comment
              </button>
            </td>
            <td>{{ formatDate(client.submission_date) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <SchoolClientChatModal
      v-if="selectedClient"
      :client="selectedClient"
      :schoolOrganizationId="organizationId"
      @close="selectedClient = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import api from '../../services/api';
import SchoolClientChatModal from './SchoolClientChatModal.vue';

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
const selectedClient = ref(null);

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

const formatDocStatus = (s) => {
  const v = String(s || '').trim();
  if (!v) return '—';
  if (v.toUpperCase() === 'NONE') return 'None';
  return v.replace(/_/g, ' ');
};

const openClient = (client) => {
  selectedClient.value = client;
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

.client-row {
  cursor: default;
}

.comment-btn {
  position: relative;
}

.unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--danger, #d92d20);
  margin-right: 8px;
  vertical-align: middle;
}
</style>
