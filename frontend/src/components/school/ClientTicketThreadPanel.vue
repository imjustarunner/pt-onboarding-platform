<template>
  <div class="ticket-panel">
    <div v-if="loadingTickets || loadingThread" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="content">
      <div class="tickets">
        <div class="tickets-header">
          <strong>Tickets</strong>
          <div class="tickets-actions">
            <button class="btn-link" type="button" @click="beginNewTicket">New ticket</button>
            <button class="btn-link" type="button" @click="refreshAll">Refresh</button>
          </div>
        </div>

        <div class="ticket-list" data-tour="school-client-modal-ticket-list">
          <div v-if="tickets.length === 0" class="empty">No tickets yet.</div>
          <button
            v-for="t in tickets"
            :key="t.id"
            class="ticket-item"
            type="button"
            :class="{ active: Number(selectedTicketId) === Number(t.id) }"
            @click="selectTicket(t.id)"
          >
            <div class="ticket-item-top">
              <div class="ticket-id">#{{ t.id }}</div>
              <div class="ticket-status" :class="badgeClass(t.status)">{{ formatStatus(t.status) }}</div>
            </div>
            <div class="ticket-snippet">{{ ticketSnippet(t) }}</div>
          </button>
        </div>
      </div>

      <div class="thread">
        <div v-if="!ticket" class="empty">
          Select a ticket to add to an existing thread, or click “New ticket” to start a new topic.
        </div>

        <div v-else class="thread-inner">
          <div class="thread-header">
            <div class="thread-header-left">
              <strong>Ticket #{{ ticket.id }}</strong>
              <span class="status-pill" :class="badgeClass(ticket.status)">{{ formatStatus(ticket.status) }}</span>
            </div>
            <button class="btn-link" type="button" @click="refreshSelected">Refresh</button>
          </div>

          <button
            v-if="isAnsweredOrClosed"
            class="summary-card"
            type="button"
            @click="showFullThread = !showFullThread"
            :title="showFullThread ? 'Collapse summary' : 'Expand full thread'"
          >
            <div class="summary-row">
              <div class="label">Question</div>
              <div class="text">{{ ticket.question || '—' }}</div>
            </div>
            <div v-if="ticket.ai_summary" class="summary-row">
              <div class="label">Summary</div>
              <div class="text">{{ ticket.ai_summary }}</div>
            </div>
            <div v-if="ticket.answer" class="summary-row">
              <div class="label">Answer</div>
              <div class="text">{{ ticket.answer }}</div>
            </div>
            <div class="summary-cta">
              {{ showFullThread ? 'Click to collapse' : 'Click to expand full thread' }}
            </div>
          </button>

          <div v-if="!isAnsweredOrClosed || showFullThread" class="messages" ref="messagesEl">
            <SupportTicketThreadMessage
              v-for="m in threadRoots"
              :key="m.id"
              :node="m"
              :depth="0"
              :current-user-id="currentUserId"
              :current-user-role="currentUserRole"
              @reply="setReplyTarget"
              @delete="deleteMessage"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="composer">
      <div class="composer-top">
        <strong>Send message</strong>
        <span v-if="ticket && isClosed" class="muted">Posting will reopen the ticket.</span>
      </div>
      <div v-if="creatingNewTicket" class="new-ticket-banner">
        Starting a new ticket. To add to an existing ticket, click it in the list above.
        <button class="btn-link" type="button" @click="cancelNewTicket">Cancel</button>
      </div>
      <div v-if="replyTo" class="replying">
        <span class="replying-pill">Replying to {{ replyTo.authorLabel }}</span>
        <button class="btn-link" type="button" @click="clearReplyTo">Clear</button>
      </div>
      <textarea
        v-model="draft"
        class="textarea"
        rows="3"
        :placeholder="creatingNewTicket ? 'Describe your question/topic…' : 'Type your message…'"
        ref="composerEl"
        data-tour="school-client-modal-ticket-composer"
      />
      <div class="composer-actions">
        <button class="btn btn-primary" type="button" @click="send" :disabled="sending || !draft.trim()">
          {{ sending ? 'Sending…' : (creatingNewTicket ? 'Submit new ticket' : 'Send message') }}
        </button>
        <div v-if="sendError" class="error">{{ sendError }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import SupportTicketThreadMessage from './SupportTicketThreadMessage.vue';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  client: { type: Object, required: true },
  schoolOrganizationId: { type: Number, required: true }
});

const authStore = useAuthStore();
const currentUserId = computed(() => authStore.user?.id || null);
const currentUserRole = computed(() => String(authStore.user?.role || ''));

const loadingTickets = ref(false);
const loadingThread = ref(false);
const error = ref('');
const tickets = ref([]);
const selectedTicketId = ref(null);
const ticket = ref(null);
const messages = ref([]);

const draft = ref('');
const sending = ref(false);
const sendError = ref('');

const showFullThread = ref(false);
const messagesEl = ref(null);
const composerEl = ref(null);

const replyTo = ref(null); // { id, authorLabel }
const creatingNewTicket = ref(false);

const isClosed = computed(() => String(ticket.value?.status || '').toLowerCase() === 'closed');
const isAnsweredOrClosed = computed(() => {
  const s = String(ticket.value?.status || '').toLowerCase();
  return s === 'answered' || s === 'closed';
});

const formatStatus = (v) => {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '—';
  return s.replace(/_/g, ' ');
};
const badgeClass = (status) => {
  const s = String(status || '').toLowerCase();
  return {
    open: s === 'open',
    answered: s === 'answered',
    closed: s === 'closed'
  };
};
const ticketSnippet = (t) => {
  const ai = String(t?.ai_summary || '').trim();
  const ans = String(t?.answer || '').trim();
  const q = String(t?.question || '').trim();
  const s = String(t?.status || '').toLowerCase();
  const src = ai || (s === 'answered' || s === 'closed' ? (ans || q) : q);
  if (!src) return '—';
  return src.length > 110 ? `${src.slice(0, 110)}…` : src;
};

const buildTree = (flat) => {
  const list = Array.isArray(flat) ? flat : [];
  const byId = new Map();
  for (const m of list) {
    byId.set(Number(m.id), { ...m, children: [] });
  }
  const roots = [];
  for (const m of byId.values()) {
    const pid = m.parent_message_id ? Number(m.parent_message_id) : null;
    if (pid && byId.has(pid)) {
      byId.get(pid).children.push(m);
    } else {
      roots.push(m);
    }
  }
  const sortRec = (nodes) => {
    nodes.sort((a, b) => {
      const at = new Date(a.created_at || 0).getTime();
      const bt = new Date(b.created_at || 0).getTime();
      if (at !== bt) return at - bt;
      return Number(a.id) - Number(b.id);
    });
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
};

const threadRoots = computed(() => buildTree(messages.value));

const setReplyTarget = (node) => {
  if (!node?.id) return;
  const fn = String(node.author_first_name || '').trim();
  const ln = String(node.author_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  const role = String(node.author_role || '').trim().replace(/_/g, ' ');
  const authorLabel = name || role || 'User';
  replyTo.value = { id: Number(node.id), authorLabel };
  nextTick(() => {
    try {
      composerEl.value?.focus?.();
    } catch {
      // ignore
    }
  });
};

const clearReplyTo = () => {
  replyTo.value = null;
};

const beginNewTicket = () => {
  creatingNewTicket.value = true;
  selectedTicketId.value = null;
  ticket.value = null;
  messages.value = [];
  replyTo.value = null;
  sendError.value = '';
  nextTick(() => {
    try {
      composerEl.value?.focus?.();
    } catch {
      // ignore
    }
  });
};

const cancelNewTicket = () => {
  creatingNewTicket.value = false;
  replyTo.value = null;
  sendError.value = '';
};

const loadTickets = async () => {
  if (!props.client?.id) return;
  loadingTickets.value = true;
  error.value = '';
  try {
    const r = await api.get('/support-tickets/client-tickets', {
      params: {
        schoolOrganizationId: Number(props.schoolOrganizationId),
        clientId: Number(props.client.id)
      }
    });
    const list = Array.isArray(r.data?.tickets) ? r.data.tickets : [];
    tickets.value = list;

    if (list.length === 0) {
      selectedTicketId.value = null;
      ticket.value = null;
      messages.value = [];
      return;
    }

    // Default selection: newest open/answered if present, else newest.
    const desired = selectedTicketId.value
      ? Number(selectedTicketId.value)
      : (list.find((t) => ['open', 'answered'].includes(String(t?.status || '').toLowerCase()))?.id || list[0].id);

    if (Number(desired) !== Number(selectedTicketId.value)) {
      await selectTicket(desired);
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load tickets';
    tickets.value = [];
    selectedTicketId.value = null;
    ticket.value = null;
    messages.value = [];
  } finally {
    loadingTickets.value = false;
  }
};

const loadMessagesForTicket = async (ticketId) => {
  const id = Number(ticketId);
  if (!id) return;
  loadingThread.value = true;
  error.value = '';
  try {
    const r = await api.get(`/support-tickets/${id}/messages`);
    ticket.value = r.data?.ticket || ticket.value;
    messages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
    await nextTick();
    try {
      const el = messagesEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {
      // ignore
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load messages';
    messages.value = [];
  } finally {
    loadingThread.value = false;
  }
};

const selectTicket = async (id) => {
  const nextId = Number(id);
  if (!nextId) return;
  selectedTicketId.value = nextId;
  creatingNewTicket.value = false;
  showFullThread.value = false;
  replyTo.value = null;
  sendError.value = '';

  // Prefer list copy first (instant header), then load thread details.
  const listCopy = (tickets.value || []).find((t) => Number(t?.id) === nextId) || null;
  if (listCopy) ticket.value = listCopy;
  await loadMessagesForTicket(nextId);

  // Keep the list copy in sync with server-returned ticket fields.
  try {
    if (ticket.value?.id) {
      const idx = (tickets.value || []).findIndex((t) => Number(t?.id) === Number(ticket.value.id));
      if (idx >= 0) {
        const next = [...tickets.value];
        next[idx] = { ...next[idx], ...ticket.value };
        tickets.value = next;
      }
    }
  } catch {
    // ignore
  }
};

const refreshSelected = async () => {
  if (!selectedTicketId.value) return;
  await loadMessagesForTicket(selectedTicketId.value);
};

const refreshAll = async () => {
  await loadTickets();
  if (selectedTicketId.value) await loadMessagesForTicket(selectedTicketId.value);
};

const deleteMessage = async (node) => {
  try {
    if (!ticket.value?.id || !node?.id) return;
    if (!window.confirm('Delete this message?')) return;
    await api.delete(`/support-tickets/${ticket.value.id}/messages/${node.id}`);
    await load();
  } catch (e) {
    const msg = e.response?.data?.error?.message || 'Failed to delete message';
    alert(msg);
  }
};

const send = async () => {
  if (!props.client?.id) return;
  const body = String(draft.value || '').trim();
  if (!body) return;
  sending.value = true;
  sendError.value = '';
  try {
    if (creatingNewTicket.value || !selectedTicketId.value || !ticket.value?.id) {
      const created = await api.post('/support-tickets', {
        schoolOrganizationId: Number(props.schoolOrganizationId),
        clientId: Number(props.client.id),
        subject: 'Client message',
        question: body
      });
      const createdTicket = created.data || null;
      // Refresh list and select the new ticket.
      await loadTickets();
      if (createdTicket?.id) {
        await selectTicket(createdTicket.id);
      } else {
        // best-effort: show something even if API returned minimal shape
        ticket.value = createdTicket;
      }
      draft.value = '';
      replyTo.value = null;
      creatingNewTicket.value = false;
      return;
    }

    const r = await api.post(`/support-tickets/${ticket.value.id}/messages`, {
      body,
      parentMessageId: replyTo.value?.id || null
    });
    // Endpoint returns updated thread payload
    ticket.value = r.data?.ticket || ticket.value;
    messages.value = Array.isArray(r.data?.messages) ? r.data.messages : messages.value;
    draft.value = '';
    replyTo.value = null;
    // Ensure we are showing the thread after activity.
    showFullThread.value = true;
    await nextTick();
    try {
      const el = messagesEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {
      // ignore
    }
  } catch (e) {
    sendError.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    sending.value = false;
  }
};

watch(
  () => props.client?.id,
  async () => {
    showFullThread.value = false;
    selectedTicketId.value = null;
    replyTo.value = null;
    creatingNewTicket.value = false;
    draft.value = '';
    tickets.value = [];
    ticket.value = null;
    messages.value = [];
    await loadTickets();
  }
);

onMounted(loadTickets);
</script>

<style scoped>
.ticket-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.content {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 12px;
  min-height: 0;
  min-width: 0;
}

.tickets {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 10px;
  min-width: 0;
}

.tickets-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.tickets-actions {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
}

.ticket-list {
  overflow: auto;
  min-height: 0;
  display: grid;
  gap: 8px;
  padding-right: 4px;
}

.ticket-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  padding: 10px;
  cursor: pointer;
  text-align: left;
  display: grid;
  gap: 6px;
}
.ticket-item.active {
  border-color: rgba(16, 185, 129, 0.45);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.10);
  background: white;
}
.ticket-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ticket-id {
  font-weight: 1000;
  letter-spacing: 0.02em;
}
.ticket-status,
.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ticket-status.open,
.status-pill.open {
  background: rgba(59, 130, 246, 0.10);
  border-color: rgba(59, 130, 246, 0.25);
}
.ticket-status.answered,
.status-pill.answered {
  background: rgba(245, 158, 11, 0.10);
  border-color: rgba(245, 158, 11, 0.25);
}
.ticket-status.closed,
.status-pill.closed {
  background: rgba(107, 114, 128, 0.10);
  border-color: rgba(107, 114, 128, 0.25);
}
.ticket-snippet {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.25;
  white-space: normal;
  overflow-wrap: anywhere;
}

.thread {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.thread-inner {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.thread-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.thread-header-left {
  display: inline-flex;
  gap: 10px;
  align-items: center;
}

.messages {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 2px 2px 2px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
}

.composer {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
}

.composer-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.new-ticket-banner {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.replying {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.replying-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  font-size: 12px;
  color: var(--text-secondary);
}

.textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
  color: var(--text-primary);
  resize: vertical;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.summary-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  padding: 10px 12px;
  margin-bottom: 10px;
  cursor: pointer;
  text-align: left;
}
.summary-card:hover {
  border-color: rgba(16, 185, 129, 0.35);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.10);
  background: white;
}

.summary-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  padding: 6px 0;
}

.label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}

.text {
  white-space: pre-wrap;
}

.summary-cta {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 800;
}

.btn-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.75rem;
}

.muted {
  color: var(--text-secondary);
}

.error {
  color: #c33;
  font-weight: 700;
}

.empty {
  color: var(--text-secondary);
  padding: 10px 2px 12px 2px;
}

@media (max-width: 900px) {
  .content {
    grid-template-columns: 1fr;
  }
}
</style>

