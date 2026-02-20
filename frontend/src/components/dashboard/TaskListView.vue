<template>
  <div class="task-list-view-overlay" @click.self="$emit('close')">
    <div class="task-list-view-modal">
      <div class="task-list-view-header">
        <h3 class="task-list-view-title">{{ list?.name }}</h3>
        <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')">×</button>
      </div>

      <div v-if="canEdit" class="add-task-form">
        <input
          v-model="newTaskTitle"
          type="text"
          class="form-control"
          placeholder="Add a task…"
          @keydown.enter="addTask"
        />
        <div class="add-task-fields">
          <select v-model="newTaskAssignee" class="form-control form-control-sm">
            <option :value="null">Assign to…</option>
            <option v-for="m in members" :key="m.user_id" :value="m.user_id">
              {{ memberLabel(m) }}
            </option>
          </select>
          <select v-model="newTaskUrgency" class="form-control form-control-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input
            v-model="newTaskDueDate"
            type="date"
            class="form-control form-control-sm"
            placeholder="Due date"
          />
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!newTaskTitle.trim() || adding"
          @click="addTask"
        >
          {{ adding ? '…' : 'Add task' }}
        </button>
      </div>

      <div v-if="loading" class="task-list-loading">Loading tasks…</div>
      <ul v-else class="task-list-items">
        <li
          v-for="task in tasks"
          :key="task.id"
          class="task-item"
          :class="{ 'task-assigned-to-me': task.assigned_to_user_id === currentUserId }"
        >
          <div class="task-item-main">
            <span class="task-title">{{ task.title }}</span>
            <span v-if="task.urgency && task.urgency !== 'medium'" class="urgency-badge" :class="`urgency-${task.urgency}`">
              {{ task.urgency }}
            </span>
            <span v-if="task.due_date" class="task-due">{{ formatDue(task.due_date) }}</span>
            <span v-if="task.is_recurring" class="task-recurring" title="Recurring">↻</span>
          </div>
          <div class="task-item-meta">
            <span v-if="taskAssignee(task)" class="task-assignee">{{ taskAssignee(task) }}</span>
          </div>
          <div v-if="canEdit" class="task-item-actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="completingId === task.id"
              @click="completeTask(task)"
            >
              {{ completingId === task.id ? '…' : 'Done' }}
            </button>
          </div>
        </li>
      </ul>
      <div v-if="!loading && tasks.length === 0" class="task-list-empty">No tasks yet.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  list: { type: Object, required: true }
});

const emit = defineEmits(['close', 'updated']);

const authStore = useAuthStore();
const currentUserId = computed(() => authStore.user?.id);

const loading = ref(true);
const adding = ref(false);
const completingId = ref(null);
const tasks = ref([]);
const members = ref([]);
const newTaskTitle = ref('');
const newTaskUrgency = ref('medium');
const newTaskAssignee = ref(null);
const newTaskDueDate = ref('');

const canEdit = computed(() => {
  const r = props.list?.my_role;
  return r === 'editor' || r === 'admin';
});

const fetchTasks = async () => {
  if (!props.list?.id) return;
  loading.value = true;
  try {
    const [tasksRes, listRes] = await Promise.all([
      api.get(`/task-lists/${props.list.id}/tasks`),
      api.get(`/task-lists/${props.list.id}`)
    ]);
    tasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    members.value = listRes.data?.members || [];
    if (canEdit.value && members.value.length > 0 && !newTaskAssignee.value) {
      newTaskAssignee.value = currentUserId.value;
    }
  } catch (err) {
    console.error('Failed to fetch tasks:', err);
    tasks.value = [];
    members.value = [];
  } finally {
    loading.value = false;
  }
};

const memberLabel = (m) => {
  const fn = m.first_name || m.user_first_name || '';
  const ln = m.last_name || m.user_last_name || '';
  return [fn, ln].filter(Boolean).join(' ') || `User ${m.user_id}`;
};

const taskAssignee = (task) => {
  if (!task.assigned_to_user_id) return null;
  const m = members.value.find((x) => Number(x.user_id) === Number(task.assigned_to_user_id));
  return m ? memberLabel(m) : null;
};

const formatDue = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
};

const addTask = async () => {
  const title = String(newTaskTitle.value || '').trim();
  if (!title || !props.list?.id) return;
  adding.value = true;
  try {
    await api.post(`/task-lists/${props.list.id}/tasks`, {
      title,
      urgency: newTaskUrgency.value || 'medium',
      assigned_to_user_id: newTaskAssignee.value || currentUserId.value,
      due_date: newTaskDueDate.value || null
    });
    newTaskTitle.value = '';
    newTaskDueDate.value = '';
    newTaskUrgency.value = 'medium';
    await fetchTasks();
    emit('updated');
  } catch (err) {
    console.error('Failed to add task:', err);
  } finally {
    adding.value = false;
  }
};

const completeTask = async (task) => {
  completingId.value = task.id;
  try {
    await api.put(`/tasks/${task.id}/complete`);
    await fetchTasks();
    emit('updated');
  } catch (err) {
    console.error('Failed to complete task:', err);
  } finally {
    completingId.value = null;
  }
};

onMounted(() => fetchTasks());
watch(() => props.list?.id, () => fetchTasks());
</script>

<style scoped>
.task-list-view-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.task-list-view-modal {
  background: white;
  border-radius: 12px;
  max-width: 520px;
  width: 90%;
  max-height: 80vh;
  overflow: auto;
  padding: 20px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}

.task-list-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.task-list-view-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  line-height: 1;
}

.btn-close:hover {
  color: #1f2937;
}

.add-task-form {
  margin-bottom: 16px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.add-task-form input[type='text'] {
  width: 100%;
  margin-bottom: 8px;
}

.add-task-fields {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.add-task-fields .form-control-sm {
  flex: 1;
  min-width: 100px;
}

.task-list-loading,
.task-list-empty {
  color: #6b7280;
  font-size: 14px;
  padding: 12px 0;
}

.task-list-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  margin-bottom: 8px;
}

.task-assigned-to-me {
  border-left: 3px solid var(--primary, #3b82f6);
}

.task-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.task-title {
  flex: 1;
  min-width: 0;
}

.urgency-badge {
  margin-left: 4px;
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

.task-due {
  font-size: 12px;
  color: #6b7280;
}

.task-recurring {
  font-size: 14px;
  color: #6b7280;
}

.task-item-meta {
  font-size: 12px;
  color: #6b7280;
  margin-right: 8px;
}

.task-item-actions {
  flex-shrink: 0;
}
</style>
