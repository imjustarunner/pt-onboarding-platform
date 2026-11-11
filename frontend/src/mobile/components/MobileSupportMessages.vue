<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import axios from 'axios';
import MobileSupportBody from './MobileSupportBody.vue';
const props = defineProps({ apiBase: { type: String, required: true }, sessionToken: { type: String, required: true }, visible: { type: Boolean, default: true } });
const entries = ref([]), agencies = ref([]), agency = ref(''), type = ref('all'), status = ref(''), search = ref(''), from = ref(''), to = ref('');
const loading = ref(false), error = ref(''), partial = ref([]), hasMore = ref(false), limit = ref(100), selected = ref(null), detail = ref(null), detailLoading = ref(false);
const reply = ref(''), internal = ref(false), busy = ref(false), notice = ref(''), sender = ref('');
let request = 0, detailRequest = 0, timer = null, lastLoaded = 0;
const config = () => ({ headers: { 'X-Quick-View-Session': props.sessionToken } });
const url = path => `${props.apiBase}/staff-tools/support${path}`;
const date = value => value ? new Date(value).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const agencyName = id => agencies.value.find(a => Number(a.id) === Number(id))?.name || 'Agency';
const agencyLogo = id => agencies.value.find(a => Number(a.id) === Number(id))?.logoUrl;
const messages = computed(() => detail.value?.messages || []);
const title = computed(() => detail.value?.ticket?.subject || detail.value?.conversation?.subject || selected.value?.title || 'Support message');
const canReply = computed(() => !!detail.value && ['ticket', 'sms'].includes(selected.value?.kind));
const ticketStatus = computed(() => detail.value?.ticket?.status || selected.value?.status);
const statusLabel=value=>String(value || 'open').replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase());
const smsContact=computed(()=>detail.value?.conversation?.primary_participant_name || messages.value.find(m=>m.direction==='inbound')?.from?.name || messages.value.find(m=>m.direction==='inbound')?.from?.phone || detail.value?.conversation?.subject || selected.value?.title || 'Contact');
const smsNumber=computed(()=>detail.value?.conversation?.inbox_display_name || messages.value.find(m=>m.direction==='outbound')?.from?.phone || 'Agency main number');
function messageAuthor(message){const name=[message.author_first_name,message.author_last_name].filter(Boolean).join(' ');return name || message.from?.name || (selected.value?.kind==='sms'?(message.direction==='inbound'?smsContact.value:'Staff · sender not recorded'):message.direction || 'Message');}
const ticketClaimed = computed(() => detail.value?.ticket?.claimed_by_user_id);
async function load() {
  if (!props.visible) return;
  const current = ++request; loading.value = true; error.value = '';
  try {
    const { data } = await axios.get(url('/feed'), { ...config(), params: { agencyId: agency.value || undefined, type: type.value,
      status: status.value || undefined, q: search.value, dateFrom: from.value || undefined, dateTo: to.value || undefined, limit: limit.value } });
    if (current !== request) return;
    entries.value = data.items || []; agencies.value = data.agencies || []; partial.value = data.errors || []; hasMore.value = !!data.hasMore; lastLoaded = Date.now();
  } catch (e) { if (current === request) error.value = e.response?.data?.error?.message || 'Support messages could not be loaded. Your previous view is preserved.'; }
  finally { if (current === request) loading.value = false; }
}
async function open(item) {
  const current = ++detailRequest; selected.value = item; detail.value = null; detailLoading.value = true; reply.value = ''; sender.value = ''; error.value = '';
  try { const { data } = await axios.get(url(`/${item.kind}/${item.id}`), config()); if (current === detailRequest) { detail.value = data.detail; sender.value = String(data.detail?.senderOptions?.[0]?.id || ''); } }
  catch (e) { if (current === detailRequest) error.value = e.response?.data?.error?.message || 'This support item could not be opened.'; }
  finally { if (current === detailRequest) detailLoading.value = false; }
}
function back() { if (busy.value) return; ++detailRequest; selected.value = null; detail.value = null; error.value = ''; }
async function action(name) {
  if (busy.value || !selected.value) return;
  if (name === 'close' && !window.confirm('Close this ticket? Its messages and delivery history will be kept.')) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const item = selected.value, body = name === 'reply' ? { body: reply.value, isInternal: internal.value,
      expectedLastMessageId: detail.value?.lastMessageId, clientRequestId: crypto.randomUUID(), senderIdentityId: sender.value || undefined } : {};
    const { data } = await axios.post(url(`/${item.kind}/${item.id}/${name}`), body, config());
    if (name === 'reply') { reply.value = ''; notice.value = data.result?.queued ? 'Reply queued. Check its delivery status.' : internal.value ? 'Internal note saved.' : 'Reply saved. Delivery status is shown in the thread.'; }
    else notice.value = name === 'close' ? 'Ticket closed.' : 'Ticket assignment updated.';
    if(name==='close'){
      ++detailRequest;selected.value=null;detail.value=null;reply.value='';
      type.value='ticket';status.value='open';search.value='';from.value='';to.value='';limit.value=100;
      entries.value=entries.value.filter(entry=>entry.key!==item.key && entry.kind==='ticket' && entry.status==='open');
      await load();
    }else {await open(item); await load();}
  } catch (e) { error.value = e.response?.data?.error?.message || 'The action did not complete. Your reply is preserved.'; }
  finally { busy.value = false; }
}
watch(type,value=>{if(['ticket','sms'].includes(value))status.value='open';else status.value='';});
watch([agency, type, status, from, to], () => { limit.value = 100; load(); });
watch(search, () => { clearTimeout(timer); timer = setTimeout(() => { limit.value = 100; load(); }, 300); });
watch(() => props.visible, value => { if (value && (!entries.value.length || Date.now() - lastLoaded > 60000)) load(); }, { immediate: true });
watch(() => props.sessionToken, () => { ++request; ++detailRequest; entries.value = []; selected.value = null; detail.value = null; lastLoaded = 0; if (props.visible) load(); });
onBeforeUnmount(() => { clearTimeout(timer); ++request; ++detailRequest; });
</script>

<template>
  <section class="mobile-support" aria-label="Support messages">
    <header class="ms-header"><div><h1>Support messages</h1><p>Tickets, main-number texts, and app delivery history.</p></div><button :disabled="loading" aria-label="Refresh support messages" @click="load">↻</button></header>
    <p v-if="error" class="ms-error" role="alert">{{ error }}</p><p v-if="notice" class="ms-notice" role="status">{{ notice }}</p>
    <template v-if="!selected">
      <div class="ms-filters">
        <label class="ms-search">Search<input v-model="search" type="search" placeholder="Subject, recipient, or message type"></label>
        <label>Agency<select v-model="agency"><option value="">All agencies</option><option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option></select></label>
        <label>Type<select v-model="type"><option value="all">All types</option><option value="ticket">Tickets</option><option value="sms">Main-number SMS</option><option value="email">Sent emails</option><option value="text">Sent texts</option><option value="reminder">Reminders</option></select></label>
        <label>Status<select v-model="status"><option value="">Any status</option><option v-for="s in ['open','pending','answered','closed','sent','delivered','failed','blocked','queued']" :key="s" :value="s">{{ statusLabel(s) }}</option><option v-if="type==='sms'" value="unread">Unread</option></select></label>
        <label>From<input v-model="from" type="date"></label><label>Through<input v-model="to" type="date"></label>
      </div>
      <p v-for="part in partial" :key="`${part.agencyId}-${part.type}`" class="ms-error">{{ agencyName(part.agencyId) }} · {{ part.type }}: {{ part.message }}</p>
      <p v-if="loading && !entries.length" role="status">Loading support messages…</p>
      <p v-else-if="!entries.length && !error">No support messages match these filters.</p>
      <button v-for="item in entries" :key="item.key" class="ms-row" @click="open(item)">
        <span class="ms-icon" aria-hidden="true">{{ item.kind === 'ticket' ? '▤' : item.kind === 'sms' ? '▱' : '✉' }}<img v-if="agencyLogo(item.agencyId)" :src="agencyLogo(item.agencyId)" alt=""></span>
        <span class="ms-summary"><span class="ms-meta">{{ agencyName(item.agencyId) }} · {{ item.source }}</span><strong>{{ item.title }}</strong><span class="ms-preview">{{ item.preview }}</span><span class="ms-meta">{{ date(item.at) }} · {{ statusLabel(item.status) }}</span></span><span aria-hidden="true">›</span>
      </button>
      <button v-if="hasMore && limit < 200" class="ms-more" :disabled="loading" @click="limit=200;load()">Show more</button>
      <p v-else-if="hasMore" class="ms-meta">Showing the latest 200 matches. Narrow the dates, agency, type, or search to find older records.</p>
    </template>
    <article v-else class="ms-detail">
      <button :disabled="busy" @click="back">‹ Back</button><h2>{{ title }}</h2><p class="ms-meta">{{ agencyName(selected.agencyId) }} · {{ selected.source }}</p>
      <p v-if="detailLoading" role="status">Opening…</p>
      <template v-else-if="detail">
        <template v-if="selected.kind === 'communication'"><p>{{ detail.recipient_address }}</p><p>Delivery: <strong>{{ statusLabel(detail.delivery_status || 'unknown') }}</strong></p><p v-if="detail.error_message" role="alert">{{ detail.error_message }}</p><MobileSupportBody :body="detail.body || ''"/><p class="ms-meta">A delivery record is preserved as sent. Reply through its ticket or conversation.</p></template>
        <template v-else>
          <div v-if="selected.kind === 'ticket'" class="ms-actions"><span>{{ statusLabel(ticketStatus) }}</span><button :disabled="busy" @click="action(ticketClaimed?'unclaim':'claim')">{{ ticketClaimed?'Release claim':'Claim ticket' }}</button><button v-if="ticketStatus!=='closed'" :disabled="busy" @click="action('close')">Close ticket</button></div>
          <header v-if="selected.kind==='sms'" class="ms-sms-heading"><strong>Texting with {{smsContact}}</strong><span>{{smsNumber}} · {{statusLabel(detail.conversation?.status)}}</span></header>
          <div v-if="detail.ticket?.question" class="ms-message"><strong>Original request</strong><MobileSupportBody :body="detail.ticket.question"/></div>
          <div v-for="message in messages" :key="message.id" class="ms-message" :class="{'ms-internal':message.is_internal || message.is_internal_note,'ms-inbound':selected.kind==='sms' && message.direction==='inbound','ms-outbound':selected.kind==='sms' && message.direction==='outbound'}">
            <div class="ms-meta">{{ messageAuthor(message) }} · {{ date(message.created_at) }} {{ message.is_internal || message.is_internal_note?'· Internal note':'' }}</div>
            <MobileSupportBody :body="message.body_text || message.body || message.text || ''" :plain="!!message.body_text || selected.kind === 'sms'"/><small v-if="selected.kind==='sms' && message.direction==='outbound'">{{statusLabel(message.send_status || 'pending')}}</small><small v-if="message.email_delivery">Delivery: {{ message.email_delivery.status || message.email_delivery.delivery_status || 'pending' }}</small>
          </div>
          <div v-if="detail.attachments?.length" class="ms-meta">{{ detail.attachments.length }} attachment(s). Use the full ticket desk to review protected attachments.</div>
          <form v-if="canReply" class="ms-compose" @submit.prevent="action('reply')"><label v-if="selected.kind==='ticket'"><input v-model="internal" type="checkbox"> Internal note</label><label v-if="selected.kind==='ticket' && !internal && detail.senderOptions?.length">Send from<select v-model="sender"><option v-for="option in detail.senderOptions" :key="option.id" :value="String(option.id)">{{ option.teamDisplayName || option.display_name || option.fromEmail || option.from_email || option.label }}</option></select></label><label>{{ internal?'Internal note':selected.kind==='sms'?'Text reply':'Reply' }}<textarea v-model="reply" rows="4" maxlength="10000" :disabled="busy"></textarea></label><button type="submit" :disabled="busy || !reply.trim()">{{ busy?'Saving…':internal?'Save internal note':'Send reply' }}</button></form>
        </template>
      </template>
    </article>
  </section>
</template>

<style scoped>
.mobile-support{background:#fff;color:#18344f;min-width:0;padding:14px;overflow-wrap:anywhere}.ms-header{display:flex;align-items:center;justify-content:space-between;gap:10px}.ms-header h1{font-size:22px;margin:0}.ms-header p{font-size:13px;color:#667b92;margin:5px 0 12px}.mobile-support button{min-height:44px;border:1px solid #d9e3ef;border-radius:10px;padding:9px 12px;background:#f3f6fb;color:inherit;font:inherit}.mobile-support button:disabled{opacity:.5}.ms-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0 16px}.mobile-support label{display:flex;flex-direction:column;gap:5px;font-size:12px}.ms-search{grid-column:1/-1}.mobile-support input:not([type=checkbox]),.mobile-support select,.mobile-support textarea{box-sizing:border-box;min-width:0;width:100%;min-height:42px;border:1px solid #ccd9e7;border-radius:9px;padding:8px;font:inherit;font-size:16px;background:white;color:inherit}.mobile-support label:has(input[type=checkbox]){flex-direction:row;align-items:center}.ms-row{display:flex!important;width:100%;align-items:center;gap:10px;text-align:left;border:0!important;border-top:1px solid #e5ebf2!important;border-radius:0!important;background:#fff!important;padding:14px 0!important}.ms-icon{display:flex;flex:0 0 34px;flex-direction:column;align-items:center;font-size:25px}.ms-icon img{width:20px;height:20px;object-fit:contain;margin-top:5px}.ms-summary{display:flex;flex:1;min-width:0;flex-direction:column;gap:5px}.ms-summary strong{font-size:15px}.ms-preview{font-size:14px;color:#64758a;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.ms-meta{font-size:12px;color:#6a7b90}.ms-error{background:#fff1f2;color:#9d3046;padding:10px;border-radius:9px;font-size:14px}.ms-notice{background:#e9f7f1;color:#23644e;padding:10px;font-size:14px}.ms-detail h2{font-size:19px;margin-bottom:5px}.ms-message{border-top:1px solid #e4ebf2;padding:14px 0}.ms-internal{background:#fff9e7;padding:12px;border-radius:8px}.ms-body{white-space:pre-wrap;font-size:15px;line-height:1.5;margin-top:7px}.ms-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0}.ms-compose{display:grid;gap:10px;border-top:1px solid #dbe5ef;padding-top:14px}.ms-compose button{background:#2459df;color:white}.ms-more{width:100%;margin-top:12px}@media(min-width:650px){.mobile-support{padding:20px}.ms-filters{grid-template-columns:repeat(5,minmax(0,1fr))}.ms-search{grid-column:1/-1}}
</style>

<style scoped>.ms-sms-heading{display:grid;gap:6px;margin:16px 0;font-size:14px}.ms-sms-heading span{font-size:12px;color:#637b91}.ms-inbound,.ms-outbound{max-width:86%;width:fit-content;padding:12px;border:1px solid #dce7f1;border-radius:12px;margin:12px 0;background:#f4f7fb}.ms-outbound{margin-left:auto;background:#edf4ff;border-color:#c5d9f5}.ms-inbound :deep(.support-body),.ms-outbound :deep(.support-body){margin:7px 0}.ms-message small{display:block;font-size:11px;color:#62778d;margin-top:6px}</style>
