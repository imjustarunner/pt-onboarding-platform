<template>
  <div class="join-supervision-view">
    <div v-if="resolving" class="join-placeholder">Resolving session…</div>
    <div v-else-if="error" class="join-error">
      <p>{{ error }}</p>
      <button
        v-if="showLoginFallback"
        type="button"
        class="join-login-btn"
        @click="goLogin"
      >
        Log in to join
      </button>
    </div>
    <GroupSupervisionLiveRoom
      v-else-if="token && vonageSessionId && applicationId"
      :supervision-session-id="numericSessionId || sessionId"
      :token="token"
      :vonage-session-id="vonageSessionId"
      :application-id="applicationId"
      :diagnostics="diagnostics"
      :session-title="sessionTitle || 'Supervision'"
      :session-meta="sessionMeta"
      :is-supervisor="isSupervisor"
      :is-presenter="isPresenter"
      :is-in-lobby="isInLobby"
      :lobby-enabled-for-session="lobbyEnabledForSession"
      :join-identity="joinIdentity"
      :local-display-name="localDisplayName"
      :local-role-label="localRoleLabel"
      @leave="onDisconnected"
    />
    <div v-else class="join-placeholder">Loading…</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
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
const showLoginFallback = ref(false);
const token = ref('');
const vonageSessionId = ref('');
const applicationId = ref('');
const diagnostics = ref(null);
const roomName = ref('');
const sessionTitle = ref('');
const sessionMeta = ref('');
const numericSessionId = ref(null);
const admissionPollInterval = ref(null);
const presencePollInterval = ref(null);
const isSupervisor = ref(false);
const isPresenter = ref(false);
const roomMode = ref('main');
const lobbyEnabledForSession = ref(false);
const joinIdentity = ref('');
const localDisplayName = ref('');
const localRoleLabel = ref('');
const joinAttemptedForPath = ref('');

const isInLobby = computed(() => roomMode.value === 'lobby' || String(roomName.value || '').endsWith('-lobby'));
const isOpaqueJoinRef = computed(() => {
  const ref = String(sessionId.value || '').trim();
  return !!ref && !/^\d+$/.test(ref);
});

function stableGuestKey(joinToken) {
  const tokenKey = String(joinToken || '').trim();
  if (!tokenKey) return '';
  const storageKey = `supv-guest-key:${tokenKey}`;
  try {
    let existing = sessionStorage.getItem(storageKey) || '';
    if (!/^[a-zA-Z0-9]{8,32}$/.test(existing)) {
      existing = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 24);
      sessionStorage.setItem(storageKey, existing);
    }
    return existing;
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 24);
  }
}

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
  joinIdentity.value = String(data.identity || '').trim();
  localDisplayName.value = String(data.displayName || '').trim();
  localRoleLabel.value = String(data.roleLabel || '').trim()
    || (data.isSupervisor ? 'Supervisor' : (data.isPresenter ? 'Presenter' : (data.guest ? 'Guest' : 'Supervisee')));
}

async function pollAdmissionStatus() {
  const sid = sessionId.value;
  if (!sid || !isInLobby.value) return;
  try {
    const resp = await api.get(`/supervision/sessions/${encodeURIComponent(sid)}/admission-status`, {
      skipAuthRedirect: true
    });
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

function startPresenceHeartbeat() {
  if (presencePollInterval.value) clearInterval(presencePollInterval.value);
  const tick = async () => {
    const sid = numericSessionId.value || sessionId.value;
    const identity = joinIdentity.value;
    if (!sid || !identity) return;
    try {
      await api.post(
        `/supervision/sessions/${encodeURIComponent(sid)}/join-presence`,
        { identity, action: 'heartbeat' },
        { skipAuthRedirect: true, skipGlobalLoading: true }
      );
    } catch {
      /* ignore */
    }
  };
  void tick();
  presencePollInterval.value = setInterval(tick, 15000);
}

function presenceLeaveUrl(sid) {
  const base = String(api?.defaults?.baseURL || '/api').replace(/\/$/, '');
  return `${base}/supervision/sessions/${encodeURIComponent(sid)}/join-presence`;
}

async function leavePresence() {
  const sid = numericSessionId.value || sessionId.value;
  const identity = joinIdentity.value;
  if (!sid || !identity) return;
  const body = { identity, action: 'leave' };
  try {
    // Beacon survives tab close / navigation better than a normal XHR.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      if (navigator.sendBeacon(presenceLeaveUrl(sid), blob)) return;
    }
  } catch {
    /* fall through */
  }
  try {
    await api.post(
      `/supervision/sessions/${encodeURIComponent(sid)}/join-presence`,
      body,
      { skipAuthRedirect: true, skipGlobalLoading: true }
    );
  } catch {
    /* ignore */
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

async function fetchGuestToken() {
  const sid = sessionId.value;
  if (!sid || !isOpaqueJoinRef.value) return false;
  const guestKey = stableGuestKey(sid);
  const resp = await api.get(`/supervision/guest-join/${encodeURIComponent(sid)}`, {
    params: guestKey ? { guestKey } : undefined,
    skipAuthRedirect: true,
    skipGlobalLoading: true
  });
  applyTokenPayload(resp?.data || {});
  if (!token.value || !vonageSessionId.value || !applicationId.value) {
    throw new Error('Video credentials were incomplete.');
  }
  startPresenceHeartbeat();
  return true;
}

async function fetchAuthenticatedToken() {
  const sid = sessionId.value;
  const resp = await api.get(`/supervision/sessions/${encodeURIComponent(sid)}/video-token`, {
    skipAuthRedirect: true
  });
  applyTokenPayload(resp?.data || {});
  if (!token.value || !vonageSessionId.value || !applicationId.value) {
    throw new Error('Video credentials were incomplete.');
  }
  if (roomMode.value === 'lobby') {
    admissionPollInterval.value = setInterval(pollAdmissionStatus, 2000);
  }
  startPresenceHeartbeat();
  return true;
}

async function ensureAuthenticatedSession() {
  if (authStore.isAuthenticated) return true;
  try {
    const resp = await api.get('/users/me', { skipAuthRedirect: true, skipGlobalLoading: true });
    const u = resp?.data || null;
    if (u && (u.id || u.email)) {
      const existingToken = (() => {
        try { return localStorage.getItem('authToken') || authStore.token || null; } catch { return null; }
      })();
      authStore.setAuth(existingToken, u, localStorage.getItem('sessionId') || null);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

function goLogin() {
  const slug = organizationSlug.value;
  const redirect = encodeURIComponent(route.fullPath);
  if (slug) router.replace(`/${slug}/login?redirect=${redirect}`);
  else router.replace(`/login?redirect=${redirect}`);
}

async function fetchTokenAndJoin() {
  const sid = sessionId.value;
  if (!sid) {
    error.value = 'Invalid session';
    return;
  }
  error.value = '';
  showLoginFallback.value = false;
  try {
    // Prefer authenticated join when logged in so the same user reuses one seat
    // (guest path used to mint a new identity per tab and lock individual rooms at 2).
    const loggedIn = await ensureAuthenticatedSession();
    if (loggedIn) {
      try {
        await fetchAuthenticatedToken();
        return;
      } catch (authErr) {
        const status = Number(authErr?.response?.status || 0);
        if (status === 409) {
          error.value = authErr?.response?.data?.error?.message
            || 'This session is full right now. When someone leaves, try the link again.';
          return;
        }
        // Fall through to guest when auth token path fails for other reasons.
      }
    }

    if (isOpaqueJoinRef.value) {
      try {
        await fetchGuestToken();
        return;
      } catch (guestErr) {
        const status = Number(guestErr?.response?.status || 0);
        if (status === 409) {
          error.value = guestErr?.response?.data?.error?.message
            || 'This session is full right now. When someone leaves, try the link again.';
          return;
        }
      }
    }

    showLoginFallback.value = true;
    error.value = isOpaqueJoinRef.value
      ? 'Could not join as guest. Log in with your account, or ask the host for a fresh join link.'
      : 'Please log in to join this session.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room';
    if (Number(e?.response?.status || 0) === 401) showLoginFallback.value = true;
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
  await fetchTokenAndJoin();
}

watch(
  () => [route.fullPath, organizationSlug.value, sessionId.value],
  () => {
    void runJoinFlowForCurrentRoute();
  },
  { immediate: true }
);

function onPageLeave() {
  void leavePresence();
}

onMounted(() => {
  window.addEventListener('pagehide', onPageLeave);
  window.addEventListener('beforeunload', onPageLeave);
});

onUnmounted(() => {
  window.removeEventListener('pagehide', onPageLeave);
  window.removeEventListener('beforeunload', onPageLeave);
  if (admissionPollInterval.value) clearInterval(admissionPollInterval.value);
  if (presencePollInterval.value) clearInterval(presencePollInterval.value);
  void leavePresence();
});

async function onDisconnected() {
  await leavePresence();
  const slug = organizationSlug.value;
  if (authStore.isAuthenticated) {
    if (slug) router.push(`/${slug}/dashboard`);
    else router.push('/dashboard');
    return;
  }
  // Guests: stay on a simple thank-you state instead of bouncing to login/dashboard.
  error.value = 'You left the session. Close this tab, or use the join link again if the room still has an open seat.';
  token.value = '';
  vonageSessionId.value = '';
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #b91c1c;
  padding: 24px;
  text-align: center;
}
.join-login-btn {
  border: none;
  border-radius: 10px;
  background: #15803d;
  color: #fff;
  font-weight: 700;
  padding: 10px 16px;
  cursor: pointer;
}
</style>
