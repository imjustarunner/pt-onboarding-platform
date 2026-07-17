<template>
  <div class="my-benefits">
    <div v-if="loading" class="my-benefits__muted">Loading benefits…</div>
    <div v-else-if="error" class="my-benefits__error">{{ error }}</div>
    <UserBenefitsTab
      v-else-if="userId && agencyId"
      mode="self"
      :user-id="userId"
      :user="benefitsUser"
      :agency-id="agencyId"
      :can-edit-user="false"
      :can-view-payroll="true"
      :is-hourly-worker="isHourlyWorker"
    />
    <p v-else class="my-benefits__muted">Select an organization to view your benefits.</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import UserBenefitsTab from '../admin/UserBenefitsTab.vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const profile = ref(null);

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const userId = computed(() => authStore.user?.id || null);

const isHourlyWorker = computed(() => {
  const u = profile.value || authStore.user || {};
  return !!(u.isHourlyWorker || u.is_hourly_worker);
});

const benefitsUser = computed(() => {
  const me = authStore.user || {};
  const p = profile.value || {};
  return {
    id: me.id || p.id,
    firstName: me.firstName || p.firstName,
    lastName: me.lastName || p.lastName,
    preferredName: me.preferredName || p.preferredName,
    first_name: me.firstName || p.firstName,
    last_name: me.lastName || p.lastName,
    preferred_name: me.preferredName || p.preferredName,
    email: me.email || p.email,
    title: me.title || p.title,
    service_focus: me.serviceFocus || p.serviceFocus || p.service_focus,
    employmentType: p.employmentType ?? me.employmentType ?? null,
    employment_type: p.employmentType ?? me.employmentType ?? null,
    medcancelRateSchedule: p.medcancelRateSchedule ?? me.medcancelRateSchedule ?? 'none',
    medcancel_rate_schedule: p.medcancelRateSchedule ?? me.medcancelRateSchedule ?? 'none',
    benefitsEligibilityOverrides: p.benefitsEligibilityOverrides ?? me.benefitsEligibilityOverrides ?? {},
    benefits_eligibility_overrides_json: p.benefitsEligibilityOverrides ?? me.benefitsEligibilityOverrides ?? {},
    benefitsEnrollment: p.benefitsEnrollment ?? me.benefitsEnrollment ?? null,
    benefits_enrollment_json: p.benefitsEnrollment ?? me.benefitsEnrollment ?? null,
    isHourlyWorker: isHourlyWorker.value,
    is_hourly_worker: isHourlyWorker.value
  };
});

const load = async () => {
  if (!userId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/users/me', { skipGlobalLoading: true });
    profile.value = resp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load benefits';
  } finally {
    loading.value = false;
  }
};

watch([userId, agencyId], load, { immediate: true });
</script>

<style scoped>
.my-benefits__muted {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}
.my-benefits__error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
}
</style>
