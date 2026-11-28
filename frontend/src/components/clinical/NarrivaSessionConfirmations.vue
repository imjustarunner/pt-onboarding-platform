<script setup>
import {computed} from 'vue';
import {isRemoteEncounter} from '../../utils/narrivaProgressContext.js';
const props = defineProps({clientPresent:{type:Boolean,default:null},riskRequired:Boolean,consentOnly:Boolean,location:{type:Object,default:()=>({})}});
const remote = computed(() => isRemoteEncounter(props.location));
const inPerson = computed(() => !remote.value && (!!props.location.locationLabel || props.location.modality === 'in_person'));
const site = computed(() => String(props.location.placeOfService) === '10' ? 'at home' : props.location.clientLocationDescription || '');
const consent = defineModel('consent', { type: Boolean });
const risk = defineModel('risk', { type: Boolean });
</script>
<template>
  <div class="narriva-session-confirmations">
    <label><input v-model="consent" type="checkbox" /> {{ remote ? 'I confirmed consent for telehealth and verified that the participant had privacy' + (site ? ' (' + site + ')' : '') + '.' : inPerson ? 'I confirmed consent for in-person services and privacy at the session location.' : 'I confirmed consent to participate and verified privacy for this session.' }}</label>
    <label v-if="!consentOnly && clientPresent !== false"><input :checked="riskRequired || risk" :disabled="riskRequired" type="checkbox" @change="risk = $event.target.checked" /> {{ riskRequired ? 'Risk assessment required for this note' : 'Include a risk assessment' }}</label>
  </div>
</template>
<style scoped>
.narriva-session-confirmations { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 12px 0; }
.narriva-session-confirmations label { display: flex; align-items: center; gap: 6px; line-height: 1.4; }
@media (max-width:600px) {
  .narriva-session-confirmations { display: grid; gap: 0; }
  .narriva-session-confirmations label { min-height: 44px; margin: 0; }
}
</style>
