<template>
  <section class="cost-planner" aria-labelledby="billing-cost-title">
    <header><span class="eyebrow">PLANNING</span><h2 id="billing-cost-title">Verification &amp; processing costs</h2><p>Basic is selected for account 31985. Compare frequencies using the same client population. Enter totals across every company using one Claim.MD account; its included allowance is shared.</p></header>
    <p class="notice">Estimates only. This does not enable background checks, set agency prices, or charge anyone. Figures reset when you leave this page.</p>
    <form @submit.prevent>
      <fieldset><legend>Claim.MD account totals</legend><div class="fields">
        <label>Account plan<select v-model="form.plan"><option value="">Select your actual plan</option><option v-for="(plan,key) in claimMdPlans" :key="key" :value="key">{{ plan.label }}</option></select></label>
        <label v-for="field in coverageFields" :key="field.key">{{ field.label }}<input v-model.number="form[field.key]" type="number" min="0" :step="field.step || 1" :max="field.max || 10000000" /></label>
      </div></fieldset>
      <fieldset><legend>Card processing estimate</legend><p>Agency expenses, with a separately proposed platform fee. This does not add fees to a client’s balance.</p><div class="fields"><label v-for="field in cardFields" :key="field.key">{{ field.label }}<input v-model.number="form[field.key]" type="number" min="0" :step="field.step || 1" :max="field.max || 100000000" /></label></div></fieldset>
    </form>
    <p v-if="calculation.error" role="status">{{ calculation.error }}</p>
    <template v-else>
      <div class="table-scroll"><table><caption>Estimated monthly Claim.MD account cost</caption><thead><tr><th>Verification frequency</th><th>Checks</th><th>Over allowance</th><th>Eligibility overage</th><th>Account total</th></tr></thead><tbody><tr v-for="row in calculation.value.scenarios" :key="row.id"><th>{{ row.label }}</th><td>{{ row.checks.toLocaleString() }}</td><td>{{ row.excessChecks.toLocaleString() }}</td><td>{{ range(row.eligibilityLowCents,row.eligibilityHighCents) }}</td><td>{{ range(row.totalLowCents,row.totalHighCents) }}</td></tr></tbody></table></div>
      <p>Includes base {{ money(calculation.value.planMonthlyCents) }}, additional tax IDs {{ money(calculation.value.taxIdFeesCents) }}, claims overage {{ money(calculation.value.claimCostCents) }} and ERA overage {{ money(calculation.value.eraCostCents) }}.</p>
      <dl><div><dt>Estimated card processor cost</dt><dd>{{ money(calculation.value.cards.processorCents) }}</dd></div><div><dt>Proposed platform card fee</dt><dd>{{ money(calculation.value.cards.platformCents) }}</dd></div><div><dt>Combined monthly card cost</dt><dd>{{ money(calculation.value.cards.combinedCents) }}</dd></div></dl>
    </template>
    <details><summary>Assumptions &amp; setup checklist</summary><ul>
      <li>Primary and secondary policies count separately. Eligibility can report other coverage, but cannot guarantee discovery of every policy. Continue the Medicaid Other Insurance/TPL review.</li>
      <li>Monthly and weekly scenarios check every listed policy; before-visit checks count scheduled primary and secondary policy visits. Add manual checks, changes and retries to the additional-check count.</li>
      <li>Unlimited eligibility overage spans Prime and non-Prime rates. Confirm your payer mix and invoice. ERA volume means claim responses (CLP), not files. Additional tax ID fees must be entered from your contract.</li>
      <li>Background scheduling still needs payer eligibility readiness, a responsible billing reviewer, a monthly limit, duplicate-request protection and a pause control before activation.</li>
      <li>The initial card assumption is domestic online card list pricing. Replace it with your Stripe contract. Include Connect, payouts and other applicable costs in the extra-fees field; refunds, disputes and international cards can change the result. Percentage rounding on individual transactions may differ slightly.</li>
      <li>For Chase deposit matching, confirm bank-feed registration and authorized-owner consent, map accounts to the correct agencies, and test posted-deposit matching against ERAs. A connected bank is not proof that a payer paid a claim.</li>
    </ul></details>
    <footer>Public list prices checked September 25, 2026 · <a href="https://www.claim.md/pricing" target="_blank" rel="noopener noreferrer">Claim.MD pricing</a> · <a href="https://stripe.com/connect/pricing" target="_blank" rel="noopener noreferrer">Stripe pricing</a> · <a href="https://docs.stripe.com/financial-connections/transactions" target="_blank" rel="noopener noreferrer">Bank transaction feeds</a></footer>
  </section>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { claimMdPlans, estimateBillingCosts } from '../../utils/billingCostEstimate';
const form = reactive({ plan:'basic', clients:0, secondaryClients:0, visits:0, secondaryVisits:0, claims:0, eras:0, extraChecks:0, taxIdFeeDollars:0,
  cardDollars:0, cardTransactions:0, processorPercent:2.9, processorFixedCents:30, markupPercent:0, otherProcessorDollars:0 });
const coverageFields = [
  {key:'clients',label:'Active insured clients',max:1000000}, {key:'secondaryClients',label:'Clients with secondary coverage',max:1000000},
  {key:'visits',label:'Monthly insured visits'}, {key:'secondaryVisits',label:'Visits with secondary coverage'},
  {key:'claims',label:'Electronic claims / month (include secondary and corrections)'}, {key:'eras',label:'ERA claim responses / month'},
  {key:'extraChecks',label:'Additional eligibility checks / month'}, {key:'taxIdFeeDollars',label:'Additional tax ID fees / month ($)',step:'0.01'}
];
const cardFields = [
  {key:'cardDollars',label:'Card payments / month ($)',step:'0.01'}, {key:'cardTransactions',label:'Card transactions / month'},
  {key:'processorPercent',label:'Processor percentage (%)',step:'0.01',max:100}, {key:'processorFixedCents',label:'Processor fee per payment (cents)',max:10000},
  {key:'markupPercent',label:'Proposed platform percentage (%)',step:'0.01',max:100}, {key:'otherProcessorDollars',label:'Other processor / Connect fees per month ($)',step:'0.01'}
];
function scaled(value) { return value === '' ? '' : Math.round(Number(value)*100); }
const calculation = computed(() => {
  try { return {value:estimateBillingCosts({...form,taxIdFeesCents:scaled(form.taxIdFeeDollars),cardVolumeCents:scaled(form.cardDollars),processorBps:scaled(form.processorPercent),markupBps:scaled(form.markupPercent),otherProcessorFeesCents:scaled(form.otherProcessorDollars)})}; }
  catch(e) { return {error:e.message}; }
});
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const range = (low,high) => low === high ? money(low) : `${money(low)}–${money(high)}`;
</script>

<style scoped>
.cost-planner{background:var(--bg-card,#fff);border:1px solid var(--border-color,#dde5ef);border-radius:14px;padding:24px;margin:20px 0;color:var(--text-primary,#182a44)}
h2{margin:6px 0 10px}.eyebrow{font-size:12px;letter-spacing:.12em;color:var(--bw-brand,#2463ad)}
p,li,footer{line-height:1.6}p,footer{color:var(--text-secondary,#536580)}.notice{padding:12px 16px;background:var(--bg-secondary,#eff5fb);border-radius:8px}
fieldset{border:1px solid var(--border-color,#dde5ef);border-radius:10px;margin:20px 0;padding:18px}legend,caption{font-weight:600}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}label{display:flex;flex-direction:column;gap:8px;font-size:14px}
input,select{min-height:40px;padding:8px;border:1px solid var(--border-color,#b9c8dc);border-radius:6px;background:var(--bg-input,#fff);color:inherit;font:inherit}
.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}caption{text-align:left;padding:10px 0}th,td{text-align:left;padding:14px;border-bottom:1px solid var(--border-color,#dde5ef)}thead{background:var(--bg-secondary,#f2f6fc)}
dl{display:flex;flex-wrap:wrap;gap:24px}dl div{flex:1;min-width:190px;padding:16px;background:var(--bg-secondary,#f2f6fc);border-radius:10px}dd{margin:8px 0 0;font-size:24px;font-weight:600}summary{cursor:pointer;font-weight:600}li{margin:10px 0}footer{margin-top:20px;font-size:13px}a{color:var(--bw-brand,#2463ad)}
</style>
