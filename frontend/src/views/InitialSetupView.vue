<template>
  <div class="initial-setup-container" :style="pageStyle">
    <div class="setup-content">
      <div class="setup-card">
        <PasswordRecoveryBrand
          :tenant="tenantBrand"
          :school="schoolBrand"
          :fallback-logo-url="brandingStore.displayLogoUrl || brandingStore.logoUrl"
        />
        <div v-if="loading" class="loading">
          <p>Loading...</p>
        </div>
        <div v-else-if="error" class="error">
          <h2>Setup Error</h2>
          <p>{{ error }}</p>
          <router-link :to="loginTo" class="btn btn-primary">Go to Login</router-link>
        </div>
        <div v-else class="setup-form">
          <h2>Welcome, {{ userFirstName }}!</h2>
          <p class="subtitle">Create your password to get started. You will be signed in automatically after you save it.</p>

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
                  minlength="10"
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
                  minlength="10"
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
              {{ setting ? 'Saving and signing you in…' : 'Create password and continue' }}
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
import { useBrandingStore } from '../store/branding';
import api from '../services/api';
import PoweredByFooter from '../components/PoweredByFooter.vue';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter.vue';
import { checkPasswordBasics } from '../utils/passwordPolicy.js';
import PasswordRecoveryBrand from '../components/PasswordRecoveryBrand.vue';
import { completePasswordTokenLogin } from '../utils/completePasswordTokenLogin.js';

const router = useRouter();
const route = useRoute();
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
const tenantBrand = ref(null);
const schoolBrand = ref(null);

const loginBackground = computed(() => brandingStore.loginBackground);
const pageStyle = computed(() => ({
  background: loginBackground.value || 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)'
}));
const loginTo = computed(() => {
  const slug = route.params.organizationSlug || tenantBrand.value?.slug;
  return slug ? `/${slug}/login` : '/login';
});

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
    tenantBrand.value = response.data?.tenant || null;
    schoolBrand.value = response.data?.school || null;
    const slug = route.params.organizationSlug || response.data?.portalSlug || response.data?.tenant?.slug;
    if (slug) await brandingStore.fetchAgencyTheme(slug);
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
  const basics = checkPasswordBasics(password.value);
  if (!basics.valid) {
    setupError.value = basics.message;
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
    await completePasswordTokenLogin(response.data, router);
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
  background: #fff;
  padding: 36px 32px 32px;
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16);
  width: 100%;
  max-width: 460px;
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
