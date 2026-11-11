<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import axios from 'axios';
import WebsiteChatMessage from '../../components/public/WebsiteChatMessage.vue';
const props = defineProps({ apiBase: { type: String, required: true }, sessionToken: { type: String, required: true }, visible: { type: Boolean, default: true }, chatId: { type: String, default: '' } });
const emit = defineEmits(['count']);
const sessions = ref([]), sites = ref([]), agencies = ref([]), site = ref(''), agency = ref(''), search = ref(''), showEnded = ref(false);
const online = ref(false), changing = ref(false), loading = ref(false), opened = ref(''), detail = ref(null), busy = ref(false), error = ref(''), notice = ref(''), body = ref(''), thread = ref(null);
const drafts = new Map(), seen = new Map(); let timer, fetching = false, queueRevision = 0, detailRevision = 0, heartbeatAt = 0;
const config = () => ({ headers: { 'X-Quick-View-Session': props.sessionToken } });
const url = path => `${props.apiBase}/staff-tools/live-chat${path}`;
const unread = row => !row.endedAt && !row.expired && (Number(row.lastVisitorMessageId || 0) > Math.max(Number(row.lastStaffMessageId || 0), seen.get(row.id) || 0) || !row.initiatedAt && !seen.has(row.id));
const visibleSessions = computed(() => sessions.value.filter(row => (showEnded.value || !row.endedAt && !row.expired)
  && (!search.value.trim() || `${row.name} ${row.pagePath}`.toLowerCase().includes(search.value.trim().toLowerCase()))));
const time = value => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const canSend = computed(() => online.value && detail.value?.canReply === true && !busy.value);
async function load() {
  if (fetching || !props.visible) return;
  fetching = true; const current = ++queueRevision; loading.value = true;
  try {
    const { data } = await axios.get(url(''), { ...config(), params: { site: site.value || undefined, agencyId: agency.value || undefined } });
    if (current !== queueRevision) return;
    sessions.value = data.sessions || []; sites.value = data.sites || []; agencies.value = data.agencies || [];
    emit('count', sessions.value.filter(unread).length);
  } catch (e) { if (current === queueRevision) error.value = e.response?.data?.error?.message || 'Live Chat could not be loaded.'; }
  finally { fetching = false; if (current === queueRevision) loading.value = false; }
}
async function availability(value) {
  if (changing.value) return;
  changing.value = true; error.value = '';
  try { await axios.post(url('/availability'), { available: value, agencyId: agency.value || undefined }, config()); online.value = value; heartbeatAt = Date.now(); notice.value = value ? 'You are online for your authorized websites.' : 'You are offline. Visitors cannot start a chat with you.'; }
  catch (e) { online.value = false; error.value = e.response?.data?.error?.message || 'Your Live Chat availability could not be updated.'; }
  finally { changing.value = false; }
}
async function read(id, quiet = false) {
  const current = ++detailRevision;
  if (!quiet) { error.value = ''; detail.value = null; }
  try {
    const { data } = await axios.get(url(`/${id}`), config());
    if (current !== detailRevision || opened.value !== id) return;
    detail.value = data; seen.set(id, Math.max(0, ...(data.messages || []).map(m => Number(m.id) || 0)));
    emit('count', sessions.value.filter(unread).length);
    await nextTick(); if (thread.value && !quiet) thread.value.scrollTop = thread.value.scrollHeight;
  } catch (e) { if (current === detailRevision) error.value = e.response?.data?.error?.message || 'This chat could not be opened.'; }
}
async function presence(viewing, typing = false, id = opened.value) {
  if (!id || !online.value) return;
  try { await axios.post(url(`/${id}/presence`), { viewing, typing }, config()); } catch { /* The next read exposes any lost access. */ }
}
async function open(row) {
  if (opened.value) { drafts.set(opened.value, body.value); await presence(false); }
  opened.value = row.id || row; body.value = drafts.get(opened.value) || '';
  await read(opened.value); await presence(true);
}
async function back() {
  drafts.set(opened.value, body.value); await presence(false); ++detailRevision; opened.value = ''; detail.value = null; body.value = ''; error.value = ''; await load();
}
async function action(name, payload = {}) {
  if (!opened.value || busy.value) return;
  if (name === 'dismiss' && !window.confirm('Remove this chat from your list? The transcript is kept. A new visitor message will bring it back.')) return;
  busy.value = true; error.value = '';
  const id = opened.value;
  try {
    const { data } = await axios.post(url(`/${id}/${name}`), payload, config());
    if (name === 'messages') { body.value = ''; drafts.delete(id); detail.value = data; await nextTick(); if (thread.value) thread.value.scrollTop = thread.value.scrollHeight; }
    else if (['close', 'dismiss'].includes(name)) { notice.value = name === 'dismiss' ? 'Removed from your list. Transcript retained.' : 'Chat closed for you. The visitor can return to the support team.'; await back(); }
    else if (name === 'referral') { body.value = `${body.value.trim()}${body.value.trim()?'\n':''}${data.url}`; }
    else detail.value = data;
    await load();
  } catch (e) { error.value = e.response?.data?.error?.message || 'This action did not complete. Your message is preserved.'; }
  finally { busy.value = false; }
}
function send() { return action('messages', { body: body.value, clientMessageId: crypto.randomUUID() }); }
function insert(text) { body.value = `${body.value.trim()}${body.value.trim()?'\n':''}${text}`; }
async function tick() {
  if (document.hidden) return;
  if (online.value && Date.now() - heartbeatAt > 20000) {
    try { await axios.post(url('/availability'), { available: true, agencyId: agency.value || undefined }, config()); heartbeatAt = Date.now(); }
    catch { online.value = false; error.value = 'Live Chat went offline. Reconnect before replying.'; }
  }
  if (props.visible) { await load(); if (opened.value) { await read(opened.value, true); await presence(true, body.value.trim().length > 0); } }
}
function visibility() {
  if (document.hidden && online.value) { presence(false); availability(false); }
  else if (!document.hidden && props.visible) load();
}
watch([site, agency], load);
watch(() => props.visible, value => { if (value) { load(); if (opened.value) read(opened.value, true); } else presence(false); }, { immediate: true });
watch(() => props.chatId, id => { if (id && id !== opened.value) open(id); }, { immediate: true });
watch(() => props.sessionToken, () => { online.value = false; ++queueRevision; ++detailRevision; sessions.value = []; detail.value = null; opened.value = ''; body.value = ''; drafts.clear(); seen.clear(); if (props.visible) load(); });
onMounted(() => { timer = setInterval(tick, 8000); document.addEventListener('visibilitychange', visibility); });
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); ++queueRevision; ++detailRevision; presence(false); if (online.value) axios.post(url('/availability'), { available: false }, config()).catch(() => {}); });
defineExpose({ goOffline: () => availability(false) });
</script>

<template>
  <section class="mobile-live-chat" aria-label="Live Chat">
    <header class="lc-header"><div><h1>Live Chat</h1><span class="lc-status" :class="{online}"><i aria-hidden="true"></i>{{ online?'Online':'Offline' }}</span></div><button :disabled="changing" :class="{primary:!online}" @click="availability(!online)">{{ changing?'Updating…':online?'Go offline':'Go online' }}</button></header>
    <p v-if="error" class="lc-error" role="alert">{{ error }}</p><p v-if="notice" class="lc-notice" role="status">{{ notice }} <button aria-label="Dismiss notice" @click="notice=''">×</button></p>
    <template v-if="!opened">
      <div class="lc-filters"><label>Agency<select v-model="agency"><option value="">All agencies</option><option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option></select></label><label>Website<select v-model="site"><option value="">All websites</option><option v-for="s in sites" :key="s.slug" :value="s.slug">{{ s.name }}</option></select></label><label class="lc-search">Search<input v-model="search" type="search" placeholder="Website or page"></label></div>
      <div class="lc-tools"><label><input v-model="showEnded" type="checkbox"> Include ended chats</label><button :disabled="loading" @click="load">↻ Refresh</button></div>
      <p v-if="loading && !sessions.length" role="status">Loading chats…</p><p v-else-if="!visibleSessions.length">No chats in this view.</p>
      <button v-for="row in visibleSessions" :key="row.id" class="lc-row" :class="{'lc-unread':unread(row)}" @click="open(row)"><img v-if="row.logoUrl" :src="row.logoUrl" alt=""><span><strong>{{ row.name }}</strong><small>{{ row.pagePath || '/' }} · {{ time(row.createdAt) }}</small><small>{{ row.expired?'Expired':row.endedAt?'Visitor ended chat':row.visitorLeft?'Visitor away':row.claimedBy?'Claimed':'Waiting for support' }}</small></span><b v-if="unread(row)" aria-label="Unread">●</b><span aria-hidden="true">›</span></button>
    </template>
    <article v-else class="lc-detail">
      <div class="lc-toolbar"><button :disabled="busy" @click="back">‹ Back</button><button :disabled="busy || !detail" @click="action('dismiss',{confirmed:true})">Remove from my list</button></div>
      <h2>{{ detail?.site?.name || 'Visitor conversation' }}</h2><p v-if="!detail && !error" role="status">Opening chat…</p>
      <template v-if="detail">
        <p v-if="detail.ended || detail.expired" class="lc-meta">{{ detail.ended?'The visitor ended this chat.':'This chat has expired.' }} Its transcript is preserved.</p>
        <div class="lc-toolbar"><button :disabled="busy || !online || detail.ended || detail.expired || detail.claimedBy && !detail.claimedByMe" @click="action('claim',{release:detail.claimedByMe})">{{ detail.claimedByMe?'Release claim':detail.claimedBy?'Claimed by teammate':'Claim chat' }}</button><button :disabled="busy" @click="action('close')">Close chat</button></div>
        <div ref="thread" class="lc-thread" role="log" aria-label="Chat transcript"><div v-for="message in detail.messages" :key="message.id" class="lc-message" :class="message.sender"><small>{{ message.sender==='visitor'?'Visitor':message.sender==='system'?'Chat update':`Support ${message.memberNumber || ''}` }} · {{ time(message.createdAt) }}</small><WebsiteChatMessage :body="message.body" /></div></div>
        <p v-if="detail.visitorTyping" class="lc-meta" role="status">Visitor is typing…</p>
        <form v-if="!detail.ended && !detail.expired" class="lc-compose" @submit.prevent="send">
          <label>Quick response<select :disabled="!canSend" value="" @change="insert($event.target.value);$event.target.value=''"><option value="">Choose a response</option><option v-for="item in detail.quickReplies" :key="item.label" :value="item.body">{{ item.label }}</option></select></label>
          <label>Share a page<select :disabled="!canSend" value="" @change="insert($event.target.value);$event.target.value=''"><option value="">Choose a page</option><option v-for="item in detail.pageLinks" :key="item.url" :value="item.url">{{ item.label }}</option></select></label>
          <button type="button" :disabled="!canSend" @click="action('referral')">Add support form link</button>
          <label class="lc-full">Message<textarea v-model="body" rows="3" maxlength="2000" :disabled="!canSend" @input="presence(true,true)"></textarea></label><p v-if="!online" class="lc-meta lc-full">Go online to reply. Please do not request protected health information in Live Chat.</p><button type="submit" class="primary lc-full" :disabled="!canSend || !body.trim()">{{ busy?'Sending…':'Send message' }}</button>
        </form>
      </template>
    </article>
  </section>
</template>

<style scoped>
.mobile-live-chat{min-width:0;background:#fff;color:#18344f;padding:14px;overflow-wrap:anywhere}.lc-header,.lc-toolbar,.lc-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.lc-header h1{font-size:22px;margin:0 0 7px}.lc-status{display:flex;align-items:center;gap:6px;font-size:13px;color:#677b8e}.lc-status i{width:8px;height:8px;border-radius:50%;background:#8592a3}.lc-status.online i{background:#168462}.mobile-live-chat button{font:inherit;min-height:42px;border:1px solid #d6e0ed;border-radius:10px;padding:9px 12px;background:#f3f6fb;color:inherit}.mobile-live-chat button.primary{background:#2459df;color:#fff}.mobile-live-chat button:disabled{opacity:.5}.lc-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0 10px}.mobile-live-chat label{display:flex;flex-direction:column;gap:5px;font-size:12px}.lc-search{grid-column:1/-1}.mobile-live-chat input:not([type=checkbox]),.mobile-live-chat select,.mobile-live-chat textarea{width:100%;box-sizing:border-box;min-width:0;font:inherit;font-size:16px;min-height:42px;border:1px solid #cbd8e6;border-radius:9px;padding:8px;background:white;color:inherit}.lc-tools{font-size:13px;margin-bottom:10px}.lc-tools label{flex-direction:row;align-items:center}.lc-row{width:100%;display:flex;gap:12px;align-items:center;text-align:left;border:0!important;border-top:1px solid #e4eaf2!important;border-radius:0!important;background:#fff!important;padding:14px 0!important}.lc-row>span:first-of-type{display:flex;flex:1;flex-direction:column;gap:5px}.lc-row img{width:40px;height:40px;object-fit:contain}.lc-row strong{font-size:15px}.lc-row small,.lc-meta{font-size:12px;color:#6b7d91}.lc-row.lc-unread{background:#f2f6ff!important}.lc-row b{color:#2459df;font-size:10px}.lc-toolbar{margin:12px 0}.lc-detail h2{font-size:19px}.lc-thread{max-height:53dvh;min-height:90px;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:10px;padding:10px 0}.lc-message{display:flex;flex-direction:column;gap:6px;border-radius:12px;background:#f0f3f7;padding:11px;max-width:92%;font-size:15px;align-self:flex-start;line-height:1.45}.lc-message.staff{align-self:flex-end;background:#eaf1ff}.lc-message.system{align-self:center;background:#f8f8f8;color:#6b7d91;font-size:12px}.lc-message small{font-size:11px;color:#687a90}.lc-compose{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-top:14px;border-top:1px solid #e4eaf2}.lc-full{grid-column:1/-1}.lc-error{padding:10px;border-radius:9px;background:#fff0f2;color:#982d44;font-size:14px}.lc-notice{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border-radius:9px;background:#edf7f2;color:#26674e;font-size:13px}.lc-notice button{min-height:28px;border:0;background:transparent;padding:2px 7px;font-size:22px}
</style>
