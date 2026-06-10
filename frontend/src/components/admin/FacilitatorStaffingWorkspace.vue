<template>
  <div class="fsw-root">
    <div v-if="loading" class="fsw-hint">Loading staffing workspace…</div>
    <div v-else-if="error" class="fsw-error">{{ error }}</div>
    <template v-else-if="workspace">
      <!-- Summary -->
      <div class="fsw-summary">
        <div class="fsw-stat">
          <span class="fsw-stat-num">{{ workspace.summary.eventCount }}</span>
          <span class="fsw-stat-lbl">events</span>
        </div>
        <div class="fsw-stat">
          <span class="fsw-stat-num">{{ workspace.summary.staffSubmitted }}</span>
          <span class="fsw-stat-lbl">staff submitted</span>
        </div>
        <div class="fsw-stat">
          <span class="fsw-stat-num">{{ workspace.summary.slotsFilled }}</span>
          <span class="fsw-stat-lbl">slots filled</span>
        </div>
        <div class="fsw-stat" :class="workspace.summary.slotsNeeded > 0 ? 'fsw-stat--warn' : ''">
          <span class="fsw-stat-num">{{ workspace.summary.slotsNeeded }}</span>
          <span class="fsw-stat-lbl">slots still needed</span>
        </div>
        <div class="fsw-stat">
          <span class="fsw-stat-num">{{ workspace.summary.statusCounts.draft }}</span>
          <span class="fsw-stat-lbl">draft</span>
        </div>
        <div class="fsw-stat">
          <span class="fsw-stat-num">{{ workspace.summary.statusCounts.tentative }}</span>
          <span class="fsw-stat-lbl">tentative</span>
        </div>
        <div class="fsw-stat">
          <span class="fsw-stat-num">{{ workspace.summary.statusCounts.finalized }}</span>
          <span class="fsw-stat-lbl">finalized</span>
        </div>
      </div>

      <!-- Publish actions -->
      <div class="fsw-publish-row">
        <button
          type="button"
          class="btn btn-sm btn-secondary"
          :disabled="actionLoading || readOnly"
          @click="publish('tentative')"
        >
          Post tentative schedule
        </button>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="actionLoading || readOnly"
          @click="publish('finalized')"
        >
          Publish finalized schedule
        </button>
        <button
          v-if="selectedEventId"
          type="button"
          class="btn btn-sm btn-secondary"
          :disabled="actionLoading || readOnly"
          @click="publish('tentative', selectedEventId)"
        >
          Post tentative (this event)
        </button>
        <button
          v-if="selectedEventId"
          type="button"
          class="btn btn-sm btn-secondary"
          :disabled="actionLoading || readOnly"
          @click="publish('finalized', selectedEventId)"
        >
          Publish final (this event)
        </button>
      </div>

      <!-- Event cards -->
      <div class="fsw-events">
        <button
          v-for="ev in workspace.events"
          :key="ev.companyEventId"
          type="button"
          class="fsw-event-card"
          :class="{ 'fsw-event-card--active': selectedEventId === ev.companyEventId, 'fsw-event-card--gap': ev.slotsNeeded > 0 }"
          @click="selectedEventId = ev.companyEventId"
        >
          <div class="fsw-event-title">{{ ev.title }}</div>
          <div v-if="ev.dateRange" class="fsw-event-range">
            {{ fmtDate(ev.dateRange.start) }} – {{ fmtDate(ev.dateRange.end) }}
          </div>
          <div class="fsw-event-stats">
            <span>{{ ev.slotsFilled }} filled</span>
            <span v-if="ev.slotsNeeded > 0" class="fsw-gap">· {{ ev.slotsNeeded }} needed</span>
            <span>· {{ ev.staffAssignedCount }} staff</span>
          </div>
        </button>
      </div>

      <!-- Selected event detail -->
      <div v-if="selectedEvent" class="fsw-detail">
        <div class="fsw-detail-grid">
          <div class="fsw-staff-panel">
            <div class="fsw-panel-head">Staff pool</div>
            <p class="fsw-panel-lead">Only staff who marked at least one available day for this event appear here.</p>
            <label class="fsw-check">
              <input v-model="fullSessionOnly" type="checkbox" />
              Show only full-session + rank #1
            </label>
            <div v-if="!sortedStaffPool.length" class="fsw-hint">No matching staff.</div>
            <div v-for="person in sortedStaffPool" :key="person.userId" class="fsw-staff-row">
              <div class="fsw-staff-info">
                <strong>{{ person.name }}</strong>
                <span class="fsw-staff-meta">
                  {{ personEventMeta(person) }}
                </span>
              </div>
              <button
                v-if="person.isFullyAvailable"
                type="button"
                class="btn btn-sm btn-primary"
                :disabled="actionLoading || readOnly || person.isFullyAssignedHere || person.assignableCount <= 0"
                @click="assignAllDates(person.userId, true)"
              >
                {{ person.isFullyAssignedHere ? 'Assigned' : 'Assign all (draft)' }}
              </button>
              <button
                v-else-if="person.assignableCount > 0"
                type="button"
                class="btn btn-sm btn-secondary"
                :disabled="actionLoading || readOnly"
                @click="assignAllDates(person.userId, false)"
              >
                Assign {{ person.assignableCount }} available day{{ person.assignableCount === 1 ? '' : 's' }} (draft)
              </button>
              <span v-else-if="person.assignedSessionCount > 0" class="fsw-assigned-label">Assigned</span>
            </div>

            <!-- Other providers (no submission) -->
            <div class="fsw-other-toggle-row">
              <button
                type="button"
                class="btn btn-sm btn-secondary"
                :disabled="actionLoading || readOnly"
                @click="toggleOtherProviders"
              >
                {{ otherProvidersOpen ? '▲ Hide other providers' : '▼ Other providers' }}
              </button>
            </div>

            <template v-if="otherProvidersOpen">
              <div class="fsw-other-disclaimer">
                <strong>⚠ Override assignment</strong> — the providers listed below have
                <em>not</em> submitted availability for this request. Only assign them after
                confirming their availability directly. The system will assign them to
                <strong>all session dates</strong> for this event as a draft.
              </div>

              <div v-if="otherProvidersLoading" class="fsw-hint">Loading…</div>
              <div v-else-if="otherProvidersError" class="fsw-error" style="font-size:.82rem;padding:6px 8px;">{{ otherProvidersError }}</div>
              <template v-else>
                <input
                  v-model="otherProvidersSearch"
                  class="fsw-other-search"
                  type="search"
                  placeholder="Filter by name…"
                />
                <div v-if="!filteredOtherProviders.length" class="fsw-hint">
                  {{ otherProviders.length ? 'No matches.' : 'All agency providers have submitted availability.' }}
                </div>
                <div v-for="p in filteredOtherProviders" :key="p.userId" class="fsw-staff-row">
                  <div class="fsw-staff-info">
                    <strong>{{ p.name }}</strong>
                    <span class="fsw-staff-meta">{{ p.email || '' }}</span>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    :disabled="actionLoading || readOnly"
                    @click="assignAllDates(p.userId, false, true)"
                  >
                    Assign all dates (override)
                  </button>
                </div>
              </template>
            </template>
          </div>

          <div class="fsw-dates-panel">
            <div class="fsw-panel-head">Assignments by date</div>
            <div
              v-for="sd in selectedEvent.sessionDates"
              :key="sd.sessionDateId"
              class="fsw-date-row"
              :class="{ 'fsw-date-row--gap': sd.openSlots > 0 }"
            >
              <div class="fsw-date-head">
                <span class="fsw-date-label">{{ fmtDow(sd.date) }} {{ fmtDate(sd.date) }}</span>
                <span class="fsw-slot-count" :class="sd.openSlots > 0 ? 'fsw-slot-open' : 'fsw-slot-full'">
                  {{ sd.filled }} / {{ sd.effectiveSlots }} filled
                  <template v-if="sd.openSlots > 0"> · {{ sd.openSlots }} needed</template>
                </span>
              </div>
              <div v-if="sd.assigned.length" class="fsw-assigned-chips">
                <span
                  v-for="a in sd.assigned"
                  :key="a.sessionProviderId"
                  class="fsw-chip"
                  :class="`fsw-chip--${a.assignmentStatus}`"
                >
                  {{ a.name }}
                  <select
                    class="fsw-status-select"
                    :value="a.assignmentStatus"
                    :disabled="actionLoading || readOnly"
                    @change="updateStatus(a.sessionProviderId, $event.target.value)"
                  >
                    <option value="draft">draft</option>
                    <option value="tentative">tentative</option>
                    <option value="finalized">finalized</option>
                  </select>
                  <button
                    type="button"
                    class="fsw-chip-x"
                    :disabled="actionLoading || readOnly"
                    title="Unassign"
                    @click="unassignOne(sd, a)"
                  >✕</button>
                </span>
              </div>
              <div v-else class="fsw-hint fsw-hint--inline">No one assigned yet.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Matrix view -->
      <div class="fsw-matrix">
        <div class="fsw-panel-head">All events × dates</div>
        <div class="fsw-matrix-scroll">
          <table class="fsw-matrix-table">
            <thead>
              <tr>
                <th>Date</th>
                <th v-for="ev in workspace.events" :key="`h-${ev.companyEventId}`">{{ ev.title }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="date in matrixDates" :key="date">
                <td>{{ fmtDow(date) }} {{ fmtDate(date) }}</td>
                <td v-for="ev in workspace.events" :key="`${date}-${ev.companyEventId}`">
                  <template v-if="matrixCell(ev, date)">
                    <div class="fsw-matrix-cell">
                      <span class="fsw-matrix-slots">{{ matrixCell(ev, date).filled }}/{{ matrixCell(ev, date).effectiveSlots }}</span>
                      <div v-for="a in matrixCell(ev, date).assigned" :key="a.sessionProviderId" class="fsw-matrix-name">
                        {{ a.name }}
                        <span class="fsw-matrix-status">{{ a.assignmentStatus }}</span>
                      </div>
                    </div>
                  </template>
                  <span v-else class="fsw-hint">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../services/api';
import { formatDate } from '../../utils/formatDate';

const props = defineProps({
  agencyBase: { type: String, required: true },
  requestId: { type: [Number, String], required: true },
  readOnly: { type: Boolean, default: false }
});

const emit = defineEmits(['loaded']);

const workspace = ref(null);
const loading = ref(false);
const error = ref('');
const actionLoading = ref(false);
const selectedEventId = ref(null);
const fullSessionOnly = ref(false);

const otherProvidersOpen = ref(false);
const otherProviders = ref([]);
const otherProvidersLoading = ref(false);
const otherProvidersError = ref('');
const otherProvidersSearch = ref('');

const fmtDate = (d) => formatDate(d) || '';
const fmtDow = (d) => {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { weekday: 'short' });
};

const selectedEvent = computed(() =>
  (workspace.value?.events || []).find((e) => Number(e.companyEventId) === Number(selectedEventId.value)) || null
);

const matrixDates = computed(() => {
  const set = new Set();
  for (const ev of workspace.value?.events || []) {
    for (const sd of ev.sessionDates || []) set.add(sd.date);
  }
  return [...set].sort();
});

const matrixCell = (ev, date) => (ev.sessionDates || []).find((sd) => sd.date === date) || null;

const sortedStaffPool = computed(() => {
  const evId = selectedEventId.value;
  if (!evId || !workspace.value) return [];
  const pool = (workspace.value.staffPool || []).filter((p) => p.isSubmitted);
  const enriched = pool.map((p) => {
    const meta = (p.perEvent || []).find((pe) => Number(pe.companyEventId) === Number(evId)) || {};
    return {
      ...p,
      daysAvailable: meta.daysAvailable || 0,
      totalDays: meta.totalDays || 0,
      locationRank: meta.locationRank,
      isFullyAvailable: !!meta.isFullyAvailable,
      isFullyAssignedHere: !!meta.isFullyAssigned,
      assignedSessionCount: meta.assignedSessionCount || 0,
      assignableCount: meta.assignableCount ?? Math.max(0, (meta.daysAvailable || 0) - (meta.assignedOnAvailableCount || 0))
    };
  });
  let list = enriched.filter((p) => p.daysAvailable > 0 || p.assignedSessionCount > 0);
  if (fullSessionOnly.value) {
    list = list.filter((p) => p.isFullyAvailable && p.locationRank === 1);
  }
  return list.sort((a, b) => {
    if (a.isFullyAvailable !== b.isFullyAvailable) return a.isFullyAvailable ? -1 : 1;
    const ra = a.locationRank ?? 999;
    const rb = b.locationRank ?? 999;
    if (ra !== rb) return ra - rb;
    return String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''));
  });
});

const personEventMeta = (person) => {
  const parts = [];
  if (person.totalDays) parts.push(`${person.daysAvailable}/${person.totalDays} days`);
  if (person.locationRank) parts.push(`rank #${person.locationRank}`);
  else parts.push('unranked');
  if (person.assignedSessionCount) parts.push(`${person.assignedSessionCount} assigned here`);
  return parts.join(' · ');
};

const filteredOtherProviders = computed(() => {
  const q = otherProvidersSearch.value.trim().toLowerCase();
  if (!q) return otherProviders.value;
  return otherProviders.value.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)
  );
});

const load = async () => {
  if (!props.requestId || !props.agencyBase) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`${props.agencyBase}/${props.requestId}/staffing-workspace`);
    workspace.value = r.data;
    if (!selectedEventId.value && r.data?.events?.length) {
      const withGap = r.data.events.find((e) => e.slotsNeeded > 0);
      selectedEventId.value = (withGap || r.data.events[0]).companyEventId;
    }
    emit('loaded', r.data);
  } catch (e) {
    workspace.value = null;
    error.value = e?.response?.data?.error?.message || e.message || 'Could not load staffing workspace';
  } finally {
    loading.value = false;
  }
};

const loadOtherProviders = async () => {
  otherProvidersLoading.value = true;
  otherProvidersError.value = '';
  try {
    const r = await api.get(`${props.agencyBase}/${props.requestId}/other-providers`);
    otherProviders.value = r.data?.providers || [];
  } catch (e) {
    otherProvidersError.value = e?.response?.data?.error?.message || e.message || 'Could not load providers';
    otherProviders.value = [];
  } finally {
    otherProvidersLoading.value = false;
  }
};

const toggleOtherProviders = () => {
  otherProvidersOpen.value = !otherProvidersOpen.value;
  if (otherProvidersOpen.value && !otherProviders.value.length && !otherProvidersLoading.value) {
    loadOtherProviders();
  }
};

const assignAllDates = async (userId, requireFullSession = false, overrideAvailability = false) => {
  actionLoading.value = true;
  try {
    await api.post(`${props.agencyBase}/${props.requestId}/assign-event`, {
      companyEventId: selectedEventId.value,
      userId,
      requireFullSession,
      ...(overrideAvailability ? { overrideAvailability: true } : {})
    });
    await load();
    // Refresh other-providers list so the just-assigned person's status updates
    if (overrideAvailability && otherProvidersOpen.value) await loadOtherProviders();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Assignment failed';
  } finally {
    actionLoading.value = false;
  }
};

const unassignOne = async (sd, a) => {
  actionLoading.value = true;
  try {
    await api.post(`${props.agencyBase}/${props.requestId}/unassign`, {
      companyEventId: selectedEvent.value.companyEventId,
      sessionDateId: sd.sessionDateId,
      userId: a.userId
    });
    await load();
  } finally {
    actionLoading.value = false;
  }
};

const updateStatus = async (sessionProviderId, assignmentStatus) => {
  actionLoading.value = true;
  try {
    await api.patch(`${props.agencyBase}/${props.requestId}/assignments/${sessionProviderId}`, {
      assignmentStatus
    });
    await load();
  } finally {
    actionLoading.value = false;
  }
};

const publish = async (mode, companyEventId = null) => {
  const label = mode === 'finalized' ? 'Publish finalized schedule' : 'Post tentative schedule';
  const scope = companyEventId ? ' for this event' : ' for all events';
  if (!window.confirm(`${label}${scope}? Assigned facilitators will be notified.`)) return;
  actionLoading.value = true;
  try {
    await api.post(`${props.agencyBase}/${props.requestId}/publish-schedule`, {
      mode,
      ...(companyEventId ? { companyEventId } : {})
    });
    await load();
  } finally {
    actionLoading.value = false;
  }
};

watch(() => props.requestId, () => {
  selectedEventId.value = null;
  otherProvidersOpen.value = false;
  otherProviders.value = [];
  otherProvidersSearch.value = '';
  load();
});

onMounted(load);

defineExpose({ reload: load });
</script>

<style scoped>
.fsw-root { display: flex; flex-direction: column; gap: 16px; }
.fsw-hint { color: #64748b; font-size: .88rem; padding: 8px 0; }
.fsw-hint--inline { padding: 4px 0; }
.fsw-error { background: #fef2f2; color: #b91c1c; padding: 10px 12px; border-radius: 8px; font-size: .88rem; }

.fsw-summary { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px 14px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; }
.fsw-stat { display: flex; flex-direction: column; min-width: 72px; }
.fsw-stat-num { font-size: 1.25rem; font-weight: 700; color: #0f172a; line-height: 1.1; }
.fsw-stat-lbl { font-size: .72rem; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }
.fsw-stat--warn .fsw-stat-num { color: #c2410c; }

.fsw-publish-row { display: flex; flex-wrap: wrap; gap: 8px; }

.fsw-events { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
.fsw-event-card { text-align: left; min-width: 200px; padding: 12px 14px; border: 2px solid #e2e8f0; border-radius: 10px; background: #fff; cursor: pointer; transition: border-color .15s; }
.fsw-event-card--active { border-color: #2563eb; background: #eff6ff; }
.fsw-event-card--gap { border-color: #fdba74; }
.fsw-event-title { font-weight: 600; color: #0f172a; font-size: .92rem; }
.fsw-event-range { font-size: .78rem; color: #64748b; margin-top: 4px; }
.fsw-event-stats { font-size: .78rem; color: #475569; margin-top: 6px; }
.fsw-gap { color: #c2410c; font-weight: 600; }

.fsw-detail { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
.fsw-detail-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 0; }
@media (max-width: 800px) { .fsw-detail-grid { grid-template-columns: 1fr; } }

.fsw-staff-panel, .fsw-dates-panel { padding: 14px 16px; }
.fsw-staff-panel { border-right: 1px solid #e2e8f0; background: #fafafa; }
.fsw-panel-head { font-weight: 700; color: #0f172a; margin-bottom: 4px; }
.fsw-panel-lead { font-size: .82rem; color: #64748b; margin: 0 0 10px; }
.fsw-check { display: flex; align-items: center; gap: 6px; font-size: .82rem; color: #475569; margin-bottom: 10px; }

.fsw-staff-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
.fsw-staff-info { min-width: 0; }
.fsw-staff-meta { display: block; font-size: .75rem; color: #64748b; margin-top: 2px; }
.fsw-assigned-label { font-size: .78rem; font-weight: 600; color: #166534; white-space: nowrap; }

.fsw-date-row { padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
.fsw-date-row--gap { background: #fff7ed; margin: 0 -16px; padding-left: 16px; padding-right: 16px; }
.fsw-date-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.fsw-date-label { font-weight: 600; font-size: .88rem; }
.fsw-slot-count { font-size: .78rem; }
.fsw-slot-open { color: #c2410c; font-weight: 600; }
.fsw-slot-full { color: #166534; }

.fsw-assigned-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.fsw-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; font-size: .78rem; background: #f1f5f9; }
.fsw-chip--draft { background: #f1f5f9; }
.fsw-chip--tentative { background: #fef3c7; }
.fsw-chip--finalized { background: #dcfce7; }
.fsw-status-select { font-size: .72rem; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; }
.fsw-chip-x { border: none; background: none; cursor: pointer; color: #64748b; padding: 0 2px; }

.fsw-other-toggle-row { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
.fsw-other-disclaimer { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 9px 12px; font-size: .82rem; color: #78350f; margin: 10px 0 8px; }
.fsw-other-search { width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: .85rem; margin-bottom: 8px; }

.fsw-matrix { margin-top: 8px; }
.fsw-matrix-scroll { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; }
.fsw-matrix-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
.fsw-matrix-table th, .fsw-matrix-table td { border: 1px solid #e2e8f0; padding: 8px 10px; vertical-align: top; }
.fsw-matrix-table th { background: #f8fafc; text-align: left; white-space: nowrap; }
.fsw-matrix-slots { font-weight: 600; color: #475569; display: block; margin-bottom: 4px; }
.fsw-matrix-name { margin-bottom: 2px; }
.fsw-matrix-status { font-size: .68rem; color: #64748b; margin-left: 4px; }
</style>
