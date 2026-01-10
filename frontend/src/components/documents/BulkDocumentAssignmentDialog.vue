<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content large" @click.stop>
      <h2>Assign Documents to Users</h2>
      
      <form @submit.prevent="handleAssign">
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
          <label>Select Document Template(s) *</label>
          <div class="template-selector">
            <div v-for="template in availableTemplates" :key="template.id" class="template-checkbox">
              <label>
                <input
                  type="checkbox"
                  :value="template.id"
                  v-model="selectedTemplateIds"
                />
                {{ template.name }} ({{ template.template_type.toUpperCase() }})
                <span v-if="template.agency_id === null" class="badge badge-warning">Global</span>
              </label>
            </div>
          </div>
          <small v-if="selectedTemplateIds.length > 0">{{ selectedTemplateIds.length }} template(s) selected</small>
        </div>

        <div class="form-group">
          <label>Document Action Type</label>
          <div class="info-box" style="padding: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #856404;">
              <strong>Note:</strong> Each document template has its own action type (set when uploaded). 
              The action type from each template will be used automatically when assigning.
            </p>
          </div>
        </div>

        <div class="form-group">
          <label>Due Date (Optional)</label>
          <input v-model="dueDate" type="datetime-local" />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="assigning || !isFormValid">
            {{ assigning ? 'Assigning...' : 'Assign Documents' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useTasksStore } from '../../store/tasks';
import { useDocumentsStore } from '../../store/documents';
import api from '../../services/api';

const emit = defineEmits(['close', 'assigned']);

const tasksStore = useTasksStore();
const documentsStore = useDocumentsStore();

const availableUsers = ref([]);
const availableTemplates = ref([]);
const selectedUserIds = ref([]);
const selectedTemplateIds = ref([]);
const dueDate = ref('');
const assigning = ref(false);
const error = ref('');

const isFormValid = computed(() => {
  return selectedUserIds.value.length > 0 && selectedTemplateIds.value.length > 0;
});

const fetchUsers = async () => {
  try {
    const response = await api.get('/users');
    availableUsers.value = response.data;
  } catch (err) {
    console.error('Failed to fetch users:', err);
  }
};

const fetchTemplates = async () => {
  try {
    await documentsStore.fetchTemplates();
    availableTemplates.value = documentsStore.templates;
  } catch (err) {
    console.error('Failed to fetch templates:', err);
  }
};

const handleAssign = async () => {
  if (!isFormValid.value) {
    error.value = 'Please select at least one user and one template';
    return;
  }

  try {
    assigning.value = true;
    error.value = '';

    // Assign each template to each selected user
    for (const templateId of selectedTemplateIds.value) {
      const template = availableTemplates.value.find(t => t.id === templateId);
      const templateActionType = template.document_action_type || 'signature';
      for (const userId of selectedUserIds.value) {
        await tasksStore.assignTask({
          taskType: 'document',
          documentActionType: templateActionType, // Use template's action type
          title: templateActionType === 'signature' ? `Sign ${template.name}` : `Review ${template.name}`,
          description: template.description || '',
          referenceId: templateId,
          assignedToUserId: userId,
          dueDate: dueDate.value || null
        });
      }
    }

    emit('assigned');
    emit('close');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to assign documents';
  } finally {
    assigning.value = false;
  }
};

onMounted(async () => {
  await fetchUsers();
  await fetchTemplates();
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
  max-width: 900px;
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

.user-selector,
.template-selector {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.user-checkbox,
.template-checkbox {
  padding: 8px 0;
}

.user-checkbox label,
.template-checkbox label {
  display: flex;
  align-items: center;
  font-weight: normal;
  cursor: pointer;
}

.user-checkbox input[type="checkbox"],
.template-checkbox input[type="checkbox"] {
  width: auto;
  margin-right: 8px;
}

.form-group input[type="datetime-local"] {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
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

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>

