<template>
  <div class="container comms-thread">
    <div class="header" data-tour="thread-header">
      <div>
        <router-link :to="smsInboxLink" class="back" data-tour="thread-back">← Back to SMS Inbox</router-link>
        <h2 data-tour="thread-title">Conversation</h2>
        <p class="subtitle" data-tour="thread-client">
          Client: {{ thread?.client?.initials || '—' }}
        </p>
      </div>
      <div class="header-actions" data-tour="thread-actions">
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
        <button class="btn btn-danger" @click="deleteConversation" :disabled="deleting || loading">
          {{ deleting ? 'Deleting…' : 'Delete conversation' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else class="grid" data-tour="thread-grid">
      <div class="card messages" data-tour="thread-messages">
        <div v-if="thread?.messages?.length === 0" class="empty">No messages in this thread.</div>
        <div v-else class="bubble-list" data-tour="thread-bubble-list">
          <div
            v-for="m in orderedMessages"
            :key="m.id"
            class="bubble"
            :class="m.direction === 'INBOUND' ? 'in' : 'out'"
            data-tour="thread-bubble"
          >
            <div class="meta">
              <span class="dir">{{ m.direction }}</span>
              <span class="time">{{ formatTime(m.created_at) }}</span>
            </div>
            <div v-if="getMediaUrls(m).length" class="bubble-media">
              <a v-for="(url, i) in getMediaUrls(m)" :key="i" :href="url" target="_blank" rel="noopener" class="bubble-media-link">
                <img :src="url" :alt="`Image ${i + 1}`" class="bubble-media-img" loading="lazy" />
              </a>
            </div>
            <div v-if="m.body && m.body !== '[MMS]'" class="text">{{ m.body }}</div>
          </div>
        </div>
      </div>

      <div class="card composer" data-tour="thread-composer">
        <h3>Send message</h3>
        <div class="field">
          <label>From number</label>
          <select v-model="selectedNumberId" class="select">
            <option v-if="availableNumbers.length === 0" :value="''">No numbers available</option>
            <option v-for="n in availableNumbers" :key="n.id" :value="String(n.id)">
              {{ n.phone_number }} · {{ n.owner_type === 'staff' ? 'Assigned' : 'Agency' }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>Message</label>
          <textarea v-model="draft" rows="5" placeholder="Type your message…" />
          <div v-if="pendingMediaUrls.length" class="pending-media">
            <span v-for="(url, i) in pendingMediaUrls" :key="i" class="pending-media-item">
              <img :src="url" alt="Attached" class="pending-media-thumb" />
              <button type="button" class="pending-media-remove" @click="removePendingMedia(i)" aria-label="Remove">×</button>
            </span>
          </div>
          <input ref="fileInputRef" type="file" accept="image/jpeg,image/png,image/gif" class="hidden" @change="onFileSelected" />
          <button type="button" class="btn btn-secondary btn-sm" @click="triggerFileInput">📷 Attach image</button>
        </div>
        <div class="actions">
          <button class="btn btn-primary" @click="send" :disabled="sending || (!draft.trim() && !pendingMediaUrls.length)">
            {{ sending ? 'Sending…' : 'Send' }}
          </button>
        </div>
        <div class="hint">
          Sends from the selected system number to the client’s contact phone.
          Deleting a conversation permanently removes it from this app, but it cannot recall an SMS already delivered to a phone carrier/device.
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
const smsInboxLink = computed(() => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/admin/communications/sms`;
  return '/admin/communications/sms';
});
const userId = computed(() => parseInt(route.params.userId));
const clientId = computed(() => parseInt(route.params.clientId));

const loading = ref(true);
const sending = ref(false);
const deleting = ref(false);
const error = ref('');
const thread = ref(null);
const draft = ref('');
const pendingMediaUrls = ref([]);
const fileInputRef = ref(null);
const availableNumbers = ref([]);
const selectedNumberId = ref('');

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
    error.value = err?.response?.data?.error?.message || 'Failed to upload image';
  }
  e.target.value = '';
};

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

const loadNumbers = async () => {
  try {
    const resp = await api.get('/sms-numbers/available');
    const assigned = resp.data?.assigned || [];
    const agency = resp.data?.agency || [];
    const merged = [...assigned, ...agency];
    availableNumbers.value = merged;
    if (!selectedNumberId.value && merged.length) {
      selectedNumberId.value = String(merged[0].id);
    }
  } catch {
    availableNumbers.value = [];
  }
};

const send = async () => {
  const hasText = draft.value?.trim();
  const hasMedia = pendingMediaUrls.value.length > 0;
  if (!hasText && !hasMedia) return;
  try {
    sending.value = true;
    error.value = '';
    await api.post('/messages/send', {
      clientId: clientId.value,
      body: draft.value?.trim() || '',
      numberId: selectedNumberId.value || null,
      mediaUrls: hasMedia ? pendingMediaUrls.value : undefined
    });
    draft.value = '';
    pendingMediaUrls.value = [];
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    sending.value = false;
  }
};

const deleteConversation = async () => {
  try {
    deleting.value = true;
    error.value = '';
    await api.delete(`/messages/thread/${clientId.value}`);
    // Clear local state; user can navigate back.
    thread.value = { client: thread.value?.client || null, messages: [] };
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete conversation';
  } finally {
    deleting.value = false;
  }
};

onMounted(async () => {
  await load();
  await loadNumbers();
});
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 14px;
}
.header-actions { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
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
.bubble-media { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.bubble-media-link { display: block; }
.bubble-media-img { max-width: 200px; max-height: 200px; border-radius: 8px; object-fit: cover; }
.meta { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.pending-media { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.pending-media-item { position: relative; }
.pending-media-thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); }
.pending-media-remove { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #c00; color: white; border: none; font-size: 14px; line-height: 1; cursor: pointer; }
.hidden { position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; }
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

