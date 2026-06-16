<template>
  <div class="container coverage-view">
    <div class="page-header">
      <div>
        <h2>Office Coverage Flags</h2>
        <p class="subtitle">
          These office slots were identified at the 6-week ICS audit as having insufficient clinical session coverage.
          For each flagged slot, review the coverage reason and choose to keep the booking or release the hours.
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-secondary" @click="runAudit" :disabled="auditing || loading">
          {{ auditing ? 'Running audit…' : 'Run audit now' }}
        </button>
        <router-link to="/admin/booking-conflict-resolver" class="btn btn-secondary">Conflict resolver</router-link>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="auditResult" class="audit-result-box">
      Audit complete — <strong>{{ auditResult.totalFlagged }} new flag{{ auditResult.totalFlagged !== 1 ? 's' : '' }}</strong>
      across {{ auditResult.locations }} location{{ auditResult.locations !== 1 ? 's' : '' }}.
      <button class="dismiss-btn" @click="auditResult = null; load()">✕ Refresh list</button>
    </div>
    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading coverage flags…</div>

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
      <div class="muted">All audited office slots have sufficient ICS clinical session coverage, or no audit has run yet.</div>
    </div>

    <!-- Flag groups by provider -->
    <div v-for="group in grouped" :key="group.providerId" class="provider-group card">
      <div class="provider-header">
        <div class="provider-name">{{ group.providerName }}</div>
        <div class="provider-count muted">{{ group.flags.length }} flagged slot{{ group.flags.length !== 1 ? 's' : '' }}</div>
      </div>

      <table class="flags-table">
        <thead>
          <tr>
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
                  :disabled="acting[flag.event_id]"
                  @click="keep(flag)"
                  title="Keep this booking — provider used the office, mark as reviewed"
                >
                  {{ acting[flag.event_id] === 'keep' ? '…' : 'Keep' }}
                </button>
                <button
                  class="btn btn-sm btn-release"
                  :disabled="acting[flag.event_id]"
                  @click="release(flag)"
                  title="Release this slot — provider did not use it, free for reassignment"
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
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';

const route = useRoute();
const orgSlug = computed(() => route.params.organizationSlug || null);

const flags = ref([]);
const health = ref(null);
const loading = ref(false);
const error = ref('');
const acting = ref({});
const auditResult = ref(null);
const auditing = ref(false);

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

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [flagsRes, healthRes] = await Promise.all([
      api.get('/api/office-schedule/admin/coverage-flags'),
      api.get('/api/office-schedule/admin/ehr-sync-health').catch(() => ({ data: { locations: [] } }))
    ]);
    flags.value = flagsRes.data?.flags || [];
    health.value = healthRes.data || null;
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
    // Trigger audit for each known location (we use the all-locations watchdog endpoint)
    const res = await api.post('/api/office-schedule/watchdog/run-coverage-audit');
    auditResult.value = res.data;
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || 'Audit failed.';
  } finally {
    auditing.value = false;
  }
}

async function keep(flag) {
  acting.value = { ...acting.value, [flag.event_id]: 'keep' };
  try {
    await api.post(`/api/office-schedule/admin/coverage-flags/${flag.event_id}/keep`);
    flags.value = flags.value.filter((f) => f.event_id !== flag.event_id);
  } catch (e) {
    alert(e?.response?.data?.error || 'Failed to keep slot.');
  } finally {
    const a = { ...acting.value };
    delete a[flag.event_id];
    acting.value = a;
  }
}

async function release(flag) {
  const confirm = window.confirm(
    `Release this slot for ${flag.provider_name}?\n${fmtDate(flag.start_at)} ${fmtTimeRange(flag.start_at, flag.end_at)} — ${flag.office_name} ${flag.room_label || flag.room_name}\n\nThis will set the event to RELEASED so another provider can use the room.`
  );
  if (!confirm) return;

  acting.value = { ...acting.value, [flag.event_id]: 'release' };
  try {
    await api.post(`/api/office-schedule/admin/coverage-flags/${flag.event_id}/release`);
    flags.value = flags.value.filter((f) => f.event_id !== flag.event_id);
  } catch (e) {
    alert(e?.response?.data?.error || 'Failed to release slot.');
  } finally {
    const a = { ...acting.value };
    delete a[flag.event_id];
    acting.value = a;
  }
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

onMounted(load);
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
  max-width: 600px;
}

.card {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 20px;
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

/* EHR health card */
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

/* Empty state */
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

/* Provider groups */
.provider-group {
  padding: 0;
  overflow: hidden;
}

.provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--table-header-bg, #f9fafb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.provider-name {
  font-weight: 700;
  font-size: 15px;
}

.provider-count {
  font-size: 13px;
}

/* Flags table */
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
