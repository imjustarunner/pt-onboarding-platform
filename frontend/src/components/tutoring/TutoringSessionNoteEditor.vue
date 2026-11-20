<template>
 <section class="tutoring-note" aria-label="Tutoring summary">
  <h2>Session summary</h2><p>Appointment #{{appointmentId}} · Drafts stay private until you sign and share.</p>
  <TutoringLessonRecord ref="lessonRecord" v-if="request" :request="request" :signed="signed" />
  <p v-if="loading" role="status">Loading your saved note…</p>
  <template v-else-if="!error">
   <label>Worked on<textarea v-model="workedOn" @blur="saveOnBlur" :readonly="signed" rows="4" maxlength="20000" /></label>
   <label>How it went<textarea v-model="howItWent" @blur="saveOnBlur" :readonly="signed" rows="3" maxlength="20000" /></label>
   <label>Practice at home<textarea v-model="homePractice" @blur="saveOnBlur" :readonly="signed" rows="3" maxlength="20000" /></label>
   <fieldset v-if="goals.length&&!signed"><legend>Goals addressed</legend><label v-for="goal in goals" :key="goal.id"><input v-model="goalIds" type="checkbox" :value="Number(goal.id)"> {{goal.title}}</label><p>Recording a goal here does not change its mastery rating.</p></fieldset>
   <p v-if="signed" role="status">Signed and shared. This summary is read-only.</p>
   <template v-else><button type="button" :disabled="busy" @click="save(false)">Save session notes</button><label class="attest"><input v-model="confirmed" type="checkbox"> I reviewed this family summary and confirm my own signature. Signing also locks the saved session record.</label><button type="button" :disabled="busy||!confirmed||!ended" @click="save(true)">Sign and share</button><p v-if="!ended">End the attended session before signing. Your draft can be saved now.</p></template>
  </template>
  <p role="status">{{notice}}</p><p v-if="error" role="alert">{{error}} <button v-if="!loading" type="button" :disabled="busy" @click="load">Reload saved note</button></p>
 </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import TutoringLessonRecord from './TutoringLessonRecord.vue';
import api from '../../services/api';
const props=defineProps({appointmentId:{type:Number,required:true},params:{type:Object,default:()=>({})},ended:Boolean,request:Function,goals:{type:Array,default:()=>[]}});
const emit=defineEmits(['shared']);
const lessonRecord=ref(null);
const workedOn=ref(''),howItWent=ref(''),homePractice=ref(''),goalIds=ref([]),confirmed=ref(false),signed=ref(false),loading=ref(true),busy=ref(false),error=ref(''),notice=ref('');
let generation=0, savedDraft='', queuedDraft=false;
const draft=()=>({workedOn:workedOn.value,howItWent:howItWent.value,homePractice:homePractice.value,goalIds:[...goalIds.value]});
function saveOnBlur(){
 if(signed.value||loading.value||error.value||JSON.stringify(draft())===savedDraft)return;
 if(busy.value){queuedDraft=true;return;}
 void save(false);
}
async function load(){const own=++generation;savedDraft='';queuedDraft=false;workedOn.value='';howItWent.value='';homePractice.value='';goalIds.value=[];signed.value=false;confirmed.value=false;busy.value=false;error.value='';notice.value='';loading.value=true;
 try{const {data}=await api({url:`/tutoring-sessions/${props.appointmentId}/note`,method:'get',params:props.params,skipGlobalLoading:true});if(own!==generation)return;const note=data.note||{};const fields=data.publication?.summary||data.familyDraft||(note.metadata_json?.documentationMode==='learning_plan_checklist'?{}:{workedOn:note.summary,howItWent:note.how_it_went_json?.text,homePractice:note.homework});workedOn.value=fields.workedOn||'';howItWent.value=fields.howItWent||'';homePractice.value=fields.homePractice||'';goalIds.value=note.metadata_json?.familySummaryGoalIds||note.metadata_json?.goalIds||[];signed.value=note.status==='signed';savedDraft=JSON.stringify(draft());}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Saved notes could not be loaded. Retry before writing.';}finally{if(own===generation)loading.value=false;}}
async function save(share){if(busy.value||signed.value||loading.value||error.value)return;const own=generation,snapshot=draft();busy.value=true;notice.value='';
 try{const {data}=await api({url:`/tutoring-sessions/${props.appointmentId}/note`,method:'put',params:props.params,data:{familySummary:true,...snapshot,signAndShare:share,signatureConfirmed:confirmed.value},skipGlobalLoading:true});if(own!==generation)return;signed.value=data.note?.status==='signed';savedDraft=JSON.stringify(snapshot);notice.value=share?'Summary signed and shared with authorized family members.':'Session notes saved.';if(share)emit('shared');}catch(e){if(own===generation){notice.value=e.response?.data?.error?.message||'The note was not saved. Your text is kept; retry saving.';if(share&&e.response?.data?.error?.code==='UNRATED_LESSON_ACTIVITY')lessonRecord.value?.openForReview();}}finally{if(own===generation){busy.value=false;if(queuedDraft){queuedDraft=false;saveOnBlur();}}}}
// A Hub status refresh can pass a fresh object for the same appointment scope.
watch([()=>props.appointmentId,()=>JSON.stringify(props.params)],load,{immediate:true});
onBeforeUnmount(()=>generation++);
</script>
<style scoped>
.tutoring-note{padding:16px;border:1px solid #ccdce7;border-radius:12px;background:white}.tutoring-note label{display:grid;gap:6px;margin:12px 0}.tutoring-note textarea{box-sizing:border-box;width:100%;font:inherit;padding:10px;border:1px solid #a8bdcc;border-radius:8px}.tutoring-note .attest,.tutoring-note fieldset label{display:flex;align-items:flex-start}.tutoring-note button{padding:10px 14px;margin:5px;border:1px solid #9db4c5;border-radius:8px;background:#fff;color:#173c55}.tutoring-note button:disabled{opacity:.5}[role=alert]{color:#a32035}fieldset{border:1px solid #ccdce7}
</style>
