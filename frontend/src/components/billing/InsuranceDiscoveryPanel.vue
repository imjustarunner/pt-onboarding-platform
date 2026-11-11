<template>
  <section class="insurance-discovery" aria-label="Find insurance">
    <button type="button" class="btn btn-secondary" :disabled="busy" @click="open">Find insurance / view previous searches</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="workspace">
      <p v-if="!workspace.enabled">Stedi insurance discovery is awaiting account setup. Previous results remain available.</p>
      <form v-else @submit.prevent="search">
        <p>Use this occasional search when insurance is unknown, a member ID is missing, or a coverage problem needs investigation. Save identity edits before opening this form.</p>
        <p><strong>{{ workspace.patient.firstName }} {{ workspace.patient.lastName }}</strong> · Birthdate: {{ workspace.patient.dateOfBirth || 'Missing' }}<br />{{ addressLabel }}</p>
        <label><input v-model="confirmations.name" type="checkbox" /> I confirmed the spelling of the client’s legal first and last name.</label>
        <label><input v-model="confirmations.birthdate" type="checkbox" /> I confirmed the client’s birthdate.</label>
        <label><input v-model="confirmations.address" type="checkbox" /> I checked the current or previous address shown above with the client or their records.</label>
        <label v-if="addressIncomplete">Explain missing address details<textarea v-model="missingAddressReason" maxlength="500" minlength="10" required /></label>
        <label>Reason<select v-model="reason" required><option value="">Choose a reason</option><option value="unknown_insurance">Insurance is unknown</option><option value="missing_member_id">Member ID is unavailable</option><option value="eligibility_failed">Eligibility check failed</option><option value="other_coverage_denial">Claim denied for other coverage</option></select></label>
        <label>Billing office<select v-model="officeId" required><option value="">Choose an office</option><option v-for="office in workspace.offices" :key="office.id" :value="office.id" :disabled="!office.available">{{ office.name }}{{ office.available ? '' : ' — NPI needs setup' }}</option></select></label>
        <label>Date of service<input v-model="date" type="date" required /></label>
        <p>{{ workspace.usedThisMonth }} of {{ workspace.monthlyLimit }} searches reserved this month across all three agencies. Listed price: ${{ (workspace.estimatedPriceCents / 100).toFixed(2) }} per new search, plus any applicable payer fees.</p>
        <label><input v-model="confirmations.cost" type="checkbox" /> I understand this search uses our paid Stedi allowance.</label>
        <p v-if="identityEdited">Client details changed. Save them, then reopen Find insurance.</p>
        <button type="submit" class="btn btn-primary" :disabled="!canSearch">{{ busy ? 'Searching…' : 'Confirm and find insurance' }}</button>
        <p>A search can take two minutes. An empty result does not prove the client is uninsured. Discovery does not determine which insurer pays first.</p>
      </form>
      <article v-for="result in workspace.searches" :key="result.id" class="discovery-result">
        <h5>Search {{ result.id }} · {{ result.serviceDate }} · {{ statusLabel(result.status) }}</h5>
        <p v-if="result.status === 'complete' && !result.candidates.length">No matches returned. Continue coverage verification; this does not establish that no other insurance exists.</p>
        <button v-if="result.status === 'pending'" type="button" class="btn btn-secondary" :disabled="busy" @click="refresh(result)">Retrieve this search’s results</button>
        <p v-if="['sending','unknown'].includes(result.status)">Do not start another paid search. Check this attempt in Stedi and reconcile it below if it cannot finish.</p>
        <div v-for="candidate in result.candidates" :key="candidate.index" class="candidate">
          <strong>{{ candidate.payerName }}</strong> · Member ID: {{ candidate.policy.memberId || 'Not returned' }}
          <p>{{ candidate.person.firstName }} {{ candidate.person.lastName }} · Birthdate: {{ candidate.person.dateOfBirth || 'Not returned' }}</p>
          <p>{{ candidate.identityMatches ? 'Name and birthdate match. Confirm remaining details and coverage dates.' : 'Identity needs investigation. Compare this returned person with the client before using this policy.' }}</p>
          <p>Reported Stedi payer ID: {{ candidate.reportedPayerId || 'Not returned' }}. Confirm the corresponding Claim.MD payer ID before billing.</p>
          <div v-if="candidate.identityMatches"><button v-for="slot in ['primary','secondary']" :key="slot" type="button" class="btn btn-secondary" @click="emit('use-policy',{policy:candidate.policy,slot})">Copy into {{ slot }} insurance form</button></div>
          <details><summary>All details for this match</summary><pre>{{ JSON.stringify(candidate.response,null,2) }}</pre></details>
          <template v-if="result.reviewRequired && decisions[result.id]">
            <label>Decision<select v-model="decisions[result.id][candidate.index].status"><option value="">Choose a decision</option><option value="recorded">Confirmed policy saved in billing profile</option><option value="not_applicable">Does not apply to this client or service date</option></select></label>
            <template v-if="decisions[result.id][candidate.index].status === 'recorded'">
              <label>Saved policy<select v-model="decisions[result.id][candidate.index].slot"><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>
              <label><input v-model="decisions[result.id][candidate.index].identityConfirmed" type="checkbox" /> I confirmed the returned patient is this client.</label>
              <label><input v-model="decisions[result.id][candidate.index].payerConfirmed" type="checkbox" /> I confirmed the insurer and saved Claim.MD payer ID.</label>
              <label><input v-model="decisions[result.id][candidate.index].coverageConfirmed" type="checkbox" /> I confirmed coverage for the date of service.</label>
            </template>
            <label>Evidence or explanation<textarea v-model="decisions[result.id][candidate.index].reason" maxlength="500" /></label>
          </template>
        </div>
        <label v-if="result.reviewRequired"><input v-model="otherCoverageChecked[result.id]" type="checkbox" /> I reviewed the full response for additional insurers and recorded any other coverage.</label>
        <button v-if="result.reviewRequired" type="button" class="btn btn-primary" :disabled="busy" @click="review(result)">Save decisions for all matches</button>
        <p v-else-if="result.candidates.length">Decisions saved. Complete coverage and payer-order review before billing.</p>
        <details v-if="result.response"><summary>Full response, including warnings and other coverage</summary><pre>{{ JSON.stringify(result.response,null,2) }}</pre></details>
        <details v-if="['sending','unknown','error'].includes(result.status)">
          <summary>Reconcile after checking Stedi</summary>
          <p>Wait at least three minutes for an in-progress search. This records a portal investigation; it does not send another search or verify coverage.</p>
          <label><input v-model="reconciliations[result.id].portalChecked" type="checkbox" /> I checked this attempt in the Stedi portal.</label>
          <label><input v-model="reconciliations[result.id].coverageRecorded" type="checkbox" /> I recorded returned coverage and remaining billing issues in the client’s profile.</label>
          <label>Portal reference and findings<textarea v-model="reconciliations[result.id].reference" maxlength="500" /></label>
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="reconcile(result)">Record reconciliation</button>
        </details>
      </article>
      <button type="button" class="btn btn-secondary" @click="close">Close private search details</button>
    </div>
  </section>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String],serviceDate:String,currentPatient:Object});
const emit=defineEmits(['use-policy','saved']);
const workspace=ref(null),busy=ref(false),error=ref(''),notice=ref(''),reason=ref(''),officeId=ref(''),date=ref(''),missingAddressReason=ref('');
const confirmations=ref({}),decisions=ref({}),reconciliations=ref({}),otherCoverageChecked=ref({}),identityEdited=ref(false);
let seq=0,requestKey='';
const path=computed(()=>`/medical-billing/clients/${props.clientId}/insurance-discovery`);
const addressLabel=computed(()=>['addressLine1','addressLine2','city','state','postalCode'].map(k=>workspace.value?.patient[k]).filter(Boolean).join(', ') || 'Address missing');
const addressIncomplete=computed(()=>!['addressLine1','city','state','postalCode'].every(k=>workspace.value?.patient[k]));
const canSearch=computed(()=>workspace.value?.enabled && !busy.value && !identityEdited.value && workspace.value.usedThisMonth<workspace.value.monthlyLimit && ['name','birthdate','address','cost'].every(k=>confirmations.value[k]) && reason.value && officeId.value && date.value && (!addressIncomplete.value || missingAddressReason.value.trim().length>=10));
function initReviews(){for(const r of workspace.value?.searches || []){decisions.value[r.id]=r.candidates.map(c=>({index:c.index,status:'',slot:'primary',reason:'',identityConfirmed:false,payerConfirmed:false,coverageConfirmed:false}));reconciliations.value[r.id]={portalChecked:false,coverageRecorded:false,reference:''};}}
async function open(){const n=++seq;busy.value=true;error.value='';notice.value='';workspace.value=null;confirmations.value={};identityEdited.value=false;reason.value='';missingAddressReason.value='';requestKey=crypto.randomUUID();try{const r=await api.get(path.value,{params:{agencyId:props.agencyId}});if(n!==seq)return;workspace.value=r.data;initReviews();officeId.value=r.data.offices?.filter(o=>o.available).length===1?r.data.offices.find(o=>o.available).id:'';date.value=props.serviceDate || new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance searches could not be loaded.';}finally{if(n===seq)busy.value=false;}}
async function action(work){if(busy.value)return;const n=seq;busy.value=true;error.value='';notice.value='';try{const r=await work();if(n!==seq)return;notice.value=r.data.message || 'Search information saved.';const current=await api.get(path.value,{params:{agencyId:props.agencyId}});if(n!==seq)return;workspace.value=current.data;initReviews();emit('saved');}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'The request could not be confirmed. Reopen previous searches before trying again.';}finally{if(n===seq)busy.value=false;}}
async function search(){if(!canSearch.value)return;const data={agencyId:props.agencyId,requestKey,fingerprint:workspace.value.fingerprint,nameConfirmed:true,birthdateConfirmed:true,addressConfirmed:true,costConfirmed:true,reason:reason.value,missingAddressReason:missingAddressReason.value,billingOfficeId:officeId.value,serviceDate:date.value};confirmations.value={};await action(()=>api.post(path.value,data,{timeout:150000}));}
const refresh=r=>action(()=>api.get(`${path.value}/${r.id}`,{params:{agencyId:props.agencyId},timeout:150000}));
const review=r=>action(()=>api.post(`${path.value}/${r.id}/review`,{agencyId:props.agencyId,decisions:decisions.value[r.id],otherCoverageChecked:otherCoverageChecked.value[r.id]===true}));
const reconcile=r=>action(()=>api.post(`${path.value}/${r.id}/reconcile`,{agencyId:props.agencyId,...reconciliations.value[r.id]}));
const statusLabel=s=>({sending:'Processing / awaiting response',pending:'Results pending',complete:'Complete',unknown:'Outcome uncertain',error:'Search could not complete',reconciled:'Reconciled in Stedi'}[s]||s);
function close(){seq++;workspace.value=null;confirmations.value={};decisions.value={};reconciliations.value={};busy.value=false;error.value='';notice.value='';}
watch(()=>props.currentPatient,()=>{if(workspace.value){identityEdited.value=true;confirmations.value={};}},{deep:true});
watch(()=>[props.agencyId,props.clientId],close);
onBeforeUnmount(()=>{seq++;});
</script>
<style scoped>
.insurance-discovery{padding:16px;border:1px solid var(--border);border-radius:10px;margin:16px 0}form,.candidate,details{display:grid;gap:12px;margin:12px 0}label{display:block}select,input[type=date],textarea{display:block;max-width:100%;padding:8px}input[type=checkbox]{margin-right:6px}.discovery-result{border-top:1px solid var(--border);margin-top:20px;padding-top:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto}p[role=alert]{color:var(--app-text-red,#b91c1c)}
</style>
