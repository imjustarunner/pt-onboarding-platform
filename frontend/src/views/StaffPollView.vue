<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import StaffPollsPanel from '../components/dashboard/StaffPollsPanel.vue';
const route = useRoute();
const agencyId = computed(() => Number(route.query.agencyId) || null);
</script>

<template>
  <main class="staff-poll-page">
    <h1>Your team poll</h1>
    <p>Choose an answer, see your saved vote, and follow updates from your team.</p>
    <StaffPollsPanel :agency-id="agencyId" :poll-id="route.params.pollId" />
  </main>
</template>

<style scoped>
.staff-poll-page { max-width: 760px; margin: 32px auto; padding: 24px; color: #152c50; }
.staff-poll-page h1 { color: #152c50; font-size: 26px; margin-bottom: 8px; }
.staff-poll-page > p { color: #53647c; font-size: 14px; line-height: 1.6; }
@media (max-width: 600px) { .staff-poll-page { margin: 12px auto; padding: 12px; } }
</style>
