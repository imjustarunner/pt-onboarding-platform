<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <h3>{{ title }}</h3>
      
      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <div class="form-group">
        <label>Agency *</label>
        <select v-model="selectedAgencyId" @change="fetchPublicAssignments" required>
          <option value="">Select an agency</option>
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>

      <div v-if="selectedAgencyId" class="assignments-section">
        <h4>Current On-Demand Assignments</h4>
        <div v-if="loadingAssignments" class="loading">Loading assignments...</div>
        <div v-else-if="currentAssignments.length === 0" class="empty-state">
          No on-demand assignments for this agency.
        </div>
        <div v-else class="assignments-list">
          <div
            v-for="assignment in currentAssignments"
            :key="assignment.id"
            class="assignment-item"
          >
            <span>{{ assignment.training_focus_name || assignment.module_title }}</span>
            <button
              @click="removeAssignment(assignment.id)"
              class="btn btn-sm btn-danger"
              :disabled="removing"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div class="form-group">
        <button
          v-if="isAlreadyAssigned"
          type="button"
          @click="removeCurrentAssignment"
          class="btn btn-danger"
          :disabled="!selectedAgencyId || removing"
        >
          {{ removing ? 'Removing...' : 'Remove as On-Demand' }}
        </button>
        <button
          v-else
          type="button"
          @click="assignToAgency"
          class="btn btn-primary"
          :disabled="!selectedAgencyId || assigning"
        >
          {{ assigning ? 'Assigning...' : 'Assign as On-Demand' }}
        </button>
      </div>

      <div class="modal-actions">
        <button type="button" @click="close" class="btn btn-secondary">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: (value) => ['training-focus', 'module'].includes(value)
  },
  itemId: {
    type: Number,
    required: true
  },
  itemName: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'assigned']);

const agencyStore = useAgencyStore();
const agencies = ref([]);
const selectedAgencyId = ref('');
const currentAssignments = ref([]);
const loadingAssignments = ref(false);
const assigning = ref(false);
const removing = ref(false);
const error = ref('');

const title = computed(() => {
  return props.type === 'training-focus' 
    ? `Assign Training Focus as On-Demand: ${props.itemName}`
    : `Assign Module as On-Demand: ${props.itemName}`;
});

const isAlreadyAssigned = computed(() => {
  if (!selectedAgencyId.value || currentAssignments.value.length === 0) {
    return false;
  }
  
  if (props.type === 'training-focus') {
    return currentAssignments.value.some(assignment => assignment.training_focus_id === props.itemId);
  } else {
    return currentAssignments.value.some(assignment => assignment.module_id === props.itemId);
  }
});

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    agencies.value = response.data;
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
    error.value = 'Failed to load agencies';
  }
};

const fetchPublicAssignments = async () => {
  if (!selectedAgencyId.value) {
    currentAssignments.value = [];
    return;
  }

  try {
    loadingAssignments.value = true;
    const response = await api.get(`/agency-on-demand-training/${selectedAgencyId.value}`);
    
    if (props.type === 'training-focus') {
      currentAssignments.value = response.data.trainingFocuses || [];
    } else {
      currentAssignments.value = response.data.modules || [];
    }
  } catch (err) {
    console.error('Failed to fetch public assignments:', err);
    error.value = 'Failed to load current assignments';
  } finally {
    loadingAssignments.value = false;
  }
};

const assignToAgency = async () => {
  if (!selectedAgencyId.value) {
    error.value = 'Please select an agency';
    return;
  }

  try {
    assigning.value = true;
    error.value = '';

    const endpoint = props.type === 'training-focus' 
      ? '/agency-on-demand-training/training-focus'
      : '/agency-on-demand-training/module';

    await api.post(endpoint, {
      agencyId: selectedAgencyId.value,
      [props.type === 'training-focus' ? 'trainingFocusId' : 'moduleId']: props.itemId
    });

    await fetchPublicAssignments();
    emit('assigned');
    alert('Assigned as on-demand successfully');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to assign as public';
  } finally {
    assigning.value = false;
  }
};

const removeAssignment = async (assignmentId) => {
  if (!confirm('Are you sure you want to remove this on-demand assignment?')) {
    return;
  }

  try {
    removing.value = true;
    error.value = '';

    const endpoint = props.type === 'training-focus'
      ? `/agency-on-demand-training/training-focus/${assignmentId}?agencyId=${selectedAgencyId.value}`
      : `/agency-on-demand-training/module/${assignmentId}?agencyId=${selectedAgencyId.value}`;

    await api.delete(endpoint);
    await fetchPublicAssignments();
    emit('assigned');
    alert('Removed from on-demand assignments successfully');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to remove assignment';
  } finally {
    removing.value = false;
  }
};

const removeCurrentAssignment = async () => {
  if (!selectedAgencyId.value) {
    error.value = 'Please select an agency';
    return;
  }

  // Find the assignment for the current item
  const assignment = currentAssignments.value.find(a => 
    props.type === 'training-focus' 
      ? a.training_focus_id === props.itemId
      : a.module_id === props.itemId
  );

  if (!assignment) {
    error.value = 'Assignment not found';
    return;
  }

  await removeAssignment(assignment.id);
};

const close = () => {
  emit('close');
};

onMounted(async () => {
  await fetchAgencies();
  if (agencyStore.userAgencies?.length > 0) {
    selectedAgencyId.value = agencyStore.userAgencies[0].id;
    await fetchPublicAssignments();
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
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 24px 0;
  color: var(--text-primary);
}

.error-message {
  padding: 12px;
  background: #fee2e2;
  border-radius: 6px;
  color: #991b1b;
  margin-bottom: 16px;
}

.assignments-section {
  margin: 24px 0;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.assignments-section h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: var(--text-primary);
}

.assignments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assignment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>

