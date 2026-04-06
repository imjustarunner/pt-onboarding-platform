<template>
  <div class="initial-setup-container" :style="{ background: loginBackground }">
    <div class="setup-content">
      <div class="setup-card">
        <div v-if="loading" class="loading">
          <p>Loading...</p>
        </div>
        <div v-else-if="error" class="error">
          <h2>Setup Error</h2>
          <p>{{ error }}</p>
          <router-link to="/login" class="btn btn-primary">Go to Login</router-link>
        </div>
        <div v-else class="setup-form">
          <h2>Welcome, {{ userFirstName }}!</h2>
          <p class="subtitle">Create your password to get started</p>

          <form @submit.prevent="handleSetup" autocomplete="on">
            <!-- New password -->
            <div class="form-group">
              <label for="password">Password</label>
              <div class="input-wrap">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Choose your password"
                  required
                  class="form-input"
                  :disabled="setting"
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
              <label for="confirmPassword">Confirm Password</label>
              <div class="input-wrap">
                <input
                  id="confirmPassword"
                  v-model="confirmPassword"
                  :type="showConfirm ? 'text' : 'password'"
                  placeholder="Re-enter your password"
                  required
                  class="form-input"
                  :disabled="setting"
                  autocomplete="new-password"
                  minlength="6"
                  maxlength="128"
                />
                <button type="button" class="toggle-vis" @click="showConfirm = !showConfirm" :aria-label="showConfirm ? 'Hide password' : 'Show password'">
                  {{ showConfirm ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <p v-if="setupError" class="error-message">{{ setupError }}</p>

            <button
              type="submit"
              class="btn btn-primary"
              :disabled="setting || !!passwordMismatch || !password || !confirmPassword"
            >
              {{ setting ? 'Setting Password…' : 'Create Password' }}
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
const userFirstName = ref('');
const password = ref('');
const confirmPassword = ref('');
const setting = ref(false);
const setupError = ref('');

const showPassword = ref(false);
const showConfirm = ref(false);

const loginBackground = computed(() => brandingStore.loginBackground);

const passwordMismatch = computed(() =>
  password.value && confirmPassword.value && password.value !== confirmPassword.value
    ? 'Passwords do not match'
    : ''
);

const validateToken = async () => {
  const token = route.params.token;

  if (!token) {
    error.value = 'Invalid setup link. Token is missing.';
    loading.value = false;
    return;
  }

  try {
    const response = await api.get(`/auth/validate-setup-token/${encodeURIComponent(token)}`);
    const first = response.data.firstName || 'User';
    const preferred = String(response.data?.preferredName || '').trim();
    userFirstName.value = preferred ? `${first} "${preferred}"` : first;
    loading.value = false;
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Invalid or expired setup link. Please contact your administrator.';
    loading.value = false;
  }
};

const handleSetup = async () => {
  if (passwordMismatch.value) {
    setupError.value = passwordMismatch.value;
    return;
  }
  if (password.value.length < 6) {
    setupError.value = 'Password must be at least 6 characters';
    return;
  }
  if (password.value.length > 128) {
    setupError.value = 'Password must be no more than 128 characters';
    return;
  }
  if (!/[a-zA-Z]/.test(password.value)) {
    setupError.value = 'Password must contain at least one letter (a–z or A–Z)';
    return;
  }

  const token = route.params.token;
  if (!token) {
    setupError.value = 'Invalid setup link';
    return;
  }

  setting.value = true;
  setupError.value = '';

  try {
    const response = await api.post(`/auth/initial-setup/${encodeURIComponent(token)}`, {
      password: password.value
    });

    authStore.setAuth(null, response.data.user, response.data.sessionId);
    sessionStorage.setItem('justLoggedIn', 'true');

    if (authStore.user.role !== 'super_admin' && authStore.user.type !== 'approved_employee') {
      try {
        const { useAgencyStore } = await import('../store/agency');
        const agencyStore = useAgencyStore();
        await agencyStore.fetchUserAgencies();
      } catch (err) {
        console.error('Failed to fetch user agencies after initial setup:', err);
      }
    } else if (response.data.agencies && response.data.agencies.length > 0) {
      const { useAgencyStore } = await import('../store/agency');
      const agencyStore = useAgencyStore();
      agencyStore.setCurrentAgency(response.data.agencies[0]);
      const { storeUserAgencies } = await import('../utils/loginRedirect');
      storeUserAgencies(response.data.agencies);
    }

    setTimeout(() => {
      router.push(getDashboardRoute());
    }, 500);
  } catch (err) {
    setupError.value = err.response?.data?.error?.message || err.message || 'Failed to set password. Please try again.';
    setting.value = false;
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
.initial-setup-container {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  min-height: 100vh;
  padding: 24px 16px;
}

.setup-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.setup-card {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 450px;
  text-align: center;
}

.setup-form h2 {
  margin-bottom: 8px;
  color: var(--primary);
  font-weight: 700;
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

/* Input + show/hide wrapper */
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

.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(198, 154, 43, 0.1);
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

.btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.3s;
}

.btn-primary {
  background-color: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-dark);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  color: var(--error);
  margin-top: 10px;
  font-size: 14px;
}

.loading, .error {
  padding: 20px;
}

.error h2 {
  margin-bottom: 16px;
  color: var(--error);
}
</style>
