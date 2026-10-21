<template>
  <section class="staff-estimates">
    <h2>Cost estimate library</h2>
    <p>Prepare a Good Faith Estimate for a client who is uninsured or has chosen not to use commercial insurance. The estimate does not waive billing protections, enroll automatic payments or limit care.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <form @submit.prevent="prepare">
      <div class="grid">
        <label>Client<select v-model.number="clientId" required><option :value="null">Choose client</option><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select></label>
        <label>Recipient<select v-model.number="guardianUserId" required><option :value="null">Choose recipient</option><option v-for="link in recipients" :key="link.guardianUserId" :value="link.guardianUserId">{{ [link.first_name,link.last_name].filter(Boolean).join(' ') }}</option></select></label>
        <label>Billing office<select v-model.number="officeId" required><option :value="null">Choose the billing office</option><option v-for="office in options.offices" :key="office.id" :value="office.id">{{ office.name }}</option></select></label>
        <label>Start date<input v-model="startDate" type="date" required /></label>
        <label>Planning period (weeks)<input v-model.number="weeks" type="number" min="1" max="52" required /></label>
        <label>Expected frequency<input v-model="frequency" maxlength="500" required /></label>
      </div>
      <label class="check"><input v-model="serviceLocation.useBillingOfficeAddress" type="checkbox" />These services will take place at the selected billing office.</label>
      <div v-if="!serviceLocation.useBillingOfficeAddress" class="grid"><label>Expected service location<input v-model="serviceLocation.address" maxlength="500" placeholder="School address or telehealth setting" required /></label><label>Expected state of service<input v-model="serviceLocation.state" maxlength="2" placeholder="CO" required /></label></div>
      <p>The assigned provider and available diagnosis come from this client’s chart. The six-week starting point can be changed to match expected care, up to 52 weeks.</p>
      <div v-for="(line,index) in lines" :key="index" class="line"><label>Expected service<select v-model="line.serviceCode"><option v-for="rate in availableRates" :key="rate.serviceCode" :value="rate.serviceCode">{{ rate.serviceCode }} · {{ rate.description }} · {{ money(rate.amountCents) }}{{ rate.approved ? '' : ' · Review price' }}</option></select></label><label>Expected count<input v-model.number="line.quantity" type="number" min="1" max="366" required /></label><button v-if="lines.length > 1" type="button" @click="lines.splice(index,1)">Remove</button></div>
      <button type="button" @click="lines.push({serviceCode:'90837',quantity:1})">Add expected service</button>
      <label>Coverage / self-pay verification<textarea v-model="coverageEvidence" maxlength="2000" required placeholder="Record the dated uninsured verification or the client’s choice not to submit these services to commercial insurance." /></label>
      <label class="check"><input v-model="selfPayElection" type="checkbox" />The client has commercial insurance and has expressly chosen not to use it for these services.</label>
      <label class="check"><input v-model="diagnosisNotApplicable" type="checkbox" />A diagnosis is not yet applicable to these planned services.</label>
      <label v-if="diagnosisNotApplicable">Explain why<input v-model="diagnosisReason" maxlength="1000" required /></label>
      <button :disabled="busy || !clientId || !guardianUserId">Prepare draft estimate</button>
    </form>
    <details><summary>Agency estimate prices</summary><p>Agency-provided amounts start as drafts for every tenant. Review each applicable service before issuing an estimate. These prices are separate from existing patient service charges, insurance claim charges and contracted allowed amounts.</p>
      <div class="table-wrap"><table><thead><tr><th>Service</th><th>Amount</th><th>Review</th><th>Action</th></tr></thead><tbody><tr v-for="rate in options.rates" :key="rate.serviceCode"><td>{{ rate.serviceCode }}<small>{{ rate.description }}</small><small v-if="rate.reviewReason">{{ reviewLabel(rate.reviewReason) }}</small></td><td><input v-model="rate.amountDollars" type="number" min="0" step="0.01" :aria-label="`${rate.serviceCode} estimate price`" /><small>per {{ rate.unitLabel }}</small></td><td><label class="check"><input v-model="rate.approved" type="checkbox" />Reviewed</label><input v-model="rate.reason" :aria-label="`${rate.serviceCode} review reason`" placeholder="Review evidence / reason" /></td><td><button :disabled="busy || !rate.reason?.trim()" @click="saveRate(rate)">Save</button></td></tr></tbody></table></div>
    </details>
    <h3>Prepared estimates</h3>
    <article v-for="item in estimates" :key="item.id" class="card"><strong>{{ item.clientName }} · {{ item.title }}</strong><p>{{ item.startDate }} – {{ item.endDate }} · {{ money(item.totalCents) }} · {{ item.status }}</p><p v-if="item.missing.length">Needs review: {{ item.missing.join(', ') }}</p><div class="actions"><button @click="download(item)">Download {{ item.status === 'draft' ? 'draft' : 'estimate' }}</button><button v-if="item.status === 'draft'" :disabled="busy || item.missing.length > 0" @click="issue(item)">Issue to secure portal</button></div></article>
    <p>Issuing makes the estimate available in the selected recipient’s Billing section. It does not send an email. Payment authorizations are assigned separately through Payment setup.</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api.js';
const props = defineProps({ agencyId: { type: Number, required: true }, links: { type: Array, default: () => [] } });
const options = ref({ rates: [], offices: [] }), estimates = ref([]), error = ref(''), message = ref(''), busy = ref(false);
const clientId = ref(null), guardianUserId = ref(null), officeId = ref(null), startDate = ref(new Date().toISOString().slice(0,10)), weeks = ref(6), frequency = ref('One session per week'), lines = ref([{serviceCode:'90837',quantity:6}]), coverageEvidence = ref(''), selfPayElection = ref(false), diagnosisNotApplicable = ref(false), diagnosisReason = ref('');
const serviceLocation = ref({useBillingOfficeAddress:false,address:'',state:''});
let generation = 0;
const clients = computed(() => [...new Map(props.links.map(link => [Number(link.clientId), {id:Number(link.clientId),name:link.clientName}])).values()]);
const recipients = computed(() => props.links.filter(link => Number(link.clientId) === clientId.value));
const availableRates = computed(() => options.value.rates.filter(rate => rate.reviewReason !== 'legacy_code_review'));
const money = value => value == null ? 'Not set' : new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(value)/100);
const reviewLabel = value => ({coding_review:'Confirm current coding and applicability',legacy_code_review:'Legacy code — current coding review required',policy_review:'Policy and payer review required',patient_access_review:'Patient access rights and fee review required'})[value] || value;
async function load() { const own=++generation; if (!props.agencyId) return; try { const [catalog,list] = await Promise.all([api.get('/family-cost-estimates/staff/options',{params:{agencyId:props.agencyId}}),api.get('/family-cost-estimates/staff',{params:{agencyId:props.agencyId}})]); if(own!==generation)return;options.value={...catalog.data,rates:catalog.data.rates.map(rate=>({...rate,amountDollars:rate.amountCents==null?'':(rate.amountCents/100).toFixed(2),reason:''}))};estimates.value=list.data.estimates; } catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The cost estimate library could not be loaded.';} }
async function mutate(work,success){if(busy.value)return;const own=generation;busy.value=true;error.value='';message.value='';try{await work();if(own===generation){message.value=success;await load();}}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The estimate could not be saved.';}finally{busy.value=false;}}
const saveRate=rate=>mutate(()=>api.put(`/family-cost-estimates/staff/rates/${rate.serviceCode}`,{agencyId:props.agencyId,description:rate.description,unitLabel:rate.unitLabel,amountCents:rate.amountDollars===''?null:Math.round(Number(rate.amountDollars)*100),approved:rate.approved,revision:rate.revision,reason:rate.reason}),'Agency estimate price saved.');
const prepare=()=>mutate(()=>api.post('/family-cost-estimates/staff',{agencyId:props.agencyId,clientId:clientId.value,guardianUserId:guardianUserId.value,officeId:officeId.value,serviceLocation:serviceLocation.value,startDate:startDate.value,weeks:weeks.value,frequency:frequency.value,coverageEvidence:coverageEvidence.value,selfPayElection:selfPayElection.value,diagnosisNotApplicable:diagnosisNotApplicable.value,diagnosisReason:diagnosisReason.value,requestKey:crypto.randomUUID(),lines:lines.value.map(line=>({...line,rateRevision:options.value.rates.find(rate=>rate.serviceCode===line.serviceCode)?.revision||0}))}),'Draft prepared. Review the PDF and any missing information before issuing.');
const issue=item=>mutate(()=>api.post(`/family-cost-estimates/staff/${item.id}/issue`,{agencyId:props.agencyId}),'Estimate issued to the secure portal. No email was sent.');
async function download(item){try{const result=await api.get(`/family-cost-estimates/staff/${item.id}.pdf`,{params:{agencyId:props.agencyId},responseType:'blob'}),url=URL.createObjectURL(result.data),link=document.createElement('a');link.href=url;link.download=`good-faith-estimate-${item.id}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch{error.value='The estimate could not be downloaded.';}}
watch(clientId,()=>{guardianUserId.value=null;serviceLocation.value={useBillingOfficeAddress:false,address:'',state:''};});
watch(()=>props.agencyId,()=>{clientId.value=null;guardianUserId.value=null;officeId.value=null;options.value={rates:[],offices:[]};estimates.value=[];void load();},{immediate:true});
</script>
<style scoped>
.staff-estimates{padding:20px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.staff-estimates p{line-height:1.6}.staff-estimates label{display:grid;gap:8px;margin:12px 0}.staff-estimates .check{display:flex;gap:10px;align-items:flex-start}.staff-estimates input:not([type=checkbox]),select,textarea{max-width:100%;min-width:0;padding:10px;border:1px solid var(--border,#cbd5e1);border-radius:8px;font:inherit;box-sizing:border-box}.staff-estimates button{padding:10px 16px;font:inherit;border:1px solid var(--border,#cbd5e1);border-radius:8px;background:var(--bg-alt,#eff5f7);color:var(--text-primary,#17384b);cursor:pointer}.staff-estimates button:disabled{opacity:.5;cursor:default}.line,.actions{display:flex;gap:16px;align-items:end;flex-wrap:wrap}.line>label:first-child{flex:1;min-width:220px}.line input{width:100px}.card{padding:18px;border:1px solid var(--border,#cbd5e1);border-radius:12px;margin:16px 0}details{margin:24px 0}summary{cursor:pointer;font-weight:600}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:12px;border-bottom:1px solid var(--border,#cbd5e1)}td small{display:block;margin-top:6px}td input[type=number]{width:110px}[role=alert]{color:#b42318}
</style>
