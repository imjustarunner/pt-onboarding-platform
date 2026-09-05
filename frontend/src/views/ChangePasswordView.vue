<template>
  <div class="pw-page" :style="{ background: loginBackground }">
    <div class="pw-shell">
      <div v-if="loading" class="pw-card pw-card--solo">
        <p>Loading...</p>
      </div>

      <div v-else-if="error" class="pw-card pw-card--solo">
        <h2>Password Change Error</h2>
        <p>{{ error }}</p>
        <router-link to="/login" class="pw-btn pw-btn--primary">Go to Login</router-link>
      </div>

      <div v-else class="pw-card">
        <aside class="pw-aside" aria-label="Account security">
          <div class="pw-aside-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h1>Keep Your Account Secure</h1>
          <p class="pw-aside-lead">
            A strong password helps protect your information and keeps our community safe.
          </p>
          <div v-if="expiryCallout" class="pw-expiry-box" role="status">
            <span class="pw-expiry-icon" aria-hidden="true">⏱</span>
            <div>
              <strong>{{ expiryCallout.title }}</strong>
              <p>{{ expiryCallout.body }}</p>
            </div>
          </div>
          <p class="pw-aside-tagline">Same mission. A more secure tomorrow.</p>
        </aside>

        <section class="pw-form-panel">
          <div class="pw-form-head">
            <h2>Change Password</h2>
            <p>Enter your current password, then create a new one.</p>
            <button
              v-if="canCancel"
              type="button"
              class="pw-close"
              title="Cancel"
              aria-label="Cancel"
              @click="goCancel"
            >
              ×
            </button>
          </div>

          <form @submit.prevent="handleChange" autocomplete="on">
            <div class="form-group">
              <div class="label-row">
                <label for="currentPassword">Current Password</label>
                <router-link class="forgot-link" to="/forgot-password">Forgot password?</router-link>
              </div>
              <div class="input-wrap">
                <input
                  id="currentPassword"
                  v-model="currentPassword"
                  :type="showCurrent ? 'text' : 'password'"
                  placeholder="Enter your current password"
                  required
                  class="form-input"
                  :disabled="saving"
                  autocomplete="current-password"
                  minlength="10"
                  maxlength="128"
                />
                <button
                  type="button"
                  class="toggle-vis"
                  :aria-label="showCurrent ? 'Hide password' : 'Show password'"
                  @click="showCurrent = !showCurrent"
                >
                  {{ showCurrent ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <div class="form-group">
              <label for="newPassword">New Password</label>
              <div class="input-wrap">
                <input
                  id="newPassword"
                  v-model="newPassword"
                  :type="showNew ? 'text' : 'password'"
                  placeholder="Choose a new password"
                  required
                  class="form-input"
                  :disabled="saving"
                  autocomplete="new-password"
                  minlength="10"
                  maxlength="128"
                />
                <button
                  type="button"
                  class="toggle-vis"
                  :aria-label="showNew ? 'Hide password' : 'Show password'"
                  @click="showNew = !showNew"
                >
                  {{ showNew ? 'Hide' : 'Show' }}
                </button>
              </div>
              <PasswordStrengthMeter :password="newPassword" :confirm-password="confirmPassword" />
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
                <button
                  type="button"
                  class="toggle-vis"
                  :aria-label="showConfirm ? 'Hide password' : 'Show password'"
                  @click="showConfirm = !showConfirm"
                >
                  {{ showConfirm ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <p v-if="formError" class="error-message">{{ formError }}</p>

            <div class="pw-actions">
              <button v-if="canCancel" type="button" class="pw-btn pw-btn--ghost" :disabled="saving" @click="goCancel">
                Cancel
              </button>
              <button
                type="submit"
                class="pw-btn pw-btn--primary"
                :disabled="saving || !!passwordMismatch || !currentPassword || !newPassword || !confirmPassword"
              >
                {{ saving ? 'Saving…' : 'Update Password' }}
              </button>
            </div>
          </form>
        </section>
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
import { checkPasswordBasics } from '../utils/passwordPolicy.js';

const POLICY_DAYS = 120;

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const loading = ref(false);
const error = ref('');
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const saving = ref(false);
const formError = ref('');

const showCurrent = ref(false);
const showNew = ref(false);
const showConfirm = ref(false);

const loginBackground = computed(() => brandingStore.loginBackground);
const passwordMismatch = computed(() =>
  newPassword.value && confirmPassword.value && newPassword.value !== confirmPassword.value
    ? 'Passwords do not match'
    : ''
);

const user = computed(() => authStore.user || null);
const forcedChange = computed(() => user.value?.requiresPasswordChange === true);
const passwordExpired = computed(() => user.value?.passwordExpired === true);
const canCancel = computed(() => !forcedChange.value);

const expiryCallout = computed(() => {
  const days = Number(user.value?.passwordPolicyDays) || POLICY_DAYS;
  if (passwordExpired.value) {
    return {
      title: `Your password expired because of the ${days}-day limit.`,
      body: 'Please create a new password to continue.'
    };
  }
  if (forcedChange.value) {
    return {
      title: 'You must set a new password before continuing.',
      body: 'This may be a temporary password from your administrator, or your previous password expired.'
    };
  }
  if (user.value?.passwordExpiresSoon && user.value?.passwordExpiresInDays != null) {
    const n = Number(user.value.passwordExpiresInDays);
    return {
      title: `Your password expires in ${n} day${n === 1 ? '' : 's'}.`,
      body: `Passwords must be changed every ${days} days.`
    };
  }
  return null;
});

function goCancel() {
  router.push(getDashboardRoute());
}

const handleChange = async () => {
  if (passwordMismatch.value) {
    formError.value = passwordMismatch.value;
    return;
  }
  const basics = checkPasswordBasics(newPassword.value);
  if (!basics.valid) {
    formError.value = basics.message.replace(/^Password/, 'New password');
    return;
  }

  saving.value = true;
  formError.value = '';

  try {
    await api.post('/users/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    });

    try {
      await authStore.refreshUser();
    } catch {
      // ignore
    }

    setTimeout(() => {
      router.push(getDashboardRoute());
    }, 250);
  } catch (err) {
    formError.value = err.response?.data?.error?.message || err.message || 'Failed to change password.';
    saving.value = false;
  }
};

onMounted(async () => {
  if (route.params.organizationSlug) {
    await brandingStore.fetchAgencyTheme(route.params.organizationSlug);
  }

  if (!authStore.user) {
    try {
      await authStore.refreshUser();
    } catch {
      // ignore
    }
  }

  if (!authStore.user) {
    error.value = 'Your session was not established. Please click your login link again, or contact your administrator for a new link.';
  }
});
</script>

<style scoped>
.pw-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 24px 16px;
}

.pw-shell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pw-card {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(280px, 420px);
  width: 100%;
  max-width: 780px;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
}

.pw-card--solo {
  display: block;
  max-width: 440px;
  padding: 36px 28px;
  text-align: center;
}

.pw-aside {
  background: linear-gradient(165deg, #eef4f8 0%, #e4edf5 55%, #dce8f2 100%);
  padding: 36px 28px 28px;
  color: #0f2a44;
  position: relative;
}

.pw-aside-icon {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  background: #d6e6f3;
  color: #163a5f;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}

.pw-aside h1 {
  margin: 0 0 10px;
  font-size: 1.35rem;
  line-height: 1.25;
  color: #123354;
}

.pw-aside-lead {
  margin: 0 0 18px;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #3d5a73;
}

.pw-expiry-box {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #d9e8f4;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 20px;
}

.pw-expiry-box strong {
  display: block;
  font-size: 0.9rem;
  color: #123354;
  margin-bottom: 4px;
}

.pw-expiry-box p {
  margin: 0;
  font-size: 0.82rem;
  color: #3d5a73;
  line-height: 1.4;
}

.pw-expiry-icon {
  font-size: 1.1rem;
  line-height: 1.2;
}

.pw-aside-tagline {
  margin: 28px 0 0;
  font-size: 0.85rem;
  font-style: italic;
  color: #2f6f9c;
  border-bottom: 2px solid #6bbf8a;
  display: inline-block;
  padding-bottom: 4px;
}

.pw-form-panel {
  padding: 32px 28px 28px;
  position: relative;
  text-align: left;
}

.pw-form-head {
  margin-bottom: 20px;
  padding-right: 28px;
}

.pw-form-head h2 {
  margin: 0 0 6px;
  color: #123354;
  font-size: 1.4rem;
}

.pw-form-head p {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}

.pw-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 1.4rem;
  color: #64748b;
  cursor: pointer;
  border-radius: 8px;
}
.pw-close:hover {
  background: #f1f5f9;
}

.form-group {
  margin-bottom: 16px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #1e293b;
  font-weight: 600;
  font-size: 0.9rem;
}

.label-row label {
  margin-bottom: 0;
}

.forgot-link {
  font-size: 0.8rem;
  color: #2f6f9c;
  text-decoration: none;
  font-weight: 500;
}
.forgot-link:hover {
  text-decoration: underline;
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
  border-radius: 8px;
  font-size: 16px;
  box-sizing: border-box;
  background: #fff;
}
.form-input:focus {
  outline: none;
  border-color: #3d8ab5;
  box-shadow: 0 0 0 3px rgba(61, 138, 181, 0.15);
}

.toggle-vis {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #2f6f9c;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}
.toggle-vis:hover {
  background: #eef6fb;
}

.error-message {
  color: #ef4444;
  font-size: 14px;
  margin: 8px 0 12px;
}

.pw-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.pw-btn {
  border-radius: 8px;
  padding: 11px 18px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.pw-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.pw-btn--primary {
  background: #4a9a8a;
  color: #fff;
  border-color: #4a9a8a;
}
.pw-btn--primary:hover:not(:disabled) {
  background: #3d8678;
}
.pw-btn--ghost {
  background: #fff;
  color: #334155;
  border-color: #cbd5e1;
}
.pw-btn--ghost:hover:not(:disabled) {
  background: #f8fafc;
}

@media (max-width: 720px) {
  .pw-card {
    grid-template-columns: 1fr;
    max-width: 440px;
  }
  .pw-aside {
    padding-bottom: 20px;
  }
  .pw-aside-tagline {
    margin-top: 12px;
  }
}
</style>
