<template>
  <section class="card">
    <div class="section-head">
      <div>
        <h2>Communications</h2>
        <p>Text and call clients</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="refreshAll">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="field">
      <label>From number</label>
      <select v-model="selectedNumberId">
        <option v-if="availableNumbers.length === 0" :value="''">No numbers available</option>
        <option v-for="n in availableNumbers" :key="n.id" :value="String(n.id)">
          {{ n.phone_number }}
        </option>
      </select>
    </div>

    <div class="layout">
      <aside class="threads">
        <h3>Threads</h3>
        <button
          v-for="row in threads"
          :key="`thread-${row.client_id}-${row.id}`"
          class="thread"
          :class="{ active: Number(selectedClientId) === Number(row.client_id) }"
          type="button"
          @click="selectClient(row.client_id)"
        >
          <div class="thread-title">Client {{ row.client_initials || `#${row.client_id}` }}</div>
          <div class="thread-preview">{{ row.body || 'No body' }}</div>
        </button>
        <p v-if="!loading && threads.length === 0" class="muted">No message threads yet.</p>
      </aside>

      <section class="conversation">
        <h3>Conversation</h3>
        <div v-if="messages.length === 0" class="muted">Select a thread to view messages.</div>
        <div v-else class="message-list">
          <article
            v-for="m in messages"
            :key="m.id"
            class="message"
            :class="m.direction === 'INBOUND' ? 'in' : 'out'"
          >
            <div class="meta">{{ m.direction }} · {{ formatTime(m.created_at) }}</div>
            <div>{{ m.body }}</div>
          </article>
        </div>

        <div class="composer">
          <textarea v-model="draft" rows="4" placeholder="Type your message…" />
          <div class="composer-actions">
            <button class="btn btn-secondary btn-sm" type="button" :disabled="calling || !selectedClientId" @click="startCall">
              {{ calling ? 'Calling…' : 'Call' }}
            </button>
            <button class="btn btn-primary btn-sm" type="button" :disabled="sending || !draft.trim() || !selectedClientId" @click="send">
              {{ sending ? 'Sending…' : 'Send SMS' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const authStore = useAuthStore();

const loading = ref(false);
const sending = ref(false);
const calling = ref(false);
const error = ref('');

const threads = ref([]);
const messages = ref([]);
const selectedClientId = ref('');
const availableNumbers = ref([]);
const selectedNumberId = ref('');
const draft = ref('');

const userId = computed(() => Number(authStore.user?.id || 0));

const formatTime = (raw) => {
  const d = new Date(raw || '');
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString();
};

const refreshNumbers = async () => {
  const resp = await api.get('/sms-numbers/available');
  const assigned = Array.isArray(resp.data?.assigned) ? resp.data.assigned : [];
  const agency = Array.isArray(resp.data?.agency) ? resp.data.agency : [];
  const merged = [...assigned, ...agency];
  availableNumbers.value = merged;
  if (!selectedNumberId.value && merged[0]?.id) selectedNumberId.value = String(merged[0].id);
};

const refreshThreads = async () => {
  const resp = await api.get('/messages/recent', { params: { limit: 200 } });
  const rows = Array.isArray(resp.data) ? resp.data : [];
  const byClient = new Map();
  for (const row of rows) {
    const clientId = Number(row?.client_id || 0);
    if (!clientId || byClient.has(clientId)) continue;
    byClient.set(clientId, row);
  }
  threads.value = Array.from(byClient.values());
};

const loadThread = async (clientId) => {
  if (!userId.value || !clientId) {
    messages.value = [];
    return;
  }
  const resp = await api.get(`/messages/thread/${userId.value}/${Number(clientId)}`, { params: { limit: 200 } });
  const rows = Array.isArray(resp.data?.messages) ? resp.data.messages : [];
  messages.value = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
};

const selectClient = async (clientId) => {
  selectedClientId.value = String(clientId);
  await loadThread(clientId);
};

const refreshAll = async () => {
  try {
    loading.value = true;
    error.value = '';
    await Promise.all([refreshNumbers(), refreshThreads()]);
    if (!selectedClientId.value && threads.value[0]?.client_id) {
      selectedClientId.value = String(threads.value[0].client_id);
    }
    if (selectedClientId.value) {
      await loadThread(selectedClientId.value);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load communications.';
  } finally {
    loading.value = false;
  }
};

const send = async () => {
  try {
    sending.value = true;
    error.value = '';
    await api.post('/messages/send', {
      clientId: Number(selectedClientId.value),
      numberId: selectedNumberId.value || null,
      body: draft.value.trim()
    });
    draft.value = '';
    await Promise.all([refreshThreads(), loadThread(selectedClientId.value)]);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to send SMS.';
  } finally {
    sending.value = false;
  }
};

const startCall = async () => {
  try {
    calling.value = true;
    error.value = '';
    await api.post('/communications/calls/start', {
      clientId: Number(selectedClientId.value),
      numberId: selectedNumberId.value || null
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to start call.';
  } finally {
    calling.value = false;
  }
};

onMounted(refreshAll);
</script>

<style scoped>
.card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.section-head h2 {
  margin: 0;
  font-size: 18px;
}

.section-head p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.field {
  margin-top: 10px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
}

select,
textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}

.layout {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.threads,
.conversation {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
  padding: 10px;
}

h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.thread {
  width: 100%;
  text-align: left;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  padding: 8px;
}

.thread.active {
  border-color: var(--primary);
}

.thread-title {
  font-size: 12px;
  font-weight: 700;
}

.thread-preview {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 3px;
}

.message-list {
  display: grid;
  gap: 8px;
}

.message {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}

.message.in {
  background: rgba(253, 176, 34, 0.12);
}

.message.out {
  background: rgba(23, 178, 106, 0.12);
}

.meta {
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.composer {
  margin-top: 10px;
}

.composer-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.muted {
  color: var(--text-secondary);
}

.error-box {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 10px;
}
</style>
