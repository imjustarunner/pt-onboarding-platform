<template>
  <main class="notification-page">
    <header class="page-header">
      <div>
        <h1>Notifications</h1>
        <p>Stay up to date with important alerts, messages, and system updates.</p>
      </div>
      <button class="unread-card" type="button" @click="setFilter('status', 'unread')">
        <small>Unread</small><strong>{{ feed.unreadCount.toLocaleString() }}</strong>
      </button>
    </header>

    <div class="management-toolbar">
      <nav class="scope-tabs" aria-label="Notification scope">
        <button :class="{ active: scope === 'inbox' }" type="button" @click="setFilter('scope', 'inbox')">My Inbox</button>
        <button v-if="feed.scopes.team" :class="{ active: scope === 'team' }" type="button" @click="setFilter('scope', 'team')">Team</button>
        <button v-if="feed.scopes.managed" :class="{ active: scope === 'managed' }" type="button" @click="setFilter('scope', 'managed')">Managed Agency</button>
      </nav>
      <fieldset class="filter-controls" :disabled="bulkSaving">
        <input v-model="searchDraft" type="search" placeholder="Search notifications" aria-label="Search notifications" />
        <select :value="category" aria-label="Category" @change="setFilter('category', $event.target.value)">
          <option value="">All categories</option>
          <option v-for="item in feed.facets.categories" :key="item.key" :value="item.key">{{ item.label }} ({{ item.count }})</option>
        </select>
        <select :value="type" aria-label="Notification type" @change="setFilter('type', $event.target.value)">
          <option value="">All types</option>
          <option v-for="item in feed.facets.types" :key="item.type" :value="item.type">{{ item.label }} ({{ item.count }})</option>
        </select>
        <select :value="status" aria-label="Notification status" @change="setFilter('status', $event.target.value)">
          <option v-for="item in statusOptions" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
        <select v-if="feed.scopes.managed && agencies.length" :value="agencyId" aria-label="Agency" @change="setFilter('agencyId', $event.target.value)">
          <option value="">All agencies</option>
          <option v-for="agency in agencies" :key="agency.id" :value="String(agency.id)">{{ agency.name }}</option>
        </select>
        <select :value="sort" aria-label="Sort notifications" @change="setFilter('sort', $event.target.value)">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Priority</option>
        </select>
        <button class="tool-icon" type="button" title="Reset filters" aria-label="Reset filters" @click="resetFilters"><FilterX :size="18" /></button>
        <button class="tool-icon" type="button" title="Refresh" aria-label="Refresh notifications" :disabled="loading" @click="loadFeed"><RefreshCw :size="18" /></button>
        <button class="tool-icon" type="button" title="Notification settings" aria-label="Notification settings" @click="openSettings()"><Settings2 :size="18" /></button>
        <button class="tool-icon" type="button" :title="compact ? 'Comfortable rows' : 'Compact rows'" aria-label="Toggle row density" @click="compact = !compact"><Rows3 :size="18" /></button>
      </fieldset>
      <fieldset class="bulk-controls" :disabled="loading || bulkSaving">
        <label class="selection-toggle"><input v-model="selectMode" type="checkbox" @change="selectedIds = []" /> Select multiple</label>
        <label v-if="selectMode" class="selection-toggle"><input type="checkbox" :checked="allPageSelected" :indeterminate="selectedIds.length > 0 && !allPageSelected" aria-label="Select current page" @change="selectPage($event.target.checked)" /> This page</label>
        <strong class="target-count">{{ selectMode ? 'Selected (' + selectedIds.length + ')' : 'Current page (' + feed.items.length + ')' }}</strong>
        <button class="action-btn" type="button" :disabled="!actionTargets.length" @click="applyToTargets('read')"><CheckCheck :size="16" /> Mark read</button>
        <button class="action-btn" type="button" :disabled="!actionTargets.length" @click="applyToTargets('unread')"><Mail :size="16" /> Mark unread</button>
        <select aria-label="Snooze notifications" :disabled="!actionTargets.length" value="" @change="applyToTargets($event.target.value); $event.target.value = ''">
          <option value="" disabled>Snooze...</option><option value="snooze1">1 hour</option><option value="snooze24">24 hours</option><option value="unsnooze">End snooze</option>
        </select>
        <select aria-label="More bulk actions" :disabled="!actionTargets.length" value="" @change="applyToTargets($event.target.value); $event.target.value = ''">
          <option value="" disabled>More actions...</option><option value="follow">Needs follow-up</option><option value="unfollow">Clear follow-up</option><option value="dismiss">Dismiss</option><option value="restore">Restore</option>
        </select>
        <details class="toolbar-menu">
          <summary title="Additional notification tools"><MoreHorizontal :size="20" /><span class="sr-only">Additional tools</span></summary>
          <div class="overflow-menu">
            <button type="button" :disabled="!matchingUnreadCount" @click="markMatchingRead">Mark all matching unread as read ({{ matchingUnreadCount }})</button>
            <button type="button" @click="toggleClientLabelMode">{{ clientLabelMode === 'codes' ? 'Show client initials' : 'Show client codes' }}</button>
            <button v-if="canPurge" class="danger-link" type="button" :disabled="purging" @click="purgeNotifications">Purge notifications...</button>
          </div>
        </details>
      </fieldset>
      <div class="results-summary" role="status">{{ bulkSaving ? 'Updating notifications...' : loading ? 'Loading notifications...' : rangeLabel }}<span v-if="batchNotice">{{ batchNotice }}</span></div>
    </div>

    <div class="inbox-layout">
      <section class="inbox-panel" aria-live="polite" :aria-busy="loading || bulkSaving">
        <div v-if="error" class="error-state">{{ error }} <button type="button" @click="loadFeed">Try again</button></div>
        <div v-if="!loading && hasLoaded && !feed.items.length" class="empty-state">
          <span>✓</span><strong>No matching notifications</strong><p>Try a different filter or check your notification type settings.</p>
        </div>
        <div v-else :class="['notification-list', { compact }]">
          <article
            v-for="notification in feed.items"
            :key="notification.id"
            :class="['notification-row', { selecting: selectMode, unread: isUnread(notification), urgent: notification.severity === 'urgent' }]"
          >
            <input v-if="selectMode" v-model="selectedIds" :value="notification.id" class="row-select" type="checkbox" :aria-label="`Select ${notification.title}`" :disabled="loading || bulkSaving" />
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
                <small v-else-if="notification.actor_source">By: {{ notification.actor_source }}</small>
                <small v-if="notification.recipient_display_name">To: {{ notification.recipient_display_name }}</small>
                <small v-else-if="audienceSummary(notification)">Audience: {{ audienceSummary(notification) }}</small>
                <small v-if="Number(notification.recipient_count) > 1">
                  Sent to {{ Number(notification.recipient_count).toLocaleString() }} recipients
                </small>
                <small v-if="role === 'super_admin' && notification.reader_count != null">
                  {{ Number(notification.reader_count).toLocaleString() }} read
                </small>
                <small v-if="role === 'super_admin' && notification.related_entity_type" class="entity-tag">
                  {{ notification.related_entity_type }}{{ notification.related_entity_id ? ` #${notification.related_entity_id}` : '' }}
                </small>
              </div>
            </div>
            <div class="notification-side">
              <time>{{ formatDate(notification.created_at) }}</time>
              <fieldset class="row-actions" :disabled="loading || bulkSaving">
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
                    <button v-if="role === 'super_admin'" type="button" @click="overflowId = null; openDetail(notification)">View full details</button>
                  </div>
                </div>
              </fieldset>
            </div>
          </article>
        </div>

        <footer v-if="feed.pagination.totalPages > 1" class="pagination">
          <button type="button" :disabled="page <= 1 || loading || bulkSaving" @click="setFilter('page', page - 1)">← Previous</button>
          <span>Page {{ page }} of {{ feed.pagination.totalPages }}</span>
          <button type="button" :disabled="page >= feed.pagination.totalPages || loading || bulkSaving" @click="setFilter('page', page + 1)">Next →</button>
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
          <header><strong>Daily user activity</strong><button type="button" @click="digestModal.open = false">×</button></header>
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

    <Teleport to="body">
      <div v-if="detailModal.open" class="modal-backdrop" @click.self="detailModal.open = false">
        <section class="detail-modal" role="dialog" aria-modal="true" aria-label="Notification details">
          <header>
            <strong>Notification Details</strong>
            <button type="button" @click="detailModal.open = false">×</button>
          </header>
          <div v-if="detailModal.loading" class="empty-state">Loading details…</div>
          <div v-else class="detail-body">
            <div class="detail-section">
              <h4>Core Info</h4>
              <dl class="detail-dl">
                <dt>ID</dt><dd>{{ detailModal.notification?.id }}</dd>
                <dt>Type</dt><dd>{{ detailModal.notification?.type }}</dd>
                <dt>Category</dt><dd>{{ detailModal.notification?.catalog?.category || '—' }}</dd>
                <dt>Severity</dt><dd>{{ detailModal.notification?.severity }}</dd>
                <dt>Title</dt><dd>{{ detailModal.notification?.title }}</dd>
                <dt>Message</dt><dd>{{ detailModal.notification?.message }}</dd>
                <dt>Created</dt><dd>{{ formatDate(detailModal.notification?.created_at) }}</dd>
                <dt>Agency</dt><dd>{{ detailModal.notification?.agency_name }} (ID {{ detailModal.notification?.agency_id }})</dd>
              </dl>
            </div>
            <div class="detail-section">
              <h4>Targeting</h4>
              <dl class="detail-dl">
                <dt>Recipient user</dt>
                <dd>{{ detailModal.notification?.recipient_display_name || (detailModal.notification?.user_id ? `User #${detailModal.notification.user_id}` : 'Agency broadcast') }}</dd>
                <dt>Recipient email</dt><dd>{{ detailModal.notification?.recipient_email || '—' }}</dd>
                <dt>Recipient role</dt><dd>{{ detailModal.notification?.recipient_role || '—' }}</dd>
                <dt>Audience roles</dt>
                <dd>{{ audienceSummary(detailModal.notification) || (detailModal.notification?.audience_json ? JSON.stringify(detailModal.notification.audience_json) : 'All roles') }}</dd>
              </dl>
            </div>
            <div class="detail-section">
              <h4>Actor / Source</h4>
              <dl class="detail-dl">
                <dt>Actor</dt><dd>{{ detailModal.notification?.actor_display_name || '—' }}</dd>
                <dt>Actor email</dt><dd>{{ detailModal.notification?.actor_email || '—' }}</dd>
                <dt>Actor role</dt><dd>{{ detailModal.notification?.actor_role || '—' }}</dd>
                <dt>Actor source</dt><dd>{{ detailModal.notification?.actor_source || '—' }}</dd>
              </dl>
            </div>
            <div class="detail-section">
              <h4>Related Entity</h4>
              <dl class="detail-dl">
                <dt>Entity type</dt><dd>{{ detailModal.notification?.related_entity_type || '—' }}</dd>
                <dt>Entity ID</dt><dd>{{ detailModal.notification?.related_entity_id || '—' }}</dd>
                <dt>Fanout fingerprint</dt><dd class="mono">{{ detailModal.notification?.fanout_fingerprint || '—' }}</dd>
              </dl>
            </div>
            <div class="detail-section">
              <h4>Read Status ({{ detailModal.readCount }} read · {{ detailModal.dismissedCount }} dismissed)</h4>
              <div v-if="!detailModal.readers.length" class="muted-note">No one has opened this notification yet.</div>
              <table v-else class="readers-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Read</th><th>Read at</th><th>Dismissed</th></tr></thead>
                <tbody>
                  <tr v-for="r in detailModal.readers" :key="r.user_id">
                    <td>{{ r.user_name || `User #${r.user_id}` }}</td>
                    <td>{{ r.user_email || '—' }}</td>
                    <td>{{ r.user_role || '—' }}</td>
                    <td>{{ r.is_read ? '✓' : '—' }}</td>
                    <td>{{ r.read_at ? formatDate(r.read_at) : '—' }}</td>
                    <td>{{ r.dismissed_at ? formatDate(r.dismissed_at) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { CheckCheck, Mail, FilterX, RefreshCw, Settings2, Rows3, MoreHorizontal } from '@lucide/vue';
import { updateNotificationBatch } from '../utils/notificationBatch';
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
const selectMode = ref(false);
const selectedIds = ref([]);
const batchNotice = ref('');
const actionTargets = computed(() => selectMode.value ? feed.items.filter((n) => selectedIds.value.includes(n.id)) : feed.items);
const allPageSelected = computed(() => feed.items.length > 0 && feed.items.every((n) => selectedIds.value.includes(n.id)));
const selectPage = (checked) => { selectedIds.value = checked ? feed.items.map((n) => n.id) : []; };
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
const detailModal = reactive({ open: false, loading: false, notification: null, readers: [], readCount: 0, dismissedCount: 0 });

const feed = reactive({
  items: [], unreadCount: 0,
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  facets: { statuses: {}, categories: [], types: [], matchingTotal: 0, categoryTotal: 0 },
  scopes: { inbox: true, team: false, managed: false }
});

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canPurge = computed(() => role.value === 'super_admin' || (['admin', 'support'].includes(role.value) && !!agencyId.value));
const orgSlug = computed(() => String(route.params.organizationSlug || ''));
const agencies = computed(() => role.value === 'super_admin' ? agencyStore.agencies || [] : agencyStore.userAgencies || []);

const scope = ref(String(route.query.scope || 'inbox'));
const status = ref(String(route.query.status || 'unread'));
const type = ref(String(route.query.type || ''));
const category = ref(String(route.query.category || ''));
const page = ref(Math.max(1, Number(route.query.page || 1)));
const agencyId = ref(String(route.query.agencyId || ''));
const sort = ref(String(route.query.sort || 'newest'));

const statusOptions = [
  { key: 'all', label: 'All active' },
  { key: 'unread', label: 'Unread', icon: '🟢' },
  { key: 'read', label: 'Read', icon: '●' },
  { key: 'follow_up', label: 'Needs follow-up', icon: '⚑' },
  { key: 'high_priority', label: 'High priority', icon: '⚠' },
  { key: 'snoozed', label: 'Snoozed', icon: '⏰' },
  { key: 'dismissed', label: 'Dismissed', icon: '🗃' }
];

const matchingUnreadCount = computed(() => Number(feed.unreadCount || 0));
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

let pendingQuery = null;
const navigateFilters = async (query) => {
  if (bulkSaving.value) return;
  clearTimeout(searchTimer);
  selectedIds.value = [];
  batchNotice.value = '';
  overflowId.value = null;
  ++feedRequestId;
  loading.value = true;
  pendingQuery = query;
  await router.replace({ query });
  if (pendingQuery === query) {
    pendingQuery = null;
    syncFilterState(route.query);
    await loadFeed();
  }
};
const setFilter = (key, value) => {
  const query = { ...(pendingQuery || route.query) };
  if (value === null || value === undefined || value === '' || (key === 'page' && Number(value) === 1)) delete query[key];
  else query[key] = String(value);
  if (key === 'category') delete query.type;
  if (key !== 'page') delete query.page;
  if (key !== 'search' && searchDraft.value.trim()) query.search = searchDraft.value.trim();
  return navigateFilters(query);
};
const resetFilters = () => {
  const query = { ...route.query };
  for (const key of ['status', 'category', 'type', 'agencyId', 'search', 'sort', 'page']) delete query[key];
  query.status = 'all';
  return navigateFilters(query);
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
    if (requestId !== feedRequestId) return;
    if (page.value > Math.max(1, Number(data?.pagination?.totalPages || 1))) {
      await setFilter('page', Math.max(1, Number(data?.pagination?.totalPages || 1)));
      return;
    }
    Object.assign(feed, data || {});
    selectedIds.value = selectedIds.value.filter((id) => feed.items.some((n) => n.id === id));
    void notificationStore.fetchCounts().catch(() => {});
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
  if (pendingQuery) return;
  clearTimeout(searchTimer);
  selectedIds.value = [];
  syncFilterState(route.query);
  void loadFeed();
});

watch(searchDraft, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (value === String(route.query.search || '')) return;
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
  if (notification.type === 'school_portal_onboarding_completed') return 'View onboarding';
  if (notification.type === 'provider_year_update_completed') return 'View year update';
  if (notification.type === 'school_collaborative_year_update_completed') return 'View year update';
  if (notification.type === 'new_packet_uploaded') return 'Open packet';
  if (notification.type === 'company_event_registration_submitted') return 'Event portal';
  if (notification.type === 'support_ticket_created') return 'Open ticket';
  if (notification.type === 'escalation_mention') return 'Open escalation';
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
    return false;
  }
};
const toggleRead = (notification) => updateState(notification, { read: isUnread(notification) });
const toggleFollowUp = (notification) => updateState(notification, { followUp: !notification._requires_follow_up_for_viewer });
const dismiss = (notification) => updateState(notification, notificationDismissPayload(notification));
const restore = (notification) => updateState(notification, { dismissed: false });
const snooze = (notification, hours) => updateState(notification, { snoozedUntil: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() });

const applyToTargets = async (action) => {
  if (loading.value || bulkSaving.value || !actionTargets.value.length) return;
  const targets = [...actionTargets.value];
  if (action === 'dismiss' && !window.confirm(`Dismiss ${targets.length} notifications? Any follow-up flags will also be cleared.`)) return;
  bulkSaving.value = true;
  batchNotice.value = '';
  error.value = '';
  try {
    const result = await updateNotificationBatch(targets, action, (id, payload) =>
      api.patch(`/notifications/${id}/state`, payload, { skipGlobalLoading: true }));
    selectedIds.value = result.failedIds;
    if (result.failedIds.length) selectMode.value = true;
    batchNotice.value = `${result.updated} updated.${result.failedIds.length ? ' ' + result.failedIds.length + ' failed; selected for retry.' : ''}`;
  } catch {
    error.value = 'Could not update notifications. Please try again.';
  } finally {
    bulkSaving.value = false;
    await loadFeed();
  }
};

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
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not update notifications.';
  } finally { bulkSaving.value = false; }
};
const markMatchingRead = async () => {
  if (!window.confirm(`Mark ${matchingUnreadCount.value.toLocaleString()} matching notifications as read?`)) return;
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

const audienceSummary = (notification) => {
  try {
    const aud = typeof notification.audience_json === 'string'
      ? JSON.parse(notification.audience_json)
      : notification.audience_json;
    if (!aud || typeof aud !== 'object') return null;
    const LABELS = { super_admin: 'Super Admin', admin: 'Admin', support: 'Support', staff: 'Staff', provider: 'Provider', provider_plus: 'Provider+', supervisor: 'Supervisor', guardian: 'Guardian' };
    const allowed = Object.entries(aud).filter(([, v]) => v !== false).map(([k]) => LABELS[k] || k);
    return allowed.length ? allowed.join(', ') : null;
  } catch { return null; }
};

const openDetail = async (notification) => {
  detailModal.open = true;
  detailModal.loading = true;
  detailModal.notification = notification;
  detailModal.readers = [];
  detailModal.readCount = 0;
  detailModal.dismissedCount = 0;
  try {
    const { data } = await api.get(`/notifications/${notification.id}/detail`);
    detailModal.notification = data.notification || notification;
    detailModal.readers = data.readers || [];
    detailModal.readCount = data.readCount || 0;
    detailModal.dismissedCount = data.dismissedCount || 0;
  } finally {
    detailModal.loading = false;
  }
};

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
onBeforeUnmount(() => { ++feedRequestId; if (undoTimer) clearTimeout(undoTimer); if (searchTimer) clearTimeout(searchTimer); });
</script>

<style scoped>
.notification-page { padding:24px; max-width:1600px; margin:0 auto; color:var(--text-primary); }
.page-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; }
.page-header h1 { margin:0; font-size:30px; }
.page-header p { margin:5px 0 0; color:var(--text-secondary); }
.header-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:9px; align-items:stretch; }
.action-btn,.unread-card { border:1px solid var(--border); background:var(--bg-card); color:var(--text-primary); border-radius:8px; padding:10px 14px; font-weight:700; text-decoration:none; cursor:pointer; }
.action-btn.primary { background:var(--primary); color:white; border-color:var(--primary); }
.action-btn:disabled { opacity:.5; cursor:not-allowed; }
.unread-card { min-width:78px; background:#065f46; color:white; display:flex; flex-direction:column; padding:7px 13px; }
.unread-card small { opacity:.8; }.unread-card strong { font-size:21px; }
.scope-tabs { display:flex; align-items:end; gap:22px; margin-top:28px; border-bottom:1px solid var(--border); }
.scope-tabs button { border:0; border-bottom:3px solid transparent; background:none; padding:12px 4px; font-weight:700; cursor:pointer; }
.scope-tabs button.active { border-color:var(--primary); color:var(--primary); }
.scope-tabs select { margin-left:auto; margin-bottom:8px; border:1px solid var(--border); border-radius:8px; padding:8px; }
.type-strip { display:flex; gap:8px; overflow-x:auto; padding:18px 0; }
.type-strip button,.type-strip select { white-space:nowrap; border:1px solid var(--border); background:var(--bg-card); border-radius:8px; padding:9px 14px; font-weight:700; cursor:pointer; }
.type-strip button.active { background:#065f46; color:white; border-color:#065f46; }
.type-mark-read-btn { margin-left:auto; color:#065f46; border-color:#86efac; background:#ecfdf5; }
.inbox-layout { display:grid; grid-template-columns:minmax(0,1fr); gap:18px; }
.filter-sidebar { border:1px solid var(--border); border-radius:12px; background:linear-gradient(180deg,#f8fffb,#fff); padding:16px; align-self:start; position:sticky; top:12px; }
.sidebar-section { display:flex; flex-direction:column; gap:5px; }
.sidebar-section+ .sidebar-section { border-top:1px solid var(--border); padding-top:16px; margin-top:16px; }
.sidebar-section h2 { font-size:14px; margin:0 0 8px; }
.search-input { border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:8px; width:100%; box-sizing:border-box; }
.sidebar-section button { border:0; background:transparent; border-radius:8px; padding:8px; display:flex; justify-content:space-between; text-align:left; cursor:pointer; color:inherit; }
.sidebar-section button span { display:flex; gap:8px; align-items:center; }.sidebar-section button i { font-style:normal; }
.sidebar-section button.active { background:#ecfdf5; color:#065f46; font-weight:700; }.sidebar-section button strong { font-size:11px; background:var(--bg-card); border:1px solid var(--border); border-radius:999px; padding:2px 7px; }
.admin-tools { border-top:1px solid var(--border); margin-top:16px; padding-top:14px; font-size:12px; }.admin-tools p { color:var(--text-secondary); }.danger-link { color:#b91c1c!important; }
.inbox-panel { border:0; background:transparent; min-width:0; }
.inbox-toolbar { padding:14px 16px; display:flex; justify-content:space-between; align-items:center; color:var(--text-secondary); font-size:13px; }
.inbox-toolbar>div { display:flex; gap:8px; align-items:center; }.inbox-toolbar select { border:1px solid var(--border); border-radius:8px; padding:7px; margin-left:5px; }.density-btn { border:1px solid var(--border); background:var(--bg-card); border-radius:8px; padding:7px 10px; }
.notification-list { display:flex; flex-direction:column; gap:7px; padding:0 0 14px; }
.notification-row { display:grid; grid-template-columns:48px minmax(0,1fr) auto; gap:12px; align-items:center; background:var(--bg-card); border:1px solid var(--border); border-left:3px solid transparent; border-radius:8px; padding:14px; box-shadow:0 1px 3px rgba(15,23,42,.04); }
.notification-row.unread { border-left-color:#16a34a; }.notification-row.urgent { border-left-color:#dc2626; }.notification-list.compact .notification-row { padding:10px 12px; }.notification-list.compact .notification-main p { margin:5px 0; }
.notification-icon { width:42px; height:42px; border-radius:999px; display:grid; place-items:center; font-size:18px; }
.notification-title-line { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }.notification-title { border:0; background:none; color:inherit; font-weight:800; cursor:pointer; padding:0; text-align:left; }.notification-title:hover { color:var(--primary); }
.severity-pill,.unread-pill,.follow-pill { font-size:9px; text-transform:uppercase; border:1px solid var(--border); border-radius:999px; padding:3px 7px; font-weight:800; }.unread-pill { color:#1d4ed8; border-color:#bfdbfe; background:#eff6ff; }.follow-pill { color:#a16207; border-color:#fde68a; background:#fffbeb; }
.notification-main p { color:var(--text-secondary); font-size:12px; margin:7px 0; overflow-wrap:anywhere; }.notification-main small { color:#059669; }
.notification-meta { display:flex; flex-wrap:wrap; gap:6px 14px; }
.notification-side { display:flex; flex-direction:column; align-items:flex-end; gap:9px; }.notification-side time { color:var(--text-secondary); font-size:11px; }.row-actions { display:flex; gap:6px; align-items:center; }.row-btn { border:1px solid var(--border); background:var(--bg-card); border-radius:7px; padding:7px 9px; font-size:11px; font-weight:700; cursor:pointer; }.row-btn.primary-action { color:#047857; border-color:#86efac; }.row-btn.follow { color:#b45309; border-color:#fbbf24; }.overflow-wrap { position:relative; }.overflow { font-size:17px; line-height:1; }
.overflow-menu { position:absolute; z-index:20; right:0; top:calc(100% + 5px); min-width:230px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; box-shadow:0 14px 30px rgba(15,23,42,.16); padding:5px; }.overflow-menu button { display:block; width:100%; text-align:left; border:0; background:none; padding:9px; border-radius:6px; cursor:pointer; }.overflow-menu button:hover { background:var(--bg-alt); }
.empty-state,.error-state { min-height:240px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-secondary); gap:7px; }.empty-state>span { font-size:30px; color:#16a34a; }.error-state { color:#b91c1c; }
.pagination { display:flex; justify-content:center; align-items:center; gap:14px; padding:14px; border-top:1px solid var(--border); }.pagination button { border:1px solid var(--border); background:var(--bg-card); border-radius:8px; padding:8px 12px; }.pagination button:disabled { opacity:.45; }
.mobile-filter-btn { display:none; }.undo-toast { position:fixed; z-index:2500; left:50%; bottom:24px; transform:translateX(-50%); background:#102a25; color:white; border-radius:10px; padding:12px 16px; box-shadow:0 12px 30px rgba(0,0,0,.2); display:flex; gap:18px; }.undo-toast button { border:0; background:none; color:#6ee7b7; font-weight:800; cursor:pointer; }
.modal-backdrop { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.45); display:grid; place-items:center; }.digest-modal { width:min(700px,94vw); max-height:80vh; background:var(--bg-card); border-radius:14px; overflow:auto; }.digest-modal>header { display:flex; justify-content:space-between; padding:16px; border-bottom:1px solid var(--border); }.digest-modal>header button { border:0; background:none; font-size:24px; }.digest-events { padding:12px; }.digest-events article { display:grid; grid-template-columns:140px 1fr auto; gap:10px; padding:10px; border-bottom:1px solid var(--border); font-size:12px; }.digest-events span { color:var(--text-secondary); }
.detail-modal { width:min(860px,96vw); max-height:88vh; background:var(--bg-card); border-radius:14px; overflow:auto; display:flex; flex-direction:column; }.detail-modal>header { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--bg-card); z-index:1; }.detail-modal>header button { border:0; background:none; font-size:24px; cursor:pointer; }.detail-body { padding:16px; display:flex; flex-direction:column; gap:16px; }.detail-section { border:1px solid var(--border); border-radius:10px; padding:14px; }.detail-section h4 { margin:0 0 10px; font-size:13px; color:#0c4a6e; text-transform:uppercase; letter-spacing:.04em; }.detail-dl { display:grid; grid-template-columns:140px 1fr; gap:5px 12px; font-size:12px; }.detail-dl dt { color:var(--text-secondary); font-weight:700; }.detail-dl dd { margin:0; overflow-wrap:anywhere; }.mono { font-family:monospace; font-size:11px; }.muted-note { color:var(--text-secondary); font-size:13px; }.readers-table { width:100%; border-collapse:collapse; font-size:12px; }.readers-table th,.readers-table td { padding:7px 9px; border-bottom:1px solid var(--border); text-align:left; }.readers-table th { background:#f8fafb; font-weight:700; }.entity-tag { background:#f0f9ff; color:#0369a1; border-radius:4px; padding:1px 5px; font-family:monospace; font-size:10px; }
@media (max-width:1050px) { .page-header { flex-direction:column; }.header-actions { justify-content:flex-start; }.notification-row { grid-template-columns:44px 1fr; }.notification-side { grid-column:2; align-items:flex-start; }.row-actions { flex-wrap:wrap; } }
@media (max-width:760px) { .notification-page { padding:14px; }.inbox-layout { grid-template-columns:1fr; }.mobile-filter-btn { display:block; width:100%; border:1px solid var(--border); border-radius:8px; background:var(--bg-card); padding:9px; margin-bottom:8px; }.filter-sidebar { display:none; position:static; }.filter-sidebar.mobileOpen { display:block; }.scope-tabs { overflow-x:auto; }.scope-tabs select { max-width:160px; }.notification-row { grid-template-columns:36px 1fr; padding:10px; }.notification-icon { width:34px; height:34px; }.notification-side { grid-column:1/-1; }.inbox-toolbar { align-items:flex-start; gap:10px; }.inbox-toolbar>div { align-items:flex-end; }.digest-events article { grid-template-columns:1fr; } }

.management-toolbar { margin:20px 0 12px; border-block:1px solid var(--border); background:var(--bg-card); }
.management-toolbar .scope-tabs { margin-top:0; }
.management-toolbar button,.management-toolbar input,.management-toolbar select,.row-btn,.pagination button,.overflow-menu button { color:var(--text-primary); }
.filter-controls,.bulk-controls { border:0; padding:12px 0; margin:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
.filter-controls { border-bottom:1px solid var(--border); }
.filter-controls input,.filter-controls select,.bulk-controls select { min-width:0; max-width:240px; border:1px solid var(--border); border-radius:6px; padding:8px; background:var(--bg-card); font:inherit; font-size:13px; }
.filter-controls input { flex:1 1 200px; }
.filter-controls select { flex:1 1 145px; }
.tool-icon { width:34px; height:34px; display:grid; place-items:center; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; cursor:pointer; }
.selection-toggle { display:flex; align-items:center; gap:6px; font-size:13px; }
.target-count { font-size:12px; color:var(--text-secondary); margin-inline:8px; }
.bulk-controls .action-btn { display:inline-flex; gap:6px; align-items:center; padding:8px 10px; font-size:13px; }
.results-summary { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:12px; color:var(--text-secondary); padding:0 0 12px; }
.toolbar-menu { position:relative; margin-left:auto; }
.toolbar-menu summary { cursor:pointer; list-style:none; padding:6px; }
.toolbar-menu .overflow-menu { min-width:240px; max-width:85vw; }
.row-actions { border:0; padding:0; margin:0; min-width:0; }
.notification-row.selecting { grid-template-columns:22px 48px minmax(0,1fr) auto; }
.row-select { width:17px; height:17px; accent-color:var(--primary); }
.notification-main { min-width:0; }
button:disabled,select:disabled { opacity:.5; cursor:not-allowed; }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
.error-state { min-height:70px; padding:12px; }
@media(max-width:1050px) {
  .notification-row.selecting { grid-template-columns:22px 36px minmax(0,1fr); }
  .notification-row.selecting .notification-side { grid-column:3; }
}
@media(max-width:760px) {
  .page-header { flex-direction:row; align-items:center; }
  .page-header p { display:none; }
  .filter-controls input { max-width:none; flex-basis:100%; }
  .notification-row.selecting .notification-side { grid-column:2/-1; }
  .target-count { flex-basis:100%; margin:0; }
}
</style>
