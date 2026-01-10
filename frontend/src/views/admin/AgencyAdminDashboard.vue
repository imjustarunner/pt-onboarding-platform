<template>
  <div class="container">
    <div class="dashboard-header">
      <div class="header-content">
        <BrandingLogo v-if="currentAgency" size="large" class="dashboard-logo" />
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
        <router-link v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" to="/admin/settings?tab=agencies" class="stat-card">
          <h3>My Agencies</h3>
          <p class="stat-value">{{ stats.myAgencies }}</p>
        </router-link>
        
        <router-link v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" to="/admin/modules?filter=templates" class="stat-card">
          <h3>Training Focus Templates</h3>
          <p class="stat-value">{{ stats.trainingFocusTemplates }}</p>
        </router-link>
        
        <router-link v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" to="/admin/modules?view=table" class="stat-card">
          <h3>Agency Modules</h3>
          <p class="stat-value">{{ stats.agencyModules }}</p>
        </router-link>
        
        <router-link to="/admin/users" class="stat-card">
          <h3>Total Users</h3>
          <p class="stat-value">{{ stats.totalUsers }}</p>
        </router-link>
      </div>
      
      <NotificationCards />
      
      <div class="quick-actions">
        <h2>Quick Actions</h2>
        <div class="actions-grid">
          <router-link to="/admin/agency-progress" class="action-card">
            <img 
              v-if="getActionIcon('progress_dashboard')" 
              :src="getActionIcon('progress_dashboard')" 
              :alt="'Progress Dashboard icon'"
              class="action-icon"
              @error="(e) => { e.target.style.display = 'none'; }"
            />
            <div v-else class="action-icon-placeholder">📊</div>
            <div class="action-content">
              <h3>Progress Dashboard</h3>
              <p>View and manage user training progress, track completion, and quiz scores</p>
            </div>
          </router-link>
          
          <router-link v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" to="/admin/modules" class="action-card">
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
              <p>Create and edit training modules for your agencies</p>
            </div>
          </router-link>
          
          <router-link v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" to="/admin/documents" class="action-card">
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
              <p>View and manage user accounts in your agencies</p>
            </div>
          </router-link>
          
          <router-link v-if="user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)" to="/admin/settings" class="action-card">
            <img 
              v-if="getActionIcon('settings')" 
              :src="getActionIcon('settings')" 
              :alt="'Settings icon'"
              class="action-icon"
              @error="(e) => { e.target.style.display = 'none'; }"
            />
            <div v-else class="action-icon-placeholder">⚙️</div>
            <div class="action-content">
              <h3>Settings</h3>
              <p>Configure your agencies, tracks, and branding</p>
            </div>
          </router-link>
        </div>
      </div>
      
      <div class="agencies-overview" v-if="myAgencies.length > 0 && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)">
        <h2>My Agencies</h2>
        <div class="agencies-list">
          <div
            v-for="agency in myAgencies"
            :key="agency.id"
            class="agency-card"
            :class="{ active: currentAgency?.id === agency.id }"
          >
            <div class="agency-info">
              <h4>{{ agency.name }}</h4>
              <p class="agency-meta">
                <span v-if="agency.is_active" class="badge badge-success">Active</span>
                <span v-else class="badge badge-secondary">Inactive</span>
              </p>
            </div>
            <router-link :to="`/admin/settings?tab=agencies`" class="btn btn-primary btn-sm">Manage</router-link>
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
  color: var(--text-primary);
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
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
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
}

.agency-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.agency-card.active {
  border-color: var(--accent);
  background: white;
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
</style>

