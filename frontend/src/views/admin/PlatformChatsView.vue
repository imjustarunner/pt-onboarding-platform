<template>
  <div class="container chats-view">
    <div class="header">
      <div>
        <h2>Platform Chats</h2>
        <p class="subtitle">Direct messages within the selected agency.</p>
      </div>
      <div class="header-actions">
        <div v-if="canChooseAgency" class="agency-picker">
          <label>Agency</label>
          <select v-model="selectedAgencyId" @change="onAgencyPicked">
            <option :value="''">Select…</option>
            <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <button class="btn btn-secondary" @click="refresh" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="!agencyId" class="empty">
      Select an agency first.
    </div>

    <div v-else class="grid">
      <div class="card threads">
        <div class="card-title">Threads</div>
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else-if="threads.length === 0" class="muted">No chats yet. Start one from the left chat drawer.</div>
        <button
          v-else
          v-for="t in threads"
          :key="t.thread_id"
          class="thread"
          :class="{ active: t.thread_id === activeThreadId }"
          @click="selectThread(t)"
        >
          <div class="thread-top">
            <div class="thread-name">
              {{ t.other_participant ? `${t.other_participant.first_name} ${t.other_participant.last_name}` : `Thread #${t.thread_id}` }}
            </div>
            <span v-if="t.unread_count" class="pill">{{ t.unread_count }}</span>
          </div>
          <div class="thread-preview">
            {{ t.last_message?.body || 'No messages yet.' }}
          </div>
        </button>
      </div>

      <div class="card messages">
        <div class="card-title">
          {{ activeThreadLabel }}
        </div>

        <div v-if="!activeThreadId" class="muted">Select a thread.</div>
        <div v-else>
          <div v-if="messagesLoading" class="muted">Loading…</div>
          <div v-else-if="messagesError" class="error">{{ messagesError }}</div>
          <div v-else class="bubble-list">
            <div v-for="m in messages" :key="m.id" class="bubble" :class="{ mine: m.sender_user_id === meId }">
              <div class="meta">
                <span>{{ m.sender_first_name }} {{ m.sender_last_name }}</span>
                <span>{{ formatTime(m.created_at) }}</span>
              </div>
              <div class="text">{{ m.body }}</div>
            </div>
          </div>

          <div class="composer">
            <textarea v-model="draft" rows="3" placeholder="Type a message…" />
            <div class="actions">
              <button class="btn btn-primary" @click="send" :disabled="sending || !draft.trim()">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
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
  const other = activeThread.value.other_participant;
  if (!other) return `Thread #${activeThread.value.thread_id}`;
  return `${other.first_name} ${other.last_name}`;
});

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
    const resp = await api.get('/chat/threads', { params: { agencyId: agencyId.value } });
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

const loadMessages = async () => {
  if (!activeThreadId.value) return;
  try {
    messagesLoading.value = true;
    messagesError.value = '';
    const resp = await api.get(`/chat/threads/${activeThreadId.value}/messages`, { params: { limit: 200 } });
    messages.value = resp.data || [];
    const last = messages.value[messages.value.length - 1];
    if (last?.id) {
      await api.post(`/chat/threads/${activeThreadId.value}/read`, { lastReadMessageId: last.id }).catch(() => {});
      await loadThreads();
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
  await loadMessages();
};

const send = async () => {
  if (!activeThreadId.value || !draft.value.trim()) return;
  try {
    sending.value = true;
    const body = draft.value.trim();
    draft.value = '';
    await api.post(`/chat/threads/${activeThreadId.value}/messages`, { body });
    await loadMessages();
  } finally {
    sending.value = false;
  }
};

const refresh = async () => {
  await loadThreads();
  if (activeThreadId.value) await loadMessages();
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
.threads { max-height: 74vh; overflow: auto; }
.thread { width: 100%; text-align: left; border: 1px solid var(--border); border-radius: 10px; background: white; padding: 10px 12px; cursor: pointer; margin-bottom: 10px; }
.thread.active { border-color: var(--primary); }
.thread-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.thread-name { font-weight: 800; }
.thread-preview { margin-top: 6px; color: var(--text-secondary); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 12px; color: var(--text-secondary); font-weight: 800; }
.messages { display: flex; flex-direction: column; min-height: 74vh; }
.bubble-list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 10px 0; }
.bubble { max-width: 90%; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: #f8fafc; }
.bubble.mine { margin-left: auto; background: #ecfdf5; border-color: #a7f3d0; }
.meta { display: flex; justify-content: space-between; gap: 10px; color: var(--text-secondary); font-size: 12px; margin-bottom: 4px; }
.text { white-space: pre-wrap; }
.composer { border-top: 1px solid var(--border); padding-top: 10px; }
textarea { width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; resize: vertical; }
.actions { display: flex; justify-content: flex-end; margin-top: 8px; }
.muted { color: var(--text-secondary); }
.error { color: #b91c1c; }
.empty { color: var(--text-secondary); border: 1px dashed var(--border); padding: 14px; border-radius: 12px; background: #fafafa; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } .messages { min-height: auto; } }
</style>

