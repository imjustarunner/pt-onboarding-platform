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

    <div v-if="tab === 'all'" class="leaderboard-combined">
      <div class="leaderboard-block">
        <p class="block-label">Individual</p>
        <div class="leaderboard-list">
          <div
            v-for="(row, idx) in (leaderboard?.individual || [])"
            :key="`ind-${row.user_id}`"
            class="leaderboard-row"
            :class="rankClass(idx)"
          >
            <span class="rank-badge">{{ rankMedal(idx) }}</span>
            <UserAvatar :photo-path="row.profile_photo_path" :first-name="row.first_name" :last-name="row.last_name" size="sm" />
            <span class="name">{{ row.first_name }} {{ row.last_name }}</span>
            <span class="pts-chip">{{ formatPts(row.total_points) }} pts</span>
          </div>
        </div>
      </div>
      <div class="leaderboard-block">
        <p class="block-label">All Teams</p>
        <div class="leaderboard-list">
          <div
            v-for="(row, idx) in (leaderboard?.team || [])"
            :key="`team-${row.team_id}`"
            class="leaderboard-row"
            :class="rankClass(idx)"
          >
            <span class="rank-badge">{{ rankMedal(idx) }}</span>
            <span class="name">{{ row.team_name }}</span>
            <span class="pts-chip">{{ formatPts(row.total_points) }} pts</span>
          </div>
        </div>
      </div>
      <div v-if="!loading && (!leaderboard?.individual?.length && !leaderboard?.team?.length)" class="empty-hint">
        No workouts yet — log your first to climb the ranks! 🚀
      </div>
    </div>

    <div v-else-if="tab === 'individual'" class="leaderboard-list">
      <div
        v-for="(row, idx) in (leaderboard?.individual || [])"
        :key="`ind-${row.user_id}`"
        class="leaderboard-row"
        :class="rankClass(idx)"
      >
        <span class="rank-badge">{{ rankMedal(idx) }}</span>
        <UserAvatar :photo-path="row.profile_photo_path" :first-name="row.first_name" :last-name="row.last_name" size="sm" />
        <span class="name">{{ row.first_name }} {{ row.last_name }}</span>
        <span class="pts-chip">{{ formatPts(row.total_points) }} pts</span>
      </div>
      <div v-if="!loading && (!leaderboard?.individual?.length)" class="empty-hint">No workouts yet — log your first! 🚀</div>
    </div>

    <div v-else class="leaderboard-list">
      <div
        v-for="(row, idx) in (leaderboard?.team || [])"
        :key="`team-${row.team_id}`"
        class="leaderboard-row"
        :class="rankClass(idx)"
      >
        <span class="rank-badge">{{ rankMedal(idx) }}</span>
        <span class="name">{{ row.team_name }}</span>
        <span class="pts-chip">{{ formatPts(row.total_points) }} pts</span>
      </div>
      <div v-if="!loading && (!leaderboard?.team?.length)" class="empty-hint">No team workouts yet.</div>
    </div>

    <div v-if="loading" class="loading-inline">Loading…</div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import UserAvatar from '@/components/common/UserAvatar.vue';

const formatPts = (v) => parseFloat(Number(v || 0).toFixed(2));

const props = defineProps({
  leaderboard: { type: Object, default: null },
  loading: { type: Boolean, default: false }
});

const tab = ref('all');

const rankMedal = (idx) => idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
const rankClass  = (idx) => idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : '';
</script>

<style scoped>
.challenge-leaderboard { display: flex; flex-direction: column; gap: 0; }

.lb-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
}
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

.empty-hint  { color: #94a3b8; padding: 12px 0; font-size: 0.9em; }
.loading-inline { color: #94a3b8; padding: 12px 0; }
</style>
