<template>
  <div
    v-if="isSupervisor && sessionId && waitingRoomEnabled"
    class="lobby-panel"
    :class="{ 'lobby-panel--dark': theme === 'dark' }"
  >
    <div class="lobby-panel-head">
      <h4 class="lobby-panel-title">Waiting room — Admit participants</h4>
      <div class="lobby-panel-actions">
        <button
          v-if="participants.length > 1"
          type="button"
          class="btn btn-primary btn-sm lobby-panel-admit-all"
          :disabled="admittingAll || !!admittingKey || disablingWaitingRoom"
          @click="admitAll"
        >
          {{ admittingAll ? 'Opening room…' : `Admit all & open room (${participants.length})` }}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="disablingWaitingRoom || admittingAll || !!admittingKey"
          title="Admit everyone waiting and let later arrivals join without waiting"
          @click="openWaitingRoom"
        >
          {{ disablingWaitingRoom ? 'Opening meeting…' : 'Let everyone in' }}
        </button>
      </div>
    </div>
    <div v-if="admitSuccess" class="lobby-panel-success">Admitted. They’re joining the room…</div>
    <div v-if="admitError" class="lobby-panel-error">{{ admitError }}</div>
    <div v-if="loadError" class="lobby-panel-error">{{ loadError }}</div>
    <div v-if="initialLoading" class="lobby-panel-loading">Loading…</div>
    <div v-else-if="participants.length === 0 && !loadError" class="lobby-panel-empty">No one waiting</div>
    <ul v-else class="lobby-panel-list">
      <li v-for="p in participants" :key="p.sid || p.joinIdentity" class="lobby-panel-item">
        <span class="lobby-panel-identity">
          {{ p.displayName || p.identity }}
          <small v-if="p.isGuest" class="lobby-panel-guest">Guest</small>
        </span>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="admittingAll || admittingKey === p.admitKey"
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
  meetingKind: { type: String, default: 'supervision' },
  /** default | dark — dark for live meeting shells */
  theme: { type: String, default: 'default' }
});

const emit = defineEmits(['update:waitingCount']);

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
const initialLoading = ref(false);
const admittingKey = ref(null);
const admittingAll = ref(false);
const disablingWaitingRoom = ref(false);
const waitingRoomEnabled = ref(true);
const admitSuccess = ref(false);
const admitError = ref('');
const loadError = ref('');
let pollInterval = null;
let hasLoadedOnce = false;

function waitingRoomPath() {
  const id = encodeURIComponent(props.sessionId);
  return props.meetingKind === 'team-meeting'
    ? `/team-meetings/${id}/waiting-room`
    : `/supervision/sessions/${id}/waiting-room`;
}

async function fetchLobbyParticipants() {
  if (!props.sessionId || !props.isSupervisor) return;
  // Only flash "Loading…" on the first fetch — polling every 2s was flickering the panel.
  if (!hasLoadedOnce) initialLoading.value = true;
  try {
    const resp = await api.get(lobbyParticipantsPath(), { skipGlobalLoading: true, skipAuthRedirect: true });
    if (resp?.data?.waitingRoomEnabled != null) {
      waitingRoomEnabled.value = !!resp.data.waitingRoomEnabled;
    }
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
    hasLoadedOnce = true;
    loadError.value = '';
    emit('update:waitingCount', participants.value.length);
  } catch (e) {
    // Keep the last good list on poll errors so the UI does not bounce empty ↔ filled.
    if (!hasLoadedOnce) participants.value = [];
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load waiting room';
    if (!hasLoadedOnce) emit('update:waitingCount', 0);
  } finally {
    initialLoading.value = false;
  }
}

async function admit(p) {
  if (!props.sessionId || !p?.admitKey || admittingAll.value) return;
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

async function openWaitingRoom() {
  if (!props.sessionId || disablingWaitingRoom.value) return;
  disablingWaitingRoom.value = true;
  admitError.value = '';
  admitSuccess.value = false;
  try {
    await api.post(waitingRoomPath(), {
      enabled: false,
      admitWaiting: true
    }, { skipGlobalLoading: true, skipAuthRedirect: true });
    waitingRoomEnabled.value = false;
    admitSuccess.value = true;
    await fetchLobbyParticipants();
    setTimeout(() => { admitSuccess.value = false; }, 4000);
  } catch (e) {
    admitError.value = e?.response?.data?.error?.message || e?.message || 'Could not open waiting room';
  } finally {
    disablingWaitingRoom.value = false;
  }
}

async function admitAll() {
  if (!props.sessionId || participants.value.length < 2 || admittingAll.value) return;
  admittingAll.value = true;
  admittingKey.value = null;
  admitError.value = '';
  admitSuccess.value = false;
  try {
    // One atomic server operation admits the current lobby and disables the waiting room,
    // so later arrivals enter the same open meeting without getting stranded in a new lobby.
    await api.post(waitingRoomPath(), {
      enabled: false,
      admitWaiting: true
    }, { skipGlobalLoading: true, skipAuthRedirect: true });
    waitingRoomEnabled.value = false;
    participants.value = [];
    emit('update:waitingCount', 0);
    admitSuccess.value = true;
    setTimeout(() => { admitSuccess.value = false; }, 4000);
  } catch (e) {
    admitError.value = e?.response?.data?.error?.message || e?.message || 'Failed to open the meeting';
  } finally {
    admittingAll.value = false;
  }
}

function startPolling() {
  if (!props.sessionId || !props.isSupervisor) return;
  void fetchLobbyParticipants();
  pollInterval = setInterval(() => { void fetchLobbyParticipants(); }, 4000);
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
    hasLoadedOnce = false;
    if (props.sessionId && props.isSupervisor) {
      startPolling();
    } else {
      participants.value = [];
      initialLoading.value = false;
      emit('update:waitingCount', 0);
    }
  },
  { immediate: true }
);

onUnmounted(stopPolling);
</script>

<style scoped>
.lobby-panel {
  padding: 12px;
  background: var(--bg-secondary, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 12px;
}
.lobby-panel--dark {
  background: #111827;
  border: 1px solid rgba(96, 165, 250, 0.45);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.2), 0 10px 28px rgba(0, 0, 0, 0.35);
  color: #e2e8f0;
}
.lobby-panel--dark .lobby-panel-title {
  color: #f8fafc;
}
.lobby-panel--dark .lobby-panel-empty,
.lobby-panel--dark .lobby-panel-loading {
  color: #94a3b8;
}
.lobby-panel--dark .lobby-panel-item {
  border-bottom-color: rgba(148, 163, 184, 0.25);
}
.lobby-panel--dark .lobby-panel-identity {
  color: #e2e8f0;
}
.lobby-panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #134e3a;
}
.lobby-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.lobby-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.lobby-panel-admit-all {
  flex-shrink: 0;
  white-space: nowrap;
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
  color: #0f172a;
  font-weight: 600;
}
.lobby-panel-guest {
  font-size: 11px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
