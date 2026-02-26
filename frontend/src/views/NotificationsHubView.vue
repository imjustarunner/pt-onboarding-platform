<template>
  <div class="container">
    <div class="header" data-tour="notifhub-header">
      <h1 data-tour="notifhub-title">Notifications</h1>
      <p class="sub">Alerts only. Use Communications workspace for texting, calls, and delivery queues.</p>
      <router-link class="btn btn-secondary btn-sm" :to="communicationsLink">Open Communications</router-link>
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
              v-if="myUnreadCount > 0"
              class="btn btn-primary btn-sm"
              type="button"
              @click="markAllAsRead"
            >
              Mark all read
            </button>
            <button
              v-if="selectedUnreadCount > 0"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="markSelectedAsRead"
            >
              Mark {{ selectedUnreadCount }} selected read
            </button>
            <router-link v-if="isAdminLike" class="btn btn-secondary btn-sm" :to="ticketsLink">
              Tickets
            </router-link>
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
            <div class="col col-check">
              <label v-if="isUnread(n)" class="notif-checkbox-wrap" :title="selectedIds.has(n.id) ? 'Deselect' : 'Select'">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(n.id)"
                  @change="toggleSelect(n.id)"
                />
              </label>
            </div>
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
                  <button class="btn btn-danger btn-sm" type="button" @click="dismissNotification(n)">
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

      <div v-if="showPlatformCard" class="card card-compact" data-tour="notifhub-card-platform">
        <div class="card-top">
          <h2>Delivery Alerts</h2>
          <span class="pill">{{ communicationsPendingCount }} pending</span>
        </div>
        <p class="hint">Pending emails and texts ready to send. Manage in Communications → Automation.</p>
        <router-link class="btn btn-primary" :to="communicationsAutomationLink">
          {{ communicationsPendingCount > 0 ? `Review ${communicationsPendingCount} pending` : 'Open Communications' }}
        </router-link>
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
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useNotificationStore } from '../store/notifications';
import { useCommunicationsCountsStore } from '../store/communicationsCounts';
import api from '../services/api';
import ClientDetailPanel from '../components/admin/ClientDetailPanel.vue';
import OfficeRequestAssignModal from '../components/admin/OfficeRequestAssignModal.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const notificationStore = useNotificationStore();
const communicationsCountsStore = useCommunicationsCountsStore();
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
const selectedIds = ref(new Set());
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
    await api.put(`/notifications/${n.id}/resolved`);
    n.is_resolved = true;
    n.resolved_at = new Date().toISOString();
    myNotifications.value = myNotifications.value.filter((item) => item.id !== n.id);
    void notificationStore.fetchCounts();
  } catch {
    // ignore
  }
};

const markAllAsRead = async () => {
  const unread = myNotifications.value.filter((n) => isUnread(n));
  if (!unread.length) return;
  // Use bulk read-all API per agency to avoid 403s on personal notifications for other users
  const agencyIds = [...new Set(unread.map((n) => n.agency_id).filter(Boolean))];
  await Promise.allSettled(agencyIds.map((aid) => api.put('/notifications/read-all', { agencyId: aid })));
  selectedIds.value = new Set();
  if (showUnreadForAdmin.value) {
    myNotifications.value = [];
  } else {
    unread.forEach((n) => {
      n.is_read = true;
      n.read_at = new Date().toISOString();
    });
  }
  void notificationStore.fetchCounts();
};

const toggleSelect = (id) => {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
};

const selectedUnreadCount = computed(() => {
  let count = 0;
  for (const id of selectedIds.value) {
    const n = myNotifications.value.find((x) => x.id === id);
    if (n && isUnread(n)) count++;
  }
  return count;
});

const markSelectedAsRead = async () => {
  const uid = userId.value;
  const toMark = myNotifications.value.filter(
    (n) => selectedIds.value.has(n.id) && isUnread(n) && (n.user_id == null || Number(n.user_id) === Number(uid))
  );
  if (!toMark.length) return;
  await Promise.allSettled(toMark.map((n) => markRead(n)));
  selectedIds.value = new Set();
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

  if (entityType === 'client' && isAdminLikeRole) {
    const clientId = Number(notification.related_entity_id || 0);
    if (!clientId) return;
    adminClientLoading.value = true;
    try {
      const r = await api.get(`/clients/${clientId}`);
      adminSelectedClient.value = r.data || null;
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
    router.push(`${base}/admin/settings?category=workflow&item=availability-intake&agencyId=${agencyId}`);
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

const isUnread = (n) => !!n && !n.is_read && !n.is_resolved;
const isUrgent = (n) => String(n?.severity || '').toLowerCase() === 'urgent';

const typeLabelMap = {
  new_packet_uploaded: 'New packet uploaded',
  support_ticket_created: 'Support ticket',
  office_availability_request_pending: 'Office request',
  client_assigned: 'Client assigned',
  task_overdue: 'Task overdue',
  status_expired: 'Status expired',
  temp_password_expired: 'Temp password expired',
  onboarding_completed: 'Onboarding completed',
  invitation_expired: 'Invitation expired',
  pending_completed: 'Pending completed',
  payroll_unsigned_draft_notes_pending: 'Unsigned drafts',
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
</style>

