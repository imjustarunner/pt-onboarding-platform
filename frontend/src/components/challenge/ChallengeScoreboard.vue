<template>
  <section class="challenge-scoreboard">
    <h2>Weekly Scoreboard</h2>
    <div class="scoreboard-week-selector">
      <label>Week</label>
      <select v-model="selectedWeekIdx" class="week-select">
        <option v-for="(w, i) in seasonWeeks" :key="w.date" :value="i">{{ w.label }}</option>
        <option v-if="!seasonWeeks.length" :value="0" disabled>No weeks available</option>
      </select>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="scoreboard-content">
      <div class="scoreboard-block">
        <h3>Top 5 Athletes</h3>
        <div class="scoreboard-list">
          <div v-for="(r, idx) in (data?.top5Athletes || [])" :key="`a-${r.user_id}`" class="scoreboard-row">
            <span class="rank">#{{ idx + 1 }}</span>
            <UserAvatar :photo-path="r.profile_photo_path" :first-name="r.first_name" :last-name="r.last_name" size="sm" />
            <span class="name">{{ r.first_name }} {{ r.last_name }}</span>
            <span v-if="r.team_name" class="team">{{ r.team_name }}</span>
            <span class="points">{{ formatPts(r.total_points) }} pts</span>
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
            <span class="points">{{ formatPts(r.total_points) }} pts</span>
          </div>
          <div v-if="!data?.top5Teams?.length" class="empty-hint">No team workouts this week yet.</div>
        </div>
      </div>
      <div class="scoreboard-block">
        <h3>Top Per Team</h3>
        <div class="scoreboard-list">
          <div v-for="r in (data?.topPerTeam || [])" :key="`p-${r.team_id}-${r.user_id}`" class="scoreboard-row">
            <UserAvatar :photo-path="r.profile_photo_path" :first-name="r.first_name" :last-name="r.last_name" size="sm" />
            <span class="name">{{ r.first_name }} {{ r.last_name }}</span>
            <span class="team">{{ r.team_name }}</span>
            <span class="points">{{ formatPts(r.total_points) }} pts</span>
          </div>
          <div v-if="!data?.topPerTeam?.length" class="empty-hint">No data yet.</div>
        </div>
      </div>
      <div v-if="normalizedRecognition.length" class="scoreboard-block recognition-block">
        <h3>Recognition of the Week</h3>
        <div class="scoreboard-list">
          <div v-for="entry in normalizedRecognition" :key="entry.categoryId || entry.label" class="scoreboard-row">
            <span v-if="entry.icon && String(entry.icon).startsWith('icon:')" class="recognition-icon">
              <img :src="resolveScoreboardIconUrl(entry.icon)" class="scoreboard-icon-img" alt="" />
            </span>
            <span v-else-if="entry.icon" class="recognition-icon">{{ entry.icon }}</span>
            <span class="recognition-label">
              {{ entry.label }}
              <template v-if="entry.referenceTarget != null">
                <span class="recognition-ref"> · ref. {{ entry.referenceTarget }} {{ metricUnit(entry.metric) }}</span>
              </template>
            </span>
            <div v-if="entry.winners && entry.winners.length" class="recognition-winners">
              <div v-for="w in entry.winners" :key="w.user_id" class="recognition-winner-line">
                <UserAvatar :photo-path="w.profile_photo_path" :first-name="w.first_name" :last-name="w.last_name" size="sm" />
                <span class="name">{{ w.first_name }} {{ w.last_name }}</span>
                <span v-if="w.team_name" class="team">{{ w.team_name }}</span>
                <span class="points">{{ w.value }} {{ metricUnit(entry.metric) }}</span>
              </div>
            </div>
            <template v-else-if="entry.winner">
              <UserAvatar :photo-path="entry.winner.profile_photo_path" :first-name="entry.winner.first_name" :last-name="entry.winner.last_name" size="sm" />
              <span class="name">{{ entry.winner.first_name }} {{ entry.winner.last_name }}</span>
              <span v-if="entry.winner.team_name" class="team">{{ entry.winner.team_name }}</span>
              <span class="points">{{ entry.winner.value }} {{ metricUnit(entry.metric) }}</span>
            </template>
            <span v-else class="no-winner">—</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { useSeasonWeeks } from '../../composables/useSeasonWeeks.js';

const formatPts = (v) => parseFloat(Number(v || 0).toFixed(2));

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  seasonStartsAt: { type: [String, Date], default: null }
});

const emit = defineEmits(['load']);

// Normalize recognitionOfTheWeek to array regardless of backend format (old keyed-object or new array).
const LEGACY_LABELS = {
  fastest_male: 'Fastest Male',
  fastest_female: 'Fastest Female',
  fastest_masters_male: "Fastest Master's Male",
  fastest_masters_female: "Fastest Master's Female"
};

const normalizedRecognition = computed(() => {
  const raw = data.value?.recognitionOfTheWeek;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // Legacy keyed-object: convert to array
  return Object.entries(raw).map(([key, r]) => ({
    categoryId: key,
    label: LEGACY_LABELS[key] || key,
    metric: 'points',
    winner: r ? { first_name: r.first_name, last_name: r.last_name, team_name: r.team_name, value: r.total_points } : null
  }));
});

function metricUnit(metric) {
  const map = { points: 'pts', distance_miles: 'mi', duration_minutes: 'min', activities_count: 'activities' };
  return map[metric] || 'pts';
}

const scoreboardIconCache = ref({});
function resolveScoreboardIconUrl(iconRef) {
  if (!iconRef || !String(iconRef).startsWith('icon:')) return null;
  const id = parseInt(String(iconRef).replace('icon:', ''), 10);
  if (!id) return null;
  if (scoreboardIconCache.value[id]) return scoreboardIconCache.value[id];
  api.get(`/icons/${id}`).then(({ data }) => {
    if (data?.url) scoreboardIconCache.value[id] = data.url;
  }).catch(() => {});
  return null;
}

const { seasonWeeks, selectedWeekIdx, weekStartDate } = useSeasonWeeks(
  computed(() => props.seasonStartsAt),
  { defaultToLatest: false }
);

const loading = ref(false);
const data = ref(null);

const load = async () => {
  if (!props.challengeId || !weekStartDate.value) return;
  loading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/scoreboard`, {
      params: { week: weekStartDate.value },
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
watch(weekStartDate, load);

defineExpose({ load });
</script>

<style scoped>
.challenge-scoreboard h2 { margin: 0 0 12px 0; font-size: 1.1em; }
.scoreboard-week-selector { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.week-select { border: 1px solid #e2e8f0; border-radius: 8px; padding: 5px 10px; font-size: 0.88em; background: #fff; cursor: pointer; }
.scoreboard-content { display: flex; flex-direction: column; gap: 20px; }
.scoreboard-block h3 { margin: 0 0 8px 0; font-size: 1em; font-weight: 600; color: var(--text-muted, #666); }
.scoreboard-list { display: flex; flex-direction: column; gap: 6px; }
.scoreboard-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #eee; }
.scoreboard-row .rank { font-weight: 700; min-width: 36px; color: var(--primary, #0066cc); }
.scoreboard-row .name { flex: 1; }
.scoreboard-row .team { font-size: 0.9em; color: var(--text-muted, #666); }
.scoreboard-row .points { font-weight: 600; color: var(--text-muted, #666); }
.empty-hint, .loading-inline { padding: 12px; color: var(--text-muted, #666); }
.scoreboard-row .recognition-icon { font-size: 18px; flex-shrink: 0; display: flex; align-items: center; }
.scoreboard-icon-img { width: 24px; height: 24px; object-fit: contain; display: block; }
.scoreboard-row .recognition-label { font-weight: 600; min-width: 140px; color: var(--text-primary); }
.no-winner { color: var(--text-muted, #999); font-style: italic; }
.recognition-ref { font-weight: 400; color: var(--text-muted, #888); font-size: 0.92em; }
.recognition-block .scoreboard-row { align-items: flex-start; }
.recognition-winners { display: flex; flex-direction: column; gap: 8px; flex: 1; align-items: flex-start; min-width: 0; }
.recognition-winner-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; }
</style>
