<template>
  <div class="supervisor-assignment-manager">
    <div class="section-header">
      <h3>Supervisor Assignments</h3>
      <p class="section-description">Assign users to supervisors within agencies. Supervisors can only view and manage their assigned supervisees.</p>
    </div>

    <div v-if="loading" class="loading">Loading assignments...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <!-- Filter by Agency -->
      <div class="filters" style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Filter by Agency:</label>
        <select v-model="selectedAgencyId" @change="fetchAssignments" style="padding: 8px; border: 1px solid var(--border); border-radius: 6px; min-width: 200px;">
          <option value="">All Agencies</option>
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>

      <!-- Current Assignments -->
      <div class="assignments-section" style="margin-bottom: 32px;">
        <h4 style="margin-bottom: 16px;">Current Assignments</h4>
        <div v-if="assignments.length === 0" class="empty-state">
          <p>No supervisor assignments found.</p>
        </div>
        <div v-else class="assignments-table">
          <table style="width: 100%; border-collapse: collapse;">
            <thead style="background: #f8f9fa;">
              <tr>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Supervisor</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Supervisee</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Agency</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Primary</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Assigned</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="assignment in assignments" :key="assignment.id" style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px;">
                  {{ assignment.supervisor_first_name }} {{ assignment.supervisor_last_name }}
                  <br>
                  <small style="color: var(--text-secondary);">{{ assignment.supervisor_email }}</small>
                </td>
                <td style="padding: 12px;">
                  {{ assignment.supervisee_first_name }} {{ assignment.supervisee_last_name }}
                  <br>
                  <small style="color: var(--text-secondary);">{{ assignment.supervisee_email }}</small>
                </td>
                <td style="padding: 12px;">{{ assignment.agency_name }}</td>
                <td style="padding: 12px;">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="settingPrimary"
                    @click="setPrimary(assignment)"
                    :title="assignment.is_primary ? 'Primary supervisor' : 'Set as primary supervisor'"
                  >
                    {{ assignment.is_primary ? 'Primary' : 'Set primary' }}
                  </button>
                </td>
                <td style="padding: 12px;">{{ formatDate(assignment.created_at) }}</td>
                <td style="padding: 12px;">
                  <button 
                    @click="removeAssignment(assignment.id)" 
                    class="btn btn-danger btn-sm"
                    :disabled="removing"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create New Assignment -->
      <div class="create-assignment-section">
        <h4 style="margin-bottom: 16px;">Create New Assignment</h4>
        <div class="assignment-form" style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="display: block; margin-bottom: 6px; font-weight: 500;">Supervisor</label>
              <select v-model="newAssignment.supervisorId" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
                <option value="">Select a supervisor...</option>
                <option v-for="supervisor in supervisors" :key="supervisor.id" :value="supervisor.id">
                  {{ supervisor.first_name }} {{ supervisor.last_name }} ({{ supervisor.email }})
                </option>
              </select>
            </div>
            <div v-if="!props.superviseeId">
              <label style="display: block; margin-bottom: 6px; font-weight: 500;">Supervisee</label>
              <select v-model="newAssignment.superviseeId" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
                <option value="">Select a user...</option>
                <option v-for="user in availableUsers" :key="user.id" :value="user.id">
                  {{ user.first_name }} {{ user.last_name }} ({{ user.email }})
                </option>
              </select>
            </div>
            <div v-else>
              <label style="display: block; margin-bottom: 6px; font-weight: 500;">Supervisee</label>
              <input 
                type="text" 
                :value="superviseeDisplayName" 
                readonly 
                style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: #f5f5f5;"
              />
              <small style="color: var(--text-secondary); font-size: 12px;">This user is automatically selected</small>
            </div>
            <div>
              <label style="display: block; margin-bottom: 6px; font-weight: 500;">Agency</label>
              <select v-model="newAssignment.agencyId" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
                <option value="">Select an agency...</option>
                <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
                  {{ agency.name }}
                </option>
              </select>
            </div>
          </div>
          <button 
            @click="createAssignment" 
            class="btn btn-primary"
            :disabled="!canCreateAssignment || creating"
          >
            {{ creating ? 'Creating...' : 'Create Assignment' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { isSupervisor } from '../../utils/helpers.js';

const props = defineProps({
  supervisorId: {
    type: Number,
    default: null
  },
  superviseeId: {
    type: Number,
    default: null
  },
  agencyId: {
    type: Number,
    default: null
  }
});

const authStore = useAuthStore();
const loading = ref(true);
const error = ref('');
const assignments = ref([]);
const agencies = ref([]);
const supervisors = ref([]);
const availableUsers = ref([]);
const selectedAgencyId = ref(props.agencyId || '');
const creating = ref(false);
const removing = ref(false);
const settingPrimary = ref(false);

const newAssignment = ref({
  supervisorId: props.supervisorId || '',
  superviseeId: props.superviseeId || '',
  agencyId: props.agencyId || ''
});

// Auto-fill supervisee if prop is provided
if (props.superviseeId) {
  newAssignment.value.superviseeId = props.superviseeId;
}

const superviseeUser = ref(null);

const superviseeDisplayName = computed(() => {
  if (!props.superviseeId) return '';
  if (superviseeUser.value) {
    return `${superviseeUser.value.first_name} ${superviseeUser.value.last_name} (${superviseeUser.value.email})`;
  }
  const user = availableUsers.value.find(u => u.id === props.superviseeId);
  if (user) {
    return `${user.first_name} ${user.last_name} (${user.email})`;
  }
  return 'Loading...';
});

const canCreateAssignment = computed(() => {
  return newAssignment.value.supervisorId && 
         newAssignment.value.superviseeId && 
         newAssignment.value.agencyId;
});

const fetchAgencies = async () => {
  try {
    // If a target user is provided (supervisee/supervisor), fetch that user's agencies.
    // Otherwise, fall back to the current user's agencies.
    const targetUserId = props.superviseeId || props.supervisorId || null;
    if (targetUserId) {
      const response = await api.get(`/users/${targetUserId}/agencies`);
      agencies.value = response.data || [];
      // Auto-select first agency if only one
      if (agencies.value.length === 1 && !newAssignment.value.agencyId) {
        newAssignment.value.agencyId = agencies.value[0].id;
      }
    } else {
      // Fetch current user's agencies
      const response = await api.get('/users/me/agencies');
      agencies.value = response.data || [];
    }
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
    agencies.value = [];
  }
};

const fetchSupervisors = async () => {
  try {
    const response = await api.get('/users');
    // Filter to supervisors using has_supervisor_privileges as source of truth
    supervisors.value = response.data.filter(u => isSupervisor(u));
    
    // Filter by agency if one is selected and we have supervisee agencies
    if (newAssignment.value.agencyId && agencies.value.length > 0) {
      const agencyIds = agencies.value.map(a => a.id);
      supervisors.value = supervisors.value.filter(supervisor => {
        // Check if supervisor belongs to any of the supervisee's agencies
        // We'll need to check this via the supervisor's agencies
        // For now, show all supervisors - backend will validate agency membership
        return true;
      });
    }
  } catch (err) {
    console.error('Failed to fetch supervisors:', err);
    supervisors.value = [];
  }
};

const fetchAvailableUsers = async () => {
  try {
    const response = await api.get('/users');
    // Filter to staff, facilitator, intern, admin
    let users = response.data.filter(u => 
      ['staff', 'facilitator', 'intern', 'admin'].includes(u.role)
    );
    
    // If we have agencies (from supervisee), filter users by those agencies
    if (agencies.value.length > 0) {
      const agencyIds = agencies.value.map(a => a.id);
      // Users from API may have agency_ids as comma-separated string or array
      users = users.filter(user => {
        if (user.agency_ids) {
          const userAgencyIds = typeof user.agency_ids === 'string' 
            ? user.agency_ids.split(',').map(id => parseInt(id.trim()))
            : user.agency_ids;
          return userAgencyIds.some(id => agencyIds.includes(id));
        }
        // If no agency_ids field, include them (backend will validate)
        return true;
      });
    }
    
    availableUsers.value = users;
  } catch (err) {
    console.error('Failed to fetch users:', err);
    availableUsers.value = [];
  }
};

const fetchAssignments = async () => {
  try {
    loading.value = true;
    error.value = '';

    if (props.supervisorId) {
      // Fetch assignments for a specific supervisor
      const response = await api.get(`/supervisor-assignments/supervisor/${props.supervisorId}`, {
        params: { agencyId: selectedAgencyId.value || undefined }
      });
      assignments.value = response.data;
    } else if (props.superviseeId) {
      // Fetch assignments for a specific supervisee
      const response = await api.get(`/supervisor-assignments/supervisee/${props.superviseeId}`, {
        params: { agencyId: selectedAgencyId.value || undefined }
      });
      assignments.value = response.data;
    } else if (selectedAgencyId.value) {
      // Fetch assignments for a specific agency
      const response = await api.get(`/supervisor-assignments/agency/${selectedAgencyId.value}`);
      assignments.value = response.data;
    } else {
      // Fetch all assignments (if user has access)
      // For now, we'll need to fetch by agency
      assignments.value = [];
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load assignments';
  } finally {
    loading.value = false;
  }
};

const setPrimary = async (assignment) => {
  if (!assignment?.supervisor_id || !assignment?.supervisee_id || !assignment?.agency_id) return;
  try {
    settingPrimary.value = true;
    await api.post('/supervisor-assignments/primary', {
      supervisorId: Number(assignment.supervisor_id),
      superviseeId: Number(assignment.supervisee_id),
      agencyId: Number(assignment.agency_id)
    });
    await fetchAssignments();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to set primary supervisor');
  } finally {
    settingPrimary.value = false;
  }
};

const createAssignment = async () => {
  if (!canCreateAssignment.value) {
    alert('Please fill in all fields');
    return;
  }

  try {
    creating.value = true;
    await api.post('/supervisor-assignments', {
      supervisorId: parseInt(newAssignment.value.supervisorId),
      superviseeId: parseInt(newAssignment.value.superviseeId),
      agencyId: parseInt(newAssignment.value.agencyId),
      isPrimary: false
    });
    
    // Reset form
    newAssignment.value = {
      supervisorId: props.supervisorId || '',
      superviseeId: props.superviseeId || '',
      agencyId: props.agencyId || ''
    };
    
    await fetchAssignments();
    alert('Assignment created successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to create assignment');
  } finally {
    creating.value = false;
  }
};

const removeAssignment = async (assignmentId) => {
  if (!confirm('Are you sure you want to remove this assignment?')) {
    return;
  }

  try {
    removing.value = true;
    await api.delete(`/supervisor-assignments/${assignmentId}`);
    await fetchAssignments();
    alert('Assignment removed successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to remove assignment');
  } finally {
    removing.value = false;
  }
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString();
};

// Watch for agency selection to filter available users
watch(() => newAssignment.value.agencyId, async (newAgencyId) => {
  if (newAgencyId) {
    await fetchAvailableUsers();
  }
});

// Watch for supervisee prop changes
watch(() => props.superviseeId, async (newSuperviseeId) => {
  if (newSuperviseeId) {
    newAssignment.value.superviseeId = newSuperviseeId;
    // Fetch the supervisee user data
    try {
      const response = await api.get(`/users/${newSuperviseeId}`);
      superviseeUser.value = response.data;
    } catch (err) {
      console.error('Failed to fetch supervisee user:', err);
    }
    await fetchAgencies();
    await fetchAvailableUsers();
  }
});

onMounted(async () => {
  // If superviseeId prop is provided, fetch that user's data
  if (props.superviseeId) {
    try {
      const response = await api.get(`/users/${props.superviseeId}`);
      superviseeUser.value = response.data;
    } catch (err) {
      console.error('Failed to fetch supervisee user:', err);
    }
  }
  
  // Fetch agencies first (needed for filtering)
  await fetchAgencies();
  // Then fetch other data
  await Promise.all([
    fetchSupervisors(),
    fetchAvailableUsers(),
    fetchAssignments()
  ]);
});
</script>

<style scoped>
.supervisor-assignment-manager {
  padding: 20px;
}

.section-header {
  margin-bottom: 24px;
}

.section-header h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
}

.section-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.assignments-table {
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.btn-sm {
  padding: 4px 12px;
  font-size: 12px;
}

.loading, .error {
  padding: 20px;
  text-align: center;
}

.error {
  color: #dc3545;
}
</style>
