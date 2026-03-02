<template>
  <div class="provider-mobile-shell">
    <header class="mobile-header">
      <div>
        <h1>Provider Mobile</h1>
        <p>{{ organizationLabel }}</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="goToDesktop">
        Desktop
      </button>
    </header>

    <main class="mobile-content">
      <router-view />
    </main>

    <nav class="mobile-tabs">
      <router-link :to="orgTo('/provider-mobile/schedule')" class="tab">Schedule</router-link>
      <router-link :to="orgTo('/provider-mobile/payroll')" class="tab">Payroll</router-link>
      <router-link :to="orgTo('/provider-mobile/note-aid')" class="tab">Note Aid</router-link>
      <router-link :to="orgTo('/provider-mobile/communications')" class="tab">Comms</router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const orgSlug = computed(() => (
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''
));

const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const organizationLabel = computed(() => {
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  if (current?.name) return current.name;
  if (orgSlug.value) return orgSlug.value.toUpperCase();
  return 'Mobile workspace';
});

const goToDesktop = () => {
  router.push(orgTo('/dashboard'));
};
</script>

<style scoped>
.provider-mobile-shell {
  min-height: 100vh;
  background: var(--bg-alt);
  padding-top: max(12px, env(safe-area-inset-top));
  padding-bottom: calc(78px + env(safe-area-inset-bottom));
}

.mobile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 20;
}

.mobile-header h1 {
  margin: 0;
  font-size: 20px;
}

.mobile-header p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.mobile-content {
  padding: 12px;
}

.mobile-tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: var(--bg);
  z-index: 30;
}

.tab {
  text-decoration: none;
  text-align: center;
  padding: 10px 6px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

.tab.router-link-active {
  border-color: var(--primary);
  color: var(--primary);
  background: #fff;
}
</style>
