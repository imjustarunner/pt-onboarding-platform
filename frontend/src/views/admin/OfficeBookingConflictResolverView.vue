<template>
  <div class="container conflict-view">
    <div class="page-header">
      <div>
        <h2>Booking conflict resolver</h2>
        <p class="subtitle">
          Reviews all future office slots where two providers are booked into the same room at the same time —
          including slots restored from the scheduling gap and any new double-bookings created since.
          For each conflict, choose who keeps the room.
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;">
        <button class="btn btn-secondary" @click="runInactiveCleanup" :disabled="cleaningUp || loading"
                title="Cancel all future bookings and assignments for archived or deactivated providers">
          {{ cleaningUp ? 'Cleaning up…' : 'Clear inactive providers' }}
        </button>
        <router-link to="/admin/schedule-audit" class="btn btn-secondary">Full schedule audit</router-link>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="cleanupResult" class="cleanup-result-box">
      Inactive provider cleanup complete —
      <strong>{{ cleanupResult.eventsCancel }} future event{{ cleanupResult.eventsCancel === 1 ? '' : 's' }} cancelled</strong>,
      <strong>{{ cleanupResult.assignmentsDeactivated }} standing assignment{{ cleanupResult.assignmentsDeactivated === 1 ? '' : 's' }} deactivated</strong>.
      <button class="dismiss-btn" @click="cleanupResult = null">✕</button>
    </div>
    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-if="!loading && diagnostics" class="card diagnostic-banner">
      <div>
        <strong>Integrity diagnostics</strong>
        <div class="muted">Checks duplicate room/time events, duplicate active standing assignments, and providers booked in multiple rooms.</div>
      </div>
      <div class="diagnostic-stats">
        <span class="diag-pill" :class="{ bad: diagnostics.summary?.duplicateActiveEvents }">
          Events: {{ diagnostics.summary?.duplicateActiveEvents || 0 }}
        </span>
        <span class="diag-pill" :class="{ bad: diagnostics.summary?.duplicateActiveStandingAssignments }">
          Standing: {{ diagnostics.summary?.duplicateActiveStandingAssignments || 0 }}
        </span>
        <span class="diag-pill" :class="{ bad: diagnostics.summary?.providerDoubleBookings }">
          Providers: {{ diagnostics.summary?.providerDoubleBookings || 0 }}
        </span>
      </div>
    </div>

    <div v-if="!loading && diagnosticIssueCount > 0" class="diagnostic-details">

      <!-- Duplicate room/time events — calendar grid view -->
      <div v-if="diagnostics?.duplicateActiveEvents?.length" class="card diagnostic-section calendar-section">
        <div class="section-head">
          <div>
            <h3>Duplicate room/time events <span class="count-chip">{{ diagnostics.duplicateActiveEvents.length }} slot{{ diagnostics.duplicateActiveEvents.length === 1 ? '' : 's' }}</span></h3>
            <div class="muted">Click any colored block to see who is double-booked and rebook or cancel one of them. Blocks with a <strong>!</strong> badge mean a provider is also booked in another room at the same time.</div>
          </div>
        </div>
        <div class="calendar-body">
          <ConflictCalendarGrid
            :groups="diagnostics.duplicateActiveEvents"
            v-model:weekStart="conflictWeekStart"
            @cancel-event="cancelDuplicateEvent"
            @rebook-complete="load"
          />
        </div>
      </div>

      <!-- Duplicate active standing assignments -->
      <div v-if="diagnostics?.duplicateActiveStandingAssignments?.length" class="card conflict-table-wrap diagnostic-section">
        <div class="section-head">
          <div>
            <h3>Duplicate active standing assignments <span class="count-chip">{{ diagnostics.duplicateActiveStandingAssignments.length }} slot{{ diagnostics.duplicateActiveStandingAssignments.length === 1 ? '' : 's' }}</span></h3>
            <div class="muted">Two or more providers hold the same recurring room/day/hour. Deactivate all but one — this will also cancel their future materialized events.</div>
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Recurring slot</th>
              <th>Office · Room</th>
              <th>Provider</th>
              <th>Frequency</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(group, gi) in diagnostics.duplicateActiveStandingAssignments" :key="`dag-a-${gi}`">
              <tr v-for="(a, ai) in group.assignments" :key="`da-a-${a.id}`"
                  :class="{ 'group-last': ai === group.assignments.length - 1 && gi < diagnostics.duplicateActiveStandingAssignments.length - 1 }">
                <td v-if="ai === 0" :rowspan="group.assignments.length" class="slot-cell mono">
                  {{ weekdayLabel(group.weekday) }} · {{ hourLabel(group.hour) }}
                </td>
                <td v-if="ai === 0" :rowspan="group.assignments.length" class="slot-cell">
                  <div class="office-name">{{ group.office_name }}</div>
                  <div class="room-label muted">{{ group.room_number ? `#${group.room_number} · ` : '' }}{{ group.room_label || group.room_name }}</div>
                </td>
                <td>{{ a.provider_name || `Provider #${a.provider_id}` }}</td>
                <td class="muted">{{ a.assigned_frequency || '—' }}</td>
                <td>
                  <button class="btn btn-sm btn-cancel"
                          :disabled="actingAssignId === a.id"
                          @click="deactivateDuplicateAssignment(a.id, gi)">
                    {{ actingAssignId === a.id ? 'Deactivating…' : 'Deactivate' }}
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Provider double-bookings (same person, two rooms, same time) -->
      <div v-if="diagnostics?.providerDoubleBookings?.length" class="card conflict-table-wrap diagnostic-section">
        <div class="section-head">
          <div>
            <h3>Providers booked in multiple rooms <span class="count-chip">{{ diagnostics.providerDoubleBookings.length }}</span></h3>
            <div class="muted">One provider is booked in more than one room at the exact same time. Use the "Cancel event" rows above to remove the unwanted booking.</div>
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Provider</th>
              <th>Rooms</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in diagnostics.providerDoubleBookings" :key="`pdb-${row.provider_id}-${row.start_at}`">
              <td class="mono time-col">
                <div>{{ formatDate(row.start_at) }}</div>
                <div class="time-range">{{ formatTime(row.start_at) }}<template v-if="row.end_at"> – {{ formatTime(row.end_at) }}</template></div>
              </td>
              <td>{{ row.provider_name || `Provider #${row.provider_id}` }}</td>
              <td>{{ row.rooms }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="!loading && conflicts.length === 0 && diagnosticIssueCount === 0" class="card empty-state">
      <div class="empty-icon">✓</div>
      <div class="empty-title">No conflicts found</div>
      <div class="empty-sub">No future duplicate bookings, standing assignment duplicates, or provider double-bookings were found.</div>
    </div>

    <template v-if="!loading && conflicts.length > 0">
      <div class="conflict-count card conflict-banner">
        <strong>{{ conflicts.length }} slot{{ conflicts.length === 1 ? '' : 's' }} need your attention.</strong>
        For each one, choose which provider keeps the room — the other will be removed from that slot.
      </div>

      <!-- Legend -->
      <div class="legend card">
        <div class="legend-item">
          <span class="badge badge-restored">Restored vs booked</span>
          A provider's dropped booking was reinstated but someone else had already taken that slot.
        </div>
        <div class="legend-item">
          <span class="badge badge-orphan">Orphaned</span>
          A booking was dropped and the slot is now empty — no one else is there, but it still needs to be restored or dismissed.
        </div>
        <div class="legend-item">
          <span class="badge badge-double">Double-booked</span>
          Two providers are both fully booked into the same room at the same time.
        </div>
      </div>

      <div class="card conflict-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>When</th>
              <th>Office · Room</th>
              <th>Provider A</th>
              <th>Provider B</th>
              <th class="actions-col">Who stays?</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in conflicts"
              :key="rowKey(c)"
              :class="{ 'row-acting': actingKey === rowKey(c) }"
            >
              <td>
                <span v-if="c.conflict_type === 'double_booked'" class="badge badge-double">Double-booked</span>
                <span v-else-if="c.conflict_type === 'orphaned_released'" class="badge badge-orphan">Orphaned</span>
                <span v-else class="badge badge-restored">Restored vs booked</span>
              </td>

              <td class="mono time-col">
                <div>{{ formatDate(c.start_at) }}</div>
                <div class="time-range">{{ formatTime(c.start_at) }}<template v-if="c.end_at"> – {{ formatTime(c.end_at) }}</template></div>
              </td>

              <td>
                <div class="office-name">{{ c.office_name }}</div>
                <div class="room-label muted">
                  {{ c.room_number ? `#${c.room_number} · ` : '' }}{{ c.room_label || c.room_name }}
                </div>
              </td>

              <!-- Provider A -->
              <td>
                <template v-if="c.conflict_type === 'double_booked'">
                  <div class="provider-pill prov-a">
                    <span class="dot dot-a"></span>{{ c.provider_a_name || '—' }}
                  </div>
                  <div class="pill-sub muted">Booked</div>
                </template>
                <template v-else>
                  <div class="provider-pill prov-a">
                    <span class="dot dot-a"></span>{{ c.original_provider_name || '—' }}
                  </div>
                  <div class="pill-sub muted">Had this slot before gap</div>
                </template>
              </td>

              <!-- Provider B -->
              <td>
                <template v-if="c.conflict_type === 'double_booked'">
                  <div class="provider-pill prov-b">
                    <span class="dot dot-b"></span>{{ c.provider_b_name || '—' }}
                  </div>
                  <div class="pill-sub muted">Booked</div>
                </template>
                <template v-else-if="c.conflict_type === 'orphaned_released'">
                  <div class="pill-sub muted" style="font-style:italic;">Slot is empty</div>
                </template>
                <template v-else>
                  <div class="provider-pill prov-b">
                    <span class="dot dot-b"></span>{{ c.current_provider_name || '—' }}
                  </div>
                  <div class="pill-sub muted">Booked during gap</div>
                </template>
              </td>

              <!-- Actions -->
              <td class="actions-col">
                <div class="action-group" v-if="c.conflict_type === 'double_booked'">
                  <button class="btn btn-sm btn-a" :disabled="actingKey === rowKey(c)"
                    @click="resolveDouble(c, 'keep_a')" :title="`Keep ${c.provider_a_name}, remove ${c.provider_b_name}`">
                    Keep {{ firstName(c.provider_a_name) }}
                  </button>
                  <button class="btn btn-sm btn-b" :disabled="actingKey === rowKey(c)"
                    @click="resolveDouble(c, 'keep_b')" :title="`Keep ${c.provider_b_name}, remove ${c.provider_a_name}`">
                    Keep {{ firstName(c.provider_b_name) }}
                  </button>
                </div>
                <div class="action-group" v-else-if="c.conflict_type === 'orphaned_released'">
                  <button class="btn btn-sm btn-a" :disabled="actingKey === rowKey(c)"
                    @click="resolveOrphaned(c, 'restore')"
                    :title="`Restore all future ${c.assigned_frequency ? c.assigned_frequency.toLowerCase() : 'recurring'} slots for ${c.original_provider_name}`">
                    Restore {{ firstName(c.original_provider_name) }}
                    <span class="btn-freq">({{ c.assigned_frequency ? c.assigned_frequency.toLowerCase() : 'recurring' }})</span>
                  </button>
                  <button class="btn btn-sm btn-dismiss" :disabled="actingKey === rowKey(c)"
                    @click="resolveOrphaned(c, 'dismiss')" title="Free up this single slot only">
                    Free up slot
                  </button>
                </div>
                <div class="action-group" v-else>
                  <button class="btn btn-sm btn-a" :disabled="actingKey === rowKey(c)"
                    @click="resolveReleased(c, 'restore_original')" :title="`Restore ${c.original_provider_name}, remove ${c.current_provider_name}`">
                    Keep {{ firstName(c.original_provider_name) }}
                  </button>
                  <button class="btn btn-sm btn-b" :disabled="actingKey === rowKey(c)"
                    @click="resolveReleased(c, 'keep_current')" :title="`Keep ${c.current_provider_name}, remove ${c.original_provider_name}`">
                    Keep {{ firstName(c.current_provider_name) }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import ConflictCalendarGrid from '../../components/schedule/ConflictCalendarGrid.vue';

const loading = ref(true);
const error   = ref('');
const conflicts = ref([]);
const diagnostics = ref(null);
const actingKey = ref(null);
const actingEventId = ref(null);
const actingAssignId = ref(null);
const cleaningUp = ref(false);
const cleanupResult = ref(null);

// Week shown in the calendar grid — jump to the Monday of the earliest conflict
// whenever new diagnostics arrive.
const conflictWeekStart = ref(mondayOfToday());

function mondayOfToday() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, n) {
  const d = new Date(ymd + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// When diagnostics load, jump to the week of the first conflict.
watch(() => diagnostics.value?.duplicateActiveEvents, (groups) => {
  if (!groups?.length) return;
  const earliest = groups
    .map((g) => String(g.start_at).slice(0, 10))
    .sort()[0];
  if (earliest) {
    const d = new Date(earliest + 'T00:00:00');
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    conflictWeekStart.value = d.toISOString().slice(0, 10);
  }
}, { immediate: true });

const diagnosticIssueCount = computed(() =>
  (diagnostics.value?.duplicateActiveEvents?.length || 0)
  + (diagnostics.value?.duplicateActiveStandingAssignments?.length || 0)
  + (diagnostics.value?.providerDoubleBookings?.length || 0)
);

const rowKey = (c) =>
  c.conflict_type === 'double_booked'
    ? `db-${c.event_a_id}-${c.event_b_id}`
    : `rv-${c.released_event_id}`;

const load = async () => {
  try {
    loading.value = true;
    error.value   = '';
    const [conflictResp, diagnosticResp] = await Promise.all([
      api.get('/office-schedule/admin/slot-conflicts'),
      api.get('/office-schedule/admin/integrity-diagnostics')
    ]);
    conflicts.value = conflictResp.data?.conflicts || [];
    diagnostics.value = diagnosticResp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load conflicts';
  } finally {
    loading.value = false;
  }
};

const resolveDouble = async (c, action) => {
  const key = rowKey(c);
  try {
    actingKey.value = key;
    error.value = '';
    await api.post('/office-schedule/admin/slot-conflicts/resolve', {
      conflictType: 'double_booked',
      eventAId: c.event_a_id,
      eventBId: c.event_b_id,
      action
    });
    conflicts.value = conflicts.value.filter((x) => rowKey(x) !== key);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to resolve conflict';
  } finally {
    actingKey.value = null;
  }
};

const resolveOrphaned = async (c, action) => {
  const key = rowKey(c);
  try {
    actingKey.value = key;
    error.value = '';
    const resp = await api.post('/office-schedule/admin/slot-conflicts/resolve', {
      conflictType: 'orphaned_released',
      releasedEventId: c.released_event_id,
      action
    });
    if (action === 'restore') {
      // Bulk restore cleared the whole recurring series — remove all rows for this assignment
      const saId = resp.data?.standingAssignmentId;
      conflicts.value = saId
        ? conflicts.value.filter(
            (x) => !(x.conflict_type === 'orphaned_released' && x.standing_assignment_id === saId)
          )
        : conflicts.value.filter((x) => rowKey(x) !== key);
      // If some occurrences were skipped (another provider was already there), they now
      // appear in the conflict list as released_vs_booked. Reload to surface them.
      if (resp.data?.skippedCount > 0) {
        error.value = resp.data.skippedMessage || `${resp.data.skippedCount} occurrence(s) were skipped — another provider is already booked in those slots. They now appear below as individual conflicts to resolve.`;
        await load();
      }
    } else {
      conflicts.value = conflicts.value.filter((x) => rowKey(x) !== key);
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to resolve conflict';
  } finally {
    actingKey.value = null;
  }
};

const resolveReleased = async (c, action) => {
  const key = rowKey(c);
  try {
    actingKey.value = key;
    error.value = '';
    await api.post('/office-schedule/admin/slot-conflicts/resolve', {
      conflictType: 'released_vs_booked',
      releasedEventId: c.released_event_id,
      conflictEventId: c.conflict_event_id,
      action
    });
    conflicts.value = conflicts.value.filter((x) => rowKey(x) !== key);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to resolve conflict';
  } finally {
    actingKey.value = null;
  }
};

const runInactiveCleanup = async () => {
  try {
    cleaningUp.value = true;
    cleanupResult.value = null;
    error.value = '';
    const resp = await api.post('/office-schedule/admin/cleanup-inactive-providers');
    cleanupResult.value = resp.data;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Cleanup failed';
  } finally {
    cleaningUp.value = false;
  }
};

const cancelDuplicateEvent = async (eventId, groupIndex) => {
  try {
    actingEventId.value = eventId;
    error.value = '';
    await api.post('/office-schedule/admin/integrity-diagnostics/resolve', {
      action: 'cancelEvent',
      eventId
    });
    // Remove the cancelled event from the group; remove the group if only one remains
    const groups = diagnostics.value?.duplicateActiveEvents;
    if (groups) {
      const group = groups[groupIndex];
      if (group) {
        group.events = group.events.filter((e) => e.id !== eventId);
        if (group.events.length <= 1) {
          diagnostics.value.duplicateActiveEvents = groups.filter((_, i) => i !== groupIndex);
          diagnostics.value.summary.duplicateActiveEvents = diagnostics.value.duplicateActiveEvents.length;
        }
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to cancel event';
  } finally {
    actingEventId.value = null;
  }
};

const deactivateDuplicateAssignment = async (assignmentId, groupIndex) => {
  try {
    actingAssignId.value = assignmentId;
    error.value = '';
    await api.post('/office-schedule/admin/integrity-diagnostics/resolve', {
      action: 'deactivateAssignment',
      assignmentId
    });
    // Remove the deactivated assignment from the group; remove group if only one remains
    const groups = diagnostics.value?.duplicateActiveStandingAssignments;
    if (groups) {
      const group = groups[groupIndex];
      if (group) {
        group.assignments = group.assignments.filter((a) => a.id !== assignmentId);
        if (group.assignments.length <= 1) {
          diagnostics.value.duplicateActiveStandingAssignments = groups.filter((_, i) => i !== groupIndex);
          diagnostics.value.summary.duplicateActiveStandingAssignments = diagnostics.value.duplicateActiveStandingAssignments.length;
        }
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to deactivate assignment';
  } finally {
    actingAssignId.value = null;
  }
};

const firstName = (full) => (full || '').split(' ')[0] || full || '?';

const formatDate = (d) => {
  try { return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};
const formatTime = (d) => {
  try { return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  catch { return d; }
};
const weekdayLabel = (weekday) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(weekday)] || String(weekday);
const hourLabel = (hour) => {
  const h = Number(hour);
  if (!Number.isFinite(h)) return String(hour || '');
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
};

onMounted(load);
</script>

<style scoped>
.conflict-view { max-width: 1200px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.page-header h2 { margin: 0 0 4px; font-size: 1.4rem; }
.subtitle { margin: 0; color: var(--color-text-muted, #6b7280); font-size: 0.9rem; max-width: 680px; }

.error-box {
  background: var(--color-danger-bg, #fef2f2);
  border: 1px solid var(--color-danger, #ef4444);
  color: var(--color-danger, #ef4444);
  border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;
}
.loading { padding: 40px; text-align: center; color: var(--color-text-muted, #6b7280); }

.empty-state { text-align: center; padding: 60px 24px; }
.empty-icon { font-size: 2.5rem; margin-bottom: 12px; }
.empty-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 6px; }
.empty-sub { color: var(--color-text-muted, #6b7280); font-size: 0.9rem; }

.conflict-banner {
  background: var(--color-warning-bg, #fffbeb);
  border-left: 4px solid var(--color-warning, #f59e0b);
  padding: 14px 18px; margin-bottom: 12px;
  font-size: 0.92rem; line-height: 1.5;
}
.diagnostic-banner {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.diagnostic-stats { display: flex; flex-wrap: wrap; gap: 8px; }
.diagnostic-details { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.diagnostic-section { padding: 0; overflow-x: auto; }
.section-head {
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.section-head h3 {
  margin: 0 0 4px;
  font-size: 1rem;
}
.calendar-section { overflow: visible; }
.calendar-body { padding: 14px 18px; }
.diag-pill {
  display: inline-block;
  padding: 4px 9px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 0.8rem;
  font-weight: 700;
}
.diag-pill.bad {
  background: #fee2e2;
  color: #991b1b;
}

.legend {
  display: flex; gap: 20px; flex-wrap: wrap;
  padding: 12px 18px; margin-bottom: 12px; font-size: 0.85rem;
  color: var(--color-text-muted, #6b7280); line-height: 1.5;
}
.legend-item { display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 220px; }

.badge {
  display: inline-block; padding: 2px 8px; border-radius: 12px;
  font-size: 0.75rem; font-weight: 600; white-space: nowrap; flex-shrink: 0;
}
.badge-restored { background: #eff6ff; color: #2563eb; }
.badge-orphan   { background: #fce7f3; color: #be185d; }
.badge-double   { background: #fef3c7; color: #b45309; }

.conflict-table-wrap { overflow-x: auto; padding: 0; }
.table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
.table th, .table td { padding: 11px 13px; text-align: left; border-bottom: 1px solid var(--color-border, #e5e7eb); vertical-align: middle; }
.table th { font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted, #6b7280); white-space: nowrap; }
.table tbody tr:last-child td { border-bottom: none; }
.table tbody tr:hover { background: var(--color-hover-bg, #f9fafb); }
.row-acting { opacity: 0.45; pointer-events: none; }

.mono { font-family: var(--font-mono, monospace); }
.time-col { white-space: nowrap; }
.time-range { font-size: 0.8rem; color: var(--color-text-muted, #6b7280); margin-top: 2px; }
.office-name { font-weight: 500; }
.room-label { font-size: 0.8rem; margin-top: 2px; }
.muted { color: var(--color-text-muted, #6b7280); }

.provider-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 500; padding: 3px 8px 3px 6px;
  border-radius: 20px; font-size: 0.85rem;
}
.prov-a { background: #eff6ff; color: #1d4ed8; }
.prov-b { background: #f0fdf4; color: #15803d; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-a { background: #2563eb; }
.dot-b { background: #16a34a; }
.pill-sub { font-size: 0.76rem; margin-top: 3px; }

.actions-col { white-space: nowrap; }
.action-group { display: flex; flex-direction: column; gap: 6px; }

.btn-a {
  background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
  padding: 5px 10px; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
}
.btn-a:hover:not(:disabled) { background: #dbeafe; }
.btn-b {
  background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;
  padding: 5px 10px; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
}
.btn-b:hover:not(:disabled) { background: #dcfce7; }
.btn-dismiss {
  background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;
  padding: 5px 10px; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
}
.btn-dismiss:hover:not(:disabled) { background: #e5e7eb; }
.btn-a:disabled, .btn-b:disabled, .btn-dismiss:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-freq { font-weight: 400; font-size: 0.75rem; opacity: 0.8; }

.btn-cancel {
  background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;
  padding: 5px 10px; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
  white-space: nowrap;
}
.btn-cancel:hover:not(:disabled) { background: #fee2e2; }
.btn-cancel:disabled { opacity: 0.4; cursor: not-allowed; }

.count-chip {
  display: inline-block; padding: 1px 7px; border-radius: 999px;
  background: #f3f4f6; color: #374151; font-size: 0.75rem; font-weight: 600;
  margin-left: 6px; vertical-align: middle;
}
.slot-cell { background: #f9fafb; font-weight: 500; }
.slot-date { font-weight: 600; }
.group-last td { border-bottom: 2px solid var(--color-border, #e5e7eb) !important; }

.status-chip {
  display: inline-block; padding: 2px 7px; border-radius: 10px;
  font-size: 0.74rem; font-weight: 600; white-space: nowrap;
}
.status-booked            { background: #eff6ff; color: #1d4ed8; }
.status-assigned_available { background: #f0fdf4; color: #15803d; }
.status-available         { background: #f0fdf4; color: #15803d; }
.status-active            { background: #f3f4f6; color: #374151; }

.cleanup-result-box {
  background: #f0fdf4; border: 1px solid #86efac; color: #166534;
  border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;
  font-size: 0.9rem; display: flex; align-items: center; gap: 8px;
}
.dismiss-btn {
  margin-left: auto; background: none; border: none; cursor: pointer;
  color: #166534; font-size: 1rem; padding: 0 4px; line-height: 1;
}
</style>
