<template>
  <div class="reset-page" :style="pageStyle">
    <div class="reset-content">
      <div class="reset-card">
        <PasswordRecoveryBrand
          :tenant="tenantBrand"
          :school="schoolBrand"
          :fallback-logo-url="brandingStore.displayLogoUrl || brandingStore.logoUrl"
        />

        <div v-if="loading" class="loading">
          <p>Loading…</p>
        </div>

        <div v-else-if="error" class="error">
          <h2>Reset Error</h2>
          <p>{{ error }}</p>
          <router-link :to="loginTo" class="btn btn-primary">Go to Login</router-link>
        </div>

        <div v-else class="reset-form">
          <h2 v-if="firstName">Hi {{ firstName }},</h2>
          <h2 v-else>Set your password</h2>
          <p class="subtitle">Choose a new password. You will be signed in automatically after you save it.</p>

          <form @submit.prevent="handleReset" autocomplete="on">
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
                  minlength="10"
                  maxlength="128"
                />
                <button type="button" class="toggle-vis" @click="showPassword = !showPassword" :aria-label="showPassword ? 'Hide password' : 'Show password'">
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
              <PasswordStrengthMeter :password="password" :confirm-password="confirmPassword" />
            </div>

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
                  minlength="10"
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
              class="btn btn-primary reset-submit"
              :disabled="saving || !!passwordMismatch || !password || !confirmPassword"
            >
              {{ saving ? 'Saving and signing you in…' : 'Save password and continue' }}
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
const firstName = ref('');
const password = ref('');
const confirmPassword = ref('');
const saving = ref(false);
const formError = ref('');
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

const token = computed(() => {
  const t = route.params.token;
  return typeof t === 'string' ? t : '';
});

const applyBranding = async (data) => {
  tenantBrand.value = data?.tenant || null;
  schoolBrand.value = data?.school || null;
  const slug = route.params.organizationSlug || data?.portalSlug || data?.tenant?.slug;
  if (slug) {
    await brandingStore.fetchAgencyTheme(slug);
  }
};

const validateToken = async () => {
  if (!token.value) {
    error.value = 'Invalid reset link. Token is missing.';
    loading.value = false;
    return;
  }

  try {
    const resp = await api.get(`/auth/validate-reset-token/${encodeURIComponent(token.value)}`);
    firstName.value = resp.data.firstName || '';
    await applyBranding(resp.data);
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
  const basics = checkPasswordBasics(password.value);
  if (!basics.valid) {
    formError.value = basics.message;
    return;
  }

  saving.value = true;
  formError.value = '';

  try {
    const resp = await api.post(`/auth/reset-password/${encodeURIComponent(token.value)}`, {
      password: password.value
    });
    await completePasswordTokenLogin(resp.data, router);
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
.reset-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 32px 16px 16px;
}
.reset-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}
.reset-card {
  background: #fff;
  padding: 36px 32px 32px;
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16);
  width: 100%;
  max-width: 460px;
  text-align: center;
}
.reset-form h2 {
  margin: 0 0 8px;
  color: var(--primary, #0f766e);
  font-weight: 700;
}
.subtitle {
  color: #64748b;
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 1.45;
}
.form-group {
  margin-bottom: 18px;
  text-align: left;
}
.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #0f172a;
  font-weight: 600;
}
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.form-input {
  width: 100%;
  padding: 12px 72px 12px 12px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 16px;
  box-sizing: border-box;
}
.toggle-vis {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--primary, #0f766e);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}
.toggle-vis:hover { background: #f0fdfa; }
.error-message {
  color: var(--error, #ef4444);
  font-size: 14px;
  margin: 10px 0;
}
.reset-submit { width: 100%; margin-top: 8px; }
.error h2 { margin-top: 0; }
</style>
