<template>
  <div class="ptt" :class="{ 'ptt--compact': compact }">
    <div class="ptt-scroll">
      <table class="ptt-table">
        <thead>
          <tr>
            <th v-if="showCheckboxes" class="ptt-th ptt-th--check">
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected"
                title="Select all"
                @change="$emit('toggle-select-all')"
              />
            </th>
            <th class="ptt-th">
              <button type="button" class="ptt-sort" @click="$emit('sort', 'title')">
                Title<span class="ptt-sort-ind">{{ sortIndicator('title') }}</span>
              </button>
            </th>
            <th v-if="!compact" class="ptt-th">
              <button type="button" class="ptt-sort" @click="$emit('sort', 'list')">
                Shared list<span class="ptt-sort-ind">{{ sortIndicator('list') }}</span>
              </button>
            </th>
            <th class="ptt-th">
              <button type="button" class="ptt-sort" @click="$emit('sort', 'status')">
                Status<span class="ptt-sort-ind">{{ sortIndicator('status') }}</span>
              </button>
            </th>
            <th v-if="!compact" class="ptt-th">
              <button type="button" class="ptt-sort" @click="$emit('sort', 'category')">
                Category<span class="ptt-sort-ind">{{ sortIndicator('category') }}</span>
              </button>
            </th>
            <th v-if="!compact" class="ptt-th">
              <button type="button" class="ptt-sort" @click="$emit('sort', 'urgency')">
                Priority<span class="ptt-sort-ind">{{ sortIndicator('urgency') }}</span>
              </button>
            </th>
            <th v-if="!compact" class="ptt-th">
              <button type="button" class="ptt-sort" @click="$emit('sort', 'assignee')">
                Assignee<span class="ptt-sort-ind">{{ sortIndicator('assignee') }}</span>
              </button>
            </th>
            <th v-if="!compact" class="ptt-th">
              <button type="button" class="ptt-sort" @click="$emit('sort', 'due_date')">
                Due<span class="ptt-sort-ind">{{ sortIndicator('due_date') }}</span>
              </button>
            </th>
            <th v-if="!compact" class="ptt-th">
              <button type="button" class="ptt-sort" @click="$emit('sort', 'type')">
                Type<span class="ptt-sort-ind">{{ sortIndicator('type') }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!tasks.length">
            <td :colspan="colSpan" class="ptt-empty">No tasks in this project yet.</td>
          </tr>
          <tr
            v-for="task in tasks"
            :key="task.id"
            class="ptt-row"
            :class="{
              'ptt-row--selected': selectedTaskId === task.id,
              'ptt-row--completed': task.status === 'completed'
            }"
            @click="$emit('select', task)"
          >
            <td v-if="showCheckboxes" class="ptt-td ptt-td--check" @click.stop>
              <input
                type="checkbox"
                :checked="selectedTaskIds.has(task.id)"
                @change="$emit('toggle-select', task)"
              />
            </td>
            <td class="ptt-td ptt-td--title">
              <span class="ptt-title">{{ task.title }}</span>
            </td>
            <td v-if="!compact" class="ptt-td ptt-td--list">
              <span v-if="task.task_list_name" class="ptt-list-chip">{{ task.task_list_name }}</span>
              <span v-else class="ptt-muted">—</span>
            </td>
            <td class="ptt-td ptt-td--quick" @click.stop>
              <div class="ptt-quick">
                <button
                  type="button"
                  class="ptt-quick__value ptt-status"
                  :class="`ptt-status--${task.status || 'pending'}`"
                  title="Change status"
                  @click="$emit('open-status', $event, task)"
                >
                  {{ statusLabel(task.status) }}
                </button>
                <button
                  type="button"
                  class="ptt-plus"
                  title="Change status"
                  @click="$emit('open-status', $event, task)"
                >±</button>
              </div>
            </td>
            <td v-if="!compact" class="ptt-td ptt-td--quick" @click.stop>
              <div class="ptt-quick">
                <button
                  type="button"
                  class="ptt-quick__value ptt-category"
                  :title="categoryTitle(task)"
                  @click="$emit('open-categories', $event, task)"
                >
                  {{ categorySummary(task) }}
                </button>
                <button
                  type="button"
                  class="ptt-plus ptt-plus--always"
                  title="Change categories"
                  @click="$emit('open-categories', $event, task)"
                >±</button>
              </div>
            </td>
            <td v-if="!compact" class="ptt-td ptt-td--quick" @click.stop>
              <div class="ptt-quick">
                <button
                  type="button"
                  class="ptt-quick__value ptt-priority"
                  :class="`ptt-priority--${task.urgency || 'none'}`"
                  title="Change priority"
                  @click="$emit('open-priority', $event, task)"
                >
                  {{ priorityLabel(task.urgency) }}
                </button>
                <button
                  type="button"
                  class="ptt-plus"
                  title="Change priority"
                  @click="$emit('open-priority', $event, task)"
                >±</button>
              </div>
            </td>
            <td v-if="!compact" class="ptt-td ptt-td--quick" @click.stop>
              <div class="ptt-quick">
                <span class="ptt-quick__value ptt-assignee">{{ assigneeName(task) || '—' }}</span>
                <button
                  type="button"
                  class="ptt-plus ptt-plus--always"
                  :title="assigneeName(task) ? 'Change assignee' : 'Assign'"
                  @click="$emit('open-assign', $event, task)"
                >{{ assigneeName(task) ? '±' : '+' }}</button>
              </div>
            </td>
            <td v-if="!compact" class="ptt-td ptt-td--quick" @click.stop>
              <div class="ptt-quick">
                <button
                  type="button"
                  class="ptt-quick__value"
                  :class="{ 'ptt-overdue': isOverdue(task) }"
                  :title="task.due_date ? 'Change due date' : 'Set due date'"
                  @click="$emit('open-due', $event, task)"
                >
                  {{ task.due_date ? formatDate(task.due_date) : '—' }}
                </button>
                <button
                  type="button"
                  class="ptt-plus"
                  :class="{ 'ptt-plus--always': !task.due_date }"
                  :title="task.due_date ? 'Change due date' : 'Set due date'"
                  @click="$emit('open-due', $event, task)"
                >+</button>
              </div>
            </td>
            <td v-if="!compact" class="ptt-td ptt-td--type">{{ typeLabel(task) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatDate } from '../../utils/formatDate';
import { formatTaskCategoriesShort, getTaskCategories, taskCategoryLabel } from '../../utils/taskCategories';

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  selectedTaskId: { type: Number, default: null },
  selectedTaskIds: { type: Object, default: () => new Set() },
  compact: { type: Boolean, default: false },
  showCheckboxes: { type: Boolean, default: true },
  sortKey: { type: String, default: 'due_date' },
  sortDir: { type: String, default: 'asc' },
  allSelected: { type: Boolean, default: false },
  someSelected: { type: Boolean, default: false },
  assigneeNameFn: { type: Function, default: null },
  typeLabelFn: { type: Function, default: null }
});

defineEmits([
  'select',
  'toggle-select',
  'toggle-select-all',
  'sort',
  'open-assign',
  'open-status',
  'open-priority',
  'open-due',
  'open-categories'
]);

const colSpan = computed(() => {
  if (props.compact) return props.showCheckboxes ? 3 : 2;
  return props.showCheckboxes ? 9 : 8;
});

function sortIndicator(key) {
  if (props.sortKey !== key) return '';
  return props.sortDir === 'asc' ? ' ↑' : ' ↓';
}

function statusLabel(s) {
  const map = { pending: 'Open', in_progress: 'In progress', waiting: 'Waiting', completed: 'Done', overridden: 'Override' };
  return map[s] || s || 'Open';
}

function priorityLabel(u) {
  if (!u) return 'None';
  return u.charAt(0).toUpperCase() + u.slice(1);
}

function assigneeName(task) {
  return props.assigneeNameFn ? props.assigneeNameFn(task) : null;
}

function typeLabel(task) {
  return props.typeLabelFn ? props.typeLabelFn(task) : (task.task_type || 'General');
}

function isOverdue(task) {
  if (!task?.due_date || task.status === 'completed') return false;
  return new Date(task.due_date) < new Date();
}

function categorySummary(task) {
  return formatTaskCategoriesShort(task);
}

function categoryTitle(task) {
  const labels = getTaskCategories(task).map(taskCategoryLabel);
  return labels.join(', ');
}
</script>

<style scoped>
.ptt { width: 100%; }
.ptt-scroll { overflow: auto; max-height: inherit; }
.ptt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ptt-th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 0;
  text-align: left;
  white-space: nowrap;
}
.ptt-th--check { width: 36px; padding: 8px 10px; }
.ptt-sort {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  cursor: pointer;
  text-align: left;
}
.ptt-sort:hover { color: #0f172a; background: #f1f5f9; }
.ptt-sort-ind { color: #0f766e; font-weight: 900; }
.ptt-row { cursor: pointer; border-bottom: 1px solid #f1f5f9; }
.ptt-row:hover { background: #f8fafc; }
.ptt-row--selected { background: #ecfdf5; }
.ptt-row--selected:hover { background: #d1fae5; }
.ptt-row--completed .ptt-title { color: #94a3b8; text-decoration: line-through; }
.ptt-td { padding: 10px 12px; vertical-align: middle; color: #334155; }
.ptt-td--check { width: 36px; padding: 8px 10px; }
.ptt-td--title { max-width: 420px; }
.ptt--compact .ptt-td--title { max-width: 220px; }
.ptt-title {
  display: block;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ptt-muted { color: #94a3b8; }
.ptt-list-chip {
  display: inline-block;
  max-width: 160px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ptt-td--quick { padding: 8px 10px; }
.ptt-quick {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}
.ptt-quick__value {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.ptt-quick__value:hover { opacity: 0.85; }
.ptt-assignee {
  display: inline-block;
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #334155;
}
.ptt-plus {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.ptt-row:hover .ptt-plus,
.ptt-plus:focus-visible,
.ptt-plus--always {
  opacity: 1;
}
.ptt-plus:hover {
  border-color: #0f766e;
  color: #0f766e;
  background: #ecfdf5;
}
.ptt-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.ptt-status--pending { background: #f1f5f9; color: #475569; }
.ptt-status--in_progress { background: #dbeafe; color: #1d4ed8; }
.ptt-status--waiting { background: #f3e8ff; color: #7e22ce; }
.ptt-status--completed { background: #dcfce7; color: #166534; }
.ptt-status--overridden { background: #fee2e2; color: #991b1b; }
.ptt-priority { font-size: 12px; font-weight: 600; }
.ptt-priority--high { color: #dc2626; }
.ptt-priority--medium { color: #ea580c; }
.ptt-priority--low { color: #2563eb; }
.ptt-priority--none { color: #94a3b8; }
.ptt-category {
  display: inline-block;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: #4338ca;
}
.ptt-overdue { color: #dc2626; font-weight: 700; }
.ptt-td--type { color: #64748b; font-size: 12px; }
.ptt-empty {
  padding: 32px 16px;
  text-align: center;
  color: #94a3b8;
}
</style>
