<template>
  <div class="page">
    <ReferralDirectoryPanel :agency-id="resolvedAgencyId" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import ReferralDirectoryPanel from '../../components/referralDirectory/ReferralDirectoryPanel.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const resolvedAgencyId = computed(() => {
  const fromStore = Number(agencyStore.currentAgency?.id);
  if (fromStore && Number.isFinite(fromStore)) return fromStore;
  const fromUser = Number(authStore.user?.agencyId);
  if (fromUser && Number.isFinite(fromUser)) return fromUser;
  return null;
});
</script>

<style scoped>
.page { padding: 24px; max-width: 1200px; margin: 0 auto; }
</style>
