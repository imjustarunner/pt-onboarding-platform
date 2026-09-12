<template>
  <router-link class="rise-brand" to="/p/rise" aria-label="Rise Revive home">
    <img :src="logo || '/assets/rise/logo.webp'" alt="Rise Revive Counseling and Coaching" class="rise-brand-custom" width="1536" height="1024" />
  </router-link>
</template>
<script setup>
defineProps({ logo: { type: String, default: '' } });
</script>
