<template>
  <div class="branding-template-manager">
    <div class="page-header">
      <h2>Branding Templates</h2>
      <button @click="openCreateModal" class="btn btn-primary">Create Template</button>
    </div>

    <div class="filter-section">
      <label>Filter:</label>
      <select v-model="filterScope" @change="fetchTemplates" class="filter-select">
        <option value="all">All Templates</option>
        <option value="platform">Platform Templates</option>
        <option value="agency">Agency Templates</option>
      </select>
    </div>

    <div v-if="loading" class="loading">Loading templates...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else>
      <div v-if="filteredTemplates.length === 0" class="empty-state">
        <p>No templates found. Create your first template to get started.</p>
      </div>

      <div v-else class="templates-list">
        <div v-for="template in filteredTemplates" :key="template.id" class="template-card">
          <div class="template-header">
            <div>
              <h3>{{ template.name }}</h3>
              <div class="template-meta">
                <span :class="['badge', template.scope === 'platform' ? 'badge-success' : 'badge-info']">
                  {{ template.scope === 'platform' ? 'Platform' : 'Agency' }}
                </span>
                <span v-if="template.is_shared" class="badge badge-warning">Shared</span>
                <span v-if="template.agency_id && getAgencyName(template.agency_id)" class="badge badge-secondary">
                  {{ getAgencyName(template.agency_id) }}
                </span>
              </div>
              <p v-if="template.description" class="template-description">{{ template.description }}</p>
            </div>
            <div class="template-actions">
              <button @click="previewTemplate(template)" class="btn btn-secondary btn-sm">Preview</button>
              <button @click="applyTemplate(template)" class="btn btn-primary btn-sm">Apply</button>
              <button @click="scheduleTemplate(template)" class="btn btn-info btn-sm">Schedule</button>
              <button @click="editTemplate(template)" class="btn btn-secondary btn-sm">Edit</button>
              <button @click="deleteTemplate(template.id)" class="btn btn-danger btn-sm">Delete</button>
            </div>
          </div>
          <div class="template-schedules" v-if="templateSchedules[template.id]?.length > 0">
            <small><strong>Scheduled:</strong></small>
            <div v-for="schedule in templateSchedules[template.id]" :key="schedule.id" class="schedule-item">
              {{ formatDate(schedule.start_date) }} - {{ formatDate(schedule.end_date) }}
              <span :class="['badge', schedule.is_active ? 'badge-success' : 'badge-secondary']">
                {{ schedule.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Template Modal -->
    <div v-if="showCreateModal || editingTemplate" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content large-modal" @click.stop>
        <h3>{{ editingTemplate ? 'Edit Template' : 'Create Template' }}</h3>
        <form @submit.prevent="saveTemplate">
          <div class="form-group">
            <label>Template Name *</label>
            <input v-model="templateForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="templateForm.description" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>Scope *</label>
            <select v-model="templateForm.scope" required :disabled="editingTemplate" @change="handleScopeChange">
              <option value="platform">Platform</option>
              <option value="agency">Agency</option>
            </select>
            <small class="form-help" style="color: var(--text-secondary);">
              Select "Agency" to create a template for a specific agency, or "Platform" for a platform-wide template
            </small>
          </div>
          <div v-if="templateForm.scope === 'agency'" class="form-group">
            <label>Agency *</label>
            <select v-model="templateForm.agencyId" required :disabled="editingTemplate" class="form-select">
              <option v-if="!templateForm.agencyId" value="">-- Select an agency --</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
            <div v-if="templateForm.scope === 'agency' && availableAgencies.length === 0" class="form-help" style="color: #dc3545; margin-top: 8px;">
              <strong>No agencies available.</strong> Please ensure agencies are loaded. If you're a super admin, agencies should load automatically.
            </div>
            <div v-else-if="templateForm.scope === 'agency' && !templateForm.agencyId" class="form-help" style="color: #dc3545; margin-top: 8px;">
              <strong>Please select an agency</strong> for this template ({{ availableAgencies.length }} available)
            </div>
            <div v-else-if="templateForm.scope === 'agency' && templateForm.agencyId" class="form-help" style="color: #28a745; margin-top: 8px;">
              ✓ Selected: <strong>{{ getAgencyName(templateForm.agencyId) }}</strong>
            </div>
          </div>
          <div v-if="templateForm.scope === 'platform' && authStore.user?.role === 'super_admin'" class="form-group">
            <label>
              <input v-model="templateForm.isShared" type="checkbox" />
              Share with agencies
            </label>
            <small>Allow agencies to use this template</small>
          </div>

          <div class="form-group">
            <label>Include in Template:</label>
            <div class="include-fields">
              <div class="field-group">
                <label>
                  <input v-model="templateForm.includeFields.colors" type="checkbox" />
                  <strong>Colors</strong>
                </label>
                <div v-if="templateForm.includeFields.colors" class="nested-fields">
                  <label><input v-model="templateForm.includeFields.primaryColor" type="checkbox" /> Primary</label>
                  <label><input v-model="templateForm.includeFields.secondaryColor" type="checkbox" /> Secondary</label>
                  <label><input v-model="templateForm.includeFields.accentColor" type="checkbox" /> Accent</label>
                  <label><input v-model="templateForm.includeFields.successColor" type="checkbox" /> Success</label>
                  <label><input v-model="templateForm.includeFields.errorColor" type="checkbox" /> Error</label>
                  <label><input v-model="templateForm.includeFields.warningColor" type="checkbox" /> Warning</label>
                  <label><input v-model="templateForm.includeFields.backgroundColor" type="checkbox" /> Background</label>
                </div>
              </div>
              <div class="field-group">
                <label>
                  <input v-model="templateForm.includeFields.fonts" type="checkbox" />
                  <strong>Fonts</strong>
                </label>
                <div v-if="templateForm.includeFields.fonts" class="nested-fields">
                  <label><input v-model="templateForm.includeFields.headerFont" type="checkbox" /> Header</label>
                  <label><input v-model="templateForm.includeFields.bodyFont" type="checkbox" /> Body</label>
                  <label><input v-model="templateForm.includeFields.numericFont" type="checkbox" /> Numeric</label>
                  <label><input v-model="templateForm.includeFields.displayFont" type="checkbox" /> Display</label>
                </div>
              </div>
              <div class="field-group">
                <label>
                  <input v-model="templateForm.includeFields.icons" type="checkbox" />
                  <strong>Icons</strong>
                </label>
                <div v-if="templateForm.includeFields.icons" class="nested-fields">
                  <label><input v-model="templateForm.includeFields.manageAgenciesIcon" type="checkbox" /> Manage Agencies</label>
                  <label><input v-model="templateForm.includeFields.manageModulesIcon" type="checkbox" /> Manage Modules</label>
                  <label><input v-model="templateForm.includeFields.manageDocumentsIcon" type="checkbox" /> Manage Documents</label>
                  <label><input v-model="templateForm.includeFields.manageUsersIcon" type="checkbox" /> Manage Users</label>
                  <label><input v-model="templateForm.includeFields.platformSettingsIcon" type="checkbox" /> Platform Settings</label>
                  <label><input v-model="templateForm.includeFields.viewAllProgressIcon" type="checkbox" /> View All Progress</label>
                  <label><input v-model="templateForm.includeFields.progressDashboardIcon" type="checkbox" /> Progress Dashboard</label>
                  <label><input v-model="templateForm.includeFields.settingsIcon" type="checkbox" /> Settings</label>
                  <label><input v-model="templateForm.includeFields.masterBrandIcon" type="checkbox" /> Master Brand</label>
                  <label><input v-model="templateForm.includeFields.allAgenciesNotificationsIcon" type="checkbox" /> All Agencies Notifications</label>
                </div>
              </div>
              <div class="field-group">
                <label>
                  <input v-model="templateForm.includeFields.tagline" type="checkbox" />
                  <strong>Tagline</strong>
                </label>
              </div>
              <div v-if="templateForm.scope === 'agency'" class="field-group">
                <label>
                  <input v-model="templateForm.includeFields.terminology" type="checkbox" />
                  <strong>Terminology</strong>
                </label>
              </div>
            </div>
          </div>

          <div v-if="error" class="error-message" style="margin: 16px 0; padding: 12px; background: #fee; border: 1px solid #dc3545; border-radius: 6px; color: #dc3545;">
            {{ error }}
          </div>

          <div class="modal-actions">
            <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save Template' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Preview Modal -->
    <div v-if="previewingTemplate" class="modal-overlay" @click="closePreview">
      <div class="modal-content" @click.stop>
        <h3>Template Preview: {{ previewingTemplate.name }}</h3>
        <div class="preview-content" v-if="previewingTemplate.template_data && Object.keys(previewingTemplate.template_data).length > 0">
          <h4>This template will change:</h4>
          <ul>
            <li v-if="previewingTemplate.template_data.primary_color">
              Primary Color: <span class="color-preview" :style="{ backgroundColor: previewingTemplate.template_data.primary_color }"></span> {{ previewingTemplate.template_data.primary_color }}
            </li>
            <li v-if="previewingTemplate.template_data.secondary_color">
              Secondary Color: <span class="color-preview" :style="{ backgroundColor: previewingTemplate.template_data.secondary_color }"></span> {{ previewingTemplate.template_data.secondary_color }}
            </li>
            <li v-if="previewingTemplate.template_data.accent_color">
              Accent Color: <span class="color-preview" :style="{ backgroundColor: previewingTemplate.template_data.accent_color }"></span> {{ previewingTemplate.template_data.accent_color }}
            </li>
            <li v-if="previewingTemplate.template_data.success_color">
              Success Color: <span class="color-preview" :style="{ backgroundColor: previewingTemplate.template_data.success_color }"></span> {{ previewingTemplate.template_data.success_color }}
            </li>
            <li v-if="previewingTemplate.template_data.error_color">
              Error Color: <span class="color-preview" :style="{ backgroundColor: previewingTemplate.template_data.error_color }"></span> {{ previewingTemplate.template_data.error_color }}
            </li>
            <li v-if="previewingTemplate.template_data.warning_color">
              Warning Color: <span class="color-preview" :style="{ backgroundColor: previewingTemplate.template_data.warning_color }"></span> {{ previewingTemplate.template_data.warning_color }}
            </li>
            <li v-if="previewingTemplate.template_data.background_color">
              Background Color: <span class="color-preview" :style="{ backgroundColor: previewingTemplate.template_data.background_color }"></span> {{ previewingTemplate.template_data.background_color }}
            </li>
            <li v-if="previewingTemplate.template_data.tagline">
              Tagline: {{ previewingTemplate.template_data.tagline }}
            </li>
            <li v-if="previewingTemplate.template_data.people_ops_term">
              People Ops Term: {{ previewingTemplate.template_data.people_ops_term }}
            </li>
            <li v-if="previewingTemplate.template_data.header_font || previewingTemplate.template_data.header_font_id">
              Header Font: {{ previewingTemplate.template_data.header_font || 'Font ID: ' + previewingTemplate.template_data.header_font_id }}
            </li>
            <li v-if="previewingTemplate.template_data.body_font || previewingTemplate.template_data.body_font_id">
              Body Font: {{ previewingTemplate.template_data.body_font || 'Font ID: ' + previewingTemplate.template_data.body_font_id }}
            </li>
            <li v-if="previewingTemplate.template_data.numeric_font || previewingTemplate.template_data.numeric_font_id">
              Numeric Font: {{ previewingTemplate.template_data.numeric_font || 'Font ID: ' + previewingTemplate.template_data.numeric_font_id }}
            </li>
            <li v-if="previewingTemplate.template_data.display_font || previewingTemplate.template_data.display_font_id">
              Display Font: {{ previewingTemplate.template_data.display_font || 'Font ID: ' + previewingTemplate.template_data.display_font_id }}
            </li>
            <li v-if="previewingTemplate.template_data.manage_agencies_icon_id">
              Manage Agencies Icon ID: {{ previewingTemplate.template_data.manage_agencies_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.manage_modules_icon_id">
              Manage Modules Icon ID: {{ previewingTemplate.template_data.manage_modules_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.manage_documents_icon_id">
              Manage Documents Icon ID: {{ previewingTemplate.template_data.manage_documents_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.manage_users_icon_id">
              Manage Users Icon ID: {{ previewingTemplate.template_data.manage_users_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.platform_settings_icon_id">
              Platform Settings Icon ID: {{ previewingTemplate.template_data.platform_settings_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.view_all_progress_icon_id">
              View All Progress Icon ID: {{ previewingTemplate.template_data.view_all_progress_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.progress_dashboard_icon_id">
              Progress Dashboard Icon ID: {{ previewingTemplate.template_data.progress_dashboard_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.settings_icon_id">
              Settings Icon ID: {{ previewingTemplate.template_data.settings_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.master_brand_icon_id">
              Master Brand Icon ID: {{ previewingTemplate.template_data.master_brand_icon_id }}
            </li>
            <li v-if="previewingTemplate.template_data.all_agencies_notifications_icon_id">
              All Agencies Notifications Icon ID: {{ previewingTemplate.template_data.all_agencies_notifications_icon_id }}
            </li>
          </ul>
        </div>
        <div v-else class="preview-content">
          <p class="text-warning">No template data available. This template may be empty or corrupted.</p>
        </div>
        <div class="modal-actions">
          <button @click="closePreview" class="btn btn-secondary">Close</button>
          <button @click="applyTemplate(previewingTemplate)" class="btn btn-primary" :disabled="!previewingTemplate.template_data || Object.keys(previewingTemplate.template_data).length === 0">Apply Template</button>
        </div>
      </div>
    </div>

    <!-- Schedule Modal -->
    <div v-if="schedulingTemplate" class="modal-overlay" @click="closeSchedule">
      <div class="modal-content" @click.stop>
        <h3>Schedule Template: {{ schedulingTemplate.name }}</h3>
        <form @submit.prevent="saveSchedule">
          <div class="form-group">
            <label>Start Date *</label>
            <input v-model="scheduleForm.startDate" type="date" required />
          </div>
          <div class="form-group">
            <label>End Date *</label>
            <input v-model="scheduleForm.endDate" type="date" required :min="scheduleForm.startDate" />
          </div>
          <div class="form-group">
            <label>
              <input v-model="scheduleForm.isActive" type="checkbox" />
              Active
            </label>
          </div>
          <div v-if="scheduleWarning" class="alert alert-warning">
            {{ scheduleWarning }}
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeSchedule" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="savingSchedule">
              {{ savingSchedule ? 'Saving...' : 'Save Schedule' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(false);
const error = ref('');
const templates = ref([]);
const filterScope = ref('all');
const showCreateModal = ref(false);
const editingTemplate = ref(null);
const saving = ref(false);
const previewingTemplate = ref(null);
const schedulingTemplate = ref(null);
const scheduleForm = ref({
  startDate: '',
  endDate: '',
  isActive: true
});
const savingSchedule = ref(false);
const scheduleWarning = ref('');
const templateSchedules = ref({});
const availableAgencies = ref([]);

// Initialize templateForm with default values based on user role
const getDefaultTemplateForm = () => {
  const defaultScope = authStore.user?.role === 'super_admin' ? 'platform' : 'agency';
  const defaultAgencyId = authStore.user?.role === 'admin' && authStore.user?.agency_id 
    ? authStore.user.agency_id 
    : (availableAgencies.value.length > 0 ? availableAgencies.value[0].id : null);
  
  return {
    name: '',
    description: '',
    scope: defaultScope,
    agencyId: defaultScope === 'agency' ? defaultAgencyId : null,
    isShared: false,
    includeFields: {
      colors: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      successColor: true,
      errorColor: true,
      warningColor: true,
      backgroundColor: true,
      fonts: false,
      headerFont: true,
      bodyFont: true,
      numericFont: true,
      displayFont: true,
      icons: false,
      manageAgenciesIcon: true,
      manageModulesIcon: true,
      manageDocumentsIcon: true,
      manageUsersIcon: true,
      platformSettingsIcon: true,
      viewAllProgressIcon: true,
      progressDashboardIcon: true,
      settingsIcon: true,
      masterBrandIcon: true,
      allAgenciesNotificationsIcon: true,
      tagline: false,
      terminology: false
    }
  };
};

const templateForm = ref(getDefaultTemplateForm());

const filteredTemplates = computed(() => {
  if (filterScope.value === 'all') return templates.value;
  return templates.value.filter(t => t.scope === filterScope.value);
});

const getAgencyName = (agencyId) => {
  const agency = availableAgencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : 'Unknown';
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

const formatKey = (key) => {
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const fetchTemplates = async () => {
  try {
    loading.value = true;
    error.value = '';
    const params = {};
    if (filterScope.value !== 'all') {
      params.scope = filterScope.value;
    }
    if (authStore.user?.role === 'admin' && authStore.user?.agency_id) {
      params.agencyId = authStore.user.agency_id;
      params.includeShared = 'true';
    }
    const response = await api.get('/branding-templates', { params });
    templates.value = response.data || [];
    
    // Fetch schedules for each template
    for (const template of templates.value) {
      try {
        const scheduleResponse = await api.get(`/branding-templates/${template.id}/schedules`);
        templateSchedules.value[template.id] = scheduleResponse.data || [];
      } catch (err) {
        templateSchedules.value[template.id] = [];
      }
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load templates';
  } finally {
    loading.value = false;
  }
};

const fetchAgencies = async () => {
  try {
    await agencyStore.fetchAgencies();
    if (authStore.user?.role === 'super_admin') {
      availableAgencies.value = agencyStore.agencies || [];
      console.log('Loaded agencies for super_admin:', availableAgencies.value.length);
    } else if (authStore.user?.role === 'admin' && authStore.user?.agency_id) {
      const agency = agencyStore.userAgencies?.find(a => a.id === authStore.user.agency_id);
      if (agency) {
        availableAgencies.value = [agency];
        console.log('Loaded agency for admin:', agency.name);
      } else {
        // Fallback: try to find in all agencies
        const allAgencies = agencyStore.agencies || [];
        const userAgency = allAgencies.find(a => a.id === authStore.user.agency_id);
        if (userAgency) {
          availableAgencies.value = [userAgency];
          console.log('Loaded agency for admin (fallback):', userAgency.name);
        }
      }
    }
    
    // Update templateForm default agencyId if it's not set and scope is agency
    if (templateForm.value.scope === 'agency' && !templateForm.value.agencyId && availableAgencies.value.length > 0) {
      templateForm.value.agencyId = availableAgencies.value[0].id;
      console.log('Auto-selected agency:', templateForm.value.agencyId);
    }
  } catch (err) {
    console.error('Failed to load agencies:', err);
    error.value = 'Failed to load agencies. Please refresh the page.';
  }
};

const saveTemplate = async () => {
  try {
    saving.value = true;
    error.value = '';

    // Validate required fields
    if (!templateForm.value.name || !templateForm.value.name.trim()) {
      error.value = 'Template name is required';
      saving.value = false;
      alert('Template name is required');
      return;
    }

    if (!templateForm.value.scope) {
      error.value = 'Scope is required';
      saving.value = false;
      alert('Scope is required');
      return;
    }

    if (templateForm.value.scope === 'agency' && !templateForm.value.agencyId) {
      error.value = 'Agency is required for agency templates';
      saving.value = false;
      alert('Agency is required for agency templates');
      return;
    }

    // Validate that at least one includeFields option is selected
    const hasAnyIncludeField = templateForm.value.includeFields.colors || 
                               templateForm.value.includeFields.fonts || 
                               templateForm.value.includeFields.icons || 
                               templateForm.value.includeFields.tagline || 
                               templateForm.value.includeFields.terminology;
    
    if (!hasAnyIncludeField) {
      error.value = 'Please select at least one field to include in the template (Colors, Fonts, Icons, Tagline, or Terminology)';
      saving.value = false;
      alert('Please select at least one field to include in the template');
      return;
    }

    // Ensure agencyId is properly set for agency scope
    let finalAgencyId = null;
    if (templateForm.value.scope === 'agency') {
      if (!templateForm.value.agencyId) {
        error.value = 'Agency is required for agency templates';
        saving.value = false;
        alert('Agency is required for agency templates. Please select an agency.');
        return;
      }
      finalAgencyId = parseInt(templateForm.value.agencyId);
      if (isNaN(finalAgencyId)) {
        error.value = 'Invalid agency selected';
        saving.value = false;
        alert('Invalid agency selected. Please select a valid agency.');
        return;
      }
    }

    const templateData = {
      name: templateForm.value.name.trim(),
      description: templateForm.value.description?.trim() || null,
      scope: templateForm.value.scope,
      agencyId: templateForm.value.scope === 'agency' ? finalAgencyId : null,
      isShared: templateForm.value.scope === 'platform' ? Boolean(templateForm.value.isShared) : false,
      includeFields: templateForm.value.includeFields
    };

    console.log('Saving template with data:', templateData);
    console.log('IncludeFields:', JSON.stringify(templateData.includeFields, null, 2));
    console.log('Scope:', templateData.scope, 'AgencyId:', templateData.agencyId);

    let response;
    try {
      if (editingTemplate.value) {
        response = await api.put(`/branding-templates/${editingTemplate.value.id}`, templateData);
        console.log('Template updated successfully:', response.data);
      } else {
        response = await api.post('/branding-templates', templateData);
        console.log('Template created successfully:', response.data);
      }
    } catch (apiError) {
      console.error('API Error details:', {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        message: apiError.message
      });
      throw apiError; // Re-throw to be caught by outer catch
    }

    await fetchTemplates();
    
    // Show success message
    alert('Template saved successfully!');
    closeModal();
  } catch (err) {
    console.error('Error saving template:', err);
    console.error('Error response:', err.response);
    console.error('Error response data:', err.response?.data);
    const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to save template';
    error.value = errorMessage;
    // Also show alert for visibility
    alert(`Failed to save template: ${errorMessage}`);
    // Don't close modal on error so user can fix and retry
  } finally {
    saving.value = false;
  }
};

const editTemplate = (template) => {
  editingTemplate.value = template;
  
  // Extract includeFields from existing template_data
  const templateData = template.template_data || {};
  const includeFields = {
    colors: !!(templateData.primary_color || templateData.secondary_color || templateData.accent_color || 
               templateData.success_color || templateData.error_color || templateData.warning_color || 
               templateData.background_color),
    primaryColor: !!templateData.primary_color,
    secondaryColor: !!templateData.secondary_color,
    accentColor: !!templateData.accent_color,
    successColor: !!templateData.success_color,
    errorColor: !!templateData.error_color,
    warningColor: !!templateData.warning_color,
    backgroundColor: !!templateData.background_color,
    fonts: !!(templateData.header_font_id || templateData.header_font || templateData.body_font_id || 
              templateData.body_font || templateData.numeric_font_id || templateData.numeric_font || 
              templateData.display_font_id || templateData.display_font),
    headerFont: !!(templateData.header_font_id || templateData.header_font),
    bodyFont: !!(templateData.body_font_id || templateData.body_font),
    numericFont: !!(templateData.numeric_font_id || templateData.numeric_font),
    displayFont: !!(templateData.display_font_id || templateData.display_font),
    icons: !!(templateData.manage_agencies_icon_id || templateData.manage_modules_icon_id || 
              templateData.manage_documents_icon_id || templateData.manage_users_icon_id || 
              templateData.platform_settings_icon_id || templateData.view_all_progress_icon_id || 
              templateData.progress_dashboard_icon_id || templateData.settings_icon_id || 
              templateData.master_brand_icon_id || templateData.all_agencies_notifications_icon_id),
    manageAgenciesIcon: !!templateData.manage_agencies_icon_id,
    manageModulesIcon: !!templateData.manage_modules_icon_id,
    manageDocumentsIcon: !!templateData.manage_documents_icon_id,
    manageUsersIcon: !!templateData.manage_users_icon_id,
    platformSettingsIcon: !!templateData.platform_settings_icon_id,
    viewAllProgressIcon: !!templateData.view_all_progress_icon_id,
    progressDashboardIcon: !!templateData.progress_dashboard_icon_id,
    settingsIcon: !!templateData.settings_icon_id,
    masterBrandIcon: !!templateData.master_brand_icon_id,
    allAgenciesNotificationsIcon: !!templateData.all_agencies_notifications_icon_id,
    tagline: !!templateData.tagline,
    terminology: !!templateData.people_ops_term
  };
  
  templateForm.value = {
    name: template.name,
    description: template.description || '',
    scope: template.scope,
    agencyId: template.agency_id,
    isShared: template.is_shared || false,
    includeFields
  };
  showCreateModal.value = true;
};

const deleteTemplate = async (templateId) => {
  if (!confirm('Are you sure you want to delete this template?')) return;

  try {
    await api.delete(`/branding-templates/${templateId}`);
    await fetchTemplates();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete template';
  }
};

const applyTemplate = async (template) => {
  if (!confirm(`Apply template "${template.name}" to ${template.scope === 'platform' ? 'platform' : 'agency'} branding?`)) return;

  try {
    const targetScope = template.scope;
    const targetAgencyId = template.scope === 'agency' ? template.agency_id : null;
    
    const response = await api.post(`/branding-templates/${template.id}/apply`, {
      targetScope,
      targetAgencyId
    });

    alert('Template applied successfully!');
    closePreview();
    
    // Refresh branding if needed
    if (targetScope === 'platform') {
      // Force a full page reload to ensure all branding is updated
      window.location.reload();
    } else {
      // For agency templates, refresh the templates list
      await fetchTemplates();
    }
  } catch (err) {
    console.error('Error applying template:', err);
    error.value = err.response?.data?.error?.message || 'Failed to apply template';
    alert(`Failed to apply template: ${error.value}`);
  }
};

const previewTemplate = (template) => {
  previewingTemplate.value = template;
};

const closePreview = () => {
  previewingTemplate.value = null;
};

const scheduleTemplate = (template) => {
  schedulingTemplate.value = template;
  scheduleForm.value = {
    startDate: '',
    endDate: '',
    isActive: true
  };
  scheduleWarning.value = '';
};

const closeSchedule = () => {
  schedulingTemplate.value = null;
  scheduleForm.value = {
    startDate: '',
    endDate: '',
    isActive: true
  };
  scheduleWarning.value = '';
};

const saveSchedule = async () => {
  try {
    savingSchedule.value = true;
    error.value = '';
    scheduleWarning.value = '';

    const scheduleData = {
      scope: schedulingTemplate.value.scope,
      agencyId: schedulingTemplate.value.scope === 'agency' ? schedulingTemplate.value.agency_id : null,
      startDate: scheduleForm.value.startDate,
      endDate: scheduleForm.value.endDate,
      isActive: scheduleForm.value.isActive
    };

    await api.post(`/branding-templates/${schedulingTemplate.value.id}/schedules`, scheduleData);
    await fetchTemplates();
    closeSchedule();
  } catch (err) {
    if (err.response?.data?.error?.overlapping) {
      scheduleWarning.value = 'Warning: This schedule overlaps with existing schedules.';
    } else {
      error.value = err.response?.data?.error?.message || 'Failed to save schedule';
    }
  } finally {
    savingSchedule.value = false;
  }
};

const closeModal = () => {
  showCreateModal.value = false;
  editingTemplate.value = null;
  error.value = '';
  templateForm.value = getDefaultTemplateForm();
};

// Handle scope change - ensure agency is set if switching to agency scope
const handleScopeChange = async () => {
  console.log('Scope changed to:', templateForm.value.scope);
  
  if (templateForm.value.scope === 'agency') {
    // Ensure agencies are loaded
    if (availableAgencies.value.length === 0) {
      console.log('No agencies loaded, fetching...');
      await fetchAgencies();
    }
    
    // If switching to agency scope and no agency is selected, set default
    if (!templateForm.value.agencyId) {
      if (authStore.user?.role === 'admin' && authStore.user?.agency_id) {
        templateForm.value.agencyId = authStore.user.agency_id;
        console.log('Auto-selected admin agency:', templateForm.value.agencyId);
      } else if (availableAgencies.value.length > 0) {
        templateForm.value.agencyId = availableAgencies.value[0].id;
        console.log('Auto-selected first agency:', templateForm.value.agencyId);
      } else {
        console.warn('No agencies available to select');
      }
    }
  } else {
    // If switching to platform scope, clear agency
    templateForm.value.agencyId = null;
    console.log('Cleared agency (switched to platform scope)');
  }
};

// Initialize form when modal opens
const openCreateModal = async () => {
  error.value = ''; // Clear any previous errors
  
  // Always ensure agencies are loaded (especially important for super_admins)
  if (availableAgencies.value.length === 0) {
    console.log('Loading agencies before opening modal...');
    await fetchAgencies();
    console.log('Agencies loaded:', availableAgencies.value.length);
  }
  
  templateForm.value = getDefaultTemplateForm();
  console.log('Opening modal with scope:', templateForm.value.scope, 'agencyId:', templateForm.value.agencyId);
  console.log('Available agencies:', availableAgencies.value.length);
  showCreateModal.value = true;
};

onMounted(async () => {
  await fetchAgencies();
  await fetchTemplates();
});
</script>

<style scoped>
.branding-template-manager {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.filter-section {
  margin-bottom: 24px;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-left: 8px;
}

.templates-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.template-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.template-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.template-schedules {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.schedule-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
}

.color-preview {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-radius: 4px;
  vertical-align: middle;
  margin-right: 4px;
}

.include-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nested-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 24px;
  margin-top: 8px;
}

.nested-fields label {
  font-weight: normal;
  font-size: 14px;
}

.large-modal {
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
}

.preview-content ul {
  list-style: none;
  padding: 0;
}

.preview-content li {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
</style>
