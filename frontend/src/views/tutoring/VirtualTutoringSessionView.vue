<template>
 <main class="tutoring-room">
  <header><img v-if="logo" :src="logo" :alt="brand" /><div><p class="brand-name">{{brand}}</p><h1>{{ state?.title || 'Tutoring session' }}</h1><p v-if="state">Appointment #{{ state.appointmentId }} · {{ scheduleLabel }} · {{ statusLabel }}</p></div><router-link :to="backPath">Back to {{ state?.host ? 'my schedule' : 'my portal' }}</router-link></header>
  <p v-if="loading" role="status">Checking your booked session…</p>
  <p v-if="error" role="alert">{{ error }} <button @click="refresh">Try again</button></p>
  <template v-if="state">
   <p v-if="state.unavailableReason" role="alert">{{state.unavailableReason}}</p>
   <p v-if="!state.available && !ended && !state.unavailableReason" role="status">This tutoring room opens {{ formatTime(state.opensAt) }}, 30 minutes before the appointment.</p>
   <section v-if="ended" class="room-ended"><h2>Session ended</h2><p v-if="state.endedAt">Ended {{ formatTime(state.endedAt) }}. Attendance and saved work remain linked to appointment #{{ state.appointmentId }}.</p><p v-if="billingWarning" role="status">{{ billingWarning }}</p><button v-if="state.host && state.roomState==='ending'" :disabled="busy" @click="finish">Confirm disconnection</button></section>
   <template v-else>
    <button v-if="state.host" @click="copyJoinLink">Copy this appointment’s join link</button>
    <button v-if="!video && !wantsJoin" class="primary" :disabled="busy||!state.available" @click="join">{{ state.host ? 'Open this tutoring room' : 'Join this tutoring session' }}</button>
    <p v-if="wantsJoin&&!video" role="status">{{ state.host ? 'Connecting your camera and microphone…' : state.visit?.status==='admitted' ? 'Connecting to your tutoring session…' : 'You are in this appointment’s waiting room. Your tutor will admit you.' }}</p>
    <section v-if="state.host" class="attendance" aria-label="Tutoring attendance"><h2>Waiting room · Appointment #{{ state.appointmentId }}</h2><p v-if="!waiting.length">No participants are waiting for this appointment.</p><article v-for="visit in waiting" :key="visit.id"><span>{{visit.displayName}}</span><button :disabled="busy||!connected" @click="admit(visit.id)">Admit to this session</button></article><p v-for="visit in admitted" :key="visit.id">{{visit.displayName}} · Admitted {{formatTime(visit.admittedAt)}}</p><button v-if="state.sessionId&&!ended" :disabled="busy" @click="confirmingEnd=true">End this tutoring session</button><details v-if="state.visits?.length"><summary>Attendance history</summary><p v-for="visit in state.visits" :key="visit.id">{{visit.displayName}} · {{visit.status}} · Admitted {{formatTime(visit.admittedAt)}} · Left {{formatTime(visit.endedAt)}} · Connected video: {{visit.mediaDurationSeconds==null?'Not confirmed':`${visit.mediaDurationSeconds} seconds`}}</p></details></section>
    <TherapySessionWorkspace v-if="video" :key="video.sessionId" :video="video" :is-host="state.host" :started-at="state.startedAt" :branding="state.branding" product-name="Tutoring" learning :request="workspaceRequest" @connected="connected=true" @disconnected="reconnect" @meeting-ended="reconnect" @leave-request="state.host ? confirmingEnd=true : leave()" />
   </template>
   <section v-if="state.host&&state.sessionId" class="session-note"><h2>Private tutoring session notes</h2><p>These notes stay with appointment #{{state.appointmentId}}. A subject or generated plan is not required.</p><label>Session note<textarea v-model="note" rows="6" maxlength="20000" /></label><button :disabled="savingNote||!noteLoaded" @click="saveNote">{{savingNote?'Saving…':'Save session notes'}}</button><p role="status">{{noteStatus}}</p></section>
  </template>
  <section v-if="confirmingEnd" role="dialog" aria-modal="true" aria-label="End booked tutoring session"><h2>End appointment #{{state.appointmentId}} for everyone?</h2><p>This closes only this tutoring session and records its actual end time.</p><button :disabled="busy" @click="finish">End session for everyone</button><button :disabled="busy" @click="confirmingEnd=false">Keep session open</button></section>
 </main>
</template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount} from 'vue';
import {useRoute} from 'vue-router';
import {useAgencyStore} from '../../store/agency';
import TherapySessionWorkspace from '../../components/meetings/TherapySessionWorkspace.vue';
import api from '../../services/api';
const route=useRoute(),agencies=useAgencyStore();
const state=ref(null),loading=ref(true),error=ref(''),video=ref(null),connected=ref(false),wantsJoin=ref(false),busy=ref(false),confirmingEnd=ref(false),billingWarning=ref('');
const note=ref(''),noteLoaded=ref(false),savingNote=ref(false),noteStatus=ref('');
let appointmentId=Number(route.params.appointmentId),timer,stopped=false,polling=false;
const scopedAgency=computed(()=>Number(agencies.currentAgency?.id)===Number(state.value?.agencyId)?agencies.currentAgency:null);
const brand=computed(()=>state.value?.branding?.agencyName||scopedAgency.value?.name||'Tutoring'),logo=computed(()=>state.value?.branding?.agencyLogoUrl||state.value?.branding?.logoUrl||scopedAgency.value?.logo_url||'');
const backPath=computed(()=>`${route.params.organizationSlug?'/'+route.params.organizationSlug:''}/${state.value?.host?'dashboard?tab=my_schedule':'guardian'}`);
const waiting=computed(()=>(state.value?.visits||[]).filter(v=>v.status==='waiting')),admitted=computed(()=>(state.value?.visits||[]).filter(v=>v.status==='admitted'));
const ended=computed(()=>state.value?.status==='ended'||state.value?.status==='completed'||['ending','ended'].includes(state.value?.roomState));
const statusLabel=computed(()=>ended.value?'Ended':state.value?.status==='live'||state.value?.status==='in_progress'?'In progress':'Scheduled');
const formatTime=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:state.value?.timeZone||'America/Denver',timeZoneName:'short'}).format(new Date(String(value).includes('T')?value:String(value).replace(' ','T')+'Z')):'—';
const scheduleLabel=computed(()=>formatTime(state.value?.startAt));
const path=suffix=>`/tutoring-sessions/${appointmentId}${suffix||''}`;
const params=()=>Object.fromEntries(['agencyId','clientId','serviceId'].filter(k=>route.query[k]).map(k=>[k,route.query[k]]));
const request=(suffix,method='get',body)=>api({url:path(suffix),method,data:body,params:params(),skipGlobalLoading:true}).then(r=>r.data);
const workspaceRequest=(suffix,{method='GET',body}={})=>request(`/workspace${suffix||''}`,method,body);
async function refresh(){if(stopped||polling||!appointmentId)return;polling=true;try{state.value=await request('');if(ended.value){video.value=null;connected.value=false;wantsJoin.value=false;}else if(wantsJoin.value&&!state.value.host&&!video.value){if((!state.value.visit||state.value.visit.status==='ended')&&state.value.sessionId)await request('/join','post');else if(state.value.visit?.status==='admitted')video.value=await request('/token','post');}
 if(state.value.host&&state.value.sessionId&&!noteLoaded.value){const data=await request('/note');note.value=data.note?.summary||'';noteLoaded.value=true;}
 }catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{polling=false;}}
async function action(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();}catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
async function join(){await action(async()=>{const data=await request('/join','post');wantsJoin.value=true;if(data.token)video.value=data;await refresh();});}
async function admit(id){await action(async()=>{await request(`/admit/${id}`,'post');await refresh();});}
async function reconnect(){connected.value=false;video.value=null;await refresh();if(!ended.value&&wantsJoin.value)await action(async()=>{video.value=await request('/token','post');});}
async function leave(){await action(async()=>{await request('/leave','post');video.value=null;wantsJoin.value=false;connected.value=false;await refresh();});}
async function finish(){await action(async()=>{const data=await request('/end','post');video.value=null;connected.value=false;wantsJoin.value=false;confirmingEnd.value=false;billingWarning.value=data.billingWarning||'';await refresh();});}
async function copyJoinLink(){try{await navigator.clipboard.writeText(new URL(`${route.params.organizationSlug?'/'+route.params.organizationSlug:''}/tutoring-session/appointment/${appointmentId}`,window.location.origin).href);}catch{error.value='The join link could not be copied. Open this appointment from the family portal.';}}
async function saveNote(){savingNote.value=true;noteStatus.value='';try{await request('/note','put',{summary:note.value});noteStatus.value='Session notes saved.';}catch(e){noteStatus.value=e.response?.data?.error?.message||'The note was not saved. Your text is kept; retry saving.';}finally{savingNote.value=false;}}
onMounted(async()=>{try{if(!appointmentId&&route.params.sessionId){const {data}=await api.get(`/learning-class-sessions/sessions/${Number(route.params.sessionId)}`);appointmentId=Number(data.appointmentId);}if(!appointmentId)throw new Error('Open this session from its booked appointment. Ask Support to review any older unlinked visit.');await refresh();timer=setInterval(refresh,5000);}catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{loading.value=false;}});
onBeforeUnmount(()=>{stopped=true;clearInterval(timer);});
</script>
<style scoped>
.tutoring-room{max-width:1500px;margin:auto;padding:24px;color:#193453;font-family:system-ui}.tutoring-room header{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.tutoring-room header img{max-width:150px;max-height:70px}.tutoring-room h1{font-size:26px}.tutoring-room header a{margin-left:auto}.tutoring-room button{padding:10px 16px;margin:6px;border:1px solid #bacbdd;border-radius:8px;background:white;color:#193453;cursor:pointer}.tutoring-room button:disabled{opacity:.55}.attendance,.session-note,.room-ended{border:1px solid #cddbe8;border-radius:14px;padding:20px;margin:20px 0}.attendance article{display:flex;align-items:center;gap:12px}.session-note label{display:grid;gap:8px}.session-note textarea{width:100%;box-sizing:border-box;font:inherit;padding:12px}[role=alert]{color:#a32035}[role=dialog]{position:fixed;z-index:10001;top:25%;left:50%;transform:translateX(-50%);max-width:500px;width:85%;padding:24px;border-radius:14px;background:white;box-shadow:0 0 0 100vmax #0008}.primary{background:#235c91!important;color:white!important}@media(max-width:600px){.tutoring-room{padding:12px}.tutoring-room header a{margin-left:0}}
</style>
