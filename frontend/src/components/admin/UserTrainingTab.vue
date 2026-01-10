<template>
  <div class="user-training-tab">
    <h2 style="margin-bottom: 20px;">Training Progress</h2>

    <div v-if="loading" class="loading">Loading training data...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="tracks.length === 0 && individualModules.length === 0" class="empty-state">
      <p>No training focuses or modules assigned to this user.</p>
    </div>
    <div v-else>
      <!-- Individually Assigned Modules (from tasks) -->
      <div v-if="individualModules.length > 0" class="individual-modules-section" style="margin-bottom: 32px;">
        <h3 style="margin-bottom: 16px; font-size: 18px; font-weight: 600;">Individually Assigned Modules</h3>
        <div class="modules-list">
          <table class="modules-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in individualModules" :key="task.id">
                <td>
                  <strong>{{ task.title }}</strong>
                  <br>
                  <small class="text-muted">{{ task.description || 'No description' }}</small>
                </td>
                <td>
                  <span :class="['badge', getStatusBadgeClass(task.status)]">
                    {{ task.status === 'completed' ? 'Completed' : task.status === 'in_progress' ? 'In Progress' : 'Pending' }}
                  </span>
                </td>
                <td>
                  <span v-if="task.due_date">{{ formatDate(task.due_date) }}</span>
                  <span v-else class="text-muted">No due date</span>
                </td>
                <td>
                  <button 
                    v-if="task.reference_id && !viewOnly" 
                    @click="viewModule(task.reference_id)" 
                    class="btn btn-sm btn-primary"
                  >
                    View Module
                  </button>
                  <button 
                    v-if="!viewOnly && task.status !== 'completed'"
                    @click="completeTask(task.id)" 
                    class="btn btn-sm btn-success"
                  >
                    Mark Complete
                  </button>
                  <span v-if="viewOnly && task.status === 'completed'" class="badge badge-success">Completed</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Training Focuses -->
      <div v-if="tracks.length > 0" class="training-focuses-section" style="margin-bottom: 32px;">
        <h3 style="margin-bottom: 16px; font-size: 18px; font-weight: 600;">Training Focuses</h3>
        <div class="tracks-list" style="display: grid; gap: 16px;">
          <div 
            v-for="track in tracks" 
            :key="track.id" 
            class="training-focus-card"
            style="
              background: white;
              border: 1px solid var(--border);
              border-radius: 12px;
              padding: 20px;
              cursor: pointer;
              transition: all 0.2s;
              box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            "
            @click="!viewOnly && openTrainingFocusDetail(track)"
            :style="viewOnly ? 'cursor: default;' : ''"
            @mouseenter="$event.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'"
            @mouseleave="$event.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)'"
          >
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
              <div style="flex: 1;">
                <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: var(--primary);">
                  {{ track.name }}
                </h3>
                <p v-if="track.description" style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                  {{ track.description }}
                </p>
              </div>
              <span :class="['badge', getStatusBadgeClass(track.status)]" style="margin-left: 12px;">
                {{ track.status }}
              </span>
            </div>
            
            <div class="track-progress" style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="font-size: 14px;">Completion: {{ track.completionPercentage }}%</strong>
                <span style="font-size: 13px; color: var(--text-secondary);">
                  {{ track.completedModules }} of {{ track.totalModules }} modules
                </span>
              </div>
              <div class="progress-bar" style="height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                <div class="progress-fill" :style="{ width: track.completionPercentage + '%', height: '100%', background: 'var(--primary)', transition: 'width 0.3s' }"></div>
              </div>
            </div>
            
            <div class="track-stats" style="display: flex; gap: 16px; font-size: 13px; color: var(--text-secondary);">
              <span>⏱️ {{ formatTime(track.totalTimeSpent) }}</span>
              <span>📚 {{ track.totalModules }} modules</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Training Focus Detail View -->
    <TrainingFocusDetailView
      v-if="selectedTrainingFocus && !viewOnly"
      :trainingFocus="selectedTrainingFocus"
      :userId="userId"
      @close="selectedTrainingFocus = null"
      @updated="handleTrainingFocusUpdated"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';
import TrainingFocusDetailView from './TrainingFocusDetailView.vue';

const props = defineProps({
  userId: {
    type: Number,
    required: true
  },
  viewOnly: {
    type: Boolean,
    default: false
  }
});

const loading = ref(true);
const error = ref('');
const tracks = ref([]);
const userAgencies = ref([]);
const individualModules = ref([]);
const selectedTrainingFocus = ref(null);

const fetchTrainingData = async () => {
  try {
    loading.value = true;
    // Get user's agencies first
    const agenciesRes = await api.get(`/users/${props.userId}/agencies`);
    userAgencies.value = agenciesRes.data;
    
    // Fetch individually assigned training modules (from tasks)
    try {
      const tasksRes = await api.get('/tasks/all', {
        params: {
          taskType: 'training',
          assignedToUserId: props.userId
        }
      });
      individualModules.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    } catch (err) {
      console.error('Error fetching individual training tasks:', err);
      individualModules.value = [];
    }
    
    if (agenciesRes.data.length === 0) {
      tracks.value = [];
      return;
    }
    
    // Get progress for first agency (or combine all)
    const agencyId = agenciesRes.data[0].id;
    const progressRes = await api.get(`/agencies/${agencyId}/users/${props.userId}/progress`);
    
    // Transform the progress data into tracks format
    if (progressRes.data && progressRes.data.tracks) {
      tracks.value = progressRes.data.tracks.map(track => ({
        id: track.trackId,
        name: track.trackName,
        description: track.trackDescription,
        status: track.status === 'complete' ? 'completed' : track.status,
        completionPercentage: track.completionPercent || 0,
        totalTimeSpent: track.timeSpent?.totalSeconds || 0,
        completedModules: track.modulesCompleted || 0,
        totalModules: track.modulesTotal || 0,
        modules: track.modules || []
      }));
    } else {
      tracks.value = [];
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load training data';
    console.error('Error fetching training data:', err);
  } finally {
    loading.value = false;
  }
};

const getStatusBadgeClass = (status) => {
  const classes = {
    'not_started': 'badge-secondary',
    'in_progress': 'badge-info',
    'completed': 'badge-success',
    'overridden': 'badge-warning'
  };
  return classes[status] || 'badge-secondary';
};

const formatTime = (seconds) => {
  if (!seconds) return '0 min';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const resetModule = async (moduleId) => {
  if (!confirm('Are you sure you want to reset this module? This will clear all progress.')) {
    return;
  }
  try {
    // Need agencyId - use first agency for now
    if (userAgencies.value.length === 0) {
      alert('Unable to determine agency');
      return;
    }
    await api.post('/admin-actions/reset-module', {
      userId: props.userId,
      moduleId,
      agencyId: userAgencies.value[0].id
    });
    await fetchTrainingData();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to reset module');
  }
};

const markModuleComplete = async (moduleId) => {
  try {
    if (userAgencies.value.length === 0) {
      alert('Unable to determine agency');
      return;
    }
    await api.post('/admin-actions/mark-module-complete', {
      userId: props.userId,
      moduleId,
      agencyId: userAgencies.value[0].id
    });
    await fetchTrainingData();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to mark module complete');
  }
};

const resetTrack = async (trackId) => {
  if (!confirm('Are you sure you want to reset this training focus? This will clear all progress for all modules.')) {
    return;
  }
  try {
    if (userAgencies.value.length === 0) {
      alert('Unable to determine agency');
      return;
    }
    await api.post('/admin-actions/reset-track', {
      userId: props.userId,
      trackId,
      agencyId: userAgencies.value[0].id
    });
    await fetchTrainingData();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to reset training focus');
  }
};

const markTrackComplete = async (trackId) => {
  try {
    if (userAgencies.value.length === 0) {
      alert('Unable to determine agency');
      return;
    }
    await api.post('/admin-actions/mark-track-complete', {
      userId: props.userId,
      trackId,
      agencyId: userAgencies.value[0].id
    });
    await fetchTrainingData();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to mark training focus complete');
  }
};

const openTrainingFocusDetail = (track) => {
  if (props.viewOnly) {
    return; // Don't open detail view in view-only mode
  }
  // Convert track data to Training Focus format expected by detail view
  selectedTrainingFocus.value = {
    id: track.id,
    name: track.name,
    description: track.description,
    agency_id: userAgencies.value[0]?.id || null,
    is_active: true
  };
};

const handleTrainingFocusUpdated = async () => {
  // Refresh training data when Training Focus is updated
  await fetchTrainingData();
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

const viewModule = (moduleId) => {
  // Navigate to module view
  window.open(`/modules/${moduleId}`, '_blank');
};

const completeTask = async (taskId) => {
  try {
    await api.put(`/tasks/${taskId}/complete`);
    await fetchTrainingData();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to complete task');
  }
};

onMounted(() => {
  fetchTrainingData();
});
</script>

<style scoped>
.tracks-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.track-card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid var(--border);
}

.track-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.track-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.track-description {
  margin: 8px 0 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.progress-header {
  margin-bottom: 8px;
  font-size: 16px;
}

.track-progress {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s;
}

.progress-text {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.track-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  font-size: 14px;
  color: var(--text-secondary);
}

.modules-list {
  margin-top: 20px;
}

.modules-list h4 {
  margin-bottom: 12px;
  color: var(--text-primary);
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

.track-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.text-muted {
  color: var(--text-secondary);
  font-style: italic;
}
</style>

