<template>
  <section class="challenge-message-feed">
    <h2>Chat</h2>
    <div class="chat-tabs">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeScope === 'season' }"
        @click="switchScope('season')"
      >
        Season Chat
        <span v-if="unread.season > 0" class="badge">{{ unread.season }}</span>
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeScope === 'team' }"
        @click="switchScope('team')"
      >
        Team Chat
        <span v-if="unread.team > 0" class="badge">{{ unread.team }}</span>
      </button>
    </div>
    <form class="message-form" @submit.prevent="postMessage">
      <input
        v-model="draft"
        type="text"
        maxlength="500"
        :placeholder="activeScope === 'team' ? 'Share an update with your team...' : 'Share an update with your season...'"
      />
      <button type="submit" class="btn btn-primary" :disabled="posting || !draft.trim()">
        {{ posting ? 'Posting…' : 'Post' }}
      </button>
    </form>
    <p v-if="activeScope === 'team' && !currentTeamId" class="hint" style="margin: 0 0 10px 0;">
      Join a team to use Team Chat.
    </p>
    <div v-if="loading" class="loading-inline">Loading messages…</div>
    <div v-else class="messages-list">
      <article v-for="m in messages" :key="`msg-${m.id}`" class="message-card">
        <header>
          <div class="header-main">
            <strong>{{ m.first_name }} {{ m.last_name }}</strong>
            <span v-if="Number(m.is_pinned) === 1" class="pin-pill">Pinned</span>
            <span v-if="m.team_name" class="hint">{{ m.team_name }}</span>
          </div>
          <div class="header-actions">
            <button
              v-if="isManager"
              type="button"
              class="btn-link"
              @click="togglePin(m)"
            >
              {{ Number(m.is_pinned) === 1 ? 'Unpin' : 'Pin' }}
            </button>
            <button
              v-if="canDeleteMessage(m)"
              type="button"
              class="btn-link delete-link"
              @click="deleteMessage(m)"
            >
              Delete
            </button>
          </div>
        </header>
        <p v-html="renderMessageWithMentions(m.message_text)" />
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

const messages = ref([]);
const loading = ref(false);
const posting = ref(false);
const draft = ref('');
const activeScope = ref('season');
const currentTeamId = ref(null);
const unread = ref({ season: 0, team: 0 });
let unreadPollTimer = null;

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
    unread.value = {
      season: Number(r.data?.seasonUnread || 0),
      team: Number(r.data?.teamUnread || 0)
    };
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

const postMessage = async () => {
  const text = String(draft.value || '').trim();
  if (!text || !props.challengeId) return;
  if (activeScope.value === 'team' && !currentTeamId.value) return;
  posting.value = true;
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/messages`, {
      messageText: text,
      scope: activeScope.value
    });
    draft.value = '';
    await load();
  } finally {
    posting.value = false;
  }
};

const canDeleteMessage = (m) => {
  return props.isManager || Number(m?.user_id) === Number(props.myUserId);
};

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
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const renderMessageWithMentions = (text) => {
  const escaped = escapeHtml(text);
  return escaped.replace(/(^|\s)(@[a-zA-Z0-9_]+)/g, '$1<span class="mention">$2</span>');
};

watch(() => props.challengeId, load, { immediate: true });

onMounted(() => {
  loadUnreadCounts();
  unreadPollTimer = window.setInterval(() => {
    loadUnreadCounts();
  }, 15000);
});

onBeforeUnmount(() => {
  if (unreadPollTimer) window.clearInterval(unreadPollTimer);
});
</script>

<style scoped>
.chat-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.tab-btn {
  border: 1px solid #d8d8d8;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  cursor: pointer;
}
.tab-btn.active {
  border-color: #6d5efc;
  background: #f3f1ff;
  color: #3c2fd3;
}
.badge {
  margin-left: 6px;
  border-radius: 999px;
  padding: 0 6px;
  font-size: 0.72rem;
  background: #6d5efc;
  color: #fff;
}
.message-form { display: flex; gap: 8px; margin-bottom: 12px; }
.message-form input { flex: 1; min-width: 0; padding: 8px; border: 1px solid #ccc; border-radius: 6px; }
.messages-list { display: flex; flex-direction: column; gap: 8px; }
.message-card { border: 1px solid #eee; border-radius: 8px; padding: 10px; background: #fafafa; }
.message-card header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; align-items: center; }
.header-main { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.pin-pill {
  border-radius: 999px;
  border: 1px solid #d7ccff;
  background: #f3f1ff;
  color: #5a46d8;
  padding: 1px 8px;
  font-size: 0.72rem;
}
.message-card p { margin: 0 0 6px 0; white-space: pre-wrap; }
.empty-hint, .loading-inline { color: var(--text-muted, #666); }
.btn-link {
  border: none;
  background: transparent;
  color: #6d5efc;
  cursor: pointer;
  font-size: 0.78rem;
}
.delete-link { color: #c62828; }
:deep(.mention) {
  color: #3c2fd3;
  font-weight: 600;
}
</style>
