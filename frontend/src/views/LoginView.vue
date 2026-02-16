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

        <form @submit.prevent="handleSubmit" class="login-form">
          <div class="form-group">
            <label for="username">Username</label>
            <input
              id="username"
              v-model="username"
              type="text"
              required
              placeholder="Enter your username"
              autocomplete="username"
              :disabled="loading || verifying"
              @input="onUsernameInput"
              @blur="maybeVerify"
            />
          </div>

          <div v-if="needsOrgChoice" class="form-group">
            <label for="orgChoice">Choose your organization</label>
            <select id="orgChoice" v-model="selectedOrgSlug" :disabled="verifying || loading" required>
              <option disabled value="">Select an organization</option>
              <option v-for="o in orgOptions" :key="o.portal_url || o.slug || o.id" :value="(o.portal_url || o.slug || '').toLowerCase()">
                {{ o.name }}{{ o.organization_type ? ` (${o.organization_type})` : '' }}
              </option>
            </select>
          </div>
          
          <div v-if="showPassword && !needsOrgChoice" class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              placeholder="Enter your password"
              autocomplete="current-password"
              :disabled="loading"
            />
          </div>

          <div v-if="!isOrgLogin && !needsOrgChoice" class="remember-row">
            <label class="remember-me">
              <input type="checkbox" v-model="rememberLogin" :disabled="verifying || loading" />
              Remember me
            </label>
          </div>
          
          <button v-if="needsOrgChoice" type="submit" class="btn btn-primary" :disabled="verifying || loading || !selectedOrgSlug">
            {{ verifying ? 'Verifying…' : 'Continue' }}
          </button>

          <button v-else-if="!showPassword" type="submit" class="btn btn-primary" :disabled="verifying || loading || !username.trim()">
            {{ verifying ? 'Verifying…' : 'Verify' }}
          </button>

          <button v-else type="submit" class="btn btn-primary" :disabled="loading">
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>

          <button
            v-if="showPassword && !needsOrgChoice"
            type="button"
            class="btn btn-secondary"
            :disabled="loading || verifying"
            @click="resetToUsernameStep"
          >
            Change username
          </button>
        </form>
        
        <div class="login-help">
          <a href="#" @click.prevent="showForgotPassword" class="help-link">Forgot Password?</a>
          <span class="help-separator">|</span>
          <a href="#" @click.prevent="showForgotUsername" class="help-link">Forgot Username?</a>
        </div>
        
        <!-- Forgot Password Modal -->
        <div v-if="showForgotPasswordMessage" class="modal-overlay" @click.self="closeRecoveryModals">
          <div class="modal">
            <h3>Reset your password</h3>
            <p class="modal-subtitle">Enter the email you use to sign in. We'll email you a reset link.</p>
            <form @submit.prevent="submitForgotPassword" class="modal-form">
              <div class="form-group">
                <label for="forgotEmail">Email</label>
                <input id="forgotEmail" v-model="forgotPasswordEmail" type="email" required placeholder="name@company.com" />
              </div>
              <div v-if="recoveryError" class="error">{{ recoveryError }}</div>
              <div v-if="recoverySuccess" class="success">{{ recoverySuccess }}</div>
              <div v-if="recoveryDebug?.resetLink" class="debug">
                <p><strong>Dev test link:</strong></p>
                <a :href="recoveryDebug.resetLink" target="_blank" rel="noopener noreferrer">{{ recoveryDebug.resetLink }}</a>
                <p class="debug-note">This only appears outside production, when email sending is skipped or misconfigured.</p>
              </div>
              <button type="submit" class="btn btn-primary" :disabled="recoveryLoading">
                {{ recoveryLoading ? 'Sending…' : 'Send reset link' }}
              </button>
              <button type="button" class="btn btn-secondary" @click="closeRecoveryModals" :disabled="recoveryLoading">Cancel</button>
            </form>
          </div>
        </div>

        <!-- Forgot Username Modal -->
        <div v-if="showForgotUsernameMessage" class="modal-overlay" @click.self="closeRecoveryModals">
          <div class="modal">
            <h3>Recover your username</h3>
            <p class="modal-subtitle">Enter your name and role. If we find a match, we'll email your username.</p>
            <form @submit.prevent="submitForgotUsername" class="modal-form">
              <div class="form-row">
                <div class="form-group">
                  <label for="firstName">First name</label>
                  <input id="firstName" v-model="recoverFirstName" type="text" required placeholder="First name" />
                </div>
                <div class="form-group">
                  <label for="lastName">Last name</label>
                  <input id="lastName" v-model="recoverLastName" type="text" required placeholder="Last name" />
                </div>
              </div>
              <div class="form-group">
                <label for="role">Role</label>
                <select id="role" v-model="recoverRole" required>
                  <option disabled value="">Select your role</option>
                  <option value="provider">Provider</option>
                  <option value="intern">Intern</option>
                  <option value="staff">Staff</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                  <option value="support">Support</option>
                  <option value="clinical_practice_assistant">Clinical Practice Assistant</option>
                  <option value="school_staff">School Staff</option>
                  <option value="client_guardian">Guardian</option>
                  <option value="facilitator">Facilitator</option>
                </select>
              </div>
              <div v-if="recoveryError" class="error">{{ recoveryError }}</div>
              <div v-if="recoverySuccess" class="success">{{ recoverySuccess }}</div>
              <button type="submit" class="btn btn-primary" :disabled="recoveryLoading">
                {{ recoveryLoading ? 'Sending…' : 'Email my username' }}
              </button>
              <button type="button" class="btn btn-secondary" @click="closeRecoveryModals" :disabled="recoveryLoading">Cancel</button>
            </form>
          </div>
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
import { getBackendBaseUrl } from '../utils/uploadsUrl';
import { getDashboardRoute } from '../utils/router';
import { getRememberedLogin, setRememberedLogin, clearRememberedLogin } from '../utils/loginRemember';

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
    return `${loginTheme.value.agency.name} ${term}`;
  }
  const agencyName = brandingStore.portalAgency?.name || brandingStore.platformBranding?.organization_name || '';
  const term = brandingStore.peopleOpsTerm || 'People Operations';
  if (!agencyName) {
    return `${term}`;
  }
  return `${agencyName} ${term}`;
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
  } else {
    // Platform login: ensure no stale org theme sticks around.
    // On custom-domain portals (or <portal>.app.<base> portals), /login should remain branded.
    if (!brandingStore.portalHostPortalUrl) {
      brandingStore.clearPortalTheme();
    }
    // Initialize portal theme if on subdomain/custom domain (separate from slug-based org logins)
    await brandingStore.initializePortalTheme();
  }

  // Restore username across redirects (and optionally auto-verify).
  try {
    const fromQuery = String(route.query?.u || '').trim();
    const pendingUsername = String(sessionStorage.getItem('__pt_login_pending_username__') || '').trim();
    const restored = fromQuery || pendingUsername;
    if (restored) username.value = restored;

    const pendingRemember = sessionStorage.getItem('__pt_login_pending_remember__');
    if (pendingRemember === '1') rememberLogin.value = true;

    const shouldVerify = sessionStorage.getItem('__pt_login_pending_verify__') === '1';
    if (shouldVerify && restored) {
      sessionStorage.removeItem('__pt_login_pending_verify__');
      // Keep pending_username so a route change can rehydrate again if needed.
      await verifyUsername({ reason: 'pending_route' });
      return;
    }
  } catch {
    // ignore
  }

  // Platform login convenience: if they opted-in to remember brand+username, auto-verify to route to the right branded login.
  if (!isOrgLogin.value) {
    const remembered = getRememberedLogin();
    if (remembered?.username && !String(username.value || '').trim()) {
      username.value = remembered.username;
      rememberLogin.value = true;
    }
    if (remembered?.orgSlug && remembered?.username) {
      await verifyUsername({ orgSlugOverride: remembered.orgSlug, reason: 'remembered' });
    }
  }
});

// If the slug changes while this view is mounted, refresh the login theme
watch(loginSlug, async (newSlug, oldSlug) => {
  if (newSlug && newSlug !== oldSlug) {
    await fetchLoginTheme(newSlug);
  }
  if (!newSlug && oldSlug) {
    loginTheme.value = null;
    // Returning to /login: keep portal branding on portal hosts; otherwise clear.
    if (!brandingStore.portalHostPortalUrl) {
      brandingStore.clearPortalTheme();
    } else {
      await brandingStore.initializePortalTheme();
    }
  }
});

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const verifying = ref(false);
const showPassword = ref(false);
const needsOrgChoice = ref(false);
const orgOptions = ref([]);
const selectedOrgSlug = ref('');
const rememberLogin = ref(false);
const lastVerifiedUsername = ref('');
const lastUsernameInputAt = ref(0);
const showForgotPasswordMessage = ref(false);
const showForgotUsernameMessage = ref(false);
const lastErrorCode = ref(null);

// Recovery state (forgot password/username)
const recoveryLoading = ref(false);
const recoveryError = ref('');
const recoverySuccess = ref('');
const recoveryDebug = ref(null);
const forgotPasswordEmail = ref('');
const recoverFirstName = ref('');
const recoverLastName = ref('');
const recoverRole = ref('');

const continueWithGoogle = () => {
  if (!loginSlug.value) return;
  const base = getBackendBaseUrl();
  window.location.href = `${base}/auth/google/start?orgSlug=${encodeURIComponent(String(loginSlug.value).trim().toLowerCase())}`;
};

const onUsernameInput = () => {
  lastUsernameInputAt.value = Date.now();
};

const resetToUsernameStep = () => {
  showPassword.value = false;
  needsOrgChoice.value = false;
  password.value = '';
  lastErrorCode.value = null;
};

const verifyUsername = async ({ orgSlugOverride = null, reason = 'user' } = {}) => {
  try {
    const u = String(username.value || '').trim();
    if (!u) return;
    if (verifying.value) return;

    verifying.value = true;
    error.value = '';
    lastErrorCode.value = null;
    needsOrgChoice.value = false;
    orgOptions.value = [];

    // Only apply remembered orgSlug when it matches this username.
    // Otherwise, one user's remembered org can incorrectly bias a different user's verification.
    const remembered = getRememberedLogin();
    const rememberedU = String(remembered?.username || '').trim().toLowerCase();
    const normalizedU = String(u || '').trim().toLowerCase();
    const rememberedSlug =
      rememberedU && normalizedU && rememberedU === normalizedU
        ? String(remembered?.orgSlug || '').trim().toLowerCase() || null
        : null;

    const slug =
      orgSlugOverride ||
      (isOrgLogin.value && loginSlug.value ? String(loginSlug.value).trim().toLowerCase() : null) ||
      (selectedOrgSlug.value ? String(selectedOrgSlug.value).trim().toLowerCase() : null) ||
      rememberedSlug;

    const resp = await api.post(
      '/auth/identify',
      {
        username: u,
        organizationSlug: slug || undefined
      },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );

    const data = resp?.data || {};
    const matched = data?.matched === true;
    if (!matched) {
      showPassword.value = false;
      needsOrgChoice.value = false;
      error.value = 'Username not found. Please check and try again.';
      return;
    }

    lastVerifiedUsername.value = String(data?.normalizedUsername || u).trim().toLowerCase();

    if (data?.needsOrgChoice === true) {
      // Simplified login UX: never show an org picker.
      // Keep users on the login route they chose and continue with password.
      needsOrgChoice.value = false;
      orgOptions.value = [];
      selectedOrgSlug.value = '';
      showPassword.value = true;
      return;
    }

    const ro = data?.resolvedOrg || null;
    // IMPORTANT: prefer portal_url as the branded portal path segment.
    const resolvedSlug = String(ro?.portal_url || ro?.portalUrl || ro?.slug || '').trim().toLowerCase();

    // If this verification indicates we should be on a different branded login, route there.
    if (resolvedSlug) {
      const current = isOrgLogin.value && loginSlug.value ? String(loginSlug.value).trim().toLowerCase() : '';
      if (!current || current !== resolvedSlug) {
        try {
          sessionStorage.setItem('__pt_login_pending_username__', u);
          sessionStorage.setItem('__pt_login_pending_verify__', '1');
          sessionStorage.setItem('__pt_login_pending_remember__', rememberLogin.value ? '1' : '0');
        } catch {
          // ignore
        }
        await router.replace({ path: `/${resolvedSlug}/login`, query: { u } });
        return;
      }
    }

    // Persist preference for future platform logins (opt-in).
    if (!isOrgLogin.value && rememberLogin.value && resolvedSlug) {
      setRememberedLogin({ username: u, orgSlug: resolvedSlug });
    } else if (!isOrgLogin.value && !rememberLogin.value && reason === 'remembered') {
      // User unchecked remember but we arrived from a remembered redirect; clear it.
      clearRememberedLogin();
    }

    // Decide between Google vs password.
    const method = String(data?.login?.method || 'password').toLowerCase();
    if (method === 'google') {
      const path = String(data?.login?.googleStartUrl || '').trim();
      if (path) {
        const base = getBackendBaseUrl();
        window.location.href = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
        return;
      }
      // Fallback: if backend didn't provide URL, use current org loginSlug.
      continueWithGoogle();
      return;
    }

    showPassword.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Verification failed. Please try again.';
    showPassword.value = false;
    needsOrgChoice.value = false;
  } finally {
    verifying.value = false;
  }
};

const maybeVerify = async () => {
  if (showPassword.value || needsOrgChoice.value || verifying.value) return;
  // Password managers (iCloud/1Password/etc.) may update inputs shortly after blur.
  // Wait briefly so we verify the final, settled username value.
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (showPassword.value || needsOrgChoice.value || verifying.value) return;
  const u = String(username.value || '').trim().toLowerCase();
  if (!u) return;
  if (Date.now() - Number(lastUsernameInputAt.value || 0) < 200) return;
  if (u === String(lastVerifiedUsername.value || '').trim().toLowerCase()) return;
  await verifyUsername({ reason: 'blur' });
};

const handleSubmit = async () => {
  if (needsOrgChoice.value) {
    if (!selectedOrgSlug.value) return;
    await verifyUsername({ orgSlugOverride: selectedOrgSlug.value, reason: 'org_choice' });
    return;
  }
  if (!showPassword.value) {
    await verifyUsername({ reason: 'submit' });
    return;
  }
  await handleLogin();
};

const handleLogin = async () => {
  error.value = '';
  lastErrorCode.value = null;
  loading.value = true;
  
  const result = await authStore.login(username.value, password.value, loginSlug.value);
  
  if (result.success) {
    // Kiosk users go to kiosk app (no agency fetch)
    if (authStore.user?.role?.toLowerCase() === 'kiosk') {
      router.push('/kiosk/app');
      loading.value = false;
      return;
    }
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
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
  const u = String(username.value || '').trim();
  forgotPasswordEmail.value = u.includes('@') ? u : '';
};

const showForgotUsername = () => {
    // Agencies are now stored in localStorage by fetchUserAgencies for future login redirects
  showForgotUsernameMessage.value = true;
  showForgotPasswordMessage.value = false;
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
  recoverFirstName.value = '';
  recoverLastName.value = '';
  recoverRole.value = '';
};

const closeRecoveryModals = () => {
  showForgotPasswordMessage.value = false;
  showForgotUsernameMessage.value = false;
  recoveryLoading.value = false;
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
};

const submitForgotPassword = async () => {
  recoveryLoading.value = true;
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
  try {
    const resp = await api.post('/auth/request-password-reset', {
      email: String(forgotPasswordEmail.value || '').trim(),
      organizationSlug: loginSlug.value || undefined
    }, { skipGlobalLoading: true, skipAuthRedirect: true });

    recoverySuccess.value = resp?.data?.message || 'If the email matches an account, you will receive a reset link shortly.';
    recoveryDebug.value = resp?.data?.debug || null;
  } catch (e) {
    // Keep UX generic to avoid account enumeration
    recoverySuccess.value = 'If the email matches an account, you will receive a reset link shortly.';
    recoveryDebug.value = e?.response?.data?.debug || null;
  } finally {
    recoveryLoading.value = false;
  }
};

const submitForgotUsername = async () => {
  recoveryLoading.value = true;
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
  try {
    const resp = await api.post('/auth/recover-username', {
      firstName: String(recoverFirstName.value || '').trim(),
      lastName: String(recoverLastName.value || '').trim(),
      role: String(recoverRole.value || '').trim(),
      organizationSlug: loginSlug.value || undefined
    }, { skipGlobalLoading: true, skipAuthRedirect: true });

    recoverySuccess.value = resp?.data?.message || 'If the information matches an account, you will receive an email shortly.';
    recoveryDebug.value = resp?.data?.debug || null;
  } catch (e) {
    recoverySuccess.value = 'If the information matches an account, you will receive an email shortly.';
    recoveryDebug.value = e?.response?.data?.debug || null;
  } finally {
    recoveryLoading.value = false;
  }
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

<style scoped>
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

.remember-row {
  margin-top: 6px;
  margin-bottom: 2px;
}

.remember-me {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  color: var(--text-primary);
  user-select: none;
}

.remember-me input[type="checkbox"] {
  width: 18px;
  height: 18px;
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

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  z-index: 999;
}

.modal {
  width: 100%;
  max-width: 520px;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35);
}

.modal h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 18px;
}

.modal-subtitle {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.4;
}

.modal-form .btn {
  margin-top: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 520px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.success {
  color: #065f46;
  background: #d1fae5;
  padding: 10px 12px;
  border-radius: 6px;
  margin-top: 10px;
  font-size: 14px;
}

.debug {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f3f4f6;
  font-size: 12px;
  word-break: break-word;
}

.debug-note {
  margin: 8px 0 0 0;
  color: #6b7280;
}
</style>

