<template>
 <template v-if="state?.sessionHubV2">
 <TutoringSessionHub :state="state" :video="video" :connected="connected" :closed="closed" :in-person="inPerson" :busy="busy" :wants-join="wantsJoin" :guest="!!guestSessionId" :brand="brand" :logo="logo" :back-path="backPath" :error="error||reconnectError" :window-message="windowMessage" :link-notice="linkNotice" :manual-join-link="manualJoinLink" :join-recipients="joinRecipients" :selected-recipient="selectedRecipient" @select-recipient="selectedRecipient=$event;manualJoinLink='';linkNotice=''" :goals="allGoals" :learning-context="learningContext" :request="request" :workspace-request="workspaceRequest" :rate-activity="state.host?rateActivity:undefined" :generate-question="state.host?generateQuestion:undefined" :read-material="readMaterial" :renew-video="renewVideo" @join="join" @start="startInPerson" @end="confirmingEnd=true" @leave="leave" @admit="admit" @refresh="refresh" @connected="onMediaConnected" @disconnected="reconnect" @copy-link="copyJoinLink" @revoke-link="revokeLink">
  <template #attendance><AppointmentNoShowStatus v-if="state.host" :appointment-id="Number(state.appointmentId)" :resolved-attendance="ended&&!!state.startedAt" :time-zone="state.timeZone" @undone="refresh" @changed="refresh" /></template>
  <template #learning><p v-if="contextError" role="alert">{{contextError}}</p><section v-for="entry in learningContext?.subjects||[]" :key="entry.subject.id"><h3>{{entry.subject.subject_label}}</h3><p>{{entry.activePlan?.title||'Learning plan awaiting review'}}</p><p v-for="goal in entry.goals||[]" :key="goal.id">{{goal.title}}</p></section><p v-if="!state.host">Your tutor chooses practice for your learning goals. Only reviewed work is shared here.</p></template>
  <template #notes><TutoringSessionNoteEditor :key="appointmentId" :appointment-id="appointmentId" :params="params()" :request="request" :ended="ended&&!!state.startedAt" :goals="allGoals" @shared="noteVersion++" /></template>
  <template #progress><TutoringSessionLearningPanel v-if="hasApprovedPlan" :key="`${state.sessionId}-${noteVersion}`" :client-id="state.clientId" :agency-id="state.agencyId" :session-id="state.sessionId" :request="request" :session-type="inPerson?'in_person':'virtual'" /></template>
  <template #summary><article v-if="state.familySummary"><h3>Session summary</h3><p>{{state.familySummary.summary.workedOn}}</p><p>{{state.familySummary.summary.howItWent}}</p><p>{{state.familySummary.summary.homePractice}}</p></article></template>
 </TutoringSessionHub>
 <AppointmentChangeWizard v-if="state.host" :change="appointmentChange" @completed="refresh"/>
 <section v-if="confirmingEnd" class="hub-end-confirm" role="dialog" aria-modal="true" aria-label="End booked tutoring session"><h2>End appointment #{{state.appointmentId}} for everyone?</h2><p>This closes only this tutoring session and records its actual end time.</p><button :disabled="busy" @click="finish">End session for everyone</button><button :disabled="busy" @click="confirmingEnd=false">Keep session open</button></section>
 </template>
 <main v-else class="tutoring-room" :class="{focused}">
  <header><img v-if="logo" :src="logo" :alt="brand" /><div><p class="brand-name">{{brand}}</p><h1>Session Hub</h1><p><span v-if="state?.studentName">{{state.studentName}} · </span>{{state?.title || 'Tutoring session'}} · {{inPerson?'In person':'Virtual'}}</p><p v-if="state">Appointment #{{ state.appointmentId }} · {{ scheduleLabel }} · {{ statusLabel }}</p></div><button v-if="video" class="focus-toggle" type="button" :aria-pressed="focused" @click="focused=!focused">{{focused?"Show session panels":"Focus on lesson"}}</button><router-link :to="backPath">Back to {{ state?.host ? 'my schedule' : 'my portal' }}</router-link></header>
  <p v-if="loading" role="status">Checking your booked session…</p><p v-else-if="!state&&!error" role="status">Your session is paused or could not be opened. <button @click="refresh">Try again</button></p>
  <p v-if="error" role="alert">{{ error }} <button @click="refresh">Try again</button></p>
  <p v-if="reconnectError && video && !closed" role="alert">{{ reconnectError }} <button type="button" :disabled="busy" @click="reconnect()">Retry connection</button></p>
  <template v-if="state">
   <AppointmentNoShowStatus v-if="state.host" :appointment-id="Number(state.appointmentId)" :resolved-attendance="ended&&!!state.startedAt" :time-zone="state.timeZone" @undone="refresh" @changed="refresh" />
   <p v-if="state.unavailableReason" role="alert">{{state.unavailableReason}}</p>
   <p v-if="!state.available && !closed && !inPerson" role="status">{{ windowMessage }}</p>
   <section v-if="ended" class="room-ended"><h2>Session ended</h2><p v-if="state.endedAt">Ended {{ formatTime(state.endedAt) }}. Attendance and saved work remain linked to appointment #{{ state.appointmentId }}.</p><button v-if="state.host && state.roomState==='ending'" :disabled="busy" @click="finish">Confirm disconnection</button></section>
   <section v-if="closed && !ended" class="room-ended"><h2>{{ statusLabel }}</h2><p>Attendance history is linked to appointment #{{ state.appointmentId }}.</p></section>
   <section v-if="!state.host && state.familySummary" class="session-note" aria-label="Shared tutoring summary">
    <h2>Session summary</h2>
    <h3>Worked on</h3><p>{{ state.familySummary.summary.workedOn }}</p>
    <h3>How it went</h3><p>{{ state.familySummary.summary.howItWent }}</p>
<section v-if="state.familySummary.summary.skillObservations?.length"><h4>Skills practiced</h4><ul><li v-for="(item,index) in state.familySummary.summary.skillObservations" :key="index">{{item.skill}}{{item.grade ? ' · Grade ' + item.grade : ''}} · {{item.observation}}</li></ul></section>
    <h3>Practice at home</h3><p>{{ state.familySummary.summary.homePractice }}</p>
    <small>Shared by {{ state.familySummary.authorName }} · {{ formatTime(state.familySummary.signedAt) }}</small>
   </section>
   <div class="hub-layout" :class="{'hub-layout--host':state.host}">
    <details v-if="state.host" class="hub-context" :open="false"><summary>This student’s learning</summary><p v-if="contextError" role="alert">{{contextError}}</p><section v-for="entry in learningContext?.subjects||[]" :key="entry.subject.id"><h2>{{entry.subject.subject_label}}</h2><p>{{(entry.activePlan?.approved_at ? entry.activePlan.title.replace(/\s*\(AI draft\)/gi, '').trim() : entry.activePlan?.title) || learningContext?.tracks?.find(t=>t.subject.id===entry.subject.id)?.draftTitle || 'No learning plan yet'}}<span v-if="!hasApprovedPlan && (entry.activePlan || learningContext?.tracks?.some(t=>t.subject.id===entry.subject.id && t.draftTitle))"> · Draft for tutor review</span></p><p v-for="goal in entry.goals||[]" :key="goal.id">{{goal.title}}</p><details><summary>Previous session notes</summary><article v-for="prior in (entry.recentNotes||[]).filter(n=>Number(n.session_id)!==Number(state.sessionId))" :key="prior.id"><p>{{prior.summary}}</p><p>{{prior.homework}}</p></article></details></section><p v-if="!learningContext?.subjects?.length">No subject track is assigned yet. General tutoring notes can still be saved.</p></details>
    <div class="hub-work">
   <div v-if="!inPerson&&!video&&!closed" class="lesson-lobby">
    <div><span class="lobby-label">Virtual tutoring</span>
     <h2>{{state.title || 'Individual tutoring'}}</h2>
     <p>{{state.host?'Start the room here, then admit your student from the waiting list.':'Join this appointment to meet your tutor. Your shared lesson will appear here after admission.'}}</p>
    </div>
    <div v-if="state.host&&allGoals.length" class="lobby-goals"><h3>Learning goals</h3><ul><li v-for="goal in allGoals.slice(0,3)" :key="goal.id">{{goal.title}}</li></ul></div>
   </div>
   <div class="room-actions">
   <template v-if="!closed">
    <button v-if="canDeclareNoShow" type="button" @click="openNoShow">Mark no-show</button>
    <button v-if="state.host&&!inPerson" @click="copyJoinLink">Copy this appointment’s join link</button>
    <button v-if="!inPerson&&!video && !wantsJoin && !windowExpired" class="primary" :disabled="busy||!state.available" @click="join">{{ state.host ? 'Open this tutoring room' : 'Join this tutoring session' }}</button>
    <label v-if="manualJoinLink">Appointment link<input :value="manualJoinLink" readonly @focus="$event.target.select()"></label><span role="status">{{linkNotice}}</span>
    <p v-if="wantsJoin&&!video" role="status">{{ state.host ? 'Connecting your camera and microphone…' : state.visit?.status==='admitted' ? 'Connecting to your tutoring session…' : 'You are in this appointment’s waiting room. Your tutor will admit you.' }}</p>
    </template></div><template v-if="!closed">
   <details v-if="state.host&&!inPerson" class="attendance" aria-label="Tutoring attendance" :open="!video||waiting.length>0"><summary>Waiting room · Appointment #{{state.appointmentId}}<span v-if="waiting.length"> · {{waiting.length}} waiting</span></summary><p v-if="!waiting.length">No participants are waiting for this appointment.</p><article v-for="visit in waiting" :key="visit.id"><span>{{visit.displayName}}</span><button :disabled="busy||!connected" @click="admit(visit.id)">Admit to this session</button></article><p v-for="visit in admitted" :key="visit.id">{{visit.displayName}} · Admitted {{formatTime(visit.admittedAt)}}</p><button v-if="state.sessionId&&!ended&&!connected" :disabled="busy" @click="confirmingEnd=true">End this tutoring session</button><details v-if="state.visits?.length"><summary>Attendance history</summary><p v-for="visit in state.visits" :key="visit.id">{{visit.displayName}} · {{visit.status}} · Admitted {{formatTime(visit.admittedAt)}} · Left {{formatTime(visit.endedAt)}} · Connected video: {{visit.mediaDurationSeconds==null?'Not confirmed':`${visit.mediaDurationSeconds} seconds`}}</p></details></details>
    <button v-if="inPerson&&state.host&&!state.startedAt" :disabled="busy" @click="startInPerson">Start in-person session</button><button v-if="inPerson&&state.host&&state.startedAt" :disabled="busy" @click="confirmingEnd=true">End this tutoring session</button>
    <InPersonTutoringSessionView v-if="inPerson&&state.host&&state.sessionId" :session-id-override="state.sessionId" embedded />
    <TherapySessionWorkspace v-if="video" :key="video.sessionId" :video="{...video, renewCredentials: renewVideo}" :is-host="state.host" :defer-alone-warning="waitingForAdmittedConnection" :started-at="state.startedAt" :branding="state.branding" product-name="Tutoring" learning :show-brand="false" :learning-context="learningContext" :rate-activity="state.host ? rateActivity : undefined" :generate-question="state.host ? generateQuestion : undefined" :materials="materials" :read-material="readMaterial" :request="workspaceRequest" @connected="onMediaConnected" @disconnected="reconnect" @meeting-ended="refresh" @leave-request="state.host ? confirmingEnd=true : leave()" />
   </template>
    </div>
    <details v-if="state.host && (!closed || ended)" class="hub-note" :open="false"><summary>Session notes &amp; activity</summary><details v-if="state.sessionId&&hasApprovedPlan"><summary>Learning plan results</summary><TutoringSessionLearningPanel :key="`${state.sessionId}-${noteVersion}`" :client-id="state.clientId" :agency-id="state.agencyId" :session-id="state.sessionId" :request="request" :session-type="inPerson?'in_person':'virtual'" /></details><TutoringSessionNoteEditor :key="appointmentId" :appointment-id="appointmentId" :params="params()" :request="request" :ended="ended&&!!state.startedAt" :goals="allGoals" @shared="noteVersion++" /></details>
   </div>
  </template>
  <AppointmentChangeWizard v-if="state?.host" :change="appointmentChange" @completed="refresh" />
  <section v-if="confirmingEnd" role="dialog" aria-modal="true" aria-label="End booked tutoring session"><h2>End appointment #{{state.appointmentId}} for everyone?</h2><p>This closes only this tutoring session and records its actual end time.</p><button :disabled="busy" @click="finish">End session for everyone</button><button :disabled="busy" @click="confirmingEnd=false">Keep session open</button></section>
 </main>
</template>
<script setup>
import {defineAsyncComponent} from 'vue';
const TutoringSessionHub=defineAsyncComponent(()=>import('../../components/tutoring/TutoringSessionHub.vue').then(m=>m.default));
import axios from 'axios';
import {getApiBaseUrl} from '../../utils/apiBaseUrl';
import TutoringSessionNoteEditor from '../../components/tutoring/TutoringSessionNoteEditor.vue';
import InPersonTutoringSessionView from './InPersonTutoringSessionView.vue';
import TutoringSessionLearningPanel from '../../components/tutoring/TutoringSessionLearningPanel.vue';
import {useAppointmentChange} from '../../composables/useAppointmentChange';
import AppointmentChangeWizard from '../../components/schedule/AppointmentChangeWizard.vue';
import AppointmentNoShowStatus from '../../components/schedule/AppointmentNoShowStatus.vue';
import {ref,computed,onMounted,onBeforeUnmount,watch} from 'vue';
import {useRoute} from 'vue-router';
import {useAgencyStore} from '../../store/agency';
import {canPollWorkspace,useSessionPolling} from '../../composables/useSessionPolling';
import TherapySessionWorkspace from '../../components/meetings/TherapySessionWorkspace.vue';
import {startLiveMeetingPresence} from '../../utils/liveMeetingPresence';
import api from '../../services/api';
const props=defineProps({guestSessionId:{type:String,default:''}});
const route=useRoute(),agencies=useAgencyStore();
const guestApi=axios.create({baseURL:getApiBaseUrl(),withCredentials:true});
// A family invitation is an appointment capability, never an employee login.
// Staff cancellation recovery otherwise issues a protected request on mount,
// whose 401 interceptor redirects this already-open guest room to Login.
const appointmentChange=useAppointmentChange({recoverOperations:!props.guestSessionId});
const canDeclareNoShow=computed(()=>state.value?.host&&!state.value.startedAt&&
 ['scheduled','confirmed','client_confirmed','checked_in'].includes(state.value.status)&&Date.now()>=Date.parse(state.value.startAt));
function openNoShow(){
 const a=state.value;
 return appointmentChange.openWizard({appointmentId:a.appointmentId,initialEventType:'no_show',context:{
  clientId:a.clientId,clientName:a.studentName,whenLabel:scheduleLabel.value,serviceLabel:a.title,businessType:'tutoring'
 }});
}
const focused=ref(false),materials=ref([]);
const state=ref(null),loading=ref(true),error=ref(''),video=ref(null),connected=ref(false),wantsJoin=ref(false),busy=ref(false),confirmingEnd=ref(false);
const learningContext=ref(null),contextError=ref(''),noteVersion=ref(0);
const inPerson=computed(()=>String(state.value?.modality).toUpperCase()==='IN_PERSON');
const hasApprovedPlan=computed(()=>(learningContext.value?.tracks||[]).some(t=>t.bundle));
const allGoals=computed(()=>(learningContext.value?.tracks||[]).flatMap(track=>track.bundle?.goals||[]).filter(g=>Number(g.id)>0));

let appointmentId=Number(route.params.appointmentId),timer,stopped=false,polling=false,refreshQueued=false;
const scopedAgency=computed(()=>Number(agencies.currentAgency?.id)===Number(state.value?.agencyId)?agencies.currentAgency:null);
const brand=computed(()=>state.value?.branding?.agencyName||scopedAgency.value?.name||'Tutoring'),logo=computed(()=>state.value?.branding?.agencyLogoUrl||state.value?.branding?.logoUrl||scopedAgency.value?.logo_url||'');
const backPath=computed(()=>`${route.params.organizationSlug?'/'+route.params.organizationSlug:''}/${state.value?.host?'dashboard?tab=my_schedule':'guardian'}`);
const waiting=computed(()=>(state.value?.visits||[]).filter(v=>v.status==='waiting')),admitted=computed(()=>(state.value?.visits||[]).filter(v=>v.status==='admitted'));
const waitingForAdmittedConnection=computed(()=>admitted.value.some(visit=>{
 const value=String(visit.admittedAt||'').replace(' ','T');
 const seconds=Date.now()-Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(value)?value:value+'Z');
 return seconds>=0&&seconds<45000&&!visit.mediaDurationSeconds;
}));
const ended=computed(()=>state.value?.status==='ended'||state.value?.status==='completed'||['ending','ended'].includes(state.value?.roomState));
const closed=computed(()=>ended.value||state.value?.closed===true||!!state.value?.unavailableReason);
const statusLabel=computed(()=>state.value?.displayStatus||(ended.value?'Ended':state.value?.status==='live'||state.value?.status==='in_progress'?'In progress':'Scheduled'));
const formatTime=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:state.value?.timeZone||'America/Denver',timeZoneName:'short'}).format(new Date(String(value).includes('T')?value:String(value).replace(' ','T')+'Z')):'—';
const windowExpired=computed(()=>state.value && Date.now()>Date.parse(state.value.closesAt));
const windowMessage=computed(()=>Date.now()>Date.parse(state.value?.closesAt)
 ? 'The join window for this tutoring session has closed.'
 : `This tutoring room opens ${formatTime(state.value?.opensAt)}, 30 minutes before the appointment.`);
const scheduleLabel=computed(()=>formatTime(state.value?.startAt));
const path=suffix=>props.guestSessionId?`/tutoring-guest/${props.guestSessionId}${suffix||''}`:`/tutoring-sessions/${appointmentId}${suffix||''}`;
const scopedParams=computed(()=>Object.fromEntries(['agencyId','clientId','serviceId'].filter(k=>route.query[k]).map(k=>[k,route.query[k]])));
const params=()=>scopedParams.value;
const contextKey=()=>`${appointmentId}:${JSON.stringify(params())}`;
const request=async(suffix,method='get',body,options={})=>{const key=contextKey();const r=await (props.guestSessionId?guestApi:api)({timeout:30000,...options,url:path(suffix),method,data:body,params:params(),skipGlobalLoading:true});if(stopped||key!==contextKey())throw Object.assign(new Error('Session context changed.'),{stale:true});return r.data;};
const workspaceRequest=(suffix,{method='GET',body}={})=>request(`/workspace${suffix||''}`,method,body);
// Keep a successful admitted board session active even while a device is reconnecting.
let stopPresence;
const reconnectError = ref('');
let mediaPaused = false;
function clearPresence() {
 stopPresence?.();
 stopPresence = null;
}
function updatePresence() {
 const room = state.value;
 if (mediaPaused || !wantsJoin.value || !video.value || closed.value || !room?.available ||
     !(room.host ? room.roomState === 'active' && (room.sessionHubV2 || admitted.value.length) : room.visit?.status === 'admitted')) {
  clearPresence();
  return;
 }
 stopPresence ||= startLiveMeetingPresence();
}
function joinMarker() {
 const login = localStorage.getItem('sessionId');
 return login ? 'tutoring-joined/' + login + '/' + contextKey() : null;
}
function rememberJoin(value) {
 try {
  const key = joinMarker();
  if (key) value ? sessionStorage.setItem(key, '1') : sessionStorage.removeItem(key);
 } catch { /* Browser storage is optional. */ }
}
function previouslyJoined() {
 try { const key = joinMarker(); return key && sessionStorage.getItem(key) === '1'; }
 catch { return false; }
}
async function refresh(){if(stopped||(!appointmentId&&!props.guestSessionId)||(!props.guestSessionId&&!canPollWorkspace()))return;if(polling){refreshQueued=true;return;}const key=contextKey();polling=true;try{if(wantsJoin.value&&!state.value?.host)await request('/presence','post');state.value=await request('');error.value='';if(closed.value || (video.value && !state.value.host && state.value.visit?.status !== 'admitted')){clearPresence();rememberJoin(false);video.value=null;connected.value=false;wantsJoin.value=false;}else if(!wantsJoin.value && previouslyJoined() && state.value.available &&
 (state.value.host ? state.value.roomState==='active' : state.value.visit?.status==='admitted')){
 wantsJoin.value=true;
 try { await renewVideo(); } catch(e){wantsJoin.value=false;rememberJoin(false);throw e;}
 }else if(wantsJoin.value&&!state.value.host&&!video.value){if(state.value.visit?.status==='ended'){wantsJoin.value=false;rememberJoin(false);}else if(state.value.visit?.status==='admitted')await renewVideo();else if(state.value.sessionId&&!state.value.visit&&state.value.available){await request('/join','post');refreshQueued=true;}}
 updatePresence();
 if(state.value.host&&!learningContext.value){try{learningContext.value=await request('/learning-context');contextError.value='';}catch{contextError.value='Learning context could not be loaded. Retry from this appointment.';}}
 }catch(e){if(e.stale||key!==contextKey())return;if([401,403,404,410].includes(e.response?.status)){clearPresence();state.value=null;learningContext.value=null;video.value=null;connected.value=false;wantsJoin.value=false;}error.value=e.response?.data?.error?.message||e.message;}finally{polling=false;if(refreshQueued){refreshQueued=false;void refresh();}}}
async function action(fn){if(busy.value)return;const key=contextKey();busy.value=true;error.value='';try{await fn();}catch(e){if(!e.stale&&key===contextKey())error.value=e.response?.data?.error?.message||e.message;}finally{if(key===contextKey())busy.value=false;}}
async function join(){await action(async()=>{const data=await request('/join','post');wantsJoin.value=true;rememberJoin(true);if(data.token)video.value=data;await refresh();});}
async function startInPerson(){await action(async()=>{await request('/start-in-person','post');await refresh();});}
async function admit(id){await action(async()=>{await request(`/admit/${id}`,'post');await refresh();});}
let tokenRequest = null;
async function renewVideo() {
 const key = contextKey();
 if (tokenRequest?.key === key) return tokenRequest.pending;
 mediaPaused = false;
 reconnectError.value = '';
 if (!wantsJoin.value || closed.value) throw new Error('Reopen the session from your appointment.');
 const pending = request('/token', 'post').then(data => {
  if (!wantsJoin.value || closed.value || stopped || key !== contextKey()) throw new Error('Session changed.');
  video.value = data;
 });
 tokenRequest = { key, pending };
 try { await pending; } finally { if (tokenRequest?.pending === pending) tokenRequest = null; }
}
function onMediaConnected(){connected.value=true;reconnectError.value='';updatePresence();}
async function reconnect(event) {
 connected.value = false;
 if (event?.reason === 'alone-timeout') { mediaPaused = true; clearPresence(); return; }
 if (!wantsJoin.value || closed.value) return;
 const key = contextKey();
 try { await renewVideo(); }
 catch (e) {
  if (!stopped && wantsJoin.value && key === contextKey()) reconnectError.value = e.response?.data?.error?.message || 'The video connection was interrupted. Your lesson is still open.';
 }
}
async function leave(){await action(async()=>{await request('/leave','post');rememberJoin(false);clearPresence();video.value=null;wantsJoin.value=false;connected.value=false;await refresh();});}
async function finish(){await action(async()=>{await request('/end','post');rememberJoin(false);clearPresence();video.value=null;connected.value=false;wantsJoin.value=false;confirmingEnd.value=false;await refresh();});}
const rateActivity=(targetId,rating)=>request('/lesson-review','post',{targetId,rating,requestId:crypto.randomUUID()});
const generateQuestion=input=>request('/board-draft','post',input);
async function readMaterial(id){
 if(!state.value?.host)throw new Error('Choose a material prepared for this session.');
 const key=contextKey();
 const {data}=await api.get(`/learning-class-sessions/sessions/${state.value.sessionId}/in-person-materials/${id}/file`,{responseType:'blob',skipGlobalLoading:true});
 if(key!==contextKey())throw new Error('Session changed.');
 return data;
}
watch([()=>state.value?.sessionId,()=>state.value?.host],async ([id,host])=>{
 const key=contextKey();materials.value=[];
 if(!id||!host)return;
 try{const data=await request('/materials');if(!stopped&&key===contextKey()&&state.value?.sessionId===id)materials.value=data.materials||[];}
 catch(e){if(!e.stale&&key===contextKey())contextError.value='Prepared materials could not be loaded.';}
});
const manualJoinLink=ref(''),linkNotice=ref(''),joinRecipients=ref([]),selectedRecipient=ref('');
async function revokeLink(){
 if(!selectedRecipient.value||!window.confirm('End this family member’s session invitation? This disconnects their current session access.'))return;
 await action(async()=>{await request('/invitation/revoke','post',{recipientUserId:Number(selectedRecipient.value)});manualJoinLink.value='';linkNotice.value='This invitation has ended. Copying again issues a new invitation for this family member.';});
}
async function copyJoinLink(){
 try{let data=await request('/join-link'+(selectedRecipient.value?'?recipientUserId='+Number(selectedRecipient.value):''));if(data.recipients){joinRecipients.value=data.recipients;if(data.recipients.length===1){selectedRecipient.value=String(data.recipients[0].id);data=await request('/join-link?recipientUserId='+Number(selectedRecipient.value));}else{linkNotice.value=data.recipients.length?'Choose the invited family member, then copy their session link.':'No family member currently has permission to join this appointment.';return;}}const {url}=data;manualJoinLink.value='';try{await navigator.clipboard.writeText(url);linkNotice.value='Appointment link copied.';}catch{manualJoinLink.value=url;linkNotice.value='Select and copy the appointment link.';}}
 catch(e){if(!e.stale)linkNotice.value='The appointment link could not be loaded. Try again.';}
}
onMounted(async()=>{try{if(!appointmentId&&route.params.sessionId){const {data}=await api.get(`/learning-class-sessions/sessions/${Number(route.params.sessionId)}`);appointmentId=Number(data.appointmentId);}if(!appointmentId&&!props.guestSessionId)throw new Error('Open this session from its booked appointment. Ask Support to review any older unlinked visit.');await refresh();if(state.value?.host&&(inPerson.value||state.value.sessionHubV2)&&!closed.value&&!state.value.sessionId){await request('/prepare','post');await refresh();}if(props.guestSessionId&&state.value?.available&&!closed.value)await join();timer=setInterval(refresh,5000);}catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{loading.value=false;}});
watch(()=>[route.params.appointmentId,route.query.clientId,route.query.serviceId,route.query.agencyId],()=>{clearPresence();reconnectError.value='';mediaPaused=false;appointmentId=Number(route.params.appointmentId);manualJoinLink.value='';linkNotice.value='';materials.value=[];focused.value=false;state.value=null;learningContext.value=null;contextError.value='';video.value=null;connected.value=false;wantsJoin.value=false;busy.value=false;error.value='';void refresh();});
useSessionPolling(refresh);
onBeforeUnmount(()=>{clearPresence();stopped=true;clearInterval(timer);});
</script>
<style scoped>
.hub-layout{display:grid;gap:16px}.hub-layout--host{grid-template-columns:230px minmax(0,1fr) 310px;align-items:start}.hub-context{border:1px solid #ccdce7;border-radius:12px;padding:14px;overflow-wrap:anywhere}.hub-work{min-width:0}.hub-context h2{font-size:17px}.hub-context summary{cursor:pointer;font-weight:700}.hub-layout--host :deep(.therapy-main .therapy-video){max-height:230px}.hub-layout--host :deep(.therapy-layout.has-share .therapy-video){max-height:150px}@media(max-width:1150px){.hub-layout--host{grid-template-columns:1fr}.hub-context{max-height:250px;overflow:auto}}
.tutoring-room{max-width:1800px;margin:auto;padding:24px;color:#193453;font-family:system-ui}.tutoring-room header{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.tutoring-room header img{max-width:150px;max-height:70px}.tutoring-room h1{font-size:26px}.tutoring-room header a{margin-left:auto}.tutoring-room button{padding:10px 16px;margin:6px;border:1px solid #bacbdd;border-radius:8px;background:white;color:#193453;cursor:pointer}.tutoring-room button:disabled{opacity:.55}.attendance,.session-note,.room-ended{border:1px solid #cddbe8;border-radius:14px;padding:20px;margin:20px 0}.attendance article{display:flex;align-items:center;gap:12px}.session-note label{display:grid;gap:8px}.session-note textarea{width:100%;box-sizing:border-box;font:inherit;padding:12px}[role=alert]{color:#a32035}[role=dialog]{position:fixed;z-index:10001;top:25%;left:50%;transform:translateX(-50%);max-width:500px;width:85%;padding:24px;border-radius:14px;background:white;box-shadow:0 0 0 100vmax #0008}.primary{background:#235c91!important;color:white!important}@media(max-width:600px){.tutoring-room{padding:12px}.tutoring-room header a{margin-left:0}}

.tutoring-room{box-sizing:border-box;width:100%;max-width:1920px;padding:clamp(8px,1.1vw,18px);background:#f3f7fa;min-height:80vh}.tutoring-room>header{background:#142d49;color:white;border-radius:12px;padding:12px 18px;gap:14px;margin-bottom:10px}.tutoring-room>header img{background:white;padding:5px;border-radius:6px;max-height:48px}.tutoring-room>header p,.tutoring-room h1{margin:0}.tutoring-room>header .brand-name{font-size:.78rem;color:#b1e8db}.tutoring-room>header a{color:white}.room-actions{display:flex;flex-wrap:wrap;align-items:center}.hub-layout--host{grid-template-columns:minmax(0,1fr) minmax(220px,18%);gap:10px}.hub-context{grid-column:2;grid-row:1;background:white}.hub-work{grid-column:1;grid-row:1/span 3}.hub-note{grid-column:2;border:1px solid #ccdce7;border-radius:12px;padding:12px;background:white}.hub-note>summary{cursor:pointer;font-weight:700}.hub-context section{padding-top:6px}.attendance,.room-ended{padding:12px 16px;margin:6px 0;background:white}.attendance h2{font-size:1rem}.focused .hub-context,.focused .hub-note{display:none}.focused .hub-layout{display:block}.lesson-lobby{min-height:140px;display:flex;align-items:center;justify-content:space-between;gap:1.25rem;padding:clamp(1rem,3vw,2.2rem);border:1px solid #cadbe3;border-radius:12px;background:radial-gradient(#d8e6e8 .8px,transparent .8px) #fcfefe;background-size:15px 15px}.lobby-label{color:#126459;font-weight:650;font-size:.85rem}.lesson-lobby h2{font-size:clamp(1.3rem,2.5vw,2rem);margin:.5rem 0}.lesson-lobby p{max-width:45ch;margin:0;color:#415b70}.lobby-goals{flex:0 1 40%;background:white;border-left:3px solid #61c7b5;padding:.5rem 1rem}.lobby-goals h3{margin:0;font-size:1rem}.lobby-goals ul{padding-left:1rem;margin:.4rem 0}.hub-layout--host{grid-template-rows:min-content min-content 1fr}.hub-note{grid-row:2;min-width:0}.hub-context{min-width:0}@media(max-width:700px){.lesson-lobby{display:block}.lobby-goals{margin-top:10px}}
@media(max-width:850px){.hub-layout--host{display:flex;flex-direction:column}.hub-work{order:-1}.hub-layout--host>*{box-sizing:border-box;width:100%}.tutoring-room>header img{max-width:72px}.hub-context{max-height:none}}
.attendance>summary{font-weight:650;cursor:pointer}.hub-layout:not(.hub-layout--host){grid-template-columns:minmax(0,1fr)}
</style>

<style scoped>.hub-end-confirm{position:fixed;z-index:10001;top:25%;left:50%;transform:translateX(-50%);max-width:500px;width:85%;padding:24px;border-radius:14px;background:white;box-shadow:0 0 0 100vmax #0008;color:#193453}.hub-end-confirm button{padding:10px;margin:6px;border:1px solid #bfd2de;border-radius:7px;background:white;color:#193453}</style>
