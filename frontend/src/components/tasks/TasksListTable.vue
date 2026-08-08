<template>
  <div class="tasks-list-table" @dragend="onDragEnd">

    <!-- Drag-and-drop bubble -->
    <teleport to="body">
      <div
        v-if="hoverTask && draggedTask"
        class="dep-bubble"
        :style="bubbleStyle"
        @mouseenter="clearTimeout(leaveTimer)"
        @mouseleave="hoverTask = null"
      >
        <p class="dep-bubble__label">
          Drop <strong>{{ hoverTask.title }}</strong> to…
        </p>
        <button type="button" class="dep-bubble__btn dep-bubble__btn--dep" @click="doMakeDependent">
          Make dependent
          <span class="dep-bubble__hint">{{ hoverTask.title }} waits for {{ draggedTask.title }}</span>
        </button>
        <button
          v-if="canCreateSharedList()"
          type="button"
          class="dep-bubble__btn dep-bubble__btn--list"
          @click="doCreateSharedList"
        >
          Create shared list with both
        </button>
      </div>
    </teleport>

    <div v-if="tasks.length" class="tasks-list-table__header">
      <span class="header-select">
        <input
          type="checkbox"
          :checked="allSelected"
          :indeterminate="someSelected"
          @change="toggleSelectAll"
        />
      </span>
      <span class="header-done" title="Mark complete"></span>
      <button type="button" class="header-task sort-col" :class="{ 'sort-col--active': sortField === 'title' }" @click="setSort('title')">Task <span class="sort-arrow">{{ sortIndicator('title') }}</span></button>
      <button type="button" class="header-type sort-col" :class="{ 'sort-col--active': sortField === 'type' }" title="Task type" @click="setSort('type')"><span class="sort-arrow">{{ sortIndicator('type') }}</span></button>
      <button type="button" class="header-priority sort-col" :class="{ 'sort-col--active': sortField === 'priority' }" @click="setSort('priority')">Priority <span class="sort-arrow">{{ sortIndicator('priority') }}</span></button>
      <button type="button" class="header-due sort-col" :class="{ 'sort-col--active': sortField === 'due' }" @click="setSort('due')">Due <span class="sort-arrow">{{ sortIndicator('due') }}</span></button>
      <button type="button" class="header-added sort-col" :class="{ 'sort-col--active': sortField === 'added' }" @click="setSort('added')">Added <span class="sort-arrow">{{ sortIndicator('added') }}</span></button>
      <span class="header-menu"></span>
    </div>

    <section v-for="group in groups" :key="group.key" class="task-group" :class="`task-group--${group.key}`">
      <button type="button" class="task-group__head" @click="toggle(group.key)">
        <span class="task-group__bar" aria-hidden="true" />
        <span class="task-group__title">{{ group.label }}</span>
        <span class="task-group__count">{{ group.items.length }}</span>
        <span class="task-group__chev">{{ collapsed[group.key] ? '▶' : '▼' }}</span>
      </button>
      <div v-show="!collapsed[group.key]" class="task-group__body">
        <div
          v-for="task in group.items"
          :key="task.id"
          class="task-row"
          :class="{ 'task-row--on-timeline': isOnTimeline(task), 'task-row--waiting': task.status === 'waiting', 'task-row--drag-target': hoverTask?.id === task.id && draggedTask?.id !== task.id }"
          :style="{ '--type-color': typeMeta(task).color }"
          draggable="true"
          @dragstart="onDragStart($event, task)"
          @dragover.prevent="onDragOver($event, task)"
          @dragleave="onDragLeave"
          @click="$emit('open', task)"
        >
          <span class="task-row__rail" aria-hidden="true" />
          <input
            type="checkbox"
            class="task-row__select"
            title="Select"
            :checked="selected.has(task.id)"
            @click.stop
            @change="toggleSelect(task)"
          />
          <button
            type="button"
            class="task-row__done-btn"
            :class="{ done: task.status === 'completed' }"
            title="Mark complete"
            @click.stop="$emit('toggle-complete', task)"
          >
            <svg v-if="task.status === 'completed'" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="task-row__main">
            <span class="task-row__title" :class="{ done: task.status === 'completed' }">{{ task.title }}</span>
            <span v-if="showAssignee(task)" class="task-row__assignee-wrap">
              <UserAvatar
                v-if="showAssigneeAvatars"
                size="xs"
                :photo-path="task.assignee_profile_photo_path"
                :first-name="task.assignee_first_name"
                :last-name="task.assignee_last_name"
              />
              <span class="task-row__assignee">{{ assigneeLabel(task) }}</span>
            </span>
            <span v-if="task.task_list_name" class="task-row__badge task-row__badge--list">{{ task.task_list_name }}</span>
            <span v-if="task.project_name" class="task-row__badge task-row__badge--project">{{ task.project_name }}</span>
            <span v-if="Number(task.is_private)" class="task-row__badge task-row__badge--private">Private</span>
            <span v-if="isOnTimeline(task)" class="task-row__badge task-row__badge--timeline">On timeline</span>
            <span v-if="task.status === 'waiting'" class="task-row__badge task-row__badge--waiting">Waiting</span>
          </div>
          <span
            class="task-row__type"
            :title="typeMeta(task).label"
            v-html="typeIconHtml(task)"
          />
          <!-- Priority cell with quick-change -->
          <div class="tlt-cell tlt-cell--priority" @click.stop>
            <span class="priority" :class="`priority--${patched(task,'urgency') || 'medium'}`">
              {{ urgencyLabel(patched(task,'urgency')) }}
            </span>
            <button type="button" class="tlt-plus" :class="{ 'tlt-plus--open': isPopOpen('priority',task.id) }" title="Change priority" @click.stop="togglePop('priority',task.id,$event)">±</button>
            <div v-if="isPopOpen('priority',task.id)" class="tlt-pop" @click.stop>
              <p class="tlt-pop__label">Priority</p>
              <button v-for="opt in [{val:'high',label:'High',cls:'priority--high'},{val:'medium',label:'Medium',cls:'priority--medium'},{val:'low',label:'Low',cls:'priority--low'}]" :key="opt.val" type="button" class="tlt-pop__item" :class="{'tlt-pop__item--active': (patched(task,'urgency')||'medium')===opt.val}" @click="inlineUpdate(task,{urgency:opt.val})">
                <span class="priority" :class="opt.cls">{{ opt.label }}</span>
                <span v-if="(patched(task,'urgency')||'medium')===opt.val" class="tlt-pop__check">✓</span>
              </button>
            </div>
          </div>

          <!-- Due date cell with quick-set -->
          <div class="tlt-cell tlt-cell--due" :class="relativeDueClass(task)" @click.stop>
            <template v-if="patched(task,'due_date')">
              <span class="due-primary">{{ relativeDue({...task,due_date:patched(task,'due_date')}) || formatDate(patched(task,'due_date')) }}</span>
            </template>
            <span v-else class="muted">—</span>
            <button type="button" class="tlt-plus" :class="{ 'tlt-plus--open': isPopOpen('due',task.id) }" :title="patched(task,'due_date') ? 'Change due date' : 'Set due date'" @click.stop="togglePop('due',task.id,$event)">+</button>
            <div v-if="isPopOpen('due',task.id)" class="tlt-pop tlt-pop--due" @click.stop>
              <p class="tlt-pop__label">Set due date</p>
              <button type="button" class="tlt-pop__quick" @click="inlineUpdate(task,{due_date:endOfTodayDate()})">
                <span class="tlt-pop__quick-icon">☀</span>
                <span><strong>End of today</strong><small>5 pm · {{ formatDate(endOfTodayDate()) }}</small></span>
              </button>
              <button type="button" class="tlt-pop__quick" @click="inlineUpdate(task,{due_date:endOfWeekDate()})">
                <span class="tlt-pop__quick-icon">📅</span>
                <span><strong>End of week</strong><small>Friday 5 pm · {{ formatDate(endOfWeekDate()) }}</small></span>
              </button>
              <div class="tlt-pop__divider">or pick a date</div>
              <input type="date" class="tlt-pop__date-input" :value="patched(task,'due_date') ? String(patched(task,'due_date')).slice(0,10) : ''" @change="inlineUpdate(task,{due_date:$event.target.value||null})" />
              <button v-if="patched(task,'due_date')" type="button" class="tlt-pop__remove" @click="inlineUpdate(task,{due_date:null})">Remove due date</button>
            </div>
          </div>

          <!-- Added date -->
          <div class="task-row__added">
            <span v-if="task.created_at" class="muted">{{ formatDate(task.created_at) }}</span>
            <span v-else class="muted">—</span>
          </div>
          <button type="button" class="more-btn" title="Actions" @click.stop="$emit('menu', task)">⋯</button>
        </div>
      <div v-if="!group.items.length" class="task-group__empty">No tasks</div>
    </div>
  </section>

  <div v-if="activePop.field" class="tlt-backdrop" @click="closePop" />

  <BulkActionBar
    :count="selectedTasks.length"
    :users="assignableUsers"
    :type-defs="typeDefs"
    :busy="bulkBusy"
    @complete="runBulk('bulk-complete')"
    @assign="(userId) => runBulk('bulk-assign', userId)"
    @due-date="(date) => runBulk('bulk-due-date', date)"
    @priority="(urgency) => runBulk('bulk-priority', urgency)"
    @type="(workTypeId) => runBulk('bulk-type', workTypeId)"
    @status="(status) => runBulk('bulk-status', status)"
    @clear="clearSelection"
  />
  </div>
</template>

<script setup>
import { computed, reactive, ref, onBeforeUnmount } from 'vue';
import { formatDate } from '../../utils/formatDate';
import { resolveTaskTypeMeta, taskTypeIconSvg } from '../../utils/taskTypeIcons';
import UserAvatar from '../common/UserAvatar.vue';
import BulkActionBar from './BulkActionBar.vue';
import api from '../../services/api';

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  typeDefs: { type: Array, default: () => [] },
  currentUserId: { type: [Number, String], default: null },
  /** assigned | all | mine | watchlist | action_items */
  view: { type: String, default: 'assigned' },
  /** Set of keys like "task:123" or "action_item:45" currently on today's timeline */
  timelineKeys: { type: [Set, Array], default: () => [] },
  /** Users available for the bulk "Assign to" dropdown */
  assignableUsers: { type: Array, default: () => [] }
});

const emit = defineEmits([
  'open', 'toggle-complete', 'menu', 'drag-start', 'make-dependent', 'create-shared-list',
  'bulk-complete', 'bulk-assign', 'bulk-due-date', 'bulk-priority', 'bulk-type', 'bulk-status',
  'task-updated'
]);

// ---- Multi-select state ----
const selected = ref(new Set());
const bulkBusy = ref(false);

function toggleSelect(task) {
  const next = new Set(selected.value);
  if (next.has(task.id)) next.delete(task.id);
  else next.add(task.id);
  selected.value = next;
}

const allSelected = computed(() => props.tasks.length > 0 && selected.value.size === props.tasks.length);
const someSelected = computed(() => selected.value.size > 0 && !allSelected.value);

function toggleSelectAll() {
  if (allSelected.value) {
    selected.value = new Set();
  } else {
    selected.value = new Set(props.tasks.map((t) => t.id));
  }
}

const selectedTasks = computed(() =>
  props.tasks.filter((t) => selected.value.has(t.id))
);

function clearSelection() {
  selected.value = new Set();
}

async function runBulk(eventName, value) {
  const tasksToUpdate = selectedTasks.value;
  if (!tasksToUpdate.length) return;
  bulkBusy.value = true;
  try {
    emit(eventName, tasksToUpdate, value);
  } finally {
    bulkBusy.value = false;
    clearSelection();
  }
}

const collapsed = reactive({
  overdue: false,
  today: false,
  week: false,
  later: false,
  completed: true
});

function toggle(key) {
  collapsed[key] = !collapsed[key];
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function groupKeyFor(task) {
  if (task.status === 'completed' || task.status === 'overridden') return 'completed';
  if (!task.due_date) return 'later';
  const due = startOfDay(task.due_date);
  const today = startOfDay(new Date());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  if (due < weekEnd) return 'week';
  return 'later';
}

// ─── Inline quick-action popovers ────────────────────────────────────────────
// Local patch map: { [taskId]: { urgency?, due_date?, status?, assigned_to_user_id?, ... } }
// Lets us update the display instantly without mutating props.
const localPatch = reactive({});

function patched(task, field) {
  return Object.prototype.hasOwnProperty.call(localPatch, task.id) && field in localPatch[task.id]
    ? localPatch[task.id][field]
    : task[field];
}

function applyPatch(taskId, updates) {
  localPatch[taskId] = { ...(localPatch[taskId] || {}), ...updates };
}

// Single active popover: { field: 'due'|'priority'|'status'|'assign', taskId }
const activePop = reactive({ field: null, taskId: null });

function togglePop(field, taskId, ev) {
  if (ev) ev.stopPropagation();
  if (activePop.field === field && activePop.taskId === taskId) {
    activePop.field = null; activePop.taskId = null;
  } else {
    activePop.field = field; activePop.taskId = taskId;
  }
}
function closePop() { activePop.field = null; activePop.taskId = null; }
function isPopOpen(field, taskId) { return activePop.field === field && activePop.taskId === taskId; }

function endOfTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function endOfWeekDate() {
  const d = new Date();
  const daysToFri = d.getDay() <= 5 ? 5 - d.getDay() : 6;
  d.setDate(d.getDate() + daysToFri);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function inlineUpdate(task, updates) {
  closePop();
  applyPatch(task.id, updates);
  try {
    const endpoint = task._isActionItem
      ? `/task-action-items/${task.id}`
      : `/me/tasks/${task.id}`;
    await api.put(endpoint, updates, { skipGlobalLoading: true });
    emit('task-updated', { id: task.id, updates });
  } catch (e) {
    // Revert patch on failure
    if (localPatch[task.id]) {
      Object.keys(updates).forEach((k) => delete localPatch[task.id][k]);
    }
    console.error('inline update failed', e);
  }
}

const tltStatusOptions = [
  { val: 'pending',     label: 'Open',        dot: '#94a3b8' },
  { val: 'in_progress', label: 'In Progress',  dot: '#3b82f6' },
  { val: 'waiting',     label: 'Waiting',      dot: '#a855f7' },
];
// ─────────────────────────────────────────────────────────────────────────────

// ─── Column sort ─────────────────────────────────────────────────────────────
const sortField = ref(null);
const sortDir = ref('asc');
const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };

function setSort(field) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = field;
    // Dates & priority default to descending (newest / highest first)
    sortDir.value = (field === 'priority' || field === 'due' || field === 'added') ? 'desc' : 'asc';
  }
}

function sortIndicator(field) {
  if (sortField.value !== field) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
}

function sortItems(items) {
  if (!sortField.value) return items;
  const d = sortDir.value === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    switch (sortField.value) {
      case 'title':
        return d * String(a.title || '').localeCompare(String(b.title || ''));
      case 'type': {
        const ta = resolveTaskTypeMeta(a, props.typeDefs).label || '';
        const tb = resolveTaskTypeMeta(b, props.typeDefs).label || '';
        return d * ta.localeCompare(tb);
      }
      case 'priority':
        return d * ((PRIORITY_RANK[a.urgency] || 0) - (PRIORITY_RANK[b.urgency] || 0));
      case 'due': {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return d * (da - db);
      }
      case 'added': {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return d * (da - db);
      }
      default:
        return 0;
    }
  });
}
// ─────────────────────────────────────────────────────────────────────────────

const groups = computed(() => {
  const buckets = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    completed: []
  };
  for (const t of props.tasks || []) {
    buckets[groupKeyFor(t)].push(t);
  }
  return [
    { key: 'overdue', label: 'Overdue', items: sortItems(buckets.overdue) },
    { key: 'today', label: 'Today', items: sortItems(buckets.today) },
    { key: 'week', label: 'Upcoming', items: sortItems(buckets.week) },
    { key: 'later', label: 'Later', items: sortItems(buckets.later) },
    { key: 'completed', label: 'Completed', items: sortItems(buckets.completed) }
  ].filter((g) => g.items.length > 0);
});

function urgencyLabel(u) {
  const v = String(u || 'medium');
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function typeMeta(task) {
  return resolveTaskTypeMeta(task, props.typeDefs);
}

function typeIconHtml(task) {
  const m = typeMeta(task);
  return taskTypeIconSvg(m.icon, m.color);
}

function showAssignee(task) {
  if (props.view === 'assigned') return false;
  return true;
}

const showAssigneeAvatars = computed(() => props.view === 'all');

function assigneeLabel(task) {
  const uid = Number(props.currentUserId || 0);
  if (task.assigned_to_user_id == null) return 'Unassigned';
  if (uid && Number(task.assigned_to_user_id) === uid) return 'Me';
  const first = task.assignee_first_name || '';
  const last = task.assignee_last_name || '';
  const name = `${first} ${last}`.trim();
  return name || 'Assigned';
}

function relativeDue(task) {
  if (!task.due_date) return '';
  const due = startOfDay(task.due_date);
  const today = startOfDay(new Date());
  const days = Math.round((due - today) / 86400000);
  if (task.status === 'completed') return formatDate(task.due_date);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return formatDate(task.due_date);
}

function relativeDueClass(task) {
  if (!task.due_date || task.status === 'completed') return '';
  const due = startOfDay(task.due_date);
  const today = startOfDay(new Date());
  if (due < today) return 'due--overdue';
  if (due.getTime() === today.getTime()) return 'due--today';
  return '';
}

function timelineKeySet() {
  if (props.timelineKeys instanceof Set) return props.timelineKeys;
  return new Set(props.timelineKeys || []);
}

function isOnTimeline(task) {
  const type = task._assignableType || (task._isActionItem ? 'action_item' : 'task');
  const id = task._assignableId || task.id;
  return timelineKeySet().has(`${type}:${id}`);
}

// ---- Drag-and-drop bubble state ----
const draggedTask = ref(null);
const hoverTask = ref(null);
const bubbleStyle = ref({});
let leaveTimer = null;

function onDragStart(ev, task) {
  try {
    ev.dataTransfer.setData('application/x-task-id', String(task.id));
    ev.dataTransfer.setData('application/x-assignable', JSON.stringify({
      assignableType: task._assignableType || 'task',
      assignableId: task._assignableId || task.id
    }));
    ev.dataTransfer.effectAllowed = 'copy';
  } catch { /* ignore */ }
  draggedTask.value = task;
  hoverTask.value = null;
}

function onDragOver(ev, task) {
  if (!draggedTask.value) return;
  if (task.id === draggedTask.value.id) { hoverTask.value = null; return; }
  clearTimeout(leaveTimer);
  hoverTask.value = task;
  const rect = ev.currentTarget?.getBoundingClientRect?.() || {};
  bubbleStyle.value = {
    top: `${(rect.top ?? 0) + window.scrollY + (rect.height ?? 20) / 2}px`,
    left: `${(rect.left ?? 0) + window.scrollX + (rect.width ?? 200) / 2}px`
  };
}

function onDragLeave() {
  leaveTimer = setTimeout(() => { hoverTask.value = null; }, 200);
}

function onDragEnd() {
  draggedTask.value = null;
  hoverTask.value = null;
}

function canCreateSharedList() {
  if (!draggedTask.value || !hoverTask.value) return false;
  const a = draggedTask.value.task_list_id;
  const b = hoverTask.value.task_list_id;
  // Only offer if at least one task has no list, or they're in different lists
  if (!a && !b) return true;
  return String(a || '') !== String(b || '');
}

function doMakeDependent() {
  // hoverTask waits for draggedTask
  emit('make-dependent', { blockerTask: draggedTask.value, waitingTask: hoverTask.value });
  hoverTask.value = null;
}

function doCreateSharedList() {
  emit('create-shared-list', { taskA: draggedTask.value, taskB: hoverTask.value });
  hoverTask.value = null;
}

onBeforeUnmount(() => clearTimeout(leaveTimer));
</script>

<style scoped>
.task-group {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 8px;
  overflow: hidden;
  background: #fff;
}
.task-group__head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 0;
  background: #f8fafc;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}
.task-group__bar {
  width: 4px;
  height: 18px;
  border-radius: 999px;
  background: #94a3b8;
}
.task-group--overdue .task-group__bar { background: #dc2626; }
.task-group--today .task-group__bar { background: #2563eb; }
.task-group--week .task-group__bar { background: #64748b; }
.task-group--later .task-group__bar { background: #94a3b8; }
.task-group--completed .task-group__bar { background: #16a34a; }
.task-group__title { font-weight: 700; color: #0f172a; }
.task-group__count {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 2px 8px;
}
.task-group__chev { margin-left: auto; color: #94a3b8; font-size: 11px; }
.task-row {
  display: grid;
  grid-template-columns: 4px 22px 22px minmax(140px, 1.8fr) 28px 72px minmax(90px, 120px) minmax(80px, 100px) 32px;
  gap: 6px;
  align-items: center;
  padding: 7px 10px;
  border-top: 1px solid #f1f5f9;
  cursor: grab;
  min-height: 40px;
}
.task-row:hover { background: #f8fafc; }

.tasks-list-table__header {
  display: grid;
  grid-template-columns: 4px 22px 22px minmax(140px, 1.8fr) 28px 72px minmax(90px, 120px) minmax(80px, 100px) 32px;
  gap: 6px;
  align-items: center;
  padding: 4px 10px 8px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}
.tasks-list-table__header .header-select { grid-column: 2; display: flex; }
.tasks-list-table__header .header-select input { cursor: pointer; }
.tasks-list-table__header .header-done { grid-column: 3; }
.tasks-list-table__header .header-task { grid-column: 4; }
.tasks-list-table__header .header-type { grid-column: 5; text-align: center; }
.tasks-list-table__header .header-priority { grid-column: 6; }
.tasks-list-table__header .header-due { grid-column: 7; }
.tasks-list-table__header .header-added { grid-column: 8; }
.tasks-list-table__header .header-menu { grid-column: 9; }
.tasks-list-table__header .header-priority,
.tasks-list-table__header .header-due,
.tasks-list-table__header .header-added { text-align: right; justify-content: flex-end; }

/* Sortable column header buttons */
.sort-col {
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  font-weight: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  user-select: none;
}
.sort-col:hover { color: #475569; }
.sort-col--active { color: #1e293b; }
.sort-arrow { font-size: 9px; opacity: 0.5; }
.sort-col--active .sort-arrow { opacity: 1; color: #0f172a; }

.task-row__select,
.task-row__done-btn { justify-self: center; }
.task-row__done-btn {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background: #fff;
  color: #fff;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.task-row__done-btn svg { width: 10px; height: 10px; }
.task-row__done-btn.done { background: #16a34a; border-color: #16a34a; }
.task-row--on-timeline {
  background: #f0fdf4;
  box-shadow: inset 3px 0 0 #16a34a;
}
.task-row__badge--timeline { background: #dcfce7; color: #166534; }
.task-row__rail {
  width: 4px;
  height: 70%;
  border-radius: 999px;
  background: var(--type-color, #94a3b8);
  justify-self: center;
}
.task-row__main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.task-row__badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.task-row__badge--list { background: #ccfbf1; color: #0f766e; }
.task-row__badge--project { background: #ede9fe; color: #5b21b6; }
.task-row__badge--private { background: #fef3c7; color: #92400e; }
.task-row__title {
  font-weight: 650;
  color: #0f172a;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-row__title.done {
  text-decoration: line-through;
  color: #94a3b8;
}
.task-row__assignee-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.task-row__assignee {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
}
.task-row__type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.task-row__type :deep(svg) { display: block; }
.priority { font-size: 12px; font-weight: 600; }
.priority--high { color: #b91c1c; }
.priority--medium { color: #c2410c; }
.priority--low { color: #64748b; }
.tlt-cell {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.tlt-cell--due { color: #334155; justify-content: flex-end; }
.tlt-cell--priority { justify-content: flex-end; }
.due--overdue .tlt-cell--due, .tlt-cell--due.due--overdue { color: #b91c1c; font-weight: 700; }
.tlt-cell--due.due--today { color: #2563eb; font-weight: 700; }

.task-row__due { font-size: 12px; color: #334155; text-align: right; }
.due--overdue { color: #b91c1c; font-weight: 700; }
.due--today { color: #2563eb; font-weight: 700; }
.task-row__added { font-size: 11px; color: #94a3b8; text-align: right; }

/* ── Inline quick-action plus buttons ────── */
.tlt-plus {
  flex-shrink: 0;
  width: 16px; height: 16px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px; line-height: 1;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0;
  opacity: 0;
  transition: opacity .1s, background .1s;
}
.task-row:hover .tlt-plus { opacity: 1; }
.tlt-plus:hover, .tlt-plus--open {
  background: #e0f2fe; border-color: #7dd3fc; color: #0369a1; opacity: 1 !important;
}

/* ── Popover ──────────────────────────────── */
.tlt-backdrop {
  position: fixed; inset: 0; z-index: 190;
}
.tlt-pop {
  position: absolute;
  top: calc(100% + 4px); right: 0;
  z-index: 200;
  min-width: 170px; max-width: 230px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15,23,42,.14);
  padding: 6px;
  display: flex; flex-direction: column; gap: 2px;
}
.tlt-pop--due { min-width: 210px; }
.tlt-pop__label {
  margin: 0 0 3px; padding: 0 4px;
  font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8;
}
.tlt-pop__item {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 6px 8px;
  border: none; background: transparent; border-radius: 6px;
  cursor: pointer; font-size: 13px; color: #1e293b; text-align: left;
}
.tlt-pop__item:hover { background: #f1f5f9; }
.tlt-pop__item--active { background: #f0fdf4; color: #15803d; font-weight: 600; }
.tlt-pop__check { margin-left: auto; color: #16a34a; font-size: 12px; }

.tlt-pop__quick {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 7px 8px;
  border: none; background: transparent; border-radius: 6px;
  cursor: pointer; text-align: left; color: #1e293b;
}
.tlt-pop__quick:hover { background: #f1f5f9; }
.tlt-pop__quick-icon { font-size: 15px; flex-shrink: 0; width: 20px; text-align: center; }
.tlt-pop__quick span:last-child { display: flex; flex-direction: column; gap: 1px; }
.tlt-pop__quick strong { font-size: 12px; font-weight: 600; }
.tlt-pop__quick small { font-size: 10px; color: #64748b; }

.tlt-pop__divider {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  color: #94a3b8; padding: 4px 4px 2px;
  border-top: 1px solid #f1f5f9; margin-top: 2px;
}
.tlt-pop__date-input {
  width: 100%; padding: 6px 8px;
  border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 12px; color: #1e293b; outline: none;
}
.tlt-pop__date-input:focus { border-color: #7dd3fc; }
.tlt-pop__remove {
  margin-top: 2px; padding: 5px 8px;
  border: none; border-top: 1px solid #f1f5f9; border-radius: 0 0 6px 6px;
  background: transparent; cursor: pointer;
  font-size: 11px; color: #dc2626; text-align: left; width: 100%;
}
.tlt-pop__remove:hover { background: #fef2f2; }
.more-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  color: #64748b;
}
.task-group__empty { padding: 8px 12px; color: #94a3b8; font-size: 12px; }
.muted { color: #94a3b8; }

/* Waiting task row */
.task-row--waiting { background: #fdf4ff; border-left: 3px solid #a855f7; }
.task-row--waiting .task-row__title { color: #7e22ce; }
.task-row__badge--waiting { background: #f3e8ff; color: #7e22ce; }

/* Drag target highlight */
.task-row--drag-target { background: #eff6ff; outline: 2px dashed #3b82f6; border-radius: 6px; }

/* Drag-and-drop bubble */
.dep-bubble {
  position: fixed;
  transform: translate(-50%, -50%);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
  padding: 14px 16px;
  z-index: 9999;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: all;
}
.dep-bubble__label {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dep-bubble__btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  transition: background .15s;
}
.dep-bubble__btn:hover { background: #f1f5f9; }
.dep-bubble__btn--dep { border-color: #a855f7; color: #7e22ce; background: #faf5ff; }
.dep-bubble__btn--dep:hover { background: #f3e8ff; }
.dep-bubble__btn--list { border-color: #0ea5e9; color: #0369a1; background: #f0f9ff; }
.dep-bubble__btn--list:hover { background: #e0f2fe; }
.dep-bubble__hint {
  font-size: 11px;
  font-weight: 400;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
@media (max-width: 900px) {
  .task-row {
    grid-template-columns: 4px 22px 22px 1fr 28px 32px;
  }
  .tasks-list-table__header {
    grid-template-columns: 4px 22px 22px 1fr 28px 32px;
  }
  .tlt-cell--priority, .tlt-cell--due, .header-priority, .header-due,
  .task-row__added, .header-added { display: none; }
  .tasks-list-table__header .header-menu { grid-column: 6; }
}
:global(html.dark) .task-group,
:global(.dark) .task-group {
  background: #0f172a;
  border-color: #1e293b;
}
:global(html.dark) .task-group__head,
:global(.dark) .task-group__head {
  background: #1e293b;
}
:global(html.dark) .task-group__title,
:global(.dark) .task-group__title,
:global(html.dark) .task-row__title,
:global(.dark) .task-row__title {
  color: #f1f5f9;
}
:global(html.dark) .task-row:hover,
:global(.dark) .task-row:hover {
  background: #1e293b;
}
</style>
