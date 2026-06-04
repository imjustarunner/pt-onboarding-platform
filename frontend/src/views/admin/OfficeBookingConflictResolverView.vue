<template>
  <div class="container conflict-view">
    <div class="page-header">
      <div>
        <h2>Booking conflict resolver</h2>
        <p class="subtitle">
          These office slots were skipped during the automatic booking reinstatement because another
          provider had been scheduled into the same room and time. Decide who should stay in each slot.
        </p>
      </div>
      <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else-if="conflicts.length === 0" class="card empty-state">
      <div class="empty-icon">✓</div>
      <div class="empty-title">No conflicts to resolve</div>
      <div class="empty-sub">All office bookings have been reinstated successfully. You're all set.</div>
    </div>

    <template v-else>
      <div class="conflict-count card conflict-banner">
        <strong>{{ conflicts.length }} slot{{ conflicts.length === 1 ? '' : 's' }} need your attention.</strong>
        For each one, choose which provider should keep the room. The other will be removed from that slot.
      </div>

      <div class="card conflict-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Office · Room</th>
              <th>Original provider<br><span class="th-sub">(booking was dropped)</span></th>
              <th>Currently in slot<br><span class="th-sub">(booked while slot was open)</span></th>
              <th class="actions-col">Who stays?</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in conflicts" :key="c.released_event_id" :class="{ 'row-acting': actingId === c.released_event_id }">
              <td class="mono time-col">
                <div>{{ formatDate(c.start_at) }}</div>
                <div class="time-range">{{ formatTime(c.start_at) }} – {{ formatTime(c.end_at) }}</div>
              </td>
              <td>
                <div class="office-name">{{ c.office_name }}</div>
                <div class="room-label muted">{{ c.room_label || c.room_name }}</div>
              </td>
              <td>
                <div class="provider-pill original">
                  <span class="dot original-dot"></span>
                  {{ c.original_provider_name || '—' }}
                </div>
                <div class="pill-sub muted">Standing assignment</div>
              </td>
              <td>
                <div class="provider-pill current">
                  <span class="dot current-dot"></span>
                  {{ c.current_provider_name || '—' }}
                </div>
                <div class="pill-sub muted">{{ formatSlotState(c.current_slot_state) }}</div>
              </td>
              <td class="actions-col">
                <div class="action-group">
                  <button
                    class="btn btn-primary btn-sm"
                    :disabled="actingId === c.released_event_id"
                    @click="resolve(c, 'restore_original')"
                    title="Put the original provider back and remove the current one from this slot"
                  >
                    Restore original
                  </button>
                  <button
                    class="btn btn-secondary btn-sm"
                    :disabled="actingId === c.released_event_id"
                    @click="resolve(c, 'keep_current')"
                    title="Keep the current provider and cancel the original provider's slot"
                  >
                    Keep current
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
const error = ref('');
const conflicts = ref([]);
const actingId = ref(null);

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/office-schedule/admin/slot-conflicts');
    conflicts.value = resp.data?.conflicts || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load conflicts';
  } finally {
    loading.value = false;
  }
};

const resolve = async (conflict, action) => {
  try {
    actingId.value = conflict.released_event_id;
    error.value = '';
    await api.post('/office-schedule/admin/slot-conflicts/resolve', {
      releasedEventId: conflict.released_event_id,
      conflictEventId: conflict.conflict_event_id,
      action
    });
    conflicts.value = conflicts.value.filter(
      (c) => c.released_event_id !== conflict.released_event_id
    );
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to resolve conflict';
  } finally {
    actingId.value = null;
  }
};

const formatDate = (d) => {
  try {
    return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch { return d; }
};

const formatSlotState = (s) => {
  if (!s) return '';
  if (s === 'ASSIGNED_BOOKED') return 'Booked';
  if (s === 'ASSIGNED_AVAILABLE') return 'Available';
  return String(s).toLowerCase().replace(/_/g, ' ');
};

onMounted(load);
</script>

<style scoped>
.conflict-view { max-width: 1100px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.page-header h2 { margin: 0 0 4px; font-size: 1.4rem; }
.subtitle { margin: 0; color: var(--color-text-muted, #6b7280); font-size: 0.9rem; }

.error-box {
  background: var(--color-danger-bg, #fef2f2);
  border: 1px solid var(--color-danger, #ef4444);
  color: var(--color-danger, #ef4444);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.loading { padding: 40px; text-align: center; color: var(--color-text-muted, #6b7280); }

.empty-state {
  text-align: center;
  padding: 60px 24px;
}
.empty-icon { font-size: 2.5rem; margin-bottom: 12px; }
.empty-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 6px; }
.empty-sub { color: var(--color-text-muted, #6b7280); font-size: 0.9rem; }

.conflict-banner {
  background: var(--color-warning-bg, #fffbeb);
  border-left: 4px solid var(--color-warning, #f59e0b);
  padding: 14px 18px;
  margin-bottom: 12px;
  font-size: 0.92rem;
  line-height: 1.5;
}

.conflict-table-wrap { overflow-x: auto; padding: 0; }
.table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.table th, .table td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--color-border, #e5e7eb); vertical-align: middle; }
.table th { font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted, #6b7280); white-space: nowrap; }
.th-sub { font-size: 0.72rem; font-weight: 400; text-transform: none; letter-spacing: 0; display: block; margin-top: 2px; }
.table tbody tr:last-child td { border-bottom: none; }
.table tbody tr:hover { background: var(--color-hover-bg, #f9fafb); }
.row-acting { opacity: 0.5; pointer-events: none; }

.mono { font-family: var(--font-mono, monospace); }
.time-col { white-space: nowrap; }
.time-range { font-size: 0.82rem; color: var(--color-text-muted, #6b7280); margin-top: 2px; }

.office-name { font-weight: 500; }
.room-label { font-size: 0.82rem; margin-top: 2px; }
.muted { color: var(--color-text-muted, #6b7280); }

.provider-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  padding: 3px 8px 3px 6px;
  border-radius: 20px;
  font-size: 0.86rem;
}
.provider-pill.original { background: var(--color-primary-light, #eff6ff); color: var(--color-primary, #2563eb); }
.provider-pill.current  { background: var(--color-success-light, #f0fdf4); color: var(--color-success, #16a34a); }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.original-dot { background: var(--color-primary, #2563eb); }
.current-dot  { background: var(--color-success, #16a34a); }
.pill-sub { font-size: 0.78rem; margin-top: 3px; }

.actions-col { white-space: nowrap; }
.action-group { display: flex; flex-direction: column; gap: 6px; }
</style>
