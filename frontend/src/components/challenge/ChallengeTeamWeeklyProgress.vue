<template>
  <section class="team-weekly-progress">
    <h2>Team Weekly Progress</h2>
    <div class="week-row">
      <label>Week of</label>
      <input v-model="weekStart" type="date" @change="load" />
      <span v-if="individualMinimum != null" class="hint">Member minimum: {{ individualMinimum }} pts</span>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="teams-stack">
      <article v-for="team in teams" :key="`tw-${team.teamId}`" class="team-card">
        <header class="team-head">
          <h3>{{ team.teamName }}</h3>
          <span class="team-total">{{ team.totalWeeklyPoints }} pts</span>
        </header>
        <div v-if="!team.members?.length" class="empty-hint">No team members yet.</div>
        <div v-else class="members-list">
          <div v-for="m in team.members" :key="`twm-${team.teamId}-${m.userId}`" class="member-row">
            <span class="name">{{ m.firstName }} {{ m.lastName }}</span>
            <span class="status-pill" :class="`status-${m.progressStatus}`">{{ m.progressStatus }}</span>
            <span class="points">{{ m.weeklyPoints }} pts</span>
          </div>
        </div>
      </article>
      <div v-if="!teams.length" class="empty-hint">No teams with tracked points this week yet.</div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true }
});

const weekStart = ref(getThisWeekSunday());
const loading = ref(false);
const teams = ref([]);
const individualMinimum = ref(null);

function getThisWeekSunday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sun = new Date(d);
  sun.setDate(diff);
  return sun.toISOString().slice(0, 10);
}

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/team-weekly-progress`, {
      params: { weekStart: weekStart.value },
      skipGlobalLoading: true
    });
    teams.value = Array.isArray(r.data?.teams) ? r.data.teams : [];
    individualMinimum.value = r.data?.individualMinimum ?? null;
  } catch {
    teams.value = [];
    individualMinimum.value = null;
  } finally {
    loading.value = false;
  }
};

watch(() => props.challengeId, load, { immediate: true });
watch(weekStart, load);
</script>

<style scoped>
.week-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.teams-stack { display: flex; flex-direction: column; gap: 10px; }
.team-card { border: 1px solid #eee; border-radius: 8px; padding: 10px; }
.team-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.team-head h3 { margin: 0; font-size: 0.95rem; }
.team-total { font-size: 0.85rem; font-weight: 600; color: var(--text-muted, #666); }
.members-list { display: flex; flex-direction: column; gap: 6px; }
.member-row { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; font-size: 0.9rem; }
.status-pill { border-radius: 999px; padding: 2px 8px; font-size: 0.75rem; text-transform: uppercase; border: 1px solid #ddd; }
.status-pill.status-behind { background: #ffebee; }
.status-pill.status-met { background: #fff8e1; }
.status-pill.status-ahead { background: #e8f5e9; }
.status-pill.status-tracking { background: #e3f2fd; }
.points { font-weight: 600; color: var(--text-muted, #666); }
.empty-hint, .loading-inline { color: var(--text-muted, #666); padding: 8px 0; }
</style>
