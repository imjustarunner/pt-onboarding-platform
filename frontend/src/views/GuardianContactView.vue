<template>
  <main class="guardian-contact-page"><h1>Guardian account</h1><p>Contact this guardian about the clients you work with.</p><GuardianContactCard :guardian-id="Number(route.params.guardianId)" /></main>
</template>
<script setup>
import { useRoute } from 'vue-router';
import GuardianContactCard from '../components/admin/GuardianContactCard.vue';
const route=useRoute();
</script>
<style scoped>
.guardian-contact-page{max-width:920px;margin:24px auto;padding:20px}.guardian-contact-page h1{margin-bottom:8px}
</style>
