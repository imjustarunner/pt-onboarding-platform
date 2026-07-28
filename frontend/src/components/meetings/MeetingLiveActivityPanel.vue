<template>
  <div
    class="mlap"
    :class="{
      'mlap--embedded': embedded,
      'mlap--open': panelOpen,
      'mlap--chrome-less': hideChrome,
      'mlap--below-video': belowVideo
    }"
  >
    <div v-if="toastText" class="mlap__toast" role="status">{{ toastText }}</div>

    <div v-if="!hideChrome" class="mlap__bar">
      <button
        type="button"
        class="mlap__toggle"
        :class="{ on: panelOpen }"
        title="Chat, polls & Q&A"
        @click="openPanel"
      >
        Chat &amp; polls
        <span v-if="totalUnread > 0" class="mlap__badge">{{ totalUnread }}</span>
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
        <button type="button" class="mlap__tab" :class="{ on: tab === 'chat' }" @click="setTab('chat')">
          Chat
          <span v-if="unread.chat > 0" class="mlap__tab-badge">{{ unread.chat }}</span>
        </button>
        <button type="button" class="mlap__tab" :class="{ on: tab === 'polls' }" @click="setTab('polls')">
          Polls
          <span v-if="unread.polls > 0" class="mlap__tab-badge">{{ unread.polls }}</span>
        </button>
        <button type="button" class="mlap__tab" :class="{ on: tab === 'qa' }" @click="setTab('qa')">
          Q&amp;A
          <span v-if="unread.qa > 0" class="mlap__tab-badge">{{ unread.qa }}</span>
        </button>
      </div>

      <p v-if="error" class="mlap__error">{{ error }}</p>

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
        <div v-if="canCreatePolls" class="mlap__poll-create">
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
            {{ canCreatePolls ? 'No polls yet. Create one above.' : 'No polls yet.' }}
          </div>
          <div v-for="p in polls" :key="p.id" class="mlap__poll">
            <div class="mlap__poll-q">{{ p.question || 'Poll' }}</div>
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
            <div v-if="q.answer" class="mlap__qa-a">
              <strong>A:</strong> {{ q.answer }}
              <span v-if="q.answeredBy" class="mlap__qa-by"> — {{ q.answeredBy }}</span>
            </div>
            <div v-if="canAnswerQuestions" class="mlap__qa-form">
              <input
                v-model="q.answerDraft"
                type="text"
                class="mlap__input"
                :placeholder="q.answer ? 'Update answer…' : 'Type answer…'"
              />
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="sending || !q.answerDraft?.trim()"
                @click="submitAnswer(q)"
              >
                {{ q.answer ? 'Update' : 'Submit' }}
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
import { ref, watch, onMounted, onUnmounted, nextTick, computed, reactive } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

/** Non-provider staff (and host via isHost) may create polls. Providers vote only. */
const POLL_CREATE_ROLES = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'support',
  'staff',
  'clinical_practice_assistant',
  'schedule_manager',
  'assistant_admin'
]);

const props = defineProps({
  eventId: { type: [Number, String], default: null },
  sessionId: { type: [Number, String], default: null },
  isHost: { type: Boolean, default: false },
  /** Explicitly allow creating polls (host/admin). If null, derived from role. */
  canCreatePolls: { type: Boolean, default: null },
  /** Explicitly allow posting official Q&A answers. If null, derived from isHost/staff roles. */
  canAnswerQuestions: { type: Boolean, default: null },
  /** Opaque supervision join token for guest activity endpoints. */
  joinToken: { type: String, default: '' },
  /** Guest identity (guest-*) when joining without login. */
  joinIdentity: { type: String, default: '' },
  /** Display name for guest activity posts. */
  guestDisplayName: { type: String, default: '' },
  startOpen: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
  hideChrome: { type: Boolean, default: false },
  belowVideo: { type: Boolean, default: false },
  /** @deprecated Providers now see full history; kept for API compatibility. */
  sinceJoinedAt: { type: [String, Date, Number], default: null },
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
const pollQuestion = ref('');
const pollOptionsText = ref('');
const polls = ref([]);
const questionInput = ref('');
const qaItems = ref([]);
const chatMessagesEl = ref(null);
const toastText = ref('');
const unread = reactive({ chat: 0, polls: 0, qa: 0 });
const seenIds = new Set();
/** Preserve Q&A answer drafts across activity reloads (poll every ~4s was wiping inputs). */
const answerDraftById = new Map();
let pollTimer = null;
let toastTimer = null;
let initialLoadDone = false;

const ownIdentity = computed(() => {
  const guest = String(props.joinIdentity || '').trim();
  if (guest.startsWith('guest-')) return guest;
  const id = Number(authStore.user?.id || 0);
  return id ? `user-${id}` : '';
});

const ownDisplayName = computed(() => {
  const guestName = String(props.guestDisplayName || '').trim();
  if (guestName) return guestName;
  const u = authStore.user || {};
  return `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim()
    || u.email
    || 'You';
});

const actorRole = computed(() => String(authStore.user?.role || '').toLowerCase().trim());

const canCreatePolls = computed(() => {
  if (props.canCreatePolls != null) return !!props.canCreatePolls;
  if (props.isHost) return true;
  return POLL_CREATE_ROLES.has(actorRole.value);
});

const canAnswerQuestions = computed(() => {
  if (props.canAnswerQuestions != null) return !!props.canAnswerQuestions;
  return props.isHost || POLL_CREATE_ROLES.has(actorRole.value);
});

const isGuestActivity = computed(() => {
  const tok = String(props.joinToken || '').trim();
  const ident = String(props.joinIdentity || '').trim();
  return !!tok && ident.startsWith('guest-');
});

const totalUnread = computed(() => unread.chat + unread.polls + unread.qa);

function activityApiBase() {
  const eid = Number(props.eventId || 0);
  const sid = Number(props.sessionId || 0);
  if (eid) return `/team-meetings/${eid}/activity`;
  if (sid) return `/supervision/sessions/${sid}/activity`;
  return null;
}

function guestActivityPath() {
  const tok = String(props.joinToken || '').trim();
  return tok ? `/supervision/guest-activity/${encodeURIComponent(tok)}` : null;
}

function senderLabel(identity, payload = {}) {
  if (payload?.authorName) return String(payload.authorName);
  const id = String(identity || '');
  if (ownIdentity.value && id === ownIdentity.value) return ownDisplayName.value;
  if (id.startsWith('user-')) return `User ${id.slice(5)}`;
  if (id.startsWith('guest-')) return payload?.authorName || 'Guest';
  return id || 'Unknown';
}

function normalizeOptions(raw) {
  if (Array.isArray(raw)) return raw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function showToast(text) {
  toastText.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastText.value = ''; }, 3500);
}

function bumpUnread(kind, amount = 1) {
  if (!amount) return;
  unread[kind] = (unread[kind] || 0) + amount;
  if (kind === 'chat') showToast(`New chat message${amount > 1 ? 's' : ''}`);
  else if (kind === 'polls') showToast(amount > 1 ? 'New polls' : 'New poll');
  else if (kind === 'qa') showToast(amount > 1 ? 'New questions' : 'New question');
}

function setTab(next) {
  tab.value = next;
  unread[next] = 0;
}

function openPanel() {
  panelOpen.value = !panelOpen.value;
  if (panelOpen.value) unread[tab.value] = 0;
}

function applyActivity(a) {
  const key = a?.id != null ? `id:${a.id}` : null;
  if (key) {
    if (seenIds.has(key)) return { kind: null, isNew: false };
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
    return { kind: 'chat', isNew: !isOwn };
  }
  if (type === 'poll') {
    const pollId = payload.id ?? a.id;
    if (polls.value.some((p) => String(p.id) === String(pollId))) return { kind: null, isNew: false };
    polls.value.push({
      id: pollId,
      question: String(payload.question || '').trim(),
      options: normalizeOptions(payload.options),
      votes: {},
      userVote: null
    });
    return { kind: 'polls', isNew: !isOwn };
  }
  if (type === 'poll_vote') {
    const p = polls.value.find((x) => String(x.id) === String(payload.pollId));
    if (p && payload.optionIndex != null) {
      const idx = Number(payload.optionIndex);
      p.votes = { ...p.votes, [idx]: (p.votes[idx] || 0) + 1 };
      if (isOwn) p.userVote = idx;
    }
    return { kind: null, isNew: false };
  }
  if (type === 'question') {
    const qid = payload.id ?? a.id;
    if (qaItems.value.some((q) => String(q.id) === String(qid))) return { kind: null, isNew: false };
    qaItems.value.push({
      id: qid,
      text: payload.text || '',
      answer: null,
      answeredBy: '',
      answerDraft: answerDraftById.get(String(qid)) || ''
    });
    return { kind: 'qa', isNew: !isOwn };
  }
  if (type === 'answer') {
    const q = qaItems.value.find((x) => String(x.id) === String(payload.inReplyToId));
    if (q) {
      q.answer = payload.text || '';
      q.answeredBy = payload.authorName || senderLabel(a.participantIdentity, payload) || '';
      // Keep any in-progress draft for a different update; clear only if it matched the submitted text.
      if (String(q.answerDraft || '').trim() === String(q.answer || '').trim()) {
        q.answerDraft = '';
        answerDraftById.delete(String(q.id));
      }
    }
  }
  return { kind: null, isNew: false };
}

async function persistActivity(activityType, payload) {
  if (isGuestActivity.value) {
    const path = guestActivityPath();
    if (!path) return null;
    const type = String(activityType || 'chat').toLowerCase();
    if (!['chat', 'question'].includes(type)) {
      throw new Error('Guests may only post chat or questions.');
    }
    const resp = await api.post(path, {
      activityType: type,
      joinIdentity: props.joinIdentity,
      displayName: ownDisplayName.value,
      payload: {
        ...payload,
        authorName: ownDisplayName.value
      }
    }, { skipGlobalLoading: true, skipAuthRedirect: true });
    return resp?.data?.id ?? null;
  }
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
  const guestPath = isGuestActivity.value ? guestActivityPath() : null;
  const base = guestPath || activityApiBase();
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
    const prevIds = new Set(seenIds);
    const newCounts = { chat: 0, polls: 0, qa: 0 };

    // Snapshot drafts before rebuilding lists so typing survives quiet polls.
    for (const q of qaItems.value) {
      const id = String(q?.id || '');
      if (!id) continue;
      const draft = String(q.answerDraft || '');
      if (draft.trim()) answerDraftById.set(id, draft);
      else answerDraftById.delete(id);
    }

    seenIds.clear();
    chatMessages.value = [];
    polls.value = [];
    qaItems.value = [];

    for (const a of list) {
      const t = String(a?.activityType || '').toLowerCase();
      if (t === 'poll_vote' || t === 'answer') continue;
      const wasNew = a?.id != null && !prevIds.has(`id:${a.id}`);
      const result = applyActivity(a);
      if (initialLoadDone && quiet && wasNew && result.isNew && result.kind) {
        newCounts[result.kind] += 1;
      }
    }
    for (const a of list) {
      const t = String(a?.activityType || '').toLowerCase();
      if (t === 'poll_vote' || t === 'answer') applyActivity(a);
    }

    // Re-apply preserved drafts onto rebuilt question rows.
    for (const q of qaItems.value) {
      const preserved = answerDraftById.get(String(q.id));
      if (preserved != null && !String(q.answerDraft || '').trim()) {
        q.answerDraft = preserved;
      }
    }

    if (initialLoadDone && quiet) {
      const viewing = panelOpen.value || props.hideChrome;
      for (const kind of ['chat', 'polls', 'qa']) {
        const n = newCounts[kind];
        if (!n) continue;
        if (viewing && tab.value === kind) continue;
        bumpUnread(kind, n);
      }
    }

    if (panelOpen.value || props.hideChrome) {
      unread[tab.value] = 0;
    }

    initialLoadDone = true;
    await nextTick();
    if (chatMessagesEl.value && tab.value === 'chat') {
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
  const options = normalizeOptions(pollOptionsText.value);
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
    tab.value = 'polls';
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
    tab.value = 'qa';
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
    q.answeredBy = ownDisplayName.value;
    q.answerDraft = '';
    answerDraftById.delete(String(q.id));
    if (id) seenIds.add(`id:${id}`);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to answer';
  } finally {
    sending.value = false;
  }
}

function startPolling() {
  stopPolling();
  if (!activityApiBase() && !guestActivityPath()) return;
  pollTimer = setInterval(() => { void loadActivity({ quiet: true }); }, Math.max(2500, Number(props.pollMs) || 4000));
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

watch(panelOpen, (open) => {
  if (open) unread[tab.value] = 0;
});

watch(tab, (t) => { unread[t] = 0; });

watch(
  () => [props.eventId, props.sessionId, props.joinToken, props.joinIdentity],
  () => {
    seenIds.clear();
    answerDraftById.clear();
    initialLoadDone = false;
    chatMessages.value = [];
    polls.value = [];
    qaItems.value = [];
    unread.chat = 0;
    unread.polls = 0;
    unread.qa = 0;
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

onUnmounted(() => {
  stopPolling();
  if (toastTimer) clearTimeout(toastTimer);
});

defineExpose({ loadActivity, open: () => { panelOpen.value = true; } });
</script>

<style scoped>
.mlap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  position: relative;
}
.mlap__toast {
  position: absolute;
  top: -6px;
  right: 8px;
  z-index: 6;
  background: #0f766e;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 999px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.2);
  animation: mlap-pop 0.25s ease-out;
}
@keyframes mlap-pop {
  from { transform: translateY(4px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
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
.mlap__badge,
.mlap__tab-badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #b91c1c;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
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
.mlap--chrome-less .mlap__panel,
.mlap--below-video .mlap__panel {
  background: #fff;
  color: #0f172a;
  border-color: #e2e8f0;
  max-height: none;
  min-height: 260px;
  flex: 1;
}
.mlap--chrome-less .mlap__panel,
.mlap--below-video .mlap__panel {
  border: 0;
  border-radius: 0;
}
.mlap--chrome-less,
.mlap--below-video {
  flex: 1;
  min-height: 0;
}
.mlap--below-video {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  min-height: 360px;
  display: flex;
  flex-direction: column;
}
.mlap--below-video .mlap__panel {
  min-height: 340px;
  max-height: min(52vh, 560px);
  flex: 1;
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
  flex-shrink: 0;
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
.mlap--embedded .mlap__tab.on,
.mlap--below-video .mlap__tab.on,
.mlap--chrome-less .mlap__tab.on {
  color: #047857;
  border-bottom-color: #047857;
}
.mlap__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.mlap__messages {
  flex: 1;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
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
.mlap--embedded .mlap__msg,
.mlap--below-video .mlap__msg,
.mlap--chrome-less .mlap__msg {
  background: #f1f5f9;
}
.mlap__msg.own {
  background: rgba(37, 99, 235, 0.28);
  margin-left: 18px;
}
.mlap--embedded .mlap__msg.own,
.mlap--below-video .mlap__msg.own,
.mlap--chrome-less .mlap__msg.own {
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
  flex-shrink: 0;
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
.mlap--embedded .mlap__input,
.mlap--below-video .mlap__input,
.mlap--chrome-less .mlap__input {
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
  flex-shrink: 0;
  background: inherit;
}
.mlap__poll {
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
  flex-shrink: 0;
}
.mlap__poll-q {
  font-weight: 700;
  margin-bottom: 8px;
}
.mlap__poll-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mlap__opt {
  text-align: left;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #f8fafc;
  cursor: pointer;
  font-size: 0.85rem;
  min-height: 40px;
}
.mlap--embedded .mlap__opt,
.mlap--below-video .mlap__opt,
.mlap--chrome-less .mlap__opt {
  background: #fff;
  border-color: #cbd5e1;
  color: #0f172a;
}
.mlap__opt.selected {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
}
.mlap--embedded .mlap__opt.selected,
.mlap--below-video .mlap__opt.selected,
.mlap--chrome-less .mlap__opt.selected {
  border-color: #059669;
  background: rgba(16, 185, 129, 0.12);
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
.mlap__qa-by {
  font-size: 0.78rem;
  color: #94a3b8;
  font-weight: 500;
}
.mlap__qa-form {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}
.mlap__error {
  margin: 0;
  padding: 8px 10px;
  color: #fecaca;
  font-size: 0.85rem;
}
.mlap--embedded .mlap__error,
.mlap--below-video .mlap__error,
.mlap--chrome-less .mlap__error {
  color: #b91c1c;
}
</style>
