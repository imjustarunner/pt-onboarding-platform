<template>
  <section class="team-weekly-progress">
    <h2>Team Weekly Progress</h2>
    <div class="week-row">
      <label>Week</label>
      <select v-model="selectedWeekIdx" class="week-select" @change="load">
        <option v-for="(w, i) in seasonWeeks" :key="`sw-${i}`" :value="i">
          Week {{ i + 1 }} ({{ w.label }})
        </option>
      </select>
      <span v-if="individualMinimum != null" class="hint">Member min: {{ individualMinimum }} {{ metricUnit }}</span>
      <span v-if="teamMinimum != null" class="hint">Team min: {{ teamMinimum }} {{ metricUnit }}</span>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="teams-stack">
      <article v-for="team in teams" :key="`tw-${team.teamId}`" class="team-card">
        <header class="team-head">
          <h3>{{ team.teamName }}</h3>
          <span class="team-total">
            {{ metricUnit === 'mi' ? Number(team.totalWeeklyMiles || 0).toFixed(2) : team.totalWeeklyPoints }} {{ metricUnit }}
          </span>
        </header>
        <div v-if="!team.members?.length" class="empty-hint">No team members yet.</div>
        <div v-else class="members-list">
          <div v-for="m in team.members" :key="`twm-${team.teamId}-${m.userId}`" class="member-row">
            <span class="name">{{ m.firstName }} {{ m.lastName }}</span>
            <span class="status-pill" :class="`status-${m.progressStatus}`">{{ m.progressStatus }}</span>
            <span class="points">
              {{ metricUnit === 'mi' ? Number(m.weeklyMiles || 0).toFixed(2) : m.weeklyPoints }} {{ metricUnit }}
            </span>
          </div>
        </div>
      </article>
      <div v-if="!teams.length" class="empty-hint">No teams with tracked points this week yet.</div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  seasonStartsAt: { type: [String, Date], default: null }
});

const loading            = ref(false);
const teams              = ref([]);
const individualMinimum  = ref(null);
const teamMinimum        = ref(null);
const metricUnit         = ref('pts');
const selectedWeekIdx    = ref(0);

/** Build the list of weekly Sunday-start dates from seasonStartsAt up to today. */
const seasonWeeks = computed(() => {
  // Find the first Sunday on or before seasonStartsAt (or use today if not set)
  const raw = props.seasonStartsAt;
  const anchor = raw ? new Date(raw) : new Date();
  // Walk back to Sunday
  const day = anchor.getDay(); // 0=Sun
  anchor.setDate(anchor.getDate() - day);
  anchor.setHours(0, 0, 0, 0);

  const weeks = [];
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let cur = new Date(anchor);
  while (cur <= today) {
    const iso = cur.toISOString().slice(0, 10);
    const nextSun = new Date(cur);
    nextSun.setDate(nextSun.getDate() + 6);
    const label = `${fmtDate(cur)} – ${fmtDate(nextSun)}`;
    weeks.push({ date: iso, label });
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
});

const fmtDate = (d) => {
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Default to the latest (most recent) week
watch(seasonWeeks, (weeks) => {
  if (weeks.length) selectedWeekIdx.value = weeks.length - 1;
}, { immediate: true });

const weekStart = computed(() => seasonWeeks.value[selectedWeekIdx.value]?.date || null);

const load = async () => {
  if (!props.challengeId || !weekStart.value) return;
  loading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/team-weekly-progress`, {
      params: { weekStart: weekStart.value },
      skipGlobalLoading: true
    });
    teams.value          = Array.isArray(r.data?.teams) ? r.data.teams : [];
    individualMinimum.value = r.data?.individualMinimum ?? null;
    teamMinimum.value       = r.data?.teamMinimum ?? null;
    metricUnit.value        = String(r.data?.metricUnit || 'pts');
  } catch {
    teams.value = [];
    individualMinimum.value = null;
    teamMinimum.value       = null;
    metricUnit.value        = 'pts';
  } finally {
    loading.value = false;
  }
};

watch(() => props.challengeId, load, { immediate: true });
watch(weekStart, load);
</script>

<style scoped>
.week-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.week-select {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 5px 10px;
  font-size: 0.88em; background: #fff; cursor: pointer;
}
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
