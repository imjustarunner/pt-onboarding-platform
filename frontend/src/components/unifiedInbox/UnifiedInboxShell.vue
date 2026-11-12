<script setup>
import ConversaBrand from '../../components/conversa/ConversaBrand.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useSessionLockStore } from '../../store/sessionLock';
import UnifiedInboxSidebar from './UnifiedInboxSidebar.vue';
import UnifiedConversationList from './UnifiedConversationList.vue';
import UnifiedConversationThread from './UnifiedConversationThread.vue';
import UnifiedContextPanel from './UnifiedContextPanel.vue';
import UnifiedComposeModal from './UnifiedComposeModal.vue';
import { readUnifiedInboxCache, writeUnifiedInboxCache, clearUnifiedInboxCache } from '../../utils/unifiedInboxCache';
import { isTicketedGroup } from '../../utils/groupEmailPresentation';
import TicketDetailModal from '../tickets/TicketDetailModal.vue';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const sessionLock = useSessionLockStore();
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
const claimBusy = ref(false);
const activeTicketId = ref(null);

const selectedInboxId = ref(null); // null = All inboxes (matches agency-wide KPIs)
const channel = ref('all');
const listFilter = ref('all');
const searchQ = ref('');
const showSearchExtras = ref(false);
const searchFrom = ref('');
const searchHasAttachment = ref('');
const searchDateFrom = ref('');
const searchDateTo = ref('');
const showCompose = ref(false);
const mobileFiltersOpen = ref(false);
const prefs = ref({ personalEmailNotify: false, digestHours: 48, lastInboxDigestAt: null });

let draftTimer = null;
const cacheKey = () => `${authStore.user?.id || ''}:${resolvedAgencyId.value || ''}`;
const viewLists = new Map();
let displayedListKey = null;
let activeListRequest = null;
let disposed = false;
function saveSnapshot() {
  if (!authStore.user?.id || !resolvedAgencyId.value) return;
  writeUnifiedInboxCache(cacheKey(), { selectedInboxId: selectedInboxId.value, channel: channel.value,
    listFilter: listFilter.value, searchQ: searchQ.value, searchFrom: searchFrom.value,
    searchHasAttachment: searchHasAttachment.value, searchDateFrom: searchDateFrom.value, searchDateTo: searchDateTo.value,
    inboxes: inboxes.value, attention: attention.value, conversations: conversations.value,
    selectedId: selectedId.value, detail: detail.value, displayedListKey, lists: [...viewLists] });
}
function restoreSnapshot() {
  const saved = readUnifiedInboxCache(cacheKey());
  if (!saved) return;
  selectedInboxId.value = saved.selectedInboxId; channel.value = saved.channel; listFilter.value = saved.listFilter;
  searchQ.value = saved.searchQ; searchFrom.value = saved.searchFrom;
  searchHasAttachment.value = saved.searchHasAttachment; searchDateFrom.value = saved.searchDateFrom; searchDateTo.value = saved.searchDateTo;
  inboxes.value = saved.inboxes; attention.value = saved.attention; conversations.value = saved.conversations;
  selectedId.value = saved.selectedId; detail.value = saved.detail; displayedListKey = saved.displayedListKey;
  for (const [key, rows] of saved.lists || []) viewLists.set(key, rows);
}
restoreSnapshot();

async function ensurePersonalMailbox() {
  if (!resolvedAgencyId.value) return;
  try {
    // Provision App inbox for compose/send, but do not select it — Home defaults to All inboxes
    // so KPI counts (agency-wide) match the conversation list.
    await api.post(
      '/communications/inboxes/personal/ensure',
      { agencyId: resolvedAgencyId.value },
      { skipGlobalLoading: true }
    );
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

let attentionRequestId = 0, inboxRequestId = 0;
async function loadAttention() {
  if (authStore.user?.role === 'school_staff') return;
  if (!resolvedAgencyId.value) return;
  const agencyId = resolvedAgencyId.value, requestId = ++attentionRequestId;
  const { data } = await api.get('/communications/attention-summary', {
    params: { agencyId },
    skipGlobalLoading: true
  });
  if (agencyId === resolvedAgencyId.value && requestId === attentionRequestId) attention.value = data?.summary || attention.value;
}

async function loadInboxes() {
  if (!resolvedAgencyId.value) return;
  const agencyId = resolvedAgencyId.value, requestId = ++inboxRequestId;
  const { data } = await api.get('/communications/inboxes', {
    params: { agencyId },
    skipGlobalLoading: true
  });
  if (agencyId === resolvedAgencyId.value && requestId === inboxRequestId) inboxes.value = data?.inboxes || [];
}

async function refreshAll() {
  try {
    // Existing mail can load while the optional compose mailbox is provisioned.
    // A slow provisioning request must not leave the conversation list waiting.
    await Promise.all([ensurePersonalMailbox(), loadAttention(), loadInboxes(), loadConversations(), loadPrefs()]);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not refresh inbox';
  }
}

let listRequestId = 0;
let detailRequestId = 0;
async function loadConversations() {
  if (!resolvedAgencyId.value || disposed) return;
  const params = {
    agencyId: resolvedAgencyId.value, filter: listFilter.value,
    channel: channel.value === 'all' ? undefined : channel.value,
    q: searchQ.value || undefined, fromEmail: searchFrom.value || undefined,
    hasAttachment: searchHasAttachment.value === '' ? undefined : searchHasAttachment.value,
    dateFrom: searchDateFrom.value || undefined, dateTo: searchDateTo.value || undefined,
    ...(selectedInboxId.value != null ? { inboxId: selectedInboxId.value } : {})
  };
  const key = JSON.stringify(params);
  if (activeListRequest?.key === key) return activeListRequest.promise;
  activeListRequest?.controller.abort();
  const requestId = ++listRequestId;
  const controller = new AbortController();
  if (displayedListKey !== key) {
    conversations.value = viewLists.get(key) || [];
    displayedListKey = key;
  }
  loading.value = true;
  error.value = '';
  const request = { key, controller };
  activeListRequest = request;
  request.promise = (async () => {
    try {
      const { data } = await api.get('/communications/conversations', {
        params, signal: controller.signal, timeout: 20000, skipGlobalLoading: true
      });
      if (requestId !== listRequestId || disposed) return;
      conversations.value = data?.conversations || [];
      viewLists.delete(key); viewLists.set(key, conversations.value);
      while (viewLists.size > 12) viewLists.delete(viewLists.keys().next().value);
    } catch (e) {
      if (requestId !== listRequestId || disposed || controller.signal.aborted) return;
      if ([401,403].includes(e?.response?.status)) {
        conversations.value = []; detail.value = null; viewLists.clear(); clearUnifiedInboxCache();
      }
      error.value = e?.response?.data?.error?.message || 'Could not update conversations. Your last loaded messages are still available.';
    } finally {
      if (requestId === listRequestId && !disposed) { loading.value = false; activeListRequest = null; }
    }
  })();
  return request.promise;
}

async function openConversation(id) {
  const requestId = ++detailRequestId;
  if (!id) {
    selectedId.value = null;
    detail.value = null;
    return;
  }
  selectedId.value = id;
  mobileFiltersOpen.value = false;
  if (Number(detail.value?.conversation?.id) !== Number(id)) detail.value = null;
  detailLoading.value = !detail.value;
  try {
    const { data } = await api.get(`/communications/conversations/${id}`, {
      params: { agencyId: resolvedAgencyId.value },
      skipGlobalLoading: true
    });
    if (requestId !== detailRequestId) return;
    detail.value = data;
    const row = conversations.value.find((c) => c.id === id);
    if (row) row.is_unread = false;
    void loadAttention().catch(() => {});
  } catch (e) {
    if (requestId !== detailRequestId) return;
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to open conversation';
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

async function claimTicket() {
  const id = selectedId.value;
  if (!id || claimBusy.value) return;
  claimBusy.value = true;
  error.value = '';
  try {
    await api.post(`/communications/conversations/${id}/claim`, {}, { skipGlobalLoading: true });
    if (selectedId.value === id) await openConversation(id);
    await Promise.all([loadConversations(), loadAttention()]);
  } catch (e) {
    const message = e?.response?.data?.error?.message || 'Could not claim ticket';
    if (selectedId.value === id) await openConversation(id);
    await Promise.allSettled([loadConversations(), loadAttention()]);
    error.value = message;
  } finally {
    claimBusy.value = false;
  }
}

function selectInbox(id) {
  selectedInboxId.value = id;
  listFilter.value = 'all';
  channel.value = 'all';
  selectedId.value = null; detail.value = null; detailRequestId += 1;
}

function openTickets() {
  selectedInboxId.value = null; channel.value = 'all'; listFilter.value = 'tickets';
  selectedId.value = null; detail.value = null; detailRequestId += 1;
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

function onDraftInput(text, conversationId) {
  const id = conversationId || selectedId.value;
  if (!id) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    api.patch(`/communications/conversations/${id}`, { draftBody: text }, {
      skipGlobalLoading: true
    }).catch(() => {});
  }, 800);
}

async function sendReply(data) {
  if (data?.conversation || data?.messages) {
    if (data?.conversation?.id) selectedId.value = data.conversation.id;
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

watch([resolvedAgencyId, () => authStore.user?.id], () => {
  clearUnifiedInboxCache(); viewLists.clear(); displayedListKey = null;
  activeListRequest?.controller.abort(); activeListRequest = null;
  detailRequestId += 1;
  listRequestId += 1;
  selectedId.value = null;
  detail.value = null;
  selectedInboxId.value = null;
  activeTicketId.value = null;
  conversations.value = [];
  inboxes.value = [];
  attention.value = {};
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

function openRouteConversation(value) {
  const id=Number(value),agencyId=Number(route.query.agencyId);
  if(!Number.isSafeInteger(id)||id<1||!resolvedAgencyId.value)return;
  if(agencyId>0&&agencyId!==Number(resolvedAgencyId.value))return;
  void openConversation(id);
}
watch(()=>route.query.conversationId,openRouteConversation);
let mailboxPoll = null;
let pollBusy = false;
let lastRefreshAt = 0;
async function refreshSharedState() {
  if (document.hidden || disposed || pollBusy || sessionLock.isLocked || sessionLock.warningActive || Date.now() - lastRefreshAt < 5000) return;
  lastRefreshAt = Date.now();
  pollBusy = true;
  try {
    const id = selectedId.value;
    const detailRequest = detailRequestId;
    const requests = [loadConversations(), loadAttention()];
    if (id && isTicketedGroup(detail.value?.conversation)) requests.push(
      api.get(`/communications/conversations/${id}`, { params: { agencyId: resolvedAgencyId.value, markRead: 0 }, timeout: 20000, skipGlobalLoading: true })
        .then(({ data }) => { if (detailRequest === detailRequestId && selectedId.value === id) detail.value = data; })
    );
    await Promise.allSettled(requests);
  } finally { pollBusy = false; }
}
watch(() => sessionLock.isLocked || sessionLock.warningActive, (locked, wasLocked) => {
  if (wasLocked && !locked) refreshAll();
});
onMounted(() => {
  refreshAll();
  openRouteConversation(route.query.conversationId || selectedId.value);
  mailboxPoll = setInterval(refreshSharedState, 30000);
  window.addEventListener('focus', refreshSharedState);
});
onUnmounted(() => {
  saveSnapshot();
  disposed = true; listRequestId += 1; detailRequestId += 1; attentionRequestId += 1; inboxRequestId += 1;
  activeListRequest?.controller.abort();
  clearTimeout(draftTimer);
  clearTimeout(searchDebounce);
  clearInterval(mailboxPoll);
  window.removeEventListener('focus', refreshSharedState);
});

const selectedInbox = computed(() => {
  if (selectedInboxId.value == null) {
    return inboxes.value.find((i) => i.identity_key === 'all_inboxes') || null;
  }
  return inboxes.value.find((i) => String(i.id) === String(selectedInboxId.value)) || null;
});

defineExpose({ refreshAll });
</script>

<template>
  <div class="uc-shell conversa-surface" :class="{ 'uc-shell--thread': !!selectedId, 'uc-shell--filters': mobileFiltersOpen }">
    <header class="uc-top">
      <div class="uc-top-brand">
        <ConversaBrand heading="h2" compact />
        <p class="uc-muted">One place for every conversation.</p>
      </div>
      <div class="uc-search-wrap">
        <input
          v-model="searchQ"
          class="uc-search"
          type="search"
          placeholder="Search conversations, people, or subjects…"
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

    <div v-if="error" class="uc-error" role="alert">{{ error }} <button type="button" class="btn btn-secondary btn-sm" @click="refreshAll">Retry</button></div>

    <div class="uc-mobile-toolbar">
      <button v-if="selectedId" type="button" class="btn btn-secondary btn-sm" @click="openConversation(null)">← Back to inbox</button>
      <button v-else type="button" class="btn btn-secondary btn-sm" :aria-expanded="mobileFiltersOpen" @click="mobileFiltersOpen = !mobileFiltersOpen">Inboxes &amp; channels</button>
      <button type="button" class="btn btn-primary btn-sm" @click="showCompose = true">New message</button>
    </div>

    <div class="uc-body">
      <UnifiedInboxSidebar
        :inboxes="inboxes"
        :attention="attention"
        :selected-inbox-id="selectedInboxId"
        :channel="channel"
        :prefs="prefs"
        @update:selected-inbox-id="selectInbox"
        @update:channel="channel = $event"
        @compose="showCompose = true"
        @open-tickets="openTickets"
        @smart-filter="listFilter = $event"
        @update:prefs="savePrefs"
      />

      <UnifiedConversationList
        :conversations="conversations"
        :loading="loading"
        :selected-id="selectedId"
        :filter="listFilter"
        :unread-counts="attention.unreadViews"
        @update:filter="listFilter = $event"
        @select="openConversation"
      />

      <UnifiedConversationThread
        :detail="detail"
        :loading="detailLoading"
        :inbox="inboxes.find((i) => Number(i.id) === Number(detail?.conversation?.inbox_id)) || null"
        :agency-id="resolvedAgencyId"
        :organization-slug="route.params?.organizationSlug || ''"
        :claim-busy="claimBusy"
        @claim-ticket="claimTicket"
        @open-ticket="activeTicketId = $event"
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
        @open-ticket="activeTicketId = $event"
      />
    </div>

    <UnifiedComposeModal
      v-if="showCompose"
      :agency-id="resolvedAgencyId"
      :inboxes="inboxes.filter((i) => i.kind === 'shared' || i.kind === 'personal')"
      :default-inbox-id="inboxes.find((i) => String(i.identity_key || '').toLowerCase() === 'messages')?.id || (typeof selectedInboxId === 'number' ? selectedInboxId : inboxes.find((i) => i.kind === 'shared')?.id)"
      @close="showCompose = false"
      @sent="onComposeSent"
    />
    <TicketDetailModal v-if="activeTicketId" :ticket-id="activeTicketId" :agency-id="resolvedAgencyId" @close="activeTicketId = null; refreshSharedState()" @updated="refreshSharedState" />
  </div>
</template>

<style scoped>
.uc-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: calc(100vh - 220px);
  color: var(--conversa-ink);
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
  color: var(--conversa-blue);
}
.uc-muted { color: var(--conversa-muted); font-size: 0.85rem; margin: 2px 0 0; }
.uc-muted.small { font-size: 0.75rem; }
.uc-search-wrap { display: flex; align-items: center; gap: 8px; justify-content: center; }
.uc-search {
  width: 100%;
  max-width: 520px;
  border: 1px solid var(--app-line, #d1d5db);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.95rem;
  background: var(--conversa-surface);
}
.uc-search-toggle {
  border: 1px solid var(--conversa-border);
  background: var(--conversa-surface);
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
  background: var(--conversa-wash);
  border: 1px solid var(--conversa-border);
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
  color: var(--conversa-muted);
}
.uc-search-extras input,
.uc-search-extras select {
  border: 1px solid var(--conversa-border);
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 0.85rem;
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
  color: var(--conversa-ink);
  background: var(--conversa-surface);
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
  background: var(--conversa-surface);
  border: 1px solid var(--conversa-border);
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.uc-kpi.metric { cursor: default; }
.uc-kpi:hover, .uc-kpi.on {
  border-color: var(--conversa-blue);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--conversa-blue) 14%, transparent);
}
.uc-kpi.metric:hover { border-color: var(--conversa-border); box-shadow: none; }
.uc-kpi-label { display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--conversa-muted); }
.uc-kpi strong { display: block; font-size: 1.6rem; color: var(--conversa-blue); line-height: 1.2; margin: 4px 0; }
.uc-kpi-hint { font-size: 0.78rem; color: var(--conversa-muted); }

.uc-error {
  background: var(--app-surface-muted, #fef2f2);
  color: var(--app-text-red, #991b1b);
  border: 1px solid var(--app-line, #fecaca);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}

.uc-body {
  display: grid;
  grid-template-columns: 220px minmax(260px, 320px) minmax(0, 1fr) 280px;
  gap: 0;
  background: var(--conversa-surface);
  border: 1px solid var(--conversa-border);
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
