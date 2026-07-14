<template>
  <div class="team-roles-management">
    <PractitionerTeamPanel v-if="isPractitioner" :agency-id="agencyId" />
    <div v-else class="placeholder-content">
      <div class="section-header">
        <h2>Team & Roles</h2>
        <p class="section-description">
          Team invites with scoped capabilities are available on life coach and consultant tenants.
        </p>
      </div>
      <p class="placeholder-note">
        Open a life coach or consultant organization, then return here to invite assistants.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { isPractitionerOrgType } from '../../utils/practitionerVertical';
import PractitionerTeamPanel from './PractitionerTeamPanel.vue';

const agencyStore = useAgencyStore();

const currentAgency = computed(() => agencyStore.currentAgency?.value ?? agencyStore.currentAgency);

const isPractitioner = computed(() =>
  isPractitionerOrgType(currentAgency.value?.organization_type || currentAgency.value?.organizationType)
);

const agencyId = computed(() => Number(currentAgency.value?.id || 0) || null);
</script>

<style scoped>
.team-roles-management {
  width: 100%;
}
.section-header {
  margin-bottom: 16px;
}
.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}
.section-description {
  color: var(--text-secondary);
  margin: 0;
}
.placeholder-content {
  padding: 1rem 0;
}
.placeholder-note {
  color: var(--text-secondary);
  font-size: 0.9rem;
}
</style>
