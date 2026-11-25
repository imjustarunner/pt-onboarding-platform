<template>
 <section v-if="visibleTickets.length || error" class="file-review-toasts" aria-label="File-access review requests">
  <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button> <router-link to="/privacy-review">Open review queue</router-link></p>
  <article v-for="ticket in visibleTickets" :key="ticket.id" :aria-label="`File access request from ${ticket.actor_email || `User ${ticket.user_id}`}`">
   <header class="notice-heading"><strong>{{ ticket.actor_email || `User ${ticket.user_id}` }} requested file-access review</strong>
    <button type="button" class="hide-notice" aria-label="Hide file-access notification" title="Hide this notification. The request stays in the review queue." @click="hideNotice(ticket.id)">Hide</button>
   </header>
   <p>{{ ticket.reason }}</p>
   <p v-if="ticket.hold_reason">{{ ticket.hold_reason === 'bulk_operation' ? 'This hold began with a bulk download, export, or print request.' : ticket.hold_reason === 'volume_limit' ? 'This hold began when the file-access volume limit was reached.' : `Recorded hold reason: ${ticket.hold_reason}` }}</p>
   <p>Ordinary admin and support document views stay available. Reset clears the file hold and restarts its usage window; audit history is retained.</p>
   <div class="links"><router-link :to="auditLink(ticket, 'user_activity')">Activity logs</router-link><router-link :to="auditLink(ticket, 'phi_document')">Document audit</router-link><router-link to="/privacy-review">Review queue</router-link></div>
   <div v-if="Number(ticket.user_id) !== Number(userId)" class="actions">
    <button type="button" :disabled="busy" @click="decide(ticket, 'keep_holding')">Keep holding</button>
    <button type="button" :disabled="busy" @click="decide(ticket, 'dismissed')">Dismiss</button>
    <button type="button" :disabled="busy" @click="decide(ticket, 'reset')">Reviewed &amp; reset</button>
   </div>
   <SoleReviewerFileRecovery v-else-if="selfRecoveryAllowed" :ticket-id="ticket.id" @reviewed="resolved(ticket.id)" />
   <p v-else>Another designated reviewer must handle your request.</p>
  </article>
 </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../services/api';
import SoleReviewerFileRecovery from './SoleReviewerFileRecovery.vue';
const props = defineProps({ userId: { type: [Number, String], required: true } });
const tickets = ref([]), error = ref(''), busy = ref(false), selfRecoveryAllowed = ref(false);
let disposed = false, loading = false, timer;
const reviewedIds = new Set();
const hiddenStorageKey = userId => `file-review-notices:hidden:v1:${userId}`;
function readHidden(userId) {
 try {
  const saved = JSON.parse(window.sessionStorage.getItem(hiddenStorageKey(userId)) || '[]');
  return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string').slice(-500) : []);
 } catch { return new Set(); }
}
const hiddenIds = ref(readHidden(props.userId));
const visibleTickets = computed(() => tickets.value.filter(ticket => !hiddenIds.value.has(String(ticket.id))));
function hideNotice(id) {
 // Presentation only: never change the ticket, review decision, or access hold.
 hiddenIds.value = new Set([...hiddenIds.value, String(id)].slice(-500));
 try { window.sessionStorage.setItem(hiddenStorageKey(props.userId), JSON.stringify([...hiddenIds.value])); }
 catch { /* Keep hiding locally when this browser blocks session storage. */ }
}
watch(() => props.userId, () => {
 tickets.value = []; error.value = ''; reviewedIds.clear(); hiddenIds.value = readHidden(props.userId); load();
});
const auditLink = (ticket, source) => ({ path: '/admin/audit-center', query: { userId: String(ticket.user_id), source, view: 'table' } });
async function load() {
 if (loading || disposed || document.visibilityState === 'hidden') return;
 loading = true;
 const viewerId = props.userId;
 try {
  const { data } = await api.get('/privacy-review/requests', { skipGlobalLoading: true });
  if (!disposed && viewerId === props.userId) { tickets.value = Array.isArray(data?.tickets) ? data.tickets.filter(ticket => !reviewedIds.has(ticket.id)) : []; selfRecoveryAllowed.value=data?.selfRecoveryAllowed===true; error.value = ''; }
 } catch { if (!disposed && viewerId === props.userId) error.value = 'File-access review requests could not be refreshed.'; }
 finally { loading = false; if (!disposed && viewerId !== props.userId) load(); }
}
async function decide(ticket, decision) {
 if (busy.value) return;
 busy.value = true; error.value = '';
 try {
  await api.post(`/privacy-review/tickets/${ticket.id}/review`, { decision }, { headers: { 'X-Account-Security': '1' } });
  reviewedIds.add(ticket.id);
  if (!disposed) tickets.value = tickets.value.filter(item => item.id !== ticket.id);
  window.dispatchEvent(new Event('account-security-changed'));
 } catch (e) { if (!disposed) error.value = e.response?.data?.error?.message || 'The review could not be saved. The request remains pending.'; }
 finally { busy.value = false; }
}
function resolved(id) { reviewedIds.add(id); tickets.value=tickets.value.filter(ticket=>ticket.id!==id); }
onMounted(() => { load(); timer = setInterval(load, 30000); window.addEventListener('focus', load); document.addEventListener('visibilitychange', load); });
onBeforeUnmount(() => { disposed = true; clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); });
</script>
<style scoped>
.file-review-toasts{position:fixed;right:1rem;bottom:1rem;z-index:2100;width:min(440px,calc(100vw - 2rem));max-height:70vh;overflow:auto;display:grid;gap:.8rem}
article,.file-review-toasts>p{background:var(--bg-primary,#fff);color:var(--text-primary,#1e293b);border:1px solid var(--border-color,#cbd5e1);border-left:4px solid var(--primary,#285d91);border-radius:12px;box-shadow:0 8px 28px #0003;padding:1rem;margin:0;overflow-wrap:anywhere}
.notice-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem}.notice-heading strong{flex:1;min-width:0}.hide-notice{flex:none;font-size:.8rem;min-height:32px}
p{font-size:.9rem;margin:.6rem 0}.links,.actions{display:flex;gap:.65rem;flex-wrap:wrap;margin-top:.7rem}button{padding:.55rem .65rem;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-secondary,#f1f5f9);color:inherit;cursor:pointer}button:last-child{font-weight:600}button:disabled{opacity:.6}
</style>
