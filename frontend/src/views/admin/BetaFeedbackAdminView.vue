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
          <button
            type="button"
            class="btn btn-danger btn-sm"
            :disabled="selectedCount === 0 || bulkDeleting"
            @click="bulkDeleteSelected"
          >
            {{ bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedCount})` }}
          </button>
          <button
            type="button"
            class="btn btn-danger btn-sm"
            :disabled="deleteResolvedLoading"
            @click="deleteAllResolved"
          >
            {{ deleteResolvedLoading ? 'Deleting Resolved...' : 'Delete All Resolved' }}
          </button>
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
            <input
              type="checkbox"
              class="select-checkbox"
              :checked="!!selectedMap[item.id]"
              @click.stop
              @change="toggleSelected(item.id, $event)"
            />
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
                v-if="item.status === 'reviewed'"
                type="button"
                class="status-btn"
                @click.stop="requestRetest(item)"
              >
                Request Re-test
              </button>
              <button
                type="button"
                class="status-btn"
                :class="{ active: item.status === 'resolved' }"
                @click.stop="setStatus(item.id, 'resolved')"
              >
                Resolved
              </button>
              <button
                type="button"
                class="status-btn danger"
                :disabled="!!deletingIds[item.id]"
                @click.stop="deleteFeedback(item)"
              >
                {{ deletingIds[item.id] ? 'Deleting...' : 'Delete' }}
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
            <div class="feedback-thread">
              <label>Owner Thread</label>
              <div v-if="threadLoadingMap[item.id]" class="muted">Loading messages...</div>
              <div v-else-if="!(threadMap[item.id] || []).length" class="muted">No messages yet.</div>
              <div v-else class="thread-list">
                <div v-for="m in threadMap[item.id]" :key="m.id" class="thread-msg">
                  <div class="thread-meta">
                    <strong>{{ messageAuthor(m) }}</strong>
                    <span>{{ formatDateTime(m.created_at) }}</span>
                  </div>
                  <p>{{ m.message_text }}</p>
                </div>
              </div>
              <div class="thread-compose">
                <textarea
                  :value="threadDraftMap[item.id] || ''"
                  rows="2"
                  placeholder="Send update/request to owner..."
                  @input="setThreadDraft(item.id, $event)"
                />
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="!!threadSendingMap[item.id]"
                  @click="sendThreadMessage(item)"
                >
                  {{ threadSendingMap[item.id] ? 'Sending...' : 'Send Message' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
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
const deletingIds = ref({});
const selectedMap = ref({});
const bulkDeleting = ref(false);
const deleteResolvedLoading = ref(false);
const threadMap = ref({});
const threadDraftMap = ref({});
const threadLoadingMap = ref({});
const threadSendingMap = ref({});
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
  if (expandedId.value === id) {
    fetchThread(id);
  }
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
    const visible = new Set(items.value.map((i) => Number(i.id)));
    const nextSelected = {};
    for (const [k, v] of Object.entries(selectedMap.value || {})) {
      const idNum = Number(k);
      if (v && visible.has(idNum)) nextSelected[idNum] = true;
    }
    selectedMap.value = nextSelected;
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
    const res = await api.get('/agencies', { params: { minimal: '1' } });
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

const messageAuthor = (m) => {
  if (String(m?.user_role || '').toLowerCase() === 'super_admin') return 'Admin';
  return m?.user_preferred_name || m?.user_first_name || m?.user_email || 'User';
};

const setThreadDraft = (id, ev) => {
  const value = String(ev?.target?.value || '');
  threadDraftMap.value = { ...threadDraftMap.value, [id]: value };
};

const fetchThread = async (id) => {
  if (threadLoadingMap.value[id]) return;
  try {
    threadLoadingMap.value = { ...threadLoadingMap.value, [id]: true };
    const res = await api.get(`/beta-feedback/${id}/messages`, { skipGlobalLoading: true });
    threadMap.value = { ...threadMap.value, [id]: res.data?.items || [] };
  } catch {
    threadMap.value = { ...threadMap.value, [id]: [] };
  } finally {
    const next = { ...threadLoadingMap.value };
    delete next[id];
    threadLoadingMap.value = next;
  }
};

const sendThreadMessage = async (item, forcedMessage = null) => {
  const id = Number(item?.id || 0);
  if (!id) return;
  const text = String(forcedMessage ?? threadDraftMap.value[id] ?? '').trim();
  if (!text) return;
  try {
    threadSendingMap.value = { ...threadSendingMap.value, [id]: true };
    const res = await api.post(`/beta-feedback/${id}/messages`, { message: text });
    threadMap.value = { ...threadMap.value, [id]: res.data?.items || [] };
    threadDraftMap.value = { ...threadDraftMap.value, [id]: '' };
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to send message';
  } finally {
    const next = { ...threadSendingMap.value };
    delete next[id];
    threadSendingMap.value = next;
  }
};

const requestRetest = async (item) => {
  const defaultText = 'I reviewed this and made updates. Can you please re-test and reply here with your result?';
  const entered = window.prompt('Message to owner (re-test request):', defaultText);
  if (entered === null) return;
  await sendThreadMessage(item, entered);
};

const selectedCount = computed(() =>
  Object.values(selectedMap.value || {}).filter(Boolean).length
);

const toggleSelected = (id, ev) => {
  const checked = !!ev?.target?.checked;
  selectedMap.value = { ...selectedMap.value, [id]: checked };
};

const bulkDeleteSelected = async () => {
  const ids = Object.entries(selectedMap.value || {})
    .filter(([, v]) => !!v)
    .map(([k]) => Number(k))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return;
  const ok = window.confirm(`Delete ${ids.length} selected feedback submission(s)? This cannot be undone.`);
  if (!ok) return;

  try {
    bulkDeleting.value = true;
    await api.post('/beta-feedback/bulk-delete', { ids });
    selectedMap.value = {};
    await Promise.all([fetchFeedback(), fetchPendingCount()]);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to bulk delete feedback';
  } finally {
    bulkDeleting.value = false;
  }
};

const deleteAllResolved = async () => {
  const ok = window.confirm('Delete all resolved feedback for the current filter scope? This cannot be undone.');
  if (!ok) return;
  try {
    deleteResolvedLoading.value = true;
    await api.post('/beta-feedback/delete-resolved', {
      agencyId: filters.value.agencyId || null,
      dateFrom: filters.value.dateFrom || null,
      dateTo: filters.value.dateTo || null
    });
    selectedMap.value = {};
    await Promise.all([fetchFeedback(), fetchPendingCount()]);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to delete resolved feedback';
  } finally {
    deleteResolvedLoading.value = false;
  }
};

const deleteFeedback = async (item) => {
  const label = item?.route_path || item?.route_name || `#${item?.id}`;
  const ok = window.confirm(`Delete beta feedback ${label}? This cannot be undone.`);
  if (!ok) return;

  try {
    deletingIds.value = { ...deletingIds.value, [item.id]: true };
    await api.delete(`/beta-feedback/${item.id}`);
    items.value = items.value.filter((i) => i.id !== item.id);
    total.value = Math.max(0, Number(total.value || 0) - 1);
    if (expandedId.value === item.id) expandedId.value = null;
    await fetchPendingCount();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to delete feedback';
  } finally {
    const next = { ...deletingIds.value };
    delete next[item.id];
    deletingIds.value = next;
  }
};

onMounted(async () => {
  await Promise.all([fetchFeedback(), fetchPendingCount()]);
  fetchAgencies(); // Non-blocking: agencies filter loads in background
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

.select-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
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

.status-btn.danger {
  border-color: #fca5a5;
  color: #991b1b;
}

.status-btn.danger:hover {
  border-color: #ef4444;
  color: #b91c1c;
  background: #fef2f2;
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

.feedback-thread {
  margin-top: 16px;
}

.muted {
  font-size: 13px;
  color: var(--text-secondary);
}

.thread-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.thread-msg {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg-alt);
}

.thread-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.thread-msg p {
  margin: 6px 0 0;
  font-size: 13px;
  white-space: pre-wrap;
}

.thread-compose {
  margin-top: 8px;
}

.thread-compose textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
  margin-bottom: 8px;
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
