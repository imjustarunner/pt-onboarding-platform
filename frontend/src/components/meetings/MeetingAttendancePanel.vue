<template>
  <div class="map" data-testid="meeting-attendance-panel">
    <div class="map__head">
      <h4>Attendance</h4>
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
      <li v-for="p in participants" :key="p.userId">
        <span class="map__name">
          {{ p.name }}
          <span v-if="p.isHost" class="map__host">Host</span>
        </span>
        <span class="map__mins">{{ formatMins(p.totalMinutes) }}</span>
      </li>
    </ul>
    <p v-else class="muted">No attendance recorded yet.</p>
    <p v-if="copied" class="map__copied">Copied</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  eventId: { type: [Number, String], required: true },
  /** When true, refresh totals every few seconds while the panel is mounted. */
  livePoll: { type: Boolean, default: false }
});

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

async function load({ quiet = false } = {}) {
  const eid = Number(props.eventId || 0);
  if (!eid) return;
  if (!quiet) loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/team-meetings/${eid}/attendance`, {
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

watch(() => props.eventId, () => {
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
.map__head h4 { margin: 0; font-size: 0.95rem; }
.map__actions { display: flex; gap: 6px; flex-wrap: wrap; }
.map__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.map__list li { display: flex; justify-content: space-between; gap: 10px; font-size: 0.9rem; }
.map__host {
  margin-left: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #0f766e;
}
.map__mins { font-variant-numeric: tabular-nums; color: #475569; }
.map__copied { margin: 0; font-size: 0.8rem; color: #15803d; }
.map__meta { margin: 0; font-size: 0.8rem; }
.error { color: #b91c1c; margin: 0; font-size: 0.85rem; }
.muted { color: #64748b; margin: 0; font-size: 0.85rem; }
</style>
