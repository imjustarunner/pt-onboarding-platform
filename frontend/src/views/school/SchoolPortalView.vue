<template>
  <div class="school-portal">
    <div class="portal-header">
      <h1>{{ organizationName }} Portal</h1>
      <p class="portal-subtitle">View your students and referral status</p>
    </div>

    <div class="portal-content">
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'clients' }"
          @click="activeTab = 'clients'"
        >
          Clients
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'schedule' }"
          @click="activeTab = 'schedule'"
        >
          Provider Schedule
        </button>
      </div>

      <div v-if="activeTab === 'clients'">
        <ClientListGrid
          :organization-slug="organizationSlug"
          :organization-id="organizationId"
        />
      </div>

      <div v-else class="schedule-wrap">
        <ProviderSchoolSchedule v-if="organizationId" :organization-id="organizationId" />
        <div v-else class="empty-state">Organization not loaded.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import ClientListGrid from '../../components/school/ClientListGrid.vue';
import ProviderSchoolSchedule from '../../components/school/ProviderSchoolSchedule.vue';

const route = useRoute();
const organizationStore = useOrganizationStore();

const activeTab = ref('clients');

const organizationSlug = computed(() => route.params.organizationSlug);

const organizationName = computed(() => {
  return organizationStore.organizationContext?.name || 
         organizationStore.currentOrganization?.name || 
         'School';
});

const organizationId = computed(() => {
  return organizationStore.organizationContext?.id || 
         organizationStore.currentOrganization?.id || 
         null;
});

onMounted(async () => {
  // Load organization context if not already loaded
  if (organizationSlug.value && !organizationStore.currentOrganization) {
    await organizationStore.fetchBySlug(organizationSlug.value);
  }
});
</script>

<style scoped>
.school-portal {
  min-height: 100vh;
  background: var(--bg-alt);
  padding: 32px;
}

.portal-header {
  margin-bottom: 32px;
}

.portal-header h1 {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.portal-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.portal-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}
.tab {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}
.tab.active {
  border-color: var(--primary);
  background: rgba(0, 0, 0, 0.03);
}
.schedule-wrap {
  margin-top: 8px;
}
</style>
