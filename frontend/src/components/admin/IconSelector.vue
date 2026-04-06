<template>
  <div class="icon-selector" @click.stop>
    <div class="icon-selector-content">
      <div v-if="selectedIcon" class="selected-icon-preview">
        <img :src="getIconUrl(selectedIcon)" :alt="selectedIcon.name" class="icon-preview-img" @error="handleIconError" />
        <span class="icon-name">{{ selectedIcon.name }}</span>
        <button
          type="button"
          class="btn btn-secondary btn-xs"
          @click.stop="openIconPreview"
          title="Open icon in a new tab"
        >
          View
        </button>
        <button @click.stop="clearIcon" class="btn-remove-icon" title="Remove icon">×</button>
        <div class="icon-hover-preview" aria-hidden="true">
          <img :src="getIconUrl(selectedIcon)" alt="" />
        </div>
      </div>
      <div v-else-if="props.modelValue && selectedIconLoading" class="icon-placeholder">
        <div class="icon-placeholder-icon">⏳</div>
        <span class="icon-placeholder-text">Loading selected icon…</span>
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
          <div v-if="useSummitClubIcons" class="club-icon-upload-row">
            <label class="upload-label">Upload a club icon</label>
            <input
              type="file"
              accept="image/svg+xml,image/png,image/jpeg,image/jpg"
              class="club-icon-file"
              :disabled="uploadingClubIcon"
              @change="onUploadClubIcon"
            />
            <span v-if="uploadingClubIcon" class="upload-status">Uploading…</span>
            <span v-if="uploadClubIconError" class="upload-error">{{ uploadClubIconError }}</span>
          </div>
          <div class="icon-search">
            <input
              v-model="searchTerm"
              type="text"
              placeholder="Search icons..."
              class="search-input"
              @input="handleSearch"
            />
            <!-- SSC mode: activity type + sub-category filters -->
            <template v-if="useSummitClubIcons">
              <select v-model="summitActivityType" class="category-filter" @change="handleSummitFilterChange">
                <option value="">All Activity Types</option>
                <option value="Running">Running</option>
                <option value="Rucking">Rucking</option>
                <option value="General Fitness">General Fitness</option>
              </select>
              <select v-model="summitSubCategory" class="category-filter" @change="handleSummitFilterChange">
                <option value="">All Sub-categories</option>
                <option value="Challenge">Challenge</option>
                <option value="Award">Award</option>
              </select>
              <select v-model="summitSort" class="sort-filter" aria-label="Sort icons">
                <option value="source">Sort: club → tenant → platform</option>
                <option value="name">Sort by name (A–Z)</option>
              </select>
            </template>
            <!-- Standard admin mode filters -->
            <template v-else>
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
            </template>
          </div>
          <div v-if="loading" class="loading">Loading icons...</div>
          <div v-else-if="filteredIcons.length === 0" class="empty-state">
            No icons found.
            <template v-if="useSummitClubIcons"> Upload an icon above, or pick from the platform library when icons are available.</template>
            <template v-else-if="authStore.user?.role === 'super_admin'"> Upload icons in the Icon Library.</template>
          </div>
          <div v-else class="icon-grid">
            <div
              v-for="icon in filteredIcons"
              :key="icon.id"
              :class="['icon-item', { selected: tempSelectedIcon?.id === icon.id || (props.modelValue && icon.id === props.modelValue) }]"
              @click="selectIcon(icon)"
            >
              <img :src="getIconUrl(icon)" :alt="icon.name" class="icon-img" />
              <span v-if="useSummitClubIcons && icon.scope" class="icon-scope-badge">{{ summitScopeLabel(icon) }}</span>
              <span class="icon-label">{{ icon.name }}</span>
              <span v-if="useSummitClubIcons && icon.activityType" class="icon-meta-badge">{{ icon.activityType }}</span>
              <span v-if="useSummitClubIcons && icon.subCategory" class="icon-meta-badge icon-meta-badge--sub">{{ icon.subCategory }}</span>
              <!-- Club Details inline edit (SSC mode) -->
              <div v-if="useSummitClubIcons" class="icon-club-details" @click.stop>
                <input
                  :value="clubDetailsMap[icon.id] ?? icon.clubDetails ?? ''"
                  type="text"
                  class="icon-club-details-input"
                  placeholder="Club notes…"
                  maxlength="500"
                  @input="onClubDetailsInput(icon, $event.target.value)"
                  @blur="saveClubDetails(icon)"
                />
              </div>
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
import { getBackendBaseUrl, toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  modelValue: {
    type: Number,
    default: null
  },
  defaultAgencyId: {
    type: [Number, String],
    default: null
  },
  /** When set, load icons from Summit club API (club managers) instead of global /icons (admin-only list). */
  summitStatsClubId: {
    type: [Number, String],
    default: null
  },
  /**
   * A unique string used to key sessionStorage state for this picker instance.
   * e.g. "recognition-${clubId}", "club-settings-${clubId}".
   * Defaults to "summitStatsClubId" or "admin" if not provided.
   */
  context: {
    type: String,
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
const selectedIconLoading = ref(false);
const uploadingClubIcon = ref(false);
const uploadClubIconError = ref('');
/** Summit picker: preserve server order (club, tenant, platform) or sort A–Z only */
const summitSort = ref('source');
/** SSC mode: activity type filter */
const summitActivityType = ref('');
/** SSC mode: sub-category filter */
const summitSubCategory = ref('');
/** SSC mode: per-icon club details edits (iconId -> string) */
const clubDetailsMap = ref({});
/** SSC mode: debounce timer for club details saves */
const clubDetailsTimers = ref({});

const SUMMIT_SCOPE_ORDER = { club: 0, tenant: 1, platform: 2 };

// ── sessionStorage state persistence ────────────────────────────

const storageKey = computed(() => {
  if (props.context) return `icon-picker-${props.context}`;
  const cid = parseInt(String(props.summitStatsClubId ?? ''), 10);
  if (Number.isFinite(cid) && cid > 0) return `icon-picker-club-${cid}`;
  return 'icon-picker-admin';
});

const savePickerState = () => {
  if (!useSummitClubIcons.value) return;
  try {
    sessionStorage.setItem(storageKey.value, JSON.stringify({
      search: searchTerm.value,
      activityType: summitActivityType.value,
      subCategory: summitSubCategory.value,
      summitSort: summitSort.value
    }));
  } catch { /**/ }
};

const restorePickerState = () => {
  if (!useSummitClubIcons.value) return;
  try {
    const raw = sessionStorage.getItem(storageKey.value);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (state.search !== undefined) searchTerm.value = state.search;
    if (state.activityType !== undefined) summitActivityType.value = state.activityType;
    if (state.subCategory !== undefined) summitSubCategory.value = state.subCategory;
    if (state.summitSort !== undefined) summitSort.value = state.summitSort;
  } catch { /**/ }
};

const clearPickerState = () => {
  try { sessionStorage.removeItem(storageKey.value); } catch { /**/ }
};

const availableAgencies = computed(() => {
  if (authStore.user?.role === 'super_admin') {
    return agencyStore.agencies || [];
  }
  return agencyStore.userAgencies || [];
});

const useSummitClubIcons = computed(() => {
  const n = parseInt(String(props.summitStatsClubId ?? ''), 10);
  return Number.isFinite(n) && n > 0;
});

const categories = computed(() => {
  const cats = new Set(icons.value.map(i => i.category).filter(Boolean));
  return Array.from(cats).sort();
});

const summitScopeLabel = (icon) => {
  const s = String(icon?.scope || 'platform').toLowerCase();
  if (s === 'club') return 'Club';
  if (s === 'tenant') return 'Tenant';
  return 'Platform';
};

const filteredIcons = computed(() => {
  if (!useSummitClubIcons.value) {
    return icons.value;
  }
  // In SSC mode, search and activity/sub-category filtering is server-side.
  // Only client-side sort is applied here.
  const out = [...icons.value];
  if (summitSort.value === 'name') {
    out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  } else {
    out.sort((a, b) => {
      const sa = SUMMIT_SCOPE_ORDER[String(a.scope || 'platform')] ?? 2;
      const sb = SUMMIT_SCOPE_ORDER[String(b.scope || 'platform')] ?? 2;
      if (sa !== sb) return sa - sb;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  }
  return out;
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
  const apiBase = getBackendBaseUrl();
  const cleanUrl = iconUrl.startsWith('/') ? iconUrl : `/${iconUrl}`;
  return `${apiBase}${cleanUrl}`;
};

const handleSearch = () => {
  if (useSummitClubIcons.value) {
    savePickerState();
    clearTimeout(searchTimeout.value);
    searchTimeout.value = setTimeout(() => fetchIcons(), 300);
    return;
  }
  clearTimeout(searchTimeout.value);
  searchTimeout.value = setTimeout(() => {
    fetchIcons();
  }, 300);
};

const handleFilterChange = () => {
  if (useSummitClubIcons.value) {
    return;
  }
  fetchIcons();
};

const handleSummitFilterChange = () => {
  savePickerState();
  fetchIcons();
};

const searchTimeout = ref(null);

const applyDefaultAgencyFilterIfProvided = () => {
  const raw = props.defaultAgencyId;
  const id = raw === null || raw === undefined || raw === '' ? null : parseInt(String(raw), 10);
  if (id && !Number.isNaN(id)) selectedAgency.value = String(id);
  else selectedAgency.value = '';
};

const ensureAgenciesLoaded = async () => {
  // Avoid loading *all icons* (and agencies) for every IconSelector instance on page load.
  // Only load agency lists when the modal is actually opened.
  try {
    if (authStore.user?.role === 'super_admin') {
      if (!Array.isArray(agencyStore.agencies) || agencyStore.agencies.length === 0) {
        await agencyStore.fetchAgencies();
      }
    } else {
      if (!Array.isArray(agencyStore.userAgencies) || agencyStore.userAgencies.length === 0) {
        await agencyStore.fetchUserAgencies();
      }
    }
  } catch {
    // ignore
  }
};

const fetchIcons = async () => {
  try {
    loading.value = true;
    if (useSummitClubIcons.value) {
      const cid = parseInt(String(props.summitStatsClubId), 10);
      const ssParams = new URLSearchParams();
      if (searchTerm.value.trim()) ssParams.set('search', searchTerm.value.trim());
      if (summitActivityType.value) ssParams.set('activityType', summitActivityType.value);
      if (summitSubCategory.value) ssParams.set('subCategory', summitSubCategory.value);
      const qs = ssParams.toString();
      const response = await api.get(`/summit-stats/clubs/${cid}/icons${qs ? `?${qs}` : ''}`);
      const raw = response.data?.icons || [];
      icons.value = raw.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category || null,
        activityType: i.activityType || null,
        subCategory: i.subCategory || null,
        description: i.description || null,
        clubDetails: i.clubDetails || null,
        url: i.url,
        file_path: i.url || null,
        agency_id: i.agency_id ?? null,
        scope: i.scope || 'platform'
      }));
      if (props.modelValue && !selectedIcon.value) {
        const foundIcon = icons.value.find((i) => i.id === props.modelValue);
        if (foundIcon) {
          selectedIcon.value = foundIcon;
          tempSelectedIcon.value = foundIcon;
        } else if (props.modelValue) {
          try {
            const iconResponse = await api.get(`/icons/${props.modelValue}`);
            if (iconResponse.data) {
              selectedIcon.value = iconResponse.data;
              tempSelectedIcon.value = iconResponse.data;
            }
          } catch (err) {
            console.error('Failed to fetch selected icon:', err);
          }
        }
      }
      return;
    }

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

    const response = await api.get(`/icons?${params.toString()}`);
    icons.value = response.data;

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

const onUploadClubIcon = async (e) => {
  const input = e.target;
  const file = input?.files?.[0];
  if (input) input.value = '';
  if (!file || !useSummitClubIcons.value) return;
  const cid = parseInt(String(props.summitStatsClubId), 10);
  if (!Number.isFinite(cid) || cid < 1) return;
  uploadingClubIcon.value = true;
  uploadClubIconError.value = '';
  try {
    const fd = new FormData();
    fd.append('icon', file);
    const baseName = String(file.name || 'club-icon').replace(/\.[^.]+$/, '') || 'Club icon';
    fd.append('name', baseName.slice(0, 255));
    fd.append('agencyId', String(cid));
    const { data } = await api.post('/icons/upload', fd);
    await fetchIcons();
    if (data?.id) {
      const mapped = {
        id: data.id,
        name: data.name,
        category: data.category || null,
        url: data.url,
        file_path: data.file_path || data.url,
        agency_id: data.agency_id,
        scope: 'club'
      };
      tempSelectedIcon.value = mapped;
      selectedIcon.value = mapped;
      emit('update:modelValue', data.id);
    }
  } catch (err) {
    uploadClubIconError.value = err?.response?.data?.error?.message || err?.message || 'Upload failed';
  } finally {
    uploadingClubIcon.value = false;
  }
};

const selectIcon = (icon) => {
  tempSelectedIcon.value = icon;
};

const confirmSelection = () => {
  if (tempSelectedIcon.value) {
    selectedIcon.value = tempSelectedIcon.value;
    emit('update:modelValue', tempSelectedIcon.value.id);
    if (useSummitClubIcons.value) clearPickerState();
    closeModal();
  }
};

const clearIcon = () => {
  selectedIcon.value = null;
  tempSelectedIcon.value = null;
  emit('update:modelValue', null);
};

const openIconPreview = () => {
  if (!selectedIcon.value) return;
  const url = getIconUrl(selectedIcon.value);
  if (!url) return;
  window.open(url, '_blank', 'noopener');
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
  if (useSummitClubIcons.value) {
    // Restore previous search/filter state for SSC mode
    restorePickerState();
  } else {
    applyDefaultAgencyFilterIfProvided();
    selectedCategory.value = '';
    searchTerm.value = '';
    sortBy.value = 'name';
    await ensureAgenciesLoaded();
  }
  await fetchIcons();
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  tempSelectedIcon.value = selectedIcon.value;
  if (useSummitClubIcons.value) {
    savePickerState();
  } else {
    searchTerm.value = '';
    selectedCategory.value = '';
    selectedAgency.value = '';
    sortBy.value = 'name';
    summitSort.value = 'source';
  }
  uploadClubIconError.value = '';
};

watch(() => props.modelValue, async (newValue) => {
  if (!newValue) {
    selectedIcon.value = null;
    tempSelectedIcon.value = null;
    selectedIconLoading.value = false;
    return;
  }

  const foundIcon = icons.value.find(i => i.id === newValue);
  if (foundIcon) {
    selectedIcon.value = foundIcon;
    tempSelectedIcon.value = foundIcon;
    selectedIconLoading.value = false;
    return;
  }

  // Icon not in current list (or list not loaded); fetch it for preview.
  try {
    selectedIconLoading.value = true;
    const iconResponse = await api.get(`/icons/${newValue}`);
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
    } else {
      selectedIcon.value = null;
      tempSelectedIcon.value = null;
    }
  } catch (err) {
    console.error('IconSelector: Failed to fetch icon:', err);
    selectedIcon.value = null;
    tempSelectedIcon.value = null;
  } finally {
    selectedIconLoading.value = false;
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

// ── Club Details inline edit ──────────────────────────────────────

const onClubDetailsInput = (icon, value) => {
  clubDetailsMap.value = { ...clubDetailsMap.value, [icon.id]: value };
  // Debounce save
  clearTimeout(clubDetailsTimers.value[icon.id]);
  clubDetailsTimers.value[icon.id] = setTimeout(() => saveClubDetails(icon), 1500);
};

const saveClubDetails = async (icon) => {
  if (!useSummitClubIcons.value) return;
  const cid = parseInt(String(props.summitStatsClubId), 10);
  if (!Number.isFinite(cid) || cid < 1) return;
  const details = clubDetailsMap.value[icon.id] ?? icon.clubDetails ?? null;
  try {
    await api.put(`/summit-stats/clubs/${cid}/icon-details/${icon.id}`, { details });
    // Update the icon in the list
    const idx = icons.value.findIndex((i) => i.id === icon.id);
    if (idx !== -1) icons.value[idx] = { ...icons.value[idx], clubDetails: details };
  } catch (err) {
    console.error('Failed to save club icon details:', err);
  }
};

onMounted(async () => {
  // Do not fetch the full icon library on mount. This component can appear many times
  // on settings pages; loading 400+ icons per instance causes a huge delay.
  //
  // We only load icons when the modal is opened. For the preview chip, fetch the single icon
  // by id via the modelValue watcher (cheap) when needed.
});
</script>

<style scoped>
.club-icon-upload-row {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
  background: var(--surface-secondary, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
}
.upload-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary, #0f172a);
}
.club-icon-file {
  font-size: 0.85rem;
}
.upload-status {
  display: inline-block;
  margin-left: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
}
.upload-error {
  display: block;
  margin-top: 6px;
  font-size: 0.85rem;
  color: #b91c1c;
}

.icon-scope-badge {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
  margin-bottom: 2px;
}
.icon-meta-badge {
  display: block;
  font-size: 9px;
  color: var(--text-secondary, #64748b);
  background: var(--surface-secondary, #f1f5f9);
  border-radius: 3px;
  padding: 1px 4px;
  margin: 1px auto 0;
  text-align: center;
  max-width: 90%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icon-meta-badge--sub {
  background: var(--primary-light, #eff6ff);
  color: var(--primary, #2563eb);
}
.icon-club-details {
  margin-top: 4px;
  width: 100%;
}
.icon-club-details-input {
  width: 100%;
  font-size: 10px;
  padding: 2px 4px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 4px;
  background: var(--surface, #fff);
  color: var(--text-secondary, #64748b);
  box-sizing: border-box;
}

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
  position: relative;
}
.icon-hover-preview {
  position: absolute;
  top: calc(100% + 8px);
  left: 8px;
  width: 120px;
  height: 120px;
  padding: 8px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 5;
}
.icon-hover-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.selected-icon-preview:hover .icon-hover-preview {
  display: flex;
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

