<template>
  <section class="diagnosis-review" aria-label="Diagnosis documentation and review">
    <div v-for="alert in alerts" :key="`${alert.code}:${alert.diagnosisId}`" class="diagnosis-alert" role="status">{{ alert.message }}</div>
    <details @toggle="onToggle">
      <summary>Diagnosis evidence and review</summary>
      <p v-if="loading">Loading diagnosis documentation…</p><p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <p>Each diagnosis retains its own justification. Supporting records or your documented qualified clinician evaluation may establish evidence. This review does not rewrite a signed note.</p>
      <article v-for="diagnosis in diagnoses" :key="diagnosis.id">
        <strong>{{ diagnosis.icd10_code }} {{ diagnosis.description }} <span v-if="diagnosis.is_primary">· Primary</span></strong>
        <p>{{ diagnosis.justification || 'Clinical justification is missing.' }}</p>
        <form v-if="!readOnly" @submit.prevent="save(diagnosis)">
          <label v-if="/^F43\.2/.test(diagnosis.icd10_code)">Precipitating event month<input v-model="drafts[diagnosis.id].stressorEventMonth" type="month" required /></label>
          <label>Supporting medical records<select v-model="drafts[diagnosis.id].evidenceDocumentIds" multiple><option v-for="document in documents" :key="document.id" :value="document.id">{{ document.original_name || `Document ${document.id}` }}</option></select></label>
          <p v-if="!documents.length">Upload outside medical records to the client's supporting documents, then refresh this review.</p>
          <details v-if="diagnosis.review?.evaluation_note"><summary>Recorded clinician evaluation</summary><p>{{ diagnosis.review.evaluation_note }}</p><small>Clinician #{{ diagnosis.review.qualified_evaluator_user_id }} · {{ new Date(diagnosis.review.evaluation_authored_at || diagnosis.review.reviewed_at).toLocaleDateString() }}</small></details>
          <label>New qualified clinician evaluation<textarea v-model="drafts[diagnosis.id].evaluationNote" rows="3" placeholder="Licensed clinicians may document their own evaluation and the findings supporting this diagnosis." /></label>
          <label>Review reason<textarea v-model="drafts[diagnosis.id].reason" rows="2" required /></label>
          <button type="submit" :disabled="busy">Save diagnosis review</button>
        </form>
        <details v-if="diagnosis.reviewHistory?.length > 1"><summary>Diagnosis review history ({{ diagnosis.reviewHistory.length }})</summary><p v-for="review in diagnosis.reviewHistory" :key="review.id">{{ new Date(review.reviewed_at).toLocaleString() }} · Reviewer #{{ review.reviewed_by_user_id }} · {{ review.review_reason }}</p></details>
        <p v-if="diagnosis.review?.reviewed_at">Last reviewed: {{ new Date(diagnosis.review.reviewed_at).toLocaleDateString() }}</p>
      </article>
      <p v-if="!loading && !diagnoses.length">No active diagnoses recorded.</p>
      <button type="button" :disabled="loading || busy" @click="load">Refresh documentation</button>
      <form v-if="providerUserId && !readOnly" class="supervisor-policy" @submit.prevent="savePermission">
        <strong>Supervisor permission for this provider</strong>
        <p>Only the assigned licensed supervisor can authorize non-F primary diagnoses under their supervision. Coverage and credential limits still apply.</p>
        <label><input v-model="allowNonFPrimary" type="checkbox" /> Allow this supervisee to use covered non-F primary diagnoses</label>
        <label>Reason<textarea v-model="permissionReason" rows="2" required /></label>
        <button :disabled="busy" type="submit">Record supervisor permission</button>
      </form>
    </details>
  </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[String,Number],required:true},clientId:{type:[String,Number],required:true},providerUserId:{type:[String,Number],default:null},readOnly:Boolean});
const emit=defineEmits(['changed']);
const diagnoses=ref([]),documents=ref([]),alerts=ref([]),drafts=ref({}),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),allowNonFPrimary=ref(false),permissionReason=ref('');
let generation=0;
async function load(){if(!props.agencyId||!props.clientId)return;const g=++generation;loading.value=true;error.value='';try{const {data}=await api.get('/medical-billing/diagnoses/review',{params:{agencyId:props.agencyId,clientId:props.clientId},skipGlobalLoading:true});if(g!==generation)return;diagnoses.value=data.diagnoses||[];documents.value=data.documents||[];alerts.value=data.alerts||[];drafts.value=Object.fromEntries(diagnoses.value.map(d=>[d.id,{evidenceDocumentIds:d.review?.evidenceDocumentIds||[],evaluationNote:'',stressorEventMonth:d.review?.stressor_event_month||'',reason:''}]));}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||e.message;}finally{if(g===generation)loading.value=false;}}
function onToggle(event){if(event.target.open&&!diagnoses.value.length&&!loading.value)load();}
async function save(diagnosis){busy.value=true;error.value='';notice.value='';try{await api.post(`/medical-billing/diagnoses/${diagnosis.id}/review`,{agencyId:Number(props.agencyId),clientId:Number(props.clientId),...drafts.value[diagnosis.id],evaluationNote:drafts.value[diagnosis.id].evaluationNote.trim() || undefined},{skipGlobalLoading:true});notice.value='Diagnosis review recorded with your identity and timestamp.';await load();emit('changed');}catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
async function loadPermission(){if(!props.agencyId||!props.providerUserId||props.readOnly)return;try{const {data}=await api.get(`/medical-billing/providers/${props.providerUserId}/diagnosis-policy`,{params:{agencyId:props.agencyId},skipGlobalLoading:true});allowNonFPrimary.value=Number(data.current?.allow_non_f_primary)===1;}catch(e){error.value=e.response?.data?.error?.message||e.message;}}
async function savePermission(){busy.value=true;error.value='';try{await api.put(`/medical-billing/providers/${props.providerUserId}/diagnosis-policy`,{agencyId:Number(props.agencyId),allowNonFPrimary:allowNonFPrimary.value,reason:permissionReason.value},{skipGlobalLoading:true});notice.value='Supervisor diagnosis permission recorded.';permissionReason.value='';}catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
watch(()=>[props.agencyId,props.providerUserId,props.readOnly],loadPermission,{immediate:true});
watch(()=>[props.agencyId,props.clientId],()=>{generation++;diagnoses.value=[];alerts.value=[];drafts.value={};load();},{immediate:true});
</script>
<style scoped>
.diagnosis-review{margin:12px 0}.diagnosis-review details{padding:12px;border:1px solid #cbd5e1;border-radius:9px}.diagnosis-review summary{cursor:pointer;font-weight:650}.diagnosis-alert{padding:12px;margin:7px 0;background:#fff4df;border-left:4px solid #b9771b}.diagnosis-review article,.supervisor-policy{padding:12px 0;border-top:1px solid #d9e2e8;margin-top:12px}.diagnosis-review label{display:grid;gap:4px;margin:8px 0}.diagnosis-review input,.diagnosis-review textarea,.diagnosis-review select{font:inherit;padding:8px;border:1px solid #b8cad5;border-radius:6px;max-width:100%;box-sizing:border-box}.diagnosis-review button{padding:8px 12px;background:white;border:1px solid #8aa8bc;border-radius:6px;color:#20536b}.error{color:#a3261b}
</style>
