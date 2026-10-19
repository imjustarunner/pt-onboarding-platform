<template>
 <section class="training-panel" aria-label="Training details">
  <p v-if="error" role="alert">{{error}}</p>
  <template v-if="state">
   <h3>{{state.event.title}}</h3><p v-if="state.event.startAt">{{trainingTime}}</p><p>Trainers: {{proctors.map(p=>p.name).join(', ')}}</p><p>{{state.event.topic}}</p>
   <p v-if="state.invited">{{myInvitation?.is_required ? 'Mandatory attendance' : 'Optional attendance'}} · Training in the app</p>
   <div v-if="!live && state.invited"><p>RSVP: {{myInvitation?.rsvp || 'pending'}}. This applies to all remaining dates of this training.</p><button type="button" @click="rsvp('accepted')">I’m attending</button><button type="button" @click="rsvp('declined')">Decline</button><p>Accepting stops registration reminders. You will receive one 24-hour reminder and the join link 5 minutes before each date.</p></div>
   <p v-if="state.proctor">You are a proctor / trainer.</p>
   <div v-if="state.proctor" class="training-controls">
    <label><input type="checkbox" :checked="state.event.videoAllowed" @change="change({videoAllowed:$event.target.checked})" /> Allow attendee video</label>
    <label><input type="checkbox" :checked="state.event.videoDefaultOn" :disabled="!state.event.videoAllowed" @change="change({videoDefaultOn:$event.target.checked})" /> Attendee video on by default</label>
    <label><input type="checkbox" :checked="state.event.agencyVisible" @change="change({agencyVisible:$event.target.checked})" /> Show on agency schedule</label>
    <button v-if="live" type="button" @click="change({muteAll:true})">Mute all attendees</button><button v-if="live && state.event.muteAll" type="button" @click="change({muteAll:false})">Allow attendees to unmute</button>
    <label>Topic<textarea v-model="topic" maxlength="4000" /></label><button type="button" @click="change({topic})">Save topic</button>
   </div>
   <div v-if="live">
    <template v-if="!state.proctor"><button type="button" @click="hand(myHand?.status==='raised'?'lower':'raise')">{{myHand?.status==='raised'?'Lower hand':'Raise hand to speak'}}</button><p v-if="myHand?.status==='approved'" role="status">Your request was approved. You may unmute when ready.</p><p v-else-if="myHand?.status==='denied'" role="status">Please use private chat with a trainer.<button v-for="p in proctors" :key="p.id" type="button" @click="$emit('private-chat',p.id)">Message {{p.name}}</button></p><p v-else-if="state.event.muteAll">Raise your hand to request permission to unmute.</p></template>
    <div v-else><h4>Raised hands</h4><p v-if="!raisedHands.length">No hands raised.</p><div v-for="p in raisedHands" :key="p.user_id"><span>{{p.name}}</span> <button type="button" @click="hand('approve',p.user_id)">Allow unmute</button><button type="button" @click="deny(p.user_id)">Deny &amp; chat privately</button></div></div>
   </div>
   <h4>Documents and assets</h4><p v-if="!state.assets.length">No assets added yet.</p><ul><li v-for="a in state.assets" :key="a.id"><button type="button" @click="download(a)">{{a.filename}}</button><button v-if="state.proctor" type="button" @click="remove(a)">Remove</button></li></ul>
   <label v-if="state.proctor">Add document or asset (up to 25 MB)<input type="file" :disabled="busy" @change="upload" /></label>
   <template v-if="!live && state.invited"><MeetingAgendaPanel meeting-type="provider_schedule_event" :meeting-id="eventId" :can-add-item="state.proctor" /><MeetingGoalsActionsPanel :event-id="eventId" section="goals" :disabled="!state.proctor" /></template>
   <p v-if="state.log">Recorded attendance: {{Math.round(state.log.attendance_seconds/60)}} minutes · {{state.log.credit_type==='indirect'?'Unpaid indirect training time':state.log.credit_type==='support_activity'?'Support Activity':'Optional attendance'}}</p>
  </template>
 </section>
</template>
<script setup>
import {ref,computed,watch,onUnmounted} from 'vue';
import api from '../../services/api';
import {useAuthStore} from '../../store/auth';
import MeetingAgendaPanel from './MeetingAgendaPanel.vue';
import MeetingGoalsActionsPanel from './MeetingGoalsActionsPanel.vue';
const props=defineProps({eventId:{type:[Number,String],required:true},live:Boolean});const emit=defineEmits(['state','private-chat']);
const auth=useAuthStore(),state=ref(null),error=ref(''),busy=ref(false),topic=ref('');let timer=null;
const myInvitation=computed(()=>state.value?.participants.find(p=>Number(p.id)===Number(state.value?.viewerUserId || auth.user?.id)));
const myHand=computed(()=>state.value?.hands.find(p=>Number(p.user_id)===Number(state.value?.viewerUserId || auth.user?.id)));
const raisedHands=computed(()=>state.value?.hands.filter(p=>p.status==='raised') || []);
const proctors=computed(()=>state.value?.participants.filter(p=>p.isHost || Number(p.is_cohost)) || []);
const trainingTime=computed(()=>{const format=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:state.value?.event.timeZone || 'America/Denver'});const date=v=>new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(v)?v:`${String(v).replace(' ','T')}Z`);return `${format.format(date(state.value.event.startAt))} – ${format.format(date(state.value.event.endAt))} (${state.value.event.timeZone})`;});
const base=computed(()=>`/team-meetings/${props.eventId}/training`);
async function load(){try{const {data}=await api.get(base.value,{skipGlobalLoading:true});if(!state.value)topic.value=data.event.topic || '';state.value=data;error.value='';emit('state',data);}catch(e){error.value=e.response?.data?.error?.message || 'Could not load training.';}}
watch(()=>[props.eventId,props.live],()=>{state.value=null;clearInterval(timer);void load();if(props.live)timer=setInterval(load,2500);},{immediate:true});onUnmounted(()=>clearInterval(timer));
async function rsvp(response){try{await api.post(`${base.value}/rsvp`,{response});await load();}catch(e){error.value=e.response?.data?.error?.message || 'Could not save RSVP.';}}
async function change(body){try{await api.patch(base.value,body);await load();}catch(e){error.value=e.response?.data?.error?.message || 'Could not update training.';}}
async function hand(action,userId){try{await api.post(`${base.value}/hand`,{action,userId});await load();return true;}catch(e){error.value=e.response?.data?.error?.message || 'Could not update hand.';return false;}}
async function deny(id){if(await hand('deny',id))emit('private-chat',id);}
async function upload(e){const file=e.target.files?.[0];if(!file)return;busy.value=true;try{const fd=new FormData();fd.append('file',file);await api.post(`${base.value}/assets`,fd);await load();e.target.value='';}catch(e){error.value=e.response?.data?.error?.message || 'Upload failed.';}finally{busy.value=false;}}
async function download(asset){try{const {data}=await api.get(`${base.value}/assets/${asset.id}`,{responseType:'blob'});const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=asset.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch{error.value='Download failed.';}}
async function remove(asset){try{await api.delete(`${base.value}/assets/${asset.id}`);await load();}catch{error.value='Could not remove asset.';}}
defineExpose({hand,load});
</script>
<style scoped>
.training-panel{padding:16px;margin:12px 0;border:1px solid #8da4bc;border-radius:10px;max-width:100%;color:inherit}.training-controls{display:flex;flex-direction:column;gap:10px}.training-controls label{display:block}.training-controls textarea{display:block;width:100%;min-height:60px}.training-panel button{padding:7px 10px;margin:4px;border:1px solid #849ab0;border-radius:6px;cursor:pointer}.training-panel p{line-height:1.5}.training-panel ul{padding-left:20px}[role=alert]{color:#c43528}
</style>
