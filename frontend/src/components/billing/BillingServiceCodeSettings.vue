<template>
  <div>
    <BillingSectionNav current="service-codes" />
    <MedicalBillingView v-if="agencyId" :key="agencyId" :billing-agency-id="agencyId" :billing-agency-slug="agency?.slug || ''" service-codes-only />
    <p v-else>Select a practice to manage its service codes.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import MedicalBillingView from '../../views/admin/MedicalBillingView.vue';
import BillingSectionNav from './BillingSectionNav.vue';
const props = defineProps({ scopedAgencyId: { type: [Number, String], default: null } });
const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(props.scopedAgencyId || agencyStore.currentAgency?.id || 0));
const agency = computed(() => (agencyStore.agencies || []).find(a => Number(a.id) === agencyId.value) || (Number(agencyStore.currentAgency?.id) === agencyId.value ? agencyStore.currentAgency : null));
</script>
