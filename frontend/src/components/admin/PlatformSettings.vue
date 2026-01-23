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
      <h3>Settings Navigation Icons</h3>
      <p class="section-description">
        Settings navigation icons are managed under <strong>Branding Configuration</strong> so they can be overridden per agency.
      </p>
      <router-link to="/admin/settings?category=theming&item=branding-config" class="btn btn-secondary">
        Open Branding Configuration
      </router-link>
    </div>

    <div class="settings-section">
      <h3>My Dashboard Card Icons</h3>
      <p class="section-description">
        Set platform default icons for the user-facing "My Dashboard" cards. Organizations can override these in Company Profile → Customize Icons.
      </p>

      <div class="settings-icons-grid">
        <div class="icon-setting-item">
          <label>Checklist</label>
          <IconSelector v-model="myDashboardIcons.checklistIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Training</label>
          <IconSelector v-model="myDashboardIcons.trainingIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Documents</label>
          <IconSelector v-model="myDashboardIcons.documentsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Submit</label>
          <IconSelector v-model="myDashboardIcons.submitIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Payroll</label>
          <IconSelector v-model="myDashboardIcons.payrollIconId" />
        </div>
        <div class="icon-setting-item">
          <label>My Account</label>
          <IconSelector v-model="myDashboardIcons.myAccountIconId" />
        </div>
        <div class="icon-setting-item">
          <label>On-Demand Training</label>
          <IconSelector v-model="myDashboardIcons.onDemandTrainingIconId" />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-primary" @click="saveMyDashboardIcons" :disabled="savingMyDashboardIcons">
          {{ savingMyDashboardIcons ? 'Saving...' : 'Save My Dashboard Icons' }}
        </button>
      </div>
    </div>
    
    <div class="settings-section">
      <h3>Platform Information</h3>
      <div class="info-grid">
        <div class="info-item">
          <strong>Platform Name:</strong>
          <span>{{ platformName }}</span>
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
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';

const brandingStore = useBrandingStore();

const settings = ref({
  peopleOpsTerm: 'People Operations',
  trainingModulesTerm: 'Training Modules',
  trainingFocusTerm: 'Training Focus',
  onboardingTerm: 'Onboarding',
  ongoingDevTerm: 'Ongoing Development'
});

const saving = ref(false);
// (settings navigation icons are configured in Branding Configuration)
const savingMyDashboardIcons = ref(false);
const superAdminCount = ref(0);
const totalAgencies = ref(0);

// settings navigation icons are configured in BrandingConfig

const myDashboardIcons = ref({
  checklistIconId: null,
  trainingIconId: null,
  documentsIconId: null,
  submitIconId: null,
  payrollIconId: null,
  myAccountIconId: null,
  onDemandTrainingIconId: null
});

// Platform name - use platform branding or fallback
const platformName = computed(() => {
  const orgName = brandingStore.platformBranding?.organization_name || '';
  const term = brandingStore.peopleOpsTerm || 'People Operations';
  if (!orgName || orgName === 'PlotTwistCo') {
    return `${term} Platform`;
  }
  return `${orgName} ${term} Platform`;
});

const fetchSettings = async () => {
  try {
    // Load settings icons from platform branding
    await brandingStore.fetchPlatformBranding();
    const pb = brandingStore.platformBranding;
    if (pb) {
      myDashboardIcons.value = {
        checklistIconId: pb.my_dashboard_checklist_icon_id ?? null,
        trainingIconId: pb.my_dashboard_training_icon_id ?? null,
        documentsIconId: pb.my_dashboard_documents_icon_id ?? null,
        submitIconId: pb.my_dashboard_submit_icon_id ?? null,
        payrollIconId: pb.my_dashboard_payroll_icon_id ?? null,
        myAccountIconId: pb.my_dashboard_my_account_icon_id ?? null,
        onDemandTrainingIconId: pb.my_dashboard_on_demand_training_icon_id ?? null
      };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
};


const saveMyDashboardIcons = async () => {
  try {
    savingMyDashboardIcons.value = true;
    await api.put('/platform-branding', {
      myDashboardChecklistIconId: myDashboardIcons.value.checklistIconId,
      myDashboardTrainingIconId: myDashboardIcons.value.trainingIconId,
      myDashboardDocumentsIconId: myDashboardIcons.value.documentsIconId,
      myDashboardSubmitIconId: myDashboardIcons.value.submitIconId,
      myDashboardPayrollIconId: myDashboardIcons.value.payrollIconId,
      myDashboardMyAccountIconId: myDashboardIcons.value.myAccountIconId,
      myDashboardOnDemandTrainingIconId: myDashboardIcons.value.onDemandTrainingIconId
    });
    await brandingStore.fetchPlatformBranding();
    alert('My Dashboard icons saved successfully!');
  } catch (err) {
    console.error('Failed to save My Dashboard icons:', err);
    alert('Failed to save My Dashboard icons');
  } finally {
    savingMyDashboardIcons.value = false;
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

.settings-icons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.icon-setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.icon-setting-item label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}
</style>

