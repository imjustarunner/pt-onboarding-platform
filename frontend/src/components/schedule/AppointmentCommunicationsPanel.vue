<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ appointmentId: { type: Number, required: true } });
const rows = ref([]); const loading = ref(false); const busy = ref(0); const error = ref(''); const notice = ref(''); let request = 0;
const metadata = row => {
  if (row.metadata && typeof row.metadata === 'object') return row.metadata;
  try { return JSON.parse(row.metadata || row.metadata_json || '{}') || {}; } catch { return {}; }
};
const communications = computed(() => rows.value.map(row => ({ ...row, metadata: metadata(row) })).sort((a, b) => Number(b.id) - Number(a.id)));
const latestDeliveries = computed(() => {
  const latest = new Map();
  for (const row of communications.value) { const id = Number(row.metadata.cancellationDeliveryId); if (id && !latest.has(id)) latest.set(id, row.id); }
  return latest;
});
const deliveryStatus = row => String(row.metadata.deliveryStatus || row.status || '').toLowerCase();
const canRetry = row => Number(row.metadata.cancellationDeliveryId) > 0
  && latestDeliveries.value.get(Number(row.metadata.cancellationDeliveryId)) === row.id
  && ['failed', 'skipped'].includes(deliveryStatus(row));
function statusLabel(row) {
  const status = deliveryStatus(row);
  return ({ sent: 'Sent', delivered: 'Delivered', pending: 'Pending', queued: 'Queued', scheduled: 'Scheduled', failed: 'Failed before sending', skipped: 'Not sent', sending: 'Delivery in progress — verify before resending', review: 'Delivery uncertain — manual review required', held: 'Held — manual review required' })[status] || (status ? status.replaceAll('_', ' ') : 'Recorded');
}
function when(value) { const raw = String(value || ''); const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'); return Number.isFinite(+date) ? date.toLocaleString() : ''; }
async function load() {
  const current = ++request; const id = props.appointmentId; loading.value = true; error.value = '';
  try { const { data } = await api.get(`/appointments/${id}/timeline`, { skipGlobalLoading: true }); if (current === request && id === props.appointmentId) rows.value = data.communications || []; }
  catch (e) { if (current === request) error.value = e.response?.data?.error?.message || 'Could not load session communications.'; }
  finally { if (current === request) loading.value = false; }
}
async function retry(row) {
  if (busy.value || !canRetry(row)) return;
  const id = props.appointmentId; const deliveryId = Number(row.metadata.cancellationDeliveryId);
  busy.value = deliveryId; error.value = ''; notice.value = '';
  try {
    await api.post(`/appointments/${id}/cancellation-notifications/${deliveryId}/retry`, {}, { skipGlobalLoading: true });
    if (props.appointmentId !== id) return;
    notice.value = 'The delivery was rechecked. Review the updated status below.';
    await load();
  } catch (e) { if (props.appointmentId === id) error.value = e.response?.data?.error?.message || 'Could not retry this delivery. Review its status before trying again.'; }
  finally { busy.value = 0; }
}
watch(() => props.appointmentId, () => { rows.value = []; notice.value = ''; load(); }, { immediate: true });
</script>
<template>
  <section class="appointment-communications" aria-label="Session communication history">
    <header><div><h3>Communications</h3><p>Appointment notifications and delivery activity retained with this session. Cancellation notices are also saved to the client’s communication record.</p></div><button type="button" :disabled="loading || !!busy" @click="load">Refresh</button></header>
    <p v-if="loading" role="status">Loading session communications…</p>
    <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!loading && !communications.length && !error">No appointment communications have been recorded yet.</p>
    <ol>
      <li v-for="row in communications" :key="row.id" :data-delivery-id="row.metadata.cancellationDeliveryId || undefined">
        <div class="communication-heading"><strong>{{ String(row.kind || 'Notification').replaceAll('_', ' ') }} · {{ row.channel || 'message' }}</strong><span :class="{ attention: ['failed','skipped','review','held'].includes(deliveryStatus(row)) }">{{ statusLabel(row) }}</span></div>
        <p class="communication-meta">{{ when(row.createdAt) }}<template v-if="row.metadata.recipient"> · To: {{ row.metadata.recipient }}</template><template v-if="row.metadata.clientId"> · Client #{{ row.metadata.clientId }}</template></p>
        <p v-if="row.metadata.reason" class="attention">{{ row.metadata.reason }}</p>
        <details v-if="row.metadata.body || row.bodyPreview"><summary>View recorded message</summary><p class="communication-body">{{ row.metadata.body || row.bodyPreview }}</p></details>
        <p v-if="row.metadata.clientFacingReason"><strong>Reason shared with the client:</strong> {{ row.metadata.clientFacingReason }}</p>
        <button v-if="canRetry(row)" type="button" :disabled="!!busy || loading" @click="retry(row)">{{ busy === Number(row.metadata.cancellationDeliveryId) ? 'Rechecking…' : 'Retry unsent notification' }}</button>
        <p v-if="['review','held','sending'].includes(deliveryStatus(row))" class="communication-meta">Check the provider’s delivery record or contact support before sending another notice.</p>
      </li>
    </ol>
  </section>
</template>
<style scoped>
.appointment-communications{padding:16px;min-width:0}header,.communication-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}h3{margin:0}p{font-size:13px;line-height:1.5}header p{max-width:650px;color:var(--text-secondary,#64748b)}ol{list-style:none;padding:0}li{border:1px solid var(--border,#dbe4ed);border-radius:10px;padding:14px;margin:12px 0}.communication-heading strong{text-transform:capitalize}.communication-meta{color:var(--text-secondary,#64748b);font-size:12px}.communication-body{white-space:pre-wrap;overflow-wrap:anywhere}.attention,p[role=alert]{color:#9a3412}summary{cursor:pointer;font-size:13px}button{font:inherit;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:var(--bg-card,#fff);color:inherit;cursor:pointer}button:disabled{opacity:.6;cursor:default}
</style>
