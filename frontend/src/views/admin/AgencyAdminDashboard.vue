<template>
  <div class="container">
    <div class="dashboard-header">
      <div class="header-content">
        <BrandingLogo 
          v-if="currentAgency" 
          size="large" 
          class="dashboard-logo" 
          :logo-url="previewMode ? (currentAgency?.logo_url || null) : undefined"
        />
        <div>
          <h1>Agency Dashboard</h1>
          <span class="badge badge-info">Agency Admin</span>
        </div>
      </div>
      <div v-if="currentAgency" class="agency-badge">
        <span class="agency-name">{{ currentAgency.name }}</span>
      </div>
    </div>
    
    <div v-if="loading" class="loading">Loading agency statistics...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="dashboard-content">
      <div class="dashboard-grid">
        <component 
          :is="previewMode ? 'div' : 'router-link'"
          v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)"
          :to="previewMode ? null : '/admin/settings?tab=agencies'"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>My Agencies</h3>
          <p class="stat-value">{{ stats.myAgencies }}</p>
        </component>
        
        <component 
          :is="previewMode ? 'div' : 'router-link'"
          v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)"
          :to="previewMode ? null : '/admin/modules?filter=templates'"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>Training Focus Templates</h3>
          <p class="stat-value">{{ stats.trainingFocusTemplates }}</p>
        </component>
        
        <component 
          :is="previewMode ? 'div' : 'router-link'"
          v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)"
          :to="previewMode ? null : '/admin/modules?view=table'"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>Agency Modules</h3>
          <p class="stat-value">{{ stats.agencyModules }}</p>
        </component>
        
        <component 
          :is="previewMode ? 'div' : 'router-link'"
          :to="previewMode ? null : '/admin/users'"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>Total Users</h3>
          <p class="stat-value">{{ stats.totalUsers }}</p>
        </component>
      </div>
      
      <NotificationCards v-if="!previewMode" />

      <QuickActionsSection
        v-if="!previewMode"
        title="Quick Actions"
        context-key="agency"
        :actions="quickActions"
        :default-action-ids="defaultQuickActionIds"
        :icon-resolver="resolveQuickActionIcon"
      />
      
      <div class="agencies-overview" v-if="myAgencies.length > 0 && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)">
        <h2>My Agencies</h2>
        <div class="agencies-list">
          <div
            v-for="agency in myAgencies"
            :key="agency.id"
            class="agency-card"
            :class="{ active: currentAgency?.id === agency.id }"
          >
            <div class="agency-row">
              <span class="agency-name" :title="agency.name">{{ agency.name }}</span>
              <span class="agency-badges">
                <span v-if="agency.is_active" class="badge badge-success">Active</span>
                <span v-else class="badge badge-secondary">Inactive</span>
              </span>
            </div>
            <component 
              :is="previewMode ? 'button' : 'router-link'"
              :to="previewMode ? null : `/admin/settings?tab=agencies`"
              class="btn btn-primary btn-sm"
              :disabled="previewMode"
            >
              Manage
            </component>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { useAuthStore } from '../../store/auth';
import { isSupervisor } from '../../utils/helpers.js';
import NotificationCards from '../../components/admin/NotificationCards.vue';
import QuickActionsSection from '../../components/admin/QuickActionsSection.vue';

const props = defineProps({
  previewMode: {
    type: Boolean,
    default: false
  },
  previewStats: {
    type: Object,
    default: null
  }
});

const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const authStore = useAuthStore();
const user = computed(() => authStore.user);
const currentAgency = computed(() => agencyStore.currentAgency);

const loading = ref(true);
const error = ref('');
const stats = ref({
  myAgencies: 0,
  agencyModules: 0,
  trainingFocusTemplates: 0,
  totalUsers: 0
});
const myAgencies = ref([]);
const branding = computed(() => brandingStore.platformBranding);
const agencyData = ref(null);

const fetchStats = async () => {
  // In preview mode, use mock data
  if (props.previewMode) {
    if (props.previewStats) {
      stats.value = { ...props.previewStats };
    }
    myAgencies.value = [{ id: 1, name: 'Preview Agency', is_active: true }];
    loading.value = false;
    return;
  }
  
  try {
    loading.value = true;
    
    // Get all agencies the user has access to
    const agenciesRes = await api.get('/agencies');
    myAgencies.value = agenciesRes.data;
    
    // Fetch training focuses for each agency the admin has access to
    // Also include platform templates (agency_id IS NULL)
    const trainingFocusPromises = [
      api.get('/training-focuses', { params: { agencyId: null } }).catch(() => ({ data: [] })) // Platform templates
    ];
    
    // Add promises for each agency
    agenciesRes.data.forEach(agency => {
      trainingFocusPromises.push(
        api.get('/training-focuses', { params: { agencyId: agency.id } }).catch(() => ({ data: [] }))
      );
    });
    
    // Ensure branding is fetched from store
    if (!brandingStore.platformBranding) {
      await brandingStore.fetchPlatformBranding();
    }
    
    const [modulesRes, usersRes, ...trainingFocusResults] = await Promise.all([
      api.get('/modules'),
      api.get('/users').catch(err => {
        // If users fetch fails (e.g., for supervisors without assignments), return empty array
        console.warn('Could not fetch users:', err.message);
        return { data: [] };
      }),
      ...trainingFocusPromises
    ]);
    
    // Fetch current agency data if available
    if (currentAgency.value) {
      try {
        const agencyRes = await api.get(`/agencies/${currentAgency.value.id}`);
        agencyData.value = agencyRes.data;
      } catch (err) {
        console.error('Failed to fetch agency data:', err);
      }
    }
    
    // Filter modules for user's agencies
    const agencyModules = modulesRes.data.filter(m => 
      !m.is_shared && agenciesRes.data.some(a => a.id === m.agency_id)
    );
    
    // Count all unique training focuses across platform templates and all user's agencies
    const allTrainingFocuses = trainingFocusResults.flatMap(res => res.data || []);
    const uniqueTrainingFocusIds = new Set(allTrainingFocuses.map(tf => tf.id));
    const totalTrainingFocuses = uniqueTrainingFocusIds.size;
    
    stats.value = {
      myAgencies: agenciesRes.data.length,
      agencyModules: agencyModules.length,
      trainingFocusTemplates: totalTrainingFocuses,
      totalUsers: usersRes.data.length
    };
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load statistics';
  } finally {
    loading.value = false;
  }
};

const getActionIcon = (actionKey) => {
  // First check agency override, then platform default
  let iconPath = null;
  
  if (agencyData.value) {
    const agencyIconMap = {
      'progress_dashboard': agencyData.value.progress_dashboard_icon_path,
      'manage_modules': agencyData.value.manage_modules_icon_path,
      'manage_documents': agencyData.value.manage_documents_icon_path,
      'manage_users': agencyData.value.manage_users_icon_path,
      'settings': agencyData.value.settings_icon_path
    };
    iconPath = agencyIconMap[actionKey];
  }
  
  // Fall back to platform default if no agency override
  if (!iconPath && branding.value) {
    const platformIconMap = {
      'progress_dashboard': branding.value.progress_dashboard_icon_path,
      'manage_modules': branding.value.manage_modules_icon_path,
      'manage_documents': branding.value.manage_documents_icon_path,
      'manage_users': branding.value.manage_users_icon_path,
      'settings': branding.value.settings_icon_path
    };
    iconPath = platformIconMap[actionKey];
  }
  
  if (!iconPath) return null;
  
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  let cleanPath = iconPath;
  if (cleanPath.startsWith('/uploads/')) {
    cleanPath = cleanPath.substring('/uploads/'.length);
  } else if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1);
  }
  return `${apiBase}/uploads/${cleanPath}`;
};

const quickActions = computed(() => ([
  {
    id: 'progress_dashboard',
    title: 'Progress Dashboard',
    description: 'View and manage training progress, completion, and quiz scores',
    to: '/admin/agency-progress',
    emoji: '📊',
    iconKey: 'progress_dashboard',
    category: 'Training',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'supervisor'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'manage_clients',
    title: 'Manage Clients',
    description: 'Create and manage clients',
    to: '/admin/clients',
    emoji: '🧾',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'manage_modules',
    title: 'Manage Modules',
    description: 'Create and edit training modules',
    to: '/admin/modules',
    emoji: '📚',
    iconKey: 'manage_modules',
    category: 'Training',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canViewTraining']
  },
  {
    id: 'manage_documents',
    title: 'Manage Documents',
    description: 'Upload templates and assign documents',
    to: '/admin/documents',
    emoji: '📄',
    iconKey: 'manage_documents',
    category: 'Documents',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canSignDocuments']
  },
  {
    id: 'manage_users',
    title: 'Manage Users',
    description: 'View and manage user accounts',
    to: '/admin/users',
    emoji: '👥',
    iconKey: 'manage_users',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'supervisor'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Configure organizations, tracks, and branding',
    to: '/admin/settings',
    emoji: '⚙️',
    iconKey: 'settings',
    category: 'System',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'View notifications',
    to: '/admin/notifications',
    emoji: '🔔',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  }
]));

const defaultQuickActionIds = computed(() => ([
  'progress_dashboard',
  'manage_clients',
  'manage_modules',
  'manage_documents',
  'manage_users',
  'settings'
]));

const resolveQuickActionIcon = (action) => {
  if (!action?.iconKey) return null;
  return getActionIcon(action.iconKey);
};

// Watch for agency changes and refetch agency data
watch(currentAgency, async (newAgency) => {
  if (newAgency) {
    try {
      const agencyRes = await api.get(`/agencies/${newAgency.id}`);
      agencyData.value = agencyRes.data;
    } catch (err) {
      console.error('Failed to fetch agency data:', err);
    }
  }
});

onMounted(async () => {
  // Ensure branding is loaded before fetching stats
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
  await agencyStore.fetchAgencies();
  await fetchStats();
});
</script>

<style scoped>
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.dashboard-logo {
  flex-shrink: 0;
}

.dashboard-header h1 {
  margin: 0;
  color: var(--primary);
}

.agency-badge {
  padding: 8px 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px solid var(--primary);
}

.agency-name {
  font-weight: 600;
  color: var(--primary);
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.stat-card {
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  text-align: center;
  border: 1px solid var(--border);
  transition: all 0.2s;
  display: block;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.stat-card h3 {
  color: var(--text-secondary);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  font-weight: 600;
}

.stat-value {
  font-size: 40px;
  font-weight: 700;
  color: var(--primary);
  margin: 0;
}

/* Quick Actions are now rendered by `QuickActionsSection` */

.agencies-overview {
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.agencies-overview h2 {
  margin-bottom: 24px;
  color: var(--text-primary);
}

.agencies-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.agency-card {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 20px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px solid var(--border);
  transition: all 0.2s;
  gap: 12px;
  overflow: hidden;
}

.agency-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.agency-card.active {
  border-color: var(--accent);
  background: white;
}

.agency-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: nowrap;
}

.agency-name {
  font-weight: 800;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.agency-badges {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
}

.preview-disabled {
  pointer-events: none;
  cursor: default;
  opacity: 0.8;
}

.stat-card.preview-disabled:hover {
  transform: none;
  box-shadow: var(--shadow);
}

.action-card.preview-disabled:hover {
  transform: none;
  box-shadow: var(--shadow);
  border-color: var(--border);
}
</style>

