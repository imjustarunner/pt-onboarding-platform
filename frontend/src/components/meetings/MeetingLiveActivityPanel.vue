<template>
  <div
    class="mlap"
    :class="{
      'mlap--embedded': embedded,
      'mlap--open': panelOpen,
      'mlap--chrome-less': hideChrome
    }"
  >
    <div v-if="!hideChrome" class="mlap__bar">
      <button
        type="button"
        class="mlap__toggle"
        :class="{ on: panelOpen }"
        title="Chat, polls & Q&A"
        @click="panelOpen = !panelOpen"
      >
        Chat &amp; polls
        <span v-if="unreadCount > 0" class="mlap__badge">{{ unreadCount }}</span>
      </button>
      <button
        v-if="panelOpen"
        type="button"
        class="mlap__refresh"
        :disabled="loading"
        @click="loadActivity({ quiet: true })"
      >
        Refresh
      </button>
    </div>

    <div v-if="panelOpen || hideChrome" class="mlap__panel">
      <div class="mlap__tabs">
        <button type="button" class="mlap__tab" :class="{ on: tab === 'chat' }" @click="tab = 'chat'">Chat</button>
        <button type="button" class="mlap__tab" :class="{ on: tab === 'polls' }" @click="tab = 'polls'">Polls</button>
        <button type="button" class="mlap__tab" :class="{ on: tab === 'qa' }" @click="tab = 'qa'">Q&amp;A</button>
      </div>

      <p v-if="error" class="mlap__error">{{ error }}</p>

      <p v-if="sinceJoinedAt" class="mlap__since-hint">
        Showing chat &amp; polls from when you joined this meeting.
      </p>

      <div v-if="tab === 'chat'" class="mlap__body">
        <div ref="chatMessagesEl" class="mlap__messages">
          <div v-if="!chatMessages.length" class="mlap__empty">No messages yet. Say hello.</div>
          <div
            v-for="m in chatMessages"
            :key="m.id"
            class="mlap__msg"
            :class="{ own: m.isOwn }"
          >
            <span class="mlap__sender">{{ m.senderLabel }}</span>
            <span class="mlap__text">{{ m.text }}</span>
          </div>
        </div>
        <form class="mlap__form" @submit.prevent="sendChatMessage">
          <input
            v-model="chatInput"
            type="text"
            class="mlap__input"
            placeholder="Type a message…"
            maxlength="2000"
            :disabled="sending"
          />
          <button type="submit" class="btn btn-primary btn-sm" :disabled="sending || !chatInput.trim()">
            Send
          </button>
        </form>
      </div>

      <div v-else-if="tab === 'polls'" class="mlap__body">
        <div v-if="isHost" class="mlap__poll-create">
          <input v-model="pollQuestion" type="text" class="mlap__input" placeholder="Poll question" maxlength="500" />
          <input
            v-model="pollOptionsText"
            type="text"
            class="mlap__input"
            placeholder="Options (comma-separated)"
            maxlength="1000"
          />
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="sending || !pollQuestion.trim() || !pollOptionsText.trim()"
            @click="createPoll"
          >
            Create poll
          </button>
        </div>
        <div class="mlap__messages">
          <div v-if="!polls.length" class="mlap__empty">
            {{ isHost ? 'No polls yet. Create one above.' : 'No polls yet.' }}
          </div>
          <div v-for="p in polls" :key="p.id" class="mlap__poll">
            <div class="mlap__poll-q">{{ p.question }}</div>
            <div class="mlap__poll-opts">
              <button
                v-for="(opt, idx) in p.options"
                :key="`${p.id}-${idx}`"
                type="button"
                class="mlap__opt"
                :class="{ selected: p.userVote === idx }"
                :disabled="p.userVote != null || sending"
                @click="votePoll(p, idx)"
              >
                {{ opt }}
                <span v-if="p.votes?.[idx] != null">({{ p.votes[idx] }})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="mlap__body">
        <div class="mlap__messages">
          <div v-if="!qaItems.length" class="mlap__empty">No questions yet.</div>
          <div v-for="q in qaItems" :key="q.id" class="mlap__qa">
            <div><strong>Q:</strong> {{ q.text }}</div>
            <div v-if="q.answer" class="mlap__qa-a"><strong>A:</strong> {{ q.answer }}</div>
            <div v-else-if="isHost" class="mlap__qa-form">
              <input v-model="q.answerDraft" type="text" class="mlap__input" placeholder="Type answer…" />
              <button type="button" class="btn btn-primary btn-sm" :disabled="sending || !q.answerDraft?.trim()" @click="submitAnswer(q)">
                Submit
              </button>
            </div>
          </div>
        </div>
        <form class="mlap__form" @submit.prevent="submitQuestion">
          <input
            v-model="questionInput"
            type="text"
            class="mlap__input"
            placeholder="Ask a question…"
            maxlength="500"
            :disabled="sending"
          />
          <button type="submit" class="btn btn-primary btn-sm" :disabled="sending || !questionInput.trim()">
            Ask
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  /** provider_schedule_events.id for team meetings / huddles */
  eventId: { type: [Number, String], default: null },
  /** supervision_sessions.id */
  sessionId: { type: [Number, String], default: null },
  isHost: { type: Boolean, default: false },
  /** Start open (e.g. when selected as a workspace tab) */
  startOpen: { type: Boolean, default: true },
  /** Compact styling for sidebar embedding */
  embedded: { type: Boolean, default: false },
  /** When true, always show panel body (no collapse toggle). */
  hideChrome: { type: Boolean, default: false },
  /**
   * ISO/date string — when set, only show chat/polls/Q&A created at or after this time
   * (used so providers only see activity from when they joined).
   */
  sinceJoinedAt: { type: [String, Date, Number], default: null },
  /** Poll interval for live sync (ms) */
  pollMs: { type: Number, default: 4000 }
});

const authStore = useAuthStore();
const panelOpen = ref(!!props.startOpen);
const tab = ref('chat');
const loading = ref(false);
const sending = ref(false);
const error = ref('');
const chatInput = ref('');
const chatMessages = ref([]);
const unreadCount = ref(0);
const pollQuestion = ref('');
const pollOptionsText = ref('');
const polls = ref([]);
const questionInput = ref('');
const qaItems = ref([]);
const chatMessagesEl = ref(null);
const seenIds = new Set();
let pollTimer = null;

const ownIdentity = computed(() => {
  const id = Number(authStore.user?.id || 0);
  return id ? `user-${id}` : '';
});

const ownDisplayName = computed(() => {
  const u = authStore.user || {};
  return `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim()
    || u.email
    || 'You';
});

function activityApiBase() {
  const eid = Number(props.eventId || 0);
  const sid = Number(props.sessionId || 0);
  if (eid) return `/team-meetings/${eid}/activity`;
  if (sid) return `/supervision/sessions/${sid}/activity`;
  return null;
}

function senderLabel(identity, payload = {}) {
  if (payload?.authorName) return String(payload.authorName);
  const id = String(identity || '');
  if (ownIdentity.value && id === ownIdentity.value) return ownDisplayName.value;
  if (id.startsWith('user-')) return `User ${id.slice(5)}`;
  if (id.startsWith('guest-')) return payload?.authorName || 'Guest';
  return id || 'Unknown';
}

function sinceCutoffMs() {
  if (props.sinceJoinedAt == null || props.sinceJoinedAt === '') return null;
  const t = new Date(props.sinceJoinedAt).getTime();
  return Number.isFinite(t) ? t : null;
}

function isAfterJoin(a) {
  const cut = sinceCutoffMs();
  if (cut == null) return true;
  const created = a?.createdAt != null ? new Date(a.createdAt).getTime() : NaN;
  // Local optimistic rows (no server createdAt yet) always show.
  if (!Number.isFinite(created)) return true;
  return created >= cut;
}

function applyActivity(a, { fromPoll = false } = {}) {
  if (!isAfterJoin(a)) return;
  const key = a?.id != null ? `id:${a.id}` : null;
  if (key) {
    if (seenIds.has(key)) return;
    seenIds.add(key);
  }
  const type = String(a?.activityType || '').toLowerCase();
  const payload = a?.payload || {};
  const isOwn = !!(ownIdentity.value && String(a?.participantIdentity || '') === ownIdentity.value);

  if (type === 'chat') {
    chatMessages.value.push({
      id: key || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text: payload.text || '',
      senderLabel: senderLabel(a.participantIdentity, payload),
      isOwn
    });
    if (fromPoll && !isOwn && !panelOpen.value) unreadCount.value += 1;
  } else if (type === 'poll') {
    const pollId = payload.id ?? a.id;
    if (polls.value.some((p) => String(p.id) === String(pollId))) return;
    polls.value.push({
      id: pollId,
      question: payload.question || '',
      options: Array.isArray(payload.options) ? payload.options : [],
      votes: {},
      userVote: null
    });
  } else if (type === 'poll_vote') {
    const p = polls.value.find((x) => String(x.id) === String(payload.pollId));
    if (p && payload.optionIndex != null) {
      const idx = Number(payload.optionIndex);
      p.votes = { ...p.votes, [idx]: (p.votes[idx] || 0) + 1 };
      if (isOwn) p.userVote = idx;
    }
  } else if (type === 'question') {
    const qid = payload.id ?? a.id;
    if (qaItems.value.some((q) => String(q.id) === String(qid))) return;
    qaItems.value.push({
      id: qid,
      text: payload.text || '',
      answer: null,
      answerDraft: ''
    });
  } else if (type === 'answer') {
    const q = qaItems.value.find((x) => String(x.id) === String(payload.inReplyToId));
    if (q) q.answer = payload.text || '';
  }
}

async function persistActivity(activityType, payload) {
  const base = activityApiBase();
  if (!base) return null;
  const resp = await api.post(base, {
    activityType,
    payload: {
      ...payload,
      authorName: ownDisplayName.value
    }
  }, { skipGlobalLoading: true, skipAuthRedirect: true });
  return resp?.data?.id ?? null;
}

async function loadActivity({ quiet = false } = {}) {
  const base = activityApiBase();
  if (!base) return;
  if (!quiet) loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(base, {
      params: { limit: 500 },
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    const list = Array.isArray(resp?.data?.activity) ? resp.data.activity : [];
    const prevChatIds = new Set(
      [...seenIds].filter((k) => k.startsWith('id:'))
    );
    let newChatCount = 0;
    if (quiet && panelOpen.value === false) {
      for (const a of list) {
        if (String(a?.activityType || '').toLowerCase() !== 'chat') continue;
        const key = a?.id != null ? `id:${a.id}` : null;
        if (!key || prevChatIds.has(key)) continue;
        const isOwn = !!(ownIdentity.value && String(a?.participantIdentity || '') === ownIdentity.value);
        if (!isOwn) newChatCount += 1;
      }
    }

    // Rebuild from server so vote counts / answers stay accurate.
    seenIds.clear();
    chatMessages.value = [];
    polls.value = [];
    qaItems.value = [];
    for (const a of list) {
      const t = String(a?.activityType || '').toLowerCase();
      if (t === 'poll_vote' || t === 'answer') continue;
      applyActivity(a, { fromPoll: false });
    }
    for (const a of list) {
      const t = String(a?.activityType || '').toLowerCase();
      if (t === 'poll_vote' || t === 'answer') applyActivity(a, { fromPoll: false });
    }
    if (newChatCount > 0) unreadCount.value += newChatCount;

    await nextTick();
    if (chatMessagesEl.value && panelOpen.value) {
      chatMessagesEl.value.scrollTop = chatMessagesEl.value.scrollHeight;
    }
  } catch (e) {
    if (!quiet) {
      error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load chat';
    }
  } finally {
    if (!quiet) loading.value = false;
  }
}

async function sendChatMessage() {
  const text = String(chatInput.value || '').trim();
  if (!text || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const id = await persistActivity('chat', { text });
    chatInput.value = '';
    applyActivity({
      id: id || `local-chat-${Date.now()}`,
      participantIdentity: ownIdentity.value,
      activityType: 'chat',
      payload: { text, authorName: ownDisplayName.value }
    });
    await nextTick();
    if (chatMessagesEl.value) {
      chatMessagesEl.value.scrollTop = chatMessagesEl.value.scrollHeight;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to send';
  } finally {
    sending.value = false;
  }
}

async function createPoll() {
  const question = String(pollQuestion.value || '').trim();
  const options = String(pollOptionsText.value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!question || !options.length || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const localId = `poll-${Date.now()}`;
    const id = await persistActivity('poll', { id: localId, question, options });
    pollQuestion.value = '';
    pollOptionsText.value = '';
    applyActivity({
      id: id || localId,
      participantIdentity: ownIdentity.value,
      activityType: 'poll',
      payload: { id: id || localId, question, options }
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to create poll';
  } finally {
    sending.value = false;
  }
}

async function votePoll(poll, optionIndex) {
  if (!poll || poll.userVote != null || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const id = await persistActivity('poll_vote', { pollId: poll.id, optionIndex });
    poll.userVote = optionIndex;
    poll.votes = { ...poll.votes, [optionIndex]: (poll.votes[optionIndex] || 0) + 1 };
    if (id) seenIds.add(`id:${id}`);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to vote';
  } finally {
    sending.value = false;
  }
}

async function submitQuestion() {
  const text = String(questionInput.value || '').trim();
  if (!text || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const localId = `q-${Date.now()}`;
    const id = await persistActivity('question', { id: localId, text });
    questionInput.value = '';
    applyActivity({
      id: id || localId,
      participantIdentity: ownIdentity.value,
      activityType: 'question',
      payload: { id: id || localId, text, authorName: ownDisplayName.value }
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to ask';
  } finally {
    sending.value = false;
  }
}

async function submitAnswer(q) {
  const text = String(q?.answerDraft || '').trim();
  if (!text || !q || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const id = await persistActivity('answer', { inReplyToId: q.id, text });
    q.answer = text;
    q.answerDraft = '';
    if (id) seenIds.add(`id:${id}`);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to answer';
  } finally {
    sending.value = false;
  }
}

function startPolling() {
  stopPolling();
  if (!activityApiBase()) return;
  pollTimer = setInterval(() => { void loadActivity({ quiet: true }); }, Math.max(2500, Number(props.pollMs) || 4000));
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

watch(panelOpen, (open) => {
  if (open) unreadCount.value = 0;
});

watch(
  () => [props.eventId, props.sessionId, props.sinceJoinedAt],
  () => {
    seenIds.clear();
    chatMessages.value = [];
    polls.value = [];
    qaItems.value = [];
    void loadActivity();
    startPolling();
  }
);

watch(() => props.startOpen, (v) => {
  if (v) panelOpen.value = true;
});

watch(() => props.hideChrome, (v) => {
  if (v) panelOpen.value = true;
});

onMounted(() => {
  panelOpen.value = !!(props.startOpen || props.hideChrome);
  void loadActivity();
  startPolling();
});

onUnmounted(stopPolling);

defineExpose({ loadActivity, open: () => { panelOpen.value = true; } });
</script>

<style scoped>
.mlap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.mlap__bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mlap__toggle {
  border: 1px solid #334155;
  background: #1e293b;
  color: #f8fafc;
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.mlap__toggle.on {
  background: #1d4ed8;
  border-color: #60a5fa;
}
.mlap__badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #b91c1c;
  color: #fff;
  font-size: 0.7rem;
}
.mlap__refresh {
  border: 0;
  background: transparent;
  color: #94a3b8;
  font-size: 0.8rem;
  cursor: pointer;
}
.mlap__panel {
  border: 1px solid #334155;
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  min-height: 220px;
  max-height: min(42vh, 420px);
  overflow: hidden;
}
.mlap--embedded .mlap__panel,
.mlap--chrome-less .mlap__panel {
  background: #fff;
  color: #0f172a;
  border-color: #e2e8f0;
  max-height: none;
  min-height: 280px;
  flex: 1;
  border: 0;
  border-radius: 0;
}
.mlap--chrome-less {
  flex: 1;
  min-height: 0;
}
.mlap--embedded .mlap__toggle {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;
}
.mlap--embedded .mlap__toggle.on {
  background: #059669;
  border-color: #047857;
  color: #fff;
}
.mlap__tabs {
  display: flex;
  border-bottom: 1px solid rgba(148, 163, 184, 0.35);
}
.mlap__tab {
  flex: 1;
  border: 0;
  background: transparent;
  color: #94a3b8;
  font-weight: 700;
  font-size: 0.8rem;
  padding: 8px 10px;
  cursor: pointer;
}
.mlap__tab.on {
  color: #38bdf8;
  border-bottom: 2px solid #38bdf8;
}
.mlap--embedded .mlap__tab.on {
  color: #047857;
  border-bottom-color: #047857;
}
.mlap__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.mlap__messages {
  flex: 1;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mlap__empty {
  color: #94a3b8;
  font-size: 0.85rem;
  padding: 8px 4px;
}
.mlap__msg {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.9);
}
.mlap--embedded .mlap__msg {
  background: #f1f5f9;
}
.mlap__msg.own {
  background: rgba(37, 99, 235, 0.28);
  margin-left: 18px;
}
.mlap--embedded .mlap__msg.own {
  background: #dbeafe;
}
.mlap__sender {
  display: block;
  font-size: 0.7rem;
  color: #94a3b8;
  margin-bottom: 2px;
}
.mlap__text {
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.mlap__form {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.35);
}
.mlap__input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #f8fafc;
  font-size: 0.9rem;
}
.mlap--embedded .mlap__input {
  background: #fff;
  border-color: #cbd5e1;
  color: #0f172a;
}
.mlap__poll-create {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.35);
}
.mlap__poll {
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
}
.mlap__poll-q {
  font-weight: 700;
  margin-bottom: 8px;
}
.mlap__poll-opts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mlap__opt {
  text-align: left;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #f8fafc;
  cursor: pointer;
  font-size: 0.85rem;
}
.mlap--embedded .mlap__opt {
  background: #fff;
  border-color: #cbd5e1;
  color: #0f172a;
}
.mlap__opt.selected {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
}
.mlap__qa {
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
  font-size: 0.9rem;
}
.mlap__qa-a {
  margin-top: 6px;
  margin-left: 10px;
  color: #94a3b8;
}
.mlap__qa-form {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.mlap__error {
  margin: 0;
  padding: 8px 10px;
  color: #fecaca;
  font-size: 0.85rem;
}
.mlap--embedded .mlap__error {
  color: #b91c1c;
}
.mlap__since-hint {
  margin: 0;
  padding: 8px 10px 0;
  font-size: 0.78rem;
  color: #64748b;
}
</style>
