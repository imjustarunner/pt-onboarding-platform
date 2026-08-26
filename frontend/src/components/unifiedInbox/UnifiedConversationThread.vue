<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import DirectoryRecipientInput from './DirectoryRecipientInput.vue';

const props = defineProps({
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  inbox: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['reply', 'patch', 'draft']);

const composerMode = ref('reply'); // reply | reply_all | forward | internal
const showCcBcc = ref(false);
const to = ref('');
const cc = ref('');
const bcc = ref('');
const subject = ref('');
const body = ref('');
const sending = ref(false);
const sendError = ref('');
const showSnooze = ref(false);
const confirmOpen = ref(false);
const pendingWarnings = ref([]);

const conv = computed(() => props.detail?.conversation || null);
const messages = computed(() => props.detail?.messages || []);

watch(
  () => props.detail?.conversation?.id,
  () => {
    sendError.value = '';
    composerMode.value = 'reply';
    showCcBcc.value = false;
    confirmOpen.value = false;
    body.value = props.detail?.conversation?.draft_body || '';
    subject.value = props.detail?.conversation?.subject || '';
    const primary = props.detail?.context?.participants?.find((p) => p.is_primary)
      || props.detail?.context?.participants?.[0];
    to.value = primary?.email || '';
    cc.value = '';
    bcc.value = '';
  }
);

watch(body, (v) => emit('draft', v));

function channelIcon(ch) {
  const m = { email: '✉', secure: '💬', sms: '📱', call: '📞', voicemail: '📞', internal: '👥', mention: '@' };
  return m[ch] || '✉';
}

function formatWhen(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fromLabel(msg) {
  if (msg.is_internal_note) {
    const n = [msg.author_first_name, msg.author_last_name].filter(Boolean).join(' ');
    return n ? `${n} (internal note)` : 'Internal note';
  }
  return msg.from?.name || msg.from?.email || (msg.direction === 'outbound' ? (props.inbox?.from_email || 'You') : 'Sender');
}

async function send({ skipConfirm = false } = {}) {
  if (!conv.value) return;
  sending.value = true;
  sendError.value = '';
  try {
    if (composerMode.value !== 'internal' && !skipConfirm) {
      const { data: pre } = await api.post(
        '/communications/send-preflight',
        {
          agencyId: props.agencyId,
          inboxId: conv.value.inbox_id,
          to: to.value,
          cc: cc.value,
          bcc: bcc.value,
          subject: subject.value,
          text: body.value,
          fromEmail: props.inbox?.from_email || conv.value.inbox_from_email
        },
        { skipGlobalLoading: true }
      );
      if (pre?.warnings?.length) {
        pendingWarnings.value = pre.warnings;
        confirmOpen.value = true;
        sending.value = false;
        return;
      }
    }
    const { data } = await api.post(`/communications/conversations/${conv.value.id}/reply`, {
      mode: composerMode.value,
      isInternalNote: composerMode.value === 'internal',
      text: body.value,
      to: to.value,
      cc: cc.value,
      bcc: bcc.value,
      subject: subject.value,
      setStatus: composerMode.value === 'internal' ? undefined : 'waiting_on_them'
    });
    body.value = '';
    confirmOpen.value = false;
    emit('reply', data);
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || e?.message || 'Send failed';
  } finally {
    sending.value = false;
  }
}

function setMode(mode) {
  composerMode.value = mode;
  if (mode === 'reply_all' || mode === 'forward') showCcBcc.value = true;
}
</script>

<template>
  <main class="uc-thread">
    <div v-if="loading" class="uc-thread-empty">Loading conversation…</div>
    <div v-else-if="!conv" class="uc-thread-empty">
      <h3>Select a conversation</h3>
      <p>Pick a thread from the list, or compose a new message.</p>
    </div>
    <template v-else>
      <header class="uc-thread-head">
        <div>
          <h3>
            {{ conv.subject || '(no subject)' }}
            <span class="uc-channel-pill">{{ channelIcon(conv.channel) }} {{ conv.channel }}</span>
          </h3>
          <p class="uc-meta">
            Inbox: {{ conv.inbox_from_email || conv.inbox_display_name || '—' }}
            <template v-if="conv.owner_first_name">
              · Owner: {{ conv.owner_first_name }} {{ conv.owner_last_name }}
            </template>
          </p>
        </div>
        <div class="uc-thread-actions">
          <button type="button" class="uc-btn ghost" title="Star" @click="emit('patch', { starred: !conv.starred })">
            {{ conv.starred ? '★' : '☆' }}
          </button>
          <button type="button" class="uc-btn ghost" @click="emit('patch', { markUnread: true })">Mark unread</button>
          <button type="button" class="uc-btn ghost" @click="emit('patch', { archive: true })">Archive</button>
          <div class="uc-snooze-wrap">
            <button type="button" class="uc-btn ghost" @click="showSnooze = !showSnooze">Snooze</button>
            <div v-if="showSnooze" class="uc-snooze-menu">
              <button type="button" @click="emit('patch', { snoozePreset: 'later_today' }); showSnooze = false">Later today</button>
              <button type="button" @click="emit('patch', { snoozePreset: 'tomorrow' }); showSnooze = false">Tomorrow</button>
              <button type="button" @click="emit('patch', { snoozePreset: 'next_week' }); showSnooze = false">Next week</button>
              <button type="button" @click="emit('patch', { clearSnooze: true }); showSnooze = false">Clear snooze</button>
            </div>
          </div>
        </div>
      </header>

      <div class="uc-messages">
        <article
          v-for="msg in messages"
          :key="msg.id"
          class="uc-msg"
          :class="{ internal: msg.is_internal_note, outbound: msg.direction === 'outbound' }"
        >
          <div class="uc-msg-head">
            <span class="uc-ch">{{ channelIcon(msg.channel) }}</span>
            <strong>{{ fromLabel(msg) }}</strong>
            <time>{{ formatWhen(msg.sent_at || msg.created_at) }}</time>
            <span v-if="msg.is_internal_note" class="uc-tag">Internal</span>
            <span v-else-if="msg.direction === 'inbound'" class="uc-tag ext">External</span>
          </div>
          <div v-if="msg.body_html" class="uc-msg-body" v-html="msg.body_html" />
          <div v-else class="uc-msg-body">{{ msg.body_text }}</div>
          <ul v-if="msg.attachments?.length" class="uc-atts">
            <li v-for="a in msg.attachments" :key="a.id">📎 {{ a.filename }}</li>
          </ul>
        </article>
      </div>

      <footer class="uc-composer">
        <div class="uc-composer-tabs">
          <button type="button" :class="{ on: composerMode === 'reply' }" @click="setMode('reply')">Reply</button>
          <button type="button" :class="{ on: composerMode === 'reply_all' }" @click="setMode('reply_all')">Reply all</button>
          <button type="button" :class="{ on: composerMode === 'forward' }" @click="setMode('forward')">Forward</button>
          <button type="button" :class="{ on: composerMode === 'internal' }" @click="setMode('internal')">Internal note</button>
          <button type="button" class="linkish" @click="showCcBcc = !showCcBcc">CC / BCC</button>
        </div>

        <div v-if="composerMode !== 'internal'" class="uc-addr">
          <label>To <DirectoryRecipientInput v-model="to" :agency-id="agencyId" /></label>
          <template v-if="showCcBcc || composerMode === 'reply_all' || composerMode === 'forward'">
            <label>CC <DirectoryRecipientInput v-model="cc" :agency-id="agencyId" /></label>
            <label>BCC <DirectoryRecipientInput v-model="bcc" :agency-id="agencyId" /></label>
          </template>
          <label v-if="composerMode === 'forward'">Subject <input v-model="subject" type="text" /></label>
        </div>

        <textarea
          v-model="body"
          class="uc-body-input"
          :placeholder="composerMode === 'internal' ? 'Internal note (not sent externally)…' : 'Write your reply…'"
          rows="5"
        />

        <div v-if="sendError" class="uc-send-err">{{ sendError }}</div>
        <div v-if="confirmOpen" class="uc-confirm-inline">
          <strong>Review before sending</strong>
          <ul>
            <li v-for="(w, i) in pendingWarnings" :key="i">{{ w.message }}</li>
          </ul>
          <div class="uc-composer-bar">
            <button type="button" class="uc-btn ghost" @click="confirmOpen = false">Go back</button>
            <button type="button" class="uc-btn primary" :disabled="sending" @click="send({ skipConfirm: true })">
              Send anyway
            </button>
          </div>
        </div>

        <div class="uc-composer-bar">
          <button type="button" class="uc-btn primary" :disabled="sending || !body.trim()" @click="send()">
            {{ sending ? 'Sending…' : (composerMode === 'internal' ? 'Add note' : 'Send') }}
          </button>
          <button type="button" class="uc-btn ghost" @click="emit('patch', { status: 'follow_up', snoozePreset: 'tomorrow' })">
            Follow up
          </button>
          <button type="button" class="uc-btn ghost" @click="emit('patch', { status: 'waiting_on_them' })">
            Waiting on them
          </button>
          <span v-if="inbox?.from_email" class="uc-from-hint">Sending as {{ inbox.from_email }}</span>
        </div>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.uc-thread {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #fff;
}
.uc-thread-empty {
  margin: auto;
  text-align: center;
  color: #94a3b8;
  padding: 40px 20px;
}
.uc-thread-empty h3 { color: #334155; margin: 0 0 6px; }
.uc-thread-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}
.uc-thread-head h3 {
  margin: 0;
  font-size: 1.05rem;
  color: #0f172a;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.uc-channel-pill {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: capitalize;
  background: #e2e8f0;
  color: #475569;
  padding: 2px 8px;
  border-radius: 999px;
}
.uc-meta { margin: 4px 0 0; font-size: 0.8rem; color: #64748b; }
.uc-thread-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; }
.uc-snooze-wrap { position: relative; }
.uc-snooze-menu {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 5;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  min-width: 140px;
  padding: 4px;
}
.uc-snooze-menu button {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.uc-snooze-menu button:hover { background: #f1f5f9; }

.uc-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.uc-msg {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
}
.uc-msg.internal { background: #fffbeb; border-color: #fde68a; }
.uc-msg.outbound { background: #f8fafc; }
.uc-msg-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.85rem;
}
.uc-msg-head time { color: #94a3b8; margin-left: auto; font-size: 0.75rem; }
.uc-tag {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
}
.uc-tag.ext { background: #ffedd5; color: #9a3412; }
.uc-msg-body {
  font-size: 0.92rem;
  line-height: 1.5;
  white-space: pre-wrap;
  color: #1e293b;
}
.uc-atts { margin: 8px 0 0; padding: 0; list-style: none; font-size: 0.8rem; color: #64748b; }

.uc-composer {
  border-top: 1px solid #e2e8f0;
  padding: 12px 14px 14px;
  background: #f8fafc;
}
.uc-composer-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.uc-composer-tabs button {
  border: none;
  background: transparent;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}
.uc-composer-tabs button.on { background: #dcfce7; color: #14532d; }
.uc-composer-tabs .linkish { font-weight: 500; text-decoration: underline; }
.uc-addr {
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
}
.uc-addr label {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 8px;
  align-items: center;
  font-size: 0.8rem;
  color: #64748b;
}
.uc-addr input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 0.85rem;
}
.uc-body-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.92rem;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
  box-sizing: border-box;
}
.uc-composer-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}
.uc-from-hint { margin-left: auto; font-size: 0.75rem; color: #94a3b8; }
.uc-send-err { color: #b91c1c; font-size: 0.85rem; margin-top: 6px; }
.uc-confirm-inline {
  margin-top: 8px;
  padding: 10px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  font-size: 0.85rem;
}
.uc-confirm-inline ul { margin: 6px 0 0; padding-left: 18px; }
.uc-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  color: #334155;
}
.uc-btn.primary {
  background: #166534;
  border-color: #166534;
  color: #fff;
}
.uc-btn.primary:disabled { opacity: 0.55; cursor: not-allowed; }
.uc-btn.ghost { background: transparent; }
.uc-btn:hover { border-color: #166534; }
</style>
