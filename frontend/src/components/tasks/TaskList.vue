<template>
  <div class="task-list">
    <div class="filters" v-if="tasks.length > 0" data-tour="tasks-filters">
      <select v-model="filterType" @change="applyFilters" class="filter-select" data-tour="tasks-filter-type">
        <option value="all">All Tasks</option>
        <option value="training">Training</option>
        <option value="document">Documents</option>
        <option value="custom">Custom</option>
      </select>
      <select v-model="filterStatus" @change="applyFilters" class="filter-select" data-tour="tasks-filter-status">
        <option value="all">All Status</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
      </select>
    </div>

    <div v-if="loading" class="loading" data-tour="tasks-loading">Loading tasks...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredTasks.length === 0" class="empty-state" data-tour="tasks-empty">
      <p>No tasks found</p>
    </div>
    <div v-else class="tasks" data-tour="tasks-grid">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-card"
        data-tour="tasks-card"
        @click="handleTaskClick(task)"
      >
        <div class="task-header">
          <h4>{{ task.title }}</h4>
          <div class="task-badges">
            <span v-if="task.urgency && task.urgency !== 'medium'" :class="['urgency-badge', `urgency-${task.urgency}`]">
              {{ task.urgency }}
            </span>
            <span :class="['badge', getStatusBadgeClass(task.status)]">
              {{ getStatusLabel(task.status) }}
            </span>
          </div>
        </div>
        <p class="task-description">{{ task.description || 'No description' }}</p>
        <div class="task-footer">
          <span class="task-type">{{ task.task_type }}</span>
          <span v-if="task.task_list_id" class="task-list-badge">Shared list</span>
          <span v-if="task.is_recurring" class="recurring-badge" title="Recurring">↻</span>
          <span v-if="task.due_date" class="due-date">
            Due: {{ formatDate(task.due_date) }}
          </span>
          <button
            v-if="task.task_type === 'document'"
            class="btn btn-secondary btn-xs"
            type="button"
            data-tour="tasks-print"
            @click.stop="openPrint(task)"
          >
            Print
          </button>
          <button
            v-if="task.task_type === 'custom'"
            class="btn btn-secondary btn-xs"
            type="button"
            @click.stop="openEditTask(task)"
          >
            Edit
          </button>
        </div>
      </div>
    </div>

    <div v-if="editingTask" class="edit-task-overlay" @click.self="editingTask = null">
      <div class="edit-task-modal">
        <h4>Edit task</h4>
        <div class="edit-task-form">
          <div class="form-group">
            <label>Urgency</label>
            <select v-model="editForm.urgency" class="form-control">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div class="form-group">
            <label>Due date</label>
            <input v-model="editForm.dueDate" type="date" class="form-control" />
          </div>
          <div class="form-group">
            <label>
              <input v-model="editForm.isRecurring" type="checkbox" />
              Recurring
            </label>
          </div>
        </div>
        <div class="edit-task-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveTaskEdit">
            {{ saving ? '…' : 'Save' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="editingTask = null">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTasksStore } from '../../store/tasks';
import { formatDate } from '../../utils/formatDate';
import api from '../../services/api';

const router = useRouter();
const tasksStore = useTasksStore();

const filterType = ref('all');
const filterStatus = ref('all');
const editingTask = ref(null);
const saving = ref(false);
const editForm = ref({ urgency: 'medium', dueDate: '', isRecurring: false });

const tasks = computed(() => tasksStore.tasks);
const loading = computed(() => tasksStore.loading);
const error = computed(() => tasksStore.error);

const filteredTasks = computed(() => {
  let filtered = tasks.value;
  
  if (filterType.value !== 'all') {
    filtered = filtered.filter(t => t.task_type === filterType.value);
  }
  
  if (filterStatus.value !== 'all') {
    filtered = filtered.filter(t => t.status === filterStatus.value);
  }
  
  return filtered;
});

const applyFilters = () => {
  // Filters are reactive, no action needed
};

const handleTaskClick = (task) => {
  if (task.task_type === 'document') {
    router.push(`/tasks/documents/${task.id}/sign`);
  } else if (task.task_type === 'training') {
    // Navigate to module if reference_id is a module
    if (task.reference_id) {
      router.push(`/module/${task.reference_id}`);
    }
  }
};

const openPrint = (task) => {
  router.push(`/tasks/documents/${task.id}/print`);
};

const openEditTask = (task) => {
  editingTask.value = task;
  editForm.value = {
    urgency: task.urgency || 'medium',
    dueDate: task.due_date ? task.due_date.slice(0, 10) : '',
    isRecurring: !!task.is_recurring
  };
};

const saveTaskEdit = async () => {
  if (!editingTask.value || saving.value) return;
  saving.value = true;
  try {
    await api.put(`/me/tasks/${editingTask.value.id}`, {
      urgency: editForm.value.urgency,
      due_date: editForm.value.dueDate || null,
      is_recurring: editForm.value.isRecurring
    });
    await tasksStore.fetchTasks();
    editingTask.value = null;
  } catch (e) {
    console.error('Failed to update task:', e);
  } finally {
    saving.value = false;
  }
};

watch(editingTask, (t) => {
  if (t) {
    editForm.value = {
      urgency: t.urgency || 'medium',
      dueDate: t.due_date ? t.due_date.slice(0, 10) : '',
      isRecurring: !!t.is_recurring
    };
  }
});

const getStatusLabel = (status) => {
  const labels = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    overridden: 'Overridden'
  };
  return labels[status] || status;
};

const getStatusBadgeClass = (status) => {
  const classes = {
    pending: 'badge-warning',
    in_progress: 'badge-info',
    completed: 'badge-success',
    overridden: 'badge-secondary'
  };
  return classes[status] || 'badge-secondary';
};

onMounted(async () => {
  await tasksStore.fetchTasks();
});
</script>

<style scoped>
.task-list {
  width: 100%;
}

.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.filter-select {
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.tasks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.task-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
}

.task-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 12px;
}

.task-header h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.task-description {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.task-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-xs {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 8px;
}

.task-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.urgency-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.urgency-high {
  background: #fecaca;
  color: #991b1b;
}

.urgency-low {
  background: #d1fae5;
  color: #065f46;
}

.task-list-badge {
  font-size: 11px;
  color: #6b7280;
}

.recurring-badge {
  font-size: 14px;
  color: #6b7280;
}

.task-type {
  text-transform: capitalize;
  font-weight: 500;
}

.due-date {
  color: var(--text-secondary);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.edit-task-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.edit-task-modal {
  background: white;
  border-radius: 12px;
  padding: 20px;
  max-width: 360px;
  width: 90%;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}

.edit-task-modal h4 {
  margin: 0 0 16px 0;
}

.edit-task-form .form-group {
  margin-bottom: 12px;
}

.edit-task-form label {
  display: block;
  font-size: 13px;
  margin-bottom: 4px;
}

.edit-task-form .form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.edit-task-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
</style>

