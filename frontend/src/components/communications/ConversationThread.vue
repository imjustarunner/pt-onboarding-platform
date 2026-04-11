<template>
  <div class="conv-thread">
    <!-- Empty state when no client selected -->
    <div v-if="!clientId" class="conv-thread__empty">
      <div class="empty-icon">💬</div>
      <h3>Select a conversation</h3>
      <p>Pick a thread from the left, or start a new one.</p>
    </div>

    <template v-else>
      <!-- Thread header -->
      <div class="conv-thread__header">
        <button class="back-btn" type="button" aria-label="Back to list" @click="$emit('back')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div class="client-avatar" :style="avatarStyle">{{ avatarLetter }}</div>

        <div class="client-info">
          <span class="client-name">{{ clientName }}</span>
          <span class="client-phone">{{ formatPhone(clientPhone) }}</span>
        </div>

        <div class="header-actions">
          <ThreadCallButton
            :client-id="clientId"
            :client-phone="clientPhone"
            :number-id="numberId"
          />
          <a
            v-if="clientId"
            :href="clientProfileUrl"
            target="_blank"
            rel="noopener"
            class="profile-link"
            title="Open client profile"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>

      <!-- Messages -->
      <div class="conv-thread__messages" ref="messagesEl">
        <div v-if="loading" class="msg-loading">Loading…</div>

        <div v-else-if="messages.length === 0" class="msg-empty">
          No messages yet. Send one below.
        </div>

        <template v-else>
          <div
            v-for="(group, gi) in groupedMessages"
            :key="gi"
          >
            <!-- Date separator -->
            <div class="date-sep">
              <span>{{ group.label }}</span>
            </div>

            <!-- Message bubbles -->
            <div
              v-for="msg in group.messages"
              :key="msg.id"
              class="msg-row"
              :class="msg.direction === 'OUTBOUND' ? 'msg-row--out' : 'msg-row--in'"
            >
              <div class="msg-bubble" :class="msg.direction === 'OUTBOUND' ? 'bubble--out' : 'bubble--in'">
                <div v-if="msg.body" class="msg-text">{{ msg.body }}</div>
                <div v-if="mediaUrls(msg).length" class="msg-media">
                  <img
                    v-for="(url, ui) in mediaUrls(msg)"
                    :key="ui"
                    :src="url"
                    class="msg-image"
                    alt="MMS image"
                    @click="openImage(url)"
                  />
                </div>
                <div class="msg-meta">
                  <span class="msg-time">{{ msgTime(msg.created_at) }}</span>
                  <span v-if="msg.direction === 'OUTBOUND'" class="msg-status" :class="`status--${msg.delivery_status}`">
                    {{ statusLabel(msg.delivery_status) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Compose box -->
      <div class="conv-thread__compose">
        <div v-if="optedOut" class="opt-out-notice">
          Client has opted out of SMS. You cannot send messages to this number.
        </div>
        <div v-else class="compose-inner">
          <textarea
            ref="composeEl"
            v-model="draft"
            class="compose-input"
            :placeholder="`Message ${clientName || 'client'}…`"
            rows="1"
            :disabled="sending"
            @input="autoGrow"
            @keydown.enter.exact.prevent="send"
            @keydown.enter.shift.exact="null"
          />
          <div class="compose-actions">
            <span class="char-count" :class="{ 'char-count--warn': draft.length > 140 }">
              {{ draft.length }}/160
            </span>
            <button
              type="button"
              class="send-btn"
              :disabled="!draft.trim() || sending"
              @click="send"
            >
              <svg v-if="!sending" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
              <span v-else class="sending-spinner" />
            </button>
          </div>
        </div>
        <div v-if="sendError" class="send-error">{{ sendError }}</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import api from '../../services/api';
import ThreadCallButton from './ThreadCallButton.vue';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  clientId:    { type: [Number, String], default: null },
  clientName:  { type: String,           default: '' },
  clientPhone: { type: String,           default: '' },
  numberId:    { type: [Number, String], default: null },
  agencyId:    { type: [Number, String], default: null }
});

const emit = defineEmits(['back', 'message-sent']);

const auth = useAuthStore();
const authUser = computed(() => auth.user?.value ?? auth.user ?? null);

const messages   = ref([]);
const loading    = ref(false);
const draft      = ref('');
const sending    = ref(false);
const sendError  = ref('');
const optedOut   = ref(false);
const messagesEl = ref(null);
const composeEl  = ref(null);

const clientProfileUrl = computed(() => {
  if (!props.clientId) return '#';
  const u = authUser.value;
  const slug = u?.currentAgencySlug || u?.agency_slug || '';
  if (slug) return `/${slug}/admin/clients/${props.clientId}`;
  return `/admin/clients/${props.clientId}`;
});

const palette = ['#dbeafe', '#d1fae5', '#fce7f3', '#fef3c7', '#ede9fe', '#fee2e2', '#e0f2fe'];
const darkColors = ['#1d4ed8', '#065f46', '#9d174d', '#92400e', '#5b21b6', '#991b1b', '#0369a1'];
const avatarStyle = computed(() => {
  const idx = (Number(props.clientId) || 0) % palette.length;
  return { background: palette[idx], color: darkColors[idx] };
});

const avatarLetter = computed(() => {
  const name = props.clientName || '?';
  return name[0].toUpperCase();
});

// Group messages by date
const groupedMessages = computed(() => {
  const groups = [];
  let currentLabel = '';
  let currentGroup = null;

  const sorted = [...messages.value].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const msg of sorted) {
    const label = dateLabel(msg.created_at);
    if (label !== currentLabel) {
      currentLabel = label;
      currentGroup = { label, messages: [] };
      groups.push(currentGroup);
    }
    currentGroup.messages.push(msg);
  }
  return groups;
});

function dateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function msgTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function statusLabel(s) {
  if (s === 'sent' || s === 'delivered') return '✓';
  if (s === 'failed') return '!';
  return '';
}

function mediaUrls(msg) {
  return msg?.metadata?.media_urls || [];
}

function formatPhone(p) {
  if (!p) return '';
  const d = String(p).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

function openImage(url) {
  window.open(url, '_blank', 'noopener');
}

async function loadThread() {
  if (!props.clientId) { messages.value = []; return; }
  loading.value = true;
  sendError.value = '';
  optedOut.value = false;
  try {
    const uid = authUser.value?.id;
    const res = await api.get(`/messages/thread/${uid}/${props.clientId}`);
    messages.value = Array.isArray(res.data?.messages) ? res.data.messages : [];
    await nextTick();
    scrollBottom();
  } catch (e) {
    const msg = e?.response?.data?.error?.message || '';
    if (msg.toLowerCase().includes('opted out')) optedOut.value = true;
    messages.value = [];
  } finally {
    loading.value = false;
  }
}

function scrollBottom() {
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  }
}

function autoGrow() {
  if (!composeEl.value) return;
  composeEl.value.style.height = 'auto';
  composeEl.value.style.height = Math.min(composeEl.value.scrollHeight, 120) + 'px';
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value || !props.clientId) return;
  sending.value = true;
  sendError.value = '';
  try {
    const payload = {
      clientId: props.clientId,
      body: text
    };
    if (props.numberId) payload.numberId = props.numberId;
    const res = await api.post('/messages/send', payload);
    draft.value = '';
    if (composeEl.value) { composeEl.value.style.height = 'auto'; }
    messages.value.push(res.data);
    await nextTick();
    scrollBottom();
    emit('message-sent', res.data);
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Failed to send message.';
  } finally {
    sending.value = false;
  }
}

defineExpose({ reload: loadThread });

watch(() => props.clientId, () => { loadThread(); draft.value = ''; sendError.value = ''; }, { immediate: true });
</script>

<style scoped>
.conv-thread {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface-card, #fafbfc);
}

/* Empty placeholder */
.conv-thread__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-secondary, #6c7785);
  padding: 40px;
}
.conv-thread__empty .empty-icon { font-size: 3rem; margin-bottom: 16px; opacity: 0.5; }
.conv-thread__empty h3 { margin: 0 0 8px; font-size: 1.1rem; color: var(--text-primary, #1a1a2e); }
.conv-thread__empty p  { margin: 0; font-size: 0.875rem; }

/* Header */
.conv-thread__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e6e8ec);
  background: var(--surface-card, #fff);
  flex-shrink: 0;
}

.back-btn {
  display: none; /* shown only on mobile via media query */
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #6c7785);
  padding: 4px;
  border-radius: 4px;
  flex-shrink: 0;
}
.back-btn svg { width: 20px; height: 20px; }
.back-btn:hover { background: #f1f3f5; }

.client-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.95rem;
  flex-shrink: 0;
}

.client-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.client-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary, #1a1a2e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.client-phone {
  font-size: 0.78rem;
  color: var(--text-secondary, #6c7785);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.profile-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border, #d4d8de);
  color: var(--text-secondary, #6c7785);
  text-decoration: none;
  transition: background 0.1s;
}
.profile-link:hover { background: #f0f2f4; color: var(--text-primary, #1a1a2e); }
.profile-link svg { width: 15px; height: 15px; }

/* Messages scroll area */
.conv-thread__messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scroll-behavior: smooth;
}

.msg-loading, .msg-empty {
  text-align: center;
  color: var(--text-secondary, #9ca3af);
  font-size: 0.85rem;
  padding: 40px 0;
}

/* Date separator */
.date-sep {
  display: flex;
  align-items: center;
  margin: 14px 0 10px;
  gap: 10px;
}
.date-sep::before, .date-sep::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border, #e6e8ec);
}
.date-sep span {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

/* Message row */
.msg-row {
  display: flex;
  margin: 2px 0;
}
.msg-row--out { justify-content: flex-end; }
.msg-row--in  { justify-content: flex-start; }

/* Bubble */
.msg-bubble {
  max-width: 72%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bubble--out {
  background: #2563eb;
  color: #fff;
  border-radius: 18px 18px 4px 18px;
  padding: 10px 14px;
  align-items: flex-end;
}

.bubble--in {
  background: #fff;
  color: var(--text-primary, #1a1a2e);
  border: 1px solid var(--border, #e6e8ec);
  border-radius: 18px 18px 18px 4px;
  padding: 10px 14px;
  align-items: flex-start;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.msg-text { font-size: 0.9rem; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }

.msg-media { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.msg-image { max-width: 200px; max-height: 200px; border-radius: 8px; cursor: pointer; object-fit: cover; }

.msg-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; }

.msg-time {
  font-size: 0.68rem;
  opacity: 0.7;
}

.msg-status { font-size: 0.68rem; opacity: 0.7; }
.status--failed { color: #fca5a5; font-weight: 700; }

/* Compose */
.conv-thread__compose {
  border-top: 1px solid var(--border, #e6e8ec);
  background: var(--surface-card, #fff);
  padding: 12px 16px;
  flex-shrink: 0;
}

.opt-out-notice {
  font-size: 0.83rem;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 10px 14px;
  text-align: center;
}

.compose-inner {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  border: 1px solid var(--border, #d4d8de);
  border-radius: 12px;
  padding: 6px 6px 6px 12px;
  background: #fff;
  transition: border-color 0.15s;
}
.compose-inner:focus-within { border-color: #7aa2ff; box-shadow: 0 0 0 3px rgba(122, 162, 255, 0.12); }

.compose-input {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  font-size: 0.9rem;
  font-family: inherit;
  line-height: 1.45;
  background: transparent;
  color: var(--text-primary, #1a1a2e);
  min-height: 36px;
  max-height: 120px;
  overflow-y: auto;
}
.compose-input::placeholder { color: #9ca3af; }
.compose-input:disabled { opacity: 0.5; }

.compose-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.char-count {
  font-size: 0.7rem;
  color: var(--text-secondary, #9ca3af);
}
.char-count--warn { color: #f59e0b; font-weight: 600; }

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #2563eb;
  border: none;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, transform 0.1s;
}
.send-btn svg { width: 18px; height: 18px; }
.send-btn:hover:not(:disabled) { background: #1d4ed8; transform: scale(1.05); }
.send-btn:disabled { background: #cbd5e1; cursor: not-allowed; }

.sending-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.send-error {
  font-size: 0.8rem;
  color: #dc2626;
  margin-top: 6px;
  padding: 0 4px;
}

/* Mobile: show back button */
@media (max-width: 768px) {
  .back-btn { display: flex; }
}
</style>
