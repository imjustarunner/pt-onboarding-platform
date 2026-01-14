<template>
  <div class="agency-selector">
    <div v-if="agencies.length > 0" class="selector-group">
      <label>Agency</label>
      <select v-model="selectedAgencyId" @change="handleAgencyChange" class="selector">
        <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
          {{ agency.name }}
        </option>
      </select>
    </div>
    
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { useRoute, useRouter } from 'vue-router';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const selectedAgencyId = ref(agencyStore.currentAgency?.id || null);

const agencies = computed(() => agencyStore.agencies);

const handleAgencyChange = () => {
  const agency = agencies.value.find(a => a.id === selectedAgencyId.value);
  if (agency) {
    agencyStore.setCurrentAgency(agency);

    // Keep URL slug + branding in sync with the selected agency
    const slug = agency.slug || agency.portal_url;
    if (!slug) return;

    // If we are already on a slug-prefixed route, preserve current sub-route and swap slug.
    if (route.params.organizationSlug) {
      const nextParams = { ...route.params, organizationSlug: slug };
      router.push({ name: route.name, params: nextParams, query: route.query });
      return;
    }

    // Otherwise, go to the branded dashboard for this agency.
    router.push(`/${slug}/dashboard`);
  }
};

onMounted(async () => {
  // Fetch user's assigned agencies and set default
  await agencyStore.fetchUserAgencies();
  
  // Also fetch agencies for the selector dropdown (for regular users)
  if (authStore.user?.id && authStore.user?.type !== 'approved_employee') {
    await agencyStore.fetchAgencies(authStore.user.id);
  }
  
  // For approved employees, agencies are already loaded from fetchUserAgencies
  // Ensure current agency is set
  if (agencyStore.currentAgency) {
    selectedAgencyId.value = agencyStore.currentAgency.id;
  } else if (agencies.value.length > 0) {
    selectedAgencyId.value = agencies.value[0].id;
    agencyStore.setCurrentAgency(agencies.value[0]);
  }
});

watch(() => agencyStore.currentAgency, (newAgency) => {
  if (newAgency) {
    selectedAgencyId.value = newAgency.id;
  }
});
</script>

<style scoped>
.agency-selector {
  display: flex;
  gap: 20px;
  align-items: flex-end;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: var(--shadow);
  margin-bottom: 24px;
  border: 1px solid var(--border);
}

.selector-group {
  flex: 1;
  max-width: 300px;
}

.selector-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #1e293b;
  font-size: 14px;
}

.selector {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s;
}

.selector option {
  color: var(--text-primary);
  background: white;
}

.selector:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}
</style>

