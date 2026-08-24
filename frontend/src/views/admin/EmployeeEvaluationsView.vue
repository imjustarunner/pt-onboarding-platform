<template>
  <div class="page-container eval-page">
    <div class="page-header">
      <h1>Employee Evaluations</h1>
      <p class="page-subtitle">Semiannual employee self-assessments and review roster.</p>
    </div>
    <EvaluationRosterPanel v-if="agencyId" :agency-id="agencyId" />
    <p v-else class="eval-page__muted">Select an agency to view the evaluation roster.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import EvaluationRosterPanel from '../../components/evaluations/EvaluationRosterPanel.vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const agencyId = computed(() => {
  const fromStore = Number(agencyStore.currentAgency?.id || 0);
  if (fromStore > 0) return fromStore;
  const fromUser = Number(authStore.user?.agencyId || authStore.user?.agency_id || 0);
  return fromUser > 0 ? fromUser : null;
});
</script>

<style scoped>
.eval-page {
  padding: 20px 24px 40px;
  max-width: 1200px;
}

.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #14532d;
}

.page-subtitle {
  margin: 6px 0 18px;
  color: #6b7280;
  font-size: 14px;
}

.eval-page__muted {
  color: #6b7280;
}
</style>
