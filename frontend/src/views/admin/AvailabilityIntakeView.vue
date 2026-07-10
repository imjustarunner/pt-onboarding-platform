<template>
  <div class="availability-intake-view container">
    <div class="page-header">
      <h1>Office &amp; availability approvals</h1>
      <p class="subtitle">
        One place to approve office requests, booking requests, and school availability.
        My Schedule remains the primary day-to-day schedule surface.
      </p>
    </div>

    <div v-if="shouldShowAgencySelector" class="agency-selector">
      <label>Agency</label>
      <select v-model="selectedAgencyId" @change="onAgencyChange">
        <option :value="null">Select an agency…</option>
        <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
    </div>

    <OfficeScheduleApprovalsView
      v-if="isBookingQueueTab"
      :embedded="true"
      :initial-queue-tab="initialTab"
    />
    <AvailabilityIntakeManagement
      v-else
      :show-header="false"
      :initial-tab="initialTab"
      :show-booking-queue-tabs="true"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import AvailabilityIntakeManagement from '../../components/admin/AvailabilityIntakeManagement.vue';
import OfficeScheduleApprovalsView from './OfficeScheduleApprovalsView.vue';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const selectedAgencyId = ref(null);
const initialTab = computed(() => String(route.query.tab || '').trim().toLowerCase());
const isBookingQueueTab = computed(() => ['booking', 'legacy'].includes(initialTab.value));

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const agencies = computed(() => {
  const list = isSuperAdmin.value ? (agencyStore.agencies || []) : (agencyStore.userAgencies || []);
  return (list || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const shouldShowAgencySelector = computed(() => {
  return agencies.value.length > 1 && !agencyStore.hasSingleTenantAssociation.value;
});

const onAgencyChange = () => {
  const id = selectedAgencyId.value ? Number(selectedAgencyId.value) : null;
  const agency = agencies.value.find((a) => a.id === id);
  agencyStore.setCurrentAgency(agency || null);
};

const ensureAgencyContextFromQuery = async () => {
  if (!agencies.value.length) {
    if (isSuperAdmin.value) await agencyStore.fetchAgencies();
    else await agencyStore.fetchUserAgencies();
  }
  const qAgencyId = route.query.agencyId ? Number(route.query.agencyId) : null;
  if (qAgencyId && agencies.value.some((a) => a.id === qAgencyId)) {
    selectedAgencyId.value = qAgencyId;
    const agency = agencies.value.find((a) => a.id === qAgencyId);
    agencyStore.setCurrentAgency(agency || null);
  } else if (agencyStore.currentAgency?.id) {
    selectedAgencyId.value = agencyStore.currentAgency.id;
  } else if (agencies.value.length === 1) {
    selectedAgencyId.value = agencies.value[0].id;
    agencyStore.setCurrentAgency(agencies.value[0]);
  }
};

onMounted(async () => {
  await ensureAgencyContextFromQuery();
});

watch(() => agencyStore.currentAgency?.id, (id) => {
  if (id && selectedAgencyId.value !== id) selectedAgencyId.value = id;
});
</script>

<style scoped>
.page-header {
  margin-bottom: 16px;
}
.subtitle {
  color: var(--text-secondary);
  margin: 6px 0 0 0;
}
.agency-selector {
  margin-bottom: 16px;
}
.agency-selector label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.agency-selector select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 260px;
}
</style>
