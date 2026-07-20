<template>
  <div class="audit-center-page">
    <div class="page-header">
      <div>
        <h1>Audit Center</h1>
        <p class="subtitle">Agency-scoped activity reporting and immutable audit records. Session times are read-only.</p>
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
        <input
          v-model="filters.search"
          type="text"
          :placeholder="viewMode === 'activity' ? 'User name, email, username, or ID' : 'User, client, action, metadata, IP, session'"
          @keyup.enter="reload"
        />
      </div>
      <div v-if="viewMode === 'table' || viewMode === 'grouped'" class="field">
        <label>Source</label>
        <select v-model="filters.source" @change="reload">
          <option value="all">All logs</option>
          <option value="user_activity">User activity</option>
          <option value="admin_action">Admin actions</option>
          <option value="support_ticket">Support tickets</option>
          <option value="client_access">Client access</option>
          <option value="phi_document">Document audit</option>
          <option value="task_audit">Task audit</option>
          <option value="task_deletion">Task deletion</option>
        </select>
      </div>
      <div v-if="viewMode === 'table' || viewMode === 'grouped'" class="field">
        <label>Category</label>
        <select v-model="filters.category" @change="reload">
          <option value="">All categories</option>
          <option v-for="c in AUDIT_CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div v-if="viewMode === 'table' || viewMode === 'grouped'" class="field">
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
        :class="['btn', 'btn-sm', viewMode === 'activity' ? 'btn-primary' : 'btn-secondary']"
        @click="setViewMode('activity')"
      >
        Activity Data
      </button>
      <button
        :class="['btn', 'btn-sm', viewMode === 'table' ? 'btn-primary' : 'btn-secondary']"
        @click="setViewMode('table')"
      >
        Activity table
      </button>
      <button
        :class="['btn', 'btn-sm', viewMode === 'grouped' ? 'btn-primary' : 'btn-secondary']"
        @click="setViewMode('grouped')"
      >
        Grouped by category
      </button>
      <button
        :class="['btn', 'btn-sm', viewMode === 'sessions' ? 'btn-primary' : 'btn-secondary']"
        @click="setViewMode('sessions')"
      >
        Platform sessions
      </button>
    </div>

    <div v-if="viewMode === 'activity'" class="sessions-banner">
      <strong>Daily user activity report.</strong>
      Time in app is server-tracked active plus Timedown time. Meaningful active time requires recent clicks, keys, or scrolling.
      Sessions are assigned to the UTC day on which they started.
    </div>

    <div v-if="viewMode === 'sessions'" class="sessions-banner">
      <strong>Source of truth for login session time.</strong>
      Active = visible &amp; not in Timedown. Inactive = Timedown countdown time.
      Billable active = meaningful activity only (clicks/keys/scroll — not mousemove-only keep-alive).
      Rows are never editable.
    </div>

    <template v-if="viewMode === 'activity'">
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-if="activityNotice" class="hint-banner">{{ activityNotice }}</div>
      <div class="activity-summary-grid">
        <div class="summary-card">
          <span class="summary-card-label">Time in app</span>
          <strong>{{ formatDuration(activitySummary.trackedSeconds) }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-card-label">Active</span>
          <strong>{{ formatDuration(activitySummary.activeSeconds) }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-card-label">Meaningful active</span>
          <strong>{{ formatDuration(activitySummary.billableActiveSeconds) }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-card-label">Inactive (Timedown)</span>
          <strong>{{ formatDuration(activitySummary.inactiveSeconds) }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-card-label">Users</span>
          <strong>{{ activitySummary.userCount }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-card-label">Days represented</span>
          <strong>{{ activitySummary.dayCount }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-card-label">Sessions</span>
          <strong>{{ activitySummary.sessionCount }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-card-label">Interactions</span>
          <strong>{{ formatNumber(activitySummary.interactionCount) }}</strong>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table activity-data-table">
          <thead>
            <tr>
              <th>Date (UTC)</th>
              <th>User</th>
              <th>Email</th>
              <th>Sessions</th>
              <th>Time in app</th>
              <th>Active</th>
              <th>Meaningful active</th>
              <th>Inactive</th>
              <th>Interactions</th>
              <th>Timedowns</th>
              <th>Suspicion</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="11" class="empty">Loading…</td>
            </tr>
            <tr v-else-if="activityRows.length === 0">
              <td colspan="11" class="empty">No activity data found for current filters.</td>
            </tr>
            <tr v-for="row in activityRows" :key="`${row.activityDate}-${row.userId}`">
              <td>{{ formatActivityDate(row.activityDate) }}</td>
              <td>{{ row.userName || row.userUsername || `User #${row.userId}` }}</td>
              <td>{{ row.userEmail || '-' }}</td>
              <td>
                {{ row.sessionCount }}
                <small v-if="row.openSessionCount" class="flags">{{ row.openSessionCount }} open</small>
              </td>
              <td><strong>{{ formatDuration(row.trackedSeconds) }}</strong></td>
              <td>{{ formatDuration(row.activeSeconds) }}</td>
              <td>{{ formatDuration(row.billableActiveSeconds) }}</td>
              <td>{{ formatDuration(row.inactiveSeconds) }}</td>
              <td>
                {{ formatNumber(row.interactionCount) }}
                <small class="flags">{{ formatNumber(row.meaningfulEventCount) }} meaningful</small>
              </td>
              <td>{{ row.timedownCount }}</td>
              <td>
                <span :class="['badge', suspicionClass(row.averageSuspicionScore)]">
                  {{ Math.round(row.averageSuspicionScore || 0) }} avg
                </span>
                <small v-if="row.maxSuspicionScore > row.averageSuspicionScore" class="flags">
                  {{ Math.round(row.maxSuspicionScore) }} max
                </small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

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
            <td>
              <router-link v-if="buildRowLink(row.user_link)" :to="buildRowLink(row.user_link)" class="audit-link">{{ formatUser(row) }}</router-link>
              <span v-else>{{ formatUser(row) }}</span>
            </td>
            <td>{{ formatUserEmail(row) }}</td>
            <td><span class="badge">{{ getActionLabel(row.action_type) }}</span></td>
            <td>
              <template v-if="buildRowLink(row.client_link)">
                <router-link :to="buildRowLink(row.client_link)" class="audit-link">
                  <div>{{ formatClientInitials(row) }}</div>
                  <small v-if="formatClientName(row) !== '-'">{{ formatClientName(row) }}</small>
                </router-link>
              </template>
              <template v-else>
                <div>{{ formatClientInitials(row) }}</div>
                <small v-if="formatClientName(row) !== '-'">{{ formatClientName(row) }}</small>
              </template>
            </td>
            <td>{{ formatDetails(row) }}</td>
            <td>{{ row.ip_address || '-' }}</td>
            <td>{{ shortenSession(row.session_id) }}</td>
            <td>
              <router-link v-if="buildRowLink(row.link_path)" :to="buildRowLink(row.link_path)" class="audit-link">Open</router-link>
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
                <template v-if="formatUser(row)">
                  · <router-link v-if="buildRowLink(row.user_link)" :to="buildRowLink(row.user_link)" class="audit-link">{{ formatUser(row) }}</router-link>
                  <template v-else>{{ formatUser(row) }}</template>
                </template>
                <template v-if="formatClientInitials(row) !== '-'">
                  · <router-link v-if="buildRowLink(row.client_link)" :to="buildRowLink(row.client_link)" class="audit-link">{{ formatClientInitials(row) }}</router-link>
                  <template v-else>{{ formatClientInitials(row) }}</template>
                </template>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <div class="table-wrap" v-else-if="viewMode === 'sessions'">
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-if="sessionsNotice" class="hint-banner">{{ sessionsNotice }}</div>
      <table class="table">
        <thead>
          <tr>
            <th>Login</th>
            <th>End</th>
            <th>User</th>
            <th>Email</th>
            <th>Active</th>
            <th>Inactive (Timedown)</th>
            <th>Billable active</th>
            <th>Timedowns</th>
            <th>End reason</th>
            <th>Suspicion</th>
            <th>Session</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="11" class="empty">Loading…</td>
          </tr>
          <tr v-else-if="sessionRows.length === 0">
            <td colspan="11" class="empty">No platform sessions found for current filters.</td>
          </tr>
          <tr v-for="s in sessionRows" :key="s.id">
            <td>{{ formatDate(s.startedAt) }}</td>
            <td>{{ s.endedAt ? formatDate(s.endedAt) : 'In progress' }}</td>
            <td>{{ s.userName || `User #${s.userId}` }}</td>
            <td>{{ s.userEmail || '-' }}</td>
            <td>{{ formatDuration(s.activeSeconds) }}</td>
            <td>{{ formatDuration(s.inactiveSeconds) }}</td>
            <td>{{ formatDuration(s.billableActiveSeconds) }}</td>
            <td>{{ s.timedownCount }}</td>
            <td>{{ s.endReason || (s.phase === 'ended' ? 'ended' : s.phase) }}</td>
            <td>
              <span :class="['badge', suspicionClass(s.suspicionScore)]">{{ Math.round(s.suspicionScore || 0) }}</span>
              <small v-if="(s.suspicionFlags || []).length" class="flags">{{ (s.suspicionFlags || []).join(', ') }}</small>
            </td>
            <td>{{ shortenSession(s.sessionId) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="footer-bar">
      <div class="summary">
        <span>{{ viewMode === 'activity' ? 'User-days' : 'Total' }}: {{ pagination.total }}</span>
        <span>Showing {{ visibleRowCount }}</span>
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
const sessionRows = ref([]);
const activityRows = ref([]);
const sessionsNotice = ref('');
const activityNotice = ref('');
const loading = ref(false);
const exporting = ref(false);
const error = ref('');
const viewMode = ref('activity');

const emptyActivitySummary = () => ({
  userCount: 0,
  dayCount: 0,
  sessionCount: 0,
  activeSeconds: 0,
  inactiveSeconds: 0,
  trackedSeconds: 0,
  billableActiveSeconds: 0,
  interactionCount: 0
});
const activitySummary = ref(emptyActivitySummary());

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

const visibleRowCount = computed(() => {
  if (viewMode.value === 'activity') return activityRows.value.length;
  if (viewMode.value === 'sessions') return sessionRows.value.length;
  return rows.value.length;
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
    sessionRows.value = [];
    activityRows.value = [];
    activitySummary.value = emptyActivitySummary();
    pagination.total = 0;
    return;
  }
  loading.value = true;
  error.value = '';
  sessionsNotice.value = '';
  activityNotice.value = '';
  try {
    if (viewMode.value === 'activity') {
      const resp = await api.get(`/activity-log/agency/${agencyId.value}/activity-data`, {
        params: {
          search: filters.search || undefined,
          userId: filters.userId || undefined,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          limit: pagination.limit,
          offset: pagination.offset
        }
      });
      activityRows.value = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
      activitySummary.value = { ...emptyActivitySummary(), ...(resp.data?.summary || {}) };
      const pg = resp.data?.pagination || {};
      pagination.total = Number(pg.total || 0);
      pagination.hasNextPage = !!pg.hasNextPage;
      if (resp.data?.notice) activityNotice.value = String(resp.data.notice);
      rows.value = [];
      sessionRows.value = [];
    } else if (viewMode.value === 'sessions') {
      const resp = await api.get(`/activity-log/agency/${agencyId.value}/sessions`, {
        params: {
          userId: filters.userId || undefined,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          limit: pagination.limit,
          offset: pagination.offset
        }
      });
      sessionRows.value = Array.isArray(resp.data?.sessions) ? resp.data.sessions : [];
      pagination.total = Number(resp.data?.total || 0);
      pagination.hasNextPage = pagination.offset + sessionRows.value.length < pagination.total;
      if (resp.data?.notice) sessionsNotice.value = String(resp.data.notice);
      rows.value = [];
      activityRows.value = [];
      activitySummary.value = emptyActivitySummary();
    } else {
      const resp = await api.get(`/activity-log/agency/${agencyId.value}`, { params: currentParams() });
      rows.value = Array.isArray(resp.data?.items) ? resp.data.items : [];
      const pg = resp.data?.pagination || {};
      pagination.total = Number(pg.total || 0);
      pagination.hasNextPage = !!pg.hasNextPage;
      sessionRows.value = [];
      activityRows.value = [];
      activitySummary.value = emptyActivitySummary();
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load audit activity.';
    rows.value = [];
    sessionRows.value = [];
    activityRows.value = [];
    activitySummary.value = emptyActivitySummary();
    pagination.total = 0;
    pagination.hasNextPage = false;
  } finally {
    loading.value = false;
  }
};

const setViewMode = async (mode) => {
  viewMode.value = mode;
  pagination.offset = 0;
  await reload();
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
  if (viewMode.value === 'activity') {
    exporting.value = true;
    error.value = '';
    try {
      const response = await api.get(`/activity-log/agency/${agencyId.value}/activity-data/export.csv`, {
        params: {
          search: filters.search || undefined,
          userId: filters.userId || undefined,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined
        },
        responseType: 'blob'
      });
      downloadCsvBlob(response.data, `activity-data-${agencyId.value}.csv`);
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to export activity data CSV.';
    } finally {
      exporting.value = false;
    }
    return;
  }
  if (viewMode.value === 'sessions') {
    error.value = 'CSV export for platform sessions is not available yet — use the read-only table view.';
    return;
  }
  exporting.value = true;
  error.value = '';
  try {
    const response = await api.get(`/activity-log/agency/${agencyId.value}/export.csv`, {
      params: currentParams(),
      responseType: 'blob'
    });
    downloadCsvBlob(response.data, `audit-center-${agencyId.value}.csv`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to export CSV.';
  } finally {
    exporting.value = false;
  }
};

const downloadCsvBlob = (data, filename) => {
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const formatDuration = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

const formatNumber = (value) => Number(value || 0).toLocaleString();

const formatActivityDate = (value) => {
  if (!value) return '-';
  const raw = String(value);
  const ymd = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!ymd) return raw;
  const [year, month, day] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

const suspicionClass = (score) => {
  const n = Number(score) || 0;
  if (n >= 50) return 'badge-danger';
  if (n >= 25) return 'badge-warn';
  return 'badge-ok';
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

const buildRowLink = (pathOrRow) => {
  const path = typeof pathOrRow === 'string' ? pathOrRow : String(pathOrRow?.link_path || '').trim();
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
  api.post('/auth/activity-log', {
    actionType: 'audit_center_viewed',
    metadata: { path: route.path, agencyId: selectedAgencyId.value || null }
  }).catch(() => {});
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
.view-toggle { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.sessions-banner {
  margin-bottom: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-alt, #f8fafc);
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.4;
}
.hint-banner {
  padding: 0.65rem 0.85rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
.badge-ok { border-color: #86efac; color: #166534; }
.badge-warn { border-color: #fcd34d; color: #92400e; }
.badge-danger { border-color: #fca5a5; color: #991b1b; }
.flags { display: block; margin-top: 2px; color: var(--text-secondary); font-size: 0.75rem; }
.activity-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-height: 70px;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
}
.summary-card strong { font-size: 1.05rem; }
.summary-card-label { color: var(--text-secondary); font-size: 0.78rem; }
.activity-data-table td:nth-child(n+4) { white-space: nowrap; }
.grouped-list-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }
.audit-category-section { margin-bottom: 1.5rem; }
.audit-category-section:last-child { margin-bottom: 0; }
.category-heading { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin: 0 0 0.5rem; text-transform: uppercase; letter-spacing: 0.03em; }
.audit-action-list { list-style: none; margin: 0; padding: 0; }
.audit-action-item { padding: 0.4rem 0; border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }
.audit-action-item:last-child { border-bottom: none; }
.action-label { font-weight: 500; }
.action-meta { font-size: 0.8rem; color: var(--text-secondary); }
.audit-link { color: var(--link-color, #0066cc); text-decoration: none; }
.audit-link:hover { text-decoration: underline; }
</style>
