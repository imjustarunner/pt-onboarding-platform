<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <div class="header-left">
          <div class="title-row">
            <strong>Messages</strong>
            <span v-if="ticket" class="ticket-pill">
              #{{ ticket.id }} • {{ formatStatus(ticket.status) }}
            </span>
          </div>
          <div class="sub">
            <span class="muted">Client:</span>
            <span class="mono">{{ clientLabel }}</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">Close</button>
      </div>

      <div class="modal-body">
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
                @toggle="toggleExpanded"
                @reply="setReplyTarget"
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
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import SupportTicketThreadMessage from './SupportTicketThreadMessage.vue';

const props = defineProps({
  client: { type: Object, required: true },
  schoolOrganizationId: { type: Number, required: true },
  clientLabelMode: { type: String, default: 'codes' } // 'codes' | 'initials'
});

defineEmits(['close']);

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

const clientLabel = computed(() => {
  const initials = String(props.client?.initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(props.client?.identifier_code || '').replace(/\s+/g, '').toUpperCase();
  if (props.clientLabelMode === 'initials') return initials || code || '—';
  return code || initials || '—';
});

const isClosed = computed(() => String(ticket.value?.status || '').toLowerCase() === 'closed');

const formatStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'answered') return 'Answered';
  if (v === 'closed') return 'Closed';
  return 'Open';
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
    // Default: expand everything for now (nested collapses are opt-in)
    expanded.value = {};
    for (const m of messages.value || []) {
      expanded.value[String(m.id)] = true;
    }
    await nextTick();
    scrollToBottom();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load messages';
    ticket.value = null;
    messages.value = [];
  } finally {
    loading.value = false;
  }
};

const scrollToBottom = () => {
  const el = messagesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

const send = async () => {
  if (!props.client?.id) return;
  const body = String(draft.value || '').trim();
  if (!body) return;
  sending.value = true;
  sendError.value = '';
  try {
    // If no ticket exists yet, create it (client-scoped).
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
    await load();
  }
);

onMounted(load);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.modal {
  width: 920px;
  max-width: 96vw;
  max-height: 92vh;
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
  gap: 10px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ticket-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  font-size: 12px;
  color: var(--text-secondary);
}

.sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 6px;
  align-items: center;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 700;
}

.modal-body {
  flex: 1;
  min-height: 0;
  padding: 12px 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
}

.composer {
  border-top: 1px solid var(--border);
  padding: 12px 14px;
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
  margin-bottom: 10px;
}

.label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.text {
  white-space: pre-wrap;
}

.muted {
  color: var(--text-secondary);
}

.error {
  color: #b32727;
}

.empty {
  color: var(--text-secondary);
  padding: 18px 6px;
}

.btn-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
}
</style>

