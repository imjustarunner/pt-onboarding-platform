<template>
  <div v-if="isSupervisor && sessionId" class="lobby-panel">
    <h4 class="lobby-panel-title">Waiting room — Admit participants</h4>
    <div v-if="admitSuccess" class="lobby-panel-success">Admitted. They’re joining the room…</div>
    <div v-else-if="admitError" class="lobby-panel-error">{{ admitError }}</div>
    <div v-if="loading" class="lobby-panel-loading">Loading…</div>
    <div v-else-if="participants.length === 0" class="lobby-panel-empty">No one waiting</div>
    <ul v-else class="lobby-panel-list">
      <li v-for="p in participants" :key="p.sid || p.joinIdentity" class="lobby-panel-item">
        <span class="lobby-panel-identity">
          {{ p.displayName || p.identity }}
          <small v-if="p.isGuest" class="lobby-panel-guest">Guest</small>
        </span>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="admittingKey === p.admitKey"
          @click="admit(p)"
        >
          {{ admittingKey === p.admitKey ? 'Admitting…' : 'Admit' }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onUnmounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  sessionId: { type: [Number, String], default: null },
  isSupervisor: { type: Boolean, default: false },
  /** supervision | team-meeting */
  meetingKind: { type: String, default: 'supervision' }
});

function lobbyParticipantsPath() {
  const id = encodeURIComponent(props.sessionId);
  return props.meetingKind === 'team-meeting'
    ? `/team-meetings/${id}/lobby-participants`
    : `/supervision/sessions/${id}/lobby-participants`;
}

function admitPath(pathId) {
  const id = encodeURIComponent(props.sessionId);
  const pid = encodeURIComponent(pathId);
  return props.meetingKind === 'team-meeting'
    ? `/team-meetings/${id}/admit/${pid}`
    : `/supervision/sessions/${id}/admit/${pid}`;
}

const participants = ref([]);
const loading = ref(false);
const admittingKey = ref(null);
const admitSuccess = ref(false);
const admitError = ref('');
let pollInterval = null;

async function fetchLobbyParticipants() {
  if (!props.sessionId || !props.isSupervisor) return;
  loading.value = true;
  try {
    const resp = await api.get(lobbyParticipantsPath());
    const list = resp?.data?.participants || [];
    participants.value = list.map((p) => {
      const identity = String(p.joinIdentity || p.identity || '');
      const userId = p.userId != null ? Number(p.userId) : null;
      const admitKey = userId || identity;
      return {
        sid: p.sid || identity,
        identity,
        joinIdentity: identity,
        userId: Number.isFinite(userId) && userId > 0 ? userId : null,
        displayName: p.displayName || identity,
        isGuest: !!p.isGuest || identity.startsWith('guest-'),
        admitKey
      };
    }).filter((p) => p.admitKey);
  } catch {
    participants.value = [];
  } finally {
    loading.value = false;
  }
}

async function admit(p) {
  if (!props.sessionId || !p?.admitKey) return;
  admittingKey.value = p.admitKey;
  admitError.value = '';
  admitSuccess.value = false;
  try {
    const pathId = p.userId || p.joinIdentity;
    await api.post(admitPath(pathId), {
      joinIdentity: p.joinIdentity
    });
    admitSuccess.value = true;
    await fetchLobbyParticipants();
    setTimeout(() => { admitSuccess.value = false; }, 4000);
  } catch (e) {
    admitError.value = e?.response?.data?.error?.message || e?.message || 'Admit failed';
  } finally {
    admittingKey.value = null;
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.lobby-panel-guest {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
