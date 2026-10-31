<template>
  <section v-if="workflows.length" class="school-contact-history" aria-label="Automated family contact">
    <header><span class="school-contact-mark" aria-hidden="true">✉</span><div><h4>Family contact plan</h4><p>Your introductions and follow-ups are recorded with this client.</p></div></header>
    <article v-for="workflow in workflows" :key="workflow.id">
      <div class="school-contact-workflow-heading"><strong>{{ statusLabel(workflow) }}</strong><small v-if="workflow.initialSentAt">First email · {{ formatDate(workflow.initialSentAt) }}</small></div>
      <p v-if="workflow.note" class="school-contact-workflow-note">{{ workflow.note }}</p>
      <div class="school-contact-workflow-actions"><RouterLink v-if="workflow.conversationId" :to="{ path: messagesPath, query: { conversationId: workflow.conversationId } }">View email conversation ↗</RouterLink><button v-if="canRecordReply(workflow)" type="button" :disabled="busyId !== null" @click="recordReply(workflow)">{{ busyId === workflow.id ? 'Recording…' : 'Record parent reply · Stop follow-ups' }}</button></div>
      <p v-if="canRecordReply(workflow)" class="school-contact-workflow-hint">Received a reply outside the app? Record it here to stop automated messages to this family.</p>
    </article>
    <p v-if="notice" role="status" class="school-contact-workflow-notice">{{ notice }}</p>
    <p v-if="error" role="alert" class="school-contact-workflow-error">{{ error }}</p>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { formatDateTimeShort } from '../../utils/formatDate';
import { buildOrgScopedPath } from '../../utils/orgScopedPath';
const props = defineProps({ agencyId: [Number, String], clientId: [Number, String] });
const agencyStore = useAgencyStore();
const messagesPath = computed(() => {
  const agency = [agencyStore.currentAgency, ...(agencyStore.userAgencies || []), ...(agencyStore.agencies || [])].find(row => Number(row?.id) === Number(props.agencyId));
  return buildOrgScopedPath(agency?.portal_url || agency?.slug, '/messages');
});
const workflows = ref([]), busyId = ref(null), error = ref(''), notice = ref('');
let version = 0, disposed = false;
const statusLabel = workflow => workflow.externalReplyRecordedAt ? 'Outside reply recorded · Follow-ups stopped' : ({ queued: 'Introduction queued', waiting_parent: 'Waiting for the family', awaiting_provider: 'Your response is needed', complete: 'Conversation connected', cancelled: 'Contact plan stopped', blocked: 'Contact needs attention', needs_review: 'Delivery needs review' })[workflow.status] || 'Contact in progress';
const canRecordReply = workflow => !!workflow.initialSentAt && !workflow.parentReplyAt && !workflow.externalReplyRecordedAt && !['complete', 'cancelled'].includes(workflow.status);
const formatDate = formatDateTimeShort;
async function load() {
  const request = ++version;
  workflows.value = []; error.value = ''; notice.value = ''; busyId.value = null;
  if (Number(props.agencyId) !== 450 || !props.clientId) return;
  try {
    const { data } = await api.get('/school-contact-plan/workflows', { params: { agencyId: props.agencyId, clientId: props.clientId }, skipGlobalLoading: true });
    if (!disposed && request === version) workflows.value = (Array.isArray(data) ? data : []).filter(row => Number(row.clientId) === Number(props.clientId));
  } catch { /* The ordinary client chart remains usable when optional automation is unavailable. */ }
}
async function recordReply(workflow) {
  if (busyId.value !== null) return;
  const request = version; busyId.value = workflow.id; error.value = ''; notice.value = '';
  try {
    const { data } = await api.post(`/school-contact-plan/workflows/${workflow.id}/parent-replied`, {}, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (disposed || request !== version) return;
    if (!data.stopped) throw new Error('Reply was not recorded');
    workflow.externalReplyRecordedAt = new Date().toISOString(); workflow.status = 'complete'; workflow.note = 'Provider recorded a reply received outside the app; automated follow-ups stopped.';
    notice.value = 'Parent reply recorded. Automated follow-ups to this family have stopped.';
  } catch (e) { if (request === version) error.value = e.response?.data?.error?.message || 'The reply could not be recorded. Please try again.'; }
  finally { if (request === version) busyId.value = null; }
}
watch(() => [props.agencyId, props.clientId], load, { immediate: true });
onBeforeUnmount(() => { disposed = true; version++; });
</script>
<style scoped>
.school-contact-history{margin:16px 0;padding:18px 20px;border:1px solid #cbded5;border-radius:14px;background:linear-gradient(120deg,#f3f8f4,#fcfdfc);color:#315650}.school-contact-history header{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}.school-contact-mark{display:grid;place-items:center;background:#e1eee4;border-radius:10px;flex-shrink:0;width:34px;height:34px;font-size:20px}.school-contact-history h4{font-size:13px;margin:0 0 4px;font-weight:650}.school-contact-history header p{font-size:11px;margin:0;color:#7a8e87;line-height:1.5}.school-contact-history article{border-top:1px solid #e0e9e3;padding-top:12px;margin-top:12px}.school-contact-workflow-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.school-contact-workflow-heading strong{font-size:12px}.school-contact-workflow-heading small{font-size:10px;color:#7c8d86}.school-contact-workflow-note{font-size:11px;line-height:1.6;color:#657d75;margin:10px 0}.school-contact-workflow-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:12px 0}.school-contact-workflow-actions a{font-size:11px;color:#40776b;text-decoration:none}.school-contact-workflow-actions button{border:1px solid #b9cfc2;border-radius:8px;padding:8px 10px;background:#fff;color:#4c7464;font:inherit;font-size:10px;cursor:pointer}.school-contact-workflow-actions button:disabled{opacity:.6;cursor:wait}.school-contact-workflow-actions button:focus-visible,.school-contact-workflow-actions a:focus-visible{outline:3px solid #b99858;outline-offset:3px}.school-contact-workflow-hint{font-size:10px;line-height:1.6;color:#7c8e86;margin:0}.school-contact-workflow-notice,.school-contact-workflow-error{font-size:11px;padding:10px;border-radius:8px;line-height:1.6}.school-contact-workflow-notice{background:#e4f2e8;color:#35684f}.school-contact-workflow-error{background:#fff0ed;color:#9c3a37}
</style>
