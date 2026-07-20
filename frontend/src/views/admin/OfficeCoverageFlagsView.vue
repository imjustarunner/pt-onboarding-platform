<template>
  <div class="container coverage-view">
    <div class="page-header">
      <div>
        <h2>Office Coverage Flags</h2>
        <p class="subtitle">
          Past booked hours where Therapy Notes / ICS did not show clinical session coverage.
          Filter by office and date to spot-check, then Keep (sticky) or Release in one click.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="runAudit" :disabled="auditing || loading">
          {{ auditing ? 'Running audit…' : 'Run audit now' }}
        </button>
        <router-link to="/admin/booking-conflict-resolver" class="btn btn-secondary">Conflict resolver</router-link>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="auditResult" class="audit-result-box">
      Audit complete —
      <strong>{{ auditResult.totalFlagged ?? 0 }} flagged hour{{ (auditResult.totalFlagged ?? 0) !== 1 ? 's' : '' }}</strong>
      across {{ auditResult.locations ?? 0 }} location{{ (auditResult.locations ?? 0) !== 1 ? 's' : '' }}.
      <button class="dismiss-btn" @click="auditResult = null; load()">✕ Refresh list</button>
    </div>
    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="bulkMessage" class="audit-result-box">{{ bulkMessage }}</div>

    <!-- Filters -->
    <div class="card filters-card">
      <div class="filters-grid">
        <label class="filter-field">
          <span>Office</span>
          <select v-model="filters.officeLocationId" @change="onOfficeChange">
            <option value="">All offices</option>
            <option v-for="o in filterOptions.offices" :key="o.id" :value="String(o.id)">{{ o.name }}</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Provider</span>
          <select v-model="filters.providerId">
            <option value="">All providers</option>
            <option v-for="p in filterOptions.providers" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Flag type</span>
          <select v-model="filters.flagType">
            <option value="">All types</option>
            <option value="no_coverage">No ICS coverage</option>
            <option value="non_clinical_busy">Non-clinical busy</option>
            <option value="partial_coverage">Partial coverage</option>
          </select>
        </label>
        <label class="filter-field">
          <span>From</span>
          <input v-model="filters.dateFrom" type="date" />
        </label>
        <label class="filter-field">
          <span>To</span>
          <input v-model="filters.dateTo" type="date" />
        </label>
        <div class="filter-actions">
          <button class="btn btn-secondary" type="button" @click="applyPreset(7)">Last 7 days</button>
          <button class="btn btn-secondary" type="button" @click="applyPreset(14)">Last 14 days</button>
          <button class="btn btn-secondary" type="button" @click="applyPreset(42)">Last 6 weeks</button>
          <button class="btn btn-secondary" type="button" @click="clearFilters">Clear</button>
          <button class="btn btn-primary" type="button" @click="load" :disabled="loading">Apply</button>
        </div>
      </div>
      <div class="filter-summary muted">
        Showing <strong>{{ flags.length }}</strong> flagged hour{{ flags.length !== 1 ? 's' : '' }}
        <template v-if="grouped.length"> across {{ grouped.length }} provider{{ grouped.length !== 1 ? 's' : '' }}</template>.
        Keep is sticky (won’t reappear on the next audit). Release frees the hour immediately.
      </div>
    </div>

    <!-- Bulk bar -->
    <div v-if="selectedIds.size" class="bulk-bar">
      <span><strong>{{ selectedIds.size }}</strong> selected</span>
      <button class="btn btn-sm btn-keep" :disabled="bulkActing" @click="bulkKeep">Keep selected</button>
      <button class="btn btn-sm btn-release" :disabled="bulkActing" @click="bulkRelease">Release selected</button>
      <button class="btn btn-sm btn-secondary" :disabled="bulkActing" @click="clearSelection">Clear selection</button>
    </div>

    <div v-if="loading" class="loading">Loading coverage flags…</div>

    <!-- EHR sync health summary -->
    <div v-if="health && health.locations && health.locations.length" class="card health-card">
      <div class="health-header">
        <strong>EHR sync health</strong>
        <span class="muted" style="font-size:12px;">Last 7 days</span>
      </div>
      <div class="health-grid">
        <div v-for="loc in health.locations" :key="loc.office_location_id" class="health-row">
          <span class="health-name">{{ loc.office_name }}</span>
          <span class="health-pill" :class="{ bad: loc.total_feeds_failed > 0 }">
            {{ loc.total_feeds_failed > 0 ? `${loc.total_feeds_failed} feed error${loc.total_feeds_failed !== 1 ? 's' : ''}` : 'Feeds OK' }}
          </span>
          <span class="health-stat muted">{{ loc.total_scanned }} scanned</span>
          <span class="health-stat muted">Last run: {{ fmtDatetime(loc.last_run_at) }}</span>
          <span v-if="loc.last_error" class="health-error muted" :title="loc.last_error">⚠ {{ loc.last_error.slice(0, 60) }}</span>
        </div>
      </div>
    </div>

    <!-- No flags -->
    <div v-if="!loading && !error && grouped.length === 0" class="empty-state">
      <div class="empty-icon">✓</div>
      <div class="empty-title">No coverage flags</div>
      <div class="muted">Nothing matches these filters, or all slots have sufficient ICS clinical coverage.</div>
    </div>

    <!-- Flag groups by provider -->
    <div v-for="group in grouped" :key="group.providerId" class="provider-group card">
      <div class="provider-header">
        <div class="provider-left">
          <label class="select-all">
            <input
              type="checkbox"
              :checked="isGroupFullySelected(group)"
              :indeterminate.prop="isGroupPartiallySelected(group)"
              @change="toggleGroup(group, $event.target.checked)"
            />
            <span class="provider-name">{{ group.providerName }}</span>
          </label>
        </div>
        <div class="provider-right">
          <span class="provider-count muted">{{ group.flags.length }} flagged slot{{ group.flags.length !== 1 ? 's' : '' }}</span>
          <button class="btn btn-sm btn-keep" :disabled="bulkActing" @click="keepGroup(group)">Keep all</button>
          <button class="btn btn-sm btn-release" :disabled="bulkActing" @click="releaseGroup(group)">Release all</button>
        </div>
      </div>

      <table class="flags-table">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th>Date &amp; Time</th>
            <th>Office / Room</th>
            <th>Flag reason</th>
            <th>Flagged</th>
            <th>Last ICS overlap</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="flag in group.flags" :key="flag.event_id" :class="['flag-row', flagClass(flag.ics_flag_type)]">
            <td class="col-check">
              <input
                type="checkbox"
                :checked="selectedIds.has(flag.event_id)"
                @change="toggleOne(flag.event_id, $event.target.checked)"
              />
            </td>
            <td class="slot-time">
              <strong>{{ fmtDate(flag.start_at) }}</strong><br>
              <span class="muted">{{ fmtTimeRange(flag.start_at, flag.end_at) }}</span>
            </td>
            <td>
              <div>{{ flag.office_name }}</div>
              <div class="muted">{{ flag.room_label || flag.room_name }}</div>
            </td>
            <td>
              <span class="flag-badge" :class="flagClass(flag.ics_flag_type)">{{ flagLabel(flag.ics_flag_type) }}</span>
              <div class="flag-desc muted">{{ flagDescription(flag.ics_flag_type) }}</div>
            </td>
            <td class="muted">{{ fmtDatetime(flag.ics_flagged_at) }}</td>
            <td class="muted">{{ flag.last_ics_overlap_at ? fmtDatetime(flag.last_ics_overlap_at) : '—' }}</td>
            <td>
              <div class="action-buttons">
                <button
                  class="btn btn-sm btn-keep"
                  :disabled="acting[flag.event_id] || bulkActing"
                  @click="keep(flag)"
                  title="Keep this booking — sticky; will not re-flag on the next audit"
                >
                  {{ acting[flag.event_id] === 'keep' ? '…' : 'Keep' }}
                </button>
                <button
                  class="btn btn-sm btn-release"
                  :disabled="acting[flag.event_id] || bulkActing"
                  @click="release(flag)"
                  title="Release this slot immediately — frees the hour for reassignment"
                >
                  {{ acting[flag.event_id] === 'release' ? '…' : 'Release' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';

const route = useRoute();
const orgSlug = computed(() => route.params.organizationSlug || null);

const flags = ref([]);
const filterOptions = ref({ offices: [], providers: [] });
const health = ref(null);
const loading = ref(false);
const error = ref('');
const acting = ref({});
const auditResult = ref(null);
const auditing = ref(false);
const bulkActing = ref(false);
const bulkMessage = ref('');
const selectedIds = ref(new Set());

const filters = ref({
  officeLocationId: '',
  providerId: '',
  flagType: '',
  dateFrom: '',
  dateTo: ''
});

const grouped = computed(() => {
  const map = new Map();
  for (const f of flags.value) {
    const pid = f.assigned_provider_id;
    if (!map.has(pid)) {
      map.set(pid, { providerId: pid, providerName: f.provider_name, flags: [] });
    }
    map.get(pid).flags.push(f);
  }
  return Array.from(map.values()).sort((a, b) => a.providerName.localeCompare(b.providerName));
});

function ymdDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function applyPreset(days) {
  filters.value.dateFrom = ymdDaysAgo(days);
  filters.value.dateTo = new Date().toISOString().slice(0, 10);
  load();
}

function clearFilters() {
  filters.value = {
    officeLocationId: '',
    providerId: '',
    flagType: '',
    dateFrom: '',
    dateTo: ''
  };
  load();
}

function onOfficeChange() {
  filters.value.providerId = '';
  load();
}

function buildQuery() {
  const q = {};
  if (filters.value.officeLocationId) q.officeLocationId = filters.value.officeLocationId;
  if (filters.value.providerId) q.providerId = filters.value.providerId;
  if (filters.value.flagType) q.flagType = filters.value.flagType;
  if (filters.value.dateFrom) q.dateFrom = filters.value.dateFrom;
  if (filters.value.dateTo) q.dateTo = filters.value.dateTo;
  return q;
}

async function load() {
  loading.value = true;
  error.value = '';
  bulkMessage.value = '';
  try {
    const [flagsRes, healthRes] = await Promise.all([
      api.get('/api/office-schedule/admin/coverage-flags', { params: buildQuery() }),
      api.get('/api/office-schedule/admin/ehr-sync-health').catch(() => ({ data: { locations: [] } }))
    ]);
    flags.value = flagsRes.data?.flags || [];
    filterOptions.value = flagsRes.data?.filterOptions || { offices: [], providers: [] };
    health.value = healthRes.data || null;
    // Drop selections that are no longer in the list
    const valid = new Set(flags.value.map((f) => f.event_id));
    selectedIds.value = new Set([...selectedIds.value].filter((id) => valid.has(id)));
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || 'Failed to load coverage flags.';
  } finally {
    loading.value = false;
  }
}

async function runAudit() {
  auditing.value = true;
  auditResult.value = null;
  try {
    const res = await api.post('/api/office-schedule/watchdog/run-coverage-audit');
    auditResult.value = res.data;
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || 'Audit failed.';
  } finally {
    auditing.value = false;
  }
}

function removeFlags(ids) {
  const set = new Set(ids);
  flags.value = flags.value.filter((f) => !set.has(f.event_id));
  selectedIds.value = new Set([...selectedIds.value].filter((id) => !set.has(id)));
}

async function keep(flag) {
  acting.value = { ...acting.value, [flag.event_id]: 'keep' };
  try {
    await api.post(`/api/office-schedule/admin/coverage-flags/${flag.event_id}/keep`);
    removeFlags([flag.event_id]);
  } catch (e) {
    alert(e?.response?.data?.error || 'Failed to keep slot.');
  } finally {
    const a = { ...acting.value };
    delete a[flag.event_id];
    acting.value = a;
  }
}

/** One-click release — no confirm dialog. */
async function release(flag) {
  acting.value = { ...acting.value, [flag.event_id]: 'release' };
  try {
    await api.post(`/api/office-schedule/admin/coverage-flags/${flag.event_id}/release`);
    removeFlags([flag.event_id]);
  } catch (e) {
    alert(e?.response?.data?.error || 'Failed to release slot.');
  } finally {
    const a = { ...acting.value };
    delete a[flag.event_id];
    acting.value = a;
  }
}

async function bulkAction(action, eventIds) {
  const ids = [...new Set(eventIds)].filter(Boolean);
  if (!ids.length) return;
  bulkActing.value = true;
  bulkMessage.value = '';
  error.value = '';
  try {
    // Chunk to stay under server limit of 500
    let processed = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      // eslint-disable-next-line no-await-in-loop
      const res = await api.post('/api/office-schedule/admin/coverage-flags/bulk', {
        action,
        eventIds: chunk
      });
      processed += Number(res.data?.processed || 0);
      removeFlags(chunk);
    }
    bulkMessage.value = `${action === 'keep' ? 'Kept' : 'Released'} ${processed} slot${processed !== 1 ? 's' : ''}.`;
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || `Bulk ${action} failed.`;
  } finally {
    bulkActing.value = false;
  }
}

function bulkKeep() {
  return bulkAction('keep', [...selectedIds.value]);
}

function bulkRelease() {
  return bulkAction('release', [...selectedIds.value]);
}

function keepGroup(group) {
  return bulkAction('keep', group.flags.map((f) => f.event_id));
}

function releaseGroup(group) {
  return bulkAction('release', group.flags.map((f) => f.event_id));
}

function toggleOne(id, checked) {
  const next = new Set(selectedIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedIds.value = next;
}

function toggleGroup(group, checked) {
  const next = new Set(selectedIds.value);
  for (const f of group.flags) {
    if (checked) next.add(f.event_id);
    else next.delete(f.event_id);
  }
  selectedIds.value = next;
}

function isGroupFullySelected(group) {
  return group.flags.length > 0 && group.flags.every((f) => selectedIds.value.has(f.event_id));
}

function isGroupPartiallySelected(group) {
  const n = group.flags.filter((f) => selectedIds.value.has(f.event_id)).length;
  return n > 0 && n < group.flags.length;
}

function clearSelection() {
  selectedIds.value = new Set();
}

function flagLabel(type) {
  if (type === 'no_coverage') return 'No ICS coverage';
  if (type === 'non_clinical_busy') return 'Non-clinical busy';
  if (type === 'partial_coverage') return 'Partial coverage';
  return type || 'Unknown';
}

function flagDescription(type) {
  if (type === 'no_coverage') return 'No ICS busy blocks found overlapping this slot.';
  if (type === 'non_clinical_busy') return 'ICS shows busy but event title has no clinical keyword (therapy, session, intake, etc.).';
  if (type === 'partial_coverage') return 'ICS covers the beginning of the block but not the end — uncovered tail hours.';
  return '';
}

function flagClass(type) {
  if (type === 'no_coverage') return 'flag-none';
  if (type === 'non_clinical_busy') return 'flag-nonclinical';
  if (type === 'partial_coverage') return 'flag-partial';
  return '';
}

function fmtDate(dt) {
  if (!dt) return '—';
  try {
    return new Date(String(dt).replace(' ', 'T') + 'Z').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch { return String(dt).slice(0, 10); }
}

function fmtTimeRange(start, end) {
  const fmt = (dt) => {
    try {
      return new Date(String(dt).replace(' ', 'T') + 'Z').toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch { return ''; }
  };
  return `${fmt(start)}–${fmt(end)}`;
}

function fmtDatetime(dt) {
  if (!dt) return '—';
  try {
    return new Date(String(dt).replace(' ', 'T') + (String(dt).includes('T') ? '' : 'Z')).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch { return String(dt).slice(0, 16); }
}

// Default to last 6 weeks so bookers start with a manageable window
onMounted(() => {
  filters.value.dateFrom = ymdDaysAgo(42);
  filters.value.dateTo = new Date().toISOString().slice(0, 10);
  load();
});

watch(orgSlug, () => load());
</script>

<style scoped>
.coverage-view {
  padding: 24px 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.page-header h2 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
}

.subtitle {
  color: var(--text-muted, #6b7280);
  margin: 0;
  font-size: 14px;
  max-width: 640px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
}

.card {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 20px;
}

.filters-card {
  padding: 16px 20px;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px 14px;
  align-items: end;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
}

.filter-field select,
.filter-field input {
  font-weight: 500;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: #fff;
  color: var(--text-primary, #111827);
}

.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  grid-column: 1 / -1;
}

.filter-summary {
  margin-top: 12px;
  font-size: 13px;
}

.bulk-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  font-size: 14px;
  position: sticky;
  top: 8px;
  z-index: 5;
}

.audit-result-box {
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.error-box {
  background: #fff5f5;
  border: 1px solid #f87171;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  color: #b91c1c;
  font-size: 14px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-muted, #6b7280);
}

.dismiss-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted, #6b7280);
  margin-left: auto;
  padding: 2px 6px;
}

.health-card {
  padding: 16px 20px;
}

.health-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.health-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.health-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
}

.health-name {
  font-weight: 600;
  min-width: 140px;
}

.health-pill {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  background: #d1fae5;
  color: #065f46;
  font-weight: 600;
}

.health-pill.bad {
  background: #fee2e2;
  color: #b91c1c;
}

.health-stat {
  font-size: 12px;
}

.health-error {
  font-size: 11px;
  color: #d97706;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  text-align: center;
  padding: 56px 24px;
  color: var(--text-muted, #6b7280);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
  color: #10b981;
}

.empty-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  margin-bottom: 6px;
}

.provider-group {
  padding: 0;
  overflow: hidden;
}

.provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: var(--table-header-bg, #f9fafb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-wrap: wrap;
}

.provider-left,
.provider-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.select-all {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.provider-name {
  font-weight: 700;
  font-size: 15px;
}

.provider-count {
  font-size: 13px;
}

.flags-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.flags-table th {
  text-align: left;
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #6b7280);
  background: var(--table-header-bg, #f9fafb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.flags-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, #f3f4f6);
  vertical-align: middle;
}

.col-check {
  width: 36px;
  padding-left: 16px !important;
  padding-right: 0 !important;
}

.flag-row:last-child td {
  border-bottom: none;
}

.flag-row.flag-none {
  border-left: 3px solid #ef4444;
}

.flag-row.flag-nonclinical {
  border-left: 3px solid #f59e0b;
}

.flag-row.flag-partial {
  border-left: 3px solid #f97316;
}

.slot-time strong {
  font-size: 13px;
}

.flag-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.flag-badge.flag-none {
  background: #fee2e2;
  color: #b91c1c;
}

.flag-badge.flag-nonclinical {
  background: #fef3c7;
  color: #92400e;
}

.flag-badge.flag-partial {
  background: #ffedd5;
  color: #9a3412;
}

.flag-desc {
  font-size: 11px;
  margin-top: 3px;
}

.muted {
  color: var(--text-muted, #6b7280);
}

.action-buttons {
  display: flex;
  gap: 6px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  font-size: 13px;
  padding: 6px 14px;
  transition: opacity 0.15s;
  text-decoration: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--btn-secondary-hover, #e5e7eb);
}

.btn-primary {
  background: #2563eb;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-sm {
  font-size: 12px;
  padding: 4px 10px;
}

.btn-keep {
  background: #d1fae5;
  color: #065f46;
}

.btn-keep:hover:not(:disabled) {
  background: #a7f3d0;
}

.btn-release {
  background: #fee2e2;
  color: #b91c1c;
}

.btn-release:hover:not(:disabled) {
  background: #fecaca;
}
</style>
