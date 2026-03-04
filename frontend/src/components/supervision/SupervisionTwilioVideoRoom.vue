<template>
  <div class="twilio-video-room">
    <div class="video-room-header">
      <span class="video-room-title">{{ roomName || 'Video room' }}</span>
      <button type="button" class="btn btn-danger btn-sm" :disabled="disconnecting" @click="disconnect">
        {{ disconnecting ? 'Leaving…' : (room ? 'Leave' : 'Close') }}
      </button>
    </div>
    <div v-if="error" class="video-room-error">{{ error }}</div>
    <div v-else-if="connecting" class="video-room-placeholder">Connecting…</div>
    <div v-else-if="room" class="video-room-content">
      <div v-if="sharedScreenTrack" class="video-room-screenshare">
        <div ref="screenShareEl" class="video-track video-track-screenshare" />
        <span class="participant-identity">{{ sharedScreenIdentity }}</span>
      </div>
      <div class="video-room-grid" :class="gridSizeClass">
        <div class="video-track-wrap video-track-local">
          <div v-if="localVideoTrack && !cameraMuted" ref="localVideoEl" class="video-track" />
          <div v-else class="video-placeholder">
            <BrandingLogo size="small" class="placeholder-logo" />
            <span>You (camera off)</span>
          </div>
          <span class="participant-identity">You</span>
        </div>
        <div
          v-for="p in remoteParticipants"
          :key="p.sid"
          class="video-track-wrap"
        >
          <div ref="(el) => setRemoteVideoEl(p.sid, el)" class="video-track" />
          <span class="participant-identity">{{ p.identity }}</span>
        </div>
        <div v-if="remoteParticipants.length === 0" class="video-track-wrap video-placeholder-wrap">
          <div class="video-placeholder">
            <BrandingLogo size="small" class="placeholder-logo" />
            <span>Waiting for others to join…</span>
          </div>
        </div>
      </div>
      <div class="video-room-controls">
        <button
          type="button"
          class="control-btn"
          :class="{ muted: cameraMuted }"
          :title="cameraMuted ? 'Turn camera on' : 'Turn camera off'"
          @click="toggleCamera"
        >
          <span class="control-icon">📷</span>
          <span>{{ cameraMuted ? 'Camera off' : 'Camera on' }}</span>
        </button>
        <button
          type="button"
          class="control-btn"
          :class="{ muted: micMuted }"
          :title="micMuted ? 'Unmute microphone' : 'Mute microphone'"
          @click="toggleMic"
        >
          <span class="control-icon">{{ micMuted ? '🔇' : '🎤' }}</span>
          <span>{{ micMuted ? 'Mic off' : 'Mic on' }}</span>
        </button>
        <button
          type="button"
          class="control-btn"
          :class="{ active: screenTrack }"
          :title="screenTrack ? 'Stop sharing screen' : 'Share screen'"
          :disabled="!screenShareSupported"
          @click="toggleScreenShare"
        >
          <span class="control-icon">🖥️</span>
          <span>{{ screenTrack ? 'Stop share' : 'Share screen' }}</span>
        </button>
        <button
          v-if="showRecordHostOnlyToggle"
          type="button"
          class="control-btn"
          :class="{ active: recordHostOnly }"
          :title="recordHostOnly ? 'Recording only your screen/audio' : 'Recording all participants'"
          :disabled="recordingRulesLoading"
          @click="toggleRecordHostOnly"
        >
          <span class="control-icon">{{ recordHostOnly ? '📹' : '📽️' }}</span>
          <span>{{ recordingRulesLoading ? 'Updating…' : (recordHostOnly ? 'Host only' : 'Record all') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from 'vue';
import { connect, LocalVideoTrack } from 'twilio-video';
import BrandingLogo from '../BrandingLogo.vue';
import api from '../../services/api';

const props = defineProps({
  token: { type: String, required: true },
  roomName: { type: String, default: '' },
  sessionId: { type: [Number, String], default: null },
  eventId: { type: [Number, String], default: null },
  isHost: { type: Boolean, default: false }
});

const emit = defineEmits(['disconnected']);

const room = ref(null);
const localVideoTrack = ref(null);
const localAudioTrack = ref(null);
const cameraMuted = ref(false);
const micMuted = ref(false);
const remoteParticipants = ref([]);
const connecting = ref(true);
const disconnecting = ref(false);
const error = ref('');
const localVideoEl = ref(null);
const remoteVideoEls = ref({});
const transcriptLines = ref([]);
const screenTrack = ref(null);
const screenShareEl = ref(null);
const sharedScreenTrack = ref(null);
const sharedScreenIdentity = ref('');
const recordHostOnly = ref(false);
const recordingRulesLoading = ref(false);

const screenShareSupported = computed(() =>
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.getDisplayMedia != null
);

const showRecordHostOnlyToggle = computed(() =>
  Boolean(props.eventId && props.isHost)
);

const totalParticipants = computed(() => 1 + remoteParticipants.value.length);
const gridSizeClass = computed(() => {
  const n = totalParticipants.value;
  if (n <= 2) return 'grid-cols-2';
  if (n <= 4) return 'grid-cols-2';
  if (n <= 9) return 'grid-cols-3';
  if (n <= 16) return 'grid-cols-4';
  return 'grid-cols-5';
});

function setRemoteVideoEl(sid, el) {
  if (el) remoteVideoEls.value[sid] = el;
}

function attachTrack(track, container) {
  if (!track || !container) return;
  track.attach(container);
}

function detachTrack(track) {
  if (!track) return;
  try {
    track.detach().forEach((el) => el.remove());
  } catch {
    // ignore
  }
}

async function postTranscriptToBackend(text) {
  if (!text || !String(text).trim()) return;
  const sid = props.sessionId ? Number(props.sessionId) : null;
  const eid = props.eventId ? Number(props.eventId) : null;
  try {
    if (eid) {
      await api.post(`/team-meetings/${eid}/client-transcript`, { transcript: String(text).trim() });
    } else if (sid) {
      await api.post(`/supervision/sessions/${sid}/client-transcript`, { transcript: String(text).trim() });
    }
  } catch (e) {
    console.warn('[SupervisionTwilioVideoRoom] Failed to post transcript:', e?.message);
  }
}

function isValidToken(t) {
  const s = String(t || '').trim();
  return s.length > 50 && !/^(undefined|null)$/i.test(s);
}

async function connectRoom() {
  if (!isValidToken(props.token)) {
    error.value = 'No token provided. The backend may have failed to generate a token. Check the Network tab for GET /api/supervision/sessions/:id/video-token.';
    connecting.value = false;
    return;
  }
  try {
    connecting.value = true;
    error.value = '';
    transcriptLines.value = [];
    const r = await connect(props.token, {
      name: props.roomName,
      audio: true,
      video: true,
      receiveTranscriptions: false
    });
    room.value = r;

    r.on('transcription', (ev) => {
      if (ev?.transcription && ev.partial_results === false) {
        transcriptLines.value = [...transcriptLines.value, ev.transcription];
      }
    });

    r.localParticipant.videoTracks.forEach((pub) => {
      localVideoTrack.value = pub.track;
    });
    r.localParticipant.audioTracks.forEach((pub) => {
      localAudioTrack.value = pub.track;
    });
    r.localParticipant.on('trackSubscribed', (track) => {
      if (track.kind === 'video') localVideoTrack.value = track;
      if (track.kind === 'audio') localAudioTrack.value = track;
    });
    r.localParticipant.on('trackUnsubscribed', (track) => {
      if (track.kind === 'video' && localVideoTrack.value === track) localVideoTrack.value = null;
      if (track.kind === 'audio' && localAudioTrack.value === track) localAudioTrack.value = null;
    });

    const isScreenTrack = (track) =>
      track?.name?.toLowerCase().includes('screen') || track?.mediaStreamTrack?.label?.toLowerCase().includes('screen');

    const addParticipant = (participant) => {
      if (participant.identity === r.localParticipant.identity) return;
      remoteParticipants.value = [
        ...remoteParticipants.value.filter((p) => p.sid !== participant.sid),
        { sid: participant.sid, identity: participant.identity }
      ];
      participant.tracks.forEach((pub) => {
        if (pub.track && pub.kind === 'video') {
          if (isScreenTrack(pub.track)) {
            sharedScreenTrack.value = pub.track;
            sharedScreenIdentity.value = participant.identity;
          } else {
            setTimeout(() => {
              const el = remoteVideoEls.value[participant.sid];
              if (el) attachTrack(pub.track, el);
            }, 100);
          }
        }
      });
      participant.on('trackSubscribed', (track) => {
        if (track.kind === 'video') {
          if (isScreenTrack(track)) {
            sharedScreenTrack.value = track;
            sharedScreenIdentity.value = participant.identity;
          } else {
            setTimeout(() => {
              const el = remoteVideoEls.value[participant.sid];
              if (el) attachTrack(track, el);
            }, 100);
          }
        }
      });
      participant.on('trackUnsubscribed', (track) => {
        if (isScreenTrack(track) && sharedScreenTrack.value === track) {
          sharedScreenTrack.value = null;
          sharedScreenIdentity.value = '';
        }
      });
    };

    r.participants.forEach(addParticipant);
    r.on('participantConnected', addParticipant);
    r.on('participantDisconnected', (participant) => {
      participant.tracks.forEach((pub) => {
        if (isScreenTrack(pub.track) && sharedScreenTrack.value === pub.track) {
          sharedScreenTrack.value = null;
          sharedScreenIdentity.value = '';
        }
        detachTrack(pub.track);
      });
      remoteParticipants.value = remoteParticipants.value.filter((p) => p.sid !== participant.sid);
    });

    r.on('disconnected', async () => {
      if (screenTrack.value) {
        try { screenTrack.value.stop(); } catch { /* ignore */ }
        screenTrack.value = null;
      }
      sharedScreenTrack.value = null;
      sharedScreenIdentity.value = '';
      const text = transcriptLines.value.join('\n').trim();
      if (text && (props.sessionId || props.eventId)) {
        await postTranscriptToBackend(text);
      }
      disconnecting.value = false;
      room.value = null;
      localVideoTrack.value = null;
      localAudioTrack.value = null;
      cameraMuted.value = false;
      micMuted.value = false;
      remoteParticipants.value = [];
      transcriptLines.value = [];
      emit('disconnected');
    });

    connecting.value = false;
  } catch (e) {
    error.value = e?.message || 'Failed to connect';
    connecting.value = false;
  }
}

function toggleCamera() {
  const track = localVideoTrack.value;
  if (!track) return;
  if (cameraMuted.value) {
    track.enable();
    cameraMuted.value = false;
  } else {
    track.disable();
    cameraMuted.value = true;
  }
}

function toggleMic() {
  const track = localAudioTrack.value;
  if (!track) return;
  if (micMuted.value) {
    track.enable();
    micMuted.value = false;
  } else {
    track.disable();
    micMuted.value = true;
  }
}

async function toggleScreenShare() {
  if (!room.value) return;
  if (screenTrack.value) {
    try {
      room.value.localParticipant.unpublishTrack(screenTrack.value);
      screenTrack.value.stop();
    } catch (e) {
      console.warn('[SupervisionTwilioVideoRoom] Stop screen share:', e?.message);
    }
    screenTrack.value = null;
    sharedScreenTrack.value = null;
    sharedScreenIdentity.value = '';
    return;
  }
  try {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      error.value = 'Screen sharing is not supported in this browser';
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('No video track from screen');
    const localScreenTrack = new LocalVideoTrack(track);
    screenTrack.value = localScreenTrack;
    sharedScreenTrack.value = localScreenTrack;
    sharedScreenIdentity.value = 'You';
    await room.value.localParticipant.publishTrack(localScreenTrack);
    track.onended = () => toggleScreenShare();
  } catch (e) {
    if (e?.name !== 'NotAllowedError') {
      error.value = e?.message || 'Failed to share screen';
    }
  }
}

async function toggleRecordHostOnly() {
  const eid = props.eventId ? Number(props.eventId) : null;
  if (!eid || !props.isHost) return;
  recordingRulesLoading.value = true;
  try {
    const next = !recordHostOnly.value;
    await api.post(`/team-meetings/${eid}/recording-rules`, { recordHostOnly: next });
    recordHostOnly.value = next;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update recording rules';
  } finally {
    recordingRulesLoading.value = false;
  }
}

function disconnect() {
  if (disconnecting.value) return;
  if (room.value) {
    disconnecting.value = true;
    room.value.disconnect();
    // Room 'disconnected' handler will POST transcript, clear state, and emit
  } else {
    // Not connected (e.g. error state) – emit so parent can close modal
    emit('disconnected');
  }
}

watch(
  () => [props.token, props.roomName],
  () => {
    if (props.token && props.roomName) connectRoom();
  },
  { immediate: true }
);

watch(localVideoTrack, (track, prev) => {
  if (prev) detachTrack(prev);
  if (track && localVideoEl.value && !cameraMuted.value) attachTrack(track, localVideoEl.value);
}, { flush: 'post' });

watch(cameraMuted, (muted) => {
  const track = localVideoTrack.value;
  const el = localVideoEl.value;
  if (!track || !el) return;
  if (muted) detachTrack(track);
  else attachTrack(track, el);
}, { flush: 'post' });

watch([sharedScreenTrack, screenShareEl], ([track, el], [prevTrack]) => {
  if (prevTrack && prevTrack !== track) detachTrack(prevTrack);
  if (!track || !el) return;
  attachTrack(track, el);
}, { flush: 'post' });

onUnmounted(() => {
  if (screenTrack.value) {
    try { screenTrack.value.stop(); } catch { /* ignore */ }
  }
  if (room.value) room.value.disconnect();
});
</script>

<style scoped>
.twilio-video-room {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 400px;
}
.video-room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.video-room-title {
  font-weight: 600;
}
.video-room-error {
  color: #b91c1c;
  padding: 12px;
  background: #fef2f2;
  border-radius: 8px;
}
.video-room-placeholder {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
.video-room-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 300px;
}
.video-room-grid {
  display: grid;
  gap: 8px;
  flex: 1;
  min-height: 200px;
  align-content: start;
}
.video-room-grid.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.video-room-grid.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
.video-room-grid.grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
.video-room-grid.grid-cols-5 { grid-template-columns: repeat(5, 1fr); }
.video-track-wrap {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: #111;
  position: relative;
  aspect-ratio: 16 / 10;
  min-height: 120px;
}
.video-track-wrap.video-placeholder-wrap {
  grid-column: span 1;
}
.video-room-controls {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.5);
  border-top: 1px solid var(--border);
}
.control-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary, #333);
  color: var(--text-primary, #fff);
  cursor: pointer;
}
.control-btn:hover {
  background: var(--bg-tertiary, #444);
}
.control-btn.muted {
  opacity: 0.7;
  border-color: #b91c1c;
}
.control-btn.active {
  border-color: #2563eb;
  background: rgba(37, 99, 235, 0.2);
}
.video-room-screenshare {
  border: 2px solid #2563eb;
  border-radius: 8px;
  overflow: hidden;
  background: #111;
  position: relative;
  min-height: 200px;
}
.video-track-screenshare {
  width: 100%;
  min-height: 300px;
  object-fit: contain;
}
.control-icon {
  font-size: 16px;
}
.video-track {
  width: 100%;
  height: 100%;
  min-height: 200px;
  object-fit: cover;
}
.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #666;
  font-size: 14px;
}
.video-placeholder .placeholder-logo {
  opacity: 0.35;
}
.participant-identity {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
