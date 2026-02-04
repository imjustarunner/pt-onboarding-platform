<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content large" @click.stop>
      <h2>Assign Document: {{ template?.name || 'Unknown' }}</h2>
      <div v-if="!template || !template.id" class="error-message">
        Invalid template. Please close and select a valid document.
      </div>
      
      <div v-if="template && template.id && template.template_type === 'html'" class="info-box" style="padding: 12px; background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 4px; margin-bottom: 16px;">
        <p><strong>Personalized Document Generation</strong></p>
        <p style="font-size: 13px; margin-top: 4px;">
          When you assign this template, a personalized copy will be generated for each user with template variables (like {{AGENCY_NAME}}, {{USER_FULL_NAME}}) automatically replaced with their specific information.
        </p>
      </div>
      
      <form v-if="template && template.id" @submit.prevent="handleAssign">
        <div class="form-group">
          <label>Assign To *</label>
          <select v-model="assignmentType" @change="resetAssignment">
            <option value="user">Individual User(s)</option>
            <option value="role">Role</option>
            <option v-if="userRole === 'super_admin'" value="agency">Agency (All Users)</option>
          </select>
        </div>

        <div v-if="assignmentType === 'user'">
          <div class="form-group">
            <label>Agency *</label>
            <select 
              v-model="selectedAgencyId" 
              @change="handleAgencyChange" 
              required
              :disabled="isAgencySpecific"
            >
              <option value="">Select an agency</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
            <small v-if="isAgencySpecific">
              This document is assigned to this agency and cannot be assigned to other agencies.
            </small>
            <small v-else>Select the agency context for this assignment</small>
          </div>
          
          <div class="form-group">
            <label>Select Users *</label>
            <div v-if="!selectedAgencyId" class="info-message">
              Please select an agency first to see available users
            </div>
            <div v-else class="user-selector">
              <input
                v-model="userSearchQuery"
                type="text"
                class="user-search"
                placeholder="Type a name or email to filter..."
              />
              <div v-for="user in searchedUsers" :key="user.id" class="user-checkbox">
                <label>
                  <input
                    type="checkbox"
                    :value="user.id"
                    v-model="selectedUserIds"
                  />
                  {{ getUserLabel(user) }}
                </label>
              </div>
              <div v-if="searchedUsers.length === 0" class="info-message">
                No users found in this agency
              </div>
            </div>
            <small v-if="selectedUserIds.length > 0">{{ selectedUserIds.length }} user(s) selected</small>
          </div>
        </div>

        <div v-if="assignmentType === 'role'" class="form-group">
          <label>Role *</label>
          <select v-model="selectedRole" required>
            <option value="">Select a role</option>
            <option value="supervisor">Supervisor</option>
            <option value="provider">Provider</option>
            <option value="school_staff">School Staff</option>
            <option value="facilitator">Facilitator</option>
            <option value="intern">Intern</option>
          </select>
        </div>

        <div v-if="assignmentType === 'role' || assignmentType === 'agency'" class="form-group">
          <label>Agency *</label>
          <select 
            v-model="selectedAgencyId" 
            required
            :disabled="isAgencySpecific"
          >
            <option value="">Select an agency</option>
            <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
          <small v-if="template?.agency_id !== null && template?.agency_id !== undefined">
            This document is assigned to this agency and cannot be assigned to other agencies.
          </small>
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
          <label>Document Action Type</label>
          <div class="info-box" style="padding: 12px; background: #f0f4ff; border: 1px solid #b3d9ff; border-radius: 4px;">
            <strong>{{ template.document_action_type === 'signature' ? 'Require Electronic Signature' : 'Review/Acknowledgment Only' }}</strong>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #666;">
              This was set when the document was uploaded and cannot be changed.
            </p>
          </div>
        </div>

        <div class="form-group">
          <label>Due Date (Optional)</label>
          <input v-model="dueDate" type="datetime-local" />
          <small style="color: #666; font-size: 12px;">Optional - Leave blank if no due date needed</small>
        </div>

        <div class="form-group">
          <label>Title *</label>
          <input v-model="taskTitle" type="text" required :placeholder="documentActionType.value === 'signature' ? `Sign ${template.name}` : `Review ${template.name}`" />
        </div>

        <div class="form-group">
          <label>Description</label>
          <textarea v-model="taskDescription" rows="3" :placeholder="template.description"></textarea>
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="assigning || !isFormValid">
            {{ assigning ? 'Assigning...' : 'Assign Document' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  template: {
    type: Object,
    required: true
  },
  preSelectedUserId: {
    type: Number,
    default: null
  }
});

const emit = defineEmits(['close', 'assigned']);

const tasksStore = useTasksStore();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const assignmentType = ref('user');
const selectedUserIds = ref([]);
const selectedRole = ref('');
const selectedAgencyId = ref('');
const dueDate = ref('');
const taskTitle = ref('');
const taskDescription = ref('');
const documentActionType = computed(() => props.template?.document_action_type || 'signature');
const availableUsers = ref([]);
const filteredUsers = ref([]);
const availableAgencies = ref([]);
const assigning = ref(false);
const error = ref('');
const userSearchQuery = ref('');

const userRole = computed(() => authStore.user?.role);
const isAgencySpecific = computed(() => props.template?.agency_id !== null && props.template?.agency_id !== undefined);

const searchedUsers = computed(() => {
  const q = String(userSearchQuery.value || '').trim().toLowerCase();
  if (!q) return filteredUsers.value;
  return filteredUsers.value.filter((u) => getUserLabel(u).toLowerCase().includes(q));
});

const isFormValid = computed(() => {
  if (!taskTitle.value || !documentActionType.value) return false; // documentActionType is computed, .value is correct
  
  if (assignmentType.value === 'user') {
    return selectedUserIds.value.length > 0 && selectedAgencyId.value;
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
  filteredUsers.value = [];
};

const fetchUsers = async () => {
  // For individual user assignment, we'll fetch users based on selected agency
  // This is handled by fetchUsersForAgency
  if (selectedAgencyId.value) {
    await fetchUsersForAgency();
  }
};

const handleAgencyChange = async () => {
  // Clear selected users when agency changes
  selectedUserIds.value = [];
  await fetchUsersForAgency();
};

const fetchUsersForAgency = async () => {
  if (!selectedAgencyId.value) {
    filteredUsers.value = [];
    return;
  }
  
  try {
    const response = await api.get(`/agencies/${selectedAgencyId.value}/users`);
    // Safety net: some deployments returned mixed key casing; normalize + filter archived just in case
    const users = Array.isArray(response.data) ? response.data : [];
    filteredUsers.value = users.filter((u) => !(u?.is_archived === true || u?.is_archived === 1 || u?.status === 'ARCHIVED'));
  } catch (err) {
    console.error('Failed to fetch users for agency:', err);
    filteredUsers.value = [];
    error.value = 'Failed to load users for selected agency';
  }
};

const getUserLabel = (user) => {
  const first = user?.first_name ?? user?.firstName ?? '';
  const last = user?.last_name ?? user?.lastName ?? '';
  const email = user?.email ?? '';
  const name = `${first} ${last}`.trim();
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return `User #${user?.id ?? ''}`.trim();
};

const fetchAgencies = async () => {
  try {
    let allAgencies = [];
    
    if (userRole.value === 'super_admin') {
      const response = await api.get('/agencies');
      allAgencies = response.data || [];
    } else {
      // Agency Admin - use their agencies
      await agencyStore.fetchUserAgencies();
      allAgencies = agencyStore.userAgencies || [];
    }
    
    // If template is agency-specific, only show that agency
    if (props.template?.agency_id !== null && props.template?.agency_id !== undefined) {
      const templateAgencyId = props.template.agency_id;
      availableAgencies.value = allAgencies.filter(agency => agency.id === templateAgencyId);
      
      // Set the agency as default
      if (availableAgencies.value.length > 0) {
        selectedAgencyId.value = templateAgencyId.toString();
      }
    } else {
      // Platform template - show all agencies the user has access to
      availableAgencies.value = allAgencies;
    }
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
    availableAgencies.value = [];
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

    // Convert datetime-local to ISO 8601 format if provided, otherwise null
    let dueDateISO = null;
    if (dueDate.value && dueDate.value.trim() !== '') {
      // datetime-local format is YYYY-MM-DDTHH:mm
      // Convert to ISO 8601 format: YYYY-MM-DDTHH:mm:ss (or with timezone)
      // Parse the datetime-local value (it's in local time)
      const date = new Date(dueDate.value);
      // Format as ISO 8601: YYYY-MM-DDTHH:mm:ss
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss
      dueDateISO = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      console.log('Converted due date:', dueDate.value, '→', dueDateISO);
    }
    
    // Ensure referenceId is a valid integer
    const templateId = parseInt(props.template.id);
    if (isNaN(templateId)) {
      error.value = 'Invalid template ID';
      assigning.value = false;
      return;
    }
    
    const taskData = {
      taskType: 'document',
      documentActionType: documentActionType.value,
      title: taskTitle.value || (documentActionType.value === 'signature' ? `Sign ${props.template.name}` : `Review ${props.template.name}`),
      description: taskDescription.value || props.template.description || '',
      referenceId: templateId
    };
    
    // Only include dueDate if it's provided (optional field)
    if (dueDateISO) {
      taskData.dueDate = dueDateISO;
    }
    
    console.log('handleAssign: Task data to send:', taskData);

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
          const assignmentData = {
            ...taskData,
            assignedToUserId: userIdNum,
            assignedToAgencyId: selectedAgencyId.value ? parseInt(selectedAgencyId.value) : null
          };
          
          console.log(`Assigning task to user ${userIdNum} with data:`, assignmentData);
          
          const response = await api.post('/tasks', assignmentData);
          
          console.log(`Assignment response for user ${userIdNum}:`, response.data);
          
          if (!response.data || !response.data.id) {
            console.error(`Task creation response missing ID for user ${userIdNum}:`, response.data);
            throw new Error('Task was created but no ID was returned');
          }
          
          console.log(`✅ Successfully assigned task ${response.data.id} to user ${userIdNum}`);
          return response.data;
        } catch (err) {
          console.error(`❌ Failed to assign to user ${userIdNum}:`, err);
          console.error(`Error details:`, {
            message: err.message,
            response: err.response?.data,
            status: err.response?.status
          });
          const errorMsg = err.response?.data?.error?.message || err.message || 'Unknown error';
          throw new Error(`Failed to assign to user ${userIdNum}: ${errorMsg}`);
        }
      });
      
      const results = await Promise.all(assignmentPromises);
      console.log(`Successfully assigned ${results.length} document(s) to ${selectedUserIds.value.length} user(s)`);
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
    error.value = err.response?.data?.error?.message || err.message || 'Failed to assign document';
  } finally {
    assigning.value = false;
  }
};

onMounted(async () => {
  // Validate template exists
  if (!props.template || !props.template.id) {
    error.value = 'Invalid template. Please select a valid document template.';
    return;
  }

  taskTitle.value = documentActionType.value === 'review' ? `Review ${props.template.name}` : `Sign ${props.template.name}`;
  taskDescription.value = props.template.description || '';
  
  // Pre-select user if provided
  if (props.preSelectedUserId) {
    selectedUserIds.value = [props.preSelectedUserId];
    assignmentType.value = 'user';
    
    // Fetch the user's agencies to pre-select the first one
    try {
      const userAgenciesResponse = await api.get(`/users/${props.preSelectedUserId}/agencies`);
      if (userAgenciesResponse.data && userAgenciesResponse.data.length > 0) {
        // Pre-select the first agency the user belongs to
        selectedAgencyId.value = userAgenciesResponse.data[0].id;
      }
    } catch (err) {
      console.error('Failed to fetch user agencies:', err);
    }
  }
  
  await fetchAgencies();
  
  // If no agency selected yet (and no pre-selected user), use the first available agency
  // Note: fetchAgencies already sets the default if template is agency-specific
  if (!selectedAgencyId.value && availableAgencies.value.length > 0) {
    selectedAgencyId.value = availableAgencies.value[0].id.toString();
  }
  
  // Fetch users for the selected agency
  if (selectedAgencyId.value) {
    await fetchUsersForAgency();
  }
  
  // If template is agency-specific but that agency is not in available agencies, show error
  if (isAgencySpecific.value && availableAgencies.value.length === 0) {
    error.value = 'You do not have access to assign this agency-specific document.';
  }
  
  // After fetching users, ensure the pre-selected user is in the list and selected
  if (props.preSelectedUserId && filteredUsers.value.some(u => u.id === props.preSelectedUserId)) {
    selectedUserIds.value = [props.preSelectedUserId];
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
  background: white;
  color: var(--text-primary);
}

.form-group select option {
  color: var(--text-primary);
  background: white;
}

.user-selector {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.user-search {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 10px;
  font-size: 14px;
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

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.radio-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
  cursor: pointer;
}

.radio-group input[type="radio"] {
  width: auto;
  margin: 0;
}

.error-message {
  color: #dc3545;
  margin-bottom: 16px;
  padding: 12px;
  background: #f8d7da;
  border-radius: 8px;
}

.info-message {
  color: var(--text-secondary);
  padding: 12px;
  background: var(--bg-alt);
  border-radius: 8px;
  font-size: 14px;
  text-align: center;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>

