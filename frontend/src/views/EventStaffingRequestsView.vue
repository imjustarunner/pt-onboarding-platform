<template>
  <div class="esr-page">
    <header class="esr-header">
      <div>
        <h1 class="esr-title">Event shift requests</h1>
        <p class="esr-subtitle">
          Browse program events, see who has requested or been booked, and manage staffing.
        </p>
      </div>
      <div class="esr-header-actions">
        <router-link class="btn btn-secondary btn-sm" :to="scheduleHubTo">Schedule hub</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="providerManagementTo">Provider Management</router-link>
        <router-link v-if="orgSlug" class="btn btn-secondary btn-sm" :to="`/${orgSlug}/my-schedule`">
          My Schedule
        </router-link>
        <button type="button" class="btn btn-primary btn-sm" :disabled="loadingEvents" @click="refreshAll">
          {{ loadingEvents ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="loadError" class="esr-error">{{ loadError }}</div>

    <div v-else class="esr-workspace">
      <!-- Left: event queue -->
      <aside class="esr-queue">
        <div class="esr-panel-head">
          <div class="esr-panel-title-row">
            <h2>Events</h2>
            <span class="esr-badge">{{ filteredEvents.length }}</span>
          </div>
          <div class="esr-queue-tools">
            <input
              v-model="searchQuery"
              type="search"
              class="esr-search"
              placeholder="Search events…"
              aria-label="Search events"
            />
            <select v-model="statusFilter" class="esr-filter" aria-label="Filter by staffing status">
              <option value="all">All statuses</option>
              <option value="needs_staff">Needs staff</option>
              <option value="has_requests">Has requests</option>
              <option value="fully_staffed">Fully staffed</option>
            </select>
            <select v-model="sortBy" class="esr-filter" aria-label="Sort events">
              <option value="date_asc">Date (soonest)</option>
              <option value="date_desc">Date (latest)</option>
              <option value="title">Title (A–Z)</option>
            </select>
          </div>
        </div>

        <div v-if="loadingEvents && !eligibleEvents.length" class="esr-empty-inline">Loading events…</div>
        <div v-else-if="!eligibleEvents.length" class="esr-empty-inline">
          No eligible events with staffing signup enabled.
        </div>
        <div v-else-if="!filteredEvents.length" class="esr-empty-inline">No events match your filters.</div>

        <div v-else class="esr-queue-list">
          <button
            v-for="evt in pagedEvents"
            :key="`evt-${evt.id}`"
            type="button"
            class="esr-event-card"
            :class="{ selected: selectedEventId === evt.id }"
            @click="selectEvent(evt.id)"
          >
            <div class="esr-event-icon" :style="iconStyle(evt)">
              <img v-if="schoolIconUrl(evt)" :src="schoolIconUrl(evt)" alt="" @error="onIconError(evt.id)" />
              <span v-else>{{ schoolInitials(evt) }}</span>
            </div>
            <div class="esr-event-main">
              <div class="esr-event-name">{{ evt.title || `Event #${evt.id}` }}</div>
              <div class="esr-event-meta">{{ eventWhenLabel(evt) }}</div>
              <div v-if="eventWhereLabel(evt)" class="esr-event-meta">{{ eventWhereLabel(evt) }}</div>
              <div class="esr-event-stats">
                <span class="esr-stat-pill" :class="staffingTone(evt)">
                  {{ staffingSummaryLabel(evt) }}
                </span>
                <span v-if="pendingRequestCount(evt)" class="esr-stat-pill pending">
                  {{ pendingRequestCount(evt) }} request{{ pendingRequestCount(evt) === 1 ? '' : 's' }}
                </span>
              </div>
            </div>
          </button>
        </div>

        <div v-if="filteredEvents.length > pageSize" class="esr-pagination">
          <span>{{ pageStart }}–{{ pageEnd }} of {{ filteredEvents.length }}</span>
          <div class="esr-pagination-btns">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="page <= 1" @click="page--">Prev</button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="pageEnd >= filteredEvents.length" @click="page++">
              Next
            </button>
          </div>
        </div>
      </aside>

      <!-- Right: detail panel -->
      <section class="esr-detail">
        <div v-if="!selectedEvent" class="esr-empty-detail">
          <div class="esr-empty-title">Select an event</div>
          <p class="muted">Choose an event on the left to see sessions, staffing, and who has requested.</p>
        </div>

        <template v-else>
          <div v-if="sessionsError" class="esr-error">{{ sessionsError }}</div>

          <div class="esr-summary-card">
            <div class="esr-summary-top">
              <div class="esr-summary-head">
                <div class="esr-event-icon esr-event-icon--lg" :style="iconStyle(selectedEvent)">
                  <img
                    v-if="schoolIconUrl(selectedEvent)"
                    :src="schoolIconUrl(selectedEvent)"
                    alt=""
                    @error="onIconError(selectedEvent.id)"
                  />
                  <span v-else>{{ schoolInitials(selectedEvent) }}</span>
                </div>
                <div>
                  <div v-if="!editingEvent" class="esr-detail-title-row">
                    <h2>{{ selectedEvent.title || `Event #${selectedEvent.id}` }}</h2>
                    <button
                      v-if="canEditEvents"
                      type="button"
                      class="esr-icon-btn"
                      title="Edit event details"
                      @click="startEditEvent"
                    >
                      ✎
                    </button>
                  </div>
                  <div v-else class="esr-edit-title">
                    <input v-model="editForm.title" class="esr-input" type="text" placeholder="Event title" />
                  </div>
                  <div class="esr-event-meta">{{ eventWhenLabel(selectedEvent) }}</div>
                  <div v-if="eventWhereLabel(selectedEvent)" class="esr-event-meta">{{ eventWhereLabel(selectedEvent) }}</div>
                  <div v-if="staffingHint" class="esr-event-meta muted">{{ staffingHint }}</div>
                </div>
              </div>
              <div class="esr-detail-actions">
                <button
                  v-if="editingEvent"
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="savingEvent"
                  @click="saveEventEdits"
                >
                  {{ savingEvent ? 'Saving…' : 'Save changes' }}
                </button>
                <button
                  v-if="editingEvent"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="savingEvent"
                  @click="cancelEditEvent"
                >
                  Cancel
                </button>
                <button
                  v-else
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="loadingSessions"
                  @click="refreshSelectedEvent"
                >
                  {{ loadingSessions ? 'Loading…' : 'Refresh' }}
                </button>
              </div>
            </div>

            <div v-if="editingEvent" class="esr-edit-grid">
              <label class="esr-field">
                <span class="esr-label">Location name</span>
                <input v-model="editForm.locationName" class="esr-input" type="text" placeholder="e.g. Main Campus" />
              </label>
              <label class="esr-field">
                <span class="esr-label">Address</span>
                <input v-model="editForm.locationAddress" class="esr-input" type="text" placeholder="Street address" />
              </label>
              <label class="esr-field esr-field--full">
                <span class="esr-label">Description</span>
                <textarea v-model="editForm.description" class="esr-input esr-textarea" rows="3" />
              </label>
            </div>

            <dl v-else-if="selectedEvent.description" class="esr-dl">
              <dt>About</dt>
              <dd>{{ selectedEvent.description }}</dd>
            </dl>
          </div>

          <div v-if="loadingSessions" class="esr-empty-inline">Loading sessions…</div>
          <div v-else-if="!sessionRows.length" class="esr-empty-inline">No sessions found for this event.</div>

          <div v-else class="esr-sessions">
            <div
              v-for="row in sessionRows"
              :key="`sess-${row.sessionDateId}`"
              class="esr-session-card"
            >
              <div class="esr-session-head">
                <div>
                  <h3>{{ sessionDateLabel(row) }}</h3>
                  <div class="esr-event-meta">{{ sessionTimeLabel(row) }}</div>
                </div>
                <div class="esr-session-badges">
                  <span class="esr-stat-pill">{{ row.requiredProviders }} required</span>
                  <span class="esr-stat-pill" :class="row.approvedProvidersCount >= row.requiredProviders ? 'ok' : 'warn'">
                    {{ row.approvedProvidersCount }} booked
                  </span>
                  <span v-if="row.pendingRequests?.length" class="esr-stat-pill pending">
                    {{ row.pendingRequests.length }} pending
                  </span>
                </div>
              </div>

              <div class="esr-session-grid">
                <div class="esr-staff-block">
                  <h4>Booked</h4>
                  <ul v-if="row.approvedProviders?.length" class="esr-people-list">
                    <li v-for="p in row.approvedProviders" :key="`booked-${row.sessionDateId}-${p.id}`">
                      <span class="esr-person-avatar" :style="{ background: avatarColor(p.name) }">{{ initials(p.name) }}</span>
                      <span>{{ p.name }}</span>
                      <span v-if="p.assignmentStatus && p.assignmentStatus !== 'draft'" class="esr-mini-tag">
                        {{ p.assignmentStatus }}
                      </span>
                    </li>
                  </ul>
                  <p v-else class="muted small">No one booked yet.</p>
                </div>

                <div class="esr-staff-block">
                  <h4>Requested</h4>
                  <ul v-if="row.pendingRequests?.length" class="esr-people-list">
                    <li v-for="r in row.pendingRequests" :key="`req-${r.id}`">
                      <span class="esr-person-avatar" :style="{ background: avatarColor(r.providerName) }">
                        {{ initials(r.providerName) }}
                      </span>
                      <span>{{ r.providerName }}</span>
                      <span class="esr-mini-tag">{{ r.requestType }}</span>
                    </li>
                  </ul>
                  <p v-else class="muted small">No pending requests.</p>
                </div>
              </div>

              <div class="esr-session-foot">
                <div class="muted small">
                  Confirmed clients: {{ row.confirmedClientsCount }} · Groups: {{ row.groupCount }}
                </div>
                <div class="esr-session-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="savingSessionDateId === row.sessionDateId || !canRequestType('regular')"
                    @click="requestShift(row.sessionDateId, 'regular')"
                  >
                    Request shift
                  </button>
                  <button
                    v-if="canRequestType('waitlist')"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="savingSessionDateId === row.sessionDateId"
                    @click="requestShift(row.sessionDateId, 'waitlist')"
                  >
                    Waitlist
                  </button>
                  <button
                    v-if="canRequestType('on_call')"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="savingSessionDateId === row.sessionDateId"
                    @click="requestShift(row.sessionDateId, 'on_call')"
                  >
                    On-call
                  </button>
                  <button
                    v-if="row.myRequest && row.myRequest.status === 'pending'"
                    type="button"
                    class="btn btn-link btn-sm"
                    :disabled="savingSessionDateId === row.sessionDateId"
                    @click="withdrawShift(row.myRequest.id)"
                  >
                    Withdraw my request
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useBrandingStore } from '../store/branding';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { formatTimeHm12h } from '../utils/timeFormat';
import { isRequestableCompanyEvent } from '../utils/companyEventStaffing';

const route = useRoute();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''));
const agencyStore = useAgencyStore();
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);
const scheduleHubTo = computed(() => orgTo('/schedule'));
const providerManagementTo = computed(() => ({
  path: orgTo('/admin/provider-availability'),
  query: agencyStore.currentAgency?.id ? { agencyId: String(agencyStore.currentAgency.id) } : {}
}));

const loadingEvents = ref(false);
const loadError = ref('');
const allEvents = ref([]);
const selectedEventId = ref(0);
const searchQuery = ref('');
const statusFilter = ref('all');
const sortBy = ref('date_asc');
const page = ref(1);
const pageSize = 12;
const failedIconIds = ref(new Set());

const loadingSessions = ref(false);
const sessionsError = ref('');
const staffingSummary = ref(null);
const myRequests = ref([]);
const savingSessionDateId = ref(0);

const editingEvent = ref(false);
const savingEvent = ref(false);
const editForm = ref({ title: '', locationName: '', locationAddress: '', description: '' });

const canEditEvents = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'staff', 'support'].includes(role);
});

const eligibleEvents = computed(() => {
  const list = Array.isArray(allEvents.value) ? allEvents.value : [];
  return list.filter((e) => isRequestableCompanyEvent(e));
});

const staffingByEventId = ref(new Map());

const filteredEvents = computed(() => {
  let list = [...eligibleEvents.value];
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((e) => {
      const hay = [
        e.title,
        e.schoolName,
        e.organizationName,
        e.location,
        e.eventLocationName,
        e.eventLocationAddress
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (statusFilter.value === 'needs_staff') {
    list = list.filter((e) => eventNeedsStaff(e));
  } else if (statusFilter.value === 'has_requests') {
    list = list.filter((e) => pendingRequestCount(e) > 0);
  } else if (statusFilter.value === 'fully_staffed') {
    list = list.filter((e) => eventFullyStaffed(e));
  }
  if (sortBy.value === 'title') {
    list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  } else if (sortBy.value === 'date_desc') {
    list.sort((a, b) => eventSortMs(b) - eventSortMs(a));
  } else {
    list.sort((a, b) => eventSortMs(a) - eventSortMs(b));
  }
  return list;
});

const pagedEvents = computed(() => {
  const start = (page.value - 1) * pageSize;
  return filteredEvents.value.slice(start, start + pageSize);
});

const pageStart = computed(() => (filteredEvents.value.length ? (page.value - 1) * pageSize + 1 : 0));
const pageEnd = computed(() => Math.min(page.value * pageSize, filteredEvents.value.length));

const selectedEvent = computed(() => eligibleEvents.value.find((e) => Number(e.id) === Number(selectedEventId.value)) || null);

const staffingHint = computed(() => {
  const cfg = selectedEvent.value?.staffingConfig || null;
  if (!cfg) return '';
  const waitlist = cfg.waitlist?.enabled ? 'Waitlist enabled' : 'Waitlist off';
  const onCall = cfg.onCall?.enabled ? `On-call enabled (${Number(cfg.onCall.leadHours || 0)}h lead)` : 'On-call off';
  return `${waitlist} · ${onCall}`;
});

const myRequestBySessionDateId = computed(() => {
  const map = new Map();
  for (const r of Array.isArray(myRequests.value) ? myRequests.value : []) {
    map.set(Number(r.sessionDateId), r);
  }
  return map;
});

const sessionRows = computed(() => {
  const sessions = Array.isArray(staffingSummary.value?.sessions) ? staffingSummary.value.sessions : [];
  const map = myRequestBySessionDateId.value;
  return sessions.map((s) => ({
    ...s,
    myRequest: map.get(Number(s.sessionDateId)) || null
  }));
});

watch([searchQuery, statusFilter, sortBy], () => {
  page.value = 1;
});

watch(
  () => selectedEventId.value,
  () => {
    editingEvent.value = false;
    loadSelectedEventData();
  }
);

function parseAt(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function eventSortMs(evt) {
  const sess = primarySession(evt);
  return parseAt(sess?.startsAt) || parseAt(evt.startsAt) || parseAt(sess?.sessionDate) || 0;
}

function primarySession(evt) {
  const sessions = Array.isArray(evt?.sessions) ? evt.sessions : [];
  if (!sessions.length) return null;
  return [...sessions].sort((a, b) => (parseAt(a.startsAt) || 0) - (parseAt(b.startsAt) || 0))[0];
}

function formatYmd(value) {
  const ymd = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '—';
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  if (!Number.isFinite(dt.getTime())) return ymd;
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatIsoTime12(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isFinite(d.getTime())) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const s = String(value);
  if (s.length >= 16) return formatTimeHm12h(s.slice(11, 16));
  return formatTimeHm12h(s.slice(0, 5));
}

function sessionDateLabel(row) {
  return formatYmd(row.sessionDate || row.startsAt);
}

function sessionTimeLabel(row) {
  const start = formatIsoTime12(row.startsAt);
  const end = formatIsoTime12(row.endsAt);
  if (start && end) return `${start} – ${end}`;
  return start || end || '—';
}

function eventWhenLabel(evt) {
  const sess = primarySession(evt);
  if (sess) {
    const date = formatYmd(sess.sessionDate || sess.startsAt);
    const time = sessionTimeLabel(sess);
    return time && time !== '—' ? `${date} · ${time}` : date;
  }
  const start = parseAt(evt.startsAt);
  if (!start) return 'Date TBD';
  const end = parseAt(evt.endsAt);
  const date = new Date(start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = end
    ? `${new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function eventWhereLabel(evt) {
  const school = String(evt.schoolName || evt.organizationName || '').trim();
  const loc = String(
    evt.location || evt.eventLocationName || evt.eventLocationAddress || evt.publicLocationAddress || ''
  ).trim();
  if (school && loc && school.toLowerCase() !== loc.toLowerCase()) return `${school} · ${loc}`;
  return school || loc || '';
}

function schoolIconUrl(evt) {
  if (!evt || failedIconIds.value.has(Number(evt.id))) return null;
  const apiLogo = String(evt.schoolLogoUrl || '').trim();
  if (apiLogo) {
    return apiLogo.startsWith('http://') || apiLogo.startsWith('https://') ? apiLogo : toUploadsUrl(apiLogo);
  }
  const orgId = Number(evt.organizationId || 0);
  if (orgId > 0) {
    return brandingStore.getOrganizationOwnIconUrl(orgId) || brandingStore.getOrganizationChromeIconUrl(orgId) || null;
  }
  return null;
}

function onIconError(eventId) {
  failedIconIds.value = new Set([...failedIconIds.value, Number(eventId)]);
}

function schoolInitials(evt) {
  const name = String(evt?.schoolName || evt?.organizationName || evt?.title || '?').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function iconStyle(evt) {
  const hue = (Number(evt?.id || 0) * 47) % 360;
  return { background: `hsl(${hue} 45% 42%)` };
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function avatarColor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * 17) % 360;
  return `hsl(${h} 42% 42%)`;
}

function eventStaffingTotals(evt) {
  const cached = staffingByEventId.value.get(Number(evt.id));
  if (cached) return cached;
  const sessions = Array.isArray(evt.sessions) ? evt.sessions : [];
  let required = 0;
  let approved = 0;
  let pending = 0;
  for (const s of sessions) {
    const req = Number(s.requiredProviders ?? evt.staffingConfig?.minProvidersPerSession ?? 1);
    required += Number.isFinite(req) ? req : 0;
    approved += Number(s.approvedProvidersCount || 0);
  }
  return { required, approved, pending };
}

function pendingRequestCount(evt) {
  const cached = staffingByEventId.value.get(Number(evt.id));
  if (cached) return cached.pending;
  return 0;
}

function eventNeedsStaff(evt) {
  const t = eventStaffingTotals(evt);
  return t.required > 0 && t.approved < t.required;
}

function eventFullyStaffed(evt) {
  const t = eventStaffingTotals(evt);
  return t.required > 0 && t.approved >= t.required;
}

function staffingSummaryLabel(evt) {
  const t = eventStaffingTotals(evt);
  if (!t.required) return 'Staffing open';
  return `${t.approved}/${t.required} booked`;
}

function staffingTone(evt) {
  if (eventFullyStaffed(evt)) return 'ok';
  if (eventNeedsStaff(evt)) return 'warn';
  return '';
}

function selectEvent(id) {
  selectedEventId.value = Number(id);
}

function canRequestType(type) {
  const cfg = selectedEvent.value?.staffingConfig || null;
  if (!cfg?.enabled || !cfg?.providerSignup?.enabled) return false;
  if (type === 'waitlist') return !!cfg?.waitlist?.enabled;
  if (type === 'on_call') return !!cfg?.onCall?.enabled;
  return true;
}

async function loadEvents() {
  loadingEvents.value = true;
  loadError.value = '';
  try {
    const res = await api.get('/me/company-events/calendar', { skipGlobalLoading: true });
    allEvents.value = Array.isArray(res.data) ? res.data : [];
    if (!selectedEventId.value && eligibleEvents.value.length) {
      selectedEventId.value = Number(eligibleEvents.value[0].id);
    } else if (selectedEventId.value && !eligibleEvents.value.some((e) => Number(e.id) === Number(selectedEventId.value))) {
      selectedEventId.value = eligibleEvents.value.length ? Number(eligibleEvents.value[0].id) : 0;
    }
    await prefetchStaffingSummaries();
  } catch (e) {
    allEvents.value = [];
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Could not load events';
  } finally {
    loadingEvents.value = false;
  }
}

async function prefetchStaffingSummaries() {
  const map = new Map();
  const events = eligibleEvents.value.slice(0, 80);
  await Promise.all(
    events.map(async (evt) => {
      try {
        const res = await api.get(`/company-events/${evt.id}/session-staffing-summary`, {
          params: { agencyId: evt.agencyId },
          skipGlobalLoading: true
        });
        const sessions = Array.isArray(res.data?.sessions) ? res.data.sessions : [];
        let required = 0;
        let approved = 0;
        let pending = 0;
        for (const s of sessions) {
          required += Number(s.requiredProviders || 0);
          approved += Number(s.approvedProvidersCount || 0);
          pending += Array.isArray(s.pendingRequests) ? s.pendingRequests.length : 0;
        }
        map.set(Number(evt.id), { required, approved, pending });
      } catch {
        /* ignore prefetch errors */
      }
    })
  );
  staffingByEventId.value = map;
}

async function loadSelectedEventData() {
  const evt = selectedEvent.value;
  if (!evt) {
    staffingSummary.value = null;
    myRequests.value = [];
    sessionsError.value = '';
    return;
  }
  loadingSessions.value = true;
  sessionsError.value = '';
  try {
    const [summaryRes, myReqRes] = await Promise.all([
      api.get(`/company-events/${evt.id}/session-staffing-summary`, {
        params: { agencyId: evt.agencyId },
        skipGlobalLoading: true
      }),
      api.get(`/company-events/${evt.id}/my-session-requests`, {
        params: { agencyId: evt.agencyId },
        skipGlobalLoading: true
      })
    ]);
    staffingSummary.value = summaryRes.data || null;
    myRequests.value = Array.isArray(myReqRes.data?.requests) ? myReqRes.data.requests : [];

    const sessions = Array.isArray(staffingSummary.value?.sessions) ? staffingSummary.value.sessions : [];
    let required = 0;
    let approved = 0;
    let pending = 0;
    for (const s of sessions) {
      required += Number(s.requiredProviders || 0);
      approved += Number(s.approvedProvidersCount || 0);
      pending += Array.isArray(s.pendingRequests) ? s.pendingRequests.length : 0;
    }
    staffingByEventId.value = new Map(staffingByEventId.value).set(Number(evt.id), { required, approved, pending });
  } catch (e) {
    staffingSummary.value = null;
    myRequests.value = [];
    sessionsError.value = e?.response?.data?.error?.message || e?.message || 'Could not load sessions';
  } finally {
    loadingSessions.value = false;
  }
}

async function refreshSelectedEvent() {
  await loadSelectedEventData();
}

async function refreshAll() {
  await loadEvents();
  if (selectedEvent.value) await loadSelectedEventData();
}

async function requestShift(sessionDateId, requestType) {
  const evt = selectedEvent.value;
  const sid = Number(sessionDateId || 0);
  if (!evt || !sid) return;
  savingSessionDateId.value = sid;
  try {
    await api.post(
      `/company-events/${evt.id}/session-requests`,
      { agencyId: evt.agencyId, sessionDateId: sid, requestType },
      { skipGlobalLoading: true }
    );
    await loadSelectedEventData();
  } catch (e) {
    window.alert(e?.response?.data?.error?.message || e?.message || 'Could not submit request');
  } finally {
    savingSessionDateId.value = 0;
  }
}

async function withdrawShift(requestId) {
  const evt = selectedEvent.value;
  const rid = Number(requestId || 0);
  if (!evt || !rid) return;
  savingSessionDateId.value = -1;
  try {
    await api.post(
      `/company-events/${evt.id}/session-requests/${rid}/withdraw`,
      { agencyId: evt.agencyId },
      { skipGlobalLoading: true }
    );
    await loadSelectedEventData();
  } catch (e) {
    window.alert(e?.response?.data?.error?.message || e?.message || 'Could not withdraw request');
  } finally {
    savingSessionDateId.value = 0;
  }
}

function startEditEvent() {
  const evt = selectedEvent.value;
  if (!evt) return;
  editForm.value = {
    title: evt.title || '',
    locationName: evt.eventLocationName || '',
    locationAddress: evt.eventLocationAddress || evt.publicLocationAddress || '',
    description: evt.description || ''
  };
  editingEvent.value = true;
}

function cancelEditEvent() {
  editingEvent.value = false;
}

async function saveEventEdits() {
  const evt = selectedEvent.value;
  if (!evt) return;
  const title = editForm.value.title.trim();
  if (!title) {
    window.alert('Title is required');
    return;
  }
  savingEvent.value = true;
  try {
    const listRes = await api.get(`/agencies/${evt.agencyId}/company-events`, { skipGlobalLoading: true });
    const events = Array.isArray(listRes.data) ? listRes.data : [];
    const current = events.find((e) => Number(e.id) === Number(evt.id));
    if (!current) {
      window.alert('Could not load the current event details to save safely.');
      return;
    }
    const payload = {
      ...current,
      title,
      eventLocationName: editForm.value.locationName.trim(),
      eventLocationAddress: editForm.value.locationAddress.trim(),
      description: editForm.value.description.trim(),
      organizationId: current.organizationId ?? evt.organizationId ?? null,
      staffingConfig: current.staffingConfig ?? evt.staffingConfig ?? null,
      audience: current.audience || { userIds: [], groupIds: [], roleKeys: [] }
    };
    const res = await api.put(`/agencies/${evt.agencyId}/company-events/${evt.id}`, payload, { skipGlobalLoading: true });
    const updated = res.data || {};
    const idx = allEvents.value.findIndex((e) => Number(e.id) === Number(evt.id));
    if (idx >= 0) {
      allEvents.value[idx] = { ...allEvents.value[idx], ...updated };
    }
    editingEvent.value = false;
  } catch (e) {
    window.alert(e?.response?.data?.error?.message || e?.message || 'Could not save event');
  } finally {
    savingEvent.value = false;
  }
}

loadEvents();
</script>

<style scoped>
.esr-page {
  --esr-line: #e2e8f0;
  --esr-muted: #64748b;
  --esr-accent: #0f766e;
  --esr-warn: #c2410c;
  --esr-ok: #15803d;
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 20px 24px 32px;
  box-sizing: border-box;
}
.esr-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.esr-title {
  margin: 0;
  font-size: 1.65rem;
  color: var(--esr-accent);
}
.esr-subtitle {
  margin: 6px 0 0;
  color: var(--esr-muted);
  max-width: 52ch;
}
.esr-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.esr-error {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.esr-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.esr-queue,
.esr-summary-card,
.esr-session-card {
  border: 1px solid var(--esr-line);
  background: #fff;
  border-radius: 14px;
}
.esr-queue {
  overflow: hidden;
}
.esr-panel-head {
  padding: 14px;
  border-bottom: 1px solid var(--esr-line);
}
.esr-panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.esr-panel-title-row h2 {
  margin: 0;
  font-size: 1rem;
}
.esr-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
  font-weight: 800;
}
.esr-queue-tools {
  display: grid;
  gap: 8px;
}
.esr-search,
.esr-filter,
.esr-input {
  width: 100%;
  border: 1px solid var(--esr-line);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
}
.esr-textarea {
  resize: vertical;
  min-height: 72px;
}
.esr-queue-list {
  display: grid;
  gap: 8px;
  padding: 10px;
  max-height: calc(100vh - 280px);
  overflow: auto;
}
.esr-event-card {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: 1px solid var(--esr-line);
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
}
.esr-event-card.selected {
  border-color: var(--esr-accent);
  background: color-mix(in srgb, var(--esr-accent) 8%, #fff);
  box-shadow: inset 0 0 0 1px var(--esr-accent);
}
.esr-event-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  overflow: hidden;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 800;
  font-size: 12px;
  flex-shrink: 0;
}
.esr-event-icon--lg {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  font-size: 14px;
}
.esr-event-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.esr-event-name {
  font-weight: 750;
  line-height: 1.3;
}
.esr-event-meta {
  color: var(--esr-muted);
  font-size: 12px;
  line-height: 1.35;
  margin-top: 2px;
}
.esr-event-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.esr-stat-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
  background: #f1f5f9;
  color: #475569;
}
.esr-stat-pill.warn {
  background: #ffedd5;
  color: var(--esr-warn);
}
.esr-stat-pill.ok {
  background: #dcfce7;
  color: var(--esr-ok);
}
.esr-stat-pill.pending {
  background: #fef9c3;
  color: #a16207;
}
.esr-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--esr-line);
  font-size: 12px;
  color: var(--esr-muted);
}
.esr-pagination-btns {
  display: flex;
  gap: 6px;
}
.esr-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.esr-empty-detail,
.esr-empty-inline {
  border: 1px dashed var(--esr-line);
  border-radius: 14px;
  padding: 24px 16px;
  color: var(--esr-muted);
  text-align: center;
}
.esr-empty-title {
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
}
.esr-summary-card {
  padding: 16px;
}
.esr-summary-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.esr-summary-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}
.esr-detail-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.esr-detail-title-row h2 {
  margin: 0 0 4px;
  font-size: 1.25rem;
}
.esr-icon-btn {
  border: 1px solid var(--esr-line);
  background: #fff;
  border-radius: 8px;
  width: 30px;
  height: 30px;
  cursor: pointer;
  color: var(--esr-muted);
}
.esr-detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.esr-edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}
.esr-field--full {
  grid-column: 1 / -1;
}
.esr-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--esr-muted);
  margin-bottom: 4px;
}
.esr-dl {
  margin: 14px 0 0;
}
.esr-dl dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--esr-muted);
  font-weight: 700;
}
.esr-dl dd {
  margin: 4px 0 0;
}
.esr-sessions {
  display: grid;
  gap: 12px;
}
.esr-session-card {
  padding: 14px;
}
.esr-session-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.esr-session-head h3 {
  margin: 0 0 4px;
  font-size: 1rem;
}
.esr-session-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.esr-session-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.esr-staff-block h4 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--esr-muted);
}
.esr-people-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.esr-people-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.esr-person-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}
.esr-mini-tag {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--esr-muted);
  background: #f8fafc;
  border: 1px solid var(--esr-line);
  border-radius: 999px;
  padding: 2px 6px;
}
.esr-session-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--esr-line);
}
.esr-session-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
@media (max-width: 960px) {
  .esr-workspace {
    grid-template-columns: 1fr;
  }
  .esr-queue-list {
    max-height: 320px;
  }
  .esr-session-grid,
  .esr-edit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
