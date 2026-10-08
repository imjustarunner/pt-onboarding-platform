<template>
  <section class="manual-supervision">
    <p v-if="!assignments.length && !error">No current clinical/billing supervisor assignment is available for you to log supervision here.</p>
    <details v-if="assignments.length"><summary>Log supervision performed outside platform video</summary>
      <p>Include in-person, phone, or another video service. Explain why platform video was not used. The assigned supervisor must approve hours before they count.</p>
      <form @submit.prevent="save(false)">
        <label v-if="sessions.length">Add time after a completed individual session
          <select v-model.number="relatedSessionId"><option :value="0">Separate supervision log</option><option v-for="session in sessions.filter(s => s.sessionType === 'individual' && s.sessionFinalizedAt)" :key="session.id" :value="session.id">#{{ session.id }} · {{ formatDate(session.startAt) }}</option></select>
        </label>
        <p v-if="relatedSessionId">Record only the additional phone/in-person time. The original attendance is preserved. Only the assigned supervisor can add this continuation; overlapping time is rejected.</p>
        <label>Assigned supervisor<select v-model="assignmentId" required><option v-for="a in assignments" :key="a.id" :value="a.id">{{a.supervisor_name}}</option></select></label>
        <label>How supervision took place<select v-model="modality"><option value="IN_PERSON">In person</option><option value="PHONE">Phone</option><option value="EXTERNAL_VIDEO">Another video service</option></select></label>
        <label>Type<select v-model="sessionType"><option value="individual">Individual</option><option value="group">Group</option></select></label>
        <label v-if="sessionType === 'group'"><input v-model="isRequired" type="checkbox">This was required group supervision</label>
        <label>Started (your local time)<input v-model="startAt" type="datetime-local" required></label>
        <label>Ended (your local time)<input v-model="endAt" type="datetime-local" required></label>
        <label>Why wasn’t platform video used?<textarea v-model="reason" required minlength="10" maxlength="2000" placeholder="Explain the circumstances, including why supervision was in person." /></label>
        <label>Supervision note<textarea v-model="note" required minlength="10" maxlength="20000" placeholder="Document the supervision discussion and follow-up. Saved encrypted with the session." /></label>
        <button class="btn btn-primary" :disabled="busy || !!recordingId">Save supervision log</button>
        <button v-if="modality === 'IN_PERSON' && !relatedSessionId" type="button" class="btn btn-secondary" :disabled="busy || !!recordingId || reason.trim().length < 10" @click="save(true)">Start in-person audio transcription now</button>
      </form>
    </details>
    <div v-if="recordingId">
      <p>In-person supervision is open. Use one microphone for the room. Both participants must have signed the supervision agreement. Either person can pause below.</p>
      <ConsentedTranscriptionPanel ref="capturePanel" :base-url="`/supervision/sessions/${recordingId}`" :connected="!!microphone" :is-host="true" :get-stream="() => microphone" />
      <button class="btn btn-primary" :disabled="busy" @click="finish(recordingId,false)">Finish in-person supervision</button>
    </div>
    <p v-if="message" role="status">{{message}}</p><p v-if="error" role="alert">{{error}}</p>
    <ul><li v-for="entry in entries" :key="entry.session_id"><strong>{{formatDate(entry.start_at)}} · {{entry.modality.replaceAll('_',' ').toLowerCase()}}</strong><p>{{entry.reason}}</p><span>{{entry.approved_at?'Approved':entry.status==='MANUAL_RECORDING'?'Recording session open':'Awaiting supervisor approval'}}</span>
      <button v-if="entry.status === 'MANUAL_RECORDING' && Number(recordingId)!==Number(entry.session_id)" class="btn btn-secondary" @click="resume(entry.session_id)">Open in-person controls</button>
      <button v-if="Number(actorId)===Number(entry.supervisor_user_id) && !entry.approved_at && entry.status !== 'MANUAL_RECORDING'" class="btn btn-primary" :disabled="busy" @click="finish(entry.session_id,true)">Approve and count hours</button>
    </li></ul>
  </section>
</template>
<script setup>
import {finishMeetingTranscription} from '../../utils/finishMeetingTranscription';
import {ref,watch,onBeforeUnmount} from 'vue';import api from '../../services/api';import ConsentedTranscriptionPanel from '../video/ConsentedTranscriptionPanel.vue';
const props=defineProps({userId:[Number,String],agencyId:[Number,String],sessions:{type:Array,default:()=>[]}});const emit=defineEmits(['saved']);
const assignments=ref([]),entries=ref([]),assignmentId=ref(''),actorId=ref(null),modality=ref('IN_PERSON'),sessionType=ref('individual'),isRequired=ref(false),startAt=ref(''),endAt=ref(''),reason=ref(''),busy=ref(false),error=ref(''),message=ref(''),recordingId=ref(null),microphone=ref(null),capturePanel=ref(null);
let requestKey=crypto.randomUUID();
const note=ref('');
const relatedSessionId=ref(0);
const formatDate=value=>new Date(String(value).replace(' ','T')+(/Z$/.test(String(value))?'':'Z')).toLocaleString();
async function load(){if(!props.agencyId)return;try{const{data}=await api.get('/supervision/manual-entries',{params:{userId:props.userId,agencyId:props.agencyId},skipGlobalLoading:true});assignments.value=data.assignments;entries.value=data.entries;actorId.value=data.actorUserId;assignmentId.value ||= assignments.value[0]?.id;}catch(e){error.value=e.response?.data?.error?.message||'Unable to load manual supervision.';}}
async function resume(id){error.value='';try{microphone.value=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true},video:false});recordingId.value=id;}catch{error.value='Allow microphone access to transcribe in-person supervision.';}}
async function save(recordNow){busy.value=true;error.value='';try{const now=new Date();const{data}=await api.post('/supervision/manual-entries',{assignmentId:assignmentId.value,modality:modality.value,sessionType:sessionType.value,isRequired:isRequired.value,reason:reason.value,note:note.value,relatedSessionId:relatedSessionId.value,startAt:recordNow?now.toISOString():new Date(startAt.value).toISOString(),endAt:recordNow?new Date(+now+3600000).toISOString():new Date(endAt.value).toISOString(),recordNow,requestKey});requestKey=crypto.randomUUID();await load();emit('saved');if(recordNow)await resume(data.sessionId);else message.value='Saved for the assigned supervisor’s approval.';}catch(e){error.value=e.response?.data?.error?.message||e.message||'Unable to save supervision.';}finally{busy.value=false;}}
async function finish(id,approve){busy.value=true;error.value='';try{if(Number(recordingId.value)===Number(id)){await finishMeetingTranscription(`/supervision/sessions/${id}`);await capturePanel.value?.flush();microphone.value?.getTracks().forEach(t=>t.stop());microphone.value=null;recordingId.value=null;}const{data}=await api.post(`/supervision/manual-entries/${id}/finish`,{approve});message.value=data.pendingApproval?'Saved for supervisor approval.':'Approved. Attendance was sent through the supervision hour-credit process.';await load();emit('saved');}catch(e){error.value=e.response?.data?.error?.message||'Unable to finish supervision.';}finally{busy.value=false;}}
watch(()=>[props.userId,props.agencyId],load,{immediate:true});onBeforeUnmount(()=>{microphone.value?.getTracks().forEach(t=>t.stop());});
</script>
<style scoped>.manual-supervision{border:1px solid #c8d9d1;border-radius:12px;background:#fff;padding:18px;margin:16px 0}.manual-supervision summary{cursor:pointer;font-weight:700}.manual-supervision label{display:block;margin:12px 0}.manual-supervision input,.manual-supervision select,.manual-supervision textarea{display:block;padding:9px;width:100%;max-width:560px}.manual-supervision button{margin:8px 8px 8px 0}.manual-supervision li{padding:12px 0;border-bottom:1px solid #e2e8e5}.manual-supervision [role=alert]{color:#a12727}</style>
