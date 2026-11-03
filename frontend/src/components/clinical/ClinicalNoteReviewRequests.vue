<template>
  <section class="note-review-requests" aria-label="Supervisor and billing review requests">
    <article v-for="request in requests" :key="request.requestId || request.id" :class="request.status">
      <header><strong>{{ NOTE_REVIEW_STATUS[request.status] || 'Note review' }}</strong>
        <span>{{ request.createdByName || (request.createdByUserId ? `Reviewer #${request.createdByUserId}` : 'Reviewer') }}<template v-if="request.createdAt"> · {{ formatDate(request.createdAt) }}</template></span>
      </header>
      <p>{{ request.message }}</p>
      <template v-if="request.status === 'changes_needed'">
        <small>The original signature stays on file. Sign a correction addressing this request to return the note for supervisor review.</small>
        <button type="button" @click="$emit('correct')">Add signed correction</button>
      </template>
      <template v-else>
        <small v-if="request.status === 'review_acknowledge'">Review this request and any amendment below, then acknowledge. A new signature on the original note is not required.</small>
        <small v-else>Feedback only. No acknowledgement or new signature is required.</small>
        <button type="button" :disabled="busy" @click="acknowledge(request)">{{ request.status === 'feedback' ? 'Dismiss feedback' : 'Acknowledge reviewed' }}</button>
      </template>
    </article>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api.js';
import { NOTE_REVIEW_STATUS } from '../../utils/noteReviewWork.js';
const props = defineProps({ requests: { type: Array, default: () => [] } });
const emit = defineEmits(['acknowledged', 'correct']);
const busy = ref(false);
const error = ref('');
let generation = 0;
watch(() => props.requests, () => { generation++; busy.value = false; error.value = ''; });
onBeforeUnmount(() => { generation++; });
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
async function acknowledge(request) {
  if (busy.value) return;
  const seq = generation;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/medical-billing/notes/${request.clinicalNoteId}/review-requests/${request.requestId || request.id}/acknowledge`, { agencyId: Number(request.agencyId) });
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
[role=alert] { color: #b91c1c; }
</style>
