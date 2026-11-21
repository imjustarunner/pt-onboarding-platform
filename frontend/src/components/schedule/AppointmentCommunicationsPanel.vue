<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import OfferedTimeDialog from './OfferedTimeDialog.vue';
const props = defineProps({ appointmentId: { type: Number, required: true }, clientId: {type:Number,default:0} });
const rows = ref([]); const loading = ref(false); const busy = ref(0); const error = ref(''); const notice = ref(''); let request = 0;
const comments = ref([]), commentsError = ref(''), filter = ref('all');
const typeFilter = ref('all');
const sort = ref('newest');
const commentsBefore=ref(null),commentsHaveMore=ref(false),olderCommentsLoading=ref(false);
const offerSlots = ref(null), selectedOffer = ref(null), offersLoading = ref(false);
async function loadOffers() {
  const id = props.appointmentId; offersLoading.value = true;
  try { const { data } = await api.get(`/appointments/${id}/replacement-history`, { skipGlobalLoading: true }); if (props.appointmentId === id) offerSlots.value = data.slots || []; }
  catch (e) { if (props.appointmentId === id) error.value = e.response?.data?.error?.message || 'Could not load replacement invitations.'; }
  finally { offersLoading.value = false; }
}
const metadata = row => {
  if (row.metadata && typeof row.metadata === 'object') return row.metadata;
  try { return JSON.parse(row.metadata || row.metadata_json || '{}') || {}; } catch { return {}; }
};
const communications = computed(() => [...rows.value.map(row => ({ ...row, category:row.category || (row.direction==='inbound'?'replies':'notifications'), metadata: metadata(row) })),
  ...comments.value.map(comment=>({id:`secure-comment-${comment.id}`,category:'comments',kind:'AuricWell secure session comment',channel:'secure',
    direction:comment.isOwn?'outbound':'inbound',createdAt:comment.createdAt,bodyPreview:comment.body,
    metadata:{deliveryStatus:'recorded',author:comment.author?.name,secure:true}}))]
  .sort((a,b)=>(new Date(b.createdAt)-new Date(a.createdAt)) || Number(String(b.id).match(/(\d+)$/)?.[1]||0)-Number(String(a.id).match(/(\d+)$/)?.[1]||0)));
const readableLabel = value => String(value || '').replaceAll('_', ' ');
const channelLabel = row => ({ in_app:'In-app', email:'Email', sms:'Text', secure:'Secure comment' })[row.channel] || readableLabel(row.channel || 'message');
const isReminderQueueActivity = row => row.direction === 'system' && row.kind === 'reminder'
  && (row.metadata.count != null || /^Scheduled \d+ session notification/i.test(row.bodyPreview || ''));
const kindLabel = row => {
  if (isReminderQueueActivity(row)) return 'Reminder scheduling';
  if (row.metadata.scheduleNotice) return ({
    created:'Booking confirmation', rescheduled:'Reschedule notice', canceled:'Cancellation notice',
    late_canceled:'Late cancellation notice', no_show:'Missed appointment notice', updated:'Appointment update'
  })[row.metadata.eventType || row.metadata.scheduleNoticeType] || 'Appointment update';
  return readableLabel(row.kind || 'Notification');
};
const categoryRows = computed(() => communications.value.filter(row => filter.value === 'all' || row.category === filter.value));
const availableTypes = computed(() => [...new Set(categoryRows.value.map(kindLabel))].sort());
const visibleCommunications = computed(() => {
  const rows = categoryRows.value.filter(row => typeFilter.value === 'all' || kindLabel(row) === typeFilter.value);
  if (sort.value === 'oldest') return [...rows].reverse();
  if (sort.value === 'type') return [...rows].sort((a,b) => kindLabel(a).localeCompare(kindLabel(b)));
  return rows;
});
watch(filter, () => { typeFilter.value = 'all'; });
const isActivityEntry = row => isReminderQueueActivity(row) || (row.metadata.scheduleNotice && row.channel === 'in_app' && !row.metadata.scheduleNoticeDeliveryId);
function detailsLabel(row) {
  if (isActivityEntry(row)) return 'View scheduling activity';
  if (row.metadata.body || row.metadata.bodyRendered || row.category === 'comments') return 'View message';
  return 'View saved preview';
}
const latestDeliveries = computed(() => {
  const latest = new Map();
  for (const row of communications.value) { const id = Number(row.metadata.cancellationDeliveryId); if (id && !latest.has(id)) latest.set(id, row.id); }
  return latest;
});
const finishedNoticeIds = computed(() => new Set(communications.value.filter(row =>
  row.metadata.scheduleNoticeId && ['superseded','suppressed','skipped','sent','delivered','held','failed','sending'].includes(rawStatus(row))
).map(row => Number(row.metadata.scheduleNoticeId))));
const rawStatus = row => String(row.metadata.deliveryStatus || row.status || '').toLowerCase();
const deliveryStatus = row => ['queued','pending'].includes(rawStatus(row))
  && finishedNoticeIds.value.has(Number(row.metadata.scheduleNoticeId)) ? 'queued_earlier' : rawStatus(row);
const canRetry = row => Number(row.metadata.cancellationDeliveryId) > 0
  && latestDeliveries.value.get(Number(row.metadata.cancellationDeliveryId)) === row.id
  && ['failed', 'skipped'].includes(deliveryStatus(row));
function statusLabel(row) {
  const status = deliveryStatus(row);
  if (isReminderQueueActivity(row)) return 'Reminders scheduled';
  if (row.category === 'comments') return 'Saved securely';
  return ({ received:'Reply received', recorded:'Activity logged', canceled:'Canceled — not sent', sent: 'Sent to delivery provider', delivered: 'Delivery confirmed', pending: 'Queued', queued: 'Queued', queued_earlier: 'Queued earlier · see later status', scheduled: 'Scheduled', superseded: 'Replaced by a later edit', suppressed: 'Sending skipped', processed: 'Processed — see delivery results', failed: 'Failed — review details', skipped: 'Not sent', sending: 'Delivery in progress — verify before resending', review: 'Delivery uncertain — manual review required', held: 'Held — manual review required' })[status] || (status ? status.replaceAll('_', ' ') : 'Activity logged');
}
function when(value) { const raw = String(value || ''); const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'); return Number.isFinite(+date) ? date.toLocaleString() : ''; }
async function load() {
  const current = ++request; const id = props.appointmentId; loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/appointments/${id}/timeline`, { skipGlobalLoading: true });
    if(current!==request||id!==props.appointmentId)return;
    rows.value=data.timeline||data.communications||[];
    comments.value=[];commentsError.value='';
    if(props.clientId){
      try{const response=await api.get(`/secure-session-comments/appointments/${id}`,{params:{clientId:props.clientId},skipGlobalLoading:true});if(current===request){comments.value=response.data.comments||[];commentsBefore.value=response.data.nextBefore||null;commentsHaveMore.value=!!response.data.hasMore;}}
      catch(e){if(current===request)commentsError.value=e.response?.status===403?'Secure session comments require current clinical access.':e.response?.data?.error?.message||'Could not load secure session comments.';}
    }
  }
  catch (e) { if (current === request) error.value = e.response?.data?.error?.message || 'Could not load session communications.'; }
  finally { if (current === request) loading.value = false; }
}
async function loadOlderComments(){
 if(olderCommentsLoading.value||!commentsHaveMore.value)return;olderCommentsLoading.value=true;
 const current=request,id=props.appointmentId;
 try{const {data}=await api.get(`/secure-session-comments/appointments/${id}`,{params:{clientId:props.clientId,before:commentsBefore.value},skipGlobalLoading:true});
  if(current===request){comments.value=[...new Map([...comments.value,...(data.comments||[])].map(row=>[row.id,row])).values()];commentsBefore.value=data.nextBefore||null;commentsHaveMore.value=!!data.hasMore;}}
 catch(e){if(current===request)commentsError.value=e.response?.data?.error?.message||'Could not load older secure session comments.';}
 finally{olderCommentsLoading.value=false;}
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
watch(() => [props.appointmentId,props.clientId], () => { rows.value = [];comments.value=[];commentsError.value='';commentsBefore.value=null;commentsHaveMore.value=false; notice.value = ''; offerSlots.value = null; selectedOffer.value = null; load(); }, { immediate: true });
</script>
<template>
  <section class="appointment-communications" aria-label="Session communication history">
    <header><div><h3>Communications</h3><p>Notification outcomes, replies, and authorized AuricWell secure session comments for this session.</p></div><button type="button" :disabled="loading || !!busy" @click="load">Refresh</button></header>
    <nav class="communication-filters" aria-label="Communication types"><button v-for="item in [{id:'all',label:'All'},{id:'notifications',label:'Notifications'},{id:'replies',label:'Replies'},{id:'comments',label:'Secure comments'}]" :key="item.id" type="button" :aria-pressed="filter===item.id" @click="filter=item.id">{{item.label}}</button></nav>
    <div class="communication-filters">
      <label>Type <select v-model="typeFilter"><option value="all">All types</option><option v-for="type in availableTypes" :key="type" :value="type">{{type}}</option></select></label>
      <label>Sort <select v-model="sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="type">Type</option></select></label>
    </div>
    <p v-if="commentsError" role="status">{{commentsError}}</p>
    <p v-if="loading" role="status">Loading session communications…</p>
    <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
    <button type="button" :disabled="offersLoading" @click="loadOffers">{{ offersLoading ? 'Loading invitations…' : 'Replacement invitations' }}</button>
    <p v-if="offerSlots && !offerSlots.length">No replacement invitations are linked to this session.</p>
    <ul v-if="offerSlots?.length"><li v-for="slot in offerSlots" :key="slot.replacementSlotId"><button type="button" @click="selectedOffer = slot">{{ when(slot.startAt) }} — recipients and delivery history</button></li></ul>
    <OfferedTimeDialog v-if="selectedOffer" :item="selectedOffer" history-only @close="selectedOffer = null" />
    <p v-if="!loading && !communications.length && !error">No appointment communications have been recorded yet.</p>
    <p v-else-if="!loading && !visibleCommunications.length && !error">No entries match these filters.</p>
    <ol>
      <li v-for="row in visibleCommunications" :key="row.id" :class="`communication-${row.category}`" :data-delivery-id="row.metadata.cancellationDeliveryId || undefined">
        <div class="communication-heading"><strong>{{ kindLabel(row) }} · {{ isActivityEntry(row) ? 'System activity' : channelLabel(row) }}</strong><span :class="{ attention: ['failed','skipped','review','held'].includes(deliveryStatus(row)) }">{{ statusLabel(row) }}</span></div>
        <p class="communication-meta">{{ when(row.createdAt) }}<template v-if="row.metadata.author"> · By: {{row.metadata.author}}</template><template v-if="row.metadata.recipient"> · {{row.direction==='inbound'?'From':'To'}}: {{ row.metadata.recipient }}</template><template v-if="row.metadata.clientId"> · Client #{{ row.metadata.clientId }}</template></p>
        <p v-if="row.category==='replies' && row.metadata.actionStatus" class="communication-meta">{{['applied','completed'].includes(row.metadata.actionStatus)?'RSVP response applied to this session.':'Reply saved for staff review.'}}</p>
        <p v-if="row.metadata.scheduledFor && ['pending','queued'].includes(deliveryStatus(row))" class="communication-meta">Planned send: {{ when(row.metadata.scheduledFor) }}. Later edits may change this time.</p>
        <p v-if="row.metadata.sentAt" class="communication-meta">Sent: {{ when(row.metadata.sentAt) }}</p>
        <p v-if="row.metadata.deliveredAt" class="communication-meta">Delivered: {{ when(row.metadata.deliveredAt) }}</p>
        <p v-if="row.metadata.receiptRequired" class="communication-meta">{{ row.metadata.receiptConfirmedAt ? `Recipient confirmed receipt: ${when(row.metadata.receiptConfirmedAt)}` : 'Awaiting recipient confirmation — sending or opening the email does not confirm receipt.' }}</p>
        <p v-if="row.metadata.subject"><strong>Subject:</strong> {{ row.metadata.subject }}</p>
        <p v-if="row.metadata.reason" class="attention">{{ row.metadata.reason }}</p>
        <details v-if="row.metadata.body || row.bodyPreview"><summary>{{ detailsLabel(row) }}</summary><p class="communication-body">{{ row.metadata.body || row.bodyPreview }}</p></details>
        <p v-else-if="row.channel !== 'in_app' && deliveryStatus(row) === 'pending'" class="communication-meta">The message will be prepared at send time.</p>
        <p v-else-if="['sent','delivered'].includes(deliveryStatus(row))" class="communication-meta">Message text is unavailable for this delivery.</p>
        <p v-if="row.metadata.clientFacingReason"><strong>Reason shared with the client:</strong> {{ row.metadata.clientFacingReason }}</p>
        <button v-if="canRetry(row)" type="button" :disabled="!!busy || loading" @click="retry(row)">{{ busy === Number(row.metadata.cancellationDeliveryId) ? 'Rechecking…' : 'Retry unsent notification' }}</button>
        <p v-if="['review','held','sending'].includes(deliveryStatus(row))" class="communication-meta">Check the provider’s delivery record or contact support before sending another notice.</p>
      </li>
    </ol>
    <button v-if="commentsHaveMore && ['all','comments'].includes(filter)" type="button" :disabled="olderCommentsLoading" @click="loadOlderComments">{{olderCommentsLoading?'Loading…':'Load older secure comments'}}</button>
  </section>
</template>
<style scoped>
.appointment-communications{padding:16px;min-width:0}header,.communication-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}h3{margin:0}p{font-size:13px;line-height:1.5}header p{max-width:650px;color:var(--text-secondary,#64748b)}ol{list-style:none;padding:0}li{border:1px solid var(--border,#dbe4ed);border-radius:10px;padding:14px;margin:12px 0}.communication-heading strong{text-transform:capitalize}.communication-meta{color:var(--text-secondary,#64748b);font-size:12px}.communication-body{white-space:pre-wrap;overflow-wrap:anywhere}.attention,p[role=alert]{color:#9a3412}summary{cursor:pointer;font-size:13px}button{font:inherit;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:var(--bg-card,#fff);color:inherit;cursor:pointer}button:disabled{opacity:.6;cursor:default}
.communication-filters{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.communication-filters button[aria-pressed=true]{background:#eef2ff;border-color:#6366f1}.communication-comments{border-left:4px solid #244ba5}.communication-replies{border-left:4px solid #bd720e}.communication-notifications{border-left:4px solid #087c78}
.communication-filters label{display:flex;align-items:center;gap:6px;font-size:13px}.communication-filters select{font:inherit;padding:5px;color:inherit;background:var(--bg-card,#fff)}
</style>
