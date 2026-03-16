<template>
  <div class="participant-signup" :style="{ background: loginBackground }">
    <div class="signup-card">
      <div v-if="displayLogoUrl && !logoError" class="signup-logo">
        <img :src="displayLogoUrl" alt="Logo" class="logo-image" @error="handleLogoError" />
      </div>
      <h1>Create Account</h1>
      <p class="subtitle">{{ displaySubtitle }}</p>

      <div v-if="success" class="success-message">
        <p>{{ success }}</p>
        <router-link :to="clubsPath" class="btn btn-primary">Browse Clubs</router-link>
        <span class="or"> or </span>
        <router-link :to="loginPath" class="btn btn-secondary">Log in</router-link>
      </div>

      <form v-else @submit.prevent="submit" class="signup-form">
        <div v-if="error" class="error">{{ error }}</div>
        <div class="form-group">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" required placeholder="you@example.com" :disabled="loading" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" required placeholder="At least 6 characters" minlength="6" :disabled="loading" />
        </div>
        <div class="form-group">
          <label for="firstName">First name</label>
          <input id="firstName" v-model="firstName" type="text" placeholder="Optional" :disabled="loading" />
        </div>
        <div class="form-group">
          <label for="lastName">Last name</label>
          <input id="lastName" v-model="lastName" type="text" required placeholder="Required" :disabled="loading" />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Creating…' : 'Create Account' }}
        </button>
      </form>

      <p class="login-link">
        Already have an account? <router-link :to="loginPath">Log in</router-link>
        <span class="sep">|</span>
        <router-link :to="clubManagerSignupPath">Create a club instead</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useBrandingStore } from '../store/branding';

const route = useRoute();
const brandingStore = useBrandingStore();
const orgSlug = computed(() => route.params?.organizationSlug || null);
const loginPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/login` : '/login'));
const clubsPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/clubs` : '/clubs'));
const clubManagerSignupPath = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/signup/club-manager` : '/signup/club-manager'
);

const loginTheme = ref(null);
const logoError = ref(false);

const displayLogoUrl = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.logoUrl) return loginTheme.value.agency.logoUrl;
  return brandingStore.displayLogoUrl;
});

const displaySubtitle = computed(() => {
  const name = orgSlug.value && loginTheme.value?.agency?.name ? loginTheme.value.agency.name : 'Summit Stats';
  return `Sign up to join clubs and participate in fitness challenges on ${name}.`;
});

const loginBackground = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.themeSettings?.loginBackground) {
    return loginTheme.value.agency.themeSettings.loginBackground;
  }
  return brandingStore.loginBackground;
});

const handleLogoError = () => { logoError.value = true; };

const fetchLoginTheme = async (portalUrl) => {
  try {
    const response = await api.get(`/agencies/portal/${portalUrl}/login-theme`, { skipGlobalLoading: true });
    loginTheme.value = response.data;
    brandingStore.setPortalThemeFromLoginTheme(response.data);
  } catch (err) {
    console.error('Failed to fetch signup theme:', err);
  }
};

onMounted(async () => {
  if (orgSlug.value) {
    await fetchLoginTheme(orgSlug.value);
  } else if (!brandingStore.portalHostPortalUrl) {
    brandingStore.clearPortalTheme();
  }
});

const email = ref('');
const password = ref('');
const firstName = ref('');
const lastName = ref('');
const loading = ref(false);
const error = ref('');
const success = ref('');

const submit = async () => {
  error.value = '';
  loading.value = true;
  try {
    const r = await api.post('/auth/register-participant', {
      email: email.value.trim(),
      password: password.value,
      firstName: firstName.value.trim() || undefined,
      lastName: lastName.value.trim(),
      ...(orgSlug.value ? { portalSlug: orgSlug.value } : {})
    });
    success.value = r.data?.message || 'Account created. You can now log in and join a club.';
    if (r.data?.redirectUrl && orgSlug.value) {
      success.value += '\n\nClick "Browse Clubs" to find and join a club.';
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Signup failed. Please try again.';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.participant-signup {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.signup-logo {
  text-align: center;
  margin-bottom: 20px;
}
.signup-logo .logo-image {
  max-height: 100px;
  max-width: 240px;
  object-fit: contain;
}
.signup-card {
  width: 100%;
  max-width: 400px;
  padding: 32px;
  background: var(--bg, #fff);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}
.signup-card h1 {
  margin: 0 0 8px 0;
  font-size: 1.5em;
}
.subtitle {
  margin: 0 0 24px 0;
  color: var(--text-muted, #666);
  font-size: 0.95em;
}
.signup-form .form-group {
  margin-bottom: 16px;
}
.signup-form label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 0.9em;
}
.signup-form input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  font-size: 1em;
}
.signup-form .btn {
  width: 100%;
  padding: 12px;
  margin-top: 8px;
  font-size: 1em;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  border: none;
}
.btn-primary {
  background: var(--primary, #0066cc);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-secondary {
  background: var(--bg-alt, #e0e0e0);
  color: var(--text-primary, #333);
}
.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.error {
  margin-bottom: 16px;
  padding: 10px;
  background: #ffebee;
  color: #c62828;
  border-radius: 6px;
  font-size: 0.9em;
}
.success-message {
  padding: 16px 0;
}
.success-message p {
  margin: 0 0 16px 0;
  white-space: pre-line;
}
.success-message .btn {
  display: inline-block;
  width: auto;
  margin-right: 4px;
}
.success-message .or {
  margin: 0 8px;
  color: var(--text-muted, #666);
}
.login-link {
  margin-top: 24px;
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.login-link a {
  color: var(--primary, #0066cc);
  text-decoration: none;
}
.login-link a:hover {
  text-decoration: underline;
}
.login-link .sep {
  margin: 0 8px;
  color: var(--border, #ccc);
}
</style>
