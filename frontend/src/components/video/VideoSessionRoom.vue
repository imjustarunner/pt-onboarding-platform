<template>
  <div
    class="vsr"
    :class="{
      'vsr--compact': compact,
      'vsr--strip': layout === 'strip',
      'vsr--hide-controls': hideControls,
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

    <div v-else-if="connecting" class="vsr__connecting">
      <div class="vsr__pulse" aria-hidden="true" />
      <p>Connecting to your session…</p>
      <button type="button" class="vsr__btn vsr__btn--ghost" @click="disconnect">Cancel</button>
    </div>

    <template v-else>
      <div
        class="vsr__stage"
        :class="{
          'vsr__stage--strip': layout === 'strip',
          'vsr__stage--solo': isSoloStage && !hasScreenShare,
          'vsr__stage--duo': isDuoStage && !hasScreenShare,
          'vsr__stage--grid': isGridStage && !hasScreenShare,
          'vsr__stage--screen': hasScreenShare,
          'vsr__stage--focus-local': tileFocus === 'local' && !hasScreenShare,
          'vsr__stage--focus-remote': tileFocus === 'remote' && !hasScreenShare,
          'vsr__stage--focus-collapsed': tileFocus === 'collapsed' && !hasScreenShare,
          [`vsr__stage--count-${Math.min(remotes.length + (hideSelfView ? 0 : 1), 6)}`]: layout !== 'strip' && !hasScreenShare && hasRemote
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
          v-for="r in remotes"
          :key="r.streamId"
          class="vsr__tile vsr__tile--remote"
          :class="{
            'vsr__tile--cam-off': !r.hasVideo,
            'vsr__tile--muted': !r.hasAudio,
            'vsr__tile--hand': !!handByConnection[r.connectionId],
            'vsr__tile--pip': hasScreenShare || tileFocus === 'local',
            'vsr__tile--featured': tileFocus === 'remote' && remotes.length === 1,
            'vsr__tile--mini': tileFocus === 'collapsed'
          }"
          @click="onTileActivate('remote')"
        >
          <div
            class="vsr__media"
            :ref="(el) => setRemoteMediaEl(r.streamId, el)"
          />
          <div v-if="!r.hasVideo" class="vsr__avatar" aria-hidden="true">
            <img v-if="r.profilePhotoUrl" :src="r.profilePhotoUrl" alt="" class="vsr__avatar-img" />
            <span v-else class="vsr__avatar-initials">{{ initialsFromLabel(r.name) }}</span>
          </div>
          <span v-if="!r.hasAudio" class="vsr__mic-badge" title="Microphone off" aria-label="Microphone off">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" stroke="currentColor" stroke-width="2"/>
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <span v-if="handByConnection[r.connectionId]" class="vsr__hand-badge" title="Hand raised" aria-label="Hand raised">✋</span>
          <span class="vsr__label">
            {{ r.name }}
            <span v-if="handByConnection[r.connectionId]" class="vsr__hand-inline">✋</span>
          </span>
          <button
            v-if="canMuteOthers && r.connectionId"
            type="button"
            class="vsr__mute-other"
            title="Mute this participant"
            @click.stop="forceMuteRemote(r)"
          >
            Mute
          </button>
        </div>

        <div
          v-if="!hasRemote && !hasScreenShare"
          class="vsr__tile vsr__tile--remote vsr__tile--empty"
        >
          <span class="vsr__waiting">Waiting for others to join…</span>
        </div>

        <div
          v-show="!hideSelfView"
          class="vsr__tile vsr__tile--local"
          :class="{
            'vsr__tile--muted': !publishAudio,
            'vsr__tile--cam-off': !publishVideo,
            'vsr__tile--hand': localHandRaised,
            'vsr__tile--solo': isSoloStage && !hasScreenShare && tileFocus === 'equal',
            'vsr__tile--duo': isDuoStage && !hasScreenShare && tileFocus === 'equal',
            'vsr__tile--grid-local': isGridStage && !hasScreenShare && tileFocus === 'equal',
            'vsr__tile--pip': hasScreenShare || tileFocus === 'remote',
            'vsr__tile--featured': tileFocus === 'local',
            'vsr__tile--mini': tileFocus === 'collapsed'
          }"
          @click="onTileActivate('local')"
        >
          <div ref="localMediaEl" class="vsr__media" />
          <div v-if="!publishVideo" class="vsr__avatar" aria-hidden="true">
            <img v-if="localProfilePhotoUrl" :src="localProfilePhotoUrl" alt="" class="vsr__avatar-img" />
            <span v-else class="vsr__avatar-initials">{{ localInitials }}</span>
          </div>
          <span v-if="!publishAudio" class="vsr__mic-badge" title="Microphone off" aria-label="Microphone off">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" stroke="currentColor" stroke-width="2"/>
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <span v-if="localHandRaised" class="vsr__hand-badge" title="Hand raised" aria-label="Hand raised">✋</span>
          <span class="vsr__label">
            {{ localName || 'You' }}
            <span v-if="localHandRaised" class="vsr__hand-inline">✋</span>
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

      <div v-if="!hideControls" class="vsr__controls" role="toolbar" aria-label="Session media controls">
        <button
          type="button"
          class="vsr__ctrl"
          :class="{ 'vsr__ctrl--danger': !publishAudio }"
          :aria-pressed="!publishAudio"
          :title="publishAudio ? 'Mute microphone' : 'Unmute microphone'"
          @click.stop.prevent="toggleMic"
        >
          {{ publishAudio ? 'Mic' : 'Muted' }}
        </button>
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
          type="button"
          class="vsr__ctrl"
          :aria-pressed="hideSelfView"
          title="Hide self-view without turning off camera"
          @click="hideSelfView = !hideSelfView"
        >
          {{ hideSelfView ? 'Show me' : 'Hide me' }}
        </button>
        <button
          type="button"
          class="vsr__ctrl"
          :aria-pressed="sharingScreen"
          :disabled="!sessionReady"
          :title="sharingScreen ? 'Stop sharing your screen' : 'Share your screen'"
          @click="toggleScreenShare"
        >
          {{ sharingScreen ? 'Stop share' : 'Share screen' }}
        </button>
        <span
          v-if="voiceIsolationStatus"
          class="vsr__voice-iso"
          :class="{
            'vsr__voice-iso--on': voiceIsolationStatus === 'on' || voiceIsolationStatus === 'processing',
            'vsr__voice-iso--off': voiceIsolationStatus === 'unavailable'
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
        <button
          v-if="allowTileFocus || showLayoutControls"
          type="button"
          class="vsr__ctrl"
          title="Cycle video layout"
          @click="cycleLayoutFocus"
        >
          Layout
        </button>
        <slot name="extra-controls" />
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
  /** equal | local | remote | collapsed — parent-driven expandable tiles */
  tileFocus: { type: String, default: 'equal' },
  /** Hide built-in control bar when parent renders its own dock */
  hideControls: { type: Boolean, default: false },
  /** Show Expand/Shrink controls on tiles */
  allowTileFocus: { type: Boolean, default: false },
  /** Show Layout cycle button in controls */
  showLayoutControls: { type: Boolean, default: false },
  /** Who may force-mute others: 'everyone' | 'host' | 'none' */
  muteOthersMode: { type: String, default: 'host' },
  /** Local user is host or co-host (for mute-others when mode is host) */
  isHostOrCohost: { type: Boolean, default: false },
  /** Play a short tone when someone else joins */
  playJoinTone: { type: Boolean, default: true },
  /** Connection id / identity used for raise-hand map keys when known */
  localConnectionKey: { type: String, default: '' }
});

const emit = defineEmits([
  'connected',
  'disconnected',
  'error',
  'stream-created',
  'stream-destroyed',
  'request-recreate-room',
  'update:tileFocus',
  'meeting-ended',
  'hand-raised-change',
  'hands-map-change',
  'reaction',
  'transcript-control'
]);

const localMediaEl = ref(null);
const screenEl = ref(null);
const connecting = ref(false);
const errorMessage = ref('');
const errorMeta = ref(null);
const publishAudio = ref(true);
const publishVideo = ref(true);
const hideSelfView = ref(false);
/** on | processing | unavailable | unsupported */
const voiceIsolationStatus = ref('');
let ownedAudioTrack = null;
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
/** @type {import('vue').Ref<Array<{ id: string, emoji: string, displayName: string, left: string, top: string, duration: string }>>} */
const floatingReactions = ref([]);
const reactionEmojis = ['👍', '❤️', '🎉', '👏', '💡'];
let joinToneCtx = null;
let reactionSeq = 0;

const hasRemote = computed(() => remotes.value.length > 0);
const canMuteOthers = computed(() => {
  const mode = String(props.muteOthersMode || 'host').toLowerCase();
  if (mode === 'everyone') return true;
  if (mode === 'none') return false;
  return !!props.isHostOrCohost;
});

const voiceIsolationLabel = computed(() => {
  if (voiceIsolationStatus.value === 'on') return 'Voice isolation on';
  if (voiceIsolationStatus.value === 'processing') return 'Mic processing on';
  if (voiceIsolationStatus.value === 'unavailable') return 'Voice isolation off';
  if (voiceIsolationStatus.value === 'unsupported') return 'Voice isolation N/A';
  return '';
});
const voiceIsolationTitle = computed(() => {
  if (voiceIsolationStatus.value === 'on') {
    return 'Browser voice isolation is applied to your published microphone';
  }
  if (voiceIsolationStatus.value === 'processing') {
    return 'Noise suppression / echo cancellation is active on your mic. Chrome Mic Mode voice isolation may also be on at the OS level.';
  }
  if (voiceIsolationStatus.value === 'unavailable') {
    return 'Could not enable mic processing on this device';
  }
  if (voiceIsolationStatus.value === 'unsupported') {
    return 'This browser does not expose a voiceIsolation constraint; echo cancellation and noise suppression are still requested';
  }
  return '';
});

async function acquireIsolatedAudioTrack() {
  if (!navigator?.mediaDevices?.getUserMedia) {
    voiceIsolationStatus.value = 'unsupported';
    return null;
  }
  const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
  const wantsVoiceIsolation = !!supported.voiceIsolation;
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };
  if (wantsVoiceIsolation) audio.voiceIsolation = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    const track = stream.getAudioTracks()?.[0] || null;
    if (!track) {
      voiceIsolationStatus.value = 'unavailable';
      return null;
    }
    for (const t of stream.getTracks()) {
      if (t !== track) t.stop();
    }
    const settings = typeof track.getSettings === 'function' ? (track.getSettings() || {}) : {};
    const nsOn = settings.noiseSuppression !== false;
    const viOn = settings.voiceIsolation === true;
    if (viOn) {
      voiceIsolationStatus.value = 'on';
    } else if (nsOn) {
      // Chrome Mic Mode / OS VI often won't show in getSettings().voiceIsolation.
      voiceIsolationStatus.value = wantsVoiceIsolation ? 'processing' : 'processing';
    } else {
      voiceIsolationStatus.value = 'unavailable';
    }
    ownedAudioTrack = track;
    return track;
  } catch (e) {
    console.warn('[VideoSessionRoom] isolated mic capture failed; using default publisher audio', e?.message || e);
    voiceIsolationStatus.value = 'unavailable';
    return null;
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

function localConnectionId() {
  try {
    return String(session?.connection?.connectionId || props.localConnectionKey || '').trim();
  } catch {
    return String(props.localConnectionKey || '').trim();
  }
}

function sendSessionSignal(type, data, toConnection = null) {
  if (!session || !sessionReady.value) return false;
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

function setHandState(connectionId, raised) {
  const id = String(connectionId || '').trim();
  if (!id) return;
  const next = { ...handByConnection.value };
  if (raised) next[id] = true;
  else delete next[id];
  handByConnection.value = next;
  emit('hands-map-change', { ...next });
}

function toggleRaiseHand() {
  const next = !localHandRaised.value;
  localHandRaised.value = next;
  const connId = localConnectionId();
  if (connId) setHandState(connId, next);
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
  sendSessionSignal('force_mute', {
    targetConnectionId: remote.connectionId,
    byName: props.localName || 'Someone'
  });
}

function cycleLayoutFocus() {
  const order = ['equal', 'local', 'remote', 'collapsed'];
  const idx = order.indexOf(props.tileFocus);
  const next = order[(idx + 1) % order.length];
  emit('update:tileFocus', next);
}

function applyForceMuteLocal() {
  if (!publishAudio.value) return;
  publishAudio.value = false;
  try {
    publisher?.publishAudio?.(false);
  } catch { /* ignore */ }
}

function releaseOwnedAudioTrack() {
  try {
    ownedAudioTrack?.stop?.();
  } catch { /* ignore */ }
  ownedAudioTrack = null;
}

const visibleLocal = computed(() => !hideSelfView.value);
const visibleTileCount = computed(() => remotes.value.length + (visibleLocal.value ? 1 : 0));
const isSoloStage = computed(() =>
  props.layout !== 'strip'
  && props.tileFocus === 'equal'
  && visibleTileCount.value === 1
  && (hasRemote.value || props.promoteLocalWhenAlone)
);
const isDuoStage = computed(() =>
  props.equalTilesWhenRemote
  && props.layout !== 'strip'
  && props.tileFocus === 'equal'
  && visibleTileCount.value === 2
);
const isGridStage = computed(() =>
  props.equalTilesWhenRemote
  && props.layout !== 'strip'
  && props.tileFocus === 'equal'
  && visibleTileCount.value >= 3
);

function setRemoteMediaEl(streamId, el) {
  const id = String(streamId || '');
  if (!id) return;
  if (el) remoteMediaEls.set(id, el);
  else remoteMediaEls.delete(id);
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
    connectionId: String(stream?.connection?.connectionId || '').trim(),
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
  }
  await nextTick();
  await new Promise((r) => requestAnimationFrame(() => r()));

  let targetEl = remoteMediaEls.get(streamId);
  if (!targetEl) {
    await nextTick();
    targetEl = remoteMediaEls.get(streamId);
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
  sub.on?.('videoEnabled', () => {
    remotes.value = remotes.value.map((r) => (
      r.streamId === streamId ? { ...r, hasVideo: true } : r
    ));
  });
  sub.on?.('videoDisabled', () => {
    remotes.value = remotes.value.map((r) => (
      r.streamId === streamId ? { ...r, hasVideo: false } : r
    ));
  });
  sub.on?.('audioEnabled', () => {
    remotes.value = remotes.value.map((r) => (
      r.streamId === streamId ? { ...r, hasAudio: true } : r
    ));
  });
  sub.on?.('audioDisabled', () => {
    remotes.value = remotes.value.map((r) => (
      r.streamId === streamId ? { ...r, hasAudio: false } : r
    ));
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
    disconnect(false);
    // Vonage Video JWT tokens: first arg must be Application ID (not account API key).
    session = OT.initSession(projectId, props.sessionId);

    session.on('streamCreated', (event) => {
      void subscribeToStream(event.stream).then(() => emit('stream-created', event));
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
      setHandState(connId, raised);
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

    session.on('signal:force_mute', (event) => {
      let payload = {};
      try { payload = event?.data ? JSON.parse(event.data) : {}; } catch { /* ignore */ }
      const target = String(payload.targetConnectionId || '').trim();
      const me = localConnectionId();
      if (target && me && target === me) applyForceMuteLocal();
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
    if (localMediaEl.value) localMediaEl.value.innerHTML = '';
    releaseOwnedAudioTrack();
    const audioTrack = await acquireIsolatedAudioTrack();
    const publisherOpts = {
      insertMode: 'append',
      width: '100%',
      height: '100%',
      fitMode: 'cover',
      publishAudio: publishAudio.value,
      publishVideo: publishVideo.value,
      name: props.localName,
      mirror: true,
      style: { buttonDisplayMode: 'off', nameDisplayMode: 'off' }
    };
    // Prefer an explicit mic track so voiceIsolation / noiseSuppression actually apply.
    // Chrome's PiP "Mic Mode" UI is not enough — OT must publish that constrained track.
    if (audioTrack) publisherOpts.audioSource = audioTrack;
    publisher = OT.initPublisher(
      localMediaEl.value,
      publisherOpts,
      (err) => {
        if (err) console.error('[VideoSessionRoom] publisher error', err);
        else forceMediaFill(localMediaEl.value);
      }
    );

    await new Promise((resolve, reject) => {
      session.publish(publisher, (err) => (err ? reject(err) : resolve()));
    });

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
    if (localMediaEl.value) localMediaEl.value.innerHTML = '';
    clearRemote();
    releaseOwnedAudioTrack();
    voiceIsolationStatus.value = '';
  } finally {
    connecting.value = false;
    if (emitEvent) emit('disconnected');
  }
}

function toggleMic() {
  const next = !publishAudio.value;
  publishAudio.value = next;
  if (!publisher) {
    console.warn('[VideoSessionRoom] mic toggled before publisher ready');
    return;
  }
  try {
    publisher.publishAudio(next);
  } catch (e) {
    console.error('[VideoSessionRoom] publishAudio failed', e);
    publishAudio.value = !next;
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
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(185, 28, 28, 0.9);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.vsr__hand-badge {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  z-index: 4;
  font-size: 1.25rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
}
.vsr__hand-inline {
  margin-left: 0.25rem;
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
.vsr__stage--focus-remote {
  grid-template-columns: 1fr;
  min-height: min(48vh, 420px);
}
.vsr__stage--focus-local .vsr__tile--local.vsr__tile--featured,
.vsr__stage--focus-remote .vsr__tile--remote.vsr__tile--featured {
  position: relative !important;
  inset: auto !important;
  width: 100% !important;
  max-width: none !important;
  min-height: min(42vh, 380px);
  height: 100%;
  box-shadow: none !important;
}
.vsr__stage--focus-local .vsr__tile--remote.vsr__tile--pip,
.vsr__stage--focus-remote .vsr__tile--local.vsr__tile--pip {
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
