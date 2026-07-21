<template>
  <div class="hub-page" data-tour="caseload-hub-calendar">
    <header class="hub-header">
      <div>
        <h1>School Events Calendar</h1>
        <p class="subtitle">View and manage school events, staffing, and special schedules.</p>
        <p class="tz-note">
          Times shown in the school/tenant timezone
          <strong>{{ defaultTimezoneLabel }}</strong>
          (MST/MDT). Auto-refreshes every {{ pollSeconds }}s while open.
        </p>
      </div>
      <div class="header-actions">
        <select v-if="agencies.length > 1" v-model="agencyId" class="agency-select" @change="reload()">
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
        <router-link class="btn btn-ghost" :to="orgTo('/admin/caseload-hub/events')">Event list</router-link>
        <button type="button" class="btn btn-primary" @click="openAddEvent()">+ Add Event</button>
      </div>
    </header>

    <div class="filters">
      <select v-model="schoolFilter">
        <option value="">All Schools</option>
        <option v-for="s in schoolOptions" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
      </select>
      <select v-model="typeFilter">
        <option value="">All Event Types</option>
        <option value="school_back_to_school">Back to School</option>
        <option value="school_fall_check_in">Fall School Check-in</option>
        <option value="school_spring_event">Spring School Check-in</option>
        <option value="school_open_house">Open House</option>
        <option value="school_resource_fair">Resource Fair</option>
        <option value="school_family_night">Family Night</option>
        <option value="school_orientation">Orientation</option>
        <option value="school_first_day">First Day of School</option>
        <option value="school_holiday">Holiday</option>
        <option value="school_day_off">Day off</option>
        <option value="school_other">Other</option>
      </select>
      <span class="range-chip">{{ rangeLabel }}</span>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="loading">Loading calendar…</div>

    <template v-else>
      <div class="kpi-row">
        <div class="kpi"><strong>{{ metrics.upcoming }}</strong><span>Upcoming Events</span></div>
        <div class="kpi"><strong>{{ metrics.schoolsAffected }}</strong><span>Schools Affected</span></div>
        <div class="kpi"><strong>{{ metrics.sessionsImpacted }}</strong><span>Sessions Impacted</span></div>
        <div class="kpi"><strong>{{ metrics.staffImpacted }}</strong><span>Staff Impacted</span></div>
      </div>

      <div class="calendar-layout">
        <div class="calendar-main">
          <div v-if="view === 'list'" class="panel">
            <button
              v-for="e in filteredEvents"
              :key="e.id"
              type="button"
              class="list-row list-row-btn"
              @click="openEvent(e)"
            >
              <div class="dot" :class="typeColor(e)" />
              <div>
                <strong>{{ e.title }}</strong>
                <div class="muted">
                  {{ formatFull(e.startsAt, e.endsAt, e.timezone) }} · {{ e.schoolName || '—' }} ·
                  <template v-if="e.staffingEnabled">{{ e.providersAssigned }}/{{ e.providersRequested }} staffed</template>
                  <template v-else>not open</template>
                </div>
              </div>
            </button>
            <p v-if="!filteredEvents.length" class="empty">No events in this range.</p>
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
              :title="cell.outside ? '' : `Add event on ${cell.key}`"
              @click="onDayClick(cell)"
              @keydown.enter.prevent="onDayClick(cell)"
            >
              <div class="day-num">{{ cell.day }}</div>
              <button
                v-for="e in cell.events"
                :key="e.id"
                type="button"
                class="evt"
                :class="typeColor(e)"
                :title="`${e.schoolName ? e.schoolName + ' — ' : ''}${e.title}`"
                @click.stop="openEvent(e)"
              >
                <span v-if="e.schoolName" class="evt-school">{{ shortSchool(e.schoolName) }}</span>
                {{ e.title }}
              </button>
            </div>
          </div>

          <div class="legend">
            <span><i class="lg bts" /> Back to School</span>
            <span><i class="lg fair" /> Resource Fair / School Event</span>
            <span><i class="lg open" /> Open House / Orientation</span>
            <span><i class="lg family" /> Family Night</span>
            <span><i class="lg spring" /> Spring / Other</span>
            <span><i class="lg holiday" /> Holiday / Day off</span>
            <span><i class="lg needs" /> Needs providers</span>
          </div>
        </div>

        <aside class="side-panel">
          <div class="mini-cal">
            <div class="mini-head">
              <button type="button" @click="shiftMini(-1)">‹</button>
              <strong>{{ miniLabel }}</strong>
              <button type="button" @click="shiftMini(1)">›</button>
            </div>
            <div class="mini-grid">
              <span v-for="d in ['S','M','T','W','T','F','S']" :key="d" class="mini-dow">{{ d }}</span>
              <button
                v-for="c in miniCells"
                :key="c.key"
                type="button"
                class="mini-day"
                :class="{ outside: c.outside, today: c.isToday, has: c.hasEvents, active: c.key === selectedMiniKey }"
                @click="jumpToDay(c.date)"
              >
                {{ c.day }}
              </button>
            </div>
          </div>

          <div class="side-block">
            <h3>Event types</h3>
            <label v-for="t in typeChecklist" :key="t.value" class="check">
              <input v-model="enabledTypes" type="checkbox" :value="t.value" />
              <i class="lg" :class="t.color" />
              {{ t.label }}
            </label>
          </div>

          <div class="side-block">
            <h3>Quick filters</h3>
            <button type="button" class="quick" @click="applyQuick('bts')">Back to School</button>
            <button type="button" class="quick" @click="applyQuick('needs')">Needs providers</button>
            <button type="button" class="quick" @click="applyQuick('clear')">Clear filters</button>
          </div>
        </aside>
      </div>
    </template>

    <div v-if="showAddSchoolPicker" class="modal-backdrop" @click.self="showAddSchoolPicker = false">
      <div class="modal-card">
        <h2>Add school event</h2>
        <div class="scope-toggle">
          <button
            type="button"
            class="chip"
            :class="{ active: addScope === 'school' }"
            @click="addScope = 'school'"
          >
            One school
          </button>
          <button
            type="button"
            class="chip"
            :class="{ active: addScope === 'district' }"
            @click="addScope = 'district'; loadDistricts()"
          >
            Entire district
          </button>
        </div>
        <template v-if="addScope === 'school'">
          <p class="muted">Choose the school this event belongs to.</p>
          <select v-model="addSchoolId" class="agency-select full">
            <option :value="null">Select a school…</option>
            <option v-for="s in schoolOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </template>
        <template v-else>
          <p class="muted">Creates the same event for every school in the district.</p>
          <select v-model="addDistrictName" class="agency-select full">
            <option value="">Select a district…</option>
            <option v-for="d in districtOptions" :key="d.districtName" :value="d.districtName">
              {{ d.districtName }} ({{ d.schoolCount }} schools)
            </option>
          </select>
          <p v-if="districtsError" class="error-inline">{{ districtsError }}</p>
        </template>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="showAddSchoolPicker = false">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="addScope === 'school' ? !addSchoolId : !addDistrictName"
            @click="confirmAddSchool"
          >
            Continue
          </button>
        </div>
      </div>
    </div>

    <PostSchoolEventModal
      v-if="showPostModal && (addSchoolId || addDistrictName)"
      :school-organization-id="addSchoolId ? Number(addSchoolId) : null"
      :school-name="addSchoolName"
      :agency-id="agencyId"
      :district-name="addDistrictName || ''"
      :initial-date="addInitialDate"
      :initial-category="addDistrictName ? 'holiday' : 'back_to_school'"
      @close="closePostModal"
      @saved="onEventSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import api from '../../../services/api';
import { fetchHubEvents, fetchSchoolCoverageSummary } from '../../../services/schoolCoverageApi';
import PostSchoolEventModal from '../../../components/school/PostSchoolEventModal.vue';
import {
  formatSchoolEventWhen,
  schoolEventTimezoneLabel,
  SCHOOL_EVENT_FALLBACK_TIMEZONE
} from '../../../utils/timezones';

const route = useRoute();
const router = useRouter();
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
const staffingOnlyNeeds = ref(false);
const schoolOptions = ref([]);
const enabledTypes = ref([
  'school_back_to_school',
  'school_fall_check_in',
  'school_spring_event',
  'school_first_day',
  'school_open_house',
  'school_resource_fair',
  'school_family_night',
  'school_orientation',
  'school_holiday',
  'school_day_off',
  'school_other'
]);
const showAddSchoolPicker = ref(false);
const showPostModal = ref(false);
const addSchoolId = ref(null);
const addInitialDate = ref('');
const addScope = ref('school');
const addDistrictName = ref('');
const districtOptions = ref([]);
const districtsError = ref('');
const districtsLoadedForAgency = ref(null);
const selectedMiniKey = ref('');

const addSchoolName = computed(() => {
  const id = Number(addSchoolId.value);
  if (!Number.isFinite(id) || id <= 0) return '';
  const match = schoolOptions.value.find((s) => Number(s.id) === id);
  return String(match?.name || '').trim();
});

const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const typeChecklist = [
  { value: 'school_back_to_school', label: 'Back to School', color: 'bts' },
  { value: 'school_fall_check_in', label: 'Fall School Check-in', color: 'fall' },
  { value: 'school_spring_event', label: 'Spring School Check-in', color: 'spring' },
  { value: 'school_resource_fair', label: 'Resource Fair', color: 'fair' },
  { value: 'school_open_house', label: 'Open House', color: 'open' },
  { value: 'school_orientation', label: 'Orientation', color: 'open' },
  { value: 'school_family_night', label: 'Family Night', color: 'family' },
  { value: 'school_first_day', label: 'First Day of School', color: 'holiday' },
  { value: 'school_holiday', label: 'Holiday', color: 'holiday' },
  { value: 'school_day_off', label: 'Day off', color: 'holiday' },
  { value: 'school_other', label: 'Other school event', color: 'fair' }
];

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

function shiftMini(dir) {
  const d = startOfMonth(cursor.value);
  d.setMonth(d.getMonth() + dir);
  cursor.value = d;
}

function jumpToDay(date) {
  selectedMiniKey.value = ymd(date);
  cursor.value = view.value === 'week' ? startOfWeek(date) : startOfMonth(date);
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

const miniLabel = computed(() =>
  startOfMonth(cursor.value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
);

const filteredEvents = computed(() => {
  return events.value.filter((e) => {
    if (schoolFilter.value && String(e.schoolId) !== schoolFilter.value) return false;
    if (typeFilter.value && e.eventType !== typeFilter.value) return false;
    if (enabledTypes.value.length && !enabledTypes.value.includes(e.eventType)) return false;
    if (staffingOnlyNeeds.value && !['needs_providers', 'partially_staffed', 'requests_pending'].includes(e.staffingStatus)) {
      return false;
    }
    const t = e.startsAt ? new Date(e.startsAt) : null;
    if (!t || Number.isNaN(t.getTime())) return false;
    if (view.value === 'week') {
      const start = startOfWeek(cursor.value);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return t >= start && t < end;
    }
    return t.getMonth() === cursor.value.getMonth() && t.getFullYear() === cursor.value.getFullYear();
  });
});

const metrics = computed(() => {
  const list = filteredEvents.value;
  const now = Date.now();
  const upcoming = list.filter((e) => e.startsAt && new Date(e.startsAt).getTime() >= now).length;
  const schools = new Set(list.map((e) => e.schoolId).filter(Boolean)).size;
  const sessions = list.reduce((sum, e) => sum + Math.max(1, Number(e.providersRequested || 1)), 0);
  const staff = list.reduce((sum, e) => sum + Number(e.providersAssigned || 0), 0);
  return {
    upcoming,
    schoolsAffected: schools,
    sessionsImpacted: sessions,
    staffImpacted: staff
  };
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

const miniCells = computed(() => {
  const month = startOfMonth(cursor.value);
  const gridStart = startOfWeek(month);
  const byDay = new Set(filteredEvents.value.map((e) => ymd(new Date(e.startsAt))));
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = ymd(d);
    out.push({
      key,
      date: d,
      day: d.getDate(),
      outside: d.getMonth() !== month.getMonth(),
      isToday: key === ymd(new Date()),
      hasEvents: byDay.has(key)
    });
  }
  return out;
});

function typeColor(e) {
  if (e.staffingStatus === 'needs_providers') return 'needs';
  const t = e.eventType;
  if (t === 'school_back_to_school') return 'bts';
  if (t === 'school_fall_check_in') return 'fall';
  if (t === 'school_spring_event') return 'spring';
  if (t === 'school_resource_fair' || t === 'school_other') return 'fair';
  if (t === 'school_open_house' || t === 'school_orientation') return 'open';
  if (t === 'school_family_night') return 'family';
  if (t === 'school_first_day' || t === 'school_holiday' || t === 'school_day_off') return 'holiday';
  return 'fair';
}

function shortSchool(name) {
  const s = String(name || '');
  return s.length > 18 ? `${s.slice(0, 16)}…` : s;
}

const POLL_MS = 30000;
const pollSeconds = POLL_MS / 1000;
const defaultTimezoneLabel = schoolEventTimezoneLabel(SCHOOL_EVENT_FALLBACK_TIMEZONE);
let pollTimer = null;

function formatFull(startsAt, endsAt, timezone) {
  return formatSchoolEventWhen(startsAt, endsAt, timezone);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (loading.value) return;
    reload({ silent: true });
  }, POLL_MS);
}

function onVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    reload({ silent: true });
  }
}

function openEvent(e) {
  if (!e?.id) return;
  const tab = Number(e.pendingRequests || 0) > 0 ? 'provider-requests' : 'list';
  router.push({
    path: orgTo('/admin/caseload-hub/events'),
    query: {
      eventId: String(e.id),
      tab,
      type: '',
      ...(agencyId.value ? { agencyId: String(agencyId.value) } : {})
    }
  });
}

function applyQuick(kind) {
  if (kind === 'bts') {
    typeFilter.value = 'school_back_to_school';
    staffingOnlyNeeds.value = false;
    enabledTypes.value = ['school_back_to_school'];
  } else if (kind === 'needs') {
    staffingOnlyNeeds.value = true;
    typeFilter.value = '';
  } else {
    typeFilter.value = '';
    staffingOnlyNeeds.value = false;
    enabledTypes.value = typeChecklist.map((t) => t.value);
  }
}

async function loadDistricts() {
  if (!agencyId.value) return;
  if (districtsLoadedForAgency.value === agencyId.value && districtOptions.value.length) return;
  districtsError.value = '';
  try {
    const res = await api.get('/school-portal/school-events/districts', {
      params: { agencyId: agencyId.value }
    });
    districtOptions.value = Array.isArray(res.data?.districts) ? res.data.districts : [];
    districtsLoadedForAgency.value = agencyId.value;
  } catch (e) {
    districtsError.value = e?.response?.data?.error?.message || 'Failed to load districts';
    districtOptions.value = [];
  }
}

function openAddEvent(dateYmd = '') {
  const raw = typeof dateYmd === 'string' ? dateYmd : '';
  addInitialDate.value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  addScope.value = 'school';
  addDistrictName.value = '';
  addSchoolId.value = schoolFilter.value ? Number(schoolFilter.value) : null;
  if (addSchoolId.value) {
    showPostModal.value = true;
  } else {
    showAddSchoolPicker.value = true;
  }
}

function onDayClick(cell) {
  if (!cell || cell.outside) return;
  openAddEvent(cell.key);
}

function confirmAddSchool() {
  if (addScope.value === 'district') {
    if (!addDistrictName.value) return;
    addSchoolId.value = null;
  } else if (!addSchoolId.value) {
    return;
  } else {
    addDistrictName.value = '';
  }
  showAddSchoolPicker.value = false;
  showPostModal.value = true;
}

function closePostModal() {
  showPostModal.value = false;
  addDistrictName.value = '';
  addInitialDate.value = '';
}

async function onEventSaved() {
  closePostModal();
  await reload();
}

async function reload({ silent = false } = {}) {
  if (!agencyId.value) return;
  if (!silent) {
    loading.value = true;
    error.value = '';
  }
  try {
    const [data, schools] = await Promise.all([
      fetchHubEvents(agencyId.value),
      fetchSchoolCoverageSummary(agencyId.value).catch(() => ({ schools: [] }))
    ]);
    events.value = data.events || [];
    schoolOptions.value = (schools.schools || [])
      .map((s) => ({
        id: Number(s.schoolId ?? s.id),
        name: String(s.schoolName || s.name || '').trim() || `School ${s.schoolId ?? s.id}`
      }))
      .filter((s) => Number.isFinite(s.id) && s.id > 0)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch (e) {
    if (!silent) {
      error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load calendar';
    }
  } finally {
    if (!silent) loading.value = false;
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
  startPolling();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
});

onUnmounted(() => {
  stopPolling();
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
});
</script>

<style scoped>
.hub-page {
  padding: 1rem 1.25rem 2rem;
  width: 100%;
  max-width: none;
  margin: 0;
  box-sizing: border-box;
  min-height: calc(100vh - 80px);
  background: linear-gradient(180deg, #f8fafc 0%, #fff 220px);
}
.hub-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.hub-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.65rem;
  letter-spacing: -0.02em;
}
.tz-note {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: #475569;
}
.tz-note strong {
  color: #0f172a;
  font-weight: 700;
}
.subtitle {
  margin: 0;
  color: #64748b;
}
.header-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  align-items: center;
}
.agency-select,
.filters select {
  padding: 0.45rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
}
.agency-select.full {
  width: 100%;
  margin: 0.75rem 0 1rem;
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
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}
.view-toggle button.active {
  background: #2563eb;
  color: #fff;
}
.btn {
  display: inline-flex;
  padding: 0.45rem 0.8rem;
  border-radius: 8px;
  text-decoration: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-size: 0.875rem;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  border-color: transparent;
}
.btn-ghost {
  border-color: transparent;
  background: transparent;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
  align-items: center;
}
.range-chip {
  margin-left: auto;
  font-weight: 650;
  color: #334155;
  font-size: 0.95rem;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}
.kpi {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem 0.9rem;
}
.kpi strong {
  display: block;
  font-size: 1.45rem;
  letter-spacing: -0.02em;
}
.kpi span {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}
.calendar-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  gap: 1rem;
  align-items: start;
}
.calendar-main {
  min-width: 0;
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: #e2e8f0;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.month-grid.week .cell {
  min-height: 150px;
}
.dow {
  background: #f8fafc;
  padding: 0.45rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-align: center;
}
.cell {
  background: #fff;
  min-height: 108px;
  padding: 0.35rem;
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
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.evt {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 5px;
  padding: 0.18rem 0.3rem;
  margin-bottom: 0.2rem;
  font-size: 0.68rem;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #fff;
  font-weight: 600;
}
.evt-school {
  display: block;
  font-size: 0.62rem;
  opacity: 0.9;
  font-weight: 500;
}
.evt.bts,
.lg.bts {
  background: #2563eb;
}
.evt.fall,
.lg.fall {
  background: #c2410c;
}
.evt.fair,
.lg.fair {
  background: #16a34a;
}
.evt.open,
.lg.open {
  background: #ea580c;
}
.evt.family,
.lg.family {
  background: #0f766e;
}
.evt.spring,
.lg.spring {
  background: #7c3aed;
}
.evt.needs,
.lg.needs {
  background: #dc2626;
}
.evt.holiday,
.lg.holiday {
  background: #b45309;
}
.scope-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.5rem 0 0.75rem;
}
.scope-toggle .chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 0.28rem 0.7rem;
  font-size: 0.82rem;
  cursor: pointer;
}
.scope-toggle .chip.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 650;
}
.error-inline {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0.35rem 0 0;
}
.legend {
  display: flex;
  gap: 0.85rem;
  flex-wrap: wrap;
  margin-top: 0.85rem;
  font-size: 0.8rem;
  color: #475569;
}
.legend i,
.side-block .lg {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 0.3rem;
}
.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
}
.list-row {
  display: flex;
  gap: 0.65rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid #f1f5f9;
}
.list-row-btn {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.list-row-btn:hover {
  background: #f8fafc;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 0.35rem;
  flex-shrink: 0;
}
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  position: sticky;
  top: 0.75rem;
}
.mini-cal,
.side-block {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
}
.mini-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.mini-head button {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 6px;
  width: 1.75rem;
  height: 1.75rem;
  cursor: pointer;
}
.mini-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.mini-dow {
  text-align: center;
  font-size: 0.65rem;
  color: #94a3b8;
  font-weight: 700;
  padding: 0.2rem 0;
}
.mini-day {
  border: 0;
  background: transparent;
  border-radius: 6px;
  padding: 0.35rem 0;
  font-size: 0.72rem;
  cursor: pointer;
}
.mini-day.outside {
  color: #cbd5e1;
}
.mini-day.today {
  font-weight: 800;
  color: #2563eb;
}
.mini-day.has {
  background: #eff6ff;
}
.mini-day.active {
  background: #2563eb;
  color: #fff;
}
.side-block h3 {
  margin: 0 0 0.55rem;
  font-size: 0.85rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #334155;
  margin-bottom: 0.4rem;
  cursor: pointer;
}
.quick {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  margin-bottom: 0.35rem;
  cursor: pointer;
  font-size: 0.8rem;
}
.muted {
  color: #64748b;
  font-size: 0.8rem;
}
.error-banner {
  background: #fef2f2;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}
.empty,
.loading {
  padding: 1.5rem;
  color: #64748b;
  text-align: center;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
  padding: 1rem;
}
.modal-card {
  width: min(28rem, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 1.15rem 1.2rem;
  border: 1px solid #e2e8f0;
}
.modal-card h2 {
  margin: 0 0 0.35rem;
  font-size: 1.15rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
@media (max-width: 1100px) {
  .calendar-layout {
    grid-template-columns: 1fr;
  }
  .side-panel {
    position: static;
  }
  .kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 800px) {
  .month-grid {
    font-size: 0.75rem;
  }
  .cell {
    min-height: 72px;
  }
}
</style>
