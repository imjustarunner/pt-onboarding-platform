<template>
  <div class="ccg-wrap">
    <!-- Week navigation -->
    <div class="ccg-nav">
      <button class="ccg-nav-btn" @click="shiftWeek(-1)" title="Previous week">&#8592;</button>
      <div class="ccg-week-label">
        {{ weekRangeLabel }}
        <span v-if="visibleGroups.length" class="ccg-week-count">
          {{ visibleGroups.length }} conflict{{ visibleGroups.length === 1 ? '' : 's' }}
        </span>
        <span v-else-if="props.groups.length" class="ccg-week-count">
          ({{ props.groups.length }} total — use arrows to navigate)
        </span>
      </div>
      <button class="ccg-nav-btn" @click="shiftWeek(1)" title="Next week">&#8594;</button>
      <button class="ccg-nav-btn ccg-today-btn" @click="goToToday">Today</button>
    </div>

    <!-- Empty state for this week -->
    <div v-if="!visibleGroups.length" class="ccg-empty">
      No conflicts this week.
    </div>

    <!-- Grid + detail panel side-by-side -->
    <div v-else class="ccg-layout">
      <!-- Calendar grid -->
      <div class="ccg-grid-scroll">
        <div class="ccg-grid">
          <!-- Corner -->
          <div class="ccg-corner"></div>

          <!-- Day headers -->
          <div
            v-for="(day, di) in weekDays"
            :key="`hdr-${di}`"
            class="ccg-day-hdr"
            :class="{ 'ccg-col-today': day.ymd === todayYmd }"
          >
            <div class="ccg-day-name">{{ day.name }}</div>
            <div class="ccg-day-date">{{ day.label }}</div>
          </div>

          <!-- Hour rows -->
          <template v-for="h in hours" :key="`row-${h}`">
            <div class="ccg-hour-label">{{ hourLabel(h) }}</div>
            <div
              v-for="(day, di) in weekDays"
              :key="`cell-${h}-${di}`"
              class="ccg-cell"
              :class="{ 'ccg-col-today': day.ymd === todayYmd }"
            >
              <button
                v-for="entry in cellConflicts(day.ymd, h)"
                :key="blockKey(entry.group)"
                class="ccg-block"
                :class="{ 'ccg-block-active': activeKey === blockKey(entry.group) }"
                :style="blockStyle(entry.colorIndex)"
                @click="toggleBlock(entry)"
                :title="`Click to see details — ${entry.group.office_name} ${entry.group.room_label || entry.group.room_name}`"
              >
                <div class="ccg-block-room">
                  {{ entry.group.room_number ? `#${entry.group.room_number}` : '' }}
                  {{ entry.group.room_label || entry.group.room_name }}
                </div>
                <div class="ccg-block-avatars">
                  <span
                    v-for="ev in entry.group.events"
                    :key="ev.id"
                    class="ccg-avatar"
                    :style="{ background: PALETTE[entry.colorIndex].dot }"
                    :title="ev.provider_name"
                  >{{ initials(ev.provider_name) }}</span>
                </div>
                <div v-if="entry.group.events.some(e => e.has_other_booking)" class="ccg-block-warn" title="A provider here is also booked elsewhere at this time">!</div>
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- Detail panel (appears when a block is selected) -->
      <div v-if="activeEntry" class="ccg-detail" :style="{ borderTopColor: PALETTE[activeEntry.colorIndex].border }">
        <div class="ccg-detail-header">
          <div class="ccg-detail-where">
            <strong>{{ activeEntry.group.office_name }}</strong>
            <span class="ccg-detail-room">
              {{ activeEntry.group.room_number ? `#${activeEntry.group.room_number} · ` : '' }}{{ activeEntry.group.room_label || activeEntry.group.room_name }}
            </span>
          </div>
          <div class="ccg-detail-when">
            {{ formatDate(activeEntry.group.start_at) }}
            &nbsp;·&nbsp;
            {{ formatTime(activeEntry.group.start_at) }} – {{ formatTime(activeEntry.group.end_at) }}
          </div>
          <button class="ccg-detail-close" @click="activeEntry = null" title="Close">✕</button>
        </div>

        <div class="ccg-detail-events">
          <div
            v-for="ev in activeEntry.group.events"
            :key="ev.id"
            class="ccg-detail-ev"
          >
            <div class="ccg-detail-ev-top">
              <span class="ccg-avatar ccg-avatar-lg" :style="{ background: PALETTE[activeEntry.colorIndex].dot }">
                {{ initials(ev.provider_name) }}
              </span>
              <div class="ccg-detail-ev-info">
                <div class="ccg-detail-ev-name">{{ ev.provider_name || 'Unassigned' }}</div>
                <div class="ccg-detail-ev-meta">
                  <span :class="`ccg-status ccg-status-${(ev.status||'active').toLowerCase()}`">{{ ev.status || 'Active' }}</span>
                  <span v-if="ev.has_other_booking" class="ccg-warn-badge">&#9888; Also booked in another room</span>
                </div>
              </div>
              <div class="ccg-detail-ev-actions">
                <button
                  class="ccg-btn ccg-btn-rebook"
                  :disabled="acting === ev.id"
                  @click="openRebook(ev)"
                >Rebook</button>
                <button
                  class="ccg-btn ccg-btn-cancel"
                  :disabled="acting === ev.id"
                  @click="cancelEvent(ev.id)"
                >{{ acting === ev.id ? '…' : 'Cancel' }}</button>
              </div>
            </div>

            <!-- Rebook room picker -->
            <div v-if="rebookEventId === ev.id" class="ccg-rebook-panel">
              <div class="ccg-rebook-title">Move {{ (ev.provider_name || '').split(' ')[0] || 'provider' }} to another room at this time</div>
              <div v-if="loadingRooms" class="ccg-rebook-loading">Loading available rooms…</div>
              <div v-else-if="roomError" class="ccg-rebook-err">{{ roomError }}</div>
              <div v-else-if="!availableRooms.length" class="ccg-rebook-empty">No other rooms are open at this time.</div>
              <div v-else class="ccg-rebook-rooms">
                <button
                  v-for="room in availableRooms"
                  :key="room.id"
                  class="ccg-room-btn"
                  :disabled="movingToRoom === room.id"
                  @click="confirmRebook(ev.id, room.id)"
                >
                  <span class="ccg-room-num">{{ room.room_number ? `#${room.room_number}` : '—' }}</span>
                  <span class="ccg-room-name">{{ room.label || room.name }}</span>
                  <span class="ccg-room-move">{{ movingToRoom === room.id ? 'Moving…' : 'Move here →' }}</span>
                </button>
              </div>
              <button class="ccg-rebook-dismiss" @click="rebookEventId = null">Close</button>
            </div>
          </div>
        </div>

        <div v-if="actionError" class="ccg-detail-error">{{ actionError }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  groups: { type: Array, default: () => [] },
  weekStart: { type: String, required: true }  // YYYY-MM-DD (Monday)
});

const emit = defineEmits(['cancel-event', 'rebook-complete', 'update:weekStart']);

// ── Color palette (6 rotating hues) ──────────────────────────────────────────
const PALETTE = [
  { bg: '#eff6ff', border: '#3b82f6', dot: '#2563eb' }, // blue
  { bg: '#fff7ed', border: '#f97316', dot: '#ea580c' }, // orange
  { bg: '#f5f3ff', border: '#8b5cf6', dot: '#7c3aed' }, // purple
  { bg: '#fdf2f8', border: '#ec4899', dot: '#db2777' }, // pink
  { bg: '#f0fdfa', border: '#14b8a6', dot: '#0d9488' }, // teal
  { bg: '#fffbeb', border: '#f59e0b', dot: '#d97706' }, // amber
];

// ── Hours shown in grid ───────────────────────────────────────────────────────
const HOUR_START = 7;
const HOUR_END = 21;
const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

// ── Reactive state ────────────────────────────────────────────────────────────
const activeEntry  = ref(null);   // { group, colorIndex, globalIndex }
const activeKey    = computed(() => activeEntry.value ? blockKey(activeEntry.value.group) : null);
const acting       = ref(null);   // eventId currently being acted on
const actionError  = ref('');
const rebookEventId = ref(null);  // which event has rebook panel open
const availableRooms = ref([]);
const loadingRooms = ref(false);
const roomError    = ref('');
const movingToRoom = ref(null);

// ── Date/time helpers ─────────────────────────────────────────────────────────
const todayYmd = new Date().toISOString().slice(0, 10);

function mondayOf(ymd) {
  const d = new Date(ymd + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// MySQL DATETIME "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DD"
const ymdOf  = (dt) => String(dt).slice(0, 10);
// MySQL DATETIME → hour integer
const hourOf = (dt) => {
  const s = String(dt);
  return s.includes(' ') ? parseInt(s.split(' ')[1], 10) : parseInt(s.slice(11, 13), 10);
};

// ── Week computation ──────────────────────────────────────────────────────────
const weekEndYmd = computed(() => addDays(props.weekStart, 6));

const weekDays = computed(() => {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return names.map((name, i) => {
    const ymd = addDays(props.weekStart, i);
    const d = new Date(ymd + 'T00:00:00');
    return { ymd, name, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
  });
});

const weekRangeLabel = computed(() => {
  const s = new Date(props.weekStart + 'T00:00:00');
  const e = new Date(weekEndYmd.value + 'T00:00:00');
  return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
});

// ── Groups visible in current week (stable color index from global position) ──
const visibleGroups = computed(() =>
  props.groups
    .map((group, globalIndex) => ({ group, globalIndex, colorIndex: globalIndex % PALETTE.length }))
    .filter(({ group }) => {
      const ymd = ymdOf(group.start_at);
      return ymd >= props.weekStart && ymd <= weekEndYmd.value;
    })
);

function cellConflicts(dayYmd, hour) {
  return visibleGroups.value.filter(
    ({ group }) => ymdOf(group.start_at) === dayYmd && hourOf(group.start_at) === hour
  );
}

const blockKey = (group) => `${group.room_id}|${group.start_at}`;

const blockStyle = (ci) => ({
  background: PALETTE[ci].bg,
  borderLeftColor: PALETTE[ci].border,
});

// ── Week navigation ───────────────────────────────────────────────────────────
function shiftWeek(delta) {
  emit('update:weekStart', addDays(props.weekStart, delta * 7));
}
function goToToday() {
  emit('update:weekStart', mondayOf(todayYmd));
}

// ── Toggle active block ───────────────────────────────────────────────────────
function toggleBlock(entry) {
  if (activeKey.value === blockKey(entry.group)) {
    activeEntry.value = null;
  } else {
    activeEntry.value = entry;
    rebookEventId.value = null;
    actionError.value = '';
  }
}

// Close panel when week changes or groups update
watch([() => props.weekStart, () => props.groups], () => {
  activeEntry.value = null;
  rebookEventId.value = null;
});

// ── Formatting ────────────────────────────────────────────────────────────────
function hourLabel(h) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}
function formatDate(dt) {
  try { return new Date(String(dt).replace(' ', 'T')).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return dt; }
}
function formatTime(dt) {
  try { return new Date(String(dt).replace(' ', 'T')).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  catch { return dt; }
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)).toUpperCase();
}

// ── Cancel action ─────────────────────────────────────────────────────────────
async function cancelEvent(eventId) {
  try {
    acting.value = eventId;
    actionError.value = '';
    await api.post('/office-schedule/admin/integrity-diagnostics/resolve', { action: 'cancelEvent', eventId });
    emit('cancel-event', eventId, activeEntry.value?.globalIndex);
    // If only one event remains the parent will remove the group and activeEntry will reset via watch
  } catch (e) {
    actionError.value = e.response?.data?.error?.message || 'Failed to cancel event';
  } finally {
    acting.value = null;
  }
}

// ── Rebook actions ────────────────────────────────────────────────────────────
async function openRebook(ev) {
  if (rebookEventId.value === ev.id) { rebookEventId.value = null; return; }
  rebookEventId.value = ev.id;
  availableRooms.value = [];
  roomError.value = '';
  loadingRooms.value = true;
  const group = activeEntry.value?.group;
  try {
    const resp = await api.get('/office-schedule/admin/available-rooms-for-slot', {
      params: {
        locationId: group.office_location_id,
        startAt: group.start_at,
        endAt: group.end_at,
        excludeRoomId: group.room_id
      }
    });
    availableRooms.value = resp.data?.rooms || [];
  } catch (e) {
    roomError.value = 'Could not load available rooms';
  } finally {
    loadingRooms.value = false;
  }
}

async function confirmRebook(eventId, newRoomId) {
  try {
    movingToRoom.value = newRoomId;
    actionError.value = '';
    await api.post('/office-schedule/admin/rebook-event', { eventId, newRoomId });
    rebookEventId.value = null;
    activeEntry.value = null;
    emit('rebook-complete');
  } catch (e) {
    actionError.value = e.response?.data?.error?.message || 'Failed to rebook';
  } finally {
    movingToRoom.value = null;
  }
}
</script>

<style scoped>
/* ── Outer wrapper ──────────────────────────────────────────────────────────── */
.ccg-wrap { display: flex; flex-direction: column; gap: 10px; }

/* ── Navigation ─────────────────────────────────────────────────────────────── */
.ccg-nav { display: flex; align-items: center; gap: 8px; }
.ccg-week-label { flex: 1; font-weight: 600; font-size: 0.9rem; }
.ccg-week-count { font-weight: 400; font-size: 0.8rem; color: var(--color-text-muted, #6b7280); margin-left: 6px; }
.ccg-nav-btn {
  background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 0.85rem; line-height: 1;
}
.ccg-nav-btn:hover { background: var(--color-hover-bg, #f3f4f6); }
.ccg-today-btn { font-size: 0.78rem; }

/* ── Empty ──────────────────────────────────────────────────────────────────── */
.ccg-empty {
  text-align: center; padding: 28px 16px;
  color: var(--color-text-muted, #6b7280); font-size: 0.88rem;
  border: 1px dashed var(--color-border, #e5e7eb); border-radius: 8px;
}

/* ── Grid + detail side by side ─────────────────────────────────────────────── */
.ccg-layout { display: flex; gap: 12px; align-items: flex-start; }
.ccg-grid-scroll { flex: 1; overflow-x: auto; min-width: 0; }

/* ── Grid ───────────────────────────────────────────────────────────────────── */
.ccg-grid {
  display: grid;
  grid-template-columns: 52px repeat(7, minmax(80px, 1fr));
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
  font-size: 0.76rem;
  min-width: 580px;
}

.ccg-corner {
  grid-column: 1; grid-row: 1;
  background: var(--color-surface-alt, #f9fafb);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  border-right: 1px solid var(--color-border, #e5e7eb);
}

.ccg-day-hdr {
  grid-row: 1; text-align: center; padding: 7px 4px;
  background: var(--color-surface-alt, #f9fafb);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  border-right: 1px solid var(--color-border, #e5e7eb);
  user-select: none;
}
.ccg-day-hdr:last-child { border-right: none; }
.ccg-day-name { font-weight: 700; }
.ccg-day-date { color: var(--color-text-muted, #6b7280); font-size: 0.7rem; margin-top: 1px; }
.ccg-col-today { background: var(--color-primary-bg, #eff6ff) !important; }

.ccg-hour-label {
  grid-column: 1; text-align: right; padding: 0 6px;
  color: var(--color-text-muted, #6b7280); font-size: 0.68rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  border-right: 1px solid var(--color-border, #e5e7eb);
  display: flex; align-items: center; justify-content: flex-end;
  min-height: 2.8rem;
}

.ccg-cell {
  min-height: 2.8rem; padding: 2px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  border-right: 1px solid var(--color-border, #e5e7eb);
  display: flex; flex-direction: column; gap: 2px;
}
/* remove bottom border on last row, right border on last column */
.ccg-cell:nth-last-child(-n+7) { border-bottom: none; }
.ccg-cell:last-child            { border-right: none; }

/* ── Conflict block (button) ────────────────────────────────────────────────── */
.ccg-block {
  display: block; width: 100%;
  border-left: 3px solid transparent; border-top: none; border-right: none; border-bottom: none;
  border-radius: 4px; padding: 3px 4px;
  cursor: pointer; text-align: left; position: relative;
  transition: filter 0.1s;
}
.ccg-block:hover  { filter: brightness(0.93); }
.ccg-block-active { outline: 2px solid currentColor; outline-offset: 1px; filter: brightness(0.88); }

.ccg-block-room {
  font-size: 0.68rem; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--color-text, #111827);
}
.ccg-block-avatars { display: flex; gap: 2px; flex-wrap: wrap; margin-top: 2px; }
.ccg-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  font-size: 0.55rem; font-weight: 700; color: #fff; flex-shrink: 0;
}
.ccg-avatar-lg { width: 34px; height: 34px; font-size: 0.75rem; flex-shrink: 0; }

/* Warning dot on block */
.ccg-block-warn {
  position: absolute; top: 2px; right: 3px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #f59e0b; color: #fff;
  font-size: 0.65rem; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
}

/* ── Detail panel ───────────────────────────────────────────────────────────── */
.ccg-detail {
  width: 310px; flex-shrink: 0;
  border: 1px solid var(--color-border, #e5e7eb);
  border-top: 3px solid #3b82f6;
  border-radius: 8px; overflow: hidden;
  background: var(--color-surface, #fff);
  box-shadow: 0 4px 16px rgba(0,0,0,.08);
}

.ccg-detail-header {
  padding: 12px 14px 10px;
  background: var(--color-surface-alt, #f9fafb);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  position: relative;
}
.ccg-detail-where { font-size: 0.88rem; font-weight: 700; margin-bottom: 2px; }
.ccg-detail-room { display: block; font-size: 0.8rem; font-weight: 400; color: var(--color-text-muted, #6b7280); }
.ccg-detail-when { font-size: 0.78rem; color: var(--color-text-muted, #6b7280); margin-top: 3px; }
.ccg-detail-close {
  position: absolute; top: 10px; right: 10px;
  background: none; border: none; cursor: pointer;
  font-size: 0.85rem; color: var(--color-text-muted, #6b7280); padding: 2px 5px;
}
.ccg-detail-close:hover { color: var(--color-text, #111827); }

.ccg-detail-events { padding: 10px 14px; display: flex; flex-direction: column; gap: 12px; }

.ccg-detail-ev { display: flex; flex-direction: column; gap: 8px; }
.ccg-detail-ev-top { display: flex; align-items: flex-start; gap: 10px; }
.ccg-detail-ev-info { flex: 1; min-width: 0; }
.ccg-detail-ev-name { font-weight: 600; font-size: 0.88rem; }
.ccg-detail-ev-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 3px; }

.ccg-status { font-size: 0.7rem; font-weight: 600; padding: 1px 6px; border-radius: 8px; }
.ccg-status-booked             { background: #eff6ff; color: #1d4ed8; }
.ccg-status-assigned_available { background: #f0fdf4; color: #15803d; }
.ccg-status-available          { background: #f0fdf4; color: #15803d; }
.ccg-status-active             { background: #f3f4f6; color: #374151; }

.ccg-warn-badge {
  font-size: 0.7rem; color: #b45309; background: #fffbeb;
  padding: 1px 6px; border-radius: 8px; font-weight: 600;
}

.ccg-detail-ev-actions { display: flex; gap: 5px; flex-direction: column; }

/* ── Buttons ────────────────────────────────────────────────────────────────── */
.ccg-btn {
  padding: 4px 9px; border-radius: 6px; font-size: 0.76rem;
  font-weight: 600; cursor: pointer; border: 1px solid transparent;
  white-space: nowrap;
}
.ccg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ccg-btn-rebook { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.ccg-btn-rebook:hover:not(:disabled) { background: #dbeafe; }
.ccg-btn-cancel { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
.ccg-btn-cancel:hover:not(:disabled) { background: #fee2e2; }

/* ── Rebook panel ───────────────────────────────────────────────────────────── */
.ccg-rebook-panel {
  background: var(--color-surface-alt, #f9fafb);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px; padding: 10px 12px;
}
.ccg-rebook-title { font-size: 0.8rem; font-weight: 700; margin-bottom: 8px; }
.ccg-rebook-loading, .ccg-rebook-empty, .ccg-rebook-err {
  font-size: 0.78rem; color: var(--color-text-muted, #6b7280); padding: 4px 0;
}
.ccg-rebook-err { color: #b91c1c; }
.ccg-rebook-rooms { display: flex; flex-direction: column; gap: 5px; }

.ccg-room-btn {
  display: flex; align-items: center; gap: 8px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 7px; padding: 6px 10px; cursor: pointer; text-align: left;
  font-size: 0.8rem; width: 100%;
}
.ccg-room-btn:hover:not(:disabled) { background: #eff6ff; border-color: #93c5fd; }
.ccg-room-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ccg-room-num { font-weight: 700; min-width: 26px; color: var(--color-text-muted, #6b7280); font-size: 0.75rem; }
.ccg-room-name { flex: 1; font-weight: 500; }
.ccg-room-move { font-size: 0.72rem; color: #2563eb; font-weight: 600; white-space: nowrap; }

.ccg-rebook-dismiss {
  margin-top: 7px; background: none; border: none; cursor: pointer;
  font-size: 0.75rem; color: var(--color-text-muted, #6b7280); text-decoration: underline; padding: 0;
}

/* ── Error ──────────────────────────────────────────────────────────────────── */
.ccg-detail-error {
  margin: 0 14px 12px;
  background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
  border-radius: 7px; padding: 7px 10px; font-size: 0.8rem;
}
</style>
