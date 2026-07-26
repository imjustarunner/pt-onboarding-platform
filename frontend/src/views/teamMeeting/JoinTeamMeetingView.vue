<template>
  <div class="join-team-meeting-view">
    <div v-if="resolving" class="join-placeholder">Resolving meeting…</div>
    <div v-else-if="error && !token" class="join-error">{{ error }}</div>
    <template v-else-if="token && (vonageSessionId || roomName)">
      <div v-if="isInLobby" class="join-lobby-banner">
        You’re in the waiting room. The host will admit you shortly.
      </div>
      <div class="join-toolbar">
        <button type="button" class="btn btn-danger btn-sm" @click="requestLeave">
          {{ isHost ? 'Leave / End meeting' : 'Leave meeting' }}
        </button>
        <span v-if="meetingCompletedAt" class="join-completed-chip">Session completed</span>
      </div>
      <div class="join-session-layout" :class="{ 'join-session-layout--chat-only': !canSeeFullWorkspace }">
        <div class="join-video">
          <SupervisionVideoRoom
            ref="videoRoomRef"
            :token="token"
            :vonage-session-id="vonageSessionId"
            :room-name="roomName"
            :application-id="applicationId"
            :diagnostics="diagnostics"
            :event-id="resolvedEventId || eventId"
            :is-host="isHost"
            layout="standard"
            :equal-tiles-when-remote="true"
            :local-display-name="localDisplayName"
            :local-role-label="localRoleLabel"
            :local-profile-photo-url="localProfilePhotoUrl"
            @connected="onVideoConnected"
            @disconnected="onDisconnected"
            @meeting-ended="onMeetingEnded"
          />
          <SupervisionVideoLobbyPanel
            v-if="isHost && resolvedEventId && waitingRoomEnabled"
            :session-id="resolvedEventId"
            :is-supervisor="isHost"
            meeting-kind="team-meeting"
          />
          <section
            v-if="resolvedEventId && !isInLobby"
            class="join-live-activity"
            aria-label="Chat, polls, and Q&A"
          >
            <h3 class="join-live-activity__title">Chat, Polls &amp; Q&A</h3>
            <MeetingLiveActivityPanel
              :event-id="resolvedEventId"
              :is-host="isHost"
              :can-create-polls="canCreatePolls"
              :start-open="true"
              :hide-chrome="true"
              :below-video="true"
            />
          </section>
        </div>
        <aside v-if="resolvedEventId && !isInLobby && canSeeFullWorkspace" class="join-workspace">
          <div v-if="workspaceBannerVisible" class="join-workspace__banner">
            <span class="join-workspace__lock" aria-hidden="true">🔒</span>
            <p>
              {{ workspaceBannerText }}
            </p>
            <button
              type="button"
              class="join-workspace__banner-x"
              aria-label="Dismiss"
              @click="workspaceBannerVisible = false"
            >×</button>
          </div>

          <div class="join-workspace__body join-workspace__body--stack">
            <section class="join-stack-section">
              <MeetingAgendaPanel
                meeting-type="provider_schedule_event"
                :meeting-id="resolvedEventId"
                :can-add-item="true"
                :embedded="true"
                :live="true"
              />
            </section>
            <section class="join-stack-section">
              <MeetingGoalsActionsPanel
                :event-id="resolvedEventId"
                section="both"
                :meeting-subtype="meetingSubtype"
              />
            </section>
            <section v-if="showAttendanceTab" class="join-stack-section">
              <MeetingAttendancePanel
                :event-id="resolvedEventId"
                :live-poll="true"
              />
            </section>
            <section v-if="showNotesTab" class="join-stack-section">
              <MeetingNotesPanel
                :event-id="resolvedEventId"
                :live-capturing="transcriptCapturing"
                :live-hint="transcriptHint"
                :live-preview="transcriptLivePreview"
                :auto-refresh="true"
              />
            </section>
          </div>
        </aside>
      </div>
    </template>
    <div v-else class="join-placeholder">Loading…</div>

    <div v-if="showHostLeaveModal" class="join-modal-backdrop" role="dialog" aria-modal="true">
      <div class="join-modal">
        <h3>Mark Session as Completed and Close Meeting?</h3>
        <p>
          Individuals who are compensated for attending will continue to be compensated while this
          meeting is occurring. It is recommended that you mark this session as completed and close.
        </p>
        <p v-if="completeError" class="error-inline">{{ completeError }}</p>
        <div class="join-modal-actions">
          <button type="button" class="btn btn-primary" :disabled="completing" @click="markCompletedAndLeave">
            {{ completing ? 'Closing…' : 'Mark Completed & Close' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="completing" @click="leaveWithoutClosing">
            Leave without closing
          </button>
          <button type="button" class="btn btn-ghost" :disabled="completing" @click="showHostLeaveModal = false">
            Cancel
          </button>
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
import { useTeamMeetingLiveTranscript } from '../../composables/useTeamMeetingLiveTranscript';
import SupervisionVideoRoom from '../../components/supervision/SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from '../../components/supervision/SupervisionVideoLobbyPanel.vue';
import MeetingAgendaPanel from '../../components/meetings/MeetingAgendaPanel.vue';
import MeetingGoalsActionsPanel from '../../components/meetings/MeetingGoalsActionsPanel.vue';
import MeetingAttendancePanel from '../../components/meetings/MeetingAttendancePanel.vue';
import MeetingNotesPanel from '../../components/meetings/MeetingNotesPanel.vue';
import MeetingLiveActivityPanel from '../../components/meetings/MeetingLiveActivityPanel.vue';
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
const meetingSubtype = ref('general');
const meetingKind = ref('TEAM_MEETING');
const meetingCompletedAt = ref(null);
const roomName = ref('');
const isHost = ref(false);
const resolvedEventId = ref(0);
const roomMode = ref('main');
const waitingRoomEnabled = ref(true);
const joinIdentity = ref('');
const localDisplayName = ref('');
const localRoleLabel = ref('');
const localProfilePhotoUrl = ref('');
const joinAttemptedForPath = ref('');
const showHostLeaveModal = ref(false);
const completing = ref(false);
const completeError = ref('');
const intentionalLeave = ref(false);
const videoRoomRef = ref(null);
/** When the participant entered the main room (for chat/polls visibility). */
const joinedMainAt = ref(null);
const workspaceBannerVisible = ref(true);
const videoConnected = ref(false);
let admissionPollInterval = null;
let presencePollInterval = null;
let completionPollInterval = null;

/** Roles that see full meeting workspace (agenda/goals/actions/attendance/transcript). */
const FULL_WORKSPACE_ROLES = new Set([
  'super_admin',
  'admin',
  'support',
  'staff',
  'clinical_practice_assistant',
  'provider_plus',
  'schedule_manager',
  'assistant_admin'
]);

/** Non-provider staff may create polls (host always can). Providers vote/chat/ask only. */
const POLL_CREATE_ROLES = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'support',
  'staff',
  'clinical_practice_assistant',
  'schedule_manager',
  'assistant_admin'
]);

const isInLobby = computed(() => roomMode.value === 'lobby' || String(roomName.value || '').endsWith('-lobby'));

const transcriptEnabled = computed(() => (
  videoConnected.value
  && !!token.value
  && !isInLobby.value
  && !!Number(resolvedEventId.value || 0)
  && !intentionalLeave.value
));

const {
  capturing: transcriptCapturing,
  transcriptHint,
  livePreview: transcriptLivePreview,
  stopAndFlush: stopTranscriptCapture
} = useTeamMeetingLiveTranscript({
  eventId: resolvedEventId,
  enabled: transcriptEnabled,
  displayName: localDisplayName
});

const actorRole = computed(() => String(authStore.user?.role || '').toLowerCase().trim());

/** Host + admin-side roles see the full right-rail workspace. Providers see chat/polls only. */
const canSeeFullWorkspace = computed(() => {
  if (isHost.value) return true;
  return FULL_WORKSPACE_ROLES.has(actorRole.value);
});

const showAttendanceTab = computed(() => {
  if (!canSeeFullWorkspace.value) return false;
  const kind = String(meetingKind.value || '').toUpperCase();
  if (kind === 'HUDDLE' || kind === 'TEAM_MEETING') return true;
  const subtype = String(meetingSubtype.value || '').toLowerCase();
  return subtype === 'admin' || subtype === 'town_hall' || subtype === 'general';
});

const showNotesTab = computed(() => {
  if (!canSeeFullWorkspace.value) return false;
  const kind = String(meetingKind.value || '').toUpperCase();
  if (kind === 'HUDDLE' || kind === 'TEAM_MEETING') return true;
  const subtype = String(meetingSubtype.value || '').toLowerCase();
  return subtype === 'admin' || subtype === 'town_hall';
});

/** Host or non-provider staff can create polls (providers vote / chat / ask). */
const canCreatePolls = computed(() => {
  if (isHost.value) return true;
  const role = actorRole.value;
  if (role === 'provider' || role === 'provider_plus') return false;
  return POLL_CREATE_ROLES.has(role);
});

const workspaceBannerText = computed(() => (
  'Meeting workspace — agenda, attendance, and transcript stay with this session. Chat & polls are under the video.'
));

watch(isInLobby, (lobby, wasLobby) => {
  if (wasLobby && !lobby && !joinedMainAt.value) {
    joinedMainAt.value = new Date().toISOString();
  }
  if (!lobby && !joinedMainAt.value && token.value) {
    joinedMainAt.value = new Date().toISOString();
  }
});

function applyTokenPayload(data) {
  const tok = String(data.token || data.data?.token || '').trim();
  if (tok) token.value = tok;
  const sid = String(data.sessionId || data.roomSid || data.vonageSessionId || '').trim();
  if (sid) vonageSessionId.value = sid;
  applicationId.value = String(data.applicationId || data.apiKey || applicationId.value || '').trim();
  diagnostics.value = data.diagnostics || diagnostics.value;
  roomName.value = data.roomName || data.room_name || roomName.value;
  isHost.value = !!(data.isHost ?? data.is_host);
  const prevMode = roomMode.value;
  roomMode.value = String(data.roomMode || (String(roomName.value || '').endsWith('-lobby') ? 'lobby' : 'main')).toLowerCase();
  if (roomMode.value === 'main' && (!joinedMainAt.value || prevMode === 'lobby')) {
    joinedMainAt.value = new Date().toISOString();
  }
  if (data.waitingRoomEnabled != null || data.lobbyEnabledForSession != null) {
    waitingRoomEnabled.value = !!(data.waitingRoomEnabled ?? data.lobbyEnabledForSession);
  }
  joinIdentity.value = String(data.identity || joinIdentity.value || '').trim();
  localDisplayName.value = String(data.displayName || localDisplayName.value || '').trim();
  localRoleLabel.value = String(data.roleLabel || localRoleLabel.value || '').trim();
  if (isHost.value && (!localRoleLabel.value || localRoleLabel.value.toLowerCase() === 'supervisor')) {
    localRoleLabel.value = 'Host';
  } else if (!isHost.value && !localRoleLabel.value) {
    localRoleLabel.value = 'Participant';
  }
  localProfilePhotoUrl.value = String(data.profilePhotoUrl || localProfilePhotoUrl.value || '').trim();
  if (Number(data.eventId || 0) > 0) resolvedEventId.value = Number(data.eventId);
  if (data.kind) meetingKind.value = String(data.kind).toUpperCase();
  if (data.meetingSubtype || data.meeting_subtype) {
    meetingSubtype.value = String(data.meetingSubtype || data.meeting_subtype || 'general').toLowerCase();
  }
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

function stopCompletionPolling() {
  if (completionPollInterval) {
    clearInterval(completionPollInterval);
    completionPollInterval = null;
  }
}

async function pollMeetingCompletion() {
  const eid = resolvedEventId.value || eventId.value;
  if (!eid || intentionalLeave.value || meetingCompletedAt.value) return;
  try {
    const resp = await api.get(`/team-meetings/${encodeURIComponent(eid)}/admission-status`, {
      skipAuthRedirect: true,
      skipGlobalLoading: true
    });
    const data = resp?.data || {};
    if (data.meetingCompleted || data.meetingCompletedAt || data.roomMode === 'ended') {
      meetingCompletedAt.value = data.meetingCompletedAt || new Date().toISOString();
      onMeetingEnded();
    }
  } catch {
    /* best-effort */
  }
}

function startCompletionPolling() {
  stopCompletionPolling();
  pollMeetingCompletion();
  completionPollInterval = setInterval(pollMeetingCompletion, 4000);
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
    if (data.meetingCompleted || data.meetingCompletedAt || data.roomMode === 'ended') {
      meetingCompletedAt.value = data.meetingCompletedAt || new Date().toISOString();
      stopAdmissionPolling();
      onMeetingEnded();
      return;
    }
    if (data.admitted && data.token) {
      applyTokenPayload(data);
      stopAdmissionPolling();
      startPresenceHeartbeat();
      startCompletionPolling();
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
    const resp = await api.get(`/team-meetings/${encodeURIComponent(eid)}/video-token`, {
      skipAuthRedirect: true,
      skipGlobalLoading: true
    });
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
    else startCompletionPolling();
    startPresenceHeartbeat();
  } catch (e) {
    const status = Number(e?.response?.status || 0);
    if (status === 401) {
      // Not authenticated — send to login once. Do not clear an existing session here;
      // a 403/access error must not look like a logout loop.
      const slug = organizationSlug.value;
      if (slug) {
        router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
        return;
      }
    }
    if (status === 410 || e?.response?.data?.meetingCompletedAt) {
      meetingCompletedAt.value = e?.response?.data?.meetingCompletedAt || new Date().toISOString();
      error.value = e?.response?.data?.error?.message || 'This meeting has ended.';
      return;
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

function navigateAway() {
  const slug = organizationSlug.value;
  if (slug) {
    router.push(`/${slug}/dashboard`);
  } else {
    router.push('/dashboard');
  }
}

function onVideoConnected() {
  videoConnected.value = true;
}

async function finishLeave() {
  intentionalLeave.value = true;
  videoConnected.value = false;
  stopAdmissionPolling();
  stopPresenceHeartbeat();
  stopCompletionPolling();
  try {
    await stopTranscriptCapture();
  } catch { /* ignore */ }
  sendPresence('leave');
  token.value = '';
  navigateAway();
}

function requestLeave() {
  if (isHost.value && !meetingCompletedAt.value) {
    showHostLeaveModal.value = true;
    completeError.value = '';
    return;
  }
  finishLeave();
}

async function markCompletedAndLeave() {
  const eid = resolvedEventId.value || eventId.value;
  if (!eid) return;
  completing.value = true;
  completeError.value = '';
  // Server force-disconnect may fire before the POST returns — don't re-open the modal.
  intentionalLeave.value = true;
  try {
    const { data } = await api.post(`/team-meetings/${encodeURIComponent(eid)}/complete`, {}, { skipGlobalLoading: true });
    meetingCompletedAt.value = data?.meetingCompletedAt || new Date().toISOString();
    showHostLeaveModal.value = false;
    finishLeave();
  } catch (e) {
    intentionalLeave.value = false;
    completeError.value = e?.response?.data?.error?.message || e?.message || 'Failed to complete meeting';
  } finally {
    completing.value = false;
  }
}

function leaveWithoutClosing() {
  showHostLeaveModal.value = false;
  finishLeave();
}

function onMeetingEnded() {
  if (intentionalLeave.value) return;
  meetingCompletedAt.value = meetingCompletedAt.value || new Date().toISOString();
  showHostLeaveModal.value = false;
  finishLeave();
}

function onDisconnected() {
  if (intentionalLeave.value) return;
  videoConnected.value = false;
  // Force-kick after host completed the meeting.
  if (meetingCompletedAt.value) {
    finishLeave();
    return;
  }
  // Unexpected disconnect — still close this user's attendance segment.
  if (isHost.value) {
    showHostLeaveModal.value = true;
    return;
  }
  finishLeave();
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

watch(
  () => Number(resolvedEventId.value || 0),
  async (eid) => {
    if (!eid) return;
    try {
      const { data } = await api.get(`/team-meetings/${eid}/workspace`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      });
      const subtype = String(data?.meetingSubtype || 'general').toLowerCase();
      meetingSubtype.value = (subtype === 'admin' || subtype === 'town_hall') ? subtype : 'general';
      if (data?.kind) meetingKind.value = String(data.kind).toUpperCase();
    } catch {
      meetingSubtype.value = 'general';
    }
    try {
      const { data: att } = await api.get(`/team-meetings/${eid}/attendance`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      });
      meetingCompletedAt.value = att?.meetingCompletedAt || null;
      if (att?.kind) meetingKind.value = String(att.kind).toUpperCase();
      if (att?.meetingSubtype) {
        const subtype = String(att.meetingSubtype).toLowerCase();
        meetingSubtype.value = (subtype === 'admin' || subtype === 'town_hall') ? subtype : meetingSubtype.value;
      }
    } catch { /* ignore */ }
  }
);

onMounted(async () => {
  await runJoinFlowForCurrentRoute();
});

onUnmounted(() => {
  resumeInactivityTimeout();
  if (!intentionalLeave.value) sendPresence('leave');
  stopAdmissionPolling();
  stopPresenceHeartbeat();
  stopCompletionPolling();
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
.join-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.join-completed-chip {
  font-size: 0.8rem;
  font-weight: 700;
  color: #bbf7d0;
  background: rgba(22, 163, 74, 0.25);
  border: 1px solid rgba(74, 222, 128, 0.45);
  border-radius: 999px;
  padding: 4px 10px;
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
  grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
  gap: 14px;
  min-height: 0;
  align-items: stretch;
}
.join-session-layout--chat-only {
  grid-template-columns: 1fr;
}
.join-video {
  min-width: 0;
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.join-live-activity {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 280px;
}
.join-live-activity__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}
.join-video :deep(.supervision-video-room) {
  flex: 1 1 auto;
  min-height: min(64vh, 720px);
  display: flex;
  flex-direction: column;
}
.join-video :deep(.vsr) {
  flex: 1 1 auto;
  min-height: min(58vh, 640px);
  display: flex;
  flex-direction: column;
}
.join-video :deep(.vsr__stage:not(.vsr__stage--strip)) {
  flex: 1 1 0;
  min-height: min(52vh, 560px) !important;
  height: auto !important;
}
.join-video :deep(.vsr__stage--solo .vsr__tile),
.join-video :deep(.vsr__stage--duo .vsr__tile),
.join-video :deep(.vsr__stage--grid .vsr__tile) {
  min-height: min(40vh, 420px) !important;
  height: 100% !important;
}
.join-video :deep(.vsr__tile video),
.join-video :deep(.vsr__tile .OT_root),
.join-video :deep(.vsr__tile .OT_publisher),
.join-video :deep(.vsr__tile .OT_subscriber),
.join-video :deep(.vsr__tile .OT_widget-container) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
}
.join-workspace {
  min-width: 0;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
  border: 1px solid rgba(226, 232, 240, 0.95);
  overflow: hidden;
}
.join-workspace__banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 12px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  font-size: 0.82rem;
  line-height: 1.35;
}
.join-workspace__banner p {
  margin: 0;
  flex: 1;
}
.join-workspace__lock {
  flex-shrink: 0;
  line-height: 1.2;
}
.join-workspace__banner-x {
  border: 0;
  background: transparent;
  color: #047857;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.join-workspace__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
}
.join-workspace__body--stack {
  gap: 14px;
}
.join-stack-section {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.join-stack-section--chat {
  min-height: 280px;
  display: flex;
  flex-direction: column;
}
.join-stack-title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}
.join-workspace__body :deep(.mlap),
.join-workspace__body :deep(.mlap__panel) {
  flex: 1;
  min-height: 220px;
}
.join-workspace__body :deep(.mgap__head h3),
.join-workspace__body :deep(.map__head h4),
.join-workspace__body :deep(.mnp__head h4),
.join-workspace__body :deep(.agenda-section-head h3) {
  color: #0f172a;
  font-size: 0.95rem;
}
.join-workspace__body :deep(.btn-secondary),
.join-workspace__body :deep(.agenda-section-head .btn) {
  border-color: #a7f3d0;
  color: #047857;
  background: #fff;
}
.join-workspace__body :deep(.agenda-status-select) {
  border-color: #6ee7b7;
  background: #ecfdf5;
  color: #047857;
  font-weight: 700;
  font-size: 0.72rem;
  border-radius: 999px;
  padding: 2px 8px;
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
.muted { color: #94a3b8; }
.error-inline { color: #b91c1c; margin: 0; }
.join-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 16px;
}
.join-modal {
  background: #fff;
  color: #0f172a;
  border-radius: 14px;
  padding: 20px;
  max-width: 480px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.join-modal h3 { margin: 0; font-size: 1.1rem; }
.join-modal p { margin: 0; line-height: 1.45; font-size: 0.95rem; color: #334155; }
.join-modal-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 900px) {
  .join-session-layout,
  .join-session-layout--chat-only {
    grid-template-columns: 1fr;
  }
  .join-workspace {
    max-height: 48vh;
  }
}
</style>
