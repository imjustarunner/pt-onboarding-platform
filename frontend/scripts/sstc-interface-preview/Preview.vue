<template>
  <main class="capture-surface">
    <ChallengeLeaderboard v-if="screen === 'standings'" :leaderboard="leaderboard" />
    <ChallengeActivityFeed v-else-if="screen === 'activity'" :workouts="workouts" :challenge-id="1" :my-user-id="1" time-zone="America/Denver" />
    <ChallengeWeeklyTasks v-else :challenge-id="1" :my-user-id="1" season-starts-at="2026-10-05" season-ends-at="2026-11-15" />
  </main>
</template>
<script setup>
import ChallengeLeaderboard from '../../src/components/challenge/ChallengeLeaderboard.vue';
import ChallengeActivityFeed from '../../src/components/challenge/ChallengeActivityFeed.vue';
import ChallengeWeeklyTasks from '../../src/components/challenge/ChallengeWeeklyTasks.vue';
import {leaderboard, workouts} from './fixtures.js';
const screen = new URLSearchParams(location.search).get('screen') || 'standings';
</script>
<style>
body { background: #f4f7fa; }
.capture-surface { margin: 24px; padding: 28px; border: 1px solid #dce3eb; border-radius: 16px; background: white; }
</style>
