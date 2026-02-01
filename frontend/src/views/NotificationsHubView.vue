<template>
  <div class="container">
    <div class="header" data-tour="notifhub-header">
      <h1 data-tour="notifhub-title">Notifications</h1>
      <p class="sub">Personal + agency notifications in one place.</p>
    </div>

    <div class="card-grid" data-tour="notifhub-grid">
      <div class="card" data-tour="notifhub-card-mine">
        <div class="card-top">
          <h2>My Notifications</h2>
          <span class="pill">{{ myUnreadCount }} unread</span>
        </div>
        <p class="hint">These are notifications where you are the target user (including SMS-eligible events).</p>

        <div v-if="loadingMy" class="loading">Loading…</div>
        <div v-else-if="myNotifications.length === 0" class="empty">No notifications.</div>
        <div v-else class="list">
          <div v-for="n in myNotifications" :key="n.id" class="item">
            <div class="item-head">
              <span :class="['sev', `sev-${n.severity || 'info'}`]">{{ n.severity || 'info' }}</span>
              <div class="title">{{ n.title }}</div>
            </div>
            <div class="msg">{{ n.message }}</div>
            <div class="meta">
              <span>{{ formatDate(n.created_at) }}</span>
              <button class="link" @click="markRead(n)" :disabled="n.is_read">Mark read</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showAgencyCards" class="card" data-tour="notifhub-card-agency">
        <div class="card-top">
          <h2>Agency Notifications</h2>
          <span class="pill">{{ agencies.length }} agencies</span>
        </div>
        <p class="hint">Admins/support: pick an agency to manage the full feed.</p>

        <div v-if="loadingCounts" class="loading">Loading…</div>
        <div v-else class="agency-cards">
          <router-link
            v-for="a in agencies"
            :key="a.id"
            class="agency-card"
            :to="adminNotificationsLink(a.id)"
          >
            <div class="agency-name">{{ a.name }}</div>
            <div class="agency-meta">
              <span class="pill">{{ (counts[a.id] ?? 0) }} unread</span>
              <span class="small">View</span>
            </div>
          </router-link>
        </div>
      </div>

      <div v-if="showTeamCard" class="card" data-tour="notifhub-card-team">
        <div class="card-top">
          <h2>Team Notifications</h2>
          <span class="pill">Supervisor/CPA</span>
        </div>
        <p class="hint">View supervisee / agency-wide operational items.</p>
        <router-link class="btn" :to="teamNotificationsLink">Open</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import api from '../services/api';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

const loadingMy = ref(false);
const myNotifications = ref([]);
const counts = ref({});
const loadingCounts = ref(false);

const userId = computed(() => authStore.user?.id);
const role = computed(() => authStore.user?.role);
const agencies = computed(() => agencyStore.userAgencies || []);

const isAdminLike = computed(() => role.value === 'admin' || role.value === 'super_admin' || role.value === 'support');
const isTeamRole = computed(() => role.value === 'supervisor' || role.value === 'clinical_practice_assistant');

const showAgencyCards = computed(() => isAdminLike.value);
const showTeamCard = computed(() => isTeamRole.value);

const orgSlug = computed(() => {
  const s = route.params.organizationSlug;
  return typeof s === 'string' && s ? s : null;
});

const adminNotificationsLink = (agencyId) => {
  return orgSlug.value
    ? { path: `/${orgSlug.value}/admin/notifications`, query: { agencyId } }
    : { path: '/admin/notifications', query: { agencyId } };
};

const teamNotificationsLink = computed(() => {
  return orgSlug.value ? `/${orgSlug.value}/notifications/team` : '/notifications/team';
});

const loadMy = async () => {
  try {
    loadingMy.value = true;
    const resp = await api.get('/notifications');
    const all = resp.data || [];
    myNotifications.value = all.filter((n) => n.user_id === userId.value).slice(0, 12);
  } finally {
    loadingMy.value = false;
  }
};

const loadCounts = async () => {
  try {
    loadingCounts.value = true;
    const resp = await api.get('/notifications/counts');
    counts.value = resp.data || {};
  } finally {
    loadingCounts.value = false;
  }
};

const markRead = async (n) => {
  try {
    await api.put(`/notifications/${n.id}/read`);
    n.is_read = true;
  } catch {
    // ignore
  }
};

const myUnreadCount = computed(() => myNotifications.value.filter((n) => !n.is_read && !n.is_resolved).length);

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

onMounted(async () => {
  if (!agencyStore.userAgencies || agencyStore.userAgencies.length === 0) {
    await agencyStore.fetchUserAgencies().catch(() => {});
  }
  await Promise.all([loadMy(), loadCounts()]);
});
</script>

<style scoped>
.header { margin-bottom: 16px; }
.sub { color: var(--text-secondary); margin: 6px 0 0 0; }
.card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.pill {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.hint { color: var(--text-secondary); font-size: 13px; margin: 8px 0 12px 0; }
.loading, .empty { color: var(--text-secondary); }
.list { display: flex; flex-direction: column; gap: 10px; }
.item { border-top: 1px solid var(--border); padding-top: 10px; }
.item:first-child { border-top: none; padding-top: 0; }
.item-head { display: flex; gap: 10px; align-items: center; }
.sev { font-size: 12px; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--border); }
.sev-urgent { border-color: #f5a9a9; color: #a33; }
.sev-warning { border-color: #f0d08a; color: #8a5a00; }
.sev-info { border-color: var(--border); }
.title { font-weight: 600; color: var(--text-primary); }
.msg { color: var(--text-secondary); margin: 4px 0; }
.meta { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--text-secondary); }
.link { background: none; border: none; color: var(--primary); cursor: pointer; padding: 0; }
.link:disabled { color: var(--text-secondary); cursor: default; }
.agency-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.agency-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  text-decoration: none;
  color: inherit;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.agency-card:hover { border-color: var(--primary); }
.agency-name { font-weight: 600; }
.agency-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.small { font-size: 12px; color: var(--text-secondary); }
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  text-decoration: none;
  color: var(--text-primary);
  width: fit-content;
}
</style>

