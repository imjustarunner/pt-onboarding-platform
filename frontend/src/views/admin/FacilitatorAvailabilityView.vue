<template>
  <div class="fav-root">
    <!-- ── Header ────────────────────────────────────────────── -->
    <div class="fav-header">
      <div>
        <h1 class="fav-title">Facilitator Availability</h1>
        <p class="fav-subtitle">Create availability requests, push them to your team, and review responses.</p>
      </div>
      <div class="fav-header-right">
        <!-- Agency selector for super admins or multi-agency users -->
        <div v-if="showAgencySelector" class="fav-agency-selector">
          <label class="fav-agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="fav-agency-select">
            <option v-if="!selectedAgencyId" value="" disabled>— select an agency —</option>
            <option v-for="a in agencyList" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <button class="btn btn-primary" type="button" :disabled="!agencyId" @click="openCreate">+ New Request</button>
      </div>
    </div>

    <!-- ── List of requests ──────────────────────────────────── -->
    <div v-if="loading" class="fav-empty">Loading…</div>
    <div v-else-if="!requests.length" class="fav-empty">
      No availability requests yet. Create one to get started.
    </div>
    <div v-else class="fav-list">
      <div
        v-for="r in requests"
        :key="r.id"
        class="fav-card"
        :class="`fav-card--${r.status}`"
        @click="openDetail(r)"
      >
        <div class="fav-card-main">
          <div class="fav-card-title">{{ r.title }}</div>
          <div v-if="r.subtitle" class="fav-card-sub">{{ r.subtitle }}</div>
          <div class="fav-card-meta">
            <span class="fav-badge" :class="`fav-badge--${r.status}`">{{ r.status }}</span>
            <span v-if="r.deadline" class="fav-meta-item">Deadline: {{ fmtDate(r.deadline) }}</span>
            <span class="fav-meta-item">{{ r.submitted_count }}/{{ r.submission_count }} submitted</span>
          </div>
        </div>
        <div class="fav-card-actions">
          <button
            v-if="r.status === 'active'"
            class="btn btn-sm btn-outline"
            type="button"
            :title="copiedId === r.id ? 'Copied!' : 'Copy shareable link for employees'"
            @click.stop="copyFormLink(r)"
          >
            {{ copiedId === r.id ? '✓ Copied' : '🔗 Copy Link' }}
          </button>
          <button class="btn btn-sm btn-secondary" type="button" @click.stop="openResponses(r)">
            View Responses
          </button>
        </div>
      </div>
    </div>

    <!-- ── Create / Edit drawer ──────────────────────────────── -->
    <div v-if="showDrawer" class="fav-overlay" @click.self="closeDrawer">
      <div class="fav-drawer">
        <div class="fav-drawer-header">
          <h2>{{ editingRequest ? 'Edit Request' : 'New Availability Request' }}</h2>
          <button type="button" class="fav-close" @click="closeDrawer">✕</button>
        </div>

        <div class="fav-drawer-body">
          <!-- Title / subtitle -->
          <label class="fav-label">Title <span class="fav-req">*</span></label>
          <input v-model="form.title" class="fav-input" placeholder="e.g. Summer 2025 Facilitator Availability" maxlength="255" />

          <label class="fav-label">Subtitle</label>
          <input v-model="form.subtitle" class="fav-input" placeholder="Short description shown to employees" maxlength="500" />

          <label class="fav-label">Description / Instructions</label>
          <textarea v-model="form.description" class="fav-input" rows="3" placeholder="Any additional context for your team…" />

          <label class="fav-label">Response Deadline (optional)</label>
          <input v-model="form.deadline" class="fav-input" type="datetime-local" />

          <label class="fav-label fav-label-row">
            <input type="checkbox" v-model="form.onCallEnabled" />
            Include "On-Call" availability option
            <span class="fav-hint">(step in 1.5 hrs before report time)</span>
          </label>

          <!-- Event picker -->
          <div class="fav-section-head">Program Sessions</div>
          <p class="fav-hint">Select the program events employees should indicate availability for. Add locations per session.</p>

          <div v-if="agencyEventsLoading" class="fav-hint">Loading events…</div>
          <div v-else>
            <div
              v-for="ev in agencyEvents"
              :key="ev.id"
              class="fav-event-row"
              :class="{ 'fav-event-row--selected': isEventSelected(ev.id) }"
            >
              <label class="fav-event-check">
                <input type="checkbox" :checked="isEventSelected(ev.id)" @change="toggleEvent(ev)" />
                <span>
                  <strong>{{ ev.title }}</strong>
                  <span v-if="ev._type === 'program'" class="fav-type-badge fav-type-badge--program">Program</span>
                  <span v-else class="fav-type-badge fav-type-badge--event">Event</span>
                  <span v-if="ev.agency_name" class="fav-event-agency">{{ ev.agency_name }}</span>
                  <span v-if="ev.event_date" class="fav-meta-item">{{ fmtDate(ev.event_date) }}<template v-if="ev.end_date"> – {{ fmtDate(ev.end_date) }}</template></span>
                  <span v-if="ev.session_date_count > 0" class="fav-meta-item">{{ ev.session_date_count }} date(s)</span>
                  <span v-if="ev._type === 'program' && ev.site_names && ev.site_names.length" class="fav-meta-item">{{ ev.site_names.length }} site(s) → auto-filled as locations</span>
                </span>
              </label>

              <!-- Location chips for selected events -->
              <div v-if="isEventSelected(ev.id)" class="fav-locations">
                <div class="fav-locations-label">Locations for this session:</div>
                <div class="fav-chips">
                  <span
                    v-for="(loc, idx) in getEventLocations(ev.id)"
                    :key="`loc-${ev.id}-${idx}`"
                    class="fav-chip"
                  >
                    {{ loc }}
                    <button type="button" class="fav-chip-remove" @click="removeLocation(ev.id, idx)">✕</button>
                  </span>
                </div>
                <div class="fav-location-add">
                  <input
                    v-model="locationInputs[ev.id]"
                    class="fav-input fav-input-sm"
                    placeholder="Add location…"
                    @keydown.enter.prevent="addLocation(ev.id)"
                  />
                  <button type="button" class="btn btn-sm btn-secondary" @click="addLocation(ev.id)">Add</button>
                </div>
              </div>
            </div>

            <div v-if="!agencyEvents.length" class="fav-hint">
              No program events found for this agency or its sub-organizations.
            </div>
          </div>
        </div>

        <div class="fav-drawer-footer">
          <div v-if="formError" class="fav-error">{{ formError }}</div>
          <div class="fav-footer-actions">
            <button type="button" class="btn btn-secondary" @click="closeDrawer" :disabled="saving">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveRequest" :disabled="saving">
              {{ saving ? 'Saving…' : (editingRequest ? 'Save Changes' : 'Create Request') }}
            </button>
            <button
              v-if="editingRequest && editingRequest.status !== 'closed'"
              type="button"
              class="btn btn-push"
              @click="pushRequest"
              :disabled="saving || !form.selectedEventIds.length"
            >
              {{ saving ? '…' : (editingRequest.status === 'active' ? 'Re-push to Employees' : 'Push to Employees') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Responses + Schedule modal ──────────────────────────── -->
    <div v-if="showResponses" class="fav-overlay" @click.self="showResponses = false">
      <div class="fav-modal">
        <div class="fav-drawer-header">
          <div>
            <h2>{{ responsesRequest?.title }}</h2>
            <div class="fav-modal-tabs">
              <button
                type="button"
                class="fav-tab"
                :class="{ 'fav-tab--active': modalTab === 'responses' }"
                @click="switchTab('responses')"
              >Responses</button>
              <button
                type="button"
                class="fav-tab"
                :class="{ 'fav-tab--active': modalTab === 'schedule' }"
                @click="switchTab('schedule')"
              >Schedule</button>
            </div>
          </div>
          <button type="button" class="fav-close" @click="showResponses = false">✕</button>
        </div>

        <!-- ── Responses tab ─────────────────────────────────── -->
        <div v-if="modalTab === 'responses'" class="fav-modal-body">
          <div v-if="responsesLoading" class="fav-hint">Loading responses…</div>
          <div v-else-if="!responses.length" class="fav-hint">No responses yet.</div>
          <div v-else>
            <div class="fav-resp-summary">
              <span>{{ responses.filter(r => r.submitted_at).length }} submitted</span>
              <span>{{ responses.filter(r => !r.submitted_at).length }} draft</span>
              <span>{{ responses.filter(r => r.is_on_call).length }} on-call</span>
            </div>

            <div v-for="sub in responses" :key="sub.id" class="fav-resp-row">
              <div class="fav-resp-employee" @click="toggleExpand(sub.id)">
                <div>
                  <strong>{{ sub.first_name }} {{ sub.last_name }}</strong>
                  <span class="fav-meta-item">{{ sub.email }}</span>
                </div>
                <div class="fav-resp-flags">
                  <span v-if="sub.submitted_at" class="fav-badge fav-badge--active">Submitted</span>
                  <span v-else class="fav-badge fav-badge--draft">Draft</span>
                  <span v-if="sub.is_on_call" class="fav-badge fav-badge--oncall">On-Call</span>
                  <span class="fav-expand-icon">{{ expanded.has(sub.id) ? '▲' : '▼' }}</span>
                </div>
              </div>

              <div v-if="expanded.has(sub.id)" class="fav-resp-detail">
                <table class="fav-resp-table" v-if="sub.dateEntries.length">
                  <thead>
                    <tr><th>Date</th><th>Availability</th><th>Comment</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="de in sub.dateEntries" :key="de.id" :class="`fav-row--${de.availability}`">
                      <td>{{ fmtDate(de.entry_date) }}</td>
                      <td class="fav-avail-cell">
                        <span class="fav-avail-pill" :class="`fav-avail--${de.availability}`">{{ de.availability }}</span>
                      </td>
                      <td class="fav-comment-cell">{{ de.comment || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-else class="fav-hint">No date entries recorded.</div>

                <div v-if="sub.locationRanks.length" class="fav-loc-ranks">
                  <div class="fav-loc-ranks-head">Location Preferences</div>
                  <div v-for="lr in sub.locationRanks.slice().sort((a,b) => a.rank_order - b.rank_order)" :key="lr.id" class="fav-loc-rank-row">
                    <span class="fav-rank-num">#{{ lr.rank_order }}</span>
                    <span>{{ lr.location }}</span>
                  </div>
                </div>

                <div v-if="sub.general_notes" class="fav-general-notes">
                  <strong>General notes:</strong> {{ sub.general_notes }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Schedule tab ──────────────────────────────────── -->
        <div v-if="modalTab === 'schedule'" class="fav-modal-body">
          <div v-if="scheduleLoading" class="fav-hint">Loading schedule data…</div>
          <div v-else-if="!scheduleData" class="fav-hint">No scheduling data available.</div>
          <div v-else>
            <div
              v-for="ev in scheduleData.events"
              :key="ev.companyEventId"
              class="fav-sched-event"
            >
              <div class="fav-sched-event-head">{{ ev.eventTitle }}</div>

              <div v-if="!ev.dates.length" class="fav-hint" style="padding:8px 0;">No session dates configured.</div>

              <div
                v-for="d in ev.dates"
                :key="d.sessionDateId"
                class="fav-sched-date"
              >
                <!-- Date header row -->
                <div class="fav-sched-date-head">
                  <div class="fav-sched-date-label">
                    <span class="fav-sched-dow">{{ fmtDow(d.date) }}</span>
                    <span>{{ fmtDate(d.date) }}</span>
                    <span v-if="d.startsAt" class="fav-sched-time">{{ fmtTime(d.startsAt) }}</span>
                  </div>

                  <!-- Slot counter -->
                  <div class="fav-sched-slots">
                    <template v-if="!slotEditMode[slotKey(ev.companyEventId, d.date)]">
                      <span class="fav-slot-count" :class="d.filled >= d.effectiveSlots ? 'fav-slot-full' : 'fav-slot-open'">
                        {{ d.filled }} / {{ d.effectiveSlots }} slots filled
                      </span>
                      <span class="fav-slot-reason">{{ d.override !== null ? 'override' : d.slotReason }}</span>
                      <button type="button" class="fav-slot-edit-btn" @click="startSlotEdit(ev.companyEventId, d)" title="Override slot count">✏️</button>
                    </template>
                    <template v-else>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        class="fav-slot-input"
                        :value="slotEditValues[slotKey(ev.companyEventId, d.date)]"
                        @input="slotEditValues[slotKey(ev.companyEventId, d.date)] = $event.target.value"
                      />
                      <button type="button" class="btn btn-sm btn-primary" @click="saveSlotOverride(ev.companyEventId, d)" :disabled="scheduleActionLoading">Save</button>
                      <button type="button" class="btn btn-sm btn-secondary" @click="clearSlotOverride(ev.companyEventId, d)" :disabled="scheduleActionLoading">Reset to auto</button>
                      <button type="button" class="fav-close fav-slot-cancel" @click="cancelSlotEdit(ev.companyEventId, d.date)">✕</button>
                    </template>
                  </div>
                </div>

                <!-- Assigned employees -->
                <div v-if="d.assigned.length" class="fav-sched-assigned">
                  <div class="fav-sched-section-label">Assigned</div>
                  <div class="fav-assigned-pills">
                    <span
                      v-for="emp in d.assigned"
                      :key="emp.userId"
                      class="fav-assigned-pill"
                    >
                      {{ emp.name }}
                      <button
                        type="button"
                        class="fav-chip-remove"
                        :disabled="scheduleActionLoading"
                        @click="unassign(ev.companyEventId, d, emp)"
                        title="Remove assignment"
                      >✕</button>
                    </span>
                  </div>
                </div>

                <!-- Available pool -->
                <div v-if="d.available.length" class="fav-sched-available">
                  <div class="fav-sched-section-label">
                    Available to assign
                    <span class="fav-sched-fcfs-note">sorted by sign-up time</span>
                  </div>
                  <div class="fav-avail-rows">
                    <div
                      v-for="(emp, empIdx) in d.available"
                      :key="emp.userId"
                      class="fav-avail-row"
                    >
                      <!-- Position / rank -->
                      <span class="fav-avail-rank" :class="empIdx === 0 ? 'fav-avail-rank--first' : ''">
                        #{{ empIdx + 1 }}
                      </span>
                      <div class="fav-avail-info">
                        <span class="fav-avail-name">{{ emp.name }}</span>
                        <span v-if="emp.signedUpAt" class="fav-avail-time">{{ fmtRelTime(emp.signedUpAt) }}</span>
                      </div>
                      <span class="fav-avail-pill fav-avail-pill--sm" :class="`fav-avail--${emp.availability}`">
                        {{ emp.availability === 'slot' ? 'wants slot' : emp.availability }}
                      </span>
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        :disabled="scheduleActionLoading"
                        @click="assign(ev.companyEventId, d, emp)"
                      >
                        {{ d.filled >= d.effectiveSlots ? 'Assign (over)' : 'Assign' }}
                      </button>
                    </div>
                  </div>
                </div>

                <div v-if="!d.assigned.length && !d.available.length" class="fav-hint" style="padding:6px 0 0;">
                  No one has indicated availability for this date yet.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { formatDate } from '../../utils/formatDate';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

// Agency list for the selector: super admins see all agencies; others see their own.
const agencyList = computed(() => {
  const all = isSuperAdmin.value ? agencyStore.agencies : agencyStore.userAgencies;
  return (Array.isArray(all) ? all : []).filter((a) => a?.id && a?.name);
});

// Local selected agency — defaults to currentAgency, falls back to first available.
const selectedAgencyId = ref(agencyStore.currentAgency?.id ?? null);

// Keep in sync when the store's currentAgency changes externally (tenant switcher).
watch(() => agencyStore.currentAgency?.id, (newId) => {
  if (newId && newId !== selectedAgencyId.value) selectedAgencyId.value = newId;
});

// Show the selector whenever there's more than one agency to choose from.
const showAgencySelector = computed(() => agencyList.value.length > 1 || isSuperAdmin.value);

const selectedAgency = computed(() => agencyList.value.find((a) => Number(a.id) === Number(selectedAgencyId.value)) || null);

const agencyId = computed(() => selectedAgencyId.value || null);
const agencyBase = computed(() => `/agencies/${agencyId.value}/facilitator-availability`);

// ── State ─────────────────────────────────────────────────────────────────────
const requests = ref([]);
const loading = ref(false);
const saving = ref(false);
const formError = ref('');
const copiedId = ref(null);

const showDrawer = ref(false);
const editingRequest = ref(null);

const agencyEvents = ref([]);
const agencyEventsLoading = ref(false);

const showResponses = ref(false);
const responsesRequest = ref(null);
const responses = ref([]);
const responsesLoading = ref(false);
const expanded = ref(new Set());

// ── Schedule tab state ───────────────────────────────────────────────────────
const modalTab = ref('responses'); // 'responses' | 'schedule'
const scheduleData = ref(null);
const scheduleLoading = ref(false);
const scheduleActionLoading = ref(false);
const slotEditMode = ref({});   // key → true when editing
const slotEditValues = ref({}); // key → string value during edit

const slotKey = (eventId, date) => `${eventId}__${date}`;

const locationInputs = ref({});

const emptyForm = () => ({
  title: '',
  subtitle: '',
  description: '',
  deadline: '',
  onCallEnabled: true,
  selectedEventIds: [],
  eventLocations: {}  // { [eventId]: string[] }
});

const form = ref(emptyForm());

// ── Helpers ───────────────────────────────────────────────────────────────────

const copyFormLink = async (r) => {
  const agency = selectedAgency.value;
  const slug = agency?.portal_url || agency?.slug || null;
  const base = window.location.origin;
  const path = slug
    ? `/${slug}/facilitator-availability/${r.id}`
    : `/facilitator-availability/${r.id}`;
  const url = `${base}${path}`;
  try {
    await navigator.clipboard.writeText(url);
    copiedId.value = r.id;
    setTimeout(() => { if (copiedId.value === r.id) copiedId.value = null; }, 2500);
  } catch {
    // Fallback for browsers that block clipboard
    window.prompt('Copy this link to share with your team:', url);
  }
};

const fmtRelTime = (iso) => {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt)) return '';
  const diff = Date.now() - dt.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const fmtDate = (d) => formatDate(d) || '';

const fmtDow = (d) => {
  if (!d) return '';
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dt = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString(undefined, { weekday: 'short' });
};

const fmtTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const isEventSelected = (id) => form.value.selectedEventIds.includes(id);

const getEventLocations = (id) => form.value.eventLocations[id] || [];

// Map of event id → full event object so we can pass _type/programId on save
const eventMeta = ref({}); // { [id]: { _type, programId } }

const toggleEvent = (ev) => {
  const idx = form.value.selectedEventIds.indexOf(ev.id);
  if (idx >= 0) {
    form.value.selectedEventIds.splice(idx, 1);
    delete form.value.eventLocations[ev.id];
    delete eventMeta.value[ev.id];
  } else {
    form.value.selectedEventIds.push(ev.id);
    eventMeta.value[ev.id] = { _type: ev._type || 'company_event', programId: ev._type === 'program' ? ev.id : null };
    // Auto-populate site names as locations for programs
    if (ev._type === 'program' && Array.isArray(ev.site_names) && ev.site_names.length) {
      form.value.eventLocations[ev.id] = [...ev.site_names];
    } else if (!form.value.eventLocations[ev.id]) {
      form.value.eventLocations[ev.id] = [];
    }
  }
};

const addLocation = (eventId) => {
  const val = (locationInputs.value[eventId] || '').trim();
  if (!val) return;
  if (!form.value.eventLocations[eventId]) form.value.eventLocations[eventId] = [];
  if (!form.value.eventLocations[eventId].includes(val)) {
    form.value.eventLocations[eventId].push(val);
  }
  locationInputs.value[eventId] = '';
};

const removeLocation = (eventId, idx) => {
  form.value.eventLocations[eventId]?.splice(idx, 1);
};

const toggleExpand = (id) => {
  const s = new Set(expanded.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expanded.value = s;
};

// ── Data loading ──────────────────────────────────────────────────────────────
const loadRequests = async () => {
  if (!agencyId.value) return;
  loading.value = true;
  try {
    const r = await api.get(agencyBase.value);
    requests.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    requests.value = [];
  } finally {
    loading.value = false;
  }
};

const loadAgencyEvents = async () => {
  if (!agencyId.value) return;
  agencyEventsLoading.value = true;
  try {
    const r = await api.get(`${agencyBase.value}/agency-events`);
    agencyEvents.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    agencyEvents.value = [];
  } finally {
    agencyEventsLoading.value = false;
  }
};

const loadResponses = async (request) => {
  if (!agencyId.value) return;
  responsesLoading.value = true;
  try {
    const r = await api.get(`${agencyBase.value}/${request.id}/responses`);
    responses.value = Array.isArray(r.data) ? r.data : [];
    expanded.value = new Set();
  } catch {
    responses.value = [];
  } finally {
    responsesLoading.value = false;
  }
};

const loadSchedule = async (request) => {
  if (!agencyId.value || !request?.id) return;
  scheduleLoading.value = true;
  scheduleData.value = null;
  try {
    const r = await api.get(`${agencyBase.value}/${request.id}/schedule`);
    scheduleData.value = r.data;
  } catch {
    scheduleData.value = null;
  } finally {
    scheduleLoading.value = false;
  }
};

const switchTab = (tab) => {
  modalTab.value = tab;
  if (tab === 'schedule' && !scheduleData.value && responsesRequest.value) {
    loadSchedule(responsesRequest.value);
  }
};

// Slot override helpers
const startSlotEdit = (eventId, d) => {
  const k = slotKey(eventId, d.date);
  slotEditValues.value[k] = String(d.override !== null ? d.override : d.effectiveSlots);
  slotEditMode.value[k] = true;
};

const cancelSlotEdit = (eventId, date) => {
  const k = slotKey(eventId, date);
  slotEditMode.value[k] = false;
};

const saveSlotOverride = async (eventId, d) => {
  if (!responsesRequest.value) return;
  const k = slotKey(eventId, d.date);
  const count = parseInt(slotEditValues.value[k], 10);
  if (!Number.isFinite(count) || count < 0) return;
  scheduleActionLoading.value = true;
  try {
    await api.put(`${agencyBase.value}/${responsesRequest.value.id}/slot-override`, {
      companyEventId: eventId,
      entryDate: d.date,
      slotCount: count
    });
    slotEditMode.value[k] = false;
    await loadSchedule(responsesRequest.value);
  } finally {
    scheduleActionLoading.value = false;
  }
};

const clearSlotOverride = async (eventId, d) => {
  if (!responsesRequest.value) return;
  const k = slotKey(eventId, d.date);
  scheduleActionLoading.value = true;
  try {
    await api.put(`${agencyBase.value}/${responsesRequest.value.id}/slot-override`, {
      companyEventId: eventId,
      entryDate: d.date,
      slotCount: null
    });
    slotEditMode.value[k] = false;
    await loadSchedule(responsesRequest.value);
  } finally {
    scheduleActionLoading.value = false;
  }
};

// Assignment helpers
const assign = async (eventId, d, emp) => {
  if (!responsesRequest.value) return;
  scheduleActionLoading.value = true;
  try {
    const r = await api.post(`${agencyBase.value}/${responsesRequest.value.id}/assign`, {
      companyEventId: eventId,
      sessionDateId: d.sessionDateId,
      userId: emp.userId
    });
    if (r.data?.overCapacity) {
      // Allowed but warn
    }
    await loadSchedule(responsesRequest.value);
  } finally {
    scheduleActionLoading.value = false;
  }
};

const unassign = async (eventId, d, emp) => {
  if (!responsesRequest.value) return;
  scheduleActionLoading.value = true;
  try {
    await api.post(`${agencyBase.value}/${responsesRequest.value.id}/unassign`, {
      companyEventId: eventId,
      sessionDateId: d.sessionDateId,
      userId: emp.userId
    });
    await loadSchedule(responsesRequest.value);
  } finally {
    scheduleActionLoading.value = false;
  }
};

// ── CRUD ──────────────────────────────────────────────────────────────────────
const openCreate = () => {
  editingRequest.value = null;
  form.value = emptyForm();
  formError.value = '';
  showDrawer.value = true;
  loadAgencyEvents();
};

const openDetail = (r) => {
  editingRequest.value = r;
  form.value = {
    title: r.title || '',
    subtitle: r.subtitle || '',
    description: r.description || '',
    deadline: r.deadline ? r.deadline.slice(0, 16) : '',
    onCallEnabled: !!r.on_call_enabled,
    selectedEventIds: [],
    eventLocations: {}
  };
  formError.value = '';
  showDrawer.value = true;
  loadAgencyEvents().then(() => loadRequestEvents(r.id));
};

const loadRequestEvents = async (requestId) => {
  try {
    const r = await api.get(`${agencyBase.value}/${requestId}`);
    const evs = r.data?.events || [];
    for (const ev of evs) {
      form.value.selectedEventIds.push(ev.company_event_id);
      form.value.eventLocations[ev.company_event_id] = Array.isArray(ev.locations_json) ? [...ev.locations_json] : [];
    }
  } catch { /* ignore */ }
};

const openResponses = async (r) => {
  responsesRequest.value = r;
  modalTab.value = 'responses';
  scheduleData.value = null;
  slotEditMode.value = {};
  slotEditValues.value = {};
  showResponses.value = true;
  await loadResponses(r);
};

const closeDrawer = () => {
  showDrawer.value = false;
  editingRequest.value = null;
};

const buildPayload = () => ({
  title: form.value.title.trim(),
  subtitle: form.value.subtitle.trim() || null,
  description: form.value.description.trim() || null,
  onCallEnabled: form.value.onCallEnabled,
  deadline: form.value.deadline || null,
  events: form.value.selectedEventIds.map((id, i) => {
    const meta = eventMeta.value[id] || {};
    const isProgram = meta._type === 'program';
    return {
      _type: meta._type || 'company_event',
      ...(isProgram ? { programId: id } : { companyEventId: id }),
      id,
      locations: form.value.eventLocations[id] || [],
      displayOrder: i
    };
  })
});

const saveRequest = async () => {
  formError.value = '';
  if (!form.value.title.trim()) {
    formError.value = 'Title is required.';
    return;
  }
  saving.value = true;
  try {
    const payload = buildPayload();
    if (editingRequest.value) {
      await api.put(`${agencyBase.value}/${editingRequest.value.id}`, payload);
    } else {
      await api.post(agencyBase.value, payload);
    }
    closeDrawer();
    await loadRequests();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to save request.';
  } finally {
    saving.value = false;
  }
};

const pushRequest = async () => {
  if (!editingRequest.value) return;
  saving.value = true;
  formError.value = '';
  try {
    // Save latest form state first
    await api.put(`${agencyBase.value}/${editingRequest.value.id}`, buildPayload());
    const r = await api.post(`${agencyBase.value}/${editingRequest.value.id}/push`);
    alert(`Pushed to ${r.data?.recipientCount ?? 0} employee(s).`);
    closeDrawer();
    await loadRequests();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Push failed.';
  } finally {
    saving.value = false;
  }
};

// When the admin selects a different agency, reload everything.
watch(selectedAgencyId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    requests.value = [];
    agencyEvents.value = [];
    loadRequests();
  }
});

onMounted(async () => {
  // Ensure agency list is populated for the selector.
  if (isSuperAdmin.value && !agencyStore.agencies.length) {
    await agencyStore.fetchAgencies();
  } else if (!agencyStore.userAgencies.length) {
    await agencyStore.fetchUserAgencies();
  }
  // If nothing is selected yet but a list is now available, pick the first.
  if (!selectedAgencyId.value) {
    const list = isSuperAdmin.value ? agencyStore.agencies : agencyStore.userAgencies;
    if (list.length) selectedAgencyId.value = list[0].id;
  }
  loadRequests();
});
</script>

<style scoped>
.fav-root { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
.fav-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 28px; }
.fav-title { font-size: 1.5rem; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
.fav-subtitle { color: #64748b; margin: 0; font-size: .93rem; }
.fav-empty { text-align: center; color: #94a3b8; padding: 48px 0; }
.fav-list { display: grid; gap: 12px; }

.fav-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; transition: box-shadow .15s; }
.fav-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,.08); }
.fav-card--closed { opacity: .7; }
.fav-card-title { font-weight: 600; font-size: 1.02rem; color: #0f172a; }
.fav-card-sub { color: #64748b; font-size: .88rem; margin-top: 2px; }
.fav-card-meta { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; }

.fav-badge { border-radius: 999px; padding: 2px 10px; font-size: .75rem; font-weight: 600; text-transform: uppercase; }
.fav-badge--draft { background: #f1f5f9; color: #475569; }
.fav-badge--active { background: #dcfce7; color: #166534; }
.fav-badge--closed { background: #f0f0f0; color: #71717a; }
.fav-badge--oncall { background: #dbeafe; color: #1e40af; }

.fav-meta-item { color: #64748b; font-size: .82rem; }

/* Overlay + Drawer */
.fav-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 1300; display: flex; justify-content: flex-end; align-items: stretch; }
.fav-drawer { background: #fff; width: min(540px, 100vw); display: flex; flex-direction: column; height: 100%; box-shadow: -4px 0 24px rgba(15,23,42,.15); overflow: hidden; }
.fav-modal { background: #fff; border-radius: 16px; width: min(780px, 96vw); max-height: 90vh; display: flex; flex-direction: column; margin: auto; box-shadow: 0 20px 56px rgba(15,23,42,.25); }

.fav-drawer-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e2e8f0; }
.fav-drawer-header h2 { font-size: 1.15rem; font-weight: 700; color: #0f172a; margin: 0; }
.fav-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #64748b; padding: 4px; }
.fav-drawer-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 10px; }
.fav-modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
.fav-drawer-footer { padding: 16px 24px; border-top: 1px solid #e2e8f0; }
.fav-footer-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

.fav-label { font-size: .88rem; font-weight: 600; color: #374151; display: block; }
.fav-label-row { display: flex; align-items: center; gap: 8px; }
.fav-req { color: #dc2626; }
.fav-input { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: .9rem; color: #0f172a; background: #fff; box-sizing: border-box; }
.fav-input:focus { outline: 2px solid #3b82f6; border-color: transparent; }
.fav-input-sm { flex: 1; min-width: 0; }
.fav-hint { color: #64748b; font-size: .82rem; }
.fav-error { color: #dc2626; font-size: .87rem; margin-bottom: 8px; }

.fav-section-head { font-weight: 700; font-size: .95rem; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin-top: 4px; }

.fav-event-agency { display: inline-block; font-size: .72rem; font-weight: 600; background: #ede9fe; color: #5b21b6; border-radius: 999px; padding: 1px 8px; margin-left: 6px; vertical-align: middle; }
.fav-event-type { font-style: italic; }
.fav-type-badge { display: inline-block; font-size: .68rem; font-weight: 700; border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; text-transform: uppercase; letter-spacing: .04em; }
.fav-type-badge--program { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.fav-type-badge--event   { background: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd; }
.fav-event-row { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 8px; transition: border-color .15s; }
.fav-event-row--selected { border-color: #3b82f6; background: #f0f7ff; }
.fav-event-check { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
.fav-event-check span { display: flex; flex-direction: column; gap: 2px; }

.fav-locations { margin-top: 10px; }
.fav-locations-label { font-size: .82rem; font-weight: 600; color: #475569; margin-bottom: 6px; }
.fav-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.fav-chip { display: flex; align-items: center; gap: 4px; background: #dbeafe; color: #1e40af; border-radius: 999px; padding: 3px 10px; font-size: .82rem; font-weight: 500; }
.fav-chip-remove { background: none; border: none; color: #3b82f6; cursor: pointer; font-size: .85rem; padding: 0; line-height: 1; }
.fav-location-add { display: flex; gap: 6px; align-items: center; }

/* Response grid */
.fav-resp-summary { display: flex; gap: 16px; padding: 12px 0; font-size: .88rem; color: #475569; border-bottom: 1px solid #f1f5f9; margin-bottom: 12px; }
.fav-resp-row { border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
.fav-resp-employee { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; cursor: pointer; background: #f8fafc; }
.fav-resp-flags { display: flex; gap: 6px; align-items: center; }
.fav-expand-icon { color: #94a3b8; font-size: .8rem; margin-left: 4px; }
.fav-resp-detail { padding: 12px 14px; }
.fav-resp-table { width: 100%; border-collapse: collapse; font-size: .87rem; margin-bottom: 12px; }
.fav-resp-table th { text-align: left; padding: 6px 8px; background: #f1f5f9; font-weight: 600; color: #475569; }
.fav-resp-table td { padding: 6px 8px; border-top: 1px solid #f1f5f9; vertical-align: top; }
.fav-row--available { background: #f0fdf4; }
.fav-row--waitlist { background: #fffbeb; }
.fav-avail-pill { border-radius: 999px; padding: 2px 10px; font-size: .75rem; font-weight: 600; }
.fav-avail--available { background: #dcfce7; color: #166534; }
.fav-avail--waitlist { background: #fef9c3; color: #854d0e; }
.fav-avail--unavailable { background: #f1f5f9; color: #64748b; }
.fav-comment-cell { color: #475569; max-width: 260px; }
.fav-loc-ranks { margin-top: 10px; }
.fav-loc-ranks-head { font-size: .82rem; font-weight: 600; color: #475569; margin-bottom: 6px; }
.fav-loc-rank-row { display: flex; gap: 8px; align-items: center; font-size: .87rem; padding: 4px 0; }
.fav-rank-num { background: #dbeafe; color: #1e40af; border-radius: 999px; min-width: 24px; text-align: center; font-size: .75rem; font-weight: 700; padding: 2px 6px; }
.fav-general-notes { margin-top: 10px; font-size: .87rem; color: #475569; }

.btn { border: none; border-radius: 8px; padding: 8px 18px; font-size: .9rem; font-weight: 600; cursor: pointer; transition: opacity .15s; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-secondary { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; }
.btn-secondary:hover:not(:disabled) { background: #e2e8f0; }
.btn-push { background: #059669; color: #fff; }
.btn-push:hover:not(:disabled) { background: #047857; }
.btn-sm { padding: 5px 12px; font-size: .82rem; }

/* Modal tabs */
.fav-modal-tabs { display: flex; gap: 4px; margin-top: 8px; }
.fav-tab { background: none; border: none; border-bottom: 2px solid transparent; padding: 6px 14px; font-size: .9rem; font-weight: 600; color: #64748b; cursor: pointer; border-radius: 4px 4px 0 0; }
.fav-tab--active { color: #2563eb; border-bottom-color: #2563eb; }
.fav-tab:hover:not(.fav-tab--active) { background: #f8fafc; color: #374151; }

/* Schedule tab */
.fav-sched-event { margin-bottom: 24px; }
.fav-sched-event-head { font-size: 1rem; font-weight: 700; color: #1e3a8a; background: #eff6ff; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
.fav-sched-date { border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
.fav-sched-date-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #f1f5f9; }
.fav-sched-date-label { display: flex; gap: 8px; align-items: baseline; }
.fav-sched-dow { font-weight: 700; font-size: .88rem; color: #374151; }
.fav-sched-time { font-size: .78rem; color: #94a3b8; }
.fav-sched-slots { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fav-slot-count { font-size: .88rem; font-weight: 700; }
.fav-slot-full { color: #dc2626; }
.fav-slot-open { color: #166534; }
.fav-slot-reason { font-size: .75rem; color: #94a3b8; background: #f1f5f9; border-radius: 999px; padding: 2px 8px; }
.fav-slot-edit-btn { background: none; border: none; cursor: pointer; font-size: .85rem; padding: 2px 4px; }
.fav-slot-input { width: 64px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 8px; font-size: .9rem; }
.fav-slot-cancel { align-self: center; }

.fav-sched-assigned, .fav-sched-available { padding: 10px 14px; }
.fav-sched-section-label { font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin-bottom: 6px; }

.fav-assigned-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.fav-assigned-pill { display: flex; align-items: center; gap: 5px; background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 999px; padding: 3px 10px; font-size: .82rem; font-weight: 500; }

.fav-sched-fcfs-note { font-size: .72rem; font-weight: 400; color: #94a3b8; margin-left: 6px; }
.fav-avail-rows { display: grid; gap: 6px; }
.fav-avail-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: #f8fafc; }
.fav-avail-rank { font-size: .78rem; font-weight: 800; color: #94a3b8; width: 26px; text-align: center; flex-shrink: 0; }
.fav-avail-rank--first { color: #16a34a; }
.fav-avail-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.fav-avail-name { font-size: .88rem; color: #0f172a; font-weight: 500; }
.fav-avail-time { font-size: .74rem; color: #94a3b8; }
.fav-avail-pill { border-radius: 999px; padding: 2px 10px; font-size: .75rem; font-weight: 600; }
.fav-avail-pill--sm { font-size: .72rem; padding: 2px 8px; }
.fav-avail--available { background: #dcfce7; color: #166534; }
.fav-avail--waitlist { background: #fef9c3; color: #854d0e; }
.fav-avail--unavailable { background: #f1f5f9; color: #64748b; }

/* Card actions */
.fav-card-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.btn-outline { background: #fff; border: 1.5px solid #6366f1; color: #6366f1; }
.btn-outline:hover { background: #eef2ff; }

/* Agency selector */
.fav-header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.fav-agency-selector { display: flex; align-items: center; gap: 8px; }
.fav-agency-label { font-size: .82rem; font-weight: 600; color: #475569; white-space: nowrap; }
.fav-agency-select {
  font-size: .88rem;
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  cursor: pointer;
  min-width: 180px;
}
.fav-agency-select:focus { outline: 2px solid #6366f1; outline-offset: 1px; }
</style>
