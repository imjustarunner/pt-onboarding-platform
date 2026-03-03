<template>
  <div class="messages-panel" data-tour="school-messages-panel">
    <div class="panel-header">
      <div>
        <h2 style="margin: 0;">Messages</h2>
        <p class="subtitle">Chat with providers and school staff. Questions to admin appear here too.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary btn-sm" type="button" @click="showNewChat = true" :disabled="loading">
          New message
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="loadAll" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="totalUnread > 0" class="unread-banner">
      <span class="unread-dot" aria-hidden="true"></span>
      You have {{ totalUnread }} unread message{{ totalUnread !== 1 ? 's' : '' }}. Go to a thread to read.
    </div>

    <div class="grid">
      <div class="threads-card">
        <div class="card-title">Threads</div>
        <div v-if="loading && !threads.length" class="muted">Loading…</div>
        <div v-else-if="!threads.length && !tickets.length" class="muted">
          No messages yet. Send a message to a provider, school staff, or admin.
        </div>
        <button
          v-for="item in allItems"
          :key="item.key"
          class="thread"
          :class="{ active: selectedKey === item.key }"
          type="button"
          @click="selectItem(item)"
        >
          <div class="thread-top">
            <div class="thread-name">{{ item.label }}</div>
            <span v-if="item.unread_count" class="pill">{{ item.unread_count }}</span>
          </div>
          <div class="thread-preview">{{ item.preview }}</div>
          <div class="thread-meta">{{ item.meta }}</div>
        </button>
      </div>

      <div class="messages-card">
        <div v-if="!selectedKey" class="empty-select">
          Select a thread to view messages, or start a new one.
        </div>
        <template v-else>
          <div class="card-title title-row">
            <span class="title-row-label">{{ selectedLabel }}</span>
            <button
              v-if="selectedType === 'chat'"
              class="btn btn-danger btn-sm"
              type="button"
              @click="deleteThread"
              :disabled="sending || messagesLoading"
            >
              Delete thread
            </button>
          </div>
          <div v-if="messagesLoading" class="muted">Loading…</div>
          <div v-else-if="messagesError" class="error">{{ messagesError }}</div>
          <div v-else class="bubble-list" ref="messagesEl">
            <div
              v-for="m in displayMessages"
              :key="m.id"
              class="bubble-row"
              :class="{ mine: m.isMine }"
            >
              <div class="bubble">
                <div class="meta">
                  <span>{{ m.senderName }}</span>
                  <span>
                    {{ formatTime(m.created_at) }}
                    <span v-if="selectedType === 'chat' && m.isMine" class="receipt">{{ m.is_read_by_other ? '✓✓' : '✓' }}</span>
                    <template v-if="selectedType === 'chat'">
                      <button
                        v-if="m.isMine && !m.is_read_by_other"
                        class="msg-action"
                        type="button"
                        @click="unsend(m)"
                        :disabled="sending"
                        title="Unsend (only before read)"
                      >
                        Unsend
                      </button>
                      <button
                        class="msg-action"
                        type="button"
                        @click="deleteForMe(m)"
                        :disabled="sending"
                        title="Delete for me"
                      >
                        Delete
                      </button>
                    </template>
                  </span>
                </div>
                <div class="text">{{ m.body }}</div>
              </div>
            </div>
          </div>

          <div class="composer">
            <textarea v-model="draft" rows="3" placeholder="Type a message…" />
            <div class="actions">
              <button class="btn btn-primary" @click="send" :disabled="sending || !draft.trim()">
                {{ sending ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div v-if="showNewChat" class="modal-overlay" @click.self="closeNewChat">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>New message</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeNewChat">Close</button>
        </div>
        <div class="modal-body">
          <div v-if="newChatError" class="error mb">{{ newChatError }}</div>
          <div class="new-chat-type">
            <button type="button" class="type-btn" :class="{ active: newChatType === 'provider' }" @click="newChatType = 'provider'">
              Message a provider
            </button>
            <button type="button" class="type-btn" :class="{ active: newChatType === 'staff' }" @click="newChatType = 'staff'">
              Message school staff
            </button>
            <button type="button" class="type-btn" :class="{ active: newChatType === 'admin' }" @click="newChatType = 'admin'">
              Message admin
            </button>
          </div>
          <div v-if="newChatType === 'provider'" class="picker-list">
            <div v-if="providersLoading" class="muted">Loading providers…</div>
            <button
              v-else
              v-for="p in providers"
              :key="p.provider_user_id"
              class="picker-item"
              type="button"
              @click="startChatWithProvider(p)"
            >
              {{ p.first_name }} {{ p.last_name }}
            </button>
          </div>
          <div v-if="newChatType === 'staff'" class="picker-list">
            <div v-if="staffLoading" class="muted">Loading school staff…</div>
            <div v-else-if="!staff.length" class="muted">No other school staff at this school.</div>
            <button
              v-else
              v-for="s in staff"
              :key="s.id"
              class="picker-item"
              type="button"
              @click="startChatWithStaff(s)"
            >
              {{ [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email }}
              <span v-if="s.is_primary" class="badge-sm">Primary</span>
            </button>
          </div>
          <div v-if="newChatType === 'admin'" class="new-ticket-form">
            <label>Subject (optional)</label>
            <input v-model="newTicketSubject" type="text" placeholder="e.g., Scheduling question" />
            <label>Message</label>
            <textarea v-model="newTicketBody" rows="4" placeholder="What do you need help with?" />
            <button class="btn btn-primary" type="button" @click="createTicket" :disabled="creatingTicket || !newTicketBody.trim()">
              {{ creatingTicket ? 'Sending…' : 'Send to admin' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  providers: { type: Array, default: () => [] },
  providersLoading: { type: Boolean, default: false }
});

const emit = defineEmits(['unread-update']);

const authStore = useAuthStore();
const meId = computed(() => authStore.user?.id);

const loading = ref(false);
const threads = ref([]);
const tickets = ref([]);
const selectedKey = ref(null);
const selectedType = ref(null); // 'chat' | 'ticket'
const messagesLoading = ref(false);
const messagesError = ref('');
const chatMessages = ref([]);
const ticketData = ref(null);
const draft = ref('');
const sending = ref(false);
const messagesEl = ref(null);
const showNewChat = ref(false);
const newChatType = ref('provider');
const newTicketSubject = ref('');
const newTicketBody = ref('');
const creatingTicket = ref(false);
const staff = ref([]);
const staffLoading = ref(false);
const newChatError = ref('');

const allItems = computed(() => {
  const items = [];
  const orgId = Number(props.schoolOrganizationId);
  const schoolThreads = (threads.value || []).filter(
    (t) =>
      orgId &&
      (Number(t.agency_id) === orgId || Number(t.organization_id) === orgId)
  );
  for (const t of schoolThreads) {
    const other = t.other_participant;
    const label = other ? `${other.first_name || ''} ${other.last_name || ''}`.trim() || other.email || 'Unknown' : 'Unknown';
    const role = other?.role?.toLowerCase?.() || '';
    const roleLabel = role === 'provider' ? 'Provider' : role === 'school_staff' ? 'Staff' : '';
    items.push({
      key: `chat-${t.thread_id}`,
      type: 'chat',
      thread_id: t.thread_id,
      label: roleLabel ? `${label} (${roleLabel})` : label,
      preview: (t.last_message?.body || 'No messages yet.').slice(0, 100),
      meta: t.updated_at ? formatTime(t.updated_at) : '',
      sortAt: t.updated_at || t.last_message?.created_at || null,
      unread_count: t.unread_count || 0
    });
  }
  for (const t of tickets.value || []) {
    const sortAt = t.updated_at || t.created_at;
    items.push({
      key: `ticket-${t.id}`,
      type: 'ticket',
      ticket_id: t.id,
      label: `Admin: ${t.subject || 'Question'}`,
      preview: (t.question || '').slice(0, 100),
      meta: sortAt ? formatTime(sortAt) : '',
      sortAt,
      unread_count: 0
    });
  }
  return items.sort((a, b) => {
    const aTime = a.sortAt ? new Date(a.sortAt).getTime() : 0;
    const bTime = b.sortAt ? new Date(b.sortAt).getTime() : 0;
    return (bTime || 0) - (aTime || 0);
  });
});

const schoolThreadsForUnread = computed(() => {
  const orgId = Number(props.schoolOrganizationId);
  return (threads.value || []).filter(
    (t) => orgId && (Number(t.agency_id) === orgId || Number(t.organization_id) === orgId)
  );
});
const totalUnread = computed(() =>
  schoolThreadsForUnread.value.reduce((s, t) => s + (t.unread_count || 0), 0)
);

const selectedLabel = computed(() => {
  const item = allItems.value.find((i) => i.key === selectedKey.value);
  return item?.label || '';
});

const displayMessages = computed(() => {
  if (selectedType.value === 'chat') {
    return (chatMessages.value || []).map((m) => ({
      ...m,
      isMine: Number(m.sender_user_id) === Number(meId.value),
      senderName: `${m.sender_first_name || ''} ${m.sender_last_name || ''}`.trim() || 'Unknown',
      is_read_by_other: m.is_read_by_other
    }));
  }
  if (selectedType.value === 'ticket' && ticketData.value) {
    const list = [];
    const t = ticketData.value.ticket;
    if (t?.question) {
      list.push({
        id: 'q',
        body: t.question,
        created_at: t.created_at,
        isMine: true,
        senderName: 'You'
      });
    }
    if (t?.answer) {
      list.push({
        id: 'a',
        body: t.answer,
        created_at: t.answered_at || t.updated_at,
        isMine: false,
        senderName: 'Admin'
      });
    }
    for (const m of ticketData.value.messages || []) {
      const isMine = Number(m.author_user_id) === Number(meId.value);
      list.push({
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        isMine,
        senderName: isMine ? 'You' : 'Admin'
      });
    }
    return list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  return [];
});

const loadThreads = async () => {
  try {
    const resp = await api.get('/chat/threads', { skipGlobalLoading: true });
    threads.value = resp.data || [];
  } catch {
    threads.value = [];
  }
};

const loadTickets = async () => {
  try {
    const resp = await api.get('/support-tickets/mine');
    tickets.value = (resp.data || []).filter((t) => Number(t.school_organization_id) === Number(props.schoolOrganizationId));
  } catch {
    tickets.value = [];
  }
};

const loadStaff = async () => {
  if (!props.schoolOrganizationId) return;
  try {
    staffLoading.value = true;
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/school-staff`);
    staff.value = (r.data || []).filter((s) => Number(s.id) !== Number(meId.value));
  } catch {
    staff.value = [];
  } finally {
    staffLoading.value = false;
  }
};

const loadAll = async () => {
  loading.value = true;
  await Promise.all([loadThreads(), loadTickets()]);
  loading.value = false;
};

const loadChatMessages = async () => {
  if (!selectedKey.value || !selectedKey.value.startsWith('chat-')) return;
  const threadId = parseInt(selectedKey.value.replace('chat-', ''), 10);
  if (!threadId) return;
  try {
    messagesLoading.value = true;
    messagesError.value = '';
    const resp = await api.get(`/chat/threads/${threadId}/messages`, { params: { limit: 200 } });
    chatMessages.value = resp.data || [];
    const last = chatMessages.value[chatMessages.value.length - 1];
    if (last?.id) {
      api.post(`/chat/threads/${threadId}/read`, { lastReadMessageId: last.id }, { skipGlobalLoading: true }).catch(() => {});
      loadThreads().catch(() => {});
    }
    await scrollToBottom();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    messagesLoading.value = false;
  }
};

const loadTicketMessages = async () => {
  if (!selectedKey.value || !selectedKey.value.startsWith('ticket-')) return;
  const ticketId = parseInt(selectedKey.value.replace('ticket-', ''), 10);
  if (!ticketId) return;
  try {
    messagesLoading.value = true;
    messagesError.value = '';
    const resp = await api.get(`/support-tickets/${ticketId}/messages`);
    ticketData.value = resp.data || { ticket: null, messages: [] };
    await scrollToBottom();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    messagesLoading.value = false;
  }
};

const selectItem = async (item) => {
  selectedKey.value = item.key;
  selectedType.value = item.type;
  chatMessages.value = [];
  ticketData.value = null;
  draft.value = '';
  if (item.type === 'chat') {
    await loadChatMessages();
  } else {
    await loadTicketMessages();
  }
};

const scrollToBottom = async () => {
  await nextTick();
  const el = messagesEl.value;
  if (el) el.scrollTop = el.scrollHeight;
};

const activeThreadId = computed(() => {
  if (!selectedKey.value || !selectedKey.value.startsWith('chat-')) return null;
  return parseInt(selectedKey.value.replace('chat-', ''), 10);
});

const deleteThread = async () => {
  const tid = activeThreadId.value;
  if (!tid) return;
  if (!window.confirm('Delete this thread for you? The other person will still have it.')) return;
  try {
    sending.value = true;
    messagesError.value = '';
    await api.post(`/chat/threads/${tid}/delete-for-me`, {}, { skipGlobalLoading: true });
    selectedKey.value = null;
    selectedType.value = null;
    chatMessages.value = [];
    await loadThreads();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to delete thread';
  } finally {
    sending.value = false;
  }
};

const unsend = async (m) => {
  const tid = activeThreadId.value;
  if (!tid || !m?.id) return;
  if (Number(m.sender_user_id) !== Number(meId.value)) return;
  if (m.is_read_by_other) return;
  try {
    sending.value = true;
    messagesError.value = '';
    await api.delete(`/chat/threads/${tid}/messages/${m.id}`, { skipGlobalLoading: true });
    await loadChatMessages();
    await loadThreads();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to unsend message';
  } finally {
    sending.value = false;
  }
};

const deleteForMe = async (m) => {
  const tid = activeThreadId.value;
  if (!tid || !m?.id) return;
  try {
    sending.value = true;
    messagesError.value = '';
    await api.post(`/chat/threads/${tid}/messages/${m.id}/delete-for-me`, {}, { skipGlobalLoading: true });
    await loadChatMessages();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to delete message';
  } finally {
    sending.value = false;
  }
};

const send = async () => {
  const body = draft.value.trim();
  if (!body) return;
  if (selectedType.value === 'chat') {
    const threadId = parseInt(selectedKey.value.replace('chat-', ''), 10);
    if (!threadId) return;
    try {
      sending.value = true;
      draft.value = '';
      await api.post(`/chat/threads/${threadId}/messages`, { body });
      await loadChatMessages();
      await loadThreads();
    } catch (e) {
      messagesError.value = e.response?.data?.error?.message || 'Failed to send';
    } finally {
      sending.value = false;
    }
  } else if (selectedType.value === 'ticket') {
    const ticketId = parseInt(selectedKey.value.replace('ticket-', ''), 10);
    if (!ticketId) return;
    try {
      sending.value = true;
      draft.value = '';
      await api.post(`/support-tickets/${ticketId}/messages`, { body });
      await loadTicketMessages();
      await loadTickets();
    } catch (e) {
      messagesError.value = e.response?.data?.error?.message || 'Failed to send';
    } finally {
      sending.value = false;
    }
  }
};

const startChatWithProvider = async (p) => {
  try {
    const aff = await api.get(`/school-portal/${props.schoolOrganizationId}/affiliation`);
    const agencyId = aff.data?.active_agency_id ? Number(aff.data.active_agency_id) : null;
    if (!agencyId) {
      newChatError.value = 'No active agency affiliation.';
      return;
    }
    const r = await api.post('/chat/threads/direct', {
      agencyId,
      organizationId: Number(props.schoolOrganizationId),
      otherUserId: Number(p.provider_user_id)
    });
    closeNewChat();
    await loadThreads();
    const item = allItems.value.find((i) => i.type === 'chat' && i.thread_id === r.data?.threadId);
    if (item) await selectItem(item);
  } catch (e) {
    newChatError.value = e.response?.data?.error?.message || 'Failed to start chat';
  }
};

const startChatWithStaff = async (s) => {
  try {
    const r = await api.post('/chat/threads/direct', {
      agencyId: Number(props.schoolOrganizationId),
      otherUserId: Number(s.id)
    });
    closeNewChat();
    await loadThreads();
    const item = allItems.value.find((i) => i.type === 'chat' && i.thread_id === r.data?.threadId);
    if (item) await selectItem(item);
  } catch (e) {
    newChatError.value = e.response?.data?.error?.message || 'Failed to start chat';
  }
};

const createTicket = async () => {
  const body = newTicketBody.value.trim();
  if (!body) return;
  try {
    creatingTicket.value = true;
    const resp = await api.post('/support-tickets', {
      schoolOrganizationId: props.schoolOrganizationId,
      subject: newTicketSubject.value.trim() || null,
      question: body
    });
    newTicketSubject.value = '';
    newTicketBody.value = '';
    closeNewChat();
    await loadTickets();
    const created = resp.data;
    if (created?.id) {
      await selectItem({ key: `ticket-${created.id}`, type: 'ticket', ticket_id: created.id });
    }
  } catch (e) {
    newChatError.value = e.response?.data?.error?.message || 'Failed to send';
  } finally {
    creatingTicket.value = false;
  }
};

const closeNewChat = () => {
  showNewChat.value = false;
  newChatType.value = 'provider';
  newTicketSubject.value = '';
  newTicketBody.value = '';
  newChatError.value = '';
};

const formatTime = (d) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return '';
  }
};

watch(totalUnread, (n) => emit('unread-update', n), { immediate: true });

onMounted(() => {
  loadAll();
});

watch(
  () => props.schoolOrganizationId,
  (newId, oldId) => {
    if (Number(newId) !== Number(oldId)) {
      selectedKey.value = null;
      selectedType.value = null;
    }
    loadAll();
  }
);

watch(showNewChat, (open) => {
  if (open && newChatType.value === 'staff') loadStaff();
});
watch(newChatType, (type) => {
  if (type === 'staff') loadStaff();
});

watch(
  () => allItems.value,
  (items) => {
    if (selectedKey.value && !items.some((i) => i.key === selectedKey.value)) {
      selectedKey.value = null;
      selectedType.value = null;
    }
  },
  { deep: true }
);
</script>

<style scoped>
.messages-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.header-actions {
  display: flex;
  gap: 8px;
}
.unread-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--primary-light, #e8f4fd);
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-primary);
}
.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary, #0d6efd);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 12px;
  min-height: 400px;
}
.threads-card,
.messages-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.card-title {
  font-weight: 700;
  margin-bottom: 10px;
}
.thread {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  margin-bottom: 4px;
}
.thread:hover {
  background: var(--bg);
}
.thread.active {
  background: var(--primary-light, #e8f4fd);
}
.thread-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.thread-name {
  font-weight: 600;
  font-size: 14px;
}
.pill {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--primary);
  color: white;
}
.thread-preview {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thread-meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.empty-select {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-secondary);
}
.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.title-row-label {
  flex: 1;
  min-width: 0;
}
.bubble-list {
  flex: 1;
  overflow-y: auto;
  max-height: 360px;
  padding: 8px 0;
}
.bubble-row {
  margin-bottom: 12px;
}
.bubble-row.mine .bubble {
  margin-left: 24px;
  background: var(--primary-light, #e8f4fd);
}
.bubble {
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--bg);
  max-width: 85%;
}
.bubble .meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.bubble .text {
  white-space: pre-wrap;
}
.receipt {
  margin-left: 6px;
  font-weight: 700;
  color: rgba(16, 185, 129, 0.9);
}
.msg-action {
  margin-left: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.msg-action:hover {
  color: var(--text-primary);
  text-decoration: underline;
}
.msg-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.composer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.composer textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  resize: vertical;
  margin-bottom: 8px;
}
.composer .actions {
  display: flex;
  justify-content: flex-end;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 480px;
  max-width: 95vw;
  max-height: 90vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
}
.modal-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-body {
  padding: 16px;
  overflow-y: auto;
}
.new-chat-type {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.type-btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  cursor: pointer;
  font-size: 13px;
}
.type-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
}
.picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  cursor: pointer;
  text-align: left;
}
.picker-item:hover {
  background: var(--bg);
}
.badge-sm {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--primary-light);
  color: var(--primary);
}
.new-ticket-form label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  margin-top: 12px;
}
.new-ticket-form input,
.new-ticket-form textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
}
.new-ticket-form textarea {
  resize: vertical;
  min-height: 100px;
}
.error {
  color: #c33;
  font-size: 13px;
}
.mb {
  margin-bottom: 12px;
}
.muted {
  color: var(--text-secondary);
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
