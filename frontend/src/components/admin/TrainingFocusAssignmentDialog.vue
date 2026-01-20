<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>Assign Training Focus: {{ trainingFocus.name }}</h2>
        <button @click="$emit('close')" class="btn-close">×</button>
      </div>

      <div class="preview-section">
        <h3>Training Focus Preview</h3>
        <p><strong>Description:</strong> {{ trainingFocus.description || 'No description' }}</p>
        <p><strong>Modules:</strong> {{ modules.length }} modules will be assigned</p>
        <div v-if="modules.length > 0" class="modules-preview">
          <h4>Modules included:</h4>
          <ul>
            <li v-for="module in modules" :key="module.id">
              {{ module.title }} ({{ module.estimated_time_minutes || 0 }} min)
            </li>
          </ul>
        </div>
      </div>

      <form @submit.prevent="handleAssign">
        <div class="form-group">
          <label>Agency *</label>
          <select v-model="selectedAgencyId" required @change="fetchUsers">
            <option value="">Select an agency</option>
            <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
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

        <div class="form-group">
          <label>Due Date (Optional)</label>
          <input v-model="dueDate" type="datetime-local" />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="assigning || !isFormValid">
            {{ assigning ? 'Assigning...' : 'Assign Training Focus' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  trainingFocus: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close', 'assigned']);

const agencyStore = useAgencyStore();

const agencies = ref([]);
const availableUsers = ref([]);
const selectedAgencyId = ref('');
const selectedUserIds = ref([]);
const dueDate = ref('');
const modules = ref([]);
const assigning = ref(false);
const error = ref('');

const isFormValid = computed(() => {
  return selectedAgencyId.value && selectedUserIds.value.length > 0;
});

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    agencies.value = response.data;
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
  }
};

const fetchUsers = async () => {
  if (!selectedAgencyId.value) {
    availableUsers.value = [];
    return;
  }
  
  try {
    const response = await api.get(`/agencies/${selectedAgencyId.value}/users`);
    availableUsers.value = response.data;
  } catch (err) {
    console.error('Failed to fetch users:', err);
    error.value = 'Failed to load users for this agency';
  }
};

const fetchModules = async () => {
  try {
    const response = await api.get(`/training-focuses/${props.trainingFocus.id}/modules`);
    modules.value = response.data;
  } catch (err) {
    console.error('Failed to fetch modules:', err);
  }
};

const handleAssign = async () => {
  if (!isFormValid.value) {
    error.value = 'Please select an agency and at least one user';
    return;
  }

  try {
    assigning.value = true;
    error.value = '';

    const payload = {
      userIds: selectedUserIds.value,
      agencyId: selectedAgencyId.value
    };
    // Only send dueDate when explicitly set, so re-opening this dialog doesn't
    // unintentionally overwrite existing due dates.
    if (dueDate.value) {
      payload.dueDate = new Date(dueDate.value).toISOString();
    }

    await api.post(`/training-focuses/${props.trainingFocus.id}/assign`, payload);

    emit('assigned');
    emit('close');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to assign training focus';
  } finally {
    assigning.value = false;
  }
};

onMounted(async () => {
  await fetchAgencies();
  await fetchModules();
  if (agencyStore.userAgencies?.length > 0) {
    selectedAgencyId.value = agencyStore.userAgencies[0].id;
    await fetchUsers();
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

.preview-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.preview-section h3 {
  margin-top: 0;
  margin-bottom: 12px;
}

.modules-preview {
  margin-top: 12px;
}

.modules-preview h4 {
  margin: 8px 0;
  font-size: 14px;
}

.modules-preview ul {
  margin: 8px 0;
  padding-left: 20px;
}

.modules-preview li {
  margin: 4px 0;
  font-size: 14px;
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

.form-group select,
.form-group input {
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
  gap: 8px;
  font-weight: normal;
  cursor: pointer;
}

.user-checkbox input[type="checkbox"] {
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

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>

