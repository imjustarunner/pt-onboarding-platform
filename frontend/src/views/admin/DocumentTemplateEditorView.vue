<template>
  <div class="container document-editor">
    <div class="page-header">
      <div>
        <h1>
          {{ isEdit ? `Edit HTML Template: ${form.name || 'Untitled'}` : 'Create HTML Template' }}
        </h1>
        <p class="subtitle">
          Build a rich HTML document with formatting, headers/footers, and template variables.
        </p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-secondary" @click="goBack">Back to Library</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="saveTemplate">
          {{ saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Template') }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading template...</div>
    <div v-else class="editor-layout">
      <form class="editor-form" @submit.prevent="saveTemplate">
        <div class="form-section">
          <h3>Template Details</h3>
          <div class="form-grid">
            <div class="form-group">
              <label>Document Type *</label>
              <select v-model="form.documentType" required>
                <option value="acknowledgment">Acknowledgment</option>
                <option value="authorization">Authorization</option>
                <option value="agreement">Agreement</option>
                <option value="audio_recording_consent">Audio Recording Consent</option>
                <option value="hipaa_security">HIPAA Security</option>
                <option value="compliance">Compliance</option>
                <option value="disclosure">Disclosure</option>
                <option value="consent">Consent</option>
                <option value="school">School</option>
                <option value="administrative">Administrative</option>
              </select>
            </div>
            <div class="form-group">
              <label>Document Action Type *</label>
              <div class="action-type-buttons">
                <button
                  type="button"
                  @click="form.documentActionType = 'signature'"
                  :class="['action-btn', { active: form.documentActionType === 'signature' }]"
                >
                  Require Electronic Signature
                </button>
                <button
                  type="button"
                  @click="form.documentActionType = 'review'"
                  :class="['action-btn', { active: form.documentActionType === 'review' }]"
                >
                  Review/Acknowledgment Only
                </button>
              </div>
            </div>
            <div class="form-group">
              <label>Template Name *</label>
              <input v-model="form.name" type="text" required />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea v-model="form.description" rows="3"></textarea>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3>Scope</h3>
          <div class="form-group">
            <div class="scope-toggle">
              <button
                type="button"
                class="scope-btn"
                :class="{ active: form.scope === 'org' }"
                @click="setScope('org')"
              >
                Agency
              </button>
              <button
                type="button"
                class="scope-btn"
                :class="{ active: form.scope === 'platform', disabled: !canUsePlatformScope }"
                :disabled="!canUsePlatformScope"
                @click="setScope('platform')"
              >
                Platform
              </button>
            </div>

            <div v-if="form.scope === 'org'" class="scope-org-select">
              <label class="sub-label">Agency *</label>
              <select v-model="form.agencyId" @change="handleAgencyChange" required>
                <option value="">Select an agency</option>
                <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                  {{ agency.name }}
                </option>
              </select>

              <label class="checkbox" style="margin-top: 12px;">
                <input v-model="form.assignToOrganization" type="checkbox" />
                Assign to specific organization
              </label>
              <div v-if="form.assignToOrganization">
                <label class="sub-label">Associated Organization</label>
                <select
                  v-model="form.organizationId"
                  @change="handleOrganizationChange"
                  :disabled="loadingAffiliatedOrgs || affiliatedOrganizations.length === 0"
                >
                  <option value="">Select</option>
                  <option v-for="org in affiliatedOrganizations" :key="org.id" :value="org.id">
                    {{ org.name }}{{ org.organization_type ? ` (${org.organization_type})` : '' }}
                  </option>
                </select>
                <small v-if="loadingAffiliatedOrgs">Loading affiliated organizations…</small>
                <small v-else-if="affiliatedOrganizations.length === 0">No affiliated organizations found.</small>
              </div>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3>Layout</h3>
          <div class="form-group">
            <label>Layout *</label>
            <select v-model="form.layoutType" @change="fetchLetterheads" required>
              <option value="standard">Standard</option>
              <option value="letter">Letter (Letterhead + Print)</option>
            </select>
            <small>
              Letter layout renders as a print-safe HTML document with fixed header/footer.
            </small>
          </div>

          <div v-if="form.layoutType === 'letter'" class="form-group">
            <label>Letterhead *</label>
            <div style="display: flex; gap: 10px; align-items: center;">
              <select v-model="form.letterheadTemplateId" required style="flex: 1;">
                <option :value="null">Select a letterhead</option>
                <option v-for="lh in letterheads" :key="lh.id" :value="lh.id">
                  {{ lh.name }} {{ lh.agency_id ? '' : '(Platform)' }}
                </option>
              </select>
              <router-link class="btn btn-secondary" :to="letterheadsPath">Manage</router-link>
            </div>
            <small v-if="loadingLetterheads">Loading letterheads…</small>
            <small v-else-if="letterheads.length === 0">No letterheads available for this scope.</small>
          </div>

          <div v-if="form.layoutType === 'letter'" class="form-group">
            <label>Header Slot (optional)</label>
            <HtmlDocumentBuilder v-model="form.letterHeaderHtml" />
          </div>

          <div v-if="form.layoutType === 'letter'" class="form-group">
            <label>Footer Slot (optional)</label>
            <HtmlDocumentBuilder v-model="form.letterFooterHtml" />
          </div>
        </div>

        <div class="form-section">
          <h3>HTML Content</h3>
          <div class="form-group">
            <label>Document Content *</label>
            <HtmlDocumentBuilder v-model="form.htmlContent" />
            <small>
              You can use template variables like {{AGENCY_NAME}}, {{USER_FULL_NAME}}, etc.
            </small>
            <TemplateVariablesList />
          </div>
        </div>

        <div class="form-section">
          <h3>Options</h3>
          <div class="form-grid">
            <div class="form-group">
              <label>Icon</label>
              <IconSelector v-model="form.iconId" label="Select Document Icon" />
            </div>
            <div v-if="isEdit" class="form-group">
              <label>
                <input v-model="form.saveAsNewVersion" type="checkbox" />
                Save as new version
              </label>
              <small>
                Check this to create a new version instead of updating the current one.
              </small>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <div class="actions-left">
            <button
              v-if="isEdit && canEditTemplate && canToggleStatus"
              type="button"
              @click="toggleStatus"
              :class="['btn', form.isActive ? 'btn-warning' : 'btn-success']"
            >
              {{ form.isActive ? 'Deactivate' : 'Activate' }}
            </button>
            <button
              v-if="isEdit && canDeleteTemplate"
              type="button"
              class="btn btn-danger"
              @click="archiveTemplate"
            >
              Archive
            </button>
          </div>
          <div class="actions-right">
            <button type="button" class="btn btn-secondary" @click="goBack">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Template') }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { useDocumentsStore } from '../../store/documents';
import HtmlDocumentBuilder from '../../components/documents/HtmlDocumentBuilder.vue';
import TemplateVariablesList from '../../components/documents/TemplateVariablesList.vue';
import IconSelector from '../../components/admin/IconSelector.vue';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const documentsStore = useDocumentsStore();

const loading = ref(false);
const saving = ref(false);
const templateRecord = ref(null);
const availableAgencies = ref([]);
const affiliatedOrganizations = ref([]);
const loadingAffiliatedOrgs = ref(false);
const letterheads = ref([]);
const loadingLetterheads = ref(false);
const selectedAgencyId = ref(null);

const isEdit = computed(() => Boolean(route.params.templateId));
const isOrgContext = computed(() => Boolean(route.params.organizationSlug));
const canUsePlatformScope = computed(() => authStore.user?.role === 'super_admin');
const letterheadsPath = computed(() =>
  isOrgContext.value
    ? `/${route.params.organizationSlug}/admin/letterheads`
    : '/admin/letterheads'
);

const form = ref({
  name: '',
  description: '',
  htmlContent: '',
  documentType: 'administrative',
  documentActionType: 'signature',
  layoutType: 'standard',
  letterheadTemplateId: null,
  letterHeaderHtml: '',
  letterFooterHtml: '',
  iconId: null,
  scope: authStore.user?.role === 'super_admin' ? 'platform' : 'org',
  agencyId: null,
  assignToOrganization: false,
  organizationId: null,
  isActive: true,
  saveAsNewVersion: false
});

const canEditTemplate = computed(() => {
  const template = templateRecord.value;
  if (!template) return false;
  if (authStore.user?.role === 'super_admin') return true;
  if (authStore.user?.role === 'support') {
    return template.created_by_user_id === authStore.user?.id;
  }
  if (authStore.user?.role === 'admin') {
    if (template.agency_id === null) return true;
    const userAgencies = agencyStore.userAgencies || [];
    return userAgencies.some((a) => a.id === template.agency_id);
  }
  return false;
});

const canDeleteTemplate = computed(() => {
  const template = templateRecord.value;
  if (!template) return false;
  if (authStore.user?.role === 'super_admin') return true;
  if (authStore.user?.role === 'support') {
    return template.created_by_user_id === authStore.user?.id;
  }
  if (authStore.user?.role === 'admin') {
    if (template.agency_id === null) return true;
    const userAgencies = agencyStore.userAgencies || [];
    return userAgencies.some((a) => a.id === template.agency_id);
  }
  return false;
});

const canToggleStatus = computed(() => Boolean(templateRecord.value));

const setScope = (scope) => {
  if (scope === 'platform' && !canUsePlatformScope.value) return;
  form.value.scope = scope;
  if (scope === 'platform') {
    form.value.agencyId = null;
    form.value.assignToOrganization = false;
    form.value.organizationId = null;
    affiliatedOrganizations.value = [];
  } else if (!form.value.agencyId) {
    const fallbackAgencyId = selectedAgencyId.value || availableAgencies.value?.[0]?.id || null;
    form.value.agencyId = fallbackAgencyId;
  }
  fetchLetterheads();
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    const list = response.data || [];
    availableAgencies.value = list.filter(
      (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
    );
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
  }
};

const fetchAffiliatedOrganizations = async () => {
  const agencyId = form.value.agencyId;
  if (!agencyId) {
    affiliatedOrganizations.value = [];
    form.value.organizationId = null;
    return;
  }
  try {
    loadingAffiliatedOrgs.value = true;
    const res = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
    affiliatedOrganizations.value = Array.isArray(res.data) ? res.data : [];
    if (
      form.value.organizationId &&
      !affiliatedOrganizations.value.some((o) => String(o.id) === String(form.value.organizationId))
    ) {
      form.value.organizationId = null;
    }
  } catch (err) {
    console.error('Failed to load affiliated organizations:', err);
    affiliatedOrganizations.value = [];
    form.value.organizationId = null;
  } finally {
    loadingAffiliatedOrgs.value = false;
  }
};

const handleAgencyChange = async () => {
  form.value.organizationId = null;
  await fetchAffiliatedOrganizations();
  await fetchLetterheads();
};

const handleOrganizationChange = async () => {
  await fetchLetterheads();
};

async function fetchLetterheads() {
  try {
    const currentSelection = form.value.letterheadTemplateId;
    letterheads.value = [];

    if (String(form.value.layoutType || 'standard') !== 'letter') return;

    const agencyId = form.value.scope === 'platform' ? null : (form.value.agencyId || null);
    const organizationId =
      form.value.scope === 'platform' || !form.value.assignToOrganization
        ? null
        : (form.value.organizationId && String(form.value.organizationId) !== String(form.value.agencyId)
            ? form.value.organizationId
            : null);

    loadingLetterheads.value = true;
    const res = await api.get('/letterhead-templates', {
      params: { agencyId, organizationId, includePlatform: true }
    });
    letterheads.value = Array.isArray(res.data) ? res.data : [];
    const stillValid =
      currentSelection && letterheads.value.some((lh) => String(lh.id) === String(currentSelection));
    if (stillValid) {
      form.value.letterheadTemplateId = currentSelection;
    } else if (letterheads.value?.[0]?.id) {
      form.value.letterheadTemplateId = letterheads.value[0].id;
    } else {
      form.value.letterheadTemplateId = null;
    }
  } catch (e) {
    console.error('Failed to load letterheads:', e);
    letterheads.value = [];
    form.value.letterheadTemplateId = null;
  } finally {
    loadingLetterheads.value = false;
  }
}

const loadTemplate = async () => {
  if (!isEdit.value) return;
  try {
    loading.value = true;
    const response = await api.get(`/document-templates/${route.params.templateId}`);
    const template = response.data;
    if (!template || String(template.template_type) !== 'html') {
      alert('This editor only supports HTML templates.');
      goBack();
      return;
    }
    templateRecord.value = template;
    form.value = {
      name: template.name || '',
      description: template.description !== undefined && template.description !== null ? template.description : '',
      htmlContent: template.html_content !== undefined && template.html_content !== null ? template.html_content : '',
      documentType: template.document_type || 'administrative',
      documentActionType: template.document_action_type || 'signature',
      layoutType: template.layout_type || 'standard',
      letterheadTemplateId: template.letterhead_template_id ?? null,
      letterHeaderHtml: template.letter_header_html || '',
      letterFooterHtml: template.letter_footer_html || '',
      iconId: template.icon_id !== undefined && template.icon_id !== null ? template.icon_id : null,
      scope: template.agency_id === null ? 'platform' : 'org',
      agencyId: template.agency_id ?? null,
      assignToOrganization: Boolean(template.organization_id),
      organizationId: template.organization_id ?? null,
      isActive: template.is_active !== false && template.is_active !== 0,
      saveAsNewVersion: false
    };

    if (form.value.scope === 'org' && form.value.agencyId) {
      await fetchAffiliatedOrganizations();
    }
    await fetchLetterheads();
  } catch (err) {
    console.error('Failed to load template:', err);
    alert('Failed to load template');
    goBack();
  } finally {
    loading.value = false;
  }
};

const saveTemplate = async () => {
  try {
    saving.value = true;
    if (String(form.value.layoutType || 'standard') === 'letter' && !form.value.letterheadTemplateId) {
      alert('Please select a letterhead for letter layout templates.');
      return;
    }

    if (!isEdit.value) {
      await documentsStore.createTemplate({
        name: form.value.name,
        description: form.value.description,
        htmlContent: form.value.htmlContent,
        iconId: form.value.iconId || null,
        documentType: form.value.documentType,
        documentActionType: form.value.documentActionType,
        layoutType: form.value.layoutType,
        letterheadTemplateId: form.value.layoutType === 'letter' ? form.value.letterheadTemplateId : null,
        letterHeaderHtml: form.value.layoutType === 'letter' ? (form.value.letterHeaderHtml || null) : null,
        letterFooterHtml: form.value.layoutType === 'letter' ? (form.value.letterFooterHtml || null) : null,
        agencyId: form.value.scope === 'platform' ? null : (form.value.agencyId || null),
        organizationId:
          form.value.scope === 'platform' || !form.value.assignToOrganization
            ? null
            : (form.value.organizationId && String(form.value.organizationId) !== String(form.value.agencyId)
                ? form.value.organizationId
                : null)
      });
      goBack();
      return;
    }

    const updateData = {};
    updateData.name = form.value.name !== undefined && form.value.name !== null ? form.value.name : null;
    updateData.description = form.value.description !== undefined ? (form.value.description || null) : null;
    updateData.isActive = form.value.isActive !== undefined ? (form.value.isActive === true || form.value.isActive === 1) : true;
    updateData.htmlContent = form.value.htmlContent !== undefined ? (form.value.htmlContent || null) : null;
    updateData.layoutType = form.value.layoutType || 'standard';
    updateData.letterheadTemplateId =
      form.value.layoutType === 'letter' ? (form.value.letterheadTemplateId || null) : null;
    updateData.letterHeaderHtml =
      form.value.layoutType === 'letter' ? (form.value.letterHeaderHtml || null) : null;
    updateData.letterFooterHtml =
      form.value.layoutType === 'letter' ? (form.value.letterFooterHtml || null) : null;
    updateData.iconId =
      form.value.iconId !== undefined ? (form.value.iconId !== null && form.value.iconId !== '' ? form.value.iconId : null) : null;
    updateData.agencyId =
      form.value.scope === 'platform' ? null : (form.value.agencyId !== null && form.value.agencyId !== '' ? form.value.agencyId : null);
    updateData.organizationId =
      form.value.scope === 'platform' || !form.value.assignToOrganization
        ? null
        : (form.value.organizationId && String(form.value.organizationId) !== String(form.value.agencyId)
            ? form.value.organizationId
            : null);
    updateData.documentType = form.value.documentType;
    updateData.documentActionType = form.value.documentActionType;
    if (form.value.saveAsNewVersion) {
      updateData.createNewVersion = true;
    }

    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        updateData[key] = null;
      }
    });

    await api.put(`/document-templates/${route.params.templateId}`, updateData);
    goBack();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to save template');
  } finally {
    saving.value = false;
  }
};

const toggleStatus = async () => {
  if (!templateRecord.value) return;
  try {
    const newStatus = !form.value.isActive;
    const updateData = {
      name: form.value.name || null,
      description: form.value.description || null,
      isActive: newStatus,
      htmlContent: form.value.htmlContent || null
    };
    if (form.value.iconId !== undefined && form.value.iconId !== null) {
      updateData.iconId = form.value.iconId;
    }
    await api.put(`/document-templates/${templateRecord.value.id}`, updateData);
    form.value.isActive = newStatus;
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update template status');
  }
};

const archiveTemplate = async () => {
  if (!templateRecord.value) return;
  if (confirm(`Are you sure you want to archive "${templateRecord.value.name}"?`)) {
    try {
      await api.post(`/document-templates/${templateRecord.value.id}/archive`);
      alert('Document archived successfully');
      goBack();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to archive template');
    }
  }
};

const goBack = () => {
  const target = isOrgContext.value
    ? `/${route.params.organizationSlug}/admin/documents`
    : '/admin/documents';
  router.push(target);
};

watch(
  () => form.value.assignToOrganization,
  async (next) => {
    if (next) {
      await fetchAffiliatedOrganizations();
    } else {
      form.value.organizationId = null;
      affiliatedOrganizations.value = [];
      await fetchLetterheads();
    }
  }
);

onMounted(async () => {
  if (authStore.user?.role === 'admin') {
    await agencyStore.fetchUserAgencies();
    if (agencyStore.userAgencies?.length > 0) {
      selectedAgencyId.value = agencyStore.userAgencies[0].id;
    }
  }
  await brandingStore.fetchPlatformBranding();
  await fetchAgencies();

  if (!canUsePlatformScope.value) {
    setScope('org');
  } else if (form.value.scope === 'platform') {
    form.value.agencyId = null;
  }

  await loadTemplate();
  if (!isEdit.value && form.value.scope === 'org' && form.value.agencyId) {
    await fetchAffiliatedOrganizations();
  }
});
</script>

<style scoped>
.document-editor {
  padding-bottom: 60px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
}

.subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.editor-layout {
  background: white;
  border: 1px solid var(--border, #ddd);
  border-radius: 12px;
  padding: 20px;
}

.form-section {
  border-bottom: 1px solid var(--border, #eee);
  padding-bottom: 20px;
  margin-bottom: 20px;
}

.form-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-weight: 600;
  font-size: 14px;
}

.form-group input,
.form-group textarea,
.form-group select {
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}

.form-group small {
  color: var(--text-secondary);
  font-size: 12px;
}

.action-type-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-btn {
  border: 1px solid var(--border, #ddd);
  background: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.action-btn.active {
  border-color: var(--primary-color, #007bff);
  background: rgba(0, 123, 255, 0.1);
}

.scope-toggle {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.scope-btn {
  border: 1px solid var(--border, #ddd);
  padding: 6px 12px;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.scope-btn.active {
  border-color: var(--primary-color, #007bff);
  background: rgba(0, 123, 255, 0.1);
}

.scope-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border, #eee);
  gap: 16px;
  flex-wrap: wrap;
}

.actions-left,
.actions-right {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
