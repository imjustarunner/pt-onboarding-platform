<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" :class="{ wide: hasPdfPlacementUi }" @click.stop>
      <h2>{{ existingTemplate ? 'Upload New Version' : 'Upload PDF Document' }}</h2>
      <form @submit.prevent="handleUpload">
        <div v-if="existingTemplate" class="info-box" style="padding: 12px; background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 4px; margin-bottom: 16px;">
          <p><strong>Uploading new version for:</strong> {{ existingTemplate.name }}</p>
          <p style="font-size: 13px; color: #666; margin-top: 4px;">Current version: {{ existingTemplate.version }}</p>
        </div>
        <div class="form-group">
          <label>Template Name *</label>
          <input v-model="formData.name" type="text" required :disabled="!!existingTemplate" />
          <small v-if="existingTemplate">Name cannot be changed when uploading a new version</small>
        </div>
        
        <div class="form-group">
          <label>Description</label>
          <textarea v-model="formData.description" rows="3"></textarea>
        </div>

        <div class="form-group">
          <label>Document Type *</label>
          <select v-model="formData.documentType" required>
            <option value="">Select document type</option>
            <option value="acknowledgment">Acknowledgment</option>
            <option value="authorization">Authorization</option>
            <option value="agreement">Agreement</option>
            <option value="audio_recording_consent">Audio Recording Consent</option>
            <option value="hipaa_security">HIPAA Security</option>
            <option value="compliance">Compliance</option>
            <option value="disclosure">Disclosure</option>
            <option value="consent">Consent</option>
            <option value="administrative">Administrative</option>
          </select>
        </div>

        <div class="form-group">
          <label>Document Action Type *</label>
          <div class="action-type-buttons">
            <button
              type="button"
              @click="formData.documentActionType = 'signature'"
              :class="['action-btn', { active: formData.documentActionType === 'signature' }]"
            >
              Require Electronic Signature
            </button>
            <button
              type="button"
              @click="formData.documentActionType = 'review'"
              :class="['action-btn', { active: formData.documentActionType === 'review' }]"
            >
              Review/Acknowledgment Only
            </button>
          </div>
          <small>This cannot be changed when assigning the document. Select how users will interact with this document.</small>
        </div>

        <div class="form-group">
          <label>Icon</label>
          <IconSelector v-model="formData.iconId" label="Select Document Icon" />
        </div>

        <div class="form-group">
          <label>PDF File *</label>
          <input
            type="file"
            accept=".pdf"
            @change="handleFileSelect"
            required
            ref="fileInput"
          />
          <small v-if="selectedFile">Selected: {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</small>
        </div>

        <!-- Signature Coordinate Picker -->
        <div v-if="formData.documentActionType === 'signature' && selectedFile && pdfUrl" class="form-group signature-coordinate-section">
          <PDFSignatureCoordinatePicker
            :key="pdfUrl"
            :pdf-url="pdfUrl"
            v-model="signatureCoordinates"
          />
        </div>

        <div v-if="selectedFile && pdfUrl" class="form-group signature-coordinate-section">
          <h4 style="margin-top: 24px;">Custom Field Placement (Optional)</h4>
          <PDFFieldDefinitionBuilder
            :pdf-url="pdfUrl"
            v-model="fieldDefinitions"
          />
        </div>

        <div class="form-group">
          <label>Scope *</label>
          <div class="scope-toggle">
            <button
              type="button"
              class="scope-btn"
              :class="{ active: formData.scope === 'org' }"
              @click="setScope('org')"
            >
              Organization
            </button>
            <button
              type="button"
              class="scope-btn"
              :class="{ active: formData.scope === 'platform', disabled: !canUsePlatformScope }"
              :disabled="!canUsePlatformScope"
              @click="setScope('platform')"
            >
              Platform
            </button>
          </div>

          <div v-if="formData.scope === 'org'" class="scope-org-select">
            <label class="sub-label">Agency *</label>
            <select v-model="formData.agencyId" @change="handleAgencyScopeChange" required>
              <option value="">Select an agency</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
            <small v-if="availableAgencies.length === 0" style="color: #dc3545;">
              Loading organizations...
            </small>

            <label class="checkbox" style="margin-top: 12px;">
              <input v-model="formData.assignToOrganization" type="checkbox" />
              Assign to specific organization
            </label>
            <div v-if="formData.assignToOrganization">
              <label class="sub-label">Associated Organization</label>
              <select v-model="formData.organizationId" :disabled="loadingAffiliatedOrganizations || affiliatedOrganizations.length === 0">
                <option value="">Select</option>
                <option v-for="org in affiliatedOrganizations" :key="org.id" :value="org.id">
                  {{ org.name }}{{ org.organization_type ? ` (${org.organization_type})` : '' }}
                </option>
              </select>
              <small v-if="loadingAffiliatedOrganizations">Loading affiliated organizations…</small>
              <small v-else-if="affiliatedOrganizations.length === 0">No affiliated organizations found for this agency.</small>
            </div>
          </div>

          <small v-if="!canUsePlatformScope">
            Platform templates can only be created by platform admins.
          </small>
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="uploading || !selectedFile">
            {{ uploading ? 'Uploading...' : 'Upload Document' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useDocumentsStore } from '../../store/documents';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import IconSelector from '../admin/IconSelector.vue';
import PDFSignatureCoordinatePicker from './PDFSignatureCoordinatePicker.vue';
import PDFFieldDefinitionBuilder from './PDFFieldDefinitionBuilder.vue';
import TemplateVariablesList from './TemplateVariablesList.vue';
import api from '../../services/api';

const props = defineProps({
  existingTemplate: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close', 'uploaded']);

const documentsStore = useDocumentsStore();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const formData = ref({
  name: props.existingTemplate?.name || '',
  description: props.existingTemplate?.description || '',
  documentType: props.existingTemplate?.document_type || 'administrative',
  documentActionType: props.existingTemplate?.document_action_type || 'signature',
  scope: props.existingTemplate?.agency_id === null ? 'platform' : 'org',
  agencyId: props.existingTemplate?.agency_id ?? '',
  assignToOrganization: !!props.existingTemplate?.organization_id,
  organizationId: props.existingTemplate?.organization_id ?? '',
  iconId: props.existingTemplate?.icon_id || null
});

const selectedFile = ref(null);
const fileInput = ref(null);
const uploading = ref(false);
const error = ref('');
const availableAgencies = ref([]);
const affiliatedOrganizations = ref([]);
const loadingAffiliatedOrganizations = ref(false);
const pdfUrl = ref(null);
const signatureCoordinates = ref({
  x: null,
  y: null,
  width: 200,
  height: 60,
  page: null
});
const fieldDefinitions = ref([]);
const hasPdfPlacementUi = computed(() => Boolean(selectedFile.value && pdfUrl.value));
const parseFieldDefinitions = (raw) => {
  if (!raw) return [];
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
};
fieldDefinitions.value = parseFieldDefinitions(props.existingTemplate?.field_definitions);

const userRole = computed(() => authStore.user?.role);
const canUsePlatformScope = computed(() => userRole.value === 'super_admin');

const setScope = (scope) => {
  if (scope === 'platform' && !canUsePlatformScope.value) return;
  formData.value.scope = scope;
  if (scope === 'platform') {
    formData.value.agencyId = '';
    formData.value.assignToOrganization = false;
    formData.value.organizationId = '';
    affiliatedOrganizations.value = [];
  } else if (!formData.value.agencyId) {
    // Best-effort default to current org or first available
    const current = agencyStore.currentAgency?.id;
    if (current) formData.value.agencyId = current;
    else if (availableAgencies.value?.[0]?.id) formData.value.agencyId = availableAgencies.value[0].id;
  }
};

const fetchAffiliatedOrganizations = async () => {
  const agencyId = formData.value.agencyId;
  if (!agencyId) {
    affiliatedOrganizations.value = [];
    formData.value.organizationId = '';
    return;
  }
  try {
    loadingAffiliatedOrganizations.value = true;
    const res = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
    affiliatedOrganizations.value = Array.isArray(res.data) ? res.data : [];
    // If the selected org is no longer present, clear it.
    if (
      formData.value.organizationId &&
      !affiliatedOrganizations.value.some((o) => String(o.id) === String(formData.value.organizationId))
    ) {
      formData.value.organizationId = '';
    }
  } catch (err) {
    console.error('Failed to fetch affiliated organizations:', err);
    affiliatedOrganizations.value = [];
    formData.value.organizationId = '';
  } finally {
    loadingAffiliatedOrganizations.value = false;
  }
};

const handleAgencyScopeChange = async () => {
  // Reset dependent org selection when agency changes
  formData.value.organizationId = '';
  await fetchAffiliatedOrganizations();
};

watch(
  () => formData.value.assignToOrganization,
  (next) => {
    if (!next) {
      formData.value.organizationId = '';
    }
  }
);

const fetchAgencies = async () => {
  try {
    if (userRole.value === 'super_admin') {
      const response = await api.get('/agencies');
      const list = response.data || [];
      availableAgencies.value = list.filter(
        (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
      );
    } else {
      // Agency Admin - use their agencies
      await agencyStore.fetchUserAgencies();
      const list = agencyStore.userAgencies || [];
      availableAgencies.value = list.filter(
        (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
      );
    }

    // Enforce: non-super-admins cannot create platform templates
    if (!canUsePlatformScope.value) {
      setScope('org');
    }

    // Clear org selection if agency list changed
    if (
      formData.value.agencyId &&
      !availableAgencies.value.some((a) => String(a.id) === String(formData.value.agencyId))
    ) {
      formData.value.agencyId = '';
      formData.value.organizationId = '';
      affiliatedOrganizations.value = [];
    }

    // Ensure we have an organization selected when org scope is active
    if (formData.value.scope === 'org' && !formData.value.agencyId) {
      setScope('org');
    }

    // Load affiliated orgs for the current agency selection (best-effort)
    if (formData.value.scope === 'org' && formData.value.agencyId) {
      await fetchAffiliatedOrganizations();
    }
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
    availableAgencies.value = [];
  }
};

const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (file) {
    if (file.type !== 'application/pdf') {
      error.value = 'Please select a PDF file';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      error.value = 'File size must be less than 10MB';
      return;
    }
    selectedFile.value = file;
    error.value = '';
    
    // Create object URL for PDF preview
    if (pdfUrl.value) {
      URL.revokeObjectURL(pdfUrl.value);
    }
    pdfUrl.value = URL.createObjectURL(file);
    
    // Auto-fill name from filename if not set
    if (!formData.value.name) {
      formData.value.name = file.name.replace('.pdf', '');
    }
  }
};

const handleUpload = async () => {
  if (!selectedFile.value) {
    error.value = 'Please select a PDF file';
    return;
  }

  if (formData.value.scope === 'org' && !formData.value.agencyId) {
    error.value = 'Please select an organization scope.';
    return;
  }

  if (
    formData.value.documentActionType === 'signature' &&
    (signatureCoordinates.value.x === null || signatureCoordinates.value.y === null)
  ) {
    error.value = 'Please click the PDF to set the signature position before uploading.';
    return;
  }

  try {
    uploading.value = true;
    error.value = '';

    const formDataToSend = new FormData();
    formDataToSend.append('file', selectedFile.value);
    formDataToSend.append('name', formData.value.name);
    formDataToSend.append('description', formData.value.description || '');
    formDataToSend.append('documentType', formData.value.documentType);
    formDataToSend.append('documentActionType', formData.value.documentActionType);
    if (formData.value.iconId) {
      formDataToSend.append('iconId', formData.value.iconId.toString());
    }

    if (fieldDefinitions.value && fieldDefinitions.value.length > 0) {
      formDataToSend.append('fieldDefinitions', JSON.stringify(fieldDefinitions.value));
    }
    
    // Templates are never user-specific (user-specific documents use separate endpoint)
    // IMPORTANT: Never send the literal string "null" (backend treats missing/empty as null).
    if (formData.value.scope === 'org') {
      formDataToSend.append('agencyId', String(formData.value.agencyId));
    if (
      formData.value.assignToOrganization &&
      formData.value.organizationId &&
      String(formData.value.organizationId) !== String(formData.value.agencyId)
    ) {
      formDataToSend.append('organizationId', String(formData.value.organizationId));
    }
    }

    // Add signature coordinates if signature is selected and coordinates are set
    if (formData.value.documentActionType === 'signature' && signatureCoordinates.value.x !== null && signatureCoordinates.value.y !== null) {
      console.log('Uploading signature coordinates:', signatureCoordinates.value);
      formDataToSend.append('signatureX', signatureCoordinates.value.x.toString());
      formDataToSend.append('signatureY', signatureCoordinates.value.y.toString());
      formDataToSend.append('signatureWidth', signatureCoordinates.value.width.toString());
      formDataToSend.append('signatureHeight', signatureCoordinates.value.height.toString());
      if (signatureCoordinates.value.page !== null) {
        formDataToSend.append('signaturePage', signatureCoordinates.value.page.toString());
      }
    }

    await documentsStore.uploadTemplate(formDataToSend);
    emit('uploaded');
    emit('close');
    
    // Reset form
    formData.value = {
      name: '',
      description: '',
      documentType: 'administrative',
      documentActionType: 'signature',
      scope: canUsePlatformScope.value ? 'platform' : 'org',
      agencyId: '',
      assignToOrganization: false,
      organizationId: '',
      iconId: null
    };
    affiliatedOrganizations.value = [];
    selectedFile.value = null;
    if (pdfUrl.value) {
      URL.revokeObjectURL(pdfUrl.value);
      pdfUrl.value = null;
    }
    signatureCoordinates.value = { x: null, y: null, width: 200, height: 60, page: null };
    fieldDefinitions.value = [];
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to upload document';
  } finally {
    uploading.value = false;
  }
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

onMounted(async () => {
  await fetchAgencies();
});

// Cleanup object URL on unmount
onUnmounted(() => {
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value);
  }
});

</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content.wide {
  max-width: 1200px;
  width: 96%;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input[type="text"],
.form-group input[type="file"],
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.error-message {
  color: #dc3545;
  margin-bottom: 16px;
  padding: 12px;
  background: #f8d7da;
  border-radius: 8px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.action-type-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.action-btn {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--border, #ddd);
  border-radius: 8px;
  background: white;
  color: var(--text-primary, #333);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--primary-color, #007bff);
  background: #f8f9fa;
}

.action-btn.active {
  border-color: var(--primary-color, #007bff);
  background: var(--primary-color, #007bff);
  color: white;
}

.signature-coordinate-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border, #ddd);
}

.scope-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.scope-btn {
  padding: 12px 14px;
  border: 2px solid var(--border, #ddd);
  border-radius: 10px;
  background: white;
  color: var(--text-primary, #333);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.scope-btn:hover:not(:disabled) {
  border-color: var(--primary-color, #007bff);
  background: #f8f9fa;
}

.scope-btn.active {
  border-color: var(--primary-color, #007bff);
  background: var(--primary-color, #007bff);
  color: white;
}

.scope-btn:disabled,
.scope-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.scope-org-select .sub-label {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
</style>

