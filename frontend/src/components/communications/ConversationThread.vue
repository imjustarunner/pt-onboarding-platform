<template>
  <div class="conv-thread">
    <!-- Empty state when no client selected -->
    <div v-if="!clientId && !contactId" class="conv-thread__empty">
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

        <div class="client-info">
          <div class="client-name-row">
            <span class="client-name">{{ activeName }}</span>
            <span class="entity-badge">{{ clientId ? 'Client' : 'Contact' }}</span>
          </div>
          <span class="client-phone">{{ formatPhone(activePhone) }}</span>
        </div>

        <div class="header-actions">
          <ThreadCallButton
            ref="callBtnRef"
            :client-id="clientId || 0"
            :contact-id="contactId"
            :client-phone="activePhone"
            :number-id="numberId"
          />
          <a
            v-if="clientId"
            :href="clientProfileUrl"
            target="_blank"
            rel="noopener"
            class="header-btn profile-link"
            title="Open client profile"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </a>
          <div class="actions-menu">
            <button type="button" class="actions-btn" @click.stop="showActions = !showActions">
              Actions
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div v-if="showActions" class="actions-dropdown" @click.stop>
              <button v-if="clientId" type="button" @click="showActions = false; promptForward()">Forward to support</button>
              <button v-if="canManageCare" type="button" @click="showActions = false; setCareAction('claim')">Claim / under care</button>
              <button v-if="canManageCare" type="button" @click="showActions = false; setCareAction('observe')">Observe</button>
              <button v-if="canManageCare" type="button" @click="showActions = false; setCareAction('close')">Mark resolved</button>
              <button v-if="contactId && !clientId" type="button" @click="showActions = false; convertToClient()">Convert to client</button>
              <button v-if="contactId && !clientId" type="button" @click="showActions = false; convertToGuardian()">Convert to guardian</button>
              <a v-if="clientId" :href="clientProfileUrl" target="_blank" rel="noopener" @click="showActions = false">View profile</a>
            </div>
          </div>
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
              <div v-if="msg.direction === 'INBOUND'" class="msg-avatar">{{ avatarLetter }}</div>
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
              </div>
              <div class="msg-meta">
                <span class="msg-time">{{ msgTime(msg.created_at) }}</span>
                <span v-if="msg.direction === 'OUTBOUND'" class="msg-status" :class="`status--${msg.delivery_status}`">
                  {{ statusLabel(msg.delivery_status) }}
                </span>
              </div>
            </div>
          </div>

          <!-- AI Suggestions -->
          <div v-if="aiSuggestions.length > 0 && !sending" class="ai-suggestions">
            <div class="ai-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              AI Suggestions
            </div>
            <div class="suggestions-list">
              <button 
                v-for="(s, si) in aiSuggestions" 
                :key="si" 
                class="suggestion-chip"
                @click="applySuggestion(s)"
              >
                {{ s }}
              </button>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="otherPartyTyping" class="typing-indicator-row">
            <div class="typing-dots">
              <span></span><span></span><span></span>
            </div>
            <span class="typing-text">{{ activeName }} is typing...</span>
          </div>
        </template>
      </div>

      <!-- Compose box -->
      <div class="conv-thread__compose">
        <div v-if="optedOut" class="opt-out-notice">
          Client has opted out of SMS. You cannot send messages to this number.
        </div>
        <div v-else class="compose-inner">
          <div v-if="attachments.length > 0" class="attachments-preview">
            <div v-for="(file, idx) in attachments" :key="idx" class="attachment-chip">
              <span class="attachment-name">{{ file.name }}</span>
              <button type="button" class="remove-attachment" @click="removeAttachment(idx)">×</button>
            </div>
          </div>
          <div class="compose-row">
            <textarea
              ref="composeEl"
              v-model="draft"
              class="compose-input"
              :placeholder="`Message ${activeName || 'client'}…`"
              rows="1"
              :disabled="sending"
              @input="handleTypingInput"
              @keydown.enter.exact.prevent="send"
              @keydown.enter.shift.exact="null"
            />
            <div class="compose-actions">
              <input
                type="file"
                ref="fileInputEl"
                style="display: none"
                multiple
                accept="image/*,application/pdf,.doc,.docx"
                @change="handleFileSelect"
              />
              <button
                type="button"
                class="header-btn attach-btn"
                title="Attach files"
                :disabled="sending || uploading"
                @click="fileInputEl.click()"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <span class="char-count" :class="{ 'char-count--warn': draft.length > 140 }">
                {{ draft.length }}/160
              </span>
              <button
                type="button"
                class="send-btn"
                :disabled="(!draft.trim() && !attachments.length) || sending"
                @click="send"
              >
                <svg v-if="!sending" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
                <span v-else class="sending-spinner" />
              </button>
            </div>
          </div>
        </div>
        <div v-if="!optedOut" class="compose-from">
          <span v-if="fromNumberLabel">SMS will be sent from {{ fromNumberLabel }}</span>
          <span v-else>SMS will be sent from your agency care number</span>
          <button type="button" class="compose-settings-link" @click="$emit('open-settings')">Manage SMS settings</button>
        </div>
        <div v-if="sendError" class="send-error">{{ sendError }}</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import ThreadCallButton from './ThreadCallButton.vue';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  clientId:    { type: [Number, String], default: null },
  clientName:  { type: String,           default: '' },
  clientPhone: { type: String,           default: '' },
  contactId:   { type: [Number, String], default: null },
  contactName: { type: String,           default: '' },
  contactPhone:{ type: String,           default: '' },
  numberId:    { type: [Number, String], default: null },
  agencyId:    { type: [Number, String], default: null },
  careThread:  { type: Object,           default: null }
});

const emit = defineEmits(['back', 'message-sent', 'contact-converted', 'care-updated', 'open-settings']);

const route = useRoute();
const auth = useAuthStore();
const authUser = computed(() => auth.user?.value ?? auth.user ?? null);

const messages   = ref([]);
const loading    = ref(false);
const draft      = ref('');
const sending    = ref(false);
const sendError  = ref('');
const optedOut   = ref(false);
const forwarding = ref(false);
const careBusy = ref(false);
const showActions = ref(false);
const callBtnRef = ref(null);
const myNumbers = ref([]);

const canManageCare = computed(() => {
  const r = String(authUser.value?.role || '').toLowerCase();
  return ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff'].includes(r);
});

const fromNumberLabel = computed(() => {
  const nid = Number(props.numberId);
  const match = myNumbers.value.find((n) => Number(n.id || n.number_id) === nid);
  const phone = match?.phone_number || match?.phone || match?.e164 || null;
  if (phone) return formatPhone(phone);
  if (myNumbers.value[0]) {
    return formatPhone(myNumbers.value[0].phone_number || myNumbers.value[0].phone || myNumbers.value[0].e164 || '');
  }
  return '';
});

async function loadMyNumbers() {
  try {
    const res = await api.get('/messages/my-numbers', { skipGlobalLoading: true });
    myNumbers.value = Array.isArray(res.data) ? res.data : (res.data?.numbers || []);
  } catch {
    myNumbers.value = [];
  }
}

async function setCareAction(action) {
  if (!props.clientId || careBusy.value) return;
  careBusy.value = true;
  try {
    const res = await api.patch('/messages/care-thread', {
      clientId: props.clientId,
      numberId: props.numberId || undefined,
      agencyId: props.agencyId || undefined,
      action
    });
    emit('care-updated', res.data?.careThread || null);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update care state.');
  } finally {
    careBusy.value = false;
  }
}

function triggerCall() {
  callBtnRef.value?.$el?.querySelector('button')?.click?.();
}

function onDocClickCloseActions() {
  showActions.value = false;
}
const messagesEl = ref(null);
const composeEl  = ref(null);
const fileInputEl = ref(null);

const attachments = ref([]);
const uploading = ref(false);
const aiSuggestions = ref([]);
const loadingAI = ref(false);
const rtcClient = ref(null);
const otherPartyTyping = ref(false);
const myTypingTimer = ref(null);

// Unified name/phone for either client or contact thread
const activeName  = computed(() => props.clientName  || props.contactName  || '');
const activePhone = computed(() => props.clientPhone || props.contactPhone || '');

const clientProfileUrl = computed(() => {
  if (!props.clientId) return '#';
  const u = authUser.value;
  const slug = u?.currentAgencySlug || u?.agency_slug || '';
  if (slug) return `/${slug}/admin/clients/${props.clientId}`;
  return `/admin/clients/${props.clientId}`;
});

const avatarLetter = computed(() => {
  const name = activeName.value || '?';
  return name[0].toUpperCase();
});

// Contact-to-client/guardian conversion
const converting = ref(false);

async function convertToClient() {
  if (!props.contactId || converting.value) return;
  converting.value = true;
  try {
    const res = await api.post(`/contacts/${props.contactId}/convert-to-client`);
    emit('contact-converted', { type: 'client', data: res.data });
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to convert to client.');
  } finally {
    converting.value = false;
  }
}

async function convertToGuardian() {
  if (!props.contactId || converting.value) return;
  converting.value = true;
  try {
    const res = await api.post(`/contacts/${props.contactId}/convert-to-guardian`);
    emit('contact-converted', { type: 'guardian', data: res.data });
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to convert to guardian.');
  } finally {
    converting.value = false;
  }
}

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
  if (!props.clientId && !props.contactId) { messages.value = []; return; }
  loading.value = true;
  sendError.value = '';
  optedOut.value = false;
  aiSuggestions.value = [];
  try {
    const uid = authUser.value?.id;
    const params = {};
    if (props.contactId) params.contactId = props.contactId;
    const res = await api.get(`/messages/thread/${uid}/${props.clientId || 0}`, { params });
    messages.value = Array.isArray(res.data?.messages) ? res.data.messages : [];
    
    // Load AI suggestions if last message was inbound
    const last = messages.value[messages.value.length - 1];
    if (last && last.direction === 'INBOUND') {
      loadAISuggestions();
    }

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

async function loadAISuggestions() {
  if (loadingAI.value) return;
  loadingAI.value = true;
  try {
    const params = {};
    if (props.clientId) params.clientId = props.clientId;
    if (props.contactId) params.contactId = props.contactId;
    const res = await api.get('/messages/smart-replies', { params, skipGlobalLoading: true });
    aiSuggestions.value = res.data?.suggestions || [];
  } catch (e) {
    console.warn('[AI] Failed to load suggestions:', e.message);
  } finally {
    loadingAI.value = false;
  }
}

function applySuggestion(s) {
  draft.value = s;
  aiSuggestions.value = [];
  nextTick(() => {
    autoGrow();
    if (composeEl.value) composeEl.value.focus();
  });
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

function handleFileSelect(ev) {
  const files = Array.from(ev.target.files || []);
  if (!files.length) return;
  attachments.value = [...attachments.value, ...files];
  ev.target.value = ''; // Reset input
}

function removeAttachment(idx) {
  attachments.value.splice(idx, 1);
}

async function uploadAttachments() {
  if (!attachments.value.length) return [];
  uploading.value = true;
  const urls = [];
  try {
    for (const file of attachments.value) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/messages/upload-media', fd);
      if (res.data?.url) urls.push(res.data.url);
    }
    return urls;
  } finally {
    uploading.value = false;
  }
}

async function send() {
  const text = draft.value.trim();
  const hasAttachments = attachments.value.length > 0;
  if ((!text && !hasAttachments) || sending.value || (!props.clientId && !props.contactId)) return;
  
  sending.value = true;
  sendError.value = '';
  try {
    const mediaUrls = await uploadAttachments();
    
    const payload = {
      body: text
    };
    if (props.clientId) payload.clientId = props.clientId;
    if (props.contactId) payload.contactId = props.contactId;
    if (props.numberId) payload.numberId = props.numberId;
    if (mediaUrls.length) payload.mediaUrls = mediaUrls;

    const res = await api.post('/messages/send', payload);
    draft.value = '';
    attachments.value = [];
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

async function promptForward() {
  const note = window.prompt('Add a note for support (optional):', 'This client needs assistance that I cannot provide directly.');
  if (note === null) return; // user cancelled

  forwarding.value = true;
  try {
    const res = await api.post('/messages/forward-to-support', {
      clientId: props.clientId,
      message: note
    });
    emit('care-updated', null);
    const tid = res.data?.supportTicketId;
    alert(tid ? `Escalated — support ticket #${tid} opened.` : 'Thread escalated to support.');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to forward to support.');
  } finally {
    forwarding.value = false;
  }
}

onMounted(() => {
  initRTC();
  loadMyNumbers();
  document.addEventListener('click', onDocClickCloseActions);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClickCloseActions);
  if (rtcClient.value) rtcClient.value.logout();
});

async function initRTC() {
  try {
    await api.get('/messages/rtc-token', { skipGlobalLoading: true });
    // Vonage RTC client integration scaffolding — extend when SDK is ready
  } catch (e) {
    console.warn('[RTC] Failed to initialize:', e.message);
  }
}

function handleTypingInput() {
  autoGrow();
  handleTyping();
}

function handleTyping() {
  if (myTypingTimer.value) clearTimeout(myTypingTimer.value);
  // Emit typing:on via RTC
  myTypingTimer.value = setTimeout(() => {
    // Emit typing:off via RTC
  }, 3000);
}

defineExpose({ reload: loadThread, triggerCall });

watch(
  [() => props.clientId, () => props.contactId, () => props.numberId],
  () => {
    loadThread();
    showActions.value = false;
    draft.value = '';
    sendError.value = '';
    attachments.value = [];
    aiSuggestions.value = [];
  },
  { immediate: true }
);
</script>

<style scoped>
.conv-thread {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--sms-bg, var(--bg-primary, #f8fafc));
  color: var(--sms-text, var(--text-primary, #0f172a));
  position: relative;
}

/* Empty placeholder */
.conv-thread__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--sms-muted, var(--text-secondary, #64748b));
  padding: 40px;
}
.conv-thread__empty .empty-icon { font-size: 3rem; margin-bottom: 16px; opacity: 0.7; }
.conv-thread__empty h3 { margin: 0 0 10px; font-size: 1.35rem; font-weight: 800; color: var(--sms-text, var(--text-primary, #0f172a)); letter-spacing: -0.02em; }
.conv-thread__empty p  { margin: 0; font-size: 0.95rem; max-width: 280px; line-height: 1.5; }

/* Header */
.conv-thread__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--sms-border, var(--border, #e2e8f0));
  background: var(--sms-surface, var(--surface-card, #fff));
  flex-shrink: 0;
  z-index: 5;
}

.back-btn {
  display: none; /* shown only on mobile via media query */
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  padding: 6px;
  border-radius: 8px;
  flex-shrink: 0;
  transition: all 0.2s;
}
.back-btn svg { width: 22px; height: 22px; }
.back-btn:hover { background: #f1f5f9; color: var(--text-primary, #0f172a); }

.client-avatar {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.1rem;
  flex-shrink: 0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border: 2px solid #fff;
}

.client-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.client-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.client-name {
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--sms-text, var(--text-primary, #0f172a));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.entity-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  background: var(--sms-surface-2, #e2e8f0);
  color: var(--sms-muted, #64748b);
}

.client-phone {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--sms-muted, var(--text-secondary, #64748b));
  letter-spacing: 0.01em;
}

.actions-menu { position: relative; }
.actions-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.actions-btn svg { width: 14px; height: 14px; }
.actions-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 200px;
  background: var(--sms-surface, #fff);
  border: 1px solid var(--sms-border, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0,0,0,0.18);
  padding: 6px;
  z-index: 20;
  display: flex;
  flex-direction: column;
}
.actions-dropdown button,
.actions-dropdown a {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--sms-text, #0f172a);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
}
.actions-dropdown button:hover,
.actions-dropdown a:hover {
  background: color-mix(in srgb, var(--primary, #2563eb) 12%, transparent);
  color: var(--primary, #2563eb);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.header-btn:hover:not(:disabled) {
  background: var(--bg-secondary, #f8fafc);
  color: var(--text-primary, #0f172a);
  border-color: var(--border-hover, #cbd5e1);
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}
.header-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.header-btn svg { width: 18px; height: 18px; }

.forward-btn {
  color: #2563eb;
  border-color: #bfdbfe;
  background: #eff6ff;
}
.forward-btn:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #93c5fd;
}

.convert-btn {
  padding: 0 14px;
  width: auto;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary, #2563eb);
  border-color: var(--primary, #2563eb);
  background: #fff;
}
.convert-btn:hover:not(:disabled) {
  background: #eff6ff;
  transform: translateY(-1px);
}

.profile-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  color: var(--text-secondary, #64748b);
  text-decoration: none;
  transition: all 0.2s;
}
.profile-link:hover { 
  background: #f8fafc; 
  color: var(--text-primary, #0f172a); 
  border-color: #cbd5e1;
  transform: translateY(-1px);
}
.profile-link svg { width: 18px; height: 18px; }

/* Messages scroll area */
.conv-thread__messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scroll-behavior: smooth;
  background: var(--sms-bg, var(--bg-primary, #f8fafc));
}

.msg-loading, .msg-empty {
  text-align: center;
  color: var(--text-secondary, #94a3b8);
  font-size: 0.9rem;
  padding: 60px 0;
  font-weight: 500;
}

/* Date separator */
.date-sep {
  display: flex;
  align-items: center;
  margin: 24px 0 16px;
  gap: 16px;
}
.date-sep::before, .date-sep::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border, #e2e8f0);
}
.date-sep span {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  background: #fff;
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid var(--border, #e2e8f0);
}

/* Message row */
.msg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  margin: 8px 0;
  max-width: 100%;
}
.msg-row--out { justify-content: flex-end; }
.msg-row--in  { justify-content: flex-start; }
.msg-row--out .msg-meta { width: 100%; justify-content: flex-end; }
.msg-row--in .msg-meta { width: 100%; padding-left: 40px; }

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--primary, #2563eb) 18%, transparent);
  color: var(--primary, #2563eb);
}

.msg-bubble {
  max-width: min(75%, 520px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.bubble--out {
  background: var(--primary, #2563eb);
  color: #fff;
  border-radius: 18px 18px 4px 18px;
  padding: 12px 16px;
  align-items: flex-end;
}

.bubble--in {
  background: var(--sms-surface-2, #1e293b);
  color: var(--sms-text, var(--text-primary, #0f172a));
  border: 1px solid var(--sms-border, transparent);
  border-radius: 18px 18px 18px 4px;
  padding: 12px 16px;
  align-items: flex-start;
}

.msg-text { font-size: 0.95rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; font-weight: 500; }

.msg-media { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.msg-image {
  max-width: 240px;
  max-height: 240px;
  border-radius: 12px;
  cursor: pointer;
  object-fit: cover;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.msg-time {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--sms-muted, #94a3b8);
}

.msg-status { font-size: 0.75rem; color: var(--sms-muted, #94a3b8); }
.status--failed { color: var(--error, #ef4444); font-weight: 800; }

/* Compose */
.conv-thread__compose {
  border-top: 1px solid var(--sms-border, var(--border, #e2e8f0));
  background: var(--sms-surface, #fff);
  padding: 14px 20px 12px;
  flex-shrink: 0;
}

.compose-from {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  font-size: 0.75rem;
  color: var(--sms-muted, #64748b);
}
.compose-settings-link {
  border: none;
  background: none;
  color: var(--primary, #2563eb);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.opt-out-notice {
  font-size: 0.85rem;
  font-weight: 600;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  border-radius: 12px;
  padding: 12px 16px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.compose-inner {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  border: 1px solid var(--sms-border, var(--border, #f1f5f9));
  border-radius: 16px;
  padding: 8px;
  background: var(--sms-bg, var(--bg-secondary, #f8fafc));
  transition: border-color 0.15s;
}

.compose-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding-left: 8px;
}

.attachments-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 8px;
}

.attachment-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--primary, #2563eb);
  color: white;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.remove-attachment {
  background: none;
  border: none;
  color: white;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.attach-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
}
.attach-btn:hover { color: var(--primary); background: transparent; transform: none; box-shadow: none; }
.compose-inner:focus-within {
  border-color: var(--primary, #2563eb);
}

.compose-input {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  font-size: 1rem;
  font-family: inherit;
  line-height: 1.5;
  background: transparent;
  color: var(--sms-text, var(--text-primary, #0f172a));
  min-height: 40px;
  max-height: 150px;
  overflow-y: auto;
  padding: 8px 0;
  font-weight: 500;
}
.compose-input::placeholder { color: var(--sms-muted, #94a3b8); font-weight: 400; }
.compose-input:disabled { opacity: 0.5; }

.compose-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding-bottom: 4px;
}

.char-count {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary, #94a3b8);
  font-variant-numeric: tabular-nums;
}
.char-count--warn { color: #f59e0b; }

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--primary, #2563eb);
  border: none;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 10px color-mix(in srgb, var(--primary, #2563eb) 30%, transparent);
}
.send-btn svg { width: 20px; height: 20px; }
.send-btn:hover:not(:disabled) { filter: brightness(1.06); }
.send-btn:disabled { background: var(--sms-surface-2, #e2e8f0); color: var(--sms-muted, #94a3b8); cursor: not-allowed; box-shadow: none; }

.sending-spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* AI Suggestions Styles */
.ai-suggestions {
  margin: 16px 24px;
  background: white;
  border-radius: 16px;
  padding: 12px;
  border: 1px solid var(--primary-light, #e0e7ff);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);
}
.ai-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--primary, #2563eb);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}
.ai-header svg { width: 14px; height: 14px; }
.suggestions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.suggestion-chip {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #334155;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.suggestion-chip:hover {
  background: var(--primary, #2563eb);
  color: white;
  border-color: var(--primary, #2563eb);
  transform: translateY(-1px);
}

/* Typing Indicator Styles */
.typing-indicator-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px;
  animation: fadeIn 0.3s ease;
}
.typing-dots {
  display: flex;
  gap: 4px;
}
.typing-dots span {
  width: 6px;
  height: 6px;
  background: var(--primary, #2563eb);
  border-radius: 50%;
  opacity: 0.4;
  animation: typingDot 1.4s infinite ease-in-out;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typingDot {
  0%, 100% { transform: translateY(0); opacity: 0.4; }
  50% { transform: translateY(-4px); opacity: 1; }
}
.typing-text {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  font-style: italic;
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }

.send-error {
  font-size: 0.85rem;
  font-weight: 600;
  color: #ef4444;
  margin-top: 10px;
  padding: 0 8px;
}

/* Mobile: show back button */
@media (max-width: 768px) {
  .back-btn { display: flex; }
  .conv-thread__messages { padding: 16px 16px; }
}
</style>
