<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '@/services/api';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { toUploadsUrl } from '@/utils/uploadsUrl.js';

const props = defineProps({
  threadId: { type: [Number, String], required: true },
  meId: { type: [Number, String], required: true },
  /** Display mode. 'pane' is full-page (with header). 'inline' is for embedding. */
  mode: { type: String, default: 'pane' }
});

const emit = defineEmits(['messages-updated', 'message-sent']);

const messages = ref([]);
const loading = ref(false);
const error = ref('');
const composerText = ref('');
const sending = ref(false);
const stagedAttachments = ref([]);
const fileInput = ref(null);
const reactionPickerForId = ref(null);
const lightboxUrl = ref(null);
const scrollEl = ref(null);

const QUICK_EMOJI = ['👏', '🔥', '💪', '🏆', '⚡', '🙌', '❤️', '😂', '👍', '🎉'];

const sortedMessages = computed(() => [...messages.value]);

function formatDayLabel(d) {
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const renderedItems = computed(() => {
  // Returns an interleaved list of { type: 'separator'|'message', ... } items.
  const out = [];
  let lastDay = null;
  let lastSenderId = null;
  let lastTime = 0;
  for (const m of sortedMessages.value) {
    const created = m.created_at ? new Date(m.created_at) : new Date();
    const dayKey = `${created.getFullYear()}-${created.getMonth()}-${created.getDate()}`;
    if (dayKey !== lastDay) {
      out.push({ type: 'separator', key: `sep-${dayKey}`, label: formatDayLabel(created) });
      lastDay = dayKey;
      lastSenderId = null;
      lastTime = 0;
    }
    const senderId = Number(m.sender_user_id);
    const groupedWithPrev =
      lastSenderId === senderId && created.getTime() - lastTime < 5 * 60 * 1000;
    out.push({
      type: 'message',
      key: `msg-${m.id}`,
      message: m,
      isMine: senderId === Number(props.meId),
      groupedWithPrev,
      time: formatTime(created)
    });
    lastSenderId = senderId;
    lastTime = created.getTime();
  }
  return out;
});

async function loadMessages() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/chat/threads/${props.threadId}/messages`, { params: { limit: 100 } });
    messages.value = Array.isArray(data) ? data : [];
    emit('messages-updated', messages.value);
    await nextTick();
    scrollToBottom();
    markRead();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load messages';
  } finally {
    loading.value = false;
  }
}

function scrollToBottom() {
  const el = scrollEl.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

async function markRead() {
  const last = messages.value[messages.value.length - 1];
  if (!last?.id) return;
  try {
    await api.post(`/chat/threads/${props.threadId}/read`, { lastReadMessageId: last.id });
  } catch {
    // best-effort
  }
}

function onPickFile() {
  if (fileInput.value) fileInput.value.click();
}

async function onFileChange(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  for (const f of files.slice(0, 5)) {
    const fd = new FormData();
    fd.append('file', f);
    try {
      const { data } = await api.post(`/chat/threads/${props.threadId}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      stagedAttachments.value.push({ ...data, _localPreview: URL.createObjectURL(f) });
    } catch (err) {
      error.value = err?.response?.data?.error?.message || 'Upload failed';
    }
  }
}

function removeStaged(idx) {
  stagedAttachments.value.splice(idx, 1);
}

async function send() {
  const body = composerText.value.trim();
  if (!body && stagedAttachments.value.length === 0) return;
  sending.value = true;
  error.value = '';
  try {
    const payload = { body };
    if (stagedAttachments.value.length) {
      payload.attachments = stagedAttachments.value.map((a) => ({
        filePath: a.filePath,
        mimeType: a.mimeType,
        kind: a.kind,
        originalFilename: a.originalFilename,
        byteSize: a.byteSize
      }));
    }
    const { data } = await api.post(`/chat/threads/${props.threadId}/messages`, payload);
    if (data && data.id) {
      messages.value.push(data);
      emit('message-sent', data);
      composerText.value = '';
      stagedAttachments.value = [];
      await nextTick();
      scrollToBottom();
      markRead();
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to send';
  } finally {
    sending.value = false;
  }
}

async function toggleReaction(message, code) {
  const me = Number(props.meId);
  const existing = (message.reactions || []).find((r) => r.code === code);
  const mineActive = !!existing?.mineActive;
  try {
    if (mineActive) {
      await api.delete(`/chat/messages/${message.id}/reactions/${encodeURIComponent(code)}`);
      // Optimistic update
      message.reactions = (message.reactions || [])
        .map((r) => {
          if (r.code !== code) return r;
          const users = (r.users || []).filter((u) => Number(u.userId) !== me);
          return { ...r, users, count: users.length, mineActive: false };
        })
        .filter((r) => r.count > 0);
    } else {
      await api.post(`/chat/messages/${message.id}/reactions`, { code });
      const arr = message.reactions || [];
      const existing2 = arr.find((r) => r.code === code);
      if (existing2) {
        existing2.users = [...(existing2.users || []), { userId: me, firstName: 'You', lastName: '' }];
        existing2.count = existing2.users.length;
        existing2.mineActive = true;
      } else {
        arr.push({ code, count: 1, mineActive: true, users: [{ userId: me, firstName: 'You', lastName: '' }], iconUrl: null });
      }
      message.reactions = arr;
    }
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Reaction failed';
  } finally {
    reactionPickerForId.value = null;
  }
}

function openLightbox(url) {
  lightboxUrl.value = url;
}

function closeLightbox() {
  lightboxUrl.value = null;
}

function onComposerKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!sending.value) send();
  }
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(loadMessages, 12000);
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onMounted(() => {
  loadMessages();
  startPolling();
});
onBeforeUnmount(() => stopPolling());

watch(() => props.threadId, () => {
  loadMessages();
});

defineExpose({ refresh: loadMessages });
</script>

<template>
  <div class="message-thread" :class="`message-thread--${mode}`">
    <div class="thread-scroll" ref="scrollEl">
      <div v-if="loading && !messages.length" class="thread-empty">Loading messages…</div>
      <div v-else-if="!messages.length" class="thread-empty">
        <strong>No messages yet.</strong>
        <div class="muted">Be the first to say hi.</div>
      </div>

      <template v-for="item in renderedItems" :key="item.key">
        <div v-if="item.type === 'separator'" class="day-separator">
          <span>{{ item.label }}</span>
        </div>
        <div
          v-else
          class="msg-row"
          :class="{ 'msg-row--mine': item.isMine, 'msg-row--grouped': item.groupedWithPrev }"
        >
          <div class="msg-avatar">
            <UserAvatar
              v-if="!item.groupedWithPrev"
              :photo-path="item.message.sender_profile_photo_path"
              :first-name="item.message.sender_first_name"
              :last-name="item.message.sender_last_name"
              size="sm"
            />
          </div>
          <div class="msg-body">
            <div v-if="!item.groupedWithPrev" class="msg-meta">
              <span class="msg-sender">
                {{ item.isMine ? 'You' : `${item.message.sender_first_name || ''} ${item.message.sender_last_name || ''}`.trim() || 'Member' }}
              </span>
              <span class="msg-time">{{ item.time }}</span>
              <span v-if="item.message.announcement_id" class="msg-badge" title="Posted as announcement">📣 Announcement</span>
            </div>
            <div class="msg-bubble" :class="{ mine: item.isMine }">
              <div v-if="item.message.body" class="msg-text">{{ item.message.body }}</div>
              <div v-if="(item.message.attachments || []).length" class="msg-attachments">
                <template v-for="att in item.message.attachments" :key="att.id">
                  <button
                    v-if="att.file_kind === 'image' || att.file_kind === 'gif'"
                    type="button"
                    class="att-img-btn"
                    @click="openLightbox(att.file_url)"
                  >
                    <img :src="att.file_url" :alt="att.original_filename || 'attachment'" />
                  </button>
                  <video
                    v-else-if="att.file_kind === 'video'"
                    :src="att.file_url"
                    controls
                    class="att-video"
                  />
                  <a
                    v-else
                    :href="att.file_url"
                    target="_blank"
                    rel="noopener"
                    class="att-file"
                  >
                    <span class="att-file-icon">📎</span>
                    <span class="att-file-name">{{ att.original_filename || 'Download' }}</span>
                  </a>
                </template>
              </div>

              <div v-if="(item.message.reactions || []).length || reactionPickerForId === item.message.id" class="msg-reactions">
                <button
                  v-for="r in item.message.reactions || []"
                  :key="r.code"
                  type="button"
                  class="reaction-chip"
                  :class="{ 'reaction-chip--mine': r.mineActive }"
                  :title="(r.sampleUserNames || r.users.map((u) => `${u.firstName} ${u.lastName}`.trim())).join(', ')"
                  @click="toggleReaction(item.message, r.code)"
                >
                  <img v-if="r.iconUrl" :src="r.iconUrl" alt="" class="reaction-icon" />
                  <span v-else>{{ r.code }}</span>
                  <span class="reaction-count">{{ r.count }}</span>
                </button>
                <button
                  type="button"
                  class="reaction-chip reaction-chip--add"
                  @click="reactionPickerForId = reactionPickerForId === item.message.id ? null : item.message.id"
                  title="Add reaction"
                >
                  + 😀
                </button>
                <div v-if="reactionPickerForId === item.message.id" class="reaction-picker">
                  <button
                    v-for="e in QUICK_EMOJI"
                    :key="e"
                    type="button"
                    class="reaction-picker-emoji"
                    @click="toggleReaction(item.message, e)"
                  >{{ e }}</button>
                </div>
              </div>
              <div v-else class="msg-reactions msg-reactions--empty">
                <button
                  type="button"
                  class="reaction-chip reaction-chip--add reaction-chip--ghost"
                  @click="reactionPickerForId = item.message.id"
                  title="Add reaction"
                >+ 😀</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="error" class="thread-error">{{ error }}</div>

    <div class="composer">
      <div v-if="stagedAttachments.length" class="staged-row">
        <div v-for="(s, i) in stagedAttachments" :key="i" class="staged-chip">
          <img v-if="s.kind === 'image' || s.kind === 'gif'" :src="s._localPreview || toUploadsUrl(s.filePath)" />
          <span v-else class="staged-file">📎 {{ s.originalFilename || 'file' }}</span>
          <button type="button" class="staged-remove" @click="removeStaged(i)">×</button>
        </div>
      </div>
      <div class="composer-row">
        <button type="button" class="composer-icon-btn" @click="onPickFile" title="Attach a photo, GIF, or file">📎</button>
        <input ref="fileInput" type="file" accept="image/*,video/mp4,video/webm" multiple hidden @change="onFileChange" />
        <textarea
          v-model="composerText"
          placeholder="Type a message…"
          rows="1"
          class="composer-textarea"
          @keydown="onComposerKeydown"
        />
        <button
          type="button"
          class="composer-send"
          :disabled="sending || (!composerText.trim() && !stagedAttachments.length)"
          @click="send"
        >
          {{ sending ? 'Sending…' : 'Send' }}
        </button>
      </div>
    </div>

    <div v-if="lightboxUrl" class="lightbox" @click="closeLightbox">
      <img :src="lightboxUrl" alt="" />
    </div>
  </div>
</template>

<style scoped>
.message-thread {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 360px;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
}
.message-thread--inline {
  border: 1px solid #e5e7eb;
}

.thread-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 16px;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}
.thread-empty {
  color: #6b7280;
  text-align: center;
  padding: 32px 0;
}
.day-separator {
  text-align: center;
  margin: 18px 0 10px;
  position: relative;
}
.day-separator::before {
  content: '';
  position: absolute;
  inset: 50% 0 auto;
  height: 1px;
  background: #e5e7eb;
  z-index: 0;
}
.day-separator span {
  position: relative;
  z-index: 1;
  background: #f8fafc;
  padding: 0 12px;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.msg-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 6px 0;
}
.msg-row--mine {
  flex-direction: row-reverse;
}
.msg-row--grouped {
  margin-top: 2px;
}
.msg-avatar {
  flex: 0 0 32px;
  width: 32px;
}
.msg-body {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 78%;
  display: flex;
  flex-direction: column;
}
.msg-row--mine .msg-body { align-items: flex-end; }
.msg-meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.msg-row--mine .msg-meta { flex-direction: row-reverse; }
.msg-sender { font-weight: 700; color: #111827; }
.msg-badge { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 999px; font-size: 11px; font-weight: 700; }

.msg-bubble {
  background: #f3f4f6;
  color: #111827;
  border-radius: 14px;
  padding: 8px 12px;
  display: inline-block;
  max-width: 100%;
  word-break: break-word;
  white-space: pre-wrap;
  position: relative;
}
.msg-bubble.mine {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
}
.msg-text { line-height: 1.45; }

.msg-attachments {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.att-img-btn {
  background: none; border: 0; padding: 0; cursor: pointer; border-radius: 10px; overflow: hidden;
}
.att-img-btn img { display: block; max-width: 280px; max-height: 280px; border-radius: 10px; }
.att-video { max-width: 320px; border-radius: 10px; }
.att-file {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; background: rgba(255,255,255,0.7); border-radius: 8px; color: #1f2937; text-decoration: none;
}
.msg-bubble.mine .att-file { background: rgba(255,255,255,0.18); color: #fff; }
.att-file-icon { font-size: 16px; }

.msg-reactions {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.msg-reactions--empty { opacity: 0; transition: opacity 0.15s; }
.msg-bubble:hover + .msg-reactions--empty,
.msg-reactions--empty:hover { opacity: 1; }
.reaction-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: #ffffff; border: 1px solid #e5e7eb; border-radius: 999px;
  padding: 2px 8px; font-size: 13px; cursor: pointer;
  color: #1f2937;
}
.reaction-chip--mine { border-color: #2563eb; background: #dbeafe; }
.reaction-chip--add { background: transparent; border-style: dashed; color: #6b7280; }
.reaction-chip--ghost { font-size: 11px; padding: 1px 6px; }
.reaction-icon { width: 16px; height: 16px; }
.reaction-count { font-weight: 600; font-size: 12px; }
.reaction-picker {
  display: inline-flex; gap: 2px; padding: 4px 6px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 999px;
  margin-left: 4px;
}
.reaction-picker-emoji {
  background: none; border: 0; cursor: pointer; font-size: 18px; padding: 2px 4px;
  border-radius: 6px;
}
.reaction-picker-emoji:hover { background: #f3f4f6; }

.thread-error {
  margin: 8px 16px;
  padding: 8px 10px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  font-size: 13px;
}

.composer {
  border-top: 1px solid #e5e7eb;
  padding: 8px 12px;
  background: #ffffff;
}
.staged-row {
  display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;
}
.staged-chip {
  position: relative;
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 2px;
  background: #f9fafb;
}
.staged-chip img { display: block; max-height: 64px; max-width: 96px; border-radius: 6px; }
.staged-file { padding: 6px 8px; font-size: 12px; }
.staged-remove {
  position: absolute; top: -6px; right: -6px;
  width: 18px; height: 18px; border-radius: 999px;
  background: #ef4444; color: #fff; border: 0; cursor: pointer;
  font-size: 12px; line-height: 16px;
}
.composer-row {
  display: flex; align-items: flex-end; gap: 6px;
}
.composer-icon-btn {
  background: #f3f4f6; border: 0; border-radius: 999px;
  width: 36px; height: 36px; cursor: pointer; font-size: 18px;
}
.composer-textarea {
  flex: 1 1 auto;
  resize: none;
  border: 1px solid #d1d5db;
  border-radius: 18px;
  padding: 8px 12px;
  min-height: 36px;
  max-height: 140px;
  font: inherit;
  outline: none;
}
.composer-textarea:focus { border-color: #2563eb; }
.composer-send {
  background: #2563eb; color: #fff; border: 0; border-radius: 18px;
  padding: 8px 16px; font-weight: 700; cursor: pointer;
}
.composer-send:disabled { opacity: 0.5; cursor: not-allowed; }

.lightbox {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; cursor: zoom-out;
}
.lightbox img { max-width: 92vw; max-height: 92vh; border-radius: 8px; }

.muted { color: #6b7280; }
</style>
