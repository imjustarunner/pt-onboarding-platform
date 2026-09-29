<template>
  <router-link class="scb-brand" to="/schoolcarebridge" aria-label="SchoolCareBridge, a program of MH4Kidz">
    <img :src="logo || '/assets/schoolcarebridge/logo.png'" :class="{ 'scb-supplied-logo': !logo || logo === '/assets/schoolcarebridge/logo.png' }" alt="SchoolCareBridge" />
    <span>A program of <strong>MH4Kidz</strong></span>
  </router-link>
</template>
<script setup>
defineProps({ logo: { type: String, default: '' } });
</script>
<style scoped>
.scb-brand{display:flex;flex-direction:column;align-items:center;justify-content:center;text-decoration:none;color:#184765;flex-shrink:0;width:230px}.scb-brand img{width:100%;height:82px;object-fit:contain;object-position:center}.scb-brand img.scb-supplied-logo{object-fit:cover}.scb-brand span{font-size:11px;letter-spacing:.04em;margin-top:-3px;margin-bottom:10px}
</style>
