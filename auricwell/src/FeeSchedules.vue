<template><section><p v-if="error" role="alert">{{ error }}</p><BillingFeeSchedule v-if="agency" :agency-id="agency.id" :agency-name="agency.name" @manage-service-codes="manageCodes" /></section></template>
<script setup>
import { provide, ref, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import BillingFeeSchedule from '../../frontend/src/components/billing/BillingFeeSchedule.vue';
import { sharedBillingTransport } from './sharedBillingTransport.js';
import { credentialingTransport } from './credentialingTransport.js';
const props = defineProps({ base: { type: String, required: true }, root: { type: String, required: true } });
const router = useRouter(), agency = ref(null), error = ref(''), transport = sharedBillingTransport(props.base);
provide('billingTransport', transport); provide('credentialingTransport', credentialingTransport(props.base));
let active = true;
transport.get('/medical-billing/fee-schedule/context').then(({ data }) => { if (active) agency.value = data; }).catch(e => { if (active) error.value = e.message; });
const manageCodes = () => router.push(`${props.root}/settings`);
onBeforeUnmount(() => { active = false; });
</script>
