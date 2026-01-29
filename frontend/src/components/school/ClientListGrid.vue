<template>
  <div class="client-list-grid">
    <div v-if="loading" class="loading-state">
      <p>Loading clients...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="clients.length === 0" class="empty-state">
      <p>No clients found.</p>
    </div>

    <div v-else class="clients-table">
      <div v-if="showSearch" class="table-toolbar">
        <input
          v-model="searchQuery"
          class="table-search"
          type="search"
          :placeholder="searchPlaceholder"
        />
      </div>
      <table>
        <thead>
          <tr>
            <th class="sortable" @click="toggleSort('initials')" role="button" tabindex="0">
              Client
              <span class="sort-indicator" v-if="sortKey === 'initials'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('status')" role="button" tabindex="0">
              Client Status
              <span class="sort-indicator" v-if="sortKey === 'status'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('document_status')" role="button" tabindex="0">
              Doc Status
              <span class="sort-indicator" v-if="sortKey === 'document_status'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('provider_name')" role="button" tabindex="0">
              Assigned Provider
              <span class="sort-indicator" v-if="sortKey === 'provider_name'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('skills')" role="button" tabindex="0">
              Skills
              <span class="sort-indicator" v-if="sortKey === 'skills'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('service_day')" role="button" tabindex="0">
              Assigned Day
              <span class="sort-indicator" v-if="sortKey === 'service_day'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th></th>
            <th v-if="showChecklistButton"></th>
            <th v-if="canEditClients" class="edit-col">Edit</th>
            <th class="sortable" @click="toggleSort('submission_date')" role="button" tabindex="0">
              Submission Date
              <span class="sort-indicator" v-if="sortKey === 'submission_date'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="client in sortedClients" :key="client.id" class="client-row">
            <td class="initials-cell">
              <span class="initials" :title="rosterLabelTitle(client)">{{ formatRosterLabel(client) }}</span>
            </td>
            <td>
              <span :class="['status-badge', `status-${String(client.client_status_key || 'unknown').toLowerCase().replace('_', '-')}`]">
                {{ client.client_status_label || '—' }}
              </span>
            </td>
            <td>{{ formatDocSummary(client) }}</td>
            <td>{{ client.provider_name || 'Not assigned' }}</td>
            <td>{{ client.skills ? 'Yes' : 'No' }}</td>
            <td>{{ client.service_day || '—' }}</td>
            <td>
              <button class="btn btn-secondary btn-sm comment-btn" @click="openClient(client)">
                <span v-if="(client.unread_notes_count || 0) > 0" class="unread-dot" aria-hidden="true" />
                View & Comment
              </button>
            </td>
            <td v-if="showChecklistButton">
              <button
                v-if="client.user_is_assigned_provider"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="goChecklist(client)"
              >
                Checklist
              </button>
            </td>
            <td v-if="canEditClients" class="edit-col">
              <button class="btn btn-primary btn-sm" type="button" @click="goEdit(client)">Edit</button>
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
import { computed, ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import SchoolClientChatModal from './SchoolClientChatModal.vue';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  },
  organizationId: {
    type: Number,
    default: null
  },
  rosterScope: {
    type: String,
    default: 'school' // 'school' | 'provider'
  },
  clientLabelMode: {
    type: String,
    default: 'codes' // 'codes' | 'initials'
  },
  editMode: {
    type: String,
    default: 'navigate' // 'navigate' | 'inline'
  },
  showSearch: {
    type: Boolean,
    default: true
  },
  searchPlaceholder: {
    type: String,
    default: 'Search roster…'
  }
});

const emit = defineEmits(['edit-client']);

const clients = ref([]);
const loading = ref(false);
const error = ref('');
const selectedClient = ref(null);
const searchQuery = ref('');
const router = useRouter();
const authStore = useAuthStore();

const canEditClients = ref(false);
const showChecklistButton = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'provider';
});

const sortKey = ref('submission_date');
const sortDir = ref('desc');

const fetchClients = async () => {
  // School roster requires a numeric org id.
  // Provider "My roster" can fall back to using the org slug (more robust across contexts).
  if (!props.organizationId && props.rosterScope !== 'provider') {
    loading.value = false;
    error.value = 'Organization ID is required';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const orgKey =
      props.rosterScope === 'provider'
        ? (props.organizationId ? String(props.organizationId) : String(props.organizationSlug || '').trim())
        : String(props.organizationId);

    if (!orgKey) {
      clients.value = [];
      error.value = 'Organization not loaded.';
      return;
    }

    const endpoint =
      props.rosterScope === 'provider'
        ? `/school-portal/${encodeURIComponent(orgKey)}/my-roster`
        : `/school-portal/${encodeURIComponent(orgKey)}/clients`;
    const response = await api.get(endpoint);
    clients.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch clients:', err);
    if (err.response?.status === 404) {
      error.value = 'Organization not found.';
    } else if (err.response?.status === 403) {
      const r = String(authStore.user?.role || '').toLowerCase();
      error.value =
        props.rosterScope === 'provider' || r === 'provider'
          ? 'Your roster is not available for this organization.'
          : 'You do not have access to this school\'s client list.';
    } else {
      error.value = 'Failed to load students. Please try again later.';
    }
    clients.value = [];
  } finally {
    loading.value = false;
  }
};

const fetchEditPermissions = async () => {
  if (!props.organizationId) {
    canEditClients.value = false;
    return;
  }
  try {
    const r = await api.get(`/school-portal/${props.organizationId}/affiliation`);
    canEditClients.value = !!r.data?.can_edit_clients;
  } catch {
    canEditClients.value = false;
  }
};

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = key;
  // Default date sorts newest-first; everything else asc.
  sortDir.value = key === 'submission_date' ? 'desc' : 'asc';
};

const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const sortValue = (client, key) => {
  if (!client) return '';
  if (key === 'status') return String(client.client_status_label || client.status || '').toLowerCase();
  if (key === 'document_status') return String(formatDocSummary(client) || '').toLowerCase();
  if (key === 'provider_name') return String(client.provider_name || '').toLowerCase();
  if (key === 'skills') return client.skills ? 1 : 0;
  if (key === 'service_day') {
    // Multi-provider may return "Mon, Wed"; sort by first day token.
    const raw = String(client.service_day || '');
    const first = raw.split(',')[0]?.trim() || raw;
    const d = first;
    const idx = dayOrder.indexOf(d);
    return idx < 0 ? 999 : idx;
  }
  if (key === 'submission_date') {
    const t = client.submission_date ? new Date(client.submission_date).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }
  if (key === 'initials') return String(formatRosterLabel(client) || '').toLowerCase();
  return String(client[key] || '').toLowerCase();
};

const normalize = (v) => String(v || '').trim().toLowerCase();

const filteredClients = computed(() => {
  const q = normalize(searchQuery.value);
  const list = Array.isArray(clients.value) ? clients.value : [];
  if (!q) return list;
  return list.filter((client) => {
    const hay = [
      formatRosterLabel(client),
      client?.client_status_label,
      client?.provider_name,
      client?.service_day,
      formatDocSummary(client)
    ]
      .filter(Boolean)
      .join(' ');
    return normalize(hay).includes(q);
  });
});

const sortedClients = computed(() => {
  const list = Array.isArray(filteredClients.value) ? filteredClients.value.slice() : [];
  const key = sortKey.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return list.sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    const cmp = String(av).localeCompare(String(bv));
    if (cmp !== 0) return cmp * dir;
    // Stable fallback
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

const formatRosterLabel = (client) => {
  const initials = String(client?.initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(client?.identifier_code || '').replace(/\s+/g, '').toUpperCase();
  if (props.clientLabelMode === 'initials') return initials || code || '—';
  return code || initials || '—';
};

const rosterLabelTitle = (client) => {
  if (props.clientLabelMode !== 'codes') return '';
  const initials = String(client?.initials || '').replace(/\s+/g, '').toUpperCase();
  return initials || '';
};

const formatDocSummary = (client) => {
  // Prefer paperwork status (new model) so the portal reflects bulk upload fields:
  // paperwork_status / paperwork_delivery / doc_date.
  const status = String(client?.paperwork_status_label || '').trim();
  const delivery = String(client?.paperwork_delivery_method_label || '').trim();
  const date = client?.doc_date ? new Date(client.doc_date).toLocaleDateString() : '';
  const statusKey = String(client?.paperwork_status_key || '').toLowerCase();
  const roiExpiresAt = client?.roi_expires_at ? new Date(String(client.roi_expires_at)) : null;
  const roiExpired =
    statusKey === 'roi' && roiExpiresAt ? (roiExpiresAt.getTime() < new Date().setHours(0, 0, 0, 0)) : false;

  const parts = [];
  const normalizedStatus =
    statusKey === 'new_docs' ? 'Docs Needed' :
    statusKey === 'completed' ? 'Received' :
    (roiExpired ? 'ROI Expired' : status);
  if (normalizedStatus) parts.push(normalizedStatus);
  if (delivery) parts.push(delivery);
  if (date) parts.push(date);
  if (parts.length) return parts.join(' · ');

  // Fallback: legacy document_status
  const v = String(client?.document_status || '').trim();
  if (!v) return '—';
  if (v.toUpperCase() === 'NONE') return 'None';
  return v.replace(/_/g, ' ');
};

const openClient = (client) => {
  selectedClient.value = client;
};

const goEdit = (client) => {
  if (!client?.id) return;
  if (props.editMode === 'inline') {
    emit('edit-client', client);
    return;
  }
  router.push({ path: '/admin/clients', query: { clientId: String(client.id) } });
};

const goChecklist = (client) => {
  if (!client?.id) return;
  router.push({ path: '/admin/clients', query: { clientId: String(client.id), tab: 'checklist' } });
};

watch(() => props.organizationId, () => {
  if (props.organizationId) {
    fetchClients();
    fetchEditPermissions();
  }
});

onMounted(() => {
  if (props.organizationId) {
    fetchClients();
    fetchEditPermissions();
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

.table-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}
.table-search {
  width: 320px;
  max-width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
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
.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sortable:hover {
  background: rgba(0, 0, 0, 0.03);
}
.sort-indicator {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.initials-cell {
  font-weight: 900;
  letter-spacing: 0.06em;
}
.initials {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
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
.edit-col {
  white-space: nowrap;
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
