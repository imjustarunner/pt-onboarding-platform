<template>
  <div class="container esr">
    <div class="esr-header">
      <div>
        <h2 style="margin: 0;">Event shift requests</h2>
        <p class="muted esr-sub">
          Request to work specific program-event sessions (regular, waitlist, or on-call) when staffing blocks are enabled.
        </p>
      </div>
      <router-link v-if="orgSlug" class="btn btn-secondary btn-sm" :to="`/${orgSlug}/schedule`">Back to schedule</router-link>
    </div>

    <div v-if="loadError" class="error-box">{{ loadError }}</div>

    <div class="esr-card">
      <label class="esr-lbl">Event</label>
      <select v-model.number="selectedEventId" class="input" :disabled="loadingEvents">
        <option :value="0">{{ loadingEvents ? 'Loading events…' : eligibleEvents.length ? 'Select an event…' : 'No eligible events' }}</option>
        <option v-for="e in eligibleEvents" :key="`evt-${e.id}`" :value="Number(e.id)">
          {{ e.title || `Event #${e.id}` }}
        </option>
      </select>
      <p v-if="selectedEvent && selectedEventHint" class="muted small" style="margin-top: 6px;">
        {{ selectedEventHint }}
      </p>
    </div>

    <div v-if="selectedEvent" class="esr-card">
      <div class="esr-row">
        <div>
          <p class="esr-subh">Sessions</p>
          <p class="muted small" style="margin: 0;">
            Showing required vs approved staffing counts, plus your request status.
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loadingSessions" @click="refreshSelectedEvent">
          Refresh
        </button>
      </div>

      <div v-if="sessionsError" class="error-box" style="margin-top: 10px;">{{ sessionsError }}</div>
      <div v-if="loadingSessions" class="muted" style="margin-top: 10px;">Loading sessions…</div>

      <div v-else-if="sessionRows.length" class="esr-table-wrap">
        <table class="esr-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Required</th>
              <th>Approved</th>
              <th>Your status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sessionRows" :key="`sess-${row.sessionDateId}`">
              <td>
                <div class="esr-title">
                  {{ formatYmd(row.sessionDate) }}
                  <span v-if="row.startsAt"> · {{ hm(row.startsAt) }}</span>
                  <span v-if="row.endsAt">–{{ hm(row.endsAt) }}</span>
                </div>
                <div class="muted small">
                  Confirmed clients: {{ row.confirmedClientsCount }} · Groups: {{ row.groupCount }}
                </div>
              </td>
              <td class="esr-num">{{ row.requiredProviders }}</td>
              <td class="esr-num">{{ row.approvedProvidersCount }}</td>
              <td>
                <span v-if="row.myRequest" class="esr-status" :class="`is-${row.myRequest.status}`">
                  {{ row.myRequest.status }} · {{ row.myRequest.requestType }}
                </span>
                <span v-else class="muted small">—</span>
              </td>
              <td class="esr-actions">
                <div class="esr-actions-inner">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="savingSessionDateId === row.sessionDateId || !canRequestType('regular')"
                    @click="requestShift(row.sessionDateId, 'regular')"
                  >
                    Request
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
                    Withdraw
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="muted" style="margin-top: 10px;">No sessions found for this event.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''));

const loadingEvents = ref(false);
const loadError = ref('');
const allEvents = ref([]);
const selectedEventId = ref(0);

const eligibleEvents = computed(() => {
  const list = Array.isArray(allEvents.value) ? allEvents.value : [];
  return list
    .filter((e) => {
      const cfg = e?.staffingConfig;
      const t = String(e?.eventType || '').toLowerCase();
      return t !== 'skills_group' && !!cfg?.enabled && !!cfg?.providerSignup?.enabled;
    })
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
});

const selectedEvent = computed(() => eligibleEvents.value.find((e) => Number(e.id) === Number(selectedEventId.value)) || null);
const selectedEventHint = computed(() => {
  const cfg = selectedEvent.value?.staffingConfig || null;
  if (!cfg) return '';
  const waitlist = cfg.waitlist?.enabled ? 'Waitlist enabled' : 'Waitlist off';
  const onCall = cfg.onCall?.enabled ? `On-call enabled (${Number(cfg.onCall.leadHours || 0)}h lead)` : 'On-call off';
  return `${waitlist} · ${onCall}`;
});

const loadingSessions = ref(false);
const sessionsError = ref('');
const staffingSummary = ref(null);
const myRequests = ref([]);
const savingSessionDateId = ref(0);

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

function hm(value) {
  const s = String(value || '');
  return s.length >= 16 ? s.slice(11, 16) : s.slice(0, 5);
}

function formatYmd(value) {
  const ymd = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '—';
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  if (!Number.isFinite(dt.getTime())) return ymd;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
    const res = await api.get('/me/company-events', { skipGlobalLoading: true });
    allEvents.value = Array.isArray(res.data) ? res.data : [];
    if (!selectedEventId.value && eligibleEvents.value.length) {
      selectedEventId.value = Number(eligibleEvents.value[0].id);
    }
  } catch (e) {
    allEvents.value = [];
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Could not load events';
  } finally {
    loadingEvents.value = false;
  }
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

watch(
  () => selectedEventId.value,
  () => {
    loadSelectedEventData();
  }
);

loadEvents();
</script>

<style scoped>
.esr-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.esr-sub {
  margin: 6px 0 0 0;
}
.esr-card {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 14px;
  padding: 14px 14px;
  margin-top: 12px;
}
.esr-lbl {
  display: block;
  font-weight: 800;
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.esr-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.esr-subh {
  margin: 0 0 4px 0;
  font-size: 0.75rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
}
.esr-table-wrap {
  overflow: auto;
  margin-top: 10px;
}
.esr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.esr-table th,
.esr-table td {
  border-bottom: 1px solid var(--border, #e5e7eb);
  padding: 10px 10px 10px 0;
  text-align: left;
  vertical-align: top;
}
.esr-table th {
  font-weight: 800;
  color: var(--text-secondary, #64748b);
  font-size: 0.82rem;
}
.esr-num {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
}
.esr-actions {
  text-align: right;
  white-space: nowrap;
}
.esr-actions-inner {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.esr-title {
  font-weight: 800;
  color: var(--text-primary, #0f172a);
}
.esr-status {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  font-weight: 800;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: rgba(148, 163, 184, 0.08);
  color: #475569;
  text-transform: lowercase;
}
.esr-status.is-approved {
  border-color: rgba(15, 118, 110, 0.5);
  background: rgba(16, 185, 129, 0.12);
  color: #0f766e;
}
.esr-status.is-pending {
  border-color: rgba(234, 179, 8, 0.5);
  background: rgba(234, 179, 8, 0.12);
  color: #92400e;
}
.esr-status.is-denied {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: #991b1b;
}
.esr-status.is-withdrawn {
  opacity: 0.75;
}
</style>

