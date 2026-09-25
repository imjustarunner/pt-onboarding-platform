<template>
 <section class="service-fees"><h2>Agency billing service fees</h2><p>Fees paid by this agency to the management company. Stripe’s processor fees are separate; client balances and receipts are not increased.</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <template v-if="data"><p><strong>{{ data.activationEnabled ? 'Deployment activation enabled' : 'Live service fees are disabled' }}</strong> · Agreement {{ data.agreement?.revision || 'not configured' }}</p>
   <form @submit.prevent="save"><div class="fields"><label v-for="f in fields" :key="f.key">{{ f.label }}<input v-model.number="form[f.key]" type="number" :min="0" :max="f.max" :step="f.step || 1" required :disabled="busy || !data.canEdit" /></label></div>
    <label>Service agreement reference<input v-model="form.contractReference" minlength="5" maxlength="1000" required :disabled="busy || !data.canEdit" /></label>
    <label class="check"><input v-model="form.enabled" type="checkbox" :disabled="busy || !data.canEdit" /> Apply this agency’s agreement to new services</label>
    <label v-if="data.canEdit" class="check"><input v-model="form.termsConfirmed" type="checkbox" :required="form.enabled" :disabled="busy" /> The agency accepted these rates under the referenced agreement.</label>
    <button v-if="data.canEdit" :disabled="busy">Save new agreement revision</button>
   </form>
   <p>Claim and eligibility service fees appear on a subsequent agency invoice after the usage month closes. Only acknowledged claim transmissions and returned eligibility checks are billable. Unconfirmed requests remain pending. No historical usage is priced retroactively.</p>
   <p>Card application fees are deducted from agency proceeds on connected-account card payments. A retry keeps its original fee; the fee is capped at the payment amount. Refunds initiated in this app return the proportional application fee to the agency.</p>
   <details><summary>Agreement history</summary><ul><li v-for="item in data.history" :key="item.id">Revision {{ item.revision }} · {{ item.enabled ? 'Enabled' : 'Paused' }} · {{ item.effective_at }} · {{ item.contract_reference }}</li></ul></details>
  </template>
 </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true}}),data=ref(null),form=ref({}),busy=ref(false),error=ref(''),notice=ref('');let sequence=0;
const fields=[{key:'claimUnitCents',label:'Per acknowledged claim (cents)',max:100000},{key:'eligibilityUnitCents',label:'Per returned eligibility check (cents)',max:100000},{key:'cardFeePercent',label:'Platform card fee (%)',max:100,step:'0.01'},{key:'cardFixedCents',label:'Platform fixed fee per card payment (cents)',max:100000}];
async function load(){const seq=++sequence;data.value=null;busy.value=true;error.value='';try{const r=await api.get('/medical-billing/service-fees',{params:{agencyId:props.agencyId}});if(seq!==sequence)return;data.value=r.data;const a=r.data.agreement;form.value={revision:a?.revision||0,enabled:!!a?.enabled,claimUnitCents:a?.claim_unit_cents||0,eligibilityUnitCents:a?.eligibility_unit_cents||0,cardFeePercent:(a?.card_fee_bps||0)/100,cardFixedCents:a?.card_fixed_cents||0,contractReference:a?.contract_reference||'',termsConfirmed:false};}catch(e){if(seq===sequence)error.value=e.response?.data?.error?.message||'Service pricing is unavailable; check migration and access.';}finally{if(seq===sequence)busy.value=false;}}
async function save(){const seq=sequence;busy.value=true;error.value='';notice.value='';try{await api.put('/medical-billing/service-fees',{...form.value,cardFeeBps:Math.round(Number(form.value.cardFeePercent)*100),agencyId:props.agencyId});if(seq!==sequence)return;await load();if(seq+1===sequence)notice.value='New agreement revision saved. Prior prices and payment quotes are preserved.';}catch(e){if(seq===sequence)error.value=e.response?.data?.error?.message||'Agreement could not be saved';}finally{if(seq===sequence)busy.value=false;}}
watch(()=>props.agencyId,()=>{sequence++;notice.value='';load();},{immediate:true});onBeforeUnmount(()=>{sequence++;});
</script>
<style scoped>
.service-fees{background:var(--bg-card,#fff);padding:24px;margin:20px 0;border:1px solid var(--border-color,#dce5ef);border-radius:14px}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}label{display:flex;flex-direction:column;gap:8px;margin:14px 0}.check{flex-direction:row;align-items:center}input:not([type=checkbox]),button{padding:10px;font:inherit;border:1px solid var(--border-color,#c4d0df);border-radius:6px}button{background:var(--bg-card,#fff);color:var(--bw-brand,#2463ad);cursor:pointer}p,li{line-height:1.6}[role=alert]{color:#b91c1c}summary{cursor:pointer}button:disabled{opacity:.5}
</style>
