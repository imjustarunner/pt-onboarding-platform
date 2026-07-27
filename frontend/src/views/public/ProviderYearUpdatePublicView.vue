<template>
  <div class="pyu-public">
    <ProviderYearUpdateDashboard mode="token" :token="token" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ProviderYearUpdateDashboard from '../../components/provider/ProviderYearUpdateDashboard.vue';

const route = useRoute();
const token = computed(() => String(route.params.token || ''));
</script>

<style scoped>
.pyu-public {
  min-height: 100vh;
  background: #f8fafc;
}
</style>
