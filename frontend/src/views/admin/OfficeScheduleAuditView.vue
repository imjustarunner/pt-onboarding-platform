<template>
  <div class="audit-wrap">
    <!-- Controls (hidden when printing) -->
    <div class="controls no-print">
      <div class="controls-left">
        <h2>Schedule audit</h2>
        <p class="subtitle">
          From
          <input type="date" v-model="fromDate" @change="load" class="date-input" />
          to
          <input type="date" v-model="toDate" @change="load" class="date-input" />
          — all booked, available, and released slots. <em>Released = booking was dropped on that date.</em>
        </p>
      </div>
      <div class="controls-right">
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
        <router-link v-if="doubleBookedCount > 0" to="/admin/booking-conflict-resolver" class="btn btn-warn">
          ⚠ Resolve {{ doubleBookedCount }} double-booking{{ doubleBookedCount === 1 ? '' : 's' }}
        </router-link>
        <button class="btn btn-primary" @click="print" :disabled="loading">Print / Save PDF</button>
      </div>
    </div>

    <div v-if="error" class="error-box no-print">{{ error }}</div>
    <div v-if="loading" class="loading no-print">Loading schedule data…</div>

    <template v-if="!loading && !error">
      <!-- Print header (only visible when printing) -->
      <div class="print-header print-only">
        <h1>Office Schedule Audit</h1>
        <p>Printed: {{ printedAt }} &nbsp;·&nbsp; {{ fromDate }} → {{ toDate }}</p>
      </div>

      <!-- Summary counts (always visible) -->
      <div class="summary-bar no-print" v-if="rows.length">
        <span class="sum-item"><strong>{{ rows.length }}</strong> total slots</span>
        <span class="sum-item booked-count"><strong>{{ countByState('ASSIGNED_BOOKED') }}</strong> booked</span>
        <span class="sum-item avail-count"><strong>{{ countByState('ASSIGNED_AVAILABLE') }}</strong> available/unbooked</span>
        <span class="sum-item release-count"><strong>{{ countByStatus('RELEASED') }}</strong> released</span>
        <span class="sum-item conflict-count"><strong>{{ doubleBookedCount }}</strong> double-booked slots</span>
      </div>

      <div v-if="rows.length === 0 && !loading" class="empty no-print">
        No office events found for this window. Make sure the materializer has run (visit the schedule page first).
      </div>

      <!-- One section per office -->
      <div v-for="(locationData, locationName) in grouped" :key="locationName" class="location-section">
        <h2 class="location-heading">{{ locationName }}</h2>

        <!-- One table per room -->
        <div v-for="(roomData, roomLabel) in locationData" :key="roomLabel" class="room-section">
          <h3 class="room-heading">{{ roomLabel }}</h3>
          <table class="audit-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Time</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Booked for</th>
                <th>Frequency</th>
                <th>Last updated<br><span class="th-sub">(≈ released on)</span></th>
                <th>Plan</th>
                <th>Assign.</th>
                <th class="flag-col">Flags</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in roomData"
                :key="row.event_id"
                :class="rowClass(row)"
              >
                <td class="mono">{{ fmtDate(row.start_at) }}</td>
                <td>{{ fmtDay(row.start_at) }}</td>
                <td class="mono nowrap">{{ fmtTime(row.start_at) }}</td>
                <td>
                  <span :class="stateBadge(row)">{{ stateLabel(row) }}</span>
                </td>
                <td>{{ row.assigned_provider_name || '—' }}</td>
                <td :class="{ 'diff-provider': row.booked_provider_id && row.booked_provider_id !== row.assigned_provider_id }">
                  {{ row.booked_provider_name || '—' }}
                </td>
                <td>{{ row.assigned_frequency || '—' }}</td>
                <td class="mono small nowrap">{{ fmtDateTime(row.event_updated_at) }}</td>
                <td class="mono small">{{ row.booking_plan_id || '—' }}</td>
                <td class="mono small">{{ row.standing_assignment_id || '—' }}</td>
                <td class="flag-col">
                  <span v-if="isDoubleBooked(row)" class="flag flag-double"
                    :title="`Also booked: ${conflictingProviders(row).join(', ')}`">
                    ⚠ Double w/ {{ conflictingProviders(row).join(', ') }}
                  </span>
                  <span v-if="row.slot_state === 'ASSIGNED_AVAILABLE' && !row.booking_plan_id" class="flag flag-no-plan" title="No booking plan — slot will show as available">No plan</span>
                  <span v-if="row.slot_state === 'ASSIGNED_BOOKED' && !row.plan_active" class="flag flag-inactive-plan" title="Booking plan exists but is inactive">Plan inactive</span>
                  <span v-if="row.assigned_provider_id && row.booked_provider_id && row.booked_provider_id !== row.assigned_provider_id" class="flag flag-mismatch" title="Booked provider differs from assigned provider">Provider mismatch</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="rows.length === 0 && !loading" class="empty print-only">No events found.</div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';

const loading = ref(true);
const error   = ref('');
const rows    = ref([]);
const printedAt = ref('');

// Default: 6 months back → 12 weeks ahead
const toISO = (d) => d.toISOString().slice(0, 10);
const fromDate = ref(toISO(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)));
const toDate   = ref(toISO(new Date(Date.now() + 84  * 24 * 60 * 60 * 1000)));

const load = async () => {
  try {
    loading.value = true;
    error.value   = '';
    const resp    = await api.get('/office-schedule/admin/schedule-audit', {
      params: { fromDate: fromDate.value, toDate: toDate.value }
    });
    rows.value    = resp.data?.rows || [];
    printedAt.value = new Date().toLocaleString();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load audit data';
  } finally {
    loading.value = false;
  }
};

// Build a map of room+time → Map<providerId, providerName> for that slot.
// Only entries with 2+ DIFFERENT providers are kept (same-provider duplicates are not real conflicts).
const doubleBookedMap = computed(() => {
  const raw = {};
  for (const r of rows.value) {
    if (r.slot_state === 'ASSIGNED_BOOKED' && r.booked_provider_id) {
      const key = `${r.room_name}|${r.start_at}`;
      if (!raw[key]) raw[key] = new Map();
      raw[key].set(r.booked_provider_id, r.booked_provider_name || `#${r.booked_provider_id}`);
    }
  }
  const result = {};
  for (const [key, providerMap] of Object.entries(raw)) {
    if (providerMap.size >= 2) result[key] = providerMap;
  }
  return result;
});

const isDoubleBooked = (row) =>
  row.slot_state === 'ASSIGNED_BOOKED' &&
  row.booked_provider_id &&
  !!doubleBookedMap.value[`${row.room_name}|${row.start_at}`];

// Returns names of the OTHER provider(s) booked in the same slot
const conflictingProviders = (row) => {
  const providerMap = doubleBookedMap.value[`${row.room_name}|${row.start_at}`];
  if (!providerMap) return [];
  return [...providerMap.entries()]
    .filter(([id]) => id !== row.booked_provider_id)
    .map(([, name]) => name);
};

const doubleBookedCount = computed(() => Object.keys(doubleBookedMap.value).length);

// Group rows: location → room → sorted events
const grouped = computed(() => {
  const out = {};
  for (const r of rows.value) {
    const loc  = r.office_name || 'Unknown Office';
    const room = `${r.room_number ? `#${r.room_number} ` : ''}${r.room_label || r.room_name}`;
    if (!out[loc]) out[loc] = {};
    if (!out[loc][room]) out[loc][room] = [];
    out[loc][room].push(r);
  }
  return out;
});

const countByState  = (s) => rows.value.filter((r) => r.slot_state === s).length;
const countByStatus = (s) => rows.value.filter((r) => String(r.status || '').toUpperCase() === s).length;

const rowClass = (r) => ({
  'row-booked':   r.slot_state === 'ASSIGNED_BOOKED',
  'row-available': r.slot_state === 'ASSIGNED_AVAILABLE' && !r.booking_plan_id,
  'row-released': String(r.status || '').toUpperCase() === 'RELEASED',
  'row-double':   isDoubleBooked(r),
});

const stateLabel = (r) => {
  const st = String(r.status || '').toUpperCase();
  if (st === 'RELEASED') return 'Released';
  if (r.slot_state === 'ASSIGNED_BOOKED') return 'Booked';
  if (r.slot_state === 'ASSIGNED_AVAILABLE') return r.booking_plan_id ? 'Available (has plan)' : 'Available';
  return r.slot_state || r.status || '—';
};

const stateBadge = (r) => {
  const st = String(r.status || '').toUpperCase();
  if (st === 'RELEASED') return 'badge badge-released';
  if (r.slot_state === 'ASSIGNED_BOOKED') return 'badge badge-booked';
  return 'badge badge-available';
};

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const fmtDate     = (d) => { try { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}/${dt.getFullYear()}`; } catch { return d; } };
const fmtDay      = (d) => { try { return DAYS[new Date(d).getDay()]; } catch { return ''; } };
const fmtTime     = (d) => { try { return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch { return d; } };
const fmtDateTime = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return `${dt.getMonth()+1}/${dt.getDate()}/${dt.getFullYear()} ${dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  } catch { return d; }
};

const print = () => {
  printedAt.value = new Date().toLocaleString();
  setTimeout(() => window.print(), 100);
};

onMounted(load);
</script>

<style scoped>
.audit-wrap { max-width: 1300px; padding-bottom: 60px; }

/* ── Controls ── */
.controls {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; margin-bottom: 20px; flex-wrap: wrap;
}
.controls-left h2 { margin: 0 0 4px; font-size: 1.4rem; }
.subtitle { margin: 0; color: var(--color-text-muted, #6b7280); font-size: 0.9rem; }
.date-input { font-size: 0.88rem; padding: 2px 6px; border-radius: 4px; border: 1px solid #d1d5db; }
.btn-warn {
  display: inline-flex; align-items: center; gap: 4px;
  background: #fef3c7; color: #92400e; border: 1px solid #fbbf24;
  padding: 6px 14px; border-radius: 6px; font-size: 0.88rem; font-weight: 600;
  text-decoration: none; cursor: pointer; white-space: nowrap;
}
.btn-warn:hover { background: #fde68a; }
.th-sub { font-size: 0.7rem; font-weight: 400; text-transform: none; letter-spacing: 0; }
.controls-right { display: flex; gap: 8px; flex-shrink: 0; }

.error-box {
  background: #fef2f2; border: 1px solid #ef4444; color: #b91c1c;
  border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;
}
.loading { padding: 40px; text-align: center; color: #6b7280; }
.empty { padding: 30px; text-align: center; color: #6b7280; font-size: 0.9rem; }

/* ── Summary bar ── */
.summary-bar {
  display: flex; gap: 20px; flex-wrap: wrap;
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 10px 16px; margin-bottom: 20px; font-size: 0.88rem;
}
.sum-item { white-space: nowrap; }
.booked-count strong { color: #16a34a; }
.avail-count strong  { color: #2563eb; }
.release-count strong { color: #d97706; }
.conflict-count strong { color: #dc2626; }

/* ── Location / Room headings ── */
.location-section { margin-bottom: 40px; }
.location-heading {
  font-size: 1.15rem; font-weight: 700; margin: 0 0 12px;
  padding: 8px 12px; background: #1e3a5f; color: #fff; border-radius: 6px;
}
.room-section { margin-bottom: 24px; }
.room-heading {
  font-size: 0.95rem; font-weight: 600; margin: 0 0 6px;
  padding: 5px 10px; background: #e0e7ef; color: #1e3a5f; border-radius: 4px;
}

/* ── Table ── */
.audit-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 4px; }
.audit-table th, .audit-table td {
  padding: 6px 8px; text-align: left;
  border: 1px solid #e5e7eb; vertical-align: middle;
}
.audit-table th { background: #f3f4f6; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: #6b7280; }
.audit-table tbody tr:hover { background: #f9fafb; }

.row-booked   { }
.row-available td:first-child { border-left: 3px solid #2563eb; }
.row-released td:first-child { border-left: 3px solid #d97706; }
.row-double   { background: #fff7ed !important; }

.diff-provider { color: #b45309; font-weight: 600; }
.mono { font-family: monospace; }
.nowrap { white-space: nowrap; }
.small { font-size: 0.75rem; color: #6b7280; }
.flag-col { white-space: nowrap; min-width: 80px; }

/* ── Status badges ── */
.badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
.badge-booked    { background: #dcfce7; color: #15803d; }
.badge-available { background: #dbeafe; color: #1d4ed8; }
.badge-released  { background: #fef3c7; color: #b45309; }

/* ── Flags ── */
.flag { display: inline-block; margin: 1px 2px; padding: 1px 6px; border-radius: 10px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
.flag-double       { background: #fee2e2; color: #dc2626; }
.flag-no-plan      { background: #fef3c7; color: #92400e; }
.flag-inactive-plan { background: #f3e8ff; color: #7c3aed; }
.flag-mismatch     { background: #ffedd5; color: #c2410c; }
</style>

<!-- Print styles: global (not scoped) so they affect the whole page -->
<style>
@media print {
  /* Hide everything except the audit content */
  nav, header, aside, footer,
  .no-print { display: none !important; }

  .print-only { display: block !important; }

  .print-header { margin-bottom: 16px; }
  .print-header h1 { font-size: 1.2rem; margin: 0 0 4px; }
  .print-header p  { font-size: 0.8rem; color: #666; margin: 0; }

  .audit-wrap { max-width: 100% !important; padding: 0 !important; }

  .location-heading { background: #1e3a5f !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .room-heading { background: #e0e7ef !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .audit-table th { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .row-double { background: #fff7ed !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .audit-table { font-size: 0.72rem; page-break-inside: auto; }
  .audit-table tr { page-break-inside: avoid; }
  .room-section { page-break-inside: avoid; }
}

.print-only { display: none; }
</style>
