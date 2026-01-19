<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content large" @click.stop>
      <h2>Assign Module: {{ module?.title || 'Unknown' }}</h2>
      <div v-if="!module || !module.id" class="error-message">
        Invalid module. Please close and select a valid module.
      </div>
      
      <form v-if="module && module.id" @submit.prevent="handleAssign">
        <div class="form-group">
          <label>Assign To *</label>
          <select v-model="assignmentType" @change="resetAssignment">
            <option value="user">Individual User(s)</option>
            <option value="role">Role</option>
            <option v-if="userRole === 'super_admin'" value="agency">Agency (All Users)</option>
          </select>
        </div>

        <div v-if="assignmentType === 'user'" class="form-group">
          <label>Select Users *</label>
          <div class="user-selector">
            <div v-for="user in availableUsers" :key="user.id" class="user-checkbox">
              <label>
                <input
                  type="checkbox"
                  :value="user.id"
                  v-model="selectedUserIds"
                />
                {{ user.first_name }} {{ user.last_name }} ({{ user.email }})
              </label>
            </div>
          </div>
          <small v-if="selectedUserIds.length > 0">{{ selectedUserIds.length }} user(s) selected</small>
        </div>

        <div v-if="assignmentType === 'role'" class="form-group">
          <label>Role *</label>
          <select v-model="selectedRole" required>
            <option value="">Select a role</option>
            <option value="support">Staff</option>
            <option value="supervisor">Supervisor</option>
            <option value="staff">Onboarding Staff</option>
            <option value="provider">Provider</option>
            <option value="school_staff">School Staff</option>
            <option value="facilitator">Facilitator</option>
            <option value="intern">Intern</option>
          </select>
        </div>

        <div v-if="assignmentType === 'role' || assignmentType === 'agency'" class="form-group">
          <label>Agency *</label>
          <select v-model="selectedAgencyId" required>
            <option value="">Select an agency</option>
            <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>

        <div v-if="assignmentType === 'agency'" class="form-group">
          <label>Role Filter (Optional)</label>
          <select v-model="selectedRole">
            <option value="">All roles</option>
            <option value="supervisor">Supervisor</option>
            <option value="provider">Provider</option>
            <option value="school_staff">School Staff</option>
            <option value="facilitator">Facilitator</option>
            <option value="intern">Intern</option>
          </select>
        </div>

        <div class="form-group">
          <label>Due Date (Optional)</label>
          <input v-model="dueDate" type="datetime-local" />
        </div>

        <div class="form-group">
          <label>Title *</label>
          <input v-model="taskTitle" type="text" required :placeholder="`Complete ${module.title}`" />
        </div>

        <div class="form-group">
          <label>Description</label>
          <textarea v-model="taskDescription" rows="3" :placeholder="module.description || 'Please complete this training module.'"></textarea>
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="assigning || !isFormValid">
            {{ assigning ? 'Assigning...' : 'Assign Module' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  module: {
    type: Object,
    required: true
  },
  preSelectedUserId: {
    type: Number,
    default: null
  }
});

const emit = defineEmits(['close', 'assigned']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const assignmentType = ref('user');
const selectedUserIds = ref([]);
const selectedRole = ref('');
const selectedAgencyId = ref('');
const dueDate = ref('');
const taskTitle = ref('');
const taskDescription = ref('');
const availableUsers = ref([]);
const availableAgencies = ref([]);
const assigning = ref(false);
const error = ref('');

const userRole = computed(() => authStore.user?.role);

const isFormValid = computed(() => {
  if (!taskTitle.value) return false;
  
  if (assignmentType.value === 'user') {
    return selectedUserIds.value.length > 0;
  } else if (assignmentType.value === 'role') {
    return selectedRole.value && selectedAgencyId.value;
  } else if (assignmentType.value === 'agency') {
    return selectedAgencyId.value;
  }
  return false;
});

const resetAssignment = () => {
  selectedUserIds.value = [];
  selectedRole.value = '';
  selectedAgencyId.value = '';
};

const fetchUsers = async () => {
  try {
    const response = await api.get('/users');
    availableUsers.value = response.data;
  } catch (err) {
    console.error('Failed to fetch users:', err);
  }
};

const fetchAgencies = async () => {
  try {
    if (userRole.value === 'super_admin') {
      const response = await api.get('/agencies');
      availableAgencies.value = response.data;
    } else {
      // Agency Admin - use their agencies
      await agencyStore.fetchUserAgencies();
      availableAgencies.value = agencyStore.userAgencies || [];
    }
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
  }
};

const handleAssign = async () => {
  if (!isFormValid.value) {
    error.value = 'Please fill in all required fields';
    return;
  }

  try {
    assigning.value = true;
    error.value = '';

    const taskData = {
      taskType: 'training',
      title: taskTitle.value || `Complete ${props.module.title}`,
      description: taskDescription.value || props.module.description || 'Please complete this training module.',
      referenceId: parseInt(props.module.id), // Module ID
      dueDate: dueDate.value || null
    };

    if (assignmentType.value === 'user') {
      // Assign to individual users
      if (!selectedUserIds.value || selectedUserIds.value.length === 0) {
        error.value = 'Please select at least one user';
        assigning.value = false;
        return;
      }
      
      const assignmentPromises = selectedUserIds.value.map(async (userId) => {
        const userIdNum = parseInt(userId);
        if (isNaN(userIdNum)) {
          throw new Error(`Invalid user ID: ${userId}`);
        }
        
        try {
          const response = await api.post('/tasks', {
            ...taskData,
            assignedToUserId: userIdNum
          });
          
          if (!response.data || !response.data.id) {
            throw new Error('Task was created but no ID was returned');
          }
          
          console.log(`Successfully assigned module task ${response.data.id} to user ${userIdNum}`);
          return response.data;
        } catch (err) {
          console.error(`Failed to assign to user ${userIdNum}:`, err);
          const errorMsg = err.response?.data?.error?.message || err.message || 'Unknown error';
          throw new Error(`Failed to assign to user ${userIdNum}: ${errorMsg}`);
        }
      });
      
      await Promise.all(assignmentPromises);
    } else if (assignmentType.value === 'role') {
      // Bulk assign to role in agency
      await api.post('/tasks/bulk', {
        ...taskData,
        assignedToRole: selectedRole.value,
        assignedToAgencyId: parseInt(selectedAgencyId.value)
      });
    } else if (assignmentType.value === 'agency') {
      // Bulk assign to agency (optionally filtered by role)
      await api.post('/tasks/bulk', {
        ...taskData,
        assignedToAgencyId: parseInt(selectedAgencyId.value),
        assignedToRole: selectedRole.value || null
      });
    }

    emit('assigned');
    emit('close');
  } catch (err) {
    console.error('Assignment error:', err);
    error.value = err.response?.data?.error?.message || err.message || 'Failed to assign module';
  } finally {
    assigning.value = false;
  }
};

onMounted(async () => {
  // Validate module exists
  if (!props.module || !props.module.id) {
    error.value = 'Invalid module. Please select a valid training module.';
    return;
  }

  taskTitle.value = `Complete ${props.module.title}`;
  taskDescription.value = props.module.description || 'Please complete this training module.';
  
  // Pre-select user if provided
  if (props.preSelectedUserId) {
    selectedUserIds.value = [props.preSelectedUserId];
    assignmentType.value = 'user';
  }
  
  await fetchUsers();
  await fetchAgencies();
  if (agencyStore.userAgencies?.length > 0) {
    selectedAgencyId.value = agencyStore.userAgencies[0].id;
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

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content.large {
  max-width: 800px;
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

.user-selector {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.user-checkbox {
  padding: 8px 0;
}

.user-checkbox label {
  display: flex;
  align-items: center;
  font-weight: normal;
  cursor: pointer;
}

.user-checkbox input[type="checkbox"] {
  width: auto;
  margin-right: 8px;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.error-message {
  color: #dc3545;
  margin-bottom: 16px;
  padding: 12px;
  background: #f8d7da;
  border-radius: 8px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>

