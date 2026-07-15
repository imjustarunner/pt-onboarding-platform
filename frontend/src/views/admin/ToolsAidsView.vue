<template>
  <div class="tools-aids">
    <div class="tools-aids__header">
      <router-link :to="orgTo('/dashboard')" class="back-link">← Back to Dashboard</router-link>
      <h1>Tools &amp; Aids</h1>
      <p class="subtitle">Clinical tools and productivity aids for your team.</p>
    </div>

    <div class="cards">
      <div class="note-card note-card--primary">
        <div class="note-card-badge">AI Note Aid</div>
        <div class="note-card-header">
          <div class="note-card-title">Clinical Note Assistant</div>
          <router-link class="btn-open" :to="noteAidNewNoteTo">New Note</router-link>
        </div>
        <div class="note-card-body">
          Generate structured clinical notes from text or audio, copy into your EHR, and keep a short Active / Archived shelf (deleted after 7 days).
        </div>
        <router-link class="note-card-link" :to="noteAidTo">Open Note Aid →</router-link>
      </div>

      <div class="note-card muted-card">
        <div class="note-card-header">
          <div class="note-card-title">Clinical Guide / Coach</div>
          <button class="btn-soon" disabled>Coming soon</button>
        </div>
        <div class="note-card-body">
          Coaching workflows and guidance (planned).
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const noteAidTo = computed(() => orgTo('/admin/note-aid'));
const noteAidNewNoteTo = computed(() => ({
  path: orgTo('/admin/note-aid'),
  query: { new: '1' }
}));
</script>

<style scoped>
.tools-aids {
  --ta-teal: #0f766e;
  padding: 4px 2px 24px;
}

.tools-aids__header h1 {
  margin: 0;
  letter-spacing: -0.02em;
}

.back-link {
  display: inline-block;
  margin-bottom: 8px;
  color: #64748b;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.subtitle {
  margin: 6px 0 0;
  color: #64748b;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.note-card {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 18px;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-card--primary {
  background: linear-gradient(165deg, #f0fdfa 0%, #ffffff 45%);
  border-color: #99f6e4;
}

.note-card-badge {
  display: inline-flex;
  align-self: flex-start;
  background: #ccfbf1;
  color: #0f766e;
  font-size: 0.75rem;
  font-weight: 800;
  border-radius: 999px;
  padding: 3px 10px;
}

.note-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.note-card-title {
  font-weight: 800;
  font-size: 1.05rem;
}

.note-card-body {
  color: #64748b;
  font-size: 0.92rem;
  line-height: 1.45;
  flex: 1;
}

.note-card-link {
  color: #0f766e;
  font-weight: 700;
  text-decoration: none;
}

.note-card-link:hover {
  text-decoration: underline;
}

.btn-open {
  border: none;
  background: #0f766e;
  color: white;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 700;
  text-decoration: none;
}

.btn-open:hover {
  background: #0d5f59;
}

.btn-soon {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #94a3b8;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 600;
}

.muted-card {
  opacity: 0.85;
}
</style>
