<template>
  <div class="notifications-view">
    <div class="view-header" data-tour="notifications-header">
      <h1 data-tour="notifications-title">Notifications</h1>
      <div v-if="agencies.length > 1" class="agency-selector" data-tour="notifications-agency-filter">
        <label>Filter by Agency:</label>
        <select v-model="selectedAgencyId" @change="handleAgencyChange" class="agency-select">
          <option :value="null">All Agencies</option>
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="filters-section" data-tour="notifications-filters">
      <div class="filter-group">
        <label>Type:</label>
        <select v-model="filters.type" @change="applyFilters" class="filter-select">
          <option :value="null">All Types</option>
          <option value="status_expired">Status Expired</option>
          <option value="temp_password_expired">Temp Password Expired</option>
          <option value="task_overdue">Task Overdue</option>
          <option value="onboarding_completed">Onboarding Completed</option>
          <option value="pending_completed">Pending Completed</option>
          <option value="invitation_expired">Invitation Expired</option>
          <option value="first_login">First Login</option>
          <option value="first_login_pending">First Login (Pending)</option>
          <option value="password_changed">Password Changed</option>
          <option value="support_ticket_created">Support Tickets</option>
          <option value="office_availability_request_pending">Office Requests</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Status:</label>
        <select v-model="filters.status" @change="applyFilters" class="filter-select">
          <option :value="null">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Group By:</label>
        <select v-model="groupBy" @change="applyFilters" class="filter-select">
          <option value="type">Type</option>
          <option value="user">User</option>
        </select>
      </div>
      <div class="bulk-actions" v-if="selectedAgencyId && filteredNotifications.length > 0">
        <button @click="markAllAsRead" class="btn btn-secondary btn-sm">
          Mark All as Read ({{ filteredNotifications.length }})
        </button>
        <button @click="markAllAsResolved" class="btn btn-danger btn-sm">
          Mark All as Resolved ({{ filteredNotifications.length }})
        </button>
      </div>

      <div class="bulk-actions">
        <button
          v-if="canPurgeNotifications"
          @click="purgeAllNotifications"
          class="btn btn-danger btn-sm"
          :disabled="purging"
          title="Permanently deletes notifications (and SMS logs by default)"
        >
          {{ purging ? 'Purging...' : purgeButtonLabel }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading notifications...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="groupedNotifications.length === 0" class="empty-state">
      <p>No notifications found.</p>
    </div>
    <div v-else class="notifications-list" data-tour="notifications-list">
      <div
        v-for="group in groupedNotifications"
        :key="groupBy === 'user' ? group.userId : group.type"
        class="notification-group"
        data-tour="notifications-group"
      >
        <h2 class="group-title">
          <span v-if="groupBy === 'user'">
            {{ group.userName }} ({{ group.notifications.length }} notification{{ group.notifications.length !== 1 ? 's' : '' }})
          </span>
          <span v-else>{{ getTypeLabel(group.type) }}</span>
        </h2>
        <div v-if="groupBy === 'user'" class="user-bulk-actions">
          <button 
            @click="markAllAsReadForUser(group.userId)" 
            class="btn btn-sm btn-secondary"
          >
            Mark All as Read ({{ group.notifications.length }})
          </button>
          <button 
            @click="markAllAsResolvedForUser(group.userId)" 
            class="btn btn-sm btn-danger"
          >
            Mark All as Resolved ({{ group.notifications.length }})
          </button>
        </div>
        <div class="group-notifications">
          <div
            v-for="notification in group.notifications"
            :key="notification.id"
            class="notification-item"
            data-tour="notifications-item"
            :class="{
              'unread': !notification.is_read && !notification.is_resolved && (!notification.muted_until || new Date(notification.muted_until) <= new Date()),
              'resolved': notification.is_resolved,
              'muted': notification.muted_until && new Date(notification.muted_until) > new Date()
            }"
            @click="handleNotificationClick(notification)"
          >
            <div class="notification-content">
              <div class="notification-header">
                <span :class="['severity-badge', `severity-${notification.severity}`]">
                  {{ notification.severity }}
                </span>
                <h3 class="notification-title">{{ notification.title }}</h3>
                <span v-if="!notification.is_read && !notification.is_resolved" class="unread-indicator"></span>
              </div>
              <p class="notification-message">{{ notification.message }}</p>
              <div class="notification-meta">
                <span class="meta-item">
                  <strong>Agency:</strong> {{ getAgencyName(notification.agency_id) }}
                </span>
                <span v-if="notification.user_id" class="meta-item">
                  <strong>User:</strong> {{ getUserName(notification.user_id) }}
                </span>
                <span class="meta-item">
                  <strong>Created:</strong> {{ formatDate(notification.created_at) }}
                </span>
              </div>
            </div>
            <div class="notification-actions">
              <template v-if="notification.type === 'office_availability_request_pending' && canManageAvailability && notification.agency_id">
                <button
                  @click.stop="openOfficeRequestModal(notification)"
                  class="btn btn-sm btn-secondary"
                  title="View request details"
                >
                  View
                </button>
                <button
                  @click.stop="openOfficeRequestModal(notification)"
                  class="btn btn-sm btn-primary"
                  title="Assign office"
                >
                  Approve
                </button>
                <button
                  @click.stop="denyOfficeRequest(notification)"
                  class="btn btn-sm btn-danger"
                  title="Deny request"
                >
                  Deny
                </button>
              </template>
              <template v-else>
                <button
                  @click.stop="viewNotification(notification)"
                  class="btn btn-sm btn-primary"
                  title="Navigate to source"
                >
                  View
                </button>
                <button
                  v-if="!notification.is_read || (notification.muted_until && new Date(notification.muted_until) > new Date())"
                  @click.stop="markAsRead(notification.id)"
                  class="btn btn-sm btn-secondary"
                  title="Mute for 48 hours"
                >
                  Mark as Read
                </button>
                <button
                  @click.stop="resolveNotification(notification.id)"
                  class="btn btn-sm btn-danger"
                  title="Permanently delete notification"
                >
                  Resolve
                </button>
              </template>
            </div>
          </div>
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
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useNotificationStore } from '../../store/notifications';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import OfficeRequestAssignModal from '../../components/admin/OfficeRequestAssignModal.vue';

const router = useRouter();
const route = useRoute();
const notificationStore = useNotificationStore();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const selectedAgencyId = ref(null);
const filters = ref({
  type: null,
  status: null
});
const groupBy = ref('type');
const agencies = ref([]);
const users = ref([]);
const purging = ref(false);
const officeRequestModal = ref({ visible: false, requestId: null, agencyId: null });

const canManageAvailability = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff'].includes(r);
});

const canPurgeNotifications = computed(() => {
  const role = authStore.user?.role;
  if (!role) return false;
  if (role === 'super_admin') return true;
  // Non-super_admin can only purge when an agency is selected (not "All Agencies")
  return (role === 'admin' || role === 'support') && !!selectedAgencyId.value;
});

const purgeButtonLabel = computed(() => {
  if (authStore.user?.role === 'super_admin' && !selectedAgencyId.value) return 'Purge ALL Notifications';
  if (selectedAgencyId.value) return 'Purge Notifications (Agency)';
  return 'Purge Notifications';
});

const filteredNotifications = computed(() => {
  let notifications = notificationStore.notificationsByAgency;

  // Apply type filter
  if (filters.value.type) {
    notifications = notifications.filter(n => n.type === filters.value.type);
  }

  // Apply status filter
  // Filter out muted notifications (muted_until > now) unless showing all
  const now = new Date();
  notifications = notifications.filter(n => {
    if (n.muted_until && new Date(n.muted_until) > now) {
      return false; // Hide muted notifications
    }
    return true;
  });
  
  if (filters.value.status === 'unread') {
    notifications = notifications.filter(n => !n.is_read && !n.is_resolved);
  } else if (filters.value.status === 'read') {
    notifications = notifications.filter(n => n.is_read && !n.is_resolved);
  } else if (filters.value.status === 'resolved') {
    notifications = notifications.filter(n => n.is_resolved);
  }

  return notifications;
});

const groupedNotifications = computed(() => {
  if (groupBy.value === 'user') {
    // Group by user - show users with tasks that need completion
    const userGroups = {};
    
    filteredNotifications.value.forEach(notification => {
      // Only show notifications for users with tasks that need completion
      // Focus on task_overdue, status_expired, temp_password_expired
      if (notification.user_id && 
          (notification.type === 'task_overdue' || 
           notification.type === 'status_expired' || 
           notification.type === 'temp_password_expired' ||
           notification.type === 'pending_completed')) {
        const userId = notification.user_id;
        if (!userGroups[userId]) {
          userGroups[userId] = {
            userId,
            userName: getUserName(userId),
            notifications: []
          };
        }
        userGroups[userId].notifications.push(notification);
      }
    });
    
    // Convert to array and sort by user name
    return Object.values(userGroups)
      .map(group => ({
        ...group,
        notifications: group.notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName));
  } else {
    // Group by type (default)
    const groups = {};

    filteredNotifications.value.forEach(notification => {
      if (!groups[notification.type]) {
        groups[notification.type] = [];
      }
      groups[notification.type].push(notification);
    });

    // Convert to array and filter out empty groups
    return Object.entries(groups)
      .filter(([_, notifications]) => notifications.length > 0)
      .map(([type, notifications]) => ({
        type,
        notifications: notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      }));
  }
});

const getTypeLabel = (type) => {
  const labels = {
    status_expired: 'Status Expirations',
    temp_password_expired: 'Temporary Password Expirations',
    task_overdue: 'Overdue Tasks',
    onboarding_completed: 'Onboarding Completed',
    pending_completed: 'Pre-Hire Process Completed',
    invitation_expired: 'Invitation Expirations',
    first_login: 'First Login',
    first_login_pending: 'First Login (Pending)',
    password_changed: 'Password Changed',
    support_ticket_created: 'Support Tickets'
  };
  return labels[type] || type;
};

const getAgencyName = (agencyId) => {
  const agency = agencies.value.find(a => a.id === agencyId);
  return agency?.name || `Agency ${agencyId}`;
};

const getUserName = (userId) => {
  const user = users.value.find(u => u.id === userId);
  if (user) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  }
  return `User ${userId}`;
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const handleAgencyChange = () => {
  notificationStore.setSelectedAgency(selectedAgencyId.value);
  loadNotifications();
};

const applyFilters = () => {
  // Filters are applied via computed property
};

const loadNotifications = async () => {
  try {
    loading.value = true;
    error.value = '';

    const filterParams = {
      type: filters.value.type || undefined,
      isRead: filters.value.status === 'read' ? true : filters.value.status === 'unread' ? false : undefined,
      isResolved: filters.value.status === 'resolved' ? true : undefined
    };
    
    // Only add agencyId if it's set
    if (selectedAgencyId.value) {
      filterParams.agencyId = selectedAgencyId.value;
    }

    await notificationStore.fetchNotifications(filterParams);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load notifications';
  } finally {
    loading.value = false;
  }
};

const markAsRead = async (notificationId) => {
  try {
    await notificationStore.markAsRead(notificationId);
    await loadNotifications(); // Reload to reflect muted status
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark as read';
  }
};

const viewNotification = async (notification) => {
  const navigationPath = await getNotificationNavigationPath(notification);
  if (navigationPath) {
    router.push(navigationPath);
  }
};

const resolveNotification = async (notificationId) => {
  const confirmed = confirm(
    'Are you sure you want to permanently delete this notification?\n\n' +
    'This action cannot be undone. You will not be re-notified about this issue.'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    await notificationStore.deleteNotification(notificationId);
    await loadNotifications(); // Reload to remove deleted notification
    await notificationStore.fetchCounts(); // Update counts
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete notification';
  }
};

const purgeAllNotifications = async () => {
  const isSuperAdmin = authStore.user?.role === 'super_admin';
  const scopeText = selectedAgencyId.value
    ? `agency "${getAgencyName(selectedAgencyId.value)}"`
    : 'ALL agencies';

  if (!selectedAgencyId.value && !isSuperAdmin) {
    error.value = 'Select an agency to purge notifications (only super admins can purge globally).';
    return;
  }

  const confirmed = confirm(
    `DANGER: This will permanently delete notifications for ${scopeText}.\n\n` +
    `This is intended for cleanup (ex: bulk imports).\n\n` +
    `Type PURGE to confirm.`
  );
  if (!confirmed) return;

  const typed = prompt('Type PURGE to confirm:');
  if (typed !== 'PURGE') return;

  try {
    purging.value = true;
    error.value = '';
    const params = {};
    if (selectedAgencyId.value) params.agencyId = selectedAgencyId.value;
    params.includeSmsLogs = true;

    await api.delete('/notifications/purge', { params });
    await loadNotifications();
    await notificationStore.fetchCounts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to purge notifications';
  } finally {
    purging.value = false;
  }
};

const getNotificationNavigationPath = async (notification) => {
  // Determine where to navigate based on notification type and related entity
  if (notification.type === 'task_overdue' && notification.related_entity_type === 'task' && notification.related_entity_id) {
    // For overdue tasks, navigate to user's documents tab with task ID
    if (notification.user_id) {
      return `/admin/users/${notification.user_id}?tab=documents&taskId=${notification.related_entity_id}`;
    }
  } else if (notification.type === 'status_expired' && notification.user_id) {
    // For expired status, navigate to user's account tab
    return `/admin/users/${notification.user_id}?tab=account`;
  } else if (notification.type === 'temp_password_expired' && notification.user_id) {
    // For expired temp password, navigate to user's account tab
    return `/admin/users/${notification.user_id}?tab=account`;
  } else if (notification.type === 'onboarding_completed' && notification.user_id) {
    // For onboarding completed, navigate to user's profile
    return `/admin/users/${notification.user_id}`;
  } else if (notification.type === 'pending_completed' && notification.user_id) {
    // For pending completed, navigate to user's profile
    return `/admin/users/${notification.user_id}`;
  } else if (notification.type === 'support_ticket_created' && notification.related_entity_type === 'support_ticket' && notification.related_entity_id) {
    // Ticketing: open the support ticket queue and auto-open the ticket.
    return `/admin/support-tickets?status=open&ticketId=${encodeURIComponent(String(notification.related_entity_id))}`;
  } else if (notification.type === 'office_availability_request_pending' && notification.agency_id) {
    // Office request: navigate to Availability Intake (Office Requests tab)
    const agencyId = notification.agency_id;
    const base = route.params.organizationSlug ? `/${route.params.organizationSlug}/admin/settings` : '/admin/settings';
    return `${base}?category=workflow&item=availability-intake&agencyId=${agencyId}`;
  } else if (notification.related_entity_type === 'chat_thread' && notification.related_entity_id) {
    // Platform chat deeplink
    try {
      const meta = await api.get(`/chat/threads/${notification.related_entity_id}/meta`);
      const slug = meta.data?.organization_slug || null;
      const agencyId = meta.data?.agency_id || notification.agency_id || '';
      const threadId = meta.data?.thread_id || notification.related_entity_id;
      if (slug) return `/${slug}/admin/communications/chats?threadId=${encodeURIComponent(String(threadId))}&agencyId=${encodeURIComponent(String(agencyId))}`;
      return `/admin/communications/chats?threadId=${encodeURIComponent(String(threadId))}&agencyId=${encodeURIComponent(String(agencyId))}`;
    } catch {
      const agencyId = notification.agency_id || '';
      return `/admin/communications/chats?threadId=${encodeURIComponent(String(notification.related_entity_id))}&agencyId=${encodeURIComponent(String(agencyId))}`;
    }
  } else if (notification.user_id) {
    // Default: navigate to user profile
    return `/admin/users/${notification.user_id}`;
  }
  
  // If no user_id, stay on notifications page
  return null;
};


const markAllAsRead = async () => {
  if (!selectedAgencyId.value) return;
  
  const confirmed = confirm(
    `Are you sure you want to mark all ${filteredNotifications.value.length} filtered notifications as read?\n\n` +
    'They will be muted for 48 hours.'
  );
  
  if (!confirmed) return;
  
  try {
    const filterParams = {
      type: filters.value.type || undefined,
      userId: undefined,
      relatedEntityType: undefined,
      relatedEntityId: undefined
    };
    
    await notificationStore.markAllAsRead(selectedAgencyId.value, filterParams);
    await loadNotifications();
    await notificationStore.fetchCounts();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark all as read';
  }
};

const markAllAsResolved = async () => {
  if (!selectedAgencyId.value) return;
  
  const confirmed = confirm(
    `Are you sure you want to permanently resolve all ${filteredNotifications.value.length} filtered notifications?\n\n` +
    'This action cannot be undone. You will not be re-notified about these issues.'
  );
  
  if (!confirmed) return;
  
  try {
    const filterParams = {
      type: filters.value.type || undefined,
      userId: undefined,
      relatedEntityType: undefined,
      relatedEntityId: undefined
    };
    
    await notificationStore.markAllAsResolved(selectedAgencyId.value, filterParams);
    await loadNotifications();
    await notificationStore.fetchCounts();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark all as resolved';
  }
};

const markAllAsReadForUser = async (userId) => {
  if (!selectedAgencyId.value) return;
  
  const userNotifications = filteredNotifications.value.filter(n => n.user_id === userId);
  const confirmed = confirm(
    `Are you sure you want to mark all ${userNotifications.length} notifications for this user as read?\n\n` +
    'They will be muted for 48 hours.'
  );
  
  if (!confirmed) return;
  
  try {
    const filterParams = {
      type: filters.value.type || undefined,
      userId: userId,
      relatedEntityType: undefined,
      relatedEntityId: undefined
    };
    
    await notificationStore.markAllAsRead(selectedAgencyId.value, filterParams);
    await loadNotifications();
    await notificationStore.fetchCounts();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark all as read';
  }
};

const markAllAsResolvedForUser = async (userId) => {
  if (!selectedAgencyId.value) return;
  
  const userNotifications = filteredNotifications.value.filter(n => n.user_id === userId);
  const confirmed = confirm(
    `Are you sure you want to permanently resolve all ${userNotifications.length} notifications for this user?\n\n` +
    'This action cannot be undone. You will not be re-notified about these issues.'
  );
  
  if (!confirmed) return;
  
  try {
    const filterParams = {
      type: filters.value.type || undefined,
      userId: userId,
      relatedEntityType: undefined,
      relatedEntityId: undefined
    };
    
    await notificationStore.markAllAsResolved(selectedAgencyId.value, filterParams);
    await loadNotifications();
    await notificationStore.fetchCounts();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark all as resolved';
  }
};

const openOfficeRequestModal = (notification) => {
  officeRequestModal.value = {
    visible: true,
    requestId: Number(notification.related_entity_id || 0),
    agencyId: Number(notification.agency_id || 0)
  };
};

const denyOfficeRequest = async (notification) => {
  const requestId = Number(notification.related_entity_id || 0);
  const agencyId = Number(notification.agency_id || 0);
  if (!requestId || !agencyId) return;
  try {
    await api.post(`/availability/admin/office-requests/${requestId}/deny`, { agencyId });
    await loadNotifications();
    await notificationStore.fetchCounts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to deny';
  }
};

const handleOfficeRequestResolved = () => {
  void loadNotifications();
  void notificationStore.fetchCounts();
};

const handleNotificationClick = async (notification) => {
  // Mark as read when clicked
  if (!notification.is_read) {
    await markAsRead(notification.id);
  }

  // Navigate based on notification type
  if (notification.type === 'office_availability_request_pending' && notification.agency_id) {
    if (canManageAvailability.value) {
      openOfficeRequestModal(notification);
    } else {
      const agencyId = notification.agency_id;
      const base = route.params.organizationSlug ? `/${route.params.organizationSlug}/admin/settings` : '/admin/settings';
      router.push(`${base}?category=workflow&item=availability-intake&agencyId=${agencyId}`);
    }
    return;
  }
  if (notification.related_entity_type === 'user' && notification.user_id) {
    router.push(`/admin/users/${notification.user_id}`);
  } else if (notification.related_entity_type === 'task' && notification.related_entity_id) {
    // Navigate to user's tasks or profile
    if (notification.user_id) {
      router.push(`/admin/users/${notification.user_id}`);
    }
  } else if (notification.user_id) {
    router.push(`/admin/users/${notification.user_id}`);
  }
};

const fetchAgencies = async () => {
  try {
    if (authStore.user?.role === 'super_admin') {
      const response = await api.get('/agencies');
      agencies.value = response.data;
    } else {
      await agencyStore.fetchAgencies(authStore.user?.id);
      agencies.value = agencyStore.agencies;
    }
  } catch (err) {
    console.error('Error fetching agencies:', err);
  }
};

const fetchUsers = async () => {
  try {
    const response = await api.get('/users');
    users.value = response.data;
  } catch (err) {
    console.error('Error fetching users:', err);
  }
};

onMounted(async () => {
  // Check for query parameters from route
  if (route.query.agencyId) {
    selectedAgencyId.value = parseInt(route.query.agencyId);
    notificationStore.setSelectedAgency(selectedAgencyId.value);
  } else {
    selectedAgencyId.value = notificationStore.selectedAgencyId;
  }
  
  if (route.query.type) {
    filters.value.type = route.query.type;
  }
  
  await fetchAgencies();
  await fetchUsers();
  await loadNotifications();
  await notificationStore.fetchCounts();
});

watch(() => notificationStore.selectedAgencyId, (newAgencyId) => {
  selectedAgencyId.value = newAgencyId;
});

// Watch for route query changes
watch(() => route.query, (newQuery) => {
  if (newQuery.agencyId) {
    selectedAgencyId.value = parseInt(newQuery.agencyId);
    notificationStore.setSelectedAgency(selectedAgencyId.value);
  }
  if (newQuery.type) {
    filters.value.type = newQuery.type;
  }
  loadNotifications();
}, { immediate: false });
</script>

<style scoped>
.notifications-view {
  padding: 24px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--border);
}

.view-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.agency-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.agency-selector label {
  font-weight: 500;
  color: var(--text-secondary);
}

.agency-select {
  padding: 8px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.filters-section {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group label {
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 14px;
}

.filter-select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.bulk-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.user-bulk-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.loading,
.error,
.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.error {
  color: #dc3545;
  background: #f8d7da;
  border-radius: 8px;
  border: 1px solid #f5c6cb;
}

.notifications-list {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.notification-group {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.group-title {
  margin: 0 0 20px;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border);
}

.group-notifications {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.notification-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px solid var(--border);
  transition: all 0.2s;
  cursor: pointer;
}

.notification-item:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.notification-item.unread {
  border-left: 4px solid #dc3545;
  background: white;
}

.notification-item.resolved {
  opacity: 0.6;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.severity-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.severity-info {
  background: #d1ecf1;
  color: #0c5460;
}

.severity-warning {
  background: #fff3cd;
  color: #856404;
}

.severity-urgent {
  background: #f8d7da;
  color: #721c24;
}

.notification-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.unread-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #dc3545;
  flex-shrink: 0;
}

.notification-message {
  margin: 8px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.notification-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.meta-item {
  display: flex;
  gap: 4px;
}

.notification-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 16px;
}
</style>
