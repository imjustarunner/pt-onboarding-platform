import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref([]);
  const counts = ref({});
  const loading = ref(false);
  const selectedAgencyId = ref(null);

  const unreadCount = computed(() => {
    if (selectedAgencyId.value) {
      return counts.value[selectedAgencyId.value] || 0;
    }
    // Sum all counts if no agency selected
    return Object.values(counts.value).reduce((sum, count) => sum + count, 0);
  });

  const notificationsByAgency = computed(() => {
    if (!selectedAgencyId.value) {
      return notifications.value;
    }
    return notifications.value.filter(n => n.agency_id === selectedAgencyId.value);
  });

  const notificationsByType = computed(() => {
    const grouped = {
      status_expired: [],
      temp_password_expired: [],
      task_overdue: [],
      onboarding_completed: [],
      invitation_expired: []
    };

    notificationsByAgency.value.forEach(notification => {
      if (grouped[notification.type]) {
        grouped[notification.type].push(notification);
      }
    });

    return grouped;
  });

  const unreadNotifications = computed(() => {
    return notificationsByAgency.value.filter(n => !n.is_read && !n.is_resolved);
  });

  const fetchNotifications = async (filters = {}) => {
    try {
      loading.value = true;
      const params = new URLSearchParams();
      
      if (filters.agencyId) {
        params.append('agencyId', filters.agencyId);
      }
      if (filters.type) {
        params.append('type', filters.type);
      }
      if (filters.isRead !== undefined) {
        params.append('isRead', filters.isRead);
      }
      if (filters.isResolved !== undefined) {
        params.append('isResolved', filters.isResolved);
      }
      if (filters.limit) {
        params.append('limit', String(filters.limit));
      }

      const response = await api.get(`/notifications?${params.toString()}`);
      notifications.value = response.data;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    } finally {
      loading.value = false;
    }
  };

  const fetchCounts = async () => {
    try {
      const response = await api.get('/notifications/counts');
      counts.value = response.data;
    } catch (error) {
      console.error('Error fetching notification counts:', error);
      throw error;
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      
      // Update local state - set muted_until to 48 hours from now
      const notification = notifications.value.find(n => n.id === notificationId);
      if (notification) {
        const mutedUntil = new Date();
        mutedUntil.setHours(mutedUntil.getHours() + 48);
        
        notification.is_read = true;
        notification.read_at = new Date().toISOString();
        notification.muted_until = mutedUntil.toISOString();
        
        // Update count
        if (counts.value[notification.agency_id] > 0) {
          counts.value[notification.agency_id]--;
        }
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  };

  const markAsResolved = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/resolved`);
      
      // Update local state
      const notification = notifications.value.find(n => n.id === notificationId);
      if (notification) {
        notification.is_resolved = true;
        notification.resolved_at = new Date().toISOString();
        
        // Update count if not already read
        if (!notification.is_read && counts.value[notification.agency_id] > 0) {
          counts.value[notification.agency_id]--;
        }
      }
    } catch (error) {
      console.error('Error marking notification as resolved:', error);
      throw error;
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      
      // Remove from local state
      const notification = notifications.value.find(n => n.id === notificationId);
      if (notification) {
        notifications.value = notifications.value.filter(n => n.id !== notificationId);
        
        // Update count
        if (!notification.is_read && !notification.is_resolved && counts.value[notification.agency_id] > 0) {
          counts.value[notification.agency_id]--;
        }
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  };

  const markAllAsRead = async (agencyId, filters = {}) => {
    try {
      await api.put('/notifications/read-all', { agencyId, filters });
      
      // Update local state - set muted_until to 48 hours from now
      const mutedUntil = new Date();
      mutedUntil.setHours(mutedUntil.getHours() + 48);
      
      notifications.value.forEach(notification => {
        let shouldUpdate = notification.agency_id === agencyId && !notification.is_read;
        
        if (shouldUpdate && filters.type && notification.type !== filters.type) {
          shouldUpdate = false;
        }
        if (shouldUpdate && filters.userId && notification.user_id !== parseInt(filters.userId)) {
          shouldUpdate = false;
        }
        
        if (shouldUpdate) {
          notification.is_read = true;
          notification.read_at = new Date().toISOString();
          notification.muted_until = mutedUntil.toISOString();
        }
      });
      
      // Refresh counts
      await fetchCounts();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  };

  const markAllAsResolved = async (agencyId, filters = {}) => {
    try {
      await api.put('/notifications/resolve-all', { agencyId, filters });
      
      // Update local state
      notifications.value.forEach(notification => {
        let shouldUpdate = notification.agency_id === agencyId && !notification.is_resolved;
        
        if (shouldUpdate && filters.type && notification.type !== filters.type) {
          shouldUpdate = false;
        }
        if (shouldUpdate && filters.userId && notification.user_id !== parseInt(filters.userId)) {
          shouldUpdate = false;
        }
        
        if (shouldUpdate) {
          notification.is_resolved = true;
          notification.resolved_at = new Date().toISOString();
        }
      });
      
      // Refresh counts
      await fetchCounts();
    } catch (error) {
      console.error('Error marking all notifications as resolved:', error);
      throw error;
    }
  };

  const setSelectedAgency = (agencyId) => {
    selectedAgencyId.value = agencyId;
  };

  const clearNotifications = () => {
    notifications.value = [];
    counts.value = {};
  };

  /** Fetch latest notifications (for login/logout toast). Returns raw list, does not replace store. */
  const fetchLatestNotifications = async (limit = 10) => {
    try {
      const response = await api.get(`/notifications?limit=${limit}`, { skipGlobalLoading: true });
      return response.data || [];
    } catch (error) {
      console.error('Error fetching latest notifications:', error);
      return [];
    }
  };

  return {
    notifications,
    counts,
    loading,
    selectedAgencyId,
    unreadCount,
    notificationsByAgency,
    notificationsByType,
    unreadNotifications,
    fetchNotifications,
    fetchCounts,
    markAsRead,
    markAsResolved,
    markAllAsRead,
    markAllAsResolved,
    deleteNotification,
    setSelectedAgency,
    clearNotifications,
    fetchLatestNotifications
  };
});
