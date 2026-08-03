<template>
  <div class="availability-intake-view container">
    <div class="page-header">
      <h1>Availability tools</h1>
      <p class="subtitle">
        Appointments, search, and skills. Office approvals and school approvals now have dedicated inboxes.
      </p>
      <div class="legacy-links">
        <router-link class="btn btn-secondary btn-sm" :to="officeApprovalsTo">Office approvals</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="schoolApprovalsTo">School approvals</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="providerManagementTo">Provider Management</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="scheduleHubTo">Schedule hub</router-link>
      </div>
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
      :hide-office-and-school-tabs="true"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import AvailabilityIntakeManagement from '../../components/admin/AvailabilityIntakeManagement.vue';
import OfficeScheduleApprovalsView from './OfficeScheduleApprovalsView.vue';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const selectedAgencyId = ref(null);
const initialTab = computed(() => String(route.query.tab || '').trim().toLowerCase());
const isBookingQueueTab = computed(() => ['booking', 'legacy'].includes(initialTab.value));

const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);
const agencyQuery = computed(() => (
  agencyStore.currentAgency?.id || selectedAgencyId.value
    ? { agencyId: String(agencyStore.currentAgency?.id || selectedAgencyId.value) }
    : {}
));
const officeApprovalsTo = computed(() => ({ path: orgTo('/admin/office-approvals'), query: { tab: 'requests', ...agencyQuery.value } }));
const schoolApprovalsTo = computed(() => ({ path: orgTo('/admin/school-approvals'), query: { tab: 'adjustments', ...agencyQuery.value } }));
const scheduleHubTo = computed(() => orgTo('/schedule'));
const providerManagementTo = computed(() => ({
  path: orgTo('/admin/provider-availability'),
  query: agencyQuery.value
}));

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const agencies = computed(() => {
  const list = isSuperAdmin.value ? (agencyStore.agencies || []) : (agencyStore.userAgencies || []);
  return (list || []).filter((a) =>
    ['agency', 'life_coach', 'consultant'].includes(String(a?.organization_type || 'agency').toLowerCase())
  );
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

/** Old combined inbox tabs → dedicated pages. */
function redirectLegacyTabs() {
  const t = initialTab.value;
  const agencyId = route.query.agencyId || selectedAgencyId.value || agencyStore.currentAgency?.id;
  const q = agencyId ? { agencyId: String(agencyId) } : {};
  if (t === 'office') {
    router.replace({ path: orgTo('/admin/office-approvals'), query: { tab: 'requests', ...q } }).catch(() => {});
    return true;
  }
  if (t === 'school' || t === 'additional_hours') {
    router.replace({ path: orgTo('/admin/school-approvals'), query: { tab: 'hours', ...q } }).catch(() => {});
    return true;
  }
  if (t === 'schedule_adjustments' || t === 'adjustments') {
    router.replace({ path: orgTo('/admin/school-approvals'), query: { tab: 'adjustments', ...q } }).catch(() => {});
    return true;
  }
  return false;
}

onMounted(async () => {
  await ensureAgencyContextFromQuery();
  redirectLegacyTabs();
});

watch(() => route.query.tab, () => {
  redirectLegacyTabs();
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
.legacy-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
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
