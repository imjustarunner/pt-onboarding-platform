<template>
  <div class="momentum-chat-panel">
    <div class="chat-header" @click="expanded = !expanded">
      <h3 class="chat-title">Focus Assistant</h3>
      <span class="chat-toggle">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div v-show="expanded" class="chat-body">
      <div class="chat-messages">
        <div v-if="responseItems.length > 0 || suggestedTasks.length > 0 || suggestedUpdates.length > 0 || suggestedDeletes.length > 0" class="message assistant">
          <ol v-if="responseItems.length > 0" class="focus-list">
            <li v-for="(item, i) in responseItems" :key="i" class="focus-item">{{ item }}</li>
          </ol>
          <div v-if="suggestedTasks.length > 0" class="suggested-tasks">
            <div class="suggested-tasks-label">Create tasks:</div>
            <div v-for="(t, i) in suggestedTasks" :key="`create-${i}`" class="suggested-task-row">
              <span class="suggested-task-title">{{ t.title }}</span>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="creatingTaskId === `create-${i}`"
                @click="createTask(t, i)"
              >
                {{ creatingTaskId === `create-${i}` ? '…' : 'Create task' }}
              </button>
            </div>
          </div>
          <div v-if="suggestedUpdates.length > 0" class="suggested-tasks">
            <div class="suggested-tasks-label">Update tasks:</div>
            <div v-for="(u, i) in suggestedUpdates" :key="`update-${i}`" class="suggested-task-row">
              <span class="suggested-task-title">→ {{ u.title }}</span>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="updatingTaskId === `update-${i}`"
                @click="updateTask(u, i)"
              >
                {{ updatingTaskId === `update-${i}` ? '…' : 'Update' }}
              </button>
            </div>
          </div>
          <div v-if="suggestedDeletes.length > 0" class="suggested-tasks">
            <div class="suggested-tasks-label">Delete tasks:</div>
            <div v-for="(d, i) in suggestedDeletes" :key="`delete-${i}`" class="suggested-task-row">
              <span class="suggested-task-title">Task #{{ d.taskId }}</span>
              <button
                type="button"
                class="btn btn-secondary btn-sm task-delete-btn"
                :disabled="deletingTaskId === `delete-${i}`"
                @click="deleteTask(d, i)"
              >
                {{ deletingTaskId === `delete-${i}` ? '…' : 'Delete' }}
              </button>
            </div>
          </div>
          <button
            v-if="responseItems.length > 0"
            type="button"
            class="btn btn-secondary btn-sm convert-btn"
            @click="convertToList"
          >
            Convert list to sticky
          </button>
        </div>
        <div v-else-if="loading" class="message assistant loading-msg">
          Thinking...
        </div>
        <div v-else-if="error" class="message assistant error-msg">
          {{ error }}
        </div>
        <div v-else class="message assistant empty-msg">
          Ask what to focus on. I'll use your checklist, tasks, tickets, and notes.
        </div>
      </div>
      <div class="chat-input-row">
        <input
          v-model="inputMessage"
          class="chat-input"
          type="text"
          placeholder="What should I focus on now?"
          @keydown.enter="send"
        />
        <button
          type="button"
          class="btn btn-primary btn-sm send-btn"
          :disabled="loading"
          @click="send"
        >
          {{ loading ? '…' : 'Ask' }}
        </button>
      </div>
      <div class="quick-prompts">
        <button
          type="button"
          class="quick-prompt"
          :disabled="loading"
          @click="askQuick('What should I focus on now?')"
        >
          What should I focus on now?
        </button>
        <button
          type="button"
          class="quick-prompt"
          :disabled="loading"
          @click="askQuick('Prioritize my day')"
        >
          Prioritize my day
        </button>
        <button
          type="button"
          class="quick-prompt"
          :disabled="loading"
          @click="askQuick('Add task: Follow up with client')"
        >
          Add a task
        </button>
        <button
          type="button"
          class="quick-prompt"
          :disabled="loading"
          @click="askQuick('Update my task to say Call parent tomorrow')"
        >
          Update a task
        </button>
        <button
          type="button"
          class="quick-prompt"
          :disabled="loading"
          @click="askQuick('Remove the task about follow up')"
        >
          Delete a task
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useMomentumStickiesStore } from '../../store/momentumStickies';

const props = defineProps({
  programId: { type: Number, default: null },
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['task-changed']);

const authStore = useAuthStore();
const momentumStore = useMomentumStickiesStore();
const userId = computed(() => authStore.user?.id);

const expanded = ref(true);
const inputMessage = ref('');
const loading = ref(false);
const error = ref('');
const responseItems = ref([]);
const suggestedTasks = ref([]);
const suggestedUpdates = ref([]);
const suggestedDeletes = ref([]);
const creatingTaskId = ref(null);
const updatingTaskId = ref(null);
const deletingTaskId = ref(null);

const askQuick = (msg) => {
  inputMessage.value = msg;
  send();
};

const send = async () => {
  const msg = String(inputMessage.value || '').trim();
  if (!msg || !userId.value || loading.value) return;
  loading.value = true;
  error.value = '';
  responseItems.value = [];
  suggestedTasks.value = [];
  suggestedUpdates.value = [];
  suggestedDeletes.value = [];
  try {
    const { data } = await api.post(`/users/${userId.value}/momentum-chat`, {
      message: msg,
      agencyId: props.agencyId || undefined,
      programId: props.programId || undefined
    });
    responseItems.value = data.items || [];
    suggestedTasks.value = data.suggestedTasks || [];
    suggestedUpdates.value = data.suggestedUpdates || [];
    suggestedDeletes.value = data.suggestedDeletes || [];
    inputMessage.value = '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to get focus recommendations';
  } finally {
    loading.value = false;
  }
};

const convertToList = () => {
  if (responseItems.value.length > 0) {
    momentumStore.convertListToSticky(responseItems.value);
  }
};

const createTask = async (task, idx) => {
  if (!userId.value || !task?.title?.trim()) return;
  creatingTaskId.value = `create-${idx}`;
  try {
    await api.post('/me/tasks', { title: task.title.trim(), description: task.description || null });
    suggestedTasks.value = suggestedTasks.value.filter((_, i) => i !== idx);
    emit('task-changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to create task';
  } finally {
    creatingTaskId.value = null;
  }
};

const updateTask = async (u, idx) => {
  if (!userId.value || !u?.taskId) return;
  updatingTaskId.value = `update-${idx}`;
  try {
    await api.put(`/me/tasks/${u.taskId}`, { title: u.title?.trim() || undefined });
    suggestedUpdates.value = suggestedUpdates.value.filter((_, i) => i !== idx);
    emit('task-changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to update task';
  } finally {
    updatingTaskId.value = null;
  }
};

const deleteTask = async (d, idx) => {
  if (!userId.value || !d?.taskId) return;
  if (!confirm('Delete this task? This cannot be undone.')) return;
  deletingTaskId.value = `delete-${idx}`;
  try {
    await api.delete(`/me/tasks/${d.taskId}`);
    suggestedDeletes.value = suggestedDeletes.value.filter((_, i) => i !== idx);
    emit('task-changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete task';
  } finally {
    deletingTaskId.value = null;
  }
};
</script>

<style scoped>
.momentum-chat-panel {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
  cursor: pointer;
  user-select: none;
}

.chat-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}

.chat-toggle {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
}

.chat-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-messages {
  min-height: 60px;
}

.message.assistant {
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 14px;
}

.focus-list {
  margin: 0 0 12px 0;
  padding-left: 20px;
}

.focus-item {
  margin-bottom: 4px;
  color: #1a1a1a;
}

.convert-btn {
  margin-top: 8px;
}

.suggested-tasks {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.suggested-tasks-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 8px;
}

.suggested-task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.suggested-task-title {
  flex: 1;
  font-size: 14px;
  color: #1a1a1a;
}

.task-delete-btn {
  color: #b91c1c;
  border-color: #b91c1c;
}

.task-delete-btn:hover:not(:disabled) {
  background: #fef2f2;
}

.loading-msg,
.empty-msg {
  color: rgba(0, 0, 0, 0.6);
  font-style: italic;
}

.error-msg {
  color: #b91c1c;
}

.chat-input-row {
  display: flex;
  gap: 8px;
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
}

.chat-input:focus {
  outline: none;
  border-color: #fde047;
  box-shadow: 0 0 0 2px rgba(253, 224, 71, 0.3);
}

.send-btn {
  flex-shrink: 0;
}

.quick-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-prompt {
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 6px;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
}

.quick-prompt:hover:not(:disabled) {
  background: #fef9c3;
  border-color: #fde047;
}

.quick-prompt:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
