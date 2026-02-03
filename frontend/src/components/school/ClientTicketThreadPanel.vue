<template>
  <div class="ticket-panel">
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="thread">
      <div v-if="!ticket" class="empty">
        No messages yet. Send a message below to start the ticket.
      </div>

      <div v-else>
        <div v-if="isClosed" class="closed-summary">
          <div class="summary-row">
            <div class="label">Question</div>
            <div class="text">{{ ticket.question || '—' }}</div>
          </div>
          <div v-if="ticket.ai_summary" class="summary-row">
            <div class="label">Quick answer</div>
            <div class="text">{{ ticket.ai_summary }}</div>
          </div>
          <div class="summary-row">
            <div class="label">Answer</div>
            <div class="text">{{ ticket.answer || '—' }}</div>
          </div>
          <button class="btn-link" type="button" @click="showFullThread = !showFullThread">
            {{ showFullThread ? 'Hide full thread' : 'Show full thread' }}
          </button>
        </div>

        <div v-if="!isClosed || showFullThread" class="messages" ref="messagesEl">
          <SupportTicketThreadMessage
            v-for="m in threadRoots"
            :key="m.id"
            :node="m"
            :depth="0"
            :expanded="expanded"
            :current-user-id="currentUserId"
            :current-user-role="currentUserRole"
            @toggle="toggleExpanded"
            @reply="setReplyTarget"
            @delete="deleteMessage"
          />
        </div>
      </div>
    </div>

    <div class="composer">
      <div class="composer-top">
        <strong>Send message</strong>
        <span v-if="ticket && isClosed" class="muted">Posting will reopen the ticket.</span>
      </div>
      <div v-if="replyTo" class="replying">
        <span class="replying-pill">Replying to {{ replyTo.authorLabel }}</span>
        <button class="btn-link" type="button" @click="clearReplyTo">Clear</button>
      </div>
      <textarea
        v-model="draft"
        class="textarea"
        rows="3"
        placeholder="Type your message…"
        ref="composerEl"
      />
      <div class="composer-actions">
        <button class="btn btn-primary" type="button" @click="send" :disabled="sending || !draft.trim()">
          {{ sending ? 'Sending…' : 'Send message' }}
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

const loading = ref(false);
const error = ref('');
const ticket = ref(null);
const messages = ref([]);

const draft = ref('');
const sending = ref(false);
const sendError = ref('');

const showFullThread = ref(false);
const expanded = ref({}); // messageId -> boolean
const messagesEl = ref(null);
const composerEl = ref(null);

const replyTo = ref(null); // { id, authorLabel }

const isClosed = computed(() => String(ticket.value?.status || '').toLowerCase() === 'closed');

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

const toggleExpanded = (id) => {
  const key = String(id);
  expanded.value[key] = !expanded.value[key];
};

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

const load = async () => {
  if (!props.client?.id) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/support-tickets/client-thread', {
      params: {
        schoolOrganizationId: Number(props.schoolOrganizationId),
        clientId: Number(props.client.id)
      }
    });
    ticket.value = r.data?.ticket || null;
    messages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
    expanded.value = {};
    for (const m of messages.value || []) expanded.value[String(m.id)] = true;
    await nextTick();
    try {
      const el = messagesEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {
      // ignore
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load messages';
    ticket.value = null;
    messages.value = [];
  } finally {
    loading.value = false;
  }
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
    if (!ticket.value?.id) {
      const created = await api.post('/support-tickets', {
        schoolOrganizationId: Number(props.schoolOrganizationId),
        clientId: Number(props.client.id),
        subject: 'Client message',
        question: body
      });
      ticket.value = created.data || null;
      draft.value = '';
      replyTo.value = null;
      await load();
      return;
    }

    await api.post(`/support-tickets/${ticket.value.id}/messages`, {
      body,
      parentMessageId: replyTo.value?.id || null
    });
    draft.value = '';
    replyTo.value = null;
    await load();
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
    replyTo.value = null;
    draft.value = '';
    await load();
  }
);

onMounted(load);
</script>

<style scoped>
.ticket-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.thread {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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

.closed-summary {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  padding: 10px 12px;
  margin-bottom: 10px;
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
</style>

