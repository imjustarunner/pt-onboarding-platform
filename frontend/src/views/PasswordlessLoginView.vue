<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-logo">
        <img :src="plotTwistCoLogoUrl" alt="PlotTwistCo" class="logo-image" @error="handleLogoError" />
      </div>
      <h2>On-Demand Training Access</h2>
      <p class="subtitle">Enter your approved email to access training</p>
      
      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="requiresVerification" class="verification-message">
        <p>Email verification required. Please check your email for a verification link.</p>
        <p v-if="verificationUrl" class="verification-url">Verification URL: {{ verificationUrl }}</p>
      </div>
      
      <form @submit.prevent="handlePasswordlessLogin" class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            placeholder="Enter your approved email"
            :disabled="loading"
          />
        </div>
        
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Signing in...' : 'Access Training' }}
        </button>
      </form>
      
      <div class="login-help">
        <p>Don't have an approved email? Contact your administrator.</p>
        <router-link to="/login" class="help-link">Regular Login</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import api from '../services/api';

const router = useRouter();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const email = ref('');
const error = ref('');
const loading = ref(false);
const requiresVerification = ref(false);
const verificationUrl = ref('');

const plotTwistCoLogoUrl = computed(() => brandingStore.plotTwistCoLogoUrl);

const handlePasswordlessLogin = async () => {
  error.value = '';
  requiresVerification.value = false;
  verificationUrl.value = '';
  loading.value = true;

  try {
    const response = await api.post('/auth/passwordless-login', { email: email.value });
    
    if (response.data.requiresVerification) {
      requiresVerification.value = true;
      verificationUrl.value = response.data.verificationUrl || '';
      return;
    }

    // Set auth token
    authStore.setAuth(response.data.token, response.data.user);
    
    // Redirect to on-demand training library
    router.push('/on-demand-training');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Login failed';
  } finally {
    loading.value = false;
  }
};

const handleLogoError = (event) => {
  event.target.style.display = 'none';
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
}

.login-card {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 450px;
}

.login-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.login-logo .logo-image {
  height: 60px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}

.login-card h2 {
  text-align: center;
  margin-bottom: 10px;
  color: var(--primary);
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: 24px;
}

.subtitle {
  text-align: center;
  color: #7f8c8d;
  margin-bottom: 30px;
  font-size: 14px;
}

.login-form {
  margin-bottom: 20px;
}

.error {
  color: var(--error);
  background-color: #fee2e2;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 20px;
  font-size: 14px;
}

.verification-message {
  background-color: #e3f2fd;
  border-left: 4px solid var(--primary);
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
  font-size: 14px;
  color: #1976d2;
}

.verification-message p {
  margin: 5px 0;
}

.verification-url {
  font-size: 12px;
  word-break: break-all;
  color: #0d47a1;
}

.login-help {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: #64748b;
}

.login-help p {
  margin-bottom: 10px;
}

.help-link {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}

.help-link:hover {
  text-decoration: underline;
}
</style>

