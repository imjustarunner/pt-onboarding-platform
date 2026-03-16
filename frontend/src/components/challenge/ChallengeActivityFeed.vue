<template>
  <section class="challenge-activity-feed">
    <h2>Recent Activity</h2>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="activity-list">
      <div v-for="w in workouts" :key="w.id" class="activity-card">
        <div class="activity-header">
          <span class="activity-user">{{ w.first_name }} {{ w.last_name }}</span>
          <span class="activity-type">{{ formatActivityType(w.activity_type) }}</span>
        </div>
        <div class="activity-meta">
          <span v-if="w.distance_value">{{ w.distance_value }} mi</span>
          <span v-if="w.duration_minutes">{{ w.duration_minutes }} min</span>
          <span class="activity-points">{{ w.points }} pts</span>
        </div>
        <div v-if="w.workout_notes" class="activity-notes">{{ w.workout_notes }}</div>
        <div class="activity-time hint">{{ formatTime(w.completed_at || w.created_at) }}</div>
      </div>
      <div v-if="!workouts.length" class="empty-hint">No activity yet. Be the first to log a workout!</div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  workouts: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
});

const formatActivityType = (t) => {
  if (!t) return '';
  return String(t).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatTime = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
</script>

<style scoped>
.challenge-activity-feed h2 {
  margin: 0 0 12px 0;
  font-size: 1.1em;
}
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.activity-card {
  padding: 12px;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
}
.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.activity-user {
  font-weight: 600;
}
.activity-type {
  text-transform: capitalize;
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.activity-meta {
  margin-top: 4px;
  font-size: 0.9em;
}
.activity-meta span + span::before {
  content: ' · ';
}
.activity-notes {
  margin-top: 6px;
  font-size: 0.9em;
}
.activity-time {
  margin-top: 4px;
  font-size: 0.85em;
}
.empty-hint,
.loading-inline {
  padding: 12px;
  color: var(--text-muted, #666);
}
</style>
