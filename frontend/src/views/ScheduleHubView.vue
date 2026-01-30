<template>
  <div class="container sched-hub">
    <div class="header">
      <div>
        <h2 style="margin: 0;">Schedule</h2>
        <p class="subtitle">Choose what schedule view you want to open.</p>
      </div>
    </div>

    <div class="grid">
      <router-link class="card" :to="orgTo('/dashboard?tab=my_schedule')">
        <div class="card-title">Full schedule</div>
        <div class="card-desc">Your schedule grid (with requests, school assignments, office, and overlays).</div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link class="card" :to="orgTo('/schedule/staff')">
        <div class="card-title">Staff schedules (compare)</div>
        <div class="card-desc">Select multiple providers and compare schedules; reorder and view two+ at once.</div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link class="card" :to="orgTo('/buildings/schedule')">
        <div class="card-title">Buildings / offices schedule</div>
        <div class="card-desc">Master building schedule grid (rooms, slot states, booking actions).</div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link class="card" :to="orgTo('/buildings')">
        <div class="card-title">Buildings / offices admin</div>
        <div class="card-desc">Building selection, review workflows, and building settings.</div>
        <div class="card-cta">Open</div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 12px;
}
.subtitle {
  color: var(--text-secondary);
  margin: 6px 0 0 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.card {
  display: block;
  text-decoration: none;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 14px;
  padding: 14px 14px;
  color: var(--text-primary);
  transition: transform 0.08s ease, box-shadow 0.08s ease, border-color 0.08s ease;
}
.card:hover {
  transform: translateY(-1px);
  border-color: rgba(0, 0, 0, 0.16);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}
.card-title {
  font-weight: 900;
  letter-spacing: -0.01em;
}
.card-desc {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.3;
}
.card-cta {
  margin-top: 10px;
  font-weight: 800;
  color: var(--accent);
}
@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>

