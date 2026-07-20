<template>
  <div class="gmsg">
    <div class="panel-head">
      <div class="panel-title">Messages</div>
      <div class="panel-subtitle">Message your child’s provider, or contact agency support</div>
    </div>

    <div class="gmsg-tabs">
      <button type="button" class="gmsg-tab" :class="{ active: mode === 'provider' }" @click="mode = 'provider'">
        Provider
      </button>
      <button type="button" class="gmsg-tab" :class="{ active: mode === 'support' }" @click="switchToSupport">
        Support
      </button>
      <button type="button" class="gmsg-tab" :class="{ active: mode === 'sms' }" @click="switchToSms">
        Text history
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <template v-if="mode === 'provider'">
      <div v-if="loading" class="muted">Loading conversations…</div>
      <div v-else class="gmsg-body">
        <aside class="gmsg-list">
          <button
            v-for="t in threads"
            :key="t.client_id"
            type="button"
            class="gmsg-row"
            :class="{ active: selected?.client_id === t.client_id }"
            :disabled="!t.available && !t.provider"
            @click="selectThread(t)"
          >
            <div class="gmsg-row-title">{{ t.client_label }}</div>
            <div class="gmsg-row-meta">
              <template v-if="t.provider">
                {{ t.provider.first_name }} {{ t.provider.last_name }}
              </template>
              <template v-else>No assigned provider yet</template>
            </div>
          </button>
          <div v-if="!threads.length" class="muted pad">No dependents linked for messaging.</div>
        </aside>

        <section class="gmsg-chat">
          <div v-if="!selected" class="muted pad">Select a child to message their provider.</div>
          <template v-else>
            <div class="gmsg-chat-head">
              <strong>{{ selected.client_label }}</strong>
              <span class="muted">
                with {{ selected.provider?.first_name }} {{ selected.provider?.last_name }}
              </span>
            </div>
            <div v-if="messagesLoading" class="muted pad">Loading…</div>
            <div v-else class="gmsg-thread" ref="threadEl">
              <div
                v-for="m in messages"
                :key="m.id"
                class="gmsg-bubble"
                :class="{ mine: m.sender_user_id === meId }"
              >
                <div class="gmsg-meta">{{ formatTime(m.created_at) }}</div>
                <div class="gmsg-body">{{ m.body }}</div>
              </div>
              <div v-if="!messages.length" class="muted">No messages yet. Say hello.</div>
            </div>
            <div class="gmsg-composer">
              <textarea v-model="draft" rows="2" placeholder="Write a secure message…" />
              <button
                type="button"
                class="btn btn-primary"
                :disabled="sending || !draft.trim()"
                @click="send"
              >
                {{ sending ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </template>
        </section>
      </div>
    </template>

    <template v-else-if="mode === 'sms'">
      <div class="gmsg-sms-panel">
        <p class="muted pad-sm">
          Texts sent to or from your phone (or your child’s contact phone) with this organization.
          This is a history view only — reply in Provider or Support above.
        </p>
        <div class="gmsg-sms-filters pad-sm">
          <label>
            <span class="muted">Child</span>
            <select v-model="smsClientFilter" @change="loadSmsAudit">
              <option value="">All</option>
              <option v-for="c in childOptions" :key="c.client_id" :value="String(c.client_id)">
                {{ c.client_label }}
              </option>
            </select>
          </label>
          <button type="button" class="btn btn-secondary" :disabled="smsLoading" @click="loadSmsAudit">
            {{ smsLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
        <div v-if="smsLoading && !smsItems.length" class="muted pad">Loading text history…</div>
        <div v-else-if="!smsItems.length" class="muted pad">No text messages in your history yet.</div>
        <ul v-else class="gmsg-sms-list">
          <li v-for="row in smsItems" :key="row.id" class="gmsg-sms-row">
            <div class="gmsg-sms-meta">
              <span>{{ row.direction === 'INBOUND' ? 'Received' : 'Sent' }}</span>
              <span class="muted">{{ formatTime(row.occurredAt) }}</span>
            </div>
            <div class="gmsg-sms-body">{{ row.body || '—' }}</div>
            <div class="muted gmsg-sms-nums">{{ row.fromNumber }} → {{ row.toNumber }}</div>
          </li>
        </ul>
      </div>
    </template>

    <template v-else>
      <div v-if="ticketsLoading" class="muted">Loading support tickets…</div>
      <div v-else class="gmsg-body">
        <aside class="gmsg-list">
          <button type="button" class="gmsg-row gmsg-new" @click="startNewTicket">
            <div class="gmsg-row-title">+ New support request</div>
            <div class="gmsg-row-meta">Billing, access, or agency questions</div>
          </button>
          <button
            v-for="t in tickets"
            :key="t.id"
            type="button"
            class="gmsg-row"
            :class="{ active: selectedTicketId === t.id && !creatingTicket }"
            @click="openTicket(t)"
          >
            <div class="gmsg-row-title">#{{ t.id }} {{ t.subject || 'Support' }}</div>
            <div class="gmsg-row-meta">
              <span v-if="t.topic && t.topic !== 'general'">{{ ticketTopicLabel(t.topic) }} · </span>
              {{ t.display_status || t.status }} · {{ formatTime(t.created_at) }}
            </div>
          </button>
          <div v-if="!tickets.length" class="muted pad">No support tickets yet.</div>
        </aside>

        <section class="gmsg-chat">
          <template v-if="creatingTicket">
            <div class="gmsg-chat-head">
              <strong>New support request</strong>
              <span class="muted">Agency staff will reply here</span>
            </div>
            <div class="gmsg-composer pad">
              <label class="gmsg-field">
                <span>Child</span>
                <select v-model="newTicket.clientId">
                  <option disabled value="">Select…</option>
                  <option v-for="c in childOptions" :key="c.client_id" :value="String(c.client_id)">
                    {{ c.client_label }}
                  </option>
                </select>
              </label>
              <label class="gmsg-field">
                <span>Topic</span>
                <select v-model="newTicket.topic">
                  <option v-for="t in guardianTopics" :key="t.id" :value="t.id">{{ t.label }}</option>
                </select>
              </label>
              <label class="gmsg-field">
                <span>Subject (optional)</span>
                <input v-model="newTicket.subject" type="text" placeholder="e.g. Billing question" />
              </label>
              <label class="gmsg-field">
                <span>Question</span>
                <textarea v-model="newTicket.question" rows="4" placeholder="How can we help?" />
              </label>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="ticketSending || !newTicket.clientId || !newTicket.question.trim()"
                @click="createTicket"
              >
                {{ ticketSending ? 'Submitting…' : 'Submit request' }}
              </button>
            </div>
          </template>
          <template v-else-if="selectedTicket">
            <div class="gmsg-chat-head">
              <strong>#{{ selectedTicket.id }} {{ selectedTicket.subject || 'Support' }}</strong>
              <span class="muted">{{ selectedTicket.display_status || selectedTicket.status }}</span>
            </div>
            <div v-if="ticketMessagesLoading" class="muted pad">Loading…</div>
            <div v-else class="gmsg-thread" ref="ticketThreadEl">
              <div
                v-for="m in ticketMessages"
                :key="m.id"
                class="gmsg-bubble"
                :class="{ mine: m.author_user_id === meId }"
              >
                <div class="gmsg-meta">{{ formatTime(m.created_at) }}</div>
                <div class="gmsg-body">{{ m.body }}</div>
              </div>
              <div v-if="!ticketMessages.length" class="muted">No replies yet.</div>
            </div>
            <div class="gmsg-composer">
              <textarea
                v-model="ticketDraft"
                rows="2"
                placeholder="Reply to support…"
                :disabled="String(selectedTicket.status || '').toLowerCase() === 'closed'"
              />
              <button
                type="button"
                class="btn btn-primary"
                :disabled="
                  ticketSending ||
                  !ticketDraft.trim() ||
                  String(selectedTicket.status || '').toLowerCase() === 'closed'
                "
                @click="sendTicketReply"
              >
                {{ ticketSending ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </template>
          <div v-else class="muted pad">Select a ticket or start a new support request.</div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { GUARDIAN_TICKET_TOPICS, ticketTopicLabel } from '../../utils/ticketTopics';

const authStore = useAuthStore();
const meId = computed(() => authStore.user?.id || null);
const guardianTopics = GUARDIAN_TICKET_TOPICS;

const mode = ref('provider');
const threads = ref([]);
const selected = ref(null);
const messages = ref([]);
const loading = ref(false);
const messagesLoading = ref(false);
const sending = ref(false);
const error = ref('');
const draft = ref('');
const threadEl = ref(null);

const smsItems = ref([]);
const smsLoading = ref(false);
const smsClientFilter = ref('');

const tickets = ref([]);
const ticketsLoading = ref(false);
const selectedTicketId = ref(null);
const selectedTicket = ref(null);
const ticketMessages = ref([]);
const ticketMessagesLoading = ref(false);
const ticketDraft = ref('');
const ticketSending = ref(false);
const creatingTicket = ref(false);
const ticketThreadEl = ref(null);
const newTicket = ref({ clientId: '', topic: 'general', subject: '', question: '' });

const childOptions = computed(() =>
  (threads.value || []).map((t) => ({
    client_id: t.client_id,
    client_label: t.client_label
  }))
);

function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function loadThreads() {
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/guardian-portal/messages', { skipGlobalLoading: true });
    threads.value = Array.isArray(r.data?.threads) ? r.data.threads : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load messages';
    threads.value = [];
  } finally {
    loading.value = false;
  }
}

async function selectThread(t) {
  if (!t?.provider?.id && !t?.available) return;
  creatingTicket.value = false;
  messagesLoading.value = true;
  error.value = '';
  draft.value = '';
  try {
    let thread = t;
    if (!thread.thread_id) {
      const opened = await api.post(
        '/guardian-portal/messages/open',
        { clientId: t.client_id },
        { skipGlobalLoading: true }
      );
      thread = {
        ...t,
        thread_id: opened.data?.thread_id,
        available: !!opened.data?.thread_id,
        provider: opened.data?.provider || t.provider
      };
      const idx = threads.value.findIndex((x) => x.client_id === t.client_id);
      if (idx >= 0) threads.value[idx] = thread;
    }
    if (!thread.thread_id) throw new Error('Could not open conversation');
    selected.value = thread;
    const r = await api.get(`/guardian-portal/messages/${thread.thread_id}`, { skipGlobalLoading: true });
    messages.value = Array.isArray(r.data?.messages) ? r.data.messages : (Array.isArray(r.data) ? r.data : []);
    await nextTick();
    if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load thread';
    messages.value = [];
  } finally {
    messagesLoading.value = false;
  }
}

async function send() {
  if (!selected.value?.thread_id || !draft.value.trim()) return;
  sending.value = true;
  try {
    await api.post(`/guardian-portal/messages/${selected.value.thread_id}`, {
      body: draft.value.trim()
    });
    draft.value = '';
    await selectThread(selected.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Send failed';
  } finally {
    sending.value = false;
  }
}

async function loadTickets() {
  ticketsLoading.value = true;
  error.value = '';
  try {
    const r = await api.get('/guardian-portal/support-tickets', { skipGlobalLoading: true });
    tickets.value = Array.isArray(r.data?.tickets) ? r.data.tickets : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load tickets';
    tickets.value = [];
  } finally {
    ticketsLoading.value = false;
  }
}

async function switchToSupport() {
  mode.value = 'support';
  await loadTickets();
}

async function loadSmsAudit() {
  smsLoading.value = true;
  error.value = '';
  try {
    const params = { limit: 50 };
    if (smsClientFilter.value) params.clientId = smsClientFilter.value;
    const r = await api.get('/guardian-portal/sms-audit', { params, skipGlobalLoading: true });
    smsItems.value = Array.isArray(r.data?.items) ? r.data.items : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load text history';
    smsItems.value = [];
  } finally {
    smsLoading.value = false;
  }
}

async function switchToSms() {
  mode.value = 'sms';
  if (!threads.value.length) await loadThreads();
  await loadSmsAudit();
}

function startNewTicket() {
  creatingTicket.value = true;
  selectedTicketId.value = null;
  selectedTicket.value = null;
  ticketMessages.value = [];
  newTicket.value = {
    clientId: childOptions.value[0] ? String(childOptions.value[0].client_id) : '',
    topic: 'general',
    subject: '',
    question: ''
  };
}

async function openTicket(t) {
  if (!t?.id) return;
  creatingTicket.value = false;
  selectedTicketId.value = t.id;
  ticketMessagesLoading.value = true;
  ticketDraft.value = '';
  error.value = '';
  try {
    const r = await api.get(`/guardian-portal/support-tickets/${t.id}`, { skipGlobalLoading: true });
    selectedTicket.value = r.data?.ticket || t;
    ticketMessages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
    await nextTick();
    if (ticketThreadEl.value) ticketThreadEl.value.scrollTop = ticketThreadEl.value.scrollHeight;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load ticket';
    ticketMessages.value = [];
  } finally {
    ticketMessagesLoading.value = false;
  }
}

async function createTicket() {
  if (!newTicket.value.clientId || !newTicket.value.question.trim()) return;
  ticketSending.value = true;
  error.value = '';
  try {
    const r = await api.post('/guardian-portal/support-tickets', {
      clientId: Number(newTicket.value.clientId),
      topic: newTicket.value.topic || 'general',
      subject: newTicket.value.subject || undefined,
      question: newTicket.value.question.trim()
    });
    creatingTicket.value = false;
    await loadTickets();
    if (r.data?.ticket) await openTicket(r.data.ticket);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Could not create ticket';
  } finally {
    ticketSending.value = false;
  }
}

async function sendTicketReply() {
  if (!selectedTicket.value?.id || !ticketDraft.value.trim()) return;
  ticketSending.value = true;
  try {
    await api.post(`/guardian-portal/support-tickets/${selectedTicket.value.id}/messages`, {
      body: ticketDraft.value.trim()
    });
    ticketDraft.value = '';
    await openTicket(selectedTicket.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Reply failed';
  } finally {
    ticketSending.value = false;
  }
}

onMounted(loadThreads);
</script>

<style scoped>
.gmsg { display: flex; flex-direction: column; gap: 12px; min-height: 420px; }
.panel-head { margin-bottom: 4px; }
.panel-title { font-weight: 800; font-size: 1.15rem; }
.panel-subtitle { color: var(--text-secondary, #64748b); font-size: 13px; }
.gmsg-sms-panel { border: 1px solid var(--border, #e2e8f0); border-radius: 12px; overflow: hidden; }
.pad-sm { padding: 10px 12px; }
.gmsg-sms-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.gmsg-sms-filters label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.gmsg-sms-filters select {
  min-width: 160px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.gmsg-sms-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow: auto;
}
.gmsg-sms-row {
  padding: 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.gmsg-sms-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
}
.gmsg-sms-body { white-space: pre-wrap; word-break: break-word; font-size: 14px; }
.gmsg-sms-nums { font-size: 11px; margin-top: 4px; }
.gmsg-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.gmsg-tab {
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
}
.gmsg-tab.active {
  border-color: var(--primary, #2d6a4f);
  color: var(--primary, #2d6a4f);
  background: rgba(45, 106, 79, 0.08);
}
.gmsg-body {
  flex: 1;
  min-height: 360px;
  display: grid;
  grid-template-columns: minmax(180px, 34%) 1fr;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.gmsg-list { border-right: 1px solid var(--border, #e2e8f0); overflow: auto; background: #fafbfa; }
.gmsg-row {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: #fff;
  padding: 12px;
  cursor: pointer;
}
.gmsg-row.active { background: rgba(45, 106, 79, 0.08); border-left: 3px solid var(--primary, #2d6a4f); }
.gmsg-row:disabled { opacity: 0.55; cursor: not-allowed; }
.gmsg-new { background: #f0fdf4; }
.gmsg-row-title { font-weight: 700; font-size: 14px; }
.gmsg-row-meta { font-size: 12px; color: var(--text-secondary, #64748b); margin-top: 2px; }
.gmsg-chat { display: flex; flex-direction: column; min-height: 0; }
.gmsg-chat-head {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gmsg-thread {
  flex: 1;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gmsg-bubble {
  max-width: 85%;
  padding: 8px 10px;
  border-radius: 12px;
  background: #e8f1ff;
  align-self: flex-start;
}
.gmsg-bubble.mine { background: #eef2f7; align-self: flex-end; }
.gmsg-meta { font-size: 11px; color: var(--text-secondary, #64748b); margin-bottom: 2px; }
.gmsg-body { white-space: pre-wrap; font-size: 14px; }
.gmsg-composer {
  border-top: 1px solid var(--border, #e2e8f0);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gmsg-composer.pad { border-top: none; }
.gmsg-composer textarea,
.gmsg-field input,
.gmsg-field select {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  padding: 8px;
  font: inherit;
  resize: vertical;
}
.gmsg-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 650; }
.pad { padding: 14px; }
.error { color: #b91c1c; padding: 8px 0; }
.muted { color: var(--text-secondary, #64748b); }
@media (max-width: 700px) {
  .gmsg-body { grid-template-columns: 1fr; }
}
</style>
