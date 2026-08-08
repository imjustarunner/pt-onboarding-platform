<template>
  <div class="shared-lists-view">
    <div class="shared-lists-header">
      <h3 class="shared-lists-title">Shared lists</h3>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="creating || !agencyId"
        @click="openCreate"
      >
        {{ creating ? '…' : 'New list' }}
      </button>
    </div>

    <input
      v-if="lists.length || showCreateForm"
      v-model="listSearch"
      type="search"
      class="form-control list-search"
      placeholder="Search shared lists…"
    />

    <div v-if="showCreateForm" class="create-list-form">
      <input
        v-model="newListName"
        type="text"
        class="form-control"
        placeholder="List name (e.g. Skill Builders)"
        @keydown.enter="createList"
      />
      <div class="form-block">
        <label class="form-label">Share with teammates</label>
        <div class="pick-box">
          <label v-for="u in shareableUsers" :key="u.id" class="pick-row">
            <input v-model="newMemberIds" type="checkbox" :value="u.id" />
            {{ u.first_name }} {{ u.last_name }}
          </label>
          <p v-if="!shareableUsers.length" class="muted">No other users in this agency</p>
        </div>
      </div>
      <div class="form-block">
        <label class="form-label">Add existing tasks & action items (not on another list)</label>
        <input v-model="itemSearch" type="search" class="form-control" placeholder="Search…" />
        <div class="pick-box">
          <template v-if="filteredTasks.length">
            <p class="pick-heading">Tasks</p>
            <label v-for="t in filteredTasks" :key="`t-${t.id}`" class="pick-row">
              <input v-model="newTaskIds" type="checkbox" :value="t.id" />
              {{ t.title }}
            </label>
          </template>
          <template v-if="filteredActions.length">
            <p class="pick-heading">Action items</p>
            <label v-for="a in filteredActions" :key="`a-${a.id}`" class="pick-row">
              <input v-model="newActionIds" type="checkbox" :value="a.id" />
              {{ a.title }}
            </label>
          </template>
        </div>
      </div>
      <div class="create-list-actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="!newListName.trim() || creating" @click="createList">
          {{ creating ? '…' : 'Create' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="cancelCreate">Cancel</button>
      </div>
    </div>

    <div v-if="loading" class="shared-lists-loading">Loading lists…</div>
    <div v-else-if="filteredLists.length === 0 && !showCreateForm" class="shared-lists-empty">
      {{ listSearch ? 'No lists match your search.' : 'No shared lists yet. Create one to collaborate on tasks with your team.' }}
    </div>
    <ul v-else class="shared-lists-list">
      <li v-for="list in filteredLists" :key="list.id" class="shared-list-item">
        <div class="shared-list-info">
          <div class="shared-list-name-row">
            <span class="shared-list-badge" title="Shared list">Shared list</span>
            <span class="shared-list-name">{{ list.name }}</span>
          </div>
          <span class="shared-list-meta">
            {{ list.task_count ?? 0 }} open task{{ Number(list.task_count || 0) === 1 ? '' : 's' }}
            <span class="shared-with">· Shared with {{ list.shared_with_label || 'Only you' }}</span>
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
            Share
          </button>
        </div>
      </li>
    </ul>

    <TaskListMemberManager
      v-if="manageList"
      :list="manageList"
      @close="manageList = null"
      @updated="fetchLists"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import TaskListMemberManager from './TaskListMemberManager.vue';

const route = useRoute();
const router = useRouter();
const orgPrefix = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? `/${slug}` : '';
});

const props = defineProps({
  /** Used for creating new lists; listing always uses membership (all agencies). */
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['task-changed', 'summary']);

const authStore = useAuthStore();
const loading = ref(true);
const creating = ref(false);
const showCreateForm = ref(false);
const newListName = ref('');
const newMemberIds = ref([]);
const newTaskIds = ref([]);
const newActionIds = ref([]);
const listSearch = ref('');
const itemSearch = ref('');
const lists = ref([]);
const agencyUsers = ref([]);
const unattachedTasks = ref([]);
const unattachedActions = ref([]);
const manageList = ref(null);

const POLL_INTERVAL_MS = 25000;
let pollTimer = null;

const canManage = (list) => list.my_role === 'admin' || list.my_role === 'editor';

const filteredLists = computed(() => {
  const q = listSearch.value.trim().toLowerCase();
  if (!q) return lists.value;
  return lists.value.filter((l) => String(l.name || '').toLowerCase().includes(q));
});

const shareableUsers = computed(() => {
  const me = Number(authStore.user?.id);
  return (agencyUsers.value || []).filter((u) => Number(u.id) !== me);
});

const filteredTasks = computed(() => {
  const q = itemSearch.value.trim().toLowerCase();
  let list = unattachedTasks.value || [];
  if (q) list = list.filter((t) => String(t.title || '').toLowerCase().includes(q));
  return list.slice(0, 15);
});

const filteredActions = computed(() => {
  const q = itemSearch.value.trim().toLowerCase();
  let list = unattachedActions.value || [];
  if (q) list = list.filter((a) => String(a.title || '').toLowerCase().includes(q));
  return list.slice(0, 15);
});

async function loadAgencyUsers() {
  try {
    if (props.agencyId) {
      // Tenant context known — load users from that agency
      const { data } = await api.get(`/agencies/${props.agencyId}/users`, { skipGlobalLoading: true });
      agencyUsers.value = Array.isArray(data) ? data : (data?.users || []);
    } else {
      // Person-scoped — load users from all of my agencies via /users/me/agencies then flatten
      const { data: myAgencies } = await api.get('/users/me/agencies', { skipGlobalLoading: true });
      const ids = (Array.isArray(myAgencies) ? myAgencies : []).map((a) => a.id).filter(Boolean);
      if (!ids.length) { agencyUsers.value = []; return; }
      const allUsers = await Promise.all(
        ids.map((aid) =>
          api.get(`/agencies/${aid}/users`, { skipGlobalLoading: true })
            .then((r) => Array.isArray(r.data) ? r.data : (r.data?.users || []))
            .catch(() => [])
        )
      );
      const seen = new Set();
      agencyUsers.value = allUsers.flat().filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
    }
  } catch {
    agencyUsers.value = [];
  }
}

async function loadUnattached() {
  try {
    const [tasksRes, actionsRes] = await Promise.all([
      api.get('/tasks', {
        params: {
          view: 'assigned',
          agencyId: props.agencyId || undefined,
          unassignedFromList: '1',
          limit: 100
        },
        skipGlobalLoading: true
      }),
      api.get('/task-action-items', {
        params: { agencyId: props.agencyId || undefined, unassignedFromList: '1' },
        skipGlobalLoading: true
      })
    ]);
    unattachedTasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    unattachedActions.value = Array.isArray(actionsRes.data) ? actionsRes.data : [];
  } catch {
    unattachedTasks.value = [];
    unattachedActions.value = [];
  }
}

const fetchLists = async (opts = {}) => {
  const { emitTaskChanged = true } = typeof opts === 'object' && opts !== null ? opts : {};
  loading.value = true;
  try {
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

async function openCreate() {
  showCreateForm.value = true;
  await Promise.all([loadAgencyUsers(), loadUnattached()]);
}

const createList = async () => {
  const name = String(newListName.value || '').trim();
  if (!name) return;
  creating.value = true;
  try {
    // agencyId is now optional — person-scoped lists are created without a tenant context
    const payload = { name };
    if (props.agencyId) payload.agencyId = props.agencyId;
    const { data } = await api.post('/task-lists', payload, { skipGlobalLoading: true });
    const listId = data?.id;
    if (listId) {
      await Promise.all([
        ...newMemberIds.value.map((uid) =>
          api.post(`/task-lists/${listId}/members`, { userId: Number(uid), role: 'editor' }, { skipGlobalLoading: true })
        ),
        ...newTaskIds.value.map((tid) =>
          api.put(`/me/tasks/${tid}`, { task_list_id: listId }, { skipGlobalLoading: true })
        ),
        ...newActionIds.value.map((aid) =>
          api.put(`/task-action-items/${aid}`, { taskListId: listId }, { skipGlobalLoading: true })
        )
      ]);
    }
    newListName.value = '';
    newMemberIds.value = [];
    newTaskIds.value = [];
    newActionIds.value = [];
    itemSearch.value = '';
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
  newMemberIds.value = [];
  newTaskIds.value = [];
  newActionIds.value = [];
};

const openList = (list) => {
  router.push(`${orgPrefix.value}/tasks/lists/${list.id}`);
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
  fetchLists();
});
</script>

<style scoped>
.shared-lists-view {
  background: white;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
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

.list-search {
  margin-bottom: 12px;
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
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  margin-bottom: 4px;
}

.pick-box {
  max-height: 140px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}

.pick-heading {
  margin: 6px 0 2px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
}

.pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 3px 0;
  cursor: pointer;
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

.muted { color: #64748b; font-size: 12px; margin: 4px 0; }
</style>
