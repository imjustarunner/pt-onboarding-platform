<template>
  <section class="challenge-leaderboard">
    <h2>Leaderboard</h2>
    <div class="leaderboard-tabs">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: tab === 'all' }"
        @click="tab = 'all'"
      >
        All
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: tab === 'individual' }"
        @click="tab = 'individual'"
      >
        Individual
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: tab === 'team' }"
        @click="tab = 'team'"
      >
        Team
      </button>
    </div>
    <div v-if="tab === 'all'" class="leaderboard-combined">
      <div class="leaderboard-block">
        <h3>Individual</h3>
        <div class="leaderboard-list">
          <div
            v-for="(row, idx) in (leaderboard?.individual || [])"
            :key="`ind-${row.user_id}`"
            class="leaderboard-row"
          >
            <span class="rank">#{{ idx + 1 }}</span>
            <UserAvatar :photo-path="row.profile_photo_path" :first-name="row.first_name" :last-name="row.last_name" size="sm" />
            <span class="name">{{ row.first_name }} {{ row.last_name }}</span>
            <span class="points">{{ row.total_points }} pts</span>
          </div>
        </div>
      </div>
      <div class="leaderboard-block">
        <h3>All Teams</h3>
        <div class="leaderboard-list">
          <div
            v-for="(row, idx) in (leaderboard?.team || [])"
            :key="`team-${row.team_id}`"
            class="leaderboard-row"
          >
            <span class="rank">#{{ idx + 1 }}</span>
            <span class="name">{{ row.team_name }}</span>
            <span class="points">{{ row.total_points }} pts</span>
          </div>
        </div>
      </div>
      <div v-if="!loading && (!leaderboard?.individual?.length && !leaderboard?.team?.length)" class="empty-hint">
        No workouts yet. Log your first workout to climb the ranks.
      </div>
    </div>
    <div v-else-if="tab === 'individual'" class="leaderboard-list">
      <div
        v-for="(row, idx) in (leaderboard?.individual || [])"
        :key="`ind-${row.user_id}`"
        class="leaderboard-row"
      >
        <span class="rank">#{{ idx + 1 }}</span>
        <UserAvatar :photo-path="row.profile_photo_path" :first-name="row.first_name" :last-name="row.last_name" size="sm" />
        <span class="name">{{ row.first_name }} {{ row.last_name }}</span>
        <span class="points">{{ row.total_points }} pts</span>
      </div>
      <div v-if="!loading && (!leaderboard?.individual || !leaderboard.individual.length)" class="empty-hint">
        No workouts yet. Log your first workout to climb the ranks.
      </div>
    </div>
    <div v-else class="leaderboard-list">
      <div
        v-for="(row, idx) in (leaderboard?.team || [])"
        :key="`team-${row.team_id}`"
        class="leaderboard-row"
      >
        <span class="rank">#{{ idx + 1 }}</span>
        <span class="name">{{ row.team_name }}</span>
        <span class="points">{{ row.total_points }} pts</span>
      </div>
      <div v-if="!loading && (!leaderboard?.team || !leaderboard.team.length)" class="empty-hint">
        No team workouts yet.
      </div>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import UserAvatar from '@/components/common/UserAvatar.vue';

const props = defineProps({
  leaderboard: { type: Object, default: null },
  loading: { type: Boolean, default: false }
});

const tab = ref('all');
</script>

<style scoped>
.challenge-leaderboard h2 {
  margin: 0 0 12px 0;
  font-size: 1.1em;
}
.leaderboard-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.tab-btn {
  padding: 6px 12px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
}
.tab-btn.active {
  background: var(--primary, #0066cc);
  color: #fff;
  border-color: var(--primary, #0066cc);
}
.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.leaderboard-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.leaderboard-row .rank {
  font-weight: 700;
  min-width: 36px;
  color: var(--primary, #0066cc);
}
.leaderboard-row .name {
  flex: 1;
}
.leaderboard-row .points {
  font-weight: 600;
  color: var(--text-muted, #666);
}
.empty-hint,
.loading-inline {
  padding: 12px;
  color: var(--text-muted, #666);
}
.leaderboard-combined {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.leaderboard-block h3 {
  margin: 0 0 8px 0;
  font-size: 1em;
  font-weight: 600;
  color: var(--text-muted, #666);
}
</style>
