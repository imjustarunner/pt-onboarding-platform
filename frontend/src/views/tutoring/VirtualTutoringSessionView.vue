<template><main class="office-entry"><img v-if="logo" :src="logo" :alt="brand" /><h1>{{ early?'You’re a little early':'Your virtual tutoring office' }}</h1><p v-if="loading" role="status">Checking your appointment…</p><template v-else><p :role="early?'status':'alert'">{{ error }}</p><p v-if="early">You can keep this page open. We’ll take you to the waiting room when it opens. Your tutor will admit you when they are ready.</p><button type="button" @click="openOffice">{{ early?'Check again':'Try again' }}</button><router-link :to="backPath">Back to your portal</router-link></template></main></template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAgencyStore} from '../../store/agency';
import api from '../../services/api';
const route=useRoute(),router=useRouter(),agencies=useAgencyStore();
const loading=ref(true),error=ref(''),early=ref(false);
let timer,stopped=false,opening=false;
const brand=computed(()=>agencies.currentAgency?.name||'Tutoring');
const logo=computed(()=>agencies.currentAgency?.logo_url||'');
const backPath=computed(()=>route.params.organizationSlug?`/${route.params.organizationSlug}/guardian`:'/guardian');
async function openOffice(){if(opening||stopped)return;opening=true;loading.value=true;error.value='';early.value=false;clearTimeout(timer);try{
 let clientId=Number(route.query.clientId),agencyId=Number(route.query.agencyId),appointmentId=Number(route.params.appointmentId),source='appointment';
 if(!appointmentId){
  const id=Number(route.params.sessionId);if(!Number.isSafeInteger(id)||id<1)throw new Error('Open the tutoring link from your appointment.');
  const {data}=await api.get(`/learning-class-sessions/sessions/${id}`);if(stopped)return;
  if(data.canModerate&&data.officeDestination){await router.replace(data.officeDestination);return;}
  clientId=Number(data.primaryClientId);agencyId=Number(data.officeAgencyId);appointmentId=id;source='learning_session';
 }
 if(!clientId||!agencyId||!Number.isSafeInteger(appointmentId))throw new Error('Open the tutoring link from your appointment.');
 const base=`/tutoring-learning-os/clients/${clientId}`;
 const {data:entry}=await api.get(`${base}/office-entry`,{params:{agencyId,appointmentId,source}});if(stopped)return;
 if(!entry.virtual)throw new Error('This appointment is in person. Check its location in your portal.');
 if(!entry.available){
  if(entry.opensAt&&Date.now()<new Date(entry.opensAt).getTime()){
   early.value=true;const when=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:entry.timeZone||'America/Denver',timeZoneName:'short'}).format(new Date(entry.opensAt));
   error.value=`Your waiting room opens at ${when}, 30 minutes before your appointment.`;timer=setTimeout(openOffice,15000);return;
  }
  throw new Error('This appointment’s joining window is closed or the appointment has changed. Check your portal for the current schedule.');
 }
 let previous={};if(entry.officeSlug){try{previous=JSON.parse(sessionStorage.getItem(`auricwell-office-visit:${entry.officeSlug}`)||'{}');}catch{}}
 const {data}=await api.post(`${base}/office-visit`,{agencyId,intent:'join',appointmentId:entry.appointmentId,source:entry.source,existingVisitId:previous.id,credential:previous.credential});if(stopped)return;
 sessionStorage.setItem(`auricwell-office-visit:${data.officeSlug}`,JSON.stringify({id:data.lobby.id,credential:data.lobby.credential,displayName:data.lobby.guestDisplayName}));
 await router.replace(`/join/my-room/${encodeURIComponent(data.officeSlug)}`);
 }catch(e){error.value=e.response?.data?.error?.message||e.message||'The office could not be opened.';}finally{loading.value=false;opening=false;}}
onMounted(openOffice);onBeforeUnmount(()=>{stopped=true;clearTimeout(timer);});
</script>
<style scoped>.office-entry{max-width:540px;margin:8vh auto;padding:32px;border:1px solid #dbe5ed;border-radius:20px;background:white;color:#193453;font-family:system-ui}.office-entry img{max-width:180px;max-height:80px}.office-entry h1{font-size:26px}.office-entry p{line-height:1.6}.office-entry button,.office-entry a{display:inline-block;margin:12px 16px 0 0;padding:10px 14px;border:1px solid #c5d5e4;border-radius:8px;color:#23537a;background:white}</style>
