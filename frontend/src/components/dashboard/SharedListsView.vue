<template>
  <div class="shared-lists-view">
    <div class="shared-lists-header">
      <h3 class="shared-lists-title">Shared lists</h3>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="creating"
        @click="showCreateForm = true"
      >
        {{ creating ? '…' : 'New list' }}
      </button>
    </div>

    <div v-if="showCreateForm" class="create-list-form">
      <input
        v-model="newListName"
        type="text"
        class="form-control"
        placeholder="List name (e.g. Skill Builders)"
        @keydown.enter="createList"
      />
      <div class="create-list-actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="!newListName.trim() || creating" @click="createList">
          {{ creating ? '…' : 'Create' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="cancelCreate">Cancel</button>
      </div>
    </div>

    <div v-if="loading" class="shared-lists-loading">Loading lists…</div>
    <div v-else-if="lists.length === 0 && !showCreateForm" class="shared-lists-empty">
      No shared lists yet. Create one to collaborate on tasks with your team.
    </div>
    <ul v-else class="shared-lists-list">
      <li v-for="list in lists" :key="list.id" class="shared-list-item">
        <div class="shared-list-info">
          <span class="shared-list-name">{{ list.name }}</span>
          <span class="shared-list-meta">
            {{ list.task_count ?? 0 }} tasks
            <span v-if="list.my_role" class="role-badge">{{ list.my_role }}</span>
          </span>
        </div>
        <div class="shared-list-actions">
          <button type="button" class="btn btn-secondary btn-sm" @click="openList(list)">View</button>
          <button
            v-if="canManage(list)"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="openManage(list)"
          >
            Manage
          </button>
        </div>
      </li>
    </ul>

    <TaskListView
      v-if="selectedList"
      :list="selectedList"
      @close="selectedList = null"
      @updated="fetchLists"
    />

    <TaskListMemberManager
      v-if="manageList"
      :list="manageList"
      @close="manageList = null"
      @updated="fetchLists"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import TaskListView from './TaskListView.vue';
import TaskListMemberManager from './TaskListMemberManager.vue';

const props = defineProps({
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['task-changed']);

const loading = ref(true);
const creating = ref(false);
const showCreateForm = ref(false);
const newListName = ref('');
const lists = ref([]);
const selectedList = ref(null);
const manageList = ref(null);

const canManage = (list) => list.my_role === 'admin' || list.my_role === 'editor';

const fetchLists = async () => {
  if (!props.agencyId) {
    lists.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const res = await api.get('/task-lists', { params: { agencyId: props.agencyId } });
    lists.value = Array.isArray(res.data) ? res.data : [];
    emit('task-changed');
  } catch (err) {
    console.error('Failed to fetch task lists:', err);
    lists.value = [];
  } finally {
    loading.value = false;
  }
};

const createList = async () => {
  const name = String(newListName.value || '').trim();
  if (!name || !props.agencyId) return;
  creating.value = true;
  try {
    await api.post('/task-lists', { agencyId: props.agencyId, name });
    newListName.value = '';
    showCreateForm.value = false;
    await fetchLists();
  } catch (err) {
    console.error('Failed to create list:', err);
  } finally {
    creating.value = false;
  }
};

const cancelCreate = () => {
  showCreateForm.value = false;
  newListName.value = '';
};

const openList = (list) => {
  selectedList.value = list;
};

const openManage = (list) => {
  manageList.value = list;
};

onMounted(() => fetchLists());
watch(() => props.agencyId, () => fetchLists());
</script>

<style scoped>
.shared-lists-view {
  background: white;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 16px;
}

.shared-lists-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.shared-lists-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.shared-lists-loading,
.shared-lists-empty {
  color: #6b7280;
  font-size: 14px;
  padding: 12px 0;
}

.create-list-form {
  margin-bottom: 16px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.create-list-form input {
  width: 100%;
  margin-bottom: 8px;
}

.create-list-actions {
  display: flex;
  gap: 8px;
}

.shared-lists-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.shared-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  margin-bottom: 8px;
}

.shared-list-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shared-list-name {
  font-weight: 600;
  font-size: 14px;
}

.shared-list-meta {
  font-size: 12px;
  color: #6b7280;
}

.role-badge {
  margin-left: 8px;
  padding: 2px 6px;
  background: #e5e7eb;
  border-radius: 4px;
  font-size: 11px;
}

.shared-list-actions {
  display: flex;
  gap: 8px;
}
</style>
