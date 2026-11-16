<script setup>
import {ref,watch} from 'vue';
import GuardianContactCard from './GuardianContactCard.vue';
import RecordsRequests from '../records/RecordsRequests.vue';
import {api} from '../records/api';
import {useFamilyLocale} from '../../composables/useFamilyLocale';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String]});
const emit=defineEmits(['help','messages']);const {ft}=useFamilyLocale();
const context=ref(null),patients=ref([]),error=ref(''),loading=ref(false);let sequence=0;
async function receiveContext(value){const request=++sequence;context.value=value;patients.value=[];error.value='';loading.value=false;if(!value?.records?.onlineRequestsEnabled)return;loading.value=true;try{const data=await api(`/practices/${props.agencyId}/patients`);if(request===sequence)patients.value=data.filter(p=>Number(p.id)===Number(props.clientId));}catch{if(request===sequence)error.value='Online records requests could not be opened. Contact your practice for help.';}finally{if(request===sequence)loading.value=false;}}
watch(()=>[props.agencyId,props.clientId],()=>receiveContext(null));
</script>
<template><section class="guardian-records"><h2>{{ ft('Request my records') }}</h2><p>{{ ft('Ask for a copy of your records or records you are authorized to request for your child. Your practice confirms identity and permission before releasing a copy.') }}</p><GuardianContactCard :client-id="clientId" :agency-id="agencyId" @context="receiveContext" @messages="$emit('messages')"/><p v-if="loading" role="status">{{ ft('Loading records request form…') }}</p><p v-if="error" role="alert">{{ ft(error) }}</p><RecordsRequests v-if="!loading&&!error&&patients.length" :base="`/practices/${agencyId}`" :patients="patients"/><div v-else-if="context&&!loading&&!error" class="records-next-step" role="status"><h3>{{ ft('Request a copy through your practice') }}</h3><p>{{ ft('Your practice has not enabled online records requests here. Call or email the contact above, or ask your team through secure messages, to arrange a records request.') }}</p><p>{{ ft('Say whose records you need and the dates you are requesting. Your team will explain how to verify your identity and receive the copy securely.') }}</p><button type="button" @click="$emit('messages')">{{ ft('Contact your team securely') }}</button></div></section></template>
<style scoped>.guardian-records{line-height:1.65}.records-next-step{padding:20px;background:#f4f8fc;border:1px solid #d9e5ef;border-radius:12px}.records-next-step button{font:inherit;padding:10px 14px;border:1px solid #bbcede;background:#fff;color:#16457c;border-radius:8px;cursor:pointer}</style>
