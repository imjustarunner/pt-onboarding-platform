<template>
 <section v-if="tickets.length || error" class="file-review-toasts" aria-label="File-access review requests">
  <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button> <router-link to="/privacy-review">Open review queue</router-link></p>
  <article v-for="ticket in tickets" :key="ticket.id" :aria-label="`File access request from ${ticket.actor_email || `User ${ticket.user_id}`}`">
   <strong>{{ ticket.actor_email || `User ${ticket.user_id}` }} requested file-access review</strong>
   <p>{{ ticket.reason }}</p>
   <p>Ordinary admin and support document views stay available. Reset clears the file hold and restarts its usage window; audit history is retained.</p>
   <div class="links"><router-link :to="auditLink(ticket, 'user_activity')">Activity logs</router-link><router-link :to="auditLink(ticket, 'phi_document')">Document audit</router-link></div>
   <div v-if="Number(ticket.user_id) !== Number(userId)" class="actions">
    <button type="button" :disabled="busy" @click="decide(ticket, 'keep_holding')">Keep holding</button>
    <button type="button" :disabled="busy" @click="decide(ticket, 'dismissed')">Dismiss</button>
    <button type="button" :disabled="busy" @click="decide(ticket, 'reset')">Reviewed &amp; reset</button>
   </div>
   <p v-else>Another designated reviewer must handle your request.</p>
  </article>
 </section>
</template>
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import api from '../services/api';
const props = defineProps({ userId: { type: [Number, String], required: true } });
const tickets = ref([]), error = ref(''), busy = ref(false);
let disposed = false, loading = false, timer;
const reviewedIds = new Set();
const auditLink = (ticket, source) => ({ path: '/admin/audit-center', query: { userId: String(ticket.user_id), source, view: 'table' } });
async function load() {
 if (loading || disposed || document.visibilityState === 'hidden') return;
 loading = true;
 try {
  const { data } = await api.get('/privacy-review/requests', { skipGlobalLoading: true });
  if (!disposed) { tickets.value = Array.isArray(data?.tickets) ? data.tickets.filter(ticket => !reviewedIds.has(ticket.id)) : []; error.value = ''; }
 } catch { if (!disposed) error.value = 'File-access review requests could not be refreshed.'; }
 finally { loading = false; }
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
onMounted(() => { load(); timer = setInterval(load, 30000); window.addEventListener('focus', load); document.addEventListener('visibilitychange', load); });
onBeforeUnmount(() => { disposed = true; clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); });
</script>
<style scoped>
.file-review-toasts{position:fixed;right:1rem;bottom:1rem;z-index:2100;width:min(440px,calc(100vw - 2rem));max-height:70vh;overflow:auto;display:grid;gap:.8rem}
article,.file-review-toasts>p{background:var(--bg-primary,#fff);color:var(--text-primary,#1e293b);border:1px solid var(--border-color,#cbd5e1);border-left:4px solid var(--primary,#285d91);border-radius:12px;box-shadow:0 8px 28px #0003;padding:1rem;margin:0;overflow-wrap:anywhere}
p{font-size:.9rem;margin:.6rem 0}.links,.actions{display:flex;gap:.65rem;flex-wrap:wrap;margin-top:.7rem}button{padding:.55rem .65rem;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-secondary,#f1f5f9);color:inherit;cursor:pointer}button:last-child{font-weight:600}button:disabled{opacity:.6}
</style>
