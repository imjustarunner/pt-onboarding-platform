<template>
 <section class="coverage-check" aria-label="Insurance verification">
  <h4>Insurance verification</h4>
  <p>Verify both policies for the visit date, then resolve payer order. Medicaid eligibility alone does not rule out other insurance or guarantee payment.</p>
  <div class="verification-controls"><label>Date of service <input v-model="reviewDate" type="date" :disabled="busy || !!serviceDate" @change="load" /></label>
  <p v-if="serviceDate">This verification applies to the claim’s date of service, {{ formatBillingDate(reviewDate) }}.</p>
  <button type="button" :disabled="busy" @click="load">Load verification history</button>
  <label>Billing office <select v-model="officeId" :disabled="busy || officesLoading"><option value="">Select</option><option v-for="office in offices" :key="office.id" :value="office.id">{{ office.name }} · {{ office.practice_npi }}</option></select></label>
  <label>Lookup method <select v-model="lookupMode" :disabled="busy || officesLoading"><option value="member_id">Saved member ID and identity</option><option value="demographics">Colorado Medicaid: member name and date of birth</option></select></label>
  <button v-for="slot in ['primary','secondary']" :key="slot" type="button" :disabled="busy || officesLoading || !officeId || automaticPending" @click="check(slot)">Check {{ slot }} eligibility</button></div>
  <p class="verification-help">Check primary and secondary coverage separately. For Colorado Medicaid, an ID listed under another holder is skipped; the lookup uses the client’s legal name and birth date. Save insurance details before checking. Claim.MD uses this organization’s selected billing identity. A payer may require a separate eligibility route or enrollment. Billing can document payer-portal or phone verification when electronic checks are unavailable.</p>
  <section v-if="evidence.automaticEligibility" class="automatic-status" aria-label="Automatic insurance verification"><strong>Automatic verification</strong><p>{{ evidence.automaticEligibility.message }}</p><ul v-if="evidence.automaticEligibility.missing?.length"><li v-for="item in evidence.automaticEligibility.missing" :key="item.slot">{{ item.slot === 'primary' ? 'Primary' : 'Secondary' }}: {{ item.message }}</li></ul></section>
  <div class="verification-feedback" aria-live="polite"><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p><p v-if="checkingSlot" role="status">Checking {{ checkingSlot }} coverage through Claim.MD…</p></div>
  <p v-if="coverageLoading" role="status">Loading saved coverage and verification sources…</p>
  <p v-if="evidence.review" role="status"><strong>Saved review: {{ evidence.review.status }}</strong> · {{ formatBillingDate(reviewDate) }} · {{ formatBillingTimestamp(evidence.review.created_at) }}. {{ evidence.review.evidence?.reference }}</p>
  <ul><li v-for="blocker in evidence.blockers" :key="blocker">{{ blocker }}</li></ul>
  <details v-if="evidence.checks?.length" class="verification-history"><summary>Verification history ({{ evidence.checks.length }})</summary><article v-for="check in evidence.checks" :key="check.id">
   <strong>{{ check.policy_slot }} · {{ check.evidence?.summary?.status || check.status }} · {{ formatBillingTimestamp(check.created_at) }}</strong>
   <p v-if="check.evidence?.failure" role="alert">{{ check.evidence.failure.message }}<small v-if="check.evidence.failure.upstreamCodes?.length"> Claim.MD code: {{ check.evidence.failure.upstreamCodes.join(', ') }}</small></p>
   <p v-if="check.evidence?.summary?.otherCoverageReported">Other coverage reported — investigate and resolve payer order before billing.</p>
   <p v-if="check.evidence?.summary?.identityMatches === false" role="alert">Reconcile the returned member identity with the saved insurance record before billing.</p>
   <p v-for="(payerError,index) in check.evidence?.summary?.payerErrors || []" :key="index" role="alert">{{ payerError.error_mesg }} ({{ payerError.error_code }})</p>
   <details v-if="check.evidence?.result"><summary>View payer response and benefits</summary><pre>{{ JSON.stringify(check.evidence.result,null,2) }}</pre></details>
  </article></details>
  <form v-if="hasCoverageData" @submit.prevent="review">
   <fieldset :disabled="busy || !coverageReady">
   <h5>Document verification and coordination of benefits</h5>
   <label>Outcome <select v-model="draft.status"><option value="unresolved">Unresolved — hold claims</option><option value="verified">Verified for this date</option><option value="inactive">Inactive — review coverage</option></select></label>
   <label>Source <select v-model="draft.source"><option v-if="evidence.syntheticQaReviewAvailable" value="synthetic_qa">Fictional QA review—no payer contact</option><option value="payer_portal">Payer / Medicaid portal</option><option value="claimmd">Claim.MD responses</option><option value="payer_phone">Payer phone verification</option></select></label>
   <p v-if="draft.source==='synthetic_qa'" role="status">Review fictional policies and other-coverage/TPL test data only. No real payer contact or actual benefits are attested.</p>
   <label>Evidence / reference <textarea v-model="draft.reference" maxlength="2000" required placeholder="Record portal response/reference or call reference, verification date, other-coverage findings and resolved payer order." /></label>
   <label v-for="item in attestations" :key="item.key"><input v-model="draft[item.key]" type="checkbox" /> {{ draft.source==='synthetic_qa' ? 'Fictional QA check: '+item.label.replace('in the Medicaid portal','in the synthetic test data') : item.label }}</label>
   <button :disabled="busy">Save dated verification</button>
   </fieldset>
  </form>
 </section>
</template>
<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api.js';
import { formatBillingDate,formatBillingTimestamp } from '../../utils/billingReviewDisplay.js';
const props=defineProps({clientId:[Number,String],agencyId:[Number,String],serviceDate:String,billingOfficeId:[Number,String]});
const emit=defineEmits(['saved']);
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Denver'});
const reviewDate=ref(props.serviceDate?.slice(0,10)||today()),officeId=ref(props.billingOfficeId||''),offices=ref([]),error=ref(''),notice=ref(''),evidence=ref({checks:[],blockers:[]});
const coverageLoading=ref(false),coverageReady=ref(false),hasCoverageData=ref(false),officesLoading=ref(false),saving=ref(false),checkingSlot=ref('');
const busy=computed(()=>coverageLoading.value||saving.value);
const automaticPending=computed(()=>['pending','processing'].includes(evidence.value.automaticEligibility?.status));
const blank=()=>({status:'unresolved',source:'payer_portal',reference:'',primaryChecked:false,secondaryChecked:false,otherCoverageChecked:false,orderConfirmed:false,medicaidTplChecked:false});
const draft=ref(blank()),lookupMode=ref('member_id');
let generation=0,officeGeneration=0,loadedContext='',officeScope='',pollTimer=null;
const context=()=>`${props.agencyId}:${props.clientId}:${reviewDate.value}`;
const attestations=[{key:'primaryChecked',label:'Primary coverage checked for this client and date'},{key:'secondaryChecked',label:'Secondary coverage checked, if recorded'},{key:'otherCoverageChecked',label:'Asked about and investigated other coverage, including reported additional payers'},{key:'orderConfirmed',label:'Confirmed payer order and resolved discrepancies'},{key:'medicaidTplChecked',label:'For Medicaid: reviewed Other Insurance / TPL in the Medicaid portal and resolved discrepancies'}];
const base=()=>`/medical-billing/clients/${props.clientId}/coverage`;
function poll(){clearTimeout(pollTimer);if(automaticPending.value)pollTimer=setTimeout(()=>{if(!saving.value)void load({background:true});else poll();},30000);}
async function load({resetReview=false,keepNotice=false,background=false}={}){
 const current=context(),changed=current!==loadedContext,g=++generation;
 clearTimeout(pollTimer);if(!background){coverageLoading.value=true;coverageReady.value=false;error.value='';if(!keepNotice)notice.value='';}
 if(changed){loadedContext=current;lookupMode.value='member_id';hasCoverageData.value=false;evidence.value={checks:[],blockers:[]};draft.value=blank();}
 else if(resetReview)draft.value=blank();
 if(officeScope!==String(props.agencyId)){
  const requestedAgency=String(props.agencyId),og=++officeGeneration;officeScope=requestedAgency;officesLoading.value=true;offices.value=[];
  void api.get('/medical-billing/claimmd/billing-offices',{params:{agencyId:props.agencyId},skipGlobalLoading:true}).then(r=>{
   if(og!==officeGeneration||requestedAgency!==String(props.agencyId))return;offices.value=r.data.items||[];
   const valid=offices.value.filter(o=>!o.configuration_error&&o.practice_npi);
   if(!valid.some(o=>String(o.id)===String(officeId.value)))officeId.value=valid.length===1?valid[0].id:'';
  }).catch(()=>{if(og===officeGeneration&&requestedAgency===String(props.agencyId)){officeScope='';notice.value='Electronic verification is unavailable. Use an available verification source below.';}}).finally(()=>{if(og===officeGeneration&&requestedAgency===String(props.agencyId))officesLoading.value=false;});
 }
 try{
  const {data}=await api.get(base(),{params:{agencyId:props.agencyId,serviceDate:reviewDate.value},skipGlobalLoading:true});
  if(g!==generation)return;
  const newEvidence=hasCoverageData.value&&evidence.value.reviewToken&&data.reviewToken&&evidence.value.reviewToken!==data.reviewToken;
  if(newEvidence&&!resetReview){for(const item of attestations)draft.value[item.key]=false;draft.value.status='unresolved';notice.value='New coverage evidence arrived. Review it and confirm the checks again; your typed reference has been kept.';}
  evidence.value=data;hasCoverageData.value=true;coverageReady.value=true;
  if(data.syntheticQaReviewAvailable===true&&(changed||resetReview))draft.value.source='synthetic_qa';
  if(data.syntheticQaReviewAvailable!==true&&draft.value.source==='synthetic_qa')draft.value=blank();
  poll();
 }catch(e){if(g===generation&&!background)error.value=e.response?.data?.error?.message||'Verification history could not be loaded. Use Load verification history to try again.';}
 finally{if(g===generation)coverageLoading.value=false;}
}
async function check(slot){
 if(busy.value||officesLoading.value||!officeId.value||!coverageReady.value||automaticPending.value)return;
 const current=context();clearTimeout(pollTimer);saving.value=true;checkingSlot.value=slot;error.value='';notice.value='';
 try{
  const {data}=await api.post(`${base()}/check`,{agencyId:props.agencyId,billingOfficeId:officeId.value,serviceDate:reviewDate.value,slot,lookupMode:lookupMode.value,requestKey:crypto.randomUUID()},{skipGlobalLoading:true});
  if(current!==context())return;await load();
  if(current===context())notice.value=data.processingWarning||(data.followUpTaskId?`Billing follow-up task #${data.followUpTaskId} is in the shared insurance verification queue.`:'Payer response saved. Review the coverage findings below.');
 }catch(e){
  if(current!==context())return;
  const detail=e.response?.data?.error||{};
  if(detail.coverageCheckId)await load();
  if(current===context())error.value=(detail.message||'Coverage could not be confirmed')+(detail.coverageCheckId?` Check #${detail.coverageCheckId}.`:'')+(detail.upstreamCodes?.length?` Claim.MD code: ${detail.upstreamCodes.join(', ')}.`:'');
 }finally{if(current===context()){saving.value=false;checkingSlot.value='';poll();}}
}
async function review(){
 if(busy.value||!coverageReady.value)return;
 if(draft.value.source==='synthetic_qa'&&evidence.value.syntheticQaReviewAvailable!==true){error.value='Fictional review is unavailable for this client.';return;}
 const current=context(),fictional=draft.value.source==='synthetic_qa';clearTimeout(pollTimer);saving.value=true;error.value='';
 try{
  await api.post(`${base()}/review`,{agencyId:props.agencyId,serviceDate:reviewDate.value,...draft.value,reviewToken:evidence.value.reviewToken},{skipGlobalLoading:true});
  if(current!==context())return;await load({resetReview:true});
  if(current===context()){notice.value=fictional?'Fictional QA review recorded. No real payer contact or actual benefits are attested.':'Verification recorded for '+formatBillingDate(reviewDate.value)+'. Eligibility is not a payment guarantee.';emit('saved');}
 }catch(e){if(current===context())error.value=e.response?.data?.error?.message||'Verification could not be saved';}
 finally{if(current===context()){saving.value=false;poll();}}
}
defineExpose({refresh:({insuranceChanged=false}={})=>load({resetReview:insuranceChanged})});
watch(()=>[props.clientId,props.agencyId,props.serviceDate],()=>{generation++;reviewDate.value=props.serviceDate?.slice(0,10)||today();officeId.value=props.billingOfficeId||'';saving.value=false;checkingSlot.value='';loadedContext='';load();});
watch(()=>props.billingOfficeId,value=>{if(value)officeId.value=value;});
onMounted(load);onBeforeUnmount(()=>{generation++;officeGeneration++;clearTimeout(pollTimer);});
</script>
<style scoped>
.coverage-check{border-top:1px solid var(--border,#dce5ed);padding:20px 0;margin-top:16px;min-width:0;overflow-wrap:anywhere}
h4{font-size:1.15rem;margin:0 0 8px}.verification-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:end;gap:12px;margin:16px 0}.verification-controls label{display:grid;gap:6px;margin:0}.verification-controls button{margin:0}label{display:block;margin:12px 0}button{padding:10px 14px;border:1px solid var(--border,#bccbd9);border-radius:8px;background:var(--bg-primary,#fff);color:inherit;font:inherit;min-height:42px;cursor:pointer}button:disabled{opacity:.6;cursor:default}select,input:not([type=checkbox]),textarea{font:inherit;max-width:100%;box-sizing:border-box;min-height:42px;border:1px solid var(--border,#bccbd9);border-radius:6px;padding:8px;background:var(--bg-primary,#fff);color:inherit}textarea{display:block;width:100%;min-height:90px}.verification-help{font-size:.9rem;line-height:1.55;color:var(--text-secondary,#52617a)}.verification-feedback{min-height:2.5rem;overflow-anchor:none}.verification-feedback p{margin:8px 0}.automatic-status{padding:12px 16px;border:1px solid var(--border,#dce5ed);border-radius:8px;background:var(--bg-secondary,#f4f7fb)}.automatic-status p{margin:6px 0;line-height:1.5}.verification-history{margin:12px 0}.verification-history>summary{cursor:pointer;font-weight:600;padding:10px 0}article{padding:12px;border:1px solid var(--border,#dce5ed);border-radius:8px;margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:22rem;overflow:auto}form fieldset{border:0;padding:0;margin:0;min-width:0}form select{display:block;margin-top:4px}[role=alert]{color:var(--app-text-red,#b91c1c)}@media(max-width:600px){.verification-controls{grid-template-columns:1fr}.verification-controls button{width:100%}}
</style>
