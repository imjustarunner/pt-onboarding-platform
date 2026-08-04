<template>
  <aside class="side-panel" role="dialog" aria-label="Task details">
    <header class="side-panel__head">
      <div class="side-panel__tabs">
        <button type="button" :class="{ active: tab === 'details' }" @click="tab = 'details'">Details</button>
        <button type="button" :class="{ active: tab === 'subtasks' }" @click="tab = 'subtasks'">
          Subtasks <span v-if="subtasks.length">({{ subtasks.length }})</span>
        </button>
        <button type="button" :class="{ active: tab === 'activity' }" @click="tab = 'activity'">Activity</button>
      </div>
      <button type="button" class="btn-close" @click="$emit('close')">Close</button>
    </header>

    <div v-if="loading" class="side-panel__state">Loading…</div>
    <div v-else class="side-panel__body">
      <template v-if="tab === 'details'">
        <h2 class="side-panel__title">{{ draft.title }}</h2>
        <div class="chips">
          <span v-if="draft.due_date" class="chip">{{ formatDate(draft.due_date) }}</span>
          <span class="chip chip--priority" :class="`prio-${draft.urgency || 'medium'}`">
            {{ (draft.urgency || 'medium') }}
          </span>
          <span v-if="Number(draft.is_private)" class="chip chip--private">Private</span>
        </div>

        <label class="field">
          <span>Title</span>
          <input v-model="draft.title" class="form-control" @change="saveCore" />
        </label>

        <label class="field">
          <span>Assigned to</span>
          <select
            v-model="selectedAssigneeIds"
            class="form-control"
            multiple
            size="4"
            @change="saveAssignees"
          >
            <option v-for="u in agencyUsers" :key="u.id" :value="String(u.id)">
              {{ u.first_name }} {{ u.last_name }}
            </option>
          </select>
          <span class="hint">Hold Cmd/Ctrl to select multiple</span>
        </label>

        <label class="field">
          <span>Type</span>
          <select v-model="draft.work_type_id" class="form-control" @change="saveCore">
            <option value="">{{ draft.task_type || 'General' }}</option>
            <option v-for="t in typeDefs" :key="t.id" :value="String(t.id)">{{ t.label }}</option>
          </select>
        </label>

        <div class="assoc-box">
          <label class="field">
            <span>Shared list</span>
            <select v-model="draft.task_list_id" class="form-control" @change="saveCore">
              <option :value="null">None</option>
              <option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Project</span>
            <select v-model="draft.project_id" class="form-control" @change="saveCore">
              <option :value="null">None</option>
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <div v-if="draft.project_id" class="assoc-actions">
            <button type="button" class="linkish" @click="$emit('view-project', Number(draft.project_id))">
              View Project
            </button>
            <button type="button" class="linkish" @click="$emit('open-project', Number(draft.project_id))">
              Open Project Workspace
            </button>
          </div>
        </div>

        <label class="field">
          <span>Description / Notes</span>
          <textarea v-model="draft.description" class="form-control" rows="4" @change="saveCore" />
        </label>

        <label class="private-toggle">
          <input v-model="draft.is_private" type="checkbox" true-value="1" false-value="0" @change="saveCore" />
          Private — only you can see this (hidden from lists, projects, and team)
        </label>

        <section class="block">
          <header class="block__head">
            <strong>Attachments</strong>
            <label class="linkish">
              + Add
              <input type="file" hidden @change="uploadFile" />
            </label>
          </header>
          <ul class="simple-list">
            <li v-for="a in attachments" :key="a.id">{{ a.filename }}</li>
            <li v-if="!attachments.length" class="muted">No attachments</li>
          </ul>
        </section>

        <section class="block">
          <header class="block__head">
            <strong>Links</strong>
          </header>
          <div class="link-add">
            <input v-model="newLinkUrl" class="form-control" placeholder="https://…" />
            <button type="button" class="btn btn-secondary btn-sm" :disabled="!newLinkUrl.trim()" @click="addLink">
              Add
            </button>
          </div>
          <ul class="simple-list">
            <li v-for="l in links" :key="l.id">
              <a :href="l.url" target="_blank" rel="noopener">{{ l.label || l.url }}</a>
              <button type="button" class="btn-x" @click="removeLink(l)">×</button>
            </li>
            <li v-if="!links.length" class="muted">No links</li>
          </ul>
        </section>

        <section class="block">
          <header class="block__head"><strong>Activity / Comments</strong></header>
          <ul class="simple-list">
            <li v-for="c in comments" :key="c.id">
              <strong>{{ c.first_name || 'User' }}</strong>: {{ c.body }}
            </li>
            <li v-if="!comments.length" class="muted">No comments yet</li>
          </ul>
          <div class="link-add">
            <input v-model="newComment" class="form-control" placeholder="Add a note…" @keydown.enter.prevent="postComment" />
            <button type="button" class="btn btn-secondary btn-sm" @click="postComment">Post</button>
          </div>
        </section>

        <footer class="meta-foot">
          <div v-if="draft.created_at">Created {{ formatDate(draft.created_at) }}</div>
          <div v-if="draft.updated_at">Updated {{ formatDate(draft.updated_at) }}</div>
        </footer>

        <div class="side-panel__actions">
          <button
            v-if="draft.status !== 'completed'"
            type="button"
            class="btn btn-primary btn-sm"
            @click="$emit('complete', item)"
          >
            Mark complete
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="$emit('close')">Done</button>
        </div>
      </template>

      <template v-else-if="tab === 'subtasks'">
        <ul class="simple-list">
          <li v-for="(s, i) in subtasks" :key="i">{{ s.title || s }}</li>
          <li v-if="!subtasks.length" class="muted">No subtasks yet</li>
        </ul>
      </template>

      <template v-else>
        <ul class="simple-list">
          <li v-for="c in comments" :key="c.id">
            <strong>{{ c.first_name || 'User' }}</strong>
            <span class="muted"> · {{ formatDate(c.created_at) }}</span>
            <div>{{ c.body }}</div>
          </li>
          <li v-if="!comments.length" class="muted">No activity yet</li>
        </ul>
      </template>
    </div>
  </aside>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { formatDate } from '../../utils/formatDate';

const props = defineProps({
  item: { type: Object, required: true },
  agencyId: { type: Number, default: null },
  typeDefs: { type: Array, default: () => [] },
  lists: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [] },
  agencyUsers: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'complete', 'changed', 'view-project', 'open-project']);

const tab = ref('details');
const loading = ref(false);
const attachments = ref([]);
const comments = ref([]);
const links = ref([]);
const selectedAssigneeIds = ref([]);
const newLinkUrl = ref('');
const newComment = ref('');

const isActionItem = computed(() => !!props.item?._isActionItem);

const draft = reactive({
  title: '',
  description: '',
  urgency: 'medium',
  due_date: null,
  task_list_id: null,
  project_id: null,
  is_private: 0,
  work_type_id: '',
  task_type: '',
  status: '',
  created_at: null,
  updated_at: null
});

const subtasks = computed(() => {
  const meta = props.item?.metadata;
  if (meta && Array.isArray(meta.subtasks)) return meta.subtasks;
  return [];
});

function syncDraft() {
  const t = props.item || {};
  draft.title = t.title || '';
  draft.description = t.description || t.notes || '';
  draft.urgency = t.urgency || 'medium';
  draft.due_date = t.due_date || null;
  draft.task_list_id = t.task_list_id ?? null;
  draft.project_id = t.project_id ?? null;
  draft.is_private = Number(t.is_private) ? 1 : 0;
  draft.work_type_id = t.work_type_id != null ? String(t.work_type_id) : '';
  draft.task_type = t.task_type || '';
  draft.status = t.status || '';
  draft.created_at = t.created_at || null;
  draft.updated_at = t.updated_at || null;
  if (t.assigned_to_user_id || t.assignee_user_id) {
    selectedAssigneeIds.value = [String(t.assigned_to_user_id || t.assignee_user_id)];
  }
}

async function loadExtras() {
  if (!props.item?.id || isActionItem.value) {
    attachments.value = [];
    comments.value = [];
    links.value = [];
    return;
  }
  loading.value = true;
  try {
    const id = props.item.id;
    const [a, c, l, assignees] = await Promise.all([
      api.get(`/me/tasks/${id}/attachments`, { skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get(`/me/tasks/${id}/comments`, { skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get(`/me/tasks/${id}/links`, { skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get(`/me/tasks/${id}/assignees`, { skipGlobalLoading: true }).catch(() => ({ data: [] }))
    ]);
    attachments.value = Array.isArray(a.data) ? a.data : [];
    comments.value = Array.isArray(c.data) ? c.data : [];
    links.value = Array.isArray(l.data) ? l.data : [];
    if (Array.isArray(assignees.data) && assignees.data.length) {
      selectedAssigneeIds.value = assignees.data.map((x) => String(x.user_id));
    }
  } finally {
    loading.value = false;
  }
}

async function saveCore() {
  try {
    if (isActionItem.value) {
      await api.put(`/task-action-items/${props.item.id}`, {
        title: draft.title,
        notes: draft.description,
        taskListId: draft.task_list_id,
        projectId: draft.project_id,
        isPrivate: !!Number(draft.is_private)
      }, { skipGlobalLoading: true });
    } else {
      await api.put(`/me/tasks/${props.item.id}`, {
        title: draft.title,
        description: draft.description,
        task_list_id: draft.task_list_id,
        projectId: draft.project_id,
        isPrivate: !!Number(draft.is_private),
        urgency: draft.urgency
      }, { skipGlobalLoading: true });
    }
    emit('changed');
  } catch (e) {
    console.error(e);
  }
}

async function saveAssignees() {
  if (isActionItem.value) return;
  try {
    await api.put(`/me/tasks/${props.item.id}/assignees`, {
      userIds: selectedAssigneeIds.value.map((n) => parseInt(n, 10)),
      primaryUserId: selectedAssigneeIds.value[0] ? parseInt(selectedAssigneeIds.value[0], 10) : null
    }, { skipGlobalLoading: true });
    emit('changed');
  } catch (e) {
    console.error(e);
  }
}

async function uploadFile(ev) {
  const file = ev.target?.files?.[0];
  if (!file || isActionItem.value) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api.post(`/me/tasks/${props.item.id}/attachments`, fd, {
      skipGlobalLoading: true,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await loadExtras();
    emit('changed');
  } catch (e) {
    console.error(e);
  }
  ev.target.value = '';
}

async function addLink() {
  const url = newLinkUrl.value.trim();
  if (!url || isActionItem.value) return;
  try {
    await api.post(`/me/tasks/${props.item.id}/links`, { url }, { skipGlobalLoading: true });
    newLinkUrl.value = '';
    await loadExtras();
  } catch (e) {
    console.error(e);
  }
}

async function removeLink(l) {
  try {
    await api.delete(`/me/tasks/${props.item.id}/links/${l.id}`, { skipGlobalLoading: true });
    await loadExtras();
  } catch (e) {
    console.error(e);
  }
}

async function postComment() {
  const body = newComment.value.trim();
  if (!body || isActionItem.value) return;
  try {
    await api.post(`/me/tasks/${props.item.id}/comments`, { body }, { skipGlobalLoading: true });
    newComment.value = '';
    await loadExtras();
  } catch (e) {
    console.error(e);
  }
}

watch(
  () => props.item,
  () => {
    syncDraft();
    loadExtras();
  },
  { immediate: true, deep: true }
);
</script>

<style scoped>
.side-panel {
  width: 440px;
  flex: 0 0 440px;
  max-width: 100%;
  height: calc(100vh - 140px);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -4px 0 24px rgba(15, 23, 42, 0.06);
}
.side-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
}
.side-panel__tabs {
  display: flex;
  gap: 4px;
}
.side-panel__tabs button {
  border: 0;
  background: transparent;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  border-radius: 6px;
}
.side-panel__tabs button.active {
  background: #ecfdf5;
  color: #14532d;
}
.btn-close {
  border: 0;
  background: transparent;
  color: #64748b;
  font-weight: 600;
  cursor: pointer;
}
.side-panel__body {
  padding: 14px 16px 24px;
  overflow-y: auto;
  flex: 1;
}
.side-panel__title {
  margin: 0 0 8px;
  font-size: 1.15rem;
  color: #14532d;
}
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.chip {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  text-transform: capitalize;
}
.chip--private { background: #fef3c7; color: #92400e; }
.prio-high { background: #fee2e2; color: #b91c1c; }
.prio-medium { background: #ffedd5; color: #c2410c; }
.field { display: block; margin-bottom: 12px; }
.field > span {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 4px;
}
.form-control {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font: inherit;
}
.hint { font-size: 11px; color: #94a3b8; }
.assoc-box {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 12px;
}
.assoc-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.linkish {
  border: 0;
  background: transparent;
  color: #5b21b6;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.private-toggle {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
  margin: 12px 0;
  cursor: pointer;
}
.block { margin: 16px 0; }
.block__head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 13px;
}
.simple-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 13px;
}
.simple-list li {
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.muted { color: #94a3b8; }
.link-add { display: flex; gap: 6px; margin-top: 8px; }
.btn-x {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: #94a3b8;
}
.meta-foot {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 16px;
}
.side-panel__actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.side-panel__state { padding: 24px; text-align: center; color: #64748b; }
@media (max-width: 1100px) {
  .side-panel { width: 100%; flex-basis: auto; height: auto; max-height: 70vh; }
}
</style>
