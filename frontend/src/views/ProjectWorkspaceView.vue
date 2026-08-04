<template>
  <div class="project-workspace">
    <header class="project-workspace__hero">
      <div class="project-workspace__hero-inner">
        <button type="button" class="back-btn" @click="goBack">← Back to Tasks</button>
        <div class="project-workspace__title-block">
          <p class="eyebrow">Project workspace</p>
          <h1>{{ project?.name || 'Project' }}</h1>
          <p v-if="project?.description" class="subtitle">{{ project.description }}</p>
          <p v-if="project?.due_date" class="due-chip">Due {{ formatDate(project.due_date) }}</p>
        </div>
        <div class="project-workspace__hero-actions">
          <div class="members">
            <span
              v-for="m in (overview?.members || []).slice(0, 5)"
              :key="m.user_id || m.id"
              class="avatar"
              :title="`${m.first_name} ${m.last_name}`"
            >
              {{ initials(m) }}
            </span>
          </div>
          <button type="button" class="btn-edit" @click="showEdit = true">Edit</button>
        </div>
      </div>
    </header>

    <nav class="project-workspace__tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <main class="project-workspace__content">
      <div v-if="loading" class="state">Loading project…</div>
      <template v-else>
        <div v-if="tab === 'overview'" class="overview-grid">
          <div class="kpis">
            <div class="kpi">
              <strong>{{ overview?.progress_pct || 0 }}%</strong>
              <span>Progress</span>
            </div>
            <div class="kpi">
              <strong>{{ overview?.total_task_count || 0 }}</strong>
              <span>Tasks</span>
            </div>
            <div class="kpi">
              <strong>{{ overview?.open_action_item_count || 0 }}</strong>
              <span>Action items</span>
            </div>
            <div class="kpi">
              <strong>{{ overview?.list_count || 0 }}</strong>
              <span>Shared lists</span>
            </div>
            <div class="kpi">
              <strong>{{ overview?.document_count || 0 }}</strong>
              <span>Documents</span>
            </div>
          </div>
          <div class="panels">
            <section class="panel">
              <h3>Shared lists</h3>
              <ul class="card-list">
                <li v-for="l in overview?.lists || []" :key="l.id">
                  <strong>{{ l.name }}</strong>
                  <span>{{ l.open_task_count || 0 }} open / {{ l.total_task_count || 0 }}</span>
                </li>
                <li v-if="!(overview?.lists || []).length" class="empty">No lists linked yet</li>
              </ul>
            </section>
            <section class="panel">
              <h3>Quick actions</h3>
              <div class="quick">
                <button type="button" class="quick-btn" @click="tab = 'tasks'">View tasks</button>
                <button type="button" class="quick-btn" @click="tab = 'lists'">Manage lists</button>
                <button type="button" class="quick-btn" @click="showEdit = true">Edit project</button>
              </div>
            </section>
          </div>
        </div>

        <div v-else-if="tab === 'tasks'" class="panel panel--full">
          <div v-if="!tasks.length" class="state">No visible tasks in this project</div>
          <ul v-else class="task-ul">
            <li v-for="t in tasks" :key="t.id">
              <div>
                <strong>{{ t.title }}</strong>
                <span class="muted">{{ t.task_list_name || '—' }}</span>
              </div>
              <span class="status-pill" :class="`status-pill--${t.status}`">{{ t.status }}</span>
            </li>
          </ul>
        </div>

        <div v-else-if="tab === 'lists'" class="panel panel--full">
          <ul class="task-ul">
            <li v-for="l in overview?.lists || []" :key="l.id">
              <strong>{{ l.name }}</strong>
              <div class="row-actions">
                <span class="muted">{{ l.open_task_count || 0 }} open</span>
                <button type="button" class="btn-x" @click="detachList(l.id)">Detach</button>
              </div>
            </li>
            <li v-if="!(overview?.lists || []).length" class="empty">No shared lists linked</li>
          </ul>
          <div class="attach-row">
            <input
              v-model="listAttachSearch"
              type="search"
              class="form-control"
              placeholder="Search lists to attach…"
            />
            <select v-model="attachListId" class="form-control">
              <option value="">Attach a shared list…</option>
              <option v-for="l in filteredAvailableLists" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
            </select>
            <button type="button" class="btn-primary" :disabled="!attachListId" @click="attachList">
              Attach
            </button>
          </div>
        </div>

        <div v-else-if="tab === 'documents'" class="state panel">
          {{ overview?.document_count || 0 }} document(s) linked via project tasks. Open a task from Tasks to manage attachments.
        </div>

        <div v-else-if="tab === 'activity'" class="state panel">
          Activity feed will expand here as tasks and documents change.
        </div>

        <div v-else class="state panel">Whiteboard coming soon</div>
      </template>
    </main>

    <div v-if="showEdit" class="edit-overlay" @click.self="showEdit = false">
      <div class="edit-sheet">
        <header class="edit-sheet__head">
          <h2>Edit project</h2>
          <button type="button" class="btn-x" @click="showEdit = false">✕</button>
        </header>
        <label class="field">
          <span>Name</span>
          <input v-model="editForm.name" class="form-control" type="text" />
        </label>
        <label class="field">
          <span>Description</span>
          <textarea v-model="editForm.description" class="form-control" rows="3" />
        </label>
        <label class="field">
          <span>Due date</span>
          <input v-model="editForm.dueDate" class="form-control" type="date" />
        </label>
        <div class="field">
          <span>Members</span>
          <div class="pick-box">
            <label v-for="u in agencyUsers" :key="u.id" class="pick-row">
              <input v-model="editForm.memberIds" type="checkbox" :value="u.id" />
              {{ u.first_name }} {{ u.last_name }}
            </label>
          </div>
        </div>
        <div class="field">
          <span>Shared lists</span>
          <div class="pick-box">
            <label v-for="l in allLists" :key="l.id" class="pick-row">
              <input v-model="editForm.listIds" type="checkbox" :value="l.id" />
              {{ l.name }}
            </label>
          </div>
        </div>
        <div class="field">
          <span>Add tasks & action items</span>
          <div class="pick-box">
            <label v-for="t in unattachedTasks" :key="`t-${t.id}`" class="pick-row">
              <input v-model="editForm.taskIds" type="checkbox" :value="t.id" />
              {{ t.title }}
            </label>
            <label v-for="a in unattachedActions" :key="`a-${a.id}`" class="pick-row">
              <input v-model="editForm.actionIds" type="checkbox" :value="a.id" />
              {{ a.title }}
            </label>
          </div>
        </div>
        <div class="edit-sheet__actions">
          <button type="button" class="btn-primary" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
          <button type="button" class="btn-ghost" @click="showEdit = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const router = useRouter();

const projectId = computed(() => parseInt(route.params.projectId, 10));
const orgPrefix = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? `/${slug}` : '';
});

const loading = ref(true);
const saving = ref(false);
const showEdit = ref(false);
const project = ref(null);
const overview = ref(null);
const tasks = ref([]);
const allLists = ref([]);
const agencyUsers = ref([]);
const unattachedTasks = ref([]);
const unattachedActions = ref([]);
const attachListId = ref('');
const listAttachSearch = ref('');
const tab = ref('overview');

const editForm = reactive({
  name: '',
  description: '',
  dueDate: '',
  memberIds: [],
  listIds: [],
  taskIds: [],
  actionIds: [],
  existingMemberIds: [],
  existingListIds: []
});

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'lists', label: 'Lists' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
  { id: 'whiteboard', label: 'Whiteboard' }
];

const attachedListIds = computed(() => new Set((overview.value?.lists || []).map((l) => Number(l.id))));

const filteredAvailableLists = computed(() => {
  const q = listAttachSearch.value.trim().toLowerCase();
  return (allLists.value || []).filter((l) => {
    if (attachedListIds.value.has(Number(l.id))) return false;
    if (!q) return true;
    return String(l.name || '').toLowerCase().includes(q);
  });
});

function initials(m) {
  return `${(m.first_name || '?')[0]}${(m.last_name || '')[0] || ''}`.toUpperCase();
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function goBack() {
  router.push(`${orgPrefix.value}/tasks`);
}

function syncEditForm() {
  editForm.name = project.value?.name || '';
  editForm.description = project.value?.description || '';
  editForm.dueDate = project.value?.due_date ? String(project.value.due_date).slice(0, 10) : '';
  editForm.existingMemberIds = (overview.value?.members || []).map((m) => Number(m.user_id));
  editForm.existingListIds = (overview.value?.lists || []).map((l) => Number(l.id));
  editForm.memberIds = [...editForm.existingMemberIds];
  editForm.listIds = [...editForm.existingListIds];
  editForm.taskIds = [];
  editForm.actionIds = [];
}

async function loadAux() {
  const agencyId = project.value?.agency_id;
  if (!agencyId) return;
  try {
    const [usersRes, listsRes, tasksRes, actionsRes] = await Promise.all([
      api.get(`/agencies/${agencyId}/users`, { skipGlobalLoading: true }),
      api.get('/task-lists', { skipGlobalLoading: true }),
      api.get('/tasks', {
        params: { view: 'assigned', agencyId, unassignedFromProject: '1', limit: 100 },
        skipGlobalLoading: true
      }),
      api.get('/task-action-items', {
        params: { agencyId, unassignedFromProject: '1' },
        skipGlobalLoading: true
      })
    ]);
    agencyUsers.value = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []);
    allLists.value = Array.isArray(listsRes.data) ? listsRes.data : [];
    unattachedTasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    unattachedActions.value = Array.isArray(actionsRes.data) ? actionsRes.data : [];
  } catch {
    /* ignore */
  }
}

async function load() {
  loading.value = true;
  try {
    const [{ data }, tasksRes] = await Promise.all([
      api.get(`/task-projects/${projectId.value}`, { skipGlobalLoading: true }),
      api.get(`/task-projects/${projectId.value}/tasks`, { skipGlobalLoading: true })
    ]);
    project.value = data;
    overview.value = data?.overview || null;
    tasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    syncEditForm();
    await loadAux();
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function attachList() {
  if (!attachListId.value) return;
  try {
    await api.post(`/task-projects/${projectId.value}/lists`, {
      taskListId: Number(attachListId.value)
    }, { skipGlobalLoading: true });
    attachListId.value = '';
    listAttachSearch.value = '';
    await load();
  } catch (e) {
    console.error(e);
  }
}

async function detachList(listId) {
  try {
    await api.delete(`/task-projects/${projectId.value}/lists/${listId}`, { skipGlobalLoading: true });
    await load();
  } catch (e) {
    console.error(e);
  }
}

async function saveEdit() {
  saving.value = true;
  try {
    await api.put(`/task-projects/${projectId.value}`, {
      name: editForm.name.trim(),
      description: editForm.description || null,
      dueDate: editForm.dueDate || null
    }, { skipGlobalLoading: true });
    const toAddMembers = editForm.memberIds.filter((id) => !editForm.existingMemberIds.includes(Number(id)));
    await Promise.all(
      toAddMembers.map((uid) =>
        api.post(`/task-projects/${projectId.value}/members`, { userId: Number(uid), role: 'editor' }, { skipGlobalLoading: true })
      )
    );
    const toAddLists = editForm.listIds.filter((id) => !editForm.existingListIds.includes(Number(id)));
    await Promise.all(
      toAddLists.map((lid) =>
        api.post(`/task-projects/${projectId.value}/lists`, { taskListId: Number(lid) }, { skipGlobalLoading: true })
      )
    );
    await Promise.all([
      ...editForm.taskIds.map((tid) =>
        api.put(`/me/tasks/${tid}`, { project_id: projectId.value }, { skipGlobalLoading: true })
      ),
      ...editForm.actionIds.map((aid) =>
        api.put(`/task-action-items/${aid}`, { projectId: projectId.value }, { skipGlobalLoading: true })
      )
    ]);
    showEdit.value = false;
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.project-workspace {
  min-height: calc(100vh - 120px);
  background: linear-gradient(180deg, #f0fdf4 0%, #f8fafc 28%, #f1f5f9 100%);
  margin: -16px -20px 0;
  padding: 0 0 48px;
}
.project-workspace__hero {
  background: linear-gradient(135deg, #14532d 0%, #166534 55%, #15803d 100%);
  color: #fff;
  padding: 20px 24px 24px;
  box-shadow: 0 8px 32px rgba(20, 83, 45, 0.25);
}
.project-workspace__hero-inner {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}
.back-btn {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.project-workspace__title-block { flex: 1; min-width: 200px; }
.eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.85;
}
h1 {
  margin: 4px 0 6px;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 800;
}
.subtitle {
  margin: 0;
  opacity: 0.9;
  font-size: 14px;
  max-width: 640px;
}
.due-chip {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 12px;
  font-weight: 700;
}
.project-workspace__hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.members { display: flex; gap: 4px; }
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.4);
}
.btn-edit {
  border: 0;
  background: #fff;
  color: #14532d;
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.project-workspace__tabs {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 2;
}
.project-workspace__tabs button {
  border: 0;
  background: transparent;
  padding: 12px 14px;
  font-weight: 700;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.project-workspace__tabs button.active {
  color: #14532d;
  border-bottom-color: #14532d;
}
.project-workspace__content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px 24px;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.kpi {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
}
.kpi strong {
  display: block;
  font-size: 1.5rem;
  color: #14532d;
}
.kpi span {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}
.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
}
.panel--full { grid-column: 1 / -1; }
.panel h3 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #14532d;
}
.card-list,
.task-ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.card-list li,
.task-ul li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
}
.empty { color: #94a3b8; font-style: italic; }
.muted { display: block; font-size: 12px; color: #94a3b8; }
.status-pill {
  font-size: 11px;
  font-weight: 700;
  text-transform: capitalize;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}
.status-pill--completed { background: #dcfce7; color: #166534; }
.quick { display: flex; flex-wrap: wrap; gap: 8px; }
.quick-btn {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  color: #14532d;
  cursor: pointer;
}
.quick-btn:hover { background: #f0fdf4; border-color: #bbf7d0; }
.attach-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  margin-top: 16px;
}
.form-control {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font: inherit;
  background: #fff;
}
.btn-primary {
  border: 0;
  background: #166534;
  color: #fff;
  border-radius: 10px;
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-x {
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 12px;
}
.row-actions { display: flex; align-items: center; gap: 10px; }
.state {
  padding: 40px 24px;
  text-align: center;
  color: #64748b;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
}
.edit-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}
.edit-sheet {
  width: min(440px, 100%);
  height: 100%;
  background: #fff;
  padding: 20px;
  overflow-y: auto;
  box-shadow: -8px 0 40px rgba(15, 23, 42, 0.15);
}
.edit-sheet__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.edit-sheet__head h2 { margin: 0; font-size: 1.2rem; color: #14532d; }
.field { display: block; margin-bottom: 14px; }
.field > span {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 4px;
}
.pick-box {
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
}
.pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 4px 0;
}
.edit-sheet__actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
}
.btn-ghost {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
}
@media (max-width: 900px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .panels { grid-template-columns: 1fr; }
  .attach-row { grid-template-columns: 1fr; }
  .project-workspace { margin: -8px -12px 0; }
}
</style>
