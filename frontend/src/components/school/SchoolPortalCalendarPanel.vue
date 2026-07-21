<template>
  <div class="spc" data-tour="school-portal-calendar">
    <div class="spc-header">
      <div>
        <h2>School calendar</h2>
        <p class="muted">Holidays, days off, and parent events for this school.</p>
      </div>
      <div class="spc-actions">
        <div class="view-toggle">
          <button type="button" :class="{ active: view === 'month' }" @click="view = 'month'">Month</button>
          <button type="button" :class="{ active: view === 'week' }" @click="view = 'week'">Week</button>
          <button type="button" :class="{ active: view === 'list' }" @click="view = 'list'">List</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="shift(-1)">‹</button>
        <button type="button" class="btn btn-secondary btn-sm" @click="goToday">Today</button>
        <button type="button" class="btn btn-secondary btn-sm" @click="shift(1)">›</button>
        <button
          v-if="canManage"
          type="button"
          class="btn btn-primary btn-sm"
          @click="$emit('add-event')"
        >
          + Add Event
        </button>
      </div>
    </div>

    <div class="spc-toolbar">
      <span class="range-chip">{{ rangeLabel }}</span>
      <select v-model="typeFilter" class="type-select">
        <option value="">All types</option>
        <option value="school_holiday">Holiday</option>
        <option value="school_day_off">Day off</option>
        <option value="school_first_day">First Day of School</option>
        <option value="school_back_to_school">Back to School</option>
        <option value="school_fall_check_in">Fall School Check-in</option>
        <option value="school_spring_event">Spring School Check-in</option>
        <option value="school_open_house">Open House</option>
        <option value="school_resource_fair">Resource Fair</option>
        <option value="school_family_night">Family Night</option>
        <option value="school_orientation">Orientation</option>
        <option value="school_other">Other</option>
      </select>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="reload()">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading && !events.length" class="empty-state">Loading calendar…</div>

    <template v-else>
      <div v-if="view === 'list'" class="list-panel">
        <div
          v-for="e in filteredEvents"
          :key="e.id"
          class="list-row"
          role="button"
          tabindex="0"
          @click="onEventActivate(e)"
          @keydown.enter.prevent="onEventActivate(e)"
        >
          <span class="dot" :class="typeColor(e)" />
          <div class="list-main">
            <strong>{{ e.title }}</strong>
            <div class="muted">{{ formatWhen(e) }} · {{ labelType(e) }}</div>
          </div>
          <button
            v-if="canRequestAssignment && isStaffableEvent(e)"
            type="button"
            class="btn btn-primary btn-sm list-request"
            @click.stop="$emit('request-assignment', e)"
          >
            Request
          </button>
        </div>
        <p v-if="!filteredEvents.length" class="empty-state">No events in this range.</p>
      </div>

      <div v-else class="month-grid" :class="{ week: view === 'week' }">
        <div v-for="dow in dowLabels" :key="dow" class="dow">{{ dow }}</div>
        <div
          v-for="cell in cells"
          :key="cell.key"
          class="cell cell-clickable"
          :class="{ outside: cell.outside, today: cell.isToday }"
          role="button"
          tabindex="0"
          :title="cell.outside || !canManage ? '' : `Add event on ${cell.key}`"
          @click="onDayClick(cell)"
          @keydown.enter.prevent="onDayClick(cell)"
        >
          <div class="day-num">{{ cell.day }}</div>
          <button
            v-for="e in cell.events"
            :key="e.id"
            type="button"
            class="evt"
            :class="[typeColor(e), { staffable: canRequestAssignment && isStaffableEvent(e) }]"
            :title="eventTitle(e)"
            @click.stop="onEventActivate(e)"
          >
            <span class="evt-title">{{ e.title }}</span>
            <span v-if="canRequestAssignment && isStaffableEvent(e)" class="evt-request">Request</span>
          </button>
        </div>
      </div>

      <div class="legend">
        <span><i class="lg holiday" /> First Day / Holiday / Day off</span>
        <span><i class="lg bts" /> Back to School</span>
        <span><i class="lg fall" /> Fall School Check-in</span>
        <span><i class="lg open" /> Open House / Orientation</span>
        <span><i class="lg fair" /> Resource Fair</span>
        <span><i class="lg family" /> Family Night</span>
        <span><i class="lg spring" /> Spring School Check-in</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { formatSchoolEventWhen } from '../../utils/timezones';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  canManage: { type: Boolean, default: false },
  /** Providers (not school staff) may request assignment on attendable events. */
  canRequestAssignment: { type: Boolean, default: false }
});

const emit = defineEmits(['add-event', 'edit-event', 'request-assignment', 'refreshed']);

const CALENDAR_ONLY_TYPES = new Set([
  'school_holiday',
  'school_day_off',
  'school_first_day',
  'school_fall_check_in',
  'school_spring_event'
]);

function isStaffableEvent(e) {
  if (!e?.id) return false;
  if (String(e.schoolEventStatus || '').toLowerCase() === 'canceled') return false;
  const typ = String(e.eventType || '').trim().toLowerCase();
  const cat = String(e.category || '').trim().toLowerCase();
  if (CALENDAR_ONLY_TYPES.has(typ)) return false;
  if (['holiday', 'day_off', 'first_day', 'fall_check_in', 'spring'].includes(cat)) return false;
  return typ.startsWith('school_') || !!cat;
}

function eventTitle(e) {
  if (props.canRequestAssignment && isStaffableEvent(e)) {
    return `${e.title} — click to request assignment`;
  }
  return e.title;
}

function onEventActivate(e) {
  if (props.canRequestAssignment && isStaffableEvent(e)) {
    emit('request-assignment', e);
    return;
  }
  emit('edit-event', e);
}

function onDayClick(cell) {
  if (!cell || cell.outside || !props.canManage) return;
  emit('add-event', { date: cell.key });
}

const events = ref([]);
const loading = ref(false);
const error = ref('');
const view = ref('month');
const cursor = ref(startOfMonth(new Date()));
const typeFilter = ref('');

const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function goToday() {
  cursor.value = view.value === 'week' ? startOfWeek(new Date()) : startOfMonth(new Date());
}

function shift(dir) {
  const d = new Date(cursor.value);
  if (view.value === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  cursor.value = view.value === 'week' ? startOfWeek(d) : startOfMonth(d);
}

const rangeLabel = computed(() => {
  const d = cursor.value;
  if (view.value === 'week') {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
});

function formatWhen(e) {
  return formatSchoolEventWhen(e.startsAt, e.endsAt, e.timezone);
}

function labelType(e) {
  const map = {
    school_back_to_school: 'Back to School',
    school_fall_check_in: 'Fall School Check-in',
    school_spring_event: 'Spring School Check-in',
    school_first_day: 'First Day of School',
    school_open_house: 'Open House',
    school_resource_fair: 'Resource Fair',
    school_family_night: 'Family Night',
    school_orientation: 'Orientation',
    school_holiday: 'Holiday',
    school_day_off: 'Day off',
    school_other: 'School Event'
  };
  return map[e.eventType] || e.category || 'Event';
}

function typeColor(e) {
  const t = e.eventType;
  if (t === 'school_back_to_school') return 'bts';
  if (t === 'school_fall_check_in') return 'fall';
  if (t === 'school_spring_event') return 'spring';
  if (t === 'school_resource_fair') return 'fair';
  if (t === 'school_open_house' || t === 'school_orientation') return 'open';
  if (t === 'school_family_night') return 'family';
  if (t === 'school_first_day' || t === 'school_holiday' || t === 'school_day_off') return 'holiday';
  return 'fair';
}

const filteredEvents = computed(() => {
  return events.value.filter((e) => {
    if (typeFilter.value && e.eventType !== typeFilter.value) return false;
    const t = e.startsAt ? new Date(e.startsAt) : null;
    if (!t || Number.isNaN(t.getTime())) return false;
    if (view.value === 'week') {
      const start = startOfWeek(cursor.value);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return t >= start && t < end;
    }
    if (view.value === 'list') {
      const start = startOfMonth(cursor.value);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return t >= start && t < end;
    }
    return t.getMonth() === cursor.value.getMonth() && t.getFullYear() === cursor.value.getFullYear();
  });
});

const cells = computed(() => {
  const byDay = new Map();
  for (const e of filteredEvents.value) {
    const key = ymd(new Date(e.startsAt));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }
  const out = [];
  if (view.value === 'week') {
    const start = startOfWeek(cursor.value);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = ymd(d);
      out.push({
        key,
        day: d.getDate(),
        outside: false,
        isToday: key === ymd(new Date()),
        events: byDay.get(key) || []
      });
    }
    return out;
  }
  const first = startOfMonth(cursor.value);
  const gridStart = startOfWeek(first);
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = ymd(d);
    out.push({
      key,
      day: d.getDate(),
      outside: d.getMonth() !== cursor.value.getMonth(),
      isToday: key === ymd(new Date()),
      events: byDay.get(key) || []
    });
  }
  return out;
});

async function reload() {
  if (!props.schoolOrganizationId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/school-portal/${props.schoolOrganizationId}/school-events`);
    events.value = Array.isArray(res.data?.events)
      ? res.data.events
      : (Array.isArray(res.data) ? res.data : []);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load calendar';
    events.value = [];
  } finally {
    loading.value = false;
  }
}

defineExpose({ reload });

watch(() => props.schoolOrganizationId, () => reload());
onMounted(() => reload());
</script>

<style scoped>
.spc-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}
.spc-header h2 {
  margin: 0 0 0.2rem;
  font-size: 1.25rem;
}
.muted {
  color: #64748b;
  font-size: 0.88rem;
  margin: 0;
}
.spc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
.view-toggle {
  display: inline-flex;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
}
.view-toggle button {
  border: 0;
  background: #fff;
  padding: 0.35rem 0.65rem;
  font-size: 0.82rem;
  cursor: pointer;
}
.view-toggle button.active {
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 650;
}
.spc-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}
.range-chip {
  font-weight: 650;
  color: #334155;
  font-size: 0.92rem;
}
.type-select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  font-size: 0.85rem;
}
.error-banner {
  background: #fef2f2;
  color: #b91c1c;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
}
.empty-state {
  color: #64748b;
  padding: 1.25rem 0;
  text-align: center;
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  background: #e2e8f0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.month-grid.week .cell {
  min-height: 140px;
}
.dow {
  background: #f8fafc;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  padding: 0.4rem 0;
}
.cell {
  background: #fff;
  min-height: 96px;
  padding: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.cell-clickable:not(.outside) {
  cursor: pointer;
}
.cell-clickable:not(.outside):hover {
  background: #f0fdfa;
}
.cell.outside {
  background: #f8fafc;
  color: #94a3b8;
  cursor: default;
}
.cell.today {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
}
.day-num {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}
.evt {
  border: 0;
  border-radius: 5px;
  padding: 0.15rem 0.3rem;
  font-size: 0.68rem;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #fff;
  font-weight: 600;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
}
.evt-title {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.evt-request {
  flex-shrink: 0;
  font-size: 0.58rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  padding: 0.05rem 0.25rem;
}
.evt.staffable {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}
.evt.bts { background: #2563eb; }
.evt.fall { background: #c2410c; }
.evt.fair { background: #16a34a; }
.evt.open { background: #ea580c; }
.evt.family { background: #0f766e; }
.evt.spring { background: #7c3aed; }
.evt.holiday { background: #b45309; }
.legend {
  display: flex;
  gap: 0.85rem;
  flex-wrap: wrap;
  margin-top: 0.85rem;
  font-size: 0.8rem;
  color: #475569;
}
.legend i,
.lg {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  margin-right: 0.25rem;
}
.lg.bts { background: #2563eb; }
.lg.fall { background: #c2410c; }
.lg.fair { background: #16a34a; }
.lg.open { background: #ea580c; }
.lg.family { background: #0f766e; }
.lg.spring { background: #7c3aed; }
.lg.holiday { background: #b45309; }
.list-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.list-row {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 0.7rem 0.85rem;
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.list-row:hover {
  border-color: #93c5fd;
  background: #f8fafc;
}
.list-main {
  flex: 1;
  min-width: 0;
}
.list-request {
  flex-shrink: 0;
  align-self: center;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  margin-top: 0.35rem;
  flex-shrink: 0;
}
.dot.bts { background: #2563eb; }
.dot.fall { background: #c2410c; }
.dot.fair { background: #16a34a; }
.dot.open { background: #ea580c; }
.dot.family { background: #0f766e; }
.dot.spring { background: #7c3aed; }
.dot.holiday { background: #b45309; }
@media (max-width: 720px) {
  .cell { min-height: 72px; }
  .evt { font-size: 0.62rem; }
}
</style>
