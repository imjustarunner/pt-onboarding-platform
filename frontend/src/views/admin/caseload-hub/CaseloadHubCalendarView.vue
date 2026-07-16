<template>
  <div class="hub-page" data-tour="caseload-hub-calendar">
    <header class="hub-header">
      <div>
        <h1>School Events Calendar</h1>
        <p class="subtitle">Month, week, and list views of school events with staffing status.</p>
      </div>
      <div class="header-actions">
        <select v-if="agencies.length > 1" v-model="agencyId" class="agency-select" @change="reload">
          <option v-for="a in agencies" :key="a.id" :value="Number(a.id)">{{ a.name }}</option>
        </select>
        <div class="view-toggle">
          <button type="button" :class="{ active: view === 'month' }" @click="view = 'month'">Month</button>
          <button type="button" :class="{ active: view === 'week' }" @click="view = 'week'">Week</button>
          <button type="button" :class="{ active: view === 'list' }" @click="view = 'list'">List</button>
        </div>
        <button type="button" class="btn btn-secondary" @click="shift(-1)">‹</button>
        <button type="button" class="btn btn-secondary" @click="goToday">Today</button>
        <button type="button" class="btn btn-secondary" @click="shift(1)">›</button>
        <router-link class="btn btn-primary" :to="orgTo('/admin/caseload-hub/events')">Event list</router-link>
      </div>
    </header>

    <div class="filters">
      <select v-model="schoolFilter">
        <option value="">All schools</option>
        <option v-for="s in schoolOptions" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
      </select>
      <select v-model="typeFilter">
        <option value="">All event types</option>
        <option value="school_back_to_school">Back to School</option>
        <option value="school_spring_event">Spring Event</option>
      </select>
      <select v-model="staffingFilter">
        <option value="">All staffing</option>
        <option value="needs_providers">Needs providers</option>
        <option value="partially_staffed">Partially staffed</option>
        <option value="fully_staffed">Fully staffed</option>
      </select>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="loading">Loading calendar…</div>

    <template v-else>
      <h2 class="range-label">{{ rangeLabel }}</h2>

      <div v-if="view === 'list'" class="panel">
        <div v-for="e in filteredEvents" :key="e.id" class="list-row">
          <div class="dot" :class="colorFor(e)" />
          <div>
            <strong>{{ e.title }}</strong>
            <div class="muted">{{ formatFull(e.startsAt) }} · {{ e.schoolName || '—' }} · {{ e.providersAssigned }}/{{ e.providersRequested }} staffed</div>
          </div>
        </div>
        <p v-if="!filteredEvents.length" class="empty">No events in this range.</p>
      </div>

      <div v-else class="month-grid" :class="{ week: view === 'week' }">
        <div v-for="dow in dowLabels" :key="dow" class="dow">{{ dow }}</div>
        <div
          v-for="cell in cells"
          :key="cell.key"
          class="cell"
          :class="{ outside: cell.outside, today: cell.isToday }"
        >
          <div class="day-num">{{ cell.day }}</div>
          <button
            v-for="e in cell.events"
            :key="e.id"
            type="button"
            class="evt"
            :class="colorFor(e)"
            :title="e.title"
          >
            {{ e.title }}
          </button>
        </div>
      </div>

      <div class="legend">
        <span><i class="lg needs" /> Needs providers</span>
        <span><i class="lg partial" /> Partially staffed</span>
        <span><i class="lg full" /> Fully staffed</span>
        <span><i class="lg other" /> Scheduled</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import { fetchHubEvents } from '../../../services/schoolCoverageApi';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const agencyId = ref(null);
const agencies = computed(() => agencyStore.agencies || []);
const events = ref([]);
const loading = ref(false);
const error = ref('');
const view = ref('month');
const cursor = ref(startOfMonth(new Date()));
const schoolFilter = ref('');
const typeFilter = ref('');
const staffingFilter = ref('');

const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function orgTo(path) {
  const slug = route.params.organizationSlug;
  if (slug) return `/${slug}${path}`;
  return path;
}

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
    return `${d.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  }
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
});

const schoolOptions = computed(() => {
  const map = new Map();
  for (const e of events.value) {
    if (e.schoolId) map.set(e.schoolId, { id: e.schoolId, name: e.schoolName || `School ${e.schoolId}` });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const filteredEvents = computed(() => {
  return events.value.filter((e) => {
    if (schoolFilter.value && String(e.schoolId) !== schoolFilter.value) return false;
    if (typeFilter.value && e.eventType !== typeFilter.value) return false;
    if (staffingFilter.value && e.staffingStatus !== staffingFilter.value) return false;
    const t = e.startsAt ? new Date(e.startsAt) : null;
    if (!t || Number.isNaN(t.getTime())) return false;
    if (view.value === 'week') {
      const start = startOfWeek(cursor.value);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return t >= start && t < end;
    }
    if (view.value === 'list' || view.value === 'month') {
      return t.getMonth() === cursor.value.getMonth() && t.getFullYear() === cursor.value.getFullYear();
    }
    return true;
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

function colorFor(e) {
  if (e.staffingStatus === 'needs_providers') return 'needs';
  if (e.staffingStatus === 'partially_staffed' || e.staffingStatus === 'requests_pending') return 'partial';
  if (e.staffingStatus === 'fully_staffed') return 'full';
  return 'other';
}

function formatFull(v) {
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v || '');
  }
}

async function reload() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchHubEvents(agencyId.value);
    events.value = data.events || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load calendar';
  } finally {
    loading.value = false;
  }
}

watch(view, (v) => {
  if (v === 'week') cursor.value = startOfWeek(new Date());
  else cursor.value = startOfMonth(cursor.value);
});

onMounted(async () => {
  try {
    if (!agencyStore.agencies?.length && agencyStore.fetchAgencies) await agencyStore.fetchAgencies();
  } catch {
    /* ignore */
  }
  agencyId.value =
    Number(route.query.agencyId) ||
    Number(agencyStore.currentAgency?.id) ||
    Number(authStore.user?.agencyId) ||
    Number(agencies.value[0]?.id) ||
    null;
  await reload();
});
</script>

<style scoped>
.hub-page { padding: 1rem 1.25rem 2rem; width: 100%; max-width: none; margin: 0; box-sizing: border-box; min-height: calc(100vh - 80px); }
.hub-header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
.hub-header h1 { margin: 0 0 0.25rem; }
.subtitle { margin: 0; color: #64748b; }
.header-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
.agency-select, .filters select { padding: 0.4rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 6px; }
.view-toggle { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
.view-toggle button { border: 0; background: #fff; padding: 0.4rem 0.7rem; cursor: pointer; }
.view-toggle button.active { background: #5b21b6; color: #fff; }
.btn { display: inline-flex; padding: 0.4rem 0.75rem; border-radius: 6px; text-decoration: none; border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; font-size: 0.875rem; }
.btn-primary { background: #5b21b6; color: #fff; border-color: transparent; }
.filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.range-label { margin: 0 0 0.75rem; font-size: 1.1rem; }
.month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.month-grid.week .cell { min-height: 140px; }
.dow { background: #f8fafc; padding: 0.45rem; font-size: 0.75rem; font-weight: 600; color: #64748b; text-align: center; }
.cell { background: #fff; min-height: 100px; padding: 0.35rem; }
.cell.outside { background: #f8fafc; color: #94a3b8; }
.cell.today { outline: 2px solid #7c3aed; outline-offset: -2px; }
.day-num { font-size: 0.75rem; font-weight: 600; margin-bottom: 0.25rem; }
.evt { display: block; width: 100%; text-align: left; border: 0; border-radius: 4px; padding: 0.15rem 0.3rem; margin-bottom: 0.2rem; font-size: 0.68rem; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; }
.evt.needs, .lg.needs, .dot.needs { background: #dc2626; }
.evt.partial, .lg.partial, .dot.partial { background: #ea580c; }
.evt.full, .lg.full, .dot.full { background: #16a34a; }
.evt.other, .lg.other, .dot.other { background: #7c3aed; }
.legend { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.85rem; font-size: 0.8rem; color: #475569; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 0.3rem; }
.panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.75rem; }
.list-row { display: flex; gap: 0.65rem; padding: 0.55rem 0; border-bottom: 1px solid #f1f5f9; }
.dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 0.35rem; flex-shrink: 0; }
.muted { color: #64748b; font-size: 0.8rem; }
.error-banner { background: #fef2f2; color: #991b1b; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; }
.empty, .loading { padding: 1.5rem; color: #64748b; text-align: center; }
@media (max-width: 800px) {
  .month-grid { font-size: 0.75rem; }
  .cell { min-height: 72px; }
}
</style>
