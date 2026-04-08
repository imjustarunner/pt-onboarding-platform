<template>
  <section class="challenge-message-feed">
    <h2>Chat</h2>
    <div class="chat-tabs">
      <button type="button" class="tab-btn" :class="{ active: activeScope === 'season' }" @click="switchScope('season')">
        Season Chat
        <span v-if="unread.season > 0" class="badge">{{ unread.season }}</span>
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeScope === 'team' }" @click="switchScope('team')">
        Team Chat
        <span v-if="unread.team > 0" class="badge">{{ unread.team }}</span>
      </button>
    </div>

    <!-- Attachment previews (above composer) -->
    <div v-if="pendingAttachments.length" class="pending-attachments">
      <div v-for="(a, i) in pendingAttachments" :key="`pa-${i}`" class="pending-attachment">
        <img :src="a.fileUrl" class="pending-thumb" :alt="`attachment ${i + 1}`" />
        <button type="button" class="pending-remove" @click="removePendingAttachment(i)">✕</button>
      </div>
    </div>

    <form class="message-form" @submit.prevent="postMessage">
      <div class="message-composer">
        <input
          v-model="draft"
          type="text"
          maxlength="500"
          :placeholder="activeScope === 'team' ? 'Share an update with your team...' : 'Share an update with your season...'"
          class="message-input"
        />
        <div class="composer-actions">
          <!-- Emoji picker toggle -->
          <button type="button" class="composer-btn" title="Add emoji" @click.stop="emojiOpen = !emojiOpen">😄</button>
          <!-- Image attachment -->
          <label class="composer-btn" title="Attach image">
            📎
            <input
              ref="attachInputRef"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              style="display:none"
              @change="onAttachFile"
            />
          </label>
          <button type="submit" class="btn btn-primary composer-post" :disabled="posting || (!draft.trim() && !pendingAttachments.length)">
            {{ posting ? '…' : 'Post' }}
          </button>
        </div>
      </div>
      <!-- Emoji picker panel -->
      <div v-if="emojiOpen" class="emoji-panel" @click.stop>
        <button
          v-for="em in emojiList"
          :key="`ce-${em}`"
          type="button"
          class="emoji-pick-btn"
          @click="insertEmoji(em)"
        >{{ em }}</button>
      </div>
    </form>

    <p v-if="activeScope === 'team' && !currentTeamId" class="hint" style="margin: 0 0 10px 0;">
      Join a team to use Team Chat.
    </p>

    <div v-if="loading" class="loading-inline">Loading messages…</div>
    <div v-else class="messages-list">
      <article v-for="m in messages" :key="`msg-${m.id}`" class="message-card" :class="{ 'message-card--pinned': Number(m.is_pinned) === 1 }">
        <header>
          <div class="header-main">
            <strong>{{ m.first_name }} {{ m.last_name }}</strong>
            <span v-if="Number(m.is_pinned) === 1" class="pin-pill">📌 Pinned</span>
            <span v-if="m.team_name" class="hint team-tag">{{ m.team_name }}</span>
          </div>
          <div class="header-actions">
            <button v-if="isManager" type="button" class="btn-link" @click="togglePin(m)">
              {{ Number(m.is_pinned) === 1 ? 'Unpin' : 'Pin' }}
            </button>
            <button v-if="canDeleteMessage(m)" type="button" class="btn-link delete-link" @click="deleteMessage(m)">Delete</button>
          </div>
        </header>
        <p v-html="renderMessageWithMentions(m.message_text)" />
        <!-- Attachments -->
        <div v-if="parseAttachments(m).length" class="message-attachments">
          <a
            v-for="(attUrl, ai) in parseAttachments(m)"
            :key="`matt-${m.id}-${ai}`"
            :href="attUrl"
            target="_blank"
            rel="noopener"
          >
            <img :src="attUrl" class="message-attachment-img" :alt="`attachment ${ai + 1}`" />
          </a>
        </div>
        <time class="hint">{{ formatTime(m.created_at) }}</time>
      </article>
      <div v-if="!messages.length" class="empty-hint">No messages yet.</div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  myUserId: { type: [String, Number], default: null },
  isManager: { type: Boolean, default: false }
});

const messages      = ref([]);
const loading       = ref(false);
const posting       = ref(false);
const draft         = ref('');
const activeScope   = ref('season');
const currentTeamId = ref(null);
const unread        = ref({ season: 0, team: 0 });
const emojiOpen     = ref(false);
const pendingAttachments = ref([]); // [{ filePath, fileUrl }]
const attachInputRef = ref(null);
let unreadPollTimer = null;

const emojiList = [
  '👏','🔥','💪','🏆','⚡','🙌','😤','🎯','🥊','💥',
  '🚀','👟','🏃','❤️','🤙','🫡','💯','🤩','😍','👍',
  '😂','🥇','🎉','💎','⭐','🌟','💫','🏅','🥳','😎'
];

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/messages`, {
      params: { scope: activeScope.value },
      skipGlobalLoading: true
    });
    messages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
    currentTeamId.value = r.data?.teamId ? Number(r.data.teamId) : null;
    await loadUnreadCounts();
  } catch {
    messages.value = [];
    currentTeamId.value = null;
  } finally {
    loading.value = false;
  }
};

const loadUnreadCounts = async () => {
  if (!props.challengeId) return;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/messages/unread-counts`, { skipGlobalLoading: true });
    unread.value = { season: Number(r.data?.seasonUnread || 0), team: Number(r.data?.teamUnread || 0) };
    if (r.data?.teamId) currentTeamId.value = Number(r.data.teamId);
  } catch {
    unread.value = { season: 0, team: 0 };
  }
};

const switchScope = async (scope) => {
  const s = String(scope || '').toLowerCase() === 'team' ? 'team' : 'season';
  if (activeScope.value === s) return;
  activeScope.value = s;
  await load();
};

const insertEmoji = (em) => {
  draft.value += em;
  emojiOpen.value = false;
};

const onAttachFile = async (e) => {
  const file = e.target?.files?.[0];
  if (!file || !props.challengeId) return;
  if (attachInputRef.value) attachInputRef.value.value = '';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await api.post(`/learning-program-classes/${props.challengeId}/messages/attachment`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    if (data.filePath) pendingAttachments.value = [...pendingAttachments.value, { filePath: data.filePath, fileUrl: data.fileUrl }];
  } catch { /* silent */ }
};

const removePendingAttachment = (idx) => {
  pendingAttachments.value = pendingAttachments.value.filter((_, i) => i !== idx);
};

const postMessage = async () => {
  const text = String(draft.value || '').trim();
  if (!text && !pendingAttachments.value.length) return;
  if (activeScope.value === 'team' && !currentTeamId.value) return;
  posting.value = true;
  emojiOpen.value = false;
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/messages`, {
      messageText: text || '📎',
      scope: activeScope.value,
      attachmentPaths: pendingAttachments.value.map((a) => a.filePath)
    });
    draft.value = '';
    pendingAttachments.value = [];
    await load();
  } finally {
    posting.value = false;
  }
};

const parseAttachments = (m) => {
  const backendUrl = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || '';
  try {
    const raw = m.attachments_json;
    if (!raw) return [];
    const paths = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (Array.isArray(paths) ? paths : []).map((p) => `${backendUrl}/uploads/${p}`);
  } catch { return []; }
};

const canDeleteMessage = (m) => props.isManager || Number(m?.user_id) === Number(props.myUserId);

const deleteMessage = async (m) => {
  if (!m?.id) return;
  if (!confirm('Delete this message?')) return;
  await api.delete(`/learning-program-classes/${props.challengeId}/messages/${m.id}`);
  await load();
};

const togglePin = async (m) => {
  if (!m?.id || !props.isManager) return;
  const nextPinned = Number(m.is_pinned) !== 1;
  await api.put(`/learning-program-classes/${props.challengeId}/messages/${m.id}/pin`, { pinned: nextPinned });
  await load();
};

const formatTime = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const escapeHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const renderMessageWithMentions = (text) => {
  const escaped = escapeHtml(text);
  return escaped.replace(/(^|\s)(@[a-zA-Z0-9_]+)/g, '$1<span class="mention">$2</span>');
};

const onDocClick = () => { emojiOpen.value = false; };

watch(() => props.challengeId, load, { immediate: true });

onMounted(() => {
  loadUnreadCounts();
  unreadPollTimer = window.setInterval(loadUnreadCounts, 15000);
  document.addEventListener('click', onDocClick);
});

onBeforeUnmount(() => {
  if (unreadPollTimer) window.clearInterval(unreadPollTimer);
  document.removeEventListener('click', onDocClick);
});
</script>

<style scoped>
.chat-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
.tab-btn {
  border: 1px solid #d8d8d8; background: #fff; border-radius: 999px;
  padding: 4px 12px; cursor: pointer; font-size: 0.87em;
}
.tab-btn.active { border-color: #6d5efc; background: #f3f1ff; color: #3c2fd3; }
.badge {
  margin-left: 6px; border-radius: 999px; padding: 0 6px;
  font-size: 0.72rem; background: #6d5efc; color: #fff;
}
.message-composer {
  display: flex; gap: 6px; align-items: center;
  border: 1.5px solid #e2e8f0; border-radius: 10px;
  padding: 6px 8px; background: #fff;
}
.message-input {
  flex: 1; min-width: 0; border: none; outline: none;
  font-size: 0.92em; background: transparent;
}
.composer-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
.composer-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: 1.2em; padding: 2px 4px; border-radius: 6px;
  color: #64748b; line-height: 1;
}
.composer-btn:hover { background: #f1f5f9; }
.composer-post { font-size: 0.85em; padding: 5px 14px; border-radius: 8px; }
.emoji-panel {
  display: flex; flex-wrap: wrap; gap: 2px;
  background: #fff; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 8px; margin-top: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1); position: relative; z-index: 100;
}
.emoji-pick-btn {
  font-size: 1.3em; padding: 4px; border: none; background: transparent;
  cursor: pointer; border-radius: 6px;
}
.emoji-pick-btn:hover { background: #f1f5f9; }
.pending-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.pending-attachment { position: relative; }
.pending-thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; }
.pending-remove {
  position: absolute; top: -6px; right: -6px;
  background: #ef4444; color: #fff; border: none; border-radius: 50%;
  width: 18px; height: 18px; font-size: 0.7em; cursor: pointer; line-height: 18px; text-align: center;
}
.message-form { margin-bottom: 14px; }
.messages-list { display: flex; flex-direction: column; gap: 8px; }
.message-card {
  border: 1px solid #eee; border-radius: 10px;
  padding: 10px 12px; background: #fafafa;
}
.message-card--pinned { border-color: #a5b4fc; background: #f5f3ff; }
.message-card header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; align-items: center; }
.header-main { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.pin-pill {
  border-radius: 999px; border: 1px solid #a5b4fc;
  background: #ede9fe; color: #4f46e5; padding: 1px 8px; font-size: 0.72rem;
}
.team-tag { color: #94a3b8; font-size: 0.82em; }
.message-card p { margin: 0 0 6px 0; white-space: pre-wrap; line-height: 1.5; }
.message-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.message-attachment-img {
  max-width: 200px; max-height: 180px; object-fit: cover;
  border-radius: 8px; border: 1px solid #e2e8f0; cursor: pointer;
}
.empty-hint, .loading-inline { color: var(--text-muted, #666); padding: 8px 0; }
.btn-link { border: none; background: transparent; color: #6d5efc; cursor: pointer; font-size: 0.78rem; }
.delete-link { color: #c62828; }
:deep(.mention) { color: #3c2fd3; font-weight: 600; }
</style>
