<template>
  <main class="notification-page">
    <header class="page-header">
      <div>
        <h1>Notifications</h1>
        <p>Stay up to date with important alerts, messages, and system updates.</p>
      </div>
      <div class="header-actions">
        <button class="action-btn" type="button" @click="toggleClientLabelMode">
          {{ clientLabelMode === 'codes' ? 'Show initials' : 'Show codes' }}
        </button>
        <button class="action-btn" type="button" :disabled="!matchingUnreadCount || bulkSaving" @click="markMatchingRead">
          ✓ Mark all read
        </button>
        <button class="action-btn primary" type="button" @click="openSettings()">
          ☷ Filter &amp; Settings
        </button>
        <router-link v-if="isAdminLike" class="unread-card" :to="ticketsLink">
          <small>Unread</small><strong>{{ feed.unreadCount.toLocaleString() }}</strong>
        </router-link>
      </div>
    </header>

    <nav class="scope-tabs" aria-label="Notification scope">
      <button :class="{ active: scope === 'inbox' }" type="button" @click="setFilter('scope', 'inbox')">My Inbox</button>
      <button v-if="feed.scopes.team" :class="{ active: scope === 'team' }" type="button" @click="setFilter('scope', 'team')">Team</button>
      <button v-if="feed.scopes.managed" :class="{ active: scope === 'managed' }" type="button" @click="setFilter('scope', 'managed')">Managed Agency</button>
      <select v-if="feed.scopes.managed && agencies.length" v-model="agencyId" aria-label="Filter by agency" @change="setFilter('agencyId', agencyId || null)">
        <option value="">All agencies</option>
        <option v-for="agency in agencies" :key="agency.id" :value="String(agency.id)">{{ agency.name }}</option>
      </select>
    </nav>

    <div class="type-strip" aria-label="Popular notification types">
      <button :class="{ active: !type }" type="button" @click="setFilter('type', null)">
        {{ topAllLabel }} ({{ activeCount.toLocaleString() }})
      </button>
      <button v-for="item in topTypes" :key="item.type" :class="{ active: type === item.type }" type="button" @click="setFilter('type', item.type)">
        {{ item.label }} ({{ item.count }})
      </button>
      <select v-if="moreTypes.length" :value="moreTypeValue" aria-label="More notification types" @change="setFilter('type', $event.target.value || null)">
        <option value="">More…</option>
        <option v-for="item in moreTypes" :key="item.type" :value="item.type">{{ item.label }} ({{ item.count }})</option>
      </select>
    </div>

    <button class="mobile-filter-btn" type="button" @click="mobileFiltersOpen = !mobileFiltersOpen">
      {{ mobileFiltersOpen ? 'Hide filters' : 'Show filters' }}
    </button>

    <div class="inbox-layout">
      <aside :class="['filter-sidebar', { mobileOpen: mobileFiltersOpen }]">
        <div class="sidebar-section">
          <h2>Filter by category</h2>
          <input v-model="searchDraft" class="search-input" type="search" placeholder="Search notifications…" aria-label="Search notifications" />
          <button :class="{ active: !category }" type="button" @click="setFilter('category', null)">
            <span>All categories</span><strong>{{ allCategoryCount }}</strong>
          </button>
          <button v-for="item in feed.facets.categories" :key="item.key" :class="{ active: category === item.key }" type="button" @click="setFilter('category', item.key)">
            <span><i :style="{ color: item.color }">{{ item.icon }}</i>{{ item.label }}</span><strong>{{ item.count }}</strong>
          </button>
        </div>

        <div class="sidebar-section quick-filters">
          <h2>Quick filters</h2>
          <button v-for="item in statusOptions" :key="item.key" :class="{ active: status === item.key }" type="button" @click="setFilter('status', item.key)">
            <span>{{ item.icon }} {{ item.label }}</span><strong>{{ feed.facets.statuses[item.key] || 0 }}</strong>
          </button>
        </div>

        <details v-if="canPurge" class="admin-tools">
          <summary>Admin tools</summary>
          <p>Permanently purge notification records for the selected scope.</p>
          <button class="danger-link" type="button" :disabled="purging" @click="purgeNotifications">
            {{ purging ? 'Purging…' : agencyId ? 'Purge selected agency' : 'Purge all notifications' }}
          </button>
        </details>
      </aside>

      <section class="inbox-panel" aria-live="polite">
        <div class="inbox-toolbar">
          <span>{{ rangeLabel }}</span>
          <div>
            <label>Sort by:
              <select v-model="sort" @change="setFilter('sort', sort)">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="priority">Priority</option>
              </select>
            </label>
            <button class="density-btn" type="button" :title="compact ? 'Use comfortable rows' : 'Use compact rows'" @click="compact = !compact">
              {{ compact ? '☰' : '≡' }}
            </button>
          </div>
        </div>

        <div v-if="error" class="error-state">{{ error }} <button type="button" @click="loadFeed">Try again</button></div>
        <div v-else-if="hasLoaded && !feed.items.length" class="empty-state">
          <span>✓</span><strong>No matching notifications</strong><p>Try a different filter or check your notification type settings.</p>
        </div>
        <div v-else :class="['notification-list', { compact }]">
          <article
            v-for="notification in feed.items"
            :key="notification.id"
            :class="['notification-row', { unread: isUnread(notification), urgent: notification.severity === 'urgent' }]"
          >
            <div class="notification-icon" :style="iconStyle(notification)">{{ notification.catalog?.icon || '🔔' }}</div>
            <div class="notification-main">
              <div class="notification-title-line">
                <span class="severity-pill">{{ notification.severity || 'info' }}</span>
                <span v-if="isUnread(notification)" class="unread-pill">Unread</span>
                <button class="notification-title" type="button" @click="openNotification(notification)">{{ notification.title }}</button>
                <span v-if="notification._requires_follow_up_for_viewer" class="follow-pill">Needs follow-up</span>
              </div>
              <p>{{ formatNotificationLine(notification) }}</p>
              <div class="notification-meta">
                <small v-if="notification.actor_display_name">By: {{ notification.actor_display_name }}</small>
                <small v-if="scope === 'managed' && Number(notification.recipient_count) > 1">
                  Sent to {{ Number(notification.recipient_count).toLocaleString() }} recipients
                </small>
              </div>
            </div>
            <div class="notification-side">
              <time>{{ formatDate(notification.created_at) }}</time>
              <div class="row-actions">
                <button v-if="primaryLabel(notification)" class="row-btn primary-action" type="button" @click="openNotification(notification)">{{ primaryLabel(notification) }}</button>
                <button class="row-btn" type="button" @click="toggleRead(notification)">{{ isUnread(notification) ? '✓ Mark read' : 'Mark unread' }}</button>
                <button class="row-btn follow" type="button" @click="toggleFollowUp(notification)">⚑ {{ notification._requires_follow_up_for_viewer ? 'Clear' : 'Follow-up' }}</button>
                <div class="overflow-wrap">
                  <button class="row-btn overflow" type="button" aria-label="More notification actions" @click="overflowId = overflowId === notification.id ? null : notification.id">…</button>
                  <div v-if="overflowId === notification.id" class="overflow-menu">
                    <button type="button" @click="snooze(notification, 1)">Snooze 1 hour</button>
                    <button type="button" @click="snooze(notification, 24)">Snooze until tomorrow</button>
                    <button v-if="!notification.dismissed_at" type="button" @click="dismiss(notification)">
                      {{ notification._requires_follow_up_for_viewer ? 'Clear follow-up & dismiss' : 'Dismiss' }}
                    </button>
                    <button v-else type="button" @click="restore(notification)">Restore</button>
                    <button type="button" @click="markTypeRead(notification.type)">Mark all {{ notification.catalog?.label || 'of this type' }} read</button>
                    <button v-if="!notification.catalog?.required" type="button" @click="muteType(notification)">Mute this type</button>
                    <button type="button" @click="openSettings(notification.type)">Manage this notification type</button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <footer v-if="feed.pagination.totalPages > 1" class="pagination">
          <button type="button" :disabled="page <= 1" @click="setFilter('page', page - 1)">← Previous</button>
          <span>Page {{ page }} of {{ feed.pagination.totalPages }}</span>
          <button type="button" :disabled="page >= feed.pagination.totalPages" @click="setFilter('page', page + 1)">Next →</button>
        </footer>
      </section>
    </div>

    <div v-if="undoNotice" class="undo-toast" role="status">
      <span>{{ undoNotice.message }}</span><button type="button" @click="undoMute">Undo</button>
    </div>

    <NotificationTypeSettingsDrawer
      :open="settingsOpen"
      :type="settingsType"
      :agency-id="agencyId || null"
      @close="settingsOpen = false"
      @changed="handleSettingsChanged"
    />

    <Teleport to="body">
      <div v-if="digestModal.open" class="modal-backdrop" @click.self="digestModal.open = false">
        <section class="digest-modal" role="dialog" aria-modal="true" aria-label="User activity digest details">
          <header><strong>User activity digest</strong><button type="button" @click="digestModal.open = false">×</button></header>
          <div v-if="digestModal.loading" class="empty-state">Loading activity…</div>
          <div v-else class="digest-events">
            <article v-for="event in digestModal.items" :key="event.id">
              <strong>{{ event.title }}</strong><span>{{ event.message }}</span><time>{{ formatDate(event.created_at) }}</time>
            </article>
          </div>
        </section>
      </div>
    </Teleport>

    <OfficeRequestAssignModal
      :visible="officeRequestModal.visible"
      :request-id="officeRequestModal.requestId"
      :agency-id="officeRequestModal.agencyId"
      @close="officeRequestModal.visible = false"
      @assigned="handleOfficeRequestResolved"
      @denied="handleOfficeRequestResolved"
    />
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useNotificationStore } from '../store/notifications';
import api from '../services/api';
import OfficeRequestAssignModal from '../components/admin/OfficeRequestAssignModal.vue';
import NotificationTypeSettingsDrawer from '../components/notifications/NotificationTypeSettingsDrawer.vue';
import { notificationDestination, notificationDismissPayload } from '../utils/notificationActions';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const notificationStore = useNotificationStore();

const loading = ref(false);
const hasLoaded = ref(false);
const error = ref('');
const mobileFiltersOpen = ref(false);
const compact = ref(true);
const overflowId = ref(null);
const bulkSaving = ref(false);
const purging = ref(false);
const settingsOpen = ref(false);
const settingsType = ref(null);
const clientLabelMode = ref('initials');
const searchDraft = ref(String(route.query.search || ''));
const undoNotice = ref(null);
let undoTimer = null;
let searchTimer = null;
let feedRequestId = 0;
const officeRequestModal = ref({ visible: false, requestId: null, agencyId: null });
const digestModal = reactive({ open: false, loading: false, items: [] });

const feed = reactive({
  items: [], unreadCount: 0,
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  facets: { statuses: {}, categories: [], types: [], matchingTotal: 0, categoryTotal: 0 },
  scopes: { inbox: true, team: false, managed: false }
});

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const isAdminLike = computed(() => ['super_admin', 'admin', 'support'].includes(role.value));
const canPurge = computed(() => role.value === 'super_admin' || (['admin', 'support'].includes(role.value) && !!agencyId.value));
const orgSlug = computed(() => String(route.params.organizationSlug || ''));
const ticketsLink = computed(() => `${orgSlug.value ? `/${orgSlug.value}` : ''}/tickets`);
const agencies = computed(() => role.value === 'super_admin' ? agencyStore.agencies || [] : agencyStore.userAgencies || []);

const scope = ref(String(route.query.scope || 'inbox'));
const status = ref(String(route.query.status || 'unread'));
const type = ref(String(route.query.type || ''));
const category = ref(String(route.query.category || ''));
const page = ref(Math.max(1, Number(route.query.page || 1)));
const agencyId = ref(String(route.query.agencyId || ''));
const sort = ref(String(route.query.sort || 'newest'));

const statusOptions = [
  { key: 'unread', label: 'Unread', icon: '🟢' },
  { key: 'read', label: 'Read', icon: '●' },
  { key: 'follow_up', label: 'Needs follow-up', icon: '⚑' },
  { key: 'high_priority', label: 'High priority', icon: '⚠' },
  { key: 'snoozed', label: 'Snoozed', icon: '⏰' },
  { key: 'dismissed', label: 'Dismissed', icon: '🗃' }
];

const activeCount = computed(() => Number(feed.facets.matchingTotal ?? feed.pagination.total ?? 0));
const allCategoryCount = computed(() => Number(feed.facets.categoryTotal ?? feed.facets.matchingTotal ?? 0));
const activeCategory = computed(() => (feed.facets.categories || []).find((item) => item.key === category.value) || null);
const topAllLabel = computed(() => activeCategory.value ? `All ${activeCategory.value.label}` : 'All');
const matchingUnreadCount = computed(() => Number(feed.unreadCount || 0));
const topTypes = computed(() => (feed.facets.types || []).filter((item) => item.count > 0).slice(0, 7));
const moreTypes = computed(() => (feed.facets.types || []).filter((item) => item.count > 0).slice(7));
const moreTypeValue = computed(() => moreTypes.value.some((item) => item.type === type.value) ? type.value : '');
const rangeLabel = computed(() => {
  const total = feed.pagination.total || 0;
  if (!total) return 'Showing 0 notifications';
  const start = (feed.pagination.page - 1) * feed.pagination.pageSize + 1;
  const end = Math.min(total, start + feed.pagination.pageSize - 1);
  return `Showing ${start}–${end} of ${total.toLocaleString()} notifications`;
});

const syncFilterState = (query = {}) => {
  scope.value = String(query.scope || 'inbox');
  status.value = String(query.status || 'unread');
  type.value = String(query.type || '');
  category.value = String(query.category || '');
  page.value = Math.max(1, Number(query.page || 1));
  agencyId.value = String(query.agencyId || '');
  sort.value = String(query.sort || 'newest');
  const nextSearch = String(query.search || '');
  if (searchDraft.value !== nextSearch) searchDraft.value = nextSearch;
};

const browserQuery = () => Object.fromEntries(new URLSearchParams(window.location.search).entries());

const setFilter = (key, value) => {
  const query = browserQuery();
  if (value === null || value === undefined || value === '' || (key === 'page' && Number(value) === 1)) delete query[key];
  else query[key] = String(value);
  if (key === 'category') delete query.type;
  if (key !== 'page') delete query.page;
  syncFilterState(query);

  // Query-only vue-router navigation can make the app-level branding provider
  // patch a disposed vnode. Keep the URL shareable without remounting the route.
  const search = new URLSearchParams(query).toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', nextUrl);
  mobileFiltersOpen.value = false;
  void loadFeed();
};

const loadFeed = async () => {
  const requestId = ++feedRequestId;
  loading.value = true;
  error.value = '';
  try {
    const params = {
      scope: scope.value,
      status: status.value,
      page: page.value,
      pageSize: 25,
      sort: sort.value,
      ...(type.value ? { type: type.value } : {}),
      ...(category.value ? { category: category.value } : {}),
      ...(agencyId.value ? { agencyId: agencyId.value } : {}),
      ...(searchDraft.value.trim() ? { search: searchDraft.value.trim() } : {})
    };
    const { data } = await api.get('/notifications/feed', { params, skipGlobalLoading: true });
    if (requestId === feedRequestId) Object.assign(feed, data || {});
  } catch (e) {
    if (requestId === feedRequestId) error.value = e.response?.data?.error?.message || 'Could not load notifications.';
  } finally {
    if (requestId === feedRequestId) {
      loading.value = false;
      hasLoaded.value = true;
    }
  }
};

watch(() => route.fullPath, () => {
  syncFilterState(route.query);
  void loadFeed();
});

watch(searchDraft, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setFilter('search', value || null), 350);
});

const isUnread = (notification) => !notification.is_read && !notification.dismissed_at;
const iconStyle = (notification) => ({ backgroundColor: `${notification.catalog?.color || '#059669'}18`, color: notification.catalog?.color || '#059669' });
const formatDate = (value) => value ? new Date(value).toLocaleString() : '';
const formatClientLabel = (notification) => {
  const initials = String(notification.client_initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(notification.client_identifier_code || '').replace(/\s+/g, '').toUpperCase();
  return clientLabelMode.value === 'codes' ? (code || initials) : (initials || code);
};
const formatNotificationLine = (notification) => [
  formatClientLabel(notification),
  notification.organization_name || notification.agency_name,
  notification.message
].filter(Boolean).join(' • ');

const primaryLabel = (notification) => {
  if (notification.type === 'user_activity_digest') return 'View activity';
  if (notification.type === 'new_packet_uploaded') return 'Open packet';
  if (notification.type === 'company_event_registration_submitted') return 'Event portal';
  if (notification.type === 'support_ticket_created') return 'Open ticket';
  if (notificationDestination(notification, { organizationSlug: orgSlug.value, role: role.value })) return 'Open';
  return null;
};

const updateState = async (notification, payload) => {
  const snapshot = {
    is_read: notification.is_read,
    _requires_follow_up_for_viewer: notification._requires_follow_up_for_viewer,
    dismissed_at: notification.dismissed_at,
    snoozed_until: notification.snoozed_until
  };
  if (payload.read !== undefined) notification.is_read = !!payload.read;
  if (payload.followUp !== undefined) {
    notification._requires_follow_up_for_viewer = !!payload.followUp;
    if (payload.followUp) notification.is_read = false;
  }
  if (payload.dismissed === true) { notification.dismissed_at = new Date().toISOString(); notification.is_read = true; }
  if (payload.dismissed === false) notification.dismissed_at = null;
  if (payload.snoozedUntil !== undefined) notification.snoozed_until = payload.snoozedUntil;
  try {
    const { data } = await api.patch(`/notifications/${notification.id}/state`, payload);
    Object.assign(notification, data || {});
    await Promise.all([loadFeed(), notificationStore.fetchCounts().catch(() => {})]);
  } catch (e) {
    Object.assign(notification, snapshot);
    error.value = e.response?.data?.error?.message || 'Could not update this notification.';
    throw e;
  }
};
const toggleRead = (notification) => updateState(notification, { read: isUnread(notification) });
const toggleFollowUp = (notification) => updateState(notification, { followUp: !notification._requires_follow_up_for_viewer });
const dismiss = (notification) => updateState(notification, notificationDismissPayload(notification));
const restore = (notification) => updateState(notification, { dismissed: false });
const snooze = (notification, hours) => updateState(notification, { snoozedUntil: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() });

const currentFilters = (overrides = {}) => ({
  scope: scope.value, status: status.value, sort: sort.value,
  ...(type.value ? { type: type.value } : {}), ...(category.value ? { category: category.value } : {}),
  ...(agencyId.value ? { agencyId: agencyId.value } : {}),
  ...(searchDraft.value.trim() ? { search: searchDraft.value.trim() } : {}),
  ...overrides
});
const bulkAction = async (action, filters = currentFilters()) => {
  bulkSaving.value = true;
  try {
    await api.post('/notifications/bulk-actions', { action, filters });
    await Promise.all([loadFeed(), notificationStore.fetchCounts().catch(() => {})]);
  } finally { bulkSaving.value = false; }
};
const markMatchingRead = async () => {
  if (matchingUnreadCount.value > 100 && !window.confirm(`Mark ${matchingUnreadCount.value.toLocaleString()} matching notifications as read?`)) return;
  await bulkAction('mark_read', currentFilters({ status: 'unread' }));
};
const markTypeRead = async (notificationType) => {
  overflowId.value = null;
  await bulkAction('mark_read', currentFilters({ type: notificationType, status: 'unread' }));
};

const muteType = async (notification) => {
  overflowId.value = null;
  await api.patch(`/notifications/preferences/types/${encodeURIComponent(notification.type)}`, { inApp: false });
  undoNotice.value = { type: notification.type, message: `${notification.catalog?.label || notification.type} notifications muted.` };
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { undoNotice.value = null; }, 10000);
  await loadFeed();
  void notificationStore.fetchCounts();
};
const undoMute = async () => {
  if (!undoNotice.value) return;
  const notificationType = undoNotice.value.type;
  undoNotice.value = null;
  await api.patch(`/notifications/preferences/types/${encodeURIComponent(notificationType)}`, { inApp: true });
  await loadFeed();
  void notificationStore.fetchCounts();
};

const openSettings = (notificationType = null) => { settingsType.value = notificationType; settingsOpen.value = true; overflowId.value = null; };
const handleSettingsChanged = () => { void loadFeed(); void notificationStore.fetchCounts(); };

const openNotification = async (notification) => {
  if (notification.type === 'user_activity_digest') {
    digestModal.open = true; digestModal.loading = true; digestModal.items = [];
    try {
      const { data } = await api.get(`/notifications/digests/${notification.related_entity_id}/events`);
      digestModal.items = data.items || [];
    } finally { digestModal.loading = false; }
    if (isUnread(notification)) await updateState(notification, { read: true });
    return;
  }
  if (notification.type === 'office_availability_request_pending' && notification.related_entity_id) {
    officeRequestModal.value = { visible: true, requestId: Number(notification.related_entity_id), agencyId: Number(notification.agency_id) };
    return;
  }
  const destination = notificationDestination(notification, { organizationSlug: orgSlug.value, role: role.value });
  if (destination) {
    if (isUnread(notification)) await api.patch(`/notifications/${notification.id}/state`, { read: true }).catch(() => {});
    router.push(destination);
  }
};

const handleOfficeRequestResolved = () => { officeRequestModal.value.visible = false; void loadFeed(); void notificationStore.fetchCounts(); };
const toggleClientLabelMode = () => {
  clientLabelMode.value = clientLabelMode.value === 'codes' ? 'initials' : 'codes';
  window.localStorage.setItem('notificationsClientLabelMode', clientLabelMode.value);
};

const purgeNotifications = async () => {
  const scopeLabel = agencyId.value ? 'the selected agency' : 'all agencies';
  if (!window.confirm(`Permanently purge notifications for ${scopeLabel}? This cannot be undone.`)) return;
  if (window.prompt('Type PURGE to confirm') !== 'PURGE') return;
  purging.value = true;
  try {
    await api.delete('/notifications/purge', { params: { ...(agencyId.value ? { agencyId: agencyId.value } : {}), includeSmsLogs: true } });
    await loadFeed();
  } finally { purging.value = false; }
};

onMounted(async () => {
  const saved = window.localStorage.getItem('notificationsClientLabelMode');
  if (saved === 'codes' || saved === 'initials') clientLabelMode.value = saved;
  if (role.value === 'super_admin') await agencyStore.fetchAgencies().catch(() => {});
  else await agencyStore.fetchUserAgencies().catch(() => {});
  await loadFeed();
});
onBeforeUnmount(() => { if (undoTimer) clearTimeout(undoTimer); if (searchTimer) clearTimeout(searchTimer); });
</script>

<style scoped>
.notification-page { padding:24px; max-width:1600px; margin:0 auto; color:var(--text-primary); }
.page-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; }
.page-header h1 { margin:0; font-size:30px; }
.page-header p { margin:5px 0 0; color:var(--text-secondary); }
.header-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:9px; align-items:stretch; }
.action-btn,.unread-card { border:1px solid var(--border); background:white; color:var(--text-primary); border-radius:9px; padding:10px 14px; font-weight:700; text-decoration:none; cursor:pointer; }
.action-btn.primary { background:var(--primary); color:white; border-color:var(--primary); }
.action-btn:disabled { opacity:.5; cursor:not-allowed; }
.unread-card { min-width:78px; background:#065f46; color:white; display:flex; flex-direction:column; padding:7px 13px; }
.unread-card small { opacity:.8; }.unread-card strong { font-size:21px; }
.scope-tabs { display:flex; align-items:end; gap:22px; margin-top:28px; border-bottom:1px solid var(--border); }
.scope-tabs button { border:0; border-bottom:3px solid transparent; background:none; padding:12px 4px; font-weight:700; cursor:pointer; }
.scope-tabs button.active { border-color:var(--primary); color:var(--primary); }
.scope-tabs select { margin-left:auto; margin-bottom:8px; border:1px solid var(--border); border-radius:8px; padding:8px; }
.type-strip { display:flex; gap:8px; overflow-x:auto; padding:18px 0; }
.type-strip button,.type-strip select { white-space:nowrap; border:1px solid var(--border); background:white; border-radius:9px; padding:9px 14px; font-weight:700; cursor:pointer; }
.type-strip button.active { background:#065f46; color:white; border-color:#065f46; }
.inbox-layout { display:grid; grid-template-columns:280px minmax(0,1fr); gap:18px; }
.filter-sidebar { border:1px solid var(--border); border-radius:12px; background:linear-gradient(180deg,#f8fffb,#fff); padding:16px; align-self:start; position:sticky; top:12px; }
.sidebar-section { display:flex; flex-direction:column; gap:5px; }
.sidebar-section+ .sidebar-section { border-top:1px solid var(--border); padding-top:16px; margin-top:16px; }
.sidebar-section h2 { font-size:14px; margin:0 0 8px; }
.search-input { border:1px solid var(--border); border-radius:9px; padding:10px; margin-bottom:8px; width:100%; box-sizing:border-box; }
.sidebar-section button { border:0; background:transparent; border-radius:8px; padding:8px; display:flex; justify-content:space-between; text-align:left; cursor:pointer; color:inherit; }
.sidebar-section button span { display:flex; gap:8px; align-items:center; }.sidebar-section button i { font-style:normal; }
.sidebar-section button.active { background:#ecfdf5; color:#065f46; font-weight:700; }.sidebar-section button strong { font-size:11px; background:white; border:1px solid var(--border); border-radius:999px; padding:2px 7px; }
.admin-tools { border-top:1px solid var(--border); margin-top:16px; padding-top:14px; font-size:12px; }.admin-tools p { color:var(--text-secondary); }.danger-link { color:#b91c1c!important; }
.inbox-panel { border:1px solid var(--border); border-radius:12px; background:#fbfdfc; min-width:0; }
.inbox-toolbar { padding:14px 16px; display:flex; justify-content:space-between; align-items:center; color:var(--text-secondary); font-size:13px; }
.inbox-toolbar>div { display:flex; gap:8px; align-items:center; }.inbox-toolbar select { border:1px solid var(--border); border-radius:8px; padding:7px; margin-left:5px; }.density-btn { border:1px solid var(--border); background:white; border-radius:8px; padding:7px 10px; }
.notification-list { display:flex; flex-direction:column; gap:7px; padding:0 14px 14px; }
.notification-row { display:grid; grid-template-columns:48px minmax(0,1fr) auto; gap:12px; align-items:center; background:white; border:1px solid var(--border); border-left:3px solid transparent; border-radius:11px; padding:14px; box-shadow:0 1px 3px rgba(15,23,42,.04); }
.notification-row.unread { border-left-color:#16a34a; }.notification-row.urgent { border-left-color:#dc2626; }.notification-list.compact .notification-row { padding:10px 12px; }.notification-list.compact .notification-main p { margin:5px 0; }
.notification-icon { width:42px; height:42px; border-radius:999px; display:grid; place-items:center; font-size:18px; }
.notification-title-line { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }.notification-title { border:0; background:none; color:inherit; font-weight:800; cursor:pointer; padding:0; text-align:left; }.notification-title:hover { color:var(--primary); }
.severity-pill,.unread-pill,.follow-pill { font-size:9px; text-transform:uppercase; border:1px solid var(--border); border-radius:999px; padding:3px 7px; font-weight:800; }.unread-pill { color:#1d4ed8; border-color:#bfdbfe; background:#eff6ff; }.follow-pill { color:#a16207; border-color:#fde68a; background:#fffbeb; }
.notification-main p { color:var(--text-secondary); font-size:12px; margin:7px 0; overflow-wrap:anywhere; }.notification-main small { color:#059669; }
.notification-meta { display:flex; flex-wrap:wrap; gap:6px 14px; }
.notification-side { display:flex; flex-direction:column; align-items:flex-end; gap:9px; }.notification-side time { color:var(--text-secondary); font-size:11px; }.row-actions { display:flex; gap:6px; align-items:center; }.row-btn { border:1px solid var(--border); background:white; border-radius:7px; padding:7px 9px; font-size:11px; font-weight:700; cursor:pointer; }.row-btn.primary-action { color:#047857; border-color:#86efac; }.row-btn.follow { color:#b45309; border-color:#fbbf24; }.overflow-wrap { position:relative; }.overflow { font-size:17px; line-height:1; }
.overflow-menu { position:absolute; z-index:20; right:0; top:calc(100% + 5px); min-width:230px; background:white; border:1px solid var(--border); border-radius:9px; box-shadow:0 14px 30px rgba(15,23,42,.16); padding:5px; }.overflow-menu button { display:block; width:100%; text-align:left; border:0; background:none; padding:9px; border-radius:6px; cursor:pointer; }.overflow-menu button:hover { background:var(--bg-alt); }
.empty-state,.error-state { min-height:240px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-secondary); gap:7px; }.empty-state>span { font-size:30px; color:#16a34a; }.error-state { color:#b91c1c; }
.pagination { display:flex; justify-content:center; align-items:center; gap:14px; padding:14px; border-top:1px solid var(--border); }.pagination button { border:1px solid var(--border); background:white; border-radius:8px; padding:8px 12px; }.pagination button:disabled { opacity:.45; }
.mobile-filter-btn { display:none; }.undo-toast { position:fixed; z-index:2500; left:50%; bottom:24px; transform:translateX(-50%); background:#102a25; color:white; border-radius:10px; padding:12px 16px; box-shadow:0 12px 30px rgba(0,0,0,.2); display:flex; gap:18px; }.undo-toast button { border:0; background:none; color:#6ee7b7; font-weight:800; cursor:pointer; }
.modal-backdrop { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.45); display:grid; place-items:center; }.digest-modal { width:min(700px,94vw); max-height:80vh; background:white; border-radius:14px; overflow:auto; }.digest-modal>header { display:flex; justify-content:space-between; padding:16px; border-bottom:1px solid var(--border); }.digest-modal>header button { border:0; background:none; font-size:24px; }.digest-events { padding:12px; }.digest-events article { display:grid; grid-template-columns:140px 1fr auto; gap:10px; padding:10px; border-bottom:1px solid var(--border); font-size:12px; }.digest-events span { color:var(--text-secondary); }
@media (max-width:1050px) { .page-header { flex-direction:column; }.header-actions { justify-content:flex-start; }.notification-row { grid-template-columns:44px 1fr; }.notification-side { grid-column:2; align-items:flex-start; }.row-actions { flex-wrap:wrap; } }
@media (max-width:760px) { .notification-page { padding:14px; }.inbox-layout { grid-template-columns:1fr; }.mobile-filter-btn { display:block; width:100%; border:1px solid var(--border); border-radius:9px; background:white; padding:9px; margin-bottom:8px; }.filter-sidebar { display:none; position:static; }.filter-sidebar.mobileOpen { display:block; }.scope-tabs { overflow-x:auto; }.scope-tabs select { max-width:160px; }.notification-row { grid-template-columns:36px 1fr; padding:10px; }.notification-icon { width:34px; height:34px; }.notification-side { grid-column:1/-1; }.inbox-toolbar { align-items:flex-start; gap:10px; }.inbox-toolbar>div { align-items:flex-end; }.digest-events article { grid-template-columns:1fr; } }
</style>
