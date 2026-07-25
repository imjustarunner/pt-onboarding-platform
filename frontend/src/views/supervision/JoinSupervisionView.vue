<template>
  <div class="join-supervision-view">
    <div v-if="resolving" class="join-placeholder">Resolving session…</div>
    <div v-else-if="error" class="join-error">{{ error }}</div>
    <GroupSupervisionLiveRoom
      v-else-if="token && vonageSessionId && applicationId"
      :supervision-session-id="numericSessionId || sessionId"
      :token="token"
      :vonage-session-id="vonageSessionId"
      :application-id="applicationId"
      :diagnostics="diagnostics"
      :session-title="sessionTitle || 'Group Supervision'"
      :session-meta="sessionMeta"
      :is-supervisor="isSupervisor"
      :is-presenter="isPresenter"
      :is-in-lobby="isInLobby"
      :lobby-enabled-for-session="lobbyEnabledForSession"
      @leave="onDisconnected"
    />
    <div v-else class="join-placeholder">Loading…</div>
  </div>
</template>

<script setup>
import { ref, onUnmounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import GroupSupervisionLiveRoom from '../../components/supervision/GroupSupervisionLiveRoom.vue';
import api from '../../services/api';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const sessionId = computed(() => route.params.sessionId);
const organizationSlug = computed(() => route.params.organizationSlug);

const resolving = ref(false);
const error = ref('');
const token = ref('');
const vonageSessionId = ref('');
const applicationId = ref('');
const diagnostics = ref(null);
const roomName = ref('');
const sessionTitle = ref('');
const sessionMeta = ref('');
const numericSessionId = ref(null);
const admissionPollInterval = ref(null);
const isSupervisor = ref(false);
const isPresenter = ref(false);
const roomMode = ref('main');
const lobbyEnabledForSession = ref(false);
const joinAttemptedForPath = ref('');

const isInLobby = computed(() => roomMode.value === 'lobby' || String(roomName.value || '').endsWith('-lobby'));

function applyTokenPayload(data) {
  const tok = (data.token || data.data?.token || '').trim();
  token.value = tok;
  vonageSessionId.value = String(data.sessionId || data.roomSid || data.vonageSessionId || '').trim();
  applicationId.value = String(data.applicationId || data.apiKey || '').trim();
  diagnostics.value = data.diagnostics || null;
  roomName.value = data.roomName || data.room_name || '';
  isSupervisor.value = !!data.isSupervisor;
  isPresenter.value = !!data.isPresenter;
  roomMode.value = String(data.roomMode || (String(roomName.value || '').endsWith('-lobby') ? 'lobby' : 'main')).toLowerCase();
  lobbyEnabledForSession.value = !!data.lobbyEnabledForSession;
  sessionTitle.value = data.sessionTitle || data.session_title || sessionTitle.value;
  if (data.supervisionSessionId) numericSessionId.value = Number(data.supervisionSessionId);
  sessionMeta.value = data.sessionType ? String(data.sessionType) : '';
}

async function pollAdmissionStatus() {
  const sid = sessionId.value;
  if (!sid || !isInLobby.value) return;
  try {
    const resp = await api.get(`/supervision/sessions/${encodeURIComponent(sid)}/admission-status`);
    const data = resp?.data || {};
    if (data.admitted && data.token) {
      applyTokenPayload(data);
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
    const resp = await api.get(`/supervision/join-info/${encodeURIComponent(sid)}`, { skipAuthRedirect: true });
    const data = resp?.data || {};
    const slug = data.orgSlug;
    if (slug) {
      const joinKey = String(data.joinToken || sid).trim();
      if (data.sessionId) numericSessionId.value = Number(data.sessionId);
      router.replace(`/${slug}/join/supervision/${encodeURIComponent(joinKey)}`);
      return;
    }
    error.value = 'Session not found';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Session not found';
  } finally {
    resolving.value = false;
  }
}

async function ensureAuthenticatedSession({ forceRefresh = false } = {}) {
  if (authStore.isAuthenticated && !forceRefresh) return true;
  try {
    const resp = await api.get('/users/me', { skipAuthRedirect: true, skipGlobalLoading: true });
    const u = resp?.data || null;
    if (u && (u.id || u.email)) {
      // Keep any existing Bearer JWT; only refresh the SPA user payload from cookie/session.
      const existingToken = (() => {
        try { return localStorage.getItem('authToken') || authStore.token || null; } catch { return null; }
      })();
      authStore.setAuth(existingToken, u, localStorage.getItem('sessionId') || null);
      return true;
    }
  } catch {
    // route to login below
  }
  const slug = organizationSlug.value;
  if (slug) {
    router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
  } else {
    router.replace('/login');
  }
  return false;
}

async function fetchTokenAndJoin({ retried = false } = {}) {
  const sid = sessionId.value;
  if (!sid) {
    error.value = 'Invalid session';
    return;
  }
  error.value = '';
  try {
    const resp = await api.get(`/supervision/sessions/${encodeURIComponent(sid)}/video-token`);
    const data = resp?.data || {};
    applyTokenPayload(data);
    if (!token.value || !vonageSessionId.value || !applicationId.value) {
      console.warn('[JoinSupervisionView] video-token incomplete:', { status: resp?.status, data });
      const errMsg = data?.error?.message || data?.error || '';
      error.value = errMsg || 'Video credentials were incomplete. Check Vonage configuration.';
      return;
    }
    if (roomMode.value === 'lobby') {
      admissionPollInterval.value = setInterval(pollAdmissionStatus, 2000);
    }
  } catch (e) {
    if (Number(e?.response?.status || 0) === 401 && !retried) {
      // Do NOT clearAuth first — that wipes localStorage JWT and forces a false login wall
      // when the cookie is briefly unavailable but the SPA still has a valid Bearer token.
      const ok = await ensureAuthenticatedSession({ forceRefresh: true });
      if (!ok) return;
      await fetchTokenAndJoin({ retried: true });
      return;
    }
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room';
  }
}

async function runJoinFlowForCurrentRoute() {
  const pathKey = String(route.fullPath || '');
  if (joinAttemptedForPath.value === pathKey) return;
  joinAttemptedForPath.value = pathKey;

  if (!organizationSlug.value) {
    await resolveAndRedirect();
    return;
  }
  const ok = await ensureAuthenticatedSession();
  if (!ok) return;
  await fetchTokenAndJoin();
}

watch(
  () => [route.fullPath, organizationSlug.value, sessionId.value],
  () => {
    void runJoinFlowForCurrentRoute();
  },
  { immediate: true }
);

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
</script>

<style scoped>
.join-supervision-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary, #0f0f0f);
}
.join-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  padding: 24px;
}
.join-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b91c1c;
  padding: 24px;
}
</style>
