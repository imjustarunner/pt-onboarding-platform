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
            <TicketAttachmentComposer ref="attachmentComposer" :context-key="schoolOrganizationId" :disabled="submitting" />
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
          <div v-if="loading" class="loading">Loading…</div>
          <div v-else-if="tickets.length === 0" class="empty">No questions yet.</div>
          <div v-else class="tickets">
            <div v-for="t in tickets" :key="t.id" class="ticket">
              <div class="ticket-top">
                <div class="ticket-subject">
                  <strong>{{ t.subject || 'Question' }}</strong>
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
import { onMounted, ref, watch } from 'vue';
import TicketAttachmentComposer from '../tickets/TicketAttachmentComposer.vue';
import api from '../../services/api';
import { GUARDIAN_TICKET_TOPICS } from '../../utils/ticketTopics';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true }
});
defineEmits(['close']);

const tickets = ref([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const attachmentComposer=ref(null),createdTicketId=ref(null);

const schoolTicketTopics = GUARDIAN_TICKET_TOPICS;
const topic = ref('general');
const subject = ref('');
const question = ref('');

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get('/support-tickets/mine');
    tickets.value = (r.data || []).filter((t) => Number(t.school_organization_id) === Number(props.schoolOrganizationId));
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load questions';
  } finally {
    loading.value = false;
  }
};

const submit = async () => {
  if(submitting.value)return;const schoolId=Number(props.schoolOrganizationId);
  try {
    submitting.value = true;
    error.value = '';
    if(!createdTicketId.value){const created=await api.post('/support-tickets', {
      schoolOrganizationId: props.schoolOrganizationId,
      topic: topic.value || 'general',
      subject: subject.value.trim() || null,
      question: question.value.trim()
    });if(Number(props.schoolOrganizationId)!==schoolId)return;createdTicketId.value=created.data?.id;if(!createdTicketId.value)throw new Error('The ticket was saved without a usable reference. Refresh your questions before trying again.');}
    if(!(await attachmentComposer.value?.uploadPending(createdTicketId.value))){error.value='Your question is saved, but its file was not added. Retry the file upload for this ticket.';return;}
    createdTicketId.value=null;attachmentComposer.value?.reset();
    topic.value = 'general';
    subject.value = '';
    question.value = '';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit question';
  } finally {
    submitting.value = false;
  }
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');
const formatStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'answered') return 'Answered';
  if (v === 'closed') return 'Closed';
  return 'Open';
};

watch(()=>props.schoolOrganizationId,()=>{createdTicketId.value=null;topic.value='general';subject.value='';question.value='';});
onMounted(load);
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

