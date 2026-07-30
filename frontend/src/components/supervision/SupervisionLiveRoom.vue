<template>
  <IndividualSupervisionLiveRoom
    v-if="isIndividual"
    ref="activeRoomRef"
    v-bind="roomProps"
    @leave="$emit('leave', $event)"
    @connected="$emit('connected', $event)"
    @meeting-ended="$emit('meeting-ended', $event)"
    @disconnected="$emit('disconnected')"
  />
  <GroupSupervisionLiveRoom
    v-else
    ref="activeRoomRef"
    v-bind="roomProps"
    @leave="$emit('leave', $event)"
    @connected="$emit('connected', $event)"
    @meeting-ended="$emit('meeting-ended', $event)"
    @disconnected="$emit('disconnected')"
  />
</template>

<script setup>
import { computed, ref, defineExpose } from 'vue';
import IndividualSupervisionLiveRoom from './IndividualSupervisionLiveRoom.vue';
import GroupSupervisionLiveRoom from './GroupSupervisionLiveRoom.vue';
import {
  isIndividualSupervisionType,
  supervisionLiveRoomProps
} from '../../composables/useSupervisionLiveSession';

const props = defineProps(supervisionLiveRoomProps);
defineEmits(['leave', 'connected', 'meeting-ended', 'disconnected']);

const activeRoomRef = ref(null);

defineExpose({
  disconnect: (...args) => activeRoomRef.value?.disconnect?.(...args)
});

const isIndividual = computed(() => isIndividualSupervisionType(props.sessionMeta));

const roomProps = computed(() => ({
  supervisionSessionId: props.supervisionSessionId,
  token: props.token,
  vonageSessionId: props.vonageSessionId,
  applicationId: props.applicationId,
  diagnostics: props.diagnostics,
  sessionTitle: props.sessionTitle,
  sessionMeta: props.sessionMeta,
  isSupervisor: props.isSupervisor,
  isPresenter: props.isPresenter,
  isInLobby: props.isInLobby,
  lobbyEnabledForSession: props.lobbyEnabledForSession,
  participantHint: props.participantHint,
  joinIdentity: props.joinIdentity,
  localDisplayName: props.localDisplayName,
  localRoleLabel: props.localRoleLabel,
  localProfilePhotoUrl: props.localProfilePhotoUrl,
  joinToken: props.joinToken
}));
</script>
