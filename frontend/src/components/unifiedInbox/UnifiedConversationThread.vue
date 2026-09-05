<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
import DirectoryRecipientInput from './DirectoryRecipientInput.vue';

const props = defineProps({
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  inbox: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['reply', 'patch', 'draft', 'spam', 'insight', 'open-sms-tools', 'refresh']);

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
const showSchedule = ref(false);
const schedulePreset = ref(null);
const confirmOpen = ref(false);
const pendingWarnings = ref([]);
const undoBanner = ref(null);
const insight = ref(null);
const insightBusy = ref(false);
const aiBusy = ref(false);
const trustBusy = ref(false);
let undoTimer = null;

const conv = computed(() => props.detail?.conversation || null);
const messages = computed(() => props.detail?.messages || []);
const isSms = computed(() => String(conv.value?.channel || '') === 'sms');
const isCallLike = computed(() => ['call', 'voicemail'].includes(String(conv.value?.channel || '')));
const isTelephony = computed(() => isSms.value || isCallLike.value);
const primaryEmail = computed(() => {
  const primary = props.detail?.context?.participants?.find((p) => p.is_primary)
    || props.detail?.context?.participants?.[0];
  return String(primary?.email || '').trim().toLowerCase() || null;
});

async function markKnown() {
  if (!conv.value?.id) return;
  trustBusy.value = true;
  try {
    await api.post(
      `/communications/conversations/${conv.value.id}/resolve-unknown`,
      { mode: 'known_only' },
      {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      }
    );
    emit('refresh');
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not mark known';
  } finally {
    trustBusy.value = false;
  }
}

async function addContact() {
  if (!primaryEmail.value || !props.agencyId) return;
  // Prefer Hub resolve flow when available; fall back to display-name prompt for Center
  const name = window.prompt('Display name for this contact (optional):', '') || null;
  trustBusy.value = true;
  try {
    await api.post(
      `/communications/conversations/${conv.value.id}/resolve-unknown`,
      {
        mode: 'new_contact',
        fullName: name,
        email: primaryEmail.value
      },
      {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      }
    );
    emit('refresh');
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not add contact';
  } finally {
    trustBusy.value = false;
  }
}

async function blockSender() {
  if (!primaryEmail.value || !props.agencyId) return;
  const reason = window.prompt('Block reason (required):', '');
  if (!reason || !String(reason).trim()) return;
  trustBusy.value = true;
  try {
    await api.post('/communications/contacts/block', {
      agencyId: props.agencyId,
      email: primaryEmail.value,
      reason: String(reason).trim(),
      conversationId: conv.value?.id || null
    }, { skipGlobalLoading: true });
    emit('refresh');
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not block sender';
  } finally {
    trustBusy.value = false;
  }
}

function smsDeepLinkIds() {
  const ext = String(conv.value?.external_thread_id || '');
  const clientMatch = ext.match(/^sms:client:(\d+)$/);
  const contactMatch = ext.match(/^sms:contact:(\d+)$/);
  const linkedClient = props.detail?.context?.linkedTo?.client?.id;
  return {
    clientId: clientMatch ? Number(clientMatch[1]) : linkedClient || null,
    contactId: contactMatch ? Number(contactMatch[1]) : null
  };
}

watch(
  () => props.detail?.conversation?.id,
  () => {
    sendError.value = '';
    composerMode.value = isCallLike.value ? 'internal' : 'reply';
    showCcBcc.value = false;
    confirmOpen.value = false;
    showSchedule.value = false;
    schedulePreset.value = null;
    clearUndoBanner();
    insight.value = props.detail?.conversation?.ai_summary
      ? {
          summary: props.detail.conversation.ai_summary,
          suggestedAction: props.detail.conversation.ai_suggested_action,
          cached: true
        }
      : null;
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
onUnmounted(() => clearUndoBanner());

function clearUndoBanner() {
  undoBanner.value = null;
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }
}

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
  if (msg.send_status === 'scheduled') return 'Scheduled send';
  return msg.from?.name || msg.from?.email || (msg.direction === 'outbound' ? (props.inbox?.from_email || 'You') : 'Sender');
}

async function send({ skipConfirm = false } = {}) {
  if (!conv.value) return;
  sending.value = true;
  sendError.value = '';
  try {
    if (composerMode.value !== 'internal' && !isSms.value && !skipConfirm) {
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
    const payload = {
      mode: composerMode.value,
      isInternalNote: composerMode.value === 'internal',
      text: body.value,
      to: to.value,
      cc: cc.value,
      bcc: bcc.value,
      subject: subject.value,
      setStatus: composerMode.value === 'internal' ? undefined : 'waiting_on_them'
    };
    if (schedulePreset.value) payload.schedulePreset = schedulePreset.value;
    const { data } = await api.post(`/communications/conversations/${conv.value.id}/reply`, payload);
    body.value = '';
    confirmOpen.value = false;
    schedulePreset.value = null;
    showSchedule.value = false;
    if (data?.scheduled && data?.messageId) {
      const expires = data.undoExpiresAt || data.scheduledSendAt;
      undoBanner.value = {
        messageId: data.messageId,
        expiresAt: expires ? new Date(expires).getTime() : Date.now() + 20000
      };
      const ms = Math.max(1000, (undoBanner.value.expiresAt - Date.now()));
      undoTimer = setTimeout(() => {
        undoBanner.value = null;
      }, ms);
    }
    emit('reply', data);
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || e?.message || 'Send failed';
  } finally {
    sending.value = false;
  }
}

async function undoSend() {
  if (!conv.value || !undoBanner.value?.messageId) return;
  try {
    const { data } = await api.post(
      `/communications/conversations/${conv.value.id}/messages/${undoBanner.value.messageId}/undo`,
      {},
      { skipGlobalLoading: true }
    );
    clearUndoBanner();
    emit('reply', data);
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Undo failed';
    clearUndoBanner();
  }
}

function setMode(mode) {
  if (isCallLike.value && mode !== 'internal') return;
  composerMode.value = mode;
  if (mode === 'reply_all' || mode === 'forward') showCcBcc.value = true;
}

function openSmsTools() {
  emit('open-sms-tools', smsDeepLinkIds());
}

async function printThread() {
  if (!conv.value) return;
  const { data } = await api.get(`/communications/conversations/${conv.value.id}/export`, {
    params: { format: 'html' },
    responseType: 'text',
    skipGlobalLoading: true
  });
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(data);
  w.document.close();
}

async function downloadThread() {
  if (!conv.value) return;
  const { data } = await api.get(`/communications/conversations/${conv.value.id}/export`, {
    params: { format: 'txt' },
    responseType: 'text',
    skipGlobalLoading: true
  });
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `conversation-${conv.value.id}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function markSpam() {
  if (!conv.value) return;
  if (!window.confirm('Mark as spam and block this sender?')) return;
  try {
    await api.post(`/communications/conversations/${conv.value.id}/spam`, { blockSender: true });
    emit('spam');
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not mark spam';
  }
}

function pickSchedule(preset) {
  schedulePreset.value = preset;
  showSchedule.value = false;
}

async function runAiDraft() {
  if (!conv.value || isTelephony.value) return;
  aiBusy.value = true;
  sendError.value = '';
  try {
    const { data } = await api.post(
      `/communications/conversations/${conv.value.id}/ai/draft`,
      { instruction: body.value.trim() || undefined },
      { skipGlobalLoading: true }
    );
    if (data?.draft) {
      body.value = data.draft;
      if (composerMode.value === 'internal') composerMode.value = 'reply';
    }
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'AI draft unavailable';
  } finally {
    aiBusy.value = false;
  }
}

async function runInsight({ force = false } = {}) {
  if (!conv.value) return;
  insightBusy.value = true;
  sendError.value = '';
  try {
    const { data } = await api.post(
      `/communications/conversations/${conv.value.id}/ai/insight`,
      { force },
      { skipGlobalLoading: true }
    );
    insight.value = data;
    emit('insight', data);
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'AI summary unavailable';
  } finally {
    insightBusy.value = false;
  }
}

function applySuggestedStatus() {
  if (!insight.value?.suggestedStatus) return;
  emit('patch', { status: insight.value.suggestedStatus });
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
            <template v-if="conv.inbox_from_email || conv.inbox_display_name">
              Inbox: {{ conv.inbox_from_email || conv.inbox_display_name }}
            </template>
            <template v-else>Agency channel</template>
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
          <template v-if="conv.is_unknown_sender || conv.sender_trust === 'unknown'">
            <button type="button" class="uc-btn ghost" :disabled="trustBusy" @click="markKnown">Mark known</button>
            <button type="button" class="uc-btn primary" :disabled="trustBusy" @click="addContact">
              Mark known &amp; add contact
            </button>
          </template>
          <button
            v-if="primaryEmail"
            type="button"
            class="uc-btn ghost danger"
            :disabled="trustBusy"
            @click="blockSender"
          >
            Block
          </button>
          <button type="button" class="uc-btn ghost" @click="printThread">Print</button>
          <button type="button" class="uc-btn ghost" @click="downloadThread">Download</button>
          <button v-if="!isTelephony" type="button" class="uc-btn ghost danger" @click="markSpam">Spam</button>
          <div class="uc-snooze-wrap">
            <button type="button" class="uc-btn ghost" @click="showSnooze = !showSnooze">Snooze</button>
            <div v-if="showSnooze" class="uc-snooze-menu">
              <button type="button" @click="emit('patch', { snoozePreset: '1h' }); showSnooze = false">1 hour</button>
              <button type="button" @click="emit('patch', { snoozePreset: 'later_today' }); showSnooze = false">Later today</button>
              <button type="button" @click="emit('patch', { snoozePreset: 'tomorrow' }); showSnooze = false">Tomorrow</button>
              <button type="button" @click="emit('patch', { snoozePreset: 'next_week' }); showSnooze = false">Next week</button>
              <button type="button" @click="emit('patch', { clearSnooze: true }); showSnooze = false">Clear snooze</button>
            </div>
          </div>
        </div>
      </header>

      <div v-if="undoBanner" class="uc-undo">
        Message scheduled — sending shortly.
        <button type="button" @click="undoSend">Undo</button>
      </div>

      <div v-if="insight?.summary" class="uc-insight">
        <div class="uc-insight-top">
          <strong>Thread summary</strong>
          <button type="button" class="uc-btn ghost" :disabled="insightBusy" @click="runInsight({ force: true })">
            {{ insightBusy ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>
        <p>{{ insight.summary }}</p>
        <p v-if="insight.suggestedAction" class="uc-insight-action">
          Next: {{ insight.suggestedAction }}
          <button
            v-if="insight.suggestedStatus"
            type="button"
            class="uc-btn ghost"
            @click="applySuggestedStatus"
          >
            Set status → {{ insight.suggestedStatus.replace(/_/g, ' ') }}
          </button>
        </p>
      </div>
      <div v-else class="uc-insight empty">
        <button type="button" class="uc-btn ghost" :disabled="insightBusy" @click="runInsight()">
          {{ insightBusy ? 'Summarizing…' : 'Summarize thread' }}
        </button>
      </div>

      <div class="uc-messages">
        <article
          v-for="msg in messages"
          :key="msg.id"
          class="uc-msg"
          :class="{
            internal: msg.is_internal_note,
            outbound: msg.direction === 'outbound',
            scheduled: msg.send_status === 'scheduled'
          }"
        >
          <div class="uc-msg-head">
            <span class="uc-ch">{{ channelIcon(msg.channel || conv.channel) }}</span>
            <strong>{{ fromLabel(msg) }}</strong>
            <time>{{ formatWhen(msg.sent_at || msg.scheduled_send_at || msg.created_at) }}</time>
            <span v-if="msg.is_internal_note" class="uc-tag">Internal</span>
            <span v-else-if="msg.is_auto_reply" class="uc-tag auto">Auto-reply</span>
            <span v-else-if="msg.send_status === 'scheduled'" class="uc-tag sched">Scheduled</span>
            <span v-else-if="msg.direction === 'inbound'" class="uc-tag ext">External</span>
          </div>
          <div v-if="msg.body_html" class="uc-msg-body" v-html="msg.body_html" />
          <div v-else class="uc-msg-body pre">{{ msg.body_text }}</div>
          <ul v-if="msg.attachments?.length" class="uc-atts">
            <li v-for="a in msg.attachments" :key="a.id">📎 {{ a.filename }}</li>
          </ul>
        </article>
      </div>

      <footer class="uc-composer">
        <p v-if="isCallLike" class="uc-channel-hint">
          Call/voicemail threads are read-only here. Add an internal note, or open Calls for recordings and dial-back.
        </p>
        <p v-else-if="isSms" class="uc-channel-hint">
          SMS replies send through your assigned care number (same rules as the clinical SMS inbox: number, opt-in, A2P).
        </p>
        <div class="uc-composer-tabs">
          <template v-if="!isTelephony">
            <button type="button" :class="{ on: composerMode === 'reply' }" @click="setMode('reply')">Reply</button>
            <button type="button" :class="{ on: composerMode === 'reply_all' }" @click="setMode('reply_all')">Reply all</button>
            <button type="button" :class="{ on: composerMode === 'forward' }" @click="setMode('forward')">Forward</button>
          </template>
          <template v-else-if="isSms">
            <button type="button" :class="{ on: composerMode === 'reply' }" @click="setMode('reply')">SMS reply</button>
            <button type="button" class="linkish" @click="openSmsTools">Full SMS tools</button>
          </template>
          <button type="button" :class="{ on: composerMode === 'internal' }" @click="setMode('internal')">Internal note</button>
          <button v-if="!isTelephony" type="button" class="linkish" @click="showCcBcc = !showCcBcc">CC / BCC</button>
          <button
            v-if="!isTelephony && !isSms"
            type="button"
            class="linkish ai"
            :disabled="aiBusy"
            @click="runAiDraft"
          >
            {{ aiBusy ? 'Drafting…' : 'AI assist' }}
          </button>
        </div>

        <div v-if="composerMode !== 'internal' && !isTelephony" class="uc-addr">
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
          :placeholder="composerMode === 'internal' ? 'Internal note (not sent externally)…' : (isSms ? 'Text message…' : 'Write your reply…')"
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
            {{ sending ? 'Sending…' : (composerMode === 'internal' ? 'Add note' : (isSms ? 'Send SMS' : (schedulePreset ? 'Schedule send' : 'Send'))) }}
          </button>
          <div v-if="!isTelephony && composerMode !== 'internal'" class="uc-snooze-wrap">
            <button type="button" class="uc-btn ghost" @click="showSchedule = !showSchedule">
              {{ schedulePreset ? `Later: ${schedulePreset}` : 'Send later' }}
            </button>
            <div v-if="showSchedule" class="uc-snooze-menu">
              <button type="button" @click="pickSchedule(null)">Send with undo delay</button>
              <button type="button" @click="pickSchedule('in_1_hour')">In 1 hour</button>
              <button type="button" @click="pickSchedule('tomorrow_9am')">Tomorrow 9am</button>
              <button type="button" @click="pickSchedule('monday_9am')">Next Monday 9am</button>
            </div>
          </div>
          <button type="button" class="uc-btn ghost" @click="emit('patch', { status: 'follow_up', snoozePreset: 'tomorrow' })">
            Follow up
          </button>
          <button type="button" class="uc-btn ghost" @click="emit('patch', { status: 'waiting_on_them' })">
            Waiting on them
          </button>
          <span v-if="inbox?.from_email && !isTelephony" class="uc-from-hint">Sending as {{ inbox.from_email }}</span>
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
.uc-btn.danger { color: #b91c1c; }
.uc-undo {
  background: #166534;
  color: #fff;
  padding: 8px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.uc-undo button {
  border: 1px solid rgba(255,255,255,0.7);
  background: transparent;
  color: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-weight: 700;
  cursor: pointer;
}
.uc-insight {
  margin: 0;
  padding: 10px 16px;
  background: #f0fdf4;
  border-bottom: 1px solid #bbf7d0;
  font-size: 0.85rem;
  color: #14532d;
}
.uc-insight.empty {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.uc-insight-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.uc-insight p { margin: 4px 0 0; }
.uc-insight-action {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-weight: 600;
}
.uc-composer-tabs .linkish.ai { color: #166534; font-weight: 700; }
.uc-channel-hint {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: #64748b;
}
.uc-msg.scheduled { border-left: 3px solid #f59e0b; }
.uc-tag.sched { background: #fef3c7; color: #92400e; }
.uc-msg-body.pre { white-space: pre-wrap; }
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
