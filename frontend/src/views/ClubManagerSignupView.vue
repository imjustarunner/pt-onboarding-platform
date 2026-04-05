<template>
  <div class="club-manager-signup" :style="{ background: loginBackground }">
    <div class="signup-card">
      <div v-if="displayLogoUrl && !logoError" class="signup-logo">
        <img :src="displayLogoUrl" alt="Logo" class="logo-image" @error="handleLogoError" />
      </div>
      <h1>Start Your Club</h1>
      <p class="subtitle">{{ displaySubtitle }}</p>

      <div class="expectation-card">
        <h2>Before you start</h2>
        <ul>
          <li>You’re creating a free SSC account first, not an instant all-access admin account.</li>
          <li>Club-management access is only for the club you start here.</li>
          <li>We’ll guide you into club setup after your email is verified.</li>
        </ul>
      </div>

      <div v-if="success" class="success-message">
        <p>{{ success }}</p>
        <router-link :to="loginPath" class="btn btn-primary">Go to Login</router-link>
      </div>

      <form v-else @submit.prevent="submit" class="signup-form">
        <div v-if="error" class="error">{{ error }}</div>
        <!-- reCAPTCHA placeholder: public-facing club manager signup - add verifyRecaptchaV3() before submit when ready -->
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
          <input id="firstName" v-model="firstName" type="text" required placeholder="Required" :disabled="loading" />
        </div>
        <div class="form-group">
          <label for="lastName">Last name</label>
          <input id="lastName" v-model="lastName" type="text" required placeholder="Required" :disabled="loading" />
        </div>
        <div class="form-group">
          <label for="clubName">Proposed club name</label>
          <input id="clubName" v-model="clubName" type="text" required placeholder="Your club name" :disabled="loading" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="city">City</label>
            <input id="city" v-model="city" type="text" placeholder="Optional" :disabled="loading" />
          </div>
          <div class="form-group">
            <label for="state">State</label>
            <input id="state" v-model="state" type="text" maxlength="2" placeholder="CO" :disabled="loading" />
          </div>
        </div>
        <div class="form-group">
          <label for="clubFocus">Who is this club for?</label>
          <textarea id="clubFocus" v-model="clubFocus" rows="3" placeholder="Describe your community, training style, and why you want to lead it." :disabled="loading"></textarea>
        </div>
        <div class="form-group">
          <label class="checkbox-row">
            <input v-model="timelineAcknowledged" type="checkbox" :disabled="loading" />
            <span>I understand there is a setup and review timeline before my club is fully established.</span>
          </label>
        </div>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Creating…' : 'Create Founder Account' }}
        </button>
      </form>

      <p class="login-link">
        Already have an account? <router-link :to="loginPath">Log in</router-link>
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

const loginTheme = ref(null);
const logoError = ref(false);

const displayLogoUrl = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.logoUrl) return loginTheme.value.agency.logoUrl;
  return brandingStore.displayLogoUrl;
});

const displaySubtitle = computed(() => {
  const name = orgSlug.value && loginTheme.value?.agency?.name ? loginTheme.value.agency.name : 'Summit Stats: Team Challenge';
  return `Launch a club inside ${name} with a dedicated founder account and club-scoped management access.`;
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
const clubName = ref('');
const city = ref('');
const state = ref('');
const clubFocus = ref('');
const timelineAcknowledged = ref(false);
const loading = ref(false);
const error = ref('');
const success = ref('');

const submit = async () => {
  error.value = '';
  if (!timelineAcknowledged.value) {
    error.value = 'Please confirm that you understand club setup includes a review/setup timeline.';
    return;
  }
  loading.value = true;
  try {
    const r = await api.post('/auth/register-club-manager', {
      email: email.value.trim(),
      password: password.value,
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      clubName: clubName.value.trim(),
      city: city.value.trim() || undefined,
      state: state.value.trim().toUpperCase() || undefined,
      clubFocus: clubFocus.value.trim() || undefined,
      ...(orgSlug.value ? { portalSlug: orgSlug.value } : {})
    });
    success.value = r.data?.message || 'Founder account created. Please verify your email before continuing into club setup.';
    if (r.data?.verifyUrl) {
      success.value += `\n\nVerification link (if email not configured): ${r.data.verifyUrl}`;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Signup failed. Please try again.';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.club-manager-signup {
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
.expectation-card {
  margin: 0 0 20px 0;
  padding: 16px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #dbe4f0;
}
.expectation-card h2 {
  margin: 0 0 8px 0;
  font-size: 1rem;
}
.expectation-card ul {
  margin: 0;
  padding-left: 18px;
  color: var(--text-muted, #5b6473);
}
.expectation-card li + li {
  margin-top: 6px;
}
.signup-form .form-group {
  margin-bottom: 16px;
}
.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.signup-form label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 0.9em;
}
.signup-form input,
.signup-form textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  font-size: 1em;
}
.signup-form textarea {
  min-height: 90px;
  resize: vertical;
}
.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.checkbox-row input {
  width: auto;
  margin-top: 2px;
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
.btn-primary:disabled {
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
@media (max-width: 560px) {
  .signup-card {
    padding: 24px;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
