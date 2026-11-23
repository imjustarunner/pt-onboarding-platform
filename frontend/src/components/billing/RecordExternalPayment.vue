<template>
  <details>
    <summary>Record payment received outside the app</summary>
    <form class="external-payment" @submit.prevent="save">
      <label>Responsible payer
        <select v-model.number="allocationId" :disabled="busy" required @change="selectShare">
          <option :value="null" disabled>Select a payer</option>
          <option v-for="share in shares" :key="share.allocationId" :value="Number(share.allocationId)">{{ share.payerName }}</option>
        </select>
      </label>
      <label>Amount received ($)<input v-model="amount" type="number" step="0.01" min="0.01" :max="Number(selected?.balanceCents || 0)/100" :disabled="busy" required /></label>
      <label>Date received<input v-model="receivedDate" type="date" :max="today" :disabled="busy" required /></label>
      <label>Payment reference<input v-model.trim="reference" maxlength="500" placeholder="Receipt or transaction reference" :disabled="busy" required /></label>
      <button class="btn btn-secondary btn-sm" :disabled="busy || !selected || !reference" type="submit">{{ busy ? 'Recording…' : 'Record external payment' }}</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ agencyId: { type: Number, required: true }, shares: { type: Array, required: true } });
const emit = defineEmits(['recorded']);
const today = new Intl.DateTimeFormat('sv-SE').format(new Date());
const allocationId = ref(null), amount = ref(''), receivedDate = ref(''), reference = ref('');
const error = ref(''), busy = ref(false);
let requestKey;
const selected = computed(() => props.shares.find(share => Number(share.allocationId) === allocationId.value));
function selectShare() {
  amount.value = selected.value ? (Number(selected.value.balanceCents) / 100).toFixed(2) : '';
}
watch(() => [props.agencyId, props.shares], () => {
  allocationId.value = props.shares.length === 1 ? Number(props.shares[0].allocationId) : null;
  selectShare();
}, { immediate: true });
watch([allocationId, amount, receivedDate, reference], () => { requestKey = undefined; });

async function save() {
  if (busy.value || !selected.value) return;
  busy.value = true;
  error.value = '';
  requestKey ||= crypto.randomUUID();
  try {
    const receivedAt = receivedDate.value === today ? new Date() : new Date(`${receivedDate.value}T12:00:00`);
    await api.post(`/family-billing/staff/allocations/${allocationId.value}/cash`, {
      agencyId: props.agencyId, payerUserId: selected.value.payerUserId,
      amountCents: Math.round(Number(amount.value) * 100), receivedAt: receivedAt.toISOString(),
      idempotencyKey: requestKey, note: reference.value, paymentMethod: 'external'
    }, { skipGlobalLoading: true });
    emit('recorded');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not record the payment. Refresh the balance before trying again.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
summary { cursor: pointer; font-weight: 600; }
.external-payment { display: grid; gap: 10px; max-width: 26rem; margin-top: 12px; }
label { display: grid; gap: 4px; }
button { justify-self: start; }
[role="alert"] { margin: 0; color: #a11; }
</style>
