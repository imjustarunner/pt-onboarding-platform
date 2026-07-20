<template>
  <div
    class="comms-hub"
    :class="{
      'comms-hub--thread-open': !!activeThread,
      'comms-hub--embedded': embedded,
      'comms-hub--dark': isDarkTheme
    }"
  >
    <!-- Left: conversation list -->
    <aside class="comms-hub__sidebar">
      <div v-if="!embedded" class="sidebar-top">
        <div>
          <h2 class="sidebar-title">Messages</h2>
          <p class="sidebar-sub">SMS conversations with clients</p>
        </div>
        <div class="sidebar-actions">
          <button type="button" class="icon-btn" title="Call & Text Settings" @click="showSettingsModal = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      <div class="sidebar-tabs">
        <button
          type="button"
          class="sidebar-tab"
          :class="{ 'sidebar-tab--active': activeTab === 'clients' }"
          @click="activeTab = 'clients'"
        >
          Clients
        </button>
        <button
          type="button"
          class="sidebar-tab"
          :class="{ 'sidebar-tab--active': activeTab === 'contacts' }"
          @click="activeTab = 'contacts'"
        >
          Contacts
        </button>
      </div>

      <ConversationList
        ref="listRef"
        :active-client-id="activeThread?.client_id"
        :active-contact-id="activeThread?.agency_contact_id"
        :active-tab="activeTab"
        :agency-id="currentAgencyId"
        @select="openThread"
        @compose="showNewModal = true"
        @open-settings="showSettingsModal = true"
      />
    </aside>

    <!-- Center: thread -->
    <main class="comms-hub__main">
      <ConversationThread
        ref="threadRef"
        :client-id="activeThread?.client_id"
        :client-name="activeThread?.client_name || activeThread?.client_initials"
        :client-phone="activeThread?.client_phone"
        :contact-id="activeThread?.agency_contact_id"
        :contact-name="activeThread?.contact_name || activeThread?.name"
        :contact-phone="activeThread?.contact_phone || activeThread?.phone"
        :number-id="activeThread?.number_id"
        :agency-id="currentAgencyId || activeThread?.agency_id"
        :care-thread="careThread"
        @back="clearThread"
        @message-sent="onMessageSent"
        @contact-converted="onContactConverted"
        @care-updated="onCareUpdated"
        @open-settings="showSettingsModal = true"
      />
    </main>

    <!-- Right: client details -->
    <SmsClientDetailsPanel
      class="comms-hub__details"
      :client-id="activeThread?.client_id"
      :contact-id="activeThread?.agency_contact_id"
      :client-name="activeThread?.client_name || activeThread?.client_initials"
      :client-phone="activeThread?.client_phone"
      :contact-name="activeThread?.contact_name || activeThread?.name"
      :contact-phone="activeThread?.contact_phone || activeThread?.phone"
      :care-thread="careThread"
      :last-message-at="activeThread?.last_message_at"
      :message-count="threadMessageCount"
      :agency-id="currentAgencyId || activeThread?.agency_id"
      @call="triggerCall"
      @claim="setCareAction('claim')"
      @observe="setCareAction('observe')"
      @resolve="setCareAction('close')"
      @schedule="goSchedule"
      @note="goClientNote"
      @resource="goClientProfile"
    />

    <NewConversationModal
      v-if="showNewModal"
      @close="showNewModal = false"
      @open="startNewConversation"
    />

    <CommunicationSettingsModal
      v-if="showSettingsModal"
      @close="showSettingsModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConversationList from '../../components/communications/ConversationList.vue';
import ConversationThread from '../../components/communications/ConversationThread.vue';
import SmsClientDetailsPanel from '../../components/communications/SmsClientDetailsPanel.vue';
import NewConversationModal from '../../components/communications/NewConversationModal.vue';
import CommunicationSettingsModal from '../../components/communications/CommunicationSettingsModal.vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  /** When true, fills Messages SMS tab and syncs to /messages?tab=sms */
  embedded: { type: Boolean, default: false },
  /** 'default' | 'platform' — platform uses dark chrome; accents still use --primary */
  theme: { type: String, default: 'default' }
});

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const listRef = ref(null);
const threadRef = ref(null);

const activeThread = ref(null);
const activeTab = ref('clients');
const showNewModal = ref(false);
const showSettingsModal = ref(false);
const careThread = ref(null);
const threadMessageCount = ref(null);

const currentAgencyId = computed(() => {
  return agencyStore.currentAgency?.id || agencyStore.currentAgency?.value?.id || null;
});

const isDarkTheme = computed(() => {
  // Platform HQ Messages panel only — tenant Messages follow document/tenant theme.
  if (props.theme === 'platform') return true;
  if (typeof document === 'undefined') return false;
  return document.documentElement?.getAttribute('data-theme') === 'dark';
});

function messagesBasePath() {
  const slug = route.params.organizationSlug;
  if (props.embedded) {
    return slug ? `/${slug}/messages` : '/messages';
  }
  return slug ? `/${slug}/admin/communications/sms` : '/admin/communications/sms';
}

function syncThreadUrl(thread = null) {
  const query = props.embedded ? { ...route.query, tab: 'sms' } : {};
  if (thread?.client_id) query.clientId = thread.client_id;
  else delete query.clientId;
  if (thread?.agency_contact_id) query.contactId = thread.agency_contact_id;
  else delete query.contactId;
  router.replace({ path: messagesBasePath(), query }).catch(() => {});
}

async function loadCareThread(thread = activeThread.value) {
  careThread.value = null;
  if (!thread?.client_id) return;
  try {
    const params = { clientId: thread.client_id };
    if (thread.number_id) params.numberId = thread.number_id;
    if (thread.agency_id || currentAgencyId.value) {
      params.agencyId = thread.agency_id || currentAgencyId.value;
    }
    const res = await api.get('/messages/care-thread', { params, skipGlobalLoading: true });
    careThread.value = res.data?.careThread || null;
  } catch {
    careThread.value = null;
  }
}

function openThread(thread) {
  activeThread.value = thread;
  threadMessageCount.value = null;
  syncThreadUrl(thread);
  loadCareThread(thread);
}

function clearThread() {
  activeThread.value = null;
  careThread.value = null;
  threadMessageCount.value = null;
  syncThreadUrl(null);
}

function onMessageSent() {
  listRef.value?.refresh();
  if (activeThread.value) {
    activeThread.value = {
      ...activeThread.value,
      last_message_at: new Date().toISOString(),
      unread_count: 0
    };
  }
}

function onCareUpdated(ct) {
  if (ct) careThread.value = ct;
  else loadCareThread();
  listRef.value?.refresh();
}

function onContactConverted({ type, data }) {
  listRef.value?.refresh();
  if (type === 'client') {
    activeTab.value = 'clients';
    openThread({
      client_id: data.id,
      client_name: data.full_name || data.initials,
      client_initials: data.initials,
      client_phone: data.contact_phone,
      number_id: activeThread.value?.number_id,
      last_message_at: activeThread.value?.last_message_at,
      unread_count: 0
    });
  }
}

function startNewConversation({ client, contact, numberId }) {
  showNewModal.value = false;
  if (client) {
    openThread({
      client_id: client.id,
      client_name: client.full_name || client.initials,
      client_initials: client.initials,
      client_phone: client.contact_phone,
      number_id: numberId,
      last_message_at: null,
      unread_count: 0
    });
    activeTab.value = 'clients';
  } else if (contact) {
    openThread({
      agency_contact_id: contact.id,
      contact_name: contact.full_name || contact.name,
      contact_phone: contact.phone,
      number_id: numberId,
      last_message_at: null,
      unread_count: 0
    });
    activeTab.value = 'contacts';
  }
}

async function setCareAction(action) {
  if (!activeThread.value?.client_id) return;
  try {
    const res = await api.patch('/messages/care-thread', {
      clientId: activeThread.value.client_id,
      numberId: activeThread.value.number_id || undefined,
      agencyId: currentAgencyId.value || activeThread.value.agency_id || undefined,
      action
    });
    careThread.value = res.data?.careThread || careThread.value;
    listRef.value?.refresh();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update care state.');
  }
}

function triggerCall() {
  threadRef.value?.triggerCall?.();
}

function goClientProfile() {
  const id = activeThread.value?.client_id;
  if (!id) return;
  const slug = route.params.organizationSlug;
  const path = slug ? `/${slug}/admin/clients/${id}` : `/admin/clients/${id}`;
  window.open(path, '_blank', 'noopener');
}

function goSchedule() {
  const id = activeThread.value?.client_id;
  const slug = route.params.organizationSlug;
  if (id) {
    const path = slug ? `/${slug}/admin/clients/${id}` : `/admin/clients/${id}`;
    window.open(path, '_blank', 'noopener');
    return;
  }
  const cal = slug ? `/${slug}/admin/schedule` : '/admin/schedule';
  router.push(cal).catch(() => {});
}

function goClientNote() {
  goClientProfile();
}

onMounted(() => {
  const clientId = route.query.clientId ? Number(route.query.clientId) : null;
  const contactId = route.query.contactId ? Number(route.query.contactId) : null;
  if (clientId) {
    activeThread.value = { client_id: clientId };
    activeTab.value = 'clients';
    loadCareThread(activeThread.value);
  } else if (contactId) {
    activeThread.value = { agency_contact_id: contactId };
    activeTab.value = 'contacts';
  }
});

watch(() => route.query.clientId, (val) => {
  const id = val ? Number(val) : null;
  if (!id) return;
  if (activeThread.value?.client_id !== id) {
    activeThread.value = { client_id: id };
    activeTab.value = 'clients';
    loadCareThread(activeThread.value);
  }
});

watch(() => route.query.contactId, (val) => {
  const id = val ? Number(val) : null;
  if (!id) return;
  if (activeThread.value?.agency_contact_id !== id) {
    activeThread.value = { agency_contact_id: id };
    activeTab.value = 'contacts';
  }
});
</script>

<style scoped>
.comms-hub {
  --sms-bg: var(--bg-primary, #f8fafc);
  --sms-surface: var(--surface-card, #ffffff);
  --sms-surface-2: var(--bg-secondary, #f1f5f9);
  --sms-text: var(--text-primary, #0f172a);
  --sms-muted: var(--text-secondary, #64748b);
  --sms-border: var(--border, #e2e8f0);
  --sms-accent: var(--primary, #2563eb);

  display: grid;
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr) minmax(240px, 280px);
  height: calc(100vh - 60px);
  overflow: hidden;
  background: var(--sms-bg);
  color: var(--sms-text);
}

.comms-hub--dark {
  --sms-bg: #0b1220;
  --sms-surface: #111827;
  --sms-surface-2: #1e293b;
  --sms-text: #e5e7eb;
  --sms-muted: #94a3b8;
  --sms-border: rgba(148, 163, 184, 0.18);
}

.comms-hub--embedded {
  height: 100%;
  min-height: 0;
  flex: 1;
}

.comms-hub__sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--sms-border);
  background: var(--sms-surface);
  z-index: 10;
  min-width: 0;
}

.sidebar-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 16px 10px;
  flex-shrink: 0;
  gap: 12px;
}

.sidebar-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--sms-text);
  letter-spacing: -0.02em;
}

.sidebar-sub {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--sms-muted);
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--sms-border);
  background: var(--sms-bg);
  color: var(--sms-muted);
  cursor: pointer;
}
.icon-btn svg { width: 18px; height: 18px; }
.icon-btn:hover {
  color: var(--sms-accent);
  border-color: var(--sms-accent);
}

.sidebar-tabs {
  display: flex;
  padding: 0 16px 12px;
  border-bottom: 1px solid var(--sms-border);
  gap: 20px;
  flex-shrink: 0;
}

.sidebar-tab {
  background: none;
  border: none;
  padding: 6px 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--sms-muted);
  cursor: pointer;
  position: relative;
}

.sidebar-tab--active {
  color: var(--sms-accent);
}

.sidebar-tab--active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: -2px;
  right: -2px;
  height: 3px;
  background: var(--sms-accent);
  border-radius: 3px 3px 0 0;
}

.comms-hub__main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--sms-bg);
  min-width: 0;
}

.comms-hub__details {
  min-width: 0;
}

@media (max-width: 1100px) {
  .comms-hub {
    grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
  }
  .comms-hub__details {
    display: none;
  }
}

@media (max-width: 768px) {
  .comms-hub {
    grid-template-columns: 1fr;
    height: calc(100dvh - 56px);
  }

  .comms-hub__main,
  .comms-hub__details {
    display: none;
  }

  .comms-hub--thread-open .comms-hub__sidebar {
    display: none;
  }

  .comms-hub--thread-open .comms-hub__main {
    display: flex;
  }
}
</style>
