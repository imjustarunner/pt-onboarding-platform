<template><section aria-label="Coverage and billing follow-up"><h4>Coverage &amp; billing follow-up</h4><p v-if="error" role="alert">{{ error }}</p><template v-if="summary"><p v-for="policy in summary.policies" :key="policy.position">{{ policy.position === 'primary' ? 'Primary' : 'Secondary' }}: {{ policy.insurerName }}</p><p v-if="!summary.policies.length">Insurance not yet recorded.</p><p>{{ labels[summary.balance.status] }}<span v-if="summary.balance.ageBand"> · {{ ages[summary.balance.ageBand] }}</span></p><p v-if="summary.balance.hasItemsUnderReview">Billing is reviewing additional items.</p><small>Billing handles payments and collections. This view shows status only.</small></template><button type="button" @click="load">Refresh coverage and status</button></section></template>
<script setup>
import {ref,watch,onMounted,onBeforeUnmount} from 'vue';import api from '../../services/api.js';
const props=defineProps({clientId:[String,Number]});const summary=ref(null),error=ref('');let generation=0;
const labels={no_balance_due:'No current balance due in the app ledger',balance_due:'A balance is due',overdue:'Billing follow-up needed — overdue balance',billing_review:'Billing review in progress; contact the billing team'};
const ages={'1_30_days':'1–30 days overdue','31_60_days':'31–60 days overdue','61_90_days':'61–90 days overdue',over_90_days:'More than 90 days overdue'};
async function load(){const g=++generation;summary.value=null;error.value='';try{const r=await api.get(`/clients/${props.clientId}/care-billing-summary`);if(g===generation)summary.value=r.data;}catch(e){if(g===generation)error.value='Coverage and billing status could not be loaded.';}}
watch(()=>props.clientId,load);onMounted(load);onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>section{padding:12px;border:1px solid var(--border);border-radius:8px;margin:12px 0}button{display:block;margin-top:10px}[role=alert]{color:#a32121}</style>
