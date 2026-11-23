<template>
  <div class="care-overview"><button type="button" class="care-link" :disabled="loading || saving" @click="refresh++">Refresh notes and reminders</button>
    <p v-if="loading" role="status">Checking notes and clinical reminders…</p>
    <p v-if="notesError" role="status">{{ notesError }}</p>
    <ul v-if="notes.length" class="care-list"><li v-for="row in notes" :key="row.clinicalSessionId || row.billingEncounterId || row.appointmentId">
      <button type="button" class="care-link" @click="openNote(row)">{{ row.noteStatus==='draft' ? 'Finish draft note' : 'Document session' }} · {{ row.dateOfService }} · {{ row.serviceCode || 'Session' }}</button>
      <small v-if="Number(row.providerUserId)!==Number(auth.user?.id)">{{ row.providerName || 'Assigned provider' }} is responsible for this note.</small>
    </li></ul>
    <p v-else-if="!loading && !notesError">No undocumented sessions found.</p>
    <p v-if="careError" role="status">{{ careError }}</p>
    <ul v-if="alerts.length" class="care-list care-alerts"><li v-for="alert in alerts" :key="`${alert.code}:${alert.diagnosisId || ''}`">
      <button type="button" class="care-link" @click="$emit('open-chart',alert.diagnosisId ? 'clinical' : 'treatment-plans')">{{ alert.message }}</button>
    </li></ul>
    <p v-if="care?.unavailable || care && (!care.treatmentPlan || !care.diagnosisAlerts)" role="status">Some clinical reminders could not be checked. Open the chart to review.</p>
    <div v-if="fiscal" class="care-fiscal">
      <h4>Mental-health visits since July 1</h4>
      <strong>{{ fiscal.unavailable ? 'Partial count: ' : '' }}{{ fiscal.total }} {{ fiscal.total===1?'session':'sessions' }}</strong>
      <p>Completed visits identified in this agency, including H0004. Billing units do not multiply visits. Other agencies and unrecorded visits may be missing.</p>
      <p v-if="fiscal.imported">{{ fiscal.imported }} imported encounter{{ fiscal.imported===1?'':'s' }} included. Unlinked imports may contain duplicate service lines; verify against the source.</p>
      <p v-if="fiscal.reportReview">{{ fiscal.reportAdded }} additional report-only visits included. {{ fiscal.reportReview }} reported service rows need encounter reconciliation; overlapping files do not add the same daily count again.</p>
      <p v-if="fiscal.unknownCodeRows">{{ fiscal.unknownCodeRows }} record{{ fiscal.unknownCodeRows===1?'':'s' }} with an unrecognized service code need review and are excluded.</p>
      <p>Outpatient psychotherapy identified: {{ fiscal.psychotherapyTotal || 0 }} session{{ fiscal.psychotherapyTotal===1?'':'s' }}<span v-if="fiscal.psychotherapyCountIncomplete">, plus earlier visits not classified by code</span>. Crisis sessions are excluded from this policy count.</p>
      <p v-if="fiscal.psychotherapyReviewSuggested" class="care-reminder">Before another psychotherapy visit, check the member’s payer requirements for services beyond 24 sessions this fiscal year. Continued medically necessary care can be authorized.</p>
      <p v-if="fiscal.reviewSuggested" class="care-reminder">24+ visits: review medical necessity and the payer’s authorization requirements. This total includes services outside the outpatient psychotherapy policy and is not a coverage limit.</p>
      <p v-if="fiscal.baseline">Verified total: {{ fiscal.baseline.count }} through {{ fiscal.baseline.throughDate }}. Source: {{ fiscal.baseline.reason }}</p>
      <details v-if="fiscal.history?.length"><summary>Verified total history</summary><ul class="care-list"><li v-for="revision in fiscal.history" :key="revision.id">{{ revision.count }} through {{ revision.throughDate }} · {{ revision.createdAt }} · Staff account {{ revision.actorUserId }}<small>{{ revision.reason }}</small></li></ul></details>
      <details @toggle="event=>$emit(event.target.open?'keep-open':'leave')"><summary>Record a verified earlier total</summary>
        <p>Enter the total visits from July 1 through the chosen date, including any already recorded here. It replaces that period’s calculated count; later visits are added. Each revision is saved in the history.</p>
        <form @submit.prevent="saveTotal">
          <label>Verified sessions<input v-model.number="historicalCount" type="number" min="0" max="10000" step="1" required /></label>
          <label>Of these, outpatient psychotherapy (optional)<input v-model="historicalPsychotherapyCount" type="number" min="0" :max="historicalCount" step="1" placeholder="Leave blank if unknown" /></label>
          <label>Counted through<input v-model="throughDate" type="date" :min="fiscal.period.start" :max="fiscal.period.today" required /></label>
          <label>Source / reason<textarea v-model="reason" minlength="5" maxlength="1000" required placeholder="Example: verified prior provider records" /></label>
          <p v-if="saveError" role="alert">{{ saveError }}</p><p v-if="saved" role="status">Verified total saved.</p>
          <button type="submit" :disabled="saving || fiscal.unavailable">{{ saving?'Saving…':'Save verified total' }}</button>
        </form>
      </details>
    </div>
  </div>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import {useRouter,useRoute} from 'vue-router';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
import {buildNoteAidQuery,noteAidPath} from '../../utils/noteAidLaunch.js';
const props=defineProps({clientId:[Number,String],agencyId:[Number,String]});
const emit=defineEmits(['open-chart','close','keep-open','leave','fiscal-sessions']);
const auth=useAuthStore(),router=useRouter(),route=useRoute();
const notes=ref([]),notesError=ref(''),care=ref(null),careError=ref(''),loading=ref(false);
const refresh=ref(0);
const fiscal=computed(()=>care.value?.fiscalSessions);
const alerts=computed(()=>[...(care.value?.treatmentPlan && !care.value.treatmentPlan.eligible ? [{...care.value.treatmentPlan,message:care.value.treatmentPlan.code==='treatment_plan_expired'?'Treatment plan expired: review and update the plan.':care.value.treatmentPlan.message}] : []),...(care.value?.diagnosisAlerts||[])]);
const historicalCount=ref(0),historicalPsychotherapyCount=ref(''),throughDate=ref(''),reason=ref(''),saving=ref(false),saveError=ref(''),saved=ref(false);
watch(()=>[props.clientId,props.agencyId,refresh.value],async([clientId,agencyId],_,onCleanup)=>{
  const controller=new AbortController();let active=true;onCleanup(()=>{active=false;controller.abort();});
  notes.value=[];care.value=null;notesError.value='';careError.value='';loading.value=true;saveError.value='';saved.value=false;
  const config={params:{agencyId},headers:{'X-Agency-Id':String(agencyId)},signal:controller.signal,skipGlobalLoading:true};
  const results=await Promise.allSettled([
    api.get('/clinical-data/documentation-queue',{...config,params:{agencyId,clientId,noteStatus:'undocumented',actualSessionsOnly:1,limit:80}}),
    api.get(`/clients/${clientId}/care-overview`,config)
  ]);
  if(!active)return;
  if(results[0].status==='fulfilled'){
    notes.value=(results[0].value.data.items||[]).filter(row=>Number(row.clientId)===Number(clientId)&&Number(row.agencyId)===Number(agencyId));
    if(results[0].value.data.clinicalUnavailable)notesError.value='Some note records could not load; this list may be incomplete.';
  }else notesError.value='Outstanding notes could not be checked for this chart.';
  if(results[1].status==='fulfilled'){
    care.value=results[1].value.data;const total=care.value.fiscalSessions;if(total)emit('fiscal-sessions',{clientId:Number(clientId),agencyId:Number(agencyId),totals:total});
    historicalCount.value=total?.baseline?.count||0;historicalPsychotherapyCount.value=total?.baseline?.psychotherapyCount??'';throughDate.value=total?.baseline?.throughDate||total?.period?.today||'';reason.value=total?.baseline?.reason||'';
  }else careError.value=results[1].reason?.response?.status===403?'Clinical reminders require clinical chart access.':'Clinical reminders could not load.';
  loading.value=false;
},{immediate:true});
function openNote(row){
  if(Number(row.providerUserId)!==Number(auth.user?.id)){emit('open-chart','medical-record');return;}
  if(!Number(row.clinicalSessionId)){emit('open-chart','schedule');return;}
  emit('close');router.push({path:noteAidPath({organizationSlug:route.params.organizationSlug}),query:buildNoteAidQuery({...row,agencyId:props.agencyId,clientId:props.clientId,noteType:'PROGRESS_NOTE',launchIntent:'progress_note'})});
}
async function saveTotal(){
  saving.value=true;saveError.value='';saved.value=false;
  try{const {data}=await api.post(`/clients/${props.clientId}/fiscal-session-total`,{agencyId:Number(props.agencyId),count:historicalCount.value,psychotherapyCount:historicalPsychotherapyCount.value===''?null:Number(historicalPsychotherapyCount.value),throughDate:throughDate.value,reason:reason.value,expectedRevisionId:fiscal.value?.baseline?.id||0},{headers:{'X-Agency-Id':String(props.agencyId)},skipGlobalLoading:true});care.value={...care.value,fiscalSessions:data};emit('fiscal-sessions',{clientId:Number(props.clientId),agencyId:Number(props.agencyId),totals:data});saved.value=true;}
  catch(error){saveError.value=error.response?.data?.error?.message||'The verified total could not be saved.';}
  finally{saving.value=false;}
}
</script>
<style scoped>
.care-overview{font-size:14px}.care-list{padding-left:20px}.care-list li{margin:10px 0}.care-link{font:inherit;color:var(--primary,#386e4b);text-decoration:underline;border:0;background:none;padding:0;text-align:left;cursor:pointer}.care-list small{display:block;margin-top:4px;color:#65756c}.care-alerts,.care-reminder{color:var(--warning-text,#865500)}.care-alerts .care-link{color:inherit}.care-fiscal{border-top:1px solid #dce6df;margin-top:16px;padding-top:12px}.care-fiscal h4{margin:0 0 8px}.care-fiscal p{font-size:13px;line-height:1.5;color:var(--text-secondary,#52665d)}summary{cursor:pointer;text-decoration:underline}form{display:grid;gap:10px;margin-top:12px}label{display:grid;gap:4px}input,textarea{font:inherit;border:1px solid #bbcdbf;border-radius:6px;padding:8px;min-width:0;box-sizing:border-box;width:100%}form button{font:inherit;justify-self:start;padding:8px 12px;cursor:pointer}
</style>
