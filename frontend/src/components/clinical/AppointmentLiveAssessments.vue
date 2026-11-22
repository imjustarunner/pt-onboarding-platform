<template>
  <section class="live-assessments" aria-label="Live assessments for this appointment">
    <header><img src="/auricwell/mark.svg" alt="AuricWell" /><div><h2>Live assessments</h2><p>{{ clientName || 'Client' }} · Appointment #{{ appointmentId }}</p></div></header>
    <p>Ask the questions during the session or let the respondent complete the form on screen. Completed assessments are saved in the client’s Assessments &amp; Evaluations and linked to this appointment.</p>
    <p v-if="loading" role="status">Loading assessments and session results…</p>
    <p v-if="error" role="alert" class="error">{{ error }} <button type="button" @click="load">Retry</button></p>
    <template v-if="ready">
      <nav class="live-views" aria-label="Live assessment views"><button type="button" :aria-pressed="workspaceView === 'administer'" @click="workspaceView='administer'">Choose assessment</button><button type="button" :aria-pressed="workspaceView === 'results'" @click="workspaceView='results'">Session results ({{ sessionResponses.length }})</button><button type="button" :aria-pressed="workspaceView === 'trends'" @click="workspaceView='trends'">Trends &amp; graphs</button></nav>
      <section v-if="workspaceView === 'results'" aria-label="Results from this appointment"><h3>This appointment’s results</h3>
        <p v-if="!sessionResponses.length">No completed live assessments for this appointment yet.</p>
        <button v-for="response in sessionResponses" :key="response.id" type="button" class="saved-result" @click="view(response)"><strong>{{ response.questionnaire.title }}</strong><span>{{ reporter(response) }} · {{ new Date(response.recordedAt).toLocaleString() }}</span><span>View results →</span></button>
      </section>
      <template v-if="workspaceView === 'administer'"><label>Find an assessment<input v-model="search" type="search" placeholder="Name, age, or clinical area" /></label>
      <div class="assessment-choices"><button v-for="measure in filtered" :key="measure.id" type="button" @click="start(measure)"><strong>{{ measure.title }}</strong><span>{{ measure.population }}</span><small>{{ measure.respondent === 'caregiver' ? 'Parent / guardian report' : 'Client self-report' }} · {{ measure.timeframe }}</small><b>Open full screen →</b></button></div></template>
      <template v-if="workspaceView === 'trends'"><p v-if="historyLimited">Graphs include the 500 most recent client assessments plus all results from this appointment.</p><OutcomeMeasureTrends :responses="responses" /><VanderbiltProgress :responses="responses" /><p v-if="!responses.length">Completed assessments will appear here as they are recorded.</p></template>
    </template>
    <dialog ref="dialog" class="live-assessment-dialog" aria-labelledby="live-assessment-title" @cancel.prevent="close">
      <div v-if="selected || viewed" class="live-dialog-content">
        <header class="live-dialog-header"><div><p>AuricWell · {{ clientName || 'Client' }} · Appointment #{{ appointmentId }}</p><h2 id="live-assessment-title">{{ viewed ? 'Assessment results' : selected.title }}</h2></div><button type="button" :disabled="saving" @click="close">{{ viewed ? 'Back to appointment' : 'Close' }}</button></header>
        <OutcomeMeasureResult v-if="viewed" :response="viewed" />
        <form v-else @submit.prevent="complete">
          <fieldset class="respondent-controls" :disabled="saving"><legend>Who is answering?</legend>
            <label>Respondent<select v-model="respondentChoice" required><option value="">Choose the respondent</option><option v-if="selected.respondent !== 'caregiver'" value="client">Client</option><option v-if="selected.respondent === 'caregiver'" value="guardian">Parent / guardian</option><option value="other">Other respondent</option></select></label>
            <label v-if="respondentChoice === 'guardian'">Parent / guardian<select v-model="guardianId" required><option value="">Select a linked guardian</option><option v-for="person in guardians" :key="person.id" :value="String(person.id)">{{ person.label }} · {{ person.relationship }}</option></select></label>
            <template v-if="respondentChoice === 'other'"><label>Name or consistent identifier<input v-model.trim="otherName" required maxlength="180" /></label><label>Relationship to the client<input v-model.trim="otherRelationship" required maxlength="120" /></label><p>Use a form appropriate for this respondent. Other reports stay in a separate history from client and guardian reports.</p></template>
            <label>How is it administered?<select v-model="mode"><option value="asked">Provider asks and records answers</option><option value="screen">Respondent completes on screen</option></select></label>
          </fieldset>
          <OutcomeMeasureForm v-model="answers" :measure="selected" :disabled="saving" />
          <div class="live-completion"><label class="confirm"><input v-model="confirmed" type="checkbox" :disabled="saving" />I confirmed who answered, the correct age and form, consent and clinical fit, and reviewed the responses.</label><p>{{ progress.answered }} of {{ progress.required }} required questions answered.</p><p v-if="saveError" role="alert" class="error">{{ saveError }}</p><button type="submit" class="complete-button" :disabled="saving || !respondentReady || !confirmed || progress.answered !== progress.required">{{ saving ? 'Saving securely…' : 'Mark complete & view results' }}</button></div>
        </form>
      </div>
    </dialog>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import OutcomeMeasureForm from './OutcomeMeasureForm.vue';
import OutcomeMeasureResult from './OutcomeMeasureResult.vue';
import OutcomeMeasureTrends from './OutcomeMeasureTrends.vue';
import VanderbiltProgress from './VanderbiltProgress.vue';
import { outcomeItemVisible } from '../../utils/outcomeMeasureFields.js';
import { outcomeReporter } from '../../utils/outcomeTrends.js';
const props=defineProps({clientId:{type:[Number,String],required:true},appointmentId:{type:[Number,String],required:true},clientName:String});
const measures=ref([]),responses=ref([]),guardians=ref([]),loading=ref(false),ready=ref(false),error=ref(''),search=ref('');
const workspaceView=ref('administer');
const historyLimited=ref(false);
const selected=ref(null),viewed=ref(null),answers=ref({}),dialog=ref(null),saving=ref(false),saveError=ref(''),confirmed=ref(false);
const respondentChoice=ref(''),guardianId=ref(''),otherName=ref(''),otherRelationship=ref(''),mode=ref('asked');
let sequence=0,requestId='';
const reporter=response=>outcomeReporter(response)?.label||'Respondent not recorded';
const sessionResponses=computed(()=>responses.value.filter(response=>Number(response.appointment?.id)===Number(props.appointmentId)));
const filtered=computed(()=>measures.value.filter(measure=>`${measure.title} ${measure.population} ${measure.domain}`.toLowerCase().includes(search.value.toLowerCase())));
const progress=computed(()=>{const items=(selected.value?.items||[]).filter(item=>!item.optional&&outcomeItemVisible(item,answers.value));return {required:items.length,answered:items.filter(item=>{const value=answers.value[item.key];return Array.isArray(value)?value.length>0:String(value??'').trim().length>0;}).length};});
const respondentReady=computed(()=>respondentChoice.value==='client'||respondentChoice.value==='guardian'&&guardians.value.some(person=>person.id===Number(guardianId.value))||respondentChoice.value==='other'&&otherName.value&&otherRelationship.value);
const respondent=computed(()=>respondentChoice.value==='guardian'?{type:'guardian',userId:Number(guardianId.value)}:respondentChoice.value==='other'?{type:'other',label:otherName.value,relationship:otherRelationship.value}:{type:'client'});
const hasAnswers=computed(()=>Object.values(answers.value).some(value=>String(value??'').trim()));
function reset(){selected.value=null;viewed.value=null;answers.value={};confirmed.value=false;saveError.value='';respondentChoice.value='';guardianId.value='';otherName.value='';otherRelationship.value='';mode.value='asked';requestId='';}
async function load(){const current=++sequence;ready.value=false;loading.value=true;error.value='';responses.value=[];guardians.value=[];measures.value=[];reset();dialog.value?.close?.();try{
  const [catalog,workspace]=await Promise.all([api.get('/outcome-measures/catalog',{params:{clientId:props.clientId}}),api.get(`/outcome-measures/clients/${props.clientId}/live`,{params:{appointmentId:props.appointmentId}})]);
  if(current!==sequence)return;measures.value=catalog.data.measures.filter(measure=>measure.kind!=='original_pilot');responses.value=workspace.data.responses;guardians.value=workspace.data.guardians;historyLimited.value=workspace.data.historyLimited===true;ready.value=true;
}catch(err){if(current===sequence)error.value=err.response?.data?.error?.message||'Live assessments could not be loaded. Try again.';}finally{if(current===sequence)loading.value=false;}}
async function showDialog(){await nextTick();if(dialog.value?.showModal)dialog.value.showModal();else dialog.value?.setAttribute('open','');}
function start(measure){reset();selected.value=measure;respondentChoice.value=measure.respondent==='caregiver'?'':'client';requestId=crypto.randomUUID();void showDialog();}
function view(response){reset();viewed.value=response;void showDialog();}
function close(){if(saving.value||selected.value&&hasAnswers.value&&!window.confirm('Close without saving this assessment’s answers?'))return;if(viewed.value)workspaceView.value='results';dialog.value?.close?.();dialog.value?.removeAttribute('open');reset();}
watch([respondentChoice,guardianId,otherName],()=>{if(!selected.value?.items.some(item=>item.key==='informant'))return;const label=respondentChoice.value==='guardian'?guardians.value.find(person=>person.id===Number(guardianId.value))?.label:respondentChoice.value==='other'?otherName.value:'';answers.value={...answers.value,informant:label||''};});
async function complete(){if(saving.value||!selected.value||!respondentReady.value||!confirmed.value||progress.value.answered!==progress.value.required)return;
  const current=sequence,clientId=props.clientId,appointmentId=props.appointmentId;saving.value=true;saveError.value='';
  try{const caregiver=selected.value.respondent==='caregiver';const {data}=await api.post(`/outcome-measures/clients/${clientId}`,{measureId:selected.value.id,version:selected.value.version,requestId,answers:answers.value,clinicalFitConfirmed:true,appointmentId:Number(appointmentId),respondent:respondent.value,administration:caregiver?(mode.value==='asked'?'caregiver_assisted':'caregiver'):(mode.value==='asked'?'clinician_assisted':'self')});
    if(current!==sequence)return;responses.value=[data.response,...responses.value.filter(response=>response.id!==data.response.id)];viewed.value=data.response;selected.value=null;answers.value={};
  }catch(err){if(current===sequence)saveError.value=err.response?.data?.error?.message||'The assessment could not be saved. Your answers remain here; try again.';}finally{if(current===sequence)saving.value=false;}
}
function beforeUnload(event){if(selected.value&&hasAnswers.value||saving.value){event.preventDefault();event.returnValue='';}}
watch(()=>[props.clientId,props.appointmentId],()=>{saving.value=false;void load();},{immediate:true});
onMounted(()=>window.addEventListener('beforeunload',beforeUnload));
onBeforeUnmount(()=>{sequence++;dialog.value?.close?.();window.removeEventListener('beforeunload',beforeUnload);});
</script>
<style scoped>
.live-assessments { padding:24px; color:#253e32; line-height:1.6; } header { display:flex; align-items:center; gap:14px; } header img { width:42px; height:42px; } h2 { margin:0; } header p { margin:4px 0; } p,label { font-size:13px; } label { display:grid; gap:7px; margin:16px 0; } input:not([type=checkbox]),select { padding:11px; border:1px solid #b9cdbf; border-radius:7px; background:white; font:inherit; width:100%; box-sizing:border-box; }
button { padding:12px 16px; border:1px solid #b8cbbb; border-radius:9px; background:#fff; color:#254c39; font:inherit; cursor:pointer; } button:disabled { opacity:.55; cursor:default; }.assessment-choices { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr)); gap:12px; }.assessment-choices button,.saved-result { display:grid; gap:8px; text-align:left; }.assessment-choices button span,.assessment-choices small,.saved-result span { font-size:12px; }.assessment-choices b { font-size:12px; }.saved-result { margin:12px 0; width:100%; background:#f0f6ef; }
.live-assessment-dialog { position:fixed; inset:0; margin:0; padding:0; width:100vw; height:100dvh; max-width:none; max-height:none; box-sizing:border-box; border:0; background:#fbfcfa; color:#263f33; }.live-assessment-dialog::backdrop { background:#182d24aa; }.live-dialog-content { max-width:1060px; margin:0 auto; padding:clamp(16px,4vw,40px); }.live-dialog-header { display:flex; align-items:flex-start; justify-content:space-between; border-bottom:1px solid #d2e0d6; padding-bottom:18px; gap:16px; }.live-dialog-header p { font-size:12px; }.live-dialog-header h2 { font-size:22px; }.respondent-controls { margin:24px 0; padding:16px; border:1px solid #b7cbbd; border-radius:10px; }.respondent-controls legend { font-weight:700; }.live-completion { border-top:1px solid #c6d8ca; margin-top:24px; padding-top:20px; }.confirm { display:flex; align-items:flex-start; gap:10px; }.confirm input { margin-top:4px; }.complete-button { background:#28583d; color:white; }.error { color:#922e28; padding:12px; background:#fff1ec; border-radius:8px; }
.live-views { display:flex; flex-wrap:wrap; gap:8px; margin:20px 0; }.live-views [aria-pressed=true] { background:#28583d; color:white; }.live-assessments { min-width:0; }
</style>
