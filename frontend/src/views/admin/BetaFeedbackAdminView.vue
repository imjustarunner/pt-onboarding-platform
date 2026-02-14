<template>
  <div class="container beta-feedback-admin">
    <div class="page-header">
      <h1>Beta Feedback</h1>
      <p class="subtitle">User-submitted feedback with screenshots for debugging</p>
    </div>

    <div v-if="loading" class="loading">Loading feedback...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else>
      <div class="feedback-toolbar">
        <div class="filters">
          <select v-model="filters.status" class="filter-select" @change="applyFilters">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
          </select>
          <input
            v-model="filters.dateFrom"
            type="date"
            class="filter-input"
            placeholder="From"
            @change="applyFilters"
          />
          <input
            v-model="filters.dateTo"
            type="date"
            class="filter-input"
            placeholder="To"
            @change="applyFilters"
          />
          <select v-model="filters.agencyId" class="filter-select" @change="applyFilters">
            <option value="">All agencies</option>
            <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
          <button type="button" class="btn btn-secondary btn-sm" @click="clearFilters">Clear</button>
        </div>
        <div class="toolbar-stats">
          <span class="stat">{{ total }} submission{{ total === 1 ? '' : 's' }}</span>
          <span v-if="pendingCount > 0" class="stat pending">{{ pendingCount }} pending</span>
        </div>
      </div>

      <div v-if="items.length === 0" class="empty-state">
        <p>No beta feedback submissions yet.</p>
        <p class="hint">When users report issues via the Beta widget (when enabled in Platform Settings), their submissions will appear here.</p>
      </div>

      <div v-else class="feedback-list">
        <div
          v-for="item in items"
          :key="item.id"
          class="feedback-card"
          :class="{ expanded: expandedId === item.id, [item.status]: true }"
        >
          <div class="feedback-card-header" @click="toggleExpand(item.id)">
            <span class="status-badge" :class="item.status">{{ item.status }}</span>
            <div class="feedback-meta">
              <span class="feedback-user">
                {{ item.user_first_name || item.user_preferred_name || item.user_email || 'Unknown' }}
                <span v-if="item.user_email" class="email">({{ item.user_email }})</span>
              </span>
              <span class="feedback-date">{{ formatDateTime(item.created_at) }}</span>
              <span v-if="item.agency_name" class="feedback-agency">{{ item.agency_name }}</span>
            </div>
            <div class="feedback-route">
              <code>{{ item.route_path || item.route_name || '—' }}</code>
            </div>
            <span class="expand-icon">{{ expandedId === item.id ? '▾' : '▸' }}</span>
          </div>

          <div v-show="expandedId === item.id" class="feedback-card-body">
            <div class="status-actions">
              <span class="label">Status:</span>
              <button
                type="button"
                class="status-btn"
                :class="{ active: item.status === 'pending' }"
                @click.stop="setStatus(item.id, 'pending')"
              >
                Pending
              </button>
              <button
                type="button"
                class="status-btn"
                :class="{ active: item.status === 'reviewed' }"
                @click.stop="setStatus(item.id, 'reviewed')"
              >
                Reviewed
              </button>
              <button
                type="button"
                class="status-btn"
                :class="{ active: item.status === 'resolved' }"
                @click.stop="setStatus(item.id, 'resolved')"
              >
                Resolved
              </button>
            </div>
            <div v-if="item.description" class="feedback-description">
              <label>What they were doing</label>
              <p>{{ item.description }}</p>
            </div>
            <div class="feedback-context">
              <div class="context-row">
                <span class="label">Route:</span>
                <code>{{ item.route_path || '—' }}</code>
              </div>
              <div class="context-row">
                <span class="label">Route name:</span>
                <span>{{ item.route_name || '—' }}</span>
              </div>
              <div v-if="item.viewport_width || item.viewport_height" class="context-row">
                <span class="label">Viewport:</span>
                <span>{{ item.viewport_width }}×{{ item.viewport_height }}</span>
              </div>
              <div v-if="item.user_agent" class="context-row">
                <span class="label">User agent:</span>
                <code class="user-agent">{{ item.user_agent }}</code>
              </div>
            </div>
            <div v-if="item.screenshot_path" class="feedback-screenshot">
              <label>Screenshot</label>
              <a :href="screenshotUrl(item.screenshot_path)" target="_blank" rel="noopener noreferrer" class="screenshot-link">
                <img :src="screenshotUrl(item.screenshot_path)" alt="Screenshot" class="screenshot-img" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { formatDateTime } from '../../utils/formatDate';

const items = ref([]);
const total = ref(0);
const pendingCount = ref(0);
const agencies = ref([]);
const loading = ref(true);
const error = ref('');
const expandedId = ref(null);
const filters = ref({
  status: '',
  dateFrom: '',
  dateTo: '',
  agencyId: ''
});

const screenshotUrl = (path) => {
  if (!path) return '';
  return toUploadsUrl(path);
};

const toggleExpand = (id) => {
  expandedId.value = expandedId.value === id ? null : id;
};

const buildParams = () => {
  const p = { limit: 100 };
  if (filters.value.status) p.status = filters.value.status;
  if (filters.value.dateFrom) p.dateFrom = filters.value.dateFrom;
  if (filters.value.dateTo) p.dateTo = filters.value.dateTo;
  if (filters.value.agencyId) p.agencyId = filters.value.agencyId;
  return p;
};

const fetchFeedback = async () => {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/beta-feedback', { params: buildParams() });
    items.value = res.data?.items || [];
    total.value = res.data?.total ?? 0;
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to load feedback';
  } finally {
    loading.value = false;
  }
};

const fetchPendingCount = async () => {
  try {
    const res = await api.get('/beta-feedback/pending-count', { skipGlobalLoading: true });
    pendingCount.value = res.data?.count ?? 0;
  } catch {
    pendingCount.value = 0;
  }
};

const fetchAgencies = async () => {
  try {
    const res = await api.get('/agencies');
    agencies.value = (res.data || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
  } catch {
    agencies.value = [];
  }
};

const applyFilters = () => {
  fetchFeedback();
};

const clearFilters = () => {
  filters.value = { status: '', dateFrom: '', dateTo: '', agencyId: '' };
  fetchFeedback();
};

const setStatus = async (id, status) => {
  try {
    await api.patch(`/beta-feedback/${id}`, { status });
    const idx = items.value.findIndex((i) => i.id === id);
    if (idx >= 0) items.value[idx] = { ...items.value[idx], status };
    await fetchPendingCount();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to update status';
  }
};

onMounted(async () => {
  await Promise.all([fetchFeedback(), fetchPendingCount(), fetchAgencies()]);
});
</script>

<style scoped>
.beta-feedback-admin {
  padding: 24px 0;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
}

.subtitle {
  margin: 0;
  font-size: 15px;
  color: var(--text-secondary);
}

.feedback-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.filter-select,
.filter-input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.toolbar-stats {
  display: flex;
  gap: 16px;
  align-items: center;
}

.toolbar-stats .stat {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.toolbar-stats .stat.pending {
  color: #b45309;
  font-weight: 800;
}

.empty-state {
  padding: 48px 24px;
  text-align: center;
  background: var(--bg-alt);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.empty-state p {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--text-primary);
}

.empty-state .hint {
  font-size: 14px;
  color: var(--text-secondary);
}

.feedback-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feedback-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.feedback-card.pending {
  border-left: 4px solid #f59e0b;
}

.feedback-card.reviewed {
  border-left: 4px solid #3b82f6;
}

.feedback-card.resolved {
  border-left: 4px solid #10b981;
}

.feedback-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.feedback-card-header:hover {
  background: var(--bg-alt);
}

.status-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.status-badge.pending {
  background: #fef3c7;
  color: #b45309;
}

.status-badge.reviewed {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge.resolved {
  background: #d1fae5;
  color: #047857;
}

.feedback-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.feedback-user {
  font-weight: 600;
  color: var(--text-primary);
}

.feedback-user .email {
  font-weight: 400;
  color: var(--text-secondary);
  font-size: 13px;
}

.feedback-date {
  font-size: 13px;
  color: var(--text-secondary);
}

.feedback-agency {
  font-size: 12px;
  padding: 2px 8px;
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 6px;
}

.feedback-route {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feedback-route code {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-alt);
  padding: 2px 6px;
  border-radius: 4px;
}

.expand-icon {
  font-size: 14px;
  color: var(--text-secondary);
}

.feedback-card-body {
  padding: 16px;
  border-top: 1px solid var(--border);
}

.status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.status-actions .label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.status-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
}

.status-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.status-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.feedback-description {
  margin-top: 0;
}

.feedback-description label,
.feedback-context .label,
.feedback-screenshot label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.feedback-description p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.feedback-context {
  margin-top: 14px;
}

.context-row {
  font-size: 13px;
  margin-bottom: 4px;
}

.context-row .label {
  display: inline;
  margin-right: 6px;
  font-weight: 600;
}

.context-row code.user-agent {
  font-size: 11px;
  word-break: break-all;
}

.feedback-screenshot {
  margin-top: 16px;
}

.screenshot-link {
  display: inline-block;
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.screenshot-img {
  display: block;
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
}
</style>
