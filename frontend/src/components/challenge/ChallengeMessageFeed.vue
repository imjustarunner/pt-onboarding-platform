<template>
  <section class="challenge-message-feed">
    <h2>Team Messages</h2>
    <form class="message-form" @submit.prevent="postMessage">
      <input
        v-model="draft"
        type="text"
        maxlength="500"
        placeholder="Share an update with your season..."
      />
      <button type="submit" class="btn btn-primary" :disabled="posting || !draft.trim()">
        {{ posting ? 'Posting…' : 'Post' }}
      </button>
    </form>
    <div v-if="loading" class="loading-inline">Loading messages…</div>
    <div v-else class="messages-list">
      <article v-for="m in messages" :key="`msg-${m.id}`" class="message-card">
        <header>
          <strong>{{ m.first_name }} {{ m.last_name }}</strong>
          <span v-if="m.team_name" class="hint">{{ m.team_name }}</span>
        </header>
        <p>{{ m.message_text }}</p>
        <time class="hint">{{ formatTime(m.created_at) }}</time>
      </article>
      <div v-if="!messages.length" class="empty-hint">No messages yet.</div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true }
});

const messages = ref([]);
const loading = ref(false);
const posting = ref(false);
const draft = ref('');

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/messages`, { skipGlobalLoading: true });
    messages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
  } catch {
    messages.value = [];
  } finally {
    loading.value = false;
  }
};

const postMessage = async () => {
  const text = String(draft.value || '').trim();
  if (!text || !props.challengeId) return;
  posting.value = true;
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/messages`, { messageText: text });
    draft.value = '';
    await load();
  } finally {
    posting.value = false;
  }
};

const formatTime = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

watch(() => props.challengeId, load, { immediate: true });
</script>

<style scoped>
.message-form { display: flex; gap: 8px; margin-bottom: 12px; }
.message-form input { flex: 1; min-width: 0; padding: 8px; border: 1px solid #ccc; border-radius: 6px; }
.messages-list { display: flex; flex-direction: column; gap: 8px; }
.message-card { border: 1px solid #eee; border-radius: 8px; padding: 10px; background: #fafafa; }
.message-card header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.message-card p { margin: 0 0 6px 0; white-space: pre-wrap; }
.empty-hint, .loading-inline { color: var(--text-muted, #666); }
</style>
