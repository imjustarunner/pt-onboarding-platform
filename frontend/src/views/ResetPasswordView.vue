<template>
  <div class="reset-container" :style="{ background: loginBackground }">
    <div class="reset-content">
      <div class="reset-card">
        <div v-if="loading" class="loading">
          <p>Loading...</p>
        </div>

        <div v-else-if="error" class="error">
          <h2>Reset Error</h2>
          <p>{{ error }}</p>
          <router-link to="/login" class="btn btn-primary">Go to Login</router-link>
        </div>

        <div v-else class="reset-form">
          <h2 v-if="firstName">Hi {{ firstName }},</h2>
          <h2 v-else>Reset your password</h2>
          <p class="subtitle">Please choose a new password to continue</p>

          <form @submit.prevent="handleReset">
            <div class="form-group">
              <label for="password">New Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                placeholder="Enter a new password"
                required
                class="form-input"
                :disabled="saving"
                minlength="6"
              />
            </div>

            <div class="form-group">
              <label for="confirmPassword">Confirm New Password</label>
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                type="password"
                placeholder="Confirm your new password"
                required
                class="form-input"
                :disabled="saving"
                minlength="6"
              />
            </div>

            <p v-if="passwordMismatch" class="error-message">Passwords do not match</p>
            <p v-if="formError" class="error-message">{{ formError }}</p>

            <button
              type="submit"
              class="btn btn-primary"
              :disabled="saving || passwordMismatch || !password || !confirmPassword"
            >
              {{ saving ? 'Saving...' : 'Reset Password' }}
            </button>
          </form>
        </div>
      </div>
    </div>

    <PoweredByFooter />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import api from '../services/api';
import { getDashboardRoute } from '../utils/router';
import PoweredByFooter from '../components/PoweredByFooter.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const loading = ref(true);
const error = ref('');
const firstName = ref('');
const password = ref('');
const confirmPassword = ref('');
const saving = ref(false);
const formError = ref('');

const passwordMismatch = computed(() => {
  return password.value && confirmPassword.value && password.value !== confirmPassword.value;
});

const loginBackground = computed(() => brandingStore.loginBackground);

const token = computed(() => {
  const t = route.params.token;
  return typeof t === 'string' ? t : '';
});

const validateToken = async () => {
  if (!token.value) {
    error.value = 'Invalid reset link. Token is missing.';
    loading.value = false;
    return;
  }

  try {
    const resp = await api.get(`/auth/validate-reset-token/${encodeURIComponent(token.value)}`);
    firstName.value = resp.data.firstName || '';

    // If route isn’t slug-scoped, still apply org branding best-effort.
    if (!route.params.organizationSlug && resp.data.portalSlug) {
      await brandingStore.fetchAgencyTheme(resp.data.portalSlug);
    }

    loading.value = false;
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Invalid or expired reset link.';
    loading.value = false;
  }
};

const handleReset = async () => {
  if (passwordMismatch.value) {
    formError.value = 'Passwords do not match';
    return;
  }
  if (password.value.length < 6) {
    formError.value = 'Password must be at least 6 characters';
    return;
  }

  saving.value = true;
  formError.value = '';

  try {
    const resp = await api.post(`/auth/reset-password/${encodeURIComponent(token.value)}`, {
      password: password.value
    });

    authStore.setAuth(null, resp.data.user, resp.data.sessionId);
    sessionStorage.setItem('justLoggedIn', 'true');

    // Load agencies for redirects / slug enforcement
    if (authStore.user.role !== 'super_admin' && authStore.user.type !== 'approved_employee') {
      try {
        const { useAgencyStore } = await import('../store/agency');
        const agencyStore = useAgencyStore();
        await agencyStore.fetchUserAgencies();
      } catch (e) {
        // ignore
      }
    }

    // Redirect into the app
    setTimeout(() => {
      router.push(getDashboardRoute());
    }, 400);
  } catch (err) {
    formError.value = err.response?.data?.error?.message || err.message || 'Failed to reset password.';
    saving.value = false;
  }
};

onMounted(async () => {
  // If this reset link is org-scoped, load org theme for branded experience
  if (route.params.organizationSlug) {
    await brandingStore.fetchAgencyTheme(route.params.organizationSlug);
  }
  await validateToken();
});
</script>

<style scoped>
.reset-container {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  min-height: 100vh;
  padding: 24px 16px;
}

.reset-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.reset-card {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 450px;
  text-align: center;
}

.subtitle {
  color: #666;
  margin-bottom: 30px;
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
  text-align: left;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
}

.error-message {
  color: var(--error);
  font-size: 14px;
  margin: 10px 0;
}
</style>

