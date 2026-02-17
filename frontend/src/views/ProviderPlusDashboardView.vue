<template>
  <div class="provider-plus-dashboard">
    <header class="page-header">
      <h1>Provider Plus Dashboard</h1>
      <p class="subtitle">
        Focused operations workspace for schedule coordination and program support.
      </p>
    </header>

    <section class="cards-grid" aria-label="Provider plus quick actions">
      <router-link
        v-for="card in cards"
        :key="card.id"
        :to="card.to"
        class="action-card"
      >
        <div class="card-title">{{ card.title }}</div>
        <div class="card-description">{{ card.description }}</div>
      </router-link>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const activeOrganizationSlug = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? slug : null;
});

const orgTo = (path) => {
  if (!activeOrganizationSlug.value) return path;
  return `/${activeOrganizationSlug.value}${path}`;
};

const cards = computed(() => [
  {
    id: 'school_overview',
    title: 'School Overview',
    description: 'View school-level status and progress dashboards.',
    to: { path: orgTo('/admin/schools/overview'), query: { orgType: 'school' } }
  },
  {
    id: 'program_overview',
    title: 'Program Overview',
    description: 'Track program-level status and progress dashboards.',
    to: { path: orgTo('/admin/schools/overview'), query: { orgType: 'program' } }
  },
  {
    id: 'schedule_hub',
    title: 'Schedule Hub',
    description: 'Manage building and provider schedule coverage.',
    to: orgTo('/schedule')
  },
  {
    id: 'provider_availability',
    title: 'Provider Availability',
    description: 'Review and coordinate provider availability.',
    to: orgTo('/admin/provider-availability')
  },
  {
    id: 'communications',
    title: 'Communications',
    description: 'Access communications workspace and SMS inbox.',
    to: orgTo('/admin/communications')
  },
  {
    id: 'chats',
    title: 'Chats',
    description: 'Coordinate cases and updates through platform chats.',
    to: orgTo('/admin/communications/chats')
  },
  {
    id: 'tools_aids',
    title: 'Tools & Aids',
    description: 'Open operational tools and clinical support aids.',
    to: orgTo('/admin/tools-aids')
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Review team and personal notifications.',
    to: orgTo('/notifications')
  }
]);
</script>

<style scoped>
.provider-plus-dashboard {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem;
}

.page-header h1 {
  margin: 0;
}

.subtitle {
  margin-top: 0.5rem;
  color: #5f6b7a;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-top: 1.25rem;
}

.action-card {
  display: block;
  text-decoration: none;
  border: 1px solid #d9dee7;
  border-radius: 12px;
  padding: 1rem;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.action-card:hover {
  border-color: #5b7ce6;
  box-shadow: 0 6px 20px rgba(21, 56, 122, 0.08);
}

.card-title {
  font-weight: 700;
  color: #1f2b3d;
}

.card-description {
  margin-top: 0.4rem;
  color: #54627a;
  line-height: 1.35;
}
</style>
