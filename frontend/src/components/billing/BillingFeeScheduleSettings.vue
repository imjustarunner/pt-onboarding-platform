<template>
  <div>
    <BillingSectionNav current="fee-schedule" />
    <BillingFeeSchedule v-if="agencyId" :agency-id="agencyId" :agency-name="agencyName" :service-codes-path="serviceCodesPath" />
    <p v-else>Select a practice to manage its fee schedule.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import BillingFeeSchedule from './BillingFeeSchedule.vue';
import BillingSectionNav from './BillingSectionNav.vue';

const props = defineProps({ scopedAgencyId: { type: [Number, String], default: null } });
const route = useRoute();
const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(props.scopedAgencyId || agencyStore.currentAgency?.id || 0));
const agency = computed(() => (agencyStore.agencies || []).find((item) => Number(item.id) === agencyId.value) || (Number(agencyStore.currentAgency?.id) === agencyId.value ? agencyStore.currentAgency : null));
const agencyName = computed(() => agency.value?.name || '');
const serviceCodesPath = computed(() => {
  const query = new URLSearchParams();
  Object.entries(route.query || {}).forEach(([key, value]) => {
    if (value != null && key !== 'category' && key !== 'item') query.set(key, String(value));
  });
  query.set('category', 'general');
  query.set('item', 'service-codes');
  return `${route.path}?${query.toString()}`;
});
</script>
