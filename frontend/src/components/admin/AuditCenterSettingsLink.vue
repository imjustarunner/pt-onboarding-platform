<template>
  <div class="audit-center-settings">
    <h2 style="margin: 0 0 6px 0;">Audit Center</h2>
    <p class="muted" style="margin: 0 0 14px 0;">
      View audit exports and operational audit reports.
    </p>

    <button type="button" class="btn btn-primary" @click="goAuditCenter">
      Open Audit Center
    </button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';

const router = useRouter();
const agencyStore = useAgencyStore();

const goAuditCenter = () => {
  const id = agencyStore.currentAgency?.id;
  if (id) {
    router.push({ path: '/admin/audit-center', query: { agencyId: String(id) } });
    return;
  }
  router.push('/admin/audit-center');
};
</script>

<style scoped>
.muted {
  color: var(--text-secondary);
}
</style>

