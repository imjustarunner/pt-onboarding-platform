<template>
  <div class="join-supervision-view">
    <div v-if="resolving" class="join-placeholder">Resolving session…</div>
    <div v-else-if="error" class="join-error">{{ error }}</div>
    <div v-else-if="token && roomName" class="join-video">
      <div class="join-video-header">
        <BrandingLogo size="medium" class="join-video-logo" />
        <span class="join-video-title">Supervision video</span>
      </div>
      <div v-if="isInLobby && lobbyEnabledForSession" class="lobby-banner">
        <strong>Admit</strong> — Waiting for supervisor to admit you to the room…
      </div>
      <SupervisionVideoLobbyPanel
        v-else-if="!isInLobby && isSupervisor && lobbyEnabledForSession"
        :session-id="sessionId"
        :is-supervisor="isSupervisor"
      />
      <SupervisionVideoRoom
        :key="videoRoomKey"
        :token="token"
        :room-name="roomName"
        :session-title="sessionTitle"
        :session-id="sessionId"
        :is-host="isSupervisor"
        @disconnected="onDisconnected"
      />
    </div>
    <div v-else class="join-placeholder">Loading…</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import BrandingLogo from '../../components/BrandingLogo.vue';
import SupervisionVideoRoom from '../../components/supervision/SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from '../../components/supervision/SupervisionVideoLobbyPanel.vue';
import api from '../../services/api';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const sessionId = computed(() => route.params.sessionId);
const organizationSlug = computed(() => route.params.organizationSlug);

const resolving = ref(false);
const error = ref('');
const token = ref('');
const roomName = ref('');
const sessionTitle = ref('');
const videoRoomKey = ref(0);
const admissionPollInterval = ref(null);
const isSupervisor = ref(false);
const roomMode = ref('main');
const lobbyEnabledForSession = ref(false);

const isInLobby = computed(() => roomMode.value === 'lobby' || String(roomName.value || '').endsWith('-lobby'));

async function pollAdmissionStatus() {
  const sid = sessionId.value;
  if (!sid || !isInLobby.value) return;
  try {
    const resp = await api.get(`/supervision/sessions/${sid}/admission-status`);
    const data = resp?.data || {};
    if (data.admitted && data.token && data.roomName) {
      token.value = String(data.token).trim();
      roomName.value = data.roomName;
      sessionTitle.value = data.sessionTitle || data.session_title || '';
      roomMode.value = String(data.roomMode || 'main').toLowerCase();
      lobbyEnabledForSession.value = !!data.lobbyEnabledForSession;
      videoRoomKey.value += 1;
      if (admissionPollInterval.value) {
        clearInterval(admissionPollInterval.value);
        admissionPollInterval.value = null;
      }
    }
  } catch {
    // ignore, will retry
  }
}

async function resolveAndRedirect() {
  const sid = sessionId.value;
  if (!sid) {
    error.value = 'Invalid session';
    return;
  }
  resolving.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/supervision/join-info/${sid}`, { skipAuthRedirect: true });
    const data = resp?.data || {};
    const slug = data.orgSlug;
    if (slug) {
      router.replace(`/${slug}/join/supervision/${sid}`);
      return;
    }
    error.value = 'Session not found';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Session not found';
  } finally {
    resolving.value = false;
  }
}

async function fetchTokenAndJoin() {
  const sid = sessionId.value;
  if (!sid) {
    error.value = 'Invalid session';
    return;
  }
  error.value = '';
  try {
    const resp = await api.get(`/supervision/sessions/${sid}/video-token`);
    const data = resp?.data || {};
    const tok = (data.token || data.data?.token || data.result?.token || '').trim();
    const rn = data.roomName || data.room_name || data.data?.roomName || `supervision-${sid}`;
    isSupervisor.value = !!data.isSupervisor;
    roomMode.value = String(data.roomMode || (String(rn || '').endsWith('-lobby') ? 'lobby' : 'main')).toLowerCase();
    lobbyEnabledForSession.value = !!data.lobbyEnabledForSession;
    if (!tok) {
      console.warn('[JoinSupervisionView] video-token empty:', { status: resp?.status, data });
      const errMsg = data?.error?.message || data?.error || '';
      error.value = errMsg || 'Video token was empty. Check Network tab: GET /api/supervision/sessions/' + sid + '/video-token.';
      return;
    }
    token.value = tok;
    roomName.value = rn;
    sessionTitle.value = data.sessionTitle || data.session_title || '';
    if (roomMode.value === 'lobby') {
      admissionPollInterval.value = setInterval(pollAdmissionStatus, 2000);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room';
  }
}

onUnmounted(() => {
  if (admissionPollInterval.value) {
    clearInterval(admissionPollInterval.value);
  }
});

function onDisconnected() {
  const slug = organizationSlug.value;
  if (slug) {
    router.push(`/${slug}/dashboard`);
  } else {
    router.push('/dashboard');
  }
}

onMounted(async () => {
  if (!organizationSlug.value) {
    await resolveAndRedirect();
    return;
  }
  if (!authStore.isAuthenticated) {
    const slug = organizationSlug.value;
    router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
    return;
  }
  await fetchTokenAndJoin();
});
</script>

<style scoped>
.join-supervision-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: var(--bg-primary, #0f0f0f);
}
.join-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}
.join-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b91c1c;
  padding: 24px;
}
.join-video {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.join-video-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.join-video-logo {
  flex-shrink: 0;
}
.join-video-title {
  font-size: 1.1rem;
  font-weight: 600;
}
.lobby-banner {
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  margin-bottom: 12px;
}
</style>
