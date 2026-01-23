<template>
  <div class="container">
    <div class="dashboard-header">
      <div class="header-content">
        <BrandingLogo size="large" class="dashboard-logo" />
        <div>
          <h1>Platform Dashboard</h1>
          <span class="badge badge-warning">Super Admin</span>
        </div>
      </div>
    </div>
    
    <div v-if="loading" class="loading">Loading platform statistics...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="dashboard-content">
      <div class="dashboard-grid">
        <router-link to="/admin/settings?tab=agencies" class="stat-card">
          <h3>Total Agencies</h3>
          <p class="stat-value">{{ stats.totalAgencies }}</p>
        </router-link>
        
        <router-link to="/admin/users" class="stat-card">
          <h3>Active Users</h3>
          <p class="stat-value">{{ stats.activeUsers }}</p>
        </router-link>
        
        <router-link to="/admin/modules?filter=templates" class="stat-card">
          <h3>Training Focus Templates</h3>
          <p class="stat-value">{{ stats.trainingFocusTemplates }}</p>
        </router-link>
        
        <router-link to="/admin/modules?view=table" class="stat-card">
          <h3>Total Modules</h3>
          <p class="stat-value">{{ stats.totalModules }}</p>
        </router-link>
      </div>
      
      <NotificationCards />
      
      <div v-if="!currentAgency" class="brand-preview-hint">
        Select an agency brand to preview agency-specific icon overrides.
      </div>

      <QuickActionsSection
        title="Quick Actions"
        context-key="platform"
        :actions="quickActions"
        :default-action-ids="defaultQuickActionIds"
        :icon-resolver="resolveQuickActionIcon"
        compact
      />
      
      <AgencySpecsPanel
        title="Agency Specs"
        v-model:organizationId="selectedOrgId"
        :organizations="agencies"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useBrandingStore } from '../../store/branding';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import BrandingLogo from '../../components/BrandingLogo.vue';
import NotificationCards from '../../components/admin/NotificationCards.vue';
import QuickActionsSection from '../../components/admin/QuickActionsSection.vue';
import AgencySpecsPanel from '../../components/admin/AgencySpecsPanel.vue';

const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const currentAgency = computed(() => agencyStore.currentAgency);

const loading = ref(true);
const error = ref('');
const stats = ref({
  totalAgencies: 0,
  activeUsers: 0,
  trainingFocusTemplates: 0,
  totalModules: 0
});
const agencies = ref([]);
const selectedOrgId = ref(null);

// Use branding from store instead of local ref
const branding = computed(() => brandingStore.platformBranding);

const fetchStats = async () => {
  try {
    loading.value = true;
    
    // Ensure branding is fetched from store
    if (!brandingStore.platformBranding) {
      await brandingStore.fetchPlatformBranding();
    }
    
    const [agenciesRes, usersRes, modulesRes, templatesRes] = await Promise.all([
      api.get('/agencies'),
      api.get('/users'),
      api.get('/modules'),
      api.get('/training-focuses/templates')
    ]);

    const rawOrgs = Array.isArray(agenciesRes.data) ? agenciesRes.data : [];
    const primaryAgencies = rawOrgs.filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
    
    stats.value = {
      totalAgencies: rawOrgs.length,
      activeUsers: (usersRes.data || []).filter((u) => String(u?.status || '').toUpperCase() === 'ACTIVE_EMPLOYEE').length,
      trainingFocusTemplates: templatesRes.data.length,
      totalModules: modulesRes.data.length
    };
    
    console.log('SuperAdminDashboard: Using branding from store:', {
      manage_agencies_icon_id: branding.value?.manage_agencies_icon_id,
      manage_agencies_icon_path: branding.value?.manage_agencies_icon_path,
      manage_modules_icon_id: branding.value?.manage_modules_icon_id,
      manage_modules_icon_path: branding.value?.manage_modules_icon_path,
      manage_documents_icon_id: branding.value?.manage_documents_icon_id,
      manage_documents_icon_path: branding.value?.manage_documents_icon_path,
      manage_users_icon_id: branding.value?.manage_users_icon_id,
      manage_users_icon_path: branding.value?.manage_users_icon_path,
      platform_settings_icon_id: branding.value?.platform_settings_icon_id,
      platform_settings_icon_path: branding.value?.platform_settings_icon_path,
      view_all_progress_icon_id: branding.value?.view_all_progress_icon_id,
      view_all_progress_icon_path: branding.value?.view_all_progress_icon_path
    });
    
    // Agency Specs should focus on agencies; other org types are secondary.
    agencies.value = primaryAgencies;

    // Default to the first org (prefer active)
    if (!selectedOrgId.value && Array.isArray(agencies.value) && agencies.value.length > 0) {
      const active = agencies.value.find((a) => a?.is_active) || agencies.value[0];
      selectedOrgId.value = active?.id || null;
    }
    
    // Show all agencies, not just first 6
    // agencies.value = agenciesRes.data.slice(0, 6); // Removed limit
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load statistics';
  } finally {
    loading.value = false;
  }
};

const getActionIcon = (actionKey) => {
  // Use centralized branding logic.
  // For super_admin, allow previewing a selected agency's overrides via currentAgency.
  return brandingStore.getAdminQuickActionIconUrl(actionKey, currentAgency.value || null);
};

const quickActions = computed(() => ([
  {
    id: 'manage_organizations',
    title: 'Manage Organizations',
    description: 'Create and manage all organizations',
    to: '/admin/settings?tab=agencies',
    emoji: '🏢',
    iconKey: 'manage_agencies',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
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
    id: 'import_school_directory',
    title: 'Import School Directory',
    description: 'Bulk import school contacts + ITSCO email + schedules',
    to: '/admin/schools/import',
    emoji: '🏫',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'manage_modules',
    title: 'Manage Modules',
    description: 'Create shared modules and manage all training',
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
    description: 'Upload templates and assign documents for signature',
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
    description: 'View and manage all user accounts',
    to: '/admin/users',
    emoji: '👥',
    iconKey: 'manage_users',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'communications',
    title: 'Communications',
    description: 'View communications feed',
    to: '/admin/communications',
    emoji: '💬',
    category: 'Communications',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
    capabilities: ['canUseChat']
  },
  {
    id: 'chats',
    title: 'Chats',
    description: 'Open platform chats',
    to: '/admin/communications/chats',
    emoji: '💬',
    category: 'Communications',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
    capabilities: ['canUseChat']
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'View all notifications',
    to: '/admin/notifications',
    emoji: '🔔',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'payroll',
    title: 'Payroll',
    description: 'Manage payroll',
    to: '/admin/payroll',
    emoji: '💵',
    category: 'Management',
    roles: ['admin', 'super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'platform_settings',
    title: 'Platform Settings',
    description: 'Configure platform-wide settings and terminology',
    to: '/admin/settings',
    emoji: '⚙️',
    iconKey: 'platform_settings',
    category: 'System',
    roles: ['super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'all_progress',
    title: 'View All Progress',
    description: 'View training progress across all agencies',
    to: '/admin/agency-progress',
    emoji: '📊',
    iconKey: 'view_all_progress',
    category: 'Training',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canViewTraining']
  },
  {
    id: 'billing',
    title: 'Billing',
    description: 'Plan usage and QuickBooks',
    to: '/admin/settings?category=general&item=billing',
    emoji: '💳',
    category: 'System',
    roles: ['admin', 'super_admin'],
    capabilities: ['canAccessPlatform']
  }
]));

const defaultQuickActionIds = computed(() => ([
  'manage_organizations',
  'manage_clients',
  'manage_modules',
  'manage_documents',
  'manage_users',
  'notifications',
  'all_progress'
]));

const resolveQuickActionIcon = (action) => {
  if (!action?.iconKey) return null;
  return getActionIcon(action.iconKey);
};

// Watch for branding changes and refetch if needed
watch(() => brandingStore.platformBranding, (newBranding) => {
  if (newBranding) {
    console.log('SuperAdminDashboard: Branding updated in store, icons should refresh');
  }
}, { deep: true });

onMounted(async () => {
  // Ensure branding is loaded before fetching stats
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
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
  color: var(--text-primary);
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.brand-preview-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: -8px;
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
  cursor: pointer;
  text-decoration: none;
  display: block;
  color: inherit;
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
  border-color: var(--primary);
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
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
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
  cursor: pointer;
  gap: 12px;
}

.agency-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.agency-actions {
  display: flex;
  gap: 8px;
}

.agency-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0; /* allow truncation */
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

/* Keep everything on one line; allow horizontal scroll if needed */
.agency-card {
  overflow: hidden;
}

.agency-actions {
  flex-shrink: 0;
  white-space: nowrap;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>

