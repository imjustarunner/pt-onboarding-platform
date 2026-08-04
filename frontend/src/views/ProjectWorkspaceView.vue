<template>
  <div class="project-workspace">
    <header class="project-workspace__top">
      <button type="button" class="back-btn" @click="goBack">← Back to Tasks</button>
      <div class="project-workspace__title">
        <h1>{{ project?.name || 'Project' }}</h1>
        <p class="muted">{{ project?.description || '' }}</p>
      </div>
      <div class="members">
        <span
          v-for="m in (overview?.members || []).slice(0, 4)"
          :key="m.user_id || m.id"
          class="avatar"
          :title="`${m.first_name} ${m.last_name}`"
        >
          {{ initials(m) }}
        </span>
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

    <div v-if="loading" class="state">Loading project…</div>
    <template v-else>
      <div v-if="tab === 'overview'" class="overview-grid">
        <div class="kpis">
          <div class="kpi"><strong>{{ overview?.progress_pct || 0 }}%</strong><span>Progress</span></div>
          <div class="kpi"><strong>{{ overview?.total_task_count || 0 }}</strong><span>Tasks</span></div>
          <div class="kpi"><strong>{{ overview?.open_action_item_count || 0 }}</strong><span>Action items</span></div>
          <div class="kpi"><strong>{{ overview?.list_count || 0 }}</strong><span>Shared lists</span></div>
          <div class="kpi"><strong>{{ overview?.document_count || 0 }}</strong><span>Documents</span></div>
        </div>
        <div class="two-col">
          <section>
            <h3>Shared lists</h3>
            <ul>
              <li v-for="l in overview?.lists || []" :key="l.id">
                <strong>{{ l.name }}</strong>
                <span>{{ l.open_task_count || 0 }} open / {{ l.total_task_count || 0 }}</span>
              </li>
            </ul>
          </section>
          <section>
            <h3>Quick actions</h3>
            <div class="quick">
              <button type="button" class="btn btn-secondary btn-sm" @click="tab = 'tasks'">View tasks</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="tab = 'lists'">Manage lists</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="tab = 'documents'">Documents</button>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="tab === 'tasks'">
        <div v-if="!tasks.length" class="state">No visible tasks in this project</div>
        <ul v-else class="task-ul">
          <li v-for="t in tasks" :key="t.id">
            <strong>{{ t.title }}</strong>
            <span class="muted">{{ t.task_list_name || '—' }} · {{ t.status }}</span>
          </li>
        </ul>
      </div>

      <div v-else-if="tab === 'lists'">
        <ul class="task-ul">
          <li v-for="l in overview?.lists || []" :key="l.id">
            <strong>{{ l.name }}</strong>
            <span class="muted">{{ l.open_task_count || 0 }} open</span>
          </li>
          <li v-if="!(overview?.lists || []).length" class="muted">No shared lists linked</li>
        </ul>
        <div class="attach-row">
          <select v-model="attachListId" class="form-control">
            <option value="">Attach a shared list…</option>
            <option v-for="l in availableLists" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
          </select>
          <button type="button" class="btn btn-primary btn-sm" :disabled="!attachListId" @click="attachList">
            Attach
          </button>
        </div>
      </div>

      <div v-else-if="tab === 'documents'" class="state">
        {{ overview?.document_count || 0 }} document(s) linked via project tasks. Open a task from Tasks to manage attachments.
      </div>

      <div v-else-if="tab === 'activity'" class="state">
        Activity feed will expand here as tasks and documents change.
      </div>

      <div v-else class="state">Whiteboard coming soon</div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
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
const project = ref(null);
const overview = ref(null);
const tasks = ref([]);
const availableLists = ref([]);
const attachListId = ref('');
const tab = ref('overview');

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'lists', label: 'Lists' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
  { id: 'whiteboard', label: 'Whiteboard' }
];

function initials(m) {
  return `${(m.first_name || '?')[0]}${(m.last_name || '')[0] || ''}`.toUpperCase();
}

function goBack() {
  router.push(`${orgPrefix.value}/tasks`);
}

async function load() {
  loading.value = true;
  try {
    const [{ data }, tasksRes, listsRes] = await Promise.all([
      api.get(`/task-projects/${projectId.value}`, { skipGlobalLoading: true }),
      api.get(`/task-projects/${projectId.value}/tasks`, { skipGlobalLoading: true }),
      api.get('/task-lists', { skipGlobalLoading: true })
    ]);
    project.value = data;
    overview.value = data?.overview || null;
    tasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    availableLists.value = Array.isArray(listsRes.data) ? listsRes.data : [];
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
    await load();
  } catch (e) {
    console.error(e);
  }
}

onMounted(load);
</script>

<style scoped>
.project-workspace {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 20px 40px;
}
.project-workspace__top {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}
.back-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.project-workspace__title { flex: 1; }
h1 { margin: 0; font-size: 1.5rem; color: #14532d; }
.muted { color: #64748b; font-size: 13px; }
.members { display: flex; gap: 4px; }
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #dcfce7;
  color: #14532d;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.project-workspace__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 16px;
}
.project-workspace__tabs button {
  border: 0;
  background: transparent;
  padding: 10px 12px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.project-workspace__tabs button.active {
  color: #14532d;
  border-bottom-color: #14532d;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}
.kpi {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
}
.kpi strong { display: block; font-size: 1.3rem; }
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.task-ul { list-style: none; margin: 0; padding: 0; }
.task-ul li {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}
.attach-row { display: flex; gap: 8px; margin-top: 12px; }
.form-control {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.quick { display: flex; flex-wrap: wrap; gap: 8px; }
.state { padding: 24px; text-align: center; color: #64748b; }
@media (max-width: 800px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .two-col { grid-template-columns: 1fr; }
  .project-workspace__top { flex-wrap: wrap; }
}
</style>
