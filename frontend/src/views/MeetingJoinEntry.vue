<template>
 <ApplicantInterview v-if="interview && !identified" :key="refId" :invitation-token="refId" />
 <component v-else-if="identified" :is="meetingComponent" />
 <main v-else class="calendar-guest"><h1>{{ title || 'Join meeting' }}</h1><p v-if="error" role="alert">{{ error }}</p>
  <p v-if="loading">Checking meeting access…</p>
  <template v-else><p>You are joining as a guest. To register attendance as yourself, use your private email link or <RouterLink :to="{path:'/login',query:{redirect:route.fullPath}}">sign in</RouterLink>.</p>
   <VideoSessionRoom v-if="video" v-bind="video" @leave-request="leave" @disconnected="leave" @meeting-ended="leave" />
   <p v-else-if="visit && !ended" role="status">Waiting for the host to admit {{ displayName }} (Guest)…</p>
   <p v-else-if="ended">You have left the meeting. Reopen the calendar link to request admission again.</p>
   <form v-else @submit.prevent="join"><label>Your display name<input v-model="displayName" maxlength="120" required /></label><button :disabled="busy">Request to join as guest</button></form>
  </template>
 </main>
</template>
<script setup>
import {computed,defineAsyncComponent,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {useRoute} from 'vue-router';import {useAuthStore} from '../store/auth';import api from '../services/api';
import {supervisionAccessFor} from '../utils/supervisionInvitationAccess';import {teamMeetingAccessFor} from '../utils/teamMeetingInvitationAccess';
import VideoSessionRoom from '../components/video/VideoSessionRoom.vue';
import {setApplicantInterviewMode} from '../utils/applicantInterviewMode';
const ApplicantInterview=defineAsyncComponent(()=>import('./teamMeeting/ApplicantInterviewView.vue'));
const route=useRoute(),auth=useAuthStore(),loading=ref(true),identified=ref(false),interview=ref(false),title=ref(''),displayName=ref(''),visit=ref(null),video=ref(null),error=ref(''),busy=ref(false),ended=ref(false);let timer,stopped=false,version=0;
const type=computed(()=>route.params.sessionId?'supervision':'team-meeting'),refId=computed(()=>String(route.params.sessionId||route.params.eventId));
const meetingComponent=computed(()=>type.value==='supervision'?Supervision:Team);
const Supervision=defineAsyncComponent(()=>import('./supervision/JoinSupervisionView.vue')),Team=defineAsyncComponent(()=>import('./teamMeeting/JoinTeamMeetingView.vue'));
const base=()=>`/meeting-calendar/${type.value}/${encodeURIComponent(refId.value)}`;
const opts=()=>({skipAuthRedirect:true,skipGlobalLoading:true,headers:{'X-Calendar-Guest':visit.value?.credential||''}});
async function join(){busy.value=true;error.value='';try{const url=base(),requestVersion=version;const data=(await api.post(`${url}/guests`,{displayName:displayName.value},opts())).data;if(stopped||requestVersion!==version)return;visit.value={...data,base:url};timer=setInterval(poll,4000);}catch(e){error.value=e.response?.data?.error?.message||'Cannot join meeting.';}finally{busy.value=false;}}
async function poll(){if(stopped||!visit.value||ended.value)return;const current=visit.value;try{const state=(await api.get(`${current.base}/guests/${current.id}`,opts())).data;if(current!==visit.value||stopped||ended.value)return;if(state.status==='admitted'&&!video.value){const credentials=(await api.post(`${current.base}/guests/${current.id}/video-token`,{},opts())).data;if(current===visit.value&&!stopped&&!ended.value)video.value=credentials;}if(state.status==='left')leave();}catch(e){error.value=e.response?.data?.error?.message||'Cannot check meeting status.';if([403,404,410].includes(Number(e.response?.status)))leave();}}
function leave(){if(ended.value)return;ended.value=true;clearInterval(timer);video.value=null;if(visit.value)void api.post(`${visit.value.base}/guests/${visit.value.id}/leave`,{},opts()).catch(()=>{});}
async function initialize(){const requestVersion=++version;try{
 // Resolve applicant invitations before touching staff authentication. Existing
 // onboarding or expired staff cookies must not prevent an applicant joining.
 if(type.value==='team-meeting' && /^[\w-]{32}$/.test(refId.value) && !/^\d+$/.test(refId.value)){
   let info;
   try { info=(await api.get(base(),opts())).data; }
   catch(e) { if(e.response?.status!==404)throw e; /* Staff host tokens are not calendar guest links. */ }
   if(requestVersion!==version||stopped)return;
   if(info?.interview){
     title.value=info.title;
     setApplicantInterviewMode(true);
     try{const {data}=await api.get(`/team-meetings/join-info/${encodeURIComponent(refId.value)}`,opts());
       if(requestVersion!==version||stopped)return;identified.value=data.isInterviewer===true;
     }catch{/* Applicant access uses only the invitation, never the staff cookie. */}
     if(requestVersion!==version||stopped)return;setApplicantInterviewMode(!identified.value);interview.value=true;return;
   }
 }
 // A shared opaque calendar URL must never inherit a stored personal grant.
 if(/^\d+$/.test(refId.value)&&(type.value==='supervision'?supervisionAccessFor(refId.value):teamMeetingAccessFor(refId.value))){identified.value=true;return;}
 try{const {data}=await api.get('/users/me',{skipAuthRedirect:true,skipGlobalLoading:true});if(requestVersion!==version||stopped)return;if(data?.id){auth.setAuth(null,data,null);identified.value=true;return;}}catch{/* signed-out guests remain guests */}

 const info=(await api.get(base(),opts())).data;if(requestVersion!==version||stopped)return;title.value=info.title;interview.value=info.interview;
 }catch(e){error.value=e.response?.data?.error?.message||'This meeting link is unavailable.';}finally{if(requestVersion===version)loading.value=false;}}
onMounted(initialize);
watch(()=>`${type.value}:${refId.value}`,()=>{setApplicantInterviewMode(false);leave();visit.value=null;ended.value=false;video.value=null;identified.value=false;interview.value=false;error.value='';loading.value=true;void initialize();});
onBeforeUnmount(()=>{setApplicantInterviewMode(false);stopped=true;clearInterval(timer);if(visit.value)leave();});
</script>
<style scoped>.calendar-guest{max-width:1100px;margin:30px auto;padding:24px}.calendar-guest label{display:block}.calendar-guest input,.calendar-guest button{padding:12px;margin:10px}.calendar-guest [role=alert]{color:#9c2020}</style>
