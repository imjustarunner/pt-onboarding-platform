<template>
  <div class="container">
    <div class="library-header">
      <h1>On-Demand Training Library</h1>
      <p class="subtitle">Access training modules and videos anytime</p>
    </div>

    <div v-if="loading" class="loading">Loading training library...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="library-content">
      <!-- Agency On-Demand Training Section (at top) -->
      <div v-if="agencyOnDemandTrainingFocuses.length > 0 || agencyOnDemandModules.length > 0" class="agency-on-demand-section">
        <div class="section-header">
          <h2>Agency On-Demand Training</h2>
          <p class="section-note">These trainings are always available and do not count towards your time tracking.</p>
        </div>

        <!-- Agency On-Demand Training Focuses -->
        <div v-if="agencyOnDemandTrainingFocuses.length > 0" class="training-focuses-section">
          <h3>Training Focuses</h3>
          <div class="focuses-grid">
            <div
              v-for="focus in agencyOnDemandTrainingFocuses"
              :key="focus.training_focus_id"
              class="focus-card"
            >
              <div class="focus-header">
                <h4>{{ focus.training_focus_name }}</h4>
                <span class="on-demand-badge">On-Demand</span>
              </div>
              <p v-if="focus.training_focus_description" class="focus-description">
                {{ focus.training_focus_description }}
              </p>
              <div class="focus-meta">
                <span class="modules-count">{{ focus.modules?.length || 0 }} modules</span>
              </div>
              <div class="focus-actions">
                <button @click="viewTrainingFocus(focus.training_focus_id)" class="btn btn-primary">
                  View Training Focus
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Agency On-Demand Modules -->
        <div v-if="agencyOnDemandModules.length > 0" class="agency-modules-section">
          <h3>Individual Modules</h3>
          <div class="modules-grid">
            <div
              v-for="module in agencyOnDemandModules"
              :key="module.module_id"
              class="module-card on-demand-module"
            >
              <div class="module-header">
                <h3>{{ module.module_title }}</h3>
                <div class="module-badges">
                  <span class="badge badge-success">On-Demand</span>
                  <span v-if="module.hasVideo" class="badge badge-info">Video</span>
                  <span v-if="module.hasQuiz" class="badge badge-warning">Quiz</span>
                </div>
              </div>
              
              <p v-if="module.module_description" class="module-description">
                {{ module.module_description }}
              </p>
              
              <div class="module-meta">
                <span v-if="module.estimated_time_minutes" class="time-badge">
                  ⏱ {{ module.estimated_time_minutes }} min
                </span>
                <span class="content-count">{{ module.contentCount || 0 }} items</span>
                <span class="no-time-tracking">⏸ Does not count towards time</span>
              </div>
              
              <div class="module-actions">
                <button @click="viewModule(module.module_id)" class="btn btn-primary">
                  View Module
                </button>
                <button @click="generateCertificate('module', module.module_id)" class="btn btn-secondary" :disabled="generatingCert">
                  {{ generatingCert ? 'Generating...' : 'Print Certificate' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Global On-Demand Modules Section -->
      <div class="global-on-demand-section">
        <div class="section-header">
          <h2>Global On-Demand Modules</h2>
        </div>

        <!-- Search and Filters -->
        <div class="filters-section">
          <div class="search-box">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search modules..."
              class="search-input"
            />
          </div>
          <div class="filter-buttons">
            <button
              v-for="category in categories"
              :key="category"
              @click="selectedCategory = category"
              :class="['filter-btn', { active: selectedCategory === category }]"
            >
              {{ category }}
            </button>
          </div>
        </div>

        <!-- Modules Grid -->
        <div v-if="filteredModules.length === 0" class="empty-state">
          <p>No modules available at this time.</p>
        </div>
        
        <div v-else class="modules-grid">
          <div
            v-for="module in filteredModules"
            :key="module.id"
            class="module-card"
          >
            <div class="module-header">
              <h3>{{ module.title }}</h3>
              <div class="module-badges">
                <span v-if="module.hasVideo" class="badge badge-info">Video</span>
                <span v-if="module.hasQuiz" class="badge badge-warning">Quiz</span>
              </div>
            </div>
            
            <p v-if="module.description" class="module-description">
              {{ module.description }}
            </p>
            
            <div class="module-meta">
              <span v-if="module.estimated_time_minutes" class="time-badge">
                ⏱ {{ module.estimated_time_minutes }} min
              </span>
              <span class="content-count">{{ module.contentCount }} items</span>
            </div>
            
            <div class="module-actions">
              <button @click="viewModule(module.id)" class="btn btn-primary">
                View Module
              </button>
              <button @click="generateCertificate('module', module.id)" class="btn btn-secondary" :disabled="generatingCert">
                {{ generatingCert ? 'Generating...' : 'Print Certificate' }}
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
import api from '../services/api';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';

const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const modules = ref([]);
const agencyOnDemandTrainingFocuses = ref([]);
const agencyOnDemandModules = ref([]);
const loading = ref(true);
const error = ref('');
const searchQuery = ref('');
const selectedCategory = ref('All');
const generatingCert = ref(false);

const categories = computed(() => {
  const cats = ['All'];
  // Extract unique categories from modules if needed
  return cats;
});

const filteredModules = computed(() => {
  let filtered = modules.value;

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(m =>
      m.title.toLowerCase().includes(query) ||
      (m.description && m.description.toLowerCase().includes(query))
    );
  }

  if (selectedCategory.value !== 'All') {
    // Filter by category if implemented
  }

  return filtered;
});

const fetchAgencyOnDemandTrainings = async () => {
  try {
    // Get agency ID from store or user
    let agencyId = null;
    if (authStore.user?.type === 'approved_employee') {
      // For approved employees, we need to get agency from their email
      // This will be handled by the backend based on the employee's agency
      return; // Backend will handle this
    } else if (agencyStore.currentAgency) {
      agencyId = agencyStore.currentAgency.id;
    } else if (agencyStore.userAgencies && agencyStore.userAgencies.length > 0) {
      agencyId = agencyStore.userAgencies[0].id;
    }

    if (!agencyId) {
      return;
    }

    // Fetch agency on-demand training focuses
    const focusesResponse = await api.get('/on-demand-training/training-focuses');
    agencyOnDemandTrainingFocuses.value = focusesResponse.data || [];

    // Fetch agency on-demand modules (they're included in the modules response with isAgencyOnDemand flag)
    // We'll filter them from the main modules list
  } catch (err) {
    console.error('Failed to fetch agency on-demand trainings:', err);
    // Don't show error, just continue without agency-specific trainings
  }
};

const fetchModules = async () => {
  try {
    loading.value = true;
    const response = await api.get('/on-demand-training/modules');
    const allModules = response.data || [];
    
    // Separate agency on-demand modules from global on-demand modules
    agencyOnDemandModules.value = allModules.filter(m => m.isAgencyOnDemand && !m.isGlobalOnDemand);
    modules.value = allModules.filter(m => !m.isAgencyOnDemand || m.isGlobalOnDemand);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load modules';
  } finally {
    loading.value = false;
  }
};

const viewModule = (moduleId) => {
  router.push(`/on-demand-training/modules/${moduleId}`);
};

const viewTrainingFocus = (trainingFocusId) => {
  router.push(`/training-focuses/${trainingFocusId}`);
};

const generateCertificate = async (certificateType, referenceId) => {
  try {
    generatingCert.value = true;
    const response = await api.post('/certificates/generate', {
      certificateType,
      referenceId
    });
    
    // Download the certificate
    const certResponse = await api.get(`/certificates/${response.data.id}/download`, {
      responseType: 'blob'
    });
    
    const blob = new Blob([certResponse.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `certificate-${response.data.certificate_number}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to generate certificate';
  } finally {
    generatingCert.value = false;
  }
};

onMounted(async () => {
  // Fetch user agencies if needed
  if (authStore.isAuthenticated && !agencyStore.currentAgency) {
    await agencyStore.fetchUserAgencies();
  }
  
  await Promise.all([
    fetchModules(),
    fetchAgencyOnDemandTrainings()
  ]);
});
</script>

<style scoped>
.library-header {
  margin-bottom: 32px;
  text-align: center;
}

.library-header h1 {
  margin-bottom: 8px;
  color: var(--text-primary);
}

.subtitle {
  color: var(--text-secondary);
  font-size: 16px;
}

.filters-section {
  margin-bottom: 32px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: var(--shadow);
}

.search-box {
  margin-bottom: 16px;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 15px;
}

.filter-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.filter-btn:hover {
  background: var(--bg-alt);
}

.filter-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.module-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  transition: transform 0.2s, box-shadow 0.2s;
}

.module-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 12px;
}

.module-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
  flex: 1;
}

.module-badges {
  display: flex;
  gap: 6px;
}

.module-description {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 16px;
  line-height: 1.5;
}

.module-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.time-badge {
  display: flex;
  align-items: center;
  gap: 4px;
}

.module-actions {
  display: flex;
  gap: 8px;
}

.module-actions .btn {
  flex: 1;
}

.empty-state {
  text-align: center;
  padding: 60px;
  color: var(--text-secondary);
}

.agency-on-demand-section {
  margin-bottom: 48px;
  padding: 24px;
  background: #f0f9ff;
  border-radius: 12px;
  border: 2px solid #0ea5e9;
}

.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 24px;
}

.section-note {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
  font-style: italic;
}

.training-focuses-section,
.agency-modules-section {
  margin-bottom: 32px;
}

.training-focuses-section h3,
.agency-modules-section h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.focuses-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.focus-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  transition: transform 0.2s, box-shadow 0.2s;
}

.focus-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.focus-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 12px;
}

.focus-header h4 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
  flex: 1;
}

.public-badge {
  padding: 4px 12px;
  background: #10b981;
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.focus-description {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 16px;
  line-height: 1.5;
}

.focus-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.focus-actions {
  display: flex;
  gap: 8px;
}

.on-demand-module {
  border: 2px solid #10b981;
}

.no-time-tracking {
  font-size: 12px;
  color: #059669;
  font-weight: 500;
}

.global-on-demand-section {
  margin-top: 48px;
}

.global-public-section .section-header {
  margin-bottom: 24px;
}
</style>

