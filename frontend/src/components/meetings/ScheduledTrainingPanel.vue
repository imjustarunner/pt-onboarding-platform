<template>
 <section class="training-panel" aria-label="Training details">
  <p v-if="error" role="alert">{{error}}</p>
  <template v-if="state">
   <nav v-if="!live" class="training-tabs" aria-label="Training record sections"><button v-for="tab in tabs" :key="tab" type="button" :aria-pressed="activeTab===tab" @click="activeTab=tab">{{tab}}</button></nav>
   <div v-show="live || activeTab==='Overview'">
   <div v-if="!live" class="training-response-summary"><button v-for="status in responseStatuses" :key="status" class="rsvp-status" :class="`rsvp-status--${status}`" type="button" @click="activeTab='RSVP'">{{status==='accepted'?'Attending':status==='declined'?'Not attending':'Pending'}}: {{state.participants.filter(p=>(p.rsvp || 'pending')===status).length}}</button></div>
   <h3>{{state.event.title}}</h3><p v-if="state.event.startAt">{{trainingTime}}</p><p>Trainers: {{proctors.map(p=>p.name).join(', ')}}</p><p>{{state.event.topic}}</p>
   <p v-if="state.invited">{{myInvitation?.is_required ? 'Mandatory attendance' : 'Optional attendance'}} · Training in the app</p>
   <div v-if="!live && (state.invited || state.canRegister)"><p>RSVP: {{myInvitation?.rsvp || 'pending'}}. This applies to all remaining dates of this training.</p><p v-if="myInvitation?.rsvp_decline_reason">Reason: {{myInvitation.rsvp_decline_reason}}</p><button type="button" @click="rsvp('accepted')">I’m attending</button><button type="button" @click="Number(myInvitation?.is_required) ? declining=true : rsvp('declined')">{{Number(myInvitation?.is_required) ? 'Decline' : 'Decline and stop reminders'}}</button><div v-if="declining"><label>Reason for not attending{{Number(myInvitation?.is_required) ? ' (required)' : ' (optional)'}}<textarea v-model="declineReason" maxlength="2000" rows="3" /></label><button type="button" :disabled="Number(myInvitation?.is_required)===1 && !declineReason.trim()" @click="rsvp('declined')">Confirm decline</button></div><p>{{state.reminderDescription || 'Accepting stops registration reminders. Confirmed attendees receive one 24-hour reminder and the join link 5 minutes before each date.'}}</p></div>
   </div>
   <div v-if="!live && activeTab==='RSVP'"><h4>{{ state.canSeeDeclined ? 'RSVP responses' : 'Attending' }}</h4><p v-if="!visibleResponses.length">No confirmed attendees yet.</p><ul><li v-for="person in visibleResponses" :key="person.id"><strong>{{person.name}}</strong> <span class="rsvp-status" :class="`rsvp-status--${person.rsvp || 'pending'}`">{{person.rsvp==='declined'?'Not attending':person.rsvp==='accepted'?'Attending':'Pending'}}</span><span v-if="person.rsvp_decline_reason"> · Reason: {{person.rsvp_decline_reason}}</span></li></ul></div>
   <p v-if="state.proctor && (live || activeTab==='Overview')">You are a proctor / trainer.</p>
   <div v-if="state.proctor && (live || activeTab==='Overview')" class="training-controls">
    <label><input type="checkbox" :checked="state.event.videoAllowed" @change="change({videoAllowed:$event.target.checked})" /> Allow attendee video</label>
    <label><input type="checkbox" :checked="state.event.videoDefaultOn" :disabled="!state.event.videoAllowed" @change="change({videoDefaultOn:$event.target.checked})" /> Attendee video on by default</label>
    <label><input type="checkbox" :checked="state.event.agencyVisible" @change="change({agencyVisible:$event.target.checked})" /> Show on agency schedule</label>
    <button v-if="live" type="button" @click="change({muteAll:true})">Mute all attendees</button><button v-if="live && state.event.muteAll" type="button" @click="change({muteAll:false})">Allow attendees to unmute</button>
    <label>Topic<textarea v-model="topic" maxlength="4000" /></label><button type="button" @click="change({topic})">Save topic</button>
   </div>
   <div v-if="live">
    <template v-if="!state.proctor"><p v-if="myHand?.status==='approved'" role="status">Your request was approved. You may unmute when ready.</p><p v-else-if="myHand?.status==='denied'" role="status">Please use private chat with a trainer.<button v-for="p in proctors" :key="p.id" type="button" @click="$emit('private-chat',p.id)">Message {{p.name}}</button></p></template>
    <div v-else><h4>Raised hands</h4><p v-if="!raisedHands.length">No hands raised.</p><div v-for="p in raisedHands" :key="p.user_id"><span>{{p.name}}</span> <button type="button" @click="hand('approve',p.user_id)">Allow unmute</button><button type="button" @click="deny(p.user_id)">Deny &amp; chat privately</button></div><h4>Speaker permissions</h4><div v-for="person in attendees" :key="person.id" class="speaker-row"><span>{{person.name}}</span><button type="button" @click="hand(state.approvedIds?.includes(Number(person.id))?'mute':'allow',person.id)">{{state.approvedIds?.includes(Number(person.id))?'Mute / lock mic':'Allow unmute'}}</button><button type="button" @click="$emit('private-chat',person.id)">Message privately</button></div></div>
   </div>
   <div v-show="live || activeTab==='Documents'">
   <h4>Documents and assets</h4><p v-if="!state.assets.length">No assets added yet.</p><ul><li v-for="a in state.assets" :key="a.id"><button type="button" @click="download(a)">{{a.filename}}</button><button v-if="state.proctor" type="button" @click="remove(a)">Remove</button></li></ul>
   <label v-if="state.proctor">Add document or asset (up to 25 MB)<input type="file" :disabled="busy" @change="upload" /></label>
   </div>
   <template v-if="!live && state.invited && activeTab==='Agenda'"><MeetingAgendaPanel meeting-type="provider_schedule_event" :meeting-id="eventId" :can-add-item="state.proctor" /><MeetingGoalsActionsPanel :event-id="eventId" section="goals" :disabled="!state.proctor" /></template>
   <MeetingAttendancePanel v-if="!live && state.invited && activeTab==='Attendance'" :event-id="eventId" />
   <MeetingNotesPanel v-if="!live && state.invited && activeTab==='Notes'" :event-id="eventId" :read-only="!state.proctor" :initial-expanded="true" />
   <p v-if="state.log && (live || activeTab==='Overview' || activeTab==='Attendance')">Recorded attendance: {{Math.round(state.log.attendance_seconds/60)}} minutes · {{state.log.credit_type==='indirect'?'Unpaid indirect training time':state.log.credit_type==='support_activity'?'Support Activity':state.log.credit_type==='admin_time'?'Administrative time override':'Optional attendance'}}</p>
  </template>
 </section>
</template>
<script setup>
import {ref,computed,watch,onUnmounted} from 'vue';
import api from '../../services/api';
import {useAuthStore} from '../../store/auth';
import MeetingAgendaPanel from './MeetingAgendaPanel.vue';
import MeetingAttendancePanel from './MeetingAttendancePanel.vue';
import MeetingNotesPanel from './MeetingNotesPanel.vue';
import MeetingGoalsActionsPanel from './MeetingGoalsActionsPanel.vue';
const props=defineProps({eventId:{type:[Number,String],required:true},live:Boolean});const emit=defineEmits(['state','private-chat','rsvp-saved']);
const auth=useAuthStore(),state=ref(null),error=ref(''),busy=ref(false),topic=ref('');let timer=null;
const activeTab=ref('Overview');
const responseStatuses=computed(()=>state.value?.canSeeDeclined?['accepted','pending','declined']:['accepted']);
const tabs=['Overview','RSVP','Agenda','Attendance','Notes','Documents'];
const attendees=computed(()=>state.value?.participants.filter(p=>!p.isHost && !Number(p.is_cohost)) || []);
const declining=ref(false),declineReason=ref('');
const myInvitation=computed(()=>state.value?.viewerInvitation || state.value?.participants.find(p=>Number(p.id)===Number(state.value?.viewerUserId || auth.user?.id)));
const visibleResponses=computed(()=>state.value?.participants.filter(p=>state.value?.canSeeDeclined || p.rsvp==='accepted') || []);
const myHand=computed(()=>state.value?.hands.find(p=>Number(p.user_id)===Number(state.value?.viewerUserId || auth.user?.id)));
const raisedHands=computed(()=>state.value?.hands.filter(p=>p.status==='raised') || []);
const proctors=computed(()=>state.value?.participants.filter(p=>p.isHost || Number(p.is_cohost)) || []);
const trainingTime=computed(()=>{const format=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:state.value?.event.timeZone || 'America/Denver'});const date=v=>new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(v)?v:`${String(v).replace(' ','T')}Z`);return `${format.format(date(state.value.event.startAt))} – ${format.format(date(state.value.event.endAt))} (${state.value.event.timeZone})`;});
const base=computed(()=>`/team-meetings/${props.eventId}/training`);
async function load(){try{const {data}=await api.get(base.value,{skipGlobalLoading:true});if(!state.value)topic.value=data.event.topic || '';state.value=data;error.value='';emit('state',data);}catch(e){error.value=e.response?.data?.error?.message || 'Could not load training.';}}
watch(()=>[props.eventId,props.live],()=>{state.value=null;clearInterval(timer);void load();if(props.live)timer=setInterval(load,2500);},{immediate:true});onUnmounted(()=>clearInterval(timer));
async function rsvp(response){try{await api.post(`${base.value}/rsvp`,{response,reason:response==='declined'?declineReason.value:''});declining.value=false;declineReason.value='';await load();emit('rsvp-saved');window.dispatchEvent(new CustomEvent('meeting-rsvp-changed'));}catch(e){error.value=e.response?.data?.error?.message || 'Could not save RSVP.';}}
async function change(body){try{await api.patch(base.value,body);await load();}catch(e){error.value=e.response?.data?.error?.message || 'Could not update training.';}}
async function hand(action,userId){try{await api.post(`${base.value}/hand`,{action,userId});await load();return true;}catch(e){error.value=e.response?.data?.error?.message || 'Could not update hand.';return false;}}
async function deny(id){if(await hand('deny',id))emit('private-chat',id);}
async function upload(e){const file=e.target.files?.[0];if(!file)return;busy.value=true;try{const fd=new FormData();fd.append('file',file);await api.post(`${base.value}/assets`,fd);await load();e.target.value='';}catch(e){error.value=e.response?.data?.error?.message || 'Upload failed.';}finally{busy.value=false;}}
async function download(asset){try{const {data}=await api.get(`${base.value}/assets/${asset.id}`,{responseType:'blob'});const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=asset.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch{error.value='Download failed.';}}
async function remove(asset){try{await api.delete(`${base.value}/assets/${asset.id}`);await load();}catch{error.value='Could not remove asset.';}}
defineExpose({hand,load});
</script>
<style scoped>
.training-tabs { display:flex; flex-wrap:wrap; gap:4px; border-bottom:1px solid #cbd5e1; margin-bottom:12px; }
.training-tabs button[aria-pressed=true] { background:#e8f3ee; border-color:#17634b; font-weight:700; }
.rsvp-status { display:inline-block; padding:3px 9px; border-radius:12px; margin:4px; font-weight:700; }
.rsvp-status--accepted { background:#d1fae5; color:#065f46; }.rsvp-status--declined { background:#fee2e2; color:#991b1b; }.rsvp-status--pending { background:#fef3c7; color:#92400e; }
.speaker-row { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }.speaker-row>span { flex:1; }

.training-panel{padding:16px;margin:12px 0;border:1px solid #8da4bc;border-radius:10px;max-width:100%;color:inherit}.training-controls{display:flex;flex-direction:column;gap:10px}.training-controls label{display:block}.training-controls textarea{display:block;width:100%;min-height:60px}.training-panel button{padding:7px 10px;margin:4px;border:1px solid #849ab0;border-radius:6px;cursor:pointer}.training-panel p{line-height:1.5}.training-panel ul{padding-left:20px}[role=alert]{color:#c43528}
</style>
