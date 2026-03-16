<template>
  <section class="challenge-scoreboard">
    <h2>Weekly Scoreboard</h2>
    <div class="scoreboard-week-selector">
      <label>Week of</label>
      <input v-model="weekStart" type="date" @change="load" />
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="scoreboard-content">
      <div class="scoreboard-block">
        <h3>Top 5 Athletes</h3>
        <div class="scoreboard-list">
          <div v-for="(r, idx) in (data?.top5Athletes || [])" :key="`a-${r.user_id}`" class="scoreboard-row">
            <span class="rank">#{{ idx + 1 }}</span>
            <span class="name">{{ r.first_name }} {{ r.last_name }}</span>
            <span v-if="r.team_name" class="team">{{ r.team_name }}</span>
            <span class="points">{{ r.total_points }} pts</span>
          </div>
          <div v-if="!data?.top5Athletes?.length" class="empty-hint">No workouts this week yet.</div>
        </div>
      </div>
      <div class="scoreboard-block">
        <h3>Top 5 Teams</h3>
        <div class="scoreboard-list">
          <div v-for="(r, idx) in (data?.top5Teams || [])" :key="`t-${r.team_id}`" class="scoreboard-row">
            <span class="rank">#{{ idx + 1 }}</span>
            <span class="name">{{ r.team_name }}</span>
            <span class="points">{{ r.total_points }} pts</span>
          </div>
          <div v-if="!data?.top5Teams?.length" class="empty-hint">No team workouts this week yet.</div>
        </div>
      </div>
      <div class="scoreboard-block">
        <h3>Top Per Team</h3>
        <div class="scoreboard-list">
          <div v-for="r in (data?.topPerTeam || [])" :key="`p-${r.team_id}-${r.user_id}`" class="scoreboard-row">
            <span class="name">{{ r.first_name }} {{ r.last_name }}</span>
            <span class="team">{{ r.team_name }}</span>
            <span class="points">{{ r.total_points }} pts</span>
          </div>
          <div v-if="!data?.topPerTeam?.length" class="empty-hint">No data yet.</div>
        </div>
      </div>
      <div v-if="Object.keys(data?.recognitionOfTheWeek || {}).length" class="scoreboard-block recognition-block">
        <h3>Recognition of the Week</h3>
        <div class="scoreboard-list">
          <div v-for="(r, key) in (data?.recognitionOfTheWeek || {})" :key="key" class="scoreboard-row">
            <span class="recognition-label">{{ recognitionLabels[key] || key }}</span>
            <span class="name">{{ r.first_name }} {{ r.last_name }}</span>
            <span v-if="r.team_name" class="team">{{ r.team_name }}</span>
            <span class="points">{{ r.total_points }} pts</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true }
});

const emit = defineEmits(['load']);

const recognitionLabels = {
  fastest_male: 'Fastest Male',
  fastest_female: 'Fastest Female',
  fastest_masters_male: 'Fastest Master\'s Male (53+)',
  fastest_masters_female: 'Fastest Master\'s Female (53+)'
};

const weekStart = ref(getThisWeekSunday());
const loading = ref(false);
const data = ref(null);

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
    const r = await api.get(`/learning-program-classes/${props.challengeId}/scoreboard`, {
      params: { week: weekStart.value },
      skipGlobalLoading: true
    });
    data.value = r.data || null;
  } catch {
    data.value = null;
  } finally {
    loading.value = false;
  }
};

watch(() => props.challengeId, load, { immediate: true });
watch(weekStart, load);

defineExpose({ load });
</script>

<style scoped>
.challenge-scoreboard h2 { margin: 0 0 12px 0; font-size: 1.1em; }
.scoreboard-week-selector { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.scoreboard-week-selector input { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; }
.scoreboard-content { display: flex; flex-direction: column; gap: 20px; }
.scoreboard-block h3 { margin: 0 0 8px 0; font-size: 1em; font-weight: 600; color: var(--text-muted, #666); }
.scoreboard-list { display: flex; flex-direction: column; gap: 6px; }
.scoreboard-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #eee; }
.scoreboard-row .rank { font-weight: 700; min-width: 36px; color: var(--primary, #0066cc); }
.scoreboard-row .name { flex: 1; }
.scoreboard-row .team { font-size: 0.9em; color: var(--text-muted, #666); }
.scoreboard-row .points { font-weight: 600; color: var(--text-muted, #666); }
.empty-hint, .loading-inline { padding: 12px; color: var(--text-muted, #666); }
</style>
