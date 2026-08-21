<template>
  <div class="pu-public">
    <ProviderUpdateDashboard access-mode="token" :token="token" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ProviderUpdateDashboard from '../../components/provider/ProviderUpdateDashboard.vue';

const route = useRoute();
const token = computed(() => String(route.params.token || ''));
</script>

<style scoped>
.pu-public {
  min-height: 100vh;
  background: #f7f8f6;
}
</style>
