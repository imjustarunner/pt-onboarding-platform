<template>
  <section class="payer-linkage" aria-label="Payer linkage and verification">
    <h4>Insurance matching &amp; coverage checks</h4>
    <p class="muted">Known payers link automatically. Coverage checks run through your agency’s verification service. Billing handles unresolved matches; you can continue importing this client.</p>
    <p v-if="error" class="payer-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">Checking payer links…</p>
    <p v-else-if="!policies.some(policy => policy.hasInsurance)" class="muted">Import insurance to check this client’s payer links.</p>
    <article v-for="policy in policies.filter(policy => policy.hasInsurance)" :key="policy.position">
      <strong>{{ policy.position === 'primary' ? 'Primary' : 'Secondary' }} · {{ policy.insurerName || 'Insurance' }}</strong>
      <p role="status" :class="{'payer-linked':policy.linked}">{{ policy.linked ? `Payer linked · ${policy.directoryName} (${policy.payerId})` : 'Billing review needed for payer matching. You can continue importing.' }}</p>
      <small v-if="policy.sourcePayerId">TherapyNotes payer ID: {{ policy.sourcePayerId }}</small>
      <small v-if="policy.subscriberIsClient">The subscriber is this client (Self). Subscriber name, birth date and address use the client’s saved demographics. Complete any missing address fields in Patient info.</small><small v-else>Subscriber means the person who holds the insurance policy. Their address may differ from this client’s address.</small>
      <small v-if="policy.linked">Claims: {{ policy.claimsSupport }} · Eligibility: {{ policy.eligibilitySupport }}. Required payer enrollment remains part of billing setup.</small>
      <p v-if="payerResponses[policy.position]" role="status">{{ payerResponses[policy.position].verified ? 'Active coverage reported by payer' : 'Coverage response needs billing review' }}<template v-if="payerResponses[policy.position].checkedAt"> · Checked {{ new Date(payerResponses[policy.position].checkedAt).toLocaleDateString() }}</template></p>
      <details class="payer-billing-tools" @toggle="openBillingTools($event,policy.position)"><summary>Billing tools (optional)</summary>
      <label :for="`payer-search-${clientId}-${policy.position}`">Find a billing payer</label>
      <div class="payer-search-row"><input :id="`payer-search-${clientId}-${policy.position}`" v-model="searches[policy.position]" :disabled="loading || linking" placeholder="Search agency payers and the directory…" @input="scheduleSearch(policy.position)" @keydown.enter.prevent="search(policy.position)" /><button type="button" class="payer-button" :disabled="loading || linking" @click="search(policy.position)">{{ searching[policy.position] ? 'Searching…' : 'Search' }}</button></div>
      <p v-if="warnings[policy.position]" class="muted" role="status">{{ warnings[policy.position] }}</p>
      <div v-if="candidates[policy.position]" class="payer-results" aria-live="polite">
        <p v-if="!candidates[policy.position].length">No matches. Clear the search to browse agency payers, or try another name or payer ID.</p>
        <template v-for="group in groups" :key="group.key">
          <h5 v-if="candidates[policy.position].some(payer=>payer.source===group.key)">{{ group.label }}</h5>
          <label v-for="payer in candidates[policy.position].filter(payer=>payer.source===group.key)" :key="`${payer.catalogId || ''}:${payer.payerId}`" class="payer-choice" :class="{'payer-choice-selected':selected[policy.position] === payer.payerId && payer.payerId}">
            <input v-model="selected[policy.position]" type="radio" :name="`payer-${clientId}-${policy.position}`" :value="payer.payerId" :disabled="busy || payer.verified === false || !payer.payerId" />
            <span><b>{{ payer.name }}<template v-if="payer.payerId"> · {{ payer.payerId }}</template></b><small v-if="payer.directoryName && payer.directoryName !== payer.name">Bills through {{ payer.directoryName }}</small><small v-if="payer.note">{{ payer.note }}</small><small>{{ payer.verified === false ? 'Agency setup needs billing review before linking' : `Claims: ${payer.claims} · Eligibility: ${payer.eligibility}` }}</small></span>
          </label>
        </template>
      </div>
      <button v-if="candidates[policy.position]?.length" type="button" class="payer-button payer-confirm" :disabled="busy || !selected[policy.position]" @click="link(policy.position)">{{ linking ? 'Verifying…' : 'Verify and link selected payer' }}</button>
      </details>
      <details v-if="policy.missingFields.length"><summary>{{ policy.missingFields.length }} insurance field(s) still need billing review</summary><ul><li v-for="field in policy.missingFields" :key="field">{{ field }}</li></ul></details>
    </article>
    <p v-if="policies.some(policy => policy.hasInsurance)" class="muted">{{ coverageVerified ? 'Insurance marked verified for claims in billing.' : 'Payer linking does not verify member eligibility or approve a claim.' }}</p>
  </section>
</template>
<script setup>
import { automaticEligibilityNotice } from '../../../utils/automaticEligibilityNotice.js';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import sharedApi from '../../../services/api';
import {transitionRequestScope} from '../../../utils/transitionRequestScope';
const api={...sharedApi,...transitionRequestScope(sharedApi,()=>props.agencyId)};
const props=defineProps({clientId:{type:[Number,String],required:true},agencyId:{type:[Number,String],required:true},refreshKey:{default:0}});
const emit=defineEmits(['ready-change','busy']);
const notice=ref(''),payerResponses=ref({});
const policies=ref([]),loading=ref(false),error=ref(''),linking=ref(false),coverageVerified=ref(false);
const searches=reactive({primary:'',secondary:''}),candidates=reactive({}),selected=reactive({}),warnings=reactive({}),searching=reactive({});
const groups=[{key:'agency',label:'Agency payers'},{key:'directory',label:'Live clearinghouse directory'}];
let generation=0;const timers={},versions={};
const busy=computed(()=>loading.value||Object.values(searching).some(Boolean)||linking.value);
watch(busy,value=>emit('busy',value),{flush:'sync'});
function config(){return{skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.agencyId)}};}
async function load(){
 const version=++generation;loading.value=true;error.value='';notice.value='';policies.value=[];coverageVerified.value=false;payerResponses.value={};emit('ready-change',false);
 for(const key of ['primary','secondary']){clearTimeout(timers[key]);versions[key]=(versions[key]||0)+1;candidates[key]=null;selected[key]='';searches[key]='';searching[key]=false;warnings[key]='';}
 try{
  const response=await api.get(`/clients/${props.clientId}/chart-import/payer-readiness`,config());if(version!==generation)return;
  policies.value=response.data.policies||[];coverageVerified.value=response.data.coverageVerifiedForClaims===true;payerResponses.value=response.data.payerResponses||{};
  if(policies.value.some(p=>p.hasInsurance && (!p.linked || !coverageVerified.value))) {
   const {data}=await api.post(`/clients/${props.clientId}/chart-import/payer-automation`,{},config());if(version!==generation)return;
   notice.value=data.eligibilityQueueWarning || automaticEligibilityNotice(data.automaticEligibility) || (data.unresolved?.length?'Insurance saved. Billing review is needed for the unresolved payer match. You can continue importing.':'');
   const refreshed=await api.get(`/clients/${props.clientId}/chart-import/payer-readiness`,config());if(version!==generation)return;
   policies.value=refreshed.data.policies||[];coverageVerified.value=refreshed.data.coverageVerifiedForClaims===true;payerResponses.value=refreshed.data.payerResponses||{};
  }
  emit('ready-change',policies.value.some(p=>p.hasInsurance)&&policies.value.filter(p=>p.hasInsurance).every(p=>p.linked));
 }catch(err){if(version===generation)error.value=err.response?.data?.error?.message||'Payer linkage could not be checked.';}
 finally{if(version===generation)loading.value=false;}

}
function openBillingTools(event,position){if(event.target.open && !candidates[position])void search(position);}
function scheduleSearch(position){clearTimeout(timers[position]);versions[position]=(versions[position]||0)+1;searching[position]=false;selected[position]='';timers[position]=setTimeout(()=>search(position),350);}
async function search(position){
 clearTimeout(timers[position]);const context=generation,version=versions[position]=(versions[position]||0)+1;
 if(searches[position].trim().length===1){candidates[position]=[];return;}
 searching[position]=true;error.value='';selected[position]='';
 try{
  const response=await api.post(`/clients/${props.clientId}/chart-import/payer-search`,{position,search:searches[position]},config());
  if(context===generation&&version===versions[position]){candidates[position]=(response.data.payers||[]).map(p=>({...p,source:p.source||'directory'}));warnings[position]=response.data.directoryWarning||'';
   const policy=policies.value.find(row=>row.position===position);
   const exact=candidates[position].filter(row=>row.source==='agency' && row.verified && row.payerId===policy?.sourcePayerId && row.name?.toLowerCase()===policy.insurerName?.toLowerCase());
   if(!searches[position] && exact.length===1)selected[position]=exact[0].payerId;}
 }catch(err){if(context===generation&&version===versions[position])error.value=err.response?.data?.error?.message||'Payer search failed.';}
 finally{if(context===generation&&version===versions[position])searching[position]=false;}
}
async function link(position){const version=generation;linking.value=true;error.value='';try{
 const {data}=await api.post(`/clients/${props.clientId}/chart-import/payer-link`,{position,payerId:selected[position],confirmed:true},config());
 if(version===generation){const next=generation+1;await load();if(next===generation)notice.value=data?.eligibilityQueueWarning || automaticEligibilityNotice(data?.automaticEligibility);}
 }catch(err){if(version===generation)error.value=err.response?.data?.error?.message||'Payer could not be linked.';}finally{linking.value=false;}}
watch(()=>[props.clientId,props.agencyId,props.refreshKey],load,{immediate:true});
onBeforeUnmount(()=>{generation++;Object.values(timers).forEach(clearTimeout);emit('busy',false);});
</script>
<style scoped>
.payer-linkage{border:1px solid #d3dfef;border-radius:12px;padding:16px;margin:12px 0;color:#17345c;background:#f8faff;}h4{margin:0 0 8px}article{padding:12px 0;border-top:1px solid #e0e7f1}label{display:block;font-size:13px;font-weight:600;margin:10px 0 6px}.payer-search-row{display:flex;gap:8px}input:not([type=radio]){flex:1;min-width:0;padding:9px 11px;font:inherit;border:1px solid #b8c9df;border-radius:8px;background:#fff;color:#17345c}.payer-button{padding:8px 13px;border:1px solid #c5d5e8;border-radius:8px;background:#edf3fa;color:#173b69;font:inherit;font-size:13px;font-weight:650;cursor:pointer}.payer-button:disabled{opacity:.5;cursor:default}.payer-confirm{background:#173b69;border-color:#173b69;color:#fff;margin:10px 0}.payer-results{max-height:280px;overflow:auto;margin-top:10px}.payer-results h5{margin:12px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#60718a}.payer-choice{display:flex;gap:9px;align-items:start;border:1px solid #dce5f1;background:#fff;border-radius:8px;padding:9px;margin:6px 0;cursor:pointer}.payer-choice-selected{border-color:#5078ad;background:#edf4fe}.payer-choice small{font-weight:400}small{display:block;color:#526777;margin:3px 0}.muted{color:#526777;font-size:.85rem;line-height:1.5}.payer-error{color:#b91c1c}.payer-linked{color:#216448}details{margin-top:10px;font-size:13px}
</style>
