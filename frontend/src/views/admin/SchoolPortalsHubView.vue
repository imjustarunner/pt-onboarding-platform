<template>
  <div class="container sph-page">
    <header class="sph-header">
      <div>
        <h1>School Portals</h1>
        <p class="sph-sub muted">
          Choose where to go next: operational metrics for affiliated <strong>schools</strong>, or a grid of portal shortcuts
          to open each school’s staff portal.
        </p>
      </div>
    </header>

    <div class="sph-cards">
      <router-link class="sph-card" :to="toOverview">
        <div class="sph-card-icon" aria-hidden="true">📊</div>
        <h2 class="sph-card-title">School Overview</h2>
        <p class="sph-card-desc muted">
          Search, sort, and review staffing and slot-style stats across affiliated schools. Post announcements to selected
          portals.
        </p>
        <span class="sph-card-cta">Open overview →</span>
      </router-link>

      <router-link class="sph-card" :to="toAllPortals">
        <div class="sph-card-icon" aria-hidden="true">🏫</div>
        <h2 class="sph-card-title">All school portals</h2>
        <p class="sph-card-desc muted">
          Card grid of school (and related) portals — same layout as expanding school portal shortcuts on My Dashboard.
          Pick a portal to open it.
        </p>
        <span class="sph-card-cta">Open portals →</span>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const orgPrefix = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}` : '';
});

const toOverview = computed(() => `${orgPrefix.value}/admin/schools/overview?orgType=school`);
const toAllPortals = computed(() => `${orgPrefix.value}/admin/school-portals`);
</script>

<style scoped>
.sph-page {
  padding-top: 1rem;
  padding-bottom: 2.5rem;
  max-width: 960px;
}
.sph-header h1 {
  margin: 0 0 8px;
  font-size: 1.65rem;
  color: var(--primary, #15803d);
}
.sph-sub {
  margin: 0;
  max-width: 42rem;
  line-height: 1.45;
  font-size: 0.95rem;
}
.sph-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
  margin-top: 22px;
}
.sph-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 20px 18px;
  border-radius: 14px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--panel, #fff);
  text-decoration: none;
  color: inherit;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.sph-card:hover {
  border-color: var(--primary, #15803d);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
}
.sph-card-icon {
  font-size: 1.75rem;
  line-height: 1;
}
.sph-card-title {
  margin: 4px 0 0;
  font-size: 1.15rem;
  color: var(--text, #0f172a);
}
.sph-card-desc {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  flex: 1;
}
.sph-card-cta {
  margin-top: 6px;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--primary, #15803d);
}
</style>
