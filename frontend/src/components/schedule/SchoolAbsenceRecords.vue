<script setup>
import { ref, watch } from 'vue';
import { reportViewerDateTime } from '../../utils/reportDateTime.js';
import api from '../../services/api';
const props = defineProps({ records: Array, clientId: [Number,String], schedule: Boolean, expanded: Boolean, showHeading: { type: Boolean, default: true } });
const rows = ref([]), error = ref('');
let requestNumber = 0;
watch(() => [props.clientId, props.records], async () => {
  const request = ++requestNumber;
  error.value = ''; rows.value = [];
  if (props.records) { rows.value = props.records; return; }
  if (!props.clientId) return;
  try { const result = await api.get(`/clients/${props.clientId}/school-absence-history`, { skipGlobalLoading:true }); if (request === requestNumber) rows.value = result.data.records || []; }
  catch { if (request === requestNumber) error.value = 'School cancellation history could not be loaded.'; }
}, { immediate:true });
const attention = row => row.canceled !== false && (!row.delivery?.sent || ['held','skipped','failed','suppressed'].some(k => row.delivery?.[k] > 0));
const allConfirmed = row => { const sent = (row.delivery?.deliveries || []).filter(d => d.status === 'sent'); return sent.length > 0 && sent.every(d => d.receiptConfirmedAt); };
const label = row => row.canceled === false ? 'Soft schedule' : attention(row) ? 'Canceled · contact needs attention' : allConfirmed(row) ? 'Canceled · receipt confirmed' : 'Canceled · email sent (receipt unconfirmed)';
</script>
<template>
  <section v-if="rows.length || error" class="school-absence-records" aria-label="School soft schedule and cancellation history">
    <h3 v-if="showHeading">{{ schedule ? 'SCHOOL soft schedule' : 'School session cancellation notes' }}</h3>
    <p v-if="error" role="alert">{{ error }}</p>
    <details v-for="row in rows" :key="row.key || row.id" :open="expanded" :class="{ attention:attention(row), sent:row.canceled !== false && !attention(row) }">
      <summary>{{ row.date }} · {{ row.clientName }} · {{ row.schoolName }} · {{ label(row) }}<span v-for="slot in row.slots || []" :key="slot.id"> · {{ slot.startTime?.slice(0,5) || 'Time not entered' }}{{ slot.endTime ? `–${slot.endTime.slice(0,5)}` : '' }}</span></summary>
      <p v-if="row.explanation">{{ row.explanation }}</p>
      <template v-if="row.canceled !== false">
        <p>{{ row.reason }} · {{ row.urgent ? 'Urgent absence' : 'Nonurgent absence' }}. Initiated by {{ row.actorName || `user #${row.actorUserId}` }} for {{ row.providerName }}, {{ reportViewerDateTime(row.recordedAt) }}. No service rendered; nonbillable.</p>
        <p v-if="row.delivery?.reason">{{ row.delivery.reason }}</p>
        <ul><li v-for="(delivery,index) in row.delivery?.deliveries || []" :key="index">{{ delivery.recipient_name || 'Recipient' }} · {{ delivery.recipient_address || 'No email on file' }}{{ delivery.actual_recipient_address && delivery.actual_recipient_address !== delivery.recipient_address ? ` (QA delivery to ${delivery.actual_recipient_address})` : '' }} · email · {{ delivery.status === 'sent' ? delivery.receiptConfirmedAt ? `Receipt confirmed ${reportViewerDateTime(delivery.receiptConfirmedAt)}` : delivery.receiptRequired ? 'Sent; awaiting recipient confirmation' : 'Sent; inbox receipt unconfirmed' : delivery.status }}{{ delivery.sent_at ? ` · ${reportViewerDateTime(delivery.sent_at)}` : '' }}{{ delivery.error_message ? ` · ${delivery.error_message}` : '' }}</li></ul>
        <details v-if="row.message"><summary>Preserved cancellation note and email</summary><strong>{{ row.message.subject }}</strong><p class="message">{{ row.message.text }}</p><p v-for="slot in row.slots || []" :key="slot.id">{{ slot.note }}</p></details>
      </template>
    </details>
  </section>
</template>
<style scoped>
.school-absence-records{margin:12px 0;max-width:100%}.school-absence-records>details{border:1px solid #748aa4;border-left:6px solid #748aa4;border-radius:8px;margin:8px 0;padding:10px;overflow-wrap:anywhere}.school-absence-records>details.attention{border-color:#a12828;background:#fff3f3;color:#722020}.school-absence-records>details.sent{border-color:#237349;background:#f1faf5;color:#17472f}summary{cursor:pointer;line-height:1.6}.message{white-space:pre-wrap}
</style>
