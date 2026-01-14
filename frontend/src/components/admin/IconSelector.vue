<template>
  <div class="icon-selector" @click.stop>
    <div class="icon-selector-content">
      <div v-if="selectedIcon" class="selected-icon-preview">
        <img :src="getIconUrl(selectedIcon)" :alt="selectedIcon.name" class="icon-preview-img" @error="handleIconError" />
        <span class="icon-name">{{ selectedIcon.name }}</span>
        <button @click.stop="clearIcon" class="btn-remove-icon" title="Remove icon">×</button>
      </div>
      <div v-else class="icon-placeholder">
        <div class="icon-placeholder-icon">📎</div>
        <span class="icon-placeholder-text">No icon selected</span>
      </div>
      <button @click.stop.prevent="handleOpenModal" class="btn btn-secondary btn-sm">
        {{ selectedIcon ? 'Change Icon' : 'Select Icon' }}
      </button>
    </div>

    <!-- Icon Selection Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content large" @click.stop>
        <div class="modal-header">
          <h3>Select Icon</h3>
          <button @click="closeModal" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <div class="icon-search">
            <input
              v-model="searchTerm"
              type="text"
              placeholder="Search icons..."
              class="search-input"
              @input="handleSearch"
            />
            <select v-model="selectedAgency" class="agency-filter" @change="handleFilterChange">
              <option value="">All Agencies</option>
              <option value="null">Platform</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
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
          <div v-if="loading" class="loading">Loading icons...</div>
          <div v-else-if="filteredIcons.length === 0" class="empty-state">
            No icons found. {{ authStore.user?.role === 'super_admin' ? 'Upload icons in the Icon Library.' : '' }}
          </div>
          <div v-else class="icon-grid">
            <div
              v-for="icon in filteredIcons"
              :key="icon.id"
              :class="['icon-item', { selected: tempSelectedIcon?.id === icon.id || (props.modelValue && icon.id === props.modelValue) }]"
              @click="selectIcon(icon)"
            >
              <img :src="getIconUrl(icon)" :alt="icon.name" class="icon-img" />
              <span class="icon-label">{{ icon.name }}</span>
            </div>
          </div>
          <!-- Show selected icon even if not in filtered list -->
          <div v-if="props.modelValue && !filteredIcons.find(i => i.id === props.modelValue) && selectedIcon" class="icon-item selected" style="border: 2px solid var(--primary);">
            <img :src="getIconUrl(selectedIcon)" :alt="selectedIcon.name" class="icon-img" />
            <span class="icon-label">{{ selectedIcon.name }}</span>
            <small style="color: var(--text-secondary); font-size: 11px;">Currently Selected</small>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeModal" class="btn btn-secondary">Cancel</button>
          <button @click="confirmSelection" class="btn btn-primary" :disabled="!tempSelectedIcon">
            Select
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
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  modelValue: {
    type: Number,
    default: null
  }
});

const emit = defineEmits(['update:modelValue']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const icons = ref([]);
const loading = ref(false);
const showModal = ref(false);
const searchTerm = ref('');
const selectedCategory = ref('');
const selectedAgency = ref('');
const sortBy = ref('name');
const tempSelectedIcon = ref(null);
const selectedIcon = ref(null);

const availableAgencies = computed(() => {
  if (authStore.user?.role === 'super_admin') {
    return agencyStore.agencies || [];
  }
  return agencyStore.userAgencies || [];
});

const categories = computed(() => {
  const cats = new Set(icons.value.map(i => i.category).filter(Boolean));
  return Array.from(cats).sort();
});

const filteredIcons = computed(() => {
  return icons.value; // Filtering is now done on the backend
});

const getIconUrl = (icon) => {
  if (!icon) return '';
  // Use the URL from the icon if available
  let iconUrl = icon.url;
  if (!iconUrl && icon.file_path) {
    // Normalize file_path to avoid "/uploads/uploads/..." and similar
    let fp = icon.file_path;
    if (fp.startsWith('/')) fp = fp.slice(1);
    if (fp.startsWith('uploads/')) fp = fp.substring('uploads/'.length);
    iconUrl = toUploadsUrl(fp);
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

const handleSearch = () => {
  // Debounce search
  clearTimeout(searchTimeout.value);
  searchTimeout.value = setTimeout(() => {
    fetchIcons();
  }, 300);
};

const handleFilterChange = () => {
  fetchIcons();
};

const searchTimeout = ref(null);

const fetchIcons = async () => {
  try {
    loading.value = true;
    const params = new URLSearchParams();
    params.append('includePlatform', 'true'); // Always include platform icons in IconSelector so admins can select them
    if (searchTerm.value) {
      params.append('search', searchTerm.value);
    }
    if (selectedCategory.value) {
      params.append('category', selectedCategory.value);
    }
    // Handle agency filtering:
    // - Empty string = "All Agencies" = don't pass agencyId (shows all)
    // - "null" = "Platform" = pass "null" to get only platform icons
    // - Agency ID = pass the ID to get only that agency's icons
    if (selectedAgency.value === 'null') {
      params.append('agencyId', 'null');
    } else if (selectedAgency.value && selectedAgency.value !== '') {
      params.append('agencyId', selectedAgency.value);
    }
    // If selectedAgency.value is empty string, don't pass agencyId at all
    params.append('sortBy', sortBy.value);
    params.append('sortOrder', 'asc');
    
    console.log('IconSelector: Fetching icons with params:', {
      selectedAgency: selectedAgency.value,
      agencyIdParam: selectedAgency.value === 'null' ? 'null' : (selectedAgency.value && selectedAgency.value !== '' ? selectedAgency.value : 'not passed'),
      fullParams: params.toString()
    });
    
    const response = await api.get(`/icons?${params.toString()}`);
    icons.value = response.data;
    
    console.log('IconSelector: Received icons:', icons.value.length, 'icons');
    if (selectedAgency.value && selectedAgency.value !== '' && selectedAgency.value !== 'null') {
      console.log('IconSelector: Agency filter active, icons with agency_id:', icons.value.filter(i => i.agency_id === parseInt(selectedAgency.value)).length);
      console.log('IconSelector: Platform icons (agency_id null):', icons.value.filter(i => i.agency_id === null).length);
    }
    
    // After fetching, try to find the selected icon if modelValue is set
    // But don't add it to the list if it doesn't match the current filter
    if (props.modelValue && !selectedIcon.value) {
      const foundIcon = icons.value.find(i => i.id === props.modelValue);
      if (foundIcon) {
        selectedIcon.value = foundIcon;
        tempSelectedIcon.value = foundIcon;
      } else if (props.modelValue) {
        // Icon not in filtered list, fetch it individually for display purposes only
        // Don't add it to the main icons list if it doesn't match the current filter
        try {
          const iconResponse = await api.get(`/icons/${props.modelValue}`);
          if (iconResponse.data) {
            selectedIcon.value = iconResponse.data;
            tempSelectedIcon.value = iconResponse.data;
            // Only add to icons list if it matches the current filter
            const matchesFilter = 
              (!selectedAgency.value || selectedAgency.value === '') || // All agencies selected
              (selectedAgency.value === 'null' && iconResponse.data.agency_id === null) || // Platform selected and icon is platform
              (selectedAgency.value && selectedAgency.value !== 'null' && iconResponse.data.agency_id === parseInt(selectedAgency.value)); // Agency selected and icon matches
            
            if (matchesFilter && !icons.value.find(i => i.id === iconResponse.data.id)) {
              icons.value.push(iconResponse.data);
            }
          }
        } catch (err) {
          console.error('Failed to fetch selected icon:', err);
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch icons:', err);
  } finally {
    loading.value = false;
  }
};

const selectIcon = (icon) => {
  tempSelectedIcon.value = icon;
};

const confirmSelection = () => {
  if (tempSelectedIcon.value) {
    selectedIcon.value = tempSelectedIcon.value;
    console.log('IconSelector: Confirming selection, emitting iconId:', tempSelectedIcon.value.id);
    emit('update:modelValue', tempSelectedIcon.value.id);
    closeModal();
  }
};

const clearIcon = () => {
  selectedIcon.value = null;
  tempSelectedIcon.value = null;
  emit('update:modelValue', null);
};

const handleIconError = (event) => {
  console.error('IconSelector: Failed to load icon image:', event.target.src);
  event.target.style.display = 'none';
};

const handleOpenModal = async (event) => {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  // Reset filters when opening modal to show all icons
  selectedAgency.value = '';
  selectedCategory.value = '';
  searchTerm.value = '';
  sortBy.value = 'name';
  // Fetch icons with no filters to show all available
  await fetchIcons();
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  tempSelectedIcon.value = selectedIcon.value;
  searchTerm.value = '';
  selectedCategory.value = '';
  selectedAgency.value = '';
  sortBy.value = 'name';
};

watch(() => props.modelValue, async (newValue) => {
  console.log('IconSelector: modelValue changed to:', newValue);
  if (newValue && icons.value.length > 0) {
    const foundIcon = icons.value.find(i => i.id === newValue);
    if (foundIcon) {
      console.log('IconSelector: Found icon in list:', foundIcon);
      selectedIcon.value = foundIcon;
      tempSelectedIcon.value = foundIcon;
    } else {
      // Icon not in current list, try to fetch it for display purposes
      console.log('IconSelector: Icon not in list, fetching individually...');
      try {
        const iconResponse = await api.get(`/icons/${newValue}`);
        if (iconResponse.data) {
          console.log('IconSelector: Fetched icon:', iconResponse.data);
          selectedIcon.value = iconResponse.data;
          tempSelectedIcon.value = iconResponse.data;
          // Only add to icons list if it matches the current filter
          const matchesFilter = 
            (!selectedAgency.value || selectedAgency.value === '') || // All agencies selected
            (selectedAgency.value === 'null' && iconResponse.data.agency_id === null) || // Platform selected and icon is platform
            (selectedAgency.value && selectedAgency.value !== 'null' && iconResponse.data.agency_id === parseInt(selectedAgency.value)); // Agency selected and icon matches
          
          if (matchesFilter && !icons.value.find(i => i.id === iconResponse.data.id)) {
            icons.value.push(iconResponse.data);
          }
        }
      } catch (err) {
        console.error('IconSelector: Failed to fetch icon:', err);
        selectedIcon.value = null;
        tempSelectedIcon.value = null;
      }
    }
  } else if (!newValue) {
    console.log('IconSelector: modelValue is null/undefined, clearing selection');
    selectedIcon.value = null;
    tempSelectedIcon.value = null;
  }
}, { immediate: true });

watch(() => icons.value, (newIcons) => {
  // When icons are loaded, try to find the selected one
  if (props.modelValue && newIcons.length > 0) {
    const foundIcon = newIcons.find(i => i.id === props.modelValue);
    if (foundIcon) {
      selectedIcon.value = foundIcon;
      tempSelectedIcon.value = foundIcon;
    }
  }
}, { immediate: true });

onMounted(async () => {
  // Fetch agencies if needed
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies(); // Fetch all agencies for super admin
  } else {
    await agencyStore.fetchUserAgencies();
  }
  await fetchIcons();
  // After icons are loaded, set the selected icon
  if (props.modelValue) {
    const foundIcon = icons.value.find(i => i.id === props.modelValue);
    if (foundIcon) {
      selectedIcon.value = foundIcon;
      tempSelectedIcon.value = foundIcon;
    }
  }
});
</script>

<style scoped>
.icon-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon-selector-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.selected-icon-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  min-height: 40px;
}

.icon-placeholder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-alt);
  border: 2px dashed var(--border);
  border-radius: 6px;
  min-height: 40px;
  min-width: 150px;
}

.icon-placeholder-icon {
  font-size: 20px;
  opacity: 0.5;
}

.icon-placeholder-text {
  font-size: 14px;
  color: var(--text-secondary);
  font-style: italic;
}

.icon-preview-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.icon-name {
  font-size: 14px;
  color: var(--text-secondary);
}

.btn-remove-icon {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--error);
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.btn-remove-icon:hover {
  color: var(--error);
  opacity: 0.8;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.modal-content.large {
  width: 85%;
  max-width: 700px;
  max-height: 85vh;
  background: white;
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.btn-close:hover {
  color: var(--text-primary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.icon-search {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.agency-filter,
.sort-filter {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  min-width: 150px;
}

.search-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 15px;
}

.category-filter {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 15px;
  min-width: 180px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
  min-height: 140px;
}

.icon-item:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.icon-item.selected {
  border-color: var(--primary);
  background: var(--bg-alt);
}

.icon-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  margin-bottom: 6px;
  background: var(--bg-alt);
  padding: 6px;
  border-radius: 4px;
}

.icon-label {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  word-break: break-word;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .icon-search {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .modal-content.large {
    width: 95%;
    max-height: 90vh;
  }
  
  .icon-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
  }
  
  .icon-item {
    min-height: 100px;
    padding: 8px;
  }
  
  .icon-img {
    width: 40px;
    height: 40px;
  }
}
</style>

