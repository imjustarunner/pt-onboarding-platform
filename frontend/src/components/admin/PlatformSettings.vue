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
      <h3>Intake Data Retention</h3>
      <p class="section-description">
        Default retention policy for public intake submissions and intake documents. Agencies can override this, and intake links can override per-link.
      </p>
      <div class="form-grid">
        <div class="form-group">
          <label>Default retention</label>
          <select v-model="retentionSettings.mode">
            <option value="days">Delete after N days</option>
            <option value="never">Never delete automatically</option>
          </select>
        </div>
        <div class="form-group" v-if="retentionSettings.mode === 'days'">
          <label>Days to retain</label>
          <input v-model.number="retentionSettings.days" type="number" min="1" max="3650" />
          <small>Recommended default: 14</small>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" @click="saveRetentionSettings" :disabled="savingRetentionSettings">
          {{ savingRetentionSettings ? 'Saving...' : 'Save Retention Policy' }}
        </button>
      </div>
    </div>
    
    <div class="settings-section">
      <h3>Session Lock (Platform Max)</h3>
      <p class="section-description">
        Maximum inactivity timeout for session lock across the platform. Agencies can set a lower max for their users. Users choose their timeout in My Preferences (capped by agency/platform max).
      </p>
      <div class="form-grid">
        <div class="form-group">
          <label>Platform max inactivity timeout (minutes)</label>
          <input v-model.number="sessionLockPlatformMax" type="number" min="1" max="240" />
          <small>Default: 30. Users with session lock enabled can choose up to this (or their agency's lower max). Valid: 1–240.</small>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" @click="saveSessionLockPlatformMax" :disabled="savingSessionLock">
          {{ savingSessionLock ? 'Saving...' : 'Save Session Lock Max' }}
        </button>
      </div>
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
          <label>My Schedule</label>
          <IconSelector v-model="myDashboardIcons.myScheduleIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Clients</label>
          <IconSelector v-model="myDashboardIcons.clientsIconId" />
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
        <div class="icon-setting-item">
          <label>Communications</label>
          <IconSelector v-model="myDashboardIcons.communicationsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Chats</label>
          <IconSelector v-model="myDashboardIcons.chatsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Notifications</label>
          <IconSelector v-model="myDashboardIcons.notificationsIconId" />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-primary" @click="saveMyDashboardIcons" :disabled="savingMyDashboardIcons">
          {{ savingMyDashboardIcons ? 'Saving...' : 'Save My Dashboard Icons' }}
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3>School Portal Card Icons</h3>
      <p class="section-description">
        Set platform default icons for the School Portal home cards. Agencies can override these in Company Profile → Customize Icons (these apply to affiliated schools/programs).
      </p>

      <div class="settings-icons-grid">
        <div class="icon-setting-item">
          <label>Providers</label>
          <IconSelector v-model="schoolPortalIcons.providersIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Days</label>
          <IconSelector v-model="schoolPortalIcons.daysIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Roster</label>
          <IconSelector v-model="schoolPortalIcons.rosterIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Skills Groups</label>
          <IconSelector v-model="schoolPortalIcons.skillsGroupsIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Contact Admin</label>
          <IconSelector v-model="schoolPortalIcons.contactAdminIconId" />
        </div>
        <div class="icon-setting-item">
          <label>FAQ</label>
          <IconSelector v-model="schoolPortalIcons.faqIconId" />
        </div>
        <div class="icon-setting-item">
          <label>School staff</label>
          <IconSelector v-model="schoolPortalIcons.schoolStaffIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Parent QR code</label>
          <IconSelector v-model="schoolPortalIcons.parentQrIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Parent fill + sign</label>
          <IconSelector v-model="schoolPortalIcons.parentSignIconId" />
        </div>
        <div class="icon-setting-item">
          <label>Upload packet</label>
          <IconSelector v-model="schoolPortalIcons.uploadPacketIconId" />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-primary" @click="saveSchoolPortalIcons" :disabled="savingSchoolPortalIcons">
          {{ savingSchoolPortalIcons ? 'Saving...' : 'Save School Portal Icons' }}
        </button>
      </div>
    </div>
    
    <div class="settings-section">
      <h3>Beta Feedback</h3>
      <p class="section-description">
        When enabled, all users see a floating "Beta" widget on screen. They can report issues with screenshots and context (route, what they were doing). Submissions are visible in the Beta Feedback dashboard (Super Admin only).
      </p>
      <div class="form-grid">
        <div class="form-group">
          <label class="toggle-label">
            <span class="toggle-switch">
              <input
                v-model="betaFeedbackEnabled"
                type="checkbox"
                :disabled="savingBetaFeedback"
              />
              <span class="toggle-slider" />
            </span>
            <span class="toggle-text">Beta Feedback Widget Enabled</span>
          </label>
          <small>Turn on to let users submit feedback with screenshots for debugging.</small>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" @click="saveBetaFeedbackEnabled" :disabled="savingBetaFeedback">
          {{ savingBetaFeedback ? 'Saving...' : 'Save Beta Feedback Setting' }}
        </button>
        <router-link to="/admin/beta-feedback" class="btn btn-secondary">View Submissions</router-link>
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
const savingSchoolPortalIcons = ref(false);
const savingRetentionSettings = ref(false);
const savingSessionLock = ref(false);
const savingBetaFeedback = ref(false);
const sessionLockPlatformMax = ref(30);
const betaFeedbackEnabled = ref(false);
const superAdminCount = ref(0);
const totalAgencies = ref(0);
const retentionSettings = ref({
  mode: 'days',
  days: 14
});

// settings navigation icons are configured in BrandingConfig

const myDashboardIcons = ref({
  checklistIconId: null,
  trainingIconId: null,
  documentsIconId: null,
  myScheduleIconId: null,
  clientsIconId: null,
  submitIconId: null,
  payrollIconId: null,
  myAccountIconId: null,
  onDemandTrainingIconId: null,
  communicationsIconId: null,
  chatsIconId: null,
  notificationsIconId: null
});

const schoolPortalIcons = ref({
  providersIconId: null,
  daysIconId: null,
  rosterIconId: null,
  skillsGroupsIconId: null,
  contactAdminIconId: null,
  faqIconId: null,
  schoolStaffIconId: null,
  parentQrIconId: null,
  parentSignIconId: null,
  uploadPacketIconId: null
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
        myScheduleIconId: pb.my_dashboard_my_schedule_icon_id ?? null,
        clientsIconId: pb.my_dashboard_clients_icon_id ?? null,
        submitIconId: pb.my_dashboard_submit_icon_id ?? null,
        payrollIconId: pb.my_dashboard_payroll_icon_id ?? null,
        myAccountIconId: pb.my_dashboard_my_account_icon_id ?? null,
        onDemandTrainingIconId: pb.my_dashboard_on_demand_training_icon_id ?? null,
        communicationsIconId: pb.my_dashboard_communications_icon_id ?? null,
        chatsIconId: pb.my_dashboard_chats_icon_id ?? null,
        notificationsIconId: pb.my_dashboard_notifications_icon_id ?? null
      };
      schoolPortalIcons.value = {
        providersIconId: pb.school_portal_providers_icon_id ?? null,
        daysIconId: pb.school_portal_days_icon_id ?? null,
        rosterIconId: pb.school_portal_roster_icon_id ?? null,
        skillsGroupsIconId: pb.school_portal_skills_groups_icon_id ?? null,
        contactAdminIconId: pb.school_portal_contact_admin_icon_id ?? null,
        faqIconId: pb.school_portal_faq_icon_id ?? null,
        schoolStaffIconId: pb.school_portal_school_staff_icon_id ?? null,
        parentQrIconId: pb.school_portal_parent_qr_icon_id ?? null,
        parentSignIconId: pb.school_portal_parent_sign_icon_id ?? null,
        uploadPacketIconId: pb.school_portal_upload_packet_icon_id ?? null
      };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
};

const fetchSessionLockPlatformMax = () => {
  const pb = brandingStore.platformBranding;
  const val = pb?.max_inactivity_timeout_minutes ?? 30;
  sessionLockPlatformMax.value = Math.min(240, Math.max(1, parseInt(val, 10) || 30));
};

const fetchBetaFeedbackEnabled = () => {
  const pb = brandingStore.platformBranding;
  betaFeedbackEnabled.value = !!pb?.beta_feedback_enabled;
};

const saveBetaFeedbackEnabled = async () => {
  try {
    savingBetaFeedback.value = true;
    await api.put('/platform-branding', {
      betaFeedbackEnabled: betaFeedbackEnabled.value
    });
    await brandingStore.fetchPlatformBranding();
    alert('Beta feedback setting saved successfully.');
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Failed to save';
    alert(msg);
  } finally {
    savingBetaFeedback.value = false;
  }
};

const fetchRetentionSettings = async () => {
  try {
    const res = await api.get('/platform-retention-settings');
    const mode = String(res.data?.default_intake_retention_mode || 'days').toLowerCase();
    const days = Number(res.data?.default_intake_retention_days || 14);
    retentionSettings.value = {
      mode: mode === 'never' ? 'never' : 'days',
      days: Number.isFinite(days) ? days : 14
    };
  } catch (err) {
    console.error('Failed to load retention settings:', err);
  }
};


const saveMyDashboardIcons = async () => {
  try {
    savingMyDashboardIcons.value = true;
    await api.put('/platform-branding', {
      myDashboardChecklistIconId: myDashboardIcons.value.checklistIconId,
      myDashboardTrainingIconId: myDashboardIcons.value.trainingIconId,
      myDashboardDocumentsIconId: myDashboardIcons.value.documentsIconId,
      myDashboardMyScheduleIconId: myDashboardIcons.value.myScheduleIconId,
      myDashboardClientsIconId: myDashboardIcons.value.clientsIconId,
      myDashboardSubmitIconId: myDashboardIcons.value.submitIconId,
      myDashboardPayrollIconId: myDashboardIcons.value.payrollIconId,
      myDashboardMyAccountIconId: myDashboardIcons.value.myAccountIconId,
      myDashboardOnDemandTrainingIconId: myDashboardIcons.value.onDemandTrainingIconId,
      myDashboardCommunicationsIconId: myDashboardIcons.value.communicationsIconId,
      myDashboardChatsIconId: myDashboardIcons.value.chatsIconId,
      myDashboardNotificationsIconId: myDashboardIcons.value.notificationsIconId
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

const saveSchoolPortalIcons = async () => {
  try {
    savingSchoolPortalIcons.value = true;
    await api.put('/platform-branding', {
      schoolPortalProvidersIconId: schoolPortalIcons.value.providersIconId,
      schoolPortalDaysIconId: schoolPortalIcons.value.daysIconId,
      schoolPortalRosterIconId: schoolPortalIcons.value.rosterIconId,
      schoolPortalSkillsGroupsIconId: schoolPortalIcons.value.skillsGroupsIconId,
      schoolPortalContactAdminIconId: schoolPortalIcons.value.contactAdminIconId,
      schoolPortalFaqIconId: schoolPortalIcons.value.faqIconId,
      schoolPortalSchoolStaffIconId: schoolPortalIcons.value.schoolStaffIconId,
      schoolPortalParentQrIconId: schoolPortalIcons.value.parentQrIconId,
      schoolPortalParentSignIconId: schoolPortalIcons.value.parentSignIconId,
      schoolPortalUploadPacketIconId: schoolPortalIcons.value.uploadPacketIconId
    });
    await brandingStore.fetchPlatformBranding();
    alert('School Portal icons saved successfully!');
  } catch (err) {
    console.error('Failed to save School Portal icons:', err);
    const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Failed to save School Portal icons';
    alert(msg);
  } finally {
    savingSchoolPortalIcons.value = false;
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

const saveSessionLockPlatformMax = async () => {
  try {
    savingSessionLock.value = true;
    const val = Math.min(240, Math.max(1, parseInt(sessionLockPlatformMax.value, 10) || 30));
    await api.put('/platform-branding', {
      maxInactivityTimeoutMinutes: val
    });
    await brandingStore.fetchPlatformBranding();
    alert('Session lock platform max saved successfully.');
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Failed to save';
    alert(msg);
  } finally {
    savingSessionLock.value = false;
  }
};

const saveRetentionSettings = async () => {
  try {
    savingRetentionSettings.value = true;
    await api.put('/platform-retention-settings', {
      defaultIntakeRetentionMode: retentionSettings.value.mode,
      defaultIntakeRetentionDays: retentionSettings.value.days
    });
    alert('Retention policy saved successfully!');
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Failed to save retention policy';
    alert(msg);
  } finally {
    savingRetentionSettings.value = false;
  }
};

onMounted(async () => {
  await fetchSettings();
  await fetchRetentionSettings();
  fetchSessionLockPlatformMax();
  fetchBetaFeedbackEnabled();
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

.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: 0.2s;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 2px;
  background-color: white;
  transition: 0.2s;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.18);
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--primary);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-text {
  font-weight: 600;
  color: var(--text-primary);
}

.toggle-label small {
  display: block;
  margin-top: 6px;
  margin-left: 56px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>

