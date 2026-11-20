<script setup>
const consent = defineModel('consent', { type: Boolean });
const risk = defineModel('risk', { type: Boolean });
</script>
<template>
  <div class="narriva-session-confirmations">
    <label><input v-model="consent" type="checkbox" /> I confirm consent to services and participation in this session in a private setting.</label>
    <label><input v-model="risk" type="checkbox" /> Include a risk assessment</label>
  </div>
</template>
<style scoped>
.narriva-session-confirmations { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 12px 0; }
.narriva-session-confirmations label { display: flex; align-items: center; gap: 6px; line-height: 1.4; }
@media (max-width:600px) {
  .narriva-session-confirmations { display: grid; gap: 0; }
  .narriva-session-confirmations label { min-height: 44px; margin: 0; }
}
</style>
