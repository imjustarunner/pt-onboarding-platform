<template>
  <div class="icon-library">
    <div class="page-header">
      <h1>Icon Library</h1>
      <p class="page-description">Upload and manage icons that can be used throughout the system.</p>
      <div class="header-actions">
        <button @click="showUploadModal = true" class="btn btn-primary">Upload New Icon</button>
        <button @click="showBulkUploadModal = true" class="btn btn-secondary">Bulk Upload Icons</button>
      </div>
    </div>

    <div class="library-controls">
      <div class="search-controls">
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Search icons..."
          class="search-input"
          @input="handleSearch"
        />
        <select v-model="selectedAgency" class="agency-filter" @change="handleFilterChange">
          <option value="">All Agencies</option>
          <option v-if="authStore.user?.role === 'super_admin'" value="null">Platform</option>
          <option v-for="agency in availableAgencies" :key="agency.id" :value="String(agency.id)">
            {{ agency.name }}
          </option>
        </select>
        <select v-model="selectedCategory" class="category-filter" @change="handleFilterChange">
          <option value="">All Categories</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <select v-model="sortBy" class="sort-filter" @change="handleFilterChange">
          <option value="name">Sort by Name</option>
          <option value="category">Sort by Category</option>
          <option value="agency_name">Sort by Agency</option>
        </select>
      </div>
      <!-- Bulk Actions Toolbar (Super Admin Only) -->
      <div v-if="isSelectMode && selectedIcons.length > 0" class="bulk-actions-toolbar">
        <span class="selected-count">{{ selectedIcons.length }} icon(s) selected</span>
        <button @click="showBulkEditModal = true" class="btn btn-primary btn-sm">Edit Selected</button>
        <button @click="showBulkDeleteConfirm = true" class="btn btn-danger btn-sm">Delete Selected</button>
        <button @click="clearSelection" class="btn btn-secondary btn-sm">Clear Selection</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading icons...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredIcons.length === 0" class="empty-state">
      <p>No icons found. Upload your first icon to get started.</p>
    </div>
    <div v-else class="icon-grid">
      <!-- Select All Header (Super Admin Only) -->
      <div v-if="isSelectMode" class="select-all-header">
        <label class="select-all-checkbox">
          <input
            type="checkbox"
            :checked="selectedIcons.length === filteredIcons.length && filteredIcons.length > 0"
            :indeterminate="selectedIcons.length > 0 && selectedIcons.length < filteredIcons.length"
            @change="toggleSelectAll"
          />
          <span>Select All</span>
        </label>
      </div>
      <div v-for="icon in filteredIcons" :key="icon.id" class="icon-card" :class="{ 'selected': isSelected(icon.id) }">
        <!-- Checkbox (Super Admin Only) -->
        <div v-if="isSelectMode" class="icon-checkbox">
          <input
            type="checkbox"
            :checked="isSelected(icon.id)"
            @change="toggleIconSelection(icon.id)"
          />
        </div>
        <div class="icon-preview">
          <img :src="getIconUrl(icon)" :alt="icon.name" class="icon-img" />
        </div>
        <div class="icon-info">
          <h3>{{ icon.name }}</h3>
          <p v-if="icon.agency_name" class="icon-agency">Agency: {{ icon.agency_name }}</p>
          <p v-else class="icon-agency">Platform Icon</p>
          <p v-if="icon.category" class="icon-category">{{ icon.category }}</p>
          <p v-if="icon.description" class="icon-description">{{ icon.description }}</p>
        </div>
        <div class="icon-actions">
          <button @click="editIcon(icon)" class="btn btn-primary btn-sm">Edit</button>
          <button @click="deleteIcon(icon.id)" class="btn btn-danger btn-sm">Delete</button>
        </div>
      </div>
    </div>

    <!-- Upload Modal -->
    <div v-if="showUploadModal" class="modal-overlay" @click="closeUploadModal">
      <div class="modal-content" @click.stop>
        <h2>{{ editingIcon ? 'Edit Icon' : 'Upload New Icon' }}</h2>
        <form @submit.prevent="saveIcon">
          <div class="form-group">
            <label>Icon File <span v-if="!editingIcon">*</span></label>
            <input
              ref="fileInput"
              type="file"
              accept="image/svg+xml,image/png,image/jpeg,image/jpg"
              @change="handleFileSelect"
            />
            <p class="form-help">
              <span v-if="editingIcon">Optional: Select a new file to replace the current icon</span>
              <span v-else>SVG, PNG, or JPG (max 2MB)</span>
            </p>
            <div v-if="editingIcon && !previewFile" class="current-icon-preview">
              <p style="margin-bottom: 8px; font-weight: 600;">Current Icon:</p>
              <img :src="getIconUrl(editingIcon)" :alt="editingIcon.name" class="preview-img" @error="handleIconError" />
            </div>
            <div v-if="previewFile" class="file-preview">
              <p style="margin-bottom: 8px; font-weight: 600;">New Icon Preview:</p>
              <img :src="previewFile" alt="Preview" class="preview-img" />
            </div>
          </div>
          <div class="form-group">
            <label>Name *</label>
            <input v-model="iconForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Category</label>
            <input 
              v-model="iconForm.category" 
              type="text" 
              list="category-list"
              placeholder="Type or select a category..."
              @input="handleCategoryInput"
            />
            <datalist id="category-list">
              <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
            </datalist>
            <small class="form-help">Type a new category or select from existing ones. New categories will be saved automatically.</small>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="iconForm.description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Assign to Agency</label>
            <select 
              v-model.number="iconForm.agencyId" 
              class="form-select" 
              @change="handleAgencyChange"
              :disabled="availableAgencies.length === 0"
            >
              <option :value="null">Platform (Default)</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="Number(agency.id)">
                {{ agency.name }} (ID: {{ agency.id }})
              </option>
            </select>
            <div v-if="availableAgencies.length === 0" style="margin-top: 8px; color: var(--text-secondary); font-size: 12px;">
              No agencies available
            </div>
            <small class="form-help">Icons assigned to Platform are available to all agencies. Icons assigned to a specific agency are only available to that agency.</small>
            <small v-if="iconForm.agencyId" style="display: block; margin-top: 4px; color: var(--primary);">
              Selected: {{ availableAgencies.find(a => a.id === iconForm.agencyId)?.name || 'Unknown' }}
            </small>
            <small v-else style="display: block; margin-top: 4px; color: var(--text-secondary);">
              Selected: Platform (Default)
            </small>
          </div>
          <div v-if="modalError" class="error-message">{{ modalError }}</div>
          <div class="modal-actions">
            <button type="button" @click="closeUploadModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="uploading || !iconForm.name">
              {{ uploading ? (editingIcon ? 'Updating...' : 'Uploading...') : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Bulk Upload Modal -->
    <div v-if="showBulkUploadModal" class="modal-overlay" @click="closeBulkUploadModal">
      <div class="modal-content bulk-upload-modal" @click.stop>
        <h2>Bulk Upload Icons</h2>
        
        <!-- File Selection Step -->
        <div v-if="!bulkIconsReady" class="bulk-upload-step">
          <div class="form-group">
            <label>Select Icon Files *</label>
            <input
              ref="bulkFileInput"
              type="file"
              accept="image/svg+xml,image/png,image/jpeg,image/jpg"
              multiple
              @change="handleBulkFileSelect"
            />
            <p class="form-help">You can select multiple files at once (SVG, PNG, or JPG, max 2MB each)</p>
            <div v-if="selectedBulkFiles.length > 0" class="selected-files-list">
              <p><strong>{{ selectedBulkFiles.length }} file(s) selected:</strong></p>
              <ul>
                <li v-for="(file, index) in selectedBulkFiles" :key="index">{{ file.name }}</li>
              </ul>
            </div>
          </div>
          <div v-if="bulkUploadError" class="error-message">{{ bulkUploadError }}</div>
          <div class="modal-actions">
            <button type="button" @click="closeBulkUploadModal" class="btn btn-secondary">Cancel</button>
            <button 
              type="button" 
              @click="prepareBulkIcons" 
              class="btn btn-primary" 
              :disabled="selectedBulkFiles.length === 0"
            >
              Next: Configure Icons
            </button>
          </div>
        </div>
        
        <!-- Icon Configuration Step -->
        <div v-else class="bulk-upload-step">
          <p class="step-description">Configure metadata for each icon before saving. You can edit titles, descriptions, and agency assignments.</p>
          
          <!-- Default Settings Section -->
          <div class="default-settings-section">
            <h3>Default Settings (Apply to All)</h3>
            <div class="default-settings-grid">
              <div class="form-group">
                <label>Default Agency</label>
                <select v-model="defaultAgencyId" @change="applyDefaultAgency">
                  <option :value="null">Platform (Default)</option>
                  <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                    {{ agency.name }}
                  </option>
                </select>
                <small class="form-help">This will apply to all icons. You can change individual icons below.</small>
              </div>
              
              <div class="form-group">
                <label>Default Category</label>
                <input 
                  v-model="defaultCategory" 
                  type="text"
                  placeholder="Optional category"
                  @input="applyDefaultCategory"
                />
                <small class="form-help">This will apply to all icons. You can change individual icons below.</small>
              </div>
            </div>
          </div>
          
          <div class="bulk-icons-list">
            <div v-for="(iconData, index) in visibleBulkIcons" :key="index" class="bulk-icon-item" :class="{ 'icon-failed': iconData.hasError }">
              <div class="icon-preview-section">
                <img :src="iconData.preview" :alt="iconData.name" class="icon-preview-img" />
                <p class="icon-filename">{{ iconData.fileName }}</p>
              </div>
              
              <div class="icon-form-section">
                <div v-if="iconData.hasError" class="icon-error-message">
                  <strong>Error:</strong> {{ iconData.errorMessage }}
                </div>
                <div v-if="iconData.uploading" class="icon-uploading-message">
                  Uploading...
                </div>
                <div v-if="iconData.uploaded" class="icon-success-message">
                  ✓ Successfully uploaded
                </div>
                <div class="form-group">
                  <label>Title *</label>
                  <input 
                    v-model="iconData.name" 
                    type="text" 
                    required
                    :placeholder="`Icon ${index + 1}`"
                    :disabled="iconData.uploaded || iconData.uploading"
                  />
                </div>
                
                <div class="form-group">
                  <label>Description</label>
                  <textarea 
                    v-model="iconData.description" 
                    rows="2"
                    placeholder="Optional description"
                    :disabled="iconData.uploaded || iconData.uploading"
                  ></textarea>
                </div>
                
                <div class="form-group">
                  <label>Category</label>
                  <input 
                    v-model="iconData.category" 
                    type="text"
                    placeholder="Optional category"
                    @input="iconData.hasCustomCategory = true"
                    :disabled="iconData.uploaded || iconData.uploading"
                  />
                  <small v-if="!iconData.hasCustomCategory && defaultCategory" class="form-help" style="color: var(--text-secondary);">
                    Using default: "{{ defaultCategory }}"
                  </small>
                </div>
                
                <div class="form-group">
                  <label>Agency</label>
                  <select v-model="iconData.agencyId" @change="iconData.hasCustomAgency = true" :disabled="iconData.uploaded || iconData.uploading">
                    <option :value="null">Platform (Default)</option>
                    <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                      {{ agency.name }}
                    </option>
                  </select>
                  <small class="form-help">
                    <span v-if="iconData.agencyId">Selected: {{ getAgencyName(iconData.agencyId) }}</span>
                    <span v-else>Selected: Platform (Default)</span>
                    <span v-if="!iconData.hasCustomAgency && defaultAgencyId !== null" style="color: var(--text-secondary);">
                      (using default)
                    </span>
                    <span v-else-if="!iconData.hasCustomAgency" style="color: var(--text-secondary);">
                      (using default: Platform)
                    </span>
                  </small>
                </div>
              </div>
            </div>
          </div>
          
          <div v-if="bulkUploadError" class="error-message">{{ bulkUploadError }}</div>
          <div v-if="bulkUploadResults" class="upload-results">
            <div v-if="bulkUploadResults.successCount > 0" class="success-message">
              Successfully uploaded {{ bulkUploadResults.successCount }} icon(s)
            </div>
            <div v-if="bulkUploadResults.errors && bulkUploadResults.errors.length > 0" class="error-list">
              <p><strong>Errors:</strong></p>
              <ul>
                <li v-for="(error, idx) in bulkUploadResults.errors" :key="idx">
                  {{ error.file }}: {{ error.error }}
                </li>
              </ul>
            </div>
          </div>
          
          <div class="modal-actions">
            <button type="button" @click="resetBulkUpload" class="btn btn-secondary">Back</button>
            <button 
              type="button" 
              @click="saveBulkIcons" 
              class="btn btn-primary" 
              :disabled="uploading || !allIconsValid || remainingIconsCount === 0"
            >
              {{ uploading ? 'Uploading...' : remainingIconsCount === 0 ? 'All Uploaded' : `Save Remaining (${remainingIconsCount})` }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Bulk Edit Modal -->
    <div v-if="showBulkEditModal" class="modal-overlay" @click="showBulkEditModal = false">
      <div class="modal-content" @click.stop>
        <h2>Bulk Edit Icons</h2>
        <p class="modal-description">Update {{ selectedIcons.length }} selected icon(s). Leave fields empty to keep current values.</p>
        <form @submit.prevent="saveBulkEdit">
          <div class="form-group">
            <label>Name</label>
            <input v-model="bulkEditForm.name" type="text" placeholder="Leave empty to keep current names" />
            <small>If provided, will update all selected icons to this name</small>
          </div>
          <div class="form-group">
            <label>Category</label>
            <input v-model="bulkEditForm.category" type="text" placeholder="Leave empty to keep current categories" />
            <small>If provided, will update all selected icons to this category</small>
          </div>
          <div class="form-group">
            <label>Agency</label>
            <select v-model="bulkEditForm.agencyId">
              <option :value="undefined">Keep current agency</option>
              <option :value="null">Platform (No Agency)</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="bulkEditForm.description" rows="3" placeholder="Leave empty to keep current descriptions"></textarea>
            <small>If provided, will update all selected icons to this description</small>
          </div>
          <div v-if="error" class="error-message">{{ error }}</div>
          <div class="modal-actions">
            <button type="button" @click="showBulkEditModal = false" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary">Update Icons</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Bulk Delete Confirmation Modal -->
    <div v-if="showBulkDeleteConfirm" class="modal-overlay" @click="showBulkDeleteConfirm = false">
      <div class="modal-content" @click.stop>
        <h2>Confirm Bulk Delete</h2>
        <p class="modal-description">Are you sure you want to delete {{ selectedIcons.length }} icon(s)? This action cannot be undone.</p>
        <div class="icons-to-delete">
          <p><strong>Icons to be deleted:</strong></p>
          <ul class="icon-list">
            <li v-for="iconId in selectedIcons.slice(0, 10)" :key="iconId">
              {{ icons.find(i => i.id === iconId)?.name || `Icon #${iconId}` }}
            </li>
            <li v-if="selectedIcons.length > 10">... and {{ selectedIcons.length - 10 }} more</li>
          </ul>
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>
        <div class="modal-actions">
          <button type="button" @click="showBulkDeleteConfirm = false" class="btn btn-secondary">Cancel</button>
          <button type="button" @click="confirmBulkDelete" class="btn btn-danger">Delete {{ selectedIcons.length }} Icon(s)</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const icons = ref([]);
const loading = ref(true);
const error = ref('');
const showUploadModal = ref(false);
const showBulkUploadModal = ref(false);
const editingIcon = ref(null);
const uploading = ref(false);
const modalError = ref('');
const bulkUploadError = ref('');
const bulkUploadResults = ref(null);
const searchTerm = ref('');
const selectedCategory = ref('');
const selectedAgency = ref('');
const sortBy = ref('name');
const selectedFile = ref(null);
const selectedBulkFiles = ref([]);
const previewFile = ref(null);
const fileInput = ref(null);
const bulkFileInput = ref(null);
const searchTimeout = ref(null);
const bulkIconsReady = ref(false);
const bulkIconsData = ref([]);
const defaultAgencyId = ref(null);
const defaultCategory = ref('');
const uploadedIconIds = ref(new Set()); // Track successfully uploaded icons
const failedIcons = ref([]); // Track failed icons with error messages

// Bulk selection state (Super Admin only)
const selectedIcons = ref([]);
const showBulkEditModal = ref(false);
const showBulkDeleteConfirm = ref(false);
const isSelectMode = computed(() => authStore.user?.role === 'super_admin');

const iconForm = ref({
  name: '',
  category: '',
  description: '',
  agencyId: null
});

const bulkUploadForm = ref({
  category: '',
  description: '',
  agencyId: null
});

const availableAgencies = computed(() => {
  if (authStore.user?.role === 'super_admin') {
    return agencyStore.agencies || [];
  }
  return agencyStore.userAgencies || [];
});

// Store all categories separately to ensure new categories show up even when filtered
const allCategories = ref([]);

const categories = computed(() => {
  // Use allCategories if available, otherwise fall back to computed from current icons
  if (allCategories.value.length > 0) {
    return allCategories.value;
  }
  const cats = new Set(icons.value.map(i => i.category).filter(Boolean));
  return Array.from(cats).sort();
});

const filteredIcons = computed(() => {
  return icons.value; // Filtering is now done on the backend
});

const handleSearch = () => {
  clearTimeout(searchTimeout.value);
  searchTimeout.value = setTimeout(() => {
    fetchIcons();
  }, 300);
};

const handleFilterChange = () => {
  fetchIcons();
};

const handleCategoryInput = () => {
  // Category input handler - categories will be automatically available after save
  // The datalist will update when icons are refreshed
};

const getIconUrl = (icon) => {
  if (!icon) return '';
  // Use the URL from the icon if available
  let iconUrl = icon.url;
  if (!iconUrl && icon.file_path) {
    // file_path is stored as "uploads/icons/filename.png" (from StorageService.saveIcon)
    // Don't prepend /uploads/ if it's already there
    let filePath = icon.file_path;
    if (filePath.startsWith('uploads/')) {
      iconUrl = `/${filePath}`;
    } else if (filePath.startsWith('/uploads/')) {
      iconUrl = filePath;
    } else if (filePath.startsWith('icons/')) {
      // Old format - convert to new format
      iconUrl = `/uploads/${filePath}`;
    } else {
      // Assume it's just a filename, prepend uploads/icons/
      iconUrl = `/uploads/icons/${filePath}`;
    }
  }
  if (!iconUrl) return '';
  
  // If URL is already absolute, return as is
  if (iconUrl.startsWith('http://') || iconUrl.startsWith('https://')) {
    return iconUrl;
  }
  // Otherwise, prepend API base URL (uploads are served from root, not /api)
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  // Remove /api from baseURL if present since /uploads is not under /api
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  // Ensure no double slashes
  const cleanUrl = iconUrl.startsWith('/') ? iconUrl : `/${iconUrl}`;
  return `${apiBase}${cleanUrl}`;
};

const fetchIcons = async () => {
  try {
    loading.value = true;
    const params = new URLSearchParams();
    params.append('includeInactive', 'true');
    if (searchTerm.value) {
      params.append('search', searchTerm.value);
    }
    if (selectedCategory.value) {
      params.append('category', selectedCategory.value);
    }
    if (selectedAgency.value) {
      // Handle "null" string for platform icons
      if (selectedAgency.value === 'null') {
        params.append('agencyId', 'null');
      } else {
        params.append('agencyId', selectedAgency.value);
      }
    }
    params.append('sortBy', sortBy.value);
    params.append('sortOrder', 'asc');
    
    const response = await api.get(`/icons?${params.toString()}`);
    icons.value = response.data;
    
    // Also fetch all icons (without filters) to get all categories for the dropdown
    // This ensures new categories show up even when filters are active
    try {
      const allParams = new URLSearchParams();
      allParams.append('includeInactive', 'true');
      allParams.append('sortBy', 'category');
      allParams.append('sortOrder', 'asc');
      const allResponse = await api.get(`/icons?${allParams.toString()}`);
      const allCats = new Set(allResponse.data.map(i => i.category).filter(Boolean));
      allCategories.value = Array.from(allCats).sort();
    } catch (err) {
      console.warn('Failed to fetch all categories:', err);
      // Fall back to computing from current icons
      const cats = new Set(icons.value.map(i => i.category).filter(Boolean));
      allCategories.value = Array.from(cats).sort();
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load icons';
  } finally {
    loading.value = false;
  }
};

const handleAgencyChange = (event) => {
  const selectedValue = event.target.value;
  console.log('Agency change event - raw value:', selectedValue, 'type:', typeof selectedValue);
  // Convert to number if it's a valid number, otherwise keep as null
  if (selectedValue === '' || selectedValue === 'null' || selectedValue === null) {
    iconForm.value.agencyId = null;
  } else {
    const numValue = parseInt(selectedValue);
    iconForm.value.agencyId = isNaN(numValue) ? null : numValue;
  }
  console.log('iconForm.agencyId after change:', iconForm.value.agencyId, 'type:', typeof iconForm.value.agencyId);
  console.log('Full iconForm.value:', JSON.stringify(iconForm.value, null, 2));
};

const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (file) {
    selectedFile.value = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      previewFile.value = e.target.result;
    };
    reader.readAsDataURL(file);
  }
};

const saveIcon = async () => {
  if (!iconForm.value.name) {
    modalError.value = 'Icon name is required';
    return;
  }

  if (editingIcon.value) {
    // Update existing icon - can include file upload if new file is selected
    try {
      uploading.value = true;
      modalError.value = '';
      
      // If a new file is selected, use FormData (multipart/form-data)
      if (selectedFile.value) {
        const formData = new FormData();
        formData.append('icon', selectedFile.value);
        formData.append('name', iconForm.value.name);
        
        if (iconForm.value.category !== undefined) {
          formData.append('category', iconForm.value.category || '');
        }
        if (iconForm.value.description !== undefined) {
          formData.append('description', iconForm.value.description || '');
        }
        
        // Handle agencyId
        const agencyIdValue = (iconForm.value.agencyId !== null && iconForm.value.agencyId !== undefined && iconForm.value.agencyId !== '') 
          ? String(iconForm.value.agencyId) 
          : 'null';
        formData.append('agencyId', agencyIdValue);
        
        // Include isActive from the original icon
        if (editingIcon.value.is_active !== undefined && editingIcon.value.is_active !== null) {
          formData.append('isActive', editingIcon.value.is_active === true || editingIcon.value.is_active === 1 ? 'true' : 'false');
        }
        
        console.log('Updating icon with new file:', { iconId: editingIcon.value.id });
        await api.put(`/icons/${editingIcon.value.id}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      } else {
        // No new file - just update metadata using JSON
        const updateData = {
          name: iconForm.value.name
        };
        
        if (iconForm.value.category !== undefined) {
          updateData.category = iconForm.value.category || null;
        }
        if (iconForm.value.description !== undefined) {
          updateData.description = iconForm.value.description || null;
        }
        
        // Handle agencyId
        if (iconForm.value.agencyId !== null && iconForm.value.agencyId !== undefined && iconForm.value.agencyId !== '') {
          updateData.agencyId = String(iconForm.value.agencyId);
        } else {
          updateData.agencyId = 'null';
        }
        
        // Include isActive from the original icon
        if (editingIcon.value.is_active !== undefined && editingIcon.value.is_active !== null) {
          updateData.isActive = editingIcon.value.is_active === true || editingIcon.value.is_active === 1;
        }
        
        console.log('Updating icon metadata only:', { iconId: editingIcon.value.id, updateData });
        await api.put(`/icons/${editingIcon.value.id}`, updateData);
      }
      
      closeUploadModal();
      // Refresh icons to update categories list
      await fetchIcons();
    } catch (err) {
      console.error('Failed to update icon:', err);
      console.error('Error response:', err.response?.data);
      modalError.value = err.response?.data?.error?.message || 'Failed to update icon';
    } finally {
      uploading.value = false;
    }
  } else {
    // Upload new icon
    if (!selectedFile.value) {
      modalError.value = 'Please select an icon file';
      return;
    }

    try {
      uploading.value = true;
      modalError.value = '';
      const formData = new FormData();
      formData.append('icon', selectedFile.value);
      
      // Ensure name is a non-empty string
      const iconName = (iconForm.value.name || '').trim();
      if (!iconName) {
        modalError.value = 'Icon name is required';
        uploading.value = false;
        return;
      }
      formData.append('name', iconName);
      if (iconForm.value.category) {
        formData.append('category', iconForm.value.category);
      }
      if (iconForm.value.description) {
        formData.append('description', iconForm.value.description);
      }
      // Handle agencyId - send as string, 'null' for platform
      // Always append agencyId, even if it's null (send as 'null' string)
      console.log('=== BEFORE FORM SUBMISSION ===');
      console.log('iconForm.value:', JSON.stringify(iconForm.value, null, 2));
      console.log('iconForm.value.agencyId:', iconForm.value.agencyId, 'type:', typeof iconForm.value.agencyId);
      console.log('Available agencies:', availableAgencies.value.map(a => ({ id: a.id, name: a.name })));
      
      const agencyIdValue = (iconForm.value.agencyId !== null && iconForm.value.agencyId !== undefined && iconForm.value.agencyId !== '') 
        ? String(iconForm.value.agencyId) 
        : 'null';
      formData.append('agencyId', agencyIdValue);
      
      console.log('Uploading icon with agencyId:', iconForm.value.agencyId, 'sending as:', agencyIdValue);
      console.log('FormData entries:', Array.from(formData.entries()));
      // Log each entry
      for (const [key, value] of formData.entries()) {
        console.log(`FormData[${key}]:`, value, typeof value);
      }

      // Don't set Content-Type header - let the browser set it with the boundary
      try {
        await api.post('/icons/upload', formData);
      } catch (err) {
        console.error('Upload error:', err);
        console.error('Error response:', err.response?.data);
        const errorMessage = err.response?.data?.error?.message || err.message;
        const errorDetails = err.response?.data?.error?.errors || [];
        console.error('Error message:', errorMessage);
        console.error('Error details:', errorDetails);
        modalError.value = errorMessage + (errorDetails.length > 0 ? ': ' + errorDetails.map(e => e.msg).join(', ') : '');
        throw err;
      }

      closeUploadModal();
      // Refresh icons to update categories list
      await fetchIcons();
    } catch (err) {
      modalError.value = err.response?.data?.error?.message || 'Failed to upload icon';
    } finally {
      uploading.value = false;
    }
  }
};

const editIcon = (icon) => {
  editingIcon.value = icon;
  iconForm.value = {
    name: icon.name,
    category: icon.category || '',
    description: icon.description || '',
    agencyId: icon.agency_id || null
  };
  selectedFile.value = null;
  previewFile.value = null;
  showUploadModal.value = true;
};

const deleteIcon = async (id) => {
  if (!confirm('Are you sure you want to delete this icon? This action cannot be undone.')) {
    return;
  }

  try {
    await api.delete(`/icons/${id}`);
    fetchIcons();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete icon';
  }
};

// Bulk selection methods
const isSelected = (iconId) => {
  return selectedIcons.value.includes(iconId);
};

const toggleIconSelection = (iconId) => {
  const index = selectedIcons.value.indexOf(iconId);
  if (index > -1) {
    selectedIcons.value.splice(index, 1);
  } else {
    selectedIcons.value.push(iconId);
  }
};

const toggleSelectAll = (event) => {
  if (event.target.checked) {
    selectedIcons.value = filteredIcons.value.map(icon => icon.id);
  } else {
    selectedIcons.value = [];
  }
};

const clearSelection = () => {
  selectedIcons.value = [];
};

// Bulk edit
const bulkEditForm = ref({
  name: '',
  category: '',
  agencyId: undefined,
  description: ''
});

const saveBulkEdit = async () => {
  try {
    error.value = '';
    const updateData = {};
    if (bulkEditForm.value.name && bulkEditForm.value.name.trim()) {
      updateData.name = bulkEditForm.value.name.trim();
    }
    if (bulkEditForm.value.category !== undefined) {
      updateData.category = bulkEditForm.value.category || null;
    }
    if (bulkEditForm.value.agencyId !== undefined) {
      updateData.agencyId = bulkEditForm.value.agencyId || null;
    }
    if (bulkEditForm.value.description !== undefined) {
      updateData.description = bulkEditForm.value.description || null;
    }

    if (Object.keys(updateData).length === 0) {
      error.value = 'Please provide at least one field to update';
      return;
    }

    await api.put('/icons/bulk-edit', {
      iconIds: selectedIcons.value,
      ...updateData
    });

    showBulkEditModal.value = false;
    bulkEditForm.value = { name: '', category: '', agencyId: undefined, description: '' };
    clearSelection();
    fetchIcons();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update icons';
  }
};

// Bulk delete
const confirmBulkDelete = async () => {
  try {
    error.value = '';
    // Use POST method for DELETE with body (some servers don't support DELETE with body)
    await api.post('/icons/bulk-delete', {
      iconIds: selectedIcons.value
    });

    showBulkDeleteConfirm.value = false;
    clearSelection();
    fetchIcons();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete icons';
    showBulkDeleteConfirm.value = false;
  }
};

const closeUploadModal = () => {
  showUploadModal.value = false;
  editingIcon.value = null;
  modalError.value = '';
  iconForm.value = {
    name: '',
    category: '',
    description: '',
    agencyId: authStore.user?.role === 'super_admin' ? null : (availableAgencies.value.length > 0 ? availableAgencies.value[0].id : null)
  };
  selectedFile.value = null;
  previewFile.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const handleIconError = (event) => {
  // Hide broken image
  if (event && event.target) {
    event.target.style.display = 'none';
  }
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const handleBulkFileSelect = (event) => {
  const files = Array.from(event.target.files || []);
  selectedBulkFiles.value = files;
  bulkUploadError.value = '';
};

const prepareBulkIcons = async () => {
  if (selectedBulkFiles.value.length === 0) {
    bulkUploadError.value = 'Please select at least one icon file';
    return;
  }
  
  // Get the next available icon number
  const nextIconNumber = await getNextIconNumber();
  
  // Set default agency from form or first available agency
  defaultAgencyId.value = bulkUploadForm.value.agencyId !== null && bulkUploadForm.value.agencyId !== undefined 
    ? bulkUploadForm.value.agencyId 
    : (authStore.user?.role === 'super_admin' ? null : (availableAgencies.value.length > 0 ? availableAgencies.value[0].id : null));
  defaultCategory.value = bulkUploadForm.value.category || '';
  
  // Prepare icon data with previews
  bulkIconsData.value = await Promise.all(
    selectedBulkFiles.value.map((file, index) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
          resolve({
            file: file,
            fileName: file.name,
            preview: e.target.result,
            name: baseName || `Icon ${nextIconNumber + index}`,
            description: '',
            category: defaultCategory.value,
            agencyId: defaultAgencyId.value,
            hasCustomAgency: false, // Track if user manually changed this
            hasCustomCategory: false, // Track if user manually changed this
            uploaded: false, // Track if successfully uploaded
            uploading: false, // Track if currently uploading
            hasError: false, // Track if upload failed
            errorMessage: '' // Store error message
          });
        };
        reader.readAsDataURL(file);
      });
    })
  );
  
  bulkIconsReady.value = true;
  bulkUploadError.value = '';
};

const applyDefaultAgency = () => {
  // Apply default agency to all icons that haven't been individually customized
  bulkIconsData.value.forEach(icon => {
    if (!icon.hasCustomAgency) {
      icon.agencyId = defaultAgencyId.value;
    }
  });
};

const applyDefaultCategory = () => {
  // Apply default category to all icons that haven't been individually customized
  bulkIconsData.value.forEach(icon => {
    if (!icon.hasCustomCategory) {
      icon.category = defaultCategory.value;
    }
  });
};

const getNextIconNumber = async () => {
  try {
    // Get all icons to find the highest number
    const response = await api.get('/icons');
    const allIcons = response.data || [];
    
    // Find icons with names like "Icon 1", "Icon 2", etc.
    const iconNumbers = allIcons
      .map(icon => {
        const match = icon.name.match(/^Icon\s+(\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => num > 0);
    
    return iconNumbers.length > 0 ? Math.max(...iconNumbers) : 0;
  } catch (err) {
    console.error('Error getting next icon number:', err);
    return 0;
  }
};

const getAgencyName = (agencyId) => {
  if (!agencyId) return 'Platform';
  const agency = availableAgencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : 'Unknown';
};

const visibleBulkIcons = computed(() => {
  // Only show icons that haven't been successfully uploaded
  return bulkIconsData.value.filter(icon => !icon.uploaded && !icon.uploading);
});

const allIconsValid = computed(() => {
  return visibleBulkIcons.value.every(icon => icon.name && icon.name.trim() !== '');
});

const remainingIconsCount = computed(() => {
  return visibleBulkIcons.value.length;
});

const resetBulkUpload = () => {
  bulkIconsReady.value = false;
  bulkIconsData.value = [];
  defaultAgencyId.value = null;
  defaultCategory.value = '';
  uploadedIconIds.value.clear();
  failedIcons.value = [];
  bulkUploadError.value = '';
  bulkUploadResults.value = null;
};

const saveBulkIcons = async () => {
  if (!allIconsValid.value) {
    bulkUploadError.value = 'Please provide a title for all icons';
    return;
  }

  try {
    uploading.value = true;
    bulkUploadError.value = '';
    bulkUploadResults.value = null;

    const results = {
      successCount: 0,
      errorCount: 0,
      icons: [],
      errors: []
    };

    // Upload each visible icon individually with its metadata
    for (const iconData of visibleBulkIcons.value) {
      // Skip if already uploaded or currently uploading
      if (iconData.uploaded || iconData.uploading) {
        continue;
      }

      try {
        iconData.uploading = true;
        iconData.hasError = false;
        iconData.errorMessage = '';

        const formData = new FormData();
        formData.append('icon', iconData.file);
        formData.append('name', iconData.name.trim());
        if (iconData.description) {
          formData.append('description', iconData.description);
        }
        if (iconData.category) {
          formData.append('category', iconData.category);
        }
        if (iconData.agencyId !== null && iconData.agencyId !== undefined) {
          formData.append('agencyId', iconData.agencyId === null ? 'null' : String(iconData.agencyId));
        }

        const response = await api.post('/icons/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        // Mark as successfully uploaded
        iconData.uploaded = true;
        iconData.uploading = false;
        results.icons.push(response.data);
        results.successCount++;
        uploadedIconIds.value.add(iconData.fileName);
      } catch (err) {
        iconData.uploading = false;
        iconData.hasError = true;
        iconData.errorMessage = err.response?.data?.error?.message || 'Failed to upload icon';
        
        results.errors.push({
          file: iconData.fileName,
          error: iconData.errorMessage
        });
        results.errorCount++;
      }
    }

    bulkUploadResults.value = results;
    
    // Refresh icons if any were successfully uploaded
    if (results.successCount > 0) {
      await fetchIcons();
    }

    // Close modal if all icons are successfully uploaded
    if (remainingIconsCount.value === 0) {
      setTimeout(() => {
        closeBulkUploadModal();
      }, 1000);
    }
  } catch (err) {
    bulkUploadError.value = err.response?.data?.error?.message || 'Failed to upload icons';
  } finally {
    uploading.value = false;
  }
};

const closeBulkUploadModal = () => {
  showBulkUploadModal.value = false;
  bulkUploadError.value = '';
  bulkUploadResults.value = null;
  selectedBulkFiles.value = [];
  bulkIconsReady.value = false;
  bulkIconsData.value = [];
  defaultAgencyId.value = null;
  defaultCategory.value = '';
  uploadedIconIds.value.clear();
  failedIcons.value = [];
  bulkUploadForm.value = {
    category: '',
    description: '',
    agencyId: authStore.user?.role === 'super_admin' ? null : (availableAgencies.value.length > 0 ? availableAgencies.value[0].id : null)
  };
  if (bulkFileInput.value) {
    bulkFileInput.value.value = '';
  }
};

onMounted(async () => {
  // Fetch agencies
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies(); // Fetch all agencies for super admin
  } else {
    await agencyStore.fetchUserAgencies();
  }
  // Set default agency for form
  if (authStore.user?.role !== 'super_admin' && availableAgencies.value.length > 0) {
    iconForm.value.agencyId = availableAgencies.value[0].id;
  }
  await fetchIcons();
});
</script>

<style scoped>
.page-header {
  margin-bottom: 32px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 20px;
}

.page-header h1 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.page-description {
  color: var(--text-secondary);
  font-size: 15px;
  margin-bottom: 16px;
}

.header-actions {
  margin-top: 16px;
}

.library-controls {
  margin-bottom: 24px;
}

.search-controls {
  display: flex;
  gap: 12px;
}

.search-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 15px;
}

.category-filter,
.agency-filter,
.sort-filter {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 15px;
  min-width: 180px;
}

.form-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  margin-top: 8px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.icon-card {
  background: white;
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
}

.icon-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.icon-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px;
  background: var(--bg-alt);
  border-radius: 6px;
  min-height: 80px;
  max-height: 80px;
}

.icon-img {
  max-width: 100%;
  max-height: 56px;
  width: auto;
  height: auto;
  object-fit: contain;
}

.icon-info {
  flex: 1;
  min-width: 0;
}

.icon-info h3 {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-agency {
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-category {
  color: var(--primary);
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-description {
  color: var(--text-secondary);
  font-size: 11px;
  margin-bottom: 6px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.icon-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.icon-actions {
  display: flex;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.icon-actions .btn-sm {
  padding: 4px 8px;
  font-size: 11px;
  flex: 1;
}

.file-list {
  margin-top: 12px;
  padding: 12px;
  background: var(--background, #f5f5f5);
  border-radius: 4px;
  border: 1px solid var(--border, #e0e0e0);
}

.file-list ul {
  margin: 0;
  padding-left: 20px;
}

.upload-results {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
}

.upload-results .success-message {
  color: var(--success-color, #28a745);
  margin-bottom: 12px;
}

.upload-results .error-message {
  color: var(--error-color, #dc3545);
}

.upload-results ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 25px;
  color: var(--text-primary);
}

.file-preview {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  text-align: center;
}

.preview-img {
  max-width: 200px;
  max-height: 200px;
  object-fit: contain;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.empty-state {
  text-align: center;
  padding: 60px;
  color: var(--text-secondary);
  border: 1px dashed var(--border);
  border-radius: 12px;
  margin-top: 32px;
}
.bulk-upload-modal {
  max-width: 900px;
  max-height: 90vh;
  overflow-y: auto;
}

.bulk-upload-step {
  padding: 8px 0;
}

.step-description {
  margin-bottom: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.default-settings-section {
  margin-bottom: 32px;
  padding: 20px;
  background: #f0f4f8;
  border-radius: 8px;
  border: 2px solid var(--primary, #4CAF50);
}

.default-settings-section h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 18px;
}

.default-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 768px) {
  .default-settings-grid {
    grid-template-columns: 1fr;
  }
}

.selected-files-list {
  margin-top: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
}

.selected-files-list ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.selected-files-list li {
  margin: 4px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.bulk-icons-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin: 24px 0;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 8px;
}

.bulk-icon-item {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 24px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
  transition: opacity 0.3s ease;
}

.bulk-icon-item.icon-failed {
  border-color: #dc3545;
  border-width: 2px;
  background: #fff5f5;
}

.icon-error-message {
  padding: 12px;
  background: #fee;
  border: 1px solid #dc3545;
  border-radius: 6px;
  color: #dc3545;
  margin-bottom: 12px;
  font-size: 14px;
}

.icon-uploading-message {
  padding: 12px;
  background: #e3f2fd;
  border: 1px solid #2196f3;
  border-radius: 6px;
  color: #1976d2;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
}

.icon-success-message {
  padding: 12px;
  background: #e8f5e9;
  border: 1px solid #4caf50;
  border-radius: 6px;
  color: #2e7d32;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
}

.icon-preview-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.icon-preview-img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  background: white;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
}

.icon-filename {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  word-break: break-word;
  margin: 0;
}

.icon-form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-results {
  margin: 20px 0;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
}

.success-message {
  color: #28a745;
  font-weight: 500;
  margin-bottom: 12px;
}

.error-list {
  margin-top: 12px;
}

.error-list ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.error-list li {
  color: #dc3545;
  font-size: 14px;
  margin: 4px 0;
}

@media (max-width: 768px) {
  .bulk-icon-item {
    grid-template-columns: 1fr;
  }
  
  .icon-preview-section {
    align-items: flex-start;
  }
}
</style>

