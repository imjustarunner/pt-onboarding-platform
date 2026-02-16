<template>
  <div class="container sms-inbox">
    <div class="header">
      <div>
        <h2>SMS Inbox</h2>
        <p class="subtitle">Texting workspace for client conversations.</p>
      </div>
      <div class="header-actions">
        <router-link class="btn btn-secondary" :to="communicationsLink">Communications</router-link>
        <router-link class="btn btn-secondary" :to="preferencesLink">Preferences</router-link>
        <router-link v-if="canManageTexting" class="btn btn-secondary" :to="textingSettingsLink">Texting settings</router-link>
        <button class="btn btn-secondary" type="button" @click="refreshAll" :disabled="loadingThreads || loadingThread">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="layout">
      <aside class="panel threads">
        <div class="panel-title">Threads</div>
        <div v-if="loadingThreads" class="muted">Loading threads…</div>
        <div v-else-if="threads.length === 0" class="muted">No SMS threads yet.</div>
        <button
          v-for="t in threads"
          :key="`thread-${t.client_id}-${t.id}`"
          class="thread-row"
          :class="{ active: Number(selectedClientId) === Number(t.client_id) }"
          type="button"
          @click="selectClient(t.client_id)"
        >
          <div class="thread-top">
            <span class="client">Client: {{ t.client_initials || `#${t.client_id}` }}</span>
            <span class="time">{{ formatTime(t.created_at) }}</span>
          </div>
          <div class="thread-body">{{ t.body || '—' }}</div>
          <div class="thread-meta">{{ t.direction }}</div>
        </button>
      </aside>

      <section class="panel conversation">
        <div class="panel-title">Conversation</div>
        <div v-if="loadingThread" class="muted">Loading conversation…</div>
        <div v-else-if="!selectedClientId" class="muted">Select a thread to view messages.</div>
        <div v-else-if="orderedMessages.length === 0" class="muted">No messages in this thread.</div>
        <div v-else class="bubble-list">
          <div
            v-for="m in orderedMessages"
            :key="m.id"
            class="bubble"
            :class="m.direction === 'INBOUND' ? 'in' : 'out'"
          >
            <div class="meta">
              <span>{{ m.direction }}</span>
              <span>{{ formatTime(m.created_at) }}</span>
            </div>
            <div class="text">{{ m.body }}</div>
          </div>
        </div>
      </section>

      <section class="panel composer">
        <div class="panel-title">Send message</div>
        <div class="field">
          <label>Consent for selected sender number</label>
          <div v-if="consentLoading" class="muted">Loading consent…</div>
          <div v-else class="consent-row">
            <span class="muted">Current: {{ selectedConsentStatusLabel }}</span>
            <button class="btn btn-secondary btn-xs" type="button" @click="setConsent('opted_in')" :disabled="savingConsent || !selectedClientId || !selectedNumberId">
              Opted in
            </button>
            <button class="btn btn-secondary btn-xs" type="button" @click="setConsent('opted_out')" :disabled="savingConsent || !selectedClientId || !selectedNumberId">
              Opted out
            </button>
            <button class="btn btn-secondary btn-xs" type="button" @click="setConsent('pending')" :disabled="savingConsent || !selectedClientId || !selectedNumberId">
              Pending
            </button>
          </div>
        </div>
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
          <textarea v-model="draft" rows="6" placeholder="Type your message…" />
        </div>
        <div class="actions">
          <button class="btn btn-secondary" type="button" @click="startCall" :disabled="calling || !selectedClientId">
            {{ calling ? 'Calling…' : 'Call selected client' }}
          </button>
          <button class="btn btn-primary" type="button" @click="send" :disabled="sending || !selectedClientId || !draft.trim()">
            {{ sending ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const loadingThreads = ref(false);
const loadingThread = ref(false);
const sending = ref(false);
const calling = ref(false);
const error = ref('');
const threads = ref([]);
const thread = ref(null);
const selectedClientId = ref('');
const availableNumbers = ref([]);
const selectedNumberId = ref('');
const draft = ref('');
const consentLoading = ref(false);
const savingConsent = ref(false);
const consentStates = ref([]);

const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''));
const communicationsLink = computed(() => (orgSlug.value ? `/${orgSlug.value}/admin/communications` : '/admin/communications'));
const preferencesLink = computed(() => (orgSlug.value ? `/${orgSlug.value}/preferences` : '/preferences'));
const textingSettingsLink = computed(() => {
  const base = orgSlug.value ? `/${orgSlug.value}/admin/settings` : '/admin/settings';
  return `${base}?category=system&item=sms-numbers`;
});
const canManageTexting = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'admin' || role === 'support' || role === 'super_admin' || role === 'clinical_practice_assistant';
});
const orderedMessages = computed(() => {
  const rows = thread.value?.messages || [];
  return [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
});
const selectedConsent = computed(() => {
  const nid = Number(selectedNumberId.value || 0);
  if (!nid) return null;
  return (consentStates.value || []).find((s) => Number(s.numberId) === nid) || null;
});
const selectedConsentStatusLabel = computed(() => {
  const s = selectedConsent.value?.status || 'pending';
  return String(s).replace('_', ' ');
});

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
};

const dedupeThreads = (rows) => {
  const map = new Map();
  for (const row of rows || []) {
    const clientId = Number(row?.client_id || 0);
    if (!clientId) continue;
    if (!map.has(clientId)) map.set(clientId, row);
  }
  return Array.from(map.values());
};

const loadThreads = async () => {
  try {
    loadingThreads.value = true;
    const resp = await api.get('/messages/recent', { params: { limit: 200 } });
    const rows = Array.isArray(resp.data) ? resp.data : [];
    threads.value = dedupeThreads(rows);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load SMS threads';
    threads.value = [];
  } finally {
    loadingThreads.value = false;
  }
};

const loadThread = async (clientId) => {
  const uid = Number(authStore.user?.id || 0);
  const cid = Number(clientId || 0);
  if (!uid || !cid) return;
  try {
    loadingThread.value = true;
    const resp = await api.get(`/messages/thread/${uid}/${cid}`, { params: { limit: 200 } });
    thread.value = resp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load conversation';
    thread.value = null;
  } finally {
    loadingThread.value = false;
  }
};

const loadConsent = async (clientId) => {
  const cid = Number(clientId || 0);
  if (!cid) {
    consentStates.value = [];
    return;
  }
  try {
    consentLoading.value = true;
    const resp = await api.get(`/sms-numbers/consent/client/${cid}`);
    consentStates.value = Array.isArray(resp.data?.states) ? resp.data.states : [];
  } catch {
    consentStates.value = [];
  } finally {
    consentLoading.value = false;
  }
};

const setConsent = async (status) => {
  const cid = Number(selectedClientId.value || 0);
  const nid = Number(selectedNumberId.value || 0);
  if (!cid || !nid) return;
  try {
    savingConsent.value = true;
    await api.put(`/sms-numbers/consent/client/${cid}`, {
      numberId: nid,
      status,
      source: 'manual_inbox_update'
    });
    await loadConsent(cid);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update consent';
  } finally {
    savingConsent.value = false;
  }
};

const loadNumbers = async () => {
  try {
    const resp = await api.get('/sms-numbers/available');
    const assigned = resp.data?.assigned || [];
    const agency = resp.data?.agency || [];
    const merged = [...assigned, ...agency];
    availableNumbers.value = merged;
    if (!selectedNumberId.value && merged.length) selectedNumberId.value = String(merged[0].id);
  } catch {
    availableNumbers.value = [];
  }
};

const selectClient = async (clientId) => {
  selectedClientId.value = String(clientId);
  const q = { ...route.query, clientId: String(clientId) };
  await router.replace({ path: route.path, query: q });
  await Promise.all([loadThread(clientId), loadConsent(clientId)]);
};

const send = async () => {
  const cid = Number(selectedClientId.value || 0);
  if (!cid || !draft.value.trim()) return;
  try {
    sending.value = true;
    error.value = '';
    await api.post('/messages/send', {
      clientId: cid,
      numberId: selectedNumberId.value || null,
      body: draft.value.trim()
    });
    draft.value = '';
    await Promise.all([loadThread(cid), loadThreads()]);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to send SMS';
  } finally {
    sending.value = false;
  }
};

const startCall = async () => {
  const cid = Number(selectedClientId.value || 0);
  if (!cid) return;
  try {
    calling.value = true;
    error.value = '';
    await api.post('/communications/calls/start', {
      clientId: cid,
      numberId: selectedNumberId.value || null
    });
    await loadThreads();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to start call';
  } finally {
    calling.value = false;
  }
};

const refreshAll = async () => {
  await Promise.all([loadThreads(), loadNumbers()]);
  if (selectedClientId.value) await Promise.all([loadThread(selectedClientId.value), loadConsent(selectedClientId.value)]);
};

onMounted(async () => {
  await Promise.all([loadThreads(), loadNumbers()]);
  const qClientId = String(route.query?.clientId || '').trim();
  if (qClientId) {
    await selectClient(qClientId);
    return;
  }
  const first = threads.value[0];
  if (first?.client_id) await selectClient(first.client_id);
});

watch(
  () => route.query?.clientId,
  async (next) => {
    const normalized = String(next || '').trim();
    if (!normalized) return;
    if (String(selectedClientId.value) === normalized) return;
    await selectClient(normalized);
  }
);

watch(selectedNumberId, async () => {
  if (selectedClientId.value) await loadConsent(selectedClientId.value);
});
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 12px;
  gap: 12px;
}
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(340px, 1.3fr) minmax(280px, 0.9fr);
  gap: 12px;
}
.panel {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  min-height: 480px;
}
.panel-title { font-weight: 600; margin-bottom: 10px; }
.thread-row {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: white;
}
.thread-row.active { border-color: var(--primary); background: rgba(23, 178, 106, 0.08); }
.thread-top { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--text-secondary); }
.thread-body { margin: 6px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.thread-meta { font-size: 12px; color: var(--text-secondary); }
.bubble-list { display: flex; flex-direction: column; gap: 10px; }
.bubble {
  max-width: 92%;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 10px 12px;
}
.bubble.in { background: rgba(253,176,34,0.12); }
.bubble.out { background: rgba(23,178,106,0.12); margin-left: auto; }
.meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.text { white-space: pre-wrap; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
textarea { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; resize: vertical; }
.actions { display: flex; justify-content: flex-end; margin-top: 8px; }
.consent-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.btn-xs { padding: 4px 8px; font-size: 12px; line-height: 1; }
.muted { color: var(--text-secondary); }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
@media (max-width: 1200px) {
  .layout { grid-template-columns: 1fr; }
  .panel { min-height: auto; }
}
</style>
