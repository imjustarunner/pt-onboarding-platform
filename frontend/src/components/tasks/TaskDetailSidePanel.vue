<template>
  <aside class="side-panel" role="dialog" aria-label="Task details">
    <header class="side-panel__head">
      <div class="side-panel__tabs">
        <button type="button" :class="{ active: tab === 'details' }" @click="tab = 'details'">Details</button>
        <button type="button" :class="{ active: tab === 'subtasks' }" @click="tab = 'subtasks'">
          Subtasks <span v-if="localSubtasks.length">({{ localSubtasks.length }})</span>
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
          <span>Status</span>
          <select v-model="draft.status" class="form-control" @change="saveStatus">
            <option value="pending">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting">Waiting</option>
            <option value="completed">Completed</option>
          </select>
        </label>

        <!-- Waiting state notice -->
        <div v-if="draft.status === 'waiting'" class="waiting-notice">
          <span class="waiting-notice__icon">⏳</span>
          <div class="waiting-notice__body">
            <strong>This task is waiting</strong>
            <p v-if="blockers.length">
              It will become active when the following task{{ blockers.length > 1 ? 's are' : ' is' }} completed:
            </p>
            <ul v-if="blockers.length" class="blockers-list">
              <li v-for="b in blockers" :key="b.id" :class="{ 'blocker--done': b.status === 'completed' || b.status === 'overridden' }">
                <span class="blocker-status">{{ b.status === 'completed' || b.status === 'overridden' ? '✓' : '○' }}</span>
                {{ b.title }}
              </li>
            </ul>
            <p v-else class="muted">No blockers set — you can edit or complete this task at any time.</p>
          </div>
        </div>

        <label class="field">
          <span>Title</span>
          <input v-model="draft.title" class="form-control" @change="saveCore" />
        </label>

        <label class="field">
          <span>Assigned to</span>
          <select
            v-model="assigneeUserId"
            class="form-control"
            :disabled="isActionItem"
            @change="saveAssignee"
          >
            <option value="">Unassigned</option>
            <option v-for="u in assigneeOptions" :key="u.id" :value="String(u.id)">
              {{ u.first_name }} {{ u.last_name }}
            </option>
          </select>
          <span v-if="!assigneeOptions.length" class="hint">No teammates loaded for this tenant</span>
          <span v-if="assigneeError" class="error">{{ assigneeError }}</span>
        </label>

        <label v-if="showCollaborators" class="field">
          <span>Collaborators</span>
          <p class="hint collaborator-hint">
            Optional — must be {{ collaboratorScopeLabel }} members (not the assignee).
          </p>
          <div class="assignee-chips">
            <label
              v-for="u in collaboratorOptions"
              :key="`col-${u.id}`"
              class="assignee-chip"
              :class="{ on: collaboratorIds.includes(String(u.id)) }"
            >
              <input
                type="checkbox"
                :value="String(u.id)"
                :checked="collaboratorIds.includes(String(u.id))"
                @change="toggleCollaborator(u.id, $event)"
              />
              {{ u.first_name }} {{ u.last_name }}
            </label>
            <span v-if="!collaboratorOptions.length" class="hint">No eligible collaborators</span>
          </div>
          <span v-if="collaboratorError" class="error">{{ collaboratorError }}</span>
        </label>

        <label class="field">
          <span>Type</span>
          <select v-model="draft.work_type_id" class="form-control" @change="saveCore">
            <option value="">{{ draft.task_type || 'General' }}</option>
            <option v-for="t in typeDefs" :key="t.id" :value="String(t.id)">{{ t.label }}</option>
          </select>
        </label>

        <div class="assoc-box">
          <TaskListProjectFields
            v-model:task-list-id="draft.task_list_id"
            v-model:project-id="draft.project_id"
            :lists="lists"
            :projects="projects"
            :agency-id="agencyId"
            @list-created="onInlineListCreated"
            @update:task-list-id="onAssocChange"
            @update:project-id="onAssocChange"
          />
          <p v-if="assocError" class="error">{{ assocError }}</p>
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
          <textarea v-model="draft.description" class="form-control" rows="3" @change="saveCore" />
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
            <li v-for="a in attachments" :key="a.id" class="attach-row">
              <a
                v-if="attachmentUrl(a)"
                :href="attachmentUrl(a)"
                target="_blank"
                rel="noopener"
                class="attach-link"
              >{{ a.filename || 'Attachment' }}</a>
              <span v-else>{{ a.filename || 'Attachment' }}</span>
              <button type="button" class="btn-x" title="Remove" @click="removeAttachment(a)">×</button>
            </li>
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
          <header class="block__head"><strong>Comments</strong></header>
          <ul class="simple-list comments">
            <li v-for="c in comments" :key="c.id">
              <strong>{{ commentAuthor(c) }}</strong>
              <span class="muted"> · {{ formatDate(c.created_at) }}</span>
              <div class="comment-body" v-html="renderMentions(c.body)" />
            </li>
            <li v-if="!comments.length" class="muted">No comments yet</li>
          </ul>
          <div class="comment-compose">
            <textarea
              v-model="newComment"
              class="form-control"
              rows="2"
              placeholder="Add a note… use @ to mention"
              @input="onCommentInput"
              @keydown.enter.meta.prevent="postComment"
            />
            <ul v-if="mentionSuggestions.length" class="mention-menu">
              <li
                v-for="u in mentionSuggestions"
                :key="u.id"
                @mousedown.prevent="insertMention(u)"
              >
                {{ u.first_name }} {{ u.last_name }}
              </li>
            </ul>
            <div class="link-add">
              <button type="button" class="btn btn-secondary btn-sm" :disabled="!newComment.trim() || postingComment" @click="postComment">
                {{ postingComment ? '…' : 'Post' }}
              </button>
            </div>
            <p v-if="commentError" class="error">{{ commentError }}</p>
          </div>
        </section>

        <footer class="meta-foot">
          <span class="meta-foot__autosave">
            <svg viewBox="0 0 16 16"><path d="M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Changes saved automatically
          </span>
          <div class="meta-foot__dates">
            <span v-if="draft.created_at">Created {{ formatDate(draft.created_at) }}</span>
            <span v-if="draft.updated_at">Updated {{ formatDate(draft.updated_at) }}</span>
          </div>
        </footer>

        <div class="side-panel__actions">
          <button type="button" class="btn-pin" @click="pinToDock">
            <svg viewBox="0 0 24 24"><path d="M12 17v5M8 13h8l-1-7H9l-1 7z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Keep open in footer
          </button>
        </div>
      </template>

      <template v-else-if="tab === 'subtasks'">
        <p class="subtask-disclaimer">
          Subtasks stay on this task only — they do not appear in your task list or timeline.
          Use them as a private checklist to finish this item. They are not assignable.
        </p>
        <ul class="simple-list subtask-list">
          <li v-for="(s, i) in localSubtasks" :key="i">
            <label class="subtask-row">
              <input type="checkbox" :checked="!!s.done" @change="toggleSubtask(i)" />
              <span :class="{ done: s.done }">{{ s.title }}</span>
            </label>
            <button type="button" class="btn-x" @click="removeSubtask(i)">×</button>
          </li>
          <li v-if="!localSubtasks.length" class="muted">No subtasks yet</li>
        </ul>
        <div class="link-add">
          <input v-model="newSubtask" class="form-control" placeholder="Add a subtask…" @keydown.enter.prevent="addSubtask" />
          <button type="button" class="btn btn-secondary btn-sm" :disabled="!newSubtask.trim()" @click="addSubtask">
            Add
          </button>
        </div>
      </template>

      <template v-else>
        <ul class="simple-list">
          <li v-for="row in activityFeed" :key="row.key">
            <strong>{{ row.label }}</strong>
            <span class="muted"> · {{ formatDate(row.at) }}</span>
            <div v-if="row.detail">{{ row.detail }}</div>
          </li>
          <li v-if="!activityFeed.length" class="muted">No activity yet</li>
        </ul>
      </template>
    </div>
  </aside>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import TaskListProjectFields from './TaskListProjectFields.vue';
import { useActiveTaskDockStore } from '../../store/activeTaskDock';

const props = defineProps({
  item: { type: Object, required: true },
  agencyId: { type: Number, default: null },
  typeDefs: { type: Array, default: () => [] },
  lists: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [] },
  agencyUsers: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'complete', 'incomplete', 'changed', 'view-project', 'open-project', 'list-created']);

const activeTaskDock = useActiveTaskDockStore();

function pinToDock() {
  activeTaskDock.pinTask({ ...draft });
  emit('close');
}

const tab = ref('details');
const loading = ref(false);
const attachments = ref([]);
const comments = ref([]);
const links = ref([]);
const assigneeUserId = ref('');
const collaboratorIds = ref([]);
const memberPool = ref([]);
const localSubtasks = ref([]);
const newLinkUrl = ref('');
const newComment = ref('');
const newSubtask = ref('');
const mentionSuggestions = ref([]);
const commentError = ref('');
const assigneeError = ref('');
const collaboratorError = ref('');
const assocError = ref('');
const postingComment = ref(false);
const blockers = ref([]);

const isActionItem = computed(() => !!props.item?._isActionItem);

const showCollaborators = computed(() => !!(draft.task_list_id || draft.project_id));

const collaboratorScopeLabel = computed(() => {
  if (draft.task_list_id && draft.project_id) return 'shared list and project';
  if (draft.task_list_id) return 'shared list';
  return 'project';
});

const assigneeOptions = computed(() => {
  const scoped = showCollaborators.value;
  const base = scoped ? memberPool.value : props.agencyUsers;
  const id = assigneeUserId.value;
  if (id && !base.some((u) => String(u.id) === String(id))) {
    const extra = props.agencyUsers.find((u) => String(u.id) === String(id));
    if (extra) return [extra, ...base];
  }
  return base;
});

const collaboratorOptions = computed(() => {
  const assignee = assigneeUserId.value;
  return (memberPool.value || []).filter((u) => !assignee || String(u.id) !== String(assignee));
});

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
  status: 'pending',
  created_at: null,
  updated_at: null
});

const activityFeed = computed(() => {
  const rows = [];
  for (const c of comments.value) {
    rows.push({
      key: `c-${c.id}`,
      label: `${commentAuthor(c)} commented`,
      detail: c.body,
      at: c.created_at
    });
  }
  for (const a of attachments.value) {
    rows.push({
      key: `a-${a.id}`,
      label: 'Attachment added',
      detail: a.filename,
      at: a.created_at || a.uploaded_at || draft.updated_at
    });
  }
  for (const l of links.value) {
    rows.push({
      key: `l-${l.id}`,
      label: 'Link added',
      detail: l.label || l.url,
      at: l.created_at || draft.updated_at
    });
  }
  rows.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  return rows;
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
  draft.status = t.status === 'completed' ? 'completed' : 'pending';
  draft.created_at = t.created_at || null;
  draft.updated_at = t.updated_at || null;
  const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
  localSubtasks.value = Array.isArray(meta.subtasks)
    ? meta.subtasks.map((s) => (typeof s === 'string' ? { title: s, done: false } : { title: s.title || '', done: !!s.done }))
    : [];
  if (t.assigned_to_user_id || t.assignee_user_id) {
    assigneeUserId.value = String(t.assigned_to_user_id || t.assignee_user_id);
  } else {
    assigneeUserId.value = '';
  }
}

function normalizeMember(u) {
  return {
    id: u.user_id ?? u.id,
    first_name: u.first_name,
    last_name: u.last_name
  };
}

async function loadMemberPool() {
  const listId = draft.task_list_id;
  const projectId = draft.project_id;
  if (!listId && !projectId) {
    memberPool.value = [];
    return;
  }
  const pools = [];
  try {
    if (listId) {
      const { data } = await api.get(`/task-lists/${listId}`, { skipGlobalLoading: true });
      const members = (data?.members || []).map(normalizeMember).filter((u) => u.id);
      pools.push(members);
    }
    if (projectId) {
      const { data } = await api.get(`/task-projects/${projectId}`, { skipGlobalLoading: true });
      const members = (data?.overview?.members || []).map(normalizeMember).filter((u) => u.id);
      pools.push(members);
    }
    if (pools.length === 2) {
      const ids = new Set(pools[1].map((u) => Number(u.id)));
      memberPool.value = pools[0].filter((u) => ids.has(Number(u.id)));
    } else {
      memberPool.value = pools[0] || [];
    }
  } catch {
    memberPool.value = [];
  }
}

async function reloadCollaborators() {
  if (!props.item?.id || isActionItem.value) {
    collaboratorIds.value = [];
    return;
  }
  try {
    const { data } = await api.get(`/me/tasks/${props.item.id}/collaborators`, { skipGlobalLoading: true });
    collaboratorIds.value = Array.isArray(data) ? data.map((c) => String(c.user_id)) : [];
  } catch {
    collaboratorIds.value = [];
  }
}

function attachmentUrl(a) {
  return toUploadsUrl(a?.url || a?.storage_path || a?.file_path || '');
}

function commentAuthor(c) {
  return c.author_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'User';
}

function renderMentions(body) {
  const escaped = String(body || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/@\[([^\]]*)\]\((\d+)\)/g, '<span class="mention">@$1</span>');
}

async function loadBlockers() {
  if (!props.item?.id || isActionItem.value) { blockers.value = []; return; }
  try {
    const { data } = await api.get(`/me/tasks/${props.item.id}/dependencies`, { skipGlobalLoading: true });
    blockers.value = Array.isArray(data?.blockers) ? data.blockers : [];
  } catch {
    blockers.value = [];
  }
}

async function loadExtras() {
  if (!props.item?.id || isActionItem.value) {
    attachments.value = [];
    comments.value = [];
    links.value = [];
    blockers.value = [];
    return;
  }
  loading.value = true;
  try {
    const id = props.item.id;
    const [a, c, l] = await Promise.all([
      api.get(`/me/tasks/${id}/attachments`, { skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get(`/me/tasks/${id}/comments`, { skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get(`/me/tasks/${id}/links`, { skipGlobalLoading: true }).catch(() => ({ data: [] }))
    ]);
    attachments.value = Array.isArray(a.data) ? a.data : [];
    comments.value = Array.isArray(c.data) ? c.data : [];
    links.value = Array.isArray(l.data) ? l.data : [];
    await Promise.all([loadMemberPool(), reloadCollaborators(), loadBlockers()]);
  } finally {
    loading.value = false;
  }
}

async function saveCore() {
  assocError.value = '';
  try {
    if (isActionItem.value) {
      await api.put(`/task-action-items/${props.item.id}`, {
        title: draft.title,
        notes: draft.description,
        taskListId: draft.task_list_id || null,
        projectId: draft.project_id || null,
        isPrivate: !!Number(draft.is_private)
      }, { skipGlobalLoading: true });
    } else {
      await api.put(`/me/tasks/${props.item.id}`, {
        title: draft.title,
        description: draft.description,
        task_list_id: draft.task_list_id || null,
        projectId: draft.project_id || null,
        isPrivate: !!Number(draft.is_private),
        urgency: draft.urgency
      }, { skipGlobalLoading: true });
    }
    emit('changed');
  } catch (e) {
    assocError.value = e?.response?.data?.error?.message || 'Could not save changes';
    console.error(e);
  }
}

function onAssocChange() {
  saveCore().then(async () => {
    await loadMemberPool();
    await reloadCollaborators();
  });
}

function onInlineListCreated(list) {
  emit('list-created', list);
}

async function saveStatus() {
  try {
    if (draft.status === 'completed' && props.item.status !== 'completed') {
      emit('complete', props.item);
    } else if (draft.status !== 'completed' && props.item.status === 'completed') {
      emit('incomplete', props.item);
    } else if (draft.status === 'waiting' || draft.status === 'in_progress') {
      await api.put(`/me/tasks/${props.item.id}`, { status: draft.status }, { skipGlobalLoading: true });
      emit('changed');
    }
  } catch (e) {
    console.error(e);
  }
}

async function saveAssignee() {
  if (isActionItem.value) return;
  assigneeError.value = '';
  try {
    const userId = assigneeUserId.value ? parseInt(assigneeUserId.value, 10) : null;
    await api.put(`/me/tasks/${props.item.id}/assignees`, { userId }, { skipGlobalLoading: true });
    if (userId && collaboratorIds.value.includes(String(userId))) {
      collaboratorIds.value = collaboratorIds.value.filter((id) => id !== String(userId));
      await saveCollaborators();
    }
    emit('changed');
  } catch (e) {
    assigneeError.value = e?.response?.data?.error?.message || 'Could not update assignee';
  }
}

function toggleCollaborator(userId, ev) {
  const id = String(userId);
  const on = !!ev?.target?.checked;
  const next = new Set(collaboratorIds.value);
  if (on) next.add(id);
  else next.delete(id);
  collaboratorIds.value = [...next];
  saveCollaborators();
}

async function saveCollaborators() {
  if (isActionItem.value || !showCollaborators.value) return;
  collaboratorError.value = '';
  try {
    await api.put(`/me/tasks/${props.item.id}/collaborators`, {
      userIds: collaboratorIds.value.map((n) => parseInt(n, 10)).filter((n) => n > 0)
    }, { skipGlobalLoading: true });
    emit('changed');
  } catch (e) {
    collaboratorError.value = e?.response?.data?.error?.message || 'Could not update collaborators';
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

async function removeAttachment(a) {
  try {
    await api.delete(`/me/tasks/${props.item.id}/attachments/${a.id}`, { skipGlobalLoading: true });
    await loadExtras();
    emit('changed');
  } catch (e) {
    console.error(e);
  }
}

async function addLink() {
  const url = newLinkUrl.value.trim();
  if (!url || isActionItem.value) return;
  try {
    await api.post(`/me/tasks/${props.item.id}/links`, { url }, { skipGlobalLoading: true });
    newLinkUrl.value = '';
    await loadExtras();
    emit('changed');
  } catch (e) {
    console.error(e);
  }
}

async function removeLink(l) {
  try {
    await api.delete(`/me/tasks/${props.item.id}/links/${l.id}`, { skipGlobalLoading: true });
    await loadExtras();
    emit('changed');
  } catch (e) {
    console.error(e);
  }
}

function onCommentInput() {
  const m = /(^|\s)@([a-zA-Z]*)$/.exec(newComment.value);
  if (!m) {
    mentionSuggestions.value = [];
    return;
  }
  const q = m[2].toLowerCase();
  mentionSuggestions.value = (props.agencyUsers || [])
    .filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      return !q || name.includes(q);
    })
    .slice(0, 6);
}

function insertMention(u) {
  const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  newComment.value = newComment.value.replace(/(^|\s)@([a-zA-Z]*)$/, `$1@[${name}](${u.id}) `);
  mentionSuggestions.value = [];
}

async function postComment() {
  const body = newComment.value.trim();
  if (!body || isActionItem.value) return;
  postingComment.value = true;
  commentError.value = '';
  try {
    await api.post(`/me/tasks/${props.item.id}/comments`, { body }, { skipGlobalLoading: true });
    newComment.value = '';
    await loadExtras();
  } catch (e) {
    commentError.value = e?.response?.data?.error?.message || 'Could not post comment';
  } finally {
    postingComment.value = false;
  }
}

async function persistSubtasks() {
  if (isActionItem.value) return;
  try {
    await api.put(`/me/tasks/${props.item.id}`, {
      subtasks: localSubtasks.value
    }, { skipGlobalLoading: true });
    emit('changed');
  } catch (e) {
    console.error(e);
  }
}

function addSubtask() {
  const title = newSubtask.value.trim();
  if (!title) return;
  localSubtasks.value = [...localSubtasks.value, { title, done: false }];
  newSubtask.value = '';
  persistSubtasks();
}

function toggleSubtask(i) {
  localSubtasks.value = localSubtasks.value.map((s, idx) =>
    idx === i ? { ...s, done: !s.done } : s
  );
  persistSubtasks();
}

function removeSubtask(i) {
  localSubtasks.value = localSubtasks.value.filter((_, idx) => idx !== i);
  persistSubtasks();
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
  width: 400px;
  flex: 0 0 400px;
  max-width: 100%;
  height: calc(100vh - 140px);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -4px 0 24px rgba(15, 23, 42, 0.06);
  font-size: 13px;
}
.side-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
}
.side-panel__tabs { display: flex; gap: 2px; }
.side-panel__tabs button {
  border: 0;
  background: transparent;
  padding: 5px 8px;
  font-size: 11px;
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
  font-size: 12px;
}
.side-panel__body {
  padding: 12px 14px 20px;
  overflow-y: auto;
  flex: 1;
}
.side-panel__title {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 700;
  color: #14532d;
  line-height: 1.3;
}
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
.chip {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  text-transform: capitalize;
}
.chip--private { background: #fef3c7; color: #92400e; }
.prio-high { background: #fee2e2; color: #b91c1c; }
.prio-medium { background: #ffedd5; color: #c2410c; }
.field { display: block; margin-bottom: 10px; }
.field > span {
  display: block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #94a3b8;
  margin-bottom: 3px;
}
.form-control {
  width: 100%;
  padding: 6px 9px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
}
.hint { font-size: 11px; color: #94a3b8; }
.collaborator-hint { margin: 0 0 6px; }
.error { font-size: 11px; color: #b91c1c; margin-top: 4px; }
.assignee-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.assignee-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  cursor: pointer;
  background: #fff;
}
.assignee-chip.on {
  background: #ecfdf5;
  border-color: #86efac;
  color: #14532d;
}
.assignee-chip input { margin: 0; }
.assoc-box {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 10px;
  padding: 8px;
  margin-bottom: 10px;
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
  font-size: 12px;
  margin: 10px 0;
  cursor: pointer;
}
.block { margin: 12px 0; }
.block__head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 12px;
}
.simple-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12px;
}
.simple-list li {
  padding: 5px 0;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}
.simple-list.comments li { flex-direction: column; gap: 2px; }
.attach-row { align-items: center; }
.attach-link { color: #166534; font-weight: 600; word-break: break-all; }
.muted { color: #94a3b8; }
.link-add { display: flex; gap: 6px; margin-top: 6px; }
.btn-x {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: #94a3b8;
  flex: 0 0 auto;
}
.comment-compose { position: relative; margin-top: 6px; }
.mention-menu {
  position: absolute;
  left: 0;
  right: 48px;
  bottom: 100%;
  list-style: none;
  margin: 0 0 4px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  z-index: 5;
}
.mention-menu li {
  padding: 6px 8px;
  cursor: pointer;
  border: 0;
  font-size: 12px;
}
.mention-menu li:hover { background: #f0fdf4; }
.comment-body :deep(.mention) {
  color: #166534;
  font-weight: 700;
  background: #ecfdf5;
  border-radius: 4px;
  padding: 0 3px;
}
.subtask-disclaimer {
  font-size: 12px;
  color: #64748b;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 10px;
  margin: 0 0 10px;
  line-height: 1.4;
}
.subtask-list li { align-items: center; }
.subtask-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  cursor: pointer;
}
.subtask-row .done { text-decoration: line-through; color: #94a3b8; }
/* Waiting notice block */
.waiting-notice {
  display: flex;
  gap: 10px;
  background: #faf5ff;
  border: 1px solid #e9d5ff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.waiting-notice__icon { font-size: 18px; flex-shrink: 0; line-height: 1.3; }
.waiting-notice__body { flex: 1; min-width: 0; }
.waiting-notice__body strong { color: #7e22ce; font-size: 13px; display: block; margin-bottom: 4px; }
.waiting-notice__body p { font-size: 12px; color: #6b21a8; margin: 0 0 6px; }
.blockers-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.blockers-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #334155;
}
.blocker-status { font-size: 13px; width: 14px; text-align: center; color: #94a3b8; }
.blocker--done .blocker-status { color: #16a34a; }
.blocker--done { text-decoration: line-through; color: #94a3b8; }

.meta-foot {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 12px;
}
.side-panel__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}
.side-panel__state { padding: 24px; text-align: center; color: #64748b; }

.btn-pin {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: #14532d;
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-pin svg { width: 14px; height: 14px; flex-shrink: 0; }
.btn-pin:hover { background: #dcfce7; border-color: #86efac; }

.btn-secondary {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* Footer auto-save indicator */
.meta-foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 16px;
}
.meta-foot__autosave {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #16a34a;
  font-weight: 500;
}
.meta-foot__autosave svg { width: 13px; height: 13px; }
.meta-foot__dates {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #94a3b8;
}
@media (max-width: 1100px) {
  .side-panel { width: 100%; flex-basis: auto; height: auto; max-height: 70vh; }
}
</style>
