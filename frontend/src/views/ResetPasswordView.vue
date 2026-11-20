<template>
  <div class="reset-page" :lang="authLocale" :style="pageStyle">
    <div class="reset-content"><SchoolCareBridgeBrand v-if="isSchoolCareBridgePath(route.path)" />
      <div class="reset-card">
<label class="portal-auth-language">Idioma / Language <select :value="authLocale" @change="setAuthLocale($event.target.value)"><option value="en">English</option><option value="es">Español</option></select></label>
        <PasswordRecoveryBrand
          :locale="authLocale"
          :tenant="tenantBrand"
          :school="schoolBrand"
          :fallback-logo-url="brandingStore.displayLogoUrl || brandingStore.logoUrl"
        />

        <div v-if="loading" class="loading">
          <p>{{ authText("Loading…") }}</p>
        </div>

        <div v-else-if="error" class="error">
          <h2>{{ authText("Password recovery error") }}</h2>
          <p>{{ authText(error) }}</p>
          <router-link :to="loginTo" class="btn btn-primary">{{ authText("Go to Login") }}</router-link>
        </div>

        <div v-else-if="successMessage">
          <h2>{{ authText("Password saved") }}</h2>
          <p>{{ successMessage }}</p>
          <router-link :to="loginTo" class="btn btn-primary">{{ authText("Go to Login") }}</router-link>
        </div>

        <div v-else class="reset-form">
          <h2 v-if="firstName">{{ authText('Hi {name},', { name:firstName }) }}</h2>
          <h2 v-else>{{ authText("Set your password") }}</h2>
          <p class="subtitle">{{ authText("Choose a new password for your account.") }}</p>

          <form @submit.prevent="handleReset" autocomplete="on">
            <div v-if="loginUsername" class="form-group">
              <label for="resetUsername">{{ authText("Your sign-in username") }}</label>
              <input id="resetUsername" name="username" :value="loginUsername" type="text" autocomplete="username" autocapitalize="none" :spellcheck="false" readonly class="form-input" />
              <p class="muted tiny">{{ authText("You will be signed in after saving. On your own device, you can save your password when your browser offers.") }}</p>
            </div>
            <div v-if="needsJobTitle" class="form-group">
              <label for="jobTitle">{{ authText("Your job title / role at the school") }}</label>
              <input
                id="jobTitle"
                v-model="jobTitle"
                type="text"
                :placeholder="authText('e.g. Counselor, Assistant Principal')"
                required
                class="form-input"
                :disabled="saving"
                maxlength="255"
                autocomplete="organization-title"
              />
              <p v-if="accessRoleLabel" class="muted tiny">Portal access: {{ accessRoleLabel }}</p>
            </div>

            <div class="form-group">
              <label for="password">{{ authText("New Password") }}</label>
              <div class="input-wrap">
                <input
                  id="password"
                  name="new-password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="authText('Choose a new password')"
                  required
                  class="form-input"
                  :disabled="saving"
                  autocomplete="new-password"
                  autocapitalize="none"
                  autocorrect="off"
                  :spellcheck="false"
                  minlength="10"
                  maxlength="128"
                />
                <button type="button" class="toggle-vis" @click="showPassword = !showPassword" :aria-label="showPassword ? authText('Hide password') : authText('Show password')">
                  {{ showPassword ? authText("Hide") : authText("Show") }}
                </button>
              </div>
              <PasswordStrengthMeter :locale="authLocale" :password="password" :confirm-password="confirmPassword" />
            </div>

            <div class="form-group">
              <label for="confirmPassword">{{ authText("Confirm New Password") }}</label>
              <div class="input-wrap">
                <input
                  id="confirmPassword"
                  name="confirm-password"
                  v-model="confirmPassword"
                  :type="showConfirm ? 'text' : 'password'"
                  :placeholder="authText('Re-enter your new password')"
                  required
                  class="form-input"
                  :disabled="saving"
                  autocomplete="new-password"
                  autocapitalize="none"
                  autocorrect="off"
                  :spellcheck="false"
                  minlength="10"
                  maxlength="128"
                />
                <button type="button" class="toggle-vis" @click="showConfirm = !showConfirm" :aria-label="showConfirm ? authText('Hide password') : authText('Show password')">
                  {{ showConfirm ? authText("Hide") : authText("Show") }}
                </button>
              </div>
            </div>

            <p v-if="formError" class="error-message">{{ authText(formError) }}</p>

            <button
              type="submit"
              class="btn btn-primary reset-submit"
              :disabled="saving || !!passwordMismatch || !password || !confirmPassword"
            >
              {{ saving ? authText("Saving and signing you in…") : authText("Save password and continue") }}
            </button>
          </form>
        </div>
      </div>
    </div>

    <PoweredByFooter />
  </div>
</template>

<script setup>
import { usePortalAuthLocale, withPortalAuthLanguage, portalAuthError } from '../utils/portalAuthLocale.js';

import SchoolCareBridgeBrand from '../components/schoolcarebridge/SchoolCareBridgeBrand.vue';
import { isSchoolCareBridgePath, schoolCareBridgePath } from '../utils/schoolCareBridge';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useBrandingStore } from '../store/branding';
import api from '../services/api';
import PoweredByFooter from '../components/PoweredByFooter.vue';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter.vue';
import { checkPasswordBasics } from '../utils/passwordPolicy.js';
import PasswordRecoveryBrand from '../components/PasswordRecoveryBrand.vue';
import { completePasswordTokenLogin } from '../utils/completePasswordTokenLogin.js';
import { clearPortalLoginMemory } from '../utils/loginRemember.js';
import { enterPublicAuthForm } from '../utils/publicAuthForm';

const successMessage = ref('');

const router = useRouter();
const route = useRoute();
const { locale: authLocale, setLocale: setAuthLocale, text: authText } = usePortalAuthLocale(route);
const leavePublicAuthForm = enterPublicAuthForm();
onUnmounted(leavePublicAuthForm);
const brandingStore = useBrandingStore();

const loading = ref(true);
const error = ref('');
const firstName = ref('');
const loginUsername = ref('');
const password = ref('');
const confirmPassword = ref('');
const jobTitle = ref('');
const needsJobTitle = ref(false);
const accessRoleLabel = ref('');
const saving = ref(false);
const formError = ref('');
const showPassword = ref(false);
const showConfirm = ref(false);
const tenantBrand = ref(null);
const schoolBrand = ref(null);

const loginBackground = computed(() => brandingStore.loginBackground);
const pageStyle = computed(() => ({
  background: loginBackground.value || 'var(--bg)'
}));
const loginTo = computed(() => {
  const slug = route.params.organizationSlug || tenantBrand.value?.slug;
  if (isSchoolCareBridgePath(route.path)) {
    // Agency recovery links carry an agency slug; only school identities should
    // return to a school-specific entry. Others resume email discovery.
    return schoolCareBridgePath(schoolBrand.value ? String(route.params.organizationSlug || schoolBrand.value.slug || '') : '');
  }
  return withPortalAuthLanguage(slug ? `/${slug}/login` : '/login', authLocale.value);
});

const passwordMismatch = computed(() =>
  password.value && confirmPassword.value && password.value !== confirmPassword.value
    ? authText("Passwords do not match")
    : ''
);

const token = computed(() => {
  const t = route.params.token;
  return typeof t === 'string' ? t : '';
});

const applyBranding = async (data) => {
  tenantBrand.value = data?.tenant || null;
  schoolBrand.value = data?.school || null;
  const slug = route.params.organizationSlug || data?.portalSlug || data?.tenant?.slug;
  if (slug) {
    await brandingStore.fetchAgencyTheme(slug);
  }
};

const validateToken = async () => {
  if (!token.value) {
    error.value = authText("Invalid reset link. Token is missing.");
    loading.value = false;
    return;
  }

  try {
    const resp = await api.get(`/auth/validate-reset-token/${encodeURIComponent(token.value)}`);
    firstName.value = resp.data.firstName || '';
    loginUsername.value = resp.data.username || '';
    needsJobTitle.value = !!resp.data.needsJobTitle;
    accessRoleLabel.value = resp.data.accessRoleLabel || '';
    await applyBranding(resp.data);
    loading.value = false;
  } catch (err) {
    if (err?.message?.includes('Unexpected token') || err?.message?.includes('JSON')) {
      error.value = authText("This reset link could not be validated. Please request a new password reset link.");
    } else {
      error.value = portalAuthError(err, authLocale.value, 'Invalid or expired reset link.');
    }
    loading.value = false;
  }
};

const handleReset = async () => {
  if (passwordMismatch.value) {
    formError.value = passwordMismatch.value;
    return;
  }
  if (needsJobTitle.value && !String(jobTitle.value || '').trim()) {
    formError.value = 'Please enter your job title / role at the school.';
    return;
  }
  const basics = checkPasswordBasics(password.value);
  if (!basics.valid) {
    formError.value = authText(basics.message);
    return;
  }

  saving.value = true;
  formError.value = '';

  try {
    const payload = { password: password.value };
    if (needsJobTitle.value || String(jobTitle.value || '').trim()) {
      payload.jobTitle = String(jobTitle.value || '').trim();
    }
    const resp = await api.post(`/auth/reset-password/${encodeURIComponent(token.value)}`, payload);
    if (resp.data.requiresSignIn) {
      successMessage.value = authLocale.value === 'es' ? authText('Your password was saved. Sign in to continue.') : resp.data.message;
      return;
    }
    await completePasswordTokenLogin(resp.data, router, {
      locale: authLocale.value,
      portalSlug: route.params.organizationSlug || route.query.portal || tenantBrand.value?.slug,
      destination: isSchoolCareBridgePath(route.path) ? loginTo.value : null
    });
  } catch (err) {
    formError.value = portalAuthError(err, authLocale.value, 'Failed to reset password.');
    saving.value = false;
  }
};

onMounted(async () => {
  clearPortalLoginMemory(route.params.organizationSlug || null);
  if (route.params.organizationSlug) {
    await brandingStore.fetchAgencyTheme(route.params.organizationSlug);
  }
  await validateToken();
});
</script>

<style scoped>
.portal-auth-language { display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-bottom:16px; font-size:14px; }
.portal-auth-language select { padding:8px; font:inherit; }
.reset-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 32px 16px 16px;
}
.reset-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}
.reset-card {
  background: var(--bg-card);
  padding: 36px 32px 32px;
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16);
  width: 100%;
  max-width: 460px;
  text-align: center;
}
.reset-form h2 {
  margin: 0 0 8px;
  color: var(--primary, #0f766e);
  font-weight: 700;
}
.subtitle {
  color: var(--text-secondary);
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 1.45;
}
.muted.tiny {
  display: block;
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 400;
}
.form-group {
  margin-bottom: 18px;
  text-align: left;
}
.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-weight: 600;
}
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.form-input {
  width: 100%;
  padding: 12px 72px 12px 12px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 16px;
  box-sizing: border-box;
}
.toggle-vis {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--primary, #0f766e);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}
.toggle-vis:hover { background: var(--surface-hover); }
.error-message {
  color: var(--error, #ef4444);
  font-size: 14px;
  margin: 10px 0;
}
.reset-submit { width: 100%; margin-top: 8px; }
.error h2 { margin-top: 0; }
</style>
