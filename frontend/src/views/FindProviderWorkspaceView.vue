<template>
  <main v-if="isQaAgency" class="find-provider-workspace">
    <h1>Find a Provider</h1>
    <p>Review openings, visit formats, and preferences for {{ agency.name }}.</p>
    <ProviderAvailabilityWorkspace :agency-id="Number(agency.id)" />
  </main>
  <SupervisorAvailabilityLabView v-else />
</template>
<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../store/agency';
import ProviderAvailabilityWorkspace from '../components/availability/ProviderAvailabilityWorkspace.vue';
import SupervisorAvailabilityLabView from './SupervisorAvailabilityLabView.vue';
const store = useAgencyStore();
const agency = computed(() => store.currentAgency);
const isQaAgency = computed(() => Number(agency.value?.id) === 450 && agency.value?.slug === 'auricwell-qa-demo');
</script>
<style scoped>
.find-provider-workspace { max-width: 1440px; margin: 0 auto; padding: 24px; }
.find-provider-workspace > p { color: var(--text-secondary, #567064); }
</style>
