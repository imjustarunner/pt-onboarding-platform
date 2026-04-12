<template>
  <div class="container">
    <SkillBuildersAvailabilityPanel
      :agency-id="currentAgencyId"
      :show-title="true"
      :show-scope-filters="false"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import SkillBuildersAvailabilityPanel from '../../components/availability/SkillBuildersAvailabilityPanel.vue';

const agencyStore = useAgencyStore();
const currentAgencyId = computed(() => agencyStore.currentAgency?.value?.id ?? agencyStore.currentAgency?.id ?? null);
</script>

