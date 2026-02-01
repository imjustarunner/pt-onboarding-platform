<template>
  <div class="supervisor-notifications-view">
    <div class="view-header" data-tour="teamnotif-header">
      <h1 data-tour="teamnotif-title">Notifications</h1>
      <div v-if="agencies.length > 1" class="agency-selector" data-tour="teamnotif-agency-filter">
        <label>Filter by Agency:</label>
        <select v-model="selectedAgencyId" @change="loadNotifications" class="agency-select">
          <option :value="null">All Agencies</option>
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading notifications...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="groupedNotifications.length === 0" class="empty-state">
      <p>No notifications at this time.</p>
    </div>
    <div v-else class="notifications-list" data-tour="teamnotif-list">
      <div
        v-for="group in groupedNotifications"
        :key="group.type"
        class="notification-group"
        data-tour="teamnotif-group"
      >
        <h2 class="group-title">{{ getTypeLabel(group.type) }}</h2>
        <div class="group-notifications">
          <div
            v-for="notification in group.notifications"
            :key="`${notification.type}-${notification.userId || notification.user_id}-${notification.relatedEntityId || notification.related_entity_id || 'none'}-${notification.id || 'none'}`"
            class="notification-item"
            data-tour="teamnotif-item"
            @click="handleNotificationClick(notification)"
          >
            <div class="notification-content">
              <div class="notification-header">
                <span :class="['severity-badge', `severity-${notification.severity || 'info'}`]">
                  {{ notification.severity || 'info' }}
                </span>
                <h3 class="notification-title">{{ notification.title }}</h3>
              </div>
              <p class="notification-message">{{ notification.message }}</p>
              <div class="notification-meta">
                <span class="meta-item" v-if="notification.userId || notification.user_id">
                  <strong>User:</strong> {{ getUserName(notification.userId || notification.user_id) || (notification.message ? notification.message.match(/User ([^\(]+)/)?.[1] : null) || `User ${notification.userId || notification.user_id}` }}
                </span>
                <span v-if="notification.dueDate || notification.due_date" class="meta-item">
                  <strong>Due Date:</strong> {{ formatDate(notification.dueDate || notification.due_date) }}
                </span>
                <span v-if="notification.created_at" class="meta-item">
                  <strong>Date:</strong> {{ formatDate(notification.created_at) }}
                </span>
              </div>
            </div>
            <div class="notification-action">
              <button class="btn btn-sm btn-primary">
                View Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import api from '../services/api';

const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const selectedAgencyId = ref(null);
const notifications = ref([]);
const agencies = ref([]);
const users = ref([]);

const groupedNotifications = computed(() => {
  // For CPAs, group all notification types
  // For supervisors, only show task_overdue and checklist_incomplete
  const isCPA = authStore.user?.role === 'clinical_practice_assistant';
  
  if (isCPA) {
    // Group all notification types for CPAs
    const groups = {};
    notifications.value.forEach(notification => {
      const type = notification.type || 'other';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(notification);
    });
    
    // Convert to array and sort by type
    return Object.entries(groups)
      .map(([type, notifications]) => ({
        type,
        notifications
      }))
      .sort((a, b) => {
        // Sort by severity/importance
        const order = ['urgent', 'warning', 'info'];
        const aNotification = a.notifications[0];
        const bNotification = b.notifications[0];
        const aSeverity = aNotification?.severity || 'info';
        const bSeverity = bNotification?.severity || 'info';
        return (order.indexOf(aSeverity) - order.indexOf(bSeverity)) || a.type.localeCompare(b.type);
      });
  } else {
    // Supervisors: only task_overdue and checklist_incomplete
    const groups = {
      task_overdue: [],
      checklist_incomplete: [],
      payroll_unpaid_notes_2_periods_old: []
    };

    notifications.value.forEach(notification => {
      if (groups[notification.type]) {
        groups[notification.type].push(notification);
      }
    });

    // Convert to array and filter out empty groups
    return Object.entries(groups)
      .filter(([_, notifications]) => notifications.length > 0)
      .map(([type, notifications]) => ({
        type,
        notifications
      }));
  }
});

const getTypeLabel = (type) => {
  const labels = {
    task_overdue: 'Overdue Tasks',
    checklist_incomplete: 'Incomplete Checklist Items',
    payroll_unpaid_notes_2_periods_old: 'Unpaid notes (2 pay periods old)',
    status_expired: 'Expired Statuses',
    temp_password_expired: 'Expired Temporary Passwords',
    passwordless_token_expired: 'Expired Passwordless Tokens',
    onboarding_completed: 'Onboarding Completed',
    invitation_expired: 'Expired Invitations',
    first_login_pending: 'First Login (Pending)',
    first_login: 'First Login',
    password_changed: 'Password Changed',
    pending_completed: 'Pending Process Completed'
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const getUserName = (userId) => {
  if (!userId) return null;
  const user = users.value.find(u => u.id === userId);
  if (user) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  }
  // If we don't have user data, try to extract from notification message
  // This is a fallback for when we can't fetch the users list
  return null; // Will be handled in template
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const loadNotifications = async () => {
  try {
    loading.value = true;
    error.value = '';

    const params = new URLSearchParams();
    if (selectedAgencyId.value) {
      params.append('agencyId', selectedAgencyId.value);
    }

    // CPAs should use the regular notifications endpoint to see all notifications
    // Supervisors use the supervisor-specific endpoint for task/checklist notifications
    if (authStore.user?.role === 'clinical_practice_assistant') {
      const response = await api.get(`/notifications?${params.toString()}`);
      notifications.value = response.data;
    } else {
      // Supervisors use supervisor-specific notifications
      const response = await api.get(`/notifications/supervisor?${params.toString()}`);
      notifications.value = response.data;
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load notifications';
  } finally {
    loading.value = false;
  }
};

const handleNotificationClick = (notification) => {
  // Navigate to user profile
  const userId = notification.userId || notification.user_id;
  if (userId) {
    router.push(`/admin/users/${userId}`);
  }
};

const fetchAgencies = async () => {
  try {
    await agencyStore.fetchUserAgencies();
    agencies.value = agencyStore.userAgencies;
    
    if (agencies.value.length > 0 && !selectedAgencyId.value) {
      selectedAgencyId.value = agencies.value[0].id;
    }
  } catch (err) {
    console.error('Error fetching agencies:', err);
  }
};

const fetchUsers = async () => {
  try {
    // Try to fetch users that supervisor/CPA can see
    // This may fail for supervisors who don't have access, which is okay
    const response = await api.get('/users');
    users.value = response.data.filter(u => 
      ['staff', 'facilitator', 'intern'].includes(u.role)
    );
  } catch (err) {
    // If we can't fetch users, that's okay - we'll extract user info from notifications
    console.warn('Could not fetch users list (this is normal for supervisors):', err.message);
    users.value = [];
  }
};

onMounted(async () => {
  await fetchAgencies();
  await fetchUsers();
  await loadNotifications();
});
</script>

<style scoped>
.supervisor-notifications-view {
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

.notification-action {
  flex-shrink: 0;
  margin-left: 16px;
}
</style>
