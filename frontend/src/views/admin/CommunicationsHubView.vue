<template>
  <div class="comms-hub" :class="{ 'comms-hub--thread-open': !!activeThread }">
    <!-- Left panel: conversation list -->
    <aside class="comms-hub__sidebar">
      <div class="sidebar-top">
        <h2 class="sidebar-title">Messages</h2>
        <div class="sidebar-actions">
          <button type="button" class="header-btn settings-btn" title="Call & Text Settings" @click="showSettingsModal = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button type="button" class="new-btn" title="New conversation" @click="showNewModal = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New
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
      />
    </aside>

    <!-- Right panel: thread view -->
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
        :agency-id="currentAgencyId"
        @back="clearThread"
        @message-sent="onMessageSent"
        @contact-converted="onContactConverted"
      />
    </main>

    <!-- New conversation modal -->
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
import NewConversationModal from '../../components/communications/NewConversationModal.vue';
import CommunicationSettingsModal from '../../components/communications/CommunicationSettingsModal.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const route      = useRoute();
const router     = useRouter();
const auth       = useAuthStore();
const agencyStore = useAgencyStore();

const listRef   = ref(null);
const threadRef = ref(null);

const activeThread  = ref(null);
const activeTab     = ref('clients');
const showNewModal  = ref(false);
const showSettingsModal = ref(false);

const currentAgencyId = computed(() => {
  return agencyStore.currentAgency?.id || agencyStore.currentAgency?.value?.id || null;
});

function openThread(thread) {
  activeThread.value = thread;
  // Sync URL so the thread is bookmarkable
  const slug = route.params.organizationSlug;
  const base = slug ? `/${slug}/admin/communications` : '/admin/communications';
  const query = {};
  if (thread.client_id) query.clientId = thread.client_id;
  if (thread.agency_contact_id) query.contactId = thread.agency_contact_id;
  router.replace({ path: base, query });
}

function clearThread() {
  activeThread.value = null;
  const slug = route.params.organizationSlug;
  const base = slug ? `/${slug}/admin/communications` : '/admin/communications';
  router.replace({ path: base });
}

function onMessageSent() {
  // Refresh thread list so last-message preview updates
  listRef.value?.refresh();
}

function onContactConverted({ type, data }) {
  // If converted to client, refresh the list and switch to the client thread
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
      client_id:      client.id,
      client_name:    client.full_name || client.initials,
      client_initials: client.initials,
      client_phone:   client.contact_phone,
      number_id:      numberId,
      last_message_at: null,
      unread_count:   0
    });
    activeTab.value = 'clients';
  } else if (contact) {
    openThread({
      agency_contact_id: contact.id,
      contact_name:      contact.full_name || contact.name,
      contact_phone:     contact.phone,
      number_id:         numberId,
      last_message_at:   null,
      unread_count:      0
    });
    activeTab.value = 'contacts';
  }
}

// Restore thread from URL on mount
onMounted(() => {
  const clientId = route.query.clientId ? Number(route.query.clientId) : null;
  const contactId = route.query.contactId ? Number(route.query.contactId) : null;
  if (clientId) {
    activeThread.value = { client_id: clientId };
    activeTab.value = 'clients';
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
  display: grid;
  grid-template-columns: 320px 1fr;
  height: calc(100vh - 60px); /* subtract navbar */
  overflow: hidden;
  background: var(--bg-primary, #f8fafc);
}

.comms-hub__sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border, #e2e8f0);
  background: #fff;
  box-shadow: 4px 0 10px rgba(0, 0, 0, 0.02);
  z-index: 10;
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 16px 14px;
  flex-shrink: 0;
}

.sidebar-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-primary, #0f172a);
  letter-spacing: -0.02em;
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-tabs {
  display: flex;
  padding: 0 16px 14px;
  border-bottom: 1px solid var(--border, #f1f5f9);
  gap: 24px;
}

.sidebar-tab {
  background: none;
  border: none;
  padding: 6px 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-tab:hover {
  color: var(--text-primary, #0f172a);
}

.sidebar-tab--active {
  color: var(--primary, #2563eb);
}

.sidebar-tab--active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: -2px;
  right: -2px;
  height: 3px;
  background: var(--primary, #2563eb);
  border-radius: 3px 3px 0 0;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.header-btn:hover {
  background: var(--bg-secondary, #f8fafc);
  color: var(--text-primary, #0f172a);
  border-color: var(--border-hover, #cbd5e1);
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}
.header-btn svg { width: 18px; height: 18px; }

.settings-btn:hover {
  color: var(--primary, #2563eb);
  border-color: var(--primary, #2563eb);
  background: #eff6ff;
}

.new-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  border: none;
  background: var(--primary, #2563eb);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  color: #fff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}
.new-btn svg { width: 16px; height: 16px; }
.new-btn:hover { 
  background: #1d4ed8; 
  transform: translateY(-1px);
  box-shadow: 0 6px 15px rgba(37, 99, 235, 0.3);
}
.new-btn:active {
  transform: translateY(0);
}

.comms-hub__main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--bg-primary, #f8fafc);
}

/* ─── Mobile ─── */
@media (max-width: 768px) {
  .comms-hub {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    height: calc(100dvh - 56px);
  }

  /* On mobile, show only the sidebar unless a thread is open */
  .comms-hub__main {
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
