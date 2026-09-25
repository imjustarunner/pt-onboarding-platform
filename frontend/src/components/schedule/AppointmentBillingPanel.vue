<template>
  <section class="abp" data-testid="appointment-billing-panel">
    <header class="abp-heading"><div><h2>Appointment Billing</h2><p>{{ serviceLabel || primaryServiceCode || 'Service details pending' }}</p></div><button class="btn btn-secondary btn-sm" :disabled="loading || !clinicalSessionId" @click="load">Refresh status</button></header>
    <p v-if="loading" role="status">Loading claim progress…</p>
    <p v-if="error" role="alert" class="abp-error">{{ error }}</p>
    <section class="abp-card abp-overview" aria-label="Insurance and appointment">
      <div><span class="abp-label">Primary policy</span><strong>{{ data?.primaryPolicy?.insurerName || 'Insurance not yet recorded' }}</strong><p v-if="data?.primaryPolicy?.memberId">Member {{ data.primaryPolicy.memberId }}</p><p v-if="data?.primaryPolicy?.planType">{{ data.primaryPolicy.planType }}</p><p v-if="data?.secondaryPolicy">Secondary: {{ data.secondaryPolicy.insurerName }}</p><small>Coverage and network participation require verification for the service date.</small></div>
      <dl><div><dt>Service date</dt><dd>{{ serviceDateLabel || 'Not recorded' }}</dd></div><div><dt>Provider</dt><dd>{{ providerName || 'Not recorded' }}</dd></div><div><dt>Client</dt><dd>{{ clientName || 'Linked appointment client' }}</dd></div><div><dt>Service location</dt><dd>{{ locationLabel || modalityLabel || 'Needs confirmation' }}</dd></div><div><dt>Time</dt><dd>{{ timeRangeLabel || 'Not recorded' }}</dd></div></dl>
    </section>
    <section v-for="(claim, index) in progress" :key="claim.claimId || index" class="abp-card" aria-label="Claim progress">
      <div class="abp-heading"><h3>{{ claim.payerSequence === 2 ? 'Secondary claim progress' : 'Claim progress' }}</h3><span class="abp-badge" :class="claim.status">{{ claim.label }}</span></div>
      <ol class="abp-progress"><li v-for="(step, i) in steps" :key="step" :class="{reached: i <= claim.step}" :aria-current="i === claim.step ? 'step' : undefined"><span>{{ i < claim.step ? '✓' : i + 1 }}</span>{{ step }}</li></ol>
      <p class="abp-muted">Acceptance is an acknowledgement. Payment requires separate adjudication and posting.</p>
      <ul v-if="claim.actions?.length" class="abp-actions"><li v-for="action in claim.actions" :key="action">{{ action }}</li></ul>
      <button v-if="claim.actions?.length" type="button" class="btn btn-secondary btn-sm" @click="emit('open-note')">Open note / documentation</button>
      <p v-if="claim.correctionPending" class="abp-muted">Changes to a signed note use a signed amendment or addendum with supervisor approval.</p>
    </section>
    <template v-if="data?.financialAccess === true && canViewFinancials">
      <section class="abp-card" aria-label="Charge details"><h3>Charge details</h3><table v-if="financialClaims.length"><thead><tr><th>Claim</th><th>Service</th><th>Units / modifiers</th><th>Charge</th><th>Status</th></tr></thead><tbody><tr v-for="line in financialLines" :key="`${line.claimId}-${line.lineNumber}`"><td>#{{ line.claimId }} · {{ line.payerSequence === 2 ? 'Secondary' : 'Primary' }}</td><td>{{ line.serviceCode || 'Review claim lines' }}</td><td>{{ line.units ?? '—' }} · {{ modifiers(line.modifiers) }}</td><td>{{ money(line.chargeCents, line.currency) }}</td><td>{{ line.label }}</td></tr></tbody></table><p v-else>Charges will appear after the signed service note is used to prepare a claim.</p><p class="abp-muted">Primary and secondary charges represent the same service; they are not added together.</p></section>
      <section v-if="patientLedger" class="abp-card" aria-label="Patient payment breakdown"><h3>Patient payment breakdown</h3><dl><div><dt>Recorded responsibility</dt><dd>{{ money(patientLedger.responsibilityCents, patientLedger.currency) }}</dd></div><div><dt>Net payments recorded</dt><dd>{{ money(patientLedger.paidCents, patientLedger.currency) }}</dd></div><div><dt>Remaining patient balance</dt><dd>{{ money(patientLedger.balanceCents, patientLedger.currency) }}</dd></div></dl><p v-if="patientLedger.refundReviewCents">Refund review: {{ money(patientLedger.refundReviewCents, patientLedger.currency) }}. Patient responsibility is zero.</p><p v-if="patientLedger.held">Balance is on hold or disputed; review before collection.</p><p v-else>Ledger status: {{ patientLedger.status }}</p></section>
      <section class="abp-card"><h3>Reconciliation &amp; actions</h3><p>Review verified patient balances and posted payments in the billing workspace. Claim acceptance does not establish a payment or patient balance.</p><button type="button" class="btn btn-primary btn-sm" :disabled="!clinicalSessionId" @click="emit('open-claim', financialClaims[0]?.claimId || null)">Open claim and billing actions</button><p class="abp-muted">Billing edits, review, corrections and submission use the existing audited claim workflow.</p></section>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props = defineProps({
  agencyId: {type:[Number,String],default:0}, clinicalSessionId:{type:[Number,String],default:0},
  canViewFinancials:{type:Boolean,default:false}, clientName:{type:String,default:''},
  serviceLabel:{type:String,default:''}, primaryServiceCode:{type:String,default:''},
  locationLabel:{type:String,default:''}, modalityLabel:{type:String,default:''}, providerName:{type:String,default:''},
  serviceDateLabel:{type:String,default:''}, timeRangeLabel:{type:String,default:''}
});
const emit=defineEmits(['open-claim','open-note']);
const data=ref(null),loading=ref(false),error=ref(''); let request=0;
const steps=['Planned / draft','Ready for review','Submitted','Accepted','Payment recorded'];
const progress=computed(()=>data.value?.progress || [{status:'open',label:props.clinicalSessionId ? 'Status not yet loaded' : 'Planned — save session to track progress',step:0,actions:[]}]);
const financialClaims=computed(()=>progress.value.filter(c=>c.financial));
const financialLines=computed(()=>financialClaims.value.flatMap(c=>(c.financial.lines?.length ? c.financial.lines : [{lineNumber:0,serviceCode:props.primaryServiceCode,chargeCents:c.financial.chargeCents}]).map(line=>({...line,claimId:c.claimId,payerSequence:c.payerSequence,label:c.label,currency:c.financial.currency}))));
const modifiers=value=>{try{const list=typeof value==='string'?JSON.parse(value):value;return Array.isArray(list)?list.join(', ') || '—':'—';}catch{return 'Review';}};
const patientLedger=computed(()=>financialClaims.value.find(c=>c.payerSequence !== 2)?.financial?.patient || null);
const money=(cents,currency)=>new Intl.NumberFormat('en-US',{style:'currency',currency:currency || 'USD'}).format(Number(cents)/100);
async function load(){
  const id=++request; data.value=null; error.value=''; loading.value=false;
  if(!Number(props.agencyId)||!Number(props.clinicalSessionId))return;
  loading.value=true;
  try {const result=await api.get(`/medical-billing/sessions/${props.clinicalSessionId}/appointment-billing`,{params:{agencyId:Number(props.agencyId)}});if(id===request)data.value=result.data;}
  catch {if(id===request)error.value='Claim progress could not be loaded. Refresh or ask the billing team to check this session.';}
  finally {if(id===request)loading.value=false;}
}
watch(()=>[props.agencyId,props.clinicalSessionId,props.canViewFinancials],load,{immediate:true});
onBeforeUnmount(()=>{request++;});
</script>
<style scoped>
.abp{display:grid;gap:16px;color:var(--text-primary,#172b4d)}
.abp-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.abp h2,.abp h3{margin:0 0 8px}.abp p{margin:8px 0}.abp-card{border:1px solid var(--border-color,#dce5ed);border-radius:14px;padding:20px;background:var(--bg-primary,#fff)}.abp-overview{display:grid;grid-template-columns:1fr 1fr;gap:24px}.abp-label{display:block;margin-bottom:12px;color:var(--text-secondary,#586a80)}.abp-overview strong{display:block;font-size:1.1rem}.abp dl{margin:0}.abp dl div{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #edf1f5}.abp dt,.abp-muted,.abp small{color:var(--text-secondary,#586a80)}.abp dd{margin:0;text-align:right}.abp-progress{display:flex;list-style:none;padding:16px 0;margin:0}.abp-progress li{flex:1;text-align:center;position:relative;font-size:.82rem;color:#63738a}.abp-progress li span{display:grid;place-items:center;position:relative;z-index:1;border-radius:50%;width:32px;height:32px;margin:0 auto 8px;background:#e7edf3}.abp-progress li:not(:last-child):after{content:'';height:3px;background:#e7edf3;position:absolute;left:50%;right:-50%;top:15px}.abp-progress .reached span{background:var(--primary-color,#1677bc);color:white}.abp-badge{background:#fff3d9;color:#895400;padding:7px 12px;border-radius:20px;font-weight:600;font-size:.85rem}.abp-badge.rejected,.abp-badge.denied,.abp-error{color:#b42332;background:#fff0f1}.abp-badge.paid{background:#dff6ed;color:#086c47}.abp-actions{padding-left:20px;line-height:1.7}.abp table{width:100%;border-collapse:collapse;text-align:left}.abp th,.abp td{padding:12px 8px;border-bottom:1px solid #e7edf3}.abp th{background:#f3f7fb;font-size:.85rem}.abp-error{padding:12px;border-radius:8px}@media(max-width:650px){.abp-overview{grid-template-columns:1fr}.abp-card{padding:14px}.abp-progress li{font-size:.7rem}.abp table{font-size:.8rem}}
</style>
