<template>
  <div class="reinit-public">
    <SchoolReinitDashboard mode="token" :token="token" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SchoolReinitDashboard from '../../components/school/reinit/SchoolReinitDashboard.vue';

const route = useRoute();
const token = computed(() => String(route.params.token || ''));
</script>

<style scoped>
.reinit-public {
  min-height: 100vh;
  background: #f8fafc;
}
</style>
