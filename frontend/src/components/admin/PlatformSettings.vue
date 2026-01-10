<template>
  <div class="platform-settings">
    <div class="section-header">
      <h2>Platform Settings</h2>
      <span class="badge badge-warning">Super Admin Only</span>
    </div>
    
    <div class="settings-section">
      <h3>Global Terminology</h3>
      <p class="section-description">
        Configure platform-wide terminology that applies to all agencies. These settings can be overridden at the agency level.
      </p>
      
      <form @submit.prevent="saveSettings">
        <div class="terminology-grid">
          <div class="form-group">
            <label>People Operations Term</label>
            <input v-model="settings.peopleOpsTerm" type="text" placeholder="People Operations" />
            <small>Default: "People Operations" (replaces "HR")</small>
          </div>
          
          <div class="form-group">
            <label>Training Modules Term</label>
            <input v-model="settings.trainingModulesTerm" type="text" placeholder="Training Modules" />
            <small>Default: "Training Modules"</small>
          </div>
          
          <div class="form-group">
            <label>Training Focus Term</label>
            <input v-model="settings.trainingFocusTerm" type="text" placeholder="Training Focus" />
            <small>Default: "Training Focus"</small>
          </div>
          
          <div class="form-group">
            <label>Onboarding Term</label>
            <input v-model="settings.onboardingTerm" type="text" placeholder="Onboarding" />
            <small>Default: "Onboarding"</small>
          </div>
          
          <div class="form-group">
            <label>Ongoing Development Term</label>
            <input v-model="settings.ongoingDevTerm" type="text" placeholder="Ongoing Development" />
            <small>Default: "Ongoing Development"</small>
          </div>
        </div>
        
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save Settings' }}
          </button>
        </div>
      </form>
    </div>
    
    <div class="settings-section">
      <h3>Shared Module Library</h3>
      <p class="section-description">
        Manage platform-level shared modules that are available to all agencies.
      </p>
      <router-link to="/admin/modules" class="btn btn-primary">
        Manage Shared Modules
      </router-link>
    </div>
    
    <div class="settings-section">
      <h3>Platform Information</h3>
      <div class="info-grid">
        <div class="info-item">
          <strong>Platform Name:</strong>
          <span>PlotTwistCo People Operations Platform</span>
        </div>
        <div class="info-item">
          <strong>Version:</strong>
          <span>1.0.0</span>
        </div>
        <div class="info-item">
          <strong>Super Admins:</strong>
          <span>{{ superAdminCount }}</span>
        </div>
        <div class="info-item">
          <strong>Total Agencies:</strong>
          <span>{{ totalAgencies }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const settings = ref({
  peopleOpsTerm: 'People Operations',
  trainingModulesTerm: 'Training Modules',
  trainingFocusTerm: 'Training Focus',
  onboardingTerm: 'Onboarding',
  ongoingDevTerm: 'Ongoing Development'
});

const saving = ref(false);
const superAdminCount = ref(0);
const totalAgencies = ref(0);

const fetchSettings = async () => {
  try {
    // In a real implementation, this would fetch from a settings API
    // For now, we'll use defaults
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
};

const fetchStats = async () => {
  try {
    const [usersRes, agenciesRes] = await Promise.all([
      api.get('/users'),
      api.get('/agencies')
    ]);
    
    superAdminCount.value = usersRes.data.filter(u => u.role === 'super_admin').length;
    totalAgencies.value = agenciesRes.data.length;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
};

const saveSettings = async () => {
  try {
    saving.value = true;
    // In a real implementation, this would save to a settings API
    // For now, we'll just show a success message
    alert('Settings saved successfully! (Note: This is a placeholder - settings API to be implemented)');
  } catch (err) {
    alert('Failed to save settings');
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  await fetchSettings();
  await fetchStats();
});
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.section-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.settings-section {
  margin-bottom: 48px;
  padding-bottom: 32px;
  border-bottom: 2px solid var(--border);
}

.settings-section:last-child {
  border-bottom: none;
}

.settings-section h3 {
  margin-bottom: 12px;
  color: var(--text-primary);
  font-size: 20px;
}

.section-description {
  color: var(--text-secondary);
  margin-bottom: 24px;
  line-height: 1.6;
}

.form-actions {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.info-item {
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px solid var(--border);
}

.info-item strong {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.info-item span {
  display: block;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 16px;
}

.terminology-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.terminology-grid .form-group {
  margin-bottom: 0;
}

.terminology-grid .form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.terminology-grid .form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.terminology-grid .form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 11px;
}
</style>

