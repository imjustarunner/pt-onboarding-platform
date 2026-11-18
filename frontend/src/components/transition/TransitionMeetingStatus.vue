<template><section class="tw-meeting-status"><div class="tw-heading"><h4>Meeting #{{ eventId }} · RSVPs</h4><button type="button" :disabled="loading" @click="load">Refresh RSVPs</button></div><p v-if="error" role="alert">{{ error }}</p><p v-if="loading">Loading responses…</p><ul><li v-for="person in people" :key="person.id"><span>{{ person.name || [person.first_name,person.last_name].filter(Boolean).join(' ') }}</span><strong :class="{ 'tw-good':person.rsvp==='accepted' }">{{ ({accepted:'Attending',declined:'Not attending',pending:'Waiting for RSVP'})[person.rsvp] || 'Waiting for RSVP' }}</strong></li></ul><a :href="`/join/team-meeting/${eventId}`" target="_blank" rel="noopener">Open meeting and invitations</a></section></template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({eventId:Number,agencyId:Number});const people=ref([]),loading=ref(false),error=ref('');let generation=0;
async function load(){const n=++generation;loading.value=true;error.value='';try{const {data}=await api.get(`/team-meetings/${props.eventId}/participants`,{params:{agencyId:props.agencyId}});if(n===generation)people.value=data.participants||[];}catch(e){if(n===generation)error.value=e.response?.data?.error?.message||'Unable to load RSVP information with your account.';}finally{if(n===generation)loading.value=false;}}
watch(()=>[props.eventId,props.agencyId],load,{immediate:true});
</script>
