<template>
  <div class="container">
    <div class="page-header">
      <div>
        <router-link :to="orgTo('/dashboard')" class="back-link">← Back to Dashboard</router-link>
        <h1>Tools &amp; Aids</h1>
        <p class="subtitle">Clinical tools and productivity aids for your team.</p>
      </div>
    </div>

    <div class="cards">
      <div class="note-card">
        <div class="note-card-header">
          <div class="note-card-title">Note Aid</div>
          <router-link class="btn btn-primary btn-sm" :to="orgTo('/admin/note-aid')">Open</router-link>
        </div>
        <div class="note-card-body">
          Generate structured clinical notes from text or audio.
        </div>
      </div>

      <div class="note-card muted-card">
        <div class="note-card-header">
          <div class="note-card-title">Clinical Guide / Coach</div>
          <button class="btn btn-secondary btn-sm" disabled>Coming soon</button>
        </div>
        <div class="note-card-body">
          Coaching workflows and guidance (planned).
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};
</script>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.note-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  background: white;
}
.note-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.note-card-title {
  font-weight: 700;
}
.note-card-body {
  color: var(--text-secondary);
  font-size: 14px;
}
.muted-card {
  opacity: 0.75;
}
</style>
