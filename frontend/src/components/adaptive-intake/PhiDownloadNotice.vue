<template>
  <p class="phi-download-notice">
    {{ tx('This file contains protected health information. After it is saved on a device, we cannot retrieve, change, or delete that copy. Keep it in a private place and only share it if you mean to.') }}
  </p>
</template>

<script setup>
import { inject } from 'vue';
const tx = inject('enrollmentTranslate', text => text);
</script>

<style scoped>
.phi-download-notice {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #4b6358;
}
</style>
