<template>
  <div class="audit-center-page">
    <div class="page-header">
      <div>
        <h1>Audit Center</h1>
        <p class="subtitle">Agency-scoped immutable audit feed with export support.</p>
      </div>
    </div>

    <div class="filters">
      <div class="field">
        <label>Agency</label>
        <select v-model="selectedAgencyId" @change="handleAgencyChange">
          <option value="">Select an agency…</option>
          <option v-for="a in selectableAgencies" :key="a.id" :value="String(a.id)">
            {{ a.name }}
          </option>
        </select>
        <small v-if="selectableAgencies.length === 0" class="hint">No agencies available for this user.</small>
      </div>
      <div class="field">
        <label>Search</label>
        <input v-model="filters.search" type="text" placeholder="User, client initials/name, action, metadata, IP, session" @keyup.enter="reload" />
      </div>
      <div class="field">
        <label>Source</label>
        <select v-model="filters.source" @change="reload">
          <option value="all">All logs</option>
          <option value="user_activity">User activity</option>
          <option value="admin_action">Admin actions</option>
          <option value="support_ticket">Support tickets</option>
          <option value="client_access">Client access</option>
          <option value="phi_document">Document audit</option>
        </select>
      </div>
      <div class="field">
        <label>Category</label>
        <select v-model="filters.category" @change="reload">
          <option value="">All categories</option>
          <option v-for="c in AUDIT_CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="field">
        <label>Action</label>
        <select v-model="filters.actionType" @change="reload">
          <option value="">All actions</option>
          <option v-for="a in actionOptions" :key="a.value" :value="a.value">{{ a.label }}</option>
        </select>
      </div>
      <div class="field">
        <label>User ID</label>
        <input v-model="filters.userId" type="number" min="1" placeholder="Optional user id" @keyup.enter="reload" />
      </div>
      <div class="field">
        <label>Start date</label>
        <input v-model="filters.startDate" type="date" @change="reload" />
      </div>
      <div class="field">
        <label>End date</label>
        <input v-model="filters.endDate" type="date" @change="reload" />
      </div>
      <div class="field">
        <label>Limit</label>
        <select v-model.number="pagination.limit" @change="resetAndReload">
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
        </select>
      </div>
      <div class="field field-actions">
        <button class="btn btn-secondary" :disabled="loading" @click="reload">Refresh</button>
        <button class="btn btn-primary" :disabled="loading || exporting" @click="exportCsv">
          {{ exporting ? 'Exporting...' : 'Export CSV' }}
        </button>
      </div>
    </div>

    <div class="view-toggle">
      <button
        :class="['btn', 'btn-sm', viewMode === 'table' ? 'btn-primary' : 'btn-secondary']"
        @click="viewMode = 'table'"
      >
        Table
      </button>
      <button
        :class="['btn', 'btn-sm', viewMode === 'grouped' ? 'btn-primary' : 'btn-secondary']"
        @click="viewMode = 'grouped'"
      >
        Grouped by category
      </button>
    </div>

    <div class="table-wrap" v-if="viewMode === 'table'">
      <div v-if="error" class="error-banner">{{ error }}</div>
      <table class="table">
        <thead>
          <tr>
            <th class="sortable" @click="toggleSort('createdAt')">Timestamp</th>
            <th>Source</th>
            <th class="sortable" @click="toggleSort('userName')">User</th>
            <th class="sortable" @click="toggleSort('userEmail')">Email</th>
            <th class="sortable" @click="toggleSort('actionType')">Action</th>
            <th>Client</th>
            <th>Details</th>
            <th class="sortable" @click="toggleSort('ipAddress')">IP</th>
            <th>Session</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="10" class="empty">Loading…</td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td colspan="10" class="empty">No activity found for current filters.</td>
          </tr>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ formatDate(row.created_at) }}</td>
            <td>{{ row.source_label || sourceLabel(row) }}</td>
            <td>{{ formatUser(row) }}</td>
            <td>{{ formatUserEmail(row) }}</td>
            <td><span class="badge">{{ getActionLabel(row.action_type) }}</span></td>
            <td>
              <div>{{ formatClientInitials(row) }}</div>
              <small v-if="formatClientName(row) !== '-'">{{ formatClientName(row) }}</small>
            </td>
            <td>{{ formatDetails(row) }}</td>
            <td>{{ row.ip_address || '-' }}</td>
            <td>{{ shortenSession(row.session_id) }}</td>
            <td>
              <router-link v-if="buildRowLink(row)" :to="buildRowLink(row)">Open</router-link>
              <span v-else>-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grouped-list-wrap" v-else-if="viewMode === 'grouped'">
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-if="loading" class="empty">Loading…</div>
      <div v-else-if="rows.length === 0" class="empty">No activity found for current filters.</div>
      <template v-else>
        <section
          v-for="group in groupedRows"
          :key="group.category"
          class="audit-category-section"
        >
          <h3 class="category-heading">{{ group.category }}</h3>
          <ul class="audit-action-list">
            <li
              v-for="row in group.rows"
              :key="row.id"
              class="audit-action-item"
            >
              <span class="action-label">{{ getActionLabel(row.action_type) }}</span>
              <span class="action-meta">
                {{ formatDate(row.created_at) }}
                <template v-if="formatUser(row)"> · {{ formatUser(row) }}</template>
                <template v-if="formatClientInitials(row) !== '-'"> · {{ formatClientInitials(row) }}</template>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <div class="footer-bar">
      <div class="summary">
        <span>Total: {{ pagination.total }}</span>
        <span>Showing {{ rows.length }}</span>
      </div>
      <div class="pager">
        <button class="btn btn-secondary" :disabled="loading || pagination.offset === 0" @click="prevPage">Previous</button>
        <button class="btn btn-secondary" :disabled="loading || !pagination.hasNextPage" @click="nextPage">Next</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import {
  getActionLabel,
  getActionCategory,
  getActionOptions,
  AUDIT_CATEGORIES
} from '../../utils/auditActionRegistry.js';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

const isAgencyOrg = (org) => {
  const t = String(org?.organization_type || org?.organizationType || 'agency').toLowerCase();
  return t === 'agency';
};

const actionOptions = getActionOptions();

const rows = ref([]);
const loading = ref(false);
const exporting = ref(false);
const error = ref('');
const viewMode = ref('table');

const filters = reactive({
  source: 'all',
  search: '',
  userId: '',
  category: '',
  actionType: '',
  startDate: '',
  endDate: ''
});

const sort = reactive({
  sortBy: 'createdAt',
  sortOrder: 'DESC'
});

const pagination = reactive({
  total: 0,
  limit: 50,
  offset: 0,
  hasNextPage: false
});

const selectableAgencies = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  // super_admin: can pick from all agencies list (fetchAgencies)
  // admin: pick from userAgencies (fetchUserAgencies)
  const list =
    role === 'super_admin'
      ? (agencyStore.agencies?.value || agencyStore.agencies || [])
      : (agencyStore.userAgencies?.value || agencyStore.userAgencies || []);
  return (Array.isArray(list) ? list : []).filter(isAgencyOrg).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const selectedAgencyId = ref('');

const selectedAgency = computed(() => {
  const id = parseInt(String(selectedAgencyId.value || ''), 10);
  if (!Number.isFinite(id) || id < 1) return null;
  return (selectableAgencies.value || []).find((a) => Number(a?.id) === id) || null;
});

const agencyId = computed(() => (selectedAgency.value?.id ? Number(selectedAgency.value.id) : null));

const agencyStorageKey = computed(() => {
  const u = authStore.user || {};
  return `auditCenterAgencyId:${String(u.id || u.email || 'unknown')}`;
});

const groupedRows = computed(() => {
  const byCategory = new Map();
  for (const row of rows.value) {
    const cat = getActionCategory(row.action_type);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(row);
  }
  const categoriesWithData = [...byCategory.keys()];
  const ordered = AUDIT_CATEGORIES.filter((c) => categoriesWithData.includes(c));
  const remaining = categoriesWithData.filter((c) => !AUDIT_CATEGORIES.includes(c));
  return [...ordered, ...remaining].map((category) => ({
    category,
    rows: byCategory.get(category) || []
  }));
});

const hydrateDefaultAgencySelection = () => {
  // Priority: URL query ?agencyId= > localStorage > currentAgency (if agency) > first selectable agency
  const fromQuery = route.query?.agencyId ? parseInt(String(route.query.agencyId), 10) : NaN;
  const queryId = Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : null;
  if (queryId && selectableAgencies.value.some((a) => Number(a?.id) === Number(queryId))) {
    selectedAgencyId.value = String(queryId);
    return;
  }

  try {
    const stored = localStorage.getItem(agencyStorageKey.value);
    const storedId = stored ? parseInt(String(stored), 10) : NaN;
    if (Number.isFinite(storedId) && storedId > 0 && selectableAgencies.value.some((a) => Number(a?.id) === storedId)) {
      selectedAgencyId.value = String(storedId);
      return;
    }
  } catch {
    // ignore
  }

  const cur = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const curId = cur?.id ? Number(cur.id) : null;
  if (curId && isAgencyOrg(cur) && selectableAgencies.value.some((a) => Number(a?.id) === curId)) {
    selectedAgencyId.value = String(curId);
    return;
  }

  const first = selectableAgencies.value?.[0]?.id || null;
  if (first) selectedAgencyId.value = String(first);
};

const currentParams = () => ({
  search: filters.search || undefined,
  source: filters.source || undefined,
  userId: filters.userId || undefined,
  category: filters.category || undefined,
  actionType: filters.actionType || undefined,
  startDate: filters.startDate || undefined,
  endDate: filters.endDate || undefined,
  limit: pagination.limit,
  offset: pagination.offset,
  sortBy: sort.sortBy,
  sortOrder: sort.sortOrder
});

const reload = async () => {
  if (!agencyId.value) {
    error.value = 'No agency context found. Select an agency and retry.';
    rows.value = [];
    pagination.total = 0;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/activity-log/agency/${agencyId.value}`, { params: currentParams() });
    rows.value = Array.isArray(resp.data?.items) ? resp.data.items : [];
    const pg = resp.data?.pagination || {};
    pagination.total = Number(pg.total || 0);
    pagination.hasNextPage = !!pg.hasNextPage;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load audit activity.';
    rows.value = [];
    pagination.total = 0;
    pagination.hasNextPage = false;
  } finally {
    loading.value = false;
  }
};

const handleAgencyChange = async () => {
  try {
    if (selectedAgencyId.value) localStorage.setItem(agencyStorageKey.value, String(selectedAgencyId.value));
  } catch {
    // ignore
  }
  await resetAndReload();
};

const resetAndReload = async () => {
  pagination.offset = 0;
  await reload();
};

const toggleSort = async (field) => {
  if (sort.sortBy === field) {
    sort.sortOrder = sort.sortOrder === 'ASC' ? 'DESC' : 'ASC';
  } else {
    sort.sortBy = field;
    sort.sortOrder = 'DESC';
  }
  pagination.offset = 0;
  await reload();
};

const nextPage = async () => {
  pagination.offset += pagination.limit;
  await reload();
};

const prevPage = async () => {
  pagination.offset = Math.max(0, pagination.offset - pagination.limit);
  await reload();
};

const exportCsv = async () => {
  if (!agencyId.value) return;
  exporting.value = true;
  error.value = '';
  try {
    const response = await api.get(`/activity-log/agency/${agencyId.value}/export.csv`, {
      params: currentParams(),
      responseType: 'blob'
    });
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit-center-${agencyId.value}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to export CSV.';
  } finally {
    exporting.value = false;
  }
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const formatUser = (row) => {
  if (row.log_type === 'admin_action') {
    const actorName = `${row.actor_first_name || ''} ${row.actor_last_name || ''}`.trim();
    const targetName = `${row.target_first_name || ''} ${row.target_last_name || ''}`.trim();
    if (actorName && targetName && actorName !== targetName) return `${actorName} -> ${targetName}`;
    return actorName || targetName || `User #${row.target_user_id || row.actor_user_id || 'unknown'}`;
  }
  const name = `${row.user_first_name || ''} ${row.user_last_name || ''}`.trim();
  return name || `User #${row.user_id || 'unknown'}`;
};

const formatUserEmail = (row) => {
  if (row.log_type === 'admin_action') {
    if (row.actor_email && row.target_email && row.actor_email !== row.target_email) return `${row.actor_email} -> ${row.target_email}`;
    return row.actor_email || row.target_email || '-';
  }
  return row.user_email || '-';
};

const formatDetails = (row) => {
  const base = row.module_title ? `Module: ${row.module_title}` : (row.track_name ? `Track: ${row.track_name}` : '');
  const meta = row.metadata ? JSON.stringify(row.metadata) : '';
  return [base, meta].filter(Boolean).join(' | ') || '-';
};

const sourceLabel = (row) => {
  if (row.log_type === 'admin_action') return 'Admin action';
  if (row.log_type === 'support_ticket') return 'Support ticket';
  if (row.log_type === 'client_access') return 'Client access';
  if (row.log_type === 'phi_document') return 'Document audit';
  return 'User activity';
};

const formatClientInitials = (row) => {
  if (row.client_initials) return row.client_initials;
  if (row.client_identifier_code) return `#${row.client_identifier_code}`;
  return '-';
};

const formatClientName = (row) => {
  return row.client_full_name || '-';
};

const buildRowLink = (row) => {
  const path = String(row.link_path || '').trim();
  if (!path) return '';
  const slug = String(route.params.organizationSlug || '').trim();
  if (slug && path.startsWith('/admin/')) return `/${slug}${path}`;
  return path;
};

const shortenSession = (sessionId) => {
  if (!sessionId) return '-';
  const s = String(sessionId);
  return s.length > 10 ? `${s.slice(0, 10)}...` : s;
};

onMounted(async () => {
  // Ensure agency options are loaded.
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
  }
  hydrateDefaultAgencySelection();
  await reload();
});
</script>

<style scoped>
.audit-center-page { padding: 1rem; }
.page-header { margin-bottom: 1rem; }
.subtitle { color: var(--text-secondary); margin: 0.25rem 0 0; }
.filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field input, .field select { padding: 0.45rem 0.55rem; border: 1px solid var(--border); border-radius: 6px; }
.hint { color: var(--text-secondary); font-size: 12px; }
.field-actions { align-self: end; flex-direction: row; gap: 0.5rem; }
.table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: auto; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 0.6rem; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
.sortable { cursor: pointer; user-select: none; }
.empty { text-align: center; color: var(--text-secondary); padding: 1rem; }
.badge { font-size: 0.8rem; padding: 0.15rem 0.4rem; border: 1px solid var(--border); border-radius: 999px; }
.footer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; }
.summary { display: flex; gap: 1rem; color: var(--text-secondary); }
.pager { display: flex; gap: 0.5rem; }
.error-banner { color: #a33; padding: 0.75rem; }
.view-toggle { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
.grouped-list-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }
.audit-category-section { margin-bottom: 1.5rem; }
.audit-category-section:last-child { margin-bottom: 0; }
.category-heading { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin: 0 0 0.5rem; text-transform: uppercase; letter-spacing: 0.03em; }
.audit-action-list { list-style: none; margin: 0; padding: 0; }
.audit-action-item { padding: 0.4rem 0; border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }
.audit-action-item:last-child { border-bottom: none; }
.action-label { font-weight: 500; }
.action-meta { font-size: 0.8rem; color: var(--text-secondary); }
</style>
