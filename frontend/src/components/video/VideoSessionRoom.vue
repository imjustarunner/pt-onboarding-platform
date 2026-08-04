<template>
  <div
    class="vsr"
    :class="{
      'vsr--compact': compact,
      'vsr--strip': layout === 'strip',
      'vsr--hide-controls': hideControls,
      'vsr--fullscreen': videoFullscreen,
      'vsr--lobby': lobbyMode,
      [`vsr--focus-${tileFocus}`]: !!tileFocus
    }"
  >
    <div v-if="errorMessage" class="vsr__error" role="alert">
      <p class="vsr__error-title">{{ errorMessage }}</p>
      <ul v-if="diagnosticHints.length" class="vsr__hints">
        <li v-for="(hint, i) in diagnosticHints" :key="i">{{ hint }}</li>
      </ul>
      <div class="vsr__error-actions">
        <button type="button" class="vsr__btn vsr__btn--primary" @click="retryConnect">Retry</button>
        <button
          v-if="canRecreateRoom"
          type="button"
          class="vsr__btn"
          @click="retryWithNewRoom"
        >
          Reset video room
        </button>
      </div>
    </div>

    <div v-if="!errorMessage && connecting" class="vsr__connecting" role="status" aria-live="polite">
      <div class="vsr__pulse" aria-hidden="true" />
      <p>Connecting to your session…</p>
      <button type="button" class="vsr__btn vsr__btn--ghost" @click="disconnect">Cancel</button>
    </div>

    <!--
      Keep media targets mounted while connecting. Vonage can deliver remote streams before
      session.connect()/publisher setup finishes; unmounting these nodes during that window
      made subscriptions lose their target and left each participant seeing only themselves.
    -->
    <template v-if="!errorMessage">
      <div class="vsr__viewport" :class="{ 'vsr__viewport--split': useSplitCamOffLayout }">
        <div
          class="vsr__stage"
          :class="{
            'vsr__stage--strip': layout === 'strip',
            'vsr__stage--solo': isSoloStage && !hasScreenShare,
            'vsr__stage--duo': isDuoStage && !hasScreenShare,
            'vsr__stage--grid': isGridStage && !hasScreenShare,
            'vsr__stage--screen': hasScreenShare,
            'vsr__stage--focus-local': tileFocus === 'local' && !hasScreenShare,
            'vsr__stage--focus-remote': (tileFocus === 'remote' || tileFocus === 'speaker') && !hasScreenShare,
            'vsr__stage--focus-speaker': tileFocus === 'speaker' && !hasScreenShare,
            'vsr__stage--focus-collapsed': tileFocus === 'collapsed' && !hasScreenShare,
            [`vsr__stage--count-${Math.min(stageVideoCount, 6)}`]: layout !== 'strip' && !hasScreenShare && stageVideoCount > 0
          }"
        >
          <div
            v-show="hasScreenShare"
            class="vsr__tile vsr__tile--screen"
          >
            <div ref="screenEl" class="vsr__media" />
            <span class="vsr__label">{{ screenShareLabel || 'Screen share' }}</span>
          </div>

          <div
            v-for="r in stageRemotes"
            :key="r.streamId"
            class="vsr__tile vsr__tile--remote"
            :class="{
              'vsr__tile--cam-off': !useSplitCamOffLayout && !r.hasVideo,
              'vsr__tile--muted': !r.hasAudio,
              'vsr__tile--hand': handRaisedForConnection(r.connectionId),
              'vsr__tile--pip': hasScreenShare || tileFocus === 'local' || (tileFocus === 'speaker' && r.streamId !== featuredSpeakerStreamId),
              'vsr__tile--featured': (
                (tileFocus === 'remote' && stageRemotes.length === 1)
                || (tileFocus === 'speaker' && r.streamId === featuredSpeakerStreamId)
              ),
              'vsr__tile--mini': tileFocus === 'collapsed'
            }"
            @click="onTileActivate('remote')"
          >
            <div
              class="vsr__media"
              :ref="(el) => setRemoteMediaEl(r.streamId, el)"
            />
            <div v-if="!useSplitCamOffLayout && !r.hasVideo" class="vsr__avatar" aria-hidden="true">
              <img v-if="r.profilePhotoUrl" :src="r.profilePhotoUrl" alt="" class="vsr__avatar-img" />
              <span v-else class="vsr__avatar-initials">{{ initialsFromLabel(r.name) }}</span>
            </div>
            <span v-if="!r.hasAudio" class="vsr__mic-badge" title="Microphone off" aria-label="Microphone off">
              <svg class="vsr__mic-badge-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" stroke="currentColor" stroke-width="2"/>
                <path d="M19 11a7 7 0 0 1-14 0M12 18v3M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </span>
            <span v-if="handRaisedForConnection(r.connectionId)" class="vsr__hand-badge" title="Hand raised" aria-label="Hand raised">✋</span>
            <span class="vsr__label" :class="{ 'vsr__label--with-status': !r.hasAudio }">
              <span class="vsr__label-name">{{ r.name }}</span>
              <span v-if="!r.hasAudio" class="vsr__label-status vsr__label-status--muted">Muted</span>
            </span>
            <span v-if="!r.hasAudio" class="vsr__muted-pill" aria-label="Muted">Muted</span>
            <button
              v-else-if="canMuteOthers && r.connectionId"
              type="button"
              class="vsr__mute-other"
              title="Mute this participant"
              @click.stop="forceMuteRemote(r)"
            >
              Mute
            </button>
            <button
              v-if="canGrantScreenShare && r.connectionId && !shareGrantedFor(r.connectionId)"
              type="button"
              class="vsr__share-grant"
              title="Allow this participant to share their screen"
              @click.stop="grantScreenShare(r, true)"
            >
              Allow share
            </button>
            <button
              v-else-if="canGrantScreenShare && r.connectionId && shareGrantedFor(r.connectionId)"
              type="button"
              class="vsr__share-grant vsr__share-grant--on"
              title="Revoke screen share permission"
              @click.stop="grantScreenShare(r, false)"
            >
              Revoke share
            </button>
          </div>

          <div
            v-if="showStageEmpty"
            class="vsr__tile vsr__tile--remote vsr__tile--empty"
          >
            <span class="vsr__waiting">Waiting for others to join…</span>
          </div>

          <div
            v-show="showLocalOnStage"
            class="vsr__tile vsr__tile--local"
            :class="{
              'vsr__tile--muted': !publishAudio,
              'vsr__tile--cam-off': !publishVideo && !useSplitCamOffLayout,
              'vsr__tile--hand': localHandRaised,
              'vsr__tile--solo': isSoloStage && !hasScreenShare && tileFocus === 'equal',
              'vsr__tile--duo': isDuoStage && !hasScreenShare && tileFocus === 'equal',
              'vsr__tile--grid-local': isGridStage && !hasScreenShare && tileFocus === 'equal',
              'vsr__tile--pip': hasScreenShare || tileFocus === 'remote' || (tileFocus === 'speaker' && !!featuredSpeakerStreamId),
              'vsr__tile--featured': tileFocus === 'local' || (tileFocus === 'speaker' && !featuredSpeakerStreamId),
              'vsr__tile--mini': tileFocus === 'collapsed'
            }"
            @click="onTileActivate('local')"
          >
            <div ref="localMediaStageEl" class="vsr__media" />
            <span v-if="lobbyMode" class="vsr__lobby-preview-label">Your preview</span>
            <div v-if="!publishVideo && !useSplitCamOffLayout" class="vsr__avatar" aria-hidden="true">
              <img v-if="localProfilePhotoUrl" :src="localProfilePhotoUrl" alt="" class="vsr__avatar-img" />
              <span v-else class="vsr__avatar-initials">{{ localInitials }}</span>
            </div>
            <span v-if="!publishAudio" class="vsr__mic-badge" title="Microphone off" aria-label="Microphone off">
              <svg class="vsr__mic-badge-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" stroke="currentColor" stroke-width="2"/>
                <path d="M19 11a7 7 0 0 1-14 0M12 18v3M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </span>
            <span v-if="localHandRaised" class="vsr__hand-badge" title="Hand raised" aria-label="Hand raised">✋</span>
            <span class="vsr__label" :class="{ 'vsr__label--with-status': !publishAudio }">
              <span class="vsr__label-name">{{ localName || 'You' }}</span>
              <span v-if="!publishAudio" class="vsr__label-status vsr__label-status--muted">Muted</span>
            </span>
            <button
              v-if="allowTileFocus"
              type="button"
              class="vsr__focus-btn"
              :title="tileFocus === 'local' ? 'Shrink video' : 'Enlarge video'"
              @click.stop="onTileActivate('local')"
            >
              {{ tileFocus === 'local' ? 'Shrink' : 'Expand' }}
            </button>
          </div>

          <div class="vsr__reactions" aria-live="polite">
            <div
              v-for="rx in floatingReactions"
              :key="rx.id"
              class="vsr__float-rx"
              :style="{ left: rx.left, top: rx.top, animationDuration: rx.duration }"
            >
              <span class="vsr__float-rx-emoji">{{ rx.emoji }}</span>
              <span class="vsr__float-rx-name">{{ rx.displayName }}</span>
            </div>
          </div>
        </div>

        <aside
          v-if="camOffPanelEntries.length"
          class="vsr__cam-off-panel"
          aria-label="Camera off participants"
        >
          <div class="vsr__cam-off-panel-inner">
            <div
              v-for="entry in camOffPanelEntries"
              :key="entry.key"
              class="vsr__cam-off-chip"
              :class="{
                'vsr__cam-off-chip--speaking': isParticipantSpeaking(entry),
                'vsr__cam-off-chip--muted': !entry.hasAudio,
                'vsr__cam-off-chip--local': entry.kind === 'local'
              }"
            >
              <div
                v-if="entry.kind === 'remote'"
                class="vsr__cam-off-media"
                :ref="(el) => setRemoteMediaEl(entry.streamId, el)"
                aria-hidden="true"
              />
              <div class="vsr__cam-off-avatar" aria-hidden="true">
                <img v-if="entry.profilePhotoUrl" :src="entry.profilePhotoUrl" alt="" class="vsr__cam-off-avatar-img" />
                <span v-else class="vsr__cam-off-avatar-initials">{{ initialsFromLabel(entry.displayName) }}</span>
              </div>
              <div class="vsr__cam-off-meta">
                <span class="vsr__cam-off-name">{{ entry.displayName }}</span>
                <span v-if="!entry.hasAudio" class="vsr__cam-off-muted">Muted</span>
                <span v-else-if="isParticipantSpeaking(entry)" class="vsr__cam-off-speaking">Speaking</span>
              </div>
              <span v-if="!entry.hasAudio" class="vsr__cam-off-mic-off" title="Microphone off" aria-label="Microphone off">
                <svg class="vsr__mic-badge-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" stroke="currentColor" stroke-width="2"/>
                  <path d="M19 11a7 7 0 0 1-14 0M12 18v3M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </span>
              <span v-if="entry.kind === 'remote' && handRaisedForConnection(entry.connectionId)" class="vsr__cam-off-hand">✋</span>
              <span v-if="!entry.hasAudio" class="vsr__muted-pill vsr__muted-pill--chip" aria-label="Muted">Muted</span>
              <button
                v-else-if="entry.kind === 'remote' && canMuteOthers && entry.connectionId"
                type="button"
                class="vsr__cam-off-mute"
                title="Mute this participant"
                @click.stop="forceMuteRemote(entry.remote)"
              >
                Mute
              </button>
              <button
                v-if="entry.kind === 'remote' && canGrantScreenShare && entry.connectionId && !shareGrantedFor(entry.connectionId)"
                type="button"
                class="vsr__share-grant"
                title="Allow this participant to share their screen"
                @click.stop="grantScreenShare(entry.remote || entry, true)"
              >
                Allow share
              </button>
              <button
                v-else-if="entry.kind === 'remote' && canGrantScreenShare && entry.connectionId && shareGrantedFor(entry.connectionId)"
                type="button"
                class="vsr__share-grant vsr__share-grant--on"
                title="Revoke screen share permission"
                @click.stop="grantScreenShare(entry.remote || entry, false)"
              >
                Revoke share
              </button>
            </div>
          </div>
        </aside>

        <div ref="localPublisherHostEl" class="vsr__publisher-host vsr__sr-only" aria-hidden="true" />
      </div>

      <div
        v-if="automuteNoticeVisible && canSelfUnmute"
        class="vsr__automute-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vsr-automute-title"
      >
        <div class="vsr__automute-card">
          <h3 id="vsr-automute-title">You have been automuted</h3>
          <p>Please unmute to speak when you are ready.</p>
          <div class="vsr__automute-actions">
            <button type="button" class="vsr__ctrl vsr__ctrl--primary" @click="dismissAutomuteAndUnmute">Unmute</button>
            <button type="button" class="vsr__ctrl" @click="dismissAutomuteNotice">Stay muted</button>
          </div>
        </div>
      </div>
      <div v-else-if="!publishAudio" class="vsr__muted-banner" role="status" aria-live="polite">
        <span class="vsr__muted-banner-icon" aria-hidden="true">
          <svg class="vsr__mic-badge-icon" viewBox="0 0 24 24" fill="none">
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" stroke="currentColor" stroke-width="2"/>
            <path d="M19 11a7 7 0 0 1-14 0M12 18v3M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="vsr__muted-banner-text">{{ forceMutedByHost ? 'Muted by host — you cannot unmute yourself' : 'You are muted — others cannot hear you' }}</span>
      </div>
      <div v-if="micActionHint" class="vsr__mic-hint" role="alert">{{ micActionHint }}</div>
      <div v-if="connectionNotice" class="vsr__connection-hint" role="status" aria-live="polite">
        {{ connectionNotice }}
      </div>

      <div v-if="!hideControls" class="vsr__controls" role="toolbar" aria-label="Session media controls">
        <button
          v-if="canSelfUnmute || publishAudio"
          type="button"
          class="vsr__ctrl vsr__ctrl--mic"
          :class="{ 'vsr__ctrl--danger': !publishAudio, 'vsr__ctrl--mic-muted': !publishAudio }"
          :aria-pressed="!publishAudio"
          :title="publishAudio ? 'Mute microphone' : (canSelfUnmute ? 'Unmute microphone' : 'Muted by host')"
          @click.stop.prevent="toggleMic"
        >
          <span class="vsr__ctrl-mic-row">
            <span>{{ publishAudio ? 'Mic' : (canSelfUnmute ? 'Unmute' : 'Muted') }}</span>
            <span
              v-if="publishAudio"
              class="vsr__mic-meter"
              :class="{ 'vsr__mic-meter--active': localMicLevel > 0.04 }"
              aria-hidden="true"
            >
              <span
                v-for="bar in 5"
                :key="bar"
                class="vsr__mic-bar"
                :style="{ transform: `scaleY(${micBarScale(bar)})` }"
              />
            </span>
          </span>
        </button>
        <span
          v-else
          class="vsr__ctrl vsr__ctrl--mic-muted vsr__ctrl--static"
          title="Muted by host"
          aria-label="Muted by host"
        >Muted</span>
        <button
          type="button"
          class="vsr__ctrl"
          :class="{ 'vsr__ctrl--danger': !publishVideo }"
          :aria-pressed="!publishVideo"
          :title="publishVideo ? 'Turn camera off' : 'Turn camera on'"
          @click.stop.prevent="toggleCamera"
        >
          {{ publishVideo ? 'Camera' : 'Cam off' }}
        </button>
        <button
          v-if="!lobbyMode"
          type="button"
          class="vsr__ctrl"
          :aria-pressed="hideSelfView"
          title="Hide self-view without turning off camera"
          @click="hideSelfView = !hideSelfView"
        >
          {{ hideSelfView ? 'Show me' : 'Hide me' }}
        </button>
        <button
          v-if="effectiveCanShareScreen || sharingScreen"
          type="button"
          class="vsr__ctrl"
          :aria-pressed="sharingScreen"
          :disabled="!sessionReady || (!effectiveCanShareScreen && !sharingScreen)"
          :title="screenShareButtonTitle"
          @click="toggleScreenShare"
        >
          {{ sharingScreen ? 'Stop share' : 'Share screen' }}
        </button>
        <span
          v-if="voiceIsolationStatus"
          class="vsr__voice-iso"
          :class="{
            'vsr__voice-iso--on': voiceIsolationStatus === 'on' || voiceIsolationStatus === 'processing' || voiceIsolationStatus === 'browser',
            'vsr__voice-iso--off': voiceIsolationStatus === 'unavailable' || voiceIsolationStatus === 'unsupported'
          }"
          :title="voiceIsolationTitle"
        >
          {{ voiceIsolationLabel }}
        </span>
        <button
          type="button"
          class="vsr__ctrl"
          :class="{ 'vsr__ctrl--active': localHandRaised }"
          :aria-pressed="localHandRaised"
          title="Raise hand"
          @click="toggleRaiseHand"
        >
          {{ localHandRaised ? 'Hand up' : 'Raise hand' }}
        </button>
        <div class="vsr__react-group" title="Send a reaction">
          <button
            v-for="rx in reactionEmojis"
            :key="rx"
            type="button"
            class="vsr__react-btn"
            @click="sendReaction(rx)"
          >{{ rx }}</button>
        </div>
        <div v-if="allowTileFocus || showLayoutControls" class="vsr__layout-wrap">
          <button
            type="button"
            class="vsr__ctrl"
            :class="{ 'vsr__ctrl--active': layoutMenuOpen || videoFullscreen }"
            title="Video layout"
            aria-haspopup="menu"
            :aria-expanded="layoutMenuOpen"
            @click="layoutMenuOpen = !layoutMenuOpen"
          >
            Layout
          </button>
          <div v-if="layoutMenuOpen" class="vsr__layout-menu" role="menu">
            <button
              v-for="opt in layoutMenuOptions"
              :key="opt.id"
              type="button"
              class="vsr__layout-item"
              :class="{ on: isLayoutOptionActive(opt) }"
              role="menuitem"
              @click="applyLayoutOption(opt)"
            >
              <span>{{ opt.label }}</span>
              <span v-if="isLayoutOptionActive(opt)" class="vsr__layout-check" aria-hidden="true">✓</span>
            </button>
          </div>
        </div>
        <slot name="extra-controls" />
      </div>
      <div v-if="videoFullscreen" class="vsr__fs-chrome">
        <button type="button" class="vsr__fs-exit" @click="setVideoFullscreen(false)">
          Exit full screen
        </button>
        <span v-if="raisedHandsNotice" class="vsr__fs-hand" role="status">✋ {{ raisedHandsNotice }}</span>
        <button
          v-if="activityNotice"
          type="button"
          class="vsr__fs-notice"
          @click="onActivityNoticeClick"
        >
          {{ activityNotice }}
          <span class="vsr__fs-notice-hint">Tap to exit &amp; read</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

const props = defineProps({
  /** Vonage Application ID (preferred) or legacy OpenTok project API key */
  apiKey: { type: String, default: '' },
  applicationId: { type: String, default: '' },
  sessionId: { type: String, default: '' },
  token: { type: String, default: '' },
  localName: { type: String, default: 'You' },
  localProfilePhotoUrl: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  layout: { type: String, default: 'standard' }, // standard | strip
  autoConnect: { type: Boolean, default: true },
  /** When alone, fill the main stage with self-view instead of a tiny PiP. */
  promoteLocalWhenAlone: { type: Boolean, default: true },
  /** When someone else joins, use equal side-by-side tiles (not a tiny corner PiP). */
  equalTilesWhenRemote: { type: Boolean, default: true },
  /** Optional server diagnostics (no secrets). */
  diagnostics: { type: Object, default: null },
  /** Show “Reset video room” when auth fails (parent handles recreate). */
  canRecreateRoom: { type: Boolean, default: false },
  /** equal | speaker | local | remote | collapsed — parent-driven expandable tiles */
  tileFocus: { type: String, default: 'equal' },
  /** Hide built-in control bar when parent renders its own dock */
  hideControls: { type: Boolean, default: false },
  /** Show Expand/Shrink controls on tiles */
  allowTileFocus: { type: Boolean, default: false },
  /** Show Layout menu in controls */
  showLayoutControls: { type: Boolean, default: false },
  /** Immersive full-screen video (parent hides workspace/chat) */
  videoFullscreen: { type: Boolean, default: false },
  /** Toast while fullscreen (e.g. "New chat message") — tap exits to read */
  activityNotice: { type: String, default: '' },
  /** Compact hand-raise summary while fullscreen */
  raisedHandsNotice: { type: String, default: '' },
  /** Who may force-mute others: 'everyone' | 'host' | 'none' */
  muteOthersMode: { type: String, default: 'host' },
  /** Local user is host or co-host (for mute-others when mode is host) */
  isHostOrCohost: { type: Boolean, default: false },
  /** everyone | restricted — restricted requires canShareScreen or a host grant */
  screenShareMode: { type: String, default: 'everyone' },
  /** When mode is restricted: whether this user may share without a grant */
  canShareScreen: { type: Boolean, default: true },
  /** Host/admin may grant temporary screen-share to attendees */
  canGrantScreenShare: { type: Boolean, default: false },
  /** Start with microphone off and show an automute notice */
  startMuted: { type: Boolean, default: false },
  /** Play a short tone when someone else joins */
  playJoinTone: { type: Boolean, default: true },
  /** Play a short tone when someone else leaves */
  playLeaveTone: { type: Boolean, default: true },
  /** Connection id / identity used for raise-hand map keys when known */
  localConnectionKey: { type: String, default: '' },
  /** Waiting-room layout: tall preview + stacked controls + mic meter */
  lobbyMode: { type: Boolean, default: false }
});

const emit = defineEmits([
  'connected',
  'disconnected',
  'error',
  'stream-created',
  'stream-destroyed',
  'participant-left',
  'request-recreate-room',
  'update:tileFocus',
  'update:videoFullscreen',
  'activity-notice-click',
  'meeting-ended',
  'hand-raised-change',
  'hands-map-change',
  'audio-map-change',
  'reaction',
  'transcript-control'
]);

const localMediaStageEl = ref(null);
const localPublisherHostEl = ref(null);
const screenEl = ref(null);
const connecting = ref(false);
const errorMessage = ref('');
const errorMeta = ref(null);
const publishAudio = ref(!props.startMuted);
const publishVideo = ref(true);
const automuteNoticeVisible = ref(!!props.startMuted);
/** Set when a host/co-host force-mutes this participant — self-unmute is blocked. */
const forceMutedByHost = ref(false);
const canSelfUnmute = computed(() => !forceMutedByHost.value);
/** Non-blocking mic toggle feedback (do not use errorMessage — that unmounts the room). */
const micActionHint = ref('');
let micHintTimer = null;
const connectionNotice = ref('');
let connectionNoticeTimer = null;
/** True when we published without audio after a mic-access failure — unmute must rebuild the publisher. */
const needsAudioPublisherRebuild = ref(false);
const hideSelfView = ref(false);
/** on | processing | unavailable | unsupported */
const voiceIsolationStatus = ref('');
/** @type {import('vue').Ref<Array<{ streamId: string, connectionId: string, name: string, hasVideo: boolean, hasAudio: boolean, profilePhotoUrl: string }>>} */
const remotes = ref([]);
const sharingScreen = ref(false);
const hasScreenShare = ref(false);
const screenShareLabel = ref('');
const sessionReady = ref(false);
const remoteMediaEls = new Map();
const localHandRaised = ref(false);
/** @type {import('vue').Ref<Record<string, boolean>>} */
const handByConnection = ref({});
/** @type {import('vue').Ref<Record<string, string>>} */
const audioNameByConnection = ref({});
/** @type {import('vue').Ref<Record<string, string>>} */
const handNameByConnection = ref({});
/** @type {import('vue').Ref<Array<{ id: string, emoji: string, displayName: string, left: string, top: string, duration: string }>>} */
const floatingReactions = ref([]);
const reactionEmojis = ['👍', '❤️', '🎉', '👏', '💡'];
const SPEAK_LEVEL = 0.2;
/** @type {import('vue').Ref<Record<string, boolean>>} */
const speakingByKey = ref({});
const localMicLevel = ref(0);
let joinToneCtx = null;
let reactionSeq = 0;

const hasRemote = computed(() => remotes.value.length > 0);
const layoutMenuOpen = ref(false);
const lastSpeakerStreamId = ref('');
const layoutMenuOptions = [
  { id: 'equal', label: 'Equal tiles', kind: 'focus' },
  { id: 'speaker', label: 'Speaker only', kind: 'focus' },
  { id: 'remote', label: 'Focus peer', kind: 'focus' },
  { id: 'local', label: 'Focus you', kind: 'focus' },
  { id: 'collapsed', label: 'Collapse videos', kind: 'focus' },
  { id: 'fullscreen', label: 'Full screen videos', kind: 'fullscreen' }
];
const useSplitCamOffLayout = computed(() =>
  props.layout !== 'strip'
  && props.tileFocus === 'equal'
  && !props.videoFullscreen
);
const featuredSpeakerStreamId = computed(() => {
  if (props.tileFocus !== 'speaker') return '';
  const speakingRemote = stageRemotes.value.find((r) => !!speakingByKey.value[String(r.streamId || '')]);
  if (speakingRemote?.streamId) return speakingRemote.streamId;
  if (lastSpeakerStreamId.value && stageRemotes.value.some((r) => r.streamId === lastSpeakerStreamId.value)) {
    return lastSpeakerStreamId.value;
  }
  return stageRemotes.value[0]?.streamId || '';
});
const remotesOnVideo = computed(() => remotes.value.filter((r) => r.hasVideo));
const remotesCamOff = computed(() => remotes.value.filter((r) => !r.hasVideo));
const stageRemotes = computed(() => (
  useSplitCamOffLayout.value ? remotesOnVideo.value : remotes.value
));
const showLocalOnStage = computed(() => (
  props.lobbyMode
  || (
    !hideSelfView.value
    && (!useSplitCamOffLayout.value || publishVideo.value)
  )
));
const stageVideoCount = computed(() => {
  let count = stageRemotes.value.length;
  if (showLocalOnStage.value) count += 1;
  return count;
});
const showStageEmpty = computed(() => (
  !hasScreenShare.value
  && !hasRemote.value
  && !showLocalOnStage.value
));
const camOffPanelEntries = computed(() => {
  if (!useSplitCamOffLayout.value) return [];
  const entries = remotesCamOff.value.map((r) => ({
    key: r.streamId,
    kind: 'remote',
    streamId: r.streamId,
    connectionId: r.connectionId,
    displayName: r.name,
    profilePhotoUrl: r.profilePhotoUrl,
    hasAudio: r.hasAudio,
    remote: r
  }));
  if (!hideSelfView.value && !publishVideo.value) {
    entries.push({
      key: 'local',
      kind: 'local',
      streamId: 'local',
      connectionId: '',
      displayName: props.localName || 'You',
      profilePhotoUrl: props.localProfilePhotoUrl,
      hasAudio: publishAudio.value,
      remote: null
    });
  }
  return entries;
});
const canMuteOthers = computed(() => {
  const mode = String(props.muteOthersMode || 'host').toLowerCase();
  if (mode === 'everyone') return true;
  if (mode === 'none') return false;
  return !!props.isHostOrCohost;
});

/** connectionId → granted (host-tracked + local grant for self) */
const screenShareGrants = ref({});
const localShareGranted = ref(false);

const isRestrictedScreenShare = computed(() => (
  String(props.screenShareMode || 'everyone').toLowerCase() === 'restricted'
));
const canGrantScreenShare = computed(() => (
  isRestrictedScreenShare.value && !!props.canGrantScreenShare
));
const effectiveCanShareScreen = computed(() => {
  if (!isRestrictedScreenShare.value) return props.canShareScreen !== false;
  return !!props.canShareScreen || !!localShareGranted.value;
});
const screenShareButtonTitle = computed(() => {
  if (sharingScreen.value) return 'Stop sharing your screen';
  if (effectiveCanShareScreen.value) return 'Share your screen';
  return 'Screen share is limited to the host/presenter — ask them to allow you';
});

function shareGrantedFor(connectionId) {
  const id = String(connectionId || '').trim();
  if (!id) return false;
  return !!screenShareGrants.value[id];
}

function grantScreenShare(remote, granted) {
  if (!canGrantScreenShare.value) return;
  const connectionId = String(remote?.connectionId || remote?.connection?.connectionId || '').trim();
  if (!connectionId) return;
  const next = { ...screenShareGrants.value };
  if (granted) next[connectionId] = true;
  else delete next[connectionId];
  screenShareGrants.value = next;
  // Broadcast so the recipient enables share and other hosts see grant state.
  sendSessionSignal('screen_share_grant', {
    connectionId,
    granted: !!granted,
    displayName: remote?.name || ''
  });
}

function applyScreenShareGrantLocal(granted) {
  localShareGranted.value = !!granted;
  if (!granted && sharingScreen.value) stopScreenShare();
}

const voiceIsolationLabel = computed(() => {
  if (voiceIsolationStatus.value === 'on') return 'Voice isolation on';
  if (voiceIsolationStatus.value === 'processing') return 'Enhancing mic…';
  if (voiceIsolationStatus.value === 'browser') return 'Noise reduction on';
  if (voiceIsolationStatus.value === 'unavailable') return 'Standard mic';
  if (voiceIsolationStatus.value === 'unsupported') return 'Mic processing N/A';
  return '';
});
const voiceIsolationTitle = computed(() => {
  if (voiceIsolationStatus.value === 'on') {
    return 'Vonage advanced noise suppression is filtering background noise from your microphone. Echo cancellation is also active.';
  }
  if (voiceIsolationStatus.value === 'processing') {
    return 'Starting advanced noise suppression…';
  }
  if (voiceIsolationStatus.value === 'browser') {
    return 'Your browser or device is applying noise reduction / voice isolation (for example Chrome or iOS Voice Isolation). Echo cancellation is also active.';
  }
  if (voiceIsolationStatus.value === 'unavailable') {
    return 'Vonage advanced isolation is not available here. Your browser may still apply echo cancellation or system voice isolation separately.';
  }
  if (voiceIsolationStatus.value === 'unsupported') {
    return 'This browser cannot report mic processing. Your system may still apply voice isolation.';
  }
  return '';
});

function vonageSupportsAdvancedNoiseSuppression(OT) {
  try {
    return typeof OT?.hasMediaProcessorSupport === 'function' && OT.hasMediaProcessorSupport('audio');
  } catch {
    return false;
  }
}

function trackHasBrowserNoiseReduction(track) {
  if (!track || typeof track.getSettings !== 'function') return false;
  try {
    const settings = track.getSettings() || {};
    if (settings.noiseSuppression === true) return true;
    const vi = String(settings.voiceIsolation || '').toLowerCase();
    if (vi && vi !== 'off' && vi !== 'false' && vi !== '0') return true;
  } catch { /* ignore */ }
  return false;
}

function refreshAudioEnhancementStatus(publisher) {
  try {
    const filter = publisher?.getAudioFilter?.();
    if (filter?.type === 'advancedNoiseSuppression') {
      voiceIsolationStatus.value = 'on';
      return;
    }
  } catch { /* ignore */ }
  try {
    const stream = publisher?.getAudioSource?.() || publisher?.stream || null;
    const track = stream?.getAudioTracks?.()?.[0]
      || (typeof stream?.getTracks === 'function'
        ? stream.getTracks().find((t) => t?.kind === 'audio')
        : null);
    if (trackHasBrowserNoiseReduction(track)) {
      voiceIsolationStatus.value = 'browser';
      return;
    }
  } catch { /* ignore */ }
  // Publisher was created with browser noiseSuppression when Vonage ANS is unavailable.
  if (voiceIsolationStatus.value === 'on' || voiceIsolationStatus.value === 'processing') {
    voiceIsolationStatus.value = 'browser';
  } else if (!voiceIsolationStatus.value) {
    voiceIsolationStatus.value = 'browser';
  }
}

async function ensureAdvancedNoiseSuppression(publisher) {
  if (!publisher) return false;
  try {
    const existing = publisher.getAudioFilter?.();
    if (existing?.type === 'advancedNoiseSuppression') return true;
    await publisher.applyAudioFilter({ type: 'advancedNoiseSuppression' });
    return publisher.getAudioFilter?.()?.type === 'advancedNoiseSuppression';
  } catch (e) {
    console.warn('[VideoSessionRoom] advancedNoiseSuppression failed', e?.message || e);
    return false;
  }
}

function playJoinChime() {
  if (!props.playJoinTone) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!joinToneCtx) joinToneCtx = new AC();
    const ctx = joinToneCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.08);
    osc.frequency.setValueAtTime(783.99, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.34);
  } catch { /* ignore */ }
}

function playLeaveChime() {
  if (!props.playLeaveTone) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!joinToneCtx) joinToneCtx = new AC();
    const ctx = joinToneCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, now);
    osc.frequency.setValueAtTime(329.63, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch { /* ignore */ }
}

function showConnectionNotice(message) {
  connectionNotice.value = String(message || '').trim();
  if (connectionNoticeTimer) clearTimeout(connectionNoticeTimer);
  if (!connectionNotice.value) return;
  connectionNoticeTimer = setTimeout(() => {
    connectionNotice.value = '';
    connectionNoticeTimer = null;
  }, 8000);
}

function localConnectionId() {
  try {
    return connectionIdFrom(session?.connection) || String(props.localConnectionKey || '').trim();
  } catch {
    return String(props.localConnectionKey || '').trim();
  }
}

function connectionIdFrom(conn) {
  if (!conn) return '';
  return String(conn.connectionId || conn.id || '').trim();
}

function setRemoteAudioState({ streamId = '', connectionId = '', hasAudio, displayName = '' } = {}) {
  const sid = String(streamId || '').trim();
  const cid = String(connectionId || '').trim();
  const on = !!hasAudio;
  if (!sid && !cid) return;
  let matched = false;
  remotes.value = remotes.value.map((r) => {
    const hit = (sid && r.streamId === sid) || (cid && r.connectionId === cid);
    if (!hit) return r;
    matched = true;
    return r.hasAudio === on ? r : { ...r, hasAudio: on };
  });
  if (!matched) return;
  const remote = remotes.value.find((r) => (
    (sid && r.streamId === sid) || (cid && r.connectionId === cid)
  ));
  const nameKey = cid || remote?.connectionId || '';
  if (nameKey && displayName) {
    audioNameByConnection.value = { ...audioNameByConnection.value, [nameKey]: String(displayName).trim() };
  } else if (nameKey && on) {
    const nextNames = { ...audioNameByConnection.value };
    delete nextNames[nameKey];
    audioNameByConnection.value = nextNames;
  }
  if (!on) {
    if (remote?.streamId) setSpeaking(remote.streamId, false);
    if (nameKey && !displayName && remote?.name) {
      audioNameByConnection.value = { ...audioNameByConnection.value, [nameKey]: remote.name };
    }
  }
}

function setRemoteAudioByConnection(connectionId, hasAudio, displayName = '') {
  setRemoteAudioState({ connectionId, hasAudio, displayName });
}

/** Re-send our mic/camera state so peers who joined mid-toggle (or missed a signal) stay in sync. */
function rebroadcastLocalMediaState() {
  broadcastMicState(publishAudio.value);
  broadcastCameraState(publishVideo.value);
}

/**
 * Keep remote camera state consistent across SDK event gaps.
 * Split cam-off layout remounts tiles when hasVideo flips — refresh after DOM settles.
 */
async function refreshRemoteVideo(streamId, hasVideo) {
  const id = String(streamId || '').trim();
  if (!id) return;
  const sub = subscribers.get(id);
  if (sub) {
    try {
      if (typeof sub.subscribeToVideo === 'function') sub.subscribeToVideo(!!hasVideo);
    } catch { /* ignore */ }
  }
  if (!hasVideo) return;
  for (const delay of [0, 50, 160, 320]) {
    // eslint-disable-next-line no-await-in-loop
    if (delay) await new Promise((r) => setTimeout(r, delay));
    // eslint-disable-next-line no-await-in-loop
    await nextTick();
    const el = remoteMediaEls.get(id);
    if (!el) continue;
    reparentSubscriberMedia(id, el);
    forceMediaFill(el);
    try {
      const mediaEl = typeof sub?.element === 'function' ? sub.element() : null;
      const video = mediaEl?.querySelector?.('video') || el.querySelector?.('video');
      if (video) {
        video.style.visibility = 'visible';
        video.style.opacity = '1';
        if (typeof video.play === 'function') void video.play().catch(() => {});
      }
    } catch { /* ignore */ }
  }
}

function setRemoteVideoState({ streamId = '', connectionId = '', hasVideo }) {
  const sid = String(streamId || '').trim();
  const cid = String(connectionId || '').trim();
  const on = !!hasVideo;
  let matched = false;
  remotes.value = remotes.value.map((r) => {
    const hit = (sid && r.streamId === sid) || (cid && r.connectionId === cid);
    if (!hit) return r;
    matched = true;
    if (r.hasVideo === on) return r;
    return { ...r, hasVideo: on };
  });
  if (!matched) return;
  const targets = remotes.value.filter((r) => (
    (sid && r.streamId === sid) || (cid && r.connectionId === cid)
  ));
  for (const r of targets) void refreshRemoteVideo(r.streamId, on);
}

function setRemoteVideoByConnection(connectionId, hasVideo) {
  setRemoteVideoState({ connectionId, hasVideo });
}

function broadcastCameraState(hasVideo) {
  const connId = localConnectionId();
  if (!connId) return;
  sendSessionSignal('camera_state', {
    connectionId: connId,
    hasVideo: !!hasVideo,
    displayName: props.localName || 'You'
  });
}

function emitAudioMapChange() {
  const mutedByConnection = {};
  const nameByConnection = { ...audioNameByConnection.value };
  for (const r of remotes.value) {
    if (!r.hasAudio && r.connectionId) {
      mutedByConnection[r.connectionId] = true;
      if (r.name) nameByConnection[r.connectionId] = r.name;
    }
  }
  const localId = localConnectionId();
  if (localId && !publishAudio.value) {
    mutedByConnection[localId] = true;
    nameByConnection[localId] = props.localName || 'You';
  }
  emit('audio-map-change', {
    mutedByConnection: { ...mutedByConnection },
    nameByConnection: { ...nameByConnection }
  });
}

function broadcastMicState(hasAudio) {
  const connId = localConnectionId();
  if (!connId) return;
  sendSessionSignal('mic_state', {
    connectionId: connId,
    hasAudio: !!hasAudio,
    displayName: props.localName || 'You'
  });
}

function sendSessionSignal(type, data, toConnection = null) {
  // Allow once the Vonage session has a connection — don't wait on sessionReady
  // (that flag is set after publish, and early mic_state seeds would otherwise be dropped).
  if (!session || !session.connection) return false;
  try {
    const payload = JSON.stringify(data || {});
    const opts = { type: String(type || ''), data: payload };
    if (toConnection) opts.to = toConnection;
    session.signal(opts, (err) => {
      if (err) console.warn('[VideoSessionRoom] signal failed', type, err?.message || err);
    });
    return true;
  } catch (e) {
    console.warn('[VideoSessionRoom] signal error', e);
    return false;
  }
}

function handRaisedForConnection(connectionId) {
  const id = String(connectionId || '').trim();
  if (!id) return false;
  return !!handByConnection.value[id];
}

function setHandState(connectionId, raised, displayName = '') {
  const id = String(connectionId || '').trim();
  if (!id) return;
  const next = { ...handByConnection.value };
  const nextNames = { ...handNameByConnection.value };
  if (raised) {
    next[id] = true;
    if (displayName) nextNames[id] = String(displayName).trim();
  } else {
    delete next[id];
    delete nextNames[id];
  }
  handByConnection.value = next;
  handNameByConnection.value = nextNames;
  emit('hands-map-change', {
    byConnection: { ...next },
    nameByConnection: { ...nextNames }
  });
}

function toggleRaiseHand() {
  const next = !localHandRaised.value;
  localHandRaised.value = next;
  const connId = localConnectionId();
  if (connId) setHandState(connId, next, props.localName || 'You');
  sendSessionSignal('hand_raised', {
    raised: next,
    connectionId: connId,
    displayName: props.localName || 'You'
  });
  emit('hand-raised-change', next);
}

function pushFloatingReaction({ emoji, displayName }) {
  reactionSeq += 1;
  const id = `rx-${Date.now()}-${reactionSeq}`;
  const left = `${8 + Math.random() * 70}%`;
  const top = `${55 + Math.random() * 30}%`;
  const duration = `${2.8 + Math.random() * 0.8}s`;
  floatingReactions.value = [
    ...floatingReactions.value,
    { id, emoji, displayName: displayName || 'Someone', left, top, duration }
  ];
  window.setTimeout(() => {
    floatingReactions.value = floatingReactions.value.filter((r) => r.id !== id);
  }, 3600);
}

function sendReaction(emoji) {
  const payload = {
    emoji: String(emoji || '').trim(),
    displayName: String(props.localName || 'You').replace(/^You\s*[·|]\s*/i, '').trim() || 'You',
    connectionId: localConnectionId()
  };
  if (!payload.emoji) return;
  pushFloatingReaction(payload);
  sendSessionSignal('reaction', payload);
  emit('reaction', payload);
}

function forceMuteRemote(remote) {
  if (!canMuteOthers.value || !remote?.connectionId) return;
  setRemoteAudioByConnection(remote.connectionId, false);
  sendSessionSignal('force_mute', {
    targetConnectionId: remote.connectionId,
    byName: props.localName || 'Someone'
  });
}

function isLayoutOptionActive(opt) {
  if (!opt) return false;
  if (opt.kind === 'fullscreen') return !!props.videoFullscreen;
  return props.tileFocus === opt.id && !props.videoFullscreen;
}

function setVideoFullscreen(on) {
  emit('update:videoFullscreen', !!on);
  layoutMenuOpen.value = false;
}

function applyLayoutOption(opt) {
  if (!opt) return;
  if (opt.kind === 'fullscreen') {
    setVideoFullscreen(!props.videoFullscreen);
    return;
  }
  emit('update:tileFocus', opt.id);
  layoutMenuOpen.value = false;
}

function onActivityNoticeClick() {
  emit('activity-notice-click');
  setVideoFullscreen(false);
}

function cycleLayoutFocus() {
  const order = ['equal', 'speaker', 'remote', 'local', 'collapsed'];
  const idx = order.indexOf(props.tileFocus);
  const next = order[(idx + 1) % order.length];
  emit('update:tileFocus', next);
}

watch(speakingByKey, (map) => {
  const speaking = Object.entries(map || {}).find(([, on]) => !!on);
  if (!speaking?.[0] || speaking[0] === 'local') return;
  if (stageRemotes.value.some((r) => String(r.streamId) === String(speaking[0]))) {
    lastSpeakerStreamId.value = speaking[0];
  }
}, { deep: true });

watch(() => props.videoFullscreen, (on) => {
  if (on) layoutMenuOpen.value = false;
});

function applyForceMuteLocal() {
  forceMutedByHost.value = true;
  automuteNoticeVisible.value = false;
  if (publishAudio.value) {
    publishAudio.value = false;
    try {
      publisher?.publishAudio?.(false);
    } catch { /* ignore */ }
  }
  broadcastMicState(false);
  setSpeaking('local', false);
  localMicLevel.value = 0;
}

const visibleLocal = computed(() => !hideSelfView.value);
const visibleTileCount = computed(() => stageVideoCount.value);
const isSoloStage = computed(() =>
  props.layout !== 'strip'
  && props.tileFocus === 'equal'
  && stageVideoCount.value === 1
  && (hasRemote.value || props.promoteLocalWhenAlone || props.lobbyMode)
);
const isDuoStage = computed(() =>
  props.equalTilesWhenRemote
  && props.layout !== 'strip'
  && props.tileFocus === 'equal'
  && stageVideoCount.value === 2
);
const isGridStage = computed(() =>
  props.equalTilesWhenRemote
  && props.layout !== 'strip'
  && props.tileFocus === 'equal'
  && stageVideoCount.value >= 3
);

function isParticipantSpeaking(entry) {
  return !!speakingByKey.value[String(entry?.key || '')];
}

function setSpeaking(key, speaking) {
  const id = String(key || '').trim();
  if (!id) return;
  const prev = !!speakingByKey.value[id];
  const nextSpeaking = !!speaking;
  if (prev === nextSpeaking) return;
  const next = { ...speakingByKey.value };
  if (nextSpeaking) next[id] = true;
  else delete next[id];
  speakingByKey.value = next;
}

function attachSubscriberAudioLevel(sub, streamId) {
  const id = String(streamId || '').trim();
  if (!id || !sub?.on) return;
  try {
    sub.on('audioLevelUpdated', (event) => {
      const remote = remotes.value.find((r) => r.streamId === id);
      if (remote && !remote.hasAudio) {
        setSpeaking(id, false);
        return;
      }
      setSpeaking(id, Number(event?.audioLevel ?? 0) > SPEAK_LEVEL);
    });
  } catch { /* ignore */ }
}

function micBarScale(barIndex) {
  const level = Number(localMicLevel.value || 0);
  const threshold = barIndex / 5;
  if (level <= threshold - 0.18) return 0.2;
  const active = Math.min(1, (level - (threshold - 0.18)) / 0.35);
  return 0.2 + active * 0.8;
}

function attachPublisherAudioLevel() {
  try {
    publisher?.on?.('audioLevelUpdated', (event) => {
      const level = Math.max(0, Math.min(1, Number(event?.audioLevel ?? 0)));
      if (!publishAudio.value) {
        setSpeaking('local', false);
        localMicLevel.value = 0;
        return;
      }
      setSpeaking('local', level > SPEAK_LEVEL);
      localMicLevel.value = Math.max(level, localMicLevel.value * 0.82);
    });
  } catch { /* ignore */ }
}

function reparentMediaElement(mediaEl, targetEl) {
  if (!mediaEl || !targetEl) return;
  if (mediaEl.parentNode === targetEl) return;
  targetEl.innerHTML = '';
  targetEl.appendChild(mediaEl);
  forceMediaFill(targetEl);
}

function reparentSubscriberMedia(streamId, targetEl) {
  const id = String(streamId || '').trim();
  const sub = subscribers.get(id);
  if (!sub || !targetEl) return;
  try {
    const mediaEl = typeof sub.element === 'function' ? sub.element() : null;
    reparentMediaElement(mediaEl, targetEl);
  } catch { /* ignore */ }
}

async function syncLocalVideoPresentation() {
  await nextTick();
  let target = localPublisherHostEl.value;
  if (!hideSelfView.value && (!useSplitCamOffLayout.value || publishVideo.value)) {
    target = localMediaStageEl.value || target;
  }
  if (!publisher || !target) return;
  try {
    const mediaEl = typeof publisher.element === 'function' ? publisher.element() : null;
    reparentMediaElement(mediaEl, target);
  } catch { /* ignore */ }
}

async function syncRemotePresentation(streamId) {
  const id = String(streamId || '').trim();
  if (!id) return;
  await nextTick();
  const remote = remotes.value.find((r) => r.streamId === id);
  const el = remoteMediaEls.get(id);
  if (el) {
    reparentSubscriberMedia(id, el);
    forceMediaFill(el);
  }
  if (remote?.hasVideo) void refreshRemoteVideo(id, true);
}

function setRemoteMediaEl(streamId, el) {
  const id = String(streamId || '');
  if (!id) return;
  if (el) {
    remoteMediaEls.set(id, el);
    reparentSubscriberMedia(id, el);
    forceMediaFill(el);
    const remote = remotes.value.find((r) => r.streamId === id);
    if (remote?.hasVideo) void refreshRemoteVideo(id, true);
    return;
  }
  // Vue may null the old tile after the new cam-off/stage tile already registered.
  const current = remoteMediaEls.get(id);
  if (current && typeof current.isConnected === 'boolean' && current.isConnected) return;
  remoteMediaEls.delete(id);
}

function onTileActivate(which) {
  if (!props.allowTileFocus) return;
  if (props.tileFocus === which) {
    emit('update:tileFocus', 'equal');
    return;
  }
  emit('update:tileFocus', which);
}

function initialsFromLabel(label) {
  const parts = String(label || '')
    .replace(/^You\s*[·|]\s*/i, '')
    .replace(/^(Supervisor|Supervisee|Presenter|Guest)\s*[·|]\s*/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

/** Force Vonage OT media nodes to fill their tile (avoids tiny right-aligned insets). */
function forceMediaFill(container) {
  if (!container) return;
  const nodes = container.querySelectorAll('.OT_root, .OT_publisher, .OT_subscriber, .OT_widget-container, video');
  nodes.forEach((el) => {
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
    if (el.tagName === 'VIDEO') {
      el.style.objectFit = 'cover';
    }
  });
}

const localInitials = computed(() => initialsFromLabel(props.localName));

let session = null;
let screenPublisher = null;
let publisher = null;
/** Cached Vonage OT module for mid-call publisher rebuilds (e.g. unmute after muted join). */
let OTApi = null;
const subscribers = new Map();
let screenSubscriber = null;

function isOwnStream(stream) {
  if (!session || !stream) return false;
  const localConn = session.connection?.connectionId;
  const streamConn = stream.connection?.connectionId;
  if (localConn && streamConn && localConn === streamConn) return true;
  // Fallback: publisher stream id when available
  try {
    if (publisher?.stream?.streamId && stream.streamId === publisher.stream.streamId) return true;
  } catch { /* ignore */ }
  return false;
}

function remoteMetaFromStream(stream) {
  let name = String(stream?.name || '').trim() || 'Participant';
  let profilePhotoUrl = '';
  try {
    const data = stream.connection?.data;
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : (data || {});
      name = formatRemoteLabel(parsed);
      profilePhotoUrl = String(parsed.profilePhotoUrl || parsed.profile_photo_url || '').trim();
    }
  } catch { /* keep defaults */ }
  return {
    streamId: String(stream.streamId || ''),
    connectionId: connectionIdFrom(stream?.connection),
    name,
    hasVideo: stream?.hasVideo !== false,
    hasAudio: stream?.hasAudio !== false,
    profilePhotoUrl
  };
}

function clearRemote() {
  subscribers.forEach((sub) => {
    try { session?.unsubscribe(sub); } catch { /* ignore */ }
  });
  subscribers.clear();
  remotes.value = [];
  remoteMediaEls.clear();
}

async function subscribeToStream(stream) {
  if (!session || !stream) return;
  if (isOwnStream(stream)) return;

  const screen = isScreenStream(stream);
  const streamId = String(stream.streamId || '');
  if (!streamId) return;

  if (screen) {
    if (screenSubscriber && String(screenSubscriber.streamId || '') === streamId) return;
    if (screenSubscriber) {
      try { session.unsubscribe(screenSubscriber); } catch { /* ignore */ }
      screenSubscriber = null;
    }
    await nextTick();
    const targetEl = screenEl.value;
    if (!targetEl) return;
    targetEl.innerHTML = '';
    const sub = session.subscribe(
      stream,
      targetEl,
      {
        insertMode: 'append',
        width: '100%',
        height: '100%',
        fitMode: 'contain',
        subscribeToAudio: true,
        subscribeToVideo: true,
        style: { buttonDisplayMode: 'off', nameDisplayMode: 'off' }
      },
      (err) => {
        if (err) console.error('[VideoSessionRoom] screen subscribe error', err);
        else forceMediaFill(targetEl);
      }
    );
    screenSubscriber = sub;
    hasScreenShare.value = true;
    screenShareLabel.value = String(stream?.name || 'Screen share');
    return;
  }

  if (subscribers.has(streamId)) return;

  // Add tile first so the media container exists and has real size.
  if (!remotes.value.some((r) => r.streamId === streamId)) {
    remotes.value = [...remotes.value, remoteMetaFromStream(stream)];
  } else {
    // Refresh mute/camera flags — streamCreated can race ahead of property events.
    setRemoteAudioState({
      streamId,
      connectionId: connectionIdFrom(stream?.connection),
      hasAudio: stream?.hasAudio !== false
    });
    setRemoteVideoState({
      streamId,
      connectionId: connectionIdFrom(stream?.connection),
      hasVideo: stream?.hasVideo !== false
    });
  }
  let targetEl = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await nextTick();
    if (attempt > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    targetEl = remoteMediaEls.get(streamId);
    if (targetEl) break;
  }
  if (!targetEl) {
    console.error('[VideoSessionRoom] remote media target missing', { streamId });
    remotes.value = remotes.value.filter((r) => r.streamId !== streamId);
    return;
  }

  targetEl.innerHTML = '';
  const sub = session.subscribe(
    stream,
    targetEl,
    {
      insertMode: 'append',
      width: '100%',
      height: '100%',
      fitMode: 'cover',
      subscribeToAudio: true,
      subscribeToVideo: true,
      style: { buttonDisplayMode: 'off', nameDisplayMode: 'off' }
    },
    (err) => {
      if (err) {
        console.error('[VideoSessionRoom] subscribe error', err);
        remotes.value = remotes.value.filter((r) => r.streamId !== streamId);
        subscribers.delete(streamId);
        return;
      }
      forceMediaFill(targetEl);
      try {
        if (typeof sub?.subscribeToAudio === 'function') sub.subscribeToAudio(true);
      } catch { /* ignore */ }
    }
  );

  subscribers.set(streamId, sub);
  attachSubscriberAudioLevel(sub, streamId);
  // Authoritative snapshot after subscribe — don't wait for a later property event.
  setRemoteAudioState({
    streamId,
    connectionId: connectionIdFrom(stream?.connection),
    hasAudio: stream?.hasAudio !== false
  });
  sub.on?.('videoEnabled', () => {
    setRemoteVideoState({ streamId, hasVideo: true });
  });
  sub.on?.('videoDisabled', () => {
    setRemoteVideoState({ streamId, hasVideo: false });
  });
  // Fallback: some SDK builds emit property changes instead of videoEnabled/Disabled.
  sub.on?.('streamPropertyChanged', (event) => {
    const changed = String(event?.changedProperty || event?.property || '').toLowerCase();
    if (changed === 'hasvideo' || changed === 'video') {
      const on = event?.newValue !== false && event?.newValue !== 0;
      setRemoteVideoState({ streamId, hasVideo: !!on });
    }
    if (changed === 'hasaudio' || changed === 'audio') {
      const on = event?.newValue !== false && event?.newValue !== 0;
      setRemoteAudioState({ streamId, hasAudio: !!on });
    }
  });
  sub.on?.('audioEnabled', () => {
    setRemoteAudioState({ streamId, hasAudio: true });
  });
  sub.on?.('audioDisabled', () => {
    setRemoteAudioState({ streamId, hasAudio: false });
  });
  playJoinChime();
}

function clearScreenShareTile() {
  hasScreenShare.value = false;
  screenShareLabel.value = '';
  if (screenSubscriber) {
    try { session?.unsubscribe(screenSubscriber); } catch { /* ignore */ }
    screenSubscriber = null;
  }
  if (screenEl.value) screenEl.value.innerHTML = '';
}

function isScreenStream(stream) {
  const vt = String(stream?.videoType || '').toLowerCase();
  if (vt === 'screen') return true;
  const name = String(stream?.name || '');
  return /\(screen\)/i.test(name);
}

function formatRemoteLabel(parsed = {}) {
  const roleRaw = String(parsed.roleLabel || parsed.role || '').trim().toLowerCase();
  let roleLabel = String(parsed.roleLabel || '').trim();
  if (!roleLabel) {
    if (roleRaw === 'supervisor') roleLabel = 'Supervisor';
    else if (roleRaw === 'supervisee' || roleRaw === 'participant') roleLabel = 'Supervisee';
    else if (roleRaw === 'presenter') roleLabel = 'Presenter';
    else if (roleRaw === 'guest') roleLabel = 'Guest';
  }
  const name = String(parsed.displayName || parsed.identity || '').trim() || 'Participant';
  if (roleLabel && name && roleLabel.toLowerCase() !== name.toLowerCase()) return `${roleLabel} · ${name}`;
  return name || roleLabel || 'Participant';
}

function looksLikeJwt(value) {
  return /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(String(value || ''));
}

function stripSecrets(raw) {
  return String(raw || '')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/gi, '[token]')
    .replace(/T1==[A-Za-z0-9+/=]+/gi, '[token]')
    .replace(/\bToken:\s*\S+/gi, 'Token: [redacted]');
}

function resolveProjectId() {
  const appId = String(props.applicationId || '').trim();
  const key = String(props.apiKey || '').trim();
  // Prefer Application ID (UUID). Reject account-style keys that are neither UUID nor numeric project keys.
  if (appId) return appId;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return key;
  if (/^[0-9]{6,12}$/.test(key)) return key;
  return '';
}

function isMicAccessError(err) {
  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  return name.includes('MEDIA_ACCESS')
    || /microphone|getUserMedia|NotAllowed|NotReadable|Could not start audio|failed to get access to your microphone/i.test(msg);
}

function sanitizeVideoError(err) {
  const name = String(err?.name || '');
  const code = err?.code != null ? Number(err.code) : null;
  const raw = stripSecrets(err?.message || err || 'Could not connect to the video session.');

  if (name === 'OT_AUTHENTICATION_ERROR' || code === 1004) {
    return {
      message:
        'Video authentication failed. The Application ID, session, and token must come from the same Vonage Application.',
      kind: 'auth'
    };
  }
  if (name === 'OT_INVALID_SESSION_ID' || code === 1005) {
    return {
      message: 'Video session ID is invalid. Try resetting the video room.',
      kind: 'session'
    };
  }
  if (looksLikeJwt(err?.message) || /Token:/i.test(String(err?.message || ''))) {
    return {
      message:
        'Video connection failed (credential mismatch). Confirm VONAGE_APPLICATION_ID matches the private key used to mint tokens.',
      kind: 'auth'
    };
  }
  if (isMicAccessError(err)) {
    return {
      message:
        'Could not access the microphone. Close other apps/tabs using the mic (or end an in-progress call), then tap Retry. You can also join muted.',
      kind: 'media'
    };
  }
  const cleaned = raw.length > 180 ? `${raw.slice(0, 180)}…` : raw;
  return { message: cleaned || 'Could not connect to the video session.', kind: 'other' };
}

const diagnosticHints = computed(() => {
  const hints = [];
  const d = props.diagnostics || {};
  const projectId = resolveProjectId();
  const token = String(props.token || '');

  if (!projectId) {
    hints.push('Missing Application ID from the server (check VONAGE_APPLICATION_ID).');
  } else if (!/^[0-9a-f-]{36}$/i.test(projectId) && !/^[0-9]+$/.test(projectId)) {
    hints.push(
      'Project ID does not look like an Application ID (UUID) or OpenTok project key — account API keys will not work.'
    );
  }
  if (d.applicationIdFormat === 'missing' || d.applicationIdPresent === false) {
    hints.push('Server reports VONAGE_APPLICATION_ID is not set.');
  }
  if (token && !token.startsWith('eyJ') && !token.startsWith('T1==')) {
    hints.push('Token format is unexpected (expected JWT for Vonage unified apps).');
  }
  if (d.tokenFormat === 'jwt' && projectId && !/^[0-9a-f-]{36}$/i.test(projectId)) {
    hints.push('JWT tokens require the Application ID (UUID), not the account API key.');
  }
  if (errorMeta.value?.kind === 'auth') {
    hints.push(
      'If you recently rotated Vonage keys or use a shared DB across environments, click “Reset video room”.'
    );
    hints.push(
      'In Vonage Dashboard → Applications: enable Video, and use that app’s ID + matching private key.'
    );
  }
  return hints.slice(0, 4);
});

async function connect() {
  errorMessage.value = '';
  errorMeta.value = null;
  const projectId = resolveProjectId();
  if (!projectId || !props.sessionId || !props.token) {
    errorMessage.value = 'Video credentials are missing. Check that video is configured.';
    errorMeta.value = { kind: 'config' };
    emit('error', new Error(errorMessage.value));
    return;
  }

  connecting.value = true;
  try {
    const mod = await import('@vonage/client-sdk-video');
    const OT = mod?.default || mod;
    if (!OT?.initSession) {
      throw new Error('Vonage Video client SDK failed to load.');
    }
    OTApi = OT;
    disconnect(false);
    // Vonage Video JWT tokens: first arg must be Application ID (not account API key).
    session = OT.initSession(projectId, props.sessionId);

    session.on('streamCreated', (event) => {
      void subscribeToStream(event.stream).then(() => {
        // New peer may have missed our earlier mic_state signal — nudge them.
        rebroadcastLocalMediaState();
        emit('stream-created', event);
      });
    });

    // Authoritative camera/mic flips — more reliable than subscriber-only events across SDK builds.
    session.on('streamPropertyChanged', (event) => {
      const stream = event?.stream;
      if (!stream || isOwnStream(stream) || isScreenStream(stream)) return;
      const changed = String(event?.changedProperty || '').toLowerCase();
      const streamId = String(stream.streamId || '');
      const connectionId = connectionIdFrom(stream.connection);
      if (changed === 'hasvideo') {
        const on = event?.newValue !== false && event?.newValue !== 0;
        setRemoteVideoState({ streamId, connectionId, hasVideo: !!on });
      } else if (changed === 'hasaudio') {
        const on = event?.newValue !== false && event?.newValue !== 0;
        setRemoteAudioState({ streamId, connectionId, hasAudio: !!on });
      }
    });

    session.on('streamDestroyed', (event) => {
      const stream = event.stream;
      const streamId = String(stream?.streamId || '');
      if (isScreenStream(stream) || (screenSubscriber && String(screenSubscriber.streamId || '') === streamId)) {
        clearScreenShareTile();
      } else if (streamId) {
        const sub = subscribers.get(streamId);
        if (sub) {
          try { session?.unsubscribe(sub); } catch { /* ignore */ }
          subscribers.delete(streamId);
        }
        const gone = remotes.value.find((r) => r.streamId === streamId);
        remotes.value = remotes.value.filter((r) => r.streamId !== streamId);
        remoteMediaEls.delete(streamId);
        if (gone?.connectionId) setHandState(gone.connectionId, false);
        if (gone) {
          playLeaveChime();
          showConnectionNotice(`${gone.name || 'A participant'} left the session.`);
          emit('participant-left', {
            displayName: gone.name || 'Participant',
            connectionId: gone.connectionId || '',
            streamId
          });
        }
      }
      emit('stream-destroyed', event);
    });

    session.on('sessionDisconnected', () => {
      connecting.value = false;
      emit('disconnected');
    });

    // Host/server broadcasts this when the meeting is marked completed.
    session.on('signal:meeting_ended', (event) => {
      let payload = null;
      try {
        payload = event?.data ? JSON.parse(event.data) : null;
      } catch {
        payload = { raw: event?.data || null };
      }
      emit('meeting-ended', payload);
      try {
        // Parent handles navigation via meeting-ended; avoid a second disconnected race.
        disconnect(false);
      } catch { /* ignore */ }
    });

    session.on('signal:hand_raised', (event) => {
      let payload = {};
      try { payload = event?.data ? JSON.parse(event.data) : {}; } catch { /* ignore */ }
      const connId = String(payload.connectionId || event?.from?.connectionId || '').trim();
      if (!connId) return;
      const raised = !!payload.raised;
      setHandState(connId, raised, payload.displayName || '');
      if (connId === localConnectionId()) localHandRaised.value = raised;
    });

    session.on('signal:reaction', (event) => {
      let payload = {};
      try { payload = event?.data ? JSON.parse(event.data) : {}; } catch { /* ignore */ }
      const fromSelf = String(event?.from?.connectionId || '') === localConnectionId();
      if (fromSelf) return;
      if (!payload.emoji) return;
      pushFloatingReaction({
        emoji: payload.emoji,
        displayName: payload.displayName || 'Someone'
      });
      emit('reaction', payload);
    });

    session.on('signal:screen_share_grant', (event) => {
      let data = {};
      try { data = JSON.parse(event?.data || '{}'); } catch { data = {}; }
      const target = String(data.connectionId || '').trim();
      const me = localConnectionId();
      if (target && me && target === me) {
        applyScreenShareGrantLocal(!!data.granted);
      }
      if (data.connectionId) {
        const next = { ...screenShareGrants.value };
        if (data.granted) next[String(data.connectionId)] = true;
        else delete next[String(data.connectionId)];
        screenShareGrants.value = next;
      }
    });
    session.on('signal:force_mute', (event) => {
      let payload = {};
      try { payload = event?.data ? JSON.parse(event.data) : {}; } catch { /* ignore */ }
      const target = String(payload.targetConnectionId || '').trim();
      const me = localConnectionId();
      if (target && me && target === me) applyForceMuteLocal();
    });

    session.on('signal:mic_state', (event) => {
      let payload = {};
      try { payload = event?.data ? JSON.parse(event.data) : {}; } catch { /* ignore */ }
      const connId = String(payload.connectionId || event?.from?.connectionId || '').trim();
      if (!connId || connId === localConnectionId()) return;
      if (typeof payload.hasAudio === 'boolean') {
        setRemoteAudioByConnection(connId, payload.hasAudio, payload.displayName || '');
      }
    });

    // Peer joined or missed a toggle — reply with our current mic/camera flags.
    session.on('signal:media_state_request', () => {
      rebroadcastLocalMediaState();
    });

    session.on('signal:camera_state', (event) => {
      let payload = {};
      try { payload = event?.data ? JSON.parse(event.data) : {}; } catch { /* ignore */ }
      const connId = String(payload.connectionId || event?.from?.connectionId || '').trim();
      if (!connId || connId === localConnectionId()) return;
      if (typeof payload.hasVideo === 'boolean') {
        setRemoteVideoByConnection(connId, payload.hasVideo);
      }
    });

    session.on('signal:transcript_control', (event) => {
      let payload = {};
      try { payload = event?.data ? JSON.parse(event.data) : {}; } catch { /* ignore */ }
      emit('transcript-control', payload);
    });

    await new Promise((resolve, reject) => {
      session.connect(props.token, (err) => (err ? reject(err) : resolve()));
    });

    await nextTick();
    const publisherMountEl = localMediaStageEl.value || localPublisherHostEl.value;
    if (publisherMountEl) publisherMountEl.innerHTML = '';
    const useVonageNoiseSuppression = vonageSupportsAdvancedNoiseSuppression(OT);
    voiceIsolationStatus.value = useVonageNoiseSuppression ? 'processing' : 'browser';

    const buildPublisherOpts = (withAudio) => {
      const opts = {
        insertMode: 'append',
        width: '100%',
        height: '100%',
        fitMode: 'cover',
        publishAudio: !!withAudio,
        publishVideo: publishVideo.value,
        name: props.localName,
        mirror: true,
        style: { buttonDisplayMode: 'off', nameDisplayMode: 'off' },
        echoCancellation: true,
        autoGainControl: true,
        // Vonage advanced filter replaces browser noise suppression when available.
        noiseSuppression: !useVonageNoiseSuppression
      };
      if (withAudio && useVonageNoiseSuppression) {
        opts.audioFilter = { type: 'advancedNoiseSuppression' };
      }
      return opts;
    };

    const createPublisher = (withAudio) => new Promise((resolve, reject) => {
      const pub = OT.initPublisher(
        publisherMountEl,
        buildPublisherOpts(withAudio),
        (err) => {
          if (err) {
            console.error('[VideoSessionRoom] publisher error', err);
            try { pub.destroy(); } catch { /* ignore */ }
            reject(err);
            return;
          }
          forceMediaFill(publisherMountEl);
          resolve(pub);
        }
      );
    });

    const publishLocal = async (withAudio) => {
      const pub = await createPublisher(withAudio);
      await new Promise((resolve, reject) => {
        session.publish(pub, (err) => {
          if (err) {
            try { pub.destroy(); } catch { /* ignore */ }
            reject(err);
            return;
          }
          resolve();
        });
      });
      return pub;
    };

    try {
      publisher = await publishLocal(publishAudio.value);
    } catch (publishErr) {
      // iOS often fails when another tab/app holds the mic — join muted instead of hard-failing.
      if (publishAudio.value && isMicAccessError(publishErr)) {
        console.warn('[VideoSessionRoom] mic publish failed; retrying muted', publishErr?.message || publishErr);
        if (publisherMountEl) publisherMountEl.innerHTML = '';
        publishAudio.value = false;
        automuteNoticeVisible.value = false;
        needsAudioPublisherRebuild.value = true;
        publisher = await publishLocal(false);
        showMicHint('Joined muted — mic was busy. Tap Unmute when ready (close other apps using the mic first).');
      } else {
        throw publishErr;
      }
    }
    attachPublisherAudioLevel();
    if (publishAudio.value && useVonageNoiseSuppression) {
      const applied = await ensureAdvancedNoiseSuppression(publisher);
      voiceIsolationStatus.value = applied ? 'on' : 'browser';
    } else {
      voiceIsolationStatus.value = 'browser';
    }
    refreshAudioEnhancementStatus(publisher);
    await syncLocalVideoPresentation();

    // Catch streams that were already in the session before our listener ran.
    // Never subscribe to our own published stream (that caused “two of me”).
    try {
      const existing = session.streams;
      const list = [];
      if (existing && typeof existing.forEach === 'function') {
        existing.forEach((stream) => list.push(stream));
      } else if (existing && typeof existing === 'object') {
        list.push(...Object.values(existing));
      }
      for (const stream of list) {
        if (!isOwnStream(stream)) void subscribeToStream(stream);
      }
    } catch (e) {
      console.warn('[VideoSessionRoom] existing stream subscribe failed', e);
    }

    connecting.value = false;
    sessionReady.value = true;
    // Seed peers with our mic/camera state after we're fully connected.
    rebroadcastLocalMediaState();
    sendSessionSignal('media_state_request', { connectionId: localConnectionId() });
    setTimeout(() => rebroadcastLocalMediaState(), 400);
    setTimeout(() => rebroadcastLocalMediaState(), 1200);
    emit('connected');
  } catch (err) {
    console.error('[VideoSessionRoom] connect failed', {
      name: err?.name,
      code: err?.code,
      message: stripSecrets(err?.message)
    });
    connecting.value = false;
    sessionReady.value = false;
    const sanitized = sanitizeVideoError(err);
    errorMessage.value = sanitized.message;
    errorMeta.value = sanitized;
    emit('error', err);
  }
}

function stopScreenShare() {
  if (!screenPublisher) {
    sharingScreen.value = false;
    clearScreenShareTile();
    return;
  }
  try {
    session?.unpublish(screenPublisher);
  } catch {
    /* ignore */
  }
  try {
    screenPublisher.destroy();
  } catch {
    /* ignore */
  }
  screenPublisher = null;
  sharingScreen.value = false;
  // Always clear the featured screen tile — otherwise a black pane remains after Stop share.
  clearScreenShareTile();
}

async function toggleScreenShare() {
  if (!session || !sessionReady.value) {
    errorMessage.value = 'Connect to the session before sharing your screen.';
    return;
  }
  if (sharingScreen.value) {
    stopScreenShare();
    return;
  }
  if (!effectiveCanShareScreen.value) {
    errorMessage.value = 'Only the host or presenter can share screen unless they allow you.';
    return;
  }
  try {
    const mod = await import('@vonage/client-sdk-video');
    const OT = mod?.default || mod;
    // Publish into the featured screen tile so local + remote can see it.
    const target = screenEl.value || undefined;
    await new Promise((resolve, reject) => {
      screenPublisher = OT.initPublisher(
        target || undefined,
        {
          videoSource: 'screen',
          publishAudio: false,
          name: `${props.localName || 'You'} (screen)`,
          insertMode: 'append',
          width: '100%',
          height: '100%',
          fitMode: 'contain',
          style: { buttonDisplayMode: 'off', nameDisplayMode: 'off' }
        },
        (err) => (err ? reject(err) : resolve())
      );
    });
    screenPublisher.on('mediaStopped', () => {
      stopScreenShare();
      clearScreenShareTile();
    });
    await new Promise((resolve, reject) => {
      session.publish(screenPublisher, (err) => (err ? reject(err) : resolve()));
    });
    sharingScreen.value = true;
    hasScreenShare.value = true;
    screenShareLabel.value = `${props.localName || 'You'} (screen)`;
  } catch (err) {
    console.error('[VideoSessionRoom] screen share failed', err);
    stopScreenShare();
    clearScreenShareTile();
    const name = String(err?.name || '');
    const msg = String(err?.message || '');
    errorMessage.value = name.includes('MEDIA_ACCESS') || /permission|denied|blocked|NotAllowed/i.test(msg)
      ? 'Screen share was blocked. Allow screen sharing in your browser, then try again.'
      : (msg || 'Could not share your screen.');
  }
}

function disconnect(emitEvent = true) {
  try {
    stopScreenShare();
    clearScreenShareTile();
    sessionReady.value = false;
    if (publisher) {
      try {
        session?.unpublish(publisher);
      } catch {
        /* ignore */
      }
      try {
        publisher.destroy();
      } catch {
        /* ignore */
      }
      publisher = null;
    }
    subscribers.forEach((sub) => {
      try {
        session?.unsubscribe(sub);
      } catch {
        /* ignore */
      }
    });
    subscribers.clear();
    if (session) {
      try {
        session.disconnect();
      } catch {
        /* ignore */
      }
      session = null;
    }
    if (localMediaStageEl.value) localMediaStageEl.value.innerHTML = '';
    if (localPublisherHostEl.value) localPublisherHostEl.value.innerHTML = '';
    clearRemote();
    speakingByKey.value = {};
    voiceIsolationStatus.value = '';
    needsAudioPublisherRebuild.value = false;
    forceMutedByHost.value = false;
    micActionHint.value = '';
    if (micHintTimer) {
      clearTimeout(micHintTimer);
      micHintTimer = null;
    }
    connectionNotice.value = '';
    if (connectionNoticeTimer) {
      clearTimeout(connectionNoticeTimer);
      connectionNoticeTimer = null;
    }
  } finally {
    connecting.value = false;
    if (emitEvent) emit('disconnected');
  }
}

function dismissAutomuteNotice() {
  automuteNoticeVisible.value = false;
}

function dismissAutomuteAndUnmute() {
  automuteNoticeVisible.value = false;
  if (!publishAudio.value) toggleMic();
}

function showMicHint(message) {
  micActionHint.value = String(message || '').trim();
  if (micHintTimer) clearTimeout(micHintTimer);
  if (!micActionHint.value) return;
  micHintTimer = setTimeout(() => {
    micActionHint.value = '';
    micHintTimer = null;
  }, 6000);
}

async function rebuildPublisherWithAudio() {
  if (!session || !OTApi?.initPublisher) {
    throw new Error('Video session is not ready.');
  }
  const publisherMountEl = localPublisherHostEl.value;
  if (!publisherMountEl) throw new Error('Microphone UI is not ready.');
  const useVonageNoiseSuppression = vonageSupportsAdvancedNoiseSuppression(OTApi);
  const old = publisher;
  publisher = null;
  if (old) {
    try { session.unpublish(old); } catch { /* ignore */ }
    try { old.destroy(); } catch { /* ignore */ }
  }
  publisherMountEl.innerHTML = '';
  const opts = {
    insertMode: 'append',
    width: '100%',
    height: '100%',
    fitMode: 'cover',
    publishAudio: true,
    publishVideo: publishVideo.value,
    name: props.localName,
    mirror: true,
    style: { buttonDisplayMode: 'off', nameDisplayMode: 'off' },
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression: !useVonageNoiseSuppression
  };
  if (useVonageNoiseSuppression) {
    opts.audioFilter = { type: 'advancedNoiseSuppression' };
  }
  const pub = await new Promise((resolve, reject) => {
    const nextPub = OTApi.initPublisher(publisherMountEl, opts, (err) => {
      if (err) {
        try { nextPub.destroy(); } catch { /* ignore */ }
        reject(err);
        return;
      }
      forceMediaFill(publisherMountEl);
      resolve(nextPub);
    });
  });
  await new Promise((resolve, reject) => {
    session.publish(pub, (err) => {
      if (err) {
        try { pub.destroy(); } catch { /* ignore */ }
        reject(err);
        return;
      }
      resolve();
    });
  });
  publisher = pub;
  needsAudioPublisherRebuild.value = false;
  attachPublisherAudioLevel();
  await syncLocalVideoPresentation();
  if (useVonageNoiseSuppression) {
    const applied = await ensureAdvancedNoiseSuppression(publisher);
    voiceIsolationStatus.value = applied ? 'on' : 'browser';
  }
}

async function toggleMic() {
  const next = !publishAudio.value;
  if (next && forceMutedByHost.value) {
    showMicHint('Muted by host — you cannot unmute yourself.');
    return;
  }
  if (!publisher && !needsAudioPublisherRebuild.value) {
    console.warn('[VideoSessionRoom] mic toggled before publisher ready');
    showMicHint('Microphone is not ready yet. Wait a moment and try again.');
    return;
  }
  const prev = publishAudio.value;
  publishAudio.value = next;
  if (next) automuteNoticeVisible.value = false;
  micActionHint.value = '';
  try {
    if (next && needsAudioPublisherRebuild.value) {
      await rebuildPublisherWithAudio();
    } else {
      publisher.publishAudio(next);
    }
    broadcastMicState(next);
    // Peers sometimes miss the first signal right as streams settle.
    if (next) {
      setTimeout(() => broadcastMicState(true), 250);
      setTimeout(() => broadcastMicState(true), 900);
    }
    if (!next) {
      setSpeaking('local', false);
      localMicLevel.value = 0;
      setTimeout(() => broadcastMicState(false), 250);
    }
  } catch (e) {
    console.error('[VideoSessionRoom] publishAudio failed', e);
    publishAudio.value = prev;
    const friendly = sanitizeVideoError(e);
    showMicHint(
      next
        ? (friendly.kind === 'media'
          ? friendly.message
          : 'Could not unmute. Close other apps using the mic, then try again.')
        : (friendly.message || 'Could not mute microphone.')
    );
  }
}

function toggleCamera() {
  const next = !publishVideo.value;
  publishVideo.value = next;
  if (!publisher) {
    console.warn('[VideoSessionRoom] camera toggled before publisher ready');
    return;
  }
  try {
    publisher.publishVideo(next);
    broadcastCameraState(next);
    void syncLocalVideoPresentation();
  } catch (e) {
    console.error('[VideoSessionRoom] publishVideo failed', e);
    publishVideo.value = !next;
  }
}

function retryConnect() {
  connect();
}

function retryWithNewRoom() {
  emit('request-recreate-room');
}

watch(
  () => [props.applicationId, props.apiKey, props.sessionId, props.token],
  () => {
    if (props.autoConnect && props.token) connect();
  }
);

watch([publishVideo, hideSelfView, useSplitCamOffLayout], () => {
  void syncLocalVideoPresentation();
});

watch(
  [publishAudio, () => remotes.value.map((r) => `${r.streamId}:${r.hasAudio ? 1 : 0}`).join('|')],
  () => {
    emitAudioMapChange();
  }
);

watch(
  () => remotes.value.map((r) => `${r.streamId}:${r.hasVideo ? 1 : 0}`).join('|'),
  () => {
    for (const r of remotes.value) {
      if (r.hasVideo) void refreshRemoteVideo(r.streamId, true);
      else void syncRemotePresentation(r.streamId);
    }
  }
);

onMounted(() => {
  if (props.autoConnect && props.token) connect();
});

onBeforeUnmount(() => {
  disconnect(false);
});

function signalTranscriptControl(payload) {
  return sendSessionSignal('transcript_control', payload || {});
}

defineExpose({
  connect,
  disconnect,
  toggleMic,
  toggleCamera,
  toggleScreenShare,
  toggleRaiseHand,
  sendReaction,
  signalTranscriptControl,
  sendSessionSignal,
  publishAudio,
  publishVideo,
  sharingScreen,
  hideSelfView,
  localHandRaised,
  handByConnection
});
</script>

<style scoped>
.vsr {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 180px;
  height: 100%;
  background: #12151c;
  border-radius: 10px;
  color: #f2f4f8;
  overflow: hidden;
}
.vsr--compact {
  min-height: 120px;
}
.vsr--lobby {
  background: rgba(14, 17, 24, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.12);
  height: auto;
  min-height: 0;
}
.vsr--lobby .vsr__viewport {
  flex: 0 0 auto;
  width: 100%;
  aspect-ratio: 1 / 1;
  min-height: 0;
  max-height: min(300px, 34vw);
}
.vsr--lobby .vsr__stage {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
.vsr--lobby .vsr__stage--solo,
.vsr--lobby .vsr__tile--local {
  min-height: 0 !important;
  height: 100% !important;
}
.vsr--lobby .vsr__controls {
  flex: 0 0 auto;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 10, 14, 0.96);
}
.vsr--lobby .vsr__ctrl--mic {
  width: 100%;
}
.vsr__lobby-preview-label {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ecfdf5;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 999px;
  padding: 4px 10px;
}
.vsr__ctrl-mic-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
}
.vsr__mic-meter {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  height: 18px;
}
.vsr__mic-bar {
  width: 5px;
  height: 16px;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.45);
  transform-origin: bottom center;
  transition: transform 80ms linear;
}
.vsr__mic-meter--active .vsr__mic-bar {
  background: #4ade80;
}
.vsr__viewport {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  gap: 0.35rem;
}
.vsr__viewport--split .vsr__stage {
  flex: 1 1 0;
  min-height: 0;
}
.vsr__sr-only,
.vsr__publisher-host {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.vsr__cam-off-panel {
  flex: 0 0 auto;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.45rem 0.55rem;
}
.vsr__cam-off-panel-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: stretch;
}
.vsr__cam-off-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: min(100%, 220px);
  flex: 1 1 180px;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  background: linear-gradient(160deg, #243044 0%, #151a24 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
}
.vsr__cam-off-chip--speaking {
  border-color: rgba(52, 211, 153, 0.75);
  box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.35), 0 0 18px rgba(52, 211, 153, 0.18);
}
.vsr__cam-off-chip--muted {
  border-color: rgba(248, 113, 113, 0.8);
  box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.35), 0 0 14px rgba(239, 68, 68, 0.15);
}
.vsr__cam-off-muted {
  font-size: 0.72rem;
  font-weight: 800;
  color: #fecaca;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.vsr__cam-off-media {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
.vsr__cam-off-avatar {
  flex-shrink: 0;
}
.vsr__cam-off-avatar-img,
.vsr__cam-off-avatar-initials {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.28);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.95rem;
  background: rgba(30, 64, 120, 0.55);
  color: #f8fafc;
}
.vsr__cam-off-meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  flex: 1;
}
.vsr__cam-off-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vsr__cam-off-speaking {
  font-size: 0.72rem;
  font-weight: 700;
  color: #6ee7b7;
  letter-spacing: 0.02em;
}
.vsr__cam-off-hand {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 1rem;
  background: rgba(234, 179, 8, 0.94);
  border: 2px solid rgba(255, 255, 255, 0.85);
}
.vsr__cam-off-mic-off {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(185, 28, 28, 0.94);
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
.vsr__cam-off-mute {
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  border-radius: 999px;
  padding: 0.12rem 0.45rem;
  font-size: 0.62rem;
  font-weight: 700;
  cursor: pointer;
}
.vsr__cam-off-mute:hover {
  background: rgba(185, 28, 28, 0.85);
}
.vsr__stage {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.35rem;
  flex: 1 1 0;
  min-height: 0;
  height: auto;
  padding: 0.35rem;
  overflow: hidden;
}
.vsr__stage--strip {
  grid-template-columns: 1fr 1fr;
  min-height: 100px;
  height: auto;
  flex: 0 0 auto;
}
.vsr__tile {
  position: relative;
  background: #1c2230;
  border-radius: 8px;
  overflow: hidden;
  min-height: 100px;
}
.vsr__stage--screen {
  grid-template-columns: 1fr;
  grid-template-rows: minmax(220px, 1fr) auto;
  min-height: 320px;
}
.vsr__tile--screen {
  min-height: 220px;
  background: #0b0e14;
}
.vsr__tile--pip {
  position: absolute !important;
  width: 22%;
  max-width: 140px;
  min-height: 80px;
  z-index: 3;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.vsr__tile--remote.vsr__tile--pip {
  left: 0.75rem;
  bottom: 0.75rem;
  right: auto;
}
.vsr__tile--cam-off {
  background: linear-gradient(160deg, #243044 0%, #151a24 100%);
}
.vsr__avatar {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 1;
  pointer-events: none;
}
.vsr__avatar-img,
.vsr__avatar-initials {
  width: min(62%, 220px);
  height: min(62%, 220px);
  aspect-ratio: 1;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
}
.vsr__avatar-initials {
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: clamp(1.5rem, 6vw, 3rem);
  letter-spacing: 0.02em;
  background: rgba(30, 64, 120, 0.55);
  color: #f8fafc;
}
.vsr__mic-badge {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 4;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(185, 28, 28, 0.96);
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.92);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.42);
}
.vsr__mic-badge-icon {
  width: 1.15rem;
  height: 1.15rem;
}
.vsr__tile--muted {
  outline: 2px solid rgba(248, 113, 113, 0.75);
  outline-offset: -2px;
}
.vsr__muted-pill {
  position: absolute;
  bottom: 2.1rem;
  right: 0.45rem;
  z-index: 5;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #fff;
  background: rgba(185, 28, 28, 0.92);
  border: 1px solid rgba(254, 202, 202, 0.65);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
.vsr__muted-pill--chip {
  position: static;
  bottom: auto;
  right: auto;
}
.vsr__automute-modal {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(7, 10, 16, 0.72);
}
.vsr__automute-card {
  width: min(100%, 360px);
  padding: 18px 18px 14px;
  border-radius: 14px;
  background: #121722;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #e2e8f0;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
  text-align: center;
}
.vsr__automute-card h3 {
  margin: 0 0 8px;
  font-size: 1.05rem;
  font-weight: 800;
  color: #fff;
}
.vsr__automute-card p {
  margin: 0 0 14px;
  font-size: 0.9rem;
  line-height: 1.4;
  color: #cbd5e1;
}
.vsr__automute-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.vsr__ctrl--primary {
  background: #059669 !important;
  border-color: #047857 !important;
  color: #fff !important;
}
.vsr__muted-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  margin: 0 0.35rem;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  background: rgba(127, 29, 29, 0.92);
  border: 1px solid rgba(248, 113, 113, 0.55);
  color: #fecaca;
  font-size: 0.84rem;
  font-weight: 700;
  flex-shrink: 0;
}
.vsr__muted-banner-icon {
  display: grid;
  place-items: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  flex-shrink: 0;
}
.vsr__muted-banner-text {
  line-height: 1.25;
}
.vsr__mic-hint {
  margin: 0 0.35rem;
  padding: 0.45rem 0.7rem;
  border-radius: 10px;
  background: rgba(120, 53, 15, 0.92);
  border: 1px solid rgba(251, 191, 36, 0.55);
  color: #fef3c7;
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.3;
  flex-shrink: 0;
}
.vsr__connection-hint {
  margin: 0 0.35rem;
  padding: 0.45rem 0.7rem;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: #e2e8f0;
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.3;
  text-align: center;
  flex-shrink: 0;
}
.vsr__hand-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 4;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 1.35rem;
  line-height: 1;
  background: rgba(234, 179, 8, 0.94);
  color: #422006;
  border: 2px solid rgba(255, 255, 255, 0.92);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.42);
  animation: vsr-hand-pulse 1.8s ease-in-out infinite;
}
@keyframes vsr-hand-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 3px 12px rgba(0, 0, 0, 0.42); }
  50% { transform: scale(1.06); box-shadow: 0 4px 16px rgba(234, 179, 8, 0.55); }
}
.vsr__tile--hand {
  outline: 2px solid rgba(234, 179, 8, 0.65);
  outline-offset: -2px;
}
.vsr__mute-other {
  position: absolute;
  bottom: 2.1rem;
  right: 0.45rem;
  z-index: 5;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
  font-size: 0.65rem;
  font-weight: 700;
  cursor: pointer;
}
.vsr__mute-other:hover {
  background: rgba(185, 28, 28, 0.85);
}
.vsr__share-grant {
  position: absolute;
  bottom: 3.6rem;
  right: 0.45rem;
  z-index: 5;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(15, 76, 129, 0.75);
  color: #fff;
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
  font-size: 0.62rem;
  font-weight: 700;
  cursor: pointer;
  max-width: 6.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vsr__share-grant:hover {
  background: rgba(29, 78, 216, 0.9);
}
.vsr__share-grant--on {
  background: rgba(4, 120, 87, 0.85);
}
.vsr__reactions {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 8;
  overflow: hidden;
}
.vsr__float-rx {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  animation-name: vsr-float-rx;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}
.vsr__float-rx-emoji {
  font-size: 2rem;
  line-height: 1;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35));
}
.vsr__float-rx-name {
  font-size: 0.72rem;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
  white-space: nowrap;
}
@keyframes vsr-float-rx {
  0% { transform: translateY(0) scale(0.85); opacity: 0; }
  12% { opacity: 1; transform: translateY(-12px) scale(1); }
  100% { transform: translateY(-140px) translateX(24px) scale(1.05); opacity: 0; }
}
.vsr__react-group {
  display: inline-flex;
  gap: 0.15rem;
  align-items: center;
}
.vsr__react-btn {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 0.2rem 0.3rem;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
.vsr__react-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}
.vsr__ctrl--active {
  background: rgba(234, 179, 8, 0.35) !important;
  border-color: rgba(234, 179, 8, 0.55) !important;
}
.vsr__voice-iso--on {
  border-color: rgba(34, 197, 94, 0.55);
  color: #bbf7d0;
}
.vsr__tile--local {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  width: 28%;
  max-width: 160px;
  min-height: 90px;
  z-index: 2;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
.vsr__stage--solo {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  flex: 1 1 0;
  min-height: 0 !important;
  height: auto;
}
.vsr__stage--duo {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr;
  flex: 1 1 0;
  min-height: 0 !important;
  height: auto;
  align-items: stretch;
}
.vsr__stage--grid {
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: minmax(120px, 1fr);
  flex: 1 1 0;
  min-height: 0 !important;
  height: auto;
  align-items: stretch;
}
.vsr__stage--grid.vsr__stage--count-3,
.vsr__stage--grid.vsr__stage--count-4,
.vsr__stage--grid.vsr__stage--count-5,
.vsr__stage--grid.vsr__stage--count-6 {
  grid-template-columns: 1fr 1fr;
}
.vsr__media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
}
.vsr__stage--solo .vsr__tile--local,
.vsr__stage--solo .vsr__tile--remote,
.vsr__tile--solo,
.vsr__stage--duo .vsr__tile--local,
.vsr__tile--duo,
.vsr__stage--grid .vsr__tile--local,
.vsr__tile--grid-local {
  position: relative !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  top: auto !important;
  width: 100% !important;
  max-width: none !important;
  min-height: 120px !important;
  height: 100% !important;
  box-shadow: none !important;
  z-index: 1;
}
.vsr__stage--duo .vsr__tile--remote,
.vsr__stage--grid .vsr__tile--remote {
  position: relative !important;
  min-height: 120px !important;
  height: 100% !important;
  width: 100% !important;
}
.vsr__stage--grid .vsr__tile--empty {
  display: none;
}
.vsr__stage--focus-local,
.vsr__stage--focus-remote,
.vsr__stage--focus-speaker {
  grid-template-columns: 1fr;
  min-height: min(48vh, 420px);
}
.vsr__stage--focus-local .vsr__tile--local.vsr__tile--featured,
.vsr__stage--focus-remote .vsr__tile--remote.vsr__tile--featured,
.vsr__stage--focus-speaker .vsr__tile--remote.vsr__tile--featured,
.vsr__stage--focus-speaker .vsr__tile--local.vsr__tile--featured {
  position: relative !important;
  inset: auto !important;
  width: 100% !important;
  max-width: none !important;
  min-height: min(42vh, 380px);
  height: 100%;
  box-shadow: none !important;
  grid-area: 1 / 1;
}
.vsr__stage--focus-local .vsr__tile--remote.vsr__tile--pip,
.vsr__stage--focus-remote .vsr__tile--local.vsr__tile--pip,
.vsr__stage--focus-speaker .vsr__tile--local.vsr__tile--pip,
.vsr__stage--focus-speaker .vsr__tile--remote.vsr__tile--pip {
  position: absolute !important;
  right: 0.75rem;
  bottom: 0.75rem;
  left: auto !important;
  top: auto !important;
  width: 26%;
  max-width: 180px;
  min-height: 96px;
  z-index: 4;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.vsr__stage--focus-speaker .vsr__tile--remote.vsr__tile--pip:nth-last-of-type(2) {
  right: calc(0.75rem + min(26%, 180px) + 0.45rem);
}
.vsr--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: #070a10;
  border-radius: 0;
  max-height: none;
  height: 100dvh;
  width: 100vw;
}
.vsr--fullscreen .vsr__viewport {
  flex: 1 1 auto;
  min-height: 0;
}
.vsr--fullscreen .vsr__stage {
  min-height: 0;
  height: 100%;
}
.vsr--fullscreen .vsr__stage--focus-local .vsr__tile--local.vsr__tile--featured,
.vsr--fullscreen .vsr__stage--focus-remote .vsr__tile--remote.vsr__tile--featured,
.vsr--fullscreen .vsr__stage--focus-speaker .vsr__tile--remote.vsr__tile--featured,
.vsr--fullscreen .vsr__stage--solo .vsr__tile,
.vsr--fullscreen .vsr__stage--duo .vsr__tile,
.vsr--fullscreen .vsr__stage--grid .vsr__tile {
  min-height: min(70dvh, 720px);
}
.vsr__layout-wrap {
  position: relative;
}
.vsr__layout-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 40;
  min-width: 200px;
  background: #111827;
  border: 1px solid #334155;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.vsr__layout-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  color: #e2e8f0;
  text-align: left;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.vsr__layout-item:hover,
.vsr__layout-item.on {
  background: #1e293b;
}
.vsr__layout-check {
  color: #6ee7b7;
  font-weight: 800;
}
.vsr__fs-chrome {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 50;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
  pointer-events: none;
}
.vsr__fs-exit,
.vsr__fs-hand,
.vsr__fs-notice {
  pointer-events: auto;
  border: 0;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 0.8rem;
  font-weight: 700;
}
.vsr__fs-exit {
  background: rgba(15, 23, 42, 0.85);
  color: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.45);
  cursor: pointer;
}
.vsr__fs-hand {
  background: rgba(245, 158, 11, 0.92);
  color: #422006;
}
.vsr__fs-notice {
  margin-left: auto;
  background: rgba(37, 99, 235, 0.95);
  color: #eff6ff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  max-width: min(70vw, 280px);
  text-align: left;
}
.vsr__fs-notice-hint {
  font-size: 0.68rem;
  font-weight: 600;
  opacity: 0.9;
}
.vsr__stage--focus-collapsed {
  grid-template-columns: 1fr 1fr;
  min-height: 88px;
  max-height: 110px;
}
.vsr__stage--focus-collapsed .vsr__tile,
.vsr__tile--mini {
  min-height: 72px !important;
  height: 88px;
  cursor: pointer;
}
.vsr__focus-btn {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  z-index: 5;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}
.vsr__focus-btn:hover {
  background: rgba(0, 0, 0, 0.75);
}
.vsr--hide-controls .vsr__controls {
  display: none;
}
.vsr__tile :deep(.OT_root),
.vsr__tile :deep(.OT_publisher),
.vsr__tile :deep(.OT_subscriber),
.vsr__tile :deep(.OT_widget-container) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
}
.vsr__tile :deep(video) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  background: #0b0e14;
}
.vsr__stage--strip .vsr__tile :deep(video) {
  object-fit: contain !important;
}
.vsr__stage--strip .vsr__tile--local {
  position: relative;
  right: auto;
  bottom: auto;
  width: auto;
  max-width: none;
  min-height: 90px;
  box-shadow: none;
}
.vsr__tile--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.vsr__waiting {
  color: #c5cddc;
  font-size: 0.9rem;
  padding: 1rem;
  text-align: center;
}
.vsr__label {
  position: absolute;
  left: 0.4rem;
  bottom: 0.35rem;
  font-size: 0.7rem;
  background: rgba(0, 0, 0, 0.55);
  color: #f8fafc;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  z-index: 3;
  max-width: calc(100% - 0.8rem);
}
.vsr__label--with-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0.2rem 0.45rem;
}
.vsr__label-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.vsr__label-status {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  line-height: 1;
}
.vsr__label-status--muted {
  color: #fecaca;
}
.vsr__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.65rem 0.65rem;
  background: #0e1118;
  position: relative;
  z-index: 30;
  flex: 0 0 auto;
  isolation: isolate;
}
.vsr__voice-iso {
  margin-left: 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  border-radius: 999px;
  padding: 0.35rem 0.65rem;
  border: 1px solid #475569;
  color: #cbd5e1;
  background: #1e293b;
  white-space: nowrap;
}
.vsr__voice-iso--on {
  border-color: #34d399;
  color: #a7f3d0;
  background: rgba(6, 95, 70, 0.45);
}
.vsr__voice-iso--off {
  border-color: #f59e0b;
  color: #fde68a;
  background: rgba(120, 53, 15, 0.4);
}
.vsr__ctrl,
.vsr__btn {
  border: 1px solid #3d4b63;
  background: #243044;
  color: #f8fafc;
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  min-height: 44px;
  font-size: 0.85rem;
  cursor: pointer;
}
.vsr__ctrl[aria-pressed='true'],
.vsr__ctrl--danger {
  background: #b91c1c !important;
  border-color: #f87171 !important;
  color: #fff !important;
  font-weight: 700;
}
.vsr__ctrl--mic-muted {
  box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.45), 0 4px 14px rgba(185, 28, 28, 0.35);
  animation: vsr-mic-muted-pulse 2s ease-in-out infinite;
}
.vsr__ctrl--static {
  cursor: default;
  animation: none;
  opacity: 0.92;
}
@keyframes vsr-mic-muted-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.45), 0 4px 14px rgba(185, 28, 28, 0.35); }
  50% { box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.65), 0 4px 18px rgba(185, 28, 28, 0.5); }
}
.vsr__tile--parked {
  /* Keep a real layout box so OT can attach; visually parked until someone joins. */
  position: absolute !important;
  width: 8px !important;
  height: 8px !important;
  min-height: 8px !important;
  opacity: 0.01;
  pointer-events: none;
  overflow: hidden;
  right: 0;
  bottom: 0;
  z-index: 0;
}
.vsr__btn--ghost {
  background: transparent;
}
.vsr__btn--primary {
  background: #3b82f6;
  border-color: #60a5fa;
  color: #fff;
  font-weight: 600;
}
.vsr__connecting,
.vsr__error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.5rem;
  text-align: center;
  min-height: 180px;
}
.vsr__connecting {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(12, 16, 24, 0.94);
}
.vsr__error {
  background: #1a2333;
  color: #f8fafc;
  border: 1px solid #3d4b63;
  margin: 0.35rem;
  border-radius: 8px;
}
.vsr__error-title {
  margin: 0;
  color: #fff;
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.45;
  max-width: 36rem;
}
.vsr__hints {
  margin: 0;
  padding: 0.65rem 0.85rem 0.65rem 1.4rem;
  text-align: left;
  color: #e2e8f0;
  background: #0f172a;
  border-radius: 8px;
  border: 1px solid #334155;
  font-size: 0.82rem;
  line-height: 1.45;
  max-width: 36rem;
}
.vsr__hints li + li {
  margin-top: 0.35rem;
}
.vsr__error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.vsr__pulse {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid #4a7cff;
  border-top-color: transparent;
  animation: vsr-spin 0.9s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .vsr__pulse {
    animation: none;
    border-top-color: #4a7cff;
    opacity: 0.7;
  }
}
@keyframes vsr-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
