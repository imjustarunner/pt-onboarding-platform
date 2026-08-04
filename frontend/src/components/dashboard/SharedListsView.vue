<template>
  <div class="shared-lists-view">
    <div class="shared-lists-header">
      <h3 class="shared-lists-title">Shared lists</h3>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="creating || !agencyId"
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
          <div class="shared-list-name-row">
            <span class="shared-list-badge" title="Shared list">Shared list</span>
            <span class="shared-list-name">{{ list.name }}</span>
          </div>
          <span class="shared-list-meta">
            {{ list.task_count ?? 0 }} open task{{ Number(list.task_count || 0) === 1 ? '' : 's' }}
            <span class="shared-with">· Shared with {{ list.shared_with_label || 'you' }}</span>
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
import { ref, onMounted, watch, onUnmounted } from 'vue';
import api from '../../services/api';
import TaskListView from './TaskListView.vue';
import TaskListMemberManager from './TaskListMemberManager.vue';

const props = defineProps({
  /** Used for creating new lists; listing always uses membership (all agencies). */
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['task-changed', 'summary']);

const loading = ref(true);
const creating = ref(false);
const showCreateForm = ref(false);
const newListName = ref('');
const lists = ref([]);
const selectedList = ref(null);
const manageList = ref(null);

const POLL_INTERVAL_MS = 25000;
let pollTimer = null;

const canManage = (list) => list.my_role === 'admin' || list.my_role === 'editor';

const fetchLists = async (opts = {}) => {
  const { emitTaskChanged = true } = typeof opts === 'object' && opts !== null ? opts : {};
  loading.value = true;
  try {
    // Always load by membership across agencies so lists don't disappear when org context differs.
    const res = await api.get('/task-lists', { skipGlobalLoading: true });
    lists.value = Array.isArray(res.data) ? res.data : [];
    const totalTasks = lists.value.reduce((s, l) => s + (l.task_count ?? 0), 0);
    const lastActivity = lists.value.reduce((latest, l) => {
      const at = l.last_activity_at ? new Date(l.last_activity_at).getTime() : 0;
      return at > latest ? at : latest;
    }, 0);
    const hasRecentActivity = lastActivity > 0 && Date.now() - lastActivity < 24 * 60 * 60 * 1000;
    emit('summary', {
      listCount: lists.value.length,
      totalTasks,
      hasRecentActivity,
      lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null
    });
    if (emitTaskChanged) emit('task-changed');
  } catch (err) {
    console.error('Failed to fetch task lists:', err);
    lists.value = [];
  } finally {
    loading.value = false;
  }
};

const createList = async () => {
  const name = String(newListName.value || '').trim();
  if (!name) return;
  if (!props.agencyId) {
    console.error('Cannot create shared list without an agency context');
    return;
  }
  creating.value = true;
  try {
    await api.post('/task-lists', { agencyId: props.agencyId, name }, { skipGlobalLoading: true });
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

const startPolling = () => {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (!loading.value) fetchLists({ emitTaskChanged: false });
  }, POLL_INTERVAL_MS);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

onMounted(() => {
  fetchLists();
  startPolling();
});
onUnmounted(stopPolling);
watch(() => props.agencyId, () => {
  // Agency change only affects create context; still refresh memberships.
  fetchLists();
});
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
  font-size: 1rem;
  font-weight: 700;
}

.shared-lists-loading,
.shared-lists-empty {
  padding: 24px 12px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}

.create-list-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
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
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.shared-list-item:last-child {
  border-bottom: 0;
}

.shared-list-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.shared-list-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #0f766e;
  background: #ccfbf1;
  border-radius: 4px;
  padding: 2px 6px;
}

.shared-list-name {
  font-weight: 700;
  color: #0f172a;
}

.shared-list-meta {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.shared-with {
  color: #475569;
}

.role-badge {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 4px;
  padding: 1px 5px;
}

.shared-list-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.form-control {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font: inherit;
}
</style>
