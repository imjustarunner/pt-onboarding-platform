<template>
  <div class="container chats-view">
    <div class="header" data-tour="chats-header">
      <div>
        <h2 data-tour="chats-title">Platform Chats</h2>
        <p class="subtitle" data-tour="chats-subtitle">Direct messages within the selected agency.</p>
      </div>
      <div class="header-actions" data-tour="chats-actions">
        <div v-if="canChooseAgency" class="agency-picker" data-tour="chats-agency-picker">
          <label>Agency</label>
          <select v-model="selectedAgencyId" @change="onAgencyPicked">
            <option :value="''">Select…</option>
            <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <button class="btn btn-primary" @click="openNewChat" :disabled="loading || !agencyId">New chat</button>
        <button class="btn btn-secondary" @click="refresh" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="!agencyId" class="empty" data-tour="chats-empty">
      Select an agency first.
    </div>

    <div v-else class="grid" data-tour="chats-grid">
      <div class="card threads" data-tour="chats-threads">
        <div class="card-title">Threads</div>
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else-if="threads.length === 0" class="muted">No chats yet. Start one from the left chat drawer.</div>
        <button
          v-else
          v-for="t in threads"
          :key="t.thread_id"
          class="thread"
          data-tour="chats-thread"
          :class="{ active: t.thread_id === activeThreadId }"
          @click="selectThread(t)"
        >
          <div class="thread-top">
            <div class="thread-name">
              {{ threadLabel(t) }}
            </div>
            <span v-if="t.unread_count" class="pill">{{ t.unread_count }}</span>
          </div>
          <div class="thread-preview">
            {{ t.last_message?.body || 'No messages yet.' }}
          </div>
        </button>
      </div>

      <div class="card messages" data-tour="chats-messages">
        <div class="card-title title-row">
          <span>{{ activeThreadLabel }}</span>
          <div v-if="activeThreadId" class="title-actions" data-tour="chats-thread-actions">
            <button class="btn btn-secondary btn-xs" type="button" @click="toggleSelectMode" :disabled="sending || messagesLoading">
              {{ selectMode ? 'Cancel' : 'Select' }}
            </button>
            <button
              v-if="selectMode"
              class="btn btn-danger btn-xs"
              type="button"
              @click="deleteSelected"
              :disabled="sending || selectedMessageIds.length === 0"
              :title="selectedMessageIds.length ? `Delete ${selectedMessageIds.length} selected` : 'Select messages to delete'"
            >
              Delete selected ({{ selectedMessageIds.length }})
            </button>
            <button class="btn btn-danger btn-xs" type="button" @click="deleteThread" :disabled="sending || messagesLoading">
              Delete thread
            </button>
          </div>
        </div>

        <div v-if="!activeThreadId" class="muted">Select a thread.</div>
        <div v-else>
          <div v-if="messagesLoading" class="muted">Loading…</div>
          <div v-else-if="messagesError" class="error">{{ messagesError }}</div>
          <div v-else class="bubble-list" ref="messagesEl" data-tour="chats-bubble-list">
            <div v-for="m in messages" :key="m.id" class="bubble-row" :class="{ mine: m.sender_user_id === meId }">
              <label v-if="selectMode" class="select-box">
                <input
                  type="checkbox"
                  :checked="isSelected(m.id)"
                  @change="toggleSelected(m.id)"
                />
              </label>
              <div class="bubble">
              <div class="meta">
                <span>{{ m.sender_first_name }} {{ m.sender_last_name }}</span>
                <span>
                  {{ formatTime(m.created_at) }}
                  <span v-if="m.sender_user_id === meId" class="receipt">{{ m.is_read_by_other ? '✓✓' : '✓' }}</span>
                  <button
                    v-if="m.sender_user_id === meId && !m.is_read_by_other"
                    class="unsend"
                    type="button"
                    @click="unsend(m)"
                    :disabled="sending"
                    title="Unsend (only before read)"
                  >
                    Unsend
                  </button>
                  <button
                    class="unsend"
                    type="button"
                    @click="deleteForMe(m)"
                    :disabled="sending"
                    title="Delete for me"
                  >
                    Delete
                  </button>
                </span>
              </div>
              <div class="text">{{ m.body }}</div>
              </div>
            </div>
          </div>

          <div class="composer" data-tour="chats-composer">
            <textarea v-model="draft" rows="3" placeholder="Type a message…" />
            <div class="actions">
              <button class="btn btn-primary" @click="send" :disabled="sending || !draft.trim()">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="newChatOpen" class="modal-overlay" @click.self="closeNewChat">
    <div class="modal">
      <div class="modal-header">
        <div>
          <div class="modal-title">Start a chat</div>
          <div class="modal-subtitle">Pick 1 person for a direct message, or 2+ people for a group.</div>
        </div>
        <button class="btn btn-secondary btn-xs" type="button" @click="closeNewChat">Close</button>
      </div>

      <div class="modal-body">
        <div class="modal-toolbar">
          <input v-model="newChatQ" class="modal-search" placeholder="Search by name or email…" />
          <div class="modal-selected">
            Selected: <strong>{{ selectedNewChatUserIds.length }}</strong>
          </div>
        </div>

        <div v-if="newChatLoading" class="muted">Loading people…</div>
        <div v-else-if="newChatError" class="error">{{ newChatError }}</div>

        <div v-else class="people-list">
          <label v-for="u in filteredNewChatPeople" :key="u.id" class="person-row">
            <input
              type="checkbox"
              :value="u.id"
              v-model="selectedNewChatUserIds"
              :disabled="sending"
            />
            <div class="person-main">
              <div class="person-name">{{ u.first_name }} {{ u.last_name }}</div>
              <div class="person-meta">{{ u.email }} <span class="dot" :class="`dot-${u.status || 'offline'}`"></span></div>
            </div>
          </label>
          <div v-if="filteredNewChatPeople.length === 0" class="muted">No matches.</div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" @click="clearNewChatSelection" :disabled="sending">Clear</button>
        <button class="btn btn-primary" type="button" @click="startNewChat" :disabled="sending || selectedNewChatUserIds.length === 0">
          Start
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { useOrganizationStore } from '../../store/organization';
import { useRoute, useRouter } from 'vue-router';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const organizationStore = useOrganizationStore();
const route = useRoute();
const router = useRouter();

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const agencyId = computed(() => {
  const q = route.query?.agencyId ? parseInt(String(route.query.agencyId), 10) : null;
  if (Number.isFinite(q) && q > 0) return q;
  return agencyStore.currentAgency?.id || null;
});
const meId = computed(() => authStore.user?.id);

const loading = ref(false);
const error = ref('');
const threads = ref([]);
const activeThreadId = ref(null);
const activeThread = ref(null);

const messagesLoading = ref(false);
const messagesError = ref('');
const messages = ref([]);
const draft = ref('');
const sending = ref(false);
const messagesEl = ref(null);
const selectMode = ref(false);
const selectedMessageIds = ref([]);

const agencyOptions = computed(() => {
  const list = isSuperAdmin.value ? (agencyStore.agencies || []) : (agencyStore.userAgencies || agencyStore.agencies || []);
  return (list || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const canChooseAgency = computed(() => {
  const list = agencyOptions.value || [];
  // Only show the picker when switching is meaningful.
  return list.length > 1;
});

const selectedAgencyId = ref('');

const activeThreadLabel = computed(() => {
  if (!activeThread.value) return 'Messages';
  return threadLabel(activeThread.value);
});

const threadLabel = (t) => {
  if (!t) return 'Thread';
  const type = String(t.thread_type || 'direct');
  if (type === 'group') {
    const parts = (t.participants || []).filter((p) => Number(p?.id) !== Number(meId.value));
    if (parts.length === 0) return `Group #${t.thread_id}`;
    const names = parts.map((p) => `${p.first_name || ''} ${p.last_name || ''}`.trim()).filter(Boolean);
    const shown = names.slice(0, 3);
    const extra = names.length - shown.length;
    return extra > 0 ? `Group: ${shown.join(', ')} +${extra}` : `Group: ${shown.join(', ')}`;
  }
  const other = t.other_participant;
  if (!other) return `Thread #${t.thread_id}`;
  return `${other.first_name} ${other.last_name}`;
};

// New chat modal
const newChatOpen = ref(false);
const newChatLoading = ref(false);
const newChatError = ref('');
const newChatPeople = ref([]);
const newChatQ = ref('');
const selectedNewChatUserIds = ref([]);

const filteredNewChatPeople = computed(() => {
  const q = String(newChatQ.value || '').trim().toLowerCase();
  const list = (newChatPeople.value || []).filter((u) => Number(u?.id) !== Number(meId.value));
  if (!q) return list;
  return list.filter((u) => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
    const email = String(u.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });
});

const openNewChat = async () => {
  if (!agencyId.value) return;
  newChatOpen.value = true;
  newChatError.value = '';
  newChatQ.value = '';
  selectedNewChatUserIds.value = [];
  try {
    newChatLoading.value = true;
    const resp = await api.get(`/presence/agency/${agencyId.value}`, { skipGlobalLoading: true });
    newChatPeople.value = resp.data || [];
  } catch (e) {
    newChatError.value = e.response?.data?.error?.message || 'Failed to load people';
    newChatPeople.value = [];
  } finally {
    newChatLoading.value = false;
  }
};

const closeNewChat = () => {
  newChatOpen.value = false;
};

const clearNewChatSelection = () => {
  selectedNewChatUserIds.value = [];
};

const startNewChat = async () => {
  if (!agencyId.value) return;
  const ids = [...new Set((selectedNewChatUserIds.value || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return;
  try {
    sending.value = true;
    newChatError.value = '';
    let threadId = null;
    if (ids.length === 1) {
      const resp = await api.post('/chat/threads/direct', { agencyId: agencyId.value, otherUserId: ids[0] }, { skipGlobalLoading: true });
      threadId = resp.data?.threadId ?? null;
    } else {
      const resp = await api.post('/chat/threads/group', { agencyId: agencyId.value, userIds: ids }, { skipGlobalLoading: true });
      threadId = resp.data?.threadId ?? null;
    }
    closeNewChat();
    await loadThreads();
    const t = (threads.value || []).find((x) => Number(x.thread_id) === Number(threadId));
    if (t) await selectThread(t);
  } catch (e) {
    newChatError.value = e.response?.data?.error?.message || 'Failed to start chat';
  } finally {
    sending.value = false;
  }
};

const onAgencyPicked = async () => {
  const id = parseInt(String(selectedAgencyId.value || ''), 10);
  if (!Number.isFinite(id) || id <= 0) return;
  const found = (agencyOptions.value || []).find((a) => Number(a?.id) === id);
  if (!found) return;

  // Persist the agency selection for branding/theme.
  agencyStore.setCurrentAgency(found);
  organizationStore.setCurrentOrganization(found);

  // Ensure full agency record for theme settings (best-effort).
  const hydrated = await agencyStore.hydrateAgencyById(id);
  const org = hydrated || found;

  // Apply theme immediately (so the user sees the branding switch right away).
  try {
    const paletteRaw = org?.color_palette ?? org?.colorPalette ?? null;
    const themeRaw = org?.theme_settings ?? org?.themeSettings ?? null;
    const colorPalette = typeof paletteRaw === 'string' ? JSON.parse(paletteRaw) : (paletteRaw || {});
    const themeSettings = typeof themeRaw === 'string' ? JSON.parse(themeRaw) : (themeRaw || {});
    brandingStore.applyTheme({
      brandingAgencyId: org?.id,
      agencyId: org?.id,
      colorPalette,
      themeSettings
    });
  } catch {
    // ignore
  }

  // Navigate into the agency slug route (so chat is fully agency-scoped).
  const slug = String(org?.slug || org?.portal_url || '').trim();
  const curSlug = String(route.params?.organizationSlug || '').trim();
  const query = { ...route.query, agencyId: String(id) };
  if (slug && slug !== curSlug) {
    await router.push({ path: `/${slug}/admin/communications/chats`, query });
    return;
  }
  await router.push({ path: route.path, query });
};

const loadThreads = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/chat/threads', { params: { agencyId: agencyId.value }, skipGlobalLoading: true });
    threads.value = resp.data || [];

    // Auto-open thread when linked from notifications/communications feed.
    const desired = route.query?.threadId ? parseInt(String(route.query.threadId), 10) : null;
    if (desired && (threads.value || []).some((t) => Number(t.thread_id) === desired)) {
      const t = (threads.value || []).find((x) => Number(x.thread_id) === desired) || null;
      if (t) {
        // eslint-disable-next-line no-await-in-loop
        await selectThread(t);
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load chats';
  } finally {
    loading.value = false;
  }
};

const scrollToBottom = async () => {
  await nextTick();
  const el = messagesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

const toggleSelectMode = () => {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) {
    selectedMessageIds.value = [];
  }
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

const loadMessages = async ({ markRead, scrollToBottom: shouldScroll } = { markRead: true, scrollToBottom: true }) => {
  if (!activeThreadId.value) return;
  try {
    messagesLoading.value = true;
    messagesError.value = '';
    const resp = await api.get(
      `/chat/threads/${activeThreadId.value}/messages`,
      { params: { limit: 200 }, skipGlobalLoading: true }
    );
    messages.value = resp.data || [];
    if (shouldScroll) {
      await scrollToBottom();
    }
    const last = messages.value[messages.value.length - 1];
    const canMarkRead =
      !!markRead && typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
    if (canMarkRead && last?.id) {
      // Fire-and-forget to avoid leaving UI “spinning” on slow follow-up calls.
      api.post(
        `/chat/threads/${activeThreadId.value}/read`,
        { lastReadMessageId: last.id },
        { skipGlobalLoading: true }
      ).catch(() => {});
      loadThreads().catch(() => {});
    }
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    messagesLoading.value = false;
  }
};

const selectThread = async (t) => {
  activeThreadId.value = t.thread_id;
  activeThread.value = t;
  selectMode.value = false;
  selectedMessageIds.value = [];
  await loadMessages({ markRead: true, scrollToBottom: true });
};

const deleteSelected = async () => {
  if (!activeThreadId.value) return;
  const ids = selectedMessageIds.value || [];
  if (ids.length === 0) return;
  try {
    sending.value = true;
    messagesError.value = '';
    await api.post(
      `/chat/threads/${activeThreadId.value}/messages/delete-for-me`,
      { messageIds: ids },
      { skipGlobalLoading: true }
    );
    selectedMessageIds.value = [];
    selectMode.value = false;
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to delete selected messages';
  } finally {
    sending.value = false;
  }
};

const deleteThread = async () => {
  if (!activeThreadId.value) return;
  try {
    sending.value = true;
    messagesError.value = '';
    await api.post(`/chat/threads/${activeThreadId.value}/delete-for-me`, {}, { skipGlobalLoading: true });
    // Hide thread immediately in UI.
    activeThreadId.value = null;
    activeThread.value = null;
    messages.value = [];
    selectedMessageIds.value = [];
    selectMode.value = false;
    await loadThreads();
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to delete thread';
  } finally {
    sending.value = false;
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
    messagesError.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    sending.value = false;
  }
};

const unsend = async (m) => {
  if (!activeThreadId.value || !m?.id) return;
  if (Number(m.sender_user_id) !== Number(meId.value)) return;
  if (m.is_read_by_other) return;
  try {
    sending.value = true;
    await api.delete(`/chat/threads/${activeThreadId.value}/messages/${m.id}`, { skipGlobalLoading: true });
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    messagesError.value = e.response?.data?.error?.message || 'Failed to unsend message';
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
    messagesError.value = e.response?.data?.error?.message || 'Failed to delete message';
  } finally {
    sending.value = false;
  }
};

const refresh = async () => {
  await loadThreads();
  if (activeThreadId.value) await loadMessages({ markRead: true });
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return '';
  }
};

watch(agencyId, async () => {
  activeThreadId.value = null;
  activeThread.value = null;
  messages.value = [];
  if (agencyId.value) {
    await loadThreads();
  }
});

onMounted(async () => {
  // Preload agency options for the in-page selector.
  try {
    if (isSuperAdmin.value) {
      if (!agencyStore.agencies || agencyStore.agencies.length === 0) {
        await agencyStore.fetchAgencies();
      }
    } else {
      // Multi-agency admins/support/staff: ensure we have their agency list.
      if (!agencyStore.userAgencies || agencyStore.userAgencies.length === 0) {
        await agencyStore.fetchUserAgencies();
      }
    }
  } catch {
    // ignore
  }

  // Sync selector to current context.
  selectedAgencyId.value = agencyId.value ? String(agencyId.value) : '';
  await loadThreads();
});
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 14px; }
.header-actions { display: flex; align-items: flex-end; gap: 10px; }
.agency-picker { display: flex; flex-direction: column; gap: 6px; }
.agency-picker label { font-size: 12px; font-weight: 700; color: var(--text-secondary); }
.agency-picker select { border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; background: white; min-width: 220px; }
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; }
.grid { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 14px; }
.card { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
.card-title { font-weight: 800; margin-bottom: 10px; }
.title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.title-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.btn.btn-xs, .btn.btn-xs.btn-secondary, .btn.btn-xs.btn-danger { padding: 4px 8px; font-size: 12px; border-radius: 8px; }
.threads { max-height: 74vh; overflow: auto; }
.thread { width: 100%; text-align: left; border: 1px solid var(--border); border-radius: 10px; background: white; padding: 10px 12px; cursor: pointer; margin-bottom: 10px; }
.thread.active { border-color: var(--primary); }
.thread-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.thread-name { font-weight: 800; }
.thread-preview { margin-top: 6px; color: var(--text-secondary); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 12px; color: var(--text-secondary); font-weight: 800; }
.messages { display: flex; flex-direction: column; min-height: 74vh; }
.bubble-list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 10px 0; }
.bubble-row { display: flex; gap: 10px; align-items: flex-start; }
.bubble-row.mine { justify-content: flex-end; }
.select-box { padding-top: 6px; }
.select-box input { width: 16px; height: 16px; }
.bubble { max-width: 90%; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: #f8fafc; }
.bubble-row.mine .bubble { background: #ecfdf5; border-color: #a7f3d0; }
.meta { display: flex; justify-content: space-between; gap: 10px; color: var(--text-secondary); font-size: 12px; margin-bottom: 4px; }
.receipt { margin-left: 8px; font-weight: 900; color: rgba(16, 185, 129, 0.9); }
.unsend {
  margin-left: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.55);
}
.unsend:hover { color: rgba(15, 23, 42, 0.75); text-decoration: underline; }
.unsend:disabled { opacity: 0.6; cursor: not-allowed; }
.text { white-space: pre-wrap; }
.composer { border-top: 1px solid var(--border); padding-top: 10px; }
textarea { width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; resize: vertical; }
.actions { display: flex; justify-content: flex-end; margin-top: 8px; }
.muted { color: var(--text-secondary); }
.error { color: #b91c1c; }
.empty { color: var(--text-secondary); border: 1px dashed var(--border); padding: 14px; border-radius: 12px; background: #fafafa; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } .messages { min-height: auto; } }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 36px);
  overflow: hidden;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.modal-title { font-weight: 900; }
.modal-subtitle { margin-top: 4px; color: var(--text-secondary); font-size: 12px; }
.modal-body { padding: 12px 14px; overflow: auto; }
.modal-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.modal-search {
  flex: 1;
  min-width: 220px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.modal-selected { color: var(--text-secondary); font-size: 13px; }
.people-list { display: flex; flex-direction: column; gap: 8px; }
.person-row {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  gap: 10px;
  align-items: center;
  cursor: pointer;
}
.person-row:hover { border-color: var(--primary); }
.person-row input { width: 16px; height: 16px; }
.person-main { flex: 1; min-width: 0; }
.person-name { font-weight: 800; }
.person-meta { color: var(--text-secondary); font-size: 12px; display: flex; align-items: center; gap: 10px; }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; border: 1px solid rgba(15, 23, 42, 0.12); }
.dot-online { background: #22c55e; }
.dot-idle { background: #f59e0b; }
.dot-offline { background: #9ca3af; }
.modal-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>

