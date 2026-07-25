<template>
  <div class="supervision-video-room">
    <div v-if="sessionTitle" class="supervision-video-room__title">{{ sessionTitle }}</div>
    <VideoSessionRoom
      v-if="token && vonageSessionId && projectId"
      :key="`${vonageSessionId}-${token.slice(0, 12)}`"
      :token="token"
      :session-id="vonageSessionId"
      :application-id="projectId"
      :api-key="projectId"
      :local-name="localName"
      :layout="layout"
      :diagnostics="diagnostics"
      :can-recreate-room="canRecreateRoom"
      promote-local-when-alone
      @disconnected="$emit('disconnected')"
      @connected="$emit('connected', $event)"
      @error="$emit('error', $event)"
      @recreate-room="$emit('recreate-room')"
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
import { computed } from 'vue';
import VideoSessionRoom from '../video/VideoSessionRoom.vue';
import { useAuthStore } from '../../store/auth';

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
  localDisplayName: { type: String, default: '' },
  localRoleLabel: { type: String, default: '' }
});

defineEmits(['disconnected', 'connected', 'error', 'recreate-room']);

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
  const name = fromProp || authName || '';
  // Avoid "You · Guest · Guest" when role and display name are the same.
  if (role && name && role.toLowerCase() !== name.toLowerCase()) return `You · ${role} · ${name}`;
  if (role) return `You · ${role}`;
  if (name) return `You · ${name}`;
  return 'You';
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
