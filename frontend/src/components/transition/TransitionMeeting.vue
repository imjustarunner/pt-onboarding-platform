<template>
  <div ref="dialog" class="tw-modal" role="dialog" aria-modal="true" aria-labelledby="tw-meeting-title">
    <form class="tw-modal-body" @submit.prevent="send">
      <div class="tw-heading"><div><p class="tw-eyebrow">{{ practice.name }} · {{ label }}</p><h2 id="tw-meeting-title">Meeting & RSVP invitations</h2></div><button type="button" :disabled="busy" @click="$emit('close')" aria-label="Close meeting editor">✕</button></div>
      <p>Select the people to invite. Each gets their own email with a meeting link and RSVP.</p>
      <div class="tw-tabs"><button type="button" :aria-current="mode==='new'?'page':undefined" :disabled="busy || !!created" @click="mode='new'">New training meeting</button><button type="button" :aria-current="mode==='existing'?'page':undefined" :disabled="busy || !!created" @click="mode='existing'">Add to a meeting</button></div>
      <template v-if="mode==='new'">
        <label>Meeting title <input v-model="title" required maxlength="200" :disabled="busy || !!created" /></label>
        <div class="tw-fields"><label>Trainer <select v-model.number="trainerId" required :disabled="busy || !!created"><option :value="0" disabled>Choose trainer…</option><option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><label>Date <input v-model="date" type="date" required :disabled="busy || !!created" /></label><label>Start (Mountain Time) <input v-model="start" type="time" required :disabled="busy || !!created" /></label><label>End (Mountain Time) <input v-model="end" type="time" required :disabled="busy || !!created" /></label></div>
        <label>What to prepare <textarea v-model="topic" rows="3" maxlength="4000" :disabled="busy || !!created" /></label>
        <p class="tw-muted">{{ coordinatorName }} is included as meeting coordinator. Attendance, RSVP and reminder settings use the app’s training workflow.</p>
      </template>
      <label v-else>Choose an upcoming meeting you host or attend <select v-model.number="eventId" required :disabled="busy || !!created"><option :value="0" disabled>Select a meeting…</option><option v-for="event in events" :key="event.id" :value="event.id">{{ event.title }} · {{ meetingDate(event.start_at) }}</option></select></label>
      <fieldset :disabled="busy || !!created"><legend>Review recipients · {{ selected.length }} selected</legend>
        <label v-for="p in invitees" :key="p.id" class="tw-inline"><input v-model="selected" type="checkbox" :value="p.id" />{{ p.name }}</label>
        <label class="tw-inline"><input v-model="required" type="checkbox" /> Attendance required{{ mode==='existing' ? ' (existing invitations keep their current requirement)' : '' }}</label>
      </fieldset>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <div v-if="results.length" class="tw-invite-results"><p v-for="r in results" :key="r.id">{{ r.name }}: {{ r.message }}</p></div>
      <div class="tw-actions"><button v-if="!created" class="tw-primary" type="submit" :disabled="busy || loading || !selected.length || (uncertain && mode==='new')">{{ busy ? 'Saving meeting…' : mode==='new'?'Create meeting & email invitations':'Add people & email invitations' }}</button><button v-else-if="!linked" type="button" :disabled="busy" @click="link">Link this saved meeting to the checklist</button><a v-if="created" :href="`/join/team-meeting/${created}`" target="_blank" rel="noopener">Open saved meeting</a><button type="button" :disabled="busy" @click="$emit('close')">{{ created ? 'Done' : 'Cancel' }}</button></div>
    </form>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import {useModalFocus} from '../../composables/useModalFocus';
import { trainingWallInstant } from '../../utils/scheduledTraining';
const props=defineProps({practice:Object,people:Array,invitees:Array,actorId:Number,label:String,linkMeeting:Function});
const emit=defineEmits(['close','saved']);
const mode=ref('new'),title=ref(`${props.practice.name} · ${props.label} transition training`),trainerId=ref(props.actorId),date=ref(''),start=ref('09:00'),end=ref('10:30'),topic=ref('Bring clients up to date, confirm schedules, practice the app workflows, and review the transition checklist.'),selected=ref(props.invitees.map(p=>p.id)),required=ref(true),eventId=ref(0),events=ref([]),busy=ref(false),loading=ref(true),error=ref(''),notice=ref(''),results=ref([]),created=ref(null),linked=ref(false),uncertain=ref(false);
const dialog=ref(null);useModalFocus(dialog,()=>{if(!busy.value)emit('close');});
const coordinatorName=computed(()=>props.people.find(p=>p.id===props.actorId)?.name||'You');
const meetingDate=value=>new Date(String(value).includes('T')?value:String(value).replace(' ','T')+'Z').toLocaleString('en-US',{timeZone:'America/Denver',dateStyle:'medium',timeStyle:'short'});
onMounted(async()=>{try{events.value=(await api.get('/provider-scheduling/transition-workspace/meetings',{params:{agencyId:props.practice.id}})).data.events;}catch(e){error.value=e.response?.data?.error?.message||'Could not load existing meetings.';}finally{loading.value=false;}});
async function link(){busy.value=true;try{await props.linkMeeting(created.value);linked.value=true;notice.value='Meeting saved and linked. Invitations are processed by the email queue; check RSVP below after people respond.';emit('saved',created.value);}catch(e){error.value=e.response?.data?.error?.message||'The meeting exists, but could not be linked. Use the link button; do not create it again.';}finally{busy.value=false;}}
async function send(){
 if(busy.value||created.value)return;busy.value=true;error.value='';results.value=[];
 try{
  if(mode.value==='new'){
    const participantIds=[...new Set([...selected.value,props.actorId])];
    const {data}=await api.post('/team-meetings/training',{agencyId:props.practice.id,title:title.value,topic:topic.value,proctorId:trainerId.value,coproctorIds:trainerId.value===props.actorId?[]:[props.actorId],timeZone:'America/Denver',sessions:[{startAt:trainingWallInstant(date.value,start.value,'America/Denver'),endAt:trainingWallInstant(date.value,end.value,'America/Denver')}],participants:participantIds.map(userId=>({userId,required:selected.value.includes(userId)&&required.value})),agencyVisible:false,videoAllowed:true,videoDefaultOn:false,muteAll:false,meetingSettings:{transcription:false,reminders:[1440,60]}});
    created.value=Number(data.events[0].id);
    if(data.delivery?.failed)error.value=`Meeting saved. ${data.delivery.failed} email invitations could not be queued. Review delivery from the meeting; do not create it again.`;
  }else{
    if(!events.value.some(e=>e.id===eventId.value))throw Error('Choose a meeting in this practice.');
    // Read existing invitees first; retries add only missing people and never
    // automatically resend or alter an existing attendance requirement.
    const {data:current}=await api.get(`/team-meetings/${eventId.value}/participants`,{params:{agencyId:props.practice.id}});
    for(const id of selected.value){
      const name=props.people.find(p=>p.id===id)?.name||'Employee';
      if(current.participants.some(p=>Number(p.id)===id)){results.value.push({id,name,message:'Already invited; invitation kept.'});continue;}
      try{const {data}=await api.post(`/team-meetings/${eventId.value}/attendees`,{agencyId:props.practice.id,userId:id});
        if(required.value)await api.put(`/team-meetings/${eventId.value}/participants/${id}`,{agencyId:props.practice.id,isRequired:true,isCohost:false});
        results.value.push({id,name,message:data.emailInvitationQueued?'Added · email queued':data.notificationWarning||'Added · email delivery needs review'});
      }catch(e){results.value.push({id,name,message:e.response?.data?.error?.message||'Could not finish this invitation; review the meeting before retrying.'});}
    }
    created.value=eventId.value;
  }
  await link();
 }catch(e){if(mode.value==='new'&&!created.value&&(!e.response||e.response.status>=500)&&!(e instanceof RangeError)&&!String(e.message||'').startsWith('Choose a date')){uncertain.value=true;error.value='The meeting request may have completed. Choose Add to a meeting to check existing meetings before creating another.';try{events.value=(await api.get('/provider-scheduling/transition-workspace/meetings',{params:{agencyId:props.practice.id}})).data.events;}catch{}}else error.value=e.response?.data?.error?.message||e.message||'Could not save the meeting.';}finally{busy.value=false;}
}
</script>
