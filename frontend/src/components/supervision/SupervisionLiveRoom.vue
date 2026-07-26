<template>
  <IndividualSupervisionLiveRoom
    v-if="isIndividual"
    v-bind="roomProps"
    @leave="$emit('leave')"
    @connected="$emit('connected', $event)"
  />
  <GroupSupervisionLiveRoom
    v-else
    v-bind="roomProps"
    @leave="$emit('leave')"
    @connected="$emit('connected', $event)"
  />
</template>

<script setup>
import { computed } from 'vue';
import IndividualSupervisionLiveRoom from './IndividualSupervisionLiveRoom.vue';
import GroupSupervisionLiveRoom from './GroupSupervisionLiveRoom.vue';
import {
  isIndividualSupervisionType,
  supervisionLiveRoomProps
} from '../../composables/useSupervisionLiveSession';

const props = defineProps(supervisionLiveRoomProps);
defineEmits(['leave', 'connected']);

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
