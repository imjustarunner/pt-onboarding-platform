<template>
  <section class="challenge-scoreboard">
    <div class="sb-header">
      <span class="sb-icon">📊</span>
      <h2>Team Challenge Rankings</h2>
    </div>
    <div class="scoreboard-week-selector">
      <label class="week-label">Week</label>
      <select v-model="selectedWeekIdx" class="week-select">
        <option v-for="(w, i) in seasonWeeks" :key="w.date" :value="i">{{ w.label }}</option>
        <option v-if="!seasonWeeks.length" :value="0" disabled>No weeks available</option>
      </select>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="scoreboard-content">

      <!-- ── Team Rankings ─────────────────────────────────────── -->
      <div class="scoreboard-block">
        <p class="block-label">🏆 Overall Team Standings</p>
        <div class="scoreboard-list">
          <div
            v-for="(r, idx) in (data?.teamRankings || data?.top5Teams || [])"
            :key="`t-${r.team_id}`"
            class="scoreboard-row"
            :class="rankClass(idx)"
          >
            <span class="rank-badge">{{ rankMedal(idx) }}</span>
            <span class="name team-name-bold">{{ r.team_name }}</span>
            <span class="pts-chip">{{ formatPts(r.total_points) }} pts</span>
          </div>
          <div v-if="!(data?.teamRankings?.length || data?.top5Teams?.length)" class="empty-hint">No team activity this week yet.</div>
        </div>
      </div>

      <!-- ── Top Per Team breakdown ────────────────────────────── -->
      <div v-if="data?.teamBreakdown?.length" class="scoreboard-block">
        <p class="block-label">⭐ Top Performers Per Team</p>
        <div class="team-breakdown-grid">
          <div v-for="team in data.teamBreakdown" :key="`bd-${team.team_id}`" class="team-breakdown-card">
            <div class="tbd-team-name">{{ team.team_name }}</div>

            <!-- Runs -->
            <div v-if="team.runs" class="tbd-category">
              <span class="tbd-cat-label">🏃 Runs</span>
              <div class="tbd-leader-row">
                <UserAvatar
                  :photo-path="team.runs.leader.profile_photo_path"
                  :first-name="team.runs.leader.first_name"
                  :last-name="team.runs.leader.last_name"
                  size="sm"
                />
                <span class="tbd-leader-name">{{ team.runs.leader.first_name }} {{ team.runs.leader.last_name }}</span>
                <span class="tbd-stat">{{ team.runs.leader.miles }} mi</span>
                <span v-if="team.runs.leader.avg_pace" class="tbd-sub">{{ team.runs.leader.avg_pace }}/mi</span>
              </div>
              <div class="tbd-team-agg">
                Team: {{ team.runs.team_total_miles }} mi total
                <span v-if="team.runs.team_avg_pace"> · avg {{ team.runs.team_avg_pace }}/mi</span>
              </div>
            </div>

            <!-- Rucks -->
            <div v-if="team.rucks" class="tbd-category">
              <span class="tbd-cat-label">🎒 Rucks</span>
              <div class="tbd-leader-row">
                <UserAvatar
                  :photo-path="team.rucks.leader.profile_photo_path"
                  :first-name="team.rucks.leader.first_name"
                  :last-name="team.rucks.leader.last_name"
                  size="sm"
                />
                <span class="tbd-leader-name">{{ team.rucks.leader.first_name }} {{ team.rucks.leader.last_name }}</span>
                <span class="tbd-stat">{{ team.rucks.leader.miles }} mi</span>
                <span v-if="team.rucks.leader.avg_pace" class="tbd-sub">{{ team.rucks.leader.avg_pace }}/mi</span>
              </div>
              <div class="tbd-team-agg">
                Team: {{ team.rucks.team_total_miles }} mi total
                <span v-if="team.rucks.team_avg_pace"> · avg {{ team.rucks.team_avg_pace }}/mi</span>
              </div>
            </div>

            <!-- Other (calories) -->
            <div v-if="team.other" class="tbd-category">
              <span class="tbd-cat-label">🔥 Cross-Training</span>
              <div class="tbd-leader-row">
                <UserAvatar
                  :photo-path="team.other.leader.profile_photo_path"
                  :first-name="team.other.leader.first_name"
                  :last-name="team.other.leader.last_name"
                  size="sm"
                />
                <span class="tbd-leader-name">{{ team.other.leader.first_name }} {{ team.other.leader.last_name }}</span>
                <span class="tbd-stat">{{ team.other.leader.calories }} cal</span>
                <span v-if="team.other.leader.avg_hr" class="tbd-sub">{{ team.other.leader.avg_hr }} bpm</span>
              </div>
              <div v-if="team.other.team_avg_hr" class="tbd-team-agg">
                Team avg heart rate: {{ team.other.team_avg_hr }} bpm
              </div>
            </div>

            <div v-if="!team.runs && !team.rucks && !team.other" class="tbd-empty">No activity logged yet.</div>
          </div>
        </div>
      </div>

      <!-- ── Recognition of the Week ───────────────────────────── -->
      <div v-if="normalizedRecognition.length" class="scoreboard-block recognition-block">
        <p class="block-label">🎖️ Recognition of the Week</p>
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
const rankMedal = (idx) => idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
const rankClass  = (idx) => idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : '';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  seasonStartsAt: { type: [String, Date], default: null },
  seasonEndsAt: { type: [String, Date], default: null }
});

const emit = defineEmits(['load']);

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
  { defaultToLatest: false, seasonEndsAtRef: computed(() => props.seasonEndsAt) }
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
.sb-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.sb-icon { font-size: 1.3em; line-height: 1; }
.sb-header h2 { margin: 0; font-size: 1.15em; font-weight: 700; }

.scoreboard-week-selector { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.week-label { font-size: 0.82em; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
.week-select { border: 1px solid #e2e8f0; border-radius: 8px; padding: 5px 12px; font-size: 0.88em; background: #f8fafc; cursor: pointer; font-weight: 500; }

.scoreboard-content { display: flex; flex-direction: column; gap: 24px; }
.block-label { margin: 0 0 10px; font-size: 0.78em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }

/* Overall team rankings */
.scoreboard-list { display: flex; flex-direction: column; gap: 5px; }
.scoreboard-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 10px;
  background: #f8fafc; transition: background 0.15s;
}
.scoreboard-row:hover { background: #f1f5f9; }
.rank-gold   { background: linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%); }
.rank-silver { background: linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%); }
.rank-bronze { background: linear-gradient(90deg, #fff7ed 0%, #ffedd5 100%); }
.rank-badge { font-size: 1.1em; min-width: 28px; text-align: center; line-height: 1; }
.name { flex: 1; font-size: 0.92em; font-weight: 500; }
.team-name-bold { font-weight: 700; font-size: 0.95em; }
.team-tag { font-size: 0.78em; color: #94a3b8; background: #f1f5f9; border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
.pts-chip { font-size: 0.82em; font-weight: 700; color: #fff; background: #e63946; border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
.empty-hint { color: #94a3b8; padding: 8px 0; font-size: 0.9em; }
.loading-inline { color: #94a3b8; padding: 12px 0; }

/* Team breakdown grid */
.team-breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.team-breakdown-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tbd-team-name {
  font-weight: 800;
  font-size: 0.97em;
  color: #1e293b;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 8px;
}

.tbd-category { display: flex; flex-direction: column; gap: 5px; }
.tbd-cat-label { font-size: 0.72em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }

.tbd-leader-row {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  border-radius: 10px;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
}
.tbd-leader-name { flex: 1; font-size: 0.88em; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tbd-stat { font-size: 0.82em; font-weight: 800; color: #e63946; white-space: nowrap; }
.tbd-sub { font-size: 0.75em; color: #64748b; background: #f1f5f9; border-radius: 6px; padding: 1px 6px; white-space: nowrap; }

.tbd-team-agg { font-size: 0.75em; color: #64748b; padding-left: 2px; }
.tbd-empty { font-size: 0.85em; color: #94a3b8; font-style: italic; }

/* Recognition */
.recognition-icon { font-size: 18px; flex-shrink: 0; display: flex; align-items: center; }
.scoreboard-icon-img { width: 24px; height: 24px; object-fit: contain; display: block; }
.recognition-label { font-weight: 600; min-width: 140px; color: var(--text-primary); }
.no-winner { color: #94a3b8; font-style: italic; }
.recognition-ref { font-weight: 400; color: #94a3b8; font-size: 0.92em; }
.recognition-block .scoreboard-row { align-items: flex-start; }
.recognition-winners { display: flex; flex-direction: column; gap: 8px; flex: 1; align-items: flex-start; min-width: 0; }
.recognition-winner-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; }
</style>
