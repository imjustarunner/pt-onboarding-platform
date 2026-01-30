<template>
  <div class="task-list">
    <div class="filters" v-if="tasks.length > 0">
      <select v-model="filterType" @change="applyFilters" class="filter-select">
        <option value="all">All Tasks</option>
        <option value="training">Training</option>
        <option value="document">Documents</option>
      </select>
      <select v-model="filterStatus" @change="applyFilters" class="filter-select">
        <option value="all">All Status</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
      </select>
    </div>

    <div v-if="loading" class="loading">Loading tasks...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredTasks.length === 0" class="empty-state">
      <p>No tasks found</p>
    </div>
    <div v-else class="tasks">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-card"
        @click="handleTaskClick(task)"
      >
        <div class="task-header">
          <h4>{{ task.title }}</h4>
          <span :class="['badge', getStatusBadgeClass(task.status)]">
            {{ getStatusLabel(task.status) }}
          </span>
        </div>
        <p class="task-description">{{ task.description || 'No description' }}</p>
        <div class="task-footer">
          <span class="task-type">{{ task.task_type }}</span>
          <span v-if="task.due_date" class="due-date">
            Due: {{ formatDate(task.due_date) }}
          </span>
          <button
            v-if="task.task_type === 'document'"
            class="btn btn-secondary btn-xs"
            type="button"
            @click.stop="openPrint(task)"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTasksStore } from '../../store/tasks';

const router = useRouter();
const tasksStore = useTasksStore();

const filterType = ref('all');
const filterStatus = ref('all');

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

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString();
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
</style>

