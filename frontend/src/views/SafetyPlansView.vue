<template><main class="safety-page"><router-link :to="`${prefix}/library`">← Library · Clinical forms</router-link><p v-if="!agencyId">Choose an organization to open its clinical forms.</p><SafetyPlansPanel v-else :key="`${agencyId}:${route.query.form||'safety-plan'}:${route.query.eventId||''}:${route.query.clientId||''}`" :agency-id="agencyId" :client-id="route.query.clientId" :initial-document-key="String(route.query.form||'safety-plan')" :event-type="String(route.query.eventType||'')" :event-id="route.query.eventId" /></main></template>
<script setup>
import {computed} from 'vue';
import {useRoute} from 'vue-router';
import {useAgencyStore} from '../store/agency';
import SafetyPlansPanel from '../components/safetyPlans/SafetyPlansPanel.vue';
const route=useRoute(),store=useAgencyStore();
const prefix=computed(()=>route.params.organizationSlug?`/${route.params.organizationSlug}`:'');
const agencyId=computed(()=>Number((route.params.organizationSlug?(store.userAgencies?.find(a=>a.slug===route.params.organizationSlug)?.id||(store.currentAgency?.slug===route.params.organizationSlug?store.currentAgency.id:0)):store.currentAgency?.id)||0));
</script>
<style scoped>.safety-page{max-width:1400px;margin:auto;padding:24px}.safety-page>a{color:#175b48}</style>
