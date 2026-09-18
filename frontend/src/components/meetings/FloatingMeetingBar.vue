<template>
  <div
    v-if="meeting.active"
    class="fmb"
    role="region"
    aria-label="Meeting in progress"
    :style="dragStyle"
    @mousedown.self="startDrag"
  >
    <!-- Header -->
    <div class="fmb__header" @mousedown="startDrag">
      <span class="fmb__live-dot" aria-hidden="true" />
      <span class="fmb__title" :title="meeting.meetingTitle">{{ meeting.meetingTitle }}</span>
      <div class="fmb__header-actions">
        <button
          type="button"
          class="fmb__btn fmb__btn--expand"
          title="Back to meeting"
          @click.stop="expandMeeting"
        >⤢</button>
        <button
          type="button"
          class="fmb__btn fmb__btn--leave"
          title="Leave meeting"
          @click.stop="leaveMeeting"
        >✕</button>
      </div>
    </div>

    <div class="fmb__tiles">
      <VideoSessionRoom
        v-if="meeting.active"
        ref="videoRoom"
        :application-id="meeting.applicationId"
        :session-id="meeting.vonageSessionId"
        :token="meeting.token"
        :local-name="meeting.localName"
        :start-muted="meeting.startMuted"
        :start-video-off="meeting.startVideoOff"
        :show-automute-notice="false"
        :is-host-or-cohost="meeting.isHostOrCohost"
        :screen-share-mode="meeting.screenShareMode"
        :can-share-screen="meeting.canShareScreen"
        :can-grant-screen-share="meeting.canGrantScreenShare"
        compact
        hide-controls
        :play-join-tone="false"
        @connected="startPresence"
        @disconnected="stopPresence"
        @meeting-ended="leaveMeeting"
        @transcript-control="onTranscriptControl"
      />
    </div>
    <p v-if="transcriptionActive" class="fmb__notice" role="status">Transcription is on.</p>
    <div class="fmb__footer">
      <button type="button" class="fmb__ctrl-btn"
        :class="{ 'fmb__ctrl-btn--muted': !videoRoom?.publishAudio }"
        :title="videoRoom?.publishAudio ? 'Mute microphone' : 'Unmute microphone'"
        @click="videoRoom?.toggleMic()">
        {{ videoRoom?.publishAudio ? 'Mute' : 'Unmute' }}
      </button>
      <button type="button" class="fmb__ctrl-btn fmb__ctrl-btn--expand-full" @click="expandMeeting">
        Return to meeting
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useActiveMeeting } from '../../composables/useActiveMeeting';
import VideoSessionRoom from '../video/VideoSessionRoom.vue';
import api from '../../services/api';
import { suspendInactivityTimeout, resumeInactivityTimeout } from '../../utils/activityTracker';

const router = useRouter();
const { state: meeting, clearMiniMode, saveReturnMedia } = useActiveMeeting();
const videoRoom = ref(null);
const transcriptionActive = ref(false);
let presenceTimer = null;
let activityHeld = false;

async function sendPresence(action = 'heartbeat') {
  if (!meeting.eventId || !meeting.joinIdentity) return;
  try {
    await api.post(`/team-meetings/${encodeURIComponent(meeting.eventId)}/join-presence`, {
      identity: meeting.joinIdentity,
      joinIdentity: meeting.joinIdentity,
      displayName: meeting.localName,
      action
    }, { skipAuthRedirect: true, skipGlobalLoading: true });
  } catch { /* transient failures are retried by the heartbeat */ }
}
function startPresence() {
  stopPresence();
  // Use the same visible-meeting activity rules as the full room.
  suspendInactivityTimeout();
  activityHeld = true;
  void sendPresence();
  presenceTimer = setInterval(() => { void sendPresence(); }, 15000);
}
function stopPresence() {
  clearInterval(presenceTimer);
  presenceTimer = null;
  if (activityHeld) { resumeInactivityTimeout(); activityHeld = false; }
}
function onTranscriptControl(payload) {
  if (payload?.action === 'start' || payload?.action === 'resume') transcriptionActive.value = true;
  if (payload?.action === 'stop' || payload?.action === 'pause') transcriptionActive.value = false;
}
async function expandMeeting() {
  const path = meeting.meetingPath;
  saveReturnMedia(path, {
    startMuted: !videoRoom.value?.publishAudio,
    startVideoOff: !videoRoom.value?.publishVideo
  });
  videoRoom.value?.disconnect(false);
  stopPresence();
  clearMiniMode();
  if (path) await router.push(path);
}
function leaveMeeting() {
  void sendPresence('leave');
  videoRoom.value?.disconnect(false);
  stopPresence();
  clearMiniMode();
}
watch(() => meeting.active, (on) => {
  if (!on) stopPresence();
  else transcriptionActive.value = !!meeting.transcriptionActive;
}, { immediate: true });
onUnmounted(() => {
  if (meeting.active) leaveMeeting();
  else stopPresence();
});

const dragOffset = reactive({ x: 0, y: 0 });
const dragStyle = ref('');
let stopDragging = null;
function startDrag(e) {
  if (e.button !== 0 || e.target.closest('button')) return;
  stopDragging?.();
  const rect = e.currentTarget.closest('.fmb').getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  const onMove = (ev) => {
    dragStyle.value = `left:${ev.clientX - dragOffset.x}px;top:${ev.clientY - dragOffset.y}px;right:auto;bottom:auto;`;
  };
  stopDragging = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', stopDragging);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', stopDragging);
}
onUnmounted(() => stopDragging?.());
</script>

<style scoped>
.fmb {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 8900;
  width: 272px;
  background: linear-gradient(160deg, #0e1520 0%, #141c2b 100%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  user-select: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Header */
.fmb__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px 8px;
  cursor: grab;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.fmb__header:active { cursor: grabbing; }
.fmb__live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.22);
  flex-shrink: 0;
  animation: fmb-pulse 2s ease-in-out infinite;
}
@keyframes fmb-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.22); }
  50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
}
.fmb__title {
  flex: 1;
  font-size: 0.78rem;
  font-weight: 700;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fmb__header-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.fmb__btn {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  border-radius: 6px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s;
  padding: 0;
}
.fmb__btn:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
.fmb__btn--leave:hover { background: rgba(239, 68, 68, 0.3); color: #fca5a5; }

/* Tiles */
.fmb__tiles {
  height: 210px;
  padding: 4px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
}
.fmb__notice { padding: 4px 10px; color: #cbd5e1; font-size: 0.75rem; }

/* Footer */
.fmb__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 9px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.fmb__ctrl-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.fmb__ctrl-btn:hover { background: rgba(255, 255, 255, 0.12); }
.fmb__ctrl-btn--muted { color: #fca5a5; border-color: rgba(239, 68, 68, 0.4); }
.fmb__ctrl-btn--expand-full {
  flex: 1;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.08);
}
.fmb__ctrl-btn--expand-full:hover { background: rgba(34, 197, 94, 0.16); }

</style>
