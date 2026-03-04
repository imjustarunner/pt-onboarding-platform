<template>
  <section class="comms-mobile">
    <div class="comms-header">
      <div class="header-title">
        <h2>Messages</h2>
        <p>Text and call clients</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="refreshAll">
        {{ loading ? '…' : '↻' }}
      </button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="number-pill" v-if="availableNumbers.length">
      <select v-model="selectedNumberId" class="number-select">
        <option v-for="n in availableNumbers" :key="n.id" :value="String(n.id)">
          {{ n.phone_number }}
        </option>
      </select>
    </div>
    <div v-else class="number-pill number-pill--empty">No number assigned</div>

    <div class="chat-layout">
      <aside class="thread-list">
        <div class="thread-list-header">Conversations</div>
        <button
          v-for="row in threads"
          :key="`thread-${row.client_id}-${row.id}`"
          class="thread-item"
          :class="{ active: Number(selectedClientId) === Number(row.client_id) }"
          type="button"
          @click="selectClient(row.client_id)"
        >
          <div class="thread-avatar">{{ (row.client_initials || '?').slice(0, 2) }}</div>
          <div class="thread-info">
            <span class="thread-name">{{ row.client_initials || `Client #${row.client_id}` }}</span>
            <span class="thread-preview">{{ row.body || 'No messages' }}</span>
          </div>
        </button>
        <p v-if="!loading && threads.length === 0" class="empty-state">No conversations yet.</p>
      </aside>

      <section class="chat-panel">
        <div v-if="!selectedClientId" class="chat-empty">
          <span class="chat-empty-icon">💬</span>
          <p>Select a conversation to view messages</p>
        </div>
        <template v-else>
          <div class="message-list">
            <div
              v-for="m in messages"
              :key="m.id"
              class="message-bubble"
              :class="m.direction === 'INBOUND' ? 'in' : 'out'"
            >
              <div v-if="getMediaUrls(m).length" class="bubble-media">
                <a v-for="(url, i) in getMediaUrls(m)" :key="i" :href="url" target="_blank" rel="noopener" class="bubble-media-link">
                  <img :src="url" :alt="`Image ${i + 1}`" class="bubble-media-img" loading="lazy" />
                </a>
              </div>
              <div v-if="m.body && m.body !== '[MMS]'" class="bubble-text">{{ m.body }}</div>
              <div class="bubble-time">{{ formatRelativeTime(m.created_at) }}</div>
            </div>
          </div>

          <div class="composer-bar">
            <div class="composer-input-wrap">
              <textarea v-model="draft" rows="2" placeholder="Type a message…" />
              <div v-if="pendingMediaUrls.length" class="pending-media">
                <span v-for="(url, i) in pendingMediaUrls" :key="i" class="pending-media-item">
                  <img :src="url" alt="Attached" class="pending-media-thumb" />
                  <button type="button" class="pending-media-remove" @click="removePendingMedia(i)" aria-label="Remove">×</button>
                </span>
              </div>
              <input ref="fileInputRef" type="file" accept="image/jpeg,image/png,image/gif" class="hidden" @change="onFileSelected" />
              <button type="button" class="btn btn-secondary btn-sm" @click="triggerFileInput">📷</button>
            </div>
            <div class="composer-buttons">
              <button class="btn btn-secondary btn-sm" type="button" :disabled="calling || conferencing || !selectedClientId" @click="startCall" title="Call">
                📞
              </button>
              <button class="btn btn-secondary btn-sm" type="button" :disabled="calling || conferencing || !selectedClientId" @click="startConference" title="Conference call">
                👥
              </button>
              <button class="btn btn-primary" type="button" :disabled="sending || (!draft.trim() && !pendingMediaUrls.length) || !selectedClientId" @click="send">
                {{ sending ? '…' : 'Send' }}
              </button>
            </div>
          </div>
        </template>
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
const conferencing = ref(false);
const error = ref('');

const threads = ref([]);
const messages = ref([]);
const selectedClientId = ref('');
const availableNumbers = ref([]);
const selectedNumberId = ref('');
const draft = ref('');
const pendingMediaUrls = ref([]);
const fileInputRef = ref(null);

const userId = computed(() => Number(authStore.user?.id || 0));

const formatTime = (raw) => {
  const d = new Date(raw || '');
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString();
};

const getMediaUrls = (m) => {
  const meta = m?.metadata;
  if (!meta) return [];
  const urls = typeof meta === 'string' ? (() => { try { return JSON.parse(meta)?.media_urls; } catch { return []; } })() : meta?.media_urls;
  return Array.isArray(urls) ? urls : [];
};
const triggerFileInput = () => fileInputRef.value?.click();
const removePendingMedia = (i) => {
  pendingMediaUrls.value = pendingMediaUrls.value.filter((_, j) => j !== i);
};
const onFileSelected = async (e) => {
  const file = e?.target?.files?.[0];
  if (!file) return;
  try {
    const formData = new FormData();
    formData.append('file', file);
    const r = await api.post('/messages/upload-media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    const url = r.data?.url;
    if (url) pendingMediaUrls.value = [...pendingMediaUrls.value, url];
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to upload image';
  }
  e.target.value = '';
};

const formatRelativeTime = (raw) => {
  try {
    const date = new Date(raw || '');
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
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
  const hasText = draft.value.trim();
  const hasMedia = pendingMediaUrls.value.length > 0;
  if (!selectedClientId.value || (!hasText && !hasMedia)) return;
  try {
    sending.value = true;
    error.value = '';
    await api.post('/messages/send', {
      clientId: Number(selectedClientId.value),
      numberId: selectedNumberId.value || null,
      body: draft.value.trim() || '',
      mediaUrls: hasMedia ? pendingMediaUrls.value : undefined
    });
    draft.value = '';
    pendingMediaUrls.value = [];
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

const startConference = async () => {
  try {
    conferencing.value = true;
    error.value = '';
    await api.post('/communications/calls/start-conference', {
      clientId: Number(selectedClientId.value),
      numberId: selectedNumberId.value || null
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to start conference.';
  } finally {
    conferencing.value = false;
  }
};

onMounted(refreshAll);
</script>

<style scoped>
.comms-mobile {
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}

.comms-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-title p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.number-pill {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg-alt);
  border-radius: 10px;
  font-size: 13px;
}

.number-pill--empty {
  color: var(--text-secondary);
}

.number-select {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
}

.chat-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  min-height: 320px;
}

.thread-list {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.thread-list-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.thread-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 6px;
  border: none;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.thread-item:last-child { margin-bottom: 0; }
.thread-item:hover { background: var(--bg-alt); }
.thread-item.active { background: rgba(23, 178, 106, 0.12); }

.thread-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 15px;
}

.thread-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.thread-name {
  font-weight: 600;
  font-size: 15px;
}

.thread-preview {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-panel {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 280px;
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 15px;
}

.chat-empty-icon { font-size: 48px; opacity: 0.5; }

.message-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 0;
  min-height: 120px;
}

.message-bubble {
  max-width: 82%;
  border-radius: 18px;
  padding: 12px 16px;
}

.message-bubble.in {
  background: #e8e8ed;
  border-bottom-left-radius: 4px;
  align-self: flex-start;
}

.message-bubble.out {
  background: var(--primary);
  color: white;
  border-bottom-right-radius: 4px;
  align-self: flex-end;
  margin-left: auto;
}

.bubble-media { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.bubble-media-link { display: block; }
.bubble-media-img { max-width: 160px; max-height: 160px; border-radius: 8px; object-fit: cover; }
.bubble-text { white-space: pre-wrap; line-height: 1.4; font-size: 15px; }
.bubble-time { font-size: 11px; opacity: 0.85; margin-top: 4px; }

.composer-input-wrap { display: flex; flex-direction: column; gap: 8px; }
.pending-media { display: flex; flex-wrap: wrap; gap: 6px; }
.pending-media-item { position: relative; }
.pending-media-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); }
.pending-media-remove { position: absolute; top: -4px; right: -4px; width: 18px; height: 18px; border-radius: 50%; background: #c00; color: white; border: none; font-size: 12px; line-height: 1; cursor: pointer; }
.hidden { position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; }

.composer-bar {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.composer-bar .composer-input-wrap textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 16px;
  resize: none;
  min-height: 48px;
}

.composer-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.empty-state {
  color: var(--text-secondary);
  font-size: 14px;
  text-align: center;
  padding: 24px;
  margin: 0;
}

.error-box {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  font-size: 14px;
}
</style>
