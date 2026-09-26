<template>
  <section class="service-setup">
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <section class="card">
      <h2>1. Set your self-pay service prices</h2>
      <p>Unset prices stay unavailable. Copays are verified for each client’s insurance; they are not the service’s full price.</p>
      <div class="rate-list"><button v-for="rate in rates" :key="rate.serviceCode" type="button" @click="editRate(rate)">{{ rate.serviceCode }} · {{ rate.amountCents == null ? 'Not set' : `${money(rate.amountCents)} per ${rate.priceBasis}` }}</button></div>
      <form @submit.prevent="saveRate"><div class="fields">
        <label>Service code<input v-model="rateCode" required maxlength="32" @input="rateRevision=0" /></label>
        <label>Self-pay price ($)<input v-model="rateAmount" type="number" min="0.01" step="0.01" placeholder="Not set" /></label>
        <label>Price applies per<select v-model="rateBasis"><option value="visit">Visit</option><option value="unit">Unit</option></select></label>
      </div><label>Reason for price change<textarea v-model="rateReason" required maxlength="2000" /></label>
      <p>Blank removes the price from new authorizations. Existing signed terms and balances remain unchanged.</p>
      <button :disabled="busy">Save service price</button></form>
    </section>
    <section class="card">
      <h2>2. Assign service terms and request a signature</h2>
      <form @submit.prevent="createTask"><div class="fields">
        <label>Client<select v-model="clientId" required><option value="">Select a client</option><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select></label>
        <label>Responsible account<select v-model="payerId" required><option value="">Select an account</option><option v-for="link in clientLinks" :key="link.guardianUserId" :value="link.guardianUserId">{{ [link.first_name,link.last_name].filter(Boolean).join(' ') }}{{ link.relationshipType==='self'?' (client)':'' }}</option></select></label>
        <label>Service code<input v-model="code" required maxlength="32" list="patient-service-codes" /><datalist id="patient-service-codes"><option v-for="rate in rates" :key="rate.serviceCode" :value="rate.serviceCode" /></datalist></label>
        <label>Payment basis<select v-model="basis"><option value="self_pay">Agreed self-pay</option><option value="copay">Verified insurance copay</option></select></label>
        <label v-if="basis==='copay'">Verified copay per visit ($)<input v-model="copay" type="number" min="0.01" step="0.01" required /></label>
        <label v-else>Units<input v-model.number="units" type="number" min="1" max="100" step="1" required /></label>
        <label>Effective from<input v-model="from" type="date" required /></label>
        <label>Effective through<input v-model="through" type="date" :min="from" required /></label>
      </div>
      <p class="quote">{{ quote }}</p>
      <p v-if="basis==='copay'">This is a verified visit copay, subject to the payer’s final determination. Secondary coverage and Medicaid-protected care require a different review.</p>
      <label>Verification evidence / agreed terms<textarea v-model="evidence" required maxlength="2000" /></label>
      <label>Additional client-facing authorization terms<textarea v-model="additionalTerms" maxlength="12000" /></label>
      <label class="check"><input v-model="requireCard" type="checkbox" /> Ask the payer to securely add a card</label>
      <p>Creates a task in the client or guardian dashboard and an email draft for billing to review. Signing does not charge the card or enable automatic payments.</p>
      <button :disabled="busy || !clientId || !payerId || (basis==='self_pay' && selectedRate?.amountCents==null)">Create service authorization task</button></form>
    </section>
    <section class="card">
      <h2>3. Post a completed visit from signed terms</h2>
      <p>Billing readiness must be verified first. The visit must match the signed code, units and effective dates. An existing visit balance is reused; signing a task alone creates no balance.</p>
      <form @submit.prevent="postService"><label>Signed service authorization<select v-model="selection" required><option value="">Select signed terms</option><option v-for="option in signedOptions" :key="option.key" :value="option.key">{{ option.label }}</option></select></label>
      <label>Completed visit<select v-model="visitId" required :disabled="visitsLoading"><option value="">{{ visitsLoading?'Loading visits…':'Select a matching visit' }}</option><option v-for="visit in visits" :key="visit.claimId || visit.sessionId" :value="selectedTerm?.paymentBasis==='copay'?visit.claimId:visit.sessionId">{{ visit.serviceDate }} · {{ visit.serviceCode }} · {{ money(visit.amountCents) }} · {{ visit.claimId?`Claim ${visit.claimId}`:`Visit ${visit.sessionId}` }}</option></select></label><p v-if="selectedTerm && !visitsLoading && !visits.length">No matching completed visits are available. Check the dates, code, units and insurance claims.</p>
      <button :disabled="busy || !selectedTerm || !visitId || visitsLoading">Post verified service balance</button></form>
    </section>
  </section>
</template>
<script setup>
import {ref,computed,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],clients:{type:Array,default:()=>[]},links:{type:Array,default:()=>[]},tasks:{type:Array,default:()=>[]}});
const emit=defineEmits(['changed','task-created']);
const visits=ref([]),visitsLoading=ref(false);let visitGeneration=0;
const rates=ref([]),busy=ref(false),error=ref(''),message=ref('');let generation=0;
const rateCode=ref(''),rateAmount=ref(''),rateBasis=ref('visit'),rateRevision=ref(0),rateReason=ref('');
const clientId=ref(''),payerId=ref(''),code=ref(''),basis=ref('self_pay'),copay=ref(''),units=ref(1),from=ref(new Date().toISOString().slice(0,10)),through=ref(''),evidence=ref(''),additionalTerms=ref(''),requireCard=ref(true),selection=ref(''),visitId=ref('');
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100);
const selectedRate=computed(()=>rates.value.find(r=>r.serviceCode===code.value.trim().toUpperCase()));
const clientLinks=computed(()=>props.links.filter(l=>Number(l.clientId)===Number(clientId.value)));
const quote=computed(()=>{if(basis.value==='copay')return copay.value?`${money(Math.round(Number(copay.value)*100))} copay per completed visit`:'Enter the verified copay.';const r=selectedRate.value;if(r?.amountCents==null)return 'No self-pay price is set for this service.';return `${money(r.amountCents)} per ${r.priceBasis} · ${money(Number(r.amountCents)*(r.priceBasis==='unit'?Number(units.value):1))} total per matching visit`;});
const signedOptions=computed(()=>props.tasks.filter(t=>t.status==='completed').flatMap(t=>(t.serviceTerms||[]).map(term=>({key:`${t.id}:${term.clientId}:${term.serviceCode}`,taskId:t.id,...term,label:`${props.clients.find(c=>Number(c.id)===Number(term.clientId))?.name||'Client'} · ${term.serviceCode} · ${money(term.totalCents)} · Task ${t.id}`}))));
const selectedTerm=computed(()=>signedOptions.value.find(o=>o.key===selection.value));
function editRate(r){rateCode.value=r.serviceCode;rateAmount.value=r.amountCents==null?'':(r.amountCents/100).toFixed(2);rateBasis.value=r.priceBasis;rateRevision.value=r.revision;rateReason.value='';}
async function load(){const own=++generation;rates.value=[];error.value='';message.value='';clientId.value='';payerId.value='';selection.value='';visitId.value='';rateCode.value='';rateAmount.value='';rateReason.value='';rateRevision.value=0;code.value='';evidence.value='';additionalTerms.value='';if(!props.agencyId)return;try{const {data}=await api.get('/family-billing/staff/service-rates',{params:{agencyId:props.agencyId}});if(own===generation)rates.value=data.rates||[];}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Service prices could not be loaded.';}}
async function perform(work,success){if(busy.value)return;busy.value=true;error.value='';message.value='';const own=generation,agencyId=props.agencyId;try{await work(agencyId);if(own===generation){message.value=success;emit('changed');}}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The change could not be saved.';}finally{busy.value=false;}}
function saveRate(){return perform(async agencyId=>{const {data}=await api.put(`/family-billing/staff/service-rates/${encodeURIComponent(rateCode.value.trim().toUpperCase())}`,{agencyId,amountCents:rateAmount.value===''?null:Math.round(Number(rateAmount.value)*100),priceBasis:rateBasis.value,revision:rateRevision.value,reason:rateReason.value});if(Number(agencyId)!==Number(props.agencyId))return;rates.value=[...rates.value.filter(r=>r.serviceCode!==data.serviceCode),data].sort((a,b)=>a.serviceCode.localeCompare(b.serviceCode));editRate(data);},'Service price saved. Existing authorizations were not changed.');}
function createTask(){return perform(async agencyId=>{await api.post('/family-billing/staff/tasks',{agencyId,guardianUserId:Number(payerId.value),clientIds:[Number(clientId.value)],requireCard:requireCard.value,waiverText:additionalTerms.value,serviceTerms:[{clientId:Number(clientId.value),serviceCode:code.value,paymentBasis:basis.value,amountCents:Math.round(Number(copay.value)*100),rateRevision:selectedRate.value?.revision,units:units.value,effectiveFrom:from.value,effectiveThrough:through.value,evidence:evidence.value}]});if(Number(agencyId)===Number(props.agencyId))emit('task-created');},'Authorization task assigned. Review the invitation draft in Collections before sending.');}
function postService(){const t=selectedTerm.value;if(!t)return;return perform(agencyId=>api.post('/family-billing/staff/service-charges',{agencyId,clientId:t.clientId,taskId:t.taskId,serviceCode:t.serviceCode,[t.paymentBasis==='copay'?'claimId':'sessionId']:Number(visitId.value)}),'Visit balance posted. No card was charged.');}
watch(selectedTerm,async term=>{const own=++visitGeneration;visits.value=[];visitId.value='';visitsLoading.value=false;if(!term)return;visitsLoading.value=true;try{const {data}=await api.get('/family-billing/staff/service-visits',{params:{agencyId:props.agencyId,clientId:term.clientId,taskId:term.taskId,serviceCode:term.serviceCode}});if(own===visitGeneration)visits.value=data.visits||[];}catch(e){if(own===visitGeneration)error.value=e.response?.data?.error?.message||'Completed visits could not be loaded.';}finally{if(own===visitGeneration)visitsLoading.value=false;}});
watch(clientId,()=>{payerId.value='';});watch(()=>props.agencyId,load,{immediate:true});
</script>
<style scoped>
.service-setup .card{padding:24px;border:1px solid var(--app-line, #d9e2ef);background:var(--bg-card);border-radius:12px;margin:20px 0}.service-setup .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}.service-setup label{display:grid;gap:8px;margin:14px 0}.service-setup input,.service-setup select,.service-setup textarea{font:inherit;min-width:0;box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--app-line, #a9bace);border-radius:6px}.service-setup button{padding:11px 16px;border:1px solid var(--app-line, #a9bace);background:var(--app-surface-muted, #edf4fa);color:var(--app-text-blue, #16466d);border-radius:7px;font:inherit;cursor:pointer}.service-setup button:disabled{opacity:.5;cursor:default}.service-setup .check{display:flex;align-items:center}.service-setup .check input{width:auto}.service-setup .quote{background:var(--app-surface-muted, #edf7f4);padding:14px;border-radius:6px}.service-setup .rate-list{display:flex;gap:10px;flex-wrap:wrap}.service-setup [role=alert]{color:var(--app-text-red, #b42318)}.service-setup p{line-height:1.6}
</style>
