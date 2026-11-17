<template><main class="fee-defaults"><router-link to="/admin/dashboard">Back to administration</router-link><AttendanceFeePolicies platform :agency-id="agency.currentAgency?.id" /></main></template>
<script setup>
import AttendanceFeePolicies from '../../components/admin/AttendanceFeePolicies.vue';
import {useAgencyStore} from '../../store/agency';
const agency=useAgencyStore();
</script>
<style scoped>.fee-defaults{padding:24px;max-width:1200px;margin:auto}</style>
