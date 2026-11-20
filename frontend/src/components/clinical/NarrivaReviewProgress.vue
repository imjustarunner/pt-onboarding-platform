<script setup>
import { NARRIVA_BRAND } from '../../config/narrivaBrand.js';
</script>
<template>
  <div class="narriva-review-progress" role="status" aria-live="polite">
    <img :src="NARRIVA_BRAND.compliance" alt="Narriva Compliance" />
    <span>Checking your session…</span>
  </div>
</template>
<style scoped>
.narriva-review-progress { display: grid; justify-items: center; gap: 12px; padding: 20px; background: white; color: #173754; }
.narriva-review-progress img { width: min(180px, 70%); height: auto; }
</style>
