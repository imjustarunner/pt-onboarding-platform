<template>
  <div class="gsl" :class="{ 'gsl--video-fs': videoFullscreen }">
    <header v-if="!videoFullscreen" class="gsl__header">
      <div class="gsl__header-left">
        <BrandingLogo size="large" class="gsl__logo" />
        <div>
          <h1>{{ displayTitle }}</h1>
          <p class="gsl__meta">
            <span v-if="presenterSubtitle" class="gsl__presenter-line">{{ presenterSubtitle }}</span>
            <span v-if="sessionMeta">{{ sessionMeta }}</span>
            <span class="gsl__live">● Live</span>
          </p>
        </div>
      </div>
      <div class="gsl__header-right">
        <button
          v-if="isSupervisor || isPresenter"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="viewAsAttendee = !viewAsAttendee"
        >
          {{ viewAsAttendee ? 'Exit attendee view' : 'View as attendee' }}
        </button>
        <span class="gsl__count" title="Participants">{{ participantHint }}</span>
        <button type="button" class="btn btn-danger btn-sm" @click="onLeaveClick">Leave session</button>
      </div>
    </header>

    <div
      v-if="showTranscriptionNotice && !videoFullscreen"
      class="gsl__transcript-banner"
      role="status"
    >
      <span class="gsl__transcript-dot" aria-hidden="true" />
      <p>This session is being transcribed. Live speech may be captured and summarized for participants with access.</p>
      <button
        type="button"
        class="gsl__transcript-x"
        aria-label="Dismiss transcription notice"
        @click="transcriptionNoticeDismissed = true"
      >×</button>
    </div>

    <SupervisionVideoLobbyPanel
      v-if="showLobbyPanel"
      :session-id="numericSessionId"
      :is-supervisor="isSupervisor"
    />

    <div
      class="gsl__video-strip"
      :class="{ 'gsl__video-strip--lobby': showWaitingRoomStage }"
    >
      <SupervisionWaitingRoomStage
        v-if="showWaitingRoomStage"
        :pip="prioritizeSelfView"
        :meeting-title="displayTitle"
        :host-present="hostPresent"
        :host-role-label="hostRoleLabel"
        :host-status-label="hostStatusLabel"
        :goals="[]"
        :agenda="waitingAgenda"
        @show-waiting-room="prioritizeSelfView = false"
      />
      <aside
        v-if="showWaitingRoomStage && !prioritizeSelfView"
        class="gsl__lobby-rail"
        aria-label="Session preview"
      >
        <div
          class="gsl__self-stage gsl__self-stage--pip"
          @click="onSelfStageClick"
        >
          <SupervisionVideoRoom
            v-if="token && vonageSessionId && applicationId"
            ref="videoRoomRef"
            :token="token"
            :vonage-session-id="vonageSessionId"
            :room-sid="vonageSessionId"
            :application-id="applicationId"
            :api-key="applicationId"
            :session-title="''"
            :session-id="supervisionSessionId"
            :is-host="isSupervisor"
            :is-host-or-cohost="isSupervisor"
            mute-others-mode="host"
            :start-muted="joinMutedByDefault"
            :diagnostics="diagnostics"
            :local-display-name="localDisplayName"
            :local-role-label="localRoleLabel"
            :local-profile-photo-url="localProfilePhotoUrl"
            layout="standard"
            @disconnected="$emit('disconnected')"
            @connected="onVideoConnected"
            @meeting-ended="$emit('meeting-ended', $event)"
          />
          <span class="gsl__self-pip-label">You · tap to enlarge</span>
        </div>
      </aside>
      <div
        v-else
        class="gsl__self-stage"
        :class="{
          'gsl__self-stage--featured': showWaitingRoomStage && prioritizeSelfView
        }"
        @click="onSelfStageClick"
      >
        <SupervisionVideoRoom
          v-if="token && vonageSessionId && applicationId"
          ref="videoRoomRef"
          :token="token"
          :vonage-session-id="vonageSessionId"
          :room-sid="vonageSessionId"
          :application-id="applicationId"
          :api-key="applicationId"
          :session-title="''"
          :session-id="supervisionSessionId"
          :is-host="isSupervisor"
          :is-host-or-cohost="isSupervisor"
          mute-others-mode="host"
          :start-muted="joinMutedByDefault"
          show-layout-controls
          :diagnostics="diagnostics"
          :local-display-name="localDisplayName"
          :local-role-label="localRoleLabel"
          :local-profile-photo-url="localProfilePhotoUrl"
          layout="standard"
          :equal-tiles-when-remote="true"
          allow-tile-focus
          v-model:tile-focus="tileFocus"
          v-model:video-fullscreen="videoFullscreen"
          :activity-notice="videoFullscreenActivityNotice"
          :raised-hands-notice="videoFullscreenHandsNotice"
          @disconnected="$emit('disconnected')"
          @connected="onVideoConnected"
          @hands-map-change="onHandsMapChange"
          @audio-map-change="onAudioMapChange"
          @participant-left="onParticipantLeft"
          @meeting-ended="$emit('meeting-ended', $event)"
          @activity-notice-click="onFullscreenActivityClick"
        />
      </div>
    </div>

    <div
      v-if="!videoFullscreen && !showWaitingRoomStage"
      class="gsl__main"
    >
      <section class="gsl__stage-wrap">
        <div class="gsl__stage">
          <template v-if="externalEmbedUrl">
            <iframe
              class="gsl__embed"
              :src="externalEmbedUrl"
              title="Presentation"
              allowfullscreen
            />
          </template>
          <template v-else-if="currentSlide">
            <div class="gsl__slide">
              <p class="gsl__slide-kicker">{{ currentSlide.section_key || 'Case Presentation' }}</p>
              <h2>{{ currentSlide.title }}</h2>
              <div v-if="hasCaseGlance" class="gsl__case-inline">
                <span v-if="caseSummary.client"><strong>Client</strong> {{ caseSummary.client }}</span>
                <span v-if="caseSummary.presentingConcerns"><strong>Concerns</strong> {{ caseSummary.presentingConcerns }}</span>
                <span v-if="caseSummary.duration"><strong>Duration</strong> {{ caseSummary.duration }}</span>
                <span v-if="caseSummary.setting"><strong>Setting</strong> {{ caseSummary.setting }}</span>
              </div>
              <div class="gsl__slide-body" v-html="slideBodyHtml" />
            </div>
          </template>
          <div v-else class="gsl__stage-empty">Presentation will appear here</div>
          <div class="gsl__stage-controls">
            <span>{{ slidePositionLabel }}</span>
            <div v-if="canControlSlides" class="gsl__stage-nav">
              <button type="button" class="btn btn-secondary btn-sm" @click="prevSlide">←</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="nextSlide">→</button>
            </div>
          </div>
        </div>

        <div v-if="showPresenterNotes" class="gsl__below">
          <div class="gsl__card">
            <h3>Presenter notes <small>visible to you</small></h3>
            <p>{{ currentSlide?.presenter_notes || 'No notes for this slide.' }}</p>
          </div>
        </div>
      </section>

      <aside class="gsl__workspace">
        <section class="gsl__workspace-section">
          <MeetingAgendaPanel
            meeting-type="supervision_session"
            :meeting-id="numericSessionId || supervisionSessionId"
            :can-add-item="canFacilitate"
            :embedded="true"
            :live="true"
          />
        </section>
        <section class="gsl__workspace-section gsl__workspace-section--activity">
          <MeetingLiveActivityPanel
            :session-id="numericSessionId || supervisionSessionId"
            :join-token="joinToken"
            :join-identity="joinIdentity"
            :guest-display-name="localDisplayName"
            :is-host="canFacilitate"
            :can-create-polls="canFacilitate"
            :can-answer-questions="canFacilitate"
            :start-open="true"
            :below-video="true"
            theme="dark"
            @activity-notice="onLiveActivityNotice"
          />
        </section>
        <section v-if="canFacilitate" class="gsl__workspace-section">
          <MeetingAttendancePanel
            ref="attendancePanelRef"
            meeting-kind="supervision"
            :event-id="numericSessionId || supervisionSessionId"
            :live-poll="true"
            :raised-hands="raisedHandCount"
            :raised-hand-names="raisedHandNames"
            :muted-names="mutedParticipantNames"
          />
        </section>
        <section class="gsl__workspace-section gsl__workspace-section--transcript">
          <h3 class="gsl__workspace-title">Transcript</h3>
          <p v-if="transcriptHint" class="gsl__transcript-hint">{{ transcriptHint }}</p>
          <pre v-if="transcriptCombined" class="gsl__transcript">{{ transcriptCombined }}</pre>
          <p v-else class="gsl__transcript-empty">Transcript will appear here once speech is detected.</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import api from '../../services/api';
import BrandingLogo from '../BrandingLogo.vue';
import SupervisionVideoRoom from './SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from './SupervisionVideoLobbyPanel.vue';
import SupervisionWaitingRoomStage from './SupervisionWaitingRoomStage.vue';
import MeetingAgendaPanel from '../meetings/MeetingAgendaPanel.vue';
import MeetingLiveActivityPanel from '../meetings/MeetingLiveActivityPanel.vue';
import MeetingAttendancePanel from '../meetings/MeetingAttendancePanel.vue';
import {
  supervisionLiveRoomProps,
  useSupervisionLiveSession
} from '../../composables/useSupervisionLiveSession';

const props = defineProps(supervisionLiveRoomProps);
const emit = defineEmits(['leave', 'connected', 'meeting-ended', 'disconnected']);

const videoRoomRef = ref(null);
const transcriptionNoticeDismissed = ref(false);
const tileFocus = ref('equal');
const videoFullscreen = ref(false);
const videoFullscreenActivityNotice = ref('');
let fullscreenNoticeTimer = null;
const waitingAgenda = ref([]);

const {
  numericSessionId,
  showLobbyPanel,
  showWaitingRoomStage,
  prioritizeSelfView,
  onSelfStageClick,
  viewAsAttendee,
  transcriptHint,
  transcriptCapturing,
  liveTranscriptPreview,
  sessionTranscriptPreview,
  currentSlide,
  canControlSlides,
  showPresenterNotes,
  caseSummary,
  slidePositionLabel,
  slideBodyHtml,
  externalEmbedUrl,
  onVideoConnected,
  prevSlide,
  nextSlide
} = useSupervisionLiveSession(props, emit, { enablePresentation: true, enableActivityFeed: false });

const displayTitle = computed(() => 'Group Supervision');
const presenterSubtitle = computed(() => {
  const raw = String(props.sessionTitle || '').trim();
  const m = raw.match(/Presenting:\s*(.+)$/i);
  if (m?.[1]) return `Presenting: ${m[1].trim()}`;
  return '';
});
const joinMutedByDefault = computed(() => !props.isSupervisor);
const hasCaseGlance = computed(() => {
  const c = caseSummary.value || {};
  return !!(c.client || c.presentingConcerns || c.duration || c.setting);
});

async function loadWaitingPrep() {
  const sid = numericSessionId.value || Number(props.supervisionSessionId || 0);
  if (!sid || !props.isInLobby) return;
  try {
    const agendaResp = await api.get('/meeting-agendas', {
      params: { meetingType: 'supervision_session', meetingId: sid },
      skipGlobalLoading: true,
      skipAuthRedirect: true
    }).catch(() => null);
    const agenda = agendaResp?.data?.items || [];
    waitingAgenda.value = Array.isArray(agenda) ? agenda : [];
  } catch {
    waitingAgenda.value = [];
  }
}

onMounted(() => {
  void loadWaitingPrep();
});

const canFacilitate = computed(() => (
  !viewAsAttendee.value && (props.isSupervisor || props.isPresenter)
));

function onLeaveClick() {
  if (props.isSupervisor) {
    const endForAll = window.confirm(
      'End this Group Supervision for everyone?\n\nOK = End for all participants\nCancel = Leave only (session stays open)'
    );
    emit('leave', { endForAll: !!endForAll });
    return;
  }
  emit('leave', { endForAll: false });
}

const attendancePanelRef = ref(null);
const raisedHandCount = ref(0);
const raisedHandNames = ref([]);
const mutedParticipantNames = ref([]);

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

const showTranscriptionNotice = computed(() => (
  !transcriptionNoticeDismissed.value
  && !props.isInLobby
  && !!props.token
  && transcriptCapturing.value
));

const transcriptCombined = computed(() => {
  const base = sessionTranscriptPreview.value;
  const live = liveTranscriptPreview.value;
  if (base && live) return `${base}\n${live}`;
  return base || live || '';
});

const videoFullscreenHandsNotice = computed(() => {
  if (!raisedHandCount.value) return '';
  const names = (raisedHandNames.value || []).filter(Boolean).slice(0, 2).join(', ');
  if (names && raisedHandCount.value <= 2) return names;
  if (names) return `${names} +${raisedHandCount.value - 2}`;
  return `${raisedHandCount.value} hand${raisedHandCount.value === 1 ? '' : 's'} raised`;
});

function onFullscreenActivityClick() {
  videoFullscreen.value = false;
  videoFullscreenActivityNotice.value = '';
}

function onLiveActivityNotice(payload) {
  const text = String(payload?.text || '').trim();
  if (!text || !videoFullscreen.value) return;
  videoFullscreenActivityNotice.value = text;
  if (fullscreenNoticeTimer) clearTimeout(fullscreenNoticeTimer);
  fullscreenNoticeTimer = setTimeout(() => { videoFullscreenActivityNotice.value = ''; }, 8000);
}

onUnmounted(() => {
  if (fullscreenNoticeTimer) clearTimeout(fullscreenNoticeTimer);
});

defineExpose({
  disconnect: (...args) => videoRoomRef.value?.disconnect?.(...args)
});
</script>

<style scoped>
.gsl {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, color-mix(in srgb, var(--agency-secondary-color, #1d2633) 88%, #000), #0c1018);
  color: #eef2f8;
  padding: 12px 16px 20px;
  box-sizing: border-box;
  font-family: "Segoe UI", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif;
}
.gsl--video-fs {
  padding: 0;
  background: #070a10;
}
.gsl__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.gsl__header-left, .gsl__header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.gsl__logo {
  flex: 0 0 auto;
}
.gsl__logo :deep(.logo-image) {
  height: 52px;
  max-height: 52px;
}
.gsl__header h1 {
  letter-spacing: -0.02em;
  color: #f4faf6;
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
}
.gsl__presenter-line {
  color: #fde68a;
  font-weight: 700;
}
.gsl__case-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.82rem;
  color: #d1fae5;
}
.gsl__case-inline strong {
  display: inline-block;
  margin-right: 4px;
  color: #86efac;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.gsl__meta {
  margin: 2px 0 0;
  color: #a8b3c7;
  font-size: 0.85rem;
  display: flex;
  gap: 10px;
  align-items: center;
}
.gsl__live {
  color: #3dce7a;
  font-weight: 600;
}
.gsl__count {
  opacity: 0.85;
  font-size: 0.9rem;
}
.gsl__video-strip {
  min-height: 160px;
  margin-bottom: 12px;
  position: relative;
}
.gsl__video-strip--lobby {
  overflow: hidden;
  border-radius: 16px;
  background: #0b1210;
  min-height: min(58vh, 520px);
}
.gsl__lobby-rail {
  position: absolute;
  top: 14px;
  right: 14px;
  bottom: 14px;
  z-index: 5;
  width: min(38%, 280px);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  pointer-events: none;
}
.gsl__lobby-prep {
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.92);
  color: #134e3a;
  border-radius: 18px;
  padding: 12px 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  max-height: 42%;
  overflow: auto;
  font-family: "Segoe UI", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif;
}
.gsl__lobby-prep-kicker {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #3f6b58;
}
.gsl__lobby-prep-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.gsl__lobby-prep-list li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: start;
  font-size: 0.86rem;
  line-height: 1.35;
}
.gsl__lobby-prep-tag {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #166534;
  background: #dcfce7;
  border-radius: 999px;
  padding: 2px 7px;
}
.gsl__self-stage {
  position: relative;
  z-index: 3;
  height: 100%;
  min-height: inherit;
}
.gsl__self-stage--pip {
  position: relative;
  width: 100%;
  min-height: 0;
  height: auto;
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.4);
  z-index: 5;
  pointer-events: auto;
  flex: 0 0 auto;
}
.gsl__self-stage--pip :deep(.supervision-video-room),
.gsl__self-stage--pip :deep(.vsr),
.gsl__self-stage--pip :deep(.vsr__stage),
.gsl__self-stage--pip :deep(.vsr__tile) {
  min-height: 0 !important;
  height: 100%;
}
.gsl__self-stage--featured {
  position: absolute;
  inset: 0;
  z-index: 2;
}
.gsl__self-pip-label {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 6;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  pointer-events: none;
}
.gsl__case dd {
  margin: 2px 0 0;
}
.gsl__transcript-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(6, 95, 70, 0.28);
  border: 1px solid rgba(52, 211, 153, 0.45);
  color: #d1fae5;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.gsl__transcript-banner p {
  margin: 0;
  flex: 1;
  line-height: 1.35;
  font-size: 0.88rem;
}
.gsl__transcript-dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.25);
  flex-shrink: 0;
}
.gsl__transcript-x {
  border: 0;
  background: transparent;
  color: #a7f3d0;
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.gsl__workspace {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  max-height: min(72vh, 760px);
  overflow: auto;
}
.gsl__workspace--lobby {
  max-height: none;
}
.gsl__workspace-section {
  flex-shrink: 0;
}
.gsl__workspace-section--activity :deep(.mlap) {
  min-height: min(42vh, 420px);
}
.gsl__workspace-section--activity :deep(.mlap__panel) {
  min-height: min(38vh, 380px);
}
.gsl__workspace-title {
  margin: 0 0 8px;
  font-size: 0.92rem;
  font-weight: 700;
  color: #e8edf5;
}
.gsl__transcript-hint {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: #93a0b8;
}
.gsl__transcript {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.78rem;
  line-height: 1.35;
  color: #d5deea;
  max-height: 180px;
  overflow: auto;
}
.gsl__transcript-empty {
  margin: 0;
  font-size: 0.82rem;
  color: #8893a8;
}
.gsl__workspace :deep(.meeting-agenda-panel),
.gsl__workspace :deep(.mgap) {
  color: #e8edf5;
}
.gsl__workspace :deep(.mw-field),
.gsl__workspace :deep(.mlap__input) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
  color: #f3f6fb;
}
.gsl__workspace :deep(.muted) {
  color: #93a0b8;
}
.gsl__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 400px);
  gap: 14px;
  flex: 1;
  min-height: 0;
}
.gsl__main--lobby {
  grid-template-columns: minmax(0, 1fr);
}
.gsl__stage {
  position: relative;
  background: #121722;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  min-height: 320px;
  padding: 22px;
  overflow: hidden;
}
.gsl__slide-kicker {
  margin: 0 0 6px;
  color: var(--agency-primary-color, var(--primary));
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.75rem;
  font-weight: 700;
}
.gsl__slide h2 {
  margin: 0 0 14px;
  font-size: 1.6rem;
}
.gsl__stage-empty {
  color: #8893a8;
  display: grid;
  place-items: center;
  min-height: 240px;
}
.gsl__embed {
  width: 100%;
  min-height: 360px;
  border: 0;
  border-radius: 8px;
  background: #000;
}
.gsl__stage-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  color: #a8b3c7;
}
.gsl__stage-nav { display: flex; gap: 8px; }
.gsl__below {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}
.gsl__card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px;
}
.gsl__card h3 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.gsl__card small {
  opacity: 0.65;
  font-weight: 400;
}
.gsl__case {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
}
.gsl__case dt {
  font-size: 0.75rem;
  color: #93a0b8;
}
.gsl__case dd {
  margin: 2px 0 0;
}
@media (max-width: 980px) {
  .gsl__main, .gsl__below, .gsl__case {
    grid-template-columns: 1fr;
  }
  .gsl__video-strip--lobby {
    min-height: 48vh;
  }
  .gsl__lobby-rail {
    width: min(46%, 200px);
    top: auto;
    bottom: 10px;
    right: 10px;
    max-height: 55%;
  }
  .gsl__lobby-prep { max-height: 36%; }
}
</style>
