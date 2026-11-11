<template>
  <section class="payroll-empty" role="status">
    <FundThredBrand compact />
    <span class="payroll-empty-check" aria-hidden="true">✓</span>
    <h3>{{ title }}</h3>
    <p>{{ message }}</p>
  </section>
</template>
<script setup>
import FundThredBrand from '../fundthred/FundThredBrand.vue';
defineProps({ title: { type: String, default: 'Nothing to review' }, message: { type: String, default: 'You’re clear to continue to the next step.' } });
</script>
<style scoped>
.payroll-empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:36px 20px; border:1px solid #c8e6d9; border-radius:12px; background:linear-gradient(145deg,#f3faf5,#fff); text-align:center; }
.payroll-empty-check { display:grid; place-items:center; width:48px; height:48px; border-radius:50%; color:#1e3a34; background:#dcefe2; font-size:26px; }
h3 { margin:0; color:var(--text-primary,#1e3a34); } p { margin:0; max-width:560px; color:var(--text-secondary,#536875); }
</style>
