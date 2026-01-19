<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <h2>Assign Task</h2>
      
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>Task Type *</label>
          <select v-model="formData.taskType" required>
            <option value="training">Training</option>
            <option value="document">Document</option>
          </select>
        </div>

        <div class="form-group">
          <label>Title *</label>
          <input v-model="formData.title" type="text" required />
        </div>

        <div class="form-group">
          <label>Description</label>
          <textarea v-model="formData.description" rows="3"></textarea>
        </div>

        <div class="form-group">
          <label>Reference ID *</label>
          <input v-model="formData.referenceId" type="number" required />
          <small>{{ formData.taskType === 'training' ? 'Module or Track ID' : 'Document Template ID' }}</small>
        </div>

        <div class="form-group">
          <label>Assign To</label>
          <select v-model="assignmentType">
            <option value="user">Individual User</option>
            <option value="role">Role</option>
            <option value="agency">Agency</option>
          </select>
        </div>

        <div v-if="assignmentType === 'user'" class="form-group">
          <label>User ID</label>
          <input v-model="formData.assignedToUserId" type="number" />
        </div>

        <div v-if="assignmentType === 'role'" class="form-group">
          <label>Role</label>
          <select v-model="formData.assignedToRole">
            <option value="supervisor">Supervisor</option>
            <option value="provider">Provider</option>
            <option value="school_staff">School Staff</option>
            <option value="facilitator">Facilitator</option>
            <option value="intern">Intern</option>
          </select>
        </div>

        <div v-if="assignmentType === 'role' || assignmentType === 'agency'" class="form-group">
          <label>Agency ID</label>
          <input v-model="formData.assignedToAgencyId" type="number" />
        </div>

        <div class="form-group">
          <label>Due Date</label>
          <input v-model="formData.dueDate" type="datetime-local" />
        </div>

        <div class="form-actions">
          <button type="button" @click="$emit('close')" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="loading">
            {{ loading ? 'Assigning...' : 'Assign Task' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useTasksStore } from '../../store/tasks';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'assigned']);

const tasksStore = useTasksStore();
const loading = ref(false);
const assignmentType = ref('user');

const formData = ref({
  taskType: 'training',
  title: '',
  description: '',
  referenceId: null,
  assignedToUserId: null,
  assignedToRole: null,
  assignedToAgencyId: null,
  dueDate: null
});

const handleSubmit = async () => {
  try {
    loading.value = true;
    await tasksStore.assignTask(formData.value);
    emit('assigned');
    emit('close');
    // Reset form
    formData.value = {
      taskType: 'training',
      title: '',
      description: '',
      referenceId: null,
      assignedToUserId: null,
      assignedToRole: null,
      assignedToAgencyId: null,
      dueDate: null
    };
  } catch (err) {
    console.error('Error assigning task:', err);
  } finally {
    loading.value = false;
  }
};
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

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>

