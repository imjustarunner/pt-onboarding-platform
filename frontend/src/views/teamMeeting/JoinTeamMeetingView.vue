<template>
  <div class="join-team-meeting-view">
    <div v-if="resolving" class="join-placeholder">Resolving meeting…</div>
    <div v-else-if="error && !token" class="join-error">{{ error }}</div>
    <template v-else-if="token && (vonageSessionId || roomName)">
      <div v-if="isInLobby" class="join-lobby-banner">
        You’re in the waiting room. The host will admit you shortly.
      </div>
      <div class="join-session-layout">
        <div class="join-video">
          <SupervisionVideoRoom
            :token="token"
            :vonage-session-id="vonageSessionId"
            :room-name="roomName"
            :application-id="applicationId"
            :diagnostics="diagnostics"
            :event-id="resolvedEventId || eventId"
            :is-host="isHost"
            :local-display-name="localDisplayName"
            :local-role-label="localRoleLabel"
            :local-profile-photo-url="localProfilePhotoUrl"
            @disconnected="onDisconnected"
          />
          <SupervisionVideoLobbyPanel
            v-if="isHost && resolvedEventId"
            :session-id="resolvedEventId"
            :is-supervisor="isHost"
            meeting-kind="team-meeting"
          />
        </div>
        <aside v-if="resolvedEventId && !isInLobby" class="join-agenda-aside">
          <MeetingAgendaPanel
            meeting-type="provider_schedule_event"
            :meeting-id="resolvedEventId"
            :can-add-item="true"
            :embedded="true"
            :live="true"
          />
        </aside>
      </div>
    </template>
    <div v-else class="join-placeholder">Loading…</div>

    <div v-if="isHost && resolvedEventId && (token || error)" class="join-activity-section">
      <button
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="activityLoading"
        @click="toggleActivity"
      >
        {{ activityExpanded ? 'Hide' : 'View' }} meeting chat & Q&A
      </button>
      <div v-if="activityExpanded" class="join-activity-content">
        <div v-if="activityLoading" class="muted">Loading…</div>
        <div v-else-if="activityError" class="error-inline">{{ activityError }}</div>
        <div v-else-if="!activityList?.length" class="muted">No chat, polls, or Q&A recorded for this meeting.</div>
        <div v-else class="activity-list">
          <div
            v-for="a in activityList"
            :key="a.id"
            class="activity-item"
            :class="`activity-${a.activityType}`"
          >
            <span class="activity-sender">{{ a.participantIdentity?.replace(/^user-/, 'User ') }}</span>
            <span v-if="a.activityType === 'chat'" class="activity-text">{{ a.payload?.text }}</span>
            <span v-else-if="a.activityType === 'poll'" class="activity-text">Poll: {{ a.payload?.question }} — {{ (a.payload?.options || []).join(', ') }}</span>
            <span v-else-if="a.activityType === 'poll_vote'" class="activity-text">Voted on poll</span>
            <span v-else-if="a.activityType === 'question'" class="activity-text">Q: {{ a.payload?.text }}</span>
            <span v-else-if="a.activityType === 'answer'" class="activity-text">A: {{ a.payload?.text }}</span>
            <span class="activity-time">{{ formatActivityTime(a.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { suspendInactivityTimeout, resumeInactivityTimeout } from '../../utils/activityTracker';
import SupervisionVideoRoom from '../../components/supervision/SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from '../../components/supervision/SupervisionVideoLobbyPanel.vue';
import MeetingAgendaPanel from '../../components/meetings/MeetingAgendaPanel.vue';
import api from '../../services/api';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const eventId = computed(() => route.params.eventId);
const organizationSlug = computed(() => route.params.organizationSlug);

const resolving = ref(false);
const error = ref('');
const token = ref('');
const vonageSessionId = ref('');
const applicationId = ref('');
const diagnostics = ref(null);
const roomName = ref('');
const isHost = ref(false);
const resolvedEventId = ref(0);
const roomMode = ref('main');
const joinIdentity = ref('');
const localDisplayName = ref('');
const localRoleLabel = ref('');
const localProfilePhotoUrl = ref('');
const activityExpanded = ref(false);
const activityLoading = ref(false);
const activityError = ref('');
const activityList = ref([]);
const joinAttemptedForPath = ref('');
let admissionPollInterval = null;
let presencePollInterval = null;

const isInLobby = computed(() => roomMode.value === 'lobby' || String(roomName.value || '').endsWith('-lobby'));

function formatActivityTime(createdAt) {
  if (!createdAt) return '';
  try {
    const d = new Date(createdAt);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function applyTokenPayload(data) {
  const tok = String(data.token || data.data?.token || '').trim();
  if (tok) token.value = tok;
  const sid = String(data.sessionId || data.roomSid || data.vonageSessionId || '').trim();
  if (sid) vonageSessionId.value = sid;
  applicationId.value = String(data.applicationId || data.apiKey || applicationId.value || '').trim();
  diagnostics.value = data.diagnostics || diagnostics.value;
  roomName.value = data.roomName || data.room_name || roomName.value;
  isHost.value = !!(data.isHost ?? data.is_host);
  roomMode.value = String(data.roomMode || (String(roomName.value || '').endsWith('-lobby') ? 'lobby' : 'main')).toLowerCase();
  joinIdentity.value = String(data.identity || joinIdentity.value || '').trim();
  localDisplayName.value = String(data.displayName || localDisplayName.value || '').trim();
  localRoleLabel.value = String(data.roleLabel || localRoleLabel.value || '').trim();
  localProfilePhotoUrl.value = String(data.profilePhotoUrl || localProfilePhotoUrl.value || '').trim();
  if (Number(data.eventId || 0) > 0) resolvedEventId.value = Number(data.eventId);
}

function stopAdmissionPolling() {
  if (admissionPollInterval) {
    clearInterval(admissionPollInterval);
    admissionPollInterval = null;
  }
}

function stopPresenceHeartbeat() {
  if (presencePollInterval) {
    clearInterval(presencePollInterval);
    presencePollInterval = null;
  }
}

async function sendPresence(action = 'heartbeat') {
  const eid = resolvedEventId.value || eventId.value;
  const identity = joinIdentity.value;
  if (!eid || !identity) return;
  try {
    await api.post(`/team-meetings/${encodeURIComponent(eid)}/join-presence`, {
      identity,
      joinIdentity: identity,
      action,
      displayName: localDisplayName.value || undefined
    }, { skipAuthRedirect: true, skipGlobalLoading: true });
  } catch {
    /* best-effort */
  }
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  sendPresence('heartbeat');
  presencePollInterval = setInterval(() => sendPresence('heartbeat'), 15000);
}

async function pollAdmission() {
  const eid = resolvedEventId.value || eventId.value;
  if (!eid || !isInLobby.value) return;
  try {
    const resp = await api.get(`/team-meetings/${encodeURIComponent(eid)}/admission-status`, {
      skipAuthRedirect: true,
      skipGlobalLoading: true
    });
    const data = resp?.data || {};
    if (data.admitted && data.token) {
      applyTokenPayload(data);
      stopAdmissionPolling();
      startPresenceHeartbeat();
    }
  } catch {
    /* keep waiting */
  }
}

function startAdmissionPolling() {
  stopAdmissionPolling();
  pollAdmission();
  admissionPollInterval = setInterval(pollAdmission, 2500);
}

async function toggleActivity() {
  const eid = resolvedEventId.value || eventId.value;
  if (!eid) return;
  const expanded = !activityExpanded.value;
  activityExpanded.value = expanded;
  if (!expanded) return;
  if (activityList.value?.length) return;
  activityLoading.value = true;
  activityError.value = '';
  try {
    const resp = await api.get(`/team-meetings/${encodeURIComponent(eid)}/activity`);
    activityList.value = resp?.data?.activity || [];
  } catch (err) {
    activityError.value = err?.response?.data?.error?.message || 'Failed to load chat & Q&A.';
    activityList.value = [];
  } finally {
    activityLoading.value = false;
  }
}

async function resolveAndRedirect() {
  const eid = eventId.value;
  if (!eid) {
    error.value = 'Invalid event';
    return;
  }
  resolving.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/team-meetings/join-info/${encodeURIComponent(eid)}`, { skipAuthRedirect: true });
    const data = resp?.data || {};
    const slug = data.orgSlug;
    if (slug) {
      const joinKey = String(data.joinToken || eid).trim();
      if (Number(data.eventId || 0) > 0) resolvedEventId.value = Number(data.eventId);
      router.replace(`/${slug}/join/team-meeting/${encodeURIComponent(joinKey)}`);
      return;
    }
    error.value = 'Meeting not found';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Meeting not found';
  } finally {
    resolving.value = false;
  }
}

async function fetchTokenAndJoin() {
  const eid = eventId.value;
  if (!eid) {
    error.value = 'Invalid event';
    return;
  }
  error.value = '';
  try {
    const resp = await api.get(`/team-meetings/${encodeURIComponent(eid)}/video-token`);
    applyTokenPayload(resp?.data || {});
    if (!token.value) {
      error.value = `Video token was empty. Check Network tab: GET /api/team-meetings/${eid}/video-token.`;
      return;
    }
    if (!vonageSessionId.value) {
      vonageSessionId.value = String(resp?.data?.roomSid || '').trim();
    }
    const u = authStore.user || {};
    const authName = `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || u.email || '';
    if (authName && (!localDisplayName.value || localDisplayName.value === 'Guest')) {
      localDisplayName.value = authName;
    }
    if (!localProfilePhotoUrl.value) {
      localProfilePhotoUrl.value = String(u.profile_photo_url || u.profilePhotoUrl || '').trim();
    }
    if (roomMode.value === 'lobby') startAdmissionPolling();
    startPresenceHeartbeat();
  } catch (e) {
    if (Number(e?.response?.status || 0) === 401) {
      const slug = organizationSlug.value;
      if (slug) {
        router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
        return;
      }
    }
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room';
  }
}

async function ensureAuthenticatedSession() {
  if (authStore.isAuthenticated) return true;
  try {
    const resp = await api.get('/users/me', { skipAuthRedirect: true, skipGlobalLoading: true });
    const u = resp?.data || null;
    if (u && (u.id || u.email)) {
      authStore.setAuth(null, u, localStorage.getItem('sessionId') || null);
      return true;
    }
  } catch {
    // ignore and route to login below
  }
  const slug = organizationSlug.value;
  if (slug) {
    router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
  } else {
    router.replace('/login');
  }
  return false;
}

function onDisconnected() {
  sendPresence('leave');
  stopAdmissionPolling();
  stopPresenceHeartbeat();
  const slug = organizationSlug.value;
  if (slug) {
    router.push(`/${slug}/dashboard`);
  } else {
    router.push('/dashboard');
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
  () => [route.fullPath, organizationSlug.value, eventId.value],
  () => {
    void runJoinFlowForCurrentRoute();
  },
  { immediate: true }
);

watch(
  () => token.value,
  (t, prev) => {
    const has = String(t || '').trim();
    const had = String(prev || '').trim();
    if (has && !had) suspendInactivityTimeout();
    else if (!has && had) resumeInactivityTimeout();
  }
);

onMounted(async () => {
  await runJoinFlowForCurrentRoute();
});

onUnmounted(() => {
  resumeInactivityTimeout();
  sendPresence('leave');
  stopAdmissionPolling();
  stopPresenceHeartbeat();
});
</script>

<style scoped>
.join-team-meeting-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--bg-primary, #0f0f0f);
  gap: 12px;
}
.join-lobby-banner {
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(147, 197, 253, 0.45);
  color: #dbeafe;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.92rem;
}
.join-session-layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 12px;
  min-height: 0;
}
.join-video {
  min-width: 0;
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.join-agenda-aside {
  min-width: 0;
  max-height: calc(100vh - 48px);
  overflow: auto;
  border-radius: 12px;
  background: #fff;
}
.join-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
}
.join-error {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: 10px;
  padding: 12px 14px;
}
.join-activity-section {
  border-top: 1px solid rgba(148, 163, 184, 0.25);
  padding-top: 10px;
}
.join-activity-content {
  margin-top: 10px;
  max-height: 220px;
  overflow: auto;
}
.activity-list { display: flex; flex-direction: column; gap: 6px; }
.activity-item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.85rem;
  color: #e2e8f0;
}
.activity-sender { font-weight: 700; color: #93c5fd; }
.activity-time { color: #94a3b8; margin-left: auto; }
.muted { color: #94a3b8; }
.error-inline { color: #fecaca; }
@media (max-width: 900px) {
  .join-session-layout {
    grid-template-columns: 1fr;
  }
  .join-agenda-aside {
    max-height: 40vh;
  }
}
</style>
