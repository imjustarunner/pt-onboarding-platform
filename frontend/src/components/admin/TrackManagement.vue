<template>
  <div class="track-management">
    <div class="section-header">
      <h2>Training Focus Management</h2>
      <button v-if="!readOnly" @click="showCreateModal = true" class="btn btn-primary">Create Training Focus</button>
    </div>
    
    <div class="filters" v-if="!loading && tracks.length > 0" style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
      <select v-model="filterType" @change="applyFilter" class="filter-select">
        <option value="all">All Training Focuses</option>
        <option value="templates" v-if="userRole === 'super_admin'">Platform Templates</option>
        <option value="agency">Agency Instances</option>
      </select>
      <select v-if="filterType === 'agency' || filterType === 'all'" v-model="filterAgencyId" @change="fetchTracks" class="filter-select">
        <option value="">All Agencies</option>
        <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
          {{ agency.name }}
        </option>
      </select>
      <div class="status-filter" style="display: flex; gap: 6px; align-items: center;">
        <label style="margin: 0; font-weight: 500;">Status:</label>
        <button 
          @click="statusFilter = 'active'" 
          :class="['btn', 'btn-sm', statusFilter === 'active' ? 'btn-primary' : 'btn-secondary']"
        >
          Active
        </button>
        <button 
          @click="statusFilter = 'inactive'" 
          :class="['btn', 'btn-sm', statusFilter === 'inactive' ? 'btn-primary' : 'btn-secondary']"
        >
          Inactive
        </button>
        <button 
          @click="statusFilter = 'all'" 
          :class="['btn', 'btn-sm', statusFilter === 'all' ? 'btn-primary' : 'btn-secondary']"
        >
          All
        </button>
      </div>
    </div>
    
    <div v-if="loading" class="loading">Loading training focuses...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="tracks-grid">
      <div
        v-for="track in filteredTracks"
        :key="track.id"
        class="track-card"
        @click="viewTrainingFocus(track)"
      >
        <div class="track-header">
          <div class="track-header-content">
            <img 
              v-if="track.icon_id && getTrackIconUrl(track)" 
              :src="getTrackIconUrl(track)" 
              :alt="track.icon_name || 'Training focus icon'"
              class="track-icon"
            />
            <div>
              <h3>{{ track.name }}</h3>
              <p class="track-meta">
                <span v-if="track.is_template || !track.agency_id" class="badge badge-warning" style="font-weight: bold;">📋 Platform Template</span>
                <span v-else class="track-agency">{{ getAgencyName(track.agency_id) }}</span>
              </p>
            </div>
          </div>
          <span :class="['badge', track.is_active ? 'badge-success' : 'badge-secondary']">
            {{ track.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <p v-if="track.description" class="track-description">{{ track.description }}</p>
        <div class="track-stats">
          <span class="module-count">{{ track.module_count || 0 }} modules</span>
          <span v-if="track.source_track_id" class="copy-indicator" title="Copied from another training focus">📋</span>
        </div>
        <div class="track-actions" @click.stop>
          <button @click.stop="viewTrainingFocus(track)" class="btn btn-primary btn-xs" title="View Modules">View</button>
          <button @click.stop="assignTrainingFocus(track)" class="btn btn-info btn-xs" title="Assign">Assign</button>
          <button @click.stop="editTrack(track)" class="btn btn-secondary btn-xs" title="Edit">Edit</button>
          
          <!-- Template-specific actions (Super Admin) -->
          <template v-if="!readOnly && (track.is_template || !track.agency_id) && userRole === 'super_admin'">
            <button 
              @click.stop="copyTrackToAgency(track)"
              class="btn btn-success btn-xs"
              title="Copy this template to an agency"
            >
              Copy
            </button>
          </template>
          
          <!-- Agency instance actions -->
          <template v-else-if="!readOnly && track.agency_id && !track.is_template">
            <button 
              @click.stop="duplicateTrack(track)" 
              class="btn btn-success btn-xs"
              title="Duplicate within the same agency"
            >
              Duplicate
            </button>
            <button 
              v-if="userRole === 'super_admin' && track.agency_id"
              @click.stop="copyTrackToAgency(track)"
              class="btn btn-primary btn-xs"
              title="Copy to another agency"
            >
              Copy
            </button>
          </template>
          
          <button v-if="!readOnly" @click.stop="deleteTrack(track.id)" class="btn btn-danger btn-xs" title="Delete">Delete</button>
        </div>
      </div>
    </div>
    
    <div v-if="tracks.length === 0 && !loading" class="empty-state">
      <p>No training focuses created yet</p>
    </div>
    
    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingTrack" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h3>{{ editingTrack ? 'Edit Training Focus' : 'Create Training Focus' }}</h3>
        <form @submit.prevent="saveTrack">
          <div class="form-group" v-if="userRole === 'super_admin'">
            <label>Agency (Optional - leave empty for platform template)</label>
            <select v-model="trackForm.agencyId">
              <option :value="null">Platform Template</option>
              <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
          </div>
          <div class="form-group" v-else>
            <label>Agency</label>
            <select v-model="trackForm.agencyId" required :disabled="!!editingTrack">
              <option value="">Select agency</option>
              <option v-for="agency in myAgencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Name *</label>
            <input v-model="trackForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="trackForm.description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Order Index</label>
            <input v-model.number="trackForm.orderIndex" type="number" min="0" />
          </div>
          <div class="form-group">
            <label>
              <input v-model="trackForm.isActive" type="checkbox" />
              Active
            </label>
          </div>
          
          <div v-if="editingTrack" class="form-group">
            <button 
              type="button" 
              @click="toggleTrackStatus" 
              :class="['btn', trackForm.isActive ? 'btn-warning' : 'btn-success']"
            >
              {{ trackForm.isActive ? 'Deactivate Training Focus' : 'Activate Training Focus' }}
            </button>
            <small v-if="trackForm.isActive" style="display: block; margin-top: 8px; color: var(--text-secondary);">
              Deactivating this training focus will also deactivate all associated modules and prevent new assignments.
            </small>
            <small v-else style="display: block; margin-top: 8px; color: var(--text-secondary);">
              Activating this training focus will make it available for assignments. Modules will need to be activated separately.
            </small>
          </div>
          
          <div class="form-group">
            <label>Icon</label>
            <IconSelector v-model="trackForm.iconId" />
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Copy Track Dialog -->
    <TrackCopyDialog
      v-if="showCopyDialog && trackToCopy"
      :track="trackToCopy"
      :copyToAgency="copyToAgencyMode"
      @close="showCopyDialog = false"
      @copied="handleTrackCopied"
    />
    
    <!-- Training Focus Detail View -->
    <TrainingFocusDetailView
      v-if="selectedTrainingFocus"
      :trainingFocus="selectedTrainingFocus"
      @close="selectedTrainingFocus = null"
      @updated="fetchTracks"
    />
    
    <!-- Training Focus Assignment Dialog -->
    <TrainingFocusAssignmentDialog
      v-if="showAssignDialog && trackToAssign"
      :track="trackToAssign"
      @close="showAssignDialog = false"
      @assigned="handleTrainingFocusAssigned"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import TrackCopyDialog from './TrackCopyDialog.vue';
import TrainingFocusDetailView from './TrainingFocusDetailView.vue';
import TrainingFocusAssignmentDialog from './TrainingFocusAssignmentDialog.vue';
import IconSelector from './IconSelector.vue';

const props = defineProps({
  readOnly: {
    type: Boolean,
    default: false
  }
});

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const userRole = computed(() => authStore.user?.role);

const tracks = ref([]);
const agencies = ref([]);
const myAgencies = ref([]);
const loading = ref(true);
const error = ref('');
const showCreateModal = ref(false);
const editingTrack = ref(null);
const showCopyDialog = ref(false);
const trackToCopy = ref(null);
const copyToAgencyMode = ref(false);
const saving = ref(false);
const filterAgencyId = ref('');
const filterType = ref('all'); // 'all', 'templates', 'agency'
const statusFilter = ref('active'); // 'active', 'inactive', 'all'
const selectedTrainingFocus = ref(null);
const showAssignDialog = ref(false);
const trackToAssign = ref(null);

const trackForm = ref({
  name: '',
  description: '',
  agencyId: null,
  orderIndex: 0,
  isActive: true,
  iconId: null
});

const fetchTracks = async () => {
  try {
    loading.value = true;
    const params = {};
    if (filterAgencyId.value) {
      params.agencyId = filterAgencyId.value;
    }
    const response = await api.get('/training-focuses', { params });
    tracks.value = response.data;
    
    // Fetch module counts for each training focus
    for (const track of tracks.value) {
      try {
        const trackDetail = await api.get(`/training-focuses/${track.id}`);
        track.module_count = trackDetail.data.modules?.length || 0;
      } catch (e) {
        track.module_count = 0;
      }
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load training focuses';
  } finally {
    loading.value = false;
  }
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    agencies.value = response.data;
    
    if (userRole.value === 'admin') {
      myAgencies.value = agencies.value;
    } else {
      myAgencies.value = agencies.value;
    }
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const applyFilter = () => {
  fetchTracks();
};

const getAgencyName = (agencyId) => {
  const agency = agencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : 'Unknown';
};

const getTrackIconUrl = (track) => {
  if (!track || !track.icon_id) {
    return null;
  }
  
  let iconPath = track.icon_file_path;
  
  // Debug logging
  if (track.icon_id && !iconPath) {
    console.warn('Track has icon_id but no icon_file_path:', {
      track_id: track.id,
      track_name: track.name,
      icon_id: track.icon_id,
      icon_file_path: iconPath,
      icon_name: track.icon_name,
      fullTrack: track
    });
  }
  
  if (!iconPath && track.icon_id) {
    return null;
  }
  if (!iconPath) {
    return null;
  }
  
  const fullUrl = toUploadsUrl(iconPath);
  console.log('Track icon URL:', fullUrl, 'from path:', iconPath);
  return fullUrl;
};

const filteredTracks = computed(() => {
  let filtered = tracks.value;
  
  // Apply status filter
  if (statusFilter.value === 'active') {
    filtered = filtered.filter(t => t.is_active !== false);
  } else if (statusFilter.value === 'inactive') {
    filtered = filtered.filter(t => t.is_active === false);
  }
  // 'all' shows everything, no filter needed
  
  return filtered;
});

const toggleTrackStatus = () => {
  trackForm.value.isActive = !trackForm.value.isActive;
};

const editTrack = (track) => {
  editingTrack.value = track;
  trackForm.value = {
    name: track.name,
    description: track.description || '',
    agencyId: track.agency_id,
    orderIndex: track.order_index || 0,
    isActive: track.is_active,
    iconId: track.icon_id || null
  };
};

const duplicateTrack = (track) => {
  trackToCopy.value = track;
  copyToAgencyMode.value = false;
  showCopyDialog.value = true;
};

const copyTrackToAgency = (track) => {
  trackToCopy.value = track;
  copyToAgencyMode.value = true;
  showCopyDialog.value = true;
};

const handleTrackCopied = () => {
  showCopyDialog.value = false;
  trackToCopy.value = null;
  fetchTracks();
};

const saveTrack = async () => {
  try {
    saving.value = true;
    const data = {
      name: trackForm.value.name,
      description: trackForm.value.description,
      agencyId: trackForm.value.agencyId,
      orderIndex: trackForm.value.orderIndex,
      assignmentLevel: trackForm.value.agencyId ? 'agency' : 'platform',
      isActive: trackForm.value.isActive,
      iconId: trackForm.value.iconId,
      cascadeDeactivateModules: editingTrack.value && !trackForm.value.isActive && editingTrack.value.is_active !== false // Cascade deactivate when deactivating
    };
    
    if (editingTrack.value) {
      await api.put(`/training-focuses/${editingTrack.value.id}`, data);
    } else {
      await api.post('/training-focuses', data);
    }
    
    closeModal();
    fetchTracks();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save track';
  } finally {
    saving.value = false;
  }
};

const deleteTrack = async (trackId) => {
  if (!confirm('Are you sure you want to archive this training focus? It will be moved to the archive and can be restored or permanently deleted later.')) {
    return;
  }
  
  try {
    await api.post(`/training-focuses/${trackId}/archive`);
    fetchTracks();
    alert('Training focus archived successfully');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to archive training focus';
    alert(error.value);
  }
};

const viewTrainingFocus = async (track) => {
  try {
    // Fetch full details including modules
    const response = await api.get(`/training-focuses/${track.id}`);
    selectedTrainingFocus.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load training focus details';
  }
};

const assignTrainingFocus = (track) => {
  trackToAssign.value = track;
  showAssignDialog.value = true;
};

const handleTrainingFocusAssigned = () => {
  showAssignDialog.value = false;
  trackToAssign.value = null;
  // Optionally refresh tracks if needed
};

const closeModal = () => {
  showCreateModal.value = false;
  editingTrack.value = null;
  trackForm.value = {
    name: '',
    description: '',
    agencyId: null,
    orderIndex: 0,
    isActive: true,
    iconId: null
  };
};

onMounted(async () => {
  await fetchAgencies();
  await fetchTracks();
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
  color: var(--text-primary);
}

.filters {
  margin-bottom: 20px;
}

.filter-select {
  padding: 10px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
}

.tracks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.track-card {
  background: white;
  padding: 24px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.track-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.track-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.track-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 12px;
}

.track-header-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.track-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
}

.track-header h3 {
  margin: 0 0 6px;
  color: var(--text-primary);
  font-weight: 700;
}

.track-meta {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.track-agency {
  font-weight: 500;
}

.track-description {
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.6;
}

.track-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.module-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.copy-indicator {
  font-size: 16px;
  opacity: 0.7;
}

.track-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  padding-top: 12px;
  border-top: 2px solid var(--border);
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
}

.track-actions::-webkit-scrollbar {
  height: 6px;
}

.track-actions::-webkit-scrollbar-track {
  background: transparent;
}

.track-actions::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.track-actions::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.track-actions .btn {
  white-space: nowrap;
  flex-shrink: 0;
  width: auto;
  min-width: auto;
  padding: 6px 12px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.7);
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
  box-shadow: var(--shadow-lg);
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 24px;
  color: var(--text-primary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}
</style>

