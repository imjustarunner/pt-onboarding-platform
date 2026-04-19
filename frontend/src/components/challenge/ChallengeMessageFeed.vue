<template>
  <section class="challenge-message-feed">
    <h2>Chat</h2>
    <div class="chat-tabs-row">
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
      <button
        type="button"
        class="mark-all-read-btn"
        :disabled="markAllReadBusy || (unread.season < 1 && unread.team < 1)"
        @click="markAllRead"
      >
        {{ markAllReadBusy ? '…' : 'Mark all as read' }}
      </button>
    </div>

    <!-- Replying-to banner -->
    <div v-if="replyingTo" class="reply-banner">
      <span>↩ Replying to <strong>{{ replyingTo.first_name }}</strong>: {{ truncate(replyingTo.message_text, 60) }}</span>
      <button type="button" class="reply-cancel" @click="replyingTo = null">✕</button>
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
          <button type="button" class="composer-btn" title="Add emoji" @click.stop="emojiOpen = !emojiOpen">😄</button>
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
    <div ref="messagesListEl" class="messages-list" :class="{ 'messages-list--loading': loading }">
      <article
        v-for="(m, idx) in visibleMessages"
        :key="`msg-${m.id}`"
        :data-msg-id="m.id"
        class="message-card"
        :class="{
          'message-card--pinned': Number(m.is_pinned) === 1,
          'message-card--mine': Number(m.user_id) === Number(myUserId),
          'message-card--alt': idx % 2 === 1,
          'message-card--teammate': isTeammateMessage(m)
        }"
        :style="teammateCardStyle(m)"
      >
        <div class="message-body-row">
          <!-- Avatar -->
          <div class="msg-avatar-wrap">
            <img
              v-if="m.profile_photo_path"
              :src="toAvatarUrl(m.profile_photo_path)"
              class="msg-avatar"
              :alt="`${m.first_name} ${m.last_name}`"
            />
            <div v-else class="msg-avatar msg-avatar--initials" :style="{ background: userColor(m.user_id) }">
              {{ initials(m.first_name, m.last_name) }}
            </div>
          </div>

          <div class="msg-content">
            <header>
              <div class="header-main">
                <strong class="msg-name">{{ m.first_name }} {{ m.last_name }}</strong>
                <span v-if="Number(m.is_pinned) === 1" class="pin-pill">📌 Pinned</span>
                <span v-if="m.team_name" class="hint team-tag">{{ m.team_name }}</span>
              </div>
              <div class="header-actions">
                <button v-if="isManager" type="button" class="btn-link" @click="togglePin(m)">
                  {{ Number(m.is_pinned) === 1 ? 'Unpin' : 'Pin' }}
                </button>
                <button v-if="canDeleteMessage(m)" type="button" class="btn-link delete-link" @click="deleteMessage(m)">Delete</button>
                <ReportContentMenu
                  v-if="Number(m.user_id) !== Number(myUserId)"
                  content-type="challenge_message"
                  :content-id="m.id"
                  :owner-user-id="m.user_id"
                  :owner-display-name="`${m.first_name || ''} ${m.last_name || ''}`.trim()"
                  content-label="message"
                  @blocked="onUserBlocked"
                />
              </div>
            </header>

            <!-- Quoted reply context -->
            <div v-if="m.parent_message_text" class="quoted-reply">
              <span class="quoted-name">{{ m.parent_first_name }}</span>: {{ truncate(m.parent_message_text, 80) }}
            </div>

            <p v-html="renderMessageWithMentions(m.message_text)" class="msg-text" />

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

            <!-- Message reactions -->
            <div class="msg-reactions-row">
              <template v-if="msgReactions(m.id).length">
                <button
                  v-for="r in msgReactions(m.id)"
                  :key="`mr-${m.id}-${r.emoji}`"
                  type="button"
                  class="reaction-chip"
                  :class="{ 'reaction-chip--mine': r.mine }"
                  @click="toggleMsgReaction(m.id, r.emoji)"
                >{{ r.emoji }} {{ r.count }}</button>
              </template>
              <button type="button" class="reaction-add-btn" @click.stop="openReactionPicker(m.id)">😊 +</button>
            </div>

            <!-- Inline emoji picker for reactions -->
            <div v-if="reactionPickerFor === m.id" class="emoji-panel emoji-panel--reaction" @click.stop>
              <button
                v-for="em in quickReactions"
                :key="`rp-${em}`"
                type="button"
                class="emoji-pick-btn"
                @click="toggleMsgReaction(m.id, em)"
              >{{ em }}</button>
            </div>

            <div class="msg-footer">
              <time class="hint">{{ formatTime(m.created_at) }}</time>
              <button type="button" class="btn-link reply-btn" @click="startReply(m)">↩ Reply</button>
            </div>
          </div>
        </div>
      </article>
      <div v-if="!visibleMessages.length" class="empty-hint">No messages yet. Start the conversation!</div>
    </div>
  </section>

  <!-- Screenshot lightbox -->
  <div v-if="lightboxUrl" class="lightbox-overlay" @click.self="lightboxUrl = null">
    <div class="lightbox-box">
      <button class="lightbox-close" @click="lightboxUrl = null">✕</button>
      <img :src="lightboxUrl" class="lightbox-img" alt="Attachment" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import api from '../../services/api';
import ReportContentMenu from '@/components/safety/ReportContentMenu.vue';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  myUserId: { type: [String, Number], default: null },
  isManager: { type: Boolean, default: false },
  /** User ids on the viewer's team (season or team chat) — highlighted with team accent. */
  teamMateUserIds: { type: Array, default: () => [] },
  /** Lowercase strings matched after @ for "mentioned you" styling. */
  mentionSlugs: { type: Array, default: () => [] },
  /** Left border for teammate messages (match Team Chat tab accent). */
  teamAccentColor: { type: String, default: '#ea580c' }
});

const messages      = ref([]);
const blockedUserIds = ref(new Set());
const loading       = ref(false);
const posting       = ref(false);

const loadBlockedUsers = async () => {
  try {
    const { data } = await api.get('/user-safety/blocks', { skipGlobalLoading: true });
    const ids = (data?.blocks || []).map((b) => Number(b.userId)).filter(Boolean);
    blockedUserIds.value = new Set(ids);
  } catch {
    blockedUserIds.value = new Set();
  }
};

const onUserBlocked = ({ userId }) => {
  const id = Number(userId);
  if (!id) return;
  const next = new Set(blockedUserIds.value);
  next.add(id);
  blockedUserIds.value = next;
};

const visibleMessages = computed(() =>
  (messages.value || []).filter((m) => !blockedUserIds.value.has(Number(m?.user_id)))
);
const draft         = ref('');
const activeScope   = ref('season');
const currentTeamId = ref(null);
const unread        = ref({ season: 0, team: 0 });
const markAllReadBusy = ref(false);
const emojiOpen     = ref(false);
const pendingAttachments = ref([]);
const attachInputRef = ref(null);
const replyingTo    = ref(null);
const reactionPickerFor = ref(null);
const reactionsMap  = ref({});  // { messageId: [{ emoji, count, mine }] }
const lightboxUrl   = ref(null);
const messagesListEl = ref(null);
const lastSeasonReadMsgId = ref(0);
const lastTeamReadMsgId = ref(0);
let unreadPollTimer = null;

const emojiList = [
  '👏','🔥','💪','🏆','⚡','🙌','😤','🎯','🥊','💥',
  '🚀','👟','🏃','❤️','🤙','🫡','💯','🤩','😍','👍',
  '😂','🥇','🎉','💎','⭐','🌟','💫','🏅','🥳','😎'
];

const quickReactions = ['👍','❤️','🔥','💪','🎉','👏','😂','😮'];

// Deterministic color for a user avatar initials bubble
const avatarPalette = ['#6d5efc','#e97b2a','#2196F3','#4caf50','#e91e63','#9c27b0','#00bcd4','#ff5722'];
const userColor = (userId) => avatarPalette[Number(userId || 0) % avatarPalette.length];
const initials = (first, last) => `${String(first || '').charAt(0)}${String(last || '').charAt(0)}`.toUpperCase();

const toAvatarUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const apiBase = String(import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
  const cleaned = path.replace(/^\/+/, '').replace(/^(?:api\/)?uploads\//, '');
  return `${apiBase}/uploads/${cleaned}`;
};

const msgReactions = (messageId) => reactionsMap.value[Number(messageId)] || [];

const teammateIdSet = computed(() => new Set((props.teamMateUserIds || []).map((id) => Number(id)).filter((n) => n > 0)));

const isTeammateMessage = (m) => {
  const uid = Number(m?.user_id);
  const myId = Number(props.myUserId || 0);
  if (!uid || uid === myId) return false;
  return teammateIdSet.value.has(uid);
};

const teammateCardStyle = (m) => {
  if (!isTeammateMessage(m)) return {};
  return { borderLeft: `3px solid ${props.teamAccentColor}` };
};

const scrollMessageIntoView = (messageId, behavior = 'smooth') => {
  if (!messageId || !messagesListEl.value) return;
  const el = messagesListEl.value.querySelector(`[data-msg-id="${messageId}"]`);
  el?.scrollIntoView({ block: 'center', behavior });
};

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    await loadUnreadCounts();
    const rPeek = await api.get(`/learning-program-classes/${props.challengeId}/messages`, {
      params: { scope: activeScope.value, peek: 1, limit: 50 },
      skipGlobalLoading: true
    });
    messages.value = Array.isArray(rPeek.data?.messages) ? rPeek.data.messages : [];
    currentTeamId.value = rPeek.data?.teamId ? Number(rPeek.data.teamId) : null;
    const wmPeek = activeScope.value === 'season' ? lastSeasonReadMsgId.value : lastTeamReadMsgId.value;
    const myId = Number(props.myUserId || 0);
    const firstUnreadPeek = (messages.value || []).find((m) => Number(m.user_id) !== myId && Number(m.id) > wmPeek);
    const scrollAnchorId = firstUnreadPeek?.id ?? null;
    await nextTick();
    if (scrollAnchorId) scrollMessageIntoView(scrollAnchorId, 'auto');
    const rFinal = await api.get(`/learning-program-classes/${props.challengeId}/messages`, {
      params: { scope: activeScope.value, limit: 50 },
      skipGlobalLoading: true
    });
    messages.value = Array.isArray(rFinal.data?.messages) ? rFinal.data.messages : [];
    currentTeamId.value = rFinal.data?.teamId ? Number(rFinal.data.teamId) : null;
    if (activeScope.value === 'season') unread.value = { ...unread.value, season: 0 };
    else unread.value = { ...unread.value, team: 0 };
    await loadUnreadCounts();
    await loadAllReactions();
    await nextTick();
    if (scrollAnchorId && (messages.value || []).some((m) => Number(m.id) === Number(scrollAnchorId))) {
      scrollMessageIntoView(scrollAnchorId, 'auto');
    }
  } catch {
    messages.value = [];
    currentTeamId.value = null;
  } finally {
    loading.value = false;
  }
};

const scrollToFirstUnread = () => {
  const wm = activeScope.value === 'season' ? lastSeasonReadMsgId.value : lastTeamReadMsgId.value;
  const myId = Number(props.myUserId || 0);
  const target = (messages.value || []).find((m) => Number(m.user_id) !== myId && Number(m.id) > wm);
  if (!target) return;
  scrollMessageIntoView(target.id, 'smooth');
};

const loadUnreadCounts = async () => {
  if (!props.challengeId) return;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/messages/unread-counts`, { skipGlobalLoading: true });
    unread.value = { season: Number(r.data?.seasonUnread || 0), team: Number(r.data?.teamUnread || 0) };
    lastSeasonReadMsgId.value = Number(r.data?.seasonLastReadMessageId || 0);
    lastTeamReadMsgId.value = Number(r.data?.teamLastReadMessageId || 0);
    if (r.data?.teamId) currentTeamId.value = Number(r.data.teamId);
  } catch {
    unread.value = { season: 0, team: 0 };
  }
};

const markAllRead = async () => {
  if (!props.challengeId || markAllReadBusy.value) return;
  markAllReadBusy.value = true;
  try {
    const r = await api.post(`/learning-program-classes/${props.challengeId}/messages/mark-read`, {}, { skipGlobalLoading: true });
    unread.value = {
      season: Number(r.data?.seasonUnread ?? 0),
      team: Number(r.data?.teamUnread ?? 0)
    };
    if (r.data?.teamId) currentTeamId.value = Number(r.data.teamId);
    await loadUnreadCounts();
  } catch {
    /* keep badges; user can retry */
  } finally {
    markAllReadBusy.value = false;
  }
};

const loadAllReactions = async () => {
  const ids = (messages.value || []).map((m) => Number(m.id)).filter(Boolean);
  if (!ids.length) return;
  const newMap = {};
  await Promise.all(ids.map(async (mid) => {
    try {
      const r = await api.get(`/learning-program-classes/${props.challengeId}/messages/${mid}/reactions`, { skipGlobalLoading: true });
      newMap[mid] = (r.data?.reactions || []).map((rx) => ({
        emoji: rx.emoji,
        count: Number(rx.count || 1),
        mine: rx.mine || Number(rx.user_id) === Number(props.myUserId)
      }));
    } catch { newMap[mid] = []; }
  }));
  reactionsMap.value = newMap;
};

const openReactionPicker = (messageId) => {
  reactionPickerFor.value = reactionPickerFor.value === messageId ? null : messageId;
};

const toggleMsgReaction = async (messageId, emoji) => {
  reactionPickerFor.value = null;
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/messages/${messageId}/reactions`, { emoji });
    // Refresh reactions for this message only
    const r = await api.get(`/learning-program-classes/${props.challengeId}/messages/${messageId}/reactions`, { skipGlobalLoading: true });
    reactionsMap.value = {
      ...reactionsMap.value,
      [messageId]: (r.data?.reactions || []).map((rx) => ({
        emoji: rx.emoji,
        count: Number(rx.count || 1),
        mine: rx.mine || Number(rx.user_id) === Number(props.myUserId)
      }))
    };
  } catch { /* silent */ }
};

const switchScope = async (scope) => {
  const s = String(scope || '').toLowerCase() === 'team' ? 'team' : 'season';
  if (activeScope.value === s) return;
  activeScope.value = s;
  replyingTo.value = null;
  await load();
};

const startReply = (m) => { replyingTo.value = m; };

const truncate = (text, len) => {
  const s = String(text || '');
  return s.length > len ? s.slice(0, len) + '…' : s;
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
      attachmentPaths: pendingAttachments.value.map((a) => a.filePath),
      parentMessageId: replyingTo.value?.id || null
    });
    draft.value = '';
    pendingAttachments.value = [];
    replyingTo.value = null;
    await load();
  } finally {
    posting.value = false;
  }
};

const parseAttachments = (m) => {
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

const mentionSlugSet = computed(() => new Set((props.mentionSlugs || []).map((s) => String(s).toLowerCase()).filter(Boolean)));

const renderMessageWithMentions = (text) => {
  const escaped = escapeHtml(text);
  const slugs = mentionSlugSet.value;
  return escaped.replace(/(^|[\s(])(@[^\s@<]+)/g, (_full, pre, raw) => {
    const handle = String(raw).slice(1).toLowerCase();
    const cls = slugs.has(handle) ? 'mention mention--me' : 'mention';
    return `${pre}<span class="${cls}">${raw}</span>`;
  });
};

const onDocClick = () => { emojiOpen.value = false; reactionPickerFor.value = null; };

watch(() => props.challengeId, load, { immediate: true });

onMounted(() => {
  loadBlockedUsers();
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
.challenge-message-feed {
  padding: 20px 20px 16px;
}
.challenge-message-feed > h2 { margin: 0 0 12px; font-size: 1.1em; }
.chat-tabs-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.chat-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.mark-all-read-btn {
  border: 1px solid #c7d2fe;
  background: #f8fafc;
  color: #4338ca;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.mark-all-read-btn:hover:not(:disabled) { background: #eef2ff; }
.mark-all-read-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.tab-btn {
  border: 1px solid #d8d8d8; background: #fff; border-radius: 999px;
  padding: 4px 12px; cursor: pointer; font-size: 0.87em;
}
.tab-btn.active { border-color: #6d5efc; background: #f3f1ff; color: #3c2fd3; }
.badge {
  margin-left: 6px; border-radius: 999px; padding: 0 6px;
  font-size: 0.72rem; background: #6d5efc; color: #fff;
}

/* Reply banner */
.reply-banner {
  display: flex; align-items: center; justify-content: space-between;
  background: #f0f4ff; border-left: 3px solid #6d5efc;
  border-radius: 6px; padding: 6px 10px; margin-bottom: 8px;
  font-size: 0.83em; color: #3c2fd3;
}
.reply-cancel {
  background: none; border: none; cursor: pointer; color: #3c2fd3; font-size: 1em;
}

/* Composer */
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
.emoji-panel--reaction { margin-top: 4px; margin-bottom: 0; }
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

/* Messages list */
.messages-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 4px;
  scroll-behavior: smooth;
}
.messages-list--loading {
  opacity: 0.55;
  pointer-events: none;
}
.message-card {
  border-radius: 10px; padding: 10px 12px;
  background: #ffffff;
}
.message-card--alt { background: #f8f7ff; }
.message-card--mine { background: #f0f9ff; }
.message-card--pinned { border-left: 3px solid #a5b4fc; background: #f5f3ff; }

/* Message body: avatar + content */
.message-body-row { display: flex; gap: 10px; align-items: flex-start; }
.msg-avatar-wrap { flex-shrink: 0; }
.msg-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  object-fit: cover; display: block;
}
.msg-avatar--initials {
  display: flex; align-items: center; justify-content: center;
  font-size: 0.82em; font-weight: 700; color: #fff;
}
.msg-content { flex: 1; min-width: 0; }

/* Header */
.message-card header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; align-items: center; }
.header-main { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.msg-name { font-size: 0.9em; }
.pin-pill {
  border-radius: 999px; border: 1px solid #a5b4fc;
  background: #ede9fe; color: #4f46e5; padding: 1px 8px; font-size: 0.72rem;
}
.team-tag { color: #94a3b8; font-size: 0.82em; }

/* Quoted reply */
.quoted-reply {
  background: #f1f5f9; border-left: 3px solid #cbd5e1;
  border-radius: 4px; padding: 4px 8px; margin-bottom: 6px;
  font-size: 0.81em; color: #475569;
}
.quoted-name { font-weight: 600; margin-right: 4px; }

.message-card p { margin: 0 0 4px 0; white-space: pre-wrap; line-height: 1.5; font-size: 0.92em; }
.message-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.message-attachment-img {
  max-width: 200px; max-height: 180px; object-fit: cover;
  border-radius: 8px; border: 1px solid #e2e8f0; cursor: pointer;
}

/* Reactions */
.msg-reactions-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 4px; }
.reaction-chip {
  display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid #e2e8f0; border-radius: 999px;
  padding: 2px 8px; font-size: 0.82em; background: #f8fafc;
  cursor: pointer;
}
.reaction-chip--mine { border-color: #6d5efc; background: #f3f1ff; }
.reaction-chip:hover { background: #eef2ff; }
.reaction-add-btn {
  border: 1px dashed #cbd5e1; border-radius: 999px;
  padding: 2px 8px; font-size: 0.78em; background: transparent;
  cursor: pointer; color: #94a3b8;
}
.reaction-add-btn:hover { border-color: #6d5efc; color: #6d5efc; }

/* Footer */
.msg-footer { display: flex; gap: 10px; align-items: center; }
.reply-btn { font-size: 0.78em; color: #94a3b8; }
.reply-btn:hover { color: #6d5efc; }

.empty-hint, .loading-inline { color: var(--text-muted, #666); padding: 8px 0; }
.btn-link { border: none; background: transparent; color: #6d5efc; cursor: pointer; font-size: 0.78rem; }
.delete-link { color: #c62828; }
:deep(.mention) { color: #4338ca; font-weight: 600; background: rgba(67, 56, 202, 0.08); padding: 0 3px; border-radius: 4px; }
:deep(.mention--me) {
  color: #713f12;
  font-weight: 700;
  background: linear-gradient(120deg, #fef08a 0%, #fde047 100%);
  padding: 1px 5px;
  border-radius: 5px;
}
.message-card--teammate:not(.message-card--mine) { background: #fffaf5; }

/* Lightbox */
.lightbox-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.lightbox-box { position: relative; max-width: 90vw; max-height: 90vh; }
.lightbox-close {
  position: absolute; top: -36px; right: 0;
  background: none; border: none; color: #fff; font-size: 1.4em; cursor: pointer;
}
.lightbox-img { max-width: 90vw; max-height: 90vh; border-radius: 10px; }
</style>
