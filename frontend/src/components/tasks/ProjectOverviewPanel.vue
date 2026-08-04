<template>
  <section class="project-overview">
    <header class="project-overview__head">
      <div>
        <p class="eyebrow">Project overview</p>
        <h2>{{ project?.name || 'Project' }}</h2>
        <p class="muted">{{ project?.description || 'No description' }}</p>
        <p v-if="overview?.due_date" class="due">Due {{ formatDate(overview.due_date) }}</p>
      </div>
      <div class="project-overview__actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('edit')">Edit</button>
        <button type="button" class="btn btn-primary btn-sm" @click="$emit('open-project', project.id)">
          Open Project
        </button>
        <button type="button" class="btn btn-ghost btn-sm" @click="$emit('close')">Back</button>
      </div>
    </header>

    <div v-if="loading" class="state">Loading overview…</div>
    <template v-else-if="overview">
      <div class="kpis">
        <div class="kpi">
          <strong>{{ overview.progress_pct || 0 }}%</strong>
          <span>Progress</span>
          <small>{{ overview.completed_task_count || 0 }} of {{ overview.total_task_count || 0 }} tasks</small>
        </div>
        <div class="kpi">
          <strong>{{ overview.open_task_count || 0 }}</strong>
          <span>Open tasks</span>
        </div>
        <div class="kpi">
          <strong>{{ overview.open_action_item_count || 0 }}</strong>
          <span>Action items</span>
        </div>
        <div class="kpi">
          <strong>{{ overview.list_count || 0 }}</strong>
          <span>Shared lists</span>
        </div>
        <div class="kpi">
          <strong>{{ overview.document_count || 0 }}</strong>
          <span>Documents</span>
        </div>
      </div>

      <div class="cols">
        <div>
          <h3>Shared lists</h3>
          <ul>
            <li v-for="l in overview.lists || []" :key="l.id">
              <strong>{{ l.name }}</strong>
              <span class="muted">{{ l.open_task_count || 0 }} open</span>
            </li>
            <li v-if="!(overview.lists || []).length" class="muted">No lists linked yet</li>
          </ul>
        </div>
        <div>
          <h3>Members</h3>
          <ul>
            <li v-for="m in overview.members || []" :key="m.user_id || m.id">
              {{ m.first_name }} {{ m.last_name }}
              <span class="muted">{{ m.role }}</span>
            </li>
            <li v-if="!(overview.members || []).length" class="muted">No members</li>
          </ul>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  project: { type: Object, required: true },
  agencyId: { type: Number, default: null }
});

defineEmits(['close', 'open-project', 'edit']);

const loading = ref(false);
const overview = ref(null);

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function load() {
  if (!props.project?.id) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/task-projects/${props.project.id}`, {
      params: { agencyId: props.agencyId || undefined },
      skipGlobalLoading: true
    });
    overview.value = { ...(data?.overview || {}), due_date: data?.due_date };
  } catch {
    overview.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.project?.id, load, { immediate: true });
</script>

<style scoped>
.project-overview {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}
.project-overview__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.project-overview__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
}
h2 { margin: 4px 0; }
.muted { color: #64748b; font-size: 13px; }
.due { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: #0f766e; }
.kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}
.kpi {
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
}
.kpi strong { display: block; font-size: 1.25rem; color: #14532d; }
.kpi span { font-size: 12px; font-weight: 600; color: #475569; }
.kpi small { display: block; font-size: 11px; color: #94a3b8; }
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
h3 { margin: 0 0 8px; font-size: 14px; color: #14532d; }
ul { list-style: none; margin: 0; padding: 0; }
li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}
.state { padding: 20px; text-align: center; color: #64748b; }
@media (max-width: 900px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .cols { grid-template-columns: 1fr; }
}
</style>
