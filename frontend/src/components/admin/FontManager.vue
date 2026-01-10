<template>
  <div class="font-manager">
    <div class="page-header">
      <h1>Font Library</h1>
      <p class="page-description">Upload and manage fonts that can be used throughout the system.</p>
      <div class="header-actions">
        <button @click="showUploadModal = true" class="btn btn-primary">Upload New Font</button>
      </div>
    </div>

    <div class="library-controls">
      <div class="search-controls">
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Search fonts..."
          class="search-input"
          @input="handleSearch"
        />
        <select v-model="selectedAgency" class="agency-filter" @change="handleFilterChange">
          <option value="">All Fonts</option>
          <option v-if="authStore.user?.role === 'super_admin'" value="null">Platform</option>
          <option v-for="agency in availableAgencies" :key="agency.id" :value="String(agency.id)">
            {{ agency.name }}
          </option>
        </select>
        <select v-model="selectedFamily" class="family-filter" @change="handleFilterChange">
          <option value="">All Families</option>
          <option v-for="family in fontFamilies" :key="family" :value="family">{{ family }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading fonts...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredFonts.length === 0" class="empty-state">
      <p>No fonts found. Upload your first font to get started.</p>
    </div>
    <div v-else class="font-grid">
      <div v-for="font in filteredFonts" :key="font.id" class="font-card">
        <div class="font-preview">
          <div class="font-sample" :style="{ fontFamily: font.family_name }">
            Aa Bb Cc
          </div>
          <p class="font-name">{{ font.name }}</p>
          <p class="font-family">{{ font.family_name }}</p>
        </div>
        <div class="font-info">
          <p v-if="font.agency_name" class="font-agency">Agency: {{ font.agency_name }}</p>
          <p v-else class="font-agency">Platform Font</p>
          <p class="font-type">{{ font.file_type.toUpperCase() }}</p>
        </div>
        <div class="font-actions">
          <button @click="editFont(font)" class="btn btn-primary btn-sm">Edit</button>
          <button @click="deleteFont(font.id)" class="btn btn-danger btn-sm">Delete</button>
        </div>
      </div>
    </div>

    <!-- Upload Modal -->
    <div v-if="showUploadModal" class="modal-overlay" @click="closeUploadModal">
      <div class="modal-content" @click.stop>
        <h2>{{ editingFont ? 'Edit Font' : 'Upload New Font' }}</h2>
        <form @submit.prevent="saveFont">
          <div class="form-group">
            <label>Font File <span v-if="!editingFont">*</span></label>
            <input
              ref="fileInput"
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              @change="handleFileSelect"
            />
            <p class="form-help">
              <span v-if="editingFont">Optional: Select a new file to replace the current font</span>
              <span v-else>WOFF2, WOFF, TTF, or OTF (max 5MB)</span>
            </p>
            <div v-if="editingFont && !previewFile" class="current-font-preview">
              <p style="margin-bottom: 8px; font-weight: 600;">Current Font:</p>
              <div class="font-sample" :style="{ fontFamily: editingFont.family_name }">
                Aa Bb Cc 123
              </div>
              <p style="margin-top: 8px; font-size: 12px;">{{ editingFont.name }} ({{ editingFont.family_name }})</p>
            </div>
          </div>
          <div class="form-group">
            <label>Font Name *</label>
            <input v-model="fontForm.name" type="text" required placeholder="e.g., Comfortaa Regular" />
            <small class="form-help">Display name for this font file (e.g., "Comfortaa Regular", "Montserrat Bold")</small>
          </div>
          <div class="form-group">
            <label>Font Family Name *</label>
            <input 
              v-model="fontForm.familyName" 
              type="text" 
              required
              placeholder="e.g., Comfortaa"
              list="family-list"
              @input="handleFamilyInput"
            />
            <datalist id="family-list">
              <option v-for="family in fontFamilies" :key="family" :value="family">{{ family }}</option>
            </datalist>
            <small class="form-help">CSS font-family name. Multiple font files can share the same family name (e.g., "Comfortaa Regular" and "Comfortaa Bold" both use "Comfortaa")</small>
          </div>
          <div class="form-group">
            <label>Assign to Agency</label>
            <select 
              v-model.number="fontForm.agencyId" 
              class="form-select" 
              :disabled="availableAgencies.length === 0 || authStore.user?.role !== 'super_admin'"
            >
              <option :value="null">Platform (Default)</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="Number(agency.id)">
                {{ agency.name }}
              </option>
            </select>
            <small class="form-help">Platform fonts are available to all agencies. Agency fonts are only available to that agency.</small>
          </div>
          <div v-if="modalError" class="error-message">{{ modalError }}</div>
          <div class="modal-actions">
            <button type="button" @click="closeUploadModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="uploading || !fontForm.name || !fontForm.familyName">
              {{ uploading ? (editingFont ? 'Updating...' : 'Uploading...') : 'Save' }}
            </button>
          </div>
        </form>
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

const loading = ref(false);
const error = ref('');
const fonts = ref([]);
const searchTerm = ref('');
const selectedAgency = ref('');
const selectedFamily = ref('');
const showUploadModal = ref(false);
const editingFont = ref(null);
const uploading = ref(false);
const modalError = ref('');
const previewFile = ref(null);
const fileInput = ref(null);
const availableAgencies = ref([]);

const fontForm = ref({
  name: '',
  familyName: '',
  agencyId: null
});

const fontFamilies = computed(() => {
  const families = new Set();
  fonts.value.forEach(font => {
    if (font.family_name) {
      families.add(font.family_name);
    }
  });
  return Array.from(families).sort();
});

const filteredFonts = computed(() => {
  let filtered = fonts.value;

  // Filter by agency
  if (selectedAgency.value) {
    if (selectedAgency.value === 'null') {
      filtered = filtered.filter(f => f.agency_id === null);
    } else {
      const agencyId = parseInt(selectedAgency.value);
      filtered = filtered.filter(f => f.agency_id === agencyId);
    }
  }

  // Filter by family
  if (selectedFamily.value) {
    filtered = filtered.filter(f => f.family_name === selectedFamily.value);
  }

  // Filter by search term
  if (searchTerm.value) {
    const term = searchTerm.value.toLowerCase();
    filtered = filtered.filter(f => 
      f.name.toLowerCase().includes(term) || 
      f.family_name.toLowerCase().includes(term)
    );
  }

  return filtered.sort((a, b) => {
    if (a.family_name !== b.family_name) {
      return a.family_name.localeCompare(b.family_name);
    }
    return a.name.localeCompare(b.name);
  });
});

const fetchFonts = async () => {
  try {
    loading.value = true;
    error.value = '';
    const params = {};
    
    if (authStore.user?.role === 'admin' && authStore.user?.agency_id) {
      // Admins see their agency fonts + platform fonts
      // Don't filter - let them see all available
    }
    
    const response = await api.get('/fonts', { params });
    fonts.value = response.data || [];
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load fonts';
  } finally {
    loading.value = false;
  }
};

const fetchAgencies = async () => {
  try {
    await agencyStore.fetchAgencies();
    if (authStore.user?.role === 'super_admin') {
      availableAgencies.value = agencyStore.agencies || [];
    } else if (authStore.user?.role === 'admin' && authStore.user?.agency_id) {
      const agency = agencyStore.userAgencies?.find(a => a.id === authStore.user.agency_id);
      if (agency) {
        availableAgencies.value = [agency];
      }
    }
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const handleSearch = () => {
  // Search is handled by computed property
};

const handleFilterChange = () => {
  // Filtering is handled by computed property
};

const handleFileSelect = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    // Validate file type
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
      modalError.value = 'Invalid file type. Please select a WOFF2, WOFF, TTF, or OTF file.';
      return;
    }
    
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      modalError.value = 'File size exceeds 5MB limit.';
      return;
    }
    
    modalError.value = '';
    previewFile.value = null; // Fonts can't be previewed as images
  }
};

const handleFamilyInput = () => {
  // Auto-capitalize first letter
  if (fontForm.value.familyName && fontForm.value.familyName.length > 0) {
    fontForm.value.familyName = fontForm.value.familyName.charAt(0).toUpperCase() + fontForm.value.familyName.slice(1);
  }
};

const editFont = (font) => {
  editingFont.value = font;
  fontForm.value = {
    name: font.name,
    familyName: font.family_name,
    agencyId: font.agency_id
  };
  previewFile.value = null;
  showUploadModal.value = true;
};

const deleteFont = async (fontId) => {
  if (!confirm('Are you sure you want to delete this font? This action cannot be undone.')) {
    return;
  }

  try {
    await api.delete(`/fonts/${fontId}`);
    await fetchFonts();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to delete font';
  }
};

const saveFont = async () => {
  try {
    uploading.value = true;
    modalError.value = '';

    if (!editingFont.value && !fileInput.value?.files?.[0]) {
      modalError.value = 'Please select a font file to upload.';
      return;
    }

    const formData = new FormData();
    formData.append('name', fontForm.value.name.trim());
    formData.append('familyName', fontForm.value.familyName.trim());
    
    if (authStore.user?.role === 'super_admin') {
      formData.append('agencyId', fontForm.value.agencyId === null ? 'null' : String(fontForm.value.agencyId));
    } else if (authStore.user?.role === 'admin') {
      formData.append('agencyId', authStore.user.agency_id || 'null');
    }

    if (editingFont.value) {
      // Update existing font
      if (fileInput.value?.files?.[0]) {
        formData.append('fontFile', fileInput.value.files[0]);
      }
      await api.put(`/fonts/${editingFont.value.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } else {
      // Create new font
      formData.append('fontFile', fileInput.value.files[0]);
      await api.post('/fonts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }

    await fetchFonts();
    closeUploadModal();
  } catch (err) {
    modalError.value = err.response?.data?.error?.message || 'Failed to save font';
  } finally {
    uploading.value = false;
  }
};

const closeUploadModal = () => {
  showUploadModal.value = false;
  editingFont.value = null;
  fontForm.value = {
    name: '',
    familyName: '',
    agencyId: null
  };
  previewFile.value = null;
  modalError.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

onMounted(async () => {
  await fetchAgencies();
  await fetchFonts();
});
</script>

<style scoped>
.font-manager {
  padding: 24px;
}

.page-header {
  margin-bottom: 24px;
}

.page-description {
  color: var(--text-secondary);
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
  flex-wrap: wrap;
}

.search-input,
.agency-filter,
.family-filter {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.font-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.font-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow);
}

.font-preview {
  text-align: center;
  margin-bottom: 12px;
}

.font-sample {
  font-size: 32px;
  font-weight: 400;
  margin-bottom: 8px;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.font-name {
  font-weight: 600;
  margin: 8px 0 4px;
}

.font-family {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

.font-info {
  margin: 12px 0;
  font-size: 13px;
}

.font-agency,
.font-type {
  margin: 4px 0;
  color: var(--text-secondary);
}

.font-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.current-font-preview {
  margin-top: 12px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 4px;
  text-align: center;
}

.error-message {
  color: var(--error);
  margin: 12px 0;
  padding: 8px;
  background: #fee;
  border-radius: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}
</style>
