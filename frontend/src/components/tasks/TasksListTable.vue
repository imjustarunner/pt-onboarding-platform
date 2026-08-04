<template>
  <div class="tasks-list-table">
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
          :style="{ '--type-color': typeMeta(task).color }"
          draggable="true"
          @dragstart="onDragStart($event, task)"
          @click="$emit('open', task)"
        >
          <span class="task-row__rail" aria-hidden="true" />
          <input
            type="checkbox"
            class="task-row__check"
            :checked="task.status === 'completed'"
            @click.stop
            @change="$emit('toggle-complete', task)"
          />
          <div class="task-row__main">
            <span class="task-row__title" :class="{ done: task.status === 'completed' }">{{ task.title }}</span>
            <span v-if="showAssignee(task)" class="task-row__assignee">{{ assigneeLabel(task) }}</span>
            <span v-if="task.task_list_name" class="task-row__badge task-row__badge--list">{{ task.task_list_name }}</span>
            <span v-if="task.project_name" class="task-row__badge task-row__badge--project">{{ task.project_name }}</span>
            <span v-if="Number(task.is_private)" class="task-row__badge task-row__badge--private">Private</span>
          </div>
          <span
            class="task-row__type"
            :title="typeMeta(task).label"
            v-html="typeIconHtml(task)"
          />
          <span class="priority" :class="`priority--${task.urgency || 'medium'}`">
            {{ urgencyLabel(task.urgency) }}
          </span>
          <div class="task-row__due" :class="relativeDueClass(task)">
            <template v-if="task.due_date">
              <span class="due-primary">{{ relativeDue(task) || formatDate(task.due_date) }}</span>
            </template>
            <span v-else class="muted">—</span>
          </div>
          <button type="button" class="more-btn" title="Actions" @click.stop="$emit('menu', task)">⋯</button>
        </div>
        <div v-if="!group.items.length" class="task-group__empty">No tasks</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { formatDate } from '../../utils/formatDate';
import { resolveTaskTypeMeta, taskTypeIconSvg } from '../../utils/taskTypeIcons';

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  typeDefs: { type: Array, default: () => [] },
  currentUserId: { type: [Number, String], default: null },
  /** assigned | all | mine | watchlist | action_items */
  view: { type: String, default: 'assigned' }
});

defineEmits(['open', 'toggle-complete', 'menu', 'drag-start']);

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
    { key: 'overdue', label: 'Overdue', items: buckets.overdue },
    { key: 'today', label: 'Today', items: buckets.today },
    { key: 'week', label: 'Upcoming', items: buckets.week },
    { key: 'later', label: 'Later', items: buckets.later },
    { key: 'completed', label: 'Completed', items: buckets.completed }
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

function onDragStart(ev, task) {
  try {
    ev.dataTransfer.setData('application/x-task-id', String(task.id));
    ev.dataTransfer.setData('application/x-assignable', JSON.stringify({
      assignableType: task._assignableType || 'task',
      assignableId: task._assignableId || task.id
    }));
    ev.dataTransfer.effectAllowed = 'copyMove';
  } catch { /* ignore */ }
}
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
  grid-template-columns: 4px 28px minmax(140px, 1.8fr) 28px 72px minmax(90px, 120px) 32px;
  gap: 6px;
  align-items: center;
  padding: 7px 10px;
  border-top: 1px solid #f1f5f9;
  cursor: grab;
  min-height: 40px;
}
.task-row:hover { background: #f8fafc; }
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
.task-row__due { font-size: 12px; color: #334155; text-align: right; }
.due--overdue { color: #b91c1c; font-weight: 700; }
.due--today { color: #2563eb; font-weight: 700; }
.more-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  color: #64748b;
}
.task-group__empty { padding: 8px 12px; color: #94a3b8; font-size: 12px; }
.muted { color: #94a3b8; }
@media (max-width: 900px) {
  .task-row {
    grid-template-columns: 4px 28px 1fr 28px 32px;
  }
  .priority, .task-row__due { display: none; }
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
