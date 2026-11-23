<template>
  <details @toggle="onToggle" class="fax-triage">
    <summary>Fax intake review</summary>
    <p v-if="busy" role="status">Loading fax review…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loaded && !rows.length">No faxes outside the ticket queue.</p>
    <ul v-if="rows.length">
      <li v-for="row in rows" :key="row.id">
        <span>{{ row.state === 'filtered' ? 'Filtered' : row.state === 'pending' ? 'Processing' : 'Needs review' }} · {{ formatReceived(row.received_at) }}</span>
        <button v-if="row.has_document" type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="download(row)">Download fax</button>
        <button v-if="row.has_document" type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="review(row, 'referral')">Open referral ticket</button>
        <button v-if="row.state === 'review' && row.has_document" type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="review(row, 'filtered')">Mark as non-referral</button>
        <button v-if="!row.has_document && row.state === 'review'" type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="review(row, 'retry')">Retry processing</button>
      </li>
    </ul>
  </details>
</template>
<script setup>
import { ref } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true } });
const emit = defineEmits(['created']);
const rows = ref([]), busy = ref(false), loaded = ref(false), error = ref(''), notice = ref('');
async function run(action) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try { await action(); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Could not complete fax review.'; }
  finally { busy.value = false; }
}
async function load() {
  const { data } = await api.get('/fax-intake/inbox', { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
  rows.value = data.rows || [];
  loaded.value = true;
}
function onToggle(event) { if (event.target.open) run(load); }
function formatReceived(date) { return new Date(date).toLocaleString(); }
function download(row) {
  return run(async () => {
    const { data } = await api.get(`/fax-intake/inbox/${row.id}/document`, { params: { agencyId: props.agencyId }, responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'referral-fax.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
function review(row, action) {
  return run(async () => {
    const { data } = await api.post(`/fax-intake/inbox/${row.id}/review`, { agencyId: props.agencyId, action });
    notice.value = data.ticketId ? `Referral ticket #${data.ticketId} opened.` : data.state === 'pending' ? 'Fax queued for processing.' : 'Fax marked as a non-referral.';
    await load();
    if (data.ticketId) emit('created', data.ticketId);
  });
}
</script>
<style scoped>
.fax-triage { margin: 10px 0; }
.fax-triage summary { cursor: pointer; }
.fax-triage li { margin-block: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
</style>
