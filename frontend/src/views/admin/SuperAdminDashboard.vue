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
          <h3>Total Users</h3>
          <p class="stat-value">{{ stats.totalUsers }}</p>
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
      
      <div class="quick-actions">
        <h2>Quick Actions</h2>
        <div class="actions-grid">
          <router-link to="/admin/settings?tab=agencies" class="action-card">
            <img 
              v-if="getActionIcon('manage_agencies')" 
              :src="getActionIcon('manage_agencies')" 
              :alt="'Manage Agencies icon'"
              class="action-icon"
              @error="(e) => { console.error('Failed to load icon:', e.target.src); e.target.style.display = 'none'; }"
            />
            <div v-else class="action-icon-placeholder">📋</div>
            <div class="action-content">
              <h3>Manage Agencies</h3>
              <p>Create and manage all agencies</p>
            </div>
          </router-link>
          
          <router-link to="/admin/modules" class="action-card">
            <img 
              v-if="getActionIcon('manage_modules')" 
              :src="getActionIcon('manage_modules')" 
              :alt="'Manage Modules icon'"
              class="action-icon"
              @error="(e) => { e.target.style.display = 'none'; }"
            />
            <div v-else class="action-icon-placeholder">📚</div>
            <div class="action-content">
              <h3>Manage Modules</h3>
              <p>Create shared modules and manage all training</p>
            </div>
          </router-link>
          
          <router-link to="/admin/documents" class="action-card">
            <img 
              v-if="getActionIcon('manage_documents')" 
              :src="getActionIcon('manage_documents')" 
              :alt="'Manage Documents icon'"
              class="action-icon"
              @error="(e) => { e.target.style.display = 'none'; }"
            />
            <div v-else class="action-icon-placeholder">📄</div>
            <div class="action-content">
              <h3>Manage Documents</h3>
              <p>Upload templates and assign documents for signature</p>
            </div>
          </router-link>
          
          <router-link to="/admin/users" class="action-card">
            <img 
              v-if="getActionIcon('manage_users')" 
              :src="getActionIcon('manage_users')" 
              :alt="'Manage Users icon'"
              class="action-icon"
              @error="(e) => { e.target.style.display = 'none'; }"
            />
            <div v-else class="action-icon-placeholder">👥</div>
            <div class="action-content">
              <h3>Manage Users</h3>
              <p>View and manage all user accounts</p>
            </div>
          </router-link>
          
          <router-link to="/admin/settings" class="action-card">
            <img 
              v-if="getActionIcon('platform_settings')" 
              :src="getActionIcon('platform_settings')" 
              :alt="'Platform Settings icon'"
              class="action-icon"
              @error="(e) => { e.target.style.display = 'none'; }"
            />
            <div v-else class="action-icon-placeholder">⚙️</div>
            <div class="action-content">
              <h3>Platform Settings</h3>
              <p>Configure platform-wide settings and terminology</p>
            </div>
          </router-link>
          
          <router-link to="/admin/agency-progress" class="action-card">
            <img 
              v-if="getActionIcon('view_all_progress')" 
              :src="getActionIcon('view_all_progress')" 
              :alt="'View All Progress icon'"
              class="action-icon"
              @error="(e) => { e.target.style.display = 'none'; }"
            />
            <div v-else class="action-icon-placeholder">📊</div>
            <div class="action-content">
              <h3>View All Progress</h3>
              <p>View training progress across all agencies</p>
            </div>
          </router-link>
        </div>
      </div>
      
      <div class="agencies-overview">
        <h2>Agencies Overview</h2>
        <div v-if="agencies.length === 0" class="empty-state">
          <p>No agencies created yet</p>
        </div>
        <div v-else class="agencies-list">
          <div
            v-for="agency in agencies"
            :key="agency.id"
            class="agency-card"
            @click="viewAgencyProgress(agency.id)"
          >
            <div class="agency-info">
              <h4>{{ agency.name }}</h4>
              <p class="agency-meta">
                <span v-if="agency.is_active" class="badge badge-success">Active</span>
                <span v-else class="badge badge-secondary">Inactive</span>
                <span v-if="agency.user_count !== undefined" class="badge badge-secondary">{{ agency.user_count }} users</span>
              </p>
            </div>
            <div class="agency-actions" @click.stop>
              <router-link 
                :to="`/admin/agencies/${agency.id}/progress`" 
                class="btn btn-primary btn-sm"
                @click.stop
              >
                View Progress
              </router-link>
              <router-link 
                :to="`/admin/settings?tab=agencies`" 
                class="btn btn-secondary btn-sm"
                @click.stop
              >
                Manage
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';
import BrandingLogo from '../../components/BrandingLogo.vue';
import NotificationCards from '../../components/admin/NotificationCards.vue';

const router = useRouter();
const brandingStore = useBrandingStore();

const loading = ref(true);
const error = ref('');
const stats = ref({
  totalAgencies: 0,
  totalUsers: 0,
  trainingFocusTemplates: 0,
  totalModules: 0
});
const agencies = ref([]);

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
    
    stats.value = {
      totalAgencies: agenciesRes.data.length,
      totalUsers: usersRes.data.length,
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
    
    // Fetch user count for each agency
    agencies.value = await Promise.all(
      agenciesRes.data.map(async (agency) => {
        try {
          const usersRes = await api.get(`/agencies/${agency.id}/users`);
          return {
            ...agency,
            user_count: usersRes.data.length
          };
        } catch (err) {
          console.error(`Failed to fetch users for agency ${agency.id}:`, err);
          return {
            ...agency,
            user_count: 0
          };
        }
      })
    );
    
    // Show all agencies, not just first 6
    // agencies.value = agenciesRes.data.slice(0, 6); // Removed limit
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load statistics';
  } finally {
    loading.value = false;
  }
};

const getActionIcon = (actionKey) => {
  if (!branding.value) {
    console.log(`getActionIcon(${actionKey}): No branding data`);
    return null;
  }
  
  const iconPathMap = {
    'manage_agencies': branding.value.manage_agencies_icon_path,
    'manage_modules': branding.value.manage_modules_icon_path,
    'manage_documents': branding.value.manage_documents_icon_path,
    'manage_users': branding.value.manage_users_icon_path,
    'platform_settings': branding.value.platform_settings_icon_path,
    'view_all_progress': branding.value.view_all_progress_icon_path
  };
  
  const iconPath = iconPathMap[actionKey];
  if (!iconPath) {
    console.log(`getActionIcon(${actionKey}): No icon path found`);
    return null;
  }
  
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  let cleanPath = iconPath;
  if (cleanPath.startsWith('/uploads/')) {
    cleanPath = cleanPath.substring('/uploads/'.length);
  } else if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1);
  }
  const fullPath = `${apiBase}/uploads/${cleanPath}`;
  console.log(`getActionIcon(${actionKey}): Returning path: ${fullPath}`);
  return fullPath;
};

const viewAgencyProgress = (agencyId) => {
  // Navigate to agency progress dashboard
  router.push(`/admin/agencies/${agencyId}/progress`);
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

.quick-actions {
  margin-bottom: 0;
}

.quick-actions h2 {
  margin-bottom: 24px;
  color: var(--text-primary);
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.action-card {
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 20px;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.action-icon {
  width: 64px;
  height: 64px;
  object-fit: contain;
  flex-shrink: 0;
}

.action-icon-placeholder {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  background: var(--bg-alt);
  border-radius: 8px;
  flex-shrink: 0;
  opacity: 0.6;
}

.action-content {
  flex: 1;
}

.action-card h3 {
  color: var(--text-primary);
  margin-bottom: 12px;
  font-weight: 700;
}

.action-card p {
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px solid var(--border);
  transition: all 0.2s;
  cursor: pointer;
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

.agency-info h4 {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-weight: 700;
}

.agency-meta {
  margin: 0;
  display: flex;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>

