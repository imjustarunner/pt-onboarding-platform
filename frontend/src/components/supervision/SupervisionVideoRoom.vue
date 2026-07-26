<template>
  <div class="supervision-video-room">
    <div v-if="sessionTitle" class="supervision-video-room__title">{{ sessionTitle }}</div>
    <VideoSessionRoom
      v-if="token && vonageSessionId && projectId"
      ref="videoRoomRef"
      :key="`${vonageSessionId}-${token.slice(0, 12)}`"
      :token="token"
      :session-id="vonageSessionId"
      :application-id="projectId"
      :api-key="projectId"
      :local-name="localName"
      :local-profile-photo-url="localProfilePhotoUrl"
      :layout="layout"
      :diagnostics="diagnostics"
      :can-recreate-room="canRecreateRoom"
      :promote-local-when-alone="promoteLocalWhenAlone"
      :equal-tiles-when-remote="equalTilesWhenRemote"
      :tile-focus="tileFocus"
      :hide-controls="hideControls"
      :allow-tile-focus="allowTileFocus"
      @update:tile-focus="$emit('update:tileFocus', $event)"
      @disconnected="$emit('disconnected')"
      @connected="$emit('connected', $event)"
      @error="$emit('error', $event)"
      @recreate-room="$emit('recreate-room')"
      @meeting-ended="$emit('meeting-ended', $event)"
    >
      <template #extra-controls>
        <slot name="extra-controls" />
      </template>
    </VideoSessionRoom>
    <div v-else class="supervision-video-room__empty">
      <p>Waiting for video credentials…</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import VideoSessionRoom from '../video/VideoSessionRoom.vue';
import { useAuthStore } from '../../store/auth';

const videoRoomRef = ref(null);

const props = defineProps({
  token: { type: String, default: '' },
  /** Vonage session id (preferred). Legacy alias: roomSid */
  vonageSessionId: { type: String, default: '' },
  sessionId: { type: [Number, String], default: null },
  roomSid: { type: String, default: '' },
  roomName: { type: String, default: '' },
  applicationId: { type: String, default: '' },
  apiKey: { type: String, default: '' },
  sessionTitle: { type: String, default: '' },
  isHost: { type: Boolean, default: false },
  layout: { type: String, default: 'strip' },
  diagnostics: { type: Object, default: null },
  canRecreateRoom: { type: Boolean, default: false },
  promoteLocalWhenAlone: { type: Boolean, default: true },
  /** When false, remotes fill the stage and local stays a small corner PiP. */
  equalTilesWhenRemote: { type: Boolean, default: true },
  tileFocus: { type: String, default: 'equal' },
  hideControls: { type: Boolean, default: false },
  allowTileFocus: { type: Boolean, default: false },
  localDisplayName: { type: String, default: '' },
  localRoleLabel: { type: String, default: '' },
  localProfilePhotoUrl: { type: String, default: '' }
});

defineEmits(['disconnected', 'connected', 'error', 'recreate-room', 'update:tileFocus', 'meeting-ended']);

const authStore = useAuthStore();

const vonageSessionId = computed(() =>
  // Do not fall back to props.sessionId — callers use that for the supervision DB id.
  String(props.vonageSessionId || props.roomSid || '').trim()
);
const projectId = computed(() =>
  String(props.applicationId || props.apiKey || '').trim()
);
const localName = computed(() => {
  const role = String(props.localRoleLabel || (props.isHost ? 'Supervisor' : '')).trim();
  const fromProp = String(props.localDisplayName || '').trim();
  const u = authStore.user || {};
  const authName = `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim()
    || u.email
    || '';
  const authenticated = !!(authStore.isAuthenticated || u.id || authName);
  // Prefer real auth name over a stale "Guest" label from a prior guest fallthrough.
  const name = (fromProp && fromProp.toLowerCase() !== 'guest')
    ? fromProp
    : (authName || (fromProp.toLowerCase() === 'guest' ? '' : fromProp) || '');
  let roleSafe = role;
  // Prefer an explicit role label (e.g. Host / Participant for team meetings).
  if (props.isHost && !roleSafe) roleSafe = 'Supervisor';
  else if (!props.isHost && role && role.toLowerCase() === 'guest' && authenticated) roleSafe = 'Supervisee';
  else if (!roleSafe && authenticated) roleSafe = props.isHost ? 'Supervisor' : 'Supervisee';
  // Team-meeting hosts should never fall through as "Supervisor".
  if (props.isHost && roleSafe.toLowerCase() === 'supervisor' && props.localRoleLabel) {
    roleSafe = String(props.localRoleLabel).trim() || roleSafe;
  }
  if (roleSafe && name && roleSafe.toLowerCase() !== name.toLowerCase()) return `You · ${roleSafe} · ${name}`;
  if (roleSafe) return `You · ${roleSafe}`;
  if (name) return `You · ${name}`;
  return authenticated ? 'You · Supervisee' : 'You';
});

const localProfilePhotoUrl = computed(() => {
  const fromProp = String(props.localProfilePhotoUrl || '').trim();
  if (fromProp) return fromProp;
  const u = authStore.user || {};
  return String(u.profile_photo_url || u.profilePhotoUrl || '').trim();
});

defineExpose({
  toggleMic: (...args) => videoRoomRef.value?.toggleMic?.(...args),
  toggleCamera: (...args) => videoRoomRef.value?.toggleCamera?.(...args),
  toggleScreenShare: (...args) => videoRoomRef.value?.toggleScreenShare?.(...args),
  get publishAudio() { return videoRoomRef.value?.publishAudio; },
  get publishVideo() { return videoRoomRef.value?.publishVideo; },
  get sharingScreen() { return videoRoomRef.value?.sharingScreen; }
});
</script>

<style scoped>
.supervision-video-room {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 220px;
  background: #0f1117;
  border-radius: 10px;
  overflow: hidden;
  color: #fff;
}
.supervision-video-room__title {
  padding: 10px 14px;
  font-weight: 600;
  font-size: 0.95rem;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.supervision-video-room__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: #889;
  padding: 24px;
}
</style>
