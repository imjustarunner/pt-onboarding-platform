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
                <th class="slw__th-sort" :class="{ 'slw__th-sort--active': sortBy === 'title' }" @click="setSort('title')">Task <span class="slw__sort-arrow">{{ slwSortIndicator('title') }}</span></th>
                <th class="slw__th-sort" :class="{ 'slw__th-sort--active': sortBy === 'assignee' }" @click="setSort('assignee')">Assignee <span class="slw__sort-arrow">{{ slwSortIndicator('assignee') }}</span></th>
                <th class="slw__th-sort" :class="{ 'slw__th-sort--active': sortBy === 'due_date' }" @click="setSort('due_date')">Due <span class="slw__sort-arrow">{{ slwSortIndicator('due_date') }}</span></th>
                <th class="slw__th-sort" :class="{ 'slw__th-sort--active': sortBy === 'priority' }" @click="setSort('priority')">Priority <span class="slw__sort-arrow">{{ slwSortIndicator('priority') }}</span></th>
                <th class="slw__th-sort" :class="{ 'slw__th-sort--active': sortBy === 'status' }" @click="setSort('status')">Status <span class="slw__sort-arrow">{{ slwSortIndicator('status') }}</span></th>
                <th class="slw__th-sort" :class="{ 'slw__th-sort--active': sortBy === 'added' }" @click="setSort('added')">Added <span class="slw__sort-arrow">{{ slwSortIndicator('added') }}</span></th>
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
                <!-- Assignee cell with inline quick-assign -->
                <td class="slw__cell-assignee" @click.stop>
                  <div class="slw__quick-wrap">
                    <span v-if="t.assigned_to_user_id" class="slw__assignee">
                      <span class="slw__assignee-avatar" :style="{ background: memberColor(t.assigned_to_user_id) }">
                        <img v-if="t.assignee_profile_photo_path" :src="toUploadsUrl(t.assignee_profile_photo_path)" :alt="assigneeName(t)" />
                        <template v-else>{{ initialsOf(t.assignee_first_name, t.assignee_last_name) }}</template>
                      </span>
                      <span class="slw__assignee-name">{{ assigneeName(t) }}</span>
                    </span>
                    <span v-else class="slw__muted">Unassigned</span>
                    <button
                      type="button"
                      class="slw__inline-plus"
                      :class="{ 'slw__inline-plus--open': assignPopoverTaskId === t.id }"
                      :title="t.assigned_to_user_id ? 'Reassign' : 'Assign'"
                      @click.stop="toggleAssignPopover(t.id)"
                    >{{ t.assigned_to_user_id ? '±' : '+' }}</button>
                  </div>
                  <!-- Assign popover -->
                  <div v-if="assignPopoverTaskId === t.id" class="slw__pop slw__pop--assign" @click.stop>
                    <p class="slw__pop-label">Assign to…</p>
                    <button
                      v-for="m in members"
                      :key="m.user_id"
                      type="button"
                      class="slw__pop-member"
                      :class="{ 'slw__pop-member--active': t.assigned_to_user_id === m.user_id }"
                      @click="quickAssign(t, m.user_id)"
                    >
                      <span class="slw__pop-avatar" :style="{ background: memberColor(m.user_id) }">
                        <img v-if="m.profile_photo_path" :src="toUploadsUrl(m.profile_photo_path)" :alt="memberLabel(m)" />
                        <template v-else>{{ memberInitials(m) }}</template>
                      </span>
                      {{ memberLabel(m) }}
                      <span v-if="t.assigned_to_user_id === m.user_id" class="slw__pop-check">✓</span>
                    </button>
                    <button v-if="t.assigned_to_user_id" type="button" class="slw__pop-unassign" @click="quickAssign(t, null)">Remove assignment</button>
                  </div>
                </td>

                <!-- Due date cell with inline quick-set -->
                <td class="slw__cell-due" @click.stop>
                  <div class="slw__quick-wrap">
                    <span v-if="t.due_date" :class="{ 'slw__overdue': isOverdue(t.due_date) && t.status !== 'completed' }">
                      {{ formatDate(t.due_date) }}
                    </span>
                    <span v-else class="slw__muted">—</span>
                    <button
                      type="button"
                      class="slw__inline-plus"
                      :class="{ 'slw__inline-plus--open': duePopoverTaskId === t.id }"
                      :title="t.due_date ? 'Change due date' : 'Set due date'"
                      @click.stop="toggleDuePopover(t.id)"
                    >+</button>
                  </div>
                  <!-- Due date popover -->
                  <div v-if="duePopoverTaskId === t.id" class="slw__pop slw__pop--due" @click.stop>
                    <p class="slw__pop-label">Set due date</p>
                    <button type="button" class="slw__pop-quick" @click="quickSetDue(t, endOfTodayDate())">
                      <span class="slw__pop-quick-icon">☀</span>
                      <span>
                        <strong>End of today</strong>
                        <small>5 pm · {{ formatDate(endOfTodayDate()) }}</small>
                      </span>
                    </button>
                    <button type="button" class="slw__pop-quick" @click="quickSetDue(t, endOfWeekDate())">
                      <span class="slw__pop-quick-icon">📅</span>
                      <span>
                        <strong>End of week</strong>
                        <small>Friday 5 pm · {{ formatDate(endOfWeekDate()) }}</small>
                      </span>
                    </button>
                    <div class="slw__pop-divider">or pick a date</div>
                    <input
                      type="date"
                      class="slw__due-input"
                      :value="t.due_date ? t.due_date.slice(0, 10) : ''"
                      @change="quickSetDue(t, $event.target.value)"
                    />
                    <button v-if="t.due_date" type="button" class="slw__pop-unassign" @click="quickSetDue(t, null)">Remove due date</button>
                  </div>
                </td>

                <!-- Priority cell with inline quick-change -->
                <td class="slw__cell-priority" @click.stop>
                  <div class="slw__quick-wrap">
                    <span class="slw__priority" :class="`slw__priority--${t.urgency || 'medium'}`">{{ t.urgency || 'medium' }}</span>
                    <button
                      type="button"
                      class="slw__inline-plus"
                      :class="{ 'slw__inline-plus--open': priorityPopoverTaskId === t.id }"
                      title="Change priority"
                      @click.stop="togglePriorityPopover(t.id)"
                    >±</button>
                  </div>
                  <div v-if="priorityPopoverTaskId === t.id" class="slw__pop" @click.stop>
                    <p class="slw__pop-label">Priority</p>
                    <button
                      v-for="opt in [{ val: 'high', label: 'High', cls: 'slw__priority--high' }, { val: 'medium', label: 'Medium', cls: 'slw__priority--medium' }, { val: 'low', label: 'Low', cls: 'slw__priority--low' }]"
                      :key="opt.val"
                      type="button"
                      class="slw__pop-member"
                      :class="{ 'slw__pop-member--active': (t.urgency || 'medium') === opt.val }"
                      @click="quickSetPriority(t, opt.val)"
                    >
                      <span class="slw__priority" :class="opt.cls">{{ opt.label }}</span>
                      <span v-if="(t.urgency || 'medium') === opt.val" class="slw__pop-check">✓</span>
                    </button>
                  </div>
                </td>

                <!-- Status cell with inline quick-change -->
                <td class="slw__cell-status" @click.stop>
                  <div class="slw__quick-wrap">
                    <span class="slw__status" :class="`slw__status--${t.status || 'pending'}`">{{ statusLabel(t.status) }}</span>
                    <button
                      type="button"
                      class="slw__inline-plus"
                      :class="{ 'slw__inline-plus--open': statusPopoverTaskId === t.id }"
                      title="Change status"
                      @click.stop="toggleStatusPopover(t.id)"
                    >±</button>
                  </div>
                  <div v-if="statusPopoverTaskId === t.id" class="slw__pop" @click.stop>
                    <p class="slw__pop-label">Status</p>
                    <button
                      v-for="opt in statusOptions"
                      :key="opt.val"
                      type="button"
                      class="slw__pop-member"
                      :class="{ 'slw__pop-member--active': (t.status || 'pending') === opt.val }"
                      @click="quickSetStatus(t, opt.val)"
                    >
                      <span class="slw__status-dot" :class="`slw__status-dot--${opt.val}`"></span>
                      {{ opt.label }}
                      <span v-if="(t.status || 'pending') === opt.val" class="slw__pop-check">✓</span>
                    </button>
                  </div>
                </td>
                <td class="slw__col-added">
                  <span v-if="t.created_at" class="slw__muted">{{ formatDate(t.created_at) }}</span>
                  <span v-else class="slw__muted">—</span>
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

      <!-- backdrop to close popovers on outside click -->
      <div v-if="assignPopoverTaskId || duePopoverTaskId || priorityPopoverTaskId || statusPopoverTaskId" class="slw__pop-backdrop" @click="closePopovers" />

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
const sortDir = ref('desc'); // priority: high first; dates: newest first; text: A first
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

// ─── Inline quick-action popovers ─────────────────────────────────────────────
const assignPopoverTaskId = ref(null);
const duePopoverTaskId = ref(null);
const priorityPopoverTaskId = ref(null);
const statusPopoverTaskId = ref(null);

const statusOptions = [
  { val: 'pending', label: 'Open' },
  { val: 'in_progress', label: 'In Progress' },
  { val: 'waiting', label: 'Waiting' },
];

function closePopovers() {
  assignPopoverTaskId.value = null;
  duePopoverTaskId.value = null;
  priorityPopoverTaskId.value = null;
  statusPopoverTaskId.value = null;
}

function toggleAssignPopover(taskId) {
  const next = assignPopoverTaskId.value === taskId ? null : taskId;
  closePopovers();
  assignPopoverTaskId.value = next;
}

function toggleDuePopover(taskId) {
  const next = duePopoverTaskId.value === taskId ? null : taskId;
  closePopovers();
  duePopoverTaskId.value = next;
}

function togglePriorityPopover(taskId) {
  const next = priorityPopoverTaskId.value === taskId ? null : taskId;
  closePopovers();
  priorityPopoverTaskId.value = next;
}

function toggleStatusPopover(taskId) {
  const next = statusPopoverTaskId.value === taskId ? null : taskId;
  closePopovers();
  statusPopoverTaskId.value = next;
}

// Quick due-date helpers — uses browser local time so it reflects the current user's timezone
function endOfTodayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function endOfWeekDate() {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0 Sun … 6 Sat
  // Advance to Friday: if today is Sat (6) wrap to next Friday (+6), else go forward
  const daysToFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6;
  d.setDate(d.getDate() + daysToFriday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function quickAssign(task, userId) {
  assignPopoverTaskId.value = null;
  try {
    await api.put(`/me/tasks/${task.id}`, { assigned_to_user_id: userId || null }, { skipGlobalLoading: true });
    const t = tasks.value.find((x) => x.id === task.id);
    if (t) {
      t.assigned_to_user_id = userId || null;
      const m = userId ? members.value.find((x) => x.user_id === userId) : null;
      t.assignee_first_name = m?.first_name || null;
      t.assignee_last_name = m?.last_name || null;
      t.assignee_profile_photo_path = m?.profile_photo_path || null;
    }
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = { ...selectedTask.value, assigned_to_user_id: userId || null };
    }
  } catch (e) {
    console.error('quickAssign failed', e);
  }
}

async function quickSetDue(task, dateStr) {
  duePopoverTaskId.value = null;
  try {
    await api.put(`/me/tasks/${task.id}`, { due_date: dateStr || null }, { skipGlobalLoading: true });
    const t = tasks.value.find((x) => x.id === task.id);
    if (t) t.due_date = dateStr || null;
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = { ...selectedTask.value, due_date: dateStr || null };
    }
  } catch (e) {
    console.error('quickSetDue failed', e);
  }
}

async function quickSetPriority(task, urgency) {
  priorityPopoverTaskId.value = null;
  try {
    await api.put(`/me/tasks/${task.id}`, { urgency }, { skipGlobalLoading: true });
    const t = tasks.value.find((x) => x.id === task.id);
    if (t) t.urgency = urgency;
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = { ...selectedTask.value, urgency };
    }
  } catch (e) {
    console.error('quickSetPriority failed', e);
  }
}

async function quickSetStatus(task, status) {
  statusPopoverTaskId.value = null;
  try {
    if (status === 'completed') {
      await api.put(`/tasks/${task.id}/complete`, {}, { skipGlobalLoading: true });
    } else {
      await api.put(`/me/tasks/${task.id}`, { status }, { skipGlobalLoading: true });
    }
    const t = tasks.value.find((x) => x.id === task.id);
    if (t) t.status = status;
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = { ...selectedTask.value, status };
    }
  } catch (e) {
    console.error('quickSetStatus failed', e);
  }
}
const userLabel = (u) => {
  const name = [u.first_name ?? u.firstName, u.last_name ?? u.lastName].filter(Boolean).join(' ');
  return name || u.email || `User #${u.id}`;
};
const isOverdue = (d) => d && new Date(d) < new Date();

function statusLabel(s) {
  const map = { pending: 'Open', in_progress: 'In Progress', waiting: 'Waiting', completed: 'Completed', overridden: 'Completed' };
  return map[s] || 'Open';
}

const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };

function setSort(field) {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = field;
    sortDir.value = (field === 'priority' || field === 'due_date' || field === 'added') ? 'desc' : 'asc';
  }
}

function slwSortIndicator(field) {
  if (sortBy.value !== field) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
}

const sortedTasks = computed(() => {
  const d = sortDir.value === 'asc' ? 1 : -1;
  return [...tasks.value].sort((a, b) => {
    switch (sortBy.value) {
      case 'priority':
        return d * ((PRIORITY_RANK[a.urgency] || 0) - (PRIORITY_RANK[b.urgency] || 0));
      case 'due_date': {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return d * (da - db);
      }
      case 'added': {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return d * (da - db);
      }
      case 'title':
        return d * String(a.title || '').localeCompare(String(b.title || ''));
      case 'status':
        return d * String(a.status || '').localeCompare(String(b.status || ''));
      case 'assignee':
        return d * assigneeName(a).localeCompare(assigneeName(b));
      default:
        return 0;
    }
  });
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
.slw__col-added { font-size: 11px; color: #94a3b8; white-space: nowrap; }

/* ── Inline quick-action cells ─────────────────────────────── */
.slw__cell-assignee,
.slw__cell-due { position: relative; }

.slw__quick-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.slw__assignee-name {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
}

.slw__inline-plus {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0;
  transition: opacity .12s, background .12s, border-color .12s;
}
tr:hover .slw__inline-plus { opacity: 1; }
.slw__inline-plus:hover,
.slw__inline-plus--open {
  background: #e0f2fe;
  border-color: #7dd3fc;
  color: #0369a1;
  opacity: 1 !important;
}

/* ── Popovers ───────────────────────────────────────────────── */
.slw__pop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 190;
}
.slw__pop {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  min-width: 180px;
  max-width: 240px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15,23,42,.14);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.slw__pop-label {
  margin: 0 0 4px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #94a3b8;
}
.slw__pop-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #1e293b;
  text-align: left;
  width: 100%;
}
.slw__pop-member:hover { background: #f1f5f9; }
.slw__pop-member--active { background: #f0fdf4; color: #15803d; font-weight: 600; }
.slw__pop-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
  overflow: hidden;
}
.slw__pop-avatar img { width: 100%; height: 100%; object-fit: cover; }
.slw__pop-check { margin-left: auto; color: #16a34a; font-size: 12px; }
.slw__pop-unassign {
  margin-top: 4px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  border-top: 1px solid #f1f5f9;
  border-radius: 0 0 6px 6px;
  cursor: pointer;
  font-size: 11px;
  color: #dc2626;
  text-align: left;
  width: 100%;
}
.slw__pop-unassign:hover { background: #fef2f2; }

.slw__cell-priority,
.slw__cell-status { position: relative; }

.slw__pop--due { min-width: 220px; }

/* Quick date option buttons (End of day / End of week) */
.slw__pop-quick {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 8px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  color: #1e293b;
}
.slw__pop-quick:hover { background: #f1f5f9; }
.slw__pop-quick-icon { font-size: 16px; flex-shrink: 0; width: 22px; text-align: center; }
.slw__pop-quick span:last-child { display: flex; flex-direction: column; gap: 1px; }
.slw__pop-quick strong { font-size: 13px; font-weight: 600; }
.slw__pop-quick small { font-size: 10px; color: #64748b; }

.slw__pop-divider {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #94a3b8;
  padding: 4px 4px 2px;
  border-top: 1px solid #f1f5f9;
  margin-top: 2px;
}

.slw__due-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  color: #1e293b;
  outline: none;
}
.slw__due-input:focus { border-color: #7dd3fc; box-shadow: 0 0 0 3px rgba(125,211,252,.18); }

/* Status dot indicator in popover */
.slw__status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.slw__status-dot--pending { background: #94a3b8; }
.slw__status-dot--in_progress { background: #3b82f6; }
.slw__status-dot--waiting { background: #a855f7; }
.slw__status-dot--completed { background: #16a34a; }

.slw__th-sort {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.slw__th-sort:hover { color: #0f172a; }
.slw__th-sort--active { color: #0f172a; font-weight: 700; }
.slw__sort-arrow { font-size: 9px; opacity: 0.5; margin-left: 3px; }
.slw__th-sort--active .slw__sort-arrow { opacity: 1; }
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
