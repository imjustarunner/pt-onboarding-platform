<template>
  <div class="coverage-view" :class="{ 'coverage-view--embedded': embedded, container: !embedded }">
    <div v-if="!embedded" class="page-header">
      <div>
        <h2>Office Coverage Flags</h2>
        <p class="subtitle">
          Conflicts scanned from today through the next 4 weeks.
          Keep silences a series for 4 weeks; Release frees all future booked occurrences from today.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="runAudit" :disabled="auditing || loading">
          {{ auditing ? 'Running audit…' : 'Run audit now' }}
        </button>
        <router-link :to="conflictResolverTo" class="btn btn-secondary">Conflict resolver</router-link>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>
    <div v-else class="embedded-header">
      <div>
        <h2>Reported conflicts</h2>
        <p class="subtitle">
          Recurring office bookings without a matching Therapy Notes / shared calendar clinical event (today → 4 weeks).
          Keep silences a series for 4 weeks; Release frees all future booked hours from today.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="runAudit" :disabled="auditing || loading">
          {{ auditing ? 'Running audit…' : 'Run audit now' }}
        </button>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="auditResult" class="audit-result-box">
      Audit complete —
      <strong>{{ auditResult.totalFlagged ?? 0 }} flagged hour{{ (auditResult.totalFlagged ?? 0) !== 1 ? 's' : '' }}</strong>
      across {{ auditResult.locations ?? 0 }} location{{ (auditResult.locations ?? 0) !== 1 ? 's' : '' }}.
      List shows recurring series only.
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
            <option value="no_coverage">No Therapy Notes session during booking</option>
            <option value="non_clinical_busy">Busy without therapy session</option>
            <option value="partial_coverage">Partial Therapy Notes coverage</option>
          </select>
        </label>
        <label class="filter-field filter-field--wide">
          <span>Days</span>
          <div class="pill-group">
            <label v-for="d in weekdays" :key="d.val" class="pill" :class="{ active: filters.weekdays.includes(d.val) }">
              <input type="checkbox" v-model="filters.weekdays" :value="d.val" @change="load">
              {{ d.label }}
            </label>
          </div>
        </label>
        <label class="filter-field filter-field--wide">
          <span>Start Times</span>
          <div class="pill-group">
            <label v-for="h in officeHours" :key="h.val" class="pill" :class="{ active: filters.hours.includes(h.val) }">
              <input type="checkbox" v-model="filters.hours" :value="h.val" @change="load">
              {{ h.label }}
            </label>
          </div>
        </label>
        <div class="filter-actions">
          <button class="btn btn-secondary" type="button" @click="clearFilters">Clear</button>
          <button class="btn btn-primary" type="button" @click="load" :disabled="loading">Apply</button>
        </div>
      </div>
      <div class="filter-summary muted">
        Showing <strong>{{ flags.length }}</strong> recurring series
        <template v-if="grouped.length"> across {{ grouped.length }} provider{{ grouped.length !== 1 ? 's' : '' }}</template>.
        One-time bookings are excluded. Window is today → 4 weeks. Keep = mute 4 weeks; Release = free forever from today.
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
        <span class="muted" style="font-size:12px;">Latest daily run (once per day)</span>
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
          <span class="provider-count muted">{{ group.flags.length }} flagged series</span>
          <button class="btn btn-sm btn-keep" :disabled="bulkActing" @click="keepGroup(group)">Keep all</button>
          <button class="btn btn-sm btn-release" :disabled="bulkActing" @click="releaseGroup(group)">Release all</button>
        </div>
      </div>

      <table class="flags-table">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th>Recurring pattern</th>
            <th>Office / Room</th>
            <th>Flag reason</th>
            <th>Flagged</th>
            <th>Last ICS overlap</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="flag in group.flags" :key="flag.standing_assignment_id || flag.event_id">
            <tr :class="['flag-row', flagClass(flag.ics_flag_type)]">
              <td class="col-check">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(flag.event_id)"
                  @change="toggleOne(flag.event_id, $event.target.checked)"
                />
              </td>
              <td class="slot-time">
                <strong>{{ patternHeadline(flag) }}</strong><br>
                <span class="muted">{{ patternSubline(flag) }}</span>
                <button
                  v-if="(flag.occurrences || []).length"
                  type="button"
                  class="dates-toggle"
                  @click="toggleDates(flag)"
                >
                  {{ isDatesOpen(flag) ? 'Hide' : 'Show' }}
                  {{ (flag.occurrences || []).length }} conflicting date{{ (flag.occurrences || []).length !== 1 ? 's' : '' }}
                </button>
              </td>
              <td>
                <div>{{ flag.office_name }}</div>
                <div class="muted">{{ roomDisplay(flag) }}</div>
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
                    title="Keep this series for 4 weeks — will not re-flag until that window passes"
                  >
                    {{ acting[flag.event_id] === 'keep' ? '…' : 'Keep' }}
                  </button>
                  <button
                    class="btn btn-sm btn-release"
                    :disabled="acting[flag.event_id] || bulkActing"
                    @click="release(flag)"
                    title="Release this series forever from today — frees all future booked occurrences"
                  >
                    {{ acting[flag.event_id] === 'release' ? '…' : 'Release' }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="isDatesOpen(flag)" class="dates-detail-row">
              <td></td>
              <td colspan="6">
                <ul class="dates-list">
                  <li v-for="occ in flag.occurrences" :key="occ.event_id">
                    <span :class="{ 'is-past': occ.is_past }">
                      {{ fmtDate(occ.start_at) }} · {{ fmtTimeRange(occ.start_at, occ.end_at) }}
                    </span>
                    <span v-if="occ.is_past" class="past-tag">past</span>
                  </li>
                </ul>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';

defineProps({
  embedded: { type: Boolean, default: false }
});
const emit = defineEmits(['count-change']);

const route = useRoute();
const orgSlug = computed(() => route.params.organizationSlug || null);
const conflictResolverTo = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/booking-conflict-resolver` : '/admin/booking-conflict-resolver'
);

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
const openDateKeys = ref(new Set());

const filters = ref({
  officeLocationId: '',
  providerId: '',
  flagType: '',
  weekdays: [],
  hours: []
});

const weekdays = [
  { val: 1, label: 'Mon' },
  { val: 2, label: 'Tue' },
  { val: 3, label: 'Wed' },
  { val: 4, label: 'Thu' },
  { val: 5, label: 'Fri' },
  { val: 6, label: 'Sat' },
  { val: 0, label: 'Sun' }
];

const officeHours = Array.from({ length: 12 }, (_, i) => {
  const h = i + 7; // 7 AM to 6 PM
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h;
  return { val: h, label: `${displayH}:00 ${ampm}` };
});

function patternKey(flag) {
  return String(flag.standing_assignment_id || flag.event_id || '');
}

function isDatesOpen(flag) {
  return openDateKeys.value.has(patternKey(flag));
}

function toggleDates(flag) {
  const key = patternKey(flag);
  const next = new Set(openDateKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  openDateKeys.value = next;
}

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

function clearFilters() {
  filters.value = {
    officeLocationId: '',
    providerId: '',
    flagType: '',
    weekdays: [],
    hours: []
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
  if (filters.value.weekdays?.length) q.weekdays = filters.value.weekdays.join(',');
  if (filters.value.hours?.length) q.hours = filters.value.hours.join(',');
  return q;
}

async function load() {
  loading.value = true;
  error.value = '';
  bulkMessage.value = '';
  try {
    const [flagsRes, healthRes] = await Promise.all([
      api.get('/office-schedule/admin/coverage-flags', { params: buildQuery() }),
      api.get('/office-schedule/admin/ehr-sync-health').catch(() => ({ data: { locations: [] } }))
    ]);
    const rawFlags = flagsRes.data?.flags || [];
    // Client backstop: weekly series with only one upcoming conflict day are cancellations.
    flags.value = rawFlags.filter((f) => isActionableConflictSeries(f));
    filterOptions.value = flagsRes.data?.filterOptions || { offices: [], providers: [] };
    health.value = healthRes.data || null;
    // Drop selections that are no longer in the list
    const valid = new Set(flags.value.map((f) => f.event_id));
    selectedIds.value = new Set([...selectedIds.value].filter((id) => valid.has(id)));
    emit('count-change', flags.value.length);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Failed to load coverage flags.';
    emit('count-change', 0);
  } finally {
    loading.value = false;
  }
}

async function runAudit() {
  auditing.value = true;
  auditResult.value = null;
  try {
    const res = await api.post('/office-schedule/watchdog/run-coverage-audit');
    auditResult.value = res.data;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Audit failed.';
  } finally {
    auditing.value = false;
  }
}

function removeFlags(ids) {
  const set = new Set(ids);
  flags.value = flags.value.filter((f) => {
    const eventIds = Array.isArray(f.event_ids) && f.event_ids.length ? f.event_ids : [f.event_id];
    return !eventIds.some((id) => set.has(id)) && !set.has(f.event_id);
  });
  selectedIds.value = new Set([...selectedIds.value].filter((id) => !set.has(id)));
}

function hourLabel(h) {
  const hour = Number(h);
  if (!Number.isFinite(hour)) return '';
  const d = new Date(2000, 0, 1, hour, 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function roomDisplay(flag) {
  const num = flag.room_number != null && flag.room_number !== '' ? `#${flag.room_number}` : '';
  const label = String(flag.room_label || flag.room_name || '').trim();
  return [num, label].filter(Boolean).join(' ') || '—';
}

function patternHeadline(flag) {
  const freq = flag.frequency_label || 'Recurring';
  const day = String(flag.weekday_label || '').trim();
  const dayPhrase = day
    ? (day.endsWith('s') ? day : `${day}s`)
    : '';
  // Prefer standing-assignment wall hours — avoids UTC skew from DATETIME→ISO Z.
  const time = (Number.isFinite(Number(flag.start_hour)) && Number.isFinite(Number(flag.end_hour)))
    ? `${hourLabel(flag.start_hour)}–${hourLabel(flag.end_hour)}`
    : fmtTimeRange(flag.start_at, flag.end_at);
  if (dayPhrase && time) return `${freq} ${dayPhrase} ${time}`;
  if (time) return `${freq} ${time}`;
  return freq;
}

function patternSubline(flag) {
  const parts = [];
  if (flag.series_start_date) {
    parts.push(`Series since ${fmtDate(flag.series_start_date)}`);
  }
  if (flag.first_conflict_at) {
    parts.push(`First conflict ${fmtDate(flag.first_conflict_at)}`);
  }
  if (flag.next_occurrence_at) {
    parts.push(`Next ${fmtDate(flag.next_occurrence_at)}`);
  }
  const upcoming = Number(flag.upcoming_count || 0);
  if (upcoming > 0) parts.push(`${upcoming} upcoming`);
  return parts.join(' · ') || 'Recurring series';
}

async function keep(flag) {
  acting.value = { ...acting.value, [flag.event_id]: 'keep' };
  try {
    await api.post(`/office-schedule/admin/coverage-flags/${flag.event_id}/keep`);
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
    await api.post(`/office-schedule/admin/coverage-flags/${flag.event_id}/release`);
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
      const res = await api.post('/office-schedule/admin/coverage-flags/bulk', {
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

/** Weekly + ≤1 distinct upcoming conflict day = one-off cancellation — do not show. */
function isActionableConflictSeries(flag) {
  const freq = String(flag?.frequency || flag?.frequency_label || '').toUpperCase();
  const isWeekly = freq === 'WEEKLY' || freq.startsWith('WEEKLY');
  if (!isWeekly) return true;
  const days = new Set();
  for (const o of flag?.occurrences || []) {
    if (o?.is_past) continue;
    const d = String(o?.start_at || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) days.add(d);
  }
  if (days.size > 0) return days.size > 1;
  return Number(flag?.upcoming_count || 0) > 1;
}

function flagLabel(type) {
  if (type === 'no_coverage') return 'No Therapy Notes session during booking';
  if (type === 'non_clinical_busy') return 'Busy without therapy session';
  if (type === 'partial_coverage') return 'Partial Therapy Notes coverage';
  return type || 'Unknown';
}

function flagDescription(type) {
  if (type === 'no_coverage') return 'No Therapy Notes session found during this booked office hour.';
  if (type === 'non_clinical_busy') return 'Calendar shows busy time, but not a Therapy Notes therapy session.';
  if (type === 'partial_coverage') return 'Therapy Notes covers part of the booked block, but not the full hour.';
  return '';
}

function flagClass(type) {
  if (type === 'no_coverage') return 'flag-none';
  if (type === 'non_clinical_busy') return 'flag-nonclinical';
  if (type === 'partial_coverage') return 'flag-partial';
  return '';
}

/** Parse MySQL DATETIME as wall clock (ignore trailing Z — office slots are not UTC instants). */
function parseWallDt(dt) {
  if (!dt) return null;
  if (dt instanceof Date) {
    // Prefer UTC digit parts when the Date came from mysql2 DATETIME serialization.
    return new Date(
      dt.getUTCFullYear(),
      dt.getUTCMonth(),
      dt.getUTCDate(),
      dt.getUTCHours(),
      dt.getUTCMinutes(),
      dt.getUTCSeconds()
    );
  }
  const s = String(dt).trim().replace(/\.000Z$/i, '').replace(/Z$/i, '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const normalized = s.includes('T') ? s : s.replace(' ', 'T');
    const d = new Date(normalized.length === 10 ? `${normalized}T12:00:00` : normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(dt) {
  const d = parseWallDt(dt);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

function fmtTimeRange(start, end) {
  const fmt = (dt) => {
    const d = parseWallDt(dt);
    if (!d) return '';
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };
  return `${fmt(start)}–${fmt(end)}`;
}

function fmtDatetime(dt) {
  const d = parseWallDt(dt);
  if (!d) return '—';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });
}

onMounted(() => {
  load();
});

watch(orgSlug, () => load());

defineExpose({ load });
</script>

<style scoped>
.coverage-view {
  padding: 24px 0;
}

.coverage-view--embedded {
  padding: 0;
}

.embedded-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.embedded-header h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
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
  align-items: start;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
}

.filter-field--wide {
  grid-column: 1 / -1;
}

.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  background: var(--bg-shade, #f1f5f9);
  border: 1px solid var(--border);
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--text-secondary, #475569);
  user-select: none;
  transition: all 0.15s ease;
}

.pill input {
  display: none;
}

.pill:hover {
  background: #e2e8f0;
}

.pill.active {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
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

.dates-toggle {
  display: inline-block;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.dates-toggle:hover {
  color: #1d4ed8;
}

.dates-detail-row td {
  padding-top: 0;
  background: #f9fafb;
}

.dates-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.dates-list li {
  font-size: 12px;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dates-list .is-past {
  color: #9ca3af;
}

.past-tag {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9ca3af;
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
