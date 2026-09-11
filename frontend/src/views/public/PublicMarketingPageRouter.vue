<template>
  <PublicMarketingLandingTisiView v-if="isTisiLanding" />
  <PublicMarketingHubView v-else />
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PublicMarketingHubView from './PublicMarketingHubView.vue';
import PublicMarketingLandingTisiView from './PublicMarketingLandingTisiView.vue';

const route = useRoute();
const isTisiLanding = computed(() => String(route.params.hubSlug || '').trim().toLowerCase() === 'tisi');
</script>
