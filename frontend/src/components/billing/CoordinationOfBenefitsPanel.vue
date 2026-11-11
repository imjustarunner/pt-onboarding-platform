<template>
  <section class="cob-panel" aria-label="Coordination of benefits">
    <button type="button" class="btn btn-secondary" :disabled="busy" @click="open">Check overlapping coverage / view COB history</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="workspace">
      <p>Use a known policy to investigate other coverage and billing order. Results may omit coverage; a negative result does not establish that this is the only insurance.</p>
      <p v-if="!workspace.enabled">Stedi coordination of benefits is awaiting account setup. Saved results remain available.</p>
      <p v-else-if="!workspace.verified || !workspace.policies.length">Save and verify a known policy and subscriber details before requesting this check.</p>
      <form v-else @submit.prevent="search">
        <p v-if="edited" role="alert">Insurance details changed. Save the details, then reopen this check.</p>
        <p><strong>{{ workspace.patient.firstName }} {{ workspace.patient.lastName }}</strong> · Birthdate: {{ workspace.patient.dateOfBirth }}<br />{{ addressLabel }}</p>
        <label>Known policy<select v-model="slot" required><option value="">Choose saved coverage</option><option v-for="p in workspace.policies" :key="p.slot" :value="p.slot">{{ p.slot }} · {{ p.insurerName }}</option></select></label>
        <p v-if="policy">Member ID: {{ policy.memberId }} · Subscriber: {{ policy.subscriberFirstName }} {{ policy.subscriberLastName }} · Birthdate: {{ policy.subscriberDob }}</p>
        <button type="button" class="btn btn-secondary" :disabled="busy || !slot || edited" @click="loadPayers">Check this insurer’s participation</button>
        <p v-if="payersLoaded && !payers.length">No participating payer was found for this saved insurer. Confirm the insurer’s full name and use its portal or contact the payer.</p>
        <p v-if="morePayers">More matches exist. Confirm a more specific insurer name in the saved policy if the correct entity is not listed.</p>
        <label v-if="payers.length">Participating payer<select v-model="payerId" required><option value="">Choose the exact insurer and plan entity</option><option v-for="p in payers" :key="p.stediId" :value="p.stediId">{{ p.name }} · {{ p.payerId }} · {{ p.states.join(', ') }}</option></select></label>
        <label>Billing office<select v-model="officeId" required><option value="">Choose this agency’s office</option><option v-for="o in workspace.offices" :key="o.id" :value="o.id" :disabled="!o.available">{{ o.name }}{{ o.available ? '' : ' — setup needed' }}</option></select></label>
        <label>Date of service<input v-model="date" type="date" required /></label>
        <label>Reason<select v-model="reason" required><option value="">Choose a reason</option><option value="other_coverage_denial">Claim denied for other insurance</option><option value="overlapping_policies">Overlapping policies</option><option value="billing_order_unclear">Billing order is unclear</option><option value="reported_other_insurance">Other insurance was reported</option></select></label>
        <label><input v-model="confirmations.name" type="checkbox" /> I confirmed the exact spelling of the client’s and subscriber’s legal names.</label>
        <label><input v-model="confirmations.birthdate" type="checkbox" /> I confirmed the client’s and subscriber’s birthdates.</label>
        <label><input v-model="confirmations.address" type="checkbox" /> I checked the saved address with the client or their records.</label>
        <label><input v-model="confirmations.policy" type="checkbox" /> I confirmed this policy covers the client on this date and the member ID includes its prefix.</label>
        <label><input v-model="confirmations.payer" type="checkbox" /> The participating payer selected is the correct insurer and plan entity.</label>
        <label><input v-model="confirmations.cost" type="checkbox" /> I authorize this paid COB check. Stedi’s listed starting price is ${{ (workspace.estimatedPriceCents / 100).toFixed(2) }} per check; account pricing applies.</label>
        <p>Recent identical checks are reused. Paid attempts with uncertain outcomes must be reconciled before another check.</p>
        <label><input v-model="freshSearch" type="checkbox" /> A fresh paid check is needed instead of the saved result.</label>
        <label v-if="freshSearch">Why is another paid check needed?<textarea v-model="repeatReason" minlength="10" maxlength="500" required /></label>
        <button type="submit" class="btn btn-primary" :disabled="!canSearch">{{ busy ? 'Checking…' : 'Run confirmed COB check' }}</button>
      </form>
      <article v-for="check in workspace.checks" :key="check.id" class="cob-result">
        <h5>{{ check.payerName || 'COB check' }} · {{ check.serviceDate }} · {{ statusLabel(check) }}</h5>
        <template v-if="check.assessment">
          <p>{{ classificationLabel(check.assessment.classification) }}</p>
          <ul v-if="check.reviewRequired"><li v-for="issue in check.assessment.issues" :key="issue">{{ issue }}</li></ul>
          <div v-for="finding in check.assessment.findings" :key="finding.index" class="cob-finding">
            <strong>{{ finding.payerName || 'Unidentified payer' }} · Reported order: {{ finding.order }}</strong>
            <p>Member ID: {{ finding.memberId || 'Not returned' }} · {{ finding.serviceTypes.join(', ') || finding.serviceTypeCodes.join(', ') }}</p>
            <p v-for="(value,key) in finding.dates" :key="key">{{ key }}: {{ value }}</p>
            <template v-if="check.reviewRequired">
              <button type="button" class="btn btn-secondary" :disabled="!check.assessment.identityMatches || busy" @click="emit('use-policy',{policy:finding.policy,slot:'primary'})">Copy to empty primary form</button>
              <button type="button" class="btn btn-secondary" :disabled="!check.assessment.identityMatches || busy" @click="emit('use-policy',{policy:finding.policy,slot:'secondary'})">Copy to empty secondary form</button>
              <label>Policy resolution<select v-model="reviews[check.id].decisions[finding.index].status"><option value="">Choose resolution</option><option value="recorded">Saved as verified insurance</option><option value="not_applicable">Does not apply / payer corrected this result</option></select></label>
              <label v-if="reviews[check.id].decisions[finding.index].status==='recorded'">Saved position<select v-model="reviews[check.id].decisions[finding.index].slot"><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>
              <label>Evidence for this resolution<textarea v-model="reviews[check.id].decisions[finding.index].reason" minlength="10" maxlength="500" /></label>
            </template>
          </div>
        </template>
        <p v-else>The outcome is not confirmed. Check this attempt in the Stedi portal before another paid request.</p>
        <details v-if="check.response"><summary>Full saved payer response</summary><pre>{{ JSON.stringify(check.response,null,2) }}</pre></details>
        <form v-if="check.reviewRequired || check.status==='sending' || check.status==='unknown'" @submit.prevent="reconcile(check)">
          <label><input v-model="reviews[check.id].portalChecked" type="checkbox" required /> I checked supporting payer or Stedi evidence, including this attempt’s outcome.</label>
          <label><input v-model="reviews[check.id].coverageRecorded" type="checkbox" required /> All applicable coverage is saved and verified in the billing profile.</label>
          <label><input v-model="reviews[check.id].billingOrderConfirmed" type="checkbox" required /> I resolved billing order, including Medicaid and any additional coverage.</label>
          <label>Resolution and payer reference<textarea v-model="reviews[check.id].reference" minlength="10" maxlength="500" required /></label>
          <button type="submit" class="btn btn-primary" :disabled="busy">Save COB resolution</button>
        </form>
        <p v-if="check.review">Resolution: {{ check.review.reference }}</p>
      </article>
      <button type="button" class="btn btn-secondary" @click="close">Close COB details</button>
    </div>
  </section>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:[String,Number],agencyId:[String,Number],serviceDate:String,currentInsurance:Object});
const emit=defineEmits(['saved','use-policy']);
const workspace=ref(null),busy=ref(false),error=ref(''),notice=ref(''),edited=ref(false),payers=ref([]),payersLoaded=ref(false),morePayers=ref(false),slot=ref(''),payerId=ref(''),officeId=ref(''),reason=ref(''),date=ref(props.serviceDate || new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),confirmations=ref({}),freshSearch=ref(false),repeatReason=ref(''),reviews=ref({});
let seq=0,requestKey=crypto.randomUUID();
const path=computed(()=>`/medical-billing/clients/${props.clientId}/coordination-of-benefits`);
const policy=computed(()=>workspace.value?.policies.find(p=>p.slot===slot.value));
const addressLabel=computed(()=>['addressLine1','addressLine2','city','state','postalCode'].map(k=>workspace.value?.patient[k]).filter(Boolean).join(', ') || 'No address saved');
const canSearch=computed(()=>workspace.value?.enabled && workspace.value.verified && !edited.value && !busy.value && slot.value && payerId.value && officeId.value && reason.value && date.value && ['name','birthdate','address','policy','payer','cost'].every(k=>confirmations.value[k]===true) && (!freshSearch.value || repeatReason.value.trim().length>=10));
function initReviews(){reviews.value=Object.fromEntries((workspace.value?.checks || []).map(c=>[c.id,{portalChecked:false,coverageRecorded:false,billingOrderConfirmed:false,reference:'',decisions:(c.assessment?.findings || []).map(f=>({index:f.index,status:'',slot:'primary',reason:''}))}]));}
async function open(){if(busy.value)return;const n=++seq;busy.value=true;error.value='';notice.value='';workspace.value=null;confirmations.value={};payers.value=[];payersLoaded.value=false;payerId.value='';slot.value='';freshSearch.value=false;repeatReason.value='';requestKey=crypto.randomUUID();try{const r=await api.get(path.value,{params:{agencyId:props.agencyId}});if(n!==seq)return;workspace.value=r.data;edited.value=false;initReviews();}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'COB information could not be loaded.';}finally{if(n===seq)busy.value=false;}}
async function loadPayers(){if(busy.value || !slot.value)return;const n=seq,selectedSlot=slot.value;busy.value=true;error.value='';payers.value=[];payerId.value='';try{const r=await api.get(`${path.value}/payers`,{params:{agencyId:props.agencyId,slot:selectedSlot}});if(n!==seq || selectedSlot!==slot.value)return;payers.value=r.data.payers;payersLoaded.value=true;morePayers.value=r.data.moreAvailable;}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Payer participation could not be checked.';}finally{if(n===seq)busy.value=false;}}
async function action(work){if(busy.value)return;const n=seq;busy.value=true;error.value='';notice.value='';try{const r=await work();if(n!==seq)return;notice.value=r.data.message || (r.data.reused?'Saved COB result reused; no new paid check.':'COB information saved.');const current=await api.get(path.value,{params:{agencyId:props.agencyId}});if(n!==seq)return;workspace.value=current.data;initReviews();emit('saved');}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'The outcome could not be confirmed. Reopen COB history before trying again.';}finally{if(n===seq)busy.value=false;}}
async function search(){if(!canSearch.value)return;const input={agencyId:props.agencyId,requestKey,fingerprint:workspace.value.fingerprint,slot:slot.value,stediPayerId:payerId.value,billingOfficeId:officeId.value,serviceDate:date.value,reason:reason.value,freshSearch:freshSearch.value,repeatReason:repeatReason.value,nameConfirmed:true,birthdateConfirmed:true,addressConfirmed:true,policyConfirmed:true,payerConfirmed:true,costConfirmed:true};confirmations.value={};await action(()=>api.post(path.value,input,{timeout:150000}));}
const reconcile=check=>action(()=>api.post(`${path.value}/${check.id}/reconcile`,{agencyId:props.agencyId,...reviews.value[check.id]}));
const statusLabel=c=>c.reviewRequired?'Needs billing help':({clear:'Check complete — no new COB issue',complete:'Check complete',reconciled:'Resolved',sending:'Outcome pending',unknown:'Outcome uncertain'}[c.status] || c.status);
const classificationLabel=c=>({MemberFoundNoCob:'No overlapping coverage reported by Stedi.',CobInstanceExistsPrimacyDetermined:'Overlapping coverage and billing order reported.',CobInstanceExistsPrimacyUndetermined:'Overlapping coverage found; billing order is undetermined.',CoverageOverlapNoBenefitOverlap:'Coverage overlaps, but these benefits do not.',CoverageOverlapExistsNotSubjectToCob:'Coverage overlaps without a reported COB requirement.'}[c] || c);
function close(){seq++;workspace.value=null;reviews.value={};payers.value=[];confirmations.value={};busy.value=false;error.value='';notice.value='';}
watch(slot,()=>{payers.value=[];payersLoaded.value=false;payerId.value='';});
watch([slot,payerId,officeId,date,freshSearch],()=>{confirmations.value={};requestKey=crypto.randomUUID();});
watch(()=>props.currentInsurance,()=>{if(workspace.value){edited.value=true;confirmations.value={};}},{deep:true});
watch(()=>[props.agencyId,props.clientId],close);
onBeforeUnmount(()=>{seq++;});
</script>
<style scoped>
.cob-panel{padding:16px;border:1px solid var(--border);border-radius:10px;margin:16px 0}form,.cob-finding{display:grid;gap:12px;margin:12px 0}label{display:block}select,input[type=date],textarea{display:block;max-width:100%;padding:8px}input[type=checkbox]{margin-right:6px}.cob-result{border-top:1px solid var(--border);margin-top:20px;padding-top:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto}p[role=alert]{color:var(--app-text-red,#b91c1c)}
</style>
