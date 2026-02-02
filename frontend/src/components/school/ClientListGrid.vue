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

    <div v-else class="clients-table-wrapper">
      <div v-if="showSearch" class="table-toolbar">
        <div v-if="activeStatusFilterLabel" class="active-filter-row">
          <span class="active-filter-pill">Status: {{ activeStatusFilterLabel }}</span>
          <button class="btn-link" type="button" @click="clearStatusFilter">Clear</button>
        </div>
        <input
          v-model="searchQuery"
          class="table-search"
          type="search"
          :placeholder="searchPlaceholder"
        />
      </div>
      <div class="clients-table-scroll">
        <table class="clients-table">
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
            <th class="sortable" @click="toggleSort('organization_name')" role="button" tabindex="0">
              School / Program
              <span class="sort-indicator" v-if="sortKey === 'organization_name'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('skills')" role="button" tabindex="0">
              Skills
              <span class="sort-indicator" v-if="sortKey === 'skills'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('service_day')" role="button" tabindex="0">
              Assigned Day
              <span class="sort-indicator" v-if="sortKey === 'service_day'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th
              v-if="showPsychotherapyColumn"
              class="sortable"
              @click="toggleSort('psychotherapy_total')"
              role="button"
              tabindex="0"
            >
              Psychotherapy FY
              <span class="sort-indicator" v-if="sortKey === 'psychotherapy_total'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
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
              <div class="status-cell">
                <span :class="['status-badge', `status-${String(client.client_status_key || 'unknown').toLowerCase().replace('_', '-')}`]">
                  {{ client.client_status_label || '—' }}
                </span>
                <span
                  v-if="String(client.client_status_key || '').toLowerCase() === 'waitlist' && client.waitlist_days !== null && client.waitlist_rank !== null"
                  class="waitlist-bubble"
                  :title="`Waitlisted ${client.waitlist_days} day(s) • Rank #${client.waitlist_rank}`"
                >
                  <span class="wl-left">{{ client.waitlist_days }}d</span>
                  <span class="wl-right">#{{ client.waitlist_rank }}</span>
                </span>
              </div>
            </td>
            <td>{{ formatDocSummary(client) }}</td>
            <td>{{ organizationName || client.organization_name || '—' }}</td>
            <td>{{ client.skills ? 'Yes' : 'No' }}</td>
            <td>{{ client.service_day || '—' }}</td>
            <td v-if="showPsychotherapyColumn" class="psy-cell">
              <span
                class="psy-pill"
                :class="{ 'psy-pill-alert': (psychotherapyCell(client).total || 0) >= 25 }"
                :title="psychotherapyCell(client).title"
              >
                {{ psychotherapyCell(client).total ?? '—' }}
              </span>
            </td>
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
    </div>

    <ClientTicketThreadModal
      v-if="selectedClient"
      :client="selectedClient"
      :schoolOrganizationId="organizationId"
      :client-label-mode="clientLabelMode"
      @close="selectedClient = null"
    />
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import ClientTicketThreadModal from './ClientTicketThreadModal.vue';
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
  },
  psychotherapyTotalsByClientId: {
    // { [clientId]: { total: number, per_code: { [code]: number }, client_abbrev?: string, surpassed_24?: boolean } }
    type: Object,
    default: null
  },
  /** Display name for the current school/program (shown instead of Assigned Provider). */
  organizationName: {
    type: String,
    default: ''
  },
  /**
   * Optional roster status filter (client_status_key), e.g. 'pending' or 'waitlist'.
   * When set, the grid will only show clients matching the filter.
   */
  statusFilterKey: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['edit-client', 'update:statusFilterKey']);

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

const showPsychotherapyColumn = computed(() => !!props.psychotherapyTotalsByClientId);

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
  if (key === 'organization_name') return String(props.organizationName || client.organization_name || '').toLowerCase();
  if (key === 'skills') return client.skills ? 1 : 0;
  if (key === 'psychotherapy_total') {
    const m = props.psychotherapyTotalsByClientId || {};
    const rec = m?.[String(client?.id ?? '')] || m?.[Number(client?.id ?? 0)] || null;
    const t = Number(rec?.total ?? 0);
    return Number.isFinite(t) ? t : 0;
  }
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

const activeStatusFilterKey = computed(() => normalize(props.statusFilterKey));
const activeStatusFilterLabel = computed(() => {
  const k = activeStatusFilterKey.value;
  if (!k) return '';
  if (k === 'pending') return 'Pending';
  if (k === 'waitlist') return 'Waitlist';
  return k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
});

const statusFilteredClients = computed(() => {
  const k = activeStatusFilterKey.value;
  const list = Array.isArray(clients.value) ? clients.value : [];
  if (!k) return list;
  return list.filter((c) => normalize(c?.client_status_key) === k);
});

const filteredClients = computed(() => {
  const q = normalize(searchQuery.value);
  const list = Array.isArray(statusFilteredClients.value) ? statusFilteredClients.value : [];
  if (!q) return list;
  return list.filter((client) => {
    const hay = [
      formatRosterLabel(client),
      client?.client_status_label,
      props.organizationName || client?.organization_name,
      client?.provider_name,
      client?.service_day,
      formatDocSummary(client)
    ]
      .filter(Boolean)
      .join(' ');
    return normalize(hay).includes(q);
  });
});

const clearStatusFilter = () => {
  emit('update:statusFilterKey', '');
};

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

const psychotherapyCell = (client) => {
  const m = props.psychotherapyTotalsByClientId || null;
  if (!m || !client?.id) return { total: null, title: '' };
  const rec = m?.[String(client.id)] || m?.[Number(client.id)] || null;
  if (!rec) return { total: 0, title: '' };
  const per = rec?.per_code && typeof rec.per_code === 'object' ? rec.per_code : {};
  const parts = Object.entries(per)
    .filter(([, v]) => Number(v) > 0)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([code, count]) => `${String(code).toUpperCase()} (${Number(count)})`);
  const total = Number(rec?.total ?? 0);
  const title = parts.length ? `${parts.join('\n')}\nTotal (${total})` : '';
  return { total: Number.isFinite(total) ? total : 0, title };
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
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.waitlist-bubble {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
  font-weight: 800;
  font-size: 0.6875rem;
  line-height: 1;
}
.waitlist-bubble .wl-left {
  padding: 2px 6px;
  border-right: 1px solid rgba(245, 158, 11, 0.25);
}
.waitlist-bubble .wl-right {
  padding: 2px 6px;
}
.client-list-grid {
  width: 100%;
  max-width: 100%;
  min-width: 0;
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

.clients-table-wrapper {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.clients-table-scroll {
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

.clients-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem; /* ~13px – compact row height */
}

.table-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 8px;
}

.active-filter-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: 10px;
}

.active-filter-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  font-size: 0.75rem;
  line-height: 1;
  color: var(--text-primary);
}

.btn-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.75rem;
}
.table-search {
  width: 320px;
  max-width: 100%;
  padding: 8px 10px;
  font-size: 0.8125rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.clients-table thead {
  background: var(--bg-alt);
}

.clients-table th {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem; /* slightly smaller headers */
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}
.clients-table .sortable {
  cursor: pointer;
  user-select: none;
}
.clients-table .sortable:hover {
  background: rgba(0, 0, 0, 0.03);
}
.sort-indicator {
  margin-left: 4px;
  font-size: 10px;
  color: var(--text-secondary);
}

.initials-cell {
  font-weight: 900;
  letter-spacing: 0.06em;
}
.initials {
  display: inline-block;
  padding: 4px 8px;
  font-size: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
}

.clients-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 0.8125rem;
  vertical-align: middle;
  line-height: 1.3;
}

.clients-table td:nth-child(3) {
  max-width: 180px;
  word-break: break-word;
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

.psy-cell {
  white-space: nowrap;
}
.psy-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 6px;
  font-size: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  font-weight: 900;
}
.psy-pill-alert {
  border-color: rgba(239, 68, 68, 0.55);
  background: rgba(239, 68, 68, 0.10);
  color: #991b1b;
}
</style>
