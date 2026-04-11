<template>
  <div class="comms-hub" :class="{ 'comms-hub--thread-open': !!activeThread }">
    <!-- Left panel: conversation list -->
    <aside class="comms-hub__sidebar">
      <div class="sidebar-top">
        <h2 class="sidebar-title">Messages</h2>
        <button type="button" class="new-btn" title="New conversation" @click="showNewModal = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New
        </button>
      </div>

      <ConversationList
        ref="listRef"
        :active-client-id="activeThread?.client_id"
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
        :number-id="activeThread?.number_id"
        :agency-id="currentAgencyId"
        @back="clearThread"
        @message-sent="onMessageSent"
      />
    </main>

    <!-- New conversation modal -->
    <NewConversationModal
      v-if="showNewModal"
      @close="showNewModal = false"
      @open="startNewConversation"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConversationList from '../../components/communications/ConversationList.vue';
import ConversationThread from '../../components/communications/ConversationThread.vue';
import NewConversationModal from '../../components/communications/NewConversationModal.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const route      = useRoute();
const router     = useRouter();
const auth       = useAuthStore();
const agencyStore = useAgencyStore();

const listRef   = ref(null);
const threadRef = ref(null);

const activeThread  = ref(null);
const showNewModal  = ref(false);

const currentAgencyId = computed(() => {
  return agencyStore.currentAgency?.id || agencyStore.currentAgency?.value?.id || null;
});

function openThread(thread) {
  activeThread.value = thread;
  // Sync URL so the thread is bookmarkable
  const slug = route.params.organizationSlug;
  const base = slug ? `/${slug}/admin/communications` : '/admin/communications';
  router.replace({ path: base, query: { clientId: thread.client_id } });
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

function startNewConversation({ client, numberId }) {
  showNewModal.value = false;
  openThread({
    client_id:      client.id,
    client_name:    client.full_name || client.initials,
    client_initials: client.initials,
    client_phone:   client.contact_phone,
    number_id:      numberId,
    last_message_at: null,
    unread_count:   0
  });
}

// Restore thread from URL on mount (e.g. direct link with ?clientId=…)
onMounted(() => {
  const clientId = route.query.clientId ? Number(route.query.clientId) : null;
  if (clientId) {
    activeThread.value = { client_id: clientId };
  }
});

watch(() => route.query.clientId, (val) => {
  const id = val ? Number(val) : null;
  if (!id) { activeThread.value = null; return; }
  if (activeThread.value?.client_id !== id) {
    activeThread.value = { client_id: id };
  }
});
</script>

<style scoped>
.comms-hub {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: calc(100vh - 60px); /* subtract navbar */
  overflow: hidden;
  background: var(--surface-card, #fafbfc);
}

.comms-hub__sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border, #e6e8ec);
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 14px 10px;
  flex-shrink: 0;
}

.sidebar-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
}

.new-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--border, #d4d8de);
  background: #fff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-primary, #1a1a2e);
  transition: background 0.1s, border-color 0.1s;
}
.new-btn svg { width: 14px; height: 14px; }
.new-btn:hover { background: #f0f7ff; border-color: #7aa2ff; color: #2563eb; }

.comms-hub__main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
