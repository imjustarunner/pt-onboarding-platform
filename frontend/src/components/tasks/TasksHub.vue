<template>
  <div class="tasks-hub">
    <header class="tasks-hub__header">
      <h1 data-tour="tasks-title" class="tasks-hub__title">
        <span class="tasks-hub__icon" aria-hidden="true">☑</span>
        Tasks
      </h1>
      <div class="tasks-hub__search">
        <input
          v-model="searchQ"
          type="search"
          class="search-input"
          placeholder="Search tasks..."
          @keydown.enter="applySearch"
        />
        <kbd class="search-kbd">⌘ K</kbd>
      </div>
      <div class="tasks-hub__actions">
        <div class="view-toggle">
          <button type="button" class="view-btn" :class="{ active: layout === 'list' }" @click="layout = 'list'">List</button>
          <button type="button" class="view-btn" :class="{ active: layout === 'board' }" @click="layout = 'board'">Board</button>
        </div>
        <button type="button" class="btn btn-primary btn-sm" @click="showNewTask = true">+ New Task</button>
      </div>
    </header>

    <nav class="tasks-hub__tabs" aria-label="Task views">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="setTab(tab.id)"
      >
        {{ tab.label }}
        <span v-if="tab.count != null" class="tab-count">({{ tab.count }})</span>
      </button>
    </nav>

    <template v-if="activeTab === 'shared'">
      <section class="shared-section">
        <div class="shared-section__head">
          <div>
            <h2>Shared Lists</h2>
            <p class="muted">Lists you’re invited to view and contribute to.</p>
          </div>
        </div>
        <SharedListsView :agency-id="agencyId" @task-changed="refresh" />
      </section>
    </template>

    <template v-else>
      <TasksStatusSummary v-model="statusChip" :counts="tasksStore.taskCounts" />
      <TasksFiltersBar v-model="filters" :departments="departments" />

      <div v-if="tasksStore.loading" class="hub-state" data-tour="tasks-loading">Loading tasks…</div>
      <div v-else-if="tasksStore.error" class="hub-state error">{{ tasksStore.error }}</div>
      <div v-else-if="displayTasks.length === 0" class="hub-state" data-tour="tasks-empty">No tasks found</div>

      <TasksListTable
        v-else-if="layout === 'list'"
        :tasks="displayTasks"
        data-tour="tasks-list"
        @open="openTask"
        @toggle-complete="toggleComplete"
        @menu="openTask"
      />

      <div v-else class="board-view" data-tour="tasks-list">
        <div v-for="col in boardColumns" :key="col.key" class="board-col">
          <h3>{{ col.label }} <span class="tab-count">({{ col.items.length }})</span></h3>
          <article
            v-for="task in col.items"
            :key="task.id"
            class="board-card"
            @click="openTask(task)"
          >
            <strong>{{ task.title }}</strong>
            <p>{{ task.description || 'No description' }}</p>
            <div class="board-card__meta">
              <span>{{ typeLabel(task) }}</span>
              <span v-if="task.due_date">{{ formatDate(task.due_date) }}</span>
            </div>
          </article>
        </div>
      </div>
    </template>

    <div v-if="detailTask" class="detail-overlay" @click.self="detailTask = null">
      <div class="detail-modal">
        <header class="detail-modal__head">
          <h3>{{ detailTask.title }}</h3>
          <button type="button" class="btn btn-ghost btn-sm" @click="detailTask = null">Close</button>
        </header>
        <p class="muted">{{ detailTask.description || 'No description' }}</p>
        <dl class="detail-meta">
          <div><dt>Status</dt><dd>{{ detailTask.status }}</dd></div>
          <div><dt>Type</dt><dd>{{ typeLabel(detailTask) }}</dd></div>
          <div v-if="detailTask.due_date"><dt>Due</dt><dd>{{ formatDate(detailTask.due_date) }}</dd></div>
          <div v-if="detailTask.department_name"><dt>Department</dt><dd>{{ detailTask.department_name }}</dd></div>
        </dl>
        <div class="detail-actions">
          <button
            v-if="detailTask.status !== 'completed'"
            type="button"
            class="btn btn-primary btn-sm"
            @click="toggleComplete(detailTask)"
          >
            Mark complete
          </button>
          <button
            v-if="detailTask.task_type === 'document'"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="goDocument(detailTask)"
          >
            Open document
          </button>
          <router-link
            v-if="detailTask.task_type === 'escalation' && detailTask.source_ref_id"
            class="btn btn-secondary btn-sm"
            :to="escalationsPath"
          >
            Open escalation
          </router-link>
          <router-link
            v-if="detailTask.task_type === 'meeting_action' && detailTask.linked_schedule_event_id"
            class="btn btn-secondary btn-sm"
            :to="meetingPath(detailTask.linked_schedule_event_id)"
          >
            View meeting
          </router-link>
        </div>
      </div>
    </div>

    <div v-if="showNewTask" class="detail-overlay" @click.self="showNewTask = false">
      <div class="detail-modal">
        <h3>New task</h3>
        <div class="form-group">
          <label>Title</label>
          <input v-model="newTask.title" class="form-control" type="text" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea v-model="newTask.description" class="form-control" rows="3" />
        </div>
        <div class="form-group">
          <label>Due date</label>
          <input v-model="newTask.dueDate" class="form-control" type="date" />
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="creating || !newTask.title.trim()" @click="createTask">
            {{ creating ? '…' : 'Create' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showNewTask = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { formatDate } from '../../utils/formatDate';
import api from '../../services/api';
import TasksStatusSummary from './TasksStatusSummary.vue';
import TasksFiltersBar from './TasksFiltersBar.vue';
import TasksListTable from './TasksListTable.vue';
import SharedListsView from '../dashboard/SharedListsView.vue';

const route = useRoute();
const router = useRouter();
const tasksStore = useTasksStore();
const authStore = useAuthStore();

const activeTab = ref('assigned');
const layout = ref('list');
const statusChip = ref('all');
const searchQ = ref('');
const filters = ref({
  status: '',
  urgency: '',
  due: '',
  taskType: '',
  departmentId: '',
  sort: 'due_asc'
});
const departments = ref([]);
const detailTask = ref(null);
const showNewTask = ref(false);
const creating = ref(false);
const newTask = reactive({ title: '', description: '', dueDate: '' });

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canViewAll = computed(() =>
  ['admin', 'super_admin', 'support', 'supervisor'].includes(role.value)
  || !!authStore.user?.capabilities?.canManageHiring
);

const agencyId = computed(() => {
  const u = authStore.user || {};
  return (
    u.agency_id
    || u.primary_agency_id
    || u.agencies?.[0]?.id
    || u.agencies?.[0]?.agency_id
    || null
  );
});

const orgPrefix = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? `/${slug}` : '';
});

const escalationsPath = computed(() => `${orgPrefix.value}/admin/escalations`);

const tabs = computed(() => {
  const c = tasksStore.taskCounts || {};
  const list = [
    canViewAll.value ? { id: 'all', label: 'All Tasks', count: c.all } : null,
    { id: 'assigned', label: 'Assigned to Me', count: c.assigned },
    { id: 'mine', label: 'My Tasks', count: c.mine },
    { id: 'shared', label: 'Shared Lists', count: null },
    { id: 'watchlist', label: 'Watchlist', count: c.watchlist }
  ];
  return list.filter(Boolean);
});

const displayTasks = computed(() => {
  let list = [...(tasksStore.tasks || [])];
  if (statusChip.value === 'overdue') {
    const now = Date.now();
    list = list.filter(
      (t) =>
        t.status !== 'completed'
        && t.status !== 'overridden'
        && t.due_date
        && new Date(t.due_date).getTime() < now
    );
  } else if (statusChip.value && statusChip.value !== 'all') {
    list = list.filter((t) => t.status === statusChip.value);
  }
  if (filters.value.sort === 'urgency') {
    const rank = { high: 1, medium: 2, low: 3 };
    list.sort((a, b) => (rank[a.urgency] || 2) - (rank[b.urgency] || 2));
  } else if (filters.value.sort === 'created') {
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } else {
    list.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
  }
  return list;
});

const boardColumns = computed(() => {
  const cols = [
    { key: 'pending', label: 'Pending', items: [] },
    { key: 'in_progress', label: 'In Progress', items: [] },
    { key: 'completed', label: 'Completed', items: [] }
  ];
  for (const t of displayTasks.value) {
    const col = cols.find((c) => c.key === t.status) || cols[0];
    col.items.push(t);
  }
  return cols;
});

function typeLabel(task) {
  if (task.department_name) return task.department_name;
  const map = {
    custom: 'Custom',
    document: 'Document',
    training: 'Training',
    hiring: 'Hiring',
    escalation: 'Escalation',
    meeting_action: 'Meeting'
  };
  return map[task.task_type] || task.task_type || 'Task';
}

function meetingPath(eventId) {
  return `${orgPrefix.value}/dashboard?tab=my_schedule&eventId=${encodeURIComponent(eventId)}`;
}

function setTab(id) {
  activeTab.value = id;
  router.replace({ query: { ...route.query, tab: id === 'assigned' ? undefined : id } });
}

function applySearch() {
  refresh();
}

async function refresh() {
  if (activeTab.value === 'shared') {
    await tasksStore.fetchTaskCounts(agencyId.value);
    return;
  }
  const view = activeTab.value === 'all' && canViewAll.value ? 'all' : activeTab.value;
  await Promise.all([
    tasksStore.fetchTasks({
      view,
      status: filters.value.status || undefined,
      urgency: filters.value.urgency || undefined,
      due: filters.value.due || undefined,
      taskType: filters.value.taskType || undefined,
      departmentId: filters.value.departmentId || undefined,
      q: searchQ.value.trim() || undefined,
      agencyId: agencyId.value || undefined
    }),
    tasksStore.fetchTaskCounts(agencyId.value)
  ]);
}

async function loadDepartments() {
  if (!agencyId.value) return;
  try {
    const { data } = await api.get(`/agencies/${agencyId.value}/departments`);
    departments.value = Array.isArray(data) ? data : (data?.departments || []);
  } catch {
    departments.value = [];
  }
}

function openTask(task) {
  detailTask.value = task;
}

async function toggleComplete(task) {
  if (task.status === 'completed') {
    await tasksStore.incompleteTask(task.id);
  } else {
    await tasksStore.completeTask(task.id);
  }
  if (detailTask.value?.id === task.id) detailTask.value = null;
}

function goDocument(task) {
  router.push(`${orgPrefix.value}/tasks/documents/${task.id}/sign`);
}

async function createTask() {
  if (!newTask.title.trim() || creating.value) return;
  creating.value = true;
  try {
    await api.post('/me/tasks', {
      title: newTask.title.trim(),
      description: newTask.description || null,
      due_date: newTask.dueDate || null
    });
    showNewTask.value = false;
    newTask.title = '';
    newTask.description = '';
    newTask.dueDate = '';
    await refresh();
  } catch (e) {
    console.error('Failed to create task', e);
  } finally {
    creating.value = false;
  }
}

watch([activeTab, filters], () => refresh(), { deep: true });
watch(statusChip, (v) => {
  if (v === 'pending' || v === 'in_progress' || v === 'completed') {
    filters.value = { ...filters.value, status: v, due: '' };
  } else if (v === 'overdue') {
    filters.value = { ...filters.value, status: '', due: 'overdue' };
  } else {
    filters.value = { ...filters.value, status: '', due: '' };
  }
});

onMounted(async () => {
  const qTab = String(route.query.tab || route.query.view || '').toLowerCase();
  if (['all', 'assigned', 'mine', 'shared', 'watchlist'].includes(qTab)) {
    if (qTab === 'all' && !canViewAll.value) activeTab.value = 'assigned';
    else activeTab.value = qTab;
  } else if (canViewAll.value && qTab === '') {
    activeTab.value = 'assigned';
  }
  await loadDepartments();
  await refresh();
});
</script>

<style scoped>
.tasks-hub { width: 100%; max-width: none; margin: 0; }
.tasks-hub__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: nowrap;
}
.tasks-hub__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary, #0f172a);
  white-space: nowrap;
  flex: 0 0 auto;
}
.tasks-hub__icon { color: var(--brand-primary, #1f6b4a); }
.tasks-hub__search { position: relative; flex: 1 1 auto; min-width: 160px; max-width: 480px; }
.search-input {
  width: 100%;
  padding: 8px 52px 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  background: #fff;
}
.search-kbd {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #94a3b8;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 1px 5px;
  background: #f8fafc;
}
.tasks-hub__actions { display: flex; gap: 8px; align-items: center; flex: 0 0 auto; margin-left: auto; }
.view-toggle {
  display: inline-flex;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.view-btn {
  border: 0;
  background: transparent;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}
.view-btn.active {
  background: color-mix(in srgb, var(--brand-primary, #1f6b4a) 12%, #fff);
  color: var(--brand-primary, #1f6b4a);
}
.tasks-hub__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 10px;
}
.tab-btn {
  border: 0;
  background: transparent;
  padding: 8px 2px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab-btn.active {
  color: var(--brand-primary, #1f6b4a);
  border-bottom-color: var(--brand-primary, #1f6b4a);
}
.tab-count { font-weight: 600; color: #94a3b8; }
.hub-state { padding: 20px; text-align: center; color: #64748b; }
.hub-state.error { color: #b91c1c; }
.shared-section__head { margin-bottom: 12px; }
.shared-section__head h2 { margin: 0; }
.muted { color: #64748b; font-size: 13px; }
.board-view {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.board-col {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  min-height: 200px;
}
.board-col h3 { margin: 0 0 10px; font-size: 14px; }
.board-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}
.board-card p { margin: 6px 0; font-size: 12px; color: #64748b; }
.board-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
}
.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 20px;
}
.detail-modal {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.detail-modal__head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}
.detail-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 16px 0;
}
.detail-meta dt { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
.detail-meta dd { margin: 2px 0 0; font-weight: 600; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.form-control {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font: inherit;
}
@media (max-width: 900px) {
  .tasks-hub__header { flex-wrap: wrap; }
  .tasks-hub__search { max-width: none; order: 3; flex-basis: 100%; }
  .board-view { grid-template-columns: 1fr; }
}
</style>
