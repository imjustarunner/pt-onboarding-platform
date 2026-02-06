<template>
  <div class="container comms-feed">
    <div class="header" data-tour="comms-header">
      <div>
        <h2 data-tour="comms-title">Notifications</h2>
        <p class="subtitle" data-tour="comms-subtitle">All communications + school notifications.</p>
      </div>
      <div class="header-actions" data-tour="comms-actions">
        <div class="tabs">
          <button class="tab" :class="{ active: activeTab === 'all' }" @click="setTab('all')">All</button>
          <button class="tab" :class="{ active: activeTab === 'texts' }" @click="setTab('texts')">Texting</button>
          <button class="tab" :class="{ active: activeTab === 'school' }" @click="setTab('school')">School notifications</button>
        </div>
        <router-link class="btn btn-secondary" :to="chatsLink" data-tour="comms-go-chats">Chats</router-link>
        <router-link class="btn btn-secondary" :to="ticketsLink">Tickets</router-link>
        <button class="btn btn-secondary" @click="refreshActive" :disabled="loading || schoolLoading">Refresh</button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else class="card" data-tour="comms-card">
      <div v-if="activeTab === 'school'">
        <div v-if="schoolError" class="error-box">{{ schoolError }}</div>
        <div v-else-if="schoolLoading" class="loading">Loading…</div>
        <div v-else-if="schoolRows.length === 0" class="empty">No school notifications yet.</div>
        <div v-else class="list" data-tour="comms-list">
          <button
            v-for="item in schoolRows"
            :key="itemKey(item)"
            class="row"
            data-tour="comms-row"
            @click="openSchoolItem(item)"
            :title="item.preview"
            :class="{ unread: item.is_unread }"
          >
            <div class="left">
              <div class="top">
                <span class="badge" :class="schoolBadgeClass(item)">{{ schoolBadgeLabel(item) }}</span>
                <span class="client">
                  {{ item.school_name || `School #${item.school_id || '—'}` }}
                </span>
                <span class="owner">
                  {{ item.title || 'Notification' }}
                </span>
              </div>
              <div class="body">{{ item.preview }}</div>
            </div>
            <div class="right">
              <div class="time">{{ formatTime(itemTime(item)) }}</div>
              <div v-if="item.is_unread" class="pill">NEW</div>
              <button class="btn btn-secondary btn-xs" type="button" @click.stop="markSchoolRead(item)">
                Mark read
              </button>
            </div>
          </button>
        </div>
      </div>
      <div v-else>
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useRouter, useRoute } from 'vue-router';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const router = useRouter();
const route = useRoute();

const loading = ref(true);
const error = ref('');
const rows = ref([]);
const schoolLoading = ref(false);
const schoolError = ref('');
const schoolRows = ref([]);

const chatsLink = computed(() => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/admin/communications/chats`;
  return '/admin/communications/chats';
});

const ticketsLink = computed(() => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/tickets`;
  return '/tickets';
});

const activeTab = computed(() => {
  const t = String(route.query?.tab || 'all');
  if (t === 'texts') return 'texts';
  if (t === 'school') return 'school';
  return 'all';
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

const normalizeProgress = (raw) => {
  if (raw && typeof raw === 'object' && raw.by_org) return raw;
  const legacy = raw && typeof raw === 'object' ? raw : {};
  return { by_org: legacy, by_org_kind: {}, by_org_client_kind: {} };
};

const loadSchoolNotifications = async () => {
  try {
    schoolLoading.value = true;
    schoolError.value = '';
    schoolRows.value = [];

    await agencyStore.fetchUserAgencies();
    const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
    const userAgencies = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
    const agencyId = current?.id || userAgencies?.[0]?.id;
    if (!agencyId) {
      schoolError.value = 'No agency found for this user.';
      return;
    }

    const prefResp = await api.get(`/users/${authStore.user?.id}/preferences`);
    const progress = normalizeProgress(prefResp.data?.school_portal_notifications_progress || null);

    const overview = await api.get('/dashboard/school-overview', { params: { agencyId } });
    const schools = Array.isArray(overview.data?.schools) ? overview.data.schools : [];

    const feeds = await Promise.all(
      schools.map(async (s) => {
        const orgId = s.school_id;
        if (!orgId) return [];
        try {
          const resp = await api.get(`/school-portal/${orgId}/notifications/feed`);
          const list = Array.isArray(resp.data) ? resp.data : [];
          return list.map((it) => ({
            ...it,
            school_id: orgId,
            school_name: s.school_name,
            school_slug: s.school_slug,
            preview: String(it.message || '').trim()
          }));
        } catch {
          return [];
        }
      })
    );

    const toMs = (v) => {
      try {
        const t = v ? new Date(v).getTime() : 0;
        return Number.isFinite(t) ? t : 0;
      } catch {
        return 0;
      }
    };

    const withUnread = feeds.flat().map((it) => {
      const orgKey = String(it.school_id || '');
      const kind = String(it.kind || '').toLowerCase();
      const clientId = it.client_id ? String(it.client_id) : '';
      const byClient = progress?.by_org_client_kind?.[orgKey] || {};
      const byKind = progress?.by_org_kind?.[orgKey] || {};
      const orgSeen = progress?.by_org?.[orgKey] || null;
      const lastSeen = clientId ? (byClient?.[clientId]?.[kind] || byKind?.[kind] || orgSeen) : (byKind?.[kind] || orgSeen);
      const isUnread = toMs(it.created_at) > toMs(lastSeen);
      return { ...it, is_unread: isUnread };
    });

    schoolRows.value = withUnread
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 300);
  } catch (e) {
    schoolError.value = e.response?.data?.error?.message || 'Failed to load school notifications';
  } finally {
    schoolLoading.value = false;
  }
};

const itemKey = (i) => {
  if (i.kind === 'chat') return `chat-${i.thread_id}`;
  if (i.kind === 'ticket') return `ticket-${i.id}`;
  if (i.school_id) return `school-${i.school_id}-${i.kind}-${i.id}`;
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
    router.push({ path: '/tickets', query: q });
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

const openSchoolItem = async (i) => {
  const slug = i.school_slug;
  if (!slug) return;
  const query = { sp: 'notifications' };
  if (i.client_id) query.clientId = String(i.client_id);
  if (i.kind === 'comment') query.notif = 'comments';
  if (i.kind === 'message') query.notif = 'messages';
  router.push({ path: `/${slug}/dashboard`, query });
};

const markSchoolRead = async (i) => {
  if (!i.school_id) return;
  const kind = String(i.kind || '').toLowerCase();
  await api.post(`/school-portal/${i.school_id}/notifications/read`, {
    kind: kind || undefined,
    clientId: i.client_id || undefined
  });
  schoolRows.value = (schoolRows.value || []).map((row) => (
    row.school_id === i.school_id && String(row.id) === String(i.id) ? { ...row, is_unread: false } : row
  ));
};

const schoolBadgeLabel = (i) => {
  const kind = String(i.kind || '').toLowerCase();
  if (kind === 'ticket') return 'SCHOOL TICKET';
  if (kind === 'message') return 'SCHOOL MESSAGE';
  if (kind === 'comment') return 'SCHOOL COMMENT';
  if (kind === 'announcement') return 'ANNOUNCEMENT';
  if (kind === 'checklist') return 'CHECKLIST';
  if (kind === 'status') return 'STATUS';
  if (kind === 'assignment') return 'ASSIGNMENT';
  if (kind === 'client_created') return 'NEW CLIENT';
  if (kind === 'provider_slots') return 'SLOTS';
  if (kind === 'provider_day') return 'PROVIDER DAY';
  if (kind === 'doc') return 'DOC/LINK';
  return 'SCHOOL';
};

const schoolBadgeClass = (i) => {
  const kind = String(i.kind || '').toLowerCase();
  if (kind === 'ticket') return 'school-ticket';
  if (kind === 'message') return 'school-message';
  if (kind === 'comment') return 'school-comment';
  if (kind === 'announcement') return 'school-announcement';
  if (kind === 'checklist') return 'school-checklist';
  if (kind === 'status') return 'school-status';
  if (kind === 'assignment') return 'school-assignment';
  if (kind === 'client_created') return 'school-client';
  if (kind === 'provider_slots' || kind === 'provider_day') return 'school-provider';
  if (kind === 'doc') return 'school-doc';
  return 'school-default';
};

const refreshActive = async () => {
  if (activeTab.value === 'school') {
    await loadSchoolNotifications();
  } else {
    await load();
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
  if (activeTab.value === 'school') await loadSchoolNotifications();
});

watch(activeTab, async (tab) => {
  if (tab === 'school' && schoolRows.value.length === 0 && !schoolLoading.value) {
    await loadSchoolNotifications();
  }
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
.row.unread {
  border-color: rgba(14, 165, 233, 0.5);
  background: rgba(14, 165, 233, 0.08);
}
.badge.school-ticket {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.35);
  color: #1d4ed8;
}
.badge.school-message {
  background: rgba(155, 81, 224, 0.12);
  border-color: rgba(155, 81, 224, 0.35);
  color: #6a2aa3;
}
.badge.school-comment {
  background: rgba(45, 156, 219, 0.12);
  border-color: rgba(45, 156, 219, 0.35);
  color: #1b6fa0;
}
.badge.school-announcement {
  background: rgba(249, 115, 22, 0.12);
  border-color: rgba(249, 115, 22, 0.35);
  color: #9a3412;
}
.badge.school-checklist {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: #065f46;
}
.badge.school-status {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #92400e;
}
.badge.school-assignment {
  background: rgba(14, 116, 144, 0.12);
  border-color: rgba(14, 116, 144, 0.35);
  color: #0e7490;
}
.badge.school-client {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: #047857;
}
.badge.school-provider {
  background: rgba(79, 70, 229, 0.12);
  border-color: rgba(79, 70, 229, 0.35);
  color: #4338ca;
}
.badge.school-doc {
  background: rgba(100, 116, 139, 0.12);
  border-color: rgba(100, 116, 139, 0.35);
  color: #334155;
}
.badge.school-default {
  background: rgba(15, 23, 42, 0.08);
  border-color: rgba(15, 23, 42, 0.2);
  color: #334155;
}
.btn-xs {
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1;
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

