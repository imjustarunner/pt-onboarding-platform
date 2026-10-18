<template>
  <main class="platform-page">
    <RouterLink to="/app">← My practices</RouterLink>
    <h1>AuricWell platform settings</h1>
    <p v-if="error" class="error" role="alert">{{ error }} <RouterLink to="/app">Sign in</RouterLink></p>
    <PlatformIntegrations v-if="allowed" />
  </main>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { api } from './api';
import PlatformIntegrations from './PlatformIntegrations.vue';
const allowed = ref(false), error = ref('');
onMounted(async () => {
  try {
    const data = await api('/bootstrap');
    if (!data.account.operator) throw new Error('Platform superadmin access is required.');
    allowed.value = true;
  } catch(e) { error.value = e.message; }
});
</script>
<style scoped>
.platform-page{max-width:1000px;margin:0 auto;padding:32px 20px 80px}
</style>
