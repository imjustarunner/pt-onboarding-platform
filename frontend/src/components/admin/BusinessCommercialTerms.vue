<template>
  <section class="journey-commercial">
    <header><p class="journey-eyebrow">A clear agreement from day one</p><h3>Services, app charges & revenue share</h3><p>Monthly PlotTwistHQ charges come from Features and Billing. Add PlotTwistCo management services below. One-time services are billed separately in their specified month.</p></header>
    <p v-if="!canEdit" class="journey-muted">PlotTwistCo maintains signed terms and confirms monthly revenue. Your company can review them here.</p>
    <div class="journey-actions"><label v-if="state.agreements.length">Agreement version<select v-model.number="selectedIndex"><option v-for="(a, i) in state.agreements" :key="i" :value="i">{{ a.startMonth }} · {{ a.status === 'active' ? 'Signed terms' : 'Draft' }}</option></select></label><button v-if="canEdit" class="btn btn-secondary" @click="addAgreement">{{ state.agreements.length ? 'Add future agreement version' : 'Draft an agreement' }}</button></div>
    <p v-if="!agreement" class="journey-card">No management agreement has been recorded. Start with the interview and agree on services and pricing with the business owner.</p>
    <fieldset v-else class="journey-card" :disabled="!canEdit">
      <legend>Company-specific terms · USD</legend>
      <div class="journey-fields">
        <label>Agreement status<select v-model="agreement.status"><option value="draft">Draft — review before activating</option><option value="active">Signed — apply from effective month</option></select></label>
        <label>Signed agreement reference<input v-model="agreement.contractReference" maxlength="500" placeholder="Document ID or location of signed agreement"></label>
        <label>Date signed<input v-model="agreement.signedOn" type="date"></label>
        <label>First billing month<input v-model="agreement.startMonth" type="month" required></label>
        <label>Last billing month (optional)<input v-model="agreement.endMonth" type="month"></label>
        <label>Contracted revenue share (%)<input type="number" min="0" max="100" step="0.01" :value="agreement.revenueShareBps / 100" @input="agreement.revenueShareBps = Math.round(Number($event.target.value) * 100)"></label>
        <label>Billing method<select v-model="agreement.mode"><option value="higher_of">Higher of app + services or revenue share</option><option value="threshold">Switch to revenue share at a revenue threshold</option><option value="additive">App + services plus revenue share</option><option value="a_la_carte">À-la-carte only</option></select></label>
        <label v-if="agreement.mode === 'threshold'">Monthly revenue threshold ($)<input type="number" min="0.01" step="0.01" :value="agreement.thresholdCents / 100" @input="agreement.thresholdCents = cents($event)"></label>
      </div>
      <label>What counts as revenue under this agreement?<textarea v-model="agreement.revenueBasis" maxlength="500" rows="2" placeholder="For example, cash collected during the calendar month, with the agreed exclusions." /></label>
      <p class="journey-explanation">{{ modeExplanation }}</p>
      <h4>PlotTwistCo services</h4><p class="journey-muted">Use the agreed prices. Feature charges are already included through PlotTwistHQ billing; avoid adding the same app charges here.</p>
      <div v-for="(service, i) in agreement.services" :key="service.id" class="journey-service">
        <label>Service<input v-model="service.name" maxlength="160" placeholder="Business setup, facilitation, training…"></label><label>Price ($)<input type="number" min="0" step="0.01" :value="service.amountCents / 100" @input="service.amountCents = cents($event)"></label><label>Frequency<select v-model="service.cadence"><option value="monthly">Monthly</option><option value="once">One-time</option></select></label><label v-if="service.cadence === 'once'">Bill in<input v-model="service.month" type="month"></label><button type="button" class="journey-link" :aria-label="`Remove ${service.name || 'service'}`" @click="agreement.services.splice(i, 1)">Remove</button>
      </div>
      <button class="btn btn-secondary" @click="addService">Add a service</button>
      <p class="journey-muted">Record an agreement only after it has been signed using your contract process. Invoiced months are locked. Add a later version when terms change.</p>
    </fieldset>
    <section class="journey-card"><h4>Monthly revenue reconciliation</h4><p>Record the revenue defined by the contract. Confirm the source each month, including months with zero revenue. Confirmation enables revenue-based invoicing for that month.</p>
      <fieldset :disabled="!canEdit"><div v-for="(row, i) in state.revenue" :key="i" class="journey-service"><label>Month<input v-model="row.month" type="month"></label><label>Revenue ($)<input type="number" min="0" step="0.01" :value="row.amountCents / 100" @input="row.amountCents = cents($event)"></label><label>Source / reconciliation reference<input v-model="row.reference" maxlength="500" placeholder="Report or reconciliation reference"></label><label class="journey-check"><input v-model="row.confirmed" type="checkbox">Confirmed by PlotTwistCo</label><button class="journey-link" :aria-label="`Remove revenue for ${row.month}`" @click="state.revenue.splice(i, 1)">Remove</button></div><button v-if="canEdit" class="btn btn-secondary" @click="state.revenue.push({ month: currentMonth, amountCents: 0, reference: '', confirmed: false })">Add a revenue month</button></fieldset>
    </section>
    <section class="journey-card" aria-live="polite"><h4>Current month estimate · {{ currentMonth }}</h4><p class="journey-muted">Based on saved terms and current app usage. Save changes to update this estimate.</p><p v-if="!agencyId">App pricing and invoice controls appear after the company workspace is activated. Interview and agreement records will follow the company into its workspace.</p><p v-else-if="quoteError" role="status">{{ quoteError }}</p><template v-else-if="quote"><p v-if="quote.businessAgreement?.ended">The agreed final service month has passed. Further management invoices are paused.</p><template v-else><dl class="journey-totals"><dt>PlotTwistHQ app & usage</dt><dd>{{ money(quote.businessAgreement?.platformCents ?? quote.totals.totalCents) }}</dd><template v-if="quote.businessAgreement"><dt>Monthly management services</dt><dd>{{ money(quote.businessAgreement.serviceCents) }}</dd><dt>À-la-carte monthly total</dt><dd>{{ money(quote.businessAgreement.floorCents) }}</dd><dt>Contracted revenue share</dt><dd>{{ money(quote.businessAgreement.revenueShareCents) }} ({{ quote.businessAgreement.revenueShareBps / 100 }}%)</dd><dt>One-time services</dt><dd>{{ money(quote.businessAgreement.oneTimeCents) }}</dd><dt v-if="quote.businessAgreement.mode === 'higher_of'">Revenue needed to cover monthly charges</dt><dd v-if="quote.businessAgreement.mode === 'higher_of'">{{ money(quote.businessAgreement.breakEvenRevenueCents) }}</dd></template><dt><strong>{{ quote.businessAgreement?.ready === false ? 'Provisional total' : 'Estimated total' }}</strong></dt><dd><strong>{{ money(quote.totals.totalCents) }}</strong></dd></dl><p v-if="quote.businessAgreement?.ready === false" class="journey-error">Revenue has not been confirmed for this month. Invoice generation is blocked until it is reconciled.</p><p v-if="!quote.businessAgreement">No signed management terms apply this month. This estimate contains existing app charges only.</p></template></template><p v-else-if="agencyId">Loading the current estimate…</p></section>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
const props = defineProps({ modelValue: { type: Object, required: true }, canEdit: Boolean, agencyId: { type: [Number, String], default: null }, quote: { type: Object, default: null }, quoteError: { type: String, default: '' } });
const state = computed(() => props.modelValue), selectedIndex = ref(Math.max(0, props.modelValue.agreements.length - 1));
watch(() => props.modelValue, s => { selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, s.agreements.length - 1)); });
const agreement = computed(() => state.value.agreements[selectedIndex.value]);
const currentMonth = new Date().toISOString().slice(0, 7);
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
const cents = event => Math.round(Number(event.target.value) * 100);
const modeExplanation = computed(() => ({ higher_of: 'Each month, bill the higher of app + recurring services or the contracted revenue percentage. The revenue share includes those monthly app and management charges. Add one-time charges separately.', threshold: 'Before the agreed monthly revenue threshold, bill app + recurring services. At or above the threshold, replace them with the contracted revenue percentage. Add one-time charges separately.', additive: 'Bill app + recurring services and add the contracted revenue percentage. Add one-time charges separately.', a_la_carte: 'Bill app usage and the selected recurring services. Add one-time charges in their specified month.' })[agreement.value?.mode]);
function addAgreement() {
  const previous = state.value.agreements.at(-1);
  let startMonth = currentMonth;
  if (previous && previous.startMonth >= startMonth) { const d = new Date(`${previous.startMonth}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); startMonth = d.toISOString().slice(0, 7); }
  state.value.agreements.push(previous ? { ...JSON.parse(JSON.stringify(previous)), startMonth, endMonth: '', status: 'draft', signedOn: '', contractReference: '', services: previous.services.filter(s => s.cadence === 'monthly').map(s => ({ ...s })) } : { startMonth, endMonth: '', status: 'draft', signedOn: '', contractReference: '', revenueBasis: '', mode: 'higher_of', revenueShareBps: 1000, thresholdCents: 0, services: [] });
  selectedIndex.value = state.value.agreements.length - 1;
}
function addService() { agreement.value.services.push({ id: crypto.randomUUID(), name: '', amountCents: 0, cadence: 'monthly', month: '' }); }
</script>
