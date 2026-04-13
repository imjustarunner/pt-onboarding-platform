<template>
  <div class="container">
    <div class="header" data-tour="notifhub-header">
      <h1 data-tour="notifhub-title">Notifications</h1>
      <p class="sub">Your alerts and notifications.</p>
    </div>

    <div class="card-grid" data-tour="notifhub-grid">
      <div class="card card-mine" data-tour="notifhub-card-mine">
        <div class="card-top">
          <h2>My Notifications</h2>
          <div class="card-top-actions">
            <span class="pill pill-unread">{{ myUnreadCount }} unread</span>
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              @click="toggleClientLabelMode"
              :title="clientLabelMode === 'codes' ? 'Show initials' : 'Show codes'"
            >
              {{ clientLabelMode === 'codes' ? 'Show initials' : 'Show codes' }}
            </button>
            <button
              v-if="displayedUnreadCount > 0"
              class="btn btn-primary btn-sm"
              type="button"
              @click="markAllAsRead"
            >
              {{ activeTypeFilter === 'all' ? 'Mark all read' : `Mark ${displayedUnreadCount} read` }}
            </button>
            <router-link v-if="isAdminLike" class="btn btn-secondary btn-sm" :to="ticketsLink">
              Tickets
            </router-link>
            <button class="btn btn-secondary btn-sm" type="button" @click="toastSettingsOpen = true" title="Toast notification settings">
              ⚙ Settings
            </button>
          </div>
        </div>
        <p class="hint">{{ showUnreadForAdmin ? 'Notifications you haven\'t read yet (matches the count in the header).' : 'These are notifications where you are the target user (including SMS-eligible events).' }}</p>
        <div v-if="typeChips.length > 0" class="type-chips" role="group" aria-label="Filter notification types">
          <button
            class="chip-btn"
            :class="{ active: activeTypeFilter === 'all' }"
            type="button"
            @click="activeTypeFilter = 'all'"
          >
            All ({{ displayedTotalCount }})
          </button>
          <button
            v-for="chip in typeChips"
            :key="chip.type"
            class="chip-btn"
            :class="{ active: activeTypeFilter === chip.type }"
            type="button"
            @click="activeTypeFilter = chip.type"
          >
            {{ chip.label }} ({{ chip.count }})
          </button>
        </div>

        <div v-if="loadingMy" class="loading">Loading…</div>
        <div v-else-if="displayedMyNotifications.length === 0" class="empty">No notifications.</div>
        <div v-else class="list">
          <div
            v-for="n in displayedMyNotifications"
            :key="n.id"
            class="notif-row"
            :class="{ unread: isUnread(n), urgent: isUrgent(n) }"
          >
            <div class="col col-title">
              <span v-if="isUnread(n)" class="unread-dot" aria-hidden="true"></span>
              <span v-if="isUrgent(n)" class="badge badge-urgent">URGENT</span>
              <span :class="['badge', 'badge-severity', `sev-${n.severity || 'info'}`]">{{ formatSeverityLabel(n.severity) }}</span>
              <span class="badge badge-type">{{ getTypeLabel(n.type) }}</span>
              <span class="badge" :class="isUnread(n) ? 'badge-unread' : 'badge-read'">{{ isUnread(n) ? 'Unread' : 'Read' }}</span>
              <button class="title-link" type="button" @click="openNotification(n)">{{ n.title }}</button>
            </div>
            <div class="col col-msg">{{ formatNotificationLine(n) }}</div>
            <div class="col col-meta">
              <span v-if="n.actor_display_name" class="actor-by">By: {{ n.actor_display_name }}</span>
              <span>{{ formatDate(n.created_at) }}</span>
              <div class="meta-actions">
                <template v-if="n.type === 'office_availability_request_pending' && canManageAvailability && n.agency_id">
                  <button class="btn btn-secondary btn-sm" type="button" @click.stop="openOfficeRequestModal(n)">
                    View
                  </button>
                  <button class="btn btn-primary btn-sm" type="button" @click.stop="openOfficeRequestModal(n)">
                    Approve
                  </button>
                  <button class="btn btn-danger btn-sm" type="button" @click.stop="denyOfficeRequest(n)">
                    Deny
                  </button>
                </template>
                <template v-else>
                  <button class="btn btn-secondary btn-sm mark-btn" type="button" @click="markRead(n)" :disabled="!isUnread(n)">
                    Mark read
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="toggleFollowUp(n)">
                    {{ n._requires_follow_up_for_viewer ? 'Clear Follow-up' : 'Needs Follow-up' }}
                  </button>
                  <button
                    class="btn btn-danger btn-sm"
                    type="button"
                    @click="dismissNotification(n)"
                    :disabled="n._requires_follow_up_for_viewer"
                    :title="n._requires_follow_up_for_viewer ? 'Clear follow-up first' : ''"
                  >
                    Dismiss
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showTeamCard" class="card card-compact" data-tour="notifhub-card-team">
        <div class="card-top">
          <h2>Team Notifications</h2>
          <span class="pill">Supervisor/CPA</span>
        </div>
        <p class="hint">View supervisee / agency-wide operational items.</p>
        <router-link class="btn" :to="teamNotificationsLink">Open</router-link>
      </div>

      <div v-if="showAgencyCards" class="card card-compact" data-tour="notifhub-card-agency">
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

    </div>
  </div>

  <OfficeRequestAssignModal
    :visible="officeRequestModal.visible"
    :request-id="officeRequestModal.requestId"
    :agency-id="officeRequestModal.agencyId"
    @close="officeRequestModal.visible = false"
    @assigned="handleOfficeRequestResolved"
    @denied="handleOfficeRequestResolved"
  />
  <ClientDetailPanel
    v-if="adminSelectedClient"
    :client="adminSelectedClient"
    @close="closeAdminClientEditor"
    @updated="handleAdminClientUpdated"
  />

  <!-- Toast Notification Settings Modal -->
  <Teleport to="body">
    <div v-if="toastSettingsOpen" class="toast-modal-backdrop" @click.self="toastSettingsOpen = false">
      <div class="toast-modal">
        <div class="toast-modal-header">
          <h2>Toast Notification Settings</h2>
          <button type="button" class="toast-modal-close" @click="toastSettingsOpen = false" aria-label="Close">&times;</button>
        </div>

        <div v-if="toastSettingsLoading" class="toast-modal-body"><p class="loading">Loading...</p></div>
        <div v-else class="toast-modal-body">
          <p class="hint">Control pop-up toast alerts for specific notification types.</p>

          <div class="ts-group">
            <div class="ts-group-title">Login / Logout Activity</div>
            <p class="ts-group-help">Toast when other users log in or out.</p>
            <div class="ts-controls">
              <label class="ts-field"><input v-model="toastForm.login_logout.toast_enabled" type="checkbox" /> Show toast</label>
              <div class="ts-field" v-if="toastForm.login_logout.toast_enabled">
                <label>Duration</label>
                <select v-model="toastForm.login_logout.duration_mode">
                  <option value="dismissable">Dismissable (stays until dismissed)</option>
                  <option value="timed">Auto-dismiss after timeout</option>
                </select>
              </div>
              <div class="ts-field" v-if="toastForm.login_logout.toast_enabled && toastForm.login_logout.duration_mode === 'timed'">
                <label>Timeout (seconds)</label>
                <input v-model.number="toastForm.login_logout.duration_seconds" type="number" min="3" max="120" />
              </div>
              <label class="ts-field" v-if="toastForm.login_logout.toast_enabled"><input v-model="toastForm.login_logout.sound_enabled" type="checkbox" /> Play sound</label>
            </div>
          </div>

          <div class="ts-group">
            <div class="ts-group-title">New Packets & Intake Submissions</div>
            <p class="ts-group-help">Toast when a new packet is uploaded or an intake link submission is received.</p>
            <div class="ts-controls">
              <label class="ts-field"><input v-model="toastForm.new_packet.toast_enabled" type="checkbox" /> Show toast</label>
              <div class="ts-field" v-if="toastForm.new_packet.toast_enabled">
                <label>Duration</label>
                <select v-model="toastForm.new_packet.duration_mode">
                  <option value="dismissable">Dismissable (stays until dismissed)</option>
                  <option value="timed">Auto-dismiss after timeout</option>
                </select>
              </div>
              <div class="ts-field" v-if="toastForm.new_packet.toast_enabled && toastForm.new_packet.duration_mode === 'timed'">
                <label>Timeout (seconds)</label>
                <input v-model.number="toastForm.new_packet.duration_seconds" type="number" min="3" max="120" />
              </div>
              <label class="ts-field" v-if="toastForm.new_packet.toast_enabled"><input v-model="toastForm.new_packet.sound_enabled" type="checkbox" /> Play sound</label>
            </div>
          </div>

          <div class="ts-group">
            <div class="ts-group-title">General</div>
            <label class="ts-field"><input v-model="toastForm.notification_sound_enabled" type="checkbox" /> Play sound for all other notifications</label>
            <p class="ts-group-help">Fallback sound for notifications not covered by the types above.</p>
          </div>
        </div>

        <div class="toast-modal-footer">
          <button class="btn btn-secondary btn-sm" type="button" @click="toastSettingsOpen = false">Cancel</button>
          <button class="btn btn-primary btn-sm" type="button" @click="saveToastSettings" :disabled="toastSettingsSaving">
            {{ toastSettingsSaving ? 'Saving...' : 'Save' }}
          </button>
          <span v-if="toastSettingsSaved" class="ts-saved">Saved</span>
          <span v-if="toastSettingsError" class="ts-error">{{ toastSettingsError }}</span>
          <router-link class="btn btn-secondary btn-sm ts-all-prefs" :to="notificationSettingsLink">All preferences</router-link>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useNotificationStore } from '../store/notifications';
import { useCommunicationsCountsStore } from '../store/communicationsCounts';
import { useUserPreferencesStore } from '../store/userPreferences';
import api from '../services/api';
import ClientDetailPanel from '../components/admin/ClientDetailPanel.vue';
import OfficeRequestAssignModal from '../components/admin/OfficeRequestAssignModal.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const notificationStore = useNotificationStore();
const communicationsCountsStore = useCommunicationsCountsStore();
const userPreferencesStore = useUserPreferencesStore();
const route = useRoute();
const router = useRouter();

const loadingMy = ref(false);
const myNotifications = ref([]);
const counts = ref({});
const loadingCounts = ref(false);
const clientLabelMode = ref('initials'); // 'initials' | 'codes'
const adminSelectedClient = ref(null);
const adminClientLoading = ref(false);
const activeTypeFilter = ref('all');
const officeRequestModal = ref({ visible: false, requestId: null, agencyId: null });

const userId = computed(() => authStore.user?.id);
const role = computed(() => authStore.user?.role);
const agencies = computed(() => {
  if (role.value === 'super_admin') return agencyStore.agencies || [];
  return agencyStore.userAgencies || [];
});

const isAdminLike = computed(() => role.value === 'admin' || role.value === 'super_admin' || role.value === 'support');
const isTeamRole = computed(() => role.value === 'supervisor' || role.value === 'clinical_practice_assistant' || role.value === 'provider_plus');
const canManageAvailability = computed(() => {
  const r = String(role.value || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff'].includes(r);
});
const showPlatformCard = computed(() => isAdminLike.value || role.value === 'staff');

const showAgencyCards = computed(() => isAdminLike.value);
const showTeamCard = computed(() => isTeamRole.value);
const showUnreadForAdmin = computed(() => isAdminLike.value || isTeamRole.value);

const orgSlug = computed(() => {
  const s = route.params.organizationSlug;
  return typeof s === 'string' && s ? s : null;
});
const communicationsLink = computed(() => (
  orgSlug.value ? `/${orgSlug.value}/admin/communications` : '/admin/communications'
));

const adminNotificationsLink = (agencyId) => {
  return orgSlug.value
    ? { path: `/${orgSlug.value}/admin/notifications`, query: { agencyId } }
    : { path: '/admin/notifications', query: { agencyId } };
};

const teamNotificationsLink = computed(() => {
  return orgSlug.value ? `/${orgSlug.value}/notifications/team` : '/notifications/team';
});

const ticketsLink = computed(() => {
  const base = orgSlug.value ? `/${orgSlug.value}` : '';
  return `${base}/tickets`;
});
const communicationsAutomationLink = computed(() => {
  const base = orgSlug.value ? `/${orgSlug.value}` : '';
  return { path: `${base}/admin/communications`, query: { tab: 'automation' } };
});
const notificationSettingsLink = computed(() => {
  const base = orgSlug.value ? `/${orgSlug.value}` : '';
  return { path: `${base}/dashboard`, query: { tab: 'my', my: 'preferences' } };
});
const communicationsPendingCount = computed(() => Number(communicationsCountsStore.pendingDeliveryCount || 0));

const loadMy = async () => {
  try {
    loadingMy.value = true;
    const resp = await api.get('/notifications');
    const all = Array.isArray(resp.data) ? resp.data : [];
    const needsScopedMine = isAdminLike.value || isTeamRole.value;
    // For admin/supervisor/CPA: show all unread (personal + agency-wide) so the header badge count
    // matches what's visible when clicking it. For providers: show all (they only get personal).
    const mine = needsScopedMine
      ? all.filter((n) => !n.is_resolved && !n.is_read)
      : all;
    myNotifications.value = mine
      .filter((n) => !n.is_resolved)
      .sort((a, b) => {
        const aUnread = (!a.is_read && !a.is_resolved) ? 1 : 0;
        const bUnread = (!b.is_read && !b.is_resolved) ? 1 : 0;
        if (aUnread !== bUnread) return bUnread - aUnread;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  } finally {
    loadingMy.value = false;
  }
};

const loadCounts = async () => {
  try {
    loadingCounts.value = true;
    const params = showAgencyCards.value ? { scope: 'managed_feed' } : undefined;
    const resp = await api.get('/notifications/counts', { ...(params ? { params } : {}), skipGlobalLoading: true });
    counts.value = resp.data || {};
  } finally {
    loadingCounts.value = false;
  }
};

const markRead = async (n) => {
  try {
    await api.put(`/notifications/${n.id}/read`);
    n.is_read = true;
    n.read_at = new Date().toISOString();
    // When showing unread-only, remove from list so it matches the header count
    if (showUnreadForAdmin.value) {
      myNotifications.value = myNotifications.value.filter((item) => item.id !== n.id);
    }
    void notificationStore.fetchCounts();
  } catch {
    // ignore
  }
};

const dismissNotification = async (n) => {
  try {
    // Preferred path: mark resolved.
    await api.put(`/notifications/${n.id}/resolved`);
  } catch {
    // Fallback path: if resolve fails for any reason, attempt hard delete so
    // the item can still be dismissed from the user's perspective.
    try {
      await api.delete(`/notifications/${n.id}`);
    } catch {
      return;
    }
  }
  n.is_resolved = true;
  n.resolved_at = new Date().toISOString();
  myNotifications.value = myNotifications.value.filter((item) => item.id !== n.id);
  void notificationStore.fetchCounts();
};

const toggleFollowUp = async (n) => {
  try {
    await api.put(`/notifications/${n.id}/follow-up`, {
      enabled: !n._requires_follow_up_for_viewer
    });
    n._requires_follow_up_for_viewer = !n._requires_follow_up_for_viewer;
    if (n._requires_follow_up_for_viewer) {
      n.is_read = false;
      n.read_at = null;
      n.muted_until = null;
    }
    await loadMy();
    void notificationStore.fetchCounts();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to update follow-up state');
  }
};

const markAllAsRead = async () => {
  // Only mark notifications that match the current type filter
  const toMark = displayedMyNotifications.value.filter((n) => isUnread(n));
  if (!toMark.length) return;
  const filters = activeTypeFilter.value === 'all' ? {} : { type: activeTypeFilter.value };
  const agencyIds = [...new Set(toMark.map((n) => n.agency_id).filter(Boolean))];
  await Promise.allSettled(
    agencyIds.map((aid) => api.put('/notifications/read-all', { agencyId: aid, filters }))
  );
  toMark.forEach((n) => {
    n.is_read = true;
    n.read_at = new Date().toISOString();
  });
  if (showUnreadForAdmin.value) {
    const markedIds = new Set(toMark.map((n) => n.id));
    myNotifications.value = myNotifications.value.filter((n) => !markedIds.has(n.id));
  }
  void notificationStore.fetchCounts();
};

const openNotification = async (notification) => {
  if (!notification) return;
  if (!notification.is_read) {
    await markRead(notification);
  }
  const userIdTarget = notification.user_id;
  const entityType = String(notification.related_entity_type || '').toLowerCase();
  const isAdminLikeRole = isAdminLike.value;
  const base = orgSlug.value ? `/${orgSlug.value}` : '';

  if (notification.type === 'support_ticket_forwarded_to_provider' && entityType === 'client' && notification.related_entity_id) {
    const clientId = Number(notification.related_entity_id || 0);
    if (!clientId) return;
    const dest = orgSlug.value ? `${base}/dashboard` : '/dashboard';
    await router.push({ path: dest, query: { ...route.query, clientId: String(clientId) } });
    return;
  }

  if (notification.type === 'chat_message' && entityType === 'chat_thread' && notification.related_entity_id) {
    const threadId = Number(notification.related_entity_id);
    const actorId = Number(notification.actor_user_id || notification.actorUserId || 0);
    if (!threadId) return;
    if (!actorId) {
      alert('Could not open chat: this notification is missing sender details.');
      return;
    }
    try {
      const meta = await api.get(`/chat/threads/${threadId}/meta`, { skipGlobalLoading: true });
      const parentAgencyId = meta.data?.agency_id;
      const organizationId = meta.data?.organization_id;
      if (!parentAgencyId) {
        alert('Could not open chat: missing agency for this thread.');
        return;
      }
      const name = String(notification.actor_display_name || '').trim();
      await router.push({
        path: route.path,
        query: {
          ...route.query,
          openChat: '1',
          openChatWith: String(actorId),
          agencyId: String(parentAgencyId),
          ...(organizationId ? { organizationId: String(organizationId) } : {}),
          ...(name ? { openChatWithName: name } : {})
        }
      });
    } catch (e) {
      alert(e.response?.data?.error?.message || e.message || 'Failed to open chat');
    }
    return;
  }

  if (entityType === 'client' && isAdminLikeRole) {
    const clientId = Number(notification.related_entity_id || 0);
    if (!clientId) return;
    adminClientLoading.value = true;
    try {
      const r = await api.get(`/clients/${clientId}`);
      const client = r.data || null;
      const slug = client?.organization_slug || client?.organizationSlug;
      if (notification.type === 'new_packet_uploaded' && slug) {
        router.push({ path: `/${slug}/dashboard`, query: { clientId: String(clientId) } });
      } else {
        adminSelectedClient.value = client;
      }
    } catch (e) {
      console.error('Failed to open client editor:', e);
      alert(e.response?.data?.error?.message || e.message || 'Failed to open client editor');
      adminSelectedClient.value = null;
    } finally {
      adminClientLoading.value = false;
    }
    return;
  }

  if (entityType === 'user' && userIdTarget && isAdminLikeRole) {
    router.push(`${base}/admin/users/${userIdTarget}`);
    return;
  }
  if (entityType === 'task' && userIdTarget && isAdminLikeRole) {
    router.push(`${base}/admin/users/${userIdTarget}`);
    return;
  }
  if (notification.type === 'support_ticket_created' && isAdminLikeRole) {
    router.push(`${base}/tickets`);
    return;
  }
  if (notification.type === 'office_availability_request_pending' && notification.agency_id) {
    const agencyId = notification.agency_id;
    router.push(`${base}/admin/availability-intake?agencyId=${agencyId}&tab=office`);
    return;
  }
  if (notification.type === 'school_availability_request_pending' && notification.agency_id) {
    const agencyId = notification.agency_id;
    router.push(`${base}/admin/availability-intake?agencyId=${agencyId}&tab=school`);
    return;
  }
  if ((notification.type === 'school_provider_availability_confirmed' || notification.type === 'school_provider_availability_updated') && notification.agency_id) {
    const agencyId = notification.agency_id;
    router.push(`${base}/admin/availability-intake?agencyId=${agencyId}&tab=school`);
    return;
  }
  if (notification.type === 'office_availability_request_approved') {
    router.push(`${base}/buildings/schedule`);
    return;
  }
  if (isAdminLikeRole && userIdTarget) {
    router.push(`${base}/admin/users/${userIdTarget}`);
  }
};

const openOfficeRequestModal = (n) => {
  officeRequestModal.value = {
    visible: true,
    requestId: Number(n.related_entity_id || 0),
    agencyId: Number(n.agency_id || 0)
  };
};

const denyOfficeRequest = async (n) => {
  const requestId = Number(n.related_entity_id || 0);
  const agencyId = Number(n.agency_id || 0);
  if (!requestId || !agencyId) return;
  try {
    await api.post(`/availability/admin/office-requests/${requestId}/deny`, { agencyId });
    n.is_resolved = true;
    myNotifications.value = myNotifications.value.filter((item) => item.id !== n.id);
    void loadMy();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to deny');
  }
};

const handleOfficeRequestResolved = () => {
  void loadMy();
  void notificationStore.fetchCounts();
};

const closeAdminClientEditor = () => {
  adminSelectedClient.value = null;
};

const handleAdminClientUpdated = (payload) => {
  if (payload?.client) {
    adminSelectedClient.value = payload.client;
  }
};

const myUnreadCount = computed(() => myNotifications.value.filter((n) => !n.is_read && !n.is_resolved).length);
const displayedTotalCount = computed(() => myNotifications.value.length);
const displayedUnreadCount = computed(() =>
  displayedMyNotifications.value.filter((n) => !n.is_read && !n.is_resolved).length
);

const isUnread = (n) => !!n && !n.is_read && !n.is_resolved;
const isUrgent = (n) => String(n?.severity || '').toLowerCase() === 'urgent';

const typeLabelMap = {
  new_packet_uploaded: 'New packet uploaded',
  support_ticket_created: 'Support ticket',
  support_ticket_forwarded_to_provider: 'Forwarded client message',
  office_availability_request_pending: 'Office request',
  school_availability_request_pending: 'School request',
  kudos_earned_admin_digest: 'Kudos earned',
  office_availability_request_approved: 'Office request approved',
  school_provider_availability_confirmed: 'School availability confirmed',
  school_provider_availability_updated: 'School availability updated',
  client_assigned: 'Client assigned',
  task_overdue: 'Task overdue',
  status_expired: 'Status expired',
  temp_password_expired: 'Temp password expired',
  onboarding_completed: 'Onboarding completed',
  invitation_expired: 'Invitation expired',
  pending_completed: 'Pending completed',
  payroll_unsigned_draft_notes_pending: 'Unsigned drafts',
  payroll_unsigned_draft_notes: 'Unsigned drafts',
  payroll_unpaid_notes_2_periods_old: 'Payroll notes',
  payroll_missing_notes_reminder: 'Payroll reminder',
  unsigned_draft_notes_pending: 'Unsigned drafts'
};

const humanizeSnake = (v) => String(v || '')
  .split('_')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const getTypeLabel = (type) => {
  const k = String(type || '').trim();
  return typeLabelMap[k] || humanizeSnake(k) || 'General';
};

const formatSeverityLabel = (severity) => {
  const s = String(severity || 'info').trim().toLowerCase();
  if (!s) return 'Info';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const typeChips = computed(() => {
  const map = new Map();
  for (const n of myNotifications.value || []) {
    const t = String(n?.type || '').trim() || 'general';
    map.set(t, (map.get(t) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count, label: getTypeLabel(type) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
});

const displayedMyNotifications = computed(() => {
  if (activeTypeFilter.value === 'all') return myNotifications.value;
  return myNotifications.value.filter((n) => String(n?.type || '').trim() === activeTypeFilter.value);
});

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

const toggleClientLabelMode = () => {
  const next = clientLabelMode.value === 'codes' ? 'initials' : 'codes';
  clientLabelMode.value = next;
  try {
    window.localStorage.setItem('notificationsClientLabelMode', next);
  } catch {
    // ignore
  }
};

const formatClientLabel = (n) => {
  const initials = String(n?.client_initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(n?.client_identifier_code || '').replace(/\s+/g, '').toUpperCase();
  if (clientLabelMode.value === 'initials') return initials || code || '';
  return code || initials || '';
};

/** For client_assigned: show "assigned to [Provider]" when admin views provider's notification, not "assigned to you" */
const formatDisplayMessage = (n) => {
  const msg = String(n?.message || '').trim();
  if (n?.type !== 'client_assigned' || !n?.user_id) return msg;
  const currentUserId = authStore.user?.id;
  if (currentUserId && Number(n.user_id) === Number(currentUserId)) return msg;
  const providerName = n.recipient_display_name || `User ${n.user_id}`;
  return msg.replace(/was assigned to you/gi, `was assigned to ${providerName}`);
};

const formatNotificationLine = (n) => {
  const parts = [];
  const label = formatClientLabel(n);
  if (label) parts.push(label);
  const orgName = String(n?.organization_name || n?.agency_name || '').trim();
  if (orgName) parts.push(orgName);
  const msg = formatDisplayMessage(n);
  if (msg) parts.push(msg);
  const actorName = String(n?.actor_display_name || '').trim();
  if (actorName) parts.push(`By: ${actorName}`);
  return parts.join(' • ');
};

// --- Toast Settings Modal ---
const toastSettingsOpen = ref(false);
const toastSettingsLoading = ref(false);
const toastSettingsSaving = ref(false);
const toastSettingsSaved = ref(false);
const toastSettingsError = ref('');
const defaultToastForm = () => ({
  login_logout: { toast_enabled: true, duration_mode: 'timed', duration_seconds: 6, sound_enabled: true },
  new_packet: { toast_enabled: false, duration_mode: 'dismissable', duration_seconds: 10, sound_enabled: false },
  notification_sound_enabled: true
});
const toastForm = ref(defaultToastForm());

const parseJsonField = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try { return JSON.parse(v); } catch { return null; }
};

watch(toastSettingsOpen, async (open) => {
  if (!open) return;
  toastSettingsLoading.value = true;
  toastSettingsError.value = '';
  toastSettingsSaved.value = false;
  try {
    const uid = userId.value;
    if (!uid) return;
    const resp = await api.get(`/users/${uid}/preferences`, { skipGlobalLoading: true });
    const data = resp.data || {};
    const raw = parseJsonField(data.toast_preferences);
    const defaults = defaultToastForm();
    if (raw && typeof raw === 'object') {
      const ll = { ...defaults.login_logout, ...(raw.login_logout || {}) };
      const np = { ...defaults.new_packet, ...(raw.new_packet || {}) };
      ll.duration_mode = ll.duration_seconds === null ? 'dismissable' : 'timed';
      np.duration_mode = np.duration_seconds === null ? 'dismissable' : 'timed';
      if (ll.duration_mode === 'timed' && !ll.duration_seconds) ll.duration_seconds = 6;
      if (np.duration_mode === 'timed' && !np.duration_seconds) np.duration_seconds = 10;
      toastForm.value = { login_logout: ll, new_packet: np, notification_sound_enabled: data.notification_sound_enabled !== false };
    } else {
      toastForm.value = { ...defaults, notification_sound_enabled: data.notification_sound_enabled !== false };
    }
  } catch {
    toastSettingsError.value = 'Failed to load settings';
  } finally {
    toastSettingsLoading.value = false;
  }
});

const saveToastSettings = async () => {
  const uid = userId.value;
  if (!uid) return;
  toastSettingsSaving.value = true;
  toastSettingsError.value = '';
  toastSettingsSaved.value = false;
  try {
    const f = toastForm.value;
    const payload = {
      notification_sound_enabled: !!f.notification_sound_enabled,
      toast_preferences: {
        login_logout: {
          toast_enabled: !!f.login_logout.toast_enabled,
          duration_seconds: f.login_logout.duration_mode === 'dismissable' ? null : (Number(f.login_logout.duration_seconds) || 6),
          sound_enabled: !!f.login_logout.sound_enabled
        },
        new_packet: {
          toast_enabled: !!f.new_packet.toast_enabled,
          duration_seconds: f.new_packet.duration_mode === 'dismissable' ? null : (Number(f.new_packet.duration_seconds) || 10),
          sound_enabled: !!f.new_packet.sound_enabled
        }
      }
    };
    await api.put(`/users/${uid}/preferences`, payload);
    userPreferencesStore.setFromApi({ ...payload });
    toastSettingsSaved.value = true;
    setTimeout(() => { toastSettingsSaved.value = false; }, 2000);
  } catch (e) {
    toastSettingsError.value = e.response?.data?.error?.message || 'Failed to save';
  } finally {
    toastSettingsSaving.value = false;
  }
};

onMounted(async () => {
  try {
    const saved = window.localStorage.getItem('notificationsClientLabelMode');
    if (saved === 'codes' || saved === 'initials') clientLabelMode.value = saved;
  } catch {
    // ignore
  }
  if (role.value === 'super_admin') {
    if (!agencyStore.agencies || agencyStore.agencies.length === 0) {
      await agencyStore.fetchAgencies().catch(() => {});
    }
  } else if (!agencyStore.userAgencies || agencyStore.userAgencies.length === 0) {
    await agencyStore.fetchUserAgencies().catch(() => {});
  }
  await Promise.all([loadMy(), loadCounts(), notificationStore.fetchCounts(), communicationsCountsStore.fetchCounts()]);
});

watch(
  () => clientLabelMode.value,
  () => {
    try {
      window.localStorage.setItem('notificationsClientLabelMode', clientLabelMode.value);
    } catch {
      // ignore
    }
  }
);
</script>

<style scoped>
.header { margin-bottom: 16px; }
.sub { color: var(--text-secondary); margin: 6px 0 0 0; }
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  align-items: start;
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.card-mine {
  grid-column: 1 / -1;
}
.card-compact .hint {
  margin-bottom: 8px;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.card-top-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pill {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.pill-unread {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 700;
}
.hint { color: var(--text-secondary); font-size: 13px; margin: 8px 0 12px 0; }
.loading, .empty { color: var(--text-secondary); }
.list { display: flex; flex-direction: column; gap: 6px; }
.card-mine .list {
  max-height: none;
  overflow: visible;
  padding-right: 0;
}
.notif-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "check title meta"
    "check msg meta";
  align-items: start;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  text-align: left;
  border-left: 4px solid transparent;
}
.notif-row:hover { border-color: var(--primary); }
.notif-row.unread {
  background: #f8fafc;
  border-left-color: #2563eb;
}
.notif-row.urgent {
  border-left-color: #dc2626;
  background: #fff7f7;
}
.col { display: flex; align-items: center; gap: 8px; min-width: 0; }
.col-check {
  grid-area: check;
  padding-top: 2px;
}
.notif-checkbox-wrap {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.notif-checkbox-wrap input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}
.col-title {
  grid-area: title;
  flex-wrap: wrap;
  align-items: center;
}
.col-msg {
  grid-area: msg;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.col-meta {
  grid-area: meta;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 12px;
  gap: 8px;
  min-width: 170px;
}
.actor-by {
  font-weight: 600;
  color: var(--text-primary);
}
.badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); font-weight: 700; }
.badge-urgent { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.badge-severity.sev-urgent { border-color: #fecaca; color: #b91c1c; }
.badge-severity.sev-warning { border-color: #fde68a; color: #92400e; background: #fffbeb; }
.badge-severity.sev-info { border-color: #cbd5e1; color: #334155; background: #f8fafc; }
.badge-type { border-color: #d1d5db; color: #374151; background: #f9fafb; }
.badge-unread { border-color: #93c5fd; color: #1d4ed8; background: #eff6ff; }
.badge-read { border-color: #d1d5db; color: #6b7280; background: #f9fafb; }
.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #2563eb;
  flex-shrink: 0;
}
.title-link {
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 14px;
  padding: 0;
  cursor: pointer;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.25;
}
.title-link:hover {
  color: var(--primary);
}
.link { background: none; border: none; color: var(--primary); cursor: pointer; padding: 0; }
.link:disabled { color: var(--text-secondary); cursor: default; }
.meta-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
  gap: 6px;
}
.mark-btn {
  font-weight: 700;
}
.type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.chip-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 5px 10px;
  background: white;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
.chip-btn.active {
  border-color: rgba(14, 165, 233, 0.5);
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
}
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
.platform-controls {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.field {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.select {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px 10px;
  background: white;
}
.tabs {
  display: inline-flex;
  gap: 6px;
}
.tab {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--bg-alt);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.tab.active {
  border-color: rgba(14, 165, 233, 0.5);
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.preview {
  margin-top: 8px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--bg-alt);
}
.preview-body {
  white-space: pre-wrap;
  color: var(--text-secondary);
  font-size: 12px;
}
@media (max-width: 900px) {
  .notif-row {
    grid-template-columns: auto 1fr;
    grid-template-areas:
      "check title"
      "check msg"
      "check meta";
    gap: 6px;
  }
  .col-meta {
    justify-content: flex-start;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
  }
  .meta-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

/* Toast Settings Modal */
.toast-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.toast-modal {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.25);
  width: 520px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.toast-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
}
.toast-modal-header h2 {
  margin: 0;
  font-size: 18px;
}
.toast-modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.toast-modal-close:hover { color: var(--text-primary); }
.toast-modal-body {
  padding: 18px 22px;
  overflow-y: auto;
  flex: 1;
}
.toast-modal-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid var(--border);
}
.ts-all-prefs {
  margin-left: auto;
  font-size: 12px;
}
.ts-saved { color: #16a34a; font-size: 13px; font-weight: 600; }
.ts-error { color: #dc2626; font-size: 13px; }
.ts-group {
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.ts-group:last-child { border-bottom: none; }
.ts-group-title {
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
  font-size: 14px;
}
.ts-group-help {
  color: var(--text-secondary);
  font-size: 12px;
  margin: 0 0 8px 0;
}
.ts-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 2px;
}
.ts-field {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-size: 13px;
}
.ts-field select,
.ts-field input[type="number"] {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
}
.ts-field input[type="number"] {
  width: 80px;
}
</style>

