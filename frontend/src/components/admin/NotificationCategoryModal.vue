<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>{{ agencyName }} Notifications</h2>
        <button @click="$emit('close')" class="btn-close" title="Close">×</button>
      </div>
      
      <div v-if="loading" class="loading">Loading categories...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else class="category-cards-grid">
        <div
          v-for="category in categories"
          :key="category.type"
          class="category-card"
          :class="{ 'has-notifications': category.count > 0 }"
          @click="navigateToCategory(category.type)"
        >
          <div class="category-icon">
            <img
              v-if="getCategoryIconUrl(category.type)"
              :src="getCategoryIconUrl(category.type)"
              :alt="category.label"
              class="category-icon-image"
              :data-type="category.type"
              @error="handleIconError"
            />
            <span v-else class="category-icon-emoji">{{ getCategoryIcon(category.type) }}</span>
          </div>
          <div class="category-info">
            <h3 class="category-title">{{ category.label }}</h3>
            <p class="category-count">
              {{ category.count }} 
              {{ category.count === 1 ? 'notification' : 'notifications' }}
            </p>
          </div>
          <div class="category-badge" :class="{ 'has-notifications': category.count > 0 }">
            {{ category.count }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationStore } from '../../store/notifications';
import { useBrandingStore } from '../../store/branding';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  agencyId: {
    type: Number,
    default: null
  },
  agencyName: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close']);

const router = useRouter();
const notificationStore = useNotificationStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();

const loading = ref(false);
const error = ref('');
const categoryCounts = ref({});
const iconErrors = ref({});

const categories = computed(() => {
  const categoryTypes = [
    { type: 'status_expired', label: 'Status Expired' },
    { type: 'temp_password_expired', label: 'Temporary Password Expired' },
    { type: 'task_overdue', label: 'Overdue Tasks' },
    { type: 'onboarding_completed', label: 'Onboarding Completed' },
    { type: 'invitation_expired', label: 'Invitation Expired' },
    { type: 'first_login', label: 'First Login' },
    { type: 'first_login_pending', label: 'First Login (Pending)' },
    { type: 'password_changed', label: 'Password Changed' },
    { type: 'new_packet_uploaded', label: 'New Packet Uploaded' },
    { type: 'support_ticket_created', label: 'Support Tickets' },
    { type: 'office_availability_request_pending', label: 'Office Requests' }
  ];

  return categoryTypes.map(cat => ({
    ...cat,
    count: categoryCounts.value[cat.type] || 0
  }));
});

// Get icon URL for notification type (agency-level first, then platform-level, then emoji fallback)
const getCategoryIconUrl = (type) => {
  if (iconErrors.value[type]) {
    return null; // Don't retry if we already know it failed
  }

  // Use branding store helper to get notification icon URL
  return brandingStore.getNotificationIconUrl(type, props.agencyId);
};

// Emoji fallback
const getCategoryIcon = (type) => {
  const icons = {
    status_expired: '⏰',
    temp_password_expired: '🔑',
    task_overdue: '📋',
    onboarding_completed: '✅',
    invitation_expired: '📧',
    first_login: '👋',
    first_login_pending: '⏳',
    password_changed: '🔐',
    new_packet_uploaded: '📄',
    support_ticket_created: '🎟️',
    office_availability_request_pending: '🏢'
  };
  return icons[type] || '📢';
};

const handleIconError = (event) => {
  const type = event.target.dataset?.type;
  if (type) {
    iconErrors.value[type] = true;
  }
};

const fetchCategoryCounts = async () => {
  try {
    loading.value = true;
    error.value = '';

    // Build params - if agencyId is null, don't filter by agency
    const params = {
      isRead: false,
      isResolved: false
    };
    
    if (props.agencyId !== null) {
      params.agencyId = props.agencyId;
    }

    // Fetch notifications
    const response = await api.get('/notifications', { params });

    // Count by type
    const counts = {
      status_expired: 0,
      temp_password_expired: 0,
      task_overdue: 0,
      onboarding_completed: 0,
      invitation_expired: 0,
      first_login: 0,
      first_login_pending: 0,
      password_changed: 0,
      new_packet_uploaded: 0,
      support_ticket_created: 0,
      office_availability_request_pending: 0
    };

    response.data.forEach(notification => {
      if (counts.hasOwnProperty(notification.type)) {
        counts[notification.type]++;
      }
    });

    categoryCounts.value = counts;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load category counts';
    console.error('Error fetching category counts:', err);
  } finally {
    loading.value = false;
  }
};

const navigateToCategory = (type) => {
  if (props.agencyId !== null) {
    notificationStore.setSelectedAgency(props.agencyId);
    router.push({
      path: '/admin/notifications',
      query: {
        agencyId: props.agencyId,
        type: type
      }
    });
  } else {
    // All agencies - don't set agency filter
    router.push({
      path: '/admin/notifications',
      query: {
        type: type
      }
    });
  }
  emit('close');
};

onMounted(() => {
  fetchCategoryCounts();
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.loading,
.error {
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

.category-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.category-card {
  background: var(--bg-alt);
  border-radius: 8px;
  padding: 20px;
  border: 2px solid var(--border);
  transition: all 0.2s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.category-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--primary);
}

.category-card.has-notifications {
  background: white;
  border-color: var(--primary);
}

.category-icon {
  font-size: 32px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
}

.category-icon-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.category-icon-emoji {
  font-size: 32px;
  line-height: 1;
}

.category-info {
  flex: 1;
  width: 100%;
}

.category-title {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.category-count {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.category-badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  background: var(--bg-alt);
  color: var(--text-secondary);
  border: 2px solid var(--border);
  transition: all 0.2s;
}

.category-badge.has-notifications {
  background: #dc3545;
  color: white;
  border-color: #dc3545;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
}

@media (max-width: 768px) {
  .category-cards-grid {
    grid-template-columns: 1fr;
  }
}
</style>
