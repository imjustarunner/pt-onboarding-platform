<template>
  <section class="report-email" aria-label="Payroll report email">
    <h3>Payroll email</h3>
    <p>The reconciliation CSV is emailed from the agency’s payroll mailbox to that same mailbox when posting succeeds.</p>
    <p v-if="delivery.mailbox"><strong>From / To:</strong> {{ delivery.mailbox }}</p>
    <p v-if="loading" role="status">Checking email delivery…</p>
    <p v-else :role="error ? 'alert' : 'status'">{{ error || statusMessage }}</p>
    <div class="report-email-actions">
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading || sending" @click="refresh">Refresh email status</button>
      <button v-if="posted" type="button" class="btn btn-secondary btn-sm" :disabled="loading || sending || delivery.configured === false || delivery.status === 'unavailable' || ['sending','preparing'].includes(delivery.status)" @click="send">
        {{ sending ? 'Sending…' : delivery.status === 'sent' ? 'Email CSV again' : 'Email payroll CSV' }}
      </button>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ periodId: { type: [Number,String], required: true }, posted: { type: Boolean, default: false }, initialDelivery: { type: Object, default: null } });
const delivery=ref({status:'not_sent'}),loading=ref(false),sending=ref(false),error=ref(''),requestKey=ref(null);
let version=0;
const statusMessage=computed(()=>{
  if(!props.posted)return 'This period has not been posted. The email will be sent after posting.';
  if(delivery.value.configured===false)return 'Configure an active payroll mailbox and sender in Communication settings before sending.';
  const messages={sent:'Sent with the CSV attached.',not_sent:'No report email has been sent yet.',preparing:'Preparing the report email.',sending:'Email delivery is in progress.',pending_approval:'The email is queued for approval.',blocked:'Email delivery was blocked. Review the email settings before trying again.',redirected:'The email was redirected. Check delivery settings before sending payroll data again.',delivery_unknown:'Delivery is unconfirmed. Check the payroll mailbox before sending another copy.',failed:'The report email failed. Payroll remains posted; you can retry the email.',unavailable:'Email delivery is not available until the payroll email update is installed.'};
  return messages[delivery.value.status]||'Email delivery status is unavailable.';
});
const refresh=async()=>{const current=++version;if(!props.posted){delivery.value={status:'not_sent'};return;}loading.value=true;error.value='';try{const r=await api.get(`/payroll/periods/${props.periodId}/report-email`);if(current===version)delivery.value=r.data?.reportEmail||r.data||{status:'not_sent'};}catch(e){if(current===version)error.value=e?.response?.data?.error?.message||'Could not check payroll email delivery.';}finally{if(current===version)loading.value=false;}};
const send=async()=>{if(!props.posted||sending.value)return;sending.value=true;error.value='';const id=props.periodId;requestKey.value ||= globalThis.crypto?.randomUUID?.()||`report_${Date.now()}_${Math.random().toString(36).slice(2)}`;try{const r=await api.post(`/payroll/periods/${id}/report-email`,{idempotencyKey:requestKey.value});if(Number(id)!==Number(props.periodId))return;delivery.value=r.data?.reportEmail||r.data;requestKey.value=null;}catch(e){if(Number(id)===Number(props.periodId))error.value=e?.response?.data?.error?.message||'Could not send the report email. Check delivery status before retrying.';}finally{sending.value=false;}};
watch(()=>[props.periodId,props.posted],()=>{requestKey.value=null;refresh();},{immediate:true});
watch(()=>props.initialDelivery,value=>{if(value)delivery.value={...delivery.value,...value};});
defineExpose({refresh});
</script>
<style scoped>
.report-email { margin-top:18px; padding:16px; border:1px solid var(--border,#d9e3e8); border-radius:10px; background:#f8fbfa; }
h3 { margin:0 0 8px; } p { margin:6px 0; font-size:14px; } .report-email-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
</style>
