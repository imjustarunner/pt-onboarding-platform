<template>
  <aside class="staffing-panel" data-tour="school-event-staffing">
    <header class="panel-head">
      <div>
        <h2>{{ event?.title || 'Event staffing' }}</h2>
        <p class="muted">
          {{ event?.schoolName || 'Unassigned school' }}
          <span v-if="event?.startsAt"> · {{ formatWhen(event.startsAt, event.endsAt, event.timezone) }}</span>
          <span v-if="reportByText" class="report-by"> · {{ reportByText }}</span>
        </p>
      </div>
      <div class="head-actions">
        <button
          v-if="canEditDetails && canEditEvent"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="openEdit"
        >
          {{ event?.districtBroadcastId ? 'Edit district event' : 'Edit event' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('close')">Close</button>
      </div>
    </header>

    <div v-if="!event" class="muted pad">Select an event to manage staffing.</div>
    <div v-else-if="loading" class="muted pad">Loading staffing…</div>
    <div v-else-if="error" class="error pad">{{ error }}</div>

    <template v-else>
      <div v-if="!isCalendarOnlyEvent" class="status-row">
        <span class="sev" :class="sevClass(headerStaffingStatus)">{{ labelStatus(headerStaffingStatus) }}</span>
        <span class="muted">
          {{ liveProvidersAssigned }}/{{ providersNeededDisplay }} assigned
          <template v-if="livePendingRequests"> · {{ livePendingRequests }} pending</template>
        </span>
      </div>
      <div v-else class="status-row">
        <span class="sev informational">Calendar only</span>
        <span class="muted">Not an attendable / staffable event</span>
      </div>

      <div v-if="isCalendarOnlyEvent" class="enable-box">
        <p>
          This is a calendar-only date (not an attendable event). Provider staffing and assignment requests are not
          used for holidays, days off, first day of school, or fall/spring school check-ins.
        </p>
      </div>

      <template v-else>
      <div v-if="canManage" class="providers-needed-row">
        <label>
          <span class="lbl">Providers needed</span>
          <input
            v-model.number="providersNeededDraft"
            type="number"
            min="1"
            max="99"
            class="input-sm"
            :disabled="savingProvidersNeeded"
          />
        </label>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="savingProvidersNeeded || !providersNeededChanged"
          @click="saveProvidersNeeded"
        >
          {{ savingProvidersNeeded ? 'Saving…' : 'Save' }}
        </button>
      </div>

      <div v-if="!staffingOpen" class="enable-box">
        <p>
          Provider applications are not open for this event yet. Opening staffing creates session dates and lets
          providers apply; you can also assign staff directly once open.
        </p>
        <button
          v-if="canManage"
          type="button"
          class="btn btn-primary"
          :disabled="enabling"
          @click="enableStaffing"
        >
          {{ enabling ? 'Opening…' : 'Open for provider applications' }}
        </button>
        <p v-else class="muted">Ask an administrator to open this event for applications.</p>
      </div>

      <template v-else>
        <p v-if="canManage" class="hint">
          Edit the event details above, assign providers directly below, or approve pending applications.
        </p>
        <p v-else-if="canApply && viewerIsAssigned" class="hint">
          You are assigned to this event. Assigned providers on this shift are listed below.
        </p>
        <p v-else-if="canApply" class="hint">
          Request to be assigned below. An administrator will approve or deny your request.
        </p>

        <section v-for="s in sessions" :key="s.sessionDateId" class="session-card">
          <div class="session-head">
            <strong>{{ formatSession(s) }}</strong>
            <span v-if="canManage || !isAssigned(s)" class="muted">
              {{ s.approvedProvidersCount || 0 }}/{{ s.requiredProviders || 0 }} assigned
              <template v-if="pendingCount(s)"> · {{ pendingCount(s) }} pending</template>
            </span>
          </div>

          <div v-if="(s.approvedProviders || []).length" class="chip-row">
            <span v-for="p in s.approvedProviders" :key="p.id" class="chip assigned">
              {{ p.name }}
              <button
                v-if="canManage"
                type="button"
                class="chip-x"
                title="Remove assignment"
                :disabled="unassigningKey === assignKey(s.sessionDateId, p.id)"
                @click="unassign(s.sessionDateId, p)"
              >
                ×
              </button>
            </span>
          </div>
          <p v-else class="muted tiny">No providers assigned yet.</p>

          <div v-if="canManage" class="assign-row">
            <select
              v-model="assignPick[s.sessionDateId]"
              class="assign-select"
              :disabled="assigningSessionId === s.sessionDateId"
            >
              <option value="">Assign someone…</option>
              <option
                v-for="p in assignableProviders(s)"
                :key="p.id"
                :value="String(p.id)"
              >
                {{ p.name }}{{ p.role ? ` (${p.role})` : '' }}
              </option>
            </select>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!assignPick[s.sessionDateId] || assigningSessionId === s.sessionDateId"
              @click="assign(s.sessionDateId)"
            >
              {{ assigningSessionId === s.sessionDateId ? 'Assigning…' : 'Assign' }}
            </button>
          </div>

          <div v-if="canManage" class="requests">
            <h4>Assignment requests</h4>
            <div v-if="sessionRequestsLoading[s.sessionDateId]" class="muted tiny">Loading…</div>
            <ul v-else class="req-list">
              <li v-for="r in requestsFor(s.sessionDateId)" :key="r.id" class="req-row">
                <div>
                  <div class="primary">{{ r.providerName }}</div>
                  <div class="muted tiny">
                    {{ String(r.status).toLowerCase() === 'pending' ? 'Requested' : r.status }}
                    <template v-if="r.requestType"> · {{ r.requestType }}</template>
                  </div>
                </div>
                <div v-if="String(r.status).toLowerCase() === 'pending'" class="req-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="decisionId === r.id"
                    @click="approve(r)"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="decisionId === r.id"
                    @click="deny(r)"
                  >
                    Deny
                  </button>
                </div>
              </li>
              <li v-if="!requestsFor(s.sessionDateId).length" class="muted tiny">No assignment requests yet.</li>
            </ul>
          </div>

          <div v-if="canApply && !canManage" class="apply-row">
            <template v-if="isAssigned(s)">
              <span class="pill assigned-pill">Assigned</span>
            </template>
            <template v-else-if="myRequestFor(s.sessionDateId)">
              <span class="pill">Your request: {{ myRequestFor(s.sessionDateId).status }}</span>
              <button
                v-if="String(myRequestFor(s.sessionDateId).status).toLowerCase() === 'pending'"
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="savingSessionId === s.sessionDateId"
                @click="withdraw(myRequestFor(s.sessionDateId).id)"
              >
                Withdraw
              </button>
            </template>
            <button
              v-else
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="savingSessionId === s.sessionDateId"
              @click="apply(s.sessionDateId)"
            >
              {{ savingSessionId === s.sessionDateId ? 'Requesting…' : 'Request to be assigned' }}
            </button>
          </div>
        </section>

        <p v-if="!sessions.length" class="muted pad">
          No session dates yet. Try opening staffing again, or edit the event dates.
        </p>
      </template>
      </template>

      <p v-if="actionMsg" class="apply-msg">{{ actionMsg }}</p>
      <p v-if="actionError" class="error">{{ actionError }}</p>
    </template>

    <PostSchoolEventModal
      v-if="showEditModal && editSchoolOrgId"
      :school-organization-id="editSchoolOrgId"
      :school-name="event?.schoolName || ''"
      :agency-id="agencyId"
      :district-name="event?.districtName || ''"
      :edit-event="editEventPayload"
      :initial-category="editEventPayload?.category || 'back_to_school'"
      @close="showEditModal = false"
      @saved="onEventSaved"
    />
  </aside>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { enableSchoolEventStaffing, fetchProviderCoverageSummary } from '../../services/schoolCoverageApi';
import {
  formatSchoolEventWhen,
  formatSchoolEventReportTime,
  timezoneAbbrevAt
} from '../../utils/timezones';
import PostSchoolEventModal from '../school/PostSchoolEventModal.vue';

const props = defineProps({
  event: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'changed']);

const authStore = useAuthStore();
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
/** Matches company-event staffing manage roles (approve/assign). */
const canManage = computed(() =>
  ['super_admin', 'admin', 'support', 'staff'].includes(role.value)
);
/** School portal event edit (time/title/etc.) — includes CPA / assigned provider-like roles. */
const canEditDetails = computed(() =>
  [
    'super_admin',
    'admin',
    'support',
    'staff',
    'clinical_practice_assistant',
    'provider_plus',
    'provider',
    'intern',
    'intern_plus',
    'school_staff'
  ].includes(role.value)
);
const CALENDAR_ONLY_EVENT_TYPES = new Set([
  'school_holiday',
  'school_day_off',
  'school_first_day',
  'school_fall_check_in',
  'school_spring_event'
]);
const isCalendarOnlyEvent = computed(() =>
  CALENDAR_ONLY_EVENT_TYPES.has(String(props.event?.eventType || '').trim().toLowerCase())
);
const canApply = computed(() =>
  // School staff can post/edit events but cannot request assignment.
  role.value !== 'school_staff' &&
  !isCalendarOnlyEvent.value &&
  [
    'provider',
    'provider_plus',
    'intern',
    'intern_plus',
    'clinical_practice_assistant',
    'admin',
    'support',
    'staff',
    'super_admin'
  ].includes(role.value)
);

const loading = ref(false);
const enabling = ref(false);
const error = ref('');
const actionMsg = ref('');
const actionError = ref('');
const staffingSummary = ref(null);
const myRequests = ref([]);
const sessionRequests = ref({});
const sessionRequestsLoading = ref({});
const decisionId = ref(0);
const savingSessionId = ref(0);
const assigningSessionId = ref(0);
const unassigningKey = ref('');
const assignPick = reactive({});
const providerOptions = ref([]);
const showEditModal = ref(false);
const providersNeededDraft = ref(1);
const savingProvidersNeeded = ref(false);

const sessions = computed(() => staffingSummary.value?.sessions || []);
const staffingOpen = computed(() => {
  if (props.event?.staffingEnabled) return true;
  const cfg = staffingSummary.value?.staffingConfig;
  return !!(cfg && cfg.enabled !== false);
});

const providersNeededDisplay = computed(() => {
  const fromCfg = Number(staffingSummary.value?.staffingConfig?.minProvidersPerSession);
  if (Number.isFinite(fromCfg) && fromCfg >= 1) return fromCfg;
  return Math.max(1, Number(props.event?.providersRequested || props.event?.minProvidersPerSession || 1));
});

/** Prefer live session totals so the header updates after approve/assign. */
const liveProvidersAssigned = computed(() => {
  const sess = sessions.value;
  if (sess.length) {
    const ids = new Set();
    for (const s of sess) {
      for (const p of s.approvedProviders || []) {
        if (p?.id != null) ids.add(Number(p.id));
      }
    }
    if (ids.size) return ids.size;
    return sess.reduce((sum, s) => Math.max(sum, Number(s.approvedProvidersCount || 0)), 0);
  }
  return Number(props.event?.providersAssigned || 0);
});

const livePendingRequests = computed(() => {
  const sess = sessions.value;
  if (sess.length) {
    return sess.reduce((sum, s) => sum + pendingCount(s), 0);
  }
  return Number(props.event?.pendingRequests || 0);
});

const headerStaffingStatus = computed(() => {
  if (!staffingOpen.value) return props.event?.staffingStatus || 'scheduled';
  const needed = providersNeededDisplay.value;
  const assigned = liveProvidersAssigned.value;
  const pending = livePendingRequests.value;
  if (assigned >= needed) return 'fully_staffed';
  if (pending > 0) return 'requests_pending';
  if (assigned > 0) return 'partially_staffed';
  return 'needs_providers';
});

const viewerIsAssigned = computed(() => sessions.value.some((s) => isAssigned(s)));

const providersNeededChanged = computed(() => {
  return Math.max(1, Number(providersNeededDraft.value) || 1) !== providersNeededDisplay.value;
});

const editSchoolOrgId = computed(() => {
  const id = Number(props.event?.schoolId || props.event?.organizationId || 0);
  return id || null;
});

const canEditEvent = computed(() => !!editSchoolOrgId.value);

function eventTypeToCategory(eventType) {
  const t = String(eventType || '').trim().toLowerCase();
  const map = {
    school_back_to_school: 'back_to_school',
    school_fall_check_in: 'fall_check_in',
    school_spring_event: 'spring',
    school_first_day: 'first_day',
    school_open_house: 'open_house',
    school_resource_fair: 'resource_fair',
    school_family_night: 'family_night',
    school_orientation: 'orientation',
    school_holiday: 'holiday',
    school_day_off: 'day_off',
    school_other: 'other'
  };
  return map[t] || props.event?.category || 'other';
}

const editEventPayload = computed(() => {
  const e = props.event;
  if (!e?.id) return null;
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    category: eventTypeToCategory(e.eventType),
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    timezone: e.timezone,
    employeeReportTime: e.employeeReportTime || null,
    skillBuilderDirectHours: e.skillBuilderDirectHours != null ? Number(e.skillBuilderDirectHours) : 0,
    minProvidersPerSession: providersNeededDisplay.value,
    schoolEventStatus: e.schoolEventStatus || 'scheduled',
    outreachTableInvited: !!e.outreachTableInvited,
    flierFileUrl: e.flierFileUrl || '',
    eventImageUrl: e.eventImageUrl || '',
    detailsUrl: e.detailsUrl || '',
    districtBroadcastId: e.districtBroadcastId || null,
    districtName: e.districtName || '',
    schoolName: e.schoolName || ''
  };
});

const reportByText = computed(() => {
  const e = props.event;
  const t = formatSchoolEventReportTime(
    e?.employeeReportTime,
    timezoneAbbrevAt(e?.startsAt || new Date(), e?.timezone)
  );
  return t ? `Report by ${t}` : '';
});

function labelStatus(s) {
  return String(s || 'scheduled').replace(/_/g, ' ');
}
function sevClass(s) {
  if (s === 'needs_providers' || s === 'partially_staffed') return 'critical';
  if (s === 'requests_pending') return 'moderate';
  if (s === 'fully_staffed') return 'informational';
  return 'informational';
}
function formatWhen(a, b, timezone) {
  return formatSchoolEventWhen(a, b, timezone || props.event?.timezone);
}
function formatSession(s) {
  return (
    formatSchoolEventWhen(
      s.startsAt || s.sessionDate,
      s.endsAt || null,
      s.timezone || props.event?.timezone
    ) || `Session ${s.sessionDateId}`
  );
}
function pendingCount(s) {
  const p = s?.requestStats?.pending || {};
  return Number(p.regular || 0) + Number(p.waitlist || 0) + Number(p.on_call || 0);
}
function requestsFor(sessionDateId) {
  return sessionRequests.value[sessionDateId] || [];
}
function myRequestFor(sessionDateId) {
  return myRequests.value.find((r) => Number(r.sessionDateId) === Number(sessionDateId)) || null;
}
function isAssigned(s) {
  const uid = Number(authStore.user?.id || 0);
  return (s.approvedProviders || []).some((p) => Number(p.id) === uid);
}
function assignKey(sessionDateId, providerId) {
  return `${sessionDateId}:${providerId}`;
}
function assignableProviders(session) {
  const assignedIds = new Set((session.approvedProviders || []).map((p) => Number(p.id)));
  return providerOptions.value.filter((p) => !assignedIds.has(Number(p.id)));
}

function openEdit() {
  if (!canEditEvent.value) {
    actionError.value = 'This event is not linked to a school, so it cannot be edited here.';
    return;
  }
  showEditModal.value = true;
}

async function onEventSaved() {
  showEditModal.value = false;
  actionMsg.value = 'Event updated.';
  emit('changed');
  await reload();
}

async function loadProviders() {
  if (!canManage.value || !props.agencyId) {
    providerOptions.value = [];
    return;
  }
  try {
    const data = await fetchProviderCoverageSummary(props.agencyId);
    const list = (data.providers || []).map((p) => ({
      id: Number(p.providerId || p.id),
      name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || `Provider ${p.providerId}`,
      role: p.role || ''
    }));
    // Prefer providers tied to this school first
    const schoolId = Number(props.event?.schoolId || 0);
    if (schoolId) {
      list.sort((a, b) => {
        const ap = (data.providers || []).find((x) => Number(x.providerId) === a.id);
        const bp = (data.providers || []).find((x) => Number(x.providerId) === b.id);
        const aAt = (ap?.schools || []).some((s) => Number(s.schoolId) === schoolId) ? 0 : 1;
        const bAt = (bp?.schools || []).some((s) => Number(s.schoolId) === schoolId) ? 0 : 1;
        if (aAt !== bAt) return aAt - bAt;
        return String(a.name).localeCompare(String(b.name));
      });
    } else {
      list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    providerOptions.value = list.filter((p) => p.id);
  } catch {
    providerOptions.value = [];
  }
}

async function loadAdminRequests(sessionDateId) {
  if (!canManage.value || !props.agencyId || !props.event?.id) return;
  sessionRequestsLoading.value = { ...sessionRequestsLoading.value, [sessionDateId]: true };
  try {
    const res = await api.get(`/company-events/${props.event.id}/session-requests`, {
      params: { agencyId: props.agencyId, sessionDateId },
      skipGlobalLoading: true
    });
    sessionRequests.value = {
      ...sessionRequests.value,
      [sessionDateId]: Array.isArray(res.data?.requests) ? res.data.requests : []
    };
  } catch {
    sessionRequests.value = { ...sessionRequests.value, [sessionDateId]: [] };
  } finally {
    sessionRequestsLoading.value = { ...sessionRequestsLoading.value, [sessionDateId]: false };
  }
}

async function reload() {
  actionError.value = '';
  if (!props.event?.id || !props.agencyId) {
    staffingSummary.value = null;
    myRequests.value = [];
    sessionRequests.value = {};
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [summaryRes, myRes] = await Promise.all([
      api.get(`/company-events/${props.event.id}/session-staffing-summary`, {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      }),
      canApply.value
        ? api.get(`/company-events/${props.event.id}/my-session-requests`, {
            params: { agencyId: props.agencyId },
            skipGlobalLoading: true
          })
        : Promise.resolve({ data: { requests: [] } }),
      loadProviders()
    ]);
    staffingSummary.value = summaryRes.data || null;
    myRequests.value = Array.isArray(myRes.data?.requests) ? myRes.data.requests : [];
    const sess = staffingSummary.value?.sessions || [];
    for (const s of sess) {
      if (assignPick[s.sessionDateId] === undefined) assignPick[s.sessionDateId] = '';
    }
    if (canManage.value) {
      await Promise.all(sess.map((s) => loadAdminRequests(s.sessionDateId)));
    }
  } catch (e) {
    staffingSummary.value = null;
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load staffing';
  } finally {
    loading.value = false;
  }
}

async function enableStaffing() {
  if (!props.event?.id || !props.agencyId) return;
  enabling.value = true;
  actionError.value = '';
  actionMsg.value = '';
  try {
    await enableSchoolEventStaffing(props.agencyId, props.event.id, {
      minProvidersPerSession: Math.max(1, Number(providersNeededDraft.value) || 1)
    });
    actionMsg.value = 'Event opened for provider applications.';
    emit('changed');
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Could not open staffing';
  } finally {
    enabling.value = false;
  }
}

async function saveProvidersNeeded() {
  const schoolId = editSchoolOrgId.value;
  if (!props.event?.id || !schoolId) return;
  const n = Math.max(1, Math.min(99, Number(providersNeededDraft.value) || 1));
  savingProvidersNeeded.value = true;
  actionError.value = '';
  actionMsg.value = '';
  try {
    if (staffingOpen.value) {
      await enableSchoolEventStaffing(props.agencyId, props.event.id, { minProvidersPerSession: n });
    } else {
      await api.put(`/school-portal/${schoolId}/school-events/${props.event.id}`, {
        minProvidersPerSession: n
      });
    }
    providersNeededDraft.value = n;
    actionMsg.value = `Providers needed set to ${n}.`;
    emit('changed');
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Could not update providers needed';
  } finally {
    savingProvidersNeeded.value = false;
  }
}

async function assign(sessionDateId) {
  const providerUserId = Number(assignPick[sessionDateId] || 0);
  if (!providerUserId || !props.event?.id) return;
  assigningSessionId.value = sessionDateId;
  actionError.value = '';
  actionMsg.value = '';
  try {
    const res = await api.post(
      `/company-events/${props.event.id}/session-providers/assign`,
      { agencyId: props.agencyId, sessionDateId, providerUserId },
      { skipGlobalLoading: true }
    );
    actionMsg.value = `Assigned ${res.data?.provider?.name || 'provider'}.`;
    assignPick[sessionDateId] = '';
    emit('changed');
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Could not assign provider';
  } finally {
    assigningSessionId.value = 0;
  }
}

async function unassign(sessionDateId, provider) {
  if (!props.event?.id || !provider?.id) return;
  unassigningKey.value = assignKey(sessionDateId, provider.id);
  actionError.value = '';
  actionMsg.value = '';
  try {
    await api.post(
      `/company-events/${props.event.id}/session-providers/unassign`,
      {
        agencyId: props.agencyId,
        sessionDateId,
        providerUserId: provider.id
      },
      { skipGlobalLoading: true }
    );
    actionMsg.value = `Removed ${provider.name}.`;
    emit('changed');
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Could not remove assignment';
  } finally {
    unassigningKey.value = '';
  }
}

async function apply(sessionDateId) {
  savingSessionId.value = sessionDateId;
  actionError.value = '';
  actionMsg.value = '';
  try {
    await api.post(
      `/company-events/${props.event.id}/session-requests`,
      { agencyId: props.agencyId, sessionDateId, requestType: 'regular' },
      { skipGlobalLoading: true }
    );
    actionMsg.value = 'Application submitted. An admin will review it.';
    emit('changed');
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Could not apply';
  } finally {
    savingSessionId.value = 0;
  }
}

async function withdraw(requestId) {
  savingSessionId.value = -1;
  actionError.value = '';
  try {
    await api.post(
      `/company-events/${props.event.id}/session-requests/${requestId}/withdraw`,
      { agencyId: props.agencyId },
      { skipGlobalLoading: true }
    );
    actionMsg.value = 'Application withdrawn.';
    emit('changed');
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Could not withdraw';
  } finally {
    savingSessionId.value = 0;
  }
}

async function approve(reqRow) {
  decisionId.value = reqRow.id;
  actionError.value = '';
  try {
    await api.post(
      `/company-events/${props.event.id}/session-requests/${reqRow.id}/approve`,
      { agencyId: props.agencyId },
      { skipGlobalLoading: true }
    );
    actionMsg.value = `Approved ${reqRow.providerName}.`;
    emit('changed');
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Could not approve';
  } finally {
    decisionId.value = 0;
  }
}

async function deny(reqRow) {
  decisionId.value = reqRow.id;
  actionError.value = '';
  try {
    await api.post(
      `/company-events/${props.event.id}/session-requests/${reqRow.id}/deny`,
      { agencyId: props.agencyId },
      { skipGlobalLoading: true }
    );
    actionMsg.value = `Denied ${reqRow.providerName}.`;
    emit('changed');
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Could not deny';
  } finally {
    decisionId.value = 0;
  }
}

watch(
  () => [props.event?.id, props.agencyId, providersNeededDisplay.value],
  () => {
    providersNeededDraft.value = providersNeededDisplay.value;
  },
  { immediate: true }
);

watch(
  () => [props.event?.id, props.agencyId],
  () => {
    actionMsg.value = '';
    showEditModal.value = false;
    reload();
  },
  { immediate: true }
);
</script>

<style scoped>
.staffing-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.9rem 1rem 1.1rem;
  height: fit-content;
  position: sticky;
  top: 0.75rem;
  max-height: calc(100vh - 6rem);
  overflow: auto;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.65rem;
}
.panel-head h2 {
  margin: 0;
  font-size: 1.1rem;
}
.head-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}
.muted { color: #64748b; font-size: 0.8rem; margin: 0.15rem 0 0; }
.tiny { font-size: 0.72rem; }
.pad { padding: 0.75rem 0; }
.hint { font-size: 0.8rem; color: #475569; margin: 0 0 0.75rem; }
.status-row { display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.75rem; }
.providers-needed-row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
}
.providers-needed-row .lbl {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 0.2rem;
}
.providers-needed-row .input-sm {
  width: 5rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
.enable-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.85rem;
}
.enable-box p { margin: 0 0 0.75rem; font-size: 0.875rem; color: #334155; }
.session-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.7rem 0.75rem;
  margin-bottom: 0.65rem;
}
.session-head { display: flex; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
.chip-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.4rem; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}
.chip.assigned { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
.chip-x {
  border: 0;
  background: transparent;
  color: #047857;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  padding: 0 0.1rem;
}
.chip-x:disabled { opacity: 0.5; cursor: not-allowed; }
.assign-row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin: 0.5rem 0 0.35rem;
}
.assign-select {
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.45rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.8rem;
  background: #fff;
}
.requests h4 { margin: 0.5rem 0 0.35rem; font-size: 0.8rem; color: #475569; }
.req-list { list-style: none; margin: 0; padding: 0; }
.req-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4rem 0;
  border-top: 1px solid #f1f5f9;
}
.req-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
.apply-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
.primary { font-weight: 600; font-size: 0.85rem; }
.pill {
  font-size: 0.75rem;
  background: #ede9fe;
  color: #5b21b6;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
}
.pill.assigned-pill {
  background: #d1fae5;
  color: #065f46;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 0.8rem;
  cursor: pointer;
  background: #fff;
}
.btn-sm { padding: 0.3rem 0.55rem; font-size: 0.75rem; }
.btn-primary { background: #5b21b6; color: #fff; }
.btn-secondary { border-color: #cbd5e1; color: #334155; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.sev {
  text-transform: capitalize;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
}
.sev.critical { background: #fee2e2; color: #991b1b; }
.sev.moderate { background: #fef3c7; color: #92400e; }
.sev.informational { background: #e0e7ff; color: #3730a3; }
.error { color: #991b1b; font-size: 0.85rem; margin: 0.5rem 0 0; }
.apply-msg { color: #065f46; font-size: 0.85rem; margin: 0.5rem 0 0; }
</style>
