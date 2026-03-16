<template>
  <section class="challenge-weekly-tasks">
    <h2>Weekly Challenges</h2>
    <div class="tasks-week-selector">
      <label>Week of</label>
      <input v-model="weekStart" type="date" @change="load" />
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="tasks-content">
      <div v-if="tasks.length" class="tasks-list">
        <div v-for="t in tasks" :key="t.id" class="task-card">
          <h4>{{ t.name }}</h4>
          <p v-if="t.description" class="task-desc">{{ t.description }}</p>
          <div v-if="getAssignmentForTask(t.id)" class="task-assignment">
            <span class="assignee">{{ assigneeName(getAssignmentForTask(t.id)) }}</span>
            <span v-if="getAssignmentForTask(t.id).is_completed" class="badge-done">Done</span>
            <button
              v-else-if="isMyAssignment(getAssignmentForTask(t.id))"
              type="button"
              class="btn btn-primary btn-sm"
              @click="openCompleteModal(getAssignmentForTask(t.id))"
            >
              Mark complete
            </button>
          </div>
          <div v-else class="task-unassigned">Not assigned</div>
        </div>
      </div>
      <div v-else class="empty-hint">No weekly challenges set for this week. Program Manager can add them.</div>
    </div>

    <div v-if="showCompleteModal" class="modal-overlay" @click.self="showCompleteModal = false">
      <div class="modal-content">
        <h3>Mark Challenge Complete</h3>
        <p v-if="completingAssignment">{{ completingAssignment.task_name }}</p>
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea v-model="completeNotes" rows="3" placeholder="Add any notes or proof..." />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" @click="showCompleteModal = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="completing" @click="submitComplete">
            {{ completing ? 'Saving…' : 'Mark complete' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  myUserId: { type: [String, Number], default: null }
});

const weekStart = ref(getThisWeekSunday());
const loading = ref(false);
const tasks = ref([]);
const assignments = ref([]);
const showCompleteModal = ref(false);
const completingAssignment = ref(null);
const completeNotes = ref('');
const completing = ref(false);

function getThisWeekSunday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sun = new Date(d);
  sun.setDate(diff);
  return sun.toISOString().slice(0, 10);
}

const getAssignmentForTask = (taskId) => assignments.value.find((a) => Number(a.task_id) === Number(taskId));
const assigneeName = (a) => (a ? `${a.provider_first_name || ''} ${a.provider_last_name || ''}`.trim() || '—' : '—');
const isMyAssignment = (a) => a && Number(a.provider_user_id) === Number(props.myUserId);

const openCompleteModal = (a) => {
  completingAssignment.value = a;
  completeNotes.value = '';
  showCompleteModal.value = true;
};

const submitComplete = async () => {
  if (!completingAssignment.value || !props.challengeId) return;
  completing.value = true;
  try {
    await api.post(
      `/learning-program-classes/${props.challengeId}/weekly-assignments/${completingAssignment.value.id}/complete`,
      { notes: completeNotes.value }
    );
    showCompleteModal.value = false;
    completingAssignment.value = null;
    await load();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to mark complete');
  } finally {
    completing.value = false;
  }
};

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const [tasksRes, assignRes] = await Promise.all([
      api.get(`/learning-program-classes/${props.challengeId}/weekly-tasks`, {
        params: { week: weekStart.value },
        skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}/weekly-assignments`, {
        params: { week: weekStart.value },
        skipGlobalLoading: true
      })
    ]);
    tasks.value = Array.isArray(tasksRes.data?.tasks) ? tasksRes.data.tasks : [];
    assignments.value = Array.isArray(assignRes.data?.assignments) ? assignRes.data.assignments : [];
  } catch {
    tasks.value = [];
    assignments.value = [];
  } finally {
    loading.value = false;
  }
};

watch(() => props.challengeId, load, { immediate: true });
watch(weekStart, load);

defineExpose({ load });
</script>

<style scoped>
.challenge-weekly-tasks h2 { margin: 0 0 12px 0; font-size: 1.1em; }
.tasks-week-selector { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.tasks-week-selector input { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; }
.tasks-list { display: flex; flex-direction: column; gap: 12px; }
.task-card { padding: 12px; border: 1px solid #eee; border-radius: 8px; }
.task-card h4 { margin: 0 0 4px 0; font-size: 1em; }
.task-desc { margin: 4px 0 8px 0; font-size: 0.9em; color: var(--text-muted, #666); }
.task-assignment { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge-done { background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; }
.task-unassigned { font-size: 0.9em; color: var(--text-muted, #666); }
.empty-hint, .loading-inline { padding: 12px; color: var(--text-muted, #666); }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: #fff; border-radius: 8px; padding: 24px; min-width: 320px; }
.modal-content .form-group { margin-bottom: 16px; }
.modal-content textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
.form-actions { display: flex; gap: 12px; margin-top: 16px; }
</style>
