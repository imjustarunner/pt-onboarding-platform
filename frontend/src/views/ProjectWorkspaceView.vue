<template>
  <div class="project-workspace">
    <header class="project-workspace__hero">
      <div class="project-workspace__hero-inner">
        <button type="button" class="back-btn" @click="goBack">← Back to Tasks</button>
        <div class="project-workspace__title-block">
          <p class="eyebrow">Project workspace</p>
          <h1>{{ project?.name || 'Project' }}</h1>
          <p v-if="project?.description" class="subtitle">{{ project.description }}</p>
          <p v-if="project?.due_date" class="due-chip">Due {{ formatDate(project.due_date) }}</p>
        </div>
        <div class="project-workspace__hero-actions">
          <div class="members">
            <span
              v-for="m in (overview?.members || []).slice(0, 5)"
              :key="m.user_id || m.id"
              class="avatar"
              :title="`${m.first_name} ${m.last_name}`"
            >
              {{ initials(m) }}
            </span>
          </div>
          <button type="button" class="btn-edit" @click="showEdit = true">Edit</button>
        </div>
      </div>
    </header>

    <nav class="project-workspace__tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
        <span v-if="t.id === 'tasks' && tasks.length" class="tab-count">{{ tasks.length }}</span>
      </button>
    </nav>

    <main class="project-workspace__content">
      <div v-if="loading" class="state">Loading project…</div>
      <template v-else>

        <!-- ── Overview ── -->
        <div v-if="tab === 'overview'" class="overview-grid">
          <div class="kpis">
            <div class="kpi">
              <strong>{{ overview?.progress_pct || 0 }}%</strong>
              <span>Progress</span>
            </div>
            <div class="kpi">
              <strong>{{ overview?.total_task_count || 0 }}</strong>
              <span>Tasks</span>
            </div>
            <div class="kpi">
              <strong>{{ overview?.open_action_item_count || 0 }}</strong>
              <span>Action items</span>
            </div>
            <div class="kpi">
              <strong>{{ overview?.list_count || 0 }}</strong>
              <span>Shared lists</span>
            </div>
            <div class="kpi">
              <strong>{{ overview?.document_count || 0 }}</strong>
              <span>Documents</span>
            </div>
          </div>
          <div class="panels">
            <section class="panel">
              <h3>Shared lists</h3>
              <ul class="card-list">
                <li
                  v-for="l in overview?.lists || []"
                  :key="l.id"
                  class="card-list__row"
                  style="cursor:pointer"
                  @click="tab = 'tasks'"
                >
                  <strong>{{ l.name }}</strong>
                  <span class="muted-val">{{ l.open_task_count || 0 }} open / {{ l.total_task_count || 0 }}</span>
                </li>
                <li v-if="!(overview?.lists || []).length" class="empty">No lists linked yet</li>
              </ul>
            </section>
            <section class="panel">
              <h3>Quick actions</h3>
              <div class="quick">
                <button type="button" class="quick-btn" @click="tab = 'tasks'">View tasks</button>
                <button type="button" class="quick-btn" @click="tab = 'lists'">Manage lists</button>
                <button type="button" class="quick-btn" @click="showEdit = true">Edit project</button>
              </div>
            </section>
          </div>
        </div>

        <!-- ── Tasks (redesigned) ── -->
        <div v-else-if="tab === 'tasks'" class="tasks-workspace">

          <!-- Left sidebar: lists → tasks hierarchy -->
          <aside class="tasks-sidebar">
            <div class="sidebar-head">
              <span class="sidebar-head__label">Lists & Tasks</span>
              <button type="button" class="sidebar-head__all" @click="collapseAll">Collapse all</button>
            </div>

            <div v-if="!tasksByList.length" class="sidebar-empty">No tasks in this project yet.</div>

            <div
              v-for="group in tasksByList"
              :key="group.listId"
              class="list-group"
            >
              <button
                type="button"
                class="list-group__head"
                @click="toggleGroup(group.listId)"
              >
                <span class="list-group__chev">{{ expandedGroups[group.listId] ? '▾' : '▸' }}</span>
                <span class="list-group__name">{{ group.listName }}</span>
                <span class="list-group__count">{{ group.tasks.length }}</span>
              </button>

              <div v-show="expandedGroups[group.listId]" class="list-group__body">
                <div
                  v-for="task in group.tasks"
                  :key="task.id"
                  class="task-row"
                  :class="{
                    'task-row--selected': selectedTask?.id === task.id,
                    'task-row--completed': task.status === 'completed',
                    'task-row--waiting': task.status === 'waiting'
                  }"
                  @click="selectTask(task)"
                >
                  <div class="task-row__main">
                    <span class="task-row__title">{{ task.title }}</span>
                  </div>

                  <div class="task-row__actions" @click.stop>
                    <!-- Quick assign -->
                    <button
                      type="button"
                      class="qa-btn qa-btn--assign"
                      :class="{ 'qa-btn--assigned': task.assigned_to_user_id }"
                      :title="assigneeName(task) || 'Assign'"
                      @click="openAssignPopover($event, task)"
                    >
                      <span class="qa-btn__avatar" v-if="task.assigned_to_user_id">
                        {{ assigneeInitials(task) }}
                      </span>
                      <span v-else class="qa-btn__label">+ Assign</span>
                    </button>

                    <!-- Quick status -->
                    <button
                      type="button"
                      class="status-pill"
                      :class="`status-pill--${task.status || 'pending'}`"
                      @click="openStatusPopover($event, task)"
                    >
                      {{ statusLabel(task.status) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <!-- Right: task detail or empty state -->
          <div class="tasks-detail">
            <TaskDetailSidePanel
              v-if="selectedTask"
              :item="selectedTask"
              :agency-id="project?.agency_id || null"
              :type-defs="[]"
              :lists="allLists"
              :projects="[]"
              :agency-users="agencyUsers"
              @close="selectedTask = null"
              @complete="onTaskComplete"
              @incomplete="onTaskIncomplete"
              @changed="onTaskChanged"
              @list-created="onListCreated"
            />
            <div v-else class="detail-empty">
              <div class="detail-empty__icon">☑</div>
              <p>Select a task from the list to view and edit details</p>
            </div>
          </div>
        </div>

        <!-- ── Lists ── -->
        <div v-else-if="tab === 'lists'" class="panel panel--full">
          <ul class="task-ul">
            <li v-for="l in overview?.lists || []" :key="l.id">
              <strong>{{ l.name }}</strong>
              <div class="row-actions">
                <span class="muted">{{ l.open_task_count || 0 }} open</span>
                <button type="button" class="btn-x" @click="detachList(l.id)">Detach</button>
              </div>
            </li>
            <li v-if="!(overview?.lists || []).length" class="empty">No shared lists linked</li>
          </ul>
          <div class="attach-row">
            <input
              v-model="listAttachSearch"
              type="search"
              class="form-control"
              placeholder="Search lists to attach…"
            />
            <select v-model="attachListId" class="form-control">
              <option value="">Attach a shared list…</option>
              <option v-for="l in filteredAvailableLists" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
            </select>
            <button type="button" class="btn-primary" :disabled="!attachListId" @click="attachList">
              Attach
            </button>
          </div>
        </div>

        <div v-else-if="tab === 'documents'" class="state panel">
          {{ overview?.document_count || 0 }} document(s) linked via project tasks. Open a task to manage attachments.
        </div>

        <div v-else-if="tab === 'activity'" class="state panel">
          Activity feed will expand here as tasks and documents change.
        </div>

        <div v-else class="state panel">Whiteboard coming soon</div>
      </template>
    </main>

    <!-- Assign popover -->
    <div
      v-if="assignPopover.open"
      class="pop-backdrop"
      @mousedown.self="assignPopover.open = false"
    >
      <div
        class="pop"
        :style="{ top: assignPopover.top + 'px', left: assignPopover.left + 'px' }"
      >
        <p class="pop__head">Assign to</p>
        <button
          v-for="u in agencyUsers"
          :key="u.id"
          type="button"
          class="pop__row"
          :class="{ 'pop__row--active': assignPopover.task?.assigned_to_user_id === u.id }"
          @mousedown.prevent="doAssign(u)"
        >
          <span class="pop__initials">{{ userInitials(u) }}</span>
          {{ u.first_name }} {{ u.last_name }}
        </button>
        <button
          v-if="assignPopover.task?.assigned_to_user_id"
          type="button"
          class="pop__row pop__row--clear"
          @mousedown.prevent="doAssign(null)"
        >
          Remove assignment
        </button>
        <p v-if="!agencyUsers.length" class="pop__empty">No teammates found</p>
      </div>
    </div>

    <!-- Status popover -->
    <div
      v-if="statusPopover.open"
      class="pop-backdrop"
      @mousedown.self="statusPopover.open = false"
    >
      <div
        class="pop"
        :style="{ top: statusPopover.top + 'px', left: statusPopover.left + 'px' }"
      >
        <p class="pop__head">Change status</p>
        <button
          v-for="s in statusOptions"
          :key="s.value"
          type="button"
          class="pop__row pop__row--status"
          :class="{ 'pop__row--active': statusPopover.task?.status === s.value }"
          @mousedown.prevent="doStatus(s.value)"
        >
          <span class="status-dot" :class="`status-dot--${s.value}`" />
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- Edit project sheet -->
    <div v-if="showEdit" class="edit-overlay" @click.self="showEdit = false">
      <div class="edit-sheet">
        <header class="edit-sheet__head">
          <h2>Edit project</h2>
          <button type="button" class="btn-x" @click="showEdit = false">✕</button>
        </header>
        <label class="field">
          <span>Name</span>
          <input v-model="editForm.name" class="form-control" type="text" />
        </label>
        <label class="field">
          <span>Description</span>
          <textarea v-model="editForm.description" class="form-control" rows="3" />
        </label>
        <label class="field">
          <span>Due date</span>
          <input v-model="editForm.dueDate" class="form-control" type="date" />
        </label>
        <div class="field">
          <span>Members</span>
          <div class="pick-box">
            <label v-for="u in agencyUsers" :key="u.id" class="pick-row">
              <input v-model="editForm.memberIds" type="checkbox" :value="u.id" />
              {{ u.first_name }} {{ u.last_name }}
            </label>
          </div>
        </div>
        <div class="field">
          <span>Shared lists</span>
          <div class="pick-box">
            <label v-for="l in allLists" :key="l.id" class="pick-row">
              <input v-model="editForm.listIds" type="checkbox" :value="l.id" />
              {{ l.name }}
            </label>
          </div>
        </div>
        <div class="field">
          <span>Add tasks & action items</span>
          <div class="pick-box">
            <label v-for="t in unattachedTasks" :key="`t-${t.id}`" class="pick-row">
              <input v-model="editForm.taskIds" type="checkbox" :value="t.id" />
              {{ t.title }}
            </label>
            <label v-for="a in unattachedActions" :key="`a-${a.id}`" class="pick-row">
              <input v-model="editForm.actionIds" type="checkbox" :value="a.id" />
              {{ a.title }}
            </label>
          </div>
        </div>
        <div class="edit-sheet__actions">
          <button type="button" class="btn-primary" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
          <button type="button" class="btn-ghost" @click="showEdit = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import TaskDetailSidePanel from '../components/tasks/TaskDetailSidePanel.vue';

const route = useRoute();
const router = useRouter();

const projectId = computed(() => parseInt(route.params.projectId, 10));
const orgPrefix = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? `/${slug}` : '';
});

const loading = ref(true);
const saving = ref(false);
const showEdit = ref(false);
const project = ref(null);
const overview = ref(null);
const tasks = ref([]);
const allLists = ref([]);
const agencyUsers = ref([]);
const unattachedTasks = ref([]);
const unattachedActions = ref([]);
const attachListId = ref('');
const listAttachSearch = ref('');
const tab = ref('overview');
const selectedTask = ref(null);

// Track which list groups are expanded (all open by default)
const expandedGroups = ref({});

const editForm = reactive({
  name: '',
  description: '',
  dueDate: '',
  memberIds: [],
  listIds: [],
  taskIds: [],
  actionIds: [],
  existingMemberIds: [],
  existingListIds: []
});

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'lists', label: 'Lists' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
  { id: 'whiteboard', label: 'Whiteboard' }
];

const statusOptions = [
  { value: 'pending', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' }
];

// ── Quick-assign popover state ──
const assignPopover = reactive({ open: false, task: null, top: 0, left: 0 });
const statusPopover = reactive({ open: false, task: null, top: 0, left: 0 });

// ── Computed: group tasks by shared list ──
const tasksByList = computed(() => {
  const groups = {};
  const order = [];

  for (const t of tasks.value || []) {
    const key = t.task_list_id ? String(t.task_list_id) : '__none__';
    const name = t.task_list_name || (t.task_list_id ? `List ${t.task_list_id}` : 'Direct tasks');
    if (!groups[key]) {
      groups[key] = { listId: key, listName: name, tasks: [] };
      order.push(key);
    }
    groups[key].tasks.push(t);
  }

  return order.map((k) => groups[k]);
});

const attachedListIds = computed(() => new Set((overview.value?.lists || []).map((l) => Number(l.id))));

const filteredAvailableLists = computed(() => {
  const q = listAttachSearch.value.trim().toLowerCase();
  return (allLists.value || []).filter((l) => {
    if (attachedListIds.value.has(Number(l.id))) return false;
    if (!q) return true;
    return String(l.name || '').toLowerCase().includes(q);
  });
});

// ── Helpers ──
function initials(m) {
  return `${(m.first_name || '?')[0]}${(m.last_name || '')[0] || ''}`.toUpperCase();
}

function userInitials(u) {
  return `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase();
}

function assigneeName(task) {
  if (!task?.assigned_to_user_id) return null;
  const u = agencyUsers.value.find((u) => Number(u.id) === Number(task.assigned_to_user_id));
  if (u) return `${u.first_name} ${u.last_name}`;
  const fn = task.assignee_first_name || '';
  const ln = task.assignee_last_name || '';
  return `${fn} ${ln}`.trim() || null;
}

function assigneeInitials(task) {
  const fn = task.assignee_first_name || '';
  const ln = task.assignee_last_name || '';
  if (fn || ln) return `${fn[0] || ''}${ln[0] || ''}`.toUpperCase();
  const u = agencyUsers.value.find((u) => Number(u.id) === Number(task.assigned_to_user_id));
  if (u) return `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase();
  return '?';
}

function statusLabel(s) {
  const map = { pending: 'Open', in_progress: 'In progress', waiting: 'Waiting', completed: 'Done', overridden: 'Override' };
  return map[s] || s || 'Open';
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function goBack() {
  router.push(`${orgPrefix.value}/tasks`);
}

function toggleGroup(listId) {
  expandedGroups.value[listId] = !expandedGroups.value[listId];
}

function collapseAll() {
  for (const g of tasksByList.value) {
    expandedGroups.value[g.listId] = false;
  }
}

function selectTask(task) {
  selectedTask.value = task;
}

function positionPopover(ev) {
  const rect = ev.currentTarget.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 240);
  const top = rect.bottom + window.scrollY + 4;
  return { top, left };
}

function openAssignPopover(ev, task) {
  const pos = positionPopover(ev);
  statusPopover.open = false;
  Object.assign(assignPopover, { open: true, task, ...pos });
}

function openStatusPopover(ev, task) {
  const pos = positionPopover(ev);
  assignPopover.open = false;
  Object.assign(statusPopover, { open: true, task, ...pos });
}

async function doAssign(user) {
  assignPopover.open = false;
  const task = assignPopover.task;
  if (!task) return;
  try {
    const userId = user ? Number(user.id) : null;
    await api.put(`/me/tasks/${task.id}`, { assigned_to_user_id: userId }, { skipGlobalLoading: true });
    // Update in-place
    const t = tasks.value.find((t) => t.id === task.id);
    if (t) {
      t.assigned_to_user_id = userId;
      t.assignee_first_name = user?.first_name || null;
      t.assignee_last_name = user?.last_name || null;
    }
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = { ...selectedTask.value, assigned_to_user_id: userId };
    }
  } catch (e) {
    console.error('[ProjectWorkspace] doAssign:', e);
  }
}

async function doStatus(newStatus) {
  statusPopover.open = false;
  const task = statusPopover.task;
  if (!task || task.status === newStatus) return;
  try {
    if (newStatus === 'completed') {
      await api.put(`/tasks/${task.id}/complete`, {}, { skipGlobalLoading: true });
    } else if (task.status === 'completed') {
      await api.put(`/tasks/${task.id}/incomplete`, {}, { skipGlobalLoading: true });
    } else {
      await api.put(`/me/tasks/${task.id}`, { status: newStatus }, { skipGlobalLoading: true });
    }
    const t = tasks.value.find((t) => t.id === task.id);
    if (t) t.status = newStatus;
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = { ...selectedTask.value, status: newStatus };
    }
  } catch (e) {
    console.error('[ProjectWorkspace] doStatus:', e);
  }
}

// ── Task detail panel callbacks ──
async function onTaskComplete(task) {
  try {
    await api.put(`/tasks/${task.id}/complete`, {}, { skipGlobalLoading: true });
    const t = tasks.value.find((t) => t.id === task.id);
    if (t) t.status = 'completed';
    if (selectedTask.value?.id === task.id) selectedTask.value = { ...selectedTask.value, status: 'completed' };
  } catch (e) { console.error(e); }
}

async function onTaskIncomplete(task) {
  try {
    await api.put(`/tasks/${task.id}/incomplete`, {}, { skipGlobalLoading: true });
    const t = tasks.value.find((t) => t.id === task.id);
    if (t) t.status = 'pending';
    if (selectedTask.value?.id === task.id) selectedTask.value = { ...selectedTask.value, status: 'pending' };
  } catch (e) { console.error(e); }
}

async function onTaskChanged() {
  // Refresh the task from API without losing the selected state
  if (!selectedTask.value) return;
  try {
    const { data } = await api.get(`/me/tasks`, { params: { view: 'all' }, skipGlobalLoading: true });
    const fresh = (Array.isArray(data) ? data : []).find((t) => t.id === selectedTask.value.id);
    if (fresh) {
      selectedTask.value = fresh;
      const idx = tasks.value.findIndex((t) => t.id === fresh.id);
      if (idx !== -1) tasks.value[idx] = fresh;
    }
  } catch { /* ignore */ }
}

function onListCreated(list) {
  if (list) allLists.value = [...allLists.value, list];
}

// ── Data loading ──
function syncEditForm() {
  editForm.name = project.value?.name || '';
  editForm.description = project.value?.description || '';
  editForm.dueDate = project.value?.due_date ? String(project.value.due_date).slice(0, 10) : '';
  editForm.existingMemberIds = (overview.value?.members || []).map((m) => Number(m.user_id));
  editForm.existingListIds = (overview.value?.lists || []).map((l) => Number(l.id));
  editForm.memberIds = [...editForm.existingMemberIds];
  editForm.listIds = [...editForm.existingListIds];
  editForm.taskIds = [];
  editForm.actionIds = [];
}

async function loadAux() {
  const agencyId = project.value?.agency_id;
  try {
    const [usersRes, listsRes, tasksRes, actionsRes] = await Promise.all([
      agencyId
        ? api.get(`/agencies/${agencyId}/users`, { skipGlobalLoading: true })
        : api.get('/users/me/agencies', { skipGlobalLoading: true }).then(async (r) => {
            const ids = (Array.isArray(r.data) ? r.data : []).map((a) => a.id).filter(Boolean);
            if (!ids.length) return { data: [] };
            const all = await Promise.all(ids.map((id) =>
              api.get(`/agencies/${id}/users`, { skipGlobalLoading: true }).then((x) => x.data).catch(() => [])
            ));
            const seen = new Set();
            return { data: all.flat().filter((u) => { if (seen.has(u.id)) return false; seen.add(u.id); return true; }) };
          }),
      api.get('/task-lists', { skipGlobalLoading: true }),
      api.get('/tasks', {
        params: { view: 'assigned', agencyId: agencyId || undefined, unassignedFromProject: '1', limit: 100 },
        skipGlobalLoading: true
      }),
      api.get('/task-action-items', {
        params: { agencyId: agencyId || undefined, unassignedFromProject: '1' },
        skipGlobalLoading: true
      })
    ]);
    agencyUsers.value = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []);
    allLists.value = Array.isArray(listsRes.data) ? listsRes.data : [];
    unattachedTasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    unattachedActions.value = Array.isArray(actionsRes.data) ? actionsRes.data : [];
  } catch {
    /* ignore */
  }
}

async function load() {
  loading.value = true;
  try {
    const [{ data }, tasksRes] = await Promise.all([
      api.get(`/task-projects/${projectId.value}`, { skipGlobalLoading: true }),
      api.get(`/task-projects/${projectId.value}/tasks`, { skipGlobalLoading: true })
    ]);
    project.value = data;
    overview.value = data?.overview || null;
    tasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];

    // Default all groups to open
    const groups = {};
    for (const t of tasks.value) {
      const key = t.task_list_id ? String(t.task_list_id) : '__none__';
      groups[key] = true;
    }
    expandedGroups.value = groups;

    syncEditForm();
    await loadAux();
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function attachList() {
  if (!attachListId.value) return;
  try {
    await api.post(`/task-projects/${projectId.value}/lists`, {
      taskListId: Number(attachListId.value)
    }, { skipGlobalLoading: true });
    attachListId.value = '';
    listAttachSearch.value = '';
    await load();
  } catch (e) { console.error(e); }
}

async function detachList(listId) {
  try {
    await api.delete(`/task-projects/${projectId.value}/lists/${listId}`, { skipGlobalLoading: true });
    await load();
  } catch (e) { console.error(e); }
}

async function saveEdit() {
  saving.value = true;
  try {
    await api.put(`/task-projects/${projectId.value}`, {
      name: editForm.name.trim(),
      description: editForm.description || null,
      dueDate: editForm.dueDate || null
    }, { skipGlobalLoading: true });
    const toAddMembers = editForm.memberIds.filter((id) => !editForm.existingMemberIds.includes(Number(id)));
    await Promise.all(
      toAddMembers.map((uid) =>
        api.post(`/task-projects/${projectId.value}/members`, { userId: Number(uid), role: 'editor' }, { skipGlobalLoading: true })
      )
    );
    const toAddLists = editForm.listIds.filter((id) => !editForm.existingListIds.includes(Number(id)));
    await Promise.all(
      toAddLists.map((lid) =>
        api.post(`/task-projects/${projectId.value}/lists`, { taskListId: Number(lid) }, { skipGlobalLoading: true })
      )
    );
    await Promise.all([
      ...editForm.taskIds.map((tid) =>
        api.put(`/me/tasks/${tid}`, { project_id: projectId.value }, { skipGlobalLoading: true })
      ),
      ...editForm.actionIds.map((aid) =>
        api.put(`/task-action-items/${aid}`, { projectId: projectId.value }, { skipGlobalLoading: true })
      )
    ]);
    showEdit.value = false;
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
/* ── Base ── */
.project-workspace {
  min-height: calc(100vh - 60px);
  background: #f8fafc;
  margin: -16px -20px 0;
  padding: 0 0 0;
  display: flex;
  flex-direction: column;
}

/* ── Hero header — full width, no max-width ── */
.project-workspace__hero {
  background: linear-gradient(135deg, #14532d 0%, #166534 55%, #15803d 100%);
  color: #fff;
  padding: 20px 28px 24px;
  box-shadow: 0 4px 20px rgba(20, 83, 45, 0.2);
  flex-shrink: 0;
}
.project-workspace__hero-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}
.back-btn {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.back-btn:hover { background: rgba(255,255,255,.22); }
.project-workspace__title-block { flex: 1; min-width: 200px; }
.eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.8;
}
h1 { margin: 4px 0 6px; font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; }
.subtitle { margin: 0; opacity: 0.9; font-size: 14px; max-width: 640px; }
.due-chip {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.18);
  font-size: 12px;
  font-weight: 700;
}
.project-workspace__hero-actions { display: flex; align-items: center; gap: 12px; }
.members { display: flex; gap: 4px; }
.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,.25);
  color: #fff;
  font-size: 11px; font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid rgba(255,255,255,.4);
}
.btn-edit {
  border: 0;
  background: #fff;
  color: #14532d;
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

/* ── Tabs — sticky, full width ── */
.project-workspace__tabs {
  padding: 0 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid #e2e8f0;
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}
.project-workspace__tabs button {
  border: 0;
  background: transparent;
  padding: 12px 14px;
  font-weight: 700;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.project-workspace__tabs button.active { color: #14532d; border-bottom-color: #14532d; }
.tab-count {
  font-size: 11px;
  font-weight: 700;
  background: #e2e8f0;
  color: #475569;
  border-radius: 999px;
  padding: 1px 7px;
}

/* ── Content wrapper ── */
.project-workspace__content {
  flex: 1;
  padding: 20px 28px;
  display: flex;
  flex-direction: column;
}

/* ── Overview ── */
.overview-grid { display: flex; flex-direction: column; gap: 16px; }
.kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.kpi {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(15,23,42,.04);
}
.kpi strong { display: block; font-size: 1.6rem; color: #14532d; }
.kpi span { font-size: 12px; font-weight: 600; color: #64748b; }
.panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(15,23,42,.04);
}
.panel--full { grid-column: 1 / -1; }
.panel h3 { margin: 0 0 12px; font-size: 14px; color: #14532d; font-weight: 700; }
.card-list { list-style: none; margin: 0; padding: 0; }
.card-list li {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; padding: 10px 0;
  border-bottom: 1px solid #f1f5f9; font-size: 14px;
}
.card-list li:last-child { border-bottom: 0; }
.muted-val { font-size: 12px; color: #94a3b8; }
.empty { color: #94a3b8; font-style: italic; font-size: 13px; }
.quick { display: flex; flex-wrap: wrap; gap: 8px; }
.quick-btn {
  border: 1px solid #e2e8f0; background: #f8fafc;
  border-radius: 10px; padding: 10px 14px;
  font-weight: 600; font-size: 13px; color: #14532d; cursor: pointer;
}
.quick-btn:hover { background: #f0fdf4; border-color: #bbf7d0; }

/* ── Tasks workspace: sidebar + detail ── */
.tasks-workspace {
  display: flex;
  gap: 0;
  flex: 1;
  min-height: 0;
  height: calc(100vh - 180px);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(15,23,42,.04);
}

/* Left sidebar */
.tasks-sidebar {
  width: 320px;
  min-width: 280px;
  flex-shrink: 0;
  border-right: 1px solid #e2e8f0;
  overflow-y: auto;
  background: #f8fafc;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 1;
}
.sidebar-head__label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: .06em; }
.sidebar-head__all { font-size: 11px; color: #94a3b8; background: none; border: 0; cursor: pointer; padding: 0; }
.sidebar-head__all:hover { color: #64748b; }
.sidebar-empty { padding: 24px 16px; color: #94a3b8; font-size: 13px; text-align: center; }

/* List group */
.list-group { border-bottom: 1px solid #e2e8f0; }
.list-group__head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: 0;
  background: #f1f5f9;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  color: #374151;
}
.list-group__head:hover { background: #e9eef5; }
.list-group__chev { font-size: 10px; color: #64748b; width: 10px; flex-shrink: 0; }
.list-group__name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.list-group__count {
  font-size: 10px; font-weight: 700;
  background: #e2e8f0; color: #64748b;
  border-radius: 999px; padding: 1px 7px;
  flex-shrink: 0;
}

/* Task row */
.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  background: #fff;
}
.task-row:hover { background: #f8fafc; }
.task-row--selected { background: #f0fdf4; border-left: 3px solid #15803d; }
.task-row--selected:hover { background: #dcfce7; }
.task-row--completed .task-row__title { text-decoration: line-through; color: #94a3b8; }
.task-row--waiting .task-row__title { color: #7e22ce; }
.task-row__main { flex: 1; min-width: 0; }
.task-row__title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-row__actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

/* Quick-assign button */
.qa-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px dashed #cbd5e1;
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
  white-space: nowrap;
}
.qa-btn:hover { border-color: #94a3b8; color: #64748b; background: #f8fafc; }
.qa-btn--assigned { border-style: solid; border-color: #a7f3d0; background: #f0fdf4; color: #15803d; }
.qa-btn--assigned:hover { background: #dcfce7; }
.qa-btn__avatar {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #15803d;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
}
.qa-btn__label { font-size: 11px; }

/* Status pill button */
.status-pill {
  border: 0;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  padding: 3px 7px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  background: #f1f5f9;
  color: #475569;
}
.status-pill:hover { opacity: .8; }
.status-pill--pending { background: #f1f5f9; color: #475569; }
.status-pill--in_progress { background: #dbeafe; color: #1d4ed8; }
.status-pill--waiting { background: #f3e8ff; color: #7e22ce; }
.status-pill--completed { background: #dcfce7; color: #166534; }
.status-pill--overridden { background: #fee2e2; color: #991b1b; }

/* Right detail panel */
.tasks-detail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  gap: 12px;
  padding: 40px;
}
.detail-empty__icon { font-size: 2.5rem; opacity: .4; }
.detail-empty p { font-size: 14px; margin: 0; text-align: center; }

/* Override TaskDetailSidePanel's aside to fill the container */
.tasks-detail :deep(.side-panel) {
  position: static !important;
  width: 100% !important;
  height: 100% !important;
  max-height: none !important;
  border-left: none !important;
  flex: 1 !important;
}

/* ── Assign / Status popovers ── */
.pop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
}
.pop {
  position: absolute;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(15,23,42,.18);
  padding: 8px;
  min-width: 200px;
  max-height: 280px;
  overflow-y: auto;
  z-index: 201;
}
.pop__head {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #94a3b8;
  margin: 0 0 6px;
  padding: 0 6px;
}
.pop__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: #0f172a;
}
.pop__row:hover { background: #f8fafc; }
.pop__row--active { background: #f0fdf4; color: #14532d; font-weight: 700; }
.pop__row--clear { color: #ef4444; font-size: 12px; }
.pop__row--clear:hover { background: #fef2f2; }
.pop__row--status { font-size: 13px; }
.pop__initials {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: #e2e8f0;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pop__empty { color: #94a3b8; font-size: 12px; padding: 6px; }
.status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.status-dot--pending { background: #cbd5e1; }
.status-dot--in_progress { background: #3b82f6; }
.status-dot--waiting { background: #a855f7; }
.status-dot--completed { background: #22c55e; }
.status-dot--overridden { background: #ef4444; }

/* ── Lists tab ── */
.task-ul { list-style: none; margin: 0; padding: 0; }
.task-ul li {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; padding: 10px 0;
  border-bottom: 1px solid #f1f5f9; font-size: 14px;
}
.row-actions { display: flex; align-items: center; gap: 10px; }
.muted { color: #94a3b8; font-size: 12px; }
.btn-x { border: 0; background: transparent; color: #94a3b8; cursor: pointer; font-size: 12px; }
.btn-x:hover { color: #ef4444; }
.attach-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  margin-top: 16px;
}
.form-control {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font: inherit;
  background: #fff;
  font-size: 13px;
}
.btn-primary {
  border: 0; background: #166534; color: #fff;
  border-radius: 10px; padding: 10px 16px;
  font-weight: 700; cursor: pointer; font-size: 13px;
}
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.state {
  padding: 40px 24px; text-align: center; color: #64748b;
  background: #fff; border-radius: 14px; border: 1px solid #e2e8f0;
}

/* ── Edit sheet ── */
.edit-overlay {
  position: fixed; inset: 0;
  background: rgba(15,23,42,.45);
  z-index: 100;
  display: flex; justify-content: flex-end;
}
.edit-sheet {
  width: min(440px, 100%); height: 100%;
  background: #fff; padding: 20px;
  overflow-y: auto;
  box-shadow: -8px 0 40px rgba(15,23,42,.15);
}
.edit-sheet__head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.edit-sheet__head h2 { margin: 0; font-size: 1.2rem; color: #14532d; }
.field { display: block; margin-bottom: 14px; }
.field > span {
  display: block; font-size: 11px; font-weight: 700;
  text-transform: uppercase; color: #64748b; margin-bottom: 4px;
}
.pick-box {
  max-height: 140px; overflow-y: auto;
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px;
}
.pick-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin: 4px 0; }
.edit-sheet__actions { display: flex; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
.btn-ghost {
  border: 1px solid #e2e8f0; background: #fff;
  border-radius: 10px; padding: 10px 16px;
  font-weight: 600; cursor: pointer; font-size: 13px;
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .panels { grid-template-columns: 1fr; }
  .attach-row { grid-template-columns: 1fr; }
  .project-workspace { margin: -8px -12px 0; }
  .tasks-workspace { flex-direction: column; height: auto; }
  .tasks-sidebar { width: 100%; min-width: 0; border-right: none; border-bottom: 1px solid #e2e8f0; max-height: 40vh; }
  .tasks-detail { min-height: 50vh; }
}
</style>
