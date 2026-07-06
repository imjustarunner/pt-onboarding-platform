<template>
  <div class="container approvals-view">
    <div class="header">
      <div>
        <h2>Office booking approvals</h2>
        <p class="subtitle">Review booking context, room timelines, conflicts, and release requests before deciding.</p>
        <div class="queue-tabs">
          <button type="button" class="queue-tab" :class="{ active: queueTab === 'booking' }" @click="switchTab('booking')">
            Booking requests
            <span v-if="queueSummary.booking" class="tab-count">{{ queueSummary.booking }}</span>
          </button>
          <button type="button" class="queue-tab" :class="{ active: queueTab === 'intake' }" @click="switchTab('intake')">
            Availability intake
            <span v-if="queueSummary.intake" class="tab-count">{{ queueSummary.intake }}</span>
          </button>
          <button type="button" class="queue-tab" :class="{ active: queueTab === 'legacy' }" @click="switchTab('legacy')">
            Legacy room requests
            <span v-if="queueSummary.legacy" class="tab-count">{{ queueSummary.legacy }}</span>
          </button>
        </div>
      </div>
      <div class="header-actions">
        <router-link to="/admin/booking-conflict-resolver" class="btn btn-secondary">Conflict resolver</router-link>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="loading">Loading...</div>

    <div v-else-if="queueTab === 'booking' && requests.length === 0" class="card empty">No pending booking requests.</div>

    <div v-else-if="queueTab === 'intake' && intakeRequests.length === 0" class="card empty">No pending availability intake requests.</div>

    <div v-else-if="queueTab === 'intake'" class="intake-list card">
      <div v-for="r in intakeRequests" :key="`intake-${r.id}`" class="intake-row">
        <div>
          <div class="queue-main">{{ r.providerName }}</div>
          <div class="queue-meta">
            {{ r.requestedFrequency || 'ONCE' }}
            <template v-if="r.requestedFrequency && r.requestedFrequency !== 'ONCE'"> × {{ r.requestedOccurrenceCount }}</template>
            · starting {{ formatDate(r.requestedStartDate) }}
          </div>
          <div class="queue-meta">
            <span v-for="(s, idx) in r.slots" :key="idx" class="chip">
              {{ weekdayLabel(s.weekday) }} {{ hourLabel(s.startHour) }}–{{ hourLabel(s.endHour) }}
            </span>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" @click="openIntakeModal(r)">Review</button>
      </div>
    </div>

    <div v-else-if="queueTab === 'legacy' && legacyRequests.length === 0" class="card empty">No pending legacy room requests.</div>

    <div v-else-if="queueTab === 'legacy'" class="intake-list card">
      <div v-for="r in legacyRequests" :key="`legacy-${r.id}`" class="intake-row">
        <div>
          <div class="queue-main">{{ r.user_first_name }} {{ r.user_last_name }}</div>
          <div class="queue-meta">{{ r.location_name }} · {{ r.room_label || r.room_name }}</div>
          <div class="queue-meta">{{ formatDateTime(r.start_at) }} – {{ formatTime(r.end_at) }}</div>
        </div>
        <div class="row-inline">
          <button class="btn btn-primary btn-sm" @click="approveLegacy(r)" :disabled="actingId === r.id">Approve</button>
          <button class="btn btn-secondary btn-sm" @click="denyLegacy(r)" :disabled="actingId === r.id">Deny</button>
        </div>
      </div>
    </div>

    <div v-else-if="queueTab === 'booking'" class="workspace">
      <aside class="queue card">
        <div class="queue-title">Pending requests</div>
        <button
          v-for="r in requests"
          :key="r.id"
          type="button"
          class="queue-item"
          :class="{ selected: selectedId === r.id, conflict: conflictCount(r) > 0 }"
          @click="selectRequest(r)"
        >
          <div class="queue-top">
            <span class="badge" :class="badgeClass(r)">{{ requestTypeLabel(r) }}</span>
            <span v-if="frequencyLabel(r)" class="badge badge-muted">{{ frequencyLabel(r) }}</span>
            <span v-if="conflictCount(r) > 0" class="badge badge-danger">{{ conflictCount(r) }} issue{{ conflictCount(r) === 1 ? '' : 's' }}</span>
          </div>
          <div class="queue-main">{{ providerName(r) }}</div>
          <div class="queue-meta">{{ r.office_location_name }} · {{ roomLabel(r) }}</div>
          <div class="queue-meta">{{ requestWhen(r) }}</div>
        </button>
      </aside>

      <main class="detail card" v-if="selected">
        <div class="detail-head">
          <div>
            <div class="detail-title">{{ requestTypeLabel(selected) }}: {{ providerName(selected) }}</div>
            <div class="detail-sub">{{ selected.office_location_name }} · {{ roomLabel(selected) }}</div>
          </div>
          <span class="status-pill" :class="isConflictFree(selected) ? 'status-ok' : 'status-bad'">
            {{ isConflictFree(selected) ? 'No blocking conflicts found' : 'Needs review before approval' }}
          </span>
        </div>

        <section class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Requested</div>
            <div class="summary-value">{{ requestWhen(selected) }}</div>
            <div class="summary-sub">{{ frequencyLabel(selected) }}<template v-if="occurrenceCount(selected)"> · {{ occurrenceCount(selected) }} occurrence{{ occurrenceCount(selected) === 1 ? '' : 's' }}</template></div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Client / service</div>
            <div class="summary-value">{{ selected.approvalContext?.client?.name || 'No client listed' }}</div>
            <div class="summary-sub">{{ taxonomyLine(selected) || 'No appointment taxonomy listed' }}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Room options</div>
            <div class="summary-value">{{ openAlternatives(selected).length }} open</div>
            <div class="summary-sub">{{ selected.open_to_alternative_room ? 'Requester accepts another room' : 'Specific room requested' }}</div>
          </div>
        </section>

        <div v-if="contextError(selected)" class="warning-box">
          {{ contextError(selected) }}
        </div>

        <div v-if="!isConflictFree(selected)" class="danger-box">
          <strong>Review required:</strong>
          This request has blockers or provider same-time bookings. Approving may fail unless the conflict is resolved or another room is selected.
        </div>

        <section class="section">
          <h3>Room timeline</h3>
          <div v-if="timelineEvents(selected).length === 0" class="muted">No nearby room events found.</div>
          <div v-else class="timeline">
            <div
              v-for="ev in timelineEvents(selected)"
              :key="`ev-${ev.id}-${ev.startAt}`"
              class="timeline-row"
              :class="{ blocker: isTimelineBlocker(selected, ev) }"
            >
              <div class="timeline-time">{{ formatTime(ev.startAt) }} - {{ formatTime(ev.endAt) }}</div>
              <div class="timeline-body">
                <strong>{{ ev.providerName || ev.roomLabel || 'Office event' }}</strong>
                <span class="muted">{{ ev.status || ev.slotState || 'EVENT' }}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="section two-col">
          <div>
            <h3>Provider same-time schedule</h3>
            <div v-if="providerSameTime(selected).length === 0" class="muted">No same-time provider booking found.</div>
            <div v-else class="mini-list">
              <div v-for="ev in providerSameTime(selected)" :key="`pe-${ev.id}`" class="mini-row danger">
                <strong>{{ ev.roomLabel || 'Room' }}</strong>
                <span>{{ formatTime(ev.startAt) }} - {{ formatTime(ev.endAt) }} · {{ ev.status || ev.slotState }}</span>
              </div>
            </div>
          </div>
          <div>
            <h3>Alternative rooms</h3>
            <div v-if="alternatives(selected).length === 0" class="muted">No alternative room data.</div>
            <div v-else class="mini-list">
              <div v-for="room in alternatives(selected)" :key="`alt-${room.roomId}`" class="mini-row" :class="{ ok: room.open, danger: !room.open }">
                <strong>{{ roomDisplay(room) }}</strong>
                <span>{{ room.open ? 'Open' : 'Blocked' }}<template v-if="room.requested"> · requested</template></span>
              </div>
            </div>
          </div>
        </section>

        <section class="section" v-if="occurrencePreview(selected).length">
          <h3>Recurrence preview</h3>
          <div class="chips">
            <span v-for="d in occurrencePreview(selected)" :key="d" class="chip">{{ formatDate(d) }}</span>
          </div>
        </section>

        <section class="section" v-if="notesText(selected)">
          <h3>Requester notes</h3>
          <div class="notes-box">{{ notesText(selected) }}</div>
        </section>

        <section class="section decision">
          <label>
            Approver comment
            <textarea v-model="approverComment" rows="3" placeholder="Optional note for this decision"></textarea>
          </label>
          <div class="decision-actions">
            <button
              class="btn"
              :class="isDropRequest(selected) ? 'btn-danger' : 'btn-primary'"
              @click="approve(selected)"
              :disabled="actingId === selected.id"
            >
              {{ isDropRequest(selected) ? 'Release slot' : 'Approve booking' }}
            </button>
            <button
              class="btn"
              :class="isDropRequest(selected) ? 'btn-primary' : 'btn-secondary'"
              @click="deny(selected)"
              :disabled="actingId === selected.id"
            >
              {{ isDropRequest(selected) ? 'Keep active' : 'Deny request' }}
            </button>
          </div>
        </section>
      </main>
    </div>

    <OfficeRequestAssignModal
      :visible="intakeModalVisible"
      :request-id="intakeModalRequestId"
      :agency-id="intakeModalAgencyId"
      @close="closeIntakeModal"
      @assigned="onIntakeResolved"
      @denied="onIntakeResolved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useRouter } from 'vue-router';
import OfficeRequestAssignModal from '../../components/admin/OfficeRequestAssignModal.vue';

const authStore = useAuthStore();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const queueTab = ref('booking');
const queueSummary = ref({ booking: 0, intake: 0, legacy: 0, total: 0 });
const requests = ref([]);
const intakeRequests = ref([]);
const legacyRequests = ref([]);
const selectedId = ref(null);
const actingId = ref(null);
const approverComment = ref('');
const intakeModalVisible = ref(false);
const intakeModalRequestId = ref(null);
const intakeModalAgencyId = ref(null);

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayLabel = (wd) => weekdayNames[Number(wd)] || `Day ${wd}`;
const hourLabel = (h) => {
  const n = Number(h);
  if (!Number.isFinite(n)) return '';
  const suffix = n >= 12 ? 'PM' : 'AM';
  const hour12 = n % 12 === 0 ? 12 : n % 12;
  return `${hour12}:00 ${suffix}`;
};

const selected = computed(() => requests.value.find((r) => Number(r.id) === Number(selectedId.value)) || requests.value[0] || null);

const formatDateTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
};

const formatDate = (d) => {
  try {
    return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return d;
  }
};

const isDropRequest = (r) => String(r?.request_type || '').toUpperCase() === 'DROP_ASSIGNMENT';
const isDeleteRequest = (r) => String(r?.request_type || '').toUpperCase() === 'DELETE_EVENT';

const requestTypeLabel = (r) => {
  if (isDropRequest(r)) return 'Release slot';
  if (isDeleteRequest(r)) return 'Delete event';
  return 'Booking';
};

const badgeClass = (r) => {
  if (isDropRequest(r)) return 'badge-warning';
  if (isDeleteRequest(r)) return 'badge-muted';
  return 'badge-info';
};

const providerName = (r) => `${r?.requester_first_name || ''} ${r?.requester_last_name || ''}`.trim() || r?.requester_email || 'Provider';
const roomLabel = (r) => r?.room_label || r?.room_name || 'Any open room';
const frequencyLabel = (r) => r?.approvalContext?.requested?.recurrenceLabel || String(r?.recurrence || 'ONCE');
const occurrenceCount = (r) => Number(r?.approvalContext?.requested?.occurrenceCount || r?.booked_occurrence_count || 0) || null;
const occurrencePreview = (r) => Array.isArray(r?.approvalContext?.requested?.occurrencePreview) ? r.approvalContext.requested.occurrencePreview : [];
const conflictCount = (r) => Number(r?.approvalContext?.conflictCount || 0) || 0;
const contextError = (r) => r?.approvalContext?.error ? r.approvalContext.message || 'Unable to load approval context.' : '';
const isConflictFree = (r) => !contextError(r) && conflictCount(r) === 0 && String(r?.approvalContext?.availabilityStatus || 'AVAILABLE') !== 'CONFLICT';
const timelineEvents = (r) => Array.isArray(r?.approvalContext?.roomTimeline?.events) ? r.approvalContext.roomTimeline.events : [];
const blockers = (r) => Array.isArray(r?.approvalContext?.blockers) ? r.approvalContext.blockers : [];
const providerSameTime = (r) => Array.isArray(r?.approvalContext?.provider?.sameTimeEvents) ? r.approvalContext.provider.sameTimeEvents : [];
const alternatives = (r) => Array.isArray(r?.approvalContext?.alternatives) ? r.approvalContext.alternatives : [];
const openAlternatives = (r) => alternatives(r).filter((room) => room.open);

const taxonomyLine = (r) => {
  const t = r?.approvalContext?.taxonomy || {};
  return [t.appointmentTypeCode, t.appointmentSubtypeCode, t.serviceCode, t.modality].filter(Boolean).join(' · ');
};

const roomDisplay = (room) => {
  const num = room?.roomNumber ? `#${room.roomNumber} ` : '';
  return `${num}${room?.roomLabel || room?.roomName || `Room ${room?.roomId}`}`.trim();
};

const requestWhen = (r) => {
  const ctx = r?.approvalContext?.requested;
  if (ctx?.weekday && ctx?.startAt) {
    return `${ctx.weekday}, ${formatDateTime(ctx.startAt)} - ${formatTime(ctx.endAt)}`;
  }
  return `${formatDateTime(r?.start_at)} - ${formatTime(r?.end_at)}`;
};

const isTimelineBlocker = (r, ev) => blockers(r).some((b) => Number(b.id || 0) === Number(ev.id || 0));

const notesText = (r) => {
  if (isDropRequest(r)) return r?.approvalContext?.special?.meta?.reason || '';
  const raw = r?.requester_notes || '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' ? '' : raw;
  } catch {
    return raw;
  }
};

const selectRequest = async (r) => {
  selectedId.value = r.id;
  approverComment.value = '';
  if (r?.approvalContext && !r.approvalContext.error) return;
  try {
    const resp = await api.get(`/office-schedule/booking-requests/${r.id}/context`);
    requests.value = requests.value.map((x) =>
      Number(x.id) === Number(r.id)
        ? { ...x, approvalContext: resp.data?.approvalContext || x.approvalContext }
        : x
    );
  } catch {
    // The list-level context already has enough to keep the workspace usable.
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const [summaryResp, bookingResp, intakeResp, legacyResp] = await Promise.all([
      api.get('/office-schedule/admin/pending-queue-summary'),
      api.get('/office-schedule/booking-requests/pending?includeContext=1'),
      api.get('/office-schedule/admin/pending-intake-requests'),
      api.get('/office-schedule/requests/pending')
    ]);
    queueSummary.value = summaryResp.data || { booking: 0, intake: 0, legacy: 0, total: 0 };
    requests.value = bookingResp.data || [];
    intakeRequests.value = intakeResp.data || [];
    legacyRequests.value = legacyResp.data || [];
    if (!selectedId.value && requests.value.length) selectedId.value = requests.value[0].id;
    if (selectedId.value && !requests.value.some((r) => Number(r.id) === Number(selectedId.value))) {
      selectedId.value = requests.value[0]?.id || null;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load requests';
  } finally {
    loading.value = false;
  }
};

const switchTab = (tab) => {
  queueTab.value = tab;
};

const openIntakeModal = (r) => {
  intakeModalRequestId.value = Number(r.id);
  intakeModalAgencyId.value = Number(r.agencyId);
  intakeModalVisible.value = true;
};

const closeIntakeModal = () => {
  intakeModalVisible.value = false;
  intakeModalRequestId.value = null;
  intakeModalAgencyId.value = null;
};

const onIntakeResolved = async () => {
  closeIntakeModal();
  await load();
};

const approveLegacy = async (r) => {
  try {
    actingId.value = r.id;
    await api.post(`/office-schedule/requests/${r.id}/approve`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to approve legacy request';
  } finally {
    actingId.value = null;
  }
};

const denyLegacy = async (r) => {
  try {
    actingId.value = r.id;
    await api.post(`/office-schedule/requests/${r.id}/deny`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to deny legacy request';
  } finally {
    actingId.value = null;
  }
};

const approve = async (r) => {
  try {
    actingId.value = r.id;
    await api.post(`/office-schedule/booking-requests/${r.id}/approve`, {
      approverComment: approverComment.value || null
    });
    approverComment.value = '';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to approve request';
  } finally {
    actingId.value = null;
  }
};

const deny = async (r) => {
  try {
    actingId.value = r.id;
    await api.post(`/office-schedule/booking-requests/${r.id}/deny`, {
      approverComment: approverComment.value || null
    });
    approverComment.value = '';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to deny request';
  } finally {
    actingId.value = null;
  }
};

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  await load();
});
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 14px;
}
.header-actions { display: flex; gap: 8px; align-items: center; }
.queue-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.queue-tab {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
.queue-tab.active { background: #eef4ff; border-color: #9db7ff; }
.tab-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #334155;
  color: #fff;
  font-size: 11px;
  margin-left: 6px;
  padding: 0 5px;
}
.intake-list { display: flex; flex-direction: column; gap: 10px; }
.intake-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}
.intake-row:last-child { border-bottom: none; padding-bottom: 0; }
.row-inline { display: flex; gap: 8px; align-items: center; }
.chip {
  display: inline-block;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 2px 8px;
  margin-right: 6px;
  font-size: 12px;
}
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; }
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.workspace {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.queue { display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 180px); overflow: auto; }
.queue-title { font-weight: 800; margin-bottom: 4px; }
.queue-item {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 10px;
  text-align: left;
  cursor: pointer;
}
.queue-item.selected { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12); }
.queue-item.conflict { border-color: #dc2626; background: #fff7f7; }
.queue-top { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.queue-main { font-weight: 800; }
.queue-meta { color: var(--text-secondary); font-size: 12px; margin-top: 2px; }
.detail { min-height: 500px; }
.detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.detail-title { font-size: 20px; font-weight: 900; }
.detail-sub { color: var(--text-secondary); margin-top: 3px; }
.status-pill, .badge, .chip {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.status-ok { background: #dcfce7; color: #166534; }
.status-bad { background: #fee2e2; color: #991b1b; }
.badge-warning { background: #fff3cd; color: #856404; border: 1px solid #ffc107; }
.badge-info { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
.badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
.badge-muted { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.summary-card { border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: #fafafa; }
.summary-label { color: var(--text-secondary); font-size: 12px; font-weight: 700; text-transform: uppercase; }
.summary-value { font-weight: 800; margin-top: 4px; }
.summary-sub { color: var(--text-secondary); font-size: 12px; margin-top: 2px; }
.section { border-top: 1px solid var(--border); padding-top: 14px; margin-top: 14px; }
.section h3 { margin: 0 0 8px 0; font-size: 15px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.timeline, .mini-list { display: flex; flex-direction: column; gap: 6px; }
.timeline-row, .mini-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}
.timeline-row.blocker, .mini-row.danger { border-color: #fecaca; background: #fff7f7; }
.mini-row.ok { border-color: #bbf7d0; background: #f0fdf4; }
.timeline-time { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; min-width: 110px; }
.timeline-body { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: #f3f4f6; color: #374151; }
.notes-box { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: #fafafa; white-space: pre-wrap; }
.decision label { display: flex; flex-direction: column; gap: 6px; font-weight: 700; }
textarea { width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 8px; resize: vertical; }
.decision-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
.warning-box, .danger-box, .error-box {
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.warning-box { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; }
.danger-box, .error-box { background: #fee2e2; border: 1px solid #fecaca; color: #991b1b; }
.loading, .empty, .muted { color: var(--text-secondary); }
@media (max-width: 1000px) {
  .workspace { grid-template-columns: 1fr; }
  .summary-grid, .two-col { grid-template-columns: 1fr; }
}
</style>

