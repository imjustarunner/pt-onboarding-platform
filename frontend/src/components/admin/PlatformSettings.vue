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
      <h3>Settings Menu Icons</h3>
      <p class="section-description">
        Customize icons for settings menu items. These icons will replace the default emojis in the settings modal.
      </p>
      
      <div class="settings-icons-grid">
        <div class="icon-setting-item">
          <label>Company Profile</label>
          <IconSelector v-model="settingsIcons.companyProfileIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Team & Roles</label>
          <IconSelector v-model="settingsIcons.teamRolesIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Billing</label>
          <IconSelector v-model="settingsIcons.billingIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Packages</label>
          <IconSelector v-model="settingsIcons.packagesIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Checklist Items</label>
          <IconSelector v-model="settingsIcons.checklistItemsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Field Definitions</label>
          <IconSelector v-model="settingsIcons.fieldDefinitionsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Branding & Templates</label>
          <IconSelector v-model="settingsIcons.brandingTemplatesIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Assets (Icons/Fonts)</label>
          <IconSelector v-model="settingsIcons.assetsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Communications</label>
          <IconSelector v-model="settingsIcons.communicationsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Integrations</label>
          <IconSelector v-model="settingsIcons.integrationsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Archive</label>
          <IconSelector v-model="settingsIcons.archiveIconId" />
        </div>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-primary" @click="saveSettingsIcons" :disabled="savingIcons">
          {{ savingIcons ? 'Saving...' : 'Save Settings Icons' }}
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
const savingIcons = ref(false);
const superAdminCount = ref(0);
const totalAgencies = ref(0);

const settingsIcons = ref({
  companyProfileIconId: null,
  teamRolesIconId: null,
  billingIconId: null,
  packagesIconId: null,
  checklistItemsIconId: null,
  fieldDefinitionsIconId: null,
  brandingTemplatesIconId: null,
  assetsIconId: null,
  communicationsIconId: null,
  integrationsIconId: null,
  archiveIconId: null
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
      settingsIcons.value = {
        companyProfileIconId: pb.company_profile_icon_id ?? null,
        teamRolesIconId: pb.team_roles_icon_id ?? null,
        billingIconId: pb.billing_icon_id ?? null,
        packagesIconId: pb.packages_icon_id ?? null,
        checklistItemsIconId: pb.checklist_items_icon_id ?? null,
        fieldDefinitionsIconId: pb.field_definitions_icon_id ?? null,
        brandingTemplatesIconId: pb.branding_templates_icon_id ?? null,
        assetsIconId: pb.assets_icon_id ?? null,
        communicationsIconId: pb.communications_icon_id ?? null,
        integrationsIconId: pb.integrations_icon_id ?? null,
        archiveIconId: pb.archive_icon_id ?? null
      };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
};

const saveSettingsIcons = async () => {
  try {
    savingIcons.value = true;
    await api.put('/platform-branding', {
      companyProfileIconId: settingsIcons.value.companyProfileIconId,
      teamRolesIconId: settingsIcons.value.teamRolesIconId,
      billingIconId: settingsIcons.value.billingIconId,
      packagesIconId: settingsIcons.value.packagesIconId,
      checklistItemsIconId: settingsIcons.value.checklistItemsIconId,
      fieldDefinitionsIconId: settingsIcons.value.fieldDefinitionsIconId,
      brandingTemplatesIconId: settingsIcons.value.brandingTemplatesIconId,
      assetsIconId: settingsIcons.value.assetsIconId,
      communicationsIconId: settingsIcons.value.communicationsIconId,
      integrationsIconId: settingsIcons.value.integrationsIconId,
      archiveIconId: settingsIcons.value.archiveIconId
    });
    await brandingStore.fetchPlatformBranding();
    alert('Settings icons saved successfully!');
  } catch (err) {
    console.error('Failed to save settings icons:', err);
    alert('Failed to save settings icons');
  } finally {
    savingIcons.value = false;
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

