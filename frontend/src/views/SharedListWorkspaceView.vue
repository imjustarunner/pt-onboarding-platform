<template>
  <div class="slw">
    <header class="slw__hero">
      <button type="button" class="slw__back" @click="goBack">← Back to Tasks</button>
      <div v-if="list" class="slw__hero-inner">
        <div class="slw__hero-main">
          <span class="slw__badge">
            <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="16 6 12 2 8 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Shared List
          </span>
          <h1>{{ list.name }}</h1>
          <button
            v-if="list.linked_project_id"
            type="button"
            class="slw__project-pill"
            @click="openProject(list.linked_project_id)"
          >
            Part of project “{{ list.linked_project_name }}” →
          </button>
        </div>
        <div class="slw__hero-members">
          <div class="slw__avatars">
            <span
              v-for="m in members.slice(0, 6)"
              :key="m.user_id"
              class="slw__avatar"
              :style="{ background: memberColor(m.user_id) }"
              :title="memberLabel(m)"
            >
              <img v-if="m.profile_photo_path" :src="toUploadsUrl(m.profile_photo_path)" :alt="memberLabel(m)" />
              <template v-else>{{ memberInitials(m) }}</template>
            </span>
            <span v-if="members.length > 6" class="slw__avatar slw__avatar--more">+{{ members.length - 6 }}</span>
          </div>
          <button type="button" class="slw__manage-btn" @click="showMembers = true">
            Manage ({{ members.length }})
          </button>
        </div>
      </div>
    </header>

    <div v-if="loading" class="slw__state">Loading list…</div>
    <div v-else-if="!list" class="slw__state slw__state--error">List not found or you don't have access.</div>

    <template v-else>
      <div class="slw__toolbar">
        <div class="slw__tabs">
          <button type="button" :class="{ active: statusTab === 'pending' }" @click="statusTab = 'pending'; loadTasks();">
            Pending <span class="slw__tab-count">{{ pendingCount }}</span>
          </button>
          <button type="button" :class="{ active: statusTab === 'completed' }" @click="statusTab = 'completed'; loadTasks();">
            Completed
          </button>
        </div>
        <label class="slw__sort">
          <span>Sort by</span>
          <select v-model="sortBy" class="form-control form-control-sm">
            <option value="priority">Priority</option>
            <option value="due_date">Due date</option>
            <option value="title">Title</option>
            <option value="status">Status</option>
            <option value="assignee">Assignee</option>
          </select>
        </label>
      </div>

      <div v-if="canEdit && statusTab === 'pending'" class="slw__add-task">
        <input
          v-model="newTaskTitle"
          type="text"
          class="form-control"
          placeholder="Add a task…"
          @keydown.enter="addTask"
        />
        <select v-model="newTaskAssignee" class="form-control">
          <option :value="currentUserId">Me</option>
          <option :value="null">No one</option>
          <option v-for="m in members" :key="m.user_id" :value="m.user_id">{{ memberLabel(m) }}</option>
        </select>
        <select v-model="newTaskUrgency" class="form-control">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input v-model="newTaskDueDate" type="date" class="form-control" />
        <button type="button" class="btn-primary" :disabled="!newTaskTitle.trim() || adding" @click="addTask">
          {{ adding ? '…' : 'Add task' }}
        </button>
      </div>
      <p v-if="addTaskError" class="slw__error">{{ addTaskError }}</p>

      <div class="slw__body">
        <div class="slw__table-wrap">
          <div v-if="tasksLoading" class="slw__state">Loading tasks…</div>
          <div v-else-if="!sortedTasks.length" class="slw__state">
            {{ statusTab === 'pending' ? 'No pending tasks in this list.' : 'No completed tasks yet.' }}
          </div>
          <table v-else class="slw__table">
            <thead>
              <tr>
                <th class="slw__col-select">
                  <input
                    type="checkbox"
                    :checked="allSelected"
                    :indeterminate="someSelected"
                    @change="toggleSelectAll"
                  />
                </th>
                <th class="slw__col-check" title="Mark complete"></th>
                <th>Task</th>
                <th>Assignee</th>
                <th>Due</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in sortedTasks"
                :key="t.id"
                :class="{ 'slw__row--selected': selectedTask?.id === t.id, 'slw__row--waiting': t.status === 'waiting' }"
                @click="selectTask(t)"
              >
                <td class="slw__col-select" @click.stop>
                  <input type="checkbox" :checked="selectedIds.has(t.id)" @change="toggleSelectRow(t)" />
                </td>
                <td class="slw__col-check" @click.stop>
                  <button
                    type="button"
                    class="slw__check"
                    :class="{ 'slw__check--done': t.status === 'completed' }"
                    :disabled="togglingId === t.id"
                    title="Mark complete"
                    @click="toggleComplete(t)"
                  >
                    <svg v-if="t.status === 'completed'" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </td>
                <td class="slw__col-title">
                  <span :class="{ 'slw__done-text': t.status === 'completed' }">{{ t.title }}</span>
                  <span v-if="t.status === 'waiting'" class="slw__waiting-badge">Waiting</span>
                </td>
                <td>
                  <span v-if="t.assigned_to_user_id" class="slw__assignee">
                    <span class="slw__assignee-avatar" :style="{ background: memberColor(t.assigned_to_user_id) }">
                      <img v-if="t.assignee_profile_photo_path" :src="toUploadsUrl(t.assignee_profile_photo_path)" :alt="assigneeName(t)" />
                      <template v-else>{{ initialsOf(t.assignee_first_name, t.assignee_last_name) }}</template>
                    </span>
                    {{ assigneeName(t) }}
                  </span>
                  <span v-else class="slw__muted">Unassigned</span>
                </td>
                <td>
                  <span v-if="t.due_date" :class="{ 'slw__overdue': isOverdue(t.due_date) && t.status !== 'completed' }">
                    {{ formatDate(t.due_date) }}
                  </span>
                  <span v-else class="slw__muted">—</span>
                </td>
                <td>
                  <span class="slw__priority" :class="`slw__priority--${t.urgency || 'medium'}`">{{ t.urgency || 'medium' }}</span>
                </td>
                <td>
                  <span class="slw__status" :class="`slw__status--${t.status || 'pending'}`">{{ statusLabel(t.status) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="selectedTask" class="slw__detail">
          <TaskDetailSidePanel
            :item="selectedTask"
            :agency-id="list.agency_id || null"
            :type-defs="typeDefs"
            :lists="[list]"
            :projects="linkedProjectOption"
            :agency-users="agencyUsersShape"
            @close="selectedTask = null"
            @complete="onTaskComplete"
            @incomplete="onTaskIncomplete"
            @changed="onTaskChanged"
          />
        </div>
      </div>

      <BulkActionBar
        :count="selectedIds.size"
        :users="agencyUsersShape"
        :type-defs="typeDefs"
        :busy="bulkBusy"
        @complete="bulkComplete"
        @assign="bulkAssign"
        @due-date="bulkDueDate"
        @priority="bulkPriority"
        @type="bulkType"
        @status="bulkStatus"
        @clear="clearSelection"
      />
    </template>

    <!-- Members panel -->
    <div v-if="showMembers" class="slw__members-overlay" @click.self="showMembers = false">
      <div class="slw__members-panel">
        <header>
          <h3>Members</h3>
          <button type="button" class="slw__close" @click="showMembers = false">×</button>
        </header>
        <ul class="slw__member-list">
          <li v-for="m in members" :key="m.user_id">
            <span class="slw__member-avatar" :style="{ background: memberColor(m.user_id) }">
              <img v-if="m.profile_photo_path" :src="toUploadsUrl(m.profile_photo_path)" :alt="memberLabel(m)" />
              <template v-else>{{ memberInitials(m) }}</template>
            </span>
            <span class="slw__member-name">{{ memberLabel(m) }}</span>
            <span class="slw__member-role">{{ m.role }}</span>
            <button
              v-if="canAdmin && Number(m.user_id) !== Number(currentUserId)"
              type="button"
              class="slw__member-remove"
              :disabled="removingMemberId === m.user_id"
              @click="removeMember(m)"
            >
              Remove
            </button>
          </li>
        </ul>
        <div v-if="canAdmin" class="slw__add-member">
          <select v-model="addMemberUserId" class="form-control form-control-sm">
            <option :value="null">Add a member…</option>
            <option v-for="u in availableUsers" :key="u.id" :value="u.id">{{ userLabel(u) }}</option>
          </select>
          <select v-model="addMemberRole" class="form-control form-control-sm">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button type="button" class="btn-primary" :disabled="!addMemberUserId || addingMember" @click="addMember">
            Add
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { formatDate } from '../utils/formatDate';
import { toUploadsUrl } from '../utils/uploadsUrl';
import TaskDetailSidePanel from '../components/tasks/TaskDetailSidePanel.vue';
import BulkActionBar from '../components/tasks/BulkActionBar.vue';
import { useAuthStore } from '../store/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const currentUserId = computed(() => authStore.user?.id);

const orgPrefix = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? `/${slug}` : '';
});
const listId = computed(() => parseInt(route.params.listId, 10));

const loading = ref(true);
const tasksLoading = ref(false);
const list = ref(null);
const members = ref([]);
const tasks = ref([]);
const selectedTask = ref(null);
const statusTab = ref('pending');
const sortBy = ref('priority');
const showMembers = ref(false);
const availableUsers = ref([]);
const addMemberUserId = ref(null);
const addMemberRole = ref('viewer');
const addingMember = ref(false);
const removingMemberId = ref(null);
const newTaskTitle = ref('');
const newTaskUrgency = ref('medium');
const newTaskAssignee = ref(null);
const newTaskDueDate = ref('');
const adding = ref(false);
const addTaskError = ref('');
const togglingId = ref(null);
const typeDefs = ref([]);

// ─── Multi-select / bulk actions ─────────────────────────────────────────
const selectedIds = ref(new Set());
const bulkBusy = ref(false);

const allSelected = computed(() => sortedTasks.value.length > 0 && selectedIds.value.size === sortedTasks.value.length);
const someSelected = computed(() => selectedIds.value.size > 0 && !allSelected.value);

function toggleSelectRow(t) {
  const next = new Set(selectedIds.value);
  if (next.has(t.id)) next.delete(t.id);
  else next.add(t.id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(sortedTasks.value.map((t) => t.id));
}

function clearSelection() {
  selectedIds.value = new Set();
}

const selectedTaskObjs = computed(() => tasks.value.filter((t) => selectedIds.value.has(t.id)));

async function bulkComplete() {
  bulkBusy.value = true;
  try {
    await Promise.all(selectedTaskObjs.value.map((t) => api.put(`/tasks/${t.id}/complete`, {}, { skipGlobalLoading: true }).catch(() => {})));
    await loadTasks();
  } finally {
    bulkBusy.value = false;
    clearSelection();
  }
}

async function bulkAssign(userId) {
  bulkBusy.value = true;
  try {
    await Promise.all(selectedTaskObjs.value.map((t) => api.put(`/me/tasks/${t.id}`, { assigned_to_user_id: userId }, { skipGlobalLoading: true }).catch(() => {})));
    await loadTasks();
  } finally {
    bulkBusy.value = false;
    clearSelection();
  }
}

async function bulkDueDate(date) {
  bulkBusy.value = true;
  try {
    await Promise.all(selectedTaskObjs.value.map((t) => api.put(`/me/tasks/${t.id}`, { due_date: date }, { skipGlobalLoading: true }).catch(() => {})));
    await loadTasks();
  } finally {
    bulkBusy.value = false;
    clearSelection();
  }
}

async function bulkPriority(urgency) {
  bulkBusy.value = true;
  try {
    await Promise.all(selectedTaskObjs.value.map((t) => api.put(`/me/tasks/${t.id}`, { urgency }, { skipGlobalLoading: true }).catch(() => {})));
    await loadTasks();
  } finally {
    bulkBusy.value = false;
    clearSelection();
  }
}

async function bulkType(workTypeId) {
  bulkBusy.value = true;
  try {
    await Promise.all(selectedTaskObjs.value.map((t) => api.put(`/me/tasks/${t.id}`, { work_type_id: workTypeId }, { skipGlobalLoading: true }).catch(() => {})));
    await loadTasks();
  } finally {
    bulkBusy.value = false;
    clearSelection();
  }
}

async function bulkStatus(status) {
  bulkBusy.value = true;
  try {
    await Promise.all(selectedTaskObjs.value.map((t) => {
      if (status === 'completed') return api.put(`/tasks/${t.id}/complete`, {}, { skipGlobalLoading: true }).catch(() => {});
      return api.put(`/me/tasks/${t.id}`, { status }, { skipGlobalLoading: true }).catch(() => {});
    }));
    await loadTasks();
  } finally {
    bulkBusy.value = false;
    clearSelection();
  }
}

async function loadTypeDefs() {
  try {
    const { data } = await api.get('/task-types', {
      params: { agencyId: list.value?.agency_id || undefined },
      skipGlobalLoading: true
    });
    typeDefs.value = Array.isArray(data) ? data : [];
  } catch {
    typeDefs.value = [];
  }
}

const canEdit = computed(() => list.value?.my_role === 'editor' || list.value?.my_role === 'admin');
const canAdmin = computed(() => list.value?.my_role === 'admin');

const pendingCount = computed(() => tasks.value.filter((t) => t.status !== 'completed' && t.status !== 'overridden').length);

const linkedProjectOption = computed(() => {
  if (!list.value?.linked_project_id) return [];
  return [{ id: list.value.linked_project_id, name: list.value.linked_project_name || 'Project' }];
});

const agencyUsersShape = computed(() =>
  members.value.map((m) => ({ id: m.user_id, first_name: m.first_name, last_name: m.last_name }))
);

const MEMBER_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316', '#6366f1'];
const memberColorMap = computed(() => {
  const map = {};
  members.value.forEach((m, i) => { map[m.user_id] = MEMBER_COLORS[i % MEMBER_COLORS.length]; });
  return map;
});
const memberColor = (userId) => memberColorMap.value[userId] || '#94a3b8';
const memberLabel = (m) => [m.first_name, m.last_name].filter(Boolean).join(' ') || `User ${m.user_id}`;
const memberInitials = (m) => initialsOf(m.first_name, m.last_name);
const initialsOf = (fn, ln) => ((fn?.[0] || '') + (ln?.[0] || '')).toUpperCase() || '?';
const assigneeName = (t) => [t.assignee_first_name, t.assignee_last_name].filter(Boolean).join(' ') || 'Assigned';
const userLabel = (u) => {
  const name = [u.first_name ?? u.firstName, u.last_name ?? u.lastName].filter(Boolean).join(' ');
  return name || u.email || `User #${u.id}`;
};
const isOverdue = (d) => d && new Date(d) < new Date();

function statusLabel(s) {
  const map = { pending: 'Open', in_progress: 'In Progress', waiting: 'Waiting', completed: 'Completed', overridden: 'Completed' };
  return map[s] || 'Open';
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const sortedTasks = computed(() => {
  const list = [...tasks.value];
  list.sort((a, b) => {
    if (sortBy.value === 'priority') {
      return (PRIORITY_ORDER[a.urgency || 'medium'] ?? 1) - (PRIORITY_ORDER[b.urgency || 'medium'] ?? 1);
    }
    if (sortBy.value === 'due_date') {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    }
    if (sortBy.value === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
    if (sortBy.value === 'status') return String(a.status || '').localeCompare(String(b.status || ''));
    if (sortBy.value === 'assignee') return assigneeName(a).localeCompare(assigneeName(b));
    return 0;
  });
  return list;
});

function goBack() {
  router.push(`${orgPrefix.value}/tasks`);
}

function openProject(projectId) {
  router.push(`${orgPrefix.value}/tasks/projects/${projectId}`);
}

function selectTask(t) {
  selectedTask.value = t;
}

async function loadList() {
  loading.value = true;
  try {
    const { data } = await api.get(`/task-lists/${listId.value}`, { skipGlobalLoading: true });
    list.value = data;
    members.value = data?.members || [];
    await loadTypeDefs();
  } catch (e) {
    console.error(e);
    list.value = null;
  } finally {
    loading.value = false;
  }
}

async function loadTasks() {
  if (!listId.value) return;
  tasksLoading.value = true;
  clearSelection();
  try {
    const statusParam = statusTab.value === 'completed' ? 'completed' : 'open';
    const { data } = await api.get(`/task-lists/${listId.value}/tasks`, {
      params: { status: statusParam },
      skipGlobalLoading: true
    });
    tasks.value = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(e);
    tasks.value = [];
  } finally {
    tasksLoading.value = false;
  }
}

async function fetchAvailableUsers() {
  try {
    const { data } = await api.get(`/task-lists/${listId.value}/agency-users`, { skipGlobalLoading: true });
    const all = Array.isArray(data) ? data : [];
    const memberIds = new Set(members.value.map((m) => Number(m.user_id)));
    availableUsers.value = all.filter((u) => !memberIds.has(Number(u.id)));
  } catch {
    availableUsers.value = [];
  }
}

async function addTask() {
  const title = newTaskTitle.value.trim();
  if (!title) return;
  adding.value = true;
  addTaskError.value = '';
  try {
    await api.post(`/task-lists/${listId.value}/tasks`, {
      title,
      urgency: newTaskUrgency.value || 'medium',
      assigned_to_user_id: newTaskAssignee.value,
      due_date: newTaskDueDate.value || null
    });
    newTaskTitle.value = '';
    newTaskDueDate.value = '';
    newTaskUrgency.value = 'medium';
    await loadTasks();
  } catch (e) {
    addTaskError.value = e?.response?.data?.error?.message || 'Could not add task. Please try again.';
  } finally {
    adding.value = false;
  }
}

async function toggleComplete(t) {
  togglingId.value = t.id;
  try {
    if (t.status === 'completed') {
      await api.put(`/tasks/${t.id}/incomplete`, {}, { skipGlobalLoading: true });
    } else {
      await api.put(`/tasks/${t.id}/complete`, {}, { skipGlobalLoading: true });
    }
    await loadTasks();
  } catch (e) {
    console.error(e);
  } finally {
    togglingId.value = null;
  }
}

function onTaskComplete() {
  selectedTask.value = null;
  loadTasks();
}
function onTaskIncomplete() {
  loadTasks();
}
function onTaskChanged(updated) {
  if (!updated) return;
  const idx = tasks.value.findIndex((t) => t.id === updated.id);
  if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], ...updated };
}

async function addMember() {
  if (!addMemberUserId.value) return;
  addingMember.value = true;
  try {
    await api.post(`/task-lists/${listId.value}/members`, {
      userId: addMemberUserId.value,
      role: addMemberRole.value || 'viewer'
    });
    addMemberUserId.value = null;
    addMemberRole.value = 'viewer';
    await loadList();
    await fetchAvailableUsers();
  } catch (e) {
    console.error(e);
  } finally {
    addingMember.value = false;
  }
}

async function removeMember(m) {
  removingMemberId.value = m.user_id;
  try {
    await api.delete(`/task-lists/${listId.value}/members/${m.user_id}`);
    await loadList();
    await fetchAvailableUsers();
  } catch (e) {
    console.error(e);
  } finally {
    removingMemberId.value = null;
  }
}

watch(showMembers, (open) => {
  if (open) fetchAvailableUsers();
});

watch(listId, () => {
  selectedTask.value = null;
  loadList();
  loadTasks();
});

onMounted(() => {
  loadList();
  loadTasks();
});
</script>

<style scoped>
.slw {
  min-height: 100vh;
  background: #f8fafc;
}

.slw__hero {
  background: linear-gradient(135deg, #14532d, #166534);
  color: #fff;
  padding: 16px 28px 22px;
}
.slw__back {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 14px;
}
.slw__back:hover { background: rgba(255, 255, 255, 0.25); }

.slw__hero-inner {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.slw__hero-main h1 { margin: 6px 0 8px; font-size: 26px; }

.slw__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.18);
  padding: 3px 9px;
  border-radius: 99px;
}
.slw__badge svg { width: 12px; height: 12px; }

.slw__project-pill {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 99px;
  cursor: pointer;
}
.slw__project-pill:hover { background: rgba(255, 255, 255, 0.25); }

.slw__hero-members { display: flex; align-items: center; gap: 12px; }
.slw__avatars { display: flex; }
.slw__avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  border: 2px solid #166534;
  margin-left: -8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff;
  overflow: hidden;
}
.slw__avatar:first-child { margin-left: 0; }
.slw__avatar img { width: 100%; height: 100%; object-fit: cover; }
.slw__avatar--more { background: rgba(255, 255, 255, 0.25); }

.slw__manage-btn {
  background: #fff;
  color: #14532d;
  border: none;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
}
.slw__manage-btn:hover { background: #dcfce7; }

.slw__state {
  padding: 40px 28px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}
.slw__state--error { color: #dc2626; }

.slw__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px 0;
}
.slw__tabs { display: flex; gap: 6px; }
.slw__tabs button {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}
.slw__tabs button.active { background: #14532d; color: #fff; border-color: #14532d; }
.slw__tab-count {
  font-size: 10px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 99px;
  padding: 1px 6px;
  margin-left: 4px;
}
.slw__tabs button.active .slw__tab-count { background: rgba(255, 255, 255, 0.25); }

.slw__sort { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; }

.slw__add-task {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr auto;
  gap: 8px;
  margin: 14px 28px 0;
}
.slw__error { margin: 8px 28px 0; font-size: 12px; color: #dc2626; }

.form-control {
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  background: #fff;
}
.form-control-sm { padding: 6px 8px; font-size: 12px; }
.btn-primary {
  background: #16a34a;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.btn-primary:disabled { opacity: 0.5; cursor: default; }

.slw__body {
  display: flex;
  gap: 16px;
  padding: 16px 28px 28px;
  align-items: flex-start;
}

.slw__table-wrap {
  flex: 1;
  min-width: 320px;
  overflow-x: auto;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}

.slw__table { width: 100%; border-collapse: collapse; font-size: 13px; }
.slw__table thead th {
  text-align: left;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.slw__table tbody tr { cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.1s; }
.slw__table tbody tr:hover { background: #f8fafc; }
.slw__table tbody tr.slw__row--selected { background: #f0fdf4; }
.slw__table tbody tr.slw__row--waiting { opacity: 0.75; }
.slw__table td { padding: 10px 12px; vertical-align: middle; }

.slw__col-select { width: 30px; text-align: center; }
.slw__col-select input { cursor: pointer; }
.slw__col-check { width: 34px; }
.slw__check {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  padding: 0;
}
.slw__check svg { width: 11px; height: 11px; }
.slw__check--done { background: #16a34a; border-color: #16a34a; }

.slw__col-title { font-weight: 600; color: #0f172a; }
.slw__done-text { text-decoration: line-through; color: #94a3b8; font-weight: 400; }
.slw__waiting-badge {
  margin-left: 8px;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  background: #fef3c7;
  color: #92400e;
  padding: 1px 6px;
  border-radius: 99px;
}

.slw__assignee { display: inline-flex; align-items: center; gap: 6px; }
.slw__assignee-avatar {
  width: 22px; height: 22px;
  border-radius: 50%;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.slw__assignee-avatar img { width: 100%; height: 100%; object-fit: cover; }
.slw__muted { color: #94a3b8; }
.slw__overdue { color: #dc2626; font-weight: 600; }

.slw__priority {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 99px;
}
.slw__priority--high { background: #fee2e2; color: #dc2626; }
.slw__priority--medium { background: #fef3c7; color: #92400e; }
.slw__priority--low { background: #dcfce7; color: #16a34a; }

.slw__status {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
  background: #f1f5f9;
  color: #64748b;
}
.slw__status--waiting { background: #fef3c7; color: #92400e; }
.slw__status--in_progress { background: #dbeafe; color: #1e40af; }
.slw__status--completed { background: #dcfce7; color: #16a34a; }

.slw__detail {
  width: 800px;
  max-width: 100%;
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  align-self: flex-start;
}
.slw__detail :deep(.side-panel) { width: 100%; height: auto; max-height: none; }

.slw__members-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  justify-content: flex-end;
  z-index: 950;
}
.slw__members-panel {
  width: 340px;
  max-width: 90vw;
  background: #fff;
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.slw__members-panel header { display: flex; align-items: center; justify-content: space-between; }
.slw__members-panel h3 { margin: 0; font-size: 16px; }
.slw__close { background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b; }

.slw__member-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.slw__member-list li { display: flex; align-items: center; gap: 10px; }
.slw__member-avatar {
  width: 30px; height: 30px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.slw__member-avatar img { width: 100%; height: 100%; object-fit: cover; }
.slw__member-name { flex: 1; font-size: 13px; font-weight: 600; color: #0f172a; }
.slw__member-role {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
}
.slw__member-remove {
  font-size: 11px;
  color: #dc2626;
  background: none;
  border: none;
  cursor: pointer;
}

.slw__add-member { display: flex; flex-direction: column; gap: 8px; margin-top: auto; padding-top: 14px; border-top: 1px solid #f1f5f9; }

@media (max-width: 1400px) {
  .slw__body { flex-direction: column; }
  .slw__detail { width: 100%; }
}
@media (max-width: 900px) {
  .slw__add-task { grid-template-columns: 1fr 1fr; }
}
</style>
