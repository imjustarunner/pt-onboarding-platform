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
          
          <form @submit.prevent="handleSetup">
            <div class="form-group">
              <label for="password">Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                placeholder="Enter your password"
                required
                class="form-input"
                :disabled="setting"
                minlength="6"
              />
            </div>
            
            <div class="form-group">
              <label for="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                required
                class="form-input"
                :disabled="setting"
                minlength="6"
              />
            </div>
            
            <p v-if="passwordMismatch" class="error-message">Passwords do not match</p>
            <p v-if="setupError" class="error-message">{{ setupError }}</p>
            
            <button type="submit" class="btn btn-primary" :disabled="setting || passwordMismatch || !password || !confirmPassword">
              {{ setting ? 'Setting Password...' : 'Create Password' }}
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
import PoweredByFooter from '../components/PoweredByFooter.vue';

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

const passwordMismatch = computed(() => {
  return password.value && confirmPassword.value && password.value !== confirmPassword.value;
});

const loginBackground = computed(() => brandingStore.loginBackground);

const validateToken = async () => {
  const token = route.params.token;
  
  if (!token) {
    error.value = 'Invalid setup link. Token is missing.';
    loading.value = false;
    return;
  }

  try {
    const response = await api.get(`/auth/validate-setup-token/${encodeURIComponent(token)}`);
    userFirstName.value = response.data.firstName || 'User';
    loading.value = false;
  } catch (err) {
    const errorMessage = err.response?.data?.error?.message || err.message || 'Invalid or expired setup link. Please contact your administrator.';
    error.value = errorMessage;
    loading.value = false;
  }
};

const handleSetup = async () => {
  if (passwordMismatch.value) {
    setupError.value = 'Passwords do not match';
    return;
  }

  if (password.value.length < 6) {
    setupError.value = 'Password must be at least 6 characters';
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
    
    // Set auth user (token is in HttpOnly cookie, set by backend)
    authStore.setAuth(null, response.data.user, response.data.sessionId);
    
    // Mark that we just logged in to help with cookie timing issues
    sessionStorage.setItem('justLoggedIn', 'true');
    
    // Fetch user's agencies and store them for future login redirects
    if (authStore.user.role !== 'super_admin' && authStore.user.type !== 'approved_employee') {
      try {
        const { useAgencyStore } = await import('../store/agency');
        const agencyStore = useAgencyStore();
        await agencyStore.fetchUserAgencies();
        // Agencies are now stored in localStorage by fetchUserAgencies
      } catch (err) {
        console.error('Failed to fetch user agencies after initial setup:', err);
        // Don't block redirect on agency fetch failure
      }
    } else if (response.data.agencies && response.data.agencies.length > 0) {
      // For approved employees or if agencies are in response
      const { useAgencyStore } = await import('../store/agency');
      const agencyStore = useAgencyStore();
      agencyStore.setCurrentAgency(response.data.agencies[0]);
      // Store agencies for future login redirects
      const { storeUserAgencies } = await import('../utils/loginRedirect');
      storeUserAgencies(response.data.agencies);
    }
    
    // Redirect to dashboard
    setTimeout(() => {
      router.push('/dashboard');
    }, 500);
  } catch (err) {
    const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to set password. Please try again.';
    setupError.value = errorMessage;
    setting.value = false;
  }
};

onMounted(async () => {
  // If this setup link is org-scoped, load org theme for branded experience
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

.form-input {
  width: 100%;
  padding: 12px;
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
