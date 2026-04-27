<template>
  <section class="challenge-scoreboard">
    <div class="sb-header">
      <span class="sb-icon">🎯</span>
      <h2>Weekly Challenge Progress</h2>
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

      <!-- ── Weekly Challenge Progress ─────────────────────────────── -->
      <div v-if="tasks.length" class="scoreboard-block">
        <p class="block-label">This Week's Challenges</p>
        <div class="challenge-progress-list">
          <div v-for="task in tasks" :key="task.id" class="cp-card">
            <div class="cp-card-head">
              <span v-if="taskIcon(task)" class="cp-icon">
                <img v-if="isIconRef(task.icon)" :src="resolveTaskIconUrl(task.icon)" class="cp-icon-img" alt="" />
                <template v-else>{{ task.icon }}</template>
              </span>
              <div class="cp-card-title-block">
                <span class="cp-task-name">{{ task.name }}</span>
                <span class="cp-mode-badge" :class="task.mode === 'full_team' ? 'cp-mode--team' : 'cp-mode--individual'">
                  {{ task.mode === 'full_team' ? 'Full Team' : 'Self-Elect' }}
                </span>
              </div>
            </div>

            <!-- Full-team progress: per-team breakdown -->
            <div v-if="task.mode === 'full_team'" class="cp-fullteam">
              <!-- Overall total -->
              <span class="cp-fullteam-count">
                <strong>{{ taggedCount(task.id) }}</strong>
                <span class="cp-of"> of </span>
                <span class="cp-denom">{{ totalRosterSize || '?' }}</span>
                members tagged overall
              </span>
              <div class="cp-fullteam-bar-wrap">
                <div
                  class="cp-fullteam-bar-fill"
                  :style="{ width: totalRosterSize ? `${overallTaggedPct(task.id)}%` : '0%' }"
                />
              </div>
              <!-- Per-team rows (styled like team standings) -->
              <div v-if="teams.length" class="cp-perteam-list">
                <div
                  v-for="team in teams"
                  :key="team.teamId"
                  class="cp-perteam-row"
                  :style="{ borderLeft: `3px solid ${team.teamColor || teamFallbackColor(team.teamId)}` }"
                >
                  <div class="cp-perteam-logo-wrap">
                    <img v-if="team.logoPath" :src="toUploadsUrl(team.logoPath)" class="cp-perteam-logo" alt="" />
                    <span v-else class="cp-perteam-logo-placeholder" :style="{ background: team.teamColor || teamFallbackColor(team.teamId) }">
                      {{ (team.teamName || '?')[0].toUpperCase() }}
                    </span>
                  </div>
                  <span class="cp-perteam-name">{{ team.teamName }}</span>
                  <span class="cp-perteam-stat">
                    <strong>{{ teamTaggedCount(task.id, team.teamId) }}</strong>
                    <span class="cp-of"> / </span>{{ team.memberCount }}
                  </span>
                  <div class="cp-perteam-bar-wrap">
                    <div
                      class="cp-perteam-bar-fill"
                      :style="{
                        width: team.memberCount ? `${Math.min(100, Math.round(teamTaggedCount(task.id, team.teamId) / team.memberCount * 100))}%` : '0%',
                        background: team.teamColor || teamFallbackColor(team.teamId)
                      }"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Individual/self-elect: show assignments per team -->
            <div v-else class="cp-individual-list">
              <div v-if="!taskAssignments(task.id).length" class="cp-no-assigns">
                No one has claimed this challenge yet.
              </div>
              <div
                v-for="a in taskAssignments(task.id)"
                :key="a.assignmentId || a.id"
                class="cp-assign-row"
                :class="{ 'cp-assign-row--done': a.hasTagged }"
              >
                <span class="cp-assign-team">{{ a.teamName }}</span>
                <span class="cp-assign-name">{{ a.firstName }} {{ a.lastName }}</span>
                <span class="cp-assign-status" :class="a.hasTagged ? 'cp-status--done' : 'cp-status--pending'">
                  {{ a.hasTagged ? (a.workoutCount > 1 ? `✓ Tagged (${a.workoutCount} runs)` : '✓ Tagged') : 'Not yet' }}
                </span>
                <span v-if="a.miles" class="cp-assign-metric">{{ a.miles }} mi</span>
              </div>
            </div>
          </div>

          <div v-if="!tasks.length" class="empty-hint">No weekly challenges published for this week.</div>
        </div>
      </div>

      <div v-else-if="!loading" class="empty-hint">No weekly challenges for this week.</div>

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
import { toUploadsUrl } from '../../utils/uploadsUrl.js';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  seasonStartsAt: { type: [String, Date], default: null },
  seasonEndsAt: { type: [String, Date], default: null }
});

const emit = defineEmits(['load']);

// ── Week selector ──────────────────────────────────────────────
const { seasonWeeks, selectedWeekIdx, weekStartDate } = useSeasonWeeks(
  computed(() => props.seasonStartsAt),
  { defaultToLatest: false, seasonEndsAtRef: computed(() => props.seasonEndsAt) }
);

// ── State ──────────────────────────────────────────────────────
const loading = ref(false);
const tasks = ref([]);
const taggedWorkouts = ref([]);   // workouts with weekly_task_id for this week
const assignments = ref([]);      // weekly assignments [{task_id, team_id, provider_user_id, ...}]
const recognitionData = ref(null);
const teams = ref([]);            // [{teamId, teamName, teamColor, memberCount}]

// ── Computed helpers ───────────────────────────────────────────
// Count of distinct users who have tagged each task
const taggedCountMap = computed(() => {
  const map = {};
  for (const w of taggedWorkouts.value) {
    const tid = Number(w.weekly_task_id);
    if (!map[tid]) map[tid] = new Set();
    map[tid].add(Number(w.user_id));
  }
  return map;
});
const taggedCount = (taskId) => taggedCountMap.value[Number(taskId)]?.size || 0;

// Total roster across all teams (for overall denominator)
const totalRosterSize = computed(() => teams.value.reduce((s, t) => s + (t.memberCount || 0), 0));

const overallTaggedPct = (taskId) => {
  const total = totalRosterSize.value;
  if (!total) return 0;
  return Math.min(100, Math.round((taggedCount(taskId) / total) * 100));
};

// Per-team tagged count (distinct users from taggedWorkouts matching team_id)
const teamTaggedByTask = computed(() => {
  const map = {}; // { taskId: { teamId: Set<userId> } }
  for (const w of taggedWorkouts.value) {
    const tid = Number(w.weekly_task_id);
    const teamId = Number(w.team_id);
    if (!map[tid]) map[tid] = {};
    if (!map[tid][teamId]) map[tid][teamId] = new Set();
    map[tid][teamId].add(Number(w.user_id));
  }
  return map;
});
const teamTaggedCount = (taskId, teamId) =>
  teamTaggedByTask.value[Number(taskId)]?.[Number(teamId)]?.size || 0;

const TEAM_PALETTE = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#3b82f6'];
const teamFallbackColor = (teamId) => {
  const idx = teams.value.findIndex((t) => Number(t.teamId) === Number(teamId));
  return TEAM_PALETTE[(idx >= 0 ? idx : 0) % TEAM_PALETTE.length];
};

// Legacy: kept for individual task use
const totalParticipants = computed(() => totalRosterSize.value);

// Assignment rows per task (for individual tasks)
// Sum ALL workouts tagged by this user to this task (e.g. Double Duty = 2 runs)
const taskAssignments = (taskId) => {
  const tidN = Number(taskId);
  const taggedUsers = taggedCountMap.value[tidN] || new Set();
  return assignments.value
    .filter((a) => Number(a.task_id) === tidN)
    .map((a) => {
      const uid = Number(a.provider_user_id);
      const allTagged = taggedWorkouts.value.filter(
        (w) => Number(w.weekly_task_id) === tidN && Number(w.user_id) === uid
      );
      const totalMiles = allTagged.reduce((sum, w) => sum + (w.distance_value != null ? Number(w.distance_value) : 0), 0);
      return {
        assignmentId: a.id,
        teamName: a.team_name || '',
        firstName: a.provider_first_name || a.first_name || '',
        lastName: a.provider_last_name || a.last_name || '',
        hasTagged: taggedUsers.has(uid),
        workoutCount: allTagged.length,
        miles: allTagged.length > 0 ? totalMiles.toFixed(2) : null,
      };
    });
};

// Recognition
const LEGACY_LABELS = {
  fastest_male: 'Fastest Male',
  fastest_female: 'Fastest Female',
  fastest_masters_male: "Fastest Master's Male",
  fastest_masters_female: "Fastest Master's Female"
};
const normalizedRecognition = computed(() => {
  const raw = recognitionData.value;
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
  const map = { points: 'pts', distance_miles: 'mi', duration_minutes: 'min', activities_count: 'activities', challenge_completions: 'challenges' };
  return map[metric] || 'pts';
}

// ── Icons ──────────────────────────────────────────────────────
const scoreboardIconCache = ref({});
const isIconRef = (icon) => typeof icon === 'string' && icon.startsWith('icon:');
function taskIcon(task) { return task.icon || null; }

function resolveTaskIconUrl(iconRef) {
  return resolveIconById(iconRef);
}
function resolveScoreboardIconUrl(iconRef) {
  if (!iconRef || !String(iconRef).startsWith('icon:')) return null;
  return resolveIconById(iconRef);
}
function resolveIconById(iconRef) {
  if (!iconRef || !String(iconRef).startsWith('icon:')) return null;
  const id = parseInt(String(iconRef).replace('icon:', ''), 10);
  if (!id) return null;
  if (scoreboardIconCache.value[id]) return scoreboardIconCache.value[id];
  api.get(`/icons/${id}`).then(({ data }) => {
    if (data?.url) scoreboardIconCache.value[id] = toUploadsUrl(data.url) || data.url;
  }).catch(() => {});
  return null;
}

// ── Load ───────────────────────────────────────────────────────
const load = async () => {
  if (!props.challengeId || !weekStartDate.value) return;
  loading.value = true;
  try {
    const [tasksRes, workoutsRes, assignmentsRes, sbRes, progressRes] = await Promise.allSettled([
      api.get(`/learning-program-classes/${props.challengeId}/weekly-tasks`, {
        params: { week: weekStartDate.value }, skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}/workouts`, {
        params: { week: weekStartDate.value, hasTask: true }, skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}/weekly-assignments`, {
        params: { week: weekStartDate.value }, skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}/scoreboard`, {
        params: { week: weekStartDate.value }, skipGlobalLoading: true
      }),
      api.get(`/learning-program-classes/${props.challengeId}/team-weekly-progress`, {
        params: { weekStart: weekStartDate.value }, skipGlobalLoading: true
      }),
    ]);

    tasks.value = tasksRes.status === 'fulfilled'
      ? (tasksRes.value.data?.tasks || tasksRes.value.data || [])
      : [];
    taggedWorkouts.value = workoutsRes.status === 'fulfilled'
      ? (workoutsRes.value.data?.workouts || [])
      : [];
    assignments.value = assignmentsRes.status === 'fulfilled'
      ? (assignmentsRes.value.data?.assignments || [])
      : [];
    recognitionData.value = sbRes.status === 'fulfilled'
      ? (sbRes.value.data?.recognitionOfTheWeek || null)
      : null;
      // Extract teams with memberCount for per-team breakdown
    if (progressRes.status === 'fulfilled') {
      const rawTeams = progressRes.value.data?.teams || [];
      teams.value = rawTeams.map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        teamColor: t.teamColor || null,
        logoPath: t.logoPath || null,
        memberCount: Array.isArray(t.members) ? t.members.length : 0
      }));
    } else {
      teams.value = [];
    }
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

/* Challenge progress cards */
.challenge-progress-list { display: flex; flex-direction: column; gap: 10px; }
.cp-card {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
}
.cp-card-head { display: flex; align-items: flex-start; gap: 10px; }
.cp-icon { font-size: 1.4em; flex-shrink: 0; line-height: 1; }
.cp-icon-img { width: 28px; height: 28px; object-fit: contain; display: block; }
.cp-card-title-block { display: flex; flex-direction: column; gap: 4px; }
.cp-task-name { font-weight: 700; font-size: 0.95em; color: #1e293b; }
.cp-mode-badge {
  display: inline-block; font-size: 0.66em; font-weight: 700; letter-spacing: 0.05em;
  text-transform: uppercase; border-radius: 999px; padding: 2px 8px; width: fit-content;
}
.cp-mode--team { background: #dbeafe; color: #1e40af; }
.cp-mode--individual { background: #dcfce7; color: #166534; }

/* Full team progress bar */
.cp-fullteam { display: flex; flex-direction: column; gap: 5px; }
.cp-fullteam-bar-wrap { height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
.cp-fullteam-bar-fill { height: 100%; background: #6366f1; border-radius: 999px; transition: width 0.3s ease; min-width: 2px; }

.cp-perteam-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f4f8; }
.cp-perteam-row {
  display: grid;
  grid-template-columns: 32px 1fr auto 80px;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 7px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 3px solid #e2e8f0;
}
.cp-perteam-logo-wrap { width: 28px; height: 28px; flex-shrink: 0; border-radius: 6px; overflow: hidden; }
.cp-perteam-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
.cp-perteam-logo-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; font-weight: 800; color: #fff; border-radius: 6px;
}
.cp-perteam-name { font-size: 0.83em; color: #1e293b; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-perteam-stat { font-size: 0.82em; color: #64748b; white-space: nowrap; text-align: right; }
.cp-perteam-bar-wrap { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.cp-perteam-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
.cp-fullteam-count { font-size: 0.78em; color: #475569; }
.cp-fullteam-count strong { color: #1e293b; font-size: 1.1em; }
.cp-of { color: #94a3b8; }
.cp-denom { color: #64748b; }

/* Individual assignments */
.cp-individual-list { display: flex; flex-direction: column; gap: 5px; }
.cp-no-assigns { font-size: 0.8em; color: #94a3b8; font-style: italic; }
.cp-assign-row {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px;
  font-size: 0.82em;
}
.cp-assign-row--done { border-color: #bbf7d0; background: #f0fdf4; }
.cp-assign-team { color: #94a3b8; font-size: 0.85em; white-space: nowrap; flex-shrink: 0; }
.cp-assign-name { flex: 1; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-assign-status { font-weight: 700; font-size: 0.85em; white-space: nowrap; flex-shrink: 0; }
.cp-status--done { color: #16a34a; }
.cp-status--pending { color: #94a3b8; }
.cp-assign-metric { font-size: 0.82em; color: #e63946; font-weight: 700; white-space: nowrap; flex-shrink: 0; }

/* Scoreboard list (for recognition) */
.scoreboard-list { display: flex; flex-direction: column; gap: 5px; }
.scoreboard-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 10px;
  background: #f8fafc;
}
.recognition-icon { font-size: 18px; flex-shrink: 0; display: flex; align-items: center; }
.scoreboard-icon-img { width: 24px; height: 24px; object-fit: contain; display: block; }
.recognition-label { font-weight: 600; min-width: 140px; color: var(--text-primary); }
.no-winner { color: #94a3b8; font-style: italic; }
.recognition-ref { font-weight: 400; color: #94a3b8; font-size: 0.92em; }
.recognition-block .scoreboard-row { align-items: flex-start; }
.recognition-winners { display: flex; flex-direction: column; gap: 8px; flex: 1; align-items: flex-start; min-width: 0; }
.recognition-winner-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; }
.name { flex: 1; font-size: 0.92em; font-weight: 500; }
.team { font-size: 0.78em; color: #94a3b8; background: #f1f5f9; border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
.points { font-size: 0.82em; font-weight: 700; color: #e63946; }

.empty-hint { color: #94a3b8; padding: 8px 0; font-size: 0.9em; }
.loading-inline { color: #94a3b8; padding: 12px 0; }
</style>
