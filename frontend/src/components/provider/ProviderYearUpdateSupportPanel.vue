<template>
  <aside class="pyu-support">
    <header class="pyu-support__head">
      <h2>Support</h2>
      <p class="muted">
        Found an issue or have a question while completing your Year Update? Submit a ticket and our support team will follow up.
      </p>
    </header>

    <form class="pyu-support__form" @submit.prevent="submit">
      <label class="lbl">
        Topic
        <select v-model="topic" class="select" :disabled="sending">
          <option v-for="t in topics" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </label>
      <label class="lbl">
        Subject (optional)
        <input v-model="subject" type="text" maxlength="255" placeholder="Brief summary" :disabled="sending" />
      </label>
      <label class="lbl">
        Message
        <textarea
          v-model="question"
          class="textarea"
          rows="4"
          maxlength="4000"
          placeholder="Describe the issue, question, or anything that looks wrong…"
          :disabled="sending"
        />
      </label>
      <button type="submit" class="btn btn-primary btn-sm" :disabled="sending || !question.trim() || !agencyId">
        {{ sending ? 'Submitting…' : 'Submit support ticket' }}
      </button>
    </form>

    <p v-if="error" class="error-banner">{{ error }}</p>
    <p v-if="success" class="success-banner">{{ success }}</p>

    <div v-if="recentTickets.length" class="pyu-support__recent">
      <button type="button" class="pyu-support__recent-toggle" @click="showRecent = !showRecent">
        Your recent tickets ({{ recentTickets.length }})
        <span aria-hidden="true">{{ showRecent ? '▾' : '▸' }}</span>
      </button>
      <ul v-if="showRecent" class="pyu-support__ticket-list">
        <li v-for="t in recentTickets" :key="t.id" class="pyu-support__ticket">
          <div class="pyu-support__ticket-top">
            <strong>#{{ t.id }}</strong>
            <span class="pill" :class="statusClass(t.status)">{{ statusLabel(t.status) }}</span>
          </div>
          <p class="pyu-support__ticket-subject">{{ ticketTitle(t) }}</p>
          <p class="muted tiny">{{ formatDt(t.created_at) }}</p>
        </li>
      </ul>
    </div>
  </aside>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { PROVIDER_TICKET_TOPICS, ticketTopicLabel } from '../../utils/ticketTopics';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  schoolYear: { type: String, default: '' },
  activeSection: { type: String, default: '' },
  pyuToken: { type: String, default: '' },
});

const topics = PROVIDER_TICKET_TOPICS;
const topic = ref('general');
const subject = ref('');
const question = ref('');
const sending = ref(false);
const error = ref('');
const success = ref('');
const recentTickets = ref([]);
const showRecent = ref(false);

const ticketsApiBase = () => {
  const token = String(props.pyuToken || '').trim();
  if (token) return `/public/provider-year-update/${encodeURIComponent(token)}/support-tickets`;
  return '/support-tickets';
};

function formatDt(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'answered') return 'Answered';
  if (s === 'closed') return 'Closed';
  return 'Open';
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'answered') return 'pill--answered';
  if (s === 'closed') return 'pill--closed';
  return 'pill--open';
}

function ticketTitle(ticket) {
  const subj = String(ticket?.subject || '').trim();
  if (subj) return subj;
  const q = String(ticket?.question || '').trim();
  if (q.length > 80) return `${q.slice(0, 77)}…`;
  return q || 'Support request';
}

async function loadRecent() {
  const agencyId = Number(props.agencyId);
  if (!agencyId) {
    recentTickets.value = [];
    return;
  }
  try {
    const res = await api.get(`${ticketsApiBase()}/mine`, {
      skipGlobalLoading: true,
      ...(props.pyuToken ? {} : {}),
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    recentTickets.value = rows.slice(0, 5);
  } catch {
    recentTickets.value = [];
  }
}

async function submit() {
  const agencyId = Number(props.agencyId);
  const bodyText = String(question.value || '').trim();
  if (!agencyId || !bodyText) return;
  sending.value = true;
  error.value = '';
  success.value = '';
  const sectionLabel = props.activeSection
    ? props.activeSection.replace(/_/g, ' ')
  : 'Year Update';
  const contextLines = [
    `Submitted from Provider Fall Update${props.schoolYear ? ` (${props.schoolYear})` : ''}.`,
    `Section: ${sectionLabel}.`,
    '',
    bodyText,
  ];
  try {
    const res = await api.post(
      ticketsApiBase(),
      {
        schoolOrganizationId: agencyId,
        topic: topic.value || 'general',
        subject: String(subject.value || '').trim() || `Provider Fall Update — ${ticketTopicLabel(topic.value)}`,
        question: contextLines.join('\n'),
        requestsPlatformHelp: false,
      },
      { skipGlobalLoading: true }
    );
    const id = res.data?.id;
    success.value = id
      ? `Ticket #${id} submitted. Our support team will follow up.`
      : 'Ticket submitted. Our support team will follow up.';
    subject.value = '';
    question.value = '';
    topic.value = 'general';
    await loadRecent();
    showRecent.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not submit ticket';
  } finally {
    sending.value = false;
  }
}

watch(
  () => [props.agencyId, props.pyuToken],
  () => {
    loadRecent();
  }
);

onMounted(() => {
  loadRecent();
});
</script>

<style scoped>
.pyu-support {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
}
.pyu-support__head h2 {
  margin: 0 0 6px;
  font-size: 1.1rem;
  color: var(--pyu-primary, #0c4a6e);
}
.pyu-support__head p {
  margin: 0 0 14px;
  font-size: 0.82rem;
  line-height: 1.4;
}
.pyu-support__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lbl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #334155;
}
.select,
.textarea,
input[type='text'] {
  font: inherit;
  font-weight: 400;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
}
.textarea {
  resize: vertical;
  min-height: 88px;
}
.error-banner {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.82rem;
}
.success-banner {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f0fdf4;
  color: #166534;
  font-size: 0.82rem;
}
.pyu-support__recent {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}
.pyu-support__recent-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.pyu-support__ticket-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pyu-support__ticket {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  background: #f8fafc;
}
.pyu-support__ticket-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.pyu-support__ticket-subject {
  margin: 0;
  font-size: 0.82rem;
  color: #334155;
  line-height: 1.35;
}
.pill {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.pill--open {
  background: #dbeafe;
  color: #1e40af;
}
.pill--answered {
  background: #d1fae5;
  color: #047857;
}
.pill--closed {
  background: #e2e8f0;
  color: #475569;
}
.muted {
  color: #64748b;
}
.tiny {
  font-size: 0.75rem;
}
</style>
