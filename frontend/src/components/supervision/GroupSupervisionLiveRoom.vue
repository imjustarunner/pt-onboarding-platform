<template>
  <div class="gsl">
    <header class="gsl__header">
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
        <button type="button" class="btn btn-danger btn-sm" @click="$emit('leave')">Leave session</button>
      </div>
    </header>

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
          :token="token"
          :vonage-session-id="vonageSessionId"
          :room-sid="vonageSessionId"
          :application-id="applicationId"
          :api-key="applicationId"
          :session-title="''"
          :session-id="supervisionSessionId"
          :is-host="isSupervisor"
          :diagnostics="diagnostics"
          :local-display-name="localDisplayName"
          :local-role-label="localRoleLabel"
          :local-profile-photo-url="localProfilePhotoUrl"
          :layout="showWaitingRoomStage ? 'standard' : 'strip'"
          @disconnected="$emit('leave')"
          @connected="onVideoConnected"
        />
        <span
          v-if="showWaitingRoomStage && !prioritizeSelfView"
          class="gsl__self-pip-label"
        >You · tap to enlarge</span>
      </div>
    </div>

    <div class="gsl__main" :class="{ 'gsl__main--lobby': showWaitingRoomStage }">
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

      <SupervisionDiscussionSidebar
        :roomy="showWaitingRoomStage"
        v-model:side-tab="sideTab"
        v-model:discussion-sub-tab="discussionSubTab"
        v-model:topic-draft="topicDraft"
        v-model:chat-draft="chatDraft"
        v-model:personal-notes="personalNotes"
        :topics="topics"
        :chat-messages="chatMessages"
        :error="discussionError"
        :topic-busy="topicBusy"
        :chat-busy="chatBusy"
        :transcript-hint="transcriptHint"
        :transcript-preview="transcriptCombined"
        @post-topic="postTopic"
        @post-chat="postChat"
        @upvote="upvote"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import BrandingLogo from '../BrandingLogo.vue';
import SupervisionVideoRoom from './SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from './SupervisionVideoLobbyPanel.vue';
import SupervisionWaitingRoomStage from './SupervisionWaitingRoomStage.vue';
import SupervisionDiscussionSidebar from './SupervisionDiscussionSidebar.vue';
import {
  supervisionLiveRoomProps,
  useSupervisionLiveSession
} from '../../composables/useSupervisionLiveSession';

const props = defineProps(supervisionLiveRoomProps);
const emit = defineEmits(['leave', 'connected']);

const {
  numericSessionId,
  showLobbyPanel,
  showWaitingRoomStage,
  prioritizeSelfView,
  onSelfStageClick,
  viewAsAttendee,
  sideTab,
  discussionSubTab,
  topicDraft,
  chatDraft,
  discussionError,
  topicBusy,
  chatBusy,
  personalNotes,
  topics,
  chatMessages,
  transcriptHint,
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
  nextSlide,
  postTopic,
  postChat,
  upvote
} = useSupervisionLiveSession(props, emit, { enablePresentation: true });

const transcriptCombined = computed(() => {
  const base = sessionTranscriptPreview.value;
  const live = liveTranscriptPreview.value;
  if (base && live) return `${base}\n${live}`;
  return base || live || '';
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
.gsl__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
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
