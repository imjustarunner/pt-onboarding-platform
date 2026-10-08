<template>
  <span class="ft-brand" :class="{ 'ft-brand--light': light, 'ft-brand--compact': compact }">
    <svg viewBox="0 0 310 75" role="img" aria-label="FundThred"><path d="M116 24C79 21 98 1 127 9s79 32 94 8c2-3 3-7 3-10" fill="none" stroke="#429d9f" stroke-width="5" stroke-linecap="round"/><text x="4" y="69" fill="currentColor" font-family="Arial,sans-serif" font-weight="700" font-size="56" letter-spacing="-2.6">FundThred</text></svg>
    <span v-if="!compact" class="ft-brand-descriptor">Finance operations<small>By Plot Twist Co.</small></span>
  </span>
</template>
<script setup>
defineProps({ light: Boolean, compact: Boolean });
</script>
<style scoped>
.ft-brand{display:inline-flex;flex-direction:column;width:175px;flex-shrink:0;color:#071a36;text-align:left;line-height:1}.ft-brand svg{display:block;width:100%;height:auto;overflow:visible}.ft-brand-descriptor{font:700 7.4px/1.8 Arial,sans-serif;letter-spacing:2.4px;text-transform:uppercase;padding-left:5px}.ft-brand-descriptor small{display:block;font-size:6px;letter-spacing:2.3px;font-weight:400;color:#58718a}.ft-brand--light{color:#fff}.ft-brand--light small{color:#b4ccd8}.ft-brand--compact{width:135px}
</style>
