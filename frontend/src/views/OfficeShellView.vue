<template>
  <div class="container office-shell">
    <div class="header" data-tour="buildings-header">
      <div>
        <h2 data-tour="buildings-title">Office locations</h2>
        <p class="subtitle" data-tour="buildings-subtitle">Scheduling, kiosk, and office location settings.</p>
      </div>
      <div class="actions" data-tour="buildings-office-select">
        <select v-model="selectedOfficeId" @change="onOfficeChanged" :disabled="loading">
          <option value="">Select an office location…</option>
          <option v-for="o in offices" :key="o.id" :value="String(o.id)">{{ o.name }}</option>
        </select>
      </div>
    </div>

    <div class="tabs" data-tour="buildings-tabs">
      <router-link class="tab" :class="{ active: isActive('/buildings/schedule') }" :to="tabTo('/buildings/schedule')" data-tour="buildings-tab-schedule">Schedule</router-link>
      <router-link class="tab" :class="{ active: isActive('/buildings/review') }" :to="tabTo('/buildings/review')" data-tour="buildings-tab-review">Review</router-link>
      <router-link class="tab" :class="{ active: isActive('/buildings/settings') }" :to="tabTo('/buildings/settings')" data-tour="buildings-tab-settings">Settings</router-link>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div data-tour="buildings-content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const error = ref('');
const offices = ref([]);
const selectedOfficeId = ref('');

const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);
const tabTo = (path) => ({
  path: orgTo(path),
  query: {
    ...route.query,
    officeId: selectedOfficeId.value || (typeof route.query.officeId === 'string' ? route.query.officeId : undefined) || undefined
  }
});

const isActive = (prefix) => {
  const p = String(route.path || '');
  const slugPrefix = orgSlug.value ? `/${orgSlug.value}` : '';
  return p.startsWith(`${slugPrefix}${prefix}`);
};

const loadOffices = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/offices');
    offices.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load offices';
  } finally {
    loading.value = false;
  }
};

const onOfficeChanged = () => {
  // Keep officeId in query so child pages can use it
  router.replace({ query: { ...route.query, officeId: selectedOfficeId.value || undefined } });
};

onMounted(async () => {
  selectedOfficeId.value = typeof route.query.officeId === 'string' ? route.query.officeId : '';
  await loadOffices();
  // If none selected yet, auto-select first
  if (!selectedOfficeId.value && (offices.value || []).length > 0) {
    selectedOfficeId.value = String(offices.value[0].id);
    onOfficeChanged();
  }
});
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
.tabs {
  display: flex;
  gap: 10px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
  margin-bottom: 12px;
}
.tab {
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
  font-weight: 700;
}
.tab.active {
  border-color: var(--accent);
  background: white;
}
select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  min-width: 260px;
}
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
</style>

