<template>
  <div class="container ask-assist-review">
    <div class="page-header">
      <h1>Ask Assistant Review</h1>
      <p class="subtitle">
        Thumbs-downs and times users asked something then closed without using the answer — so you can retrain routing.
      </p>
    </div>

    <div v-if="loading" class="loading">Loading signals...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else>
      <div class="toolbar">
        <div class="filters">
          <select v-model="filters.mode" class="filter-select" @change="applyFilters">
            <option value="queue">Review queue (pending)</option>
            <option value="thumbs_down">Thumbs down only</option>
            <option value="disengage">Disengage only</option>
            <option value="all_pending">All pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <input
            v-model="filters.dateFrom"
            type="date"
            class="filter-input"
            @change="applyFilters"
          />
          <input
            v-model="filters.dateTo"
            type="date"
            class="filter-input"
            @change="applyFilters"
          />
          <select v-model="filters.agencyId" class="filter-select" @change="applyFilters">
            <option value="">All agencies</option>
            <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
          <button type="button" class="btn btn-secondary btn-sm" @click="clearFilters">Clear</button>
        </div>
        <div class="toolbar-stats">
          <span class="stat">{{ total }} signal{{ total === 1 ? '' : 's' }}</span>
          <span v-if="pendingCount > 0" class="stat pending">{{ pendingCount }} pending</span>
        </div>
      </div>

      <div v-if="items.length === 0" class="empty-state">
        <p>No signals match these filters.</p>
        <p class="hint">
          Thumbs-downs and “closed without using the answer” events will show up here for training.
        </p>
      </div>

      <div v-else class="signal-list">
        <div
          v-for="item in items"
          :key="item.id"
          class="signal-card"
          :class="{ expanded: expandedId === item.id, [item.event_type]: true, [item.review_status]: true }"
        >
          <div class="signal-card-header" @click="toggleExpand(item.id)">
            <span class="type-badge" :class="item.event_type">
              {{ eventLabel(item) }}
            </span>
            <span class="status-badge" :class="item.review_status">{{ item.review_status }}</span>
            <div class="signal-meta">
              <span class="signal-user">
                {{ displayName(item) }}
                <span v-if="item.user_email" class="email">({{ item.user_email }})</span>
              </span>
              <span class="signal-date">{{ formatDateTime(item.created_at) }}</span>
              <span v-if="item.agency_name" class="signal-agency">{{ item.agency_name }}</span>
            </div>
            <div class="signal-prompt-preview">{{ item.prompt }}</div>
            <span class="expand-icon">{{ expandedId === item.id ? '▾' : '▸' }}</span>
          </div>

          <div v-show="expandedId === item.id" class="signal-card-body">
            <div class="status-actions">
              <span class="label">Status:</span>
              <button
                type="button"
                class="status-btn"
                :class="{ active: item.review_status === 'pending' }"
                @click.stop="setStatus(item.id, 'pending')"
              >
                Pending
              </button>
              <button
                type="button"
                class="status-btn"
                :class="{ active: item.review_status === 'reviewed' }"
                @click.stop="setStatus(item.id, 'reviewed')"
              >
                Reviewed
              </button>
              <button
                type="button"
                class="status-btn"
                :class="{ active: item.review_status === 'dismissed' }"
                @click.stop="setStatus(item.id, 'dismissed')"
              >
                Dismissed
              </button>
            </div>

            <div class="block">
              <label>What they asked</label>
              <p class="prompt-text">{{ item.prompt }}</p>
            </div>

            <div v-if="item.assistant_excerpt" class="block">
              <label>What the assistant said</label>
              <p class="excerpt-text">{{ item.assistant_excerpt }}</p>
            </div>

            <div class="context-grid">
              <div class="context-row">
                <span class="label">Routed capability</span>
                <code>{{ item.routed_capability_id || '—' }}</code>
              </div>
              <div v-if="item.corrected_capability_id" class="context-row">
                <span class="label">Corrected to</span>
                <code>{{ item.corrected_capability_id }}</code>
              </div>
              <div class="context-row">
                <span class="label">Runtime</span>
                <span>{{ item.runtime || '—' }}</span>
              </div>
              <div v-if="item.promote_as_example" class="context-row">
                <span class="label">Promoted example</span>
                <span>Yes</span>
              </div>
              <div v-if="item.note" class="context-row">
                <span class="label">Note</span>
                <span>{{ item.note }}</span>
              </div>
              <div v-if="metaReason(item)" class="context-row">
                <span class="label">Disengage reason</span>
                <span>{{ metaReason(item) }}</span>
              </div>
              <div v-if="metaMsOpen(item) != null" class="context-row">
                <span class="label">Time open</span>
                <span>{{ formatMs(metaMsOpen(item)) }}</span>
              </div>
              <div v-if="metaPath(item)" class="context-row">
                <span class="label">Page</span>
                <code>{{ metaPath(item) }}</code>
              </div>
            </div>

            <div v-if="metaActionLabels(item).length" class="block">
              <label>Actions offered (unused)</label>
              <ul class="action-list">
                <li v-for="(lab, i) in metaActionLabels(item)" :key="i">{{ lab }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const loading = ref(true);
const error = ref('');
const items = ref([]);
const total = ref(0);
const pendingCount = ref(0);
const agencies = ref([]);
const expandedId = ref(null);
const filters = ref({
  mode: 'queue',
  dateFrom: '',
  dateTo: '',
  agencyId: ''
});

function displayName(item) {
  const n = [item.user_first_name, item.user_last_name].filter(Boolean).join(' ').trim();
  return n || item.user_email || `User #${item.user_id}`;
}

function eventLabel(item) {
  if (item.event_type === 'disengage') return 'Disengaged';
  if (item.helpful === 0 || item.helpful === false) return 'Thumbs down';
  if (item.helpful === 1 || item.helpful === true) return 'Thumbs up';
  return item.event_type || 'Signal';
}

function metaOf(item) {
  return item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
}

function metaReason(item) {
  return String(metaOf(item).reason || '').trim();
}

function metaMsOpen(item) {
  const n = Number(metaOf(item).msOpen);
  return Number.isFinite(n) ? n : null;
}

function metaPath(item) {
  return String(metaOf(item).path || '').trim();
}

function metaActionLabels(item) {
  const list = metaOf(item).offeredActionLabels;
  return Array.isArray(list) ? list.map((x) => String(x)).filter(Boolean) : [];
}

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDateTime(v) {
  if (!v) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
  } catch {
    return String(v);
  }
}

function buildParams() {
  const p = { limit: 100, offset: 0 };
  if (filters.value.dateFrom) p.dateFrom = filters.value.dateFrom;
  if (filters.value.dateTo) p.dateTo = filters.value.dateTo;
  if (filters.value.agencyId) p.agencyId = filters.value.agencyId;

  switch (filters.value.mode) {
    case 'thumbs_down':
      p.reviewQueue = '0';
      p.eventType = 'feedback';
      p.helpful = '0';
      p.reviewStatus = 'pending';
      break;
    case 'disengage':
      p.reviewQueue = '0';
      p.eventType = 'disengage';
      p.reviewStatus = 'pending';
      break;
    case 'all_pending':
      p.reviewQueue = '0';
      p.reviewStatus = 'pending';
      break;
    case 'reviewed':
      p.reviewQueue = '0';
      p.reviewStatus = 'reviewed';
      break;
    case 'dismissed':
      p.reviewQueue = '0';
      p.reviewStatus = 'dismissed';
      break;
    case 'queue':
    default:
      p.reviewQueue = '1';
      break;
  }
  return p;
}

async function fetchSignals() {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/agents/assist/review', { params: buildParams() });
    items.value = res.data?.items || [];
    total.value = res.data?.total ?? 0;
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to load signals';
  } finally {
    loading.value = false;
  }
}

async function fetchPendingCount() {
  try {
    const res = await api.get('/agents/assist/review/pending-count', { skipGlobalLoading: true });
    pendingCount.value = res.data?.count ?? 0;
  } catch {
    pendingCount.value = 0;
  }
}

async function fetchAgencies() {
  try {
    const res = await api.get('/agencies', { params: { minimal: '1' } });
    agencies.value = (res.data || []).filter(
      (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
    );
  } catch {
    agencies.value = [];
  }
}

function applyFilters() {
  fetchSignals();
}

function clearFilters() {
  filters.value = { mode: 'queue', dateFrom: '', dateTo: '', agencyId: '' };
  fetchSignals();
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id;
}

async function setStatus(id, reviewStatus) {
  try {
    await api.patch(`/agents/assist/review/${id}`, { reviewStatus });
    const idx = items.value.findIndex((i) => i.id === id);
    if (idx >= 0) items.value[idx] = { ...items.value[idx], review_status: reviewStatus };
    await fetchPendingCount();
    if (filters.value.mode === 'queue' && reviewStatus !== 'pending') {
      items.value = items.value.filter((i) => i.id !== id);
      total.value = Math.max(0, total.value - 1);
    }
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to update status';
  }
}

onMounted(async () => {
  await Promise.all([fetchAgencies(), fetchPendingCount(), fetchSignals()]);
});
</script>

<style scoped>
.ask-assist-review {
  padding-bottom: 2rem;
}

.page-header h1 {
  margin: 0 0 0.25rem;
}

.subtitle {
  color: #64748b;
  margin: 0 0 1.25rem;
}

.loading,
.error {
  padding: 1rem 0;
}

.error {
  color: #b91c1c;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.filter-select,
.filter-input {
  padding: 0.35rem 0.55rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  font-size: 0.875rem;
}

.toolbar-stats {
  display: flex;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: #64748b;
}

.stat.pending {
  color: #b45309;
  font-weight: 600;
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
  color: #64748b;
}

.empty-state .hint {
  font-size: 0.9rem;
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.signal-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.signal-card-header {
  display: grid;
  grid-template-columns: auto auto 1fr minmax(8rem, 2fr) auto;
  gap: 0.5rem 0.75rem;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
}

.type-badge,
.status-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  white-space: nowrap;
}

.type-badge.disengage {
  background: #fef3c7;
  color: #92400e;
}

.type-badge.feedback {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.pending {
  background: #ffedd5;
  color: #9a3412;
}

.status-badge.reviewed {
  background: #dcfce7;
  color: #166534;
}

.status-badge.dismissed {
  background: #f1f5f9;
  color: #475569;
}

.signal-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  font-size: 0.8rem;
}

.signal-user {
  font-weight: 600;
  color: #0f172a;
}

.email {
  font-weight: 400;
  color: #64748b;
}

.signal-date,
.signal-agency {
  color: #64748b;
}

.signal-prompt-preview {
  font-size: 0.875rem;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  color: #94a3b8;
}

.signal-card-body {
  border-top: 1px solid #e2e8f0;
  padding: 1rem;
  background: #f8fafc;
}

.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  margin-bottom: 1rem;
}

.status-actions .label {
  font-size: 0.8rem;
  color: #64748b;
  margin-right: 0.25rem;
}

.status-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 6px;
  padding: 0.25rem 0.55rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.status-btn.active {
  border-color: #0d9488;
  background: #ccfbf1;
  color: #115e59;
}

.block {
  margin-bottom: 0.85rem;
}

.block label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
  margin-bottom: 0.35rem;
}

.prompt-text,
.excerpt-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.45;
  color: #0f172a;
}

.excerpt-text {
  color: #334155;
  font-size: 0.925rem;
}

.context-grid {
  display: grid;
  gap: 0.45rem;
  margin-bottom: 0.75rem;
}

.context-row {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.5rem;
  font-size: 0.875rem;
  align-items: start;
}

.context-row .label {
  color: #64748b;
}

.context-row code {
  font-size: 0.8rem;
  word-break: break-all;
}

.action-list {
  margin: 0;
  padding-left: 1.15rem;
  color: #334155;
}

@media (max-width: 900px) {
  .signal-card-header {
    grid-template-columns: auto auto 1fr auto;
  }

  .signal-prompt-preview {
    grid-column: 1 / -1;
    white-space: normal;
  }

  .context-row {
    grid-template-columns: 1fr;
  }
}
</style>
