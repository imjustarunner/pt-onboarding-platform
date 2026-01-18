<template>
  <div class="agency-progress-dashboard">
    <div class="dashboard-header">
      <h1>Agency Progress Dashboard</h1>
      <div v-if="agencies.length > 1" class="agency-selector">
        <label>Select Agency:</label>
        <select v-model="selectedAgencyId" @change="loadDashboard" class="agency-select">
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>
      <div v-else-if="agencies.length === 1" class="current-agency">
        <span class="badge badge-primary">{{ agencies[0]?.name }}</span>
      </div>
    </div>

    <div v-if="loading && !selectedAgencyId" class="loading">Loading agencies...</div>
    <div v-else-if="!selectedAgencyId && agencies.length === 0" class="empty-state">
      <p>No agencies available.</p>
    </div>
    <div v-else-if="!selectedAgencyId && agencies.length > 0" class="empty-state">
      <p>Please select an agency to view progress.</p>
    </div>
    <div v-else-if="loading" class="loading">Loading dashboard...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="users.length === 0" class="empty-state">
      <p>No users found in this agency.</p>
    </div>

    <div v-else class="users-list">
      <div
        v-for="user in users"
        :key="user.id"
        class="user-card"
      >
        <div class="user-header" @click="toggleUser(user.id)">
          <div class="user-info">
            <h3>{{ user.firstName }} {{ user.lastName }}</h3>
            <p class="user-email">{{ user.email }}</p>
            <span :class="['badge', getRoleBadgeClass(user.role)]">{{ formatRole(user.role) }}</span>
          </div>
          <div class="user-summary">
            <div class="summary-stat">
              <span class="stat-label">Overall Progress</span>
              <span class="stat-value">{{ user.overallCompletion }}%</span>
            </div>
            <div class="summary-stat">
              <span class="stat-label">Tracks</span>
              <span class="stat-value">{{ user.tracksAssigned }}</span>
            </div>
            <div class="summary-stat">
              <span class="stat-label">Time Spent</span>
              <span class="stat-value">{{ formatTime(user.totalTimeSpent.minutes) }}</span>
            </div>
            <button class="toggle-btn">
              {{ expandedUsers[user.id] ? '▼' : '▶' }}
            </button>
          </div>
        </div>

        <div v-if="expandedUsers[user.id]" class="user-details">
          <div v-if="loadingProgress[user.id]" class="loading-small">Loading progress...</div>
          <div v-else-if="userProgress[user.id]" class="progress-details">
            <div
              v-for="track in userProgress[user.id].tracks"
              :key="track.trackId"
              class="track-section"
            >
              <div class="track-header">
                <h4>{{ track.trackName }}</h4>
                <div class="track-stats">
                  <span class="completion-badge" :class="getStatusClass(track.status)">
                    {{ track.completionPercent }}% Complete
                  </span>
                  <span class="time-badge">{{ formatTime(track.timeSpent.totalMinutes) }}</span>
                </div>
              </div>

              <div class="modules-list">
                <div
                  v-for="module in track.modules"
                  :key="module.moduleId"
                  class="module-item"
                >
                  <div class="module-info">
                    <span class="module-status" :class="getStatusClass(module.status)">
                      {{ module.status }}
                    </span>
                    <span class="module-title">{{ module.moduleTitle }}</span>
                  </div>
                  <div class="module-stats">
                    <span v-if="module.quizScore !== null" class="quiz-score">
                      Quiz: {{ module.quizScore }}% ({{ module.quizAttemptCount }} attempts)
                    </span>
                    <span class="module-time">{{ formatTime(module.timeSpentMinutes) }}</span>
                    <span v-if="module.isOverridden" class="override-indicator" title="Manually completed">
                      ⚡
                    </span>
                  </div>
                  <div class="module-actions">
                    <button 
                      @click="showActionDialog('reset-module', user, track, module)"
                      class="btn btn-sm btn-danger"
                    >
                      Reset
                    </button>
                    <button 
                      v-if="module.status !== 'completed'"
                      @click="showActionDialog('mark-module-complete', user, track, module)"
                      class="btn btn-sm btn-success"
                    >
                      Mark Complete
                    </button>
                  </div>
                </div>
              </div>

              <div class="track-actions">
                <button 
                  @click="showActionDialog('reset-track', user, track)"
                  class="btn btn-sm btn-danger"
                >
                  Reset Track
                </button>
                <button 
                  v-if="track.status !== 'complete'"
                  @click="showActionDialog('mark-track-complete', user, track)"
                  class="btn btn-sm btn-success"
                >
                  Mark Track Complete
                </button>
              </div>
            </div>

            <div class="total-time-section">
              <strong>Total Training Time:</strong> {{ formatTime(userProgress[user.id].totalTimeSpent.minutes) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Admin Action Dialog -->
    <AdminActionDialog
      v-if="showDialog"
      :action="currentAction"
      :user="currentUser"
      :track="currentTrack"
      :module="currentModule"
      :agencyId="selectedAgencyId"
      @confirm="handleAction"
      @close="showDialog = false"
    />

    <!-- Audit Log Viewer -->
    <div class="audit-log-section">
      <button @click="showAuditLog = !showAuditLog" class="btn btn-secondary">
        {{ showAuditLog ? 'Hide' : 'Show' }} Audit Log
      </button>
      <AuditLogViewer
        v-if="showAuditLog"
        :agencyId="selectedAgencyId"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import AdminActionDialog from '../../components/admin/AdminActionDialog.vue';
import AuditLogViewer from '../../components/admin/AuditLogViewer.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const agencies = ref([]);
const selectedAgencyId = ref(null);
const users = ref([]);
const userProgress = ref({});
const expandedUsers = ref({});
const loading = ref(true);
const loadingProgress = ref({});
const error = ref('');
const showDialog = ref(false);
const currentAction = ref(null);
const currentUser = ref(null);
const currentTrack = ref(null);
const currentModule = ref(null);
const showAuditLog = ref(false);

const route = useRoute();
const router = useRouter();

const loadAgencies = async () => {
  try {
    // For superadmins, fetch all agencies; for others, fetch user's agencies
    if (authStore.user?.role === 'super_admin') {
      await agencyStore.fetchAgencies(); // No userId = fetch all agencies
    } else {
      await agencyStore.fetchAgencies(authStore.user?.id);
    }
    agencies.value = agencyStore.agencies;
    
    // Check if agencyId is in route params (for super admin clicking from dashboard)
    if (route.params.agencyId) {
      selectedAgencyId.value = parseInt(route.params.agencyId);
    } else if (agencies.value.length > 0 && !selectedAgencyId.value) {
      // Auto-select first agency if available
      selectedAgencyId.value = agencies.value[0].id;
    }
    
    // If we now have a selected agency, load the dashboard
    if (selectedAgencyId.value) {
      await loadDashboard();
    }
  } catch (err) {
    console.error('Failed to load agencies:', err);
    error.value = 'Failed to load agencies';
  }
};

const loadDashboard = async () => {
  if (!selectedAgencyId.value) return;
  
  try {
    loading.value = true;
    error.value = '';
    const response = await api.get(`/agencies/${selectedAgencyId.value}/users`);
    users.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load dashboard';
  } finally {
    loading.value = false;
  }
};

const toggleUser = async (userId) => {
  expandedUsers.value[userId] = !expandedUsers.value[userId];
  
  if (expandedUsers.value[userId] && !userProgress.value[userId]) {
    await loadUserProgress(userId);
  }
};

const loadUserProgress = async (userId) => {
  try {
    loadingProgress.value[userId] = true;
    const response = await api.get(`/agencies/${selectedAgencyId.value}/users/${userId}/progress`);
    userProgress.value[userId] = response.data;
  } catch (err) {
    console.error('Failed to load user progress:', err);
  } finally {
    loadingProgress.value[userId] = false;
  }
};

const showActionDialog = (action, user, track = null, module = null) => {
  currentAction.value = action;
  currentUser.value = user;
  currentTrack.value = track;
  currentModule.value = module;
  showDialog.value = true;
};

const handleAction = async () => {
  showDialog.value = false;
  
  // Reload user progress after action
  if (currentUser.value) {
    await loadUserProgress(currentUser.value.id);
    await loadDashboard(); // Refresh user list summary
  }
};

const formatTime = (minutes) => {
  if (!minutes) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const formatRole = (role) => {
  const roleMap = {
    'super_admin': 'Super Admin',
    'admin': 'Admin',
    'support': 'Staff',
    'supervisor': 'Supervisor',
    'clinical_practice_assistant': 'CPA',
    'staff': 'Onboarding Staff',
    'clinician': 'Clinician',
    'facilitator': 'Facilitator',
    'intern': 'Intern'
  };
  return roleMap[role] || role;
};

const getRoleBadgeClass = (role) => {
  const classes = {
    'super_admin': 'badge-warning',
    'admin': 'badge-info',
    'supervisor': 'badge-success',
    'clinician': 'badge-secondary',
    'facilitator': 'badge-secondary',
    'intern': 'badge-secondary'
  };
  return classes[role] || 'badge-secondary';
};

const getStatusClass = (status) => {
  const classes = {
    'complete': 'status-complete',
    'completed': 'status-complete',
    'in_progress': 'status-in-progress',
    'not_started': 'status-not-started'
  };
  return classes[status] || '';
};

onMounted(async () => {
  await loadAgencies();
  if (selectedAgencyId.value) {
    await loadDashboard();
  }
});

// Watch for route changes (when super admin clicks agency from dashboard)
watch(() => route.params.agencyId, async (newAgencyId) => {
  if (newAgencyId) {
    selectedAgencyId.value = parseInt(newAgencyId);
    await loadDashboard();
  }
});
</script>

<style scoped>
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border);
}

.dashboard-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.agency-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.agency-select {
  padding: 8px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.current-agency {
  font-size: 16px;
}

.users-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.user-card {
  background: white;
  border: 2px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow);
}

.user-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.user-header:hover {
  background: var(--bg-alt);
}

.user-info {
  flex: 1;
}

.user-info h3 {
  margin: 0 0 5px;
  color: var(--text-primary);
}

.user-email {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 14px;
}

.user-summary {
  display: flex;
  align-items: center;
  gap: 30px;
}

.summary-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.toggle-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 5px 10px;
}

.user-details {
  padding: 20px;
  border-top: 2px solid var(--border);
  background: var(--bg-alt);
}

.track-section {
  margin-bottom: 30px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.track-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--border);
}

.track-header h4 {
  margin: 0;
  color: var(--text-primary);
}

.track-stats {
  display: flex;
  gap: 15px;
  align-items: center;
}

.completion-badge {
  padding: 6px 12px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
}

.status-complete {
  background: #d1fae5;
  color: #065f46;
}

.status-in-progress {
  background: #fef3c7;
  color: #92400e;
}

.status-not-started {
  background: #e5e7eb;
  color: #374151;
}

.time-badge {
  padding: 6px 12px;
  background: var(--bg-alt);
  border-radius: 6px;
  font-size: 14px;
  color: var(--text-secondary);
}

.modules-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.module-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px;
  background: var(--bg-alt);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.module-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.module-status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  min-width: 90px;
  text-align: center;
}

.module-title {
  font-weight: 500;
  color: var(--text-primary);
}

.module-stats {
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: 14px;
  color: var(--text-secondary);
}

.quiz-score {
  font-weight: 500;
}

.module-time {
  font-family: monospace;
}

.override-indicator {
  font-size: 16px;
  color: var(--warning);
}

.module-actions {
  display: flex;
  gap: 8px;
}

.track-actions {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 10px;
}

.total-time-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 2px solid var(--border);
  font-size: 16px;
  color: var(--text-primary);
}

.audit-log-section {
  margin-top: 40px;
  padding-top: 30px;
  border-top: 2px solid var(--border);
}

.loading-small {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}
</style>

