<template>
  <router-link class="scb-brand" :class="{'scb-brand-compact':compact}" to="/schoolcarebridge" aria-label="SchoolCareBridge, a Plot Twist Co. product">
    <img :src="logo || '/assets/schoolcarebridge/logo.png'" :class="{ 'scb-supplied-logo': !logo || logo === '/assets/schoolcarebridge/logo.png' }" alt="SchoolCareBridge" />
    <span>A <strong>Plot Twist Co.</strong> product</span>
  </router-link>
</template>
<script setup>
defineProps({ compact: Boolean, logo: { type: String, default: '' } });
</script>
<style scoped>
.scb-brand{display:flex;flex-direction:column;align-items:center;justify-content:center;text-decoration:none;color:#184765;flex-shrink:0;width:230px}.scb-brand img{width:100%;height:82px;object-fit:contain;object-position:center}.scb-brand img.scb-supplied-logo{object-fit:cover}.scb-brand span{font-size:11px;letter-spacing:.04em;margin-top:-3px;margin-bottom:10px}
.scb-brand.scb-brand-compact{width:205px;align-items:flex-start}.scb-brand-compact img{height:65px;object-position:left center}.scb-brand-compact span{font-size:10px;margin:0 0 6px}.scb-brand-compact{max-width:100%}
</style>
