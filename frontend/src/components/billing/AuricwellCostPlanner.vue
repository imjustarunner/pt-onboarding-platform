<template>
  <section class="auricwell-planner">
    <h2>AuricWell plan and usage estimate</h2><p>Compare the monthly practice cost with expected usage. This estimate does not change a subscription or charge a customer.</p>
    <div class="fields"><label>Practice plan<select v-model="form.tier"><option v-for="p in AURICWELL_PLANS" :value="p.id" :key="p.id">{{ p.name }}</option></select></label>
      <label v-for="(label,key) in seatLabels" :key="key">{{ label }}<input v-model.number="form.counts[key]" type="number" min="0" max="10000" step="1" /></label>
      <label>Administrators who also provide clinical care<input v-model.number="form.clinicalAdministrators" type="number" min="0" :max="form.counts.administrator" step="1" /></label>
    </div>
    <fieldset><legend>Expected monthly usage</legend><div class="fields"><label v-for="(meter,key) in AURICWELL_METERS" :key="key">{{ meter.label }}<input v-model.number="form.usage[key]" type="number" min="0" step="1" /></label></div><p>Include every connected video participant. Text notifications share the SMS segment allowance. Standard transactional email and in-app notifications are included.</p></fieldset>
    <p v-if="calculation.error" role="alert">{{ calculation.error }}</p>
    <template v-else>
      <div class="totals" aria-live="polite"><div><span>Practice + seats</span><strong>{{ money(calculation.value.subscriptionCents) }}</strong></div><div><span>Usage above allowances</span><strong>{{ money(calculation.value.totalCents-calculation.value.subscriptionCents) }}</strong></div><div><span>Estimated monthly total</span><strong>{{ money(calculation.value.totalCents) }}</strong></div></div>
      <div class="scroll"><table><thead><tr><th>Usage</th><th>Included</th><th>Expected</th><th>Overage cost</th></tr></thead><tbody><tr v-for="m in calculation.value.meters" :key="m.key"><th>{{ m.label }}</th><td>{{ m.included.toLocaleString() }}</td><td>{{ m.used.toLocaleString() }}<small v-if="m.percentUsed >= 80">{{ m.percentUsed }}% of allowance</small></td><td>{{ money(m.amountCents) }}</td></tr></tbody></table></div>
    </template>
    <details><summary>Check vendor costs and the amount remaining</summary><p>This planning comparison uses Vonage video list pricing, a configurable SMS budget, and Claim.MD’s published plans. Replace estimates with your account rates and invoices. The amount remaining still has to cover hosting, support, payment processing and other costs.</p>
      <div class="fields"><label>Claim.MD account plan<select v-model="vendor.plan"><option value="basic">Basic · $30/month</option><option value="small">Small Volume · $60/month</option><option value="unlimited">Unlimited · $120/month</option></select></label><label>SMS cost budget per segment ($)<input v-model.number="vendor.smsDollars" type="number" min="0" step="0.001" /></label><label>Other monthly vendor costs ($)<input v-model.number="vendor.otherDollars" type="number" min="0" step="0.01" /></label></div>
      <p>The starting SMS budget of $0.02 is a planning assumption, not a verified Vonage account rate. Carrier fees, phone rental and registration are account-specific. Vonage’s HIPAA/BAA offering requires a sales quote; include that cost under other vendor costs. Shared Claim.MD accounts must be reconciled across all practices.</p>
      <p v-if="vendorCalculation.error" role="alert">{{ vendorCalculation.error }}</p><div v-else class="totals"><div><span>Estimated vendor costs</span><strong>{{ money(vendorCalculation.low) }}–{{ money(vendorCalculation.high) }}</strong></div><div><span>Remaining before other operating costs</span><strong>{{ money(vendorCalculation.remainingLow) }}–{{ money(vendorCalculation.remainingHigh) }}</strong></div></div>
      <p>Sources checked October 14, 2026: <a href="https://www.vonage.com/communications-apis/video/pricing/" target="_blank" rel="noopener">Vonage video</a> · <a href="https://www.vonage.com/communications-apis/sms/pricing/" target="_blank" rel="noopener">Vonage SMS</a> · <a href="https://www.claim.md/pricing" target="_blank" rel="noopener">Claim.MD</a></p>
    </details>
    <AuricwellPricingTable />
  </section>
</template>
<script setup>
import { computed, reactive } from 'vue';
import { AURICWELL_PLANS, AURICWELL_METERS, estimateAuricwell } from '../../config/auricwellPricing.js';
import { claimMdPlans } from '../../utils/billingCostEstimate.js';
import AuricwellPricingTable from './AuricwellPricingTable.vue';
const seatLabels = { administrator:'Administrators (includes the first seat)', independent:'Independently billing providers / supervisors', supervised:'Supervised billing providers / interns', support:'Support / billing staff (included)' };
const form = reactive({ tier:'basic', counts:{administrator:1,independent:0,supervised:0,support:0}, clinicalAdministrators:0, usage:{video:0,sms:0,claims:0,eras:0,eligibility:0} });
const vendor = reactive({plan:'basic',smsDollars:0.02,otherDollars:0});
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const calculation = computed(()=>{try{return {value:estimateAuricwell(form)}}catch(e){return {error:e.message}}});
const vendorCalculation = computed(()=>{
  try {
    if(calculation.value.error)throw new Error(calculation.value.error);
    if([vendor.smsDollars,vendor.otherDollars].some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000000))throw new Error('Enter valid vendor cost assumptions.');
    const p=claimMdPlans[vendor.plan],u=form.usage;
    const fixed=p.monthly+Math.max(0,u.claims-p.claims)*p.claimRate+Math.max(0,u.eras-p.eras)*p.eraRate+Math.round(u.video*0.41)+Math.round(u.sms*vendor.smsDollars*100)+Math.round(vendor.otherDollars*100);
    const excess=Math.max(0,u.eligibility-p.eligibility),low=fixed+excess*(vendor.plan==='unlimited'?2:vendor.plan==='small'?50:30),high=fixed+excess*(vendor.plan==='unlimited'?10:vendor.plan==='small'?50:30);
    return {low,high,remainingLow:calculation.value.value.totalCents-high,remainingHigh:calculation.value.value.totalCents-low};
  } catch(e) {return {error:e.message}}
});
</script>
<style scoped>
.auricwell-planner{background:var(--bg-card,#fff);border:1px solid var(--border-color,#d7e5df);border-radius:16px;padding:24px;margin:20px 0;color:var(--text-primary,#173e32)}h2{margin:0 0 10px}p{line-height:1.6}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}label{display:flex;flex-direction:column;gap:8px;font-size:.9rem}input,select{font:inherit;padding:10px;border:1px solid var(--border-color,#b9c9bf);border-radius:8px;background:var(--bg-input,#fff);color:inherit;max-width:100%;box-sizing:border-box}fieldset{border:1px solid var(--border-color,#d7e5df);border-radius:10px;padding:18px;margin:24px 0}.totals{display:flex;flex-wrap:wrap;gap:16px;margin:20px 0}.totals div{flex:1;min-width:190px;background:var(--bg-secondary,#edf5f0);border-radius:10px;padding:16px}.totals strong{display:block;font-size:1.5rem;margin-top:8px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;min-width:550px}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--border-color,#d7e5df)}small{display:block}summary{font-weight:600;cursor:pointer}[role=alert]{color:#b91c1c}
</style>
