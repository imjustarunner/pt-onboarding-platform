<template>
  <section class="challenge-leaderboard">
    <div class="lb-header">
      <span class="lb-icon">🏆</span>
      <h2>Leaderboard</h2>
    </div>
    <div class="leaderboard-tabs">
      <button type="button" class="tab-btn" :class="{ active: tab === 'all' }" @click="tab = 'all'">All</button>
      <button type="button" class="tab-btn" :class="{ active: tab === 'individual' }" @click="tab = 'individual'">Individual</button>
      <button type="button" class="tab-btn" :class="{ active: tab === 'team' }" @click="tab = 'team'">Team</button>
    </div>

    <!-- ── ALL tab ────────────────────────────────────────────── -->
    <div v-if="tab === 'all'" class="leaderboard-combined">
      <!-- Top 5 individuals -->
      <div class="leaderboard-block">
        <p class="block-label">Individual <span class="block-label-sub">top 5</span></p>
        <div class="leaderboard-list">
          <div
            v-for="(row, idx) in top5Individual"
            :key="`ind-${row.user_id}`"
            class="leaderboard-row"
            :class="rankClass(idx)"
          >
            <span class="rank-badge">{{ rankMedal(idx) }}</span>
            <UserAvatar :photo-path="row.profile_photo_path" :first-name="row.first_name" :last-name="row.last_name" size="sm" />
            <span class="name">{{ row.first_name }} {{ row.last_name }}</span>
            <span class="pts-chip">
              {{ formatPts(row.total_points) }} pts
              <template v-if="row.total_miles > 0"> · {{ Number(row.total_miles).toFixed(2) }} mi</template>
            </span>
          </div>
          <div v-if="!loading && !top5Individual.length" class="empty-hint">
            No workouts yet — log your first to climb the ranks! 🚀
          </div>
        </div>
        <button v-if="allIndividuals.length > 5" class="lb-see-all-btn" type="button" @click="tab = 'individual'">
          See all {{ allIndividuals.length }} →
        </button>
      </div>

      <!-- All teams -->
      <div class="leaderboard-block">
        <p class="block-label">All Teams</p>
        <div class="leaderboard-list">
          <div
            v-for="(row, idx) in allTeams"
            :key="`team-${row.team_id}`"
            class="leaderboard-row"
            :class="rankClass(idx)"
          >
            <span class="rank-badge">{{ rankMedal(idx) }}</span>
            <span class="name">{{ row.team_name }}</span>
            <span class="pts-chip">{{ formatPts(row.total_points) }} pts</span>
          </div>
          <div v-if="!loading && !allTeams.length" class="empty-hint">No team workouts yet.</div>
        </div>
      </div>

      <!-- Top performers per team -->
      <div v-if="teamBreakdown.length" class="leaderboard-block">
        <p class="block-label">⭐ Top Performers Per Team</p>
        <div class="team-breakdown-grid">
          <div v-for="team in teamBreakdown" :key="`bd-${team.team_id}`" class="team-breakdown-card">
            <div class="tbd-team-name">{{ team.team_name }}</div>
            <div v-if="team.runs" class="tbd-category">
              <span class="tbd-cat-label">🏃 Runs</span>
              <div class="tbd-leader-row">
                <UserAvatar :photo-path="team.runs.leader.profile_photo_path" :first-name="team.runs.leader.first_name" :last-name="team.runs.leader.last_name" size="sm" />
                <span class="tbd-leader-name">{{ team.runs.leader.first_name }} {{ team.runs.leader.last_name }}</span>
                <span class="tbd-stat">{{ team.runs.leader.miles }} mi</span>
                <span v-if="team.runs.leader.avg_pace" class="tbd-sub">{{ team.runs.leader.avg_pace }}/mi</span>
              </div>
              <div class="tbd-team-agg">Team: {{ team.runs.team_total_miles }} mi total<span v-if="team.runs.team_avg_pace"> · avg {{ team.runs.team_avg_pace }}/mi</span></div>
            </div>
            <div v-if="team.rucks" class="tbd-category">
              <span class="tbd-cat-label">🎒 Rucks</span>
              <div class="tbd-leader-row">
                <UserAvatar :photo-path="team.rucks.leader.profile_photo_path" :first-name="team.rucks.leader.first_name" :last-name="team.rucks.leader.last_name" size="sm" />
                <span class="tbd-leader-name">{{ team.rucks.leader.first_name }} {{ team.rucks.leader.last_name }}</span>
                <span class="tbd-stat">{{ team.rucks.leader.miles }} mi</span>
                <span v-if="team.rucks.leader.avg_pace" class="tbd-sub">{{ team.rucks.leader.avg_pace }}/mi</span>
              </div>
              <div class="tbd-team-agg">Team: {{ team.rucks.team_total_miles }} mi total<span v-if="team.rucks.team_avg_pace"> · avg {{ team.rucks.team_avg_pace }}/mi</span></div>
            </div>
            <div v-if="team.other" class="tbd-category">
              <span class="tbd-cat-label">🔥 Cross-Training</span>
              <div class="tbd-leader-row">
                <UserAvatar :photo-path="team.other.leader.profile_photo_path" :first-name="team.other.leader.first_name" :last-name="team.other.leader.last_name" size="sm" />
                <span class="tbd-leader-name">{{ team.other.leader.first_name }} {{ team.other.leader.last_name }}</span>
                <span class="tbd-stat">{{ team.other.leader.calories }} cal</span>
                <span v-if="team.other.leader.avg_hr" class="tbd-sub">{{ team.other.leader.avg_hr }} bpm</span>
              </div>
            </div>
            <div v-if="!team.runs && !team.rucks && !team.other" class="tbd-empty">No activity yet.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── INDIVIDUAL tab ─────────────────────────────────────── -->
    <div v-else-if="tab === 'individual'" class="leaderboard-list">
      <div
        v-for="(row, idx) in allIndividuals"
        :key="`ind-${row.user_id}`"
        class="leaderboard-row"
        :class="rankClass(idx)"
      >
        <span class="rank-badge">{{ rankMedal(idx) }}</span>
        <UserAvatar :photo-path="row.profile_photo_path" :first-name="row.first_name" :last-name="row.last_name" size="sm" />
        <span class="name">{{ row.first_name }} {{ row.last_name }}</span>
        <span class="pts-chip">
          {{ formatPts(row.total_points) }} pts
          <template v-if="row.total_miles > 0"> · {{ Number(row.total_miles).toFixed(2) }} mi</template>
        </span>
      </div>
      <div v-if="!loading && !allIndividuals.length" class="empty-hint">No workouts yet — log your first! 🚀</div>
    </div>

    <!-- ── TEAM tab ───────────────────────────────────────────── -->
    <div v-else class="leaderboard-combined">
      <div class="leaderboard-block">
        <div class="leaderboard-list">
          <div
            v-for="(row, idx) in allTeams"
            :key="`team-${row.team_id}`"
            class="leaderboard-row"
            :class="rankClass(idx)"
          >
            <span class="rank-badge">{{ rankMedal(idx) }}</span>
            <span class="name">{{ row.team_name }}</span>
            <span class="pts-chip">{{ formatPts(row.total_points) }} pts</span>
          </div>
          <div v-if="!loading && !allTeams.length" class="empty-hint">No team workouts yet.</div>
        </div>
      </div>
      <div v-if="teamBreakdown.length" class="leaderboard-block">
        <p class="block-label">⭐ Top Performers Per Team</p>
        <div class="team-breakdown-grid">
          <div v-for="team in teamBreakdown" :key="`tbd2-${team.team_id}`" class="team-breakdown-card">
            <div class="tbd-team-name">{{ team.team_name }}</div>
            <div v-if="team.runs" class="tbd-category">
              <span class="tbd-cat-label">🏃 Runs</span>
              <div class="tbd-leader-row">
                <UserAvatar :photo-path="team.runs.leader.profile_photo_path" :first-name="team.runs.leader.first_name" :last-name="team.runs.leader.last_name" size="sm" />
                <span class="tbd-leader-name">{{ team.runs.leader.first_name }} {{ team.runs.leader.last_name }}</span>
                <span class="tbd-stat">{{ team.runs.leader.miles }} mi</span>
                <span v-if="team.runs.leader.avg_pace" class="tbd-sub">{{ team.runs.leader.avg_pace }}/mi</span>
              </div>
              <div class="tbd-team-agg">Team: {{ team.runs.team_total_miles }} mi total</div>
            </div>
            <div v-if="!team.runs && !team.rucks && !team.other" class="tbd-empty">No activity yet.</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading-inline">Loading…</div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { useSeasonWeeks } from '../../composables/useSeasonWeeks.js';

const formatPts = (v) => parseFloat(Number(v || 0).toFixed(2));

const props = defineProps({
  leaderboard: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  challengeId: { type: [String, Number], default: null },
  seasonStartsAt: { type: [String, Date], default: null },
  seasonEndsAt: { type: [String, Date], default: null }
});

const tab = ref('all');

const rankMedal = (idx) => idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
const rankClass  = (idx) => idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : '';

const allIndividuals = computed(() => props.leaderboard?.individual || []);
const allTeams       = computed(() => props.leaderboard?.team || []);
const top5Individual = computed(() => allIndividuals.value.slice(0, 5));

// ── Team breakdown (top performers per team) ──────────────────
const teamBreakdown = ref([]);
const sbLoading = ref(false);

const { weekStartDate } = useSeasonWeeks(
  computed(() => props.seasonStartsAt),
  { defaultToLatest: false, seasonEndsAtRef: computed(() => props.seasonEndsAt) }
);

const loadBreakdown = async () => {
  if (!props.challengeId || !weekStartDate.value) return;
  sbLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/scoreboard`, {
      params: { week: weekStartDate.value },
      skipGlobalLoading: true
    });
    teamBreakdown.value = r.data?.teamBreakdown || [];
  } catch {
    teamBreakdown.value = [];
  } finally {
    sbLoading.value = false;
  }
};

watch(() => props.challengeId, loadBreakdown, { immediate: true });
watch(weekStartDate, loadBreakdown);
</script>

<style scoped>
.challenge-leaderboard { display: flex; flex-direction: column; gap: 0; }

.lb-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.lb-icon { font-size: 1.3em; line-height: 1; }
.lb-header h2 { margin: 0; font-size: 1.15em; font-weight: 700; }

.leaderboard-tabs {
  display: flex; gap: 6px; margin-bottom: 14px;
  background: #f1f5f9; border-radius: 10px; padding: 4px;
}
.tab-btn {
  flex: 1; padding: 6px 10px; border: none; border-radius: 7px;
  background: transparent; cursor: pointer; font-size: 0.84em;
  font-weight: 500; color: #64748b; transition: all 0.15s;
}
.tab-btn.active {
  background: #fff; color: #1e293b; font-weight: 700;
  box-shadow: 0 1px 4px rgba(0,0,0,0.10);
}

.block-label {
  margin: 0 0 8px; font-size: 0.78em; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8;
}
.block-label-sub { font-weight: 400; text-transform: none; letter-spacing: 0; color: #cbd5e1; margin-left: 4px; }

.leaderboard-list { display: flex; flex-direction: column; gap: 5px; }
.leaderboard-combined { display: flex; flex-direction: column; gap: 20px; }

.leaderboard-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 10px;
  background: #f8fafc; transition: background 0.15s;
}
.leaderboard-row:hover { background: #f1f5f9; }
.rank-gold   { background: linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%); }
.rank-silver { background: linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%); }
.rank-bronze { background: linear-gradient(90deg, #fff7ed 0%, #ffedd5 100%); }
.rank-gold:hover   { background: linear-gradient(90deg, #fef3c7 0%, #fde68a 100%); }
.rank-silver:hover { background: #e2e8f0; }
.rank-bronze:hover { background: linear-gradient(90deg, #ffedd5 0%, #fed7aa 100%); }

.rank-badge { font-size: 1.1em; min-width: 28px; text-align: center; line-height: 1; }
.name  { flex: 1; font-size: 0.92em; font-weight: 500; }
.pts-chip {
  font-size: 0.82em; font-weight: 700; color: #fff;
  background: #e63946; border-radius: 999px;
  padding: 3px 10px; white-space: nowrap;
}

.lb-see-all-btn {
  margin-top: 8px;
  background: none; border: none; cursor: pointer;
  font-size: 0.8em; font-weight: 600; color: #6366f1;
  text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px;
  padding: 0;
}
.lb-see-all-btn:hover { color: #4338ca; }

.empty-hint  { color: #94a3b8; padding: 12px 0; font-size: 0.9em; }
.loading-inline { color: #94a3b8; padding: 12px 0; }

/* Team breakdown */
.team-breakdown-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.team-breakdown-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.tbd-team-name { font-weight: 800; font-size: 0.93em; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
.tbd-category { display: flex; flex-direction: column; gap: 4px; }
.tbd-cat-label { font-size: 0.7em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
.tbd-leader-row { display: flex; align-items: center; gap: 6px; background: #fff; border-radius: 8px; padding: 5px 8px; border: 1px solid #e2e8f0; }
.tbd-leader-name { flex: 1; font-size: 0.85em; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tbd-stat { font-size: 0.8em; font-weight: 800; color: #e63946; white-space: nowrap; }
.tbd-sub { font-size: 0.73em; color: #64748b; background: #f1f5f9; border-radius: 6px; padding: 1px 5px; white-space: nowrap; }
.tbd-team-agg { font-size: 0.73em; color: #64748b; padding-left: 2px; }
.tbd-empty { font-size: 0.83em; color: #94a3b8; font-style: italic; }
</style>
