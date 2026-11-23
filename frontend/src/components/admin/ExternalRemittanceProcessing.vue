<template>
  <details class="external-remittance" @toggle="loadOnOpen">
    <summary>External remittance</summary>
    <p>Record an ERA or EOB already processed in another system. This adds a claim history entry only.</p>
    <p v-if="loading" role="status">Loading history…</p>
    <ul v-if="records.length">
      <li v-for="record in records" :key="record.id">
        <strong>Processed externally</strong> · {{ record.processedOn }} · {{ record.source }} · {{ record.reference }}
        <small v-if="record.actorName">Recorded by {{ record.actorName }}</small>
      </li>
    </ul>
    <form @submit.prevent="save">
      <label>Processed in<input v-model.trim="source" placeholder="Payer portal or billing system" required maxlength="80" /></label>
      <label>Trace or reference number<input v-model.trim="reference" required maxlength="120" /></label>
      <label>Processed date<input v-model="processedOn" type="date" required /></label>
      <button class="btn btn-secondary" type="submit" :disabled="saving || loading">{{ saving ? 'Saving…' : 'Mark processed externally' }}</button>
    </form>
    <p v-if="status" role="status">{{ status }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>

<script setup>
import { ref } from 'vue';
import api from '../../services/api';

const props = defineProps({ agencyId: { type: Number, required: true }, claimId: { type: Number, required: true } });
const records = ref([]);
const source = ref('');
const reference = ref('');
const processedOn = ref('');
const loaded = ref(false);
const loading = ref(false);
const saving = ref(false);
const status = ref('');
const error = ref('');
const url = `/medical-billing/claims/${props.claimId}/external-remittance`;

async function loadOnOpen(event) {
  if (!event.target.open || loaded.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(url, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    records.value = data.records;
    loaded.value = true;
  } catch {
    error.value = 'External remittance history could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (saving.value || loading.value) return;
  saving.value = true;
  status.value = '';
  error.value = '';
  try {
    const { data } = await api.post(url, { agencyId: props.agencyId, source: source.value, reference: reference.value, processedOn: processedOn.value }, { skipGlobalLoading: true });
    records.value = data.records;
    source.value = reference.value = processedOn.value = '';
    status.value = 'External processing recorded.';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'External processing could not be saved.';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.external-remittance { margin-block: 12px; padding: 12px; border: 1px solid var(--border, #dce4ee); border-radius: 10px; }
summary { cursor: pointer; font-weight: 650; }
p, li { margin-block: 8px; }
small { display: block; }
form { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
label { display: grid; gap: 4px; }
</style>
