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
      <div class="video-room-local">
        <div v-if="localVideoTrack" ref="localVideoEl" class="video-track" />
        <div v-else class="video-placeholder">You (camera off)</div>
      </div>
      <div class="video-room-remote">
        <div
          v-for="p in remoteParticipants"
          :key="p.sid"
          class="video-track-wrap"
        >
          <div ref="(el) => setRemoteVideoEl(p.sid, el)" class="video-track" />
          <span class="participant-identity">{{ p.identity }}</span>
        </div>
        <div v-if="remoteParticipants.length === 0" class="video-placeholder">
          Waiting for others to join…
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted, watch } from 'vue';
import { connect } from 'twilio-video';
import api from '../../services/api';

const props = defineProps({
  token: { type: String, required: true },
  roomName: { type: String, default: '' },
  sessionId: { type: [Number, String], default: null },
  eventId: { type: [Number, String], default: null }
});

const emit = defineEmits(['disconnected']);

const room = ref(null);
const localVideoTrack = ref(null);
const remoteParticipants = ref([]);
const connecting = ref(true);
const disconnecting = ref(false);
const error = ref('');
const localVideoEl = ref(null);
const remoteVideoEls = ref({});
const transcriptLines = ref([]);

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

async function connectRoom() {
  if (!props.token) {
    error.value = 'No token provided';
    connecting.value = false;
    return;
  }
  try {
    connecting.value = true;
    error.value = '';
    transcriptLines.value = [];
    const r = await connect(props.token, {
      name: props.roomName,
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
    r.localParticipant.on('trackSubscribed', (track) => {
      if (track.kind === 'video') localVideoTrack.value = track;
    });
    r.localParticipant.on('trackUnsubscribed', (track) => {
      if (track.kind === 'video' && localVideoTrack.value === track) localVideoTrack.value = null;
    });

    const addParticipant = (participant) => {
      if (participant.identity === r.localParticipant.identity) return;
      remoteParticipants.value = [
        ...remoteParticipants.value.filter((p) => p.sid !== participant.sid),
        { sid: participant.sid, identity: participant.identity }
      ];
      participant.tracks.forEach((pub) => {
        if (pub.track && pub.kind === 'video') {
          setTimeout(() => {
            const el = remoteVideoEls.value[participant.sid];
            if (el) attachTrack(pub.track, el);
          }, 100);
        }
      });
      participant.on('trackSubscribed', (track) => {
        if (track.kind === 'video') {
          setTimeout(() => {
            const el = remoteVideoEls.value[participant.sid];
            if (el) attachTrack(track, el);
          }, 100);
        }
      });
    };

    r.participants.forEach(addParticipant);
    r.on('participantConnected', addParticipant);
    r.on('participantDisconnected', (participant) => {
      participant.tracks.forEach((pub) => detachTrack(pub.track));
      remoteParticipants.value = remoteParticipants.value.filter((p) => p.sid !== participant.sid);
    });

    r.on('disconnected', async () => {
      const text = transcriptLines.value.join('\n').trim();
      if (text && (props.sessionId || props.eventId)) {
        await postTranscriptToBackend(text);
      }
      disconnecting.value = false;
      room.value = null;
      localVideoTrack.value = null;
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
  if (track && localVideoEl.value) attachTrack(track, localVideoEl.value);
}, { flush: 'post' });

onUnmounted(() => {
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
  min-height: 300px;
}
.video-room-local,
.video-room-remote {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: #111;
  position: relative;
}
.video-track {
  width: 100%;
  height: 100%;
  min-height: 200px;
  object-fit: cover;
}
.video-track-wrap {
  position: relative;
  min-height: 200px;
}
.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 14px;
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
