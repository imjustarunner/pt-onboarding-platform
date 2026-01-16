<template>
  <div class="container">
    <div class="page-header">
      <div>
        <router-link :to="orgTo('/admin')" class="back-link">← Back to Admin</router-link>
        <h1>Checklist Items</h1>
        <p class="subtitle">Manage the checklist items that appear for users.</p>
      </div>
    </div>

    <div class="content-card">
      <CustomChecklistItemManagement v-if="isSuperAdmin" />
      <AgencyCustomChecklistItems
        v-else
        :assignOnly="isSupport"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useRoute } from 'vue-router';

import CustomChecklistItemManagement from '../../components/admin/CustomChecklistItemManagement.vue';
import AgencyCustomChecklistItems from '../../components/admin/AgencyCustomChecklistItems.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const isSupport = computed(() => authStore.user?.role === 'support');

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

onMounted(async () => {
  // Ensure agency context exists for the agency-scoped checklist UI.
  // (Super admins can still use it when impersonating an agency context.)
  if (!isSuperAdmin.value) {
    await agencyStore.fetchUserAgencies();
  }
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.back-link {
  display: inline-block;
  margin-bottom: 10px;
  color: var(--text-secondary);
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.subtitle {
  margin: 6px 0 0 0;
  color: var(--text-secondary);
}

.content-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
}
</style>

