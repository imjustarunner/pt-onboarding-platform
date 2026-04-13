<template>
  <section id="section-weekly-goals" class="swtd-tracker">
    <div class="swtd-header">
      <span class="swtd-icon" aria-hidden="true">🎯</span>
      <div class="swtd-titles">
        <h2>{{ headerTitle }}</h2>
        <p class="swtd-sub">{{ headerSubtitle }}</p>
      </div>
    </div>

    <div class="swtd-week-row">
      <label class="swtd-label" for="swtd-week-select">Week</label>
      <select id="swtd-week-select" v-model="selectedWeekIdx" class="swtd-select" @change="load">
        <option v-for="(w, i) in seasonWeeks" :key="`sw-${i}`" :value="i">
          Week {{ i + 1 }} ({{ w.label }})
        </option>
      </select>
      <template v-if="isMiles">
        <span v-if="individualMinimum != null && individualMinimum > 0" class="swtd-chip">
          Each: {{ fmtNum(individualMinimum) }} mi
        </span>
        <span v-if="baselineRosterSize != null && baselineRosterSize > 0" class="swtd-chip swtd-chip--muted">
          Plan roster: {{ baselineRosterSize }}
        </span>
        <span v-if="groupWeeklyTarget != null && groupWeeklyTarget > 0" class="swtd-chip">
          Team target: {{ fmtNum(groupWeeklyTarget) }} mi
        </span>
        <span v-if="paceDayNumber != null && paceDayNumber > 0" class="swtd-chip swtd-chip--muted">
          Day {{ paceDayNumber }}/7
        </span>
        <span
          v-if="individualRequiredPerSegment != null && individualRequiredPerSegment > 0"
          class="swtd-chip swtd-chip--muted"
        >
          ~{{ fmtNum(individualRequiredPerSegment) }} mi/day each
        </span>
      </template>
      <template v-else>
        <span v-if="individualMinimum != null" class="swtd-chip">Min {{ individualMinimum }} {{ metricUnit }}/member</span>
        <span v-if="groupWeeklyTarget != null && groupWeeklyTarget > 0" class="swtd-chip">
          Team target: {{ fmtNum(groupWeeklyTarget) }} {{ metricUnit }}
        </span>
        <span v-else-if="teamMinimum != null" class="swtd-chip">Team min {{ teamMinimum }} {{ metricUnit }}</span>
      </template>
    </div>

    <div v-if="teams.length > 1" class="swtd-sort-row">
      <label class="swtd-label" for="swtd-sort">Sort teams</label>
      <select id="swtd-sort" v-model="teamSortKey" class="swtd-select swtd-select--narrow">
        <option value="name">Name (A–Z)</option>
        <option value="progress">Progress (low → high)</option>
        <option value="status">Status (needs attention first)</option>
      </select>
    </div>

    <div v-if="loading" class="swtd-loading">Loading…</div>
    <div v-else class="swtd-teams">
      <article
        v-for="(team, tIdx) in sortedTeams"
        :key="`swtd-${team.teamId}`"
        class="swtd-team"
        :style="teamBorderStyle(tIdx)"
      >
        <div class="swtd-team-card">
          <div class="swtd-team-card-head">
            <div class="swtd-team-card-head-left">
              <h3 class="swtd-team-title">{{ team.teamName }}</h3>
              <p v-if="baselineRosterSize != null" class="swtd-team-roster-line">
                <span class="swtd-team-roster-strong">Active {{ activeMemberCount(team) }}</span>
                <span class="swtd-team-roster-muted"> / {{ baselineRosterSize }} plan roster</span>
              </p>
            </div>
            <button
              type="button"
              class="swtd-show-more-btn"
              :aria-expanded="isExpanded(team.teamId)"
              @click="toggleTeam(team.teamId)"
            >
              {{ isExpanded(team.teamId) ? 'Show less' : 'Show more' }}
            </button>
          </div>

          <div v-if="hasPlannedGroupTarget(team)" class="swtd-team-card-progress">
            <div class="swtd-team-card-progress-top">
              <span class="swtd-team-fraction">
                {{ fmtNum(teamTotalMetric(team)) }} / {{ fmtNum(teamPlannedTarget(team)) }} {{ metricUnit }}
              </span>
              <span
                class="swtd-pill swtd-pill--sm"
                :class="`swtd-pill--${team.teamProgressStatus || 'tracking'}`"
              >
                {{ statusLabel(team.teamProgressStatus || 'tracking') }}
              </span>
            </div>
            <div class="swtd-team-card-bar" aria-hidden="true">
              <span
                class="swtd-team-card-bar-fill"
                :style="teamBarStyle(teamTotalMetric(team), teamPlannedTarget(team))"
              />
            </div>
          </div>
          <div v-else class="swtd-team-card-progress swtd-team-card-progress--na">
            <span class="swtd-team-na">No group target configured for this week.</span>
            <span
              class="swtd-pill swtd-pill--sm swtd-pill--tracking"
            >—</span>
          </div>
        </div>

        <div v-show="isExpanded(team.teamId)" class="swtd-team-body">
          <p v-if="hasPlannedGroupTarget(team)" class="swtd-team-hint">
            Team total vs plan roster target ({{ baselineRosterSize ?? '—' }} × {{ fmtNum(individualMinimum || 0) }} {{ isMiles ? 'mi' : metricUnit }}).
            Status reflects the lowest pace among active members and the team total.
          </p>
          <div v-if="!team.members?.length" class="swtd-empty">No members listed.</div>
          <ul v-else class="swtd-member-list">
            <li
              v-for="m in sortedMemberRows(team)"
              :key="`swtdm-${team.teamId}-${m.userId}`"
              class="swtd-member-row"
              :class="{ 'swtd-member-row--eliminated': m.eliminated }"
            >
              <span class="swtd-member-name">
                <span v-if="m.eliminated" class="swtd-skull" title="Eliminated">☠</span>
                {{ m.firstName }} {{ m.lastName }}
              </span>
              <span class="swtd-member-bar-wrap">
                <span class="swtd-member-bar" :style="progressStyle(m)" />
              </span>
              <span class="swtd-member-val">
                {{ isMiles ? fmtNum(m.weeklyMiles || 0) : fmtNum(m.weeklyPoints) }} {{ metricUnit }}
              </span>
              <span
                v-if="m.eliminated"
                class="swtd-pill swtd-pill--sm swtd-pill--eliminated swtd-member-pill"
              >☠ Out</span>
              <span
                v-else
                class="swtd-pill swtd-pill--sm swtd-member-pill"
                :class="`swtd-pill--${m.progressStatus}`"
              >{{ statusLabel(m.progressStatus) }}</span>
            </li>
          </ul>
        </div>
      </article>
      <p v-if="!teams.length" class="swtd-empty">No teams yet for this season.</p>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import { getWeekStartDate, getWeekDateTimeRange } from '../../utils/challengeWeekUtils.js';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  seasonStartsAt: { type: [String, Date], default: null },
  seasonEndsAt: { type: [String, Date], default: null },
  weekCutoffTime: { type: String, default: '00:00' },
  weekTimeZone: { type: String, default: 'UTC' },
  /** When the parent reloads the class (e.g. after saving season settings), this changes and we refetch targets. */
  challengeUpdatedAt: { type: [String, Number], default: null }
});

const emit = defineEmits(['week-boundary']);

const loading = ref(false);
const teams = ref([]);
const individualMinimum = ref(null);
const teamMinimum = ref(null);
const teamBaselineMiles = ref(null);
const groupWeeklyTarget = ref(null);
const baselineRosterSize = ref(null);
const paceDayNumber = ref(null);
const individualRequiredPerSegment = ref(null);
const teamRequiredPerSegment = ref(null);
const metricUnit = ref('pts');
const selectedWeekIdx = ref(0);
const teamSortKey = ref('name');
/** teamId -> expanded; default collapsed for compact compare view */
const expandedByTeamId = ref({});

const isMiles = computed(() => metricUnit.value === 'mi');

const headerTitle = computed(() => 'Weekly goals');
const headerSubtitle = computed(() =>
  isMiles.value
    ? 'Miles for run/ruck seasons. Team target = per-person minimum × planned roster (Manage season → Teams). Pace uses calendar days 1–7. Use Show more for individuals.'
    : 'Weekly points vs individual and team targets. Use Show more to see each person on the roster.'
);

const seasonWeeks = computed(() => {
  const cutoff = String(props.weekCutoffTime || '00:00').trim() || '00:00';
  const tz = String(props.weekTimeZone || 'UTC').trim() || 'UTC';
  const rawStart = props.seasonStartsAt;
  const rawEnd = props.seasonEndsAt;

  let cur = getWeekStartDate(rawStart ? new Date(rawStart) : new Date(), cutoff, tz);
  if (!cur) cur = getWeekStartDate(new Date(), cutoff, tz);
  if (!cur) return [];

  const todayWeek = getWeekStartDate(new Date(), cutoff, tz) || cur;
  const endWeek = rawEnd ? getWeekStartDate(new Date(rawEnd), cutoff, tz) : todayWeek;
  const maxWeek = !endWeek || String(endWeek) > String(todayWeek) ? todayWeek : endWeek;

  const weeks = [];
  let guard = 0;
  while (cur && guard++ < 520) {
    if (String(cur) > String(maxWeek)) break;
    const range = getWeekDateTimeRange(cur, cutoff, tz);
    if (!range?.end) break;
    const endLabel = new Date(range.end.replace(' ', 'T') + 'Z');
    const label = `${fmtDate(cur)} – ${fmtDate(endLabel)}`;
    weeks.push({ date: cur, label });
    const nextStart = getWeekStartDate(new Date(range.end.replace(' ', 'T') + 'Z'), cutoff, tz);
    if (!nextStart || nextStart === cur) break;
    cur = nextStart;
  }
  return weeks;
});

const fmtDate = (d) => {
  const dt = typeof d === 'string' ? new Date(`${d}T12:00:00Z`) : d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const fmtNum = (v) => Number(Number(v || 0).toFixed(2));

watch(seasonWeeks, (weeks) => {
  if (!weeks.length) return;
  const cutoff = String(props.weekCutoffTime || '00:00').trim() || '00:00';
  const tz = String(props.weekTimeZone || 'UTC').trim() || 'UTC';
  const todayWeek = getWeekStartDate(new Date(), cutoff, tz);
  let idx = weeks.findIndex((w) => w.date === todayWeek);
  if (idx < 0) idx = weeks.length - 1;
  selectedWeekIdx.value = idx;
}, { immediate: true });

const weekStart = computed(() => seasonWeeks.value[selectedWeekIdx.value]?.date || null);

const teamPlannedTarget = (team) => {
  const v =
    team?.teamMilesTargetPlanned ??
    team?.teamPointsTargetPlanned ??
    team?.teamMilesRequired ??
    groupWeeklyTarget.value ??
    null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const hasPlannedGroupTarget = (team) => teamPlannedTarget(team) != null;

const teamTotalMetric = (team) =>
  metricUnit.value === 'mi' ? Number(team?.totalWeeklyMiles || 0) : Number(team?.totalWeeklyPoints || 0);

const statusRank = (s) => {
  const x = String(s || 'tracking').toLowerCase();
  if (x === 'behind') return 0;
  if (x === 'tracking') return 1;
  if (x === 'met') return 2;
  if (x === 'ahead') return 3;
  return 1;
};

const sortedTeams = computed(() => {
  const list = [...(teams.value || [])];
  const target = (team) => teamPlannedTarget(team) || 0;
  const pct = (team) => {
    const t = Number(target(team));
    const m = teamTotalMetric(team);
    if (t <= 0) return m > 0 ? 100 : 0;
    return (m / t) * 100;
  };
  if (teamSortKey.value === 'progress') {
    list.sort((a, b) => pct(a) - pct(b) || String(a.teamName || '').localeCompare(String(b.teamName || '')));
  } else if (teamSortKey.value === 'status') {
    list.sort(
      (a, b) =>
        statusRank(a.teamProgressStatus) - statusRank(b.teamProgressStatus) ||
        String(a.teamName || '').localeCompare(String(b.teamName || ''))
    );
  } else {
    list.sort((a, b) => String(a.teamName || '').localeCompare(String(b.teamName || '')));
  }
  return list;
});

const load = async () => {
  if (!props.challengeId || !weekStart.value) return;
  loading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/team-weekly-progress`, {
      params: { weekStart: weekStart.value },
      skipGlobalLoading: true
    });
    teams.value = Array.isArray(r.data?.teams) ? r.data.teams : [];
    expandedByTeamId.value = {};
    individualMinimum.value = r.data?.individualMinimum ?? null;
    teamMinimum.value = r.data?.teamMinimum ?? null;
    teamBaselineMiles.value = r.data?.teamMilesMinimumBaseline ?? r.data?.teamMinimum ?? null;
    groupWeeklyTarget.value =
      r.data?.groupWeeklyTarget ?? r.data?.teamMilesMinimumBaseline ?? r.data?.teamMinimum ?? null;
    baselineRosterSize.value = r.data?.baselineRosterSize ?? null;
    paceDayNumber.value = r.data?.paceDayNumber ?? null;
    individualRequiredPerSegment.value = r.data?.individualRequiredPerSegment ?? null;
    teamRequiredPerSegment.value = r.data?.teamRequiredPerSegment ?? null;
    metricUnit.value = String(r.data?.metricUnit || 'pts');
    const serverWeek = r.data?.weekStartDate ? String(r.data.weekStartDate).slice(0, 10) : weekStart.value;
    if (serverWeek) emit('week-boundary', serverWeek);
  } catch {
    teams.value = [];
    expandedByTeamId.value = {};
    individualMinimum.value = null;
    teamMinimum.value = null;
    teamBaselineMiles.value = null;
    groupWeeklyTarget.value = null;
    baselineRosterSize.value = null;
    paceDayNumber.value = null;
    individualRequiredPerSegment.value = null;
    teamRequiredPerSegment.value = null;
    metricUnit.value = 'pts';
  } finally {
    loading.value = false;
  }
};

watch(() => props.challengeId, load, { immediate: true });
watch(weekStart, load);
watch(
  () => [props.weekCutoffTime, props.weekTimeZone, props.seasonStartsAt, props.seasonEndsAt],
  () => {
    if (props.challengeId) load();
  }
);
watch(
  () => props.challengeUpdatedAt,
  () => {
    if (props.challengeId) load();
  }
);

const statusLabel = (s) =>
  ({ ahead: '✓ Ahead', met: '✓ Met', tracking: '▶ On track', behind: '⚠ Behind' }[s] || s);

const teamColors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#3b82f6'];
const teamBorderStyle = (idx) => ({ borderLeftColor: teamColors[idx % teamColors.length] });

const activeMemberCount = (team) => {
  const n = team?.activeMemberCount;
  if (Number.isFinite(n) && n >= 0) return n;
  return (team?.members || []).filter((m) => !m.eliminated).length;
};

const isExpanded = (teamId) => !!expandedByTeamId.value[Number(teamId)];

const toggleTeam = (teamId) => {
  const id = Number(teamId);
  const next = { ...expandedByTeamId.value };
  next[id] = !next[id];
  expandedByTeamId.value = next;
};

const sortedMemberRows = (team) => {
  const arr = [...(team?.members || [])];
  arr.sort((a, b) => {
    if (!!a.eliminated !== !!b.eliminated) return a.eliminated ? 1 : -1;
    const an = `${a.lastName || ''} ${a.firstName || ''}`.trim();
    const bn = `${b.lastName || ''} ${b.firstName || ''}`.trim();
    return an.localeCompare(bn);
  });
  return arr;
};

const progressStyle = (m) => {
  const val = isMiles.value ? Number(m.weeklyMiles || 0) : Number(m.weeklyPoints || 0);
  const target = individualMinimum.value ?? 0;
  const pct = target > 0 ? Math.min((val / target) * 100, 100) : val > 0 ? 100 : 0;
  if (m.eliminated) {
    return { width: `${pct}%`, background: '#94a3b8' };
  }
  const color = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return { width: `${pct}%`, background: color };
};

const teamBarStyle = (miles, required) => {
  const m = Number(miles || 0);
  const r = Number(required || 0);
  const pct = r > 0 ? Math.min((m / r) * 100, 100) : m > 0 ? 100 : 0;
  const color = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return { width: `${pct}%`, background: color };
};
</script>

<style scoped>
.swtd-tracker {
  margin: 0;
}
.swtd-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.swtd-icon {
  font-size: 1.35em;
  line-height: 1;
}
.swtd-titles h2 {
  margin: 0;
  font-size: 1.15em;
  font-weight: 700;
}
.swtd-sub {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.35;
  max-width: 52rem;
}

.swtd-week-row,
.swtd-sort-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.swtd-label {
  font-size: 0.82em;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.swtd-select {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 0.88em;
  background: #f8fafc;
  cursor: pointer;
  font-weight: 500;
}
.swtd-select--narrow {
  min-width: 11rem;
}
.swtd-chip {
  font-size: 0.75em;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  padding: 3px 10px;
  color: #3730a3;
  font-weight: 600;
}
.swtd-chip--muted {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #64748b;
}

.swtd-loading {
  color: #94a3b8;
  padding: 12px 0;
}
.swtd-teams {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.swtd-team {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  border-left: 4px solid #e2e8f0;
  background: #fff;
}

.swtd-team-card {
  padding: 10px 12px 12px;
}
.swtd-team-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.swtd-team-card-head-left {
  min-width: 0;
}
.swtd-team-title {
  margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.2;
}
.swtd-team-roster-line {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.3;
  color: #64748b;
}
.swtd-team-roster-strong {
  font-weight: 700;
  color: #334155;
}
.swtd-team-roster-muted {
  font-weight: 500;
}
.swtd-show-more-btn {
  flex-shrink: 0;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
}
.swtd-show-more-btn:hover {
  background: #e0e7ff;
}
.swtd-team-card-progress {
  margin-top: 2px;
}
.swtd-team-card-progress--na {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.swtd-team-na {
  font-size: 0.78rem;
  color: #94a3b8;
}
.swtd-team-card-progress-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.swtd-team-fraction {
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
}
.swtd-team-card-bar {
  height: 8px;
  background: #f1f5f9;
  border-radius: 999px;
  overflow: hidden;
}
.swtd-team-card-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  min-width: 2px;
  transition: width 0.3s ease;
}

.swtd-team-body {
  padding: 8px 12px 10px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
}
.swtd-team-hint {
  margin: 6px 0 4px;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.3;
}

.swtd-member-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.swtd-member-row {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  min-height: 28px;
  font-size: 0.76rem;
}
.swtd-member-row--eliminated {
  opacity: 0.55;
  color: #64748b;
}
.swtd-skull {
  margin-right: 4px;
}
.swtd-member-name {
  flex: 1 1 30%;
  min-width: 0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.swtd-member-bar-wrap {
  flex: 1 1 0;
  height: 4px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  min-width: 32px;
}
.swtd-member-bar {
  display: block;
  height: 100%;
  border-radius: 999px;
  min-width: 2px;
  transition: width 0.35s ease;
}
.swtd-member-val {
  flex: 0 0 auto;
  font-weight: 600;
  font-size: 0.7rem;
  color: #475569;
  white-space: nowrap;
}
.swtd-member-pill {
  flex: 0 0 auto;
}

.swtd-pill {
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}
.swtd-pill--sm {
  padding: 1px 6px;
  font-size: 0.65rem;
}
.swtd-pill--behind {
  background: #fee2e2;
  color: #b91c1c;
}
.swtd-pill--met,
.swtd-pill--ahead {
  background: #dcfce7;
  color: #15803d;
}
.swtd-pill--tracking {
  background: #dbeafe;
  color: #1d4ed8;
}
.swtd-pill--eliminated {
  background: #e2e8f0;
  color: #475569;
}

.swtd-empty {
  color: #94a3b8;
  padding: 6px 0;
  font-size: 0.82em;
}

@media (max-width: 640px) {
  .swtd-team-card-head {
    flex-direction: column;
    align-items: stretch;
  }
  .swtd-show-more-btn {
    align-self: flex-start;
  }
}
</style>
