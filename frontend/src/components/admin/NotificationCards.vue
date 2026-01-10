<template>
  <div class="notification-cards-container">
    <h2 v-if="totalNotifications > 0 || agencies.length > 0">Notifications</h2>
    <div v-if="loading" class="loading">Loading notifications...</div>
    <div v-else-if="agencies.length === 0" class="empty-state">
      <p>No agencies available.</p>
    </div>
    <div v-else-if="totalNotifications === 0 && !showAllAgenciesCard" class="empty-state">
      <p>No notifications at this time.</p>
    </div>
    <div v-else class="notification-cards-grid">
      <!-- All Agencies Card (if multiple agencies or super_admin) -->
      <div
        v-if="showAllAgenciesCard"
        class="notification-card all-agencies-card"
        @click="openCategoryModal(null, 'All Agencies')"
      >
        <div class="card-content">
          <div class="agency-icon-wrapper">
            <img
              v-if="allAgenciesNotificationsIconUrl"
              :src="allAgenciesNotificationsIconUrl"
              alt="All Agencies Notifications"
              class="agency-icon"
            />
            <div v-else class="agency-icon-placeholder all-agencies">
              🌐
            </div>
          </div>
          <div class="card-info">
            <h3 class="agency-name">All Agencies</h3>
            <p class="notification-count-text">
              {{ totalNotifications }} 
              {{ totalNotifications === 1 ? 'notification' : 'notifications' }}
            </p>
          </div>
          <div class="notification-badge has-notifications">
            {{ totalNotifications }}
          </div>
        </div>
      </div>

      <!-- Individual Agency Cards -->
      <div
        v-for="agency in agenciesWithNotifications"
        :key="agency.id"
        class="notification-card"
        :style="getCardStyle(agency)"
        @click="openCategoryModal(agency.id, agency.name)"
      >
        <div class="card-content">
          <div class="agency-icon-wrapper">
            <img
              v-if="getAgencyIconUrl(agency)"
              :src="getAgencyIconUrl(agency)"
              :alt="`${agency.name} icon`"
              class="agency-icon"
              @error="handleIconError"
            />
            <div v-else class="agency-icon-placeholder">
              {{ agency.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          <div class="card-info">
            <h3 class="agency-name">{{ agency.name }}</h3>
            <p class="notification-count-text">
              {{ getNotificationCount(agency.id) }} 
              {{ getNotificationCount(agency.id) === 1 ? 'notification' : 'notifications' }}
            </p>
          </div>
          <div class="notification-badge" :class="{ 'has-notifications': getNotificationCount(agency.id) > 0 }">
            {{ getNotificationCount(agency.id) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Category Modal -->
    <NotificationCategoryModal
      v-if="showCategoryModal"
      :agency-id="selectedAgencyId"
      :agency-name="selectedAgencyName"
      @close="closeCategoryModal"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useNotificationStore } from '../../store/notifications';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import NotificationCategoryModal from './NotificationCategoryModal.vue';
import api from '../../services/api';

const notificationStore = useNotificationStore();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const loading = ref(false);
const agencies = ref([]);
const iconErrors = ref({});
const showCategoryModal = ref(false);
const selectedAgencyId = ref(null);
const selectedAgencyName = ref('');

const totalNotifications = computed(() => {
  return Object.values(notificationStore.counts).reduce((sum, count) => sum + count, 0);
});

const showAllAgenciesCard = computed(() => {
  // Show "All Agencies" card if user is super_admin or has multiple agencies
  if (authStore.user?.role === 'super_admin') {
    return agencies.value.length > 1;
  }
  return agencies.value.length > 1;
});

const agenciesWithNotifications = computed(() => {
  // Show all agencies that have notifications OR all agencies if user is super_admin
  if (authStore.user?.role === 'super_admin') {
    return agencies.value;
  }
  // For regular admins, show all their agencies (they'll see counts)
  return agencies.value;
});

const allAgenciesNotificationsIconUrl = computed(() => {
  if (!brandingStore.platformBranding?.all_agencies_notifications_icon_path) {
    return null;
  }
  
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  
  let iconPath = brandingStore.platformBranding.all_agencies_notifications_icon_path;
  if (iconPath.startsWith('/uploads/')) {
    iconPath = iconPath.substring('/uploads/'.length);
  } else if (iconPath.startsWith('/')) {
    iconPath = iconPath.substring(1);
  }
  
  return `${apiBase}/uploads/${iconPath}`;
});

const getNotificationCount = (agencyId) => {
  if (agencyId === null) {
    return totalNotifications.value;
  }
  return notificationStore.counts[agencyId] || 0;
};

const getAgencyIconUrl = (agency) => {
  // Priority 1: Use agency icon_file_path (master icon)
  if (agency.icon_file_path) {
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
    
    let iconPath = agency.icon_file_path;
    if (iconPath.startsWith('/uploads/')) {
      iconPath = iconPath.substring('/uploads/'.length);
    } else if (iconPath.startsWith('/')) {
      iconPath = iconPath.substring(1);
    }
    
    return `${apiBase}/uploads/${iconPath}`;
  }
  
  // Priority 2: Use logo_url
  if (agency.logo_url) {
    if (agency.logo_url.startsWith('http://') || agency.logo_url.startsWith('https://')) {
      return agency.logo_url;
    }
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
    return `${apiBase}${agency.logo_url.startsWith('/') ? '' : '/'}${agency.logo_url}`;
  }
  
  return null;
};

const getCardStyle = (agency) => {
  const primaryColor = agency.primary_color || agency.color_palette?.primary || '#007bff';
  
  return {
    '--agency-color': primaryColor,
    '--agency-bg': `${primaryColor}08`, // 3% opacity
    borderLeftColor: primaryColor
  };
};

const handleIconError = (event) => {
  const agencyId = event.target.dataset?.agencyId;
  if (agencyId) {
    iconErrors.value[agencyId] = true;
  }
};

const openCategoryModal = (agencyId, agencyName) => {
  selectedAgencyId.value = agencyId;
  selectedAgencyName.value = agencyName;
  showCategoryModal.value = true;
};

const closeCategoryModal = () => {
  showCategoryModal.value = false;
  selectedAgencyId.value = null;
  selectedAgencyName.value = '';
};

const fetchAgencies = async () => {
  try {
    loading.value = true;
    
    // Get user's agencies based on role
    if (authStore.user?.role === 'super_admin') {
      // Super admin sees all agencies
      const response = await api.get('/agencies');
      agencies.value = response.data;
    } else {
      // Admin/support see their agencies
      await agencyStore.fetchAgencies(authStore.user?.id);
      agencies.value = agencyStore.agencies;
    }
  } catch (error) {
    console.error('Error fetching agencies:', error);
  } finally {
    loading.value = false;
  }
};

const fetchNotificationCounts = async () => {
  try {
    await notificationStore.fetchCounts();
  } catch (error) {
    // Silently fail - don't break the dashboard if notifications can't be loaded
    console.error('Error fetching notification counts:', error);
    // Set empty counts to prevent further errors
    notificationStore.counts = {};
  }
};

onMounted(async () => {
  // Fetch platform branding to get the all agencies notifications icon
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
  await fetchAgencies();
  await fetchNotificationCounts();
});

// Watch for agency changes
watch(() => agencyStore.agencies, async () => {
  if (authStore.user?.role !== 'super_admin') {
    agencies.value = agencyStore.agencies;
  }
});
</script>

<style scoped>
.notification-cards-container {
  margin-bottom: 32px;
}

.notification-cards-container h2 {
  margin-bottom: 24px;
  color: var(--text-primary);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
}

.notification-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.notification-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow);
  border: 2px solid var(--border);
  border-left: 4px solid var(--agency-color, var(--border));
  transition: all 0.2s;
  cursor: pointer;
  background-color: var(--agency-bg, white);
}

.notification-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--agency-color, var(--primary));
}

.card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.agency-icon-wrapper {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
  border: 2px solid var(--border);
  padding: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.agency-icon {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.agency-icon-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: var(--agency-color, var(--primary));
  background: var(--agency-bg, var(--bg-alt));
  border-radius: 4px;
}

.agency-icon-placeholder.all-agencies {
  font-size: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.all-agencies-card {
  border-left-color: #667eea;
  background: linear-gradient(135deg, #667eea08 0%, #764ba208 100%);
}

.card-info {
  flex: 1;
  min-width: 0;
}

.agency-name {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-count-text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.notification-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  background: var(--bg-alt);
  color: var(--text-secondary);
  border: 2px solid var(--border);
  transition: all 0.2s;
}

.notification-badge.has-notifications {
  background: #dc3545;
  color: white;
  border-color: #dc3545;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
}

@media (max-width: 768px) {
  .notification-cards-grid {
    grid-template-columns: 1fr;
  }
}
</style>
