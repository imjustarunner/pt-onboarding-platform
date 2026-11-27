<template>
  <section class="note-review-requests" aria-label="Supervisor and billing review requests">
    <article v-for="request in requests" :key="request.requestId || request.id" :class="request.status">
      <header><strong>{{ NOTE_REVIEW_STATUS[request.status] || 'Note review' }}</strong>
        <span>{{ request.createdByName || (request.createdByUserId ? `Reviewer #${request.createdByUserId}` : 'Reviewer') }}<template v-if="request.createdAt"> · {{ formatDate(request.createdAt) }}</template></span>
      </header>
      <p>{{ readableReviewMessage(request.message) }}</p>
      <template v-if="isVersionRequest(request)">
        <small>{{ request.source === 'clinical_revision_proposal' ? 'Review the proposed revision and sign it as the original clinical author. The existing approved version remains on file.' : 'Review this exact saved amendment, then record your acknowledgement in Note versions. The supervisor signature is already complete.' }}</small>
        <button type="button" @click="$emit('open-version', request)">{{ request.source === 'clinical_revision_proposal' ? 'Review proposed version' : 'Review amended version' }}</button>
      </template>
      <template v-else-if="request.status === 'changes_needed'">
        <small>{{ request.resolutionMode==='signed_addendum' ? 'Address this request in a separately signed addendum.' : 'The original signature stays on file. Sign a correction addressing this request to return the note for supervisor review.' }}</small>
        <template v-if="request.resolutionMode==='signed_addendum'">
          <button type="button" @click="editing = editing===request.id ? '' : request.id; addition=''; approved=false">Write signed addendum</button>
          <form v-if="editing===request.id" @submit.prevent="signAddendum(request)">
            <label>Additional documentation<textarea v-model="addition" rows="4" maxlength="20000" required /></label>
            <label><input v-model="approved" type="checkbox" /> I reviewed and sign this addendum.</label>
            <button :disabled="busy || !approved || !addition.trim()">Sign addendum</button>
          </form>
        </template>
        <button v-else-if="!mobile" type="button" @click="$emit('correct')">Add signed correction</button>
        <small v-else>Open this note in the full Note Workspace to amend signed encounter details.</small>
      </template>
      <template v-else>
        <small v-if="request.status === 'review_acknowledge'">Review this request and any amendment below, then acknowledge. A new signature on the original note is not required.</small>
        <small v-else>Feedback only. No acknowledgement or new signature is required.</small>
        <span v-if="request.acknowledgedAt">Acknowledged</span><button v-else type="button" :disabled="busy" @click="acknowledge(request)">{{ request.status === 'feedback' ? 'Dismiss feedback' : 'Acknowledge reviewed' }}</button>
        <p v-if="scheduled[request.requestId || request.id]" role="status">{{ scheduled[request.requestId || request.id] }}</p>
        <button v-else-if="request.status==='review_acknowledge' && request.source==='supervisor'" type="button" :disabled="busy" @click="scheduleDiscussion(request)">Add to next supervision agenda</button>
      </template>
    </article>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { NOTE_REVIEW_STATUS, readableReviewMessage } from '../../utils/noteReviewWork.js';
const props = defineProps({ requests: { type: Array, default: () => [] }, mobile:Boolean, requestClient:Function });
const emit = defineEmits(['acknowledged', 'correct', 'open-version']);
const busy = ref(false);
const error = ref(''), editing=ref(''), addition=ref(''), approved=ref(false), scheduled=ref({});
let generation = 0;
watch(() => props.requests, () => { generation++; busy.value = false; error.value = ''; });
onBeforeUnmount(() => { generation++; });
const isVersionRequest = request => ['clinical_revision', 'clinical_revision_proposal'].includes(request.source) && !!request.revisionId;
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
async function post(path,body) {
  if(props.requestClient)return props.requestClient(path,body);
  const {default:api}=await import('../../services/api.js');
  return api.post('/medical-billing'+path,body,{skipGlobalLoading:true});
}
async function signAddendum(request) {
  if (busy.value || !approved.value || !addition.value.trim()) return;
  await perform(request, '/addenda', {
    body:addition.value.trim(),entryKind:'addendum',reason:'Response to supervisor documentation request.',
    authorAttested:true,requestId:request.requestId || request.id
  },()=>{ editing.value='';addition.value='';approved.value=false;emit('acknowledged',request); });
}
async function scheduleDiscussion(request) {
  const requestId = request.requestId || request.id;
  await perform(request, `/review-requests/${requestId}/supervision-agenda`, {}, ({ data }) => {
    scheduled.value[requestId] = data?.meetingStartsAt
      ? `Added to your supervision agenda for ${formatDate(data.meetingStartsAt)}.`
      : 'Added to your supervision agenda.';
  });
}
async function perform(request,suffix,payload,complete) {
  if(busy.value)return;
  const seq=generation;
  busy.value=true;
  error.value='';
  try {
    const result = await post(`/notes/${request.clinicalNoteId}${suffix}`, {agencyId:Number(request.agencyId),...payload});
    if(seq===generation)complete(result || {});
  } catch(e) {
    if(seq===generation)error.value=e.response?.data?.error?.message || 'Could not save this request. Please retry.';
  } finally {if(seq===generation)busy.value=false;}
}
async function acknowledge(request) {
  if (busy.value || isVersionRequest(request)) return;
  const seq = generation;
  busy.value = true;
  error.value = '';
  try {
    await post(`/notes/${request.clinicalNoteId}/review-requests/${request.requestId || request.id}/acknowledge`, { agencyId: Number(request.agencyId) });
    if (seq === generation) emit('acknowledged', request);
  } catch (e) {
    if (seq === generation) error.value = e.response?.data?.error?.message || 'Could not save acknowledgement. Please retry.';
  } finally {
    if (seq === generation) busy.value = false;
  }
}
</script>

<style scoped>
.note-review-requests { margin-bottom: 16px; }
article { padding: 14px 18px; margin-bottom: 10px; border: 1px solid #a5b4fc; border-left: 5px solid #4f46e5; border-radius: 10px; background: #eef2ff; }
article.changes_needed { border-color: #fcd34d; background: #fffbeb; }
article.feedback { border-color: #99f6e4; background: #f0fdfa; }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
header span, small { font-size: .8rem; color: #475569; }
p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 10px 0; }
small { display: block; }
button { margin-top: 10px; padding: 8px 12px; border: 1px solid #64748b; border-radius: 8px; background: white; color: #1e293b; cursor: pointer; }
form label{display:block;margin-top:7px}form textarea{display:block;width:100%;font:inherit}button+button{margin-left:8px}
[role=alert] { color: #b91c1c; }
</style>
