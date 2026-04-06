<template>
  <div class="reset-container" :style="{ background: loginBackground }">
    <div class="reset-content">
      <div class="reset-card">
        <div v-if="loading" class="loading">
          <p>Loading...</p>
        </div>

        <div v-else-if="error" class="error">
          <h2>Password Change Error</h2>
          <p>{{ error }}</p>
          <router-link to="/login" class="btn btn-primary">Go to Login</router-link>
        </div>

        <div v-else class="reset-form">
          <h2>Set your password</h2>
          <p class="subtitle">
            Enter your temporary password (from your welcome email), then choose a new password.
          </p>

          <form @submit.prevent="handleChange" autocomplete="on">
            <!-- Current / temporary password -->
            <div class="form-group">
              <label for="currentPassword">Temporary / Current Password</label>
              <div class="input-wrap">
                <input
                  id="currentPassword"
                  v-model="currentPassword"
                  :type="showCurrent ? 'text' : 'password'"
                  placeholder="Enter your temporary password"
                  required
                  class="form-input"
                  :disabled="saving"
                  autocomplete="current-password"
                  minlength="6"
                  maxlength="128"
                />
                <button type="button" class="toggle-vis" @click="showCurrent = !showCurrent" :aria-label="showCurrent ? 'Hide password' : 'Show password'">
                  {{ showCurrent ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <!-- New password + strength meter -->
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
                  minlength="6"
                  maxlength="128"
                />
                <button type="button" class="toggle-vis" @click="showNew = !showNew" :aria-label="showNew ? 'Hide password' : 'Show password'">
                  {{ showNew ? 'Hide' : 'Show' }}
                </button>
              </div>
              <PasswordStrengthMeter :password="newPassword" :confirm-password="confirmPassword" />
            </div>

            <!-- Confirm new password -->
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
              :disabled="saving || !!passwordMismatch || !currentPassword || !newPassword || !confirmPassword"
            >
              {{ saving ? 'Saving…' : 'Set Password' }}
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

const handleChange = async () => {
  if (passwordMismatch.value) {
    formError.value = passwordMismatch.value;
    return;
  }
  if ((newPassword.value || '').length < 6) {
    formError.value = 'New password must be at least 6 characters';
    return;
  }
  if ((newPassword.value || '').length > 128) {
    formError.value = 'New password must be no more than 128 characters';
    return;
  }
  if (!/[a-zA-Z]/.test(newPassword.value)) {
    formError.value = 'New password must contain at least one letter (a–z or A–Z)';
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
  margin-bottom: 22px;
  font-size: 14px;
  line-height: 1.5;
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

/* Input + show/hide button wrapper */
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
