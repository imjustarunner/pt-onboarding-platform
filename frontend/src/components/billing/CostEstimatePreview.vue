<template>
  <section class="estimate" aria-label="Good Faith Estimate">
    <header class="estimate-header">
      <span>{{ snapshot.agency.name }}</span>
      <span>AuricWell</span>
    </header>

    <h3>{{ snapshot.title }}</h3>
    <p v-if="item.status === 'draft'" class="draft">Draft for billing review</p>
    <h4>Estimate of what you could pay</h4>
    <dl class="estimate-fields">
      <div><dt>Patient name</dt><dd>{{ snapshot.patient.name || pending }}</dd></div>
      <div><dt>Date of birth</dt><dd>{{ snapshot.patient.dateOfBirth || pending }}</dd></div>
      <div><dt>Assigned provider</dt><dd>{{ snapshot.provider.name || pending }}</dd></div>
      <div><dt>Service location</dt><dd>{{ snapshot.location.address || pending }}</dd></div>
      <div><dt>Provider NPI</dt><dd>{{ snapshot.provider.npi || pending }}</dd></div>
      <div><dt>Billing NPI / tax ID</dt><dd>{{ [snapshot.agency.npi, snapshot.agency.taxId].filter(Boolean).join(' / ') || pending }}</dd></div>
    </dl>
    <div class="estimate-total">
      <div><strong>{{ presentation.summaryLabel }}</strong><span>{{ presentation.servicePeriod }}</span></div>
      <strong class="estimate-amount">{{ money(snapshot.totalCents) }}</strong>
    </div>

    <h4>More details about your total cost estimate</h4>
    <dl class="estimate-details">
      <div><dt>Expected frequency</dt><dd>{{ snapshot.frequency || pending }}</dd></div>
      <div><dt>Diagnosis</dt><dd>{{ snapshot.diagnosisCodes?.join(', ') || snapshot.diagnosisReason || pending }}</dd></div>
    </dl>
    <div class="estimate-table-wrap" tabindex="0" role="region" aria-label="Itemized charges">
      <table>
        <thead>
          <tr>
            <th scope="col">Service period</th>
            <th scope="col">Code</th>
            <th scope="col">Description</th>
            <th scope="col">Qty</th>
            <th scope="col">Unit charge</th>
            <th scope="col">Estimated charge</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in snapshot.lines" :key="line.serviceCode">
            <td>{{ presentation.servicePeriod }}</td>
            <td>{{ line.serviceCode }}</td>
            <td>{{ line.description }}</td>
            <td>{{ line.quantity }}</td>
            <td>{{ money(line.amountCents) }}</td>
            <td>{{ money(line.totalCents) }}</td>
          </tr>
        </tbody>
        <tfoot><tr><th scope="row" colspan="5">Total estimated cost</th><td>{{ money(snapshot.totalCents) }}</td></tr></tfoot>
      </table>
    </div>

    <div v-if="snapshot.separatelyScheduled?.length">
      <h4>Separately scheduled services</h4>
      <p>Ask billing for a separate estimate for these services.</p>
      <ul><li v-for="(line, i) in snapshot.separatelyScheduled" :key="i">{{ line }}</li></ul>
    </div>
    <template v-if="presentation.disclosures.length">
      <h4>About this estimate and your rights</h4>
      <div class="estimate-rights">
        <p v-for="disclosure in presentation.disclosures" :key="disclosure">{{ disclosure }}</p>
      </div>
    </template>
    <div v-if="item.acknowledgment" class="estimate-receipt">
      <h4>Receipt acknowledged</h4>
      <p>{{ item.acknowledgment.signatureName }} · {{ receiptDate }}</p>
      <p>{{ item.acknowledgment.text }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ item: { type: Object, required: true } });
const snapshot = computed(() => props.item.snapshot);
const presentation = computed(() => props.item.presentation || {
  summaryLabel: 'Estimated cost of care',
  servicePeriod: [snapshot.value.startDate, snapshot.value.endDate].filter(Boolean).join(' – '),
  disclosures: []
});
const pending = 'Review required';
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = cents => cents == null ? 'Pending' : currency.format(cents / 100);
const receiptDate = computed(() => {
  const date = new Date(props.item.acknowledgment?.signedAt);
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : date.toISOString().slice(0, 10);
});
</script>

<style scoped>
.estimate {
  --estimate-ink: var(--text-primary, #192b34);
  --estimate-muted: var(--text-secondary, #4c6068);
  --estimate-rule: var(--border, #c4cfd0);
  --estimate-tint: var(--bg-alt, #eef5f2);
  color: var(--estimate-ink);
  background: var(--bg-card, #fff);
  margin-block: 1rem;
  border: 1px solid var(--estimate-rule);
  border-radius: 12px;
  padding: clamp(1rem, 3vw, 2rem);
  overflow-wrap: anywhere;
}
.estimate-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: .5rem 1.5rem;
  color: var(--estimate-ink);
  border-bottom: 1px solid var(--estimate-rule);
  padding-bottom: .8rem;
  font-weight: 700;
}
.estimate h3 { margin: 1rem 0 .5rem; font-size: clamp(1.35rem, 3vw, 1.9rem); }
.estimate h4 { margin: 1.15rem 0 .5rem; font-size: 1.05rem; }
.draft { font-weight: 700; color: var(--estimate-muted); }
.estimate-fields, .estimate-details { display: grid; gap: .75rem 1.2rem; margin: .65rem 0 1rem; }
.estimate-fields { grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr)); }
.estimate-details { grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr)); }
.estimate dt { font-size: .8rem; font-weight: 700; color: var(--estimate-muted); }
.estimate dd { margin: .2rem 0 0; }
.estimate-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: .6rem 1rem;
  padding: .85rem 1rem;
  border: 1px solid var(--estimate-muted);
  background: var(--estimate-tint);
}
.estimate-total span { display: block; margin-top: .2rem; font-size: .85rem; }
.estimate-amount { font-size: 1.3rem; font-variant-numeric: tabular-nums; }
.estimate-table-wrap { overflow: auto; }
.estimate table { width: 100%; min-width: 34rem; border-collapse: collapse; font-size: .875rem; }
.estimate td, .estimate th { padding: .55rem; vertical-align: top; border: 1px solid var(--estimate-rule); text-align: left; }
.estimate thead, .estimate tfoot { background: var(--estimate-tint); font-weight: 700; }
.estimate tr > :nth-last-child(-n+2) { text-align: right; font-variant-numeric: tabular-nums; }
.estimate-rights { color: var(--estimate-muted); font-size: .875rem; }
.estimate-receipt { margin-top: 1rem; border-top: 1px solid var(--estimate-rule); }
</style>
