<template>
  <div v-if="isSupervisor && sessionId" class="lobby-panel">
    <h4 class="lobby-panel-title">Waiting to join — Admit participants</h4>
    <div v-if="admitSuccess" class="lobby-panel-success">Admitted. They’re joining the room…</div>
    <div v-else-if="admitError" class="lobby-panel-error">{{ admitError }}</div>
    <div v-if="loading" class="lobby-panel-loading">Loading…</div>
    <div v-else-if="participants.length === 0" class="lobby-panel-empty">No one waiting</div>
    <ul v-else class="lobby-panel-list">
      <li v-for="p in participants" :key="p.sid" class="lobby-panel-item">
        <span class="lobby-panel-identity">{{ p.displayName || p.identity }}</span>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="admittingUserId === p.userId"
          @click="admit(p.userId)"
        >
          {{ admittingUserId === p.userId ? 'Admitting…' : 'Admit' }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  sessionId: { type: [Number, String], default: null },
  isSupervisor: { type: Boolean, default: false }
});

const participants = ref([]);
const loading = ref(false);
const admittingUserId = ref(null);
const admitSuccess = ref(false);
const admitError = ref('');
let pollInterval = null;

function parseUserId(identity) {
  const m = String(identity || '').match(/^user-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

async function fetchLobbyParticipants() {
  if (!props.sessionId || !props.isSupervisor) return;
  loading.value = true;
  try {
    const resp = await api.get(`/supervision/sessions/${props.sessionId}/lobby-participants`);
    const list = resp?.data?.participants || [];
    participants.value = list.map((p) => ({
      sid: p.sid,
      identity: p.identity,
      userId: parseUserId(p.identity),
      displayName: p.displayName || p.identity
    })).filter((p) => p.userId != null);
  } catch {
    participants.value = [];
  } finally {
    loading.value = false;
  }
}

async function admit(userId) {
  if (!props.sessionId || !userId) return;
  admittingUserId.value = userId;
  admitError.value = '';
  admitSuccess.value = false;
  try {
    await api.post(`/supervision/sessions/${props.sessionId}/admit/${userId}`);
    admitSuccess.value = true;
    await fetchLobbyParticipants();
    setTimeout(() => { admitSuccess.value = false; }, 4000);
  } catch (e) {
    admitError.value = e?.response?.data?.error?.message || e?.message || 'Admit failed';
    console.warn('[SupervisionVideoLobbyPanel] Admit failed:', e?.message);
  } finally {
    admittingUserId.value = null;
  }
}

function startPolling() {
  if (!props.sessionId || !props.isSupervisor) return;
  fetchLobbyParticipants();
  pollInterval = setInterval(fetchLobbyParticipants, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

watch(
  () => [props.sessionId, props.isSupervisor],
  () => {
    stopPolling();
    if (props.sessionId && props.isSupervisor) {
      startPolling();
    } else {
      participants.value = [];
    }
  },
  { immediate: true }
);

onUnmounted(stopPolling);
</script>

<style scoped>
.lobby-panel {
  padding: 12px;
  background: var(--bg-secondary, #1a1a1a);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
}
.lobby-panel-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}
.lobby-panel-loading,
.lobby-panel-empty {
  font-size: 13px;
  color: var(--text-secondary);
}
.lobby-panel-success {
  font-size: 13px;
  color: var(--success, #22c55e);
  margin-bottom: 8px;
}
.lobby-panel-error {
  font-size: 13px;
  color: var(--danger, #ef4444);
  margin-bottom: 8px;
}
.lobby-panel-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.lobby-panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.lobby-panel-item:last-child {
  border-bottom: none;
}
.lobby-panel-identity {
  font-size: 14px;
}
</style>
