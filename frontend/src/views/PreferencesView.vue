<template>
  <div class="container">
    <div class="preferences-header">
      <h1>My Preferences</h1>
      <p class="preferences-subtitle">Manage your personal settings and preferences</p>
    </div>

    <UserPreferencesHub v-if="authStore.user?.id" :userId="authStore.user.id" />
  </div>
</template>

<script setup>
import { useAuthStore } from '../store/auth';
import { useRouter } from 'vue-router';
import UserPreferencesHub from '../components/UserPreferencesHub.vue';

const authStore = useAuthStore();
const router = useRouter();
if (!authStore.isAuthenticated) {
  router.push('/login');
}
</script>

<style scoped>
.preferences-header {
  margin-bottom: 40px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.preferences-header h1 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 32px;
  font-weight: 700;
}

.preferences-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 16px;
}
</style>
