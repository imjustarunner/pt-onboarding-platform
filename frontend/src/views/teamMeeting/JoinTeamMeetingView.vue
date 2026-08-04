<template>
  <div
    class="join-team-meeting-view join-team-meeting-view--branded"
    :class="{ 'join-team-meeting-view--video-fs': videoFullscreen }"
  >
    <MeetingSessionExitPanel
      v-if="sessionExit || (meetingCompletedAt && !token)"
      :variant="sessionExit?.variant || 'host-ended'"
      :can-rejoin="sessionExit ? sessionExit.canRejoin : false"
      meeting-label="meeting"
      session-kind="team-meeting"
      :banner-dismissed="exitBannerDismissed"
      :closed-by-name="meetingClosedByName"
      :closed-at="meetingCompletedAt"
      @rejoin="rejoinMeeting"
      @go-to-schedule="goToScheduleFromExit"
      @dismiss-banner="dismissHostEndedBanner"
    />
    <div v-else-if="resolving || joiningPhase" class="join-placeholder">
      {{ joiningStatusText }}
    </div>
    <div v-else-if="error && !token && !meetingCompletedAt" class="join-error">
      <p>{{ error }}</p>
      <button type="button" class="btn btn-secondary btn-sm" style="margin-top:12px" @click="retryJoin">
        Retry
      </button>
    </div>
    <template v-else-if="token && (vonageSessionId || roomName)">
      <div
        v-if="showTranscriptionNotice && !videoFullscreen && !isInLobby"
        class="join-transcript-banner"
        role="status"
      >
        <span class="join-transcript-banner__dot" aria-hidden="true" />
        <p>This meeting is being transcribed. Live speech may be captured and summarized for attendees with workspace access.</p>
        <button
          type="button"
          class="join-transcript-banner__x"
          aria-label="Dismiss transcription notice"
          @click="transcriptionNoticeDismissed = true"
        >×</button>
      </div>
      <header v-if="!videoFullscreen" class="join-header">
        <div class="join-header__left">
          <BrandingLogo size="large" class="join-header__logo" />
          <div>
            <h1>{{ displayMeetingTitle }}</h1>
            <p class="join-header__meta">
              <span v-if="sessionMetaLine">{{ sessionMetaLine }}</span>
              <span class="join-header__live">● Live</span>
            </p>
          </div>
        </div>
        <div class="join-header__right">
          <button
            v-if="showEnableTrackingButton"
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="enablingTracking"
            @click="enableAttendanceTracking"
          >
            {{ enablingTracking ? 'Enabling…' : 'Enable transcription & attendance' }}
          </button>
          <span v-if="enableTrackingError" class="join-tracking-error">{{ enableTrackingError }}</span>
          <div v-if="isAdminMeeting" class="join-tools">
            <button type="button" class="btn btn-secondary btn-sm" @click="toolsOpen = !toolsOpen">Tools</button>
            <div v-if="toolsOpen" class="join-tools__menu">
              <button type="button" class="join-tools__item" @click="copyJoinLink">
                {{ joinLinkCopied ? 'Copied!' : 'Copy join link' }}
              </button>
            </div>
          </div>
          <span
            v-if="isHost && waitingLobbyCount > 0"
            class="join-waiting-chip"
            title="People waiting to be admitted"
          >
            {{ waitingLobbyCount }} waiting
          </span>
          <span v-if="raisedHandCount" class="join-hand-chip" title="Hands raised">✋ {{ raisedHandCount }}</span>
          <span v-if="meetingCompletedAt" class="join-completed-chip">Session completed</span>
          <button type="button" class="btn btn-danger btn-sm" @click="requestLeave">
            {{ isHost ? 'Leave / End meeting' : 'Leave meeting' }}
          </button>
        </div>
      </header>
      <div
        class="join-session-layout"
        :class="{
          'join-session-layout--chat-only': !canSeeFullWorkspace,
          'join-session-layout--lobby': isInLobby && !videoFullscreen,
          'join-session-layout--video-focus': !chatPanelOpen || videoFullscreen,
          'join-session-layout--video-fs': videoFullscreen
        }"
      >
        <div class="join-video" :class="{ 'join-video--lobby': isInLobby && !videoFullscreen }">
          <!-- Host admit controls stay above the video so flex layout cannot squeeze them away. -->
          <SupervisionVideoLobbyPanel
            v-if="isHost && resolvedEventId && waitingRoomEnabled && !videoFullscreen"
            class="join-host-lobby"
            :session-id="resolvedEventId"
            :is-supervisor="isHost"
            meeting-kind="team-meeting"
            theme="dark"
            @update:waiting-count="waitingLobbyCount = $event"
          />
          <SupervisionWaitingRoomStage
            v-if="isInLobby && !videoFullscreen"
            :meeting-title="displayMeetingTitle"
            :host-present="hostPresent"
            :host-role-label="hostRoleLabel"
            :host-status-label="hostStatusLabel"
            :goals="isGroupHuddle ? [] : waitingGoals"
            :agenda="waitingAgenda"
            :action-items="isHuddle ? [] : waitingActionItems"
          />
          <div
            class="join-video__stage"
            :class="{ 'join-video__stage--pip': isInLobby && !videoFullscreen }"
          >
            <SupervisionVideoRoom
              ref="videoRoomRef"
              :token="token"
              :vonage-session-id="vonageSessionId"
              :room-name="roomName"
              :application-id="applicationId"
              :diagnostics="diagnostics"
              :event-id="resolvedEventId || eventId"
              :is-host="isHost"
              :is-host-or-cohost="canMuteParticipants"
              :screen-share-mode="screenShareMode"
              :can-share-screen="canShareScreenByDefault"
              :can-grant-screen-share="canGrantScreenShare"
              :mute-others-mode="muteOthersMode"
              :lobby-mode="isInLobby && !videoFullscreen"
              :show-layout-controls="!isInLobby"
              allow-tile-focus
              v-model:tile-focus="tileFocus"
              v-model:video-fullscreen="videoFullscreen"
              :activity-notice="videoFullscreenActivityNotice"
              :raised-hands-notice="videoFullscreenHandsNotice"
              layout="standard"
              :equal-tiles-when-remote="true"
              :local-display-name="localDisplayName"
              :local-role-label="localRoleLabel"
              :local-profile-photo-url="localProfilePhotoUrl"
              @connected="onVideoConnected"
              @disconnected="onDisconnected"
              @meeting-ended="onMeetingEnded"
              @hands-map-change="onHandsMapChange"
              @audio-map-change="onAudioMapChange"
              @transcript-control="onRemoteTranscriptControl"
              @participant-left="onParticipantLeft"
              @activity-notice-click="onFullscreenActivityClick"
            />
          </div>
          <section
            v-if="resolvedEventId && !isInLobby"
            class="join-live-activity"
            :class="{
              'join-live-activity--collapsed': !chatPanelOpen || videoFullscreen,
              'join-live-activity--fs-probe': videoFullscreen
            }"
            aria-label="Chat, polls, and Q&A"
            :aria-hidden="videoFullscreen ? 'true' : undefined"
          >
            <MeetingLiveActivityPanel
              :event-id="resolvedEventId"
              :is-host="isHost"
              :can-create-polls="canCreatePolls"
              :start-open="true"
              :below-video="true"
              theme="dark"
              @update:open="chatPanelOpen = $event"
              @activity-notice="onLiveActivityNotice"
            />
          </section>
        </div>
        <aside v-if="resolvedEventId && !isInLobby && canSeeFullWorkspace && !videoFullscreen" class="join-workspace">
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
                :can-add-item="canEditAgenda"
                :embedded="true"
                :live="true"
                :live-sidebar="true"
                theme="dark"
              />
            </section>
            <section v-if="!isGroupHuddle" class="join-stack-section">
              <MeetingGoalsActionsPanel
                :event-id="resolvedEventId"
                section="goals"
                :compact="false"
                :meeting-subtype="meetingSubtype"
                :live="true"
                embedded
              />
            </section>
            <section v-if="!isHuddle" class="join-stack-section">
              <MeetingGoalsActionsPanel
                :event-id="resolvedEventId"
                section="actions"
                :compact="false"
                :meeting-subtype="meetingSubtype"
                :live="true"
                embedded
              />
            </section>
            <section v-if="showAttendanceTab" class="join-stack-section">
              <MeetingAttendancePanel
                ref="attendancePanelRef"
                :event-id="resolvedEventId"
                :live-poll="true"
                :raised-hands="raisedHandCount"
                :raised-hand-names="raisedHandNames"
                :muted-names="mutedParticipantNames"
              />
            </section>
            <section v-if="showNotesTab" class="join-stack-section">
              <MeetingNotesPanel
                :event-id="resolvedEventId"
                :live-capturing="transcriptCapturing"
                :live-hint="transcriptHint"
                :live-preview="transcriptLivePreview"
                :auto-refresh="true"
                :can-control-transcript="isAdminMeeting || isHost"
                :can-stop-transcript="isHost"
                :paused="transcriptPaused"
                :room-stopped="transcriptRoomStopped"
                :stop-meta="transcriptStopMeta"
                @pause="onTranscriptPause"
                @resume="onTranscriptResume"
                @stop="onTranscriptStop"
                @control="onTranscriptControlApi"
              />
            </section>
          </div>
        </aside>
      </div>
    </template>
    <div v-else class="join-placeholder">
      <p>{{ joiningStatusText || 'Preparing meeting…' }}</p>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        style="margin-top:12px"
        @click="retryJoin"
      >
        Retry
      </button>
    </div>

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
import SupervisionWaitingRoomStage from '../../components/supervision/SupervisionWaitingRoomStage.vue';
import MeetingAgendaPanel from '../../components/meetings/MeetingAgendaPanel.vue';
import MeetingGoalsActionsPanel from '../../components/meetings/MeetingGoalsActionsPanel.vue';
import MeetingAttendancePanel from '../../components/meetings/MeetingAttendancePanel.vue';
import MeetingNotesPanel from '../../components/meetings/MeetingNotesPanel.vue';
import MeetingLiveActivityPanel from '../../components/meetings/MeetingLiveActivityPanel.vue';
import MeetingSessionExitPanel from '../../components/meetings/MeetingSessionExitPanel.vue';
import BrandingLogo from '../../components/BrandingLogo.vue';
import api from '../../services/api';
import { resolveHostImpliedPortalSlug } from '../../utils/orgScopedPath';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const eventId = computed(() => route.params.eventId);
const organizationSlug = computed(() => route.params.organizationSlug);
/** Dedicated portal hosts (app.itsco.health) strip /{slug} from the path in the router. */
const hostPortalSlug = computed(() => resolveHostImpliedPortalSlug());

const resolving = ref(false);
const error = ref('');
const token = ref('');
const vonageSessionId = ref('');
const applicationId = ref('');
const diagnostics = ref(null);
const meetingSubtype = ref('general');
const meetingKind = ref('TEAM_MEETING');
const attendanceTrackingEnabled = ref(false);
const enablingTracking = ref(false);
const enableTrackingError = ref('');
const meetingCompletedAt = ref(null);
const meetingClosedByName = ref('');
const roomName = ref('');
const isHost = ref(false);
const resolvedEventId = ref(0);
const roomMode = ref('main');
const waitingRoomEnabled = ref(true);
const waitingLobbyCount = ref(0);
const hostPresent = ref(false);
const hostRoleLabel = ref('Host');
const hostStatusLabel = ref('');
const waitingMeetingTitle = ref('');
const waitingGoals = ref([]);
const waitingAgenda = ref([]);
const waitingActionItems = ref([]);
/** Booked invitee count (excludes host) — used for Group Huddle / Group Meeting titles. */
const bookedParticipantCount = ref(0);
const joinIdentity = ref('');
const localDisplayName = ref('');
const localRoleLabel = ref('');
const localProfilePhotoUrl = ref('');
const joinAttemptedForPath = ref('');
/** auth | resolve | token | '' when idle/ready */
const joiningPhase = ref('');
const JOIN_TIMEOUT_MS = 25000;
const showHostLeaveModal = ref(false);
const completing = ref(false);
const completeError = ref('');
const intentionalLeave = ref(false);
const sessionExit = ref(null);
const exitBannerDismissed = ref(false);
const videoRoomRef = ref(null);
const attendancePanelRef = ref(null);
/** When the participant entered the main room (for chat/polls visibility). */
const joinedMainAt = ref(null);
const workspaceBannerVisible = ref(true);
const transcriptionNoticeDismissed = ref(false);
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

const isAttendanceTrackingActive = computed(() => {
  const kind = String(meetingKind.value || '').toUpperCase();
  if (kind === 'HUDDLE') return true;
  const subtype = String(meetingSubtype.value || '').toLowerCase();
  if (subtype === 'admin' || subtype === 'town_hall') return true;
  return attendanceTrackingEnabled.value;
});

const transcriptEnabled = computed(() => (
  videoConnected.value
  && !!token.value
  && !isInLobby.value
  && !!Number(resolvedEventId.value || 0)
  && !intentionalLeave.value
  && isAttendanceTrackingActive.value
));

const {
  capturing: transcriptCapturing,
  transcriptHint,
  livePreview: transcriptLivePreview,
  paused: transcriptPaused,
  roomStopped: transcriptRoomStopped,
  stopMeta: transcriptStopMeta,
  pause: pauseTranscriptLocal,
  resume: resumeTranscriptLocal,
  applyRoomStop: applyTranscriptRoomStop,
  stopAndFlush: stopTranscriptCapture
} = useTeamMeetingLiveTranscript({
  eventId: resolvedEventId,
  enabled: transcriptEnabled,
  displayName: localDisplayName
});

const toolsOpen = ref(false);
const joinLinkCopied = ref(false);
const tileFocus = ref('equal');
const videoFullscreen = ref(false);
const videoFullscreenActivityNotice = ref('');
let fullscreenNoticeTimer = null;
const chatPanelOpen = ref(true);
const raisedHandCount = ref(0);
const raisedHandNames = ref([]);
const mutedParticipantNames = ref([]);
const participantJoinUrl = ref('');

const videoFullscreenHandsNotice = computed(() => {
  if (!raisedHandCount.value) return '';
  const names = (raisedHandNames.value || []).filter(Boolean).slice(0, 2).join(', ');
  if (names && raisedHandCount.value <= 2) return names;
  if (names) return `${names} +${raisedHandCount.value - 2}`;
  return `${raisedHandCount.value} hand${raisedHandCount.value === 1 ? '' : 's'} raised`;
});

function onLiveActivityNotice(payload) {
  const text = String(payload?.text || '').trim();
  if (!text) return;
  if (!videoFullscreen.value) return;
  videoFullscreenActivityNotice.value = text;
  if (fullscreenNoticeTimer) clearTimeout(fullscreenNoticeTimer);
  fullscreenNoticeTimer = setTimeout(() => {
    videoFullscreenActivityNotice.value = '';
  }, 8000);
}

function onFullscreenActivityClick() {
  videoFullscreen.value = false;
  videoFullscreenActivityNotice.value = '';
  chatPanelOpen.value = true;
}

watch(videoFullscreen, (on) => {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('meeting-video-fullscreen', !!on);
  if (!on) videoFullscreenActivityNotice.value = '';
});

const isAdminMeeting = computed(() => String(meetingSubtype.value || '').toLowerCase() === 'admin');
const isHuddle = computed(() => String(meetingKind.value || '').toUpperCase() === 'HUDDLE');
/** 2+ invitees → group (3+ people). Solo/1:1 stay individual. */
const isMultiParticipant = computed(() => Number(bookedParticipantCount.value || 0) >= 2);
const isGroupHuddle = computed(() => isHuddle.value && isMultiParticipant.value);
const isIndividualHuddle = computed(() => isHuddle.value && !isMultiParticipant.value);

const displayMeetingTitle = computed(() => {
  const kind = String(meetingKind.value || '').toUpperCase();
  const subtype = String(meetingSubtype.value || '').toLowerCase();
  if (kind === 'HUDDLE') return isGroupHuddle.value ? 'Group Huddle' : 'Huddle';
  if (subtype === 'admin') return 'Admin Meeting';
  if (subtype === 'town_hall') return 'Town Hall';
  if (kind === 'TEAM_MEETING') return isMultiParticipant.value ? 'Group Meeting' : 'Meeting';
  return waitingMeetingTitle.value || 'Meeting';
});

const sessionMetaLine = computed(() => {
  const title = String(waitingMeetingTitle.value || '').trim();
  if (title && title.toLowerCase() !== String(displayMeetingTitle.value || '').toLowerCase()) {
    return title;
  }
  return '';
});

const muteOthersMode = computed(() => (isAdminMeeting.value ? 'everyone' : 'host'));

const showTranscriptionNotice = computed(() => (
  !transcriptionNoticeDismissed.value
  && !isInLobby.value
  && !!token.value
  && isAttendanceTrackingActive.value
  && (transcriptCapturing.value || videoConnected.value)
));

const showEnableTrackingButton = computed(() => (
  isHost.value
  && !isInLobby.value
  && !!token.value
  && String(meetingKind.value || '').toUpperCase() === 'TEAM_MEETING'
  && String(meetingSubtype.value || 'general').toLowerCase() === 'general'
  && !attendanceTrackingEnabled.value
  && !meetingCompletedAt.value
));

const actorRole = computed(() => String(authStore.user?.role || '').toLowerCase().trim());

/** Roles that may force-mute other participants (in addition to host). */
const MUTE_PARTICIPANT_ROLES = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'support',
  'clinical_practice_assistant',
  'provider_plus'
]);

const canMuteParticipants = computed(() => (
  isHost.value || MUTE_PARTICIPANT_ROLES.has(actorRole.value)
));

/** Host + admin-side roles see the full right-rail workspace. Providers see chat/polls only. */
const canSeeFullWorkspace = computed(() => {
  if (isHost.value) return true;
  return FULL_WORKSPACE_ROLES.has(actorRole.value);
});

/** Agenda mutations: host or admin — not every workspace viewer. */
const canEditAgenda = computed(() => {
  if (isHost.value) return true;
  return ['super_admin', 'admin', 'support', 'clinical_practice_assistant'].includes(actorRole.value);
});

/** Multi-participant rooms restrict screen share to host (+ grants); 1:1 stays open. */
const screenShareMode = computed(() => (
  isMultiParticipant.value || isGroupHuddle.value ? 'restricted' : 'everyone'
));
const canShareScreenByDefault = computed(() => {
  if (screenShareMode.value !== 'restricted') return true;
  return !!isHost.value;
});
const canGrantScreenShare = computed(() => {
  if (screenShareMode.value !== 'restricted') return false;
  if (isHost.value) return true;
  return ['super_admin', 'admin', 'support'].includes(actorRole.value);
});

const showAttendanceTab = computed(() => {
  if (!canSeeFullWorkspace.value) return false;
  if (!isAttendanceTrackingActive.value) return false;
  const kind = String(meetingKind.value || '').toUpperCase();
  return kind === 'HUDDLE' || kind === 'TEAM_MEETING';
});

const showNotesTab = computed(() => {
  if (!canSeeFullWorkspace.value) return false;
  const kind = String(meetingKind.value || '').toUpperCase();
  if (kind === 'HUDDLE') return true;
  if (kind !== 'TEAM_MEETING') return false;
  const subtype = String(meetingSubtype.value || '').toLowerCase();
  if (subtype === 'admin' || subtype === 'town_hall') return true;
  return attendanceTrackingEnabled.value;
});

/** Host or non-provider staff can create polls (providers vote / chat / ask). */
const canCreatePolls = computed(() => {
  if (isHost.value) return true;
  const role = actorRole.value;
  if (role === 'provider' || role === 'provider_plus') return false;
  return POLL_CREATE_ROLES.has(role);
});

const workspaceBannerText = computed(() => {
  if (isGroupHuddle.value) {
    return 'Group huddle workspace — agenda, attendance, and notes stay with this session. Chat & polls are under the video.';
  }
  if (isIndividualHuddle.value) {
    return 'Huddle workspace — agenda, goals, attendance, and notes stay with this session. Chat & polls are under the video.';
  }
  return 'Meeting workspace — agenda, goals, attendance, and transcript stay with this session. Chat & polls are under the video.';
});

watch(isInLobby, (lobby, wasLobby) => {
  if (wasLobby && !lobby && !joinedMainAt.value) {
    joinedMainAt.value = new Date().toISOString();
  }
  if (!lobby && !joinedMainAt.value && token.value) {
    joinedMainAt.value = new Date().toISOString();
  }
});

const joiningStatusText = computed(() => {
  switch (joiningPhase.value) {
    case 'auth':
      return 'Checking your session…';
    case 'resolve':
      return 'Resolving meeting…';
    case 'token':
      return 'Connecting to video room…';
    default:
      return resolving.value ? 'Resolving meeting…' : '';
  }
});

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function retryJoin() {
  joinAttemptedForPath.value = '';
  error.value = '';
  joiningPhase.value = '';
  void runJoinFlowForCurrentRoute();
}

function applyTokenPayload(data) {
  applyClosurePayload(data);
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
  if (data.attendanceTrackingEnabled != null) {
    attendanceTrackingEnabled.value = !!data.attendanceTrackingEnabled;
  }
  const joinLink = String(
    data.participantJoinUrl
    || data.participant_join_url
    || data.joinUrl
    || data.join_url
    || ''
  ).trim();
  if (joinLink) participantJoinUrl.value = joinLink;
}

function applyClosurePayload(data = {}) {
  const closedAt = data.meetingClosedAt || data.meetingCompletedAt || data.meeting_completed_at || null;
  if (closedAt) meetingCompletedAt.value = closedAt;
  const closedBy = String(
    data.meetingClosedByName
    || data.meetingCompletedByName
    || data.closedByName
    || ''
  ).trim();
  if (closedBy) meetingClosedByName.value = closedBy;
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
      applyClosurePayload(data);
      meetingCompletedAt.value = meetingCompletedAt.value || new Date().toISOString();
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
      applyClosurePayload(data);
      meetingCompletedAt.value = meetingCompletedAt.value || new Date().toISOString();
      stopAdmissionPolling();
      onMeetingEnded();
      return;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'hostPresent')) {
      hostPresent.value = !!data.hostPresent;
    }
    if (data.hostRoleLabel) hostRoleLabel.value = String(data.hostRoleLabel);
    if (data.hostStatusLabel) hostStatusLabel.value = String(data.hostStatusLabel);
    if (data.sessionTitle) waitingMeetingTitle.value = String(data.sessionTitle);
    if (Array.isArray(data.goals)) waitingGoals.value = data.goals;
    if (Array.isArray(data.agenda)) waitingAgenda.value = data.agenda;
    if (Array.isArray(data.actionItems)) waitingActionItems.value = data.actionItems;
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

/**
 * Resolve meeting org from join-info.
 * @returns {Promise<'continue'|'redirected'|'error'>}
 * - continue: stay on current (slugless) path and fetch the video token
 * - redirected: navigated to /{slug}/join/...; that route will resume join
 * - error: stop (error message already set)
 */
async function resolveAndRedirect() {
  const eid = eventId.value;
  if (!eid) {
    error.value = 'Invalid event';
    return 'error';
  }
  resolving.value = true;
  joiningPhase.value = 'resolve';
  error.value = '';
  try {
    const resp = await withTimeout(
      api.get(`/team-meetings/join-info/${encodeURIComponent(eid)}`, { skipAuthRedirect: true }),
      JOIN_TIMEOUT_MS,
      'Meeting lookup'
    );
    const data = resp?.data || {};
    const slug = String(data.orgSlug || '').trim();
    if (!slug) {
      error.value = 'Meeting not found';
      joinAttemptedForPath.value = '';
      return 'error';
    }
    const joinKey = String(data.joinToken || eid).trim();
    if (Number(data.eventId || 0) > 0) resolvedEventId.value = Number(data.eventId);

    // On app.{portal}.health the router strips /{portal}/… back to /join/….
    // Redirecting to /itsco/join/... would loop forever and never fetch a token.
    const hostSlug = String(hostPortalSlug.value || '').trim().toLowerCase();
    if (hostSlug && hostSlug === slug.toLowerCase()) {
      return 'continue';
    }

    // Generic multi-tenant hosts still need the org-scoped join URL.
    joinAttemptedForPath.value = '';
    router.replace(`/${slug}/join/team-meeting/${encodeURIComponent(joinKey)}`);
    return 'redirected';
  } catch (e) {
    if (Number(e?.response?.status || 0) === 410 || e?.response?.data?.meetingCompletedAt) {
      applyClosurePayload(e?.response?.data || {});
      meetingCompletedAt.value = meetingCompletedAt.value || new Date().toISOString();
      intentionalLeave.value = true;
      showSessionExit({ variant: 'host-ended', canRejoin: false });
      return 'error';
    }
    error.value = e?.response?.data?.error?.message || e?.message || 'Meeting not found';
    joinAttemptedForPath.value = '';
    return 'error';
  } finally {
    resolving.value = false;
    joiningPhase.value = '';
  }
}

async function fetchTokenAndJoin() {
  const eid = eventId.value;
  if (!eid) {
    error.value = 'Invalid event';
    return;
  }
  error.value = '';
  joiningPhase.value = 'token';
  try {
    const resp = await withTimeout(
      api.get(`/team-meetings/${encodeURIComponent(eid)}/video-token`, {
        skipAuthRedirect: true,
        skipGlobalLoading: true
      }),
      JOIN_TIMEOUT_MS,
      'Video token'
    );
    applyTokenPayload(resp?.data || {});
    if (!token.value) {
      error.value = `Video token was empty. Check Network tab: GET /api/team-meetings/${eid}/video-token.`;
      return;
    }
    if (!vonageSessionId.value) {
      vonageSessionId.value = String(resp?.data?.roomSid || '').trim();
    }
    if (!vonageSessionId.value && !roomName.value) {
      error.value = 'Video room was not created for this meeting. Try again or contact support.';
      return;
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
      joinAttemptedForPath.value = '';
      const slug = organizationSlug.value;
      if (slug) {
        router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
        return;
      }
    }
    if (status === 410 || e?.response?.data?.meetingCompletedAt) {
      applyClosurePayload(e?.response?.data || {});
      meetingCompletedAt.value = meetingCompletedAt.value || new Date().toISOString();
      intentionalLeave.value = true;
      showSessionExit({ variant: 'host-ended', canRejoin: false });
      return;
    }
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room';
    joinAttemptedForPath.value = '';
  } finally {
    joiningPhase.value = '';
  }
}

async function ensureAuthenticatedSession() {
  // Always verify via cookie/API first so a fresh tab (or absolute join URL) hydrates
  // the session before we send the user to login.
  joiningPhase.value = 'auth';
  try {
    const resp = await withTimeout(
      api.get('/users/me', { skipAuthRedirect: true, skipGlobalLoading: true }),
      JOIN_TIMEOUT_MS,
      'Session check'
    );
    const u = resp?.data || null;
    if (u && (u.id || u.email)) {
      authStore.setAuth(
        localStorage.getItem('authToken') || null,
        u,
        localStorage.getItem('sessionId') || null
      );
      return true;
    }
  } catch (e) {
    if (String(e?.message || '').includes('timed out') && authStore.isAuthenticated) {
      return true;
    }
    /* fall through */
  } finally {
    if (joiningPhase.value === 'auth') joiningPhase.value = '';
  }
  if (authStore.isAuthenticated) return true;
  joinAttemptedForPath.value = '';
  const slug = organizationSlug.value;
  if (slug) {
    router.replace(`/${slug}/login?redirect=${encodeURIComponent(route.fullPath)}`);
  } else {
    router.replace('/login');
  }
  return false;
}

function onHandsMapChange(payload) {
  const map = payload?.byConnection || payload || {};
  const names = payload?.nameByConnection || {};
  raisedHandCount.value = Object.keys(map).filter((k) => map[k]).length;
  raisedHandNames.value = Object.keys(map)
    .filter((k) => map[k])
    .map((k) => names[k])
    .filter(Boolean);
}

function onAudioMapChange(payload) {
  const map = payload?.mutedByConnection || {};
  const names = payload?.nameByConnection || {};
  mutedParticipantNames.value = Object.keys(map)
    .filter((k) => map[k])
    .map((k) => names[k])
    .filter(Boolean);
}

function onParticipantLeft() {
  attendancePanelRef.value?.load?.({ quiet: true });
}

async function copyJoinLink() {
  const url = String(participantJoinUrl.value || '').trim()
    || (typeof window !== 'undefined' ? window.location.href : '');
  try {
    await navigator.clipboard.writeText(url);
    joinLinkCopied.value = true;
    setTimeout(() => { joinLinkCopied.value = false; }, 2000);
  } catch {
    /* ignore */
  }
  toolsOpen.value = false;
}

async function enableAttendanceTracking() {
  const eid = Number(resolvedEventId.value || 0);
  if (!eid || !isHost.value) return;
  enablingTracking.value = true;
  enableTrackingError.value = '';
  try {
    const { data } = await api.post(`/team-meetings/${encodeURIComponent(eid)}/enable-attendance-tracking`);
    attendanceTrackingEnabled.value = !!data?.attendanceTrackingEnabled;
    await attendancePanelRef.value?.load?.();
  } catch (e) {
    enableTrackingError.value = e?.response?.data?.error?.message || 'Could not enable transcription and attendance.';
  } finally {
    enablingTracking.value = false;
  }
}

async function onTranscriptPause() {
  await pauseTranscriptLocal();
  videoRoomRef.value?.signalTranscriptControl?.({ action: 'pause', byName: localDisplayName.value });
}

async function onTranscriptResume() {
  await resumeTranscriptLocal();
  videoRoomRef.value?.signalTranscriptControl?.({ action: 'resume', byName: localDisplayName.value });
}

async function onTranscriptStop(data) {
  await applyTranscriptRoomStop({
    stoppedByName: data?.stoppedByName || localDisplayName.value || 'Host',
    stoppedAt: data?.stoppedAt || new Date().toISOString()
  });
  videoRoomRef.value?.signalTranscriptControl?.({
    action: 'stop',
    stoppedByName: data?.stoppedByName || localDisplayName.value || 'Host',
    stoppedAt: data?.stoppedAt || new Date().toISOString()
  });
}

function onTranscriptControlApi(payload) {
  const action = String(payload?.action || '');
  if (action === 'pause') void pauseTranscriptLocal();
  else if (action === 'resume') void resumeTranscriptLocal();
  else if (action === 'stop') {
    void applyTranscriptRoomStop({
      stoppedByName: payload?.stoppedByName,
      stoppedAt: payload?.stoppedAt
    });
  }
}

function onRemoteTranscriptControl(payload) {
  const action = String(payload?.action || '');
  if (action === 'pause') void pauseTranscriptLocal();
  else if (action === 'resume') void resumeTranscriptLocal();
  else if (action === 'stop') {
    void applyTranscriptRoomStop({
      stoppedByName: payload?.stoppedByName || payload?.byName,
      stoppedAt: payload?.stoppedAt || new Date().toISOString()
    });
  }
}

async function teardownLiveSession() {
  stopAdmissionPolling();
  stopPresenceHeartbeat();
  stopCompletionPolling();
  try {
    await stopTranscriptCapture();
  } catch { /* ignore */ }
  try {
    videoRoomRef.value?.disconnect?.();
  } catch { /* ignore */ }
  sendPresence('leave');
  token.value = '';
  vonageSessionId.value = '';
  roomName.value = '';
  videoConnected.value = false;
}

function showSessionExit({ variant = 'left', canRejoin = true } = {}) {
  const ended = !!meetingCompletedAt.value || variant === 'host-ended' || variant === 'ended-by-you';
  sessionExit.value = {
    variant,
    canRejoin: !!canRejoin && !ended
  };
  exitBannerDismissed.value = false;
}

function dismissHostEndedBanner() {
  exitBannerDismissed.value = true;
  goToScheduleFromExit();
}

function goToScheduleFromExit() {
  sessionExit.value = null;
  exitBannerDismissed.value = false;
  navigateAway();
}

async function rejoinMeeting() {
  if (meetingCompletedAt.value) {
    showSessionExit({ variant: 'host-ended', canRejoin: false });
    return;
  }
  sessionExit.value = null;
  exitBannerDismissed.value = false;
  intentionalLeave.value = false;
  joinAttemptedForPath.value = '';
  error.value = '';
  await fetchTokenAndJoin();
}

function navigateAway() {
  const slug = organizationSlug.value || authStore.user?.organization?.slug;
  if (slug) {
    router.push({ path: `/${slug}/dashboard`, query: { focus: 'schedule', tab: 'my_schedule' } });
  } else {
    router.push({ path: '/dashboard', query: { focus: 'schedule', tab: 'my_schedule' } });
  }
}

function onVideoConnected() {
  videoConnected.value = true;
}

async function finishLeave({ variant = 'left', canRejoin = true } = {}) {
  intentionalLeave.value = true;
  await teardownLiveSession();
  showHostLeaveModal.value = false;
  showSessionExit({ variant, canRejoin });
}

function requestLeave() {
  if (isHost.value && !meetingCompletedAt.value) {
    showHostLeaveModal.value = true;
    completeError.value = '';
    return;
  }
  const ended = !!meetingCompletedAt.value;
  void finishLeave({ variant: ended ? 'host-ended' : 'left', canRejoin: !ended });
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
    applyClosurePayload(data || {});
    meetingCompletedAt.value = meetingCompletedAt.value || new Date().toISOString();
    showHostLeaveModal.value = false;
    void finishLeave({ variant: 'ended-by-you', canRejoin: false });
  } catch (e) {
    intentionalLeave.value = false;
    completeError.value = e?.response?.data?.error?.message || e?.message || 'Failed to complete meeting';
  } finally {
    completing.value = false;
  }
}

function leaveWithoutClosing() {
  showHostLeaveModal.value = false;
  void finishLeave({ variant: 'left', canRejoin: true });
}

function onMeetingEnded(payload = {}) {
  if (sessionExit.value || intentionalLeave.value) return;
  applyClosurePayload(payload || {});
  meetingCompletedAt.value = meetingCompletedAt.value || new Date().toISOString();
  void finishLeave({ variant: 'host-ended', canRejoin: false });
}

function onDisconnected() {
  if (intentionalLeave.value || sessionExit.value) return;
  videoConnected.value = false;
  if (meetingCompletedAt.value) {
    void finishLeave({ variant: 'host-ended', canRejoin: false });
    return;
  }
  if (isHost.value) {
    showHostLeaveModal.value = true;
    return;
  }
  void finishLeave({ variant: 'left', canRejoin: true });
}

async function runJoinFlowForCurrentRoute() {
  const pathKey = String(route.fullPath || '');
  if (joinAttemptedForPath.value === pathKey) return;
  joinAttemptedForPath.value = pathKey;
  error.value = '';

  if (!organizationSlug.value) {
    const resolved = await resolveAndRedirect();
    if (resolved !== 'continue') return;
  }
  const ok = await ensureAuthenticatedSession();
  if (!ok) {
    // Auth redirected — allow retry when user returns to this path.
    joinAttemptedForPath.value = '';
    return;
  }
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
      if (data?.attendanceTrackingEnabled != null) {
        attendanceTrackingEnabled.value = !!data.attendanceTrackingEnabled;
      }
      if (data?.title) waitingMeetingTitle.value = String(data.title).trim();
      const parts = Array.isArray(data?.participants) ? data.participants : [];
      // Workspace participants include the host; group label uses booked invitees only.
      bookedParticipantCount.value = parts.filter((p) => {
        if (p?.isHost) return false;
        return Number(p?.userId || p?.user_id || p?.id || 0) > 0;
      }).length;
    } catch {
      meetingSubtype.value = 'general';
    }
    try {
      const { data: att } = await api.get(`/team-meetings/${eid}/attendance`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      });
      applyClosurePayload(att || {});
      if (att?.kind) meetingKind.value = String(att.kind).toUpperCase();
      if (att?.meetingSubtype) {
        const subtype = String(att.meetingSubtype).toLowerCase();
        meetingSubtype.value = (subtype === 'admin' || subtype === 'town_hall') ? subtype : meetingSubtype.value;
      }
      if (att?.attendanceTrackingEnabled != null) {
        attendanceTrackingEnabled.value = !!att.attendanceTrackingEnabled;
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
  if (fullscreenNoticeTimer) clearTimeout(fullscreenNoticeTimer);
  if (typeof document !== 'undefined') {
    document.body.classList.remove('meeting-video-fullscreen');
  }
});
</script>

<style scoped>
.join-team-meeting-view {
  min-height: 100vh;
  min-height: 100dvh;
  max-height: 100vh;
  max-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 16px;
  background: var(--bg-primary, #0f0f0f);
  gap: 10px;
  box-sizing: border-box;
  overflow: hidden;
}
/* Match group-supervision brand wash (tenant secondary → deep base). */
.join-team-meeting-view--branded {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--agency-secondary-color, #1d2633) 88%, #000),
    #0c1018
  );
  color: #eef2f8;
}
.join-team-meeting-view--branded .join-header h1 {
  color: #f4faf6;
}
.join-team-meeting-view--branded .join-header__live {
  color: color-mix(in srgb, var(--agency-primary-color, #3dce7a) 70%, #3dce7a);
}
.join-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
  padding: 4px 0 2px;
}
.join-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.join-header__logo {
  flex: 0 0 auto;
}
.join-header__logo :deep(.logo-image) {
  height: 48px;
  max-height: 48px;
}
.join-header h1 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #f4faf6;
}
.join-header__meta {
  margin: 2px 0 0;
  color: #a8b3c7;
  font-size: 0.85rem;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.join-header__live {
  color: #3dce7a;
  font-weight: 600;
}
.join-header__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.join-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.join-tracking-error {
  font-size: 0.8rem;
  color: #fecaca;
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
.join-lobby-banner,
.join-transcript-banner {
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(147, 197, 253, 0.45);
  color: #dbeafe;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.92rem;
  flex-shrink: 0;
}
.join-transcript-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(6, 95, 70, 0.28);
  border-color: rgba(52, 211, 153, 0.45);
  color: #d1fae5;
}
.join-transcript-banner p {
  margin: 0;
  flex: 1;
  line-height: 1.35;
  font-size: 0.88rem;
}
.join-transcript-banner__dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.25);
  flex-shrink: 0;
}
.join-transcript-banner__x {
  border: 0;
  background: transparent;
  color: #a7f3d0;
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.join-session-layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
  gap: 14px;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
}
.join-session-layout--chat-only {
  grid-template-columns: 1fr;
}
.join-session-layout--lobby {
  grid-template-columns: 1fr;
}
.join-session-layout--video-fs {
  grid-template-columns: 1fr;
  gap: 0;
}
.join-team-meeting-view--video-fs {
  padding: 0;
  background: #070a10;
}
.join-live-activity--fs-probe {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  opacity: 0 !important;
  pointer-events: none !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0);
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
}
.join-tools { position: relative; }
.join-tools__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  min-width: 180px;
  padding: 6px;
}
.join-tools__item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
}
.join-tools__item:hover { background: #f1f5f9; }
.join-hand-chip {
  font-size: 0.78rem;
  font-weight: 700;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 4px 8px;
}
.join-waiting-chip {
  font-size: 0.78rem;
  font-weight: 800;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 4px 10px;
  animation: join-waiting-pulse 1.6s ease-in-out infinite;
}
@keyframes join-waiting-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.35); }
  50% { box-shadow: 0 0 0 5px rgba(37, 99, 235, 0); }
}
.join-host-lobby {
  flex: 0 0 auto;
  position: sticky;
  top: 0;
  z-index: 6;
}
.join-video {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}
.join-video--lobby {
  position: relative;
  flex: 1;
  min-height: min(68vh, 620px);
  border-radius: 16px;
  overflow: hidden;
  background: #0b1210;
}
.join-video__stage {
  position: relative;
  z-index: 3;
  flex: 1;
  min-height: 0;
}
.join-video__stage--pip {
  position: absolute;
  right: 14px;
  bottom: 14px;
  top: auto;
  width: min(300px, 34%);
  max-height: calc(100% - 28px);
  height: auto;
  min-height: 0;
  border-radius: 14px;
  overflow: auto;
  z-index: 5;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.4);
  display: flex;
  flex-direction: column;
}
.join-video__stage--pip :deep(.supervision-video-room),
.join-video__stage--pip :deep(.vsr) {
  flex: 0 0 auto;
  min-height: 0 !important;
  height: auto;
}
.join-video__stage--pip :deep(.vsr__viewport) {
  flex: 0 0 auto;
}
.join-video__stage--pip :deep(.vsr__stage),
.join-video__stage--pip :deep(.vsr__tile) {
  min-height: 0 !important;
  height: 100%;
}
.join-session-layout--video-focus .join-video {
  overflow: hidden;
}
.join-session-layout--video-focus .join-video :deep(.supervision-video-room) {
  flex: 1 1 0;
  min-height: 0;
}
.join-session-layout--video-focus .join-video :deep(.vsr) {
  flex: 1 1 0;
  min-height: 0;
}
.join-live-activity {
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 360px;
  flex: 0 0 auto;
}
.join-live-activity--collapsed,
.join-session-layout--video-focus .join-live-activity {
  min-height: 0;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
}
.join-live-activity__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}
.join-video--lobby .join-video__stage--pip :deep(.supervision-video-room),
.join-video--lobby .join-video__stage--pip :deep(.vsr) {
  flex: 0 0 auto;
  min-height: 0 !important;
  height: auto;
}
.join-video :deep(.supervision-video-room) {
  flex: 1 1 auto;
  min-height: min(42vh, 480px);
  display: flex;
  flex-direction: column;
}
.join-video :deep(.vsr) {
  flex: 1 1 auto;
  min-height: min(38vh, 420px);
  display: flex;
  flex-direction: column;
}
.join-video :deep(.vsr__stage:not(.vsr__stage--strip)) {
  flex: 1 1 0;
  min-height: 0 !important;
  height: auto !important;
}
.join-video :deep(.vsr__stage--solo .vsr__tile),
.join-video :deep(.vsr__stage--duo .vsr__tile),
.join-video :deep(.vsr__stage--grid .vsr__tile) {
  min-height: 140px !important;
  height: 100% !important;
}
.join-video :deep(.vsr__controls) {
  position: relative;
  z-index: 30;
  flex-shrink: 0;
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
  background: rgba(255, 255, 255, 0.04);
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  color: #e8edf5;
}
.join-workspace__banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 12px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(6, 95, 70, 0.28);
  border: 1px solid rgba(52, 211, 153, 0.45);
  color: #d1fae5;
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
  color: #a7f3d0;
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
}
.join-workspace :deep(.meeting-agenda-panel),
.join-workspace :deep(.mgap) {
  color: #e8edf5;
}
.join-workspace :deep(.muted) {
  color: #93a0b8;
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
  .join-video__stage--pip {
    top: auto;
    left: 14px;
    right: 14px;
    bottom: 14px;
    width: auto;
    max-height: min(48vh, 360px);
  }
}
</style>
