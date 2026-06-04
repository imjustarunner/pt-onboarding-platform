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
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <router-link to="/admin/schedule-audit" class="btn btn-secondary">Full schedule audit</router-link>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else-if="conflicts.length === 0" class="card empty-state">
      <div class="empty-icon">✓</div>
      <div class="empty-title">No conflicts found</div>
      <div class="empty-sub">No future slots have two providers booked into the same room. You're all set.</div>
    </div>

    <template v-else>
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
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const loading = ref(true);
const error   = ref('');
const conflicts = ref([]);
const actingKey = ref(null);

const rowKey = (c) =>
  c.conflict_type === 'double_booked'
    ? `db-${c.event_a_id}-${c.event_b_id}`
    : `rv-${c.released_event_id}`;

const load = async () => {
  try {
    loading.value = true;
    error.value   = '';
    const resp    = await api.get('/office-schedule/admin/slot-conflicts');
    conflicts.value = resp.data?.conflicts || [];
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

const firstName = (full) => (full || '').split(' ')[0] || full || '?';

const formatDate = (d) => {
  try { return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};
const formatTime = (d) => {
  try { return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  catch { return d; }
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
</style>
