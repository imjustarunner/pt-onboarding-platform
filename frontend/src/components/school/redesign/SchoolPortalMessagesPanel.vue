<template>
  <div class="spm">
    <!-- ── Header ── -->
    <div class="spm__header">
      <div>
        <h2 class="spm__title">Messages</h2>
        <p class="spm__sub">Chat with providers and school staff, or send a question to our admin team.</p>
      </div>
      <div class="spm__header-actions">
        <button class="spm-btn spm-btn--primary" type="button" @click="openNewChat" :disabled="loading">
          + New message
        </button>
        <button class="spm-btn spm-btn--ghost" type="button" @click="loadAll" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- ── Unread banner ── -->
    <div v-if="totalUnread > 0" class="spm__unread-banner">
      <span class="spm__unread-dot" aria-hidden="true"></span>
      {{ totalUnread }} unread message{{ totalUnread !== 1 ? 's' : '' }} — select a thread below to read.
    </div>

    <!-- ── Main grid ── -->
    <div class="spm__grid">

      <!-- Left: thread list -->
      <div class="spm__threads">
        <div class="spm__section-label">Conversations</div>
        <div v-if="loading && !allItems.length" class="spm__muted spm__muted--pad">Loading…</div>
        <div v-else-if="!allItems.length" class="spm__empty-threads">
          <div class="spm__empty-icon">💬</div>
          <div>No conversations yet.</div>
          <div class="spm__muted">Tap "+ New message" to start one.</div>
        </div>
        <button
          v-for="item in allItems"
          :key="item.key"
          class="spm__thread"
          :class="{ 'spm__thread--active': selectedKey === item.key }"
          type="button"
          @click="selectItem(item)"
        >
          <div class="spm__thread-avatar" :class="`spm__thread-avatar--${item.avatarColor}`">
            {{ item.initials }}
          </div>
          <div class="spm__thread-body">
            <div class="spm__thread-top">
              <span class="spm__thread-name">{{ item.label }}</span>
              <span v-if="item.unread_count" class="spm__pill">{{ item.unread_count }}</span>
            </div>
            <div class="spm__thread-preview">{{ item.preview }}</div>
          </div>
          <div class="spm__thread-time">{{ item.relTime }}</div>
        </button>
      </div>

      <!-- Right: message pane -->
      <div class="spm__pane">
        <div v-if="!selectedKey" class="spm__pane-empty">
          <div class="spm__pane-empty-icon">✉️</div>
          <div>Select a conversation or start a new one.</div>
        </div>
        <template v-else>
          <div class="spm__pane-header">
            <div class="spm__pane-title">
              <span>{{ selectedLabel }}</span>
              <span v-if="selectedRoleTag" class="spm__role-tag">{{ selectedRoleTag }}</span>
            </div>
            <button
              v-if="selectedType === 'chat'"
              class="spm-btn spm-btn--danger-ghost spm-btn--sm"
              type="button"
              @click="deleteThread"
              :disabled="sending || messagesLoading"
            >
              Delete thread
            </button>
          </div>

          <div v-if="messagesLoading" class="spm__muted spm__muted--pad">Loading messages…</div>
          <div v-else-if="messagesError" class="spm__error spm__error--pad">{{ messagesError }}</div>
          <div v-else class="spm__bubbles" ref="messagesEl">
            <div v-if="!displayMessages.length" class="spm__muted spm__muted--center">
              No messages yet. Say hello!
            </div>
            <div
              v-for="m in displayMessages"
              :key="m.id"
              class="spm__bubble-row"
              :class="{ 'spm__bubble-row--mine': m.isMine }"
            >
              <div class="spm__bubble">
                <div class="spm__bubble-meta">
                  <span class="spm__bubble-sender">{{ m.senderName }}</span>
                  <span class="spm__bubble-time">{{ formatTime(m.created_at) }}</span>
                  <template v-if="selectedType === 'chat' && m.isMine">
                    <span class="spm__receipt">{{ m.is_read_by_other ? '✓✓' : '✓' }}</span>
                    <button
                      v-if="!m.is_read_by_other"
                      class="spm__msg-action"
                      type="button"
                      @click="unsend(m)"
                      :disabled="sending"
                    >Unsend</button>
                  </template>
                </div>
                <div class="spm__bubble-text">{{ m.body }}</div>
              </div>
            </div>
          </div>

          <div class="spm__composer" v-if="!messagesLoading">
            <textarea
              v-model="draft"
              class="spm__composer-input"
              rows="3"
              :placeholder="selectedType === 'ticket' ? 'Type a follow-up…' : 'Type a message…'"
              @keydown.ctrl.enter.prevent="send"
              @keydown.meta.enter.prevent="send"
            />
            <div class="spm__composer-footer">
              <span class="spm__composer-hint">Ctrl+Enter to send</span>
              <button
                class="spm-btn spm-btn--primary"
                type="button"
                @click="send"
                :disabled="sending || !draft.trim()"
              >
                {{ sending ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ══════════ New message modal ══════════ -->
    <div v-if="showNewChat" class="spm__overlay" @click.self="closeNewChat">
      <div class="spm__modal">
        <div class="spm__modal-header">
          <strong>New message</strong>
          <button class="spm-btn spm-btn--ghost spm-btn--sm" type="button" @click="closeNewChat">✕ Close</button>
        </div>
        <div class="spm__modal-body">
          <!-- Error -->
          <div v-if="newChatError" class="spm__error spm__error--banner">{{ newChatError }}</div>

          <!-- Tabs -->
          <div class="spm__tabs">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="spm__tab"
              :class="{ 'spm__tab--active': newChatType === tab.key }"
              type="button"
              @click="newChatType = tab.key; newChatError = ''"
            >{{ tab.label }}</button>
          </div>

          <!-- Provider picker -->
          <div v-if="newChatType === 'provider'" class="spm__picker">
            <p class="spm__picker-hint">Select a clinician assigned to your school to start a direct message.</p>
            <div v-if="providersLoading" class="spm__muted">Loading providers…</div>
            <div v-else-if="!providers.length" class="spm__muted">No providers currently assigned to this school.</div>
            <button
              v-else
              v-for="p in providers"
              :key="p.provider_user_id"
              class="spm__pick-item"
              type="button"
              @click="startChatWithProvider(p)"
              :disabled="startingChat"
            >
              <div class="spm__pick-avatar">{{ providerInitials(p) }}</div>
              <div>
                <div class="spm__pick-name">{{ [p.first_name, p.last_name].filter(Boolean).join(' ') }}</div>
                <div class="spm__pick-role">Provider</div>
              </div>
            </button>
          </div>

          <!-- School staff picker -->
          <div v-if="newChatType === 'staff'" class="spm__picker">
            <p class="spm__picker-hint">Send a direct message to another staff member at your school.</p>
            <div v-if="staffLoading" class="spm__muted">Loading staff…</div>
            <div v-else-if="!staff.length" class="spm__muted">No other school staff found.</div>
            <button
              v-else
              v-for="s in staff"
              :key="s.id"
              class="spm__pick-item"
              type="button"
              @click="startChatWithStaff(s)"
              :disabled="startingChat"
            >
              <div class="spm__pick-avatar spm__pick-avatar--staff">{{ staffInitials(s) }}</div>
              <div>
                <div class="spm__pick-name">{{ [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email }}</div>
                <div class="spm__pick-role">School Staff<span v-if="s.is_primary"> · Primary</span></div>
              </div>
            </button>
          </div>

          <!-- Admin message (ticket) -->
          <div v-if="newChatType === 'admin'" class="spm__ticket-form">
            <p class="spm__picker-hint">
              Send a question or request to our team. We'll reply as soon as we can. For urgent matters, call us directly.
            </p>
            <label class="spm__label">Topic</label>
            <select v-model="newTicketTopic" class="spm__select">
              <option v-for="t in schoolTicketTopics" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
            <label class="spm__label">Subject <span class="spm__opt">(optional)</span></label>
            <input v-model="newTicketSubject" class="spm__input" type="text" placeholder="e.g., Scheduling question" />
            <label class="spm__label">Message</label>
            <textarea v-model="newTicketBody" class="spm__textarea" rows="4" placeholder="What do you need help with?" />
            <button
              class="spm-btn spm-btn--primary spm-btn--full"
              type="button"
              @click="createTicket"
              :disabled="creatingTicket || !newTicketBody.trim()"
            >
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
import { GUARDIAN_TICKET_TOPICS } from '../../../utils/ticketTopics';

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
const selectedType = ref(null);
const messagesLoading = ref(false);
const messagesError = ref('');
const chatMessages = ref([]);
const ticketData = ref(null);
const draft = ref('');
const sending = ref(false);
const startingChat = ref(false);
const messagesEl = ref(null);
const showNewChat = ref(false);
const newChatType = ref('provider');
const newTicketSubject = ref('');
const newTicketBody = ref('');
const newTicketTopic = ref('general');
const schoolTicketTopics = GUARDIAN_TICKET_TOPICS;
const creatingTicket = ref(false);
const staff = ref([]);
const staffLoading = ref(false);
const newChatError = ref('');

const tabs = [
  { key: 'provider', label: 'Message a provider' },
  { key: 'staff', label: 'Message school staff' },
  { key: 'admin', label: 'Message admin' }
];

const AVATAR_COLORS = ['teal', 'indigo', 'amber', 'rose', 'sky'];
function avatarColor(label) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(label) {
  const parts = String(label || '?').trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : String(label || '?')[0].toUpperCase();
}

const allItems = computed(() => {
  const items = [];
  const orgId = Number(props.schoolOrganizationId);
  const schoolThreads = (threads.value || []).filter(
    (t) => orgId && (Number(t.agency_id) === orgId || Number(t.organization_id) === orgId)
  );
  for (const t of schoolThreads) {
    const other = t.other_participant;
    const name = other ? `${other.first_name || ''} ${other.last_name || ''}`.trim() || other.email || 'Unknown' : 'Unknown';
    const role = other?.role?.toLowerCase?.() || '';
    const roleLabel = role === 'provider' ? 'Provider' : role === 'school_staff' ? 'Staff' : '';
    const label = roleLabel ? `${name} (${roleLabel})` : name;
    items.push({
      key: `chat-${t.thread_id}`,
      type: 'chat',
      thread_id: t.thread_id,
      label,
      initials: initials(name),
      avatarColor: avatarColor(name),
      preview: (t.last_message?.body || 'No messages yet.').slice(0, 80),
      sortAt: t.updated_at || t.last_message?.created_at || null,
      relTime: relativeTime(t.updated_at || t.last_message?.created_at),
      unread_count: t.unread_count || 0
    });
  }
  for (const t of tickets.value || []) {
    const sortAt = t.updated_at || t.created_at;
    items.push({
      key: `ticket-${t.id}`,
      type: 'ticket',
      ticket_id: t.id,
      label: t.subject || 'Admin question',
      initials: 'AD',
      avatarColor: 'indigo',
      preview: (t.question || '').slice(0, 80),
      sortAt,
      relTime: relativeTime(sortAt),
      unread_count: 0
    });
  }
  return items.sort((a, b) => {
    const aT = a.sortAt ? new Date(a.sortAt).getTime() : 0;
    const bT = b.sortAt ? new Date(b.sortAt).getTime() : 0;
    return bT - aT;
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

const selectedItem = computed(() => allItems.value.find((i) => i.key === selectedKey.value) || null);
const selectedLabel = computed(() => {
  const item = selectedItem.value;
  if (!item) return '';
  if (item.type === 'ticket') return item.label;
  // strip the role tag for the pane title since we show it separately
  return item.label.replace(/\s*\((Provider|Staff|Admin)\)$/, '');
});
const selectedRoleTag = computed(() => {
  const item = selectedItem.value;
  if (!item || item.type !== 'chat') return null;
  const m = item.label.match(/\((Provider|Staff|Admin)\)$/);
  return m ? m[1] : null;
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
      list.push({ id: 'q', body: t.question, created_at: t.created_at, isMine: true, senderName: 'You' });
    }
    if (t?.answer) {
      list.push({ id: 'a', body: t.answer, created_at: t.answered_at || t.updated_at, isMine: false, senderName: 'Admin' });
    }
    for (const m of ticketData.value.messages || []) {
      const isMine = Number(m.author_user_id) === Number(meId.value);
      list.push({ id: m.id, body: m.body, created_at: m.created_at, isMine, senderName: isMine ? 'You' : 'Admin' });
    }
    return list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  return [];
});

// ── Data loaders ───────────────────────────────────────────────
const loadThreads = async () => {
  try {
    const resp = await api.get('/chat/threads', { skipGlobalLoading: true });
    threads.value = resp.data || [];
  } catch { threads.value = []; }
};

const loadTickets = async () => {
  try {
    const resp = await api.get('/support-tickets/mine');
    tickets.value = (resp.data || []).filter(
      (t) => Number(t.school_organization_id) === Number(props.schoolOrganizationId)
    );
  } catch { tickets.value = []; }
};

const loadStaff = async () => {
  if (!props.schoolOrganizationId) return;
  try {
    staffLoading.value = true;
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/school-staff`);
    staff.value = (r.data || []).filter((s) => Number(s.id) !== Number(meId.value));
  } catch { staff.value = []; }
  finally { staffLoading.value = false; }
};

const loadAll = async () => {
  loading.value = true;
  await Promise.all([loadThreads(), loadTickets()]);
  loading.value = false;
};

// ── Message loading ────────────────────────────────────────────
const loadChatMessages = async () => {
  if (!selectedKey.value?.startsWith('chat-')) return;
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
    messagesError.value = e.response?.data?.error?.message || 'Failed to load messages.';
  } finally { messagesLoading.value = false; }
};

const loadTicketMessages = async () => {
  if (!selectedKey.value?.startsWith('ticket-')) return;
  const ticketId = parseInt(selectedKey.value.replace('ticket-', ''), 10);
  if (!ticketId) return;
  try {
    messagesLoading.value = true;
    messagesError.value = '';
    const resp = await api.get(`/support-tickets/${ticketId}/messages`);
    ticketData.value = resp.data || { ticket: null, messages: [] };
    await scrollToBottom();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to load messages.';
  } finally { messagesLoading.value = false; }
};

const selectItem = async (item) => {
  selectedKey.value = item.key;
  selectedType.value = item.type;
  chatMessages.value = [];
  ticketData.value = null;
  draft.value = '';
  if (item.type === 'chat') await loadChatMessages();
  else await loadTicketMessages();
};

const scrollToBottom = async () => {
  await nextTick();
  const el = messagesEl.value;
  if (el) el.scrollTop = el.scrollHeight;
};

const activeThreadId = computed(() => {
  if (!selectedKey.value?.startsWith('chat-')) return null;
  return parseInt(selectedKey.value.replace('chat-', ''), 10);
});

// ── Actions ────────────────────────────────────────────────────
const deleteThread = async () => {
  const tid = activeThreadId.value;
  if (!tid) return;
  if (!window.confirm('Remove this thread from your view? The other person will still have it.')) return;
  try {
    sending.value = true;
    messagesError.value = '';
    await api.post(`/chat/threads/${tid}/delete-for-me`, {}, { skipGlobalLoading: true });
    selectedKey.value = null;
    selectedType.value = null;
    chatMessages.value = [];
    await loadThreads();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to remove thread.';
  } finally { sending.value = false; }
};

const unsend = async (m) => {
  const tid = activeThreadId.value;
  if (!tid || !m?.id || Number(m.sender_user_id) !== Number(meId.value) || m.is_read_by_other) return;
  try {
    sending.value = true;
    await api.delete(`/chat/threads/${tid}/messages/${m.id}`, { skipGlobalLoading: true });
    await loadChatMessages();
    await loadThreads();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to unsend.';
  } finally { sending.value = false; }
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
      messagesError.value = e.response?.data?.error?.message || 'Failed to send.';
    } finally { sending.value = false; }
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
      messagesError.value = e.response?.data?.error?.message || 'Failed to send.';
    } finally { sending.value = false; }
  }
};

// ── New message ────────────────────────────────────────────────
const openNewChat = () => {
  newChatError.value = '';
  newChatType.value = 'provider';
  showNewChat.value = true;
};

const closeNewChat = () => {
  showNewChat.value = false;
  newChatError.value = '';
  newTicketSubject.value = '';
  newTicketBody.value = '';
  newTicketTopic.value = 'general';
};

const startChatWithProvider = async (p) => {
  try {
    startingChat.value = true;
    newChatError.value = '';
    // Resolve the parent agency via affiliation so school staff can DM providers
    const aff = await api.get(`/school-portal/${props.schoolOrganizationId}/affiliation`);
    const agencyId = aff.data?.active_agency_id ? Number(aff.data.active_agency_id) : null;
    if (!agencyId) {
      newChatError.value = 'No active agency affiliation found for this school.';
      return;
    }
    const r = await api.post('/chat/threads/direct', {
      agencyId,
      // Pass organizationId so the backend allows school_staff (who are in the school org,
      // not the parent agency) to create threads with providers.
      organizationId: Number(props.schoolOrganizationId),
      otherUserId: Number(p.provider_user_id)
    });
    closeNewChat();
    await loadThreads();
    await nextTick();
    const item = allItems.value.find((i) => i.type === 'chat' && i.thread_id === r.data?.threadId);
    if (item) await selectItem(item);
  } catch (e) {
    newChatError.value = e.response?.data?.error?.message || 'Failed to start chat. Please try again.';
  } finally { startingChat.value = false; }
};

const startChatWithStaff = async (s) => {
  try {
    startingChat.value = true;
    newChatError.value = '';
    // Staff-to-staff: use the school org as agencyId (both users are in it).
    const r = await api.post('/chat/threads/direct', {
      agencyId: Number(props.schoolOrganizationId),
      otherUserId: Number(s.id)
    });
    closeNewChat();
    await loadThreads();
    await nextTick();
    const item = allItems.value.find((i) => i.type === 'chat' && i.thread_id === r.data?.threadId);
    if (item) await selectItem(item);
  } catch (e) {
    newChatError.value = e.response?.data?.error?.message || 'Failed to start chat. Please try again.';
  } finally { startingChat.value = false; }
};

const createTicket = async () => {
  const body = newTicketBody.value.trim();
  if (!body) return;
  try {
    creatingTicket.value = true;
    const resp = await api.post('/support-tickets', {
      schoolOrganizationId: props.schoolOrganizationId,
      topic: newTicketTopic.value || 'general',
      subject: newTicketSubject.value.trim() || null,
      question: body
    });
    closeNewChat();
    await loadTickets();
    const created = resp.data;
    if (created?.id) {
      await selectItem({ key: `ticket-${created.id}`, type: 'ticket', ticket_id: created.id });
    }
  } catch (e) {
    newChatError.value = e.response?.data?.error?.message || 'Failed to send. Please try again.';
  } finally { creatingTicket.value = false; }
};

// ── Helpers ────────────────────────────────────────────────────
function providerInitials(p) {
  return initials(`${p.first_name || ''} ${p.last_name || ''}`);
}
function staffInitials(s) {
  return initials(`${s.first_name || ''} ${s.last_name || ''}`);
}

function relativeTime(d) {
  if (!d) return '';
  try {
    const ms = Date.now() - new Date(d).getTime();
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
    if (ms < 604800000) return `${Math.floor(ms / 86400000)}d`;
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function formatTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

// ── Watchers ───────────────────────────────────────────────────
watch(totalUnread, (n) => emit('unread-update', n), { immediate: true });

onMounted(() => loadAll());

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

watch(showNewChat, (open) => { if (open && newChatType.value === 'staff') loadStaff(); });
watch(newChatType, (type) => { if (type === 'staff') loadStaff(); });

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
/* ── Layout ── */
.spm { display: flex; flex-direction: column; gap: 14px; height: 100%; }

.spm__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.spm__title { margin: 0; font-size: 22px; font-weight: 700; }
.spm__sub { margin: 4px 0 0; font-size: 13px; color: var(--text-secondary, #666); }
.spm__header-actions { display: flex; gap: 8px; flex-shrink: 0; }

.spm__unread-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--primary-light, #e8f4fd);
  border-radius: 10px;
  font-size: 13px;
}
.spm__unread-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--primary, #0d6efd);
  animation: spm-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes spm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ── Grid ── */
.spm__grid {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 12px;
  flex: 1;
  min-height: 480px;
}
@media (max-width: 840px) {
  .spm__grid { grid-template-columns: 1fr; }
}

/* ── Thread list ── */
.spm__threads {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 14px;
  background: white;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  max-height: 600px;
}
.spm__section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary, #888);
  padding: 0 8px 6px;
}
.spm__empty-threads {
  padding: 32px 12px;
  text-align: center;
  color: var(--text-secondary, #888);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.spm__empty-icon { font-size: 28px; }

.spm__thread {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.12s;
}
.spm__thread:hover { background: var(--bg, #f9fafb); }
.spm__thread--active { background: var(--primary-light, #e8f4fd); }

.spm__thread-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: white; flex-shrink: 0;
}
.spm__thread-avatar--teal  { background: #0d9488; }
.spm__thread-avatar--indigo { background: #4f46e5; }
.spm__thread-avatar--amber { background: #d97706; }
.spm__thread-avatar--rose  { background: #e11d48; }
.spm__thread-avatar--sky   { background: #0284c7; }

.spm__thread-body { flex: 1; min-width: 0; }
.spm__thread-top { display: flex; justify-content: space-between; align-items: center; gap: 4px; }
.spm__thread-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spm__pill { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--primary, #0d6efd); color: white; flex-shrink: 0; }
.spm__thread-preview { font-size: 11px; color: var(--text-secondary, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.spm__thread-time { font-size: 10px; color: var(--text-secondary, #aaa); flex-shrink: 0; align-self: flex-start; padding-top: 2px; }

/* ── Message pane ── */
.spm__pane {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 14px;
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
.spm__pane-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary, #888);
  font-size: 14px;
  padding: 40px;
}
.spm__pane-empty-icon { font-size: 36px; }

.spm__pane-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}
.spm__pane-title {
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.spm__role-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--primary-light, #e8f4fd);
  color: var(--primary, #0d6efd);
  flex-shrink: 0;
}

.spm__bubbles {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 380px;
}
.spm__muted--center { text-align: center; color: var(--text-secondary, #aaa); font-size: 13px; margin: auto; }

.spm__bubble-row { display: flex; justify-content: flex-start; }
.spm__bubble-row--mine { justify-content: flex-end; }
.spm__bubble-row--mine .spm__bubble { background: var(--primary-light, #e8f4fd); margin-left: 60px; }
.spm__bubble {
  background: var(--bg, #f3f4f6);
  border-radius: 14px;
  padding: 10px 14px;
  max-width: 75%;
  min-width: 60px;
}
.spm__bubble-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary, #888);
  margin-bottom: 5px;
  flex-wrap: wrap;
}
.spm__bubble-sender { font-weight: 600; }
.spm__bubble-time { margin-left: auto; }
.spm__receipt { font-weight: 700; color: #10b981; }
.spm__msg-action {
  border: none; background: none; font-size: 11px; color: var(--text-secondary, #999); cursor: pointer; padding: 0;
}
.spm__msg-action:hover { color: #c33; text-decoration: underline; }
.spm__bubble-text { font-size: 14px; white-space: pre-wrap; line-height: 1.45; }

.spm__composer {
  padding: 12px 16px;
  border-top: 1px solid var(--border, #e5e7eb);
  flex-shrink: 0;
}
.spm__composer-input {
  width: 100%;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  resize: vertical;
  font-size: 14px;
  font-family: inherit;
  margin-bottom: 8px;
  box-sizing: border-box;
}
.spm__composer-input:focus { outline: none; border-color: var(--primary, #0d6efd); }
.spm__composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.spm__composer-hint { font-size: 11px; color: var(--text-secondary, #aaa); }

/* ── Shared muted / error ── */
.spm__muted { color: var(--text-secondary, #888); font-size: 13px; }
.spm__muted--pad { padding: 16px; }
.spm__error { font-size: 13px; color: #b91c1c; }
.spm__error--pad { padding: 12px 16px; }
.spm__error--banner {
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin-bottom: 14px;
}

/* ── Buttons ── */
.spm-btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13px;
  font-weight: 600; cursor: pointer; border: none; transition: opacity 0.15s;
  white-space: nowrap;
}
.spm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.spm-btn--primary { background: var(--primary, #0d6efd); color: white; }
.spm-btn--primary:hover:not(:disabled) { opacity: 0.88; }
.spm-btn--ghost { background: var(--bg, #f3f4f6); color: var(--text-primary, #111); border: 1px solid var(--border, #e5e7eb); }
.spm-btn--ghost:hover:not(:disabled) { background: #e5e7eb; }
.spm-btn--danger-ghost { background: transparent; color: #b91c1c; border: 1px solid #fca5a5; }
.spm-btn--danger-ghost:hover:not(:disabled) { background: #fef2f2; }
.spm-btn--sm { padding: 5px 10px; font-size: 12px; }
.spm-btn--full { width: 100%; margin-top: 4px; }

/* ── Modal ── */
.spm__overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.spm__modal {
  width: 500px; max-width: 96vw; max-height: 88vh;
  background: white; border-radius: 16px;
  border: 1px solid var(--border, #e5e7eb);
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
}
.spm__modal-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  display: flex; justify-content: space-between; align-items: center;
  font-size: 16px;
  flex-shrink: 0;
}
.spm__modal-body { padding: 18px; overflow-y: auto; }

.spm__tabs {
  display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap;
}
.spm__tab {
  padding: 7px 14px; border: 1px solid var(--border, #e5e7eb);
  border-radius: 20px; background: white; font-size: 13px;
  cursor: pointer; transition: all 0.12s;
}
.spm__tab--active { background: var(--primary, #0d6efd); color: white; border-color: var(--primary, #0d6efd); }
.spm__tab:hover:not(.spm__tab--active) { background: var(--bg, #f3f4f6); }

.spm__picker { display: flex; flex-direction: column; gap: 6px; }
.spm__picker-hint { font-size: 13px; color: var(--text-secondary, #666); margin: 0 0 10px; }

.spm__pick-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px; background: white;
  cursor: pointer; text-align: left; transition: background 0.12s;
  width: 100%;
}
.spm__pick-item:hover:not(:disabled) { background: var(--bg, #f3f4f6); }
.spm__pick-item:disabled { opacity: 0.6; cursor: not-allowed; }

.spm__pick-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--primary, #0d6efd);
  color: white; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.spm__pick-avatar--staff { background: #0d9488; }
.spm__pick-name { font-size: 14px; font-weight: 600; }
.spm__pick-role { font-size: 12px; color: var(--text-secondary, #888); margin-top: 1px; }

.spm__ticket-form { display: flex; flex-direction: column; gap: 0; }
.spm__label { font-size: 12px; font-weight: 700; color: var(--text-primary, #222); margin: 12px 0 5px; display: block; }
.spm__label:first-child { margin-top: 0; }
.spm__opt { font-weight: 400; color: var(--text-secondary, #888); }
.spm__select, .spm__input, .spm__textarea {
  width: 100%; padding: 9px 12px;
  border: 1px solid var(--border, #e5e7eb); border-radius: 8px;
  font-size: 14px; font-family: inherit;
  box-sizing: border-box;
}
.spm__select:focus, .spm__input:focus, .spm__textarea:focus {
  outline: none; border-color: var(--primary, #0d6efd);
}
.spm__textarea { resize: vertical; min-height: 90px; }
</style>
