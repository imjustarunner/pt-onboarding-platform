<template>
  <div class="map" data-testid="meeting-attendance-panel">
    <div class="map__head">
      <h4>
        Attendance
        <span v-if="presentCount" class="map__present" title="In room now">{{ presentCount }} in room</span>
        <span v-if="raisedHands" class="map__hands" title="Hands raised">✋ {{ raisedHands }}</span>
        <span v-if="mutedCount" class="map__muted-summary" title="Muted participants">🔇 {{ mutedCount }}</span>
      </h4>
      <div class="map__actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!copyNames" @click="copy(copyNames)">
          Copy names
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!copyWithTime" @click="copy(copyWithTime)">
          Copy with time
        </button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="load">Refresh</button>
      </div>
    </div>
    <p v-if="meetingCompletedAt" class="muted map__meta">
      Session completed {{ formatWhen(meetingCompletedAt) }}
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading attendance…</p>
    <ul v-else-if="participants.length" class="map__list">
      <li
        v-for="p in participants"
        :key="p.userId"
        :class="{ 'map__list-item--away': !p.isPresent }"
      >
        <span class="map__name">
          {{ p.name }}
          <span v-if="p.isHost" class="map__host">Host</span>
          <span v-if="participantHasRaisedHand(p)" class="map__hand-hint" title="Hand raised">✋</span>
          <span v-if="participantIsMuted(p)" class="map__mute-hint" title="Muted">Muted</span>
          <span v-if="p.isPresent" class="map__status map__status--active">In room</span>
          <span v-else-if="p.leftAt" class="map__status map__status--left">Left {{ formatWhen(p.leftAt) }}</span>
          <span v-else class="map__status map__status--away">Away</span>
        </span>
        <span class="map__mins">{{ formatMins(p.totalMinutes) }}</span>
      </li>
    </ul>
    <p v-else class="muted">No attendance recorded yet.</p>
    <p v-if="copied" class="map__copied">Copied</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  eventId: { type: [Number, String], required: true },
  /** team-meeting (default) or supervision */
  meetingKind: { type: String, default: 'team-meeting' },
  /** When true, refresh totals every few seconds while the panel is mounted. */
  livePoll: { type: Boolean, default: false },
  /** Count of currently raised hands in the live room */
  raisedHands: { type: Number, default: 0 },
  /** Display names of participants with a raised hand */
  raisedHandNames: { type: Array, default: () => [] },
  /** Display names of participants who are muted */
  mutedNames: { type: Array, default: () => [] }
});

const mutedCount = computed(() => (props.mutedNames || []).length);
const presentCount = computed(() => (
  (participants.value || []).filter((p) => p.isPresent).length
));

const loading = ref(false);
const error = ref('');
const participants = ref([]);
const copyNames = ref('');
const copyWithTime = ref('');
const meetingCompletedAt = ref(null);
const copied = ref(false);
let pollTimer = null;

function formatMins(m) {
  const n = Number(m || 0);
  if (!Number.isFinite(n)) return '0m';
  return `${Math.round(n * 10) / 10}m`;
}

function formatWhen(raw) {
  try {
    return new Date(raw).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(raw || '');
  }
}

function normalizeParticipantName(name) {
  return String(name || '')
    .replace(/^You\s*[·|]\s*/i, '')
    .replace(/^(Host|Participant|Supervisor|Supervisee|Guest)\s*[·|]\s*/gi, '')
    .trim()
    .toLowerCase();
}

function namesMatch(participantName, signalName) {
  const left = normalizeParticipantName(participantName);
  const right = normalizeParticipantName(signalName);
  if (!left || !right) return false;
  return left === right || right.endsWith(left) || left.endsWith(right);
}

function participantHasRaisedHand(participant) {
  return (props.raisedHandNames || []).some((raw) => namesMatch(participant?.name, raw));
}

function participantIsMuted(participant) {
  return (props.mutedNames || []).some((raw) => namesMatch(participant?.name, raw));
}

function attendanceUrl() {
  const id = Number(props.eventId || 0);
  if (!id) return '';
  if (String(props.meetingKind || '').toLowerCase() === 'supervision') {
    return `/supervision/sessions/${id}/live-attendance`;
  }
  return `/team-meetings/${id}/attendance`;
}

async function load({ quiet = false } = {}) {
  const eid = Number(props.eventId || 0);
  if (!eid) return;
  const url = attendanceUrl();
  if (!url) return;
  if (!quiet) loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(url, {
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    participants.value = Array.isArray(data?.participants) ? data.participants : [];
    copyNames.value = String(data?.copyNamesCsv || '');
    copyWithTime.value = String(data?.copyNamesWithTimeCsv || '');
    meetingCompletedAt.value = data?.meetingCompletedAt || null;
  } catch (e) {
    if (!quiet) {
      error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load attendance';
    }
  } finally {
    if (!quiet) loading.value = false;
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  if (!props.livePoll) return;
  pollTimer = setInterval(() => { void load({ quiet: true }); }, 8000);
}

async function copy(text) {
  const t = String(text || '').trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1600);
  } catch {
    error.value = 'Unable to copy to clipboard';
  }
}

watch(() => [props.eventId, props.meetingKind], () => {
  void load();
  startPolling();
});
watch(() => props.livePoll, () => startPolling());
onMounted(() => {
  void load();
  startPolling();
});
onUnmounted(stopPolling);

defineExpose({ load });
</script>

<style scoped>
.map { display: flex; flex-direction: column; gap: 10px; }
.map__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.map__head h4 { margin: 0; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.map__present {
  font-size: 0.72rem;
  font-weight: 700;
  background: #dcfce7;
  color: #166534;
  border-radius: 999px;
  padding: 2px 8px;
}
.map__hands {
  font-size: 0.75rem;
  font-weight: 700;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 2px 8px;
}
.map__muted-summary {
  font-size: 0.75rem;
  font-weight: 700;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 999px;
  padding: 2px 8px;
}
.map__hand-hint {
  margin-left: 4px;
  display: inline-grid;
  place-items: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  font-size: 0.82rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
}
.map__mute-hint {
  margin-left: 4px;
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #991b1b;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 999px;
  padding: 1px 6px;
  vertical-align: middle;
}
.map__status {
  margin-left: 6px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 1px 6px;
  vertical-align: middle;
}
.map__status--active { color: #166534; background: #dcfce7; }
.map__status--left { color: #9a3412; background: #ffedd5; }
.map__status--away { color: #64748b; background: #f1f5f9; }
.map__actions { display: flex; gap: 6px; flex-wrap: wrap; }
.map__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.map__list li { display: flex; justify-content: space-between; gap: 10px; font-size: 0.9rem; align-items: flex-start; }
.map__list-item--away .map__mins { color: #94a3b8; }
.map__host {
  margin-left: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #0f766e;
}
.map__mins { font-variant-numeric: tabular-nums; color: #475569; flex-shrink: 0; }
.map__copied { margin: 0; font-size: 0.8rem; color: #15803d; }
.map__meta { margin: 0; font-size: 0.8rem; }
.error { color: #b91c1c; margin: 0; font-size: 0.85rem; }
.muted { color: #64748b; margin: 0; font-size: 0.85rem; }
</style>
