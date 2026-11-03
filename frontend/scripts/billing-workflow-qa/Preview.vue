<template><main><header class="qa-banner"><strong>DEMO QA · Billing workflow preview</strong><p>Synthetic records and in-memory requests only. No claims, payments or emails are sent.</p><label>QA scenario <select v-model="scenario" data-testid="billing-qa-scenario"><option value="billing">Billing workspace</option><option value="provider">Provider payment setup</option><option value="medicaid">Medicaid provider view</option><option value="payment-request">Payment request review</option></select></label></header><BillingWorkspaceView v-if="scenario === 'billing'" /><ClientPaymentFollowup v-else-if="scenario === 'payment-request'" :client-id="990501" /><AppointmentBillingPanel v-else :agency-id="990001" :client-id="scenario === 'medicaid' ? 990502 : 990501" /><InsuranceVerificationGate /></main></template>
<script setup>
import {ref} from 'vue';
import {useRouter} from 'vue-router';
import ClientPaymentFollowup from '../../src/components/billing/ClientPaymentFollowup.vue';
import InsuranceVerificationGate from '../../src/components/billing/InsuranceVerificationGate.vue';
import AppointmentBillingPanel from '../../src/components/schedule/AppointmentBillingPanel.vue';
import BillingWorkspaceView from '../../src/views/admin/BillingWorkspaceView.vue';
import {calls} from './api.js';
const scenario=ref('billing');
window.__BILLING_QA__={calls,router:useRouter()};
</script>
<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#eef4f8;color:#203246}main{padding:12px}.qa-banner{padding:14px;background:#fff3c6;border:1px solid #b17c19;border-radius:8px;margin-bottom:12px}.qa-banner p{font-size:13px;margin:6px 0 0}@media(max-width:600px){main{padding:4px}}</style>
