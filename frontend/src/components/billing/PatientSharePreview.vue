<template>
  <details class="patient-share">
    <summary>Estimate patient share</summary>
    <form @submit.prevent="preview">
      <p>Uses the payer’s eligibility response for the date of service. Enter the full allowed amount for this visit, including the patient’s share.</p>
      <div class="estimate-fields">
        <label>
          Date of service
          <input v-model="serviceDate" type="date" required />
        </label>
        <label>
          Allowed amount (USD)
          <input v-model.trim="allowedAmount" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required />
        </label>
        <label>
          Allowed amount source
          <select v-model="allowedAmountSource" required>
            <option value="">Select source</option>
            <option value="negotiated_rate">Current negotiated rate</option>
            <option value="matching_remittance">Matching posted remittance</option>
          </select>
        </label>
      </div>
      <label class="estimate-confirm">
        <input v-model="standardCostShareConfirmed" type="checkbox" required />
        <span>I confirmed the rate for this plan, provider and service, and the plan applies the deductible first, then coinsurance to the remaining amount.</span>
      </label>
      <button type="submit" :disabled="busy">{{ busy ? 'Estimating…' : 'Preview estimate' }}</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="result" class="estimate-result" aria-live="polite">
      <strong>Estimated patient share {{ money(result.estimatedPatientCents) }}</strong>
      <dl>
        <dt>Allowed amount</dt><dd>{{ money(result.allowedAmountCents) }}</dd>
        <dt>Deductible applied</dt><dd>{{ money(result.deductibleAppliedCents) }}</dd>
        <dt>Coinsurance ({{ result.coinsuranceBasisPoints / 100 }}%)</dt><dd>{{ money(result.coinsuranceCents) }}</dd>
      </dl>
      <p>The estimate is before any remaining out-of-pocket limit. The payer’s remittance determines the final balance.</p>
    </div>
  </details>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ agencyId: [Number, String], clientId: [Number, String] });
const serviceDate = ref('');
const allowedAmount = ref('');
const allowedAmountSource = ref('');
const standardCostShareConfirmed = ref(false);
const busy = ref(false);
const error = ref('');
const result = ref(null);
const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (cents) => formatter.format(cents / 100);
let generation = 0;

watch([serviceDate, allowedAmount, allowedAmountSource, standardCostShareConfirmed], () => {
  generation++;
  busy.value = false;
  error.value = '';
  result.value = null;
});
onBeforeUnmount(() => { generation++; });

async function preview() {
  if (busy.value) return;
  const own = ++generation;
  busy.value = true;
  error.value = '';
  result.value = null;
  try {
    const response = await api.post(`/family-billing/staff/clients/${props.clientId}/patient-share-preview`, {
      agencyId: props.agencyId,
      serviceDate: serviceDate.value,
      allowedAmountCents: Math.round(Number(allowedAmount.value) * 100),
      allowedAmountSource: allowedAmountSource.value,
      standardCostShareConfirmed: standardCostShareConfirmed.value
    });
    if (own === generation) result.value = response.data;
  } catch (cause) {
    if (own === generation) {
      error.value = cause.response?.data?.error?.message || 'Patient share could not be estimated.';
    }
  } finally {
    if (own === generation) busy.value = false;
  }
}
</script>

<style scoped>
.patient-share {
  border-top: 1px solid var(--app-line, #d8e1ed);
  margin-top: 24px;
  padding-top: 18px;
}
summary { font-weight: 650; cursor: pointer; }
.estimate-fields { display: flex; flex-wrap: wrap; gap: 12px; }
.estimate-fields label { display: grid; gap: 6px; }
.estimate-fields input, .estimate-fields select {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--app-line, #aabbd0);
  border-radius: 6px;
  font: inherit;
}
.estimate-confirm { display: flex; align-items: baseline; gap: 8px; margin: 16px 0; }
.estimate-result {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--app-line, #d8e1ed);
  border-radius: 8px;
}
.estimate-result dl { display: grid; grid-template-columns: max-content auto; gap: 6px 14px; }
.estimate-result dd { margin: 0; }
.estimate-result p { margin-bottom: 0; }
[role="alert"] { color: var(--app-text-red, #a21c28); }
</style>
