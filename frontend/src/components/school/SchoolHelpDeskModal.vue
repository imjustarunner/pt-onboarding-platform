<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" data-tour="school-contact-admin-panel" @click.stop>
      <div class="modal-header">
        <h2>Contact Admin</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>

      <div class="body">
        <div class="left">
          <div class="composer">
            <label>
              Topic
              <select v-model="topic" class="input" :disabled="submitting || !!createdTicketId">
                <option v-for="t in schoolTicketTopics" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </label>
            <label>
              Subject (optional)
              <input v-model="subject" :disabled="submitting || !!createdTicketId" type="text" class="input" placeholder="e.g., Scheduling question" />
            </label>
            <label>
              Question
              <textarea v-model="question" :disabled="submitting || !!createdTicketId" rows="4" class="textarea" placeholder="What do you need help with?" />
            </label>
            <TicketAttachmentComposer ref="attachmentComposer" :context-key="`${schoolOrganizationId}:${actorId}`" :disabled="submitting" />
            <p v-if="createdTicketId">Ticket #{{ createdTicketId }} is already saved. Retry only its file; do not resend the question.</p>
            <button class="btn btn-primary" @click="submit" :disabled="submitting || !question.trim()">
              {{ submitting ? 'Sending…' : createdTicketId ? 'Retry file upload' : 'Send' }}
            </button>
            <div v-if="error" class="error">{{ error }}</div>
          </div>
        </div>

        <div class="right">
          <div class="tickets-header">
            <strong>Your questions</strong>
            <button class="btn btn-secondary btn-sm" @click="load" :disabled="loading">Refresh</button>
          </div>
          <SchoolSupportTicketThread v-if="selectedTicketId" :key="`${schoolOrganizationId}:${selectedTicketId}`" :ticket-id="selectedTicketId" :school-organization-id="schoolOrganizationId" @close="selectedTicketId = null" @updated="load" />
          <div v-else-if="loading" class="loading">Loading…</div>
          <div v-else-if="listError" class="error" role="alert">{{ listError }}</div>
          <div v-else-if="tickets.length === 0" class="empty">No questions yet.</div>
          <div v-else class="tickets">
            <div v-for="t in tickets" :key="t.id" class="ticket">
              <div class="ticket-top">
                <div class="ticket-subject">
                  <button type="button" class="ticket-open" @click="selectedTicketId = Number(t.id)">{{ t.subject || 'Question' }} · Ticket #{{ t.id }}</button>
                  <span class="status">{{ formatStatus(t.status) }}</span>
                </div>
                <div class="ticket-date">{{ formatDateTime(t.created_at) }}</div>
              </div>
              <div class="ticket-q">
                <div class="label">You</div>
                <div class="text">{{ t.question }}</div>
              </div>
              <div v-if="t.answer" class="ticket-a">
                <div class="label">Admin</div>
                <div class="text">{{ t.answer }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {useAuthStore} from '../../store/auth';
import SchoolSupportTicketThread from './SchoolSupportTicketThread.vue';
import TicketAttachmentComposer from '../tickets/TicketAttachmentComposer.vue';
import api from '../../services/api';
import { GUARDIAN_TICKET_TOPICS } from '../../utils/ticketTopics';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  initialTicketId: { type: Number, default: null }
});
defineEmits(['close']);

const auth=useAuthStore(),actorId=computed(()=>Number(auth.user?.id)||null);
const tickets = ref([]);
const selectedTicketId = ref(props.initialTicketId);
let generation=0,loadVersion=0,disposed=false;
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const listError = ref('');
const attachmentComposer=ref(null),createdTicketId=ref(null);

const schoolTicketTopics = GUARDIAN_TICKET_TOPICS;
const topic = ref('general');
const subject = ref('');
const question = ref('');

const load = async () => {
  const schoolId=Number(props.schoolOrganizationId),actor=actorId.value,request=++loadVersion,version=generation;
  const current=()=>!disposed&&schoolId===Number(props.schoolOrganizationId)&&version===generation&&request===loadVersion&&actor===actorId.value;
  try {
    loading.value = true; listError.value = '';
    if(!actorId.value)return;
    const r = await api.get('/support-tickets/mine');
    if(current())tickets.value = (Array.isArray(r.data)?r.data:[]).filter((t) => Number(t.school_organization_id) === schoolId);
  } catch (e) {
    if(current())listError.value = e.response?.data?.error?.message || 'Failed to load questions';
  } finally { if(current())loading.value = false; }
};

const submit = async () => {
  if(submitting.value)return;const schoolId=Number(props.schoolOrganizationId),actor=actorId.value,version=generation,current=()=>!disposed&&generation===version&&Number(props.schoolOrganizationId)===schoolId&&actor===actorId.value;
  try {
    submitting.value = true;
    error.value = '';
    if(!createdTicketId.value){const created=await api.post('/support-tickets', {
      schoolOrganizationId: props.schoolOrganizationId,
      topic: topic.value || 'general',
      subject: subject.value.trim() || null,
      question: question.value.trim()
    });if(!current())return;createdTicketId.value=created.data?.id;if(!createdTicketId.value)throw new Error('The ticket was saved without a usable reference. Refresh your questions before trying again.');}
    if(!(await attachmentComposer.value?.uploadPending(createdTicketId.value))){if(!current())return;error.value='Your question is saved, but its file was not added. Retry the file upload for this ticket.';return;}
    if(!current())return;
    createdTicketId.value=null;attachmentComposer.value?.reset();
    topic.value = 'general';
    subject.value = '';
    question.value = '';
    await load();
  } catch (e) {
    if(current())error.value = e.response?.data?.error?.message || 'Failed to submit question';
  } finally {
    if(current())submitting.value = false;
  }
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');
const formatStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'answered') return 'Answered';
  if (v === 'closed') return 'Closed';
  return 'Open';
};

watch(()=>[props.schoolOrganizationId,actorId.value],()=>{generation++;tickets.value=[];selectedTicketId.value=null;createdTicketId.value=null;submitting.value=false;topic.value='general';subject.value='';question.value='';void load();},{immediate:true});
watch(()=>props.initialTicketId,id=>selectedTicketId.value=id,{immediate:true});
onBeforeUnmount(()=>{disposed=true;generation++;});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 980px;
  max-width: 95vw;
  max-height: 90vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.close {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}
.body {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 14px;
  padding: 14px;
  overflow: auto;
}
.composer label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 10px;
}
.input, .textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
}
.textarea {
  resize: vertical;
}
.tickets-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.ticket {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
  background: var(--bg);
}
.ticket-open {border:0;background:transparent;color:var(--primary,#16457c);font:inherit;font-weight:700;text-align:left;cursor:pointer;padding:0;text-decoration:underline;}
.ticket-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.ticket-subject {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status {
  font-size: 12px;
  color: var(--text-secondary);
}
.ticket-date {
  font-size: 12px;
  color: var(--text-secondary);
}
.label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.text {
  white-space: pre-wrap;
}
.error {
  margin-top: 10px;
  color: #c33;
}
.loading, .empty {
  color: var(--text-secondary);
}
@media (max-width: 900px) {
  .body { grid-template-columns: 1fr; }
}
</style>

