<template>
  <div class="kiosk-login">
    <div class="login-card">
      <h1>Kiosk Sign-in</h1>
      <p class="subtitle">Sign in to access the kiosk</p>
      <div v-if="error" class="error">{{ error }}</div>
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            required
            placeholder="Enter username"
            autocomplete="username"
            :disabled="loading"
          />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            placeholder="Enter password"
            autocomplete="current-password"
            :disabled="loading"
          />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>
      <p class="hint">Use your kiosk account credentials. Contact your administrator if you need access.</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';

const router = useRouter();
const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const handleLogin = async () => {
  error.value = '';
  loading.value = true;
  const result = await authStore.login(username.value, password.value, null);
  if (result.success) {
    if (authStore.user?.role?.toLowerCase() !== 'kiosk') {
      authStore.clearAuth();
      error.value = 'This login is for kiosk accounts only. Please use the standard login.';
      loading.value = false;
      return;
    }
    router.push('/kiosk/app');
  } else {
    error.value = result.error || 'Login failed';
  }
  loading.value = false;
};
</script>

<style scoped>
.kiosk-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt, #f1f5f9);
  padding: 20px;
}
.login-card {
  width: 400px;
  max-width: 100%;
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.login-card h1 {
  margin: 0 0 8px 0;
  font-size: 24px;
}
.subtitle {
  color: var(--text-secondary);
  margin: 0 0 24px 0;
  font-size: 14px;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-weight: 600;
  font-size: 14px;
}
.form-group input {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
}
.error {
  background: #fee;
  color: #c00;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}
.hint {
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
