<template>
  <div class="reset-container" :style="{ background: loginBackground }">
    <div class="reset-content">
      <div class="reset-card">
        <div v-if="loading" class="loading">
          <p>Loading…</p>
        </div>

        <div v-else-if="error" class="error">
          <h2>Reset Error</h2>
          <p>{{ error }}</p>
          <router-link to="/login" class="btn btn-primary">Go to Login</router-link>
        </div>

        <div v-else class="reset-form">
          <h2 v-if="firstName">Hi {{ firstName }},</h2>
          <h2 v-else>Reset your password</h2>
          <p class="subtitle">Please choose a new password to continue.</p>

          <form @submit.prevent="handleReset" autocomplete="on">
            <!-- New password -->
            <div class="form-group">
              <label for="password">New Password</label>
              <div class="input-wrap">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Choose a new password"
                  required
                  class="form-input"
                  :disabled="saving"
                  autocomplete="new-password"
                  minlength="6"
                  maxlength="128"
                />
                <button type="button" class="toggle-vis" @click="showPassword = !showPassword" :aria-label="showPassword ? 'Hide password' : 'Show password'">
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
              <PasswordStrengthMeter :password="password" :confirm-password="confirmPassword" />
            </div>

            <!-- Confirm password -->
            <div class="form-group">
              <label for="confirmPassword">Confirm New Password</label>
              <div class="input-wrap">
                <input
                  id="confirmPassword"
                  v-model="confirmPassword"
                  :type="showConfirm ? 'text' : 'password'"
                  placeholder="Re-enter your new password"
                  required
                  class="form-input"
                  :disabled="saving"
                  autocomplete="new-password"
                  minlength="6"
                  maxlength="128"
                />
                <button type="button" class="toggle-vis" @click="showConfirm = !showConfirm" :aria-label="showConfirm ? 'Hide password' : 'Show password'">
                  {{ showConfirm ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <p v-if="formError" class="error-message">{{ formError }}</p>

            <button
              type="submit"
              class="btn btn-primary"
              :disabled="saving || !!passwordMismatch || !password || !confirmPassword"
            >
              {{ saving ? 'Saving…' : 'Reset Password' }}
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
import PasswordStrengthMeter from '../components/PasswordStrengthMeter.vue';

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

const showPassword = ref(false);
const showConfirm = ref(false);

const loginBackground = computed(() => brandingStore.loginBackground);

const passwordMismatch = computed(() =>
  password.value && confirmPassword.value && password.value !== confirmPassword.value
    ? 'Passwords do not match'
    : ''
);

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

    if (!route.params.organizationSlug && resp.data.portalSlug) {
      await brandingStore.fetchAgencyTheme(resp.data.portalSlug);
    }

    loading.value = false;
  } catch (err) {
    if (err?.message?.includes('Unexpected token') || err?.message?.includes('JSON')) {
      error.value = 'This reset link could not be validated. Please request a new password reset link.';
    } else {
      error.value = err.response?.data?.error?.message || err.message || 'Invalid or expired reset link.';
    }
    loading.value = false;
  }
};

const handleReset = async () => {
  if (passwordMismatch.value) {
    formError.value = passwordMismatch.value;
    return;
  }
  if (password.value.length < 6) {
    formError.value = 'Password must be at least 6 characters';
    return;
  }
  if (password.value.length > 128) {
    formError.value = 'Password must be no more than 128 characters';
    return;
  }
  if (!/[a-zA-Z]/.test(password.value)) {
    formError.value = 'Password must contain at least one letter (a–z or A–Z)';
    return;
  }

  saving.value = true;
  formError.value = '';

  try {
    const resp = await api.post(`/auth/reset-password/${encodeURIComponent(token.value)}`, {
      password: password.value
    });

    authStore.setAuth(resp.data.token || null, resp.data.user, resp.data.sessionId);
    sessionStorage.setItem('justLoggedIn', 'true');

    if (authStore.user.role !== 'super_admin' && authStore.user.type !== 'approved_employee') {
      try {
        const { useAgencyStore } = await import('../store/agency');
        const agencyStore = useAgencyStore();
        await agencyStore.fetchUserAgencies();
      } catch (e) {
        // ignore
      }
    }

    setTimeout(() => {
      router.push(getDashboardRoute());
    }, 400);
  } catch (err) {
    formError.value = err.response?.data?.error?.message || err.message || 'Failed to reset password.';
    saving.value = false;
  }
};

onMounted(async () => {
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

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.form-input {
  width: 100%;
  padding: 12px 72px 12px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
  box-sizing: border-box;
}

.toggle-vis {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #6366f1;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.toggle-vis:hover {
  background: #f0f0ff;
}

.error-message {
  color: var(--error, #ef4444);
  font-size: 14px;
  margin: 10px 0;
}
</style>
