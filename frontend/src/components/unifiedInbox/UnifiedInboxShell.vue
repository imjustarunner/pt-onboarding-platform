<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import UnifiedInboxSidebar from './UnifiedInboxSidebar.vue';
import UnifiedConversationList from './UnifiedConversationList.vue';
import UnifiedConversationThread from './UnifiedConversationThread.vue';
import UnifiedContextPanel from './UnifiedContextPanel.vue';
import UnifiedComposeModal from './UnifiedComposeModal.vue';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const orgPrefix = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}` : '';
});

const resolvedAgencyId = computed(() => {
  const n = parseInt(props.agencyId ?? agencyStore.currentAgency?.id, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const loading = ref(false);
const error = ref('');
const attention = ref({
  needsAttention: 0,
  waitingOnOthers: 0,
  followUpsDue: 0,
  assignedToYou: 0,
  channels: {}
});
const inboxes = ref([]);
const conversations = ref([]);
const selectedId = ref(null);
const detail = ref(null);
const detailLoading = ref(false);

const selectedInboxId = ref(null); // null = My Inbox (or personal id after ensure)
const channel = ref('all');
const listFilter = ref('all');
const searchQ = ref('');
const showSearchExtras = ref(false);
const searchFrom = ref('');
const searchHasAttachment = ref('');
const searchDateFrom = ref('');
const searchDateTo = ref('');
const showCompose = ref(false);
const prefs = ref({ personalEmailNotify: false, digestHours: 48, lastInboxDigestAt: null });

let draftTimer = null;

async function ensurePersonalMailbox() {
  if (!resolvedAgencyId.value) return;
  try {
    const { data } = await api.post(
      '/communications/inboxes/personal/ensure',
      { agencyId: resolvedAgencyId.value },
      { skipGlobalLoading: true }
    );
    if (data?.inbox?.id) {
      selectedInboxId.value = data.inbox.id;
    }
  } catch (e) {
    // Role may not be eligible — ignore
    console.warn('[unifiedInbox] personal mailbox ensure skipped:', e?.response?.data?.error?.message || e?.message);
  }
}

async function loadPrefs() {
  try {
    const { data } = await api.get('/communications/prefs', { skipGlobalLoading: true });
    if (data?.prefs) prefs.value = data.prefs;
  } catch {
    /* ignore */
  }
}

async function savePrefs(patch) {
  prefs.value = { ...prefs.value, ...patch };
  try {
    const { data } = await api.patch('/communications/prefs', patch, { skipGlobalLoading: true });
    if (data?.prefs) prefs.value = data.prefs;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not save notification prefs';
  }
}

async function loadAttention() {
  if (!resolvedAgencyId.value) return;
  const { data } = await api.get('/communications/attention-summary', {
    params: { agencyId: resolvedAgencyId.value },
    skipGlobalLoading: true
  });
  attention.value = data?.summary || attention.value;
}

async function loadInboxes() {
  if (!resolvedAgencyId.value) return;
  const { data } = await api.get('/communications/inboxes', {
    params: { agencyId: resolvedAgencyId.value },
    skipGlobalLoading: true
  });
  inboxes.value = data?.inboxes || [];
  const personal = inboxes.value.find((i) => i.kind === 'personal' || i.identity_key?.startsWith?.('personal_'));
  if (personal?.id && (selectedInboxId.value == null || selectedInboxId.value === 'null')) {
    selectedInboxId.value = personal.id;
  }
}

async function refreshAll() {
  await ensurePersonalMailbox();
  await Promise.all([loadAttention(), loadInboxes(), loadConversations(), loadPrefs()]);
}

async function loadConversations() {
  if (!resolvedAgencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const params = {
      agencyId: resolvedAgencyId.value,
      filter: listFilter.value,
      channel: channel.value === 'all' ? undefined : channel.value,
      q: searchQ.value || undefined,
      fromEmail: searchFrom.value || undefined,
      hasAttachment: searchHasAttachment.value === '' ? undefined : searchHasAttachment.value,
      dateFrom: searchDateFrom.value || undefined,
      dateTo: searchDateTo.value || undefined
    };
    if (selectedInboxId.value === 'assigned') {
      params.inboxId = 'assigned';
    } else if (selectedInboxId.value != null) {
      params.inboxId = selectedInboxId.value;
    }
    const { data } = await api.get('/communications/conversations', {
      params,
      skipGlobalLoading: true
    });
    conversations.value = data?.conversations || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load conversations';
  } finally {
    loading.value = false;
  }
}

async function openConversation(id) {
  if (!id) {
    selectedId.value = null;
    detail.value = null;
    return;
  }
  selectedId.value = id;
  detailLoading.value = true;
  try {
    const { data } = await api.get(`/communications/conversations/${id}`, {
      params: { agencyId: resolvedAgencyId.value },
      skipGlobalLoading: true
    });
    detail.value = data;
    const row = conversations.value.find((c) => c.id === id);
    if (row) row.is_unread = false;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to open conversation';
  } finally {
    detailLoading.value = false;
  }
}

async function patchConversation(patch) {
  if (!selectedId.value) return;
  const { data } = await api.patch(`/communications/conversations/${selectedId.value}`, patch, {
    skipGlobalLoading: true
  });
  if (data?.conversation) {
    detail.value = {
      ...detail.value,
      conversation: { ...detail.value?.conversation, ...data.conversation }
    };
  }
  await Promise.all([loadConversations(), loadAttention()]);
}

function onDraftInput(text) {
  if (!selectedId.value) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    api.patch(`/communications/conversations/${selectedId.value}`, { draftBody: text }, {
      skipGlobalLoading: true
    }).catch(() => {});
  }, 800);
}

async function sendReply(data) {
  if (data?.conversation || data?.messages) {
    detail.value = data;
  } else if (selectedId.value) {
    await openConversation(selectedId.value);
  }
  await Promise.all([loadConversations(), loadAttention()]);
}

async function onContextRefresh(data) {
  if (data?.conversation || data?.messages || data?.context) {
    detail.value = {
      ...(detail.value || {}),
      ...data,
      conversation: data.conversation || detail.value?.conversation,
      messages: data.messages || detail.value?.messages,
      context: data.context || detail.value?.context
    };
  } else if (selectedId.value) {
    await openConversation(selectedId.value);
  }
  await Promise.all([loadConversations(), loadAttention()]);
}

async function onSpam() {
  selectedId.value = null;
  detail.value = null;
  await Promise.all([loadConversations(), loadAttention()]);
}

function onInsight(data) {
  if (!detail.value?.conversation || !data) return;
  detail.value = {
    ...detail.value,
    conversation: {
      ...detail.value.conversation,
      ai_summary: data.summary || detail.value.conversation.ai_summary,
      ai_suggested_action: data.suggestedAction || detail.value.conversation.ai_suggested_action,
      ai_summary_at: new Date().toISOString()
    }
  };
}

async function onComposeSent() {
  showCompose.value = false;
  await refreshAll();
}

function openSmsTools({ clientId, contactId } = {}) {
  router
    .push({
      path: `${orgPrefix.value}/messages`,
      query: {
        view: 'workspace',
        tab: 'sms',
        ...(clientId ? { clientId: String(clientId) } : {}),
        ...(contactId ? { contactId: String(contactId) } : {})
      }
    })
    .catch(() => {});
}

watch(
  () => route.query.channel,
  (v) => {
    if (v && String(v) !== 'all') channel.value = String(v);
  },
  { immediate: true }
);

async function applyRouteDeepLink() {
  const q = route.query || {};
  if (q.channel && String(q.channel) !== 'all') {
    channel.value = String(q.channel);
  }
  if (!conversations.value.length) return;
  const smsClientId = q.smsClientId ? Number(q.smsClientId) : null;
  const smsContactId = q.smsContactId ? Number(q.smsContactId) : null;
  if (!smsClientId && !smsContactId) return;
  const ext = smsClientId ? `sms:client:${smsClientId}` : `sms:contact:${smsContactId}`;
  const row = conversations.value.find((c) => c.external_thread_id === ext);
  if (row) await openConversation(row.id);
}

watch(
  () => [route.query.smsClientId, route.query.smsContactId, route.query.channel, conversations.value.length],
  () => {
    applyRouteDeepLink();
  }
);

watch(resolvedAgencyId, () => {
  selectedId.value = null;
  detail.value = null;
  refreshAll();
});

watch([selectedInboxId, channel, listFilter, searchFrom, searchHasAttachment, searchDateFrom, searchDateTo], () => {
  loadConversations();
});

let searchDebounce = null;
watch(searchQ, () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadConversations(), 300);
});

onMounted(() => refreshAll());
onUnmounted(() => {
  clearTimeout(draftTimer);
  clearTimeout(searchDebounce);
});

const selectedInbox = computed(() => {
  if (selectedInboxId.value == null) return inboxes.value.find((i) => i.identity_key === 'my_inbox') || null;
  return inboxes.value.find((i) => String(i.id) === String(selectedInboxId.value)) || null;
});

defineExpose({ refreshAll });
</script>

<template>
  <div class="uc-shell">
    <header class="uc-top">
      <div class="uc-top-brand">
        <h2>Communications Center</h2>
        <p class="uc-muted">Unified inbox — people, schools, and work</p>
      </div>
      <div class="uc-search-wrap">
        <input
          v-model="searchQ"
          class="uc-search"
          type="search"
          placeholder="Search keyword, from:email, subject:…, file:…"
          aria-label="Search conversations"
        />
        <button type="button" class="uc-search-toggle" @click="showSearchExtras = !showSearchExtras">
          {{ showSearchExtras ? 'Hide filters' : 'Filters' }}
        </button>
      </div>
      <div class="uc-top-user">
        <span class="uc-user-name">{{ authStore.user?.first_name }} {{ authStore.user?.last_name?.charAt(0) }}.</span>
        <span class="uc-muted small">{{ selectedInbox?.display_name || 'My Inbox' }}</span>
      </div>
    </header>

    <div v-if="showSearchExtras" class="uc-search-extras">
      <label>
        From
        <input v-model="searchFrom" type="text" placeholder="sender@…" />
      </label>
      <label>
        Attachment
        <select v-model="searchHasAttachment">
          <option value="">Any</option>
          <option value="1">Has attachment</option>
          <option value="0">No attachment</option>
        </select>
      </label>
      <label>
        From date
        <input v-model="searchDateFrom" type="date" />
      </label>
      <label>
        To date
        <input v-model="searchDateTo" type="date" />
      </label>
    </div>

    <div class="uc-kpi-row">
      <button type="button" class="uc-kpi" :class="{ on: listFilter === 'needs_reply' }" @click="listFilter = 'needs_reply'">
        <span class="uc-kpi-label">Needs Attention</span>
        <strong>{{ attention.needsAttention }}</strong>
        <span class="uc-kpi-hint">Needs your reply</span>
      </button>
      <button type="button" class="uc-kpi" :class="{ on: listFilter === 'waiting' }" @click="listFilter = 'waiting'">
        <span class="uc-kpi-label">Waiting on Others</span>
        <strong>{{ attention.waitingOnOthers }}</strong>
        <span class="uc-kpi-hint">Waiting for a response</span>
      </button>
      <button type="button" class="uc-kpi" :class="{ on: listFilter === 'follow_up' }" @click="listFilter = 'follow_up'">
        <span class="uc-kpi-label">Follow Ups Due</span>
        <strong>{{ attention.followUpsDue }}</strong>
        <span class="uc-kpi-hint">Due today or overdue</span>
      </button>
      <button type="button" class="uc-kpi" :class="{ on: listFilter === 'assigned' }" @click="listFilter = 'assigned'">
        <span class="uc-kpi-label">Assigned to You</span>
        <strong>{{ attention.assignedToYou }}</strong>
        <span class="uc-kpi-hint">Require your action</span>
      </button>
      <div class="uc-kpi metric" title="Average first response time (email) over the last 7 days">
        <span class="uc-kpi-label">Response Time (7d)</span>
        <strong>
          <template v-if="attention.responseTime?.avgHours != null">
            {{ attention.responseTime.avgHours }}h
          </template>
          <template v-else>—</template>
        </strong>
        <span class="uc-kpi-hint">
          <template v-if="attention.responseTime?.sampleSize">
            n={{ attention.responseTime.sampleSize }} · median {{ attention.responseTime.medianHours }}h
          </template>
          <template v-else>Avg first reply</template>
        </span>
      </div>
    </div>

    <div v-if="error" class="uc-error">{{ error }}</div>

    <div class="uc-body">
      <UnifiedInboxSidebar
        :inboxes="inboxes"
        :attention="attention"
        :selected-inbox-id="selectedInboxId"
        :channel="channel"
        :prefs="prefs"
        @update:selected-inbox-id="selectedInboxId = $event"
        @update:channel="channel = $event"
        @compose="showCompose = true"
        @smart-filter="listFilter = $event"
        @update:prefs="savePrefs"
      />

      <UnifiedConversationList
        :conversations="conversations"
        :loading="loading"
        :selected-id="selectedId"
        :filter="listFilter"
        @update:filter="listFilter = $event"
        @select="openConversation"
      />

      <UnifiedConversationThread
        :detail="detail"
        :loading="detailLoading"
        :inbox="selectedInbox"
        :agency-id="resolvedAgencyId"
        @reply="sendReply"
        @patch="patchConversation"
        @draft="onDraftInput"
        @spam="onSpam"
        @insight="onInsight"
        @open-sms-tools="openSmsTools"
        @refresh="onContextRefresh"
      />

      <UnifiedContextPanel
        :detail="detail"
        :agency-id="resolvedAgencyId"
        @patch="patchConversation"
        @refresh="onContextRefresh"
      />
    </div>

    <UnifiedComposeModal
      v-if="showCompose"
      :agency-id="resolvedAgencyId"
      :inboxes="inboxes.filter((i) => i.kind === 'shared' || i.kind === 'personal')"
      :default-inbox-id="typeof selectedInboxId === 'number' ? selectedInboxId : inboxes.find((i) => i.kind === 'personal' || i.kind === 'shared')?.id"
      @close="showCompose = false"
      @sent="onComposeSent"
    />
  </div>
</template>

<style scoped>
.uc-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: calc(100vh - 220px);
  color: #0f172a;
}
.uc-top {
  display: grid;
  grid-template-columns: minmax(160px, 220px) 1fr auto;
  gap: 16px;
  align-items: center;
}
.uc-top-brand h2 {
  margin: 0;
  font-size: 1.35rem;
  color: #166534;
}
.uc-muted { color: #64748b; font-size: 0.85rem; margin: 2px 0 0; }
.uc-muted.small { font-size: 0.75rem; }
.uc-search-wrap { display: flex; align-items: center; gap: 8px; justify-content: center; }
.uc-search {
  width: 100%;
  max-width: 520px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.95rem;
  background: #fff;
}
.uc-search-toggle {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.uc-search-extras {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
}
.uc-search-extras label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.uc-search-extras input,
.uc-search-extras select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 0.85rem;
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
  color: #0f172a;
  background: #fff;
}
.uc-top-user { text-align: right; }
.uc-user-name { display: block; font-weight: 600; font-size: 0.9rem; }

.uc-kpi-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}
.uc-kpi {
  text-align: left;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.uc-kpi.metric { cursor: default; }
.uc-kpi:hover, .uc-kpi.on {
  border-color: #166534;
  box-shadow: 0 0 0 1px #16653422;
}
.uc-kpi.metric:hover { border-color: #e2e8f0; box-shadow: none; }
.uc-kpi-label { display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
.uc-kpi strong { display: block; font-size: 1.6rem; color: #166534; line-height: 1.2; margin: 4px 0; }
.uc-kpi-hint { font-size: 0.78rem; color: #94a3b8; }

.uc-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}

.uc-body {
  display: grid;
  grid-template-columns: 220px minmax(260px, 320px) minmax(0, 1fr) 280px;
  gap: 0;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  min-height: 560px;
  flex: 1;
}

@media (max-width: 1200px) {
  .uc-body {
    grid-template-columns: 200px minmax(220px, 280px) minmax(0, 1fr);
  }
  .uc-body > :last-child { display: none; }
}
@media (max-width: 900px) {
  .uc-top { grid-template-columns: 1fr; }
  .uc-kpi-row { grid-template-columns: 1fr 1fr; }
  .uc-body {
    grid-template-columns: 1fr;
    min-height: auto;
  }
}
</style>
