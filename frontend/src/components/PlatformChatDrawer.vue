<template>
  <div
    v-if="isAuthenticated"
    class="chat-drawer"
    :class="{ open: isOpen }"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <div class="rail" :title="needsAgency ? 'Select an agency to use chat' : 'Chat'">
      <div class="rail-badge rail-badge-top" :class="{ zero: totalUnread <= 0 }">
        {{ totalUnread }}
      </div>

      <div class="rail-icon">
        <img v-if="iconUrl" :src="iconUrl" alt="Chat" />
        <span v-else class="icon-fallback">Chat</span>
      </div>

      <div class="rail-badge rail-badge-bottom" :class="{ disabled: needsAgency }">
        {{ loggedInNow }}
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="title">Chat</div>
          <div class="subtitle">Agency presence + internal messages</div>
        </div>

        <div class="presence-controls" v-if="isAuthenticated">
          <template v-if="isAdminLike">
            <button
              class="btn btn-xs"
              :class="myAvailability === 'admins_only' ? 'btn-primary' : 'btn-secondary'"
              type="button"
              @click="setMyAvailability('admins_only')"
              title="Visible to admins only"
            >
              Go Online (Admins)
            </button>
            <button
              class="btn btn-xs"
              :class="myAvailability === 'everyone' ? 'btn-primary' : 'btn-secondary'"
              type="button"
              @click="setMyAvailability('everyone')"
              title="Visible to everyone in the agency"
            >
              Go Online
            </button>
            <button
              class="btn btn-xs"
              :class="myAvailability === 'offline' ? 'btn-primary' : 'btn-secondary'"
              type="button"
              @click="setMyAvailability('offline')"
              title="Appear offline"
            >
              Go Offline
            </button>
          </template>

          <template v-else>
            <button
              class="btn btn-xs"
              :class="myAvailability === 'offline' ? 'btn-secondary' : 'btn-primary'"
              type="button"
              @click="toggleMyAvailability"
              title="Toggle your online visibility"
            >
              {{ myAvailability === 'offline' ? 'Go Online' : 'Go Offline' }}
            </button>
          </template>
        </div>
      </div>

      <div class="panel-body">
        <template v-if="needsAgency">
          <div class="empty">
            <p style="margin: 0;">Select an agency to view who’s online.</p>
          </div>

          <div v-if="pendingThreads.length > 0" class="section" style="margin-top: 12px;">
            <div class="section-title">Pending chats</div>
            <button
              v-for="t in pendingThreads"
              :key="`${t.agency_id}-${t.thread_id}`"
              class="person"
              @click="openThread(t)"
            >
              <span class="dot dot-online"></span>
              <span class="name">{{ t.other_participant.first_name }} {{ t.other_participant.last_name }}</span>
              <span class="pill">{{ t.unread_count }}</span>
            </button>
          </div>
        </template>

        <template v-else>
          <div class="toolbar">
            <input v-model="q" class="search" placeholder="Search people…" />
          </div>

          <div v-if="loading" class="loading">Loading…</div>
          <div v-else-if="error" class="error">{{ error }}</div>

          <div v-else class="lists">
            <div v-if="pendingThreads.length > 0" class="section">
              <div class="section-title">Pending chats</div>
              <button
                v-for="t in pendingThreads"
                :key="`${t.agency_id}-${t.thread_id}`"
                class="person"
                @click="openThread(t)"
              >
                <span class="dot dot-online"></span>
                <span class="name">
                  {{ t.other_participant.first_name }} {{ t.other_participant.last_name }}
                  <span v-if="t.agencyLabel" class="agency-chip">{{ t.agencyLabel }}</span>
                </span>
                <span class="pill">{{ t.unread_count }}</span>
              </button>
            </div>

            <div class="section">
              <div class="section-title">Online</div>
              <div v-if="online.length === 0" class="muted">No one is online.</div>
              <button v-for="u in online" :key="u.id" class="person" @click="openChat(u)">
                <span class="dot dot-online"></span>
                <span class="name">
                  {{ u.first_name }} {{ u.last_name }}
                  <span v-if="adminsAllMode && u.agency_names" class="agency-chip">{{ u.agency_names }}</span>
                </span>
                <span v-if="u.unreadCount" class="pill">{{ u.unreadCount }}</span>
              </button>
            </div>

            <div class="section">
              <div class="section-title">Idle</div>
              <div v-if="idle.length === 0" class="muted">No one is idle.</div>
              <button v-for="u in idle" :key="u.id" class="person" @click="openChat(u)">
                <span class="dot dot-idle"></span>
                <span class="name">
                  {{ u.first_name }} {{ u.last_name }}
                  <span v-if="adminsAllMode && u.agency_names" class="agency-chip">{{ u.agency_names }}</span>
                </span>
                <span v-if="u.unreadCount" class="pill">{{ u.unreadCount }}</span>
              </button>
            </div>

            <div class="section">
              <div class="section-title">Offline</div>
              <div class="scroll">
                <div v-if="offline.length === 0" class="muted">No offline users.</div>
                <button v-for="u in offline" :key="u.id" class="person" @click="openChat(u)">
                  <span class="dot dot-offline"></span>
                  <span class="name">
                    {{ u.first_name }} {{ u.last_name }}
                    <span v-if="adminsAllMode && u.agency_names" class="agency-chip">{{ u.agency_names }}</span>
                  </span>
                  <span v-if="u.unreadCount" class="pill">{{ u.unreadCount }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="activeChatUser" class="chat-box">
            <div class="chat-box-header">
              <div class="chat-title">
                {{ activeChatUser.first_name }} {{ activeChatUser.last_name }}
              </div>
              <div class="chat-box-actions">
                <button class="btn btn-xs btn-secondary" type="button" @click="toggleSelectMode" :disabled="sending || chatLoading">
                  {{ selectMode ? 'Cancel' : 'Select' }}
                </button>
                <button
                  v-if="selectMode"
                  class="btn btn-xs btn-danger"
                  type="button"
                  @click="deleteSelected"
                  :disabled="sending || selectedMessageIds.length === 0"
                  :title="selectedMessageIds.length ? `Delete ${selectedMessageIds.length} selected` : 'Select messages to delete'"
                >
                  Delete ({{ selectedMessageIds.length }})
                </button>
                <button class="btn btn-xs btn-danger" type="button" @click="deleteThread" :disabled="sending || chatLoading">
                  Delete thread
                </button>
                <button class="btn-close" @click="closeChat">×</button>
              </div>
            </div>

            <div class="chat-messages" ref="chatMessagesEl">
              <div v-if="chatLoading" class="muted">Loading messages…</div>
              <div v-else-if="chatError" class="error">{{ chatError }}</div>
              <div v-else-if="chatMessages.length === 0" class="muted" style="padding: 10px 2px;">
                No messages yet.
              </div>
              <div v-else class="msg-list">
                <div v-for="m in chatMessages" :key="m.id" class="msg-row" :class="{ mine: m.sender_user_id === meId }">
                  <label v-if="selectMode" class="msg-select">
                    <input type="checkbox" :checked="isSelected(m.id)" @change="toggleSelected(m.id)" />
                  </label>
                  <div class="msg" :class="{ mine: m.sender_user_id === meId }">
                  <div class="msg-meta">
                    <span class="msg-author">{{ m.sender_first_name }} {{ m.sender_last_name }}</span>
                    <span class="msg-time">
                      {{ formatTime(m.created_at) }}
                      <span v-if="m.sender_user_id === meId" class="msg-receipt">
                        {{ m.is_read_by_other ? '✓✓' : '✓' }}
                      </span>
                      <button
                        v-if="m.sender_user_id === meId && !m.is_read_by_other"
                        type="button"
                        class="msg-action"
                        @click="unsend(m)"
                        :disabled="sending"
                        title="Unsend (only before read)"
                      >
                        Unsend
                      </button>
                      <button
                        type="button"
                        class="msg-action"
                        @click="deleteForMe(m)"
                        :disabled="sending"
                        title="Delete for me"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  <div class="msg-body">{{ m.body }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="chat-composer">
              <textarea v-model="draft" rows="2" placeholder="Message…" />
              <button class="btn btn-primary" @click="send" :disabled="sending || !draft.trim()">Send</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { toUploadsUrl } from '../utils/uploadsUrl';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);
const isAgencyOrgType = (org) => String(org?.organization_type || org?.organizationType || 'agency').toLowerCase() === 'agency';
const agencyId = computed(() => {
  const current = agencyStore.currentAgency || null;
  if (!current) return null;
  if (isAgencyOrgType(current)) return current?.id || null;

  // School/program/learning context: prefer explicit affiliated agency id.
  const affiliated =
    Number(current?.affiliated_agency_id || 0) ||
    Number(current?.affiliatedAgencyId || 0) ||
    null;
  if (affiliated) return affiliated;

  // Fallback: first agency-type org the user belongs to.
  const userAgency = (agencyStore.userAgencies || []).find((a) => isAgencyOrgType(a));
  if (userAgency?.id) return userAgency.id;
  const knownAgency = (agencyStore.agencies || []).find((a) => isAgencyOrgType(a));
  return knownAgency?.id || null;
});
const myRole = computed(() => authStore.user?.role || '');
const isAdminLike = computed(() => myRole.value === 'admin' || myRole.value === 'super_admin');
const adminsAllMode = computed(() => myRole.value === 'super_admin' && myAvailability.value === 'admins_only');
const needsAgency = computed(() => !agencyId.value && !adminsAllMode.value);

const people = ref([]);
const threads = ref([]);
let pollTimer = null;

const isOpen = ref(false);
const loading = ref(false);
const error = ref('');
const q = ref('');

const myAvailability = ref(null);

const activeChatUser = ref(null);
const activeThreadId = ref(null);
const activeThreadAgencyId = ref(null);
const chatMessages = ref([]);
const chatLoading = ref(false);
const chatError = ref('');
const draft = ref('');
const sending = ref(false);
const chatMessagesEl = ref(null);
const selectMode = ref(false);
const selectedMessageIds = ref([]);

const meId = computed(() => authStore.user?.id);

const totalUnread = computed(() => (threads.value || []).reduce((sum, t) => sum + (t.unread_count || 0), 0));

const iconUrl = computed(() => {
  const a = agencyStore.currentAgency;
  if (a?.chat_icon_path) return toUploadsUrl(a.chat_icon_path);

  const pb = brandingStore.platformBranding;
  if (pb?.chat_icon_path) return toUploadsUrl(pb.chat_icon_path);
  if (pb?.communications_icon_path) return toUploadsUrl(pb.communications_icon_path);

  // last-resort fallbacks
  if (a?.icon_file_path) return toUploadsUrl(a.icon_file_path);
  if (pb?.master_brand_icon_path) return toUploadsUrl(pb.master_brand_icon_path);
  return null;
});

const loggedInNow = computed(() => {
  if (needsAgency.value) return 0;
  return (people.value || []).filter((u) => u.status === 'online' || u.status === 'idle').length;
});

let closeTimer = null;
const onEnter = () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  isOpen.value = true;
};
const onLeave = () => {
  if (closeTimer) clearTimeout(closeTimer);
  // Debounce close to avoid flicker/quiver while interacting.
  closeTimer = setTimeout(() => {
    isOpen.value = false;
    closeTimer = null;
  }, 180);
};

const shouldLoadAllThreads = computed(() => {
  if (myRole.value === 'super_admin') return true;
  const ua = agencyStore.userAgencies || [];
  return ua.length > 1;
});

const agenciesForLabel = computed(() => {
  const map = new Map();
  for (const a of (agencyStore.agencies || [])) map.set(a.id, a.name);
  for (const a of (agencyStore.userAgencies || [])) map.set(a.id, a.name);
  const current = agencyStore.currentAgency;
  if (current?.id && current?.name) map.set(current.id, current.name);
  return map;
});

const pendingThreads = computed(() => {
  const list = (threads.value || []).filter((t) => (t.unread_count || 0) > 0 && t.other_participant);
  const enriched = list.map((t) => ({
    ...t,
    agencyLabel: agenciesForLabel.value.get(t.agency_id) || (t.agency_id ? `Agency ${t.agency_id}` : '')
  }));
  return enriched.slice(0, 12);
});

const filteredPeople = computed(() => {
  const query = q.value.trim().toLowerCase();
  const list = people.value || [];
  if (!query) return list;
  return list.filter((u) => (`${u.first_name} ${u.last_name}`.toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query)));
});

const unreadByUserId = computed(() => {
  const map = new Map();
  for (const t of (threads.value || [])) {
    const other = t.other_participant;
    if (!other) continue;
    map.set(other.id, (map.get(other.id) || 0) + (t.unread_count || 0));
  }
  return map;
});

const peopleWithUnread = computed(() => {
  return (filteredPeople.value || []).map((u) => ({
    ...u,
    unreadCount: unreadByUserId.value.get(u.id) || 0
  }));
});

const online = computed(() => peopleWithUnread.value.filter((u) => u.status === 'online' && u.id !== meId.value));
const idle = computed(() => peopleWithUnread.value.filter((u) => u.status === 'idle' && u.id !== meId.value));
const offline = computed(() => peopleWithUnread.value.filter((u) => u.status === 'offline' && u.id !== meId.value));

const loadPresence = async () => {
  try {
    loading.value = true;
    error.value = '';
    if (adminsAllMode.value) {
      const resp = await api.get('/presence/admins', { skipGlobalLoading: true });
      people.value = resp.data || [];
    } else {
      if (!agencyId.value) {
        people.value = [];
        return;
      }
      const resp = await api.get(`/presence/agency/${agencyId.value}`, { skipGlobalLoading: true });
      people.value = resp.data || [];
    }
  } catch {
    error.value = 'Failed to load presence';
    people.value = [];
  } finally {
    loading.value = false;
  }
};

const loadThreads = async () => {
  try {
    const params = {};
    if (!shouldLoadAllThreads.value) {
      if (!agencyId.value) {
        threads.value = [];
        return;
      }
      params.agencyId = agencyId.value;
    }
    const resp = await api.get('/chat/threads', { params, skipGlobalLoading: true });
    threads.value = resp.data || [];
  } catch {
    // ignore
  }
};

const openChat = async (u, agencyIdOverride = null) => {
  chatError.value = '';
  chatMessages.value = [];
  draft.value = '';

  try {
    chatLoading.value = true;
    const useAgencyId = agencyIdOverride || agencyId.value;
    if (!useAgencyId) {
      // In super-admin "admins-only" mode there may be no agency context.
      // Don't open the full chat box in that case (it creates a large empty panel).
      chatError.value = 'Select an agency to start a chat';
      activeChatUser.value = null;
      activeThreadId.value = null;
      activeThreadAgencyId.value = null;
      chatMessages.value = [];
      return;
    }

    activeChatUser.value = u;
    activeThreadAgencyId.value = useAgencyId;
    const resp = await api.post('/chat/threads/direct', { agencyId: useAgencyId, otherUserId: u.id }, { skipGlobalLoading: true });
    activeThreadId.value = resp.data.threadId;
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open chat';
  } finally {
    chatLoading.value = false;
  }
};

const openThread = async (t) => {
  if (!t?.other_participant) return;
  await openChat(t.other_participant, t.agency_id);
};

/** Open a direct thread by user id (e.g. from URL openChatWith=userId&agencyId=...). Used when supervisor clicks "Chat with supervisee". */
const openChatByUserId = async (otherUserId, agencyIdOverride, displayName = '') => {
  const useAgencyId = agencyIdOverride ? parseInt(agencyIdOverride, 10) : agencyId.value;
  if (!useAgencyId || !otherUserId) return;
  chatError.value = '';
  chatMessages.value = [];
  draft.value = '';
  try {
    chatLoading.value = true;
    const resp = await api.post('/chat/threads/direct', {
      agencyId: useAgencyId,
      otherUserId: parseInt(otherUserId, 10)
    }, { skipGlobalLoading: true });
    activeThreadId.value = resp.data?.threadId ?? null;
    activeThreadAgencyId.value = useAgencyId;
    const name = (displayName || '').trim() || 'User';
    const parts = name.split(/\s+/);
    activeChatUser.value = {
      id: parseInt(otherUserId, 10),
      first_name: parts[0] || name,
      last_name: parts.slice(1).join(' ') || ''
    };
    if (activeThreadId.value) {
      await loadMessages({ markRead: true, scrollToBottom: true });
    }
    isOpen.value = true;
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open chat';
  } finally {
    chatLoading.value = false;
  }
};

const scrollMessagesToBottom = async () => {
  await nextTick();
  const el = chatMessagesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

const toggleSelectMode = () => {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selectedMessageIds.value = [];
};

const isSelected = (id) => selectedMessageIds.value.includes(Number(id));

const toggleSelected = (id) => {
  const n = Number(id);
  if (!Number.isFinite(n)) return;
  if (isSelected(n)) {
    selectedMessageIds.value = selectedMessageIds.value.filter((x) => x !== n);
  } else {
    selectedMessageIds.value = [...selectedMessageIds.value, n];
  }
};

const loadMessages = async ({ markRead, scrollToBottom } = { markRead: true, scrollToBottom: true }) => {
  if (!activeThreadId.value) return;
  try {
    chatLoading.value = true;
    const resp = await api.get(
      `/chat/threads/${activeThreadId.value}/messages`,
      { params: { limit: 60 }, skipGlobalLoading: true }
    );
    chatMessages.value = resp.data || [];
    if (scrollToBottom) {
      await scrollMessagesToBottom();
    }
    const last = chatMessages.value[chatMessages.value.length - 1];
    const canMarkRead =
      !!markRead && typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
    if (canMarkRead && last?.id) {
      // Fire-and-forget: don't block UI on read receipts or thread refresh.
      api.post(
        `/chat/threads/${activeThreadId.value}/read`,
        { lastReadMessageId: last.id },
        { skipGlobalLoading: true }
      ).catch(() => {});
      loadThreads().catch(() => {});
    }
  } finally {
    chatLoading.value = false;
  }
};

const send = async () => {
  if (!activeThreadId.value || !draft.value.trim()) return;
  try {
    sending.value = true;
    const body = draft.value.trim();
    draft.value = '';
    await api.post(`/chat/threads/${activeThreadId.value}/messages`, { body }, { skipGlobalLoading: true });
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    sending.value = false;
  }
};

const unsend = async (m) => {
  if (!activeThreadId.value || !m?.id) return;
  if (m.sender_user_id !== meId.value) return;
  if (m.is_read_by_other) return;
  try {
    sending.value = true;
    await api.delete(`/chat/threads/${activeThreadId.value}/messages/${m.id}`, { skipGlobalLoading: true });
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to unsend message';
  } finally {
    sending.value = false;
  }
};

const deleteForMe = async (m) => {
  if (!activeThreadId.value || !m?.id) return;
  try {
    sending.value = true;
    await api.post(
      `/chat/threads/${activeThreadId.value}/messages/${m.id}/delete-for-me`,
      {},
      { skipGlobalLoading: true }
    );
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete message';
  } finally {
    sending.value = false;
  }
};

const deleteSelected = async () => {
  if (!activeThreadId.value) return;
  const ids = selectedMessageIds.value || [];
  if (ids.length === 0) return;
  try {
    sending.value = true;
    chatError.value = '';
    await api.post(
      `/chat/threads/${activeThreadId.value}/messages/delete-for-me`,
      { messageIds: ids },
      { skipGlobalLoading: true }
    );
    selectedMessageIds.value = [];
    selectMode.value = false;
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete selected messages';
  } finally {
    sending.value = false;
  }
};

const deleteThread = async () => {
  if (!activeThreadId.value) return;
  try {
    sending.value = true;
    chatError.value = '';
    await api.post(`/chat/threads/${activeThreadId.value}/delete-for-me`, {}, { skipGlobalLoading: true });
    closeChat();
    await loadThreads();
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete thread';
  } finally {
    sending.value = false;
  }
};

const closeChat = () => {
  activeChatUser.value = null;
  activeThreadId.value = null;
  activeThreadAgencyId.value = null;
  chatMessages.value = [];
  draft.value = '';
  chatError.value = '';
  selectMode.value = false;
  selectedMessageIds.value = [];
};

const fetchMyPresence = async () => {
  try {
    const resp = await api.get('/presence/me', { skipGlobalLoading: true });
    myAvailability.value = resp.data?.availability_level || null;
  } catch {
    // ignore
  }
};

const setMyAvailability = async (level) => {
  try {
    await api.post('/presence/availability', { availabilityLevel: level }, { skipGlobalLoading: true });
    myAvailability.value = level;
    await Promise.all([loadPresence(), loadThreads()]);
  } catch {
    // ignore
  }
};

const toggleMyAvailability = async () => {
  const next = myAvailability.value === 'offline' ? 'everyone' : 'offline';
  await setMyAvailability(next);
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!isAuthenticated.value) return;
    Promise.all([loadPresence(), loadThreads()]);
    if (activeThreadId.value) {
      // Poll messages without marking them as read (prevents background tabs from auto-reading).
      loadMessages({ markRead: false });
    }
  }, 20000);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

watch(agencyId, async () => {
  closeChat();
  await Promise.all([loadPresence(), loadThreads()]);
});

// When URL has openChatWith + agencyId (e.g. supervisor clicked "Chat with supervisee"), open that thread in the drawer and clear those params.
watch(
  () => ({ query: route.query, path: route.path }),
  async (newVal) => {
    const openChatWith = newVal.query?.openChatWith;
    const agencyIdFromQuery = newVal.query?.agencyId;
    const openChatWithName = newVal.query?.openChatWithName;
    if (!openChatWith || !(agencyIdFromQuery || agencyId.value)) return;
    await openChatByUserId(openChatWith, agencyIdFromQuery || agencyId.value, openChatWithName);
    await loadThreads();
    const q = { ...newVal.query };
    delete q.openChatWith;
    delete q.openChatWithName;
    router.replace({ path: newVal.path, query: q });
  },
  { immediate: true }
);

onMounted(async () => {
  if (!isAuthenticated.value) return;
  await Promise.all([fetchMyPresence(), loadPresence(), loadThreads()]);
  startPolling();
});

onUnmounted(() => {
  stopPolling();
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
});
</script>

<style scoped>
.chat-drawer {
  position: fixed;
  top: 50%;
  bottom: auto;
  left: 0;
  transform: translateY(-50%);
  z-index: 1200; /* stay above page nav/buttons */
  display: flex;
  align-items: stretch;
  pointer-events: auto;
  max-height: calc(100vh - 24px);
}

.rail {
  width: 44px;
  background: transparent; /* no rail background */
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 6px;
  gap: 6px;
  border-radius: 0;
  box-shadow: none;
}

.rail-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Don't crop the icon */
  overflow: visible;
  border-radius: 0;
}

.rail-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain; /* avoid clipping */
}

.icon-fallback {
  font-size: 11px;
  font-weight: 800;
}

.rail-badge {
  font-size: 11px;
  font-weight: 900;
  border-radius: 999px;
  padding: 2px 6px;
  line-height: 1.2;
  background: rgba(15, 23, 42, 0.65); /* subtle pill; rail itself stays invisible */
  color: #fff;
}

.rail-badge-top {
  background: rgba(239, 68, 68, 0.9);
}

.rail-badge-top.zero {
  background: rgba(15, 23, 42, 0.35);
  color: rgba(255, 255, 255, 0.85);
}

.rail-badge-bottom {
  background: rgba(34, 197, 94, 0.35);
  border: 1px solid rgba(34, 197, 94, 0.45);
  color: #dcfce7;
}

.rail-badge-bottom.disabled {
  opacity: 0.55;
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.3);
  color: #e2e8f0;
}

.panel {
  width: 0;
  height: 0; /* prevent huge invisible container when closed */
  max-height: 0;
  overflow: hidden;
  background: white;
  border-right: none;
  transition: width 160ms ease, max-height 160ms ease;
  display: flex;
  flex-direction: column;
}

.chat-drawer.open .panel {
  width: 360px;
  /* Keep it compact by default but never exceed viewport. */
  height: clamp(420px, 72vh, calc(100vh - 24px));
  max-height: calc(100vh - 24px);
  border-right: 1px solid var(--border);
}

.panel-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.title {
  font-weight: 800;
  color: var(--text-primary);
}

.subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.presence-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.btn.btn-xs {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 8px;
}

.agency-chip {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
}

.panel-body {
  position: relative; /* contain the absolute chat-box (prevents “ghost window” on collapse) */
  padding: 12px 14px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.toolbar { margin-bottom: 10px; }
.search {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}

.lists {
  height: calc(100% - 44px);
  overflow: auto;
  padding-right: 4px;
}

.section { margin-bottom: 14px; }
.section-title { font-weight: 800; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.person {
  width: 100%;
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  padding: 10px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 8px;
  text-align: left;
}
.person:hover { border-color: var(--primary); }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot-online { background: #22c55e; }
.dot-idle { background: #f59e0b; }
.dot-offline { background: #9ca3af; }
.name { flex: 1; font-weight: 700; color: var(--text-primary); font-size: 13px; }
.pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 12px; color: var(--text-secondary); font-weight: 800; }
.muted { color: var(--text-secondary); font-size: 13px; padding: 6px 2px; }
/* Let the main `.lists` container handle scrolling; don't cap Offline at 240px. */
.scroll { max-height: none; overflow: visible; padding-right: 0; }

.chat-box {
  position: absolute;
  right: 0;
  bottom: 0;
  top: 0;
  width: 360px;
  height: auto;
  border-top: 1px solid var(--border);
  background: white;
  display: flex;
  flex-direction: column;
  min-height: 0; /* critical for flex+overflow scrolling */
  z-index: 1;
}

.chat-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.chat-title { font-weight: 800; }
.chat-box-actions { display: flex; gap: 8px; align-items: center; }
.btn-close { border: none; background: none; font-size: 18px; cursor: pointer; color: var(--text-secondary); }

.chat-messages {
  flex: 1;
  overflow: auto;
  padding: 10px 12px;
  background: #f8fafc;
  min-height: 0; /* allows this flex child to scroll instead of pushing composer off-screen */
}
.msg-list { display: flex; flex-direction: column; gap: 10px; }
.msg-row { display: flex; gap: 10px; align-items: flex-start; }
.msg-row.mine { justify-content: flex-end; }
.msg-select { padding-top: 6px; }
.msg-select input { width: 14px; height: 14px; }
.msg {
  border: 1px solid var(--border);
  background: white;
  border-radius: 12px;
  padding: 8px 10px;
  max-width: 90%;
}
.msg.mine { background: #ecfdf5; border-color: #a7f3d0; }
.msg-meta { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
.msg-receipt { margin-left: 6px; font-weight: 900; color: rgba(15, 23, 42, 0.6); }
.msg.mine .msg-receipt { color: rgba(16, 185, 129, 0.9); }
.msg-action {
  margin-left: 10px;
  border: none;
  background: transparent;
  color: rgba(15, 23, 42, 0.55);
  font-weight: 800;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.msg-action:hover { color: rgba(15, 23, 42, 0.75); text-decoration: underline; }
.msg-action:disabled { opacity: 0.6; cursor: not-allowed; }
.msg-body { white-space: pre-wrap; font-size: 13px; color: var(--text-primary); }

.chat-composer {
  border-top: 1px solid var(--border);
  padding: 10px 12px;
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.chat-composer textarea {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  min-height: 56px;
  max-height: 140px;
  resize: vertical;
  font-size: 13px;
}
.chat-composer .btn {
  padding: 0 14px;
  font-size: 13px;
  border-radius: 10px;
  min-width: 56px;
  min-height: 56px; /* match textarea min-height */
  height: 100%; /* match current textarea height as it grows */
}

.loading { color: var(--text-secondary); }
.error { color: #b91c1c; font-size: 13px; }
.empty { color: var(--text-secondary); padding: 10px 2px; }
</style>

