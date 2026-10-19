<template>
  <div class="training-overlay" role="dialog" aria-modal="true" aria-labelledby="training-title">
    <form class="training-editor" @submit.prevent="save">
      <h2 id="training-title">Schedule training</h2>
      <p>Live training in the app. Invitations include RSVP links; mandatory and optional attendees receive the same reminders.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <label>Title <input v-model="form.title" required maxlength="200" /></label>
      <label>Topic / information <textarea v-model="form.topic" maxlength="4000" /></label>
      <div class="training-columns">
        <label>Proctor / trainer <select v-model.number="form.proctorId" required><option disabled :value="0">Choose trainer</option><option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label>Coproctors / trainers <select v-model="form.coproctorIds" multiple><option v-for="p in people.filter(p=>p.id!==form.proctorId)" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
      </div>
      <label>Time zone <input v-model="form.timeZone" required placeholder="America/Denver" /></label>
      <fieldset><legend>Training dates</legend><div v-for="(s,i) in sessions" :key="i" class="training-columns">
        <label>Date <input v-model="s.date" type="date" required /></label><label>Start <input v-model="s.start" type="time" required /></label><label>End <input v-model="s.end" type="time" required /></label>
        <button v-if="sessions.length>1" type="button" @click="sessions.splice(i,1)">Remove date</button>
      </div><button type="button" @click="sessions.push({date:'',start:'17:00',end:'19:00'})">Add training day</button></fieldset>
      <label class="check"><input v-model="form.agencyVisible" type="checkbox" /> Show on the entire agency’s schedule</label>
      <fieldset><legend>Invitations</legend><button type="button" @click="inviteAll">Invite all staff</button><button type="button" @click="participants={}">Clear invitees</button>
        <p>Bachelor’s-level staff and practicum / intern students default to mandatory. Review and change any invitation below.</p>
        <input v-model="search" placeholder="Find staff" aria-label="Find staff" />
        <div class="training-people"><label v-for="p in filteredPeople" :key="p.id" class="training-person"><span>{{ p.name }} <small>{{ p.credential }}</small></span><select v-model="participants[p.id]" :aria-label="`${p.name} invitation`"><option value="">Not invited</option><option value="mandatory">Mandatory</option><option value="optional">Optional</option></select></label></div>
      </fieldset>
      <div class="training-columns"><label>Agenda (optional, one item per line)<textarea v-model="agenda" /></label><label>Goals (optional, one per line)<textarea v-model="goals" /></label></div>
      <fieldset><legend>Meeting defaults</legend><label class="check"><input v-model="form.videoAllowed" type="checkbox" /> Attendees may use video</label><label class="check"><input v-model="form.videoDefaultOn" type="checkbox" :disabled="!form.videoAllowed" /> Attendee video starts on</label><label class="check"><input v-model="form.muteAll" type="checkbox" /> Attendees stay muted until a proctor approves their raised hand</label><label class="check"><input v-model="transcription" type="checkbox" /> Transcribe training</label><p>Proctors have priority for screen sharing. Required attendance is recorded as unpaid indirect time for students, or Support Activity for paid staff.</p></fieldset>
      <MeetingReminderEditor v-model="reminders" /><p>These RSVP reminders stop after a response. Confirmed attendees receive one join reminder 24 hours before and one 5 minutes before. Declined invitations receive no reminders.</p>
      <label>Documents and assets (optional, up to 25 MB each)<input type="file" multiple @change="files=Array.from($event.target.files || [])" /></label>
      <p v-if="createdId">Training is scheduled. {{ uploadStatus }}</p>
      <div class="training-actions"><button type="button" :disabled="saving" @click="$emit('close')">{{ createdId ? 'Close' : 'Cancel' }}</button><button v-if="!createdId" type="submit" :disabled="saving || loading">{{ saving ? 'Scheduling…' : 'Schedule and invite' }}</button></div>
    </form>
  </div>
</template>
<script setup>
import {ref,reactive,computed,onMounted} from 'vue';
import api from '../../services/api';
import MeetingReminderEditor from './MeetingReminderEditor.vue';
import { trainingWallInstant } from '../../utils/scheduledTraining';
const props=defineProps({agencyId:{type:Number,required:true}});
const emit=defineEmits(['close','saved']);
const people=ref([]),loading=ref(true),saving=ref(false),error=ref(''),createdId=ref(null),uploadStatus=ref(''),search=ref(''),files=ref([]);
const form=reactive({title:'',topic:'',proctorId:0,coproctorIds:[],timeZone:'America/Denver',agencyVisible:false,videoAllowed:true,videoDefaultOn:false,muteAll:true});
const participants=ref({}),sessions=ref([{date:'',start:'17:00',end:'19:00'}]),agenda=ref(''),goals=ref(''),reminders=ref([10080,1440,60]),transcription=ref(true);
const filteredPeople=computed(()=>people.value.filter(p=>`${p.name} ${p.credential || ''}`.toLowerCase().includes(search.value.toLowerCase())));
function inviteAll(){participants.value=Object.fromEntries(people.value.map(p=>[p.id,p.requirement]));}
onMounted(async()=>{try{people.value=(await api.get('/team-meetings/training-roster',{params:{agencyId:props.agencyId}})).data.people;inviteAll();}catch(e){error.value=e.response?.data?.error?.message || 'Could not load agency staff.';}finally{loading.value=false;}});
async function save(){
 if(saving.value||createdId.value)return;saving.value=true;error.value='';
 try{
  const payload={...form,agencyId:props.agencyId,sessions:sessions.value.map(s=>({startAt:trainingWallInstant(s.date,s.start,form.timeZone),endAt:trainingWallInstant(s.date,s.end,form.timeZone)})),participants:Object.entries(participants.value).filter(([,v])=>v).map(([id,v])=>({userId:Number(id),required:v==='mandatory'})),agenda:agenda.value.split('\n').filter(Boolean),goals:goals.value.split('\n').filter(Boolean),meetingSettings:{transcription:transcription.value,reminders:reminders.value}};
  const {data}=await api.post('/team-meetings/training',payload);createdId.value=data.events[0].id;
  const failed=[];for(const file of files.value){try{const body=new FormData();body.append('file',file);await api.post(`/team-meetings/${createdId.value}/training/assets`,body);}catch{failed.push(file.name);}}
  if(data.delivery?.failed) error.value=`Training is scheduled, but ${data.delivery.failed} invitations could not be queued. Contact an administrator to retry delivery.`;
  uploadStatus.value=failed.length?`These files need uploading from the scheduled event: ${failed.join(', ')}`:'Invitations are queued and assets are ready.';
  emit('saved',data.events);if(!failed.length && !data.delivery?.failed)emit('close');
 }catch(e){error.value=e.response?.data?.error?.message || e.message || 'Could not schedule training.';}finally{saving.value=false;}
}
</script>
<style scoped>
.training-overlay{position:fixed;inset:0;z-index:12000;background:#12233399;display:flex;align-items:center;justify-content:center;padding:20px}.training-editor{width:min(900px,96vw);max-height:92vh;overflow:auto;background:var(--bg-card,#fff);color:var(--text-primary,#183047);padding:24px;border-radius:16px;box-shadow:0 20px 60px #0005}.training-editor label{display:flex;flex-direction:column;gap:6px;margin:12px 0}.training-editor input,.training-editor textarea,.training-editor select{font:inherit;padding:9px;border:1px solid #b6c5d0;border-radius:6px;max-width:100%}.training-editor .check{flex-direction:row;align-items:center}.training-columns{display:flex;gap:16px;flex-wrap:wrap}.training-columns>label{flex:1;min-width:140px}.training-people{max-height:260px;overflow:auto}.training-editor .training-person{flex-direction:row;align-items:center;justify-content:space-between;gap:16px}.training-person small{display:block}.training-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:16px}fieldset{border:1px solid #cbd5df;border-radius:8px;margin:16px 0;padding:12px}button{padding:8px 12px;margin-right:6px;cursor:pointer}p{line-height:1.5} [role=alert]{color:#b42318}
</style>
