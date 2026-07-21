<template>
  <div class="hub-page" data-tour="caseload-hub-events">
    <header class="hub-header">
      <div>
        <h1>School Events</h1>
        <p class="subtitle">View and manage school events, provider staffing, and back-to-school outreach.</p>
        <p class="tz-note">
          All times shown in the school/tenant timezone
          <strong>{{ defaultTimezoneLabel }}</strong>
          (e.g. MST/MDT). Updates refresh automatically every {{ pollSeconds }}s while this page is open.
        </p>
      </div>
      <div class="header-actions">
        <select v-if="agencies.length > 1" v-model="agencyId" class="agency-select" @change="reload()">
          <option v-for="a in agencies" :key="a.id" :value="Number(a.id)">{{ a.name }}</option>
        </select>
        <router-link class="btn btn-ghost" :to="orgTo('/admin/caseload-hub/calendar')">Calendar</router-link>
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="reload()">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
        <button type="button" class="btn btn-secondary" @click="exportCsv">Export</button>
        <button type="button" class="btn btn-secondary" @click="showKioskSettings = true">School events kiosk</button>
        <button type="button" class="btn btn-primary" @click="openAddEvent">+ Add Event</button>
      </div>
    </header>

    <div v-if="showKioskSettings" class="caseload-modal-backdrop" @click.self="showKioskSettings = false">
      <div class="caseload-modal kiosk-settings-modal">
        <header class="caseload-modal-header">
          <h2>School events kiosk</h2>
          <button type="button" class="icon-btn" @click="showKioskSettings = false">×</button>
        </header>
        <div class="caseload-modal-body">
          <p class="muted">
            One agency station PIN unlocks a kiosk that lists school events. Staff pick an event and clock in;
            time posts to payroll as indirect by default.
          </p>
          <p v-if="kioskSettingsError" class="error-inline">{{ kioskSettingsError }}</p>
          <dl class="kiosk-dl">
            <dt>Station PIN</dt>
            <dd>
              <code v-if="kioskSettings?.pinCode">{{ kioskSettings.pinCode }}</code>
              <span v-else class="muted">{{ kioskSettings?.pinSet ? 'Set (code hidden)' : 'Not set' }}</span>
            </dd>
            <dt>Public link</dt>
            <dd>
              <a v-if="kioskSettings?.kioskUrl" :href="kioskSettings.kioskUrl" target="_blank" rel="noopener">
                {{ kioskSettings.kioskUrl }}
              </a>
              <span v-else class="muted">—</span>
            </dd>
          </dl>
          <label class="kiosk-set-pin">
            <span>Set custom PIN (4–6 digits)</span>
            <input
              v-model="kioskCustomPin"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="e.g. 5373"
              class="kiosk-pin-input"
            />
          </label>
          <div class="kiosk-actions">
            <button type="button" class="btn btn-secondary" :disabled="kioskSettingsBusy" @click="loadKioskSettings">
              Reload
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="kioskSettingsBusy || !/^\d{4,6}$/.test(String(kioskCustomPin || '').trim())"
              @click="setCustomKioskPin"
            >
              Save PIN
            </button>
            <button type="button" class="btn btn-primary" :disabled="kioskSettingsBusy" @click="rotateKioskPin">
              {{ kioskSettingsBusy ? 'Working…' : (kioskSettings?.pinSet ? 'Randomize PIN' : 'Generate PIN') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <nav class="hub-tabs">
      <router-link class="hub-tab" :to="orgTo('/admin/caseload-hub/calendar')">Calendar</router-link>
      <button type="button" class="hub-tab" :class="{ active: tab === 'list' }" @click="setTab('list')">Event List</button>
      <button type="button" class="hub-tab" :class="{ active: tab === 'provider-requests' }" @click="setTab('provider-requests')">
        Provider Requests
        <span v-if="pendingTotal" class="tab-badge">{{ pendingTotal }}</span>
      </button>
      <button type="button" class="hub-tab" :class="{ active: tab === 'archived' }" @click="setTab('archived')">Archived</button>
    </nav>

    <div v-if="tab !== 'provider-requests' && tab !== 'archived'" class="filters-bar">
      <label class="filter">
        <span>Date range</span>
        <div class="range-inputs">
          <input v-model="dateFrom" type="date" />
          <span class="muted">–</span>
          <input v-model="dateTo" type="date" />
        </div>
      </label>
      <label class="filter">
        <span>School</span>
        <select v-model="schoolFilter">
          <option value="">All Schools</option>
          <option v-for="s in schoolOptions" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
        </select>
      </label>
      <label class="filter">
        <span>Status</span>
        <select v-model="lifecycleFilter">
          <option value="">All Statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <input v-model="search" type="search" class="search" placeholder="Search events…" />
    </div>

    <div v-if="tab === 'list'" class="chip-row">
      <button type="button" class="chip" :class="{ active: !typeFilter }" @click="typeFilter = ''">All types</button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_back_to_school' }" @click="typeFilter = 'school_back_to_school'">
        Back to School
      </button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_open_house' }" @click="typeFilter = 'school_open_house'">Open House</button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_resource_fair' }" @click="typeFilter = 'school_resource_fair'">Resource Fair</button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_family_night' }" @click="typeFilter = 'school_family_night'">Family Night</button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_orientation' }" @click="typeFilter = 'school_orientation'">Orientation</button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_fall_check_in' }" @click="typeFilter = 'school_fall_check_in'">Fall Check-in</button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_spring_event' }" @click="typeFilter = 'school_spring_event'">Spring Check-in</button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_holiday' }" @click="typeFilter = 'school_holiday'">Holiday</button>
      <button type="button" class="chip" :class="{ active: typeFilter === 'school_day_off' }" @click="typeFilter = 'school_day_off'">Day off</button>
      <button type="button" class="chip" :class="{ active: staffingFilter === 'needs_providers' }" @click="toggleStaffingFilter('needs_providers')">Needs providers</button>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="loading">Loading events…</div>

    <template v-else>
      <div v-if="tab === 'list'" class="kpi-row">
        <div class="kpi"><strong>{{ kpis.totalEvents }}</strong><span>Total Events</span></div>
        <div class="kpi accent"><strong>{{ kpis.backToSchoolEvents }}</strong><span>Back to School</span></div>
        <div class="kpi"><strong>{{ kpis.schoolsInvolved }}</strong><span>Schools Involved</span></div>
        <div class="kpi"><strong>{{ kpis.staffAssigned }}</strong><span>Staff Assigned</span></div>
        <div class="kpi"><strong>{{ kpis.upcomingEvents }}</strong><span>Upcoming</span></div>
        <div class="kpi"><strong>{{ kpis.completedEvents }}</strong><span>Completed</span></div>
      </div>

      <div class="split" :class="{ 'has-selection': !!selectedEvent }">
        <div class="list-panel">
          <div v-if="tab === 'provider-requests'" class="panel-intro">
            <p class="muted">Pending provider applications. Select a row to approve or deny.</p>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th>Date &amp; time <span class="th-tz">(timezone)</span></th>
                <th>Event name</th>
                <th>School</th>
                <th>Event type</th>
                <th>Assigned provider(s)</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in pagedList"
                :key="e.id"
                :class="{ selected: selectedEventId === e.id }"
                @click="selectEvent(e.id)"
              >
                <td>
                  <div class="primary">{{ formatDateLong(e.startsAt, e.timezone) }}</div>
                  <div class="muted time-tz">{{ formatTimeRange(e.startsAt, e.endsAt, e.timezone) }}</div>
                  <div v-if="reportByLabel(e)" class="muted report-by">{{ reportByLabel(e) }}</div>
                </td>
                <td>
                  <div class="name-cell">
                    <span class="primary">{{ e.title }}</span>
                    <span v-if="e.featured" class="featured">Featured</span>
                  </div>
                  <div class="muted clamp">{{ e.description || '—' }}</div>
                </td>
                <td>
                  <div class="primary">{{ e.schoolName || '—' }}</div>
                  <div class="muted">{{ e.districtName || '' }}</div>
                </td>
                <td><span class="type-pill" :class="typeClass(e.eventType)">{{ labelType(e.eventType) }}</span></td>
                <td>
                  <div v-if="(e.assignedProviders || []).length" class="provider-stack">
                    <span
                      v-for="p in (e.assignedProviders || []).slice(0, 3)"
                      :key="p.id"
                      class="avatar"
                      :title="p.name"
                    >{{ initials(p.name) }}</span>
                    <span v-if="e.providersAssigned > 3" class="more">+{{ e.providersAssigned - 3 }}</span>
                    <span class="provider-names">{{ providerNames(e) }}</span>
                  </div>
                  <span v-else-if="e.staffingEnabled" class="muted">Unassigned</span>
                  <span v-else class="muted">Not open</span>
                </td>
                <td>
                  <span class="life" :class="e.lifecycleStatus">{{ labelLifecycle(e.lifecycleStatus) }}</span>
                  <div v-if="e.pendingRequests" class="muted tiny">{{ e.pendingRequests }} pending</div>
                </td>
                <td class="actions-cell" @click.stop>
                  <button type="button" class="btn btn-secondary btn-sm" title="View staffing" @click="selectEvent(e.id)">
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!displayList.length" class="empty">No events found.</p>
          <div v-else class="pager">
            <span class="muted">Showing {{ pageStart }}–{{ pageEnd }} of {{ displayList.length }}</span>
            <div class="pager-btns">
              <button type="button" class="btn btn-secondary btn-sm" :disabled="page <= 1" @click="page -= 1">Prev</button>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="pageEnd >= displayList.length" @click="page += 1">Next</button>
            </div>
          </div>
        </div>

        <SchoolEventStaffingPanel
          v-if="selectedEvent"
          :event="selectedEvent"
          :agency-id="agencyId"
          @close="clearSelection"
          @changed="onStaffingChanged"
        />
        <aside v-else class="detail-placeholder">
          <p>Select an event to review staffing, open applications, approve requests, or apply.</p>
        </aside>
      </div>

      <!-- provider-requests / archived reuse same split above via displayList -->
    </template>

    <!-- Add event: one school or entire district -->
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
      :initial-category="addDistrictName ? 'holiday' : 'back_to_school'"
      @close="showPostModal = false; addDistrictName = ''"
      @saved="onEventSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  formatSchoolEventDate,
  formatSchoolEventTimeRange,
  formatSchoolEventReportTime,
  schoolEventTimezoneLabel,
  timezoneAbbrevAt,
  SCHOOL_EVENT_FALLBACK_TIMEZONE
} from '../../../utils/timezones';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import api from '../../../services/api';
import { fetchHubEvents, fetchSchoolCoverageSummary } from '../../../services/schoolCoverageApi';
import SchoolEventStaffingPanel from '../../../components/caseload-hub/SchoolEventStaffingPanel.vue';
import PostSchoolEventModal from '../../../components/school/PostSchoolEventModal.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const tab = ref(String(route.query.tab || 'list'));
const agencyId = ref(null);
const showKioskSettings = ref(false);
const kioskSettings = ref(null);
const kioskSettingsBusy = ref(false);
const kioskSettingsError = ref('');
const kioskCustomPin = ref('5373');
const agencies = computed(() => agencyStore.agencies || []);
const events = ref([]);
const summary = ref(null);
const schoolOptions = ref([]);
const loading = ref(false);
const error = ref('');
const search = ref('');
const schoolFilter = ref('');
const typeFilter = ref(String(route.query.type || 'school_back_to_school'));
const lifecycleFilter = ref('');
const staffingFilter = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const selectedEventId = ref(null);
const page = ref(1);
const pageSize = 11;
const showAddSchoolPicker = ref(false);
const showPostModal = ref(false);
const addSchoolId = ref(null);
const addScope = ref('school'); // school | district
const addDistrictName = ref('');
const districtOptions = ref([]);
const districtsError = ref('');
const districtsLoadedForAgency = ref(null);

const addSchoolName = computed(() => {
  const id = Number(addSchoolId.value);
  if (!Number.isFinite(id) || id <= 0) return '';
  const match = schoolOptions.value.find((s) => Number(s.id) === id);
  return String(match?.name || '').trim();
});

function orgTo(path) {
  const slug = route.params.organizationSlug;
  if (slug) return `/${slug}${path}`;
  return path;
}

function setTab(id) {
  tab.value = id;
  page.value = 1;
  const q = { ...route.query, tab: id };
  router.replace({ query: q });
  reload();
}

function toggleStaffingFilter(v) {
  staffingFilter.value = staffingFilter.value === v ? '' : v;
  page.value = 1;
}

function labelType(t) {
  const map = {
    school_back_to_school: 'Back to School',
    school_fall_check_in: 'Fall School Check-in',
    school_spring_event: 'Spring School Check-in',
    school_open_house: 'Open House',
    school_resource_fair: 'Resource Fair',
    school_family_night: 'Family Event',
    school_orientation: 'Orientation',
    school_holiday: 'Holiday',
    school_day_off: 'Day off',
    school_other: 'School Event'
  };
  return map[t] || t || 'Event';
}

function typeClass(t) {
  if (t === 'school_back_to_school') return 'bts';
  if (t === 'school_fall_check_in') return 'fall';
  if (t === 'school_resource_fair') return 'fair';
  if (t === 'school_open_house') return 'open';
  if (t === 'school_orientation') return 'orient';
  if (t === 'school_family_night') return 'family';
  if (t === 'school_spring_event') return 'spring';
  if (t === 'school_holiday' || t === 'school_day_off') return 'holiday';
  return 'other';
}

function labelLifecycle(s) {
  if (s === 'upcoming') return 'Upcoming';
  if (s === 'completed') return 'Completed';
  if (s === 'archived') return 'Archived';
  return 'Scheduled';
}

const POLL_MS = 30000;
const pollSeconds = POLL_MS / 1000;
const defaultTimezoneLabel = schoolEventTimezoneLabel(SCHOOL_EVENT_FALLBACK_TIMEZONE);
let pollTimer = null;

function formatDateLong(v, timezone) {
  return formatSchoolEventDate(v, timezone);
}

function formatTimeRange(a, b, timezone) {
  return formatSchoolEventTimeRange(a, b, timezone);
}

function reportByLabel(e) {
  const t = formatSchoolEventReportTime(
    e?.employeeReportTime,
    timezoneAbbrevAt(e?.startsAt || new Date(), e?.timezone)
  );
  return t ? `Report by ${t}` : '';
}

async function loadKioskSettings() {
  if (!agencyId.value) return;
  try {
    kioskSettingsBusy.value = true;
    kioskSettingsError.value = '';
    const res = await api.get('/school-portal/school-events/kiosk-settings', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    kioskSettings.value = res.data || null;
  } catch (e) {
    kioskSettingsError.value = e?.response?.data?.error?.message || 'Failed to load kiosk settings';
  } finally {
    kioskSettingsBusy.value = false;
  }
}

async function rotateKioskPin(customPin = null) {
  if (!agencyId.value) return;
  try {
    kioskSettingsBusy.value = true;
    kioskSettingsError.value = '';
    const body = { agencyId: agencyId.value };
    const pin = customPin != null ? String(customPin).trim() : '';
    if (pin) body.pin = pin;
    const res = await api.post(
      '/school-portal/school-events/kiosk-settings/rotate-pin',
      body,
      { skipGlobalLoading: true }
    );
    kioskSettings.value = res.data || null;
    if (res.data?.pinCode) kioskCustomPin.value = String(res.data.pinCode);
  } catch (e) {
    kioskSettingsError.value = e?.response?.data?.error?.message || 'Failed to rotate PIN';
  } finally {
    kioskSettingsBusy.value = false;
  }
}

async function setCustomKioskPin() {
  const pin = String(kioskCustomPin.value || '').trim();
  if (!/^\d{4,6}$/.test(pin)) {
    kioskSettingsError.value = 'PIN must be 4–6 digits';
    return;
  }
  await rotateKioskPin(pin);
}

watch(showKioskSettings, (open) => {
  if (open) loadKioskSettings();
});

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
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible') reload({ silent: true });
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function providerNames(e) {
  const list = e.assignedProviders || [];
  if (!list.length) return '';
  if (list.length === 1) return list[0].name;
  if (e.providersAssigned > 3) return `${list[0].name} +${e.providersAssigned - 1}`;
  return list.map((p) => p.name.split(' ')[0]).join(', ');
}

const filtered = computed(() => {
  let list = events.value;
  const q = search.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (e) =>
        String(e.title || '').toLowerCase().includes(q) ||
        String(e.schoolName || '').toLowerCase().includes(q) ||
        String(e.description || '').toLowerCase().includes(q)
    );
  }
  if (schoolFilter.value) list = list.filter((e) => String(e.schoolId) === schoolFilter.value);
  if (typeFilter.value) list = list.filter((e) => e.eventType === typeFilter.value);
  if (lifecycleFilter.value) list = list.filter((e) => e.lifecycleStatus === lifecycleFilter.value);
  if (staffingFilter.value) {
    list = list.filter(
      (e) => e.staffingStatus === staffingFilter.value || (staffingFilter.value === 'needs_providers' && e.staffingStatus === 'partially_staffed')
    );
  }
  if (dateFrom.value) {
    const from = new Date(`${dateFrom.value}T00:00:00`).getTime();
    list = list.filter((e) => !e.startsAt || new Date(e.startsAt).getTime() >= from);
  }
  if (dateTo.value) {
    const to = new Date(`${dateTo.value}T23:59:59`).getTime();
    list = list.filter((e) => !e.startsAt || new Date(e.startsAt).getTime() <= to);
  }
  return list;
});

const eventsNeedingReview = computed(() => events.value.filter((e) => Number(e.pendingRequests || 0) > 0));
const pendingTotal = computed(() => events.value.reduce((sum, e) => sum + Number(e.pendingRequests || 0), 0));

const displayList = computed(() => {
  if (tab.value === 'provider-requests') return eventsNeedingReview.value;
  return filtered.value;
});

const kpis = computed(() => {
  const list = filtered.value;
  return {
    totalEvents: list.length,
    backToSchoolEvents: list.filter((e) => e.isBackToSchool || e.eventType === 'school_back_to_school').length,
    schoolsInvolved: new Set(list.map((e) => e.schoolId).filter(Boolean)).size,
    staffAssigned: list.reduce((sum, e) => sum + Number(e.providersAssigned || 0), 0),
    upcomingEvents: list.filter((e) => e.lifecycleStatus === 'upcoming').length,
    completedEvents: list.filter((e) => e.lifecycleStatus === 'completed').length
  };
});

const pageStart = computed(() => (displayList.value.length ? (page.value - 1) * pageSize + 1 : 0));
const pageEnd = computed(() => Math.min(page.value * pageSize, displayList.value.length));
const pagedList = computed(() => displayList.value.slice((page.value - 1) * pageSize, page.value * pageSize));

const selectedEvent = computed(() => events.value.find((e) => e.id === selectedEventId.value) || null);

watch([search, schoolFilter, typeFilter, lifecycleFilter, staffingFilter, dateFrom, dateTo, tab], () => {
  page.value = 1;
});

function selectEvent(id) {
  selectedEventId.value = Number(id);
  router.replace({ query: { ...route.query, eventId: String(id), tab: tab.value } });
}

function clearSelection() {
  selectedEventId.value = null;
  const q = { ...route.query };
  delete q.eventId;
  router.replace({ query: q });
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

function openAddEvent() {
  addScope.value = 'school';
  addDistrictName.value = '';
  addSchoolId.value = schoolFilter.value ? Number(schoolFilter.value) : null;
  showAddSchoolPicker.value = true;
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

async function onEventSaved() {
  showPostModal.value = false;
  addDistrictName.value = '';
  await reload();
}

function exportCsv() {
  const rows = displayList.value;
  const header = ['Date', 'Title', 'School', 'Type', 'Assigned', 'Status', 'Pending'];
  const lines = [header.join(',')];
  for (const e of rows) {
    lines.push(
      [
        e.startsAt ? new Date(e.startsAt).toISOString() : '',
        JSON.stringify(e.title || ''),
        JSON.stringify(e.schoolName || ''),
        e.eventType || '',
        e.providersAssigned || 0,
        e.lifecycleStatus || '',
        e.pendingRequests || 0
      ].join(',')
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'school-events.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function reload({ silent = false } = {}) {
  if (!agencyId.value) return;
  if (!silent) {
    loading.value = true;
    error.value = '';
  }
  try {
    const [data, schools] = await Promise.all([
      fetchHubEvents(agencyId.value, { archived: tab.value === 'archived' }),
      fetchSchoolCoverageSummary(agencyId.value).catch(() => ({ schools: [] }))
    ]);
    events.value = data.events || [];
    summary.value = data.summary || null;
    schoolOptions.value = (schools.schools || [])
      .map((s) => ({
        id: Number(s.schoolId ?? s.id),
        name: String(s.schoolName || s.name || '').trim() || `School ${s.schoolId ?? s.id}`
      }))
      .filter((s) => Number.isFinite(s.id) && s.id > 0)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch (e) {
    if (!silent) {
      error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load events';
    }
  } finally {
    if (!silent) loading.value = false;
  }
}

async function onStaffingChanged() {
  await reload();
}

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
  if (route.query.tab) tab.value = String(route.query.tab);
  if (route.query.eventId) selectedEventId.value = Number(route.query.eventId);
  if (route.query.type !== undefined) typeFilter.value = String(route.query.type || '');
  // Default BTS chip for Event List; clear when deep-linking to provider-requests / archived
  if (tab.value === 'provider-requests' || tab.value === 'archived') typeFilter.value = '';
  await reload();
  if (!selectedEventId.value && tab.value === 'provider-requests' && eventsNeedingReview.value[0]) {
    selectEvent(eventsNeedingReview.value[0].id);
  }
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

watch(
  () => route.query.eventId,
  (v) => {
    if (v) selectedEventId.value = Number(v);
  }
);
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
.th-tz {
  font-weight: 500;
  color: #64748b;
  text-transform: none;
  letter-spacing: 0;
}
.time-tz {
  font-weight: 650;
  color: #334155;
}
.subtitle {
  margin: 0;
  color: #64748b;
}
.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.agency-select,
.filters-bar select,
.filters-bar input,
.range-inputs input,
.search {
  padding: 0.45rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  font-size: 0.875rem;
}
.agency-select.full {
  width: 100%;
  margin: 0.75rem 0 1rem;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  text-decoration: none;
  border: 1px solid transparent;
  font-size: 0.875rem;
  cursor: pointer;
  background: #fff;
}
.btn-sm {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
}
.btn-secondary {
  border-color: #cbd5e1;
  color: #334155;
}
.btn-ghost {
  border-color: transparent;
  color: #475569;
  background: transparent;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hub-tabs {
  display: flex;
  gap: 0.15rem;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 0.85rem;
}
.hub-tab {
  border: 0;
  background: transparent;
  padding: 0.7rem 0.95rem;
  cursor: pointer;
  color: #64748b;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  text-decoration: none;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.hub-tab.active {
  color: #1d4ed8;
  border-bottom-color: #2563eb;
  font-weight: 650;
}
.tab-badge {
  background: #fee2e2;
  color: #991b1b;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
}
.filters-bar {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  align-items: end;
  margin-bottom: 0.65rem;
}
.filter {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
}
.range-inputs {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.search {
  flex: 1;
  min-width: 180px;
  align-self: end;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.85rem;
}
.chip {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.chip.active {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
  font-weight: 650;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}
.kpi {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.kpi strong {
  font-size: 1.45rem;
  letter-spacing: -0.02em;
  color: #0f172a;
}
.kpi span {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}
.kpi.accent {
  border-color: #bfdbfe;
  background: linear-gradient(180deg, #eff6ff, #fff);
}
.split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
.split.has-selection {
  grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.85fr);
}
.list-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 0.35rem 0.65rem 0.75rem;
  min-width: 0;
  overflow: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.data-table th,
.data-table td {
  text-align: left;
  padding: 0.7rem 0.45rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}
.data-table th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}
.data-table tbody tr {
  cursor: pointer;
}
.data-table tbody tr.selected,
.data-table tbody tr:hover {
  background: #f8fafc;
}
.primary {
  font-weight: 650;
  color: #0f172a;
}
.muted {
  color: #64748b;
  font-size: 0.8rem;
}
.tiny {
  font-size: 0.72rem;
}
.clamp {
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.featured {
  font-size: 0.68rem;
  font-weight: 700;
  color: #6d28d9;
  background: #ede9fe;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
}
.type-pill {
  display: inline-flex;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 650;
}
.type-pill.bts {
  background: #dbeafe;
  color: #1d4ed8;
}
.type-pill.fall {
  background: #ffedd5;
  color: #9a3412;
}
.type-pill.fair {
  background: #dcfce7;
  color: #166534;
}
.type-pill.open {
  background: #ffedd5;
  color: #c2410c;
}
.type-pill.orient {
  background: #e0e7ff;
  color: #3730a3;
}
.type-pill.family {
  background: #ccfbf1;
  color: #0f766e;
}
.type-pill.spring {
  background: #ecfccb;
  color: #3f6212;
}
.type-pill.other {
  background: #f1f5f9;
  color: #475569;
}
.type-pill.holiday {
  background: #fef3c7;
  color: #92400e;
}
.scope-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.5rem 0 0.75rem;
}
.provider-stack {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1e40af;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  border: 2px solid #fff;
  margin-left: -6px;
}
.avatar:first-child {
  margin-left: 0;
}
.more {
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
}
.provider-names {
  font-size: 0.78rem;
  color: #334155;
  margin-left: 0.25rem;
}
.life {
  display: inline-flex;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: capitalize;
}
.life.scheduled {
  background: #dbeafe;
  color: #1d4ed8;
}
.life.upcoming {
  background: #ffedd5;
  color: #c2410c;
}
.life.completed {
  background: #e2e8f0;
  color: #475569;
}
.life.archived {
  background: #f1f5f9;
  color: #94a3b8;
}
.actions-cell {
  white-space: nowrap;
}
.icon-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  width: 2rem;
  height: 2rem;
  cursor: pointer;
}
.pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.25rem 0.15rem;
  flex-wrap: wrap;
}
.pager-btns {
  display: flex;
  gap: 0.4rem;
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
.detail-placeholder {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  padding: 1.5rem;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 12rem;
}
.caseload-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
  padding: 1rem;
}
.caseload-modal {
  width: min(32rem, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 1.15rem 1.2rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18);
}
.caseload-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.caseload-modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
}
.caseload-modal-body .muted {
  color: #64748b;
  line-height: 1.4;
}
.kiosk-dl {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 0.45rem 0.75rem;
  margin: 1rem 0;
}
.kiosk-dl dt {
  font-weight: 700;
  color: #475569;
}
.kiosk-dl dd {
  margin: 0;
  word-break: break-all;
}
.kiosk-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.kiosk-set-pin {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.75rem 0 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
}
.kiosk-pin-input {
  max-width: 10rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 1.05rem;
  letter-spacing: 0.12em;
}
.error-inline {
  color: #b91c1c;
}
.icon-btn {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.report-by {
  color: #b45309;
  font-weight: 600;
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
  .kpi-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .split.has-selection {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 700px) {
  .kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
