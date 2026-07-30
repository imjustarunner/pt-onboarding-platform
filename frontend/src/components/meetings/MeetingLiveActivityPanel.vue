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

    <div class="mlap__bar">
      <button
        type="button"
        class="mlap__toggle"
        :class="{ on: panelOpen }"
        title="Chat, polls & Q&A"
        @click="openPanel"
      >
        {{ panelOpen ? 'Hide chat' : 'Chat & polls' }}
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

    <div v-if="panelOpen" class="mlap__panel">
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
            :style="{ '--mlap-user-color': m.color }"
          >
            <span class="mlap__sender" :style="{ color: m.color }">{{ m.senderLabel }}</span>
            <img v-if="m.imageUrl" :src="m.imageUrl" alt="" class="mlap__img" />
            <span v-if="m.text" class="mlap__text">{{ m.text }}</span>
          </div>
        </div>
        <div v-if="emojiOpen" class="mlap__emoji-tray">
          <button
            v-for="em in emojiList"
            :key="em"
            type="button"
            class="mlap__emoji-btn"
            @click="insertEmoji(em)"
          >{{ em }}</button>
        </div>
        <form class="mlap__form mlap__form--rich" @submit.prevent="sendChatMessage">
          <button type="button" class="mlap__icon-btn" title="Emoji" @click="emojiOpen = !emojiOpen">😊</button>
          <label class="mlap__icon-btn" title="Share photo">
            📷
            <input type="file" accept="image/*" class="mlap__file" :disabled="sending" @change="onChatPhoto" />
          </label>
          <input
            v-model="chatInput"
            type="text"
            class="mlap__input"
            placeholder="Type a message…"
            maxlength="2000"
            :disabled="sending"
          />
          <button type="submit" class="btn btn-primary btn-sm" :disabled="sending || (!chatInput.trim() && !pendingImageUrl)">
            Send
          </button>
        </form>
        <p v-if="pendingImageUrl" class="mlap__pending-img">
          Photo ready to send
          <button type="button" class="mw-link-btn" @click="pendingImageUrl = ''">Remove</button>
        </p>
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
            <div class="mlap__qa-head">
              <strong>Q:</strong> {{ q.text }}
              <span class="mlap__qa-mode">{{ qaModeLabel(q.answerMode) }}</span>
            </div>

            <!-- one: shared official answer -->
            <template v-if="q.answerMode === 'one'">
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
            </template>

            <!-- multi / expected: per-person answers -->
            <template v-else>
              <div v-if="!(q.answers || []).length" class="mlap__qa-empty muted">No answers yet.</div>
              <div v-for="a in (q.answers || [])" :key="a.id" class="mlap__qa-a">
                <strong>{{ a.authorName }}:</strong> {{ a.text }}
                <button
                  v-if="q.answerMode === 'multi' && a.isOwn"
                  type="button"
                  class="mlap__qa-del"
                  :disabled="sending"
                  @click="deleteOwnAnswer(q, a)"
                >Delete</button>
                <button
                  v-if="a.isOwn"
                  type="button"
                  class="mlap__qa-edit"
                  @click="q.answerDraft = a.text"
                >Edit</button>
              </div>
              <div class="mlap__qa-form">
                <input
                  v-model="q.answerDraft"
                  type="text"
                  class="mlap__input"
                  :placeholder="ownAnswerFor(q) ? 'Update your answer…' : 'Your answer…'"
                />
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="sending || !q.answerDraft?.trim()"
                  @click="submitAnswer(q)"
                >
                  {{ ownAnswerFor(q) ? 'Update' : 'Post answer' }}
                </button>
              </div>
            </template>
          </div>
        </div>
        <form class="mlap__form mlap__form--qa" @submit.prevent="submitQuestion">
          <input
            v-model="questionInput"
            type="text"
            class="mlap__input"
            placeholder="Ask a question…"
            maxlength="500"
            :disabled="sending"
          />
          <select v-model="questionAnswerMode" class="mlap__select" title="Answer mode">
            <option value="one">One answer (shared)</option>
            <option value="multi">Multiple answers (own delete OK)</option>
            <option value="expected">Everyone answers (no delete)</option>
          </select>
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

const emit = defineEmits(['update:open', 'activity-notice']);
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
const questionAnswerMode = ref('one');
const qaItems = ref([]);
const chatMessagesEl = ref(null);
const toastText = ref('');
const emojiOpen = ref(false);
const pendingImageUrl = ref('');
const unread = reactive({ chat: 0, polls: 0, qa: 0 });
const seenIds = new Set();
/** Preserve Q&A answer drafts across activity reloads (poll every ~4s was wiping inputs). */
const answerDraftById = new Map();
const emojiList = ['👍', '❤️', '😊', '🎉', '👏', '💡', '🙏', '🔥', '✅', '😅', '😮', '🎯'];
const CHAT_COLORS = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#4f46e5', '#0d9488', '#ca8a04'];
let pollTimer = null;
let toastTimer = null;
let initialLoadDone = false;

function colorForIdentity(identity) {
  const s = String(identity || 'anon');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i);
  return CHAT_COLORS[Math.abs(h) % CHAT_COLORS.length];
}

function qaModeLabel(mode) {
  if (mode === 'multi') return 'Multiple answers';
  if (mode === 'expected') return 'Everyone answers';
  return 'One answer';
}

function ownAnswerFor(q) {
  return (q?.answers || []).find((a) => a.isOwn) || null;
}

function insertEmoji(em) {
  chatInput.value = `${chatInput.value || ''}${em}`;
  emojiOpen.value = false;
}

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
  emit('update:open', panelOpen.value);
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
      imageUrl: payload.imageUrl || payload.image_url || '',
      senderLabel: senderLabel(a.participantIdentity, payload),
      color: colorForIdentity(a.participantIdentity),
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
    const mode = ['one', 'multi', 'expected'].includes(String(payload.answerMode || '').toLowerCase())
      ? String(payload.answerMode).toLowerCase()
      : 'one';
    qaItems.value.push({
      id: qid,
      text: payload.text || '',
      answerMode: mode,
      answer: null,
      answeredBy: '',
      answers: [],
      answerDraft: answerDraftById.get(String(qid)) || ''
    });
    return { kind: 'qa', isNew: !isOwn };
  }
  if (type === 'answer') {
    const q = qaItems.value.find((x) => String(x.id) === String(payload.inReplyToId));
    if (q) {
      const authorName = payload.authorName || senderLabel(a.participantIdentity, payload) || '';
      const answerRow = {
        id: key || `ans-${Date.now()}`,
        text: payload.text || '',
        authorName,
        identity: String(a.participantIdentity || ''),
        isOwn,
        deleted: !!payload.deleted
      };
      if (q.answerMode === 'one') {
        if (!payload.deleted) {
          q.answer = answerRow.text;
          q.answeredBy = authorName;
        }
      } else if (payload.deleted) {
        q.answers = (q.answers || []).filter((x) => x.identity !== answerRow.identity);
      } else {
        const existing = (q.answers || []).findIndex((x) => x.identity === answerRow.identity);
        if (existing >= 0) q.answers[existing] = answerRow;
        else q.answers = [...(q.answers || []), answerRow];
      }
      if (String(q.answerDraft || '').trim() === String(answerRow.text || '').trim()) {
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
      const viewing = panelOpen.value;
      for (const kind of ['chat', 'polls', 'qa']) {
        const n = newCounts[kind];
        if (!n) continue;
        // Always notify parents (e.g. fullscreen video toast); unread badges only when not viewing that tab.
        let notice = '';
        if (kind === 'chat') notice = `New chat message${n > 1 ? 's' : ''}`;
        else if (kind === 'polls') notice = n > 1 ? 'New polls' : 'New poll';
        else if (kind === 'qa') notice = n > 1 ? 'New questions' : 'New question';
        if (notice) emit('activity-notice', { kind, text: notice, amount: n });
        if (viewing && tab.value === kind) continue;
        bumpUnread(kind, n);
      }
    }

    if (panelOpen.value) {
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

async function onChatPhoto(ev) {
  const file = ev?.target?.files?.[0];
  if (ev?.target) ev.target.value = '';
  if (!file || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post('/messages/upload-media', fd, { skipGlobalLoading: true });
    const url = String(res?.data?.url || res?.data?.mediaUrl || res?.data?.path || '').trim();
    if (!url) throw new Error('Upload did not return a URL');
    pendingImageUrl.value = url;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to upload photo';
  } finally {
    sending.value = false;
  }
}

async function sendChatMessage() {
  const text = String(chatInput.value || '').trim();
  const imageUrl = String(pendingImageUrl.value || '').trim();
  if ((!text && !imageUrl) || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const id = await persistActivity('chat', { text, imageUrl: imageUrl || undefined });
    chatInput.value = '';
    pendingImageUrl.value = '';
    applyActivity({
      id: id || `local-chat-${Date.now()}`,
      participantIdentity: ownIdentity.value,
      activityType: 'chat',
      payload: { text, imageUrl, authorName: ownDisplayName.value }
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
    const answerMode = String(questionAnswerMode.value || 'one');
    const id = await persistActivity('question', { id: localId, text, answerMode });
    questionInput.value = '';
    applyActivity({
      id: id || localId,
      participantIdentity: ownIdentity.value,
      activityType: 'question',
      payload: { id: id || localId, text, answerMode, authorName: ownDisplayName.value }
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
  if (q.answerMode === 'one' && !canAnswerQuestions.value) {
    error.value = 'Only hosts or staff can post the shared answer.';
    return;
  }
  sending.value = true;
  error.value = '';
  try {
    const id = await persistActivity('answer', {
      inReplyToId: q.id,
      text,
      answerMode: q.answerMode || 'one'
    });
    applyActivity({
      id: id || `local-ans-${Date.now()}`,
      participantIdentity: ownIdentity.value,
      activityType: 'answer',
      payload: {
        inReplyToId: q.id,
        text,
        authorName: ownDisplayName.value,
        answerMode: q.answerMode || 'one'
      }
    });
    q.answerDraft = '';
    answerDraftById.delete(String(q.id));
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to answer';
  } finally {
    sending.value = false;
  }
}

async function deleteOwnAnswer(q, a) {
  if (!q || !a?.isOwn || q.answerMode !== 'multi' || sending.value) return;
  sending.value = true;
  error.value = '';
  try {
    const id = await persistActivity('answer', {
      inReplyToId: q.id,
      text: a.text || '',
      deleted: true,
      answerMode: 'multi'
    });
    applyActivity({
      id: id || `local-del-${Date.now()}`,
      participantIdentity: ownIdentity.value,
      activityType: 'answer',
      payload: {
        inReplyToId: q.id,
        text: a.text || '',
        deleted: true,
        authorName: ownDisplayName.value,
        answerMode: 'multi'
      }
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to delete answer';
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
  emit('update:open', open);
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
  panelOpen.value = !!v;
});

onMounted(() => {
  panelOpen.value = !!props.startOpen;
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
.mlap--below-video:not(.mlap--open) {
  min-height: 0;
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  overflow: visible;
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
.mlap__sender { font-weight: 700; font-size: 0.78rem; display: block; margin-bottom: 2px; }
.mlap__img {
  display: block;
  max-width: 220px;
  max-height: 160px;
  border-radius: 8px;
  margin: 4px 0;
  object-fit: cover;
}
.mlap__form--rich { align-items: center; }
.mlap__form--qa { flex-wrap: wrap; }
.mlap__icon-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
}
.mlap__file {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.mlap__emoji-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 0;
}
.mlap__emoji-btn {
  border: none;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 1.1rem;
}
.mlap__pending-img {
  margin: 0;
  font-size: 0.78rem;
  color: #64748b;
  display: flex;
  gap: 8px;
  align-items: center;
}
.mlap__select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.8rem;
  min-width: 160px;
}
.mlap__qa-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.mlap__qa-mode {
  font-size: 0.7rem;
  font-weight: 700;
  color: #6366f1;
  background: #eef2ff;
  border-radius: 999px;
  padding: 2px 8px;
}
.mlap__qa-del,
.mlap__qa-edit {
  margin-left: 8px;
  border: none;
  background: none;
  color: #6366f1;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.mlap__qa-del { color: #b91c1c; }
.mlap__qa-empty { font-size: 0.8rem; margin-top: 6px; }
.mlap__msg { border-left: 3px solid var(--mlap-user-color, #94a3b8); padding-left: 8px; }
</style>
