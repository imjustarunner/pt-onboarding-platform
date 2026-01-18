<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content large" @click.stop>
      <div class="modal-header">
        <h2 v-if="!isEditing">{{ trainingFocus.value.name }}</h2>
        <div v-else style="flex: 1;">
          <input v-model="editForm.name" type="text" class="edit-input" placeholder="Training Focus Name" />
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <button v-if="!isEditing" @click="startEditing" class="btn btn-secondary">Edit</button>
          <button v-if="isEditing" @click="saveTrainingFocus" class="btn btn-primary" :disabled="savingTrainingFocus">Save</button>
          <button v-if="isEditing" @click="cancelEditing" class="btn btn-secondary">Cancel</button>
          <button @click="showAddModuleDialog = true" class="btn btn-primary">Add Module</button>
          <button @click="$emit('close')" class="btn-close">×</button>
        </div>
      </div>
      
      <div v-if="!isEditing && trainingFocus.value.description" class="description">
        <p>{{ trainingFocus.value.description }}</p>
      </div>
      <div v-if="isEditing" class="description">
        <textarea v-model="editForm.description" rows="3" class="edit-textarea" placeholder="Description"></textarea>
      </div>

      <div class="training-focus-info">
        <div class="info-item">
          <strong>Agency:</strong>
          <span v-if="trainingFocus.value.agency_id">{{ getAgencyName(trainingFocus.value.agency_id) }}</span>
          <span v-else class="text-muted">Platform Template</span>
        </div>
        <div class="info-item">
          <strong>Status:</strong>
          <span :class="['badge', trainingFocus.value.is_active ? 'badge-success' : 'badge-secondary']">
            {{ trainingFocus.value.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <div class="info-item">
          <strong>Modules:</strong>
          <span>{{ modules.length }}</span>
        </div>
      </div>
      
      <div v-if="userId" class="training-focus-info" style="margin-top: 12px;">
        <div class="info-item">
          <strong>Total time (this focus):</strong>
          <span>{{ formatSeconds(focusTimeSeconds) }}</span>
        </div>
        <div class="info-item">
          <strong>Total time (all training):</strong>
          <span>{{ formatSeconds(overallTimeSeconds) }}</span>
        </div>
      </div>

      <div class="modules-section">
        <h3>Modules in this Training Focus</h3>
        <div v-if="loadingModules" class="loading">Loading modules...</div>
        <div v-else-if="modules.length === 0" class="empty-state">
          <p>No modules assigned to this training focus yet.</p>
        </div>
        <div v-else class="modules-list">
          <table class="modules-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Title</th>
                <th>Estimated Time</th>
                <th>Status</th>
                <th v-if="userId">User Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="module in modules" :key="module.id">
                <td>{{ module.track_order || module.order_index }}</td>
                <td>{{ module.title }}</td>
                <td>{{ module.estimated_time_minutes || 0 }} min</td>
                <td>
                  <span :class="['badge', module.is_active ? 'badge-success' : 'badge-secondary']">
                    {{ module.is_active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td v-if="userId">
                  <span v-if="getModuleProgress(module.id)" class="badge badge-info">
                    {{ getModuleProgress(module.id).status || 'Not Started' }}
                  </span>
                  <div v-if="getModuleProgress(module.id)" class="text-muted" style="margin-top: 4px;">
                    {{ formatSeconds(getModuleProgress(module.id).timeSpent || 0) }}
                  </div>
                  <span v-else class="text-muted">Not assigned</span>
                </td>
                <td>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button @click="editModule(module)" class="btn btn-sm btn-primary">Edit</button>
                    <button @click="manageContent(module)" class="btn btn-sm btn-secondary">Content</button>
                    <button v-if="!userId" @click="removeModule(module.id)" class="btn btn-sm btn-danger">Remove</button>
                    <button v-if="userId" @click="assignModuleToUser(module)" class="btn btn-sm btn-success">Assign</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-actions">
        <button @click="$emit('close')" class="btn btn-secondary">Close</button>
      </div>
    </div>

    <!-- Module Selection Dialog -->
    <div v-if="showAddModuleDialog && !selectedModuleForAssignment" class="modal-overlay" @click.self="showAddModuleDialog = false">
      <div class="modal-content large" @click.stop>
        <h2>Select Module to Assign</h2>
        <div v-if="loadingAvailableModules" class="loading">Loading modules...</div>
        <div v-else-if="availableModules.length === 0" class="empty-state">
          <p>No modules available to assign.</p>
        </div>
        <div v-else class="module-list" style="max-height: 400px; overflow-y: auto;">
          <div
            v-for="module in availableModules"
            :key="module.id"
            class="module-item"
            @click="selectModuleToAdd(module)"
            style="cursor: pointer; padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; transition: all 0.2s;"
            @mouseenter="$event.currentTarget.style.backgroundColor = 'var(--bg-secondary)'"
            @mouseleave="$event.currentTarget.style.backgroundColor = 'transparent'"
          >
            <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">{{ module.title }}</h3>
            <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">{{ module.description || 'No description' }}</p>
          </div>
        </div>
        <div class="form-actions" style="margin-top: 20px; display: flex; justify-content: flex-end;">
          <button @click="showAddModuleDialog = false" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Module Assignment Dialog -->
    <ModuleAssignmentDialog
      v-if="selectedModuleForAssignment"
      :module="selectedModuleForAssignment"
      :preSelectedUserId="userId"
      @close="selectedModuleForAssignment = null; showAssignModuleDialog = false"
      @assigned="handleModuleAssigned"
    />
    
    <!-- Module Edit Modal -->
    <div v-if="editingModule" class="modal-overlay" @click.self="closeEditModal">
      <div class="modal-content" @click.stop>
        <h3>Edit Module</h3>
        <form @submit.prevent="saveModule">
          <div class="form-group">
            <label>Title *</label>
            <input v-model="moduleForm.title" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="moduleForm.description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Order Index</label>
            <input v-model.number="moduleForm.orderIndex" type="number" min="0" />
          </div>
          <div class="form-group">
            <label>
              <input v-model="moduleForm.isActive" type="checkbox" />
              Active
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeEditModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">Save</button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Content Editor Modal -->
    <div v-if="showContentModal && currentModule" class="modal-overlay modal-overlay-top" @click.self="closeContentModal">
      <div class="modal-content large" @click.stop>
        <div class="modal-header">
          <h3>Manage Content: {{ currentModule.title }}</h3>
          <button @click="closeContentModal" class="btn-close">×</button>
        </div>
        <ContentEditor :moduleId="currentModule.id" @close="closeContentModal" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import ModuleAssignmentDialog from './ModuleAssignmentDialog.vue';
import ContentEditor from './ContentEditor.vue';

const props = defineProps({
  trainingFocus: {
    type: Object,
    required: true
  },
  userId: {
    type: Number,
    default: null
  }
});

// Create a reactive reference to the training focus for editing
const trainingFocus = ref(props.trainingFocus);

const emit = defineEmits(['close', 'updated']);

const router = useRouter();
const agencyStore = useAgencyStore();

const modules = ref([]);
const loadingModules = ref(true);
const agencies = ref([]);
const showAssignModuleDialog = ref(false);
const showAddModuleDialog = ref(false);
const selectedModuleForAssignment = ref(null);
const availableModules = ref([]);
const loadingAvailableModules = ref(false);
const moduleProgress = ref({});
const focusTimeSeconds = ref(0);
const overallTimeSeconds = ref(0);
const editingModule = ref(null);
const showContentModal = ref(false);
const currentModule = ref(null);
const saving = ref(false);

const formatSeconds = (totalSeconds) => {
  const s = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const moduleForm = ref({
  title: '',
  description: '',
  orderIndex: 0,
  isActive: true
});

const isEditing = ref(false);
const savingTrainingFocus = ref(false);
const editForm = ref({
  name: '',
  description: ''
});

const getAgencyName = (agencyId) => {
  const agency = agencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : 'Unknown';
};

const startEditing = () => {
  isEditing.value = true;
  editForm.value = {
    name: trainingFocus.value.name || '',
    description: trainingFocus.value.description || ''
  };
};

const cancelEditing = () => {
  isEditing.value = false;
  editForm.value = {
    name: '',
    description: ''
  };
};

const saveTrainingFocus = async () => {
  try {
    savingTrainingFocus.value = true;
    await api.put(`/training-focuses/${trainingFocus.value.id}`, {
      name: editForm.value.name.trim(),
      description: editForm.value.description?.trim() || null
    });
    
    // Update local training focus object
    trainingFocus.value.name = editForm.value.name.trim();
    trainingFocus.value.description = editForm.value.description?.trim() || null;
    
    isEditing.value = false;
    emit('updated');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to save training focus');
  } finally {
    savingTrainingFocus.value = false;
  }
};

const fetchModules = async () => {
  try {
    loadingModules.value = true;
    const response = await api.get(`/training-focuses/${trainingFocus.value.id}/modules`);
    modules.value = response.data;
  } catch (err) {
    console.error('Failed to load modules:', err);
  } finally {
    loadingModules.value = false;
  }
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    agencies.value = response.data;
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const editModule = (module) => {
  editingModule.value = module;
  moduleForm.value = {
    title: module.title,
    description: module.description || '',
    orderIndex: module.track_order !== undefined ? module.track_order : module.order_index,
    isActive: module.is_active
  };
};

const saveModule = async () => {
  try {
    saving.value = true;
    await api.put(`/modules/${editingModule.value.id}`, {
      title: moduleForm.value.title,
      description: moduleForm.value.description,
      orderIndex: moduleForm.value.orderIndex,
      isActive: moduleForm.value.isActive
    });
    closeEditModal();
    await fetchModules();
    emit('updated');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to save module');
  } finally {
    saving.value = false;
  }
};

const closeEditModal = () => {
  editingModule.value = null;
  moduleForm.value = {
    title: '',
    description: '',
    orderIndex: 0,
    isActive: true
  };
};

const manageContent = (module) => {
  currentModule.value = module;
  showContentModal.value = true;
};

const closeContentModal = () => {
  showContentModal.value = false;
  currentModule.value = null;
};

const removeModule = async (moduleId) => {
  if (!confirm('Are you sure you want to remove this module from the training focus?')) {
    return;
  }
  
  try {
    await api.delete(`/training-focuses/${trainingFocus.value.id}/modules/${moduleId}`);
    await fetchModules();
    emit('updated');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to remove module');
  }
};


const handleModuleAssigned = async () => {
  selectedModuleForAssignment.value = null;
  showAssignModuleDialog.value = false;
  showAddModuleDialog.value = false;
  await fetchModules();
  if (props.userId) {
    await fetchUserProgress();
  }
  emit('updated');
};

const selectModuleToAdd = async (module) => {
  try {
    // Add module to training focus
    await api.post(`/training-focuses/${trainingFocus.value.id}/modules`, {
      moduleId: module.id
    });
    showAddModuleDialog.value = false;
    await fetchModules();
    emit('updated');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to add module to training focus');
  }
};

const assignModuleToUser = (module) => {
  selectedModuleForAssignment.value = module;
  showAssignModuleDialog.value = true;
};

const loadAvailableModules = async () => {
  try {
    loadingAvailableModules.value = true;
    const response = await api.get('/modules');
    availableModules.value = response.data.filter(m => m.is_active !== false);
  } catch (err) {
    console.error('Failed to load modules:', err);
    availableModules.value = [];
  } finally {
    loadingAvailableModules.value = false;
  }
};

const fetchUserProgress = async () => {
  if (!props.userId || !trainingFocus.value.agency_id) return;
  
  try {
    // Fetch user's progress for modules in this training focus
    const progressRes = await api.get(`/agencies/${trainingFocus.value.agency_id}/users/${props.userId}/progress`);
    overallTimeSeconds.value = Number(progressRes.data?.totalTimeSpent?.seconds || 0);
    if (progressRes.data && progressRes.data.tracks) {
      const track = progressRes.data.tracks.find(t => t.trackId === trainingFocus.value.id);
      if (track && track.modules) {
        focusTimeSeconds.value = Number(track.timeSpent?.totalSeconds || 0);
        const progressMap = {};
        track.modules.forEach(mod => {
          progressMap[mod.moduleId] = {
            status: mod.status,
            timeSpent: mod.timeSpentSeconds,
            quizScore: mod.quizScore
          };
        });
        moduleProgress.value = progressMap;
      }
    }
  } catch (err) {
    console.error('Failed to fetch user progress:', err);
  }
};

const getModuleProgress = (moduleId) => {
  return moduleProgress.value[moduleId] || null;
};

// Watch for prop changes
watch(() => props.trainingFocus, (newFocus) => {
  trainingFocus.value = newFocus;
}, { deep: true });

onMounted(async () => {
  await fetchAgencies();
  await fetchModules();
  await loadAvailableModules();
  if (props.userId) {
    await fetchUserProgress();
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

.modal-overlay-top {
  /* Ensure nested modals (e.g. ContentEditor) sit above the Training Focus modal */
  z-index: 1200;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 900px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content.large {
  max-width: 1200px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.modal-header h2 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: var(--text-secondary);
  line-height: 1;
}

.btn-close:hover {
  color: var(--text-primary);
}

.description {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.training-focus-info {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item strong {
  font-size: 12px;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.modules-section {
  margin-bottom: 24px;
}

.modules-section h3 {
  margin-bottom: 16px;
}

.modules-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.modules-table th,
.modules-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.modules-table th {
  background: #f8f9fa;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.edit-input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.edit-textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  color: var(--text-primary);
  font-family: var(--font-body);
  resize: vertical;
}
</style>

