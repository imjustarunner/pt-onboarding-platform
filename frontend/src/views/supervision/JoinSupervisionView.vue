<template>
  <div class="join-supervision-view">
    <MeetingSessionExitPanel
      v-if="sessionExit"
      :variant="sessionExit.variant"
      :can-rejoin="sessionExit.canRejoin"
      meeting-label="session"
      session-kind="supervision"
      :banner-dismissed="exitBannerDismissed"
      @rejoin="rejoinSession"
      @go-to-schedule="goToScheduleFromExit"
      @dismiss-banner="dismissHostEndedBanner"
    />
    <div v-else-if="resolving" class="join-placeholder">Resolving session…</div>
    <div v-else-if="error && !token" class="join-error">
      <p>{{ error }}</p>
      <button
        v-if="showLoginFallback"
        type="button"
        class="join-login-btn"
        @click="goLogin"
      >
        Log in to join
      </button>
      <button
        v-if="sessionExit === null && error.includes('left the session')"
        type="button"
        class="join-login-btn join-login-btn--secondary"
        @click="rejoinSession"
      >
        Rejoin session
      </button>
    </div>
    <SupervisionLiveRoom
      v-else-if="token && vonageSessionId && applicationId"
      ref="liveRoomRef"
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
      :local-profile-photo-url="localProfilePhotoUrl"
      :join-token="isOpaqueJoinRef ? String(sessionId || '') : ''"
      :host-present="hostPresent"
      :host-role-label="hostRoleLabel"
      :host-status-label="hostStatusLabel"
      :waiting-goals="waitingGoals"
      :waiting-agenda="waitingAgenda"
      :waiting-action-items="waitingActionItems"
      @leave="onLeaveRequest"
      @connected="onVideoConnected"
      @meeting-ended="onMeetingEnded"
      @disconnected="onVideoDisconnected"
    />
    <div v-else class="join-placeholder">Loading…</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import SupervisionLiveRoom from '../../components/supervision/SupervisionLiveRoom.vue';
import MeetingSessionExitPanel from '../../components/meetings/MeetingSessionExitPanel.vue';
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
const localProfilePhotoUrl = ref('');
const hostPresent = ref(false);
const hostRoleLabel = ref('Supervisor');
const hostStatusLabel = ref('');
const waitingGoals = ref([]);
const waitingAgenda = ref([]);
const waitingActionItems = ref([]);
const isGuestJoin = ref(false);
const joinAttemptedForPath = ref('');
const intentionalLeave = ref(false);
const sessionExit = ref(null);
const exitBannerDismissed = ref(false);
const liveRoomRef = ref(null);
const videoConnected = ref(false);

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
  lobbyEnabledForSession.value = !!(data.lobbyEnabledForSession ?? data.waitingRoomEnabled);
  sessionTitle.value = data.sessionTitle || data.session_title || sessionTitle.value;
  if (data.supervisionSessionId) numericSessionId.value = Number(data.supervisionSessionId);
  sessionMeta.value = data.sessionType ? String(data.sessionType) : '';
  joinIdentity.value = String(data.identity || '').trim();
  isGuestJoin.value = !!data.guest || String(data.identity || '').startsWith('guest-');
  const u = authStore.user || {};
  const authPerson = `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim();
  const authName = authPerson || u.email || '';
  const fromApi = String(data.displayName || '').trim();
  // Prefer a real person name over an email (API sometimes falls back to email).
  const preferName = (...cands) => {
    for (const c of cands) {
      const t = String(c || '').trim();
      if (t && !t.includes('@') && t.toLowerCase() !== 'guest') return t;
    }
    for (const c of cands) {
      const t = String(c || '').trim();
      if (t && t.toLowerCase() !== 'guest') return t;
    }
    return '';
  };
  localDisplayName.value = preferName(authPerson, fromApi, authName);
  const roleFromApi = String(data.roleLabel || '').trim();
  localRoleLabel.value = (roleFromApi && roleFromApi.toLowerCase() !== 'guest')
    ? roleFromApi
    : 'Supervisee';
  if (Object.prototype.hasOwnProperty.call(data, 'hostPresent')) {
    hostPresent.value = !!data.hostPresent;
  }
  if (data.hostRoleLabel) hostRoleLabel.value = String(data.hostRoleLabel);
  if (data.hostStatusLabel) hostStatusLabel.value = String(data.hostStatusLabel);
  if (Array.isArray(data.goals)) waitingGoals.value = data.goals;
  if (Array.isArray(data.agenda)) waitingAgenda.value = data.agenda;
  if (Array.isArray(data.actionItems)) waitingActionItems.value = data.actionItems;
}

function stopAdmissionPolling() {
  if (admissionPollInterval.value) {
    clearInterval(admissionPollInterval.value);
    admissionPollInterval.value = null;
  }
}

function stopPresenceHeartbeat() {
  if (presencePollInterval.value) {
    clearInterval(presencePollInterval.value);
    presencePollInterval.value = null;
  }
}

function startAdmissionPolling() {
  stopAdmissionPolling();
  admissionPollInterval.value = setInterval(pollAdmissionStatus, 2000);
}

async function pollAdmissionStatus() {
  const sid = sessionId.value;
  if (!sid || !isInLobby.value) return;
  try {
    let data = {};
    if (isGuestJoin.value && isOpaqueJoinRef.value) {
      const guestKey = stableGuestKey(sid);
      const resp = await api.get(`/supervision/guest-admission/${encodeURIComponent(sid)}`, {
        params: {
          guestKey,
          displayName: localDisplayName.value || undefined
        },
        skipAuthRedirect: true,
        skipGlobalLoading: true
      });
      data = resp?.data || {};
    } else {
      const resp = await api.get(`/supervision/sessions/${encodeURIComponent(sid)}/admission-status`, {
        skipAuthRedirect: true,
        skipGlobalLoading: true
      });
      data = resp?.data || {};
    }
    if (data.roomMode === 'ended' || data.sessionEnded) {
      stopAdmissionPolling();
      void finishLeave({ variant: 'host-ended', canRejoin: false });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'hostPresent')) {
      hostPresent.value = !!data.hostPresent;
    }
    if (data.hostRoleLabel) hostRoleLabel.value = String(data.hostRoleLabel);
    if (data.hostStatusLabel) hostStatusLabel.value = String(data.hostStatusLabel);
    if (Array.isArray(data.goals)) waitingGoals.value = data.goals;
    if (Array.isArray(data.agenda)) waitingAgenda.value = data.agenda;
    if (Array.isArray(data.actionItems)) waitingActionItems.value = data.actionItems;
    if (data.sessionTitle && !sessionTitle.value) sessionTitle.value = String(data.sessionTitle);
    if (data.admitted && data.token) {
      applyTokenPayload(data);
      stopAdmissionPolling();
      // Keep heartbeat running (already started in lobby).
      startPresenceHeartbeat();
    }
  } catch {
    // ignore, will retry
  }
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  const tick = async () => {
    const sid = numericSessionId.value || sessionId.value;
    const identity = joinIdentity.value;
    if (!sid || !identity) return;
    try {
      await api.post(
        `/supervision/sessions/${encodeURIComponent(sid)}/join-presence`,
        {
          identity,
          action: 'heartbeat',
          displayName: localDisplayName.value || undefined
        },
        { skipAuthRedirect: true, skipGlobalLoading: true }
      );
    } catch {
      /* ignore */
    }
  };
  void tick();
  // Faster than stale window so hosts keep seeing lobby waiters.
  presencePollInterval.value = setInterval(tick, 10000);
}

function presenceLeaveUrl(sid) {
  const base = String(api?.defaults?.baseURL || '/api').replace(/\/$/, '');
  return `${base}/supervision/sessions/${encodeURIComponent(sid)}/join-presence`;
}

async function leavePresence() {
  const sid = numericSessionId.value || sessionId.value;
  const identity = joinIdentity.value;
  if (!sid || !identity) return;
  const body = JSON.stringify({ identity, action: 'leave' });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(presenceLeaveUrl(sid), blob);
      return;
    }
  } catch { /* ignore */ }
  try {
    await api.post(
      `/supervision/sessions/${encodeURIComponent(sid)}/join-presence`,
      { identity, action: 'leave' },
      { skipAuthRedirect: true, skipGlobalLoading: true }
    );
  } catch { /* ignore */ }
}

async function teardownLiveSession() {
  stopAdmissionPolling();
  stopPresenceHeartbeat();
  try {
    liveRoomRef.value?.disconnect?.();
  } catch { /* ignore */ }
  await leavePresence();
  token.value = '';
  vonageSessionId.value = '';
  roomName.value = '';
  videoConnected.value = false;
}

function showSessionExit({ variant = 'left', canRejoin = true } = {}) {
  sessionExit.value = { variant, canRejoin: !!canRejoin };
  exitBannerDismissed.value = false;
}

function dismissHostEndedBanner() {
  exitBannerDismissed.value = true;
  goToScheduleFromExit();
}

function navigateAway() {
  const slug = organizationSlug.value;
  if (authStore.isAuthenticated) {
    if (slug) router.push({ path: `/${slug}/dashboard`, query: { focus: 'schedule', tab: 'my_schedule' } });
    else router.push({ path: '/dashboard', query: { focus: 'schedule', tab: 'my_schedule' } });
    return;
  }
  error.value = 'You left the session. Use Rejoin below if the room is still open.';
  sessionExit.value = null;
}

function goToScheduleFromExit() {
  sessionExit.value = null;
  exitBannerDismissed.value = false;
  navigateAway();
}

async function rejoinSession() {
  sessionExit.value = null;
  exitBannerDismissed.value = false;
  intentionalLeave.value = false;
  error.value = '';
  joinAttemptedForPath.value = '';
  await fetchTokenAndJoin();
}

async function endLiveSessionForEveryone() {
  const sid = numericSessionId.value || sessionId.value;
  if (!sid) return;
  try {
    await api.post(`/supervision/sessions/${encodeURIComponent(sid)}/end-live`, {}, {
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
  } catch (e) {
    console.warn('[JoinSupervision] end-live failed', e?.message || e);
  }
}

async function finishLeave({ variant = 'left', canRejoin = true } = {}) {
  intentionalLeave.value = true;
  await teardownLiveSession();
  showSessionExit({ variant, canRejoin });
}

async function onLeaveRequest(payload = {}) {
  if (intentionalLeave.value || sessionExit.value) return;
  const endForAll = !!payload?.endForAll;
  if (endForAll) {
    await endLiveSessionForEveryone();
    await finishLeave({ variant: 'ended-by-you', canRejoin: false });
    return;
  }
  await finishLeave({ variant: 'left', canRejoin: true });
}

function onMeetingEnded() {
  if (sessionExit.value || intentionalLeave.value) return;
  void finishLeave({ variant: 'host-ended', canRejoin: false });
}

function onVideoDisconnected() {
  if (intentionalLeave.value || sessionExit.value) return;
  videoConnected.value = false;
  void finishLeave({ variant: 'left', canRejoin: true });
}

function onVideoConnected() {
  videoConnected.value = true;
}

function goLogin() {
  const slug = organizationSlug.value;
  if (slug) {
    router.push(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
  } else {
    router.push(`/login?redirect=${encodeURIComponent(route.fullPath)}`);
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
    if (!slug) {
      error.value = 'Session organization not found';
      return;
    }
    if (slug !== organizationSlug.value) {
      router.replace(`/${slug}/join/supervision/${encodeURIComponent(sid)}`);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Session not found';
  } finally {
    resolving.value = false;
  }
}

async function fetchGuestToken() {
  const sid = sessionId.value;
  const guestKey = stableGuestKey(sid);
  const resp = await api.get(`/supervision/guest-join/${encodeURIComponent(sid)}`, {
    params: {
      guestKey,
      displayName: localDisplayName.value || 'Guest'
    },
    skipAuthRedirect: true
  });
  applyTokenPayload(resp?.data || {});
  startPresenceHeartbeat();
  if (isInLobby.value) startAdmissionPolling();
}

function appearsLoggedInLocally() {
  if (authStore.isAuthenticated) return true;
  try {
    return !!(localStorage.getItem('user') || localStorage.getItem('authToken'));
  } catch {
    return false;
  }
}

async function requestVideoToken(sid, { authRetry = false } = {}) {
  const headers = {};
  if (authRetry) {
    try {
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) headers.Authorization = `Bearer ${storedToken}`;
    } catch { /* ignore */ }
  }
  return api.get(`/supervision/sessions/${encodeURIComponent(sid)}/video-token`, {
    skipAuthRedirect: true,
    headers
  });
}

async function fetchTokenAndJoin() {
  error.value = '';
  showLoginFallback.value = false;
  const sid = sessionId.value;
  try {
    let resp;
    try {
      resp = await requestVideoToken(sid);
    } catch (firstErr) {
      const firstStatus = Number(firstErr?.response?.status || 0);
      // iPad/Safari: cookie may lag a beat after navigation; retry with Bearer if we look logged in.
      if (firstStatus === 401 && appearsLoggedInLocally()) {
        await new Promise((r) => setTimeout(r, 350));
        resp = await requestVideoToken(sid, { authRetry: true });
      } else {
        throw firstErr;
      }
    }
    applyTokenPayload(resp?.data || {});
    // Heartbeat in lobby too — otherwise waiters vanish from the host list after ~25s.
    startPresenceHeartbeat();
    if (isInLobby.value) startAdmissionPolling();
    return;
  } catch (e) {
    const status = Number(e?.response?.status || 0);
    if (status === 401) {
      if (isOpaqueJoinRef.value) {
        try {
          await fetchGuestToken();
          return;
        } catch (guestErr) {
          const guestStatus = Number(guestErr?.response?.status || 0);
          if (guestStatus === 409) {
            error.value = guestErr?.response?.data?.error?.message
              || 'This session is full right now. When someone leaves, try the link again.';
            return;
          }
          // Prefer login CTA when we already look authenticated — guest path failed.
          error.value = appearsLoggedInLocally()
            ? (guestErr?.response?.data?.error?.message
              || 'Could not join this session. Try Log in to join to refresh your session.')
            : (guestErr?.response?.data?.error?.message
              || 'Could not join as guest. Log in with your account, or ask the host for a fresh join link.');
          showLoginFallback.value = true;
          return;
        }
      }
      showLoginFallback.value = true;
      error.value = 'Please log in to join this session.';
      return;
    }
    if (status === 409) {
      error.value = e?.response?.data?.error?.message
        || 'This session is full right now. When someone leaves, try the link again.';
      return;
    }
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room';
    if (status === 401) showLoginFallback.value = true;
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
  stopAdmissionPolling();
  stopPresenceHeartbeat();
  if (!intentionalLeave.value) void leavePresence();
});
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
.join-login-btn--secondary {
  background: #1e293b;
  color: #e2e8f0;
}
</style>
