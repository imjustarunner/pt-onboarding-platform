<template>
  <section class="challenge-team-list">
    <h2>Teams</h2>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="teams-list">
      <div v-for="t in teams" :key="t.id" class="team-card">
        <div class="team-name">{{ t.team_name }}</div>
        <div v-if="t.manager_first_name || t.manager_last_name" class="team-lead hint">
          Team Lead: {{ t.manager_first_name }} {{ t.manager_last_name }}
        </div>
      </div>
      <div v-if="!teams.length" class="empty-hint">No teams yet. Contact your Program Manager to add teams.</div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  teams: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
});
</script>

<style scoped>
.challenge-team-list h2 {
  margin: 0 0 12px 0;
  font-size: 1.1em;
}
.teams-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.team-card {
  padding: 12px;
  border: 1px solid #eee;
  border-radius: 6px;
  min-width: 160px;
  background: #fafafa;
}
.team-name {
  font-weight: 600;
}
.team-lead {
  margin-top: 4px;
  font-size: 0.9em;
}
.empty-hint,
.loading-inline {
  padding: 12px;
  color: var(--text-muted, #666);
}
</style>
