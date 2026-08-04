<template>
  <div class="tasks-hub">
    <header class="tasks-hub__header">
      <h1 data-tour="tasks-title" class="tasks-hub__title">
        <span class="tasks-hub__icon" aria-hidden="true">☑</span>
        Tasks
      </h1>
      <div class="tasks-hub__search">
        <input
          ref="searchInputRef"
          v-model="searchQ"
          type="search"
          class="search-input"
          placeholder="Search tasks, lists, projects…"
          @input="onSearchInput"
          @keydown.enter.prevent="applySearch"
          @keydown.escape="searchResults = []"
        />
        <kbd class="search-kbd">⌘ K</kbd>
        <ul v-if="searchResults.length" class="search-results">
          <li
            v-for="(r, idx) in searchResults"
            :key="`${r.entity_type}-${r.entity_id}-${idx}`"
            @click="selectSearchResult(r)"
          >
            <strong>{{ r.title }}</strong>
            <span class="search-meta">{{ r.subtitle }} · {{ searchViewLabel(r) }}</span>
          </li>
        </ul>
      </div>
      <div class="tasks-hub__actions">
        <router-link class="btn btn-secondary btn-sm" :to="mySchedulePath">My Schedule</router-link>
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

    <div class="tasks-hub__body">
      <TaskTimeline
        ref="timelineRef"
        :agency-id="agencyId"
        @select-block="onSelectBlock"
        @join-focus="openFocusSession"
        @assigned="onAssignedToBlock"
      />

      <div class="tasks-hub__main">
        <template v-if="overviewProject">
          <ProjectOverviewPanel
            :project="overviewProject"
            :agency-id="effectiveTenantId"
            @close="overviewProject = null"
            @open-project="openProjectWorkspace"
          />
        </template>

        <template v-else-if="activeTab === 'shared'">
          <section class="shared-section">
            <div class="shared-section__head">
              <div>
                <h2>Shared Lists</h2>
                <p class="muted">Lists you’re on. Each shows once with who it’s shared with.</p>
              </div>
            </div>
            <SharedListsView :agency-id="agencyId" @task-changed="refresh" />
          </section>
        </template>

        <template v-else-if="activeTab === 'projects'">
          <section class="shared-section">
            <div class="shared-section__head">
              <div>
                <h2>Projects</h2>
                <p class="muted">View overview in-hub, or open the full project workspace.</p>
              </div>
              <button type="button" class="btn btn-primary btn-sm" @click="showNewProject = true">+ New Project</button>
            </div>
            <ul class="project-dir">
              <li v-for="p in projects" :key="p.id">
                <div>
                  <strong>{{ p.name }}</strong>
                  <span class="muted">{{ p.list_count ?? 0 }} lists · {{ p.member_count ?? 0 }} members</span>
                </div>
                <div class="project-dir__actions">
                  <button type="button" class="btn btn-secondary btn-sm" @click="overviewProject = p">View</button>
                  <button type="button" class="btn btn-primary btn-sm" @click="openProjectWorkspace(p.id)">Open Project</button>
                </div>
              </li>
              <li v-if="!projects.length" class="muted">No projects yet</li>
            </ul>
          </section>
        </template>

        <template v-else-if="activeTab === 'action_items'">
          <div class="type-pills">
            <button type="button" class="type-pill active">Action Items</button>
            <button type="button" class="btn btn-primary btn-sm" @click="showNewActionItem = true">+ Action Item</button>
          </div>
          <div v-if="actionItemsLoading" class="hub-state">Loading action items…</div>
          <div v-else-if="!actionItems.length" class="hub-state">No action items yet</div>
          <TasksListTable
            v-else
            :tasks="actionItemsAsTasks"
            :type-defs="typeDefs"
            :current-user-id="authStore.user?.id"
            view="action_items"
            @open="openActionItem"
            @toggle-complete="toggleActionItem"
            @menu="openActionItem"
          />
        </template>

        <template v-else>
          <div v-if="activeTab === 'all' && canViewAll" class="team-modes">
            <button type="button" :class="{ active: teamMode === 'tasks' }" @click="teamMode = 'tasks'">Tasks</button>
            <button type="button" :class="{ active: teamMode === 'lists' }" @click="setTeamMode('lists')">Shared Lists</button>
            <button type="button" :class="{ active: teamMode === 'projects' }" @click="setTeamMode('projects')">Projects</button>
          </div>

          <div v-if="activeTab === 'all' && canViewAll" class="team-filters">
            <select v-model="teamFilters.tenantId" class="filter-select" @change="refresh">
              <option value="">All tenants (current)</option>
              <option v-for="a in hideableAgencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
            </select>
            <select v-model="teamFilters.userId" class="filter-select" @change="refresh">
              <option value="">All users</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="String(u.id)">
                {{ u.first_name }} {{ u.last_name }}
              </option>
            </select>
            <select v-if="teamMode === 'tasks'" v-model="teamFilters.taskListId" class="filter-select" @change="refresh">
              <option value="">All shared lists</option>
              <option v-for="l in teamLists" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
            </select>
          </div>

          <template v-if="activeTab === 'all' && teamMode === 'lists'">
            <label class="field-inline">
              <span>Team shared list</span>
              <select v-model="selectedTeamListId" class="filter-select" @change="loadTeamListTasks">
                <option value="">Select a list…</option>
                <option v-for="l in teamLists" :key="l.id" :value="String(l.id)">
                  {{ l.name }} ({{ l.task_count || 0 }})
                </option>
              </select>
            </label>
            <p v-if="selectedTeamList" class="muted">Shared with {{ selectedTeamList.shared_with_label }}</p>
            <TasksListTable
              v-if="teamListTasks.length"
              :tasks="teamListTasks"
              :type-defs="typeDefs"
              :current-user-id="authStore.user?.id"
              view="all"
              @open="openTask"
              @toggle-complete="toggleComplete"
              @menu="openTask"
            />
            <div v-else class="hub-state">Select a tenant shared list to view its tasks</div>
          </template>

          <template v-else-if="activeTab === 'all' && teamMode === 'projects'">
            <ul class="project-dir">
              <li v-for="p in teamProjects" :key="p.id">
                <div>
                  <strong>{{ p.name }}</strong>
                  <span class="muted">{{ p.agency_name || '' }}</span>
                </div>
                <div class="project-dir__actions">
                  <button type="button" class="btn btn-secondary btn-sm" @click="overviewProject = p">View</button>
                  <button type="button" class="btn btn-primary btn-sm" @click="openProjectWorkspace(p.id)">Open Project</button>
                </div>
              </li>
              <li v-if="!teamProjects.length" class="muted">No projects for this tenant</li>
            </ul>
          </template>

          <template v-else>
            <TasksStatusSummary v-model="statusChip" :counts="viewStatusCounts" />
            <div v-if="typeDefs.length" class="type-pills">
              <button
                type="button"
                class="type-pill"
                :class="{ active: !filters.workTypeId }"
                @click="filters.workTypeId = ''"
              >
                All types
              </button>
              <button
                v-for="t in typeDefs"
                :key="t.id"
                type="button"
                class="type-pill"
                :class="{ active: Number(filters.workTypeId) === Number(t.id) }"
                :style="{ '--pill-color': t.color_hex }"
                @click="filters.workTypeId = String(t.id)"
              >
                <span class="type-pill__dot" />
                {{ t.label }}
              </button>
            </div>
            <TasksFiltersBar v-model="filters" :departments="departments" />

            <div v-if="tasksStore.loading" class="hub-state" data-tour="tasks-loading">Loading tasks…</div>
            <div v-else-if="tasksStore.error" class="hub-state error">{{ tasksStore.error }}</div>
            <div v-else-if="displayTasks.length === 0" class="hub-state" data-tour="tasks-empty">
              <template v-if="activeTab === 'assigned'">No tasks assigned to you right now. Team-wide work is under Team Tasks.</template>
              <template v-else>No tasks found</template>
            </div>

            <TasksListTable
              v-else-if="layout === 'list'"
              :tasks="displayTasks"
              :type-defs="typeDefs"
              :current-user-id="authStore.user?.id"
              :view="activeTab"
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
                  draggable="true"
                  @dragstart="onBoardDrag($event, task)"
                  @click="openTask(task)"
                >
                  <strong>{{ task.title }}</strong>
                  <p>{{ task.description || 'No description' }}</p>
                </article>
              </div>
            </div>
          </template>
        </template>
      </div>

      <TaskDetailSidePanel
        v-if="detailTask"
        :item="detailTask"
        :agency-id="effectiveTenantId"
        :type-defs="typeDefs"
        :lists="sharedListsOptions"
        :projects="projectsOptions"
        :agency-users="agencyUsers"
        @close="detailTask = null"
        @complete="onPanelComplete"
        @changed="refresh"
        @view-project="(id) => viewProjectById(id)"
        @open-project="openProjectWorkspace"
      />
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
        <div v-if="typeDefs.length" class="form-group">
          <label>Type</label>
          <select v-model="newTask.workTypeId" class="form-control">
            <option value="">General</option>
            <option v-for="t in typeDefs" :key="t.id" :value="String(t.id)">{{ t.label }}</option>
          </select>
        </div>
        <label class="private-toggle">
          <input v-model="newTask.isPrivate" type="checkbox" />
          Private — only you can see this
        </label>
        <div class="form-group">
          <label>Shared list</label>
          <select v-model="newTask.taskListId" class="form-control">
            <option value="">None</option>
            <option v-for="l in sharedListsOptions" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Project</label>
          <select v-model="newTask.projectId" class="form-control">
            <option value="">None</option>
            <option v-for="p in projectsOptions" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
          </select>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="creating || !newTask.title.trim()" @click="createTask">
            {{ creating ? '…' : 'Create' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showNewTask = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="showNewActionItem" class="detail-overlay" @click.self="showNewActionItem = false">
      <div class="detail-modal">
        <h3>New action item</h3>
        <div class="form-group">
          <label>Title</label>
          <input v-model="newActionItem.title" class="form-control" type="text" />
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea v-model="newActionItem.notes" class="form-control" rows="3" />
        </div>
        <label class="private-toggle">
          <input v-model="newActionItem.isPrivate" type="checkbox" />
          Private — only you can see this
        </label>
        <div class="form-group">
          <label>Shared list</label>
          <select v-model="newActionItem.taskListId" class="form-control">
            <option value="">None</option>
            <option v-for="l in sharedListsOptions" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Project</label>
          <select v-model="newActionItem.projectId" class="form-control">
            <option value="">None</option>
            <option v-for="p in projectsOptions" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
          </select>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="!newActionItem.title.trim()" @click="createActionItem">
            Create
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showNewActionItem = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="showNewProject" class="detail-overlay" @click.self="showNewProject = false">
      <div class="detail-modal">
        <h3>New project</h3>
        <div class="form-group">
          <label>Name</label>
          <input v-model="newProjectName" class="form-control" type="text" />
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="!newProjectName.trim()" @click="createProject">
            Create
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showNewProject = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="selectedBlock" class="detail-overlay" @click.self="selectedBlock = null">
      <div class="detail-modal">
        <header class="detail-modal__head">
          <h3>{{ selectedBlock.title }}</h3>
          <button type="button" class="btn btn-ghost btn-sm" @click="selectedBlock = null">Close</button>
        </header>
        <p class="muted">Drag tasks from the list onto the timeline, or assign below.</p>
        <ul class="block-assign-list">
          <li v-for="a in selectedBlock.assignments || []" :key="a.id">
            <span>{{ a.title }}</span>
            <span class="muted">{{ a.status || a.assignable_type }}</span>
          </li>
          <li v-if="!(selectedBlock.assignments || []).length" class="muted">No assignments yet</li>
        </ul>
        <div class="detail-actions">
          <button
            v-if="selectedBlock.focus_session_enabled"
            type="button"
            class="btn btn-primary btn-sm"
            @click="openFocusSession(selectedBlock)"
          >
            Join Focus Session
          </button>
          <router-link class="btn btn-secondary btn-sm" :to="mySchedulePath">Open in My Schedule</router-link>
        </div>
      </div>
    </div>

    <FocusSessionModal
      v-if="focusBlock"
      :block="focusBlock"
      :day-blocks="focusDayBlocks"
      :agency-id="agencyId"
      @close="focusBlock = null"
      @task-changed="refresh"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { getParentAgencyFromOrg, isTenantOrganizationType } from '../../utils/organizationTypes';
import api from '../../services/api';
import TasksStatusSummary from './TasksStatusSummary.vue';
import TasksFiltersBar from './TasksFiltersBar.vue';
import TasksListTable from './TasksListTable.vue';
import SharedListsView from '../dashboard/SharedListsView.vue';
import TaskTimeline from './TaskTimeline.vue';
import FocusSessionModal from './FocusSessionModal.vue';
import TaskDetailSidePanel from './TaskDetailSidePanel.vue';
import ProjectOverviewPanel from './ProjectOverviewPanel.vue';

const route = useRoute();
const router = useRouter();
const tasksStore = useTasksStore();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const HIDDEN_AGENCIES_KEY = 'tasksHub.hiddenAgencyIds';

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
  workTypeId: '',
  sort: 'due_asc'
});
const departments = ref([]);
const typeDefs = ref([]);
const detailTask = ref(null);
const showNewTask = ref(false);
const showNewActionItem = ref(false);
const showNewProject = ref(false);
const creating = ref(false);
const newTask = reactive({
  title: '', description: '', dueDate: '', workTypeId: '', isPrivate: false, taskListId: '', projectId: ''
});
const newActionItem = reactive({
  title: '', notes: '', isPrivate: false, taskListId: '', projectId: ''
});
const newProjectName = ref('');
const actionItems = ref([]);
const actionItemsLoading = ref(false);
const selectedBlock = ref(null);
const focusBlock = ref(null);
const focusDayBlocks = ref([]);
const timelineRef = ref(null);
const searchInputRef = ref(null);
const showHideAgencies = ref(false);
const hiddenAgencyIds = ref(loadHiddenAgencies());
const teamMode = ref('tasks');
const teamFilters = reactive({ tenantId: '', userId: '', taskListId: '' });
const teamLists = ref([]);
const teamListTasks = ref([]);
const selectedTeamListId = ref('');
const projects = ref([]);
const teamProjects = ref([]);
const sharedListsOptions = ref([]);
const agencyUsers = ref([]);
const overviewProject = ref(null);
const searchResults = ref([]);
let searchTimer = null;

function loadHiddenAgencies() {
  try {
    const raw = localStorage.getItem(HIDDEN_AGENCIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((n) => Number(n)).filter((n) => n > 0) : [];
  } catch {
    return [];
  }
}

function persistHiddenAgencies() {
  try {
    localStorage.setItem(HIDDEN_AGENCIES_KEY, JSON.stringify(hiddenAgencyIds.value));
  } catch { /* ignore */ }
}

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canViewAll = computed(() =>
  ['admin', 'super_admin', 'support', 'supervisor'].includes(role.value)
  || !!authStore.user?.capabilities?.canManageHiring
);

const agencyId = computed(() => {
  const org = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
  if (org?.id) {
    if (!isTenantOrganizationType(org)) {
      const parent = getParentAgencyFromOrg(org, agencyStore.userAgencies || []);
      if (parent?.id) return Number(parent.id);
    }
    return Number(org.id);
  }
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

const mySchedulePath = computed(() => `${orgPrefix.value}/my-schedule`);
const escalationsPath = computed(() => `${orgPrefix.value}/admin/escalations`);

const hideableAgencies = computed(() => {
  const agencies = agencyStore.userAgencies || authStore.user?.agencies || [];
  return (Array.isArray(agencies) ? agencies : []).map((a) => ({
    id: Number(a.id || a.agency_id),
    name: a.name || a.agency_name
  })).filter((a) => a.id > 0);
});

const effectiveTenantId = computed(() => {
  if (teamFilters.tenantId) return Number(teamFilters.tenantId);
  return agencyId.value ? Number(agencyId.value) : null;
});

const selectedTeamList = computed(() =>
  teamLists.value.find((l) => String(l.id) === String(selectedTeamListId.value)) || null
);

const projectsOptions = computed(() => {
  const map = new Map();
  for (const p of [...projects.value, ...teamProjects.value]) map.set(p.id, p);
  return [...map.values()];
});

const tabs = computed(() => {
  const c = tasksStore.taskCounts || {};
  const list = [
    { id: 'assigned', label: 'Assigned to Me', count: c.assigned },
    { id: 'mine', label: 'My Tasks', count: c.mine },
    { id: 'action_items', label: 'Action Items', count: c.action_items ?? null },
    { id: 'shared', label: 'Shared Lists', count: c.shared_lists ?? null },
    { id: 'projects', label: 'Projects', count: c.projects ?? null },
    { id: 'watchlist', label: 'Watchlist', count: c.watchlist },
    canViewAll.value ? { id: 'all', label: 'Team Tasks', count: c.all } : null
  ];
  return list.filter(Boolean);
});

/** Status chips reflect the currently loaded tab’s tasks (not personal totals while viewing Team). */
const viewStatusCounts = computed(() => {
  const list = tasksStore.tasks || [];
  const isOpen = (t) => t.status !== 'completed' && t.status !== 'overridden';
  const now = Date.now();
  return {
    open: list.filter(isOpen).length,
    pending: list.filter((t) => t.status === 'pending').length,
    in_progress: list.filter((t) => t.status === 'in_progress').length,
    completed: list.filter((t) => t.status === 'completed').length,
    overdue: list.filter(
      (t) => isOpen(t) && t.due_date && new Date(t.due_date).getTime() < now
    ).length
  };
});

const actionItemsAsTasks = computed(() =>
  (actionItems.value || []).map((a) => ({
    id: a.id,
    title: a.title,
    description: a.notes,
    notes: a.notes,
    status: a.status === 'completed' ? 'completed' : (a.status || 'pending'),
    task_type: 'meeting_action',
    urgency: 'medium',
    due_date: null,
    assignee_first_name: a.assignee_first_name,
    assignee_last_name: a.assignee_last_name,
    assigned_to_user_id: a.assignee_user_id,
    meeting_event_id: a.meeting_event_id,
    meeting_title: a.meeting_title,
    linked_schedule_event_id: a.meeting_event_id,
    task_list_id: a.task_list_id,
    task_list_name: a.task_list_name,
    project_id: a.project_id,
    project_name: a.project_name,
    is_private: a.is_private ? 1 : 0,
    created_at: a.created_at,
    updated_at: a.updated_at,
    _isActionItem: true,
    _assignableType: 'action_item',
    _assignableId: a.id
  }))
);

const displayTasks = computed(() => {
  let list = [...(tasksStore.tasks || [])];
  if (filters.value.workTypeId) {
    list = list.filter((t) => Number(t.work_type_id) === Number(filters.value.workTypeId));
  }
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
  if (task._isActionItem) return 'Action Item';
  if (task.department_name) return task.department_name;
  const map = {
    custom: 'Custom',
    document: 'Document',
    training: 'Training',
    hiring: 'Hiring',
    escalation: 'Escalation',
    meeting_action: 'Meeting Action'
  };
  return map[task.task_type] || task.task_type || 'Task';
}

function assigneeDisplay(task) {
  const first = task.assignee_first_name || '';
  const last = task.assignee_last_name || '';
  return `${first} ${last}`.trim() || 'Unassigned';
}

function meetingPath(eventId) {
  return `${orgPrefix.value}/my-schedule?eventId=${encodeURIComponent(eventId)}`;
}

function setTab(id) {
  activeTab.value = id;
  statusChip.value = 'all';
  overviewProject.value = null;
  if (id !== 'all') teamMode.value = 'tasks';
  const query = { ...route.query };
  if (id === 'assigned') {
    delete query.tab;
    delete query.teamMode;
  } else {
    query.tab = id;
    if (id === 'all') query.teamMode = teamMode.value;
    else delete query.teamMode;
  }
  router.replace({ query });
}

function setTeamMode(mode) {
  teamMode.value = mode;
  if (mode === 'lists') loadTeamLists();
  if (mode === 'projects') loadTeamProjects();
}

function toggleHiddenAgency(agencyIdVal, visible) {
  const id = Number(agencyIdVal);
  if (!id) return;
  if (visible) {
    hiddenAgencyIds.value = hiddenAgencyIds.value.filter((x) => x !== id);
  } else if (!hiddenAgencyIds.value.includes(id)) {
    hiddenAgencyIds.value = [...hiddenAgencyIds.value, id];
  }
  persistHiddenAgencies();
  refresh();
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSmartSearch(), 280);
}

async function runSmartSearch() {
  const q = searchQ.value.trim();
  if (q.length < 2) {
    searchResults.value = [];
    return;
  }
  try {
    const { data } = await api.get('/tasks/search', {
      params: {
        q,
        agencyId: effectiveTenantId.value || undefined,
        tenantId: teamFilters.tenantId || undefined
      },
      skipGlobalLoading: true
    });
    searchResults.value = Array.isArray(data) ? data : [];
  } catch {
    searchResults.value = [];
  }
}

function applySearch() {
  runSmartSearch();
}

function searchViewLabel(r) {
  if (r.view === 'action_items') return 'Action Items';
  if (r.view === 'all') return r.team_mode === 'lists' ? 'Team Lists' : 'Team Tasks';
  if (r.view === 'shared') return 'Shared Lists';
  if (r.view === 'projects') return 'Projects';
  if (r.view === 'assigned') return 'Assigned to Me';
  return r.view || 'Tasks';
}

async function selectSearchResult(r) {
  searchResults.value = [];
  if (r.entity_type === 'project') {
    activeTab.value = 'projects';
    overviewProject.value = { id: r.entity_id, name: r.title };
    return;
  }
  if (r.entity_type === 'shared_list') {
    if (r.team_mode === 'lists' || r.view === 'all') {
      activeTab.value = 'all';
      teamMode.value = 'lists';
      await loadTeamLists();
      selectedTeamListId.value = String(r.entity_id);
      await loadTeamListTasks();
    } else {
      activeTab.value = 'shared';
    }
    return;
  }
  if (r.entity_type === 'action_item') {
    activeTab.value = 'action_items';
    await loadActionItems();
    const item = actionItems.value.find((a) => Number(a.id) === Number(r.entity_id));
    if (item) openActionItem({ ...item, _isActionItem: true, description: item.notes });
    else if (r.action_item) openActionItem({ ...r.action_item, _isActionItem: true, description: r.action_item.notes });
    return;
  }
  // task
  const view = r.view === 'all' ? 'all' : (r.view === 'mine' ? 'mine' : 'assigned');
  activeTab.value = ['assigned', 'mine', 'all', 'watchlist'].includes(view) ? view : 'assigned';
  await refresh();
  const task = (tasksStore.tasks || []).find((t) => Number(t.id) === Number(r.entity_id)) || r.task;
  if (task) openTask(task);
}

function openProjectWorkspace(projectId) {
  router.push(`${orgPrefix.value}/tasks/projects/${projectId}`);
}

async function viewProjectById(id) {
  let p = projectsOptions.value.find((x) => Number(x.id) === Number(id));
  if (!p) {
    try {
      const { data } = await api.get(`/task-projects/${id}`, {
        params: { agencyId: effectiveTenantId.value || undefined },
        skipGlobalLoading: true
      });
      p = data;
    } catch { /* ignore */ }
  }
  if (p) overviewProject.value = p;
}

async function loadTeamLists() {
  if (!effectiveTenantId.value) return;
  try {
    const { data } = await api.get('/task-lists/team', {
      params: { agencyId: effectiveTenantId.value },
      skipGlobalLoading: true
    });
    teamLists.value = Array.isArray(data) ? data : [];
  } catch {
    teamLists.value = [];
  }
}

async function loadTeamListTasks() {
  if (!selectedTeamListId.value) {
    teamListTasks.value = [];
    return;
  }
  try {
    const { data } = await api.get(`/task-lists/${selectedTeamListId.value}/team-tasks`, {
      skipGlobalLoading: true
    });
    teamListTasks.value = Array.isArray(data) ? data : [];
  } catch {
    teamListTasks.value = [];
  }
}

async function loadProjects() {
  try {
    const { data } = await api.get('/task-projects', {
      params: { agencyId: agencyId.value || undefined },
      skipGlobalLoading: true
    });
    projects.value = Array.isArray(data) ? data : [];
  } catch {
    projects.value = [];
  }
}

async function loadTeamProjects() {
  try {
    const { data } = await api.get('/task-projects', {
      params: { agencyId: effectiveTenantId.value || undefined, teamBrowse: 1 },
      skipGlobalLoading: true
    });
    teamProjects.value = Array.isArray(data) ? data : [];
  } catch {
    teamProjects.value = [];
  }
}

async function loadSharedListsOptions() {
  try {
    const { data } = await api.get('/task-lists', { skipGlobalLoading: true });
    sharedListsOptions.value = Array.isArray(data) ? data : [];
  } catch {
    sharedListsOptions.value = [];
  }
}

async function loadAgencyUsers() {
  if (!effectiveTenantId.value) return;
  try {
    const { data } = await api.get(`/agencies/${effectiveTenantId.value}/users`, { skipGlobalLoading: true });
    agencyUsers.value = Array.isArray(data) ? data : (data?.users || []);
  } catch {
    agencyUsers.value = [];
  }
}

async function createProject() {
  const name = newProjectName.value.trim();
  if (!name || !agencyId.value) return;
  try {
    await api.post('/task-projects', { agencyId: agencyId.value, name }, { skipGlobalLoading: true });
    newProjectName.value = '';
    showNewProject.value = false;
    await loadProjects();
  } catch (e) {
    console.error(e);
  }
}

function onPanelComplete(item) {
  if (item?._isActionItem) toggleActionItem(item);
  else toggleComplete(item);
  detailTask.value = null;
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
    e.preventDefault();
    searchInputRef.value?.focus?.();
  }
}

async function loadTypeDefs() {
  try {
    const { data } = await api.get('/task-types', {
      params: { agencyId: agencyId.value || undefined },
      skipGlobalLoading: true
    });
    typeDefs.value = Array.isArray(data) ? data : [];
  } catch {
    typeDefs.value = [];
  }
}

async function loadActionItems() {
  actionItemsLoading.value = true;
  try {
    const { data } = await api.get('/task-action-items', {
      params: { agencyId: agencyId.value || undefined },
      skipGlobalLoading: true
    });
    actionItems.value = Array.isArray(data) ? data : [];
  } catch {
    actionItems.value = [];
  } finally {
    actionItemsLoading.value = false;
  }
}

async function refresh() {
  const hidden = hiddenAgencyIds.value;
  const countOpts = {
    agencyId: effectiveTenantId.value || agencyId.value,
    hiddenAgencyIds: hidden,
    tenantId: teamFilters.tenantId || undefined,
    assignedToUserId: teamFilters.userId || undefined,
    taskListId: teamFilters.taskListId || undefined
  };
  if (activeTab.value === 'shared' || activeTab.value === 'projects') {
    await Promise.all([
      tasksStore.fetchTaskCounts(countOpts.agencyId, hidden),
      activeTab.value === 'projects' ? loadProjects() : Promise.resolve()
    ]);
    // extend store to accept filters later — pass via query in fetchTaskCounts below
    timelineRef.value?.refresh?.();
    return;
  }
  if (activeTab.value === 'action_items') {
    await Promise.all([loadActionItems(), tasksStore.fetchTaskCounts(countOpts.agencyId, hidden)]);
    timelineRef.value?.refresh?.();
    return;
  }
  if (activeTab.value === 'all' && teamMode.value !== 'tasks') {
    await tasksStore.fetchTaskCounts(countOpts.agencyId, hidden);
    if (teamMode.value === 'lists') await loadTeamLists();
    if (teamMode.value === 'projects') await loadTeamProjects();
    timelineRef.value?.refresh?.();
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
      agencyId: effectiveTenantId.value || agencyId.value || undefined,
      hiddenAgencyIds: view === 'all' ? hidden : undefined,
      assignedToUserId: view === 'all' && teamFilters.userId ? teamFilters.userId : undefined,
      taskListId: view === 'all' && teamFilters.taskListId ? teamFilters.taskListId : undefined,
      tenantId: teamFilters.tenantId || undefined
    }),
    tasksStore.fetchTaskCounts(countOpts.agencyId, hidden, {
      tenantId: teamFilters.tenantId || undefined,
      assignedToUserId: teamFilters.userId || undefined,
      taskListId: teamFilters.taskListId || undefined
    })
  ]);
  timelineRef.value?.refresh?.();
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

function openActionItem(task) {
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

async function toggleActionItem(task) {
  try {
    if (task.status === 'completed') {
      await api.post(`/task-action-items/${task.id}/reopen`, {}, { skipGlobalLoading: true });
    } else {
      await api.post(`/task-action-items/${task.id}/complete`, {}, { skipGlobalLoading: true });
    }
    await loadActionItems();
    await tasksStore.fetchTaskCounts(agencyId.value);
    if (detailTask.value?.id === task.id) detailTask.value = null;
  } catch (e) {
    console.error(e);
  }
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
      dueDate: newTask.dueDate || null,
      agencyId: agencyId.value || undefined,
      work_type_id: newTask.workTypeId ? Number(newTask.workTypeId) : undefined,
      isPrivate: !!newTask.isPrivate,
      task_list_id: newTask.taskListId ? Number(newTask.taskListId) : null,
      projectId: newTask.projectId ? Number(newTask.projectId) : null
    });
    showNewTask.value = false;
    newTask.title = '';
    newTask.description = '';
    newTask.dueDate = '';
    newTask.workTypeId = '';
    newTask.isPrivate = false;
    newTask.taskListId = '';
    newTask.projectId = '';
    await refresh();
  } catch (e) {
    console.error('Failed to create task', e);
  } finally {
    creating.value = false;
  }
}

async function createActionItem() {
  if (!newActionItem.title.trim()) return;
  try {
    await api.post('/task-action-items', {
      title: newActionItem.title.trim(),
      notes: newActionItem.notes || null,
      agencyId: agencyId.value || undefined,
      isPrivate: !!newActionItem.isPrivate,
      taskListId: newActionItem.taskListId ? Number(newActionItem.taskListId) : null,
      projectId: newActionItem.projectId ? Number(newActionItem.projectId) : null
    });
    showNewActionItem.value = false;
    newActionItem.title = '';
    newActionItem.notes = '';
    newActionItem.isPrivate = false;
    newActionItem.taskListId = '';
    newActionItem.projectId = '';
    await loadActionItems();
    await tasksStore.fetchTaskCounts(agencyId.value);
  } catch (e) {
    console.error(e);
  }
}

function onBoardDrag(ev, task) {
  try {
    ev.dataTransfer.setData('application/x-task-id', String(task.id));
    ev.dataTransfer.setData('application/x-assignable', JSON.stringify({
      assignableType: 'task',
      assignableId: task.id
    }));
  } catch { /* ignore */ }
}

function onSelectBlock(block) {
  selectedBlock.value = block;
}

function onAssignedToBlock() {
  timelineRef.value?.refresh?.();
}

async function openFocusSession(block) {
  focusBlock.value = block;
  selectedBlock.value = null;
  try {
    const day = timelineRef.value?.dayYmd?.value;
    if (day) {
      const { data } = await api.get('/schedule-block-assignments/day', {
        params: { day },
        skipGlobalLoading: true
      });
      focusDayBlocks.value = Array.isArray(data) ? data : [];
    }
  } catch {
    focusDayBlocks.value = [block];
  }
}

watch([activeTab, filters], () => refresh(), { deep: true });
watch(agencyId, () => {
  loadDepartments();
  loadTypeDefs();
  refresh();
});

onMounted(async () => {
  const qTab = String(route.query.tab || route.query.view || '').toLowerCase();
  if (['assigned', 'mine', 'shared', 'watchlist', 'action_items', 'projects'].includes(qTab)) {
    activeTab.value = qTab;
  } else if (qTab === 'all' && canViewAll.value) {
    // sticky Team Tasks only when explicitly requested with teamMode, else default personal
    activeTab.value = route.query.teamMode ? 'all' : 'assigned';
    if (route.query.teamMode) teamMode.value = String(route.query.teamMode);
  } else {
    activeTab.value = 'assigned';
  }
  window.addEventListener('keydown', onKeydown);
  await Promise.all([
    loadDepartments(),
    loadTypeDefs(),
    loadProjects(),
    loadSharedListsOptions(),
    loadAgencyUsers()
  ]);
  await refresh();
  if (route.query.blockEventId) {
    try {
      const { data } = await api.get(`/schedule-block-assignments/${route.query.blockEventId}`, {
        skipGlobalLoading: true
      });
      if (data?.event) {
        selectedBlock.value = {
          ...data.event,
          assignments: data.assignments || [],
          title: data.event.title
        };
      }
    } catch { /* ignore */ }
  }
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  if (searchTimer) clearTimeout(searchTimer);
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
.tasks-hub__body {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.tasks-hub__main { flex: 1; min-width: 0; }
.search-results {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 40;
  list-style: none;
  margin: 0;
  padding: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  max-height: 320px;
  overflow: auto;
}
.search-results li {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.search-results li:hover { background: #f0fdf4; }
.search-meta { font-size: 11px; color: #64748b; }
.team-modes {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.team-modes button {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: #64748b;
}
.team-modes button.active {
  background: #ecfdf5;
  border-color: #86efac;
  color: #14532d;
}
.team-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.filter-select {
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  background: #fff;
}
.field-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}
.project-dir {
  list-style: none;
  margin: 0;
  padding: 0;
}
.project-dir li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}
.project-dir__actions { display: flex; gap: 6px; }
.type-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
  align-items: center;
}
.type-pill {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.type-pill.active {
  border-color: var(--pill-color, #166534);
  color: var(--pill-color, #166534);
  background: color-mix(in srgb, var(--pill-color, #166534) 12%, #fff);
}
.type-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pill-color, #64748b);
}
.hub-state { padding: 20px; text-align: center; color: #64748b; }
.hub-state.error { color: #b91c1c; }
.shared-section__head { margin-bottom: 12px; }
.shared-section__head h2 { margin: 0; }
.muted { color: #64748b; font-size: 13px; }
.hide-agencies { margin-bottom: 10px; }
.hide-agencies__toggle {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.hide-agencies__panel {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.hide-agencies__row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-top: 6px;
  cursor: pointer;
}
.private-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 12px 0;
  cursor: pointer;
  color: #334155;
}
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
  cursor: grab;
}
.board-card p { margin: 6px 0; font-size: 12px; color: #64748b; }
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
.block-assign-list {
  list-style: none;
  margin: 12px 0;
  padding: 0;
}
.block-assign-list li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}
@media (max-width: 1100px) {
  .tasks-hub__body { flex-wrap: wrap; }
}
@media (max-width: 900px) {
  .tasks-hub__header { flex-wrap: wrap; }
  .tasks-hub__search { max-width: none; order: 3; flex-basis: 100%; }
  .tasks-hub__body { flex-direction: column; }
  .board-view { grid-template-columns: 1fr; }
}
</style>
