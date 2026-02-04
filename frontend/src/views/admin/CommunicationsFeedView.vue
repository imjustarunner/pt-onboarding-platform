<template>
  <div class="container comms-feed">
    <div class="header" data-tour="comms-header">
      <div>
        <h2 data-tour="comms-title">Communications</h2>
        <p class="subtitle" data-tour="comms-subtitle">Texts + platform chats.</p>
      </div>
      <div class="header-actions" data-tour="comms-actions">
        <div class="tabs">
          <button class="tab" :class="{ active: activeTab === 'all' }" @click="setTab('all')">All</button>
          <button class="tab" :class="{ active: activeTab === 'texts' }" @click="setTab('texts')">Texting</button>
        </div>
        <router-link class="btn btn-secondary" :to="chatsLink" data-tour="comms-go-chats">Chats</router-link>
        <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else class="card" data-tour="comms-card">
      <div v-if="filteredRows.length === 0" class="empty">No communications yet.</div>
      <div v-else class="list" data-tour="comms-list">
        <button
          v-for="item in filteredRows"
          :key="itemKey(item)"
          class="row"
          data-tour="comms-row"
          @click="openItem(item)"
          :title="item.preview"
        >
          <div class="left">
            <div class="top">
              <span
                class="badge"
                :class="item.kind === 'chat' ? 'chat' : (item.kind === 'ticket' ? 'ticket' : (item.direction === 'INBOUND' ? 'in' : 'out'))"
              >
                {{ item.kind === 'chat' ? 'CHAT' : (item.kind === 'ticket' ? 'TICKET' : item.direction) }}
              </span>
              <span v-if="item.kind === 'chat'" class="client">
                {{ chatLabel(item) }}
              </span>
              <span v-else-if="item.kind === 'ticket'" class="client">
                School: {{ item.school_name || (item.school_organization_id ? `#${item.school_organization_id}` : '—') }}
              </span>
              <span v-else class="client">
                Client: {{ item.client_initials || '—' }}
              </span>
              <span v-if="item.kind === 'chat' && item.last_sender_role" class="owner">
                From: {{ formatRole(item.last_sender_role) }}
              </span>
              <span v-else-if="item.kind === 'ticket'" class="owner">
                Status: {{ String(item.status || 'open').toUpperCase() }}
              </span>
              <span v-else-if="item.kind === 'sms'" class="owner">
                Owner: {{ formatOwner(item) }}
              </span>
            </div>
            <div class="body">{{ item.preview }}</div>
          </div>
          <div class="right">
            <div class="time">{{ formatTime(itemTime(item)) }}</div>
            <div v-if="item.kind === 'chat' && Number(item.unread_count || 0) > 0" class="pill">
              {{ Number(item.unread_count) }}
            </div>
            <div v-else-if="item.kind === 'ticket' && String(item.status || '').toLowerCase() === 'open'" class="pill">
              NEW
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useRouter, useRoute } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const loading = ref(true);
const error = ref('');
const rows = ref([]);

const chatsLink = computed(() => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/admin/communications/chats`;
  return '/admin/communications/chats';
});

const activeTab = computed(() => {
  const t = String(route.query?.tab || 'all');
  return t === 'texts' ? 'texts' : 'all';
});

const setTab = (tab) => {
  const slug = route.params.organizationSlug;
  const path = typeof slug === 'string' && slug ? `/${slug}/admin/communications` : '/admin/communications';
  router.replace({ path, query: { ...route.query, tab } });
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
};

const formatOwner = (m) => {
  const li = (m.user_last_name || '').slice(0, 1);
  return `${m.user_first_name || ''} ${li ? li + '.' : ''}`.trim() || '—';
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/communications/feed', { params: { limit: 75 } });
    rows.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    loading.value = false;
  }
};

const itemKey = (i) => {
  if (i.kind === 'chat') return `chat-${i.thread_id}`;
  if (i.kind === 'ticket') return `ticket-${i.id}`;
  return `sms-${i.id}`;
};

const itemTime = (i) => (i.kind === 'chat' ? (i.last_message_at || i.updated_at) : i.created_at);

const formatRole = (r) => {
  const s = String(r || '').replace(/_/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '—';
};

const chatLabel = (i) => {
  const other = i.other_participant;
  const who = other ? `${other.first_name || ''} ${other.last_name || ''}`.trim() : `Thread #${i.thread_id}`;
  const org = i.organization_name ? ` · ${i.organization_name}` : '';
  return `${who}${org}`;
};

const openItem = async (i) => {
  if (i.kind === 'ticket') {
    const q = {};
    if (i.school_organization_id) q.schoolOrganizationId = String(i.school_organization_id);
    q.status = 'open';
    if (i.id) q.ticketId = String(i.id);
    router.push({ path: '/admin/support-tickets', query: q });
    return;
  }
  if (i.kind === 'sms') {
    if (!i.user_id || !i.client_id) return;
    router.push(`/admin/communications/thread/${i.user_id}/${i.client_id}`);
    return;
  }
  // Chat: go to chats UI and auto-open the thread.
  const threadId = i.thread_id;
  if (!threadId) return;
  const slug = i.organization_slug || route.params.organizationSlug;
  if (typeof slug === 'string' && slug) {
    router.push({ path: `/${slug}/admin/communications/chats`, query: { threadId: String(threadId), agencyId: String(i.agency_id || '') } });
  } else {
    router.push({ path: '/admin/communications/chats', query: { threadId: String(threadId), agencyId: String(i.agency_id || '') } });
  }
};

const filteredRows = computed(() => {
  if (activeTab.value === 'texts') {
    return rows.value.filter((r) => r.kind === 'sms');
  }
  return rows.value;
});

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  await load();
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
.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.tabs {
  display: inline-flex;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px;
}
.tab {
  border: none;
  background: transparent;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  color: var(--text-secondary);
}
.tab.active {
  background: var(--bg);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; }
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}
.top {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: var(--text-secondary);
  font-size: 12px;
}
.badge {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 600;
}
.badge.in { background: rgba(253,176,34,0.15); }
.badge.out { background: rgba(23,178,106,0.15); }
.badge.ticket { background: rgba(108,117,125,0.12); }
.body {
  margin-top: 6px;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.right {
  min-width: 220px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
}
.time { font-weight: 600; color: var(--text-primary); }
.numbers { margin-top: 6px; }
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

