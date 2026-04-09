<template>
  <section class="team-weekly-progress">
    <div class="twp-header">
      <span class="twp-icon">📅</span>
      <h2>Team Weekly Progress</h2>
    </div>
    <div class="week-row">
      <label class="week-label">Week</label>
      <select v-model="selectedWeekIdx" class="week-select" @change="load">
        <option v-for="(w, i) in seasonWeeks" :key="`sw-${i}`" :value="i">
          Week {{ i + 1 }} ({{ w.label }})
        </option>
      </select>
      <span v-if="individualMinimum != null" class="min-badge">Min {{ individualMinimum }} {{ metricUnit }}/member</span>
      <span v-if="teamMinimum != null" class="min-badge">Team min {{ teamMinimum }} {{ metricUnit }}</span>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="teams-stack">
      <article
        v-for="team in teams"
        :key="`tw-${team.teamId}`"
        class="team-card"
        :class="teamCardClass(team)"
      >
        <header class="team-head">
          <h3>{{ team.teamName }}</h3>
          <span class="team-total-chip">
            {{ metricUnit === 'mi' ? Number(team.totalWeeklyMiles || 0).toFixed(2) : team.totalWeeklyPoints }} {{ metricUnit }}
          </span>
        </header>
        <div v-if="!team.members?.length" class="empty-hint">No team members yet.</div>
        <div v-else class="members-list">
          <div v-for="m in team.members" :key="`twm-${team.teamId}-${m.userId}`" class="member-row">
            <span class="member-name">{{ m.firstName }} {{ m.lastName }}</span>
            <div class="progress-bar-wrap">
              <div class="progress-bar" :style="progressStyle(m)" />
            </div>
            <span class="member-pts">
              {{ metricUnit === 'mi' ? Number(m.weeklyMiles || 0).toFixed(2) : m.weeklyPoints }} {{ metricUnit }}
            </span>
            <span class="status-pill" :class="`status-${m.progressStatus}`">{{ statusLabel(m.progressStatus) }}</span>
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
  seasonStartsAt: { type: [String, Date], default: null },
  seasonEndsAt: { type: [String, Date], default: null }
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
  const rawEnd = props.seasonEndsAt;
  const upperBound = rawEnd ? new Date(rawEnd) : today;
  upperBound.setHours(23, 59, 59, 999);
  let cur = new Date(anchor);
  while (cur <= upperBound) {
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

// Default to the week that contains today; fall back to last week if season has ended
watch(seasonWeeks, (weeks) => {
  if (!weeks.length) return;
  const today = new Date().toISOString().slice(0, 10);
  const idx = weeks.findIndex((w, i) => {
    const nextStart = weeks[i + 1]?.date;
    return today >= w.date && (!nextStart || today < nextStart);
  });
  selectedWeekIdx.value = idx >= 0 ? idx : weeks.length - 1;
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

const statusLabel = (s) => ({ ahead: '✓ Ahead', met: '✓ Met', tracking: '▶ On track', behind: '⚠ Behind' }[s] || s);

const teamCardClass = (team) => {
  const statuses = (team.members || []).map((m) => m.progressStatus);
  if (statuses.every((s) => s === 'ahead')) return 'card-all-ahead';
  if (statuses.some((s) => s === 'behind')) return 'card-has-behind';
  return '';
};

const progressStyle = (m) => {
  const val    = metricUnit.value === 'mi' ? Number(m.weeklyMiles || 0) : Number(m.weeklyPoints || 0);
  const target = individualMinimum.value ?? 0;
  const pct    = target > 0 ? Math.min((val / target) * 100, 100) : (val > 0 ? 100 : 0);
  const color  = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return { width: `${pct}%`, background: color };
};
</script>

<style scoped>
.twp-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.twp-icon { font-size: 1.3em; line-height: 1; }
.twp-header h2 { margin: 0; font-size: 1.15em; font-weight: 700; }

.week-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.week-label { font-size: 0.82em; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
.week-select { border: 1px solid #e2e8f0; border-radius: 8px; padding: 5px 12px; font-size: 0.88em; background: #f8fafc; cursor: pointer; font-weight: 500; }
.min-badge { font-size: 0.75em; background: #f1f5f9; border-radius: 999px; padding: 3px 10px; color: #64748b; font-weight: 600; }

.teams-stack { display: flex; flex-direction: column; gap: 10px; }

.team-card {
  border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;
  border-left: 4px solid #e2e8f0; transition: border-color 0.2s;
}
.card-all-ahead { border-left-color: #22c55e; }
.card-has-behind { border-left-color: #ef4444; }

.team-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.team-head h3 { margin: 0; font-size: 0.95rem; font-weight: 700; }
.team-total-chip {
  font-size: 0.82em; font-weight: 700; color: #fff;
  background: #334155; border-radius: 999px; padding: 3px 10px;
}

.members-list { display: flex; flex-direction: column; gap: 8px; }
.member-row { display: grid; grid-template-columns: 130px 1fr auto auto; gap: 8px; align-items: center; font-size: 0.88rem; }
.member-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.progress-bar-wrap {
  height: 6px; background: #f1f5f9; border-radius: 999px; overflow: hidden;
}
.progress-bar { height: 100%; border-radius: 999px; transition: width 0.4s ease; min-width: 2px; }

.member-pts { font-weight: 700; font-size: 0.82em; color: #475569; white-space: nowrap; }

.status-pill {
  border-radius: 999px; padding: 2px 9px; font-size: 0.72rem;
  font-weight: 700; white-space: nowrap;
}
.status-pill.status-behind  { background: #fee2e2; color: #b91c1c; }
.status-pill.status-met     { background: #dcfce7; color: #15803d; }
.status-pill.status-ahead   { background: #dcfce7; color: #15803d; }
.status-pill.status-tracking { background: #dbeafe; color: #1d4ed8; }

.empty-hint  { color: #94a3b8; padding: 8px 0; font-size: 0.9em; }
.loading-inline { color: #94a3b8; padding: 12px 0; }
</style>
