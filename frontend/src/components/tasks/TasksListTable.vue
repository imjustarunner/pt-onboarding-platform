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
          @click="$emit('open', task)"
        >
          <input
            type="checkbox"
            class="task-row__check"
            :checked="task.status === 'completed'"
            @click.stop
            @change="$emit('toggle-complete', task)"
          />
          <div class="task-row__main">
            <div class="task-row__title">{{ task.title }}</div>
            <div class="task-row__desc">{{ task.description || 'No description' }}</div>
          </div>
          <span class="pill" :class="statusClass(task.status)">{{ statusLabel(task.status) }}</span>
          <span class="priority" :class="`priority--${task.urgency || 'medium'}`">
            {{ urgencyLabel(task.urgency) }}
          </span>
          <div class="task-row__assignee">
            {{ assigneeName(task) }}
          </div>
          <div class="task-row__due">
            <template v-if="task.due_date">
              <div>{{ formatDate(task.due_date) }}</div>
              <div class="due-rel" :class="relativeDueClass(task)">{{ relativeDue(task) }}</div>
            </template>
            <span v-else class="muted">—</span>
          </div>
          <span class="type-pill">{{ typeLabel(task) }}</span>
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

const props = defineProps({
  tasks: { type: Array, default: () => [] }
});

defineEmits(['open', 'toggle-complete', 'menu']);

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
    { key: 'today', label: 'Due Today', items: buckets.today },
    { key: 'week', label: 'This Week', items: buckets.week },
    { key: 'later', label: 'Later', items: buckets.later },
    { key: 'completed', label: 'Completed', items: buckets.completed }
  ].filter((g) => g.items.length > 0);
});

function statusLabel(s) {
  return ({ pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', overridden: 'Overridden' })[s] || s;
}
function statusClass(s) {
  return ({ pending: 'pill--pending', in_progress: 'pill--progress', completed: 'pill--done' })[s] || 'pill--muted';
}
function urgencyLabel(u) {
  const v = String(u || 'medium');
  return v.charAt(0).toUpperCase() + v.slice(1);
}
function typeLabel(task) {
  if (task.department_name) return task.department_name;
  if (task.task_list_name) return task.task_list_name;
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
function assigneeName(task) {
  const first = task.assignee_first_name || '';
  const last = task.assignee_last_name || '';
  const name = `${first} ${last}`.trim();
  return name || 'Unassigned';
}
function relativeDue(task) {
  if (!task.due_date) return '';
  const due = startOfDay(task.due_date);
  const today = startOfDay(new Date());
  const days = Math.round((due - today) / 86400000);
  if (task.status === 'completed') return '';
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
function relativeDueClass(task) {
  if (!task.due_date || task.status === 'completed') return '';
  const due = startOfDay(task.due_date);
  const today = startOfDay(new Date());
  if (due < today) return 'due-rel--overdue';
  if (due.getTime() === today.getTime()) return 'due-rel--today';
  return 'due-rel--soon';
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
.task-group--today .task-group__bar { background: #ea580c; }
.task-group--week .task-group__bar { background: #2563eb; }
.task-group--later .task-group__bar { background: #16a34a; }
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
  grid-template-columns: 28px minmax(160px, 1.6fr) 110px 80px 120px 110px 90px 36px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid #f1f5f9;
  cursor: pointer;
}
.task-row:hover { background: #f8fafc; }
.task-row__title { font-weight: 700; color: #0f172a; }
.task-row__desc { font-size: 12px; color: #64748b; margin-top: 2px; }
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 4px 8px;
}
.pill--pending { background: #ffedd5; color: #9a3412; }
.pill--progress { background: #dbeafe; color: #1e40af; }
.pill--done { background: #dcfce7; color: #166534; }
.pill--muted { background: #f1f5f9; color: #475569; }
.priority { font-size: 12px; font-weight: 600; }
.priority--high { color: #b91c1c; }
.priority--medium { color: #c2410c; }
.priority--low { color: #64748b; }
.task-row__assignee,
.task-row__due { font-size: 12px; color: #334155; }
.due-rel { font-size: 11px; margin-top: 2px; }
.due-rel--overdue { color: #b91c1c; font-weight: 700; }
.due-rel--today { color: #c2410c; font-weight: 700; }
.due-rel--soon { color: #2563eb; }
.type-pill {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 4px 8px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.more-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  color: #64748b;
}
.task-group__empty { padding: 8px 12px; color: #94a3b8; font-size: 12px; }
.muted { color: #94a3b8; }
@media (max-width: 1000px) {
  .task-row {
    grid-template-columns: 28px 1fr;
    gap: 6px;
  }
  .pill, .priority, .task-row__assignee, .task-row__due, .type-pill, .more-btn {
    grid-column: 2;
  }
}
</style>
