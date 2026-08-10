<template>
  <div class="task-list-project-fields">
    <div class="task-list-project-fields__pair">
      <label class="field field--inline">
        <span>Shared list</span>
        <select
          :value="listSelectValue"
          class="form-control"
          :disabled="disabled"
          @change="onListSelectChange"
        >
          <option value="">None</option>
          <option v-for="l in lists" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
          <option value="__new__">+ Create new shared list…</option>
        </select>
      </label>

      <label class="field field--inline">
        <span>Project</span>
        <select
          :value="projectSelectValue"
          class="form-control"
          :disabled="disabled"
          @change="onProjectSelectChange"
        >
          <option value="">None</option>
          <option
            v-for="p in projects"
            :key="p.id"
            :value="String(p.id)"
            :disabled="isProjectOptionDisabled(p.id)"
          >
            {{ p.name }}{{ isProjectOptionDisabled(p.id) ? ' (not available for this list)' : '' }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="showNewListForm" class="inline-create">
      <input
        v-model="newListName"
        class="form-control"
        type="text"
        placeholder="New shared list name"
        :disabled="creatingList"
        @keydown.enter.prevent="createList"
      />
      <div class="inline-create__actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="creatingList || !newListName.trim()"
          @click="createList"
        >
          {{ creatingList ? '…' : 'Create list' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="creatingList" @click="cancelNewList">
          Cancel
        </button>
      </div>
    </div>

    <p v-if="notice" class="list-project-notice" :class="`list-project-notice--${notice.kind}`">
      {{ notice.text }}
    </p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  taskListId: { type: [String, Number, null], default: '' },
  projectId: { type: [String, Number, null], default: '' },
  lists: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [] },
  agencyId: { type: [Number, String, null], default: null },
  disabled: { type: Boolean, default: false },
  /** When true, selecting list + project shows that the list will be linked on save */
  showLinkOnSaveHint: { type: Boolean, default: true }
});

const emit = defineEmits(['update:taskListId', 'update:projectId', 'list-created']);

const showNewListForm = ref(false);
const newListName = ref('');
const creatingList = ref(false);
const mismatchFlash = ref(false);

const listSelectValue = computed(() => {
  if (showNewListForm.value) return '__new__';
  const id = props.taskListId;
  return id != null && id !== '' ? String(id) : '';
});

const projectSelectValue = computed(() => {
  const id = props.projectId;
  return id != null && id !== '' ? String(id) : '';
});

function linkedProjectForList(listId) {
  if (!listId) return null;
  const list = props.lists.find((l) => Number(l.id) === Number(listId));
  if (!list?.linked_project_id) return null;
  return {
    id: list.linked_project_id,
    name: list.linked_project_name || 'Project'
  };
}

const notice = computed(() => {
  if (mismatchFlash.value) {
    return {
      kind: 'warn',
      text: 'This shared list is already assigned to a project. To select a different project, deselect the shared list. To use another project, create a new shared list above — then you may select any project.'
    };
  }

  const listId = props.taskListId;
  const projectId = props.projectId;
  const linked = linkedProjectForList(listId);

  if (linked) {
    const same = projectId && Number(projectId) === Number(linked.id);
    if (same) {
      return {
        kind: 'info',
        text: `This shared list is already assigned to “${linked.name}”. To select a different project, deselect the shared list. To use another project, create a new shared list above.`
      };
    }
  }

  if (
    props.showLinkOnSaveHint
    && listId
    && projectId
    && !linked
  ) {
    const proj = props.projects.find((p) => Number(p.id) === Number(projectId));
    const list = props.lists.find((l) => Number(l.id) === Number(listId));
    if (proj && list) {
      return {
        kind: 'hint',
        text: `Saving will add “${list.name}” to project “${proj.name}”.`
      };
    }
  }

  return null;
});

function isProjectOptionDisabled(projectId) {
  const linked = linkedProjectForList(props.taskListId);
  if (!linked || !props.taskListId) return false;
  return Number(projectId) !== Number(linked.id);
}

function applyListSelection(listId) {
  emit('update:taskListId', listId || '');
  const linked = linkedProjectForList(listId);
  if (linked) {
    emit('update:projectId', String(linked.id));
  }
  mismatchFlash.value = false;
}

function onListSelectChange(ev) {
  const val = ev.target?.value ?? '';
  if (val === '__new__') {
    showNewListForm.value = true;
    newListName.value = '';
    return;
  }
  showNewListForm.value = false;
  applyListSelection(val || '');
}

function onProjectSelectChange(ev) {
  const val = ev.target?.value ?? '';
  const linked = linkedProjectForList(props.taskListId);
  if (
    props.taskListId
    && linked
    && val
    && Number(val) !== Number(linked.id)
  ) {
    mismatchFlash.value = true;
    emit('update:projectId', String(linked.id));
    return;
  }
  mismatchFlash.value = false;
  emit('update:projectId', val || '');
}

function cancelNewList() {
  showNewListForm.value = false;
  newListName.value = '';
}

async function createList() {
  const name = newListName.value.trim();
  const aid = props.agencyId != null ? parseInt(props.agencyId, 10) : null;
  if (!name || !aid || creatingList.value) return;
  creatingList.value = true;
  try {
    const { data } = await api.post('/task-lists', { agencyId: aid, name }, { skipGlobalLoading: true });
    const list = {
      ...data,
      linked_project_id: null,
      linked_project_name: null
    };
    emit('list-created', list);
    showNewListForm.value = false;
    newListName.value = '';
    emit('update:taskListId', String(list.id));
    mismatchFlash.value = false;
  } catch (e) {
    console.error('Failed to create shared list', e);
  } finally {
    creatingList.value = false;
  }
}

watch(
  () => props.taskListId,
  (listId) => {
    if (!listId) {
      mismatchFlash.value = false;
      return;
    }
    const linked = linkedProjectForList(listId);
    if (linked && (!props.projectId || Number(props.projectId) !== Number(linked.id))) {
      emit('update:projectId', String(linked.id));
    }
  }
);
</script>

<style scoped>
.task-list-project-fields {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.task-list-project-fields__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}

.field {
  display: block;
  margin: 0;
}

.field--inline {
  display: grid;
  grid-template-columns: minmax(72px, 88px) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

@media (max-width: 520px) {
  .task-list-project-fields__pair {
    grid-template-columns: 1fr;
  }
}

.field span {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted, #64748b);
}

.inline-create {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem;
  border-radius: 8px;
  background: var(--surface-elevated, #f8fafc);
  border: 1px dashed var(--border-subtle, #cbd5e1);
}

.inline-create__actions {
  display: flex;
  gap: 0.5rem;
}

.list-project-notice {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.45;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
}

.list-project-notice--info {
  background: #eff6ff;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}

.list-project-notice--warn {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
}

.list-project-notice--hint {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}
</style>
