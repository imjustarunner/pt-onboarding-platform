<template><section><p>{{ ft("Balances and payment methods for your linked agencies. Your card stays private to your account. Each agency processes its own payments.") }}</p><div class="payment-agencies"><article v-for="agency in agencies" :key="agency.id"><h2>{{ agency.name }}</h2><details><summary>{{ ft("Balances, payments & receipts") }}</summary><FamilyLedgerPanel :agency-id="agency.id" /></details><details><summary>{{ ft("Saved cards & payment authorization") }}</summary><GuardianPaymentInsuranceTab :agency-id="agency.id" :guardian-user-id="guardianUserId" section="payment" /></details></article></div></section></template>
<script setup>
import { useFamilyLocale } from '../../composables/useFamilyLocale';
const { ft, locale: familyLocale } = useFamilyLocale();
import FamilyLedgerPanel from '../billing/FamilyLedgerPanel.vue';import GuardianPaymentInsuranceTab from './GuardianPaymentInsuranceTab.vue';
defineProps({agencies:{type:Array,default:()=>[]},guardianUserId:[Number,String]});
</script>
<style scoped>.payment-agencies{display:grid;gap:20px}article{border:1px solid #d7e3ef;border-radius:14px;background:white;padding:20px}h2{font-size:20px;color:#173451;margin-top:0}details{border-top:1px solid #e1e9f1;padding:14px 0}summary{font-weight:600;color:#16457c;cursor:pointer;margin-bottom:12px}p{line-height:1.6;color:#526784}</style>
