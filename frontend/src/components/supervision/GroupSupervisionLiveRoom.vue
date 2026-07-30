<template>
  <div class="gsl" :class="{ 'gsl--video-fs': videoFullscreen }">
    <header v-if="!videoFullscreen" class="gsl__header">
      <div class="gsl__header-left">
        <BrandingLogo size="small" class="gsl__logo" />
        <div>
          <h1>{{ sessionTitle || 'Group Supervision' }}</h1>
          <p class="gsl__meta">
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
        <button type="button" class="btn btn-danger btn-sm" @click="$emit('leave', { endForAll: canFacilitate })">Leave session</button>
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
        @show-waiting-room="prioritizeSelfView = false"
      />
      <div
        class="gsl__self-stage"
        :class="{
          'gsl__self-stage--pip': showWaitingRoomStage && !prioritizeSelfView,
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
        <span
          v-if="showWaitingRoomStage && !prioritizeSelfView"
          class="gsl__self-pip-label"
        >You · tap to enlarge</span>
      </div>
    </div>

    <div
      v-show="!videoFullscreen"
      class="gsl__main"
      :class="{ 'gsl__main--lobby': showWaitingRoomStage }"
    >
      <section v-if="!showWaitingRoomStage" class="gsl__stage-wrap">
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

        <div class="gsl__below">
          <div v-if="showPresenterNotes" class="gsl__card">
            <h3>Presenter notes <small>visible to you</small></h3>
            <p>{{ currentSlide?.presenter_notes || 'No notes for this slide.' }}</p>
          </div>
          <div class="gsl__card">
            <h3>Case at a glance</h3>
            <dl class="gsl__case">
              <div><dt>Client</dt><dd>{{ caseSummary.client || '—' }}</dd></div>
              <div><dt>Presenting concerns</dt><dd>{{ caseSummary.presentingConcerns || '—' }}</dd></div>
              <div><dt>Duration</dt><dd>{{ caseSummary.duration || '—' }}</dd></div>
              <div><dt>Setting</dt><dd>{{ caseSummary.setting || '—' }}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <aside v-if="!showWaitingRoomStage" class="gsl__workspace">
        <section class="gsl__workspace-section">
          <MeetingAgendaPanel
            meeting-type="supervision_session"
            :meeting-id="numericSessionId || supervisionSessionId"
            :can-add-item="canFacilitate"
            :embedded="true"
            :live="true"
          />
        </section>
        <section class="gsl__workspace-section">
          <MeetingGoalsActionsPanel
            :session-id="numericSessionId || supervisionSessionId"
            section="goals"
            :compact="false"
            :embedded="true"
            :live="true"
            :disabled="!canFacilitate"
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

      <aside v-else class="gsl__workspace gsl__workspace--lobby">
        <section class="gsl__workspace-section gsl__workspace-section--activity">
          <h3 class="gsl__workspace-title">Discussion</h3>
          <p class="gsl__transcript-hint">Waiting room — full workspace unlocks when admitted.</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue';
import BrandingLogo from '../BrandingLogo.vue';
import SupervisionVideoRoom from './SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from './SupervisionVideoLobbyPanel.vue';
import SupervisionWaitingRoomStage from './SupervisionWaitingRoomStage.vue';
import MeetingAgendaPanel from '../meetings/MeetingAgendaPanel.vue';
import MeetingGoalsActionsPanel from '../meetings/MeetingGoalsActionsPanel.vue';
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

const canFacilitate = computed(() => (
  !viewAsAttendee.value && (props.isSupervisor || props.isPresenter)
));

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
.gsl__header h1 {
  margin: 0;
  font-size: 1.15rem;
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
.gsl__self-stage {
  position: relative;
  z-index: 3;
  height: 100%;
  min-height: inherit;
}
.gsl__self-stage--pip {
  position: absolute;
  right: 14px;
  bottom: 14px;
  width: min(34%, 240px);
  min-height: 0;
  height: auto;
  aspect-ratio: 16 / 10;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.4);
  z-index: 5;
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
  .gsl__self-stage--pip {
    width: min(46%, 180px);
    right: 10px;
    bottom: 10px;
  }
}
</style>
