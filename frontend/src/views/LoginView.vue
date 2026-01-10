<template>
  <BrandingProvider>
    <div class="login-container">
    <div class="login-card">
      <div class="login-logo">
        <img :src="displayLogoUrl" alt="Logo" class="logo-image" @error="handleLogoError" v-if="displayLogoUrl" />
      </div>
      <h2>{{ displayTitle }}</h2>
      <p class="subtitle">Sign in to continue</p>
      
      <div v-if="error" class="error" v-html="formatError(error)"></div>
      
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            placeholder="Enter your email"
          />
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            placeholder="Enter your password"
          />
        </div>
        
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
      
      <div class="login-help">
        <a href="#" @click.prevent="showForgotPassword" class="help-link">Forgot Password?</a>
        <span class="help-separator">|</span>
        <a href="#" @click.prevent="showForgotUsername" class="help-link">Forgot Username?</a>
      </div>
      
      <div v-if="showForgotPasswordMessage" class="help-message">
        <p>Please contact an administrator to reset your password.</p>
        <button @click="showForgotPasswordMessage = false" class="btn-close-help">Close</button>
      </div>
      
      <div v-if="showForgotUsernameMessage" class="help-message">
        <p>Use your company work email to log in. If you don't have one, please contact your administrator.</p>
        <button @click="showForgotUsernameMessage = false" class="btn-close-help">Close</button>
      </div>
      
      <div class="login-info">
        <p><strong>Super Admin (for editing):</strong></p>
        <p>Email: superadmin@plottwistco.com</p>
        <p>Password: superadmin123</p>
        <hr style="margin: 15px 0; border: none; border-top: 1px solid #dee2e6;" />
        <p><strong>Default Admin:</strong></p>
        <p>Email: admin@company.com</p>
        <p>Password: admin123</p>
      </div>
    </div>
  </div>
  </BrandingProvider>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import BrandingProvider from '../components/BrandingProvider.vue';
import { getDashboardRoute } from '../utils/router';

const router = useRouter();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();

const displayLogoUrl = computed(() => brandingStore.displayLogoUrl || brandingStore.plotTwistCoLogoUrl);
const displayTitle = computed(() => {
  const agencyName = brandingStore.portalAgency?.name || 'PlotTwistCo';
  const term = brandingStore.peopleOpsTerm || 'People Operations';
  return `${agencyName} ${term} Platform`;
});
const loginBackground = computed(() => brandingStore.loginBackground);

// Ensure branding is loaded before rendering
onMounted(async () => {
  // Initialize portal theme if on subdomain
  await brandingStore.initializePortalTheme();
  // Fetch platform branding as fallback
  await brandingStore.fetchPlatformBranding();
});

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const showForgotPasswordMessage = ref(false);
const showForgotUsernameMessage = ref(false);

const handleLogin = async () => {
  error.value = '';
  loading.value = true;
  
  const result = await authStore.login(email.value, password.value);
  
  if (result.success) {
    // Fetch user's agencies and set default if not super admin
    if (authStore.user.role !== 'super_admin' && authStore.user.type !== 'approved_employee') {
      await agencyStore.fetchUserAgencies();
    } else if (authStore.user.type === 'approved_employee') {
      // For approved employees, fetch agencies from the login response
      await agencyStore.fetchUserAgencies();
    }
    
    router.push(getDashboardRoute());
  } else {
    error.value = result.error;
  }
  
  loading.value = false;
};

const showForgotPassword = () => {
  showForgotPasswordMessage.value = true;
  showForgotUsernameMessage.value = false;
};

const showForgotUsername = () => {
  showForgotUsernameMessage.value = true;
  showForgotPasswordMessage.value = false;
};

const formatError = (errorText) => {
  // Format error message with line breaks for better readability
  if (!errorText) return '';
  // Convert newlines to HTML breaks
  let formatted = errorText.replace(/\n/g, '<br/>');
  // Add line breaks after periods followed by space and capital letter for long messages
  formatted = formatted.replace(/\. ([A-Z])/g, '.<br/><br/>$1');
  return formatted;
};

const handleLogoError = (event) => {
  // Hide broken image, show text fallback
  event.target.style.display = 'none';
};
</script>

<style>
/* Login page styles - use dynamic theme from branding store */
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  /* Use dynamic background from theme */
  background: var(--agency-login-background, linear-gradient(135deg, #C69A2B 0%, #D4B04A 100%));
  transition: background 0.3s ease;
}

.login-card {
  background: white;
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 400px;
}

.login-card h2 {
  text-align: center;
  margin-bottom: 10px;
  color: var(--agency-primary-color, var(--primary));
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: 28px;
  font-family: var(--agency-font-family, var(--font-body));
}

.subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 30px;
}

.login-form {
  margin-bottom: 20px;
}

.error {
  color: var(--error, #dc2626);
  background-color: #fee2e2;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 20px;
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
}

.login-info {
  margin-top: 30px;
  padding: 15px;
  background-color: var(--bg-alt);
  border-radius: 5px;
  font-size: 14px;
  color: var(--text-primary);
}

.login-info p {
  margin: 5px 0;
}

.btn {
  width: 100%;
  margin-top: 10px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-help {
  text-align: center;
  margin: 15px 0;
  font-size: 14px;
}

.help-link {
  color: var(--agency-primary-color, var(--primary));
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.help-link:hover {
  color: var(--agency-accent-color, var(--accent));
  text-decoration: underline;
}

.help-separator {
  margin: 0 10px;
  color: var(--border, #ccc);
}

.help-message {
  margin-top: 15px;
  padding: 15px;
  background-color: var(--bg-alt);
  border-left: 4px solid var(--agency-primary-color, var(--primary));
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-primary);
}

.help-message p {
  margin: 0 0 10px 0;
}

.btn-close-help {
  background: none;
  border: none;
  color: var(--agency-primary-color, var(--primary));
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
  padding: 0;
}

.btn-close-help:hover {
  color: var(--agency-accent-color, var(--accent));
}
</style>

