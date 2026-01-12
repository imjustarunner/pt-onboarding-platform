<template>
  <div class="onboarding-packages">
    <div class="section-header">
      <h2>Onboarding Packages</h2>
      <button v-if="!readOnly" @click="showCreateModal = true" class="btn btn-primary">Create New Package</button>
    </div>

    <p class="section-description">
      Create reusable onboarding packages that group training focuses, modules, and documents. 
      Assign entire packages to users with one click.
    </p>

    <div v-if="loading" class="loading">Loading packages...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="packages-grid">
      <div v-for="pkg in filteredPackages" :key="pkg.id" class="package-card">
        <div class="package-header">
          <h3>{{ pkg.name }}</h3>
          <span :class="['badge', pkg.is_active ? 'badge-success' : 'badge-secondary']">
            {{ pkg.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <p v-if="pkg.description" class="package-description">{{ pkg.description }}</p>
        <div class="package-meta">
          <span v-if="pkg.agency_id" class="meta-item">Agency: {{ getAgencyName(pkg.agency_id) }}</span>
          <span v-else class="meta-item badge badge-warning">Platform-Wide</span>
        </div>
        <div class="package-stats">
          <div class="stat-item">
            <strong>{{ pkg.training_focus_count || 0 }}</strong>
            <span>Training Focuses</span>
          </div>
          <div class="stat-item">
            <strong>{{ pkg.module_count || 0 }}</strong>
            <span>Modules</span>
          </div>
          <div class="stat-item">
            <strong>{{ pkg.document_count || 0 }}</strong>
            <span>Documents</span>
          </div>
          <div class="stat-item" v-if="pkg.package_type">
            <strong>{{ getPackageTypeLabel(pkg.package_type) }}</strong>
            <span>Type</span>
          </div>
        </div>
        <div class="package-actions">
          <button @click="viewPackage(pkg.id)" class="btn btn-primary btn-sm">View Details</button>
          <button @click="editPackage(pkg)" class="btn btn-secondary btn-sm">Edit</button>
          <button @click="assignPackage(pkg)" class="btn btn-success btn-sm">Assign to Users</button>
          <button 
            @click="togglePackageStatus(pkg)" 
            :class="['btn', 'btn-sm', pkg.is_active ? 'btn-warning' : 'btn-success']"
          >
            {{ pkg.is_active ? 'Deactivate' : 'Activate' }}
          </button>
          <button @click="deletePackage(pkg.id)" class="btn btn-danger btn-sm">Delete</button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Package Modal -->
    <div v-if="showCreateModal || editingPackage" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content large">
        <div class="modal-header">
          <h2>{{ editingPackage ? 'Edit Package' : 'Create New Package' }}</h2>
          <button @click="closeModal" class="btn-close">×</button>
        </div>
        <form @submit.prevent="savePackage">
          <div class="form-group">
            <label>Package Name *</label>
            <input v-model="packageForm.name" type="text" required placeholder="e.g., Onboarding ITSCO" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="packageForm.description" rows="3" placeholder="Describe what this package includes..."></textarea>
          </div>
          <div class="form-group">
            <label>Package Type *</label>
            <select v-model="packageForm.packageType" class="form-control" required>
              <option value="pre_hire">Pre-Hire</option>
              <option value="onboarding">Onboarding</option>
              <option value="training">Training</option>
              <option value="other">Other</option>
            </select>
            <small>
              <strong>Pre-Hire:</strong> Assigns to PENDING_SETUP users, sets status to PREHIRE_OPEN<br>
              <strong>Onboarding:</strong> Assigns to PREHIRE_REVIEW users, sets status to ONBOARDING<br>
              <strong>Training:</strong> Assigns to ACTIVE_EMPLOYEE users, does not change status<br>
              <strong>Other:</strong> General purpose, does not change status
            </small>
          </div>
          <div class="form-group">
            <label>Agency</label>
            <select v-model="packageForm.agencyId" :disabled="authStore.user?.role !== 'super_admin'">
              <option :value="null">Platform-Wide (Available to all agencies)</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
            <small>Leave as "Platform-Wide" to make this package available to all agencies</small>
          </div>
          <div class="form-group">
            <label>
              <input v-model="packageForm.isActive" type="checkbox" />
              Active
            </label>
          </div>
          <div v-if="modalError" class="error-message">{{ modalError }}</div>
          <div class="modal-actions">
            <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save Package' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Package Detail/Edit Modal -->
    <div v-if="selectedPackage" class="modal-overlay" @click.self="closeDetailModal">
      <div class="modal-content xlarge" @click.stop>
        <div class="modal-header">
          <h2>{{ selectedPackage.name }}</h2>
          <button @click="closeDetailModal" class="btn-close">×</button>
        </div>

        <div class="package-detail-tabs">
          <button
            v-for="tab in detailTabs"
            :key="tab.id"
            @click="activeDetailTab = tab.id"
            :class="['tab-button', { active: activeDetailTab === tab.id }]"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="package-detail-content">
          <!-- Training Focuses Tab -->
          <div v-if="activeDetailTab === 'training-focuses'" class="detail-section">
            <div class="section-header-inline">
              <h3>Training Focuses</h3>
              <button v-if="!readOnly" @click="handleAddTrainingFocusClick" class="btn btn-primary btn-sm">Add Training Focus</button>
            </div>
            <div v-if="packageDetails.trainingFocuses?.length === 0" class="empty-state">
              No training focuses added yet.
            </div>
            <div v-else class="items-list">
              <div v-for="(tf, index) in packageDetails.trainingFocuses" :key="tf.track_id" class="item-row">
                <span class="item-number">{{ index + 1 }}</span>
                <div class="item-info">
                  <strong>{{ tf.track_name }}</strong>
                  <span v-if="tf.track_description" class="item-description">{{ tf.track_description }}</span>
                </div>
                <button v-if="!readOnly" @click="removeTrainingFocus(tf.track_id)" class="btn btn-danger btn-xs">Remove</button>
              </div>
            </div>
          </div>

          <!-- Modules Tab -->
          <div v-if="activeDetailTab === 'modules'" class="detail-section">
            <div class="section-header-inline">
              <h3>Modules</h3>
              <button v-if="!readOnly" @click="handleAddModuleClick" class="btn btn-primary btn-sm">Add Module</button>
            </div>
            <div v-if="packageDetails.modules?.length === 0" class="empty-state">
              No modules added yet.
            </div>
            <div v-else class="items-list">
              <div v-for="(mod, index) in packageDetails.modules" :key="mod.module_id" class="item-row">
                <span class="item-number">{{ index + 1 }}</span>
                <div class="item-info">
                  <strong>{{ mod.module_title }}</strong>
                  <span v-if="mod.module_description" class="item-description">{{ mod.module_description }}</span>
                </div>
                <button v-if="!readOnly" @click="removeModule(mod.module_id)" class="btn btn-danger btn-xs">Remove</button>
              </div>
            </div>
          </div>

          <!-- Documents Tab -->
          <div v-if="activeDetailTab === 'documents'" class="detail-section">
            <div class="section-header-inline">
              <h3>Documents</h3>
              <button v-if="!readOnly" @click="showAddDocument = true" class="btn btn-primary btn-sm">Add Document</button>
            </div>
            <div v-if="packageDetails.documents?.length === 0" class="empty-state">
              No documents added yet.
            </div>
            <div v-else class="items-list">
              <div v-for="(doc, index) in packageDetails.documents" :key="doc.document_template_id" class="item-row">
                <span class="item-number">{{ index + 1 }}</span>
                <div class="item-info">
                  <strong>{{ doc.document_name }}</strong>
                  <span class="item-meta">
                    Action: {{ doc.action_type === 'signature' ? 'E-Sign' : 'Review' }}
                    <span v-if="doc.due_date_days"> | Due: {{ doc.due_date_days }} days</span>
                  </span>
                </div>
                <button v-if="!readOnly" @click="removeDocument(doc.document_template_id)" class="btn btn-danger btn-xs">Remove</button>
              </div>
            </div>
          </div>

          <!-- Checklist Items Tab -->
          <div v-if="activeDetailTab === 'checklist-items'" class="detail-section">
            <div class="section-header-inline">
              <h3>Checklist Items</h3>
              <button v-if="!readOnly" @click="handleAddChecklistItemClick" class="btn btn-primary btn-sm">Add Checklist Item</button>
            </div>
            <div v-if="packageDetails.checklistItems?.length === 0" class="empty-state">
              No checklist items added yet.
            </div>
            <div v-else class="items-list">
              <div v-for="(item, index) in packageDetails.checklistItems" :key="item.checklist_item_id" class="item-row">
                <span class="item-number">{{ index + 1 }}</span>
                <div class="item-info">
                  <strong>{{ item.item_label }}</strong>
                  <span v-if="item.description" class="item-description">{{ item.description }}</span>
                </div>
                <button v-if="!readOnly" @click="removeChecklistItem(item.checklist_item_id)" class="btn btn-danger btn-xs">Remove</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Training Focus Modal -->
    <div v-if="showAddTrainingFocus" class="modal-overlay nested-modal" @click.self="showAddTrainingFocus = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Add Training Focus</h3>
          <button @click.stop="showAddTrainingFocus = false" class="btn-close">×</button>
        </div>
        <div class="form-group">
          <label>Select Training Focus</label>
          <select v-model="addItemForm.trackId" class="form-control" @click.stop>
            <option value="">-- Select --</option>
            <option v-for="track in availableTracks" :key="track.id" :value="track.id">
              {{ track.name }}
            </option>
          </select>
        </div>
        <div class="modal-actions">
          <button @click.stop="showAddTrainingFocus = false" class="btn btn-secondary">Cancel</button>
          <button @click.stop="addTrainingFocusToPackage" class="btn btn-primary" :disabled="!addItemForm.trackId">
            Add
          </button>
        </div>
      </div>
    </div>

    <!-- Add Module Modal -->
    <div v-if="showAddModule" class="modal-overlay nested-modal" @click.self="showAddModule = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Add Module</h3>
          <button @click.stop="showAddModule = false" class="btn-close">×</button>
        </div>
        <div class="form-group">
          <label>Select Module</label>
          <select v-model="addItemForm.moduleId" class="form-control" @click.stop>
            <option value="">-- Select --</option>
            <option v-if="availableModules.length === 0" disabled>No modules available</option>
            <option v-for="module in availableModules" :key="module.id" :value="module.id">
              {{ module.title }}
            </option>
          </select>
          <small v-if="availableModules.length === 0" style="color: var(--warning); display: block; margin-top: 8px;">
            No modules found. Create modules in the Module Manager first.
          </small>
        </div>
        <div class="modal-actions">
          <button @click.stop="showAddModule = false" class="btn btn-secondary">Cancel</button>
          <button @click.stop="addModuleToPackage" class="btn btn-primary" :disabled="!addItemForm.moduleId">
            Add
          </button>
          <button @click.stop="showAddModule = false" class="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>

    <!-- Add Checklist Item Modal -->
    <div v-if="showAddChecklistItem" class="modal-overlay nested-modal" @click.self="showAddChecklistItem = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Add Checklist Item</h3>
          <button @click.stop="showAddChecklistItem = false" class="btn-close">×</button>
        </div>
        <div class="form-group">
          <label>Select Checklist Item</label>
          <select v-model="addItemForm.checklistItemId" class="form-control" @click.stop>
            <option value="">-- Select --</option>
            <option v-if="availableChecklistItems.length === 0" disabled>No checklist items available</option>
            <option v-for="item in availableChecklistItems" :key="item.id" :value="item.id">
              {{ item.item_label }}
            </option>
          </select>
          <small v-if="availableChecklistItems.length === 0" style="color: var(--warning); display: block; margin-top: 8px;">
            No checklist items found. Create checklist items first.
          </small>
        </div>
        <div class="modal-actions">
          <button @click.stop="showAddChecklistItem = false" class="btn btn-secondary">Cancel</button>
          <button @click.stop="addChecklistItemToPackage" class="btn btn-primary" :disabled="!addItemForm.checklistItemId">
            Add
          </button>
          <button @click.stop="showAddChecklistItem = false" class="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>

    <!-- Add Document Modal -->
    <div v-if="showAddDocument" class="modal-overlay nested-modal" @click.self="showAddDocument = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Add Document</h3>
          <button @click.stop="showAddDocument = false" class="btn-close">×</button>
        </div>
        <div class="form-group">
          <label>Select Document</label>
          <select v-model="addItemForm.documentTemplateId" class="form-control" @click.stop>
            <option value="">-- Select --</option>
            <option v-if="availableDocuments.length === 0" disabled>No documents available</option>
            <option v-for="doc in availableDocuments" :key="doc.id" :value="String(doc.id)">
              {{ doc.name }}
            </option>
          </select>
          <small v-if="availableDocuments.length === 0" style="color: var(--warning); display: block; margin-top: 8px;">
            No documents found. Create documents in the Documents Library first.
          </small>
        </div>
        <div class="form-group">
          <label>Action Type</label>
          <select v-model="addItemForm.actionType" class="form-control" @click.stop>
            <option value="signature">E-Signature Required</option>
            <option value="review">Review Only</option>
          </select>
        </div>
        <div class="form-group">
          <label>Due Date (Days from Assignment)</label>
          <input v-model.number="addItemForm.dueDateDays" type="number" min="0" placeholder="Optional" @click.stop />
          <small>Leave empty for no automatic due date</small>
        </div>
        <div v-if="modalError" class="error-message" style="margin-bottom: 16px; padding: 12px; background: #fee; border: 1px solid #fcc; border-radius: 4px;">
          {{ modalError }}
        </div>
        <div class="modal-actions">
          <button @click.stop="showAddDocument = false; modalError = '';" class="btn btn-secondary">Cancel</button>
          <button @click.stop="addDocumentToPackage" class="btn btn-primary" :disabled="!addItemForm.documentTemplateId">
            Add
          </button>
          <button @click.stop="showAddDocument = false" class="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>

    <!-- Assign Package Modal -->
    <div v-if="packageToAssign" class="modal-overlay nested-modal" @click.self="packageToAssign = null">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Assign Package: {{ packageToAssign?.name }}</h3>
          <button @click.stop="packageToAssign = null" class="btn-close">×</button>
        </div>
        <div class="form-group">
          <label>Select Users *</label>
          <select v-model="assignForm.userIds" multiple class="form-control" size="10" required>
            <option v-for="user in availableUsers" :key="user.id" :value="user.id">
              {{ user.first_name }} {{ user.last_name }} ({{ user.email }})
            </option>
          </select>
          <small>Hold Ctrl/Cmd to select multiple users</small>
        </div>
        <div class="form-group">
          <label>Agency *</label>
          <select v-model="assignForm.agencyId" required>
            <option value="">-- Select Agency --</option>
            <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Due Date (Optional)</label>
          <input v-model="assignForm.dueDate" type="datetime-local" />
        </div>
        <div v-if="assignError" class="error-message">{{ assignError }}</div>
        <div class="modal-actions">
          <button @click="packageToAssign = null" class="btn btn-secondary">Cancel</button>
          <button @click="executeAssignPackage" class="btn btn-primary" :disabled="assigning || !assignForm.userIds?.length || !assignForm.agencyId">
            {{ assigning ? 'Assigning...' : 'Assign Package' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  readOnly: {
    type: Boolean,
    default: false
  }
});

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const packages = ref([]);
const loading = ref(true);
const error = ref('');
const showCreateModal = ref(false);
const editingPackage = ref(null);
const saving = ref(false);
const modalError = ref('');

const packageForm = ref({
  name: '',
  description: '',
  agencyId: null,
  isActive: true,
  packageType: 'onboarding'
});

const selectedPackage = ref(null);
const packageDetails = ref({});
const activeDetailTab = ref('training-focuses');
const detailTabs = [
  { id: 'training-focuses', label: 'Training Focuses' },
  { id: 'modules', label: 'Modules' },
  { id: 'documents', label: 'Documents' },
  { id: 'checklist-items', label: 'Checklist Items' }
];

const showAddTrainingFocus = ref(false);
const showAddModule = ref(false);
const showAddDocument = ref(false);
const showAddChecklistItem = ref(false);
const availableTracks = ref([]);
const availableModules = ref([]);
const availableDocuments = ref([]);
const availableChecklistItems = ref([]);
const availableAgencies = ref([]);
const availableUsers = ref([]);

const addItemForm = ref({
  trackId: '',
  moduleId: '',
  documentTemplateId: '',
  actionType: 'signature',
  dueDateDays: null,
  checklistItemId: ''
});

const packageToAssign = ref(null);
const assignForm = ref({
  userIds: [],
  agencyId: '',
  dueDate: ''
});
const assigning = ref(false);
const assignError = ref('');

const filteredPackages = computed(() => {
  return packages.value;
});

const fetchPackages = async () => {
  try {
    loading.value = true;
    const response = await api.get('/onboarding-packages?includeInactive=true');
    const packagesData = response.data;
    
    // Fetch counts for each package
    for (const pkg of packagesData) {
      const detailResponse = await api.get(`/onboarding-packages/${pkg.id}`);
      pkg.training_focus_count = detailResponse.data.trainingFocuses?.length || 0;
      pkg.module_count = detailResponse.data.modules?.length || 0;
      pkg.document_count = detailResponse.data.documents?.length || 0;
    }
    
    packages.value = packagesData;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load packages';
  } finally {
    loading.value = false;
  }
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies?includeInactive=true');
    availableAgencies.value = response.data;
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const fetchUsers = async () => {
  try {
    const response = await api.get('/users');
    availableUsers.value = response.data;
  } catch (err) {
    console.error('Failed to load users:', err);
  }
};

const fetchTracks = async (packageAgencyId = null) => {
  try {
    console.log('=== FETCHING TRAINING FOCUSES ===', { packageAgencyId });
    const response = await api.get('/tracks?includeInactive=true');
    console.log('Full response:', response);
    console.log('Response data type:', Array.isArray(response.data) ? 'Array' : typeof response.data);
    console.log('Response data length:', Array.isArray(response.data) ? response.data.length : 'N/A');
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      console.log('First item keys:', Object.keys(response.data[0]));
      console.log('First item:', response.data[0]);
    }
    
    // Ensure we're getting tracks, not modules
    if (Array.isArray(response.data)) {
      let filteredTracks = response.data.filter(item => {
        // Tracks should have 'name' field, modules have 'title'
        const hasName = item.name !== undefined;
        const hasTitle = item.title !== undefined;
        const isTrack = hasName && !hasTitle;
        
        if (!isTrack) {
          console.warn('❌ Filtered out non-track item. Has name:', hasName, 'Has title:', hasTitle, 'Item:', item);
        } else {
          console.log('✅ Valid track:', item.name);
        }
        return isTrack;
      });
      
      // Filter by package agency
      if (packageAgencyId === null) {
        // Platform-wide package: only show platform-wide tracks
        filteredTracks = filteredTracks.filter(track => track.agency_id === null || track.agency_id === undefined);
        console.log('Filtered to platform-wide tracks only:', filteredTracks.length);
      } else if (packageAgencyId !== undefined) {
        // Agency-specific package: show platform-wide + agency-specific tracks
        filteredTracks = filteredTracks.filter(track => 
          track.agency_id === null || track.agency_id === undefined || track.agency_id === packageAgencyId
        );
        console.log('Filtered to platform + agency', packageAgencyId, 'tracks:', filteredTracks.length);
      }
      
      availableTracks.value = filteredTracks;
      console.log('✅ Final tracks count:', availableTracks.value.length);
      if (availableTracks.value.length > 0) {
        console.log('✅ Sample track:', availableTracks.value[0]);
      }
    } else {
      console.error('❌ Response is not an array:', typeof response.data, response.data);
      availableTracks.value = [];
    }
  } catch (err) {
    console.error('❌ Failed to load tracks:', err);
    availableTracks.value = [];
  }
};

const fetchModules = async (packageAgencyId = null) => {
  try {
    console.log('=== FETCHING MODULES ===', { packageAgencyId });
    const response = await api.get('/modules?includeInactive=true');
    console.log('Full response:', response);
    console.log('Response data type:', Array.isArray(response.data) ? 'Array' : typeof response.data);
    console.log('Response data length:', Array.isArray(response.data) ? response.data.length : 'N/A');
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      console.log('First item keys:', Object.keys(response.data[0]));
      console.log('First item:', response.data[0]);
    }
    
    // Ensure we're getting modules, not tracks
    if (Array.isArray(response.data)) {
      let filteredModules = response.data.filter(item => {
        // Modules should have 'title' field, tracks have 'name'
        const hasName = item.name !== undefined;
        const hasTitle = item.title !== undefined;
        const isModule = hasTitle && !hasName;
        
        if (!isModule) {
          console.warn('❌ Filtered out non-module item. Has name:', hasName, 'Has title:', hasTitle, 'Item:', item);
        } else {
          console.log('✅ Valid module:', item.title);
        }
        return isModule;
      });
      
      // Filter by package agency
      if (packageAgencyId === null) {
        // Platform-wide package: only show platform-wide modules
        filteredModules = filteredModules.filter(module => module.agency_id === null || module.agency_id === undefined);
        console.log('Filtered to platform-wide modules only:', filteredModules.length);
      } else if (packageAgencyId !== undefined) {
        // Agency-specific package: show platform-wide + agency-specific modules
        filteredModules = filteredModules.filter(module => 
          module.agency_id === null || module.agency_id === undefined || module.agency_id === packageAgencyId
        );
        console.log('Filtered to platform + agency', packageAgencyId, 'modules:', filteredModules.length);
      }
      
      availableModules.value = filteredModules;
      console.log('✅ Final modules count:', availableModules.value.length);
      if (availableModules.value.length > 0) {
        console.log('✅ Sample module:', availableModules.value[0]);
      }
    } else {
      console.error('❌ Response is not an array:', typeof response.data, response.data);
      availableModules.value = [];
    }
  } catch (err) {
    console.error('❌ Failed to load modules:', err);
    availableModules.value = [];
  }
};

const fetchDocuments = async (packageAgencyId = null) => {
  try {
    console.log('Fetching documents...', { packageAgencyId });
    const response = await api.get('/document-templates', {
      params: {
        isUserSpecific: false, // Only show library documents, not user-specific
        limit: 1000, // Get all documents
        isActive: true,
        agencyId: packageAgencyId === null ? 'null' : (packageAgencyId !== undefined ? packageAgencyId : 'all')
      }
    });
    
    console.log('Documents API response:', response.data);
    
    // Handle paginated response
    let documents = [];
    if (response.data && response.data.data && Array.isArray(response.data.data)) {
      // Paginated response with data array
      documents = response.data.data;
    } else if (response.data && Array.isArray(response.data)) {
      // Direct array response
      documents = response.data;
    } else if (response.data && response.data.templates && Array.isArray(response.data.templates)) {
      // Alternative paginated format
      documents = response.data.templates;
    } else {
      console.warn('Unexpected response format:', response.data);
      documents = [];
    }
    
    console.log('Parsed documents array:', documents.length, 'items');
    
    // Filter: active and not user-specific
    let filteredDocs = documents.filter(doc => {
      const isActive = doc.is_active !== false && doc.is_active !== 0;
      const isNotUserSpecific = !doc.is_user_specific && doc.is_user_specific !== 1;
      return isActive && isNotUserSpecific;
    });
    
    // Filter by package agency (additional frontend filtering if backend doesn't handle it)
    if (packageAgencyId === null) {
      // Platform-wide package: only show platform-wide documents
      filteredDocs = filteredDocs.filter(doc => doc.agency_id === null || doc.agency_id === undefined);
      console.log('Filtered to platform-wide documents only:', filteredDocs.length);
    } else if (packageAgencyId !== undefined) {
      // Agency-specific package: show platform-wide + agency-specific documents
      filteredDocs = filteredDocs.filter(doc => 
        doc.agency_id === null || doc.agency_id === undefined || doc.agency_id === packageAgencyId
      );
      console.log('Filtered to platform + agency', packageAgencyId, 'documents:', filteredDocs.length);
    }
    
    availableDocuments.value = filteredDocs;
    console.log('Filtered documents:', availableDocuments.value.length, 'available');
    if (availableDocuments.value.length === 0 && documents.length > 0) {
      console.warn('All documents were filtered out. Sample document:', documents[0]);
    }
  } catch (err) {
    console.error('Failed to load documents:', err);
    console.error('Error response:', err.response?.data);
    availableDocuments.value = [];
  }
};

const fetchChecklistItems = async (packageAgencyId = null) => {
  try {
    const response = await api.get('/custom-checklist-items');
    let items = response.data || [];
    
    // Filter by package agency
    if (packageAgencyId === null) {
      // Platform-wide package: only show platform-wide items
      items = items.filter(item => item.is_platform_template || item.agency_id === null || item.agency_id === undefined);
    } else if (packageAgencyId !== undefined) {
      // Agency-specific package: show platform-wide + agency-specific items
      items = items.filter(item => 
        item.is_platform_template || 
        item.agency_id === null || 
        item.agency_id === undefined || 
        item.agency_id === packageAgencyId
      );
    }
    
    availableChecklistItems.value = items;
  } catch (err) {
    console.error('Failed to load checklist items:', err);
    availableChecklistItems.value = [];
  }
};

const editPackage = (pkg) => {
  editingPackage.value = pkg;
  packageForm.value = {
    name: pkg.name || '',
    description: pkg.description || '',
    agencyId: pkg.agency_id || null,
    isActive: pkg.is_active !== false,
    packageType: pkg.package_type || 'onboarding'
  };
  showCreateModal.value = false;
};

const viewPackage = async (id, preserveTab = false) => {
  try {
    const response = await api.get(`/onboarding-packages/${id}`);
    selectedPackage.value = response.data;
    packageDetails.value = {
      trainingFocuses: response.data.trainingFocuses || [],
      modules: response.data.modules || [],
      documents: response.data.documents || [],
      checklistItems: response.data.checklistItems || []
    };
    
    // Refetch available options filtered by package's agency
    const packageAgencyId = response.data.agency_id;
    console.log('Package agency ID:', packageAgencyId, 'Refetching options...');
    await Promise.all([
      fetchTracks(packageAgencyId),
      fetchModules(packageAgencyId),
      fetchDocuments(packageAgencyId),
      fetchChecklistItems(packageAgencyId)
    ]);
    
    // Only reset tab if not preserving (i.e., initial load)
    if (!preserveTab) {
      activeDetailTab.value = 'training-focuses';
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load package details';
  }
};

const savePackage = async () => {
  try {
    saving.value = true;
    modalError.value = '';

    if (editingPackage.value) {
      await api.put(`/onboarding-packages/${editingPackage.value.id}`, packageForm.value);
    } else {
      await api.post('/onboarding-packages', packageForm.value);
    }

    closeModal();
    fetchPackages();
  } catch (err) {
    modalError.value = err.response?.data?.error?.message || 'Failed to save package';
  } finally {
    saving.value = false;
  }
};

const togglePackageStatus = async (pkg) => {
  try {
    const newStatus = !pkg.is_active;
    await api.put(`/onboarding-packages/${pkg.id}`, {
      name: pkg.name,
      description: pkg.description,
      isActive: newStatus
    });
    // Update local package status immediately
    pkg.is_active = newStatus;
    // Refresh packages list to ensure sync
    await fetchPackages();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update package status';
  }
};

const deletePackage = async (id) => {
  if (!confirm('Are you sure you want to delete this package? This action cannot be undone.')) {
    return;
  }

  try {
    await api.delete(`/onboarding-packages/${id}`);
    fetchPackages();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete package';
  }
};

const closeModal = () => {
  showCreateModal.value = false;
  editingPackage.value = null;
  modalError.value = '';
  packageForm.value = {
    name: '',
    description: '',
    agencyId: null,
    isActive: true,
    packageType: 'onboarding'
  };
};

const closeDetailModal = () => {
  selectedPackage.value = null;
  packageDetails.value = {};
  activeDetailTab.value = 'training-focuses';
};

const addTrainingFocusToPackage = async () => {
  try {
    const response = await api.post(`/onboarding-packages/${selectedPackage.value.id}/training-focuses`, {
      trackId: addItemForm.value.trackId,
      orderIndex: packageDetails.value.trainingFocuses.length
    });
    // Update packageDetails directly with the new training focus from the response
    if (response.data && Array.isArray(response.data)) {
      packageDetails.value.trainingFocuses = [...response.data]; // Create new array to trigger reactivity
    } else {
      // Fallback: refresh the entire package
      await viewPackage(selectedPackage.value.id, true); // Preserve current tab
      return; // Exit early to avoid double refresh
    }
    // Reset form but keep modal open for adding more
    addItemForm.value.trackId = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to add training focus';
  }
};

const removeTrainingFocus = async (trackId) => {
  try {
    await api.delete(`/onboarding-packages/${selectedPackage.value.id}/training-focuses/${trackId}`);
    // Remove from local list immediately for real-time update
    packageDetails.value.trainingFocuses = packageDetails.value.trainingFocuses.filter(
      tf => tf.track_id !== trackId
    );
    // Refresh to ensure sync (but preserve current tab)
    await viewPackage(selectedPackage.value.id, true);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to remove training focus';
  }
};

const addModuleToPackage = async () => {
  try {
    const response = await api.post(`/onboarding-packages/${selectedPackage.value.id}/modules`, {
      moduleId: addItemForm.value.moduleId,
      orderIndex: packageDetails.value.modules.length
    });
    // Update packageDetails directly with the new module from the response
    if (response.data && Array.isArray(response.data)) {
      packageDetails.value.modules = [...response.data]; // Create new array to trigger reactivity
    } else {
      // Fallback: refresh the entire package
      await viewPackage(selectedPackage.value.id, true); // Preserve current tab
      return; // Exit early to avoid double refresh
    }
    // Reset form but keep modal open for adding more
    addItemForm.value.moduleId = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to add module';
  }
};

const removeModule = async (moduleId) => {
  try {
    await api.delete(`/onboarding-packages/${selectedPackage.value.id}/modules/${moduleId}`);
    // Remove from local list immediately for real-time update
    packageDetails.value.modules = packageDetails.value.modules.filter(
      mod => mod.module_id !== moduleId
    );
    // Refresh to ensure sync (but preserve current tab)
    await viewPackage(selectedPackage.value.id, true);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to remove module';
  }
};

const addDocumentToPackage = async () => {
  try {
    modalError.value = '';
    console.log('Adding document to package:', {
      packageId: selectedPackage.value.id,
      documentTemplateId: addItemForm.value.documentTemplateId,
      actionType: addItemForm.value.actionType,
      dueDateDays: addItemForm.value.dueDateDays
    });

    const response = await api.post(`/onboarding-packages/${selectedPackage.value.id}/documents`, {
      documentTemplateId: parseInt(addItemForm.value.documentTemplateId),
      orderIndex: packageDetails.value.documents.length,
      actionType: addItemForm.value.actionType,
      dueDateDays: addItemForm.value.dueDateDays || null
    });

    console.log('Document added successfully:', response.data);
    
    // Update packageDetails directly with the new document from the response
    // The response contains the updated list of documents
    if (response.data && Array.isArray(response.data)) {
      packageDetails.value.documents = [...response.data]; // Create new array to trigger reactivity
    } else {
      // Fallback: refresh the entire package if response format is different
      await viewPackage(selectedPackage.value.id, true); // Preserve current tab
      return; // Exit early to avoid double refresh
    }
    
    // Reset form but keep modal open for adding more
    addItemForm.value.documentTemplateId = '';
    addItemForm.value.actionType = 'signature';
    addItemForm.value.dueDateDays = null;
  } catch (err) {
    console.error('Error adding document:', err);
    console.error('Error response:', err.response?.data);
    modalError.value = err.response?.data?.error?.message || 'Failed to add document';
    error.value = err.response?.data?.error?.message || 'Failed to add document';
  }
};

// Handle Add Document button click - fetch documents and show modal
const handleAddDocumentClick = async () => {
  console.log('Add Document button clicked');
  try {
    // Fetch documents filtered by package's agency before showing modal
    const packageAgencyId = selectedPackage.value?.agency_id;
    await fetchDocuments(packageAgencyId);
    console.log('Documents fetched, showing modal. Available documents:', availableDocuments.value.length);
    showAddDocument.value = true;
  } catch (err) {
    console.error('Error fetching documents before showing modal:', err);
    error.value = 'Failed to load documents. Please try again.';
  }
};

// Handle Add Training Focus button click - fetch tracks and show modal
const handleAddTrainingFocusClick = async () => {
  console.log('Add Training Focus button clicked');
  try {
    // Fetch tracks filtered by package's agency before showing modal
    const packageAgencyId = selectedPackage.value?.agency_id;
    await fetchTracks(packageAgencyId);
    console.log('Tracks fetched, showing modal. Available tracks:', availableTracks.value.length);
    showAddTrainingFocus.value = true;
  } catch (err) {
    console.error('Error fetching tracks before showing modal:', err);
    error.value = 'Failed to load training focuses. Please try again.';
  }
};

// Handle Add Module button click - fetch modules and show modal
const handleAddModuleClick = async () => {
  console.log('Add Module button clicked');
  try {
    // Fetch modules filtered by package's agency before showing modal
    const packageAgencyId = selectedPackage.value?.agency_id;
    await fetchModules(packageAgencyId);
    console.log('Modules fetched, showing modal. Available modules:', availableModules.value.length);
    showAddModule.value = true;
  } catch (err) {
    console.error('Error fetching modules before showing modal:', err);
    error.value = 'Failed to load modules. Please try again.';
  }
};

// Watch for modal opening to ensure items are loaded
watch(showAddDocument, async (newVal) => {
  if (newVal && availableDocuments.value.length === 0) {
    console.log('Modal opened but no documents available, fetching...');
    const packageAgencyId = selectedPackage.value?.agency_id;
    await fetchDocuments(packageAgencyId);
  }
});

watch(showAddTrainingFocus, async (newVal) => {
  if (newVal && availableTracks.value.length === 0) {
    console.log('Modal opened but no tracks available, fetching...');
    const packageAgencyId = selectedPackage.value?.agency_id;
    await fetchTracks(packageAgencyId);
  }
});

watch(showAddModule, async (newVal) => {
  if (newVal && availableModules.value.length === 0) {
    console.log('Modal opened but no modules available, fetching...');
    const packageAgencyId = selectedPackage.value?.agency_id;
    await fetchModules(packageAgencyId);
  }
});

const removeDocument = async (documentTemplateId) => {
  try {
    await api.delete(`/onboarding-packages/${selectedPackage.value.id}/documents/${documentTemplateId}`);
    // Remove from local list immediately for real-time update
    packageDetails.value.documents = packageDetails.value.documents.filter(
      doc => doc.document_template_id !== documentTemplateId
    );
    // Refresh to ensure sync (but preserve current tab)
    await viewPackage(selectedPackage.value.id, true);
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to remove document';
  }
};

const assignPackage = (pkg) => {
  packageToAssign.value = pkg;
  assignForm.value = {
    userIds: [],
    agencyId: '',
    dueDate: ''
  };
  assignError.value = '';
};

const executeAssignPackage = async () => {
  try {
    assigning.value = true;
    assignError.value = '';

    const payload = {
      userIds: assignForm.value.userIds,
      agencyId: parseInt(assignForm.value.agencyId),
      dueDate: assignForm.value.dueDate || null
    };

    const response = await api.post(`/onboarding-packages/${packageToAssign.value.id}/assign`, payload);
    
    alert(`Package assigned successfully!\n\n${response.data.summary.usersAssigned} users\n${response.data.summary.trainingFocusesAssigned} training focuses\n${response.data.summary.modulesAssigned} modules\n${response.data.summary.documentsAssigned} documents`);
    
    packageToAssign.value = null;
  } catch (err) {
    assignError.value = err.response?.data?.error?.message || 'Failed to assign package';
  } finally {
    assigning.value = false;
  }
};

const getAgencyName = (agencyId) => {
  const agency = availableAgencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : 'Unknown';
};

const getPackageTypeLabel = (packageType) => {
  const typeMap = {
    'pre_hire': 'Pre-Hire',
    'onboarding': 'Onboarding',
    'training': 'Training',
    'other': 'Other'
  };
  return typeMap[packageType] || packageType || 'Onboarding';
};

onMounted(async () => {
  await Promise.all([
    fetchPackages(),
    fetchAgencies(),
    fetchUsers(),
    fetchTracks(),
    fetchModules(),
    fetchDocuments()
  ]);
});
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0;
}

.section-description {
  color: var(--text-secondary);
  margin-bottom: 32px;
}

.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.package-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.package-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.package-header h3 {
  margin: 0;
  font-size: 18px;
}

.package-description {
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.package-meta {
  margin-bottom: 16px;
}

.meta-item {
  font-size: 13px;
  color: var(--text-secondary);
}

.package-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.stat-item {
  text-align: center;
}

.stat-item strong {
  display: block;
  font-size: 24px;
  color: var(--primary);
}

.stat-item span {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.package-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.package-detail-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.package-detail-tabs .tab-button {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.package-detail-tabs .tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.detail-section {
  padding: 20px 0;
}

.section-header-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.item-number {
  font-weight: bold;
  color: var(--primary);
  min-width: 30px;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-description {
  font-size: 13px;
  color: var(--text-secondary);
}

.item-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-content.large {
  max-width: 800px;
}

.modal-content.xlarge {
  max-width: 1000px;
  max-height: 90vh;
  overflow-y: auto;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
  border: 1px dashed var(--border);
  border-radius: 8px;
}

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
  position: relative;
  z-index: 1001;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.nested-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.nested-modal .modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  z-index: 2001;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  margin: 0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.modal-header h2,
.modal-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: var(--text-secondary);
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  color: var(--text-primary);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
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

.form-group input,
.form-group select,
.form-group textarea {
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
</style>

