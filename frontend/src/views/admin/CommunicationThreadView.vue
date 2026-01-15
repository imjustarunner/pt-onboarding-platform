<template>
  <div class="container comms-thread">
    <div class="header">
      <div>
        <router-link to="/admin/communications" class="back">← Back to All Recent Texts</router-link>
        <h2>Conversation</h2>
        <p class="subtitle">
          Client: {{ thread?.client?.initials || '—' }}
        </p>
      </div>
      <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else class="grid">
      <div class="card messages">
        <div v-if="thread?.messages?.length === 0" class="empty">No messages in this thread.</div>
        <div v-else class="bubble-list">
          <div
            v-for="m in orderedMessages"
            :key="m.id"
            class="bubble"
            :class="m.direction === 'INBOUND' ? 'in' : 'out'"
          >
            <div class="meta">
              <span class="dir">{{ m.direction }}</span>
              <span class="time">{{ formatTime(m.created_at) }}</span>
            </div>
            <div class="text">{{ m.body }}</div>
          </div>
        </div>
      </div>

      <div class="card composer">
        <h3>Send message</h3>
        <div class="field">
          <label>Message</label>
          <textarea v-model="draft" rows="5" placeholder="Type your message…" />
        </div>
        <div class="actions">
          <button class="btn btn-primary" @click="send" :disabled="sending || !draft.trim()">
            {{ sending ? 'Sending…' : 'Send' }}
          </button>
        </div>
        <div class="hint">
          Sends from the owner user’s system number to the client’s contact phone.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const userId = computed(() => parseInt(route.params.userId));
const clientId = computed(() => parseInt(route.params.clientId));

const loading = ref(true);
const sending = ref(false);
const error = ref('');
const thread = ref(null);
const draft = ref('');

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
};

const orderedMessages = computed(() => {
  const msgs = thread.value?.messages || [];
  return [...msgs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
});

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/messages/thread/${userId.value}/${clientId.value}`, { params: { limit: 200 } });
    thread.value = resp.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load thread';
  } finally {
    loading.value = false;
  }
};

const send = async () => {
  try {
    sending.value = true;
    error.value = '';
    await api.post('/messages/send', {
      userId: userId.value,
      clientId: clientId.value,
      body: draft.value
    });
    draft.value = '';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    sending.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 14px;
}
.back { color: var(--text-secondary); text-decoration: none; }
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; }
.grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 14px; }
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.bubble-list { display: flex; flex-direction: column; gap: 10px; }
.bubble {
  max-width: 90%;
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
}
.bubble.in { background: rgba(253,176,34,0.12); }
.bubble.out { background: rgba(23,178,106,0.12); margin-left: auto; }
.meta { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.text { white-space: pre-wrap; }
.field { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
textarea { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; resize: vertical; }
.actions { margin-top: 10px; display: flex; justify-content: flex-end; }
.hint { margin-top: 10px; color: var(--text-secondary); font-size: 12px; }
.empty { color: var(--text-secondary); padding: 18px 6px; }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.loading { color: var(--text-secondary); }
</style>

