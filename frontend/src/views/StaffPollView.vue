<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import StaffPollsPanel from '../components/dashboard/StaffPollsPanel.vue';
const route = useRoute();
const agencyId = computed(() => Number(route.query.agencyId) || null);
</script>

<template>
  <main class="staff-poll-page">
    <h1>Team poll</h1>
    <p>Choose an answer below to record your vote. Opening this page does not submit a response.</p>
    <StaffPollsPanel :agency-id="agencyId" :poll-id="route.params.pollId" />
  </main>
</template>

<style scoped>
.staff-poll-page { max-width: 760px; margin: 32px auto; padding: 24px; }
</style>
