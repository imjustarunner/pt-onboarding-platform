<template>
  <div class="login-page">
    <div class="login-container" :style="{ background: loginBackground }">
      <div class="login-card">
        <div class="login-logo">
          <img :src="displayLogoUrl" alt="Logo" class="logo-image" @error="handleLogoError" v-if="displayLogoUrl" />
        </div>
        <h2>{{ displayTitle }}</h2>
        <p class="subtitle">Sign in to continue</p>
        
        <div v-if="error" class="error" v-html="formatError(error)"></div>

        <button
          v-if="showGoogleButton"
          type="button"
          class="btn btn-secondary"
          :disabled="loading || loadingOrgPolicy"
          @click="continueWithGoogle"
        >
          {{ loadingOrgPolicy ? 'Loading...' : 'Continue with Google' }}
        </button>
        
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
      </div>
    </div>
    <PoweredByFooter />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import PoweredByFooter from '../components/PoweredByFooter.vue';
import api from '../services/api';
import { getDashboardRoute } from '../utils/router';

// Removed hardcoded credentials for security
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();

// Check if this is an organization-specific login page (supports both legacy agencySlug and new organizationSlug)
const loginSlug = computed(() => {
  if (route.meta?.organizationSlug && route.params?.organizationSlug) return route.params.organizationSlug;
  if (route.meta?.agencySlug && route.params?.agencySlug) return route.params.agencySlug;
  return null;
});
const isOrgLogin = computed(() => !!loginSlug.value);

// Agency login theme data
const loginTheme = ref(null);
const loadingTheme = ref(false);

// Logo and title for agency login
const displayLogoUrl = computed(() => {
  if (isOrgLogin.value && loginTheme.value?.agency?.logoUrl) {
    return loginTheme.value.agency.logoUrl;
  }
  // IMPORTANT: don't fall back to PlotTwistCo on the regular login page.
  // If branding hasn't loaded yet, show nothing instead of flashing the wrong logo.
  return brandingStore.displayLogoUrl;
});

const displayTitle = computed(() => {
  if (isOrgLogin.value && loginTheme.value?.agency?.name) {
    const term = brandingStore.peopleOpsTerm || 'People Operations';
    return `${loginTheme.value.agency.name} ${term} Platform`;
  }
  const agencyName = brandingStore.portalAgency?.name || brandingStore.platformBranding?.organization_name || '';
  const term = brandingStore.peopleOpsTerm || 'People Operations';
  if (!agencyName) {
    return `${term} Platform`;
  }
  return `${agencyName} ${term} Platform`;
});

const loginBackground = computed(() => {
  if (isOrgLogin.value && loginTheme.value?.agency?.themeSettings?.loginBackground) {
    return loginTheme.value.agency.themeSettings.loginBackground;
  }
  return brandingStore.loginBackground;
});

// Platform branding for "powered by" footer
const platformOrgName = computed(() => {
  if (isOrgLogin.value && loginTheme.value?.platform?.organizationName) {
    return loginTheme.value.platform.organizationName;
  }
  return brandingStore.platformBranding?.organization_name || '';
});

// Fetch agency-specific login theme
const fetchLoginTheme = async (portalUrl) => {
  try {
    loadingTheme.value = true;
    const response = await api.get(`/agencies/portal/${portalUrl}/login-theme`);
    loginTheme.value = response.data;
    // Apply org theme so CSS variables (colors/background/fonts) match the org on /{slug}/login
    brandingStore.setPortalThemeFromLoginTheme(response.data);
  } catch (error) {
    console.error('Failed to fetch login theme:', error);
    // If agency not found, redirect to default login
    if (error.response?.status === 404) {
      router.replace('/login');
    }
  } finally {
    loadingTheme.value = false;
  }
};

// Ensure branding is loaded before rendering
onMounted(async () => {
  // If we were redirected back from Google callback with an error, show it.
  if (route.query?.error) {
    error.value = String(route.query.error);
  }

  if (isOrgLogin.value && loginSlug.value) {
    // Fetch agency-specific login theme
    await fetchLoginTheme(loginSlug.value);
    await loadOrgPolicy();
  } else {
    // Platform login: ensure no stale org theme sticks around
    brandingStore.clearPortalTheme();
    // Initialize portal theme if on subdomain (separate from slug-based org logins)
    await brandingStore.initializePortalTheme();
  }
});

// If the slug changes while this view is mounted, refresh the login theme
watch(loginSlug, async (newSlug, oldSlug) => {
  if (newSlug && newSlug !== oldSlug) {
    await fetchLoginTheme(newSlug);
    await loadOrgPolicy();
  }
  if (!newSlug && oldSlug) {
    loginTheme.value = null;
    brandingStore.clearPortalTheme();
    orgPolicy.value = { googleSsoEnabled: false };
  }
});

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const showForgotPasswordMessage = ref(false);
const showForgotUsernameMessage = ref(false);
const lastErrorCode = ref(null);
const loadingOrgPolicy = ref(false);
const orgPolicy = ref({ googleSsoEnabled: false });

const showGoogleButton = computed(() => {
  if (!isOrgLogin.value) return false;
  return orgPolicy.value?.googleSsoEnabled === true || lastErrorCode.value === 'SSO_REQUIRED';
});

const continueWithGoogle = () => {
  if (!loginSlug.value) return;
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  window.location.href = `${base}/auth/google/start?orgSlug=${encodeURIComponent(String(loginSlug.value).trim().toLowerCase())}`;
};

const loadOrgPolicy = async () => {
  if (!isOrgLogin.value || !loginSlug.value) {
    orgPolicy.value = { googleSsoEnabled: false };
    return;
  }
  try {
    loadingOrgPolicy.value = true;
    const resp = await api.get(`/agencies/slug/${String(loginSlug.value).trim().toLowerCase()}`);
    const org = resp?.data || null;
    const rawFlags = org?.feature_flags ?? null;
    const flags =
      rawFlags && typeof rawFlags === 'string'
        ? (() => { try { return JSON.parse(rawFlags); } catch { return {}; } })()
        : (rawFlags && typeof rawFlags === 'object' ? rawFlags : {});
    orgPolicy.value = {
      googleSsoEnabled: flags?.googleSsoEnabled === true
    };
  } catch {
    orgPolicy.value = { googleSsoEnabled: false };
  } finally {
    loadingOrgPolicy.value = false;
  }
};

const handleLogin = async () => {
  error.value = '';
  lastErrorCode.value = null;
  loading.value = true;
  
  const result = await authStore.login(email.value, password.value, loginSlug.value);
  
  if (result.success) {
    // Fetch user's agencies and set default if not super admin
    if (authStore.user.role !== 'super_admin' && authStore.user.type !== 'approved_employee') {
      await agencyStore.fetchUserAgencies();
    } else if (authStore.user.type === 'approved_employee') {
      // For approved employees, fetch agencies from the login response
      await agencyStore.fetchUserAgencies();
    }

    if (authStore.user?.requiresPasswordChange) {
      router.push('/change-password');
      loading.value = false;
      return;
    }

    router.push(getDashboardRoute());
  } else {
    error.value = result.error;
    lastErrorCode.value = result.code || null;
  }
  
  loading.value = false;
};

const showForgotPassword = () => {
  showForgotPasswordMessage.value = true;
  showForgotUsernameMessage.value = false;
};

const showForgotUsername = () => {
    // Agencies are now stored in localStorage by fetchUserAgencies for future login redirects
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
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
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

.login-logo {
  margin-bottom: 30px;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.login-logo .logo-image {
  height: 180px;
  max-height: 180px;
  width: auto;
  object-fit: contain;
}

.login-card h2 {
  text-align: center;
  margin-bottom: 10px;
  color: var(--primary-color, var(--primary, #C69A2B));
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

.btn-secondary {
  background: var(--bg-alt);
  color: var(--text-primary);
  border: 1px solid var(--border, #e5e7eb);
}

.btn-secondary:hover:not(:disabled) {
  filter: brightness(0.98);
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
  color: var(--primary-color, var(--primary, #C69A2B));
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.help-link:hover {
  color: var(--accent-color, var(--accent, #3A4C6B));
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
  border-left: 4px solid var(--primary-color, var(--primary, #C69A2B));
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
  color: var(--primary-color, var(--primary, #C69A2B));
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
  padding: 0;
}

.btn-close-help:hover {
  color: var(--accent-color, var(--accent, #3A4C6B));
}
</style>

