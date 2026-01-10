<template>
  <div class="passwordless-login-container">
    <div class="login-card">
      <div v-if="needsIdentityVerification" class="identity-verification">
        <h2>Identity Verification</h2>
        <p>Please enter your last name to continue:</p>
        <form @submit.prevent="verifyAndLogin">
          <input
            v-model="lastName"
            type="text"
            placeholder="Last Name"
            required
            class="form-input"
            :disabled="verifying"
          />
          <button type="submit" class="btn btn-primary" :disabled="verifying || !lastName.trim()">
            {{ verifying ? 'Verifying...' : 'Continue' }}
          </button>
        </form>
        <p v-if="verificationError" class="error-message">{{ verificationError }}</p>
      </div>
      <div v-else-if="loading" class="loading">
        <p>Logging you in...</p>
      </div>
      <div v-else-if="error" class="error">
        <h2>Login Failed</h2>
        <p>{{ error }}</p>
        <router-link to="/login" class="btn btn-primary">Go to Login</router-link>
      </div>
      <div v-else class="success">
        <h2>Login Successful</h2>
        <p>Redirecting...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import api from '../services/api';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref('');
const needsIdentityVerification = ref(false);
const lastName = ref('');
const verifying = ref(false);
const verificationError = ref('');

const attemptLogin = async (lastNameValue = null) => {
  const token = route.params.token;
  
  if (!token) {
    error.value = 'Invalid login link. Token is missing.';
    loading.value = false;
    return;
  }

  // Trim and ensure token is a valid string
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length < 10) {
    error.value = 'Invalid login link. Token format is invalid.';
    loading.value = false;
    return;
  }

  try {
    // Call passwordless login endpoint with optional last name
    const response = await api.post(`/auth/passwordless-login/${encodeURIComponent(cleanToken)}`, {
      lastName: lastNameValue
    });
    
    // Set auth user (token is in HttpOnly cookie, set by backend)
    authStore.setAuth(null, response.data.user, response.data.sessionId);
    
    // If user has agencies, set the first one as current
    if (response.data.agencies && response.data.agencies.length > 0) {
      const { useAgencyStore } = await import('../store/agency');
      const agencyStore = useAgencyStore();
      agencyStore.setCurrentAgency(response.data.agencies[0]);
    }
    
    // Redirect based on user status
    setTimeout(() => {
      if (response.data.user.status === 'pending') {
        // Pending users go to dashboard
        router.push('/dashboard');
      } else {
        // Other users go to password change
        router.push('/change-password?token=' + cleanToken + '&requireChange=true');
      }
    }, 1000);
  } catch (err) {
    // Check if identity verification is required
    if (err.response?.data?.error?.requiresIdentityVerification) {
      needsIdentityVerification.value = true;
      loading.value = false;
    } else {
      const errorMessage = err.response?.data?.error?.message || err.message || 'Invalid or expired login link. Please contact your administrator.';
      console.error('[PasswordlessTokenLoginView] Setting error message:', errorMessage);
      error.value = errorMessage;
      loading.value = false;
    }
  }
};

const verifyAndLogin = async () => {
  if (!lastName.value.trim()) {
    verificationError.value = 'Please enter your last name';
    return;
  }
  
  verifying.value = true;
  verificationError.value = '';
  
  await attemptLogin(lastName.value);
  
  verifying.value = false;
};

onMounted(async () => {
  await attemptLogin();
});
</script>

<style scoped>
.passwordless-login-container {
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
  text-align: center;
}

.loading {
  padding: 20px;
}

.error {
  padding: 20px;
  color: var(--error);
}

.error h2 {
  margin-bottom: 16px;
}

.success {
  padding: 20px;
  color: var(--success);
}

.success h2 {
  margin-bottom: 16px;
}
</style>
