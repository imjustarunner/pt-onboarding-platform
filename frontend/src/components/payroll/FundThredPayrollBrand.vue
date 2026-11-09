<template>
  <div class="ft-payroll-brand">
    <FundThredBrand compact />
    <span>{{ area }}</span>
  </div>
</template>
<script setup>
import FundThredBrand from '../fundthred/FundThredBrand.vue';
import '../../styles/fundthredPayroll.css';
defineProps({ area: { type: String, default: 'Payroll & people' } });
</script>
