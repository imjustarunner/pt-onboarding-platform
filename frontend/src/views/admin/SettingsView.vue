<template>
  <SettingsPage />
</template>

<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SettingsPage from '../../components/admin/SettingsPage.vue';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

onMounted(async () => {
  try {
    await agencyStore.fetchUserAgencies();
  } catch {
    // ignore hydration errors, fallback to currently selected agency
  }

  const routeSlug = String(route.params?.organizationSlug || '').trim();
  const current = agencyStore.currentAgency || null;
  const orgType = String(current?.organization_type || current?.organizationType || '').toLowerCase();
  const slug = routeSlug || String(current?.slug || current?.portal_url || '').trim();
  const isSscRoute = routeSlug.toLowerCase() === 'ssc';
  const isAffiliation = orgType === 'affiliation';

  if ((isAffiliation || isSscRoute) && slug) {
    const to = `/${slug}/admin/club-settings`;
    if (route.path !== to) {
      router.replace(to);
    }
  }
});
</script>

<style scoped>
h1 {
  margin-bottom: 32px;
  color: var(--text-primary);
}

.settings-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
}

.tab-button {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--accent);
}

.settings-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
</style>

