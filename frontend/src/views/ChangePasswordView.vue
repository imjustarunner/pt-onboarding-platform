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

          <form @submit.prevent="handleChange">
            <div class="form-group">
              <label for="currentPassword">Temporary / Current Password</label>
              <input
                id="currentPassword"
                v-model="currentPassword"
                type="password"
                placeholder="Enter your temporary password"
                required
                class="form-input"
                :disabled="saving"
                minlength="6"
              />
            </div>

            <div class="form-group">
              <label for="newPassword">New Password</label>
              <input
                id="newPassword"
                v-model="newPassword"
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
              :disabled="saving || passwordMismatch || !currentPassword || !newPassword || !confirmPassword"
            >
              {{ saving ? 'Saving...' : 'Set Password' }}
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

const loading = ref(false);
const error = ref('');
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const saving = ref(false);
const formError = ref('');

const loginBackground = computed(() => brandingStore.loginBackground);
const passwordMismatch = computed(() => newPassword.value && confirmPassword.value && newPassword.value !== confirmPassword.value);

const handleChange = async () => {
  if (passwordMismatch.value) {
    formError.value = 'Passwords do not match';
    return;
  }
  if ((newPassword.value || '').length < 6) {
    formError.value = 'New password must be at least 6 characters';
    return;
  }

  saving.value = true;
  formError.value = '';

  try {
    await api.post('/users/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    });

    // Best-effort refresh user (so UI reflects any status changes)
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
  // If org-scoped, load theme
  if (route.params.organizationSlug) {
    await brandingStore.fetchAgencyTheme(route.params.organizationSlug);
  }

  // If user isn't authenticated yet, try a refresh (cookie timing)
  if (!authStore.user) {
    try {
      await authStore.refreshUser();
    } catch {
      // ignore
    }
  }

  // If still not authenticated, show error (user must use the link again)
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
  margin-bottom: 16px;
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

