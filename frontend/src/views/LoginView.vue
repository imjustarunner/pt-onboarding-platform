<template>
  <div class="login-page">
    <div class="login-container" :style="{ background: loginBackground }">
      <div class="login-card" :class="{ 'login-card--wide': intakesPanelOpen && showIntakesTrigger }">
        <div
          v-if="loginParentBranding && (loginParentBranding.name || loginParentBranding.logoUrl)"
          class="login-dual-brand"
        >
          <div class="login-dual-brand__col">
            <span class="login-dual-brand__label">Service partner</span>
            <img
              v-if="loginParentBranding.logoUrl"
              :src="loginParentBranding.logoUrl"
              alt=""
              class="login-dual-brand__logo"
              @error="handleLogoError"
            />
            <div v-if="loginParentBranding.name" class="login-dual-brand__name">{{ loginParentBranding.name }}</div>
          </div>
          <div class="login-dual-brand__divider" aria-hidden="true" />
          <div class="login-dual-brand__col">
            <span class="login-dual-brand__label">School</span>
            <img
              v-if="displayLogoUrl"
              :src="displayLogoUrl"
              alt=""
              class="login-dual-brand__logo"
              @error="handleLogoError"
            />
            <div v-if="loginTheme?.agency?.name" class="login-dual-brand__name">{{ loginTheme.agency.name }}</div>
          </div>
        </div>
        <div v-else class="login-logo">
          <img :src="displayLogoUrl" alt="Logo" class="logo-image" @error="handleLogoError" v-if="displayLogoUrl" />
        </div>
        <h2 v-if="loginParentBranding">{{ portalLoginHeadline }}</h2>
        <h2 v-else>{{ displayTitle }}</h2>
        <p v-if="loginParentBranding" class="subtitle">{{ portalLoginSubtitle }}</p>
        <p v-else class="subtitle">{{ defaultLoginSubtitle }}</p>
        
        <div v-if="error" class="error" v-html="formatError(error)"></div>
        <div v-if="verifiedSuccess" class="success">{{ verifiedSuccess }}</div>

        <div v-if="showIntakesTrigger" class="intakes-trigger-row">
          <button
            type="button"
            class="btn btn-secondary intakes-trigger-btn"
            :disabled="!portalOrganizationIdForIntake"
            @click="intakesPanelOpen = !intakesPanelOpen"
          >
            {{ intakesPanelOpen ? 'Hide intakes' : 'Display intakes' }}
          </button>
          <p v-if="!portalOrganizationIdForIntake" class="staff-intake-panel__muted intakes-trigger-hint">
            Intake links load after this page finishes loading.
          </p>
        </div>

        <section
          v-if="showIntakesTrigger && intakesPanelOpen"
          class="staff-intake-panel staff-intake-panel--standalone"
          aria-labelledby="staff-intake-heading"
        >
          <h3 id="staff-intake-heading" class="staff-intake-panel__title">Family digital intake</h3>
          <p class="staff-intake-panel__lead">
            English and Spanish intakes (same as your School Portal). Share links or QR codes with families — no sign-in required here.
          </p>
          <div v-if="staffIntakeLoading" class="staff-intake-panel__muted">Loading intake forms…</div>
          <p v-else-if="staffIntakeError" class="staff-intake-panel__err">{{ staffIntakeError }}</p>
          <div v-else class="staff-intake-grid">
            <div v-if="staffIntakeEn" class="staff-intake-card">
              <div class="staff-intake-card__badge">English</div>
              <img
                v-if="staffIntakeQr.en"
                :src="staffIntakeQr.en"
                alt="QR code — English intake"
                class="staff-intake-card__qr"
              />
              <p class="staff-intake-card__title">{{ staffIntakeEn.title || 'English intake' }}</p>
              <div class="staff-intake-card__actions">
                <button
                  type="button"
                  class="btn btn-secondary staff-intake-btn"
                  :disabled="!staffIntakeUrl(staffIntakeEn) || staffIntakeUrl(staffIntakeEn) === '#'"
                  @click="copyStaffIntakeUrl(staffIntakeEn, 'en')"
                >
                  {{ intakeCopyHint.en || 'Copy link' }}
                </button>
                <a
                  v-if="staffIntakeUrl(staffIntakeEn) !== '#'"
                  :href="staffIntakeUrl(staffIntakeEn)"
                  class="btn btn-secondary staff-intake-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >Open</a>
                <span
                  v-else
                  class="btn btn-secondary staff-intake-btn"
                  style="opacity: 0.45; pointer-events: none; cursor: not-allowed"
                >Open</span>
              </div>
            </div>
            <div v-if="staffIntakeEs" class="staff-intake-card">
              <div class="staff-intake-card__badge">Español</div>
              <img
                v-if="staffIntakeQr.es"
                :src="staffIntakeQr.es"
                alt="QR code — Spanish intake"
                class="staff-intake-card__qr"
              />
              <p class="staff-intake-card__title">{{ staffIntakeEs.title || 'Spanish intake' }}</p>
              <div class="staff-intake-card__actions">
                <button
                  type="button"
                  class="btn btn-secondary staff-intake-btn"
                  :disabled="!staffIntakeUrl(staffIntakeEs) || staffIntakeUrl(staffIntakeEs) === '#'"
                  @click="copyStaffIntakeUrl(staffIntakeEs, 'es')"
                >
                  {{ intakeCopyHint.es || 'Copy link' }}
                </button>
                <a
                  v-if="staffIntakeUrl(staffIntakeEs) !== '#'"
                  :href="staffIntakeUrl(staffIntakeEs)"
                  class="btn btn-secondary staff-intake-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >Open</a>
                <span
                  v-else
                  class="btn btn-secondary staff-intake-btn"
                  style="opacity: 0.45; pointer-events: none; cursor: not-allowed"
                >Open</span>
              </div>
            </div>
            <p
              v-if="!staffIntakeEn && !staffIntakeEs"
              class="staff-intake-panel__empty"
            >
              No active English or Spanish intake is configured yet. Your administrator can publish them under Intake links for this school or program.
            </p>
          </div>
        </section>

        <button
          v-if="showRememberedGoogleButton"
          type="button"
          class="btn google-quick-login"
          :disabled="loading || verifying"
          @click="startRememberedGoogleLogin"
        >
          <span class="google-quick-login-text">
            Continue as <strong>{{ rememberedGoogleLogin?.username }}</strong> with Google
          </span>
        </button>

        <form @submit.prevent="handleSubmit" class="login-form">
          <div
            class="login-credentials-wrap"
            :class="{ 'login-credentials-wrap--school-split': schoolPortalCredentialsRow }"
          >
            <div class="form-group login-credentials-username">
              <label for="username">Username</label>
              <input
                id="username"
                name="username"
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

            <div v-if="needsOrgChoice" class="form-group login-credentials-org">
              <label for="orgChoice">Choose your organization</label>
              <select id="orgChoice" v-model="selectedOrgSlug" :disabled="verifying || loading" required>
                <option disabled value="">Select an organization</option>
                <option v-for="o in orgOptions" :key="o.portal_url || o.slug || o.id" :value="(o.portal_url || o.slug || '').toLowerCase()">
                  {{ o.name }}{{ o.organization_type ? ` (${o.organization_type})` : '' }}
                </option>
              </select>
            </div>

            <div v-if="showPassword && !needsOrgChoice" class="form-group login-credentials-password">
              <label for="password">Password</label>
              <input
                id="password"
                name="password"
                v-model="password"
                type="password"
                required
                placeholder="Enter your password"
                autocomplete="current-password"
                :disabled="loading"
              />
            </div>
          </div>

          <div v-if="!needsOrgChoice" class="remember-row">
            <label class="remember-me">
              <input type="checkbox" v-model="rememberLogin" :disabled="verifying || loading" />
              Remember username
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
          <template v-if="showClubLinks">
            <span class="help-separator">|</span>
            <router-link :to="participantSignupPath" class="help-link">Sign up</router-link>
            <span class="help-separator">|</span>
            <router-link :to="clubsPath" class="help-link">Browse Clubs</router-link>
            <span class="help-separator">|</span>
            <router-link :to="clubManagerSignupPath" class="help-link">Create Club Manager Account</router-link>
          </template>
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
              <div v-if="canShowCurrentEmployeeRescue" class="employee-rescue">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="recoveryLoading || currentEmployeeRescueLoading"
                  @click="submitCurrentEmployeeRescue"
                >
                  {{ currentEmployeeRescueLoading ? 'Checking…' : 'Are you a current employee? Click here' }}
                </button>
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
            <p class="modal-subtitle">Enter your details and message. We send this to admin support for follow-up.</p>
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
                  <option value="school_staff">School Staff</option>
                  <option value="client_guardian">Guardian</option>
                </select>
              </div>
              <div class="form-group">
                <label for="recoverContactEmail">Contact email (optional)</label>
                <input id="recoverContactEmail" v-model="recoverContactEmail" type="email" placeholder="name@school.org" />
              </div>
              <div class="form-group">
                <label for="recoverMessage">Message</label>
                <textarea
                  id="recoverMessage"
                  v-model="recoverMessage"
                  rows="4"
                  required
                  maxlength="2000"
                  placeholder="Tell admin who you are and what access help you need."
                />
              </div>
              <div v-if="recoveryError" class="error">{{ recoveryError }}</div>
              <div v-if="recoverySuccess" class="success">{{ recoverySuccess }}</div>
              <button type="submit" class="btn btn-primary" :disabled="recoveryLoading">
                {{ recoveryLoading ? 'Sending…' : 'Send help request' }}
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
import {
  getRememberedLogin,
  setRememberedLogin,
  clearRememberedLogin,
  getRememberedGoogleLogin,
  getRememberedSchoolStaffPasswordLogin,
  setRememberedSchoolStaffPasswordLogin,
  clearRememberedSchoolStaffPasswordLogin
} from '../utils/loginRemember';
import { buildOrgLoginPath } from '../utils/orgLoginPath';
import { buildPublicIntakeUrl } from '../utils/publicIntakeUrl';
import QRCode from 'qrcode';

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
/** Present on /:parentOrgSlug/:organizationSlug/login (e.g. itsco + rudy). */
const parentOrgSlug = computed(() => {
  if (route.meta?.parentOrgSlug && route.params?.parentOrgSlug) {
    const p = String(route.params.parentOrgSlug || '').trim().toLowerCase();
    return p || null;
  }
  return null;
});
const isOrgLogin = computed(() => !!loginSlug.value);

function resolveParentForNestedLogin(resolvedChildSlug) {
  if (parentOrgSlug.value) return parentOrgSlug.value;
  if (isOrgLogin.value && loginSlug.value) {
    const cur = String(loginSlug.value).trim().toLowerCase();
    const rs = String(resolvedChildSlug || '').trim().toLowerCase();
    if (cur && rs && cur !== rs) return cur;
  }
  return String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase() || null;
}

const clubManagerSignupPath = computed(() =>
  loginSlug.value ? `/${loginSlug.value}/signup/club-manager` : '/signup/club-manager'
);
const participantSignupPath = computed(() =>
  loginSlug.value ? `/${loginSlug.value}/signup` : '/signup'
);
const clubsPath = computed(() =>
  loginSlug.value ? `/${loginSlug.value}/clubs` : '/clubs'
);

// Show club links (Sign up, Browse Clubs, Create Club Manager) when backend says so:
// - affiliation (direct club login), OR agency that hosts clubs (e.g. Summit Stats Challenge)
const showClubLinks = computed(() => !!loginTheme.value?.agency?.showClubLinks);

// Agency login theme data
const loginTheme = ref(null);
const loadingTheme = ref(false);

/** Raw list from GET /public-intake/school/:id (we only surface EN + ES in the UI). */
const staffIntakeLinks = ref([]);
const staffIntakeLoading = ref(false);
const staffIntakeError = ref('');
const staffIntakeQr = ref({ en: '', es: '' });
const intakeCopyHint = ref({ en: '', es: '' });
const intakesPanelOpen = ref(false);

// Logo and title for agency login
const displayLogoUrl = computed(() => {
  if (isOrgLogin.value && loginTheme.value?.agency?.logoUrl) {
    return loginTheme.value.agency.logoUrl;
  }
  // IMPORTANT: don't fall back to PlotTwistCo on the regular login page.
  // If branding hasn't loaded yet, show nothing instead of flashing the wrong logo.
  return brandingStore.displayLogoUrl;
});

const SCHOOL_PORTAL_ORG_TYPES = ['school', 'program', 'learning'];

const isSchoolPortalOrg = computed(() =>
  SCHOOL_PORTAL_ORG_TYPES.includes(String(loginTheme.value?.agency?.organizationType || '').toLowerCase())
);

/** Username + password on one row for School Portal after verify (inputs stay mounted — no focus loss). */
const schoolPortalCredentialsRow = computed(
  () => isSchoolPortalOrg.value && showPassword.value && !needsOrgChoice.value
);

const displayTitle = computed(() => {
  if (isOrgLogin.value && loginTheme.value?.agency?.name) {
    if (isSchoolPortalOrg.value) {
      return `${loginTheme.value.agency.name} — School Portal`;
    }
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

const loginParentBranding = computed(() => loginTheme.value?.agency?.parentBranding || null);

/** Dual-brand header: school sites use “School Portal”, not “Staff …”. */
const portalLoginHeadline = computed(() => {
  if (isSchoolPortalOrg.value) return 'School Portal';
  const term = String(brandingStore.peopleOpsTerm || 'People Operations').trim();
  return `Staff ${term}`;
});

const portalLoginSubtitle = computed(() => {
  const school = String(loginTheme.value?.agency?.name || '').trim();
  const partner = String(loginParentBranding.value?.name || '').trim();
  if (isSchoolPortalOrg.value) {
    if (school && partner) return `${school} · in partnership with ${partner}`;
    if (school) return 'Sign in to your School Portal';
    return 'Sign in to continue';
  }
  if (school && partner) return `${school} · in partnership with ${partner}`;
  if (school) return `${school} · Sign in below`;
  return 'Sign in to continue';
});

const defaultLoginSubtitle = computed(() =>
  isOrgLogin.value && isSchoolPortalOrg.value ? 'Sign in to your School Portal' : 'Sign in to continue'
);

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
    const data = response.data;

    // SSC: only /ssc/login serves login. Child orgs (affiliations) redirect to parent.
    const canonical = (data?.agency?.canonicalLoginSlug || '').toString().trim().toLowerCase();
    const current = (portalUrl || '').toString().trim().toLowerCase();
    if (canonical && current && canonical !== current) {
      if (canonical === 'ssc') {
        router.replace({ path: '/ssc/login', query: route.query });
      } else {
        const hostImplied = String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase() || null;
        router.replace({
          path: buildOrgLoginPath(
            canonical,
            parentOrgSlug.value || hostImplied || null,
            hostImplied
          ),
          query: route.query
        });
      }
      return;
    }

    loginTheme.value = data;
    // Apply org theme so CSS variables (colors/background/fonts) match the org on /{slug}/login
    brandingStore.setPortalThemeFromLoginTheme(data);
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
  if (route.query?.verified === '1') {
    verifiedSuccess.value = 'Email verified. You can now log in and create your club.';
    const { verified, ...rest } = route.query || {};
    router.replace({ path: route.path, query: rest });
  }

  // Platform /login only: jump straight to remembered portal slug so school staff see /{portal}/login
  // (branded) instead of a flash of generic login. Same storage as "Remember username" + identify snap.
  if (
    !isOrgLogin.value &&
    !String(route.query?.u || '').trim() &&
    !route.query?.error &&
    route.query?.verified !== '1'
  ) {
    let rememberedPortal = getRememberedLogin();
    if (!rememberedPortal?.username || !rememberedPortal?.orgSlug) {
      rememberedPortal = getRememberedSchoolStaffPasswordLogin();
    }
    const uMem = String(rememberedPortal?.username || '').trim();
    const slugMem = String(rememberedPortal?.orgSlug || '').trim().toLowerCase();
    if (uMem && slugMem) {
      const hostImplied = String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase() || null;
      const parentMem = rememberedPortal.parentOrgSlug || hostImplied || null;
      await router.replace({
        path: buildOrgLoginPath(slugMem, parentMem, hostImplied),
        query: { ...route.query, u: uMem }
      });
      return;
    }
  }

  // Partner hub at /:partner/login (e.g. /itsco/login): remembered nested school portal is /partner/school/login.
  // Without this, isOrgLogin is true here so the platform /login shortcut above never runs, and return visits
  // would stay on the hub instead of opening the school login with username prefilled + verify.
  if (
    isOrgLogin.value &&
    loginSlug.value &&
    !String(route.query?.u || '').trim() &&
    !route.query?.error &&
    route.query?.verified !== '1'
  ) {
    const hubSlug = String(loginSlug.value).trim().toLowerCase();
    let rememberedPortal = getRememberedLogin();
    if (!rememberedPortal?.username || !rememberedPortal?.orgSlug) {
      rememberedPortal = getRememberedSchoolStaffPasswordLogin();
    }
    const uMem = String(rememberedPortal?.username || '').trim();
    const schoolSlug = String(rememberedPortal?.orgSlug || '').trim().toLowerCase();
    const parentMem = String(rememberedPortal?.parentOrgSlug || '').trim().toLowerCase() || null;
    if (uMem && schoolSlug && parentMem && parentMem === hubSlug && schoolSlug !== hubSlug) {
      const hostImplied = String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase() || null;
      try {
        sessionStorage.setItem('__pt_login_pending_username__', uMem);
        sessionStorage.setItem('__pt_login_pending_verify__', '1');
        sessionStorage.setItem('__pt_login_pending_remember__', '1');
      } catch {
        // ignore
      }
      await router.replace({
        path: buildOrgLoginPath(schoolSlug, parentMem, hostImplied),
        query: { ...route.query, u: uMem }
      });
      return;
    }
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
    // SSC: when username is pre-filled from URL, auto-verify to show password immediately
    const currentSlugForAuto = String(loginSlug.value || '').trim().toLowerCase();
    if (restored && currentSlugForAuto === 'ssc') {
      await verifyUsername({ reason: 'pending_route' });
      return;
    }
  } catch {
    // ignore
  }

  if (isOrgLogin.value && loginSlug.value && !String(username.value || '').trim()) {
    const rememberedSchoolStaff = getRememberedSchoolStaffPasswordLogin();
    const currentOrg = String(loginSlug.value || '').trim().toLowerCase();
    if (
      rememberedSchoolStaff?.username &&
      rememberedSchoolStaff?.orgSlug &&
      rememberedSchoolStaff.orgSlug === currentOrg
    ) {
      username.value = rememberedSchoolStaff.username;
      rememberLogin.value = true;
      await verifyUsername({ reason: 'remembered_school_staff' });
      return;
    }
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

  const rememberedGoogle = getRememberedGoogleLogin();
  const rememberedGoogleSlug = String(rememberedGoogle?.orgSlug || '').trim().toLowerCase();
  const currentSlug = String(loginSlug.value || '').trim().toLowerCase();
  if (rememberedGoogle && currentSlug && rememberedGoogleSlug === currentSlug) {
    rememberedGoogleLogin.value = rememberedGoogle;
    if (!String(username.value || '').trim()) {
      username.value = rememberedGoogle.username;
    }
  }
});

// If the org slug or parent path changes while this view is mounted, refresh the login theme
watch(
  () => [loginSlug.value, parentOrgSlug.value],
  async (newPair, oldPair) => {
    const [newSlug, newParent] = newPair || [];
    const [oldSlug, oldParent] = oldPair || [];
    if (newSlug && (newSlug !== oldSlug || newParent !== oldParent)) {
      await fetchLoginTheme(newSlug);
    }
    if (!newSlug && oldSlug) {
      loginTheme.value = null;
      if (!brandingStore.portalHostPortalUrl) {
        brandingStore.clearPortalTheme();
      } else {
        await brandingStore.initializePortalTheme();
      }
    }
  }
);

const username = ref('');
const password = ref('');
const error = ref('');
const verifiedSuccess = ref('');
const loading = ref(false);
const verifying = ref(false);
const showPassword = ref(false);
const needsOrgChoice = ref(false);
const orgOptions = ref([]);
const selectedOrgSlug = ref('');
const rememberLogin = ref(false);
const rememberedGoogleLogin = ref(null);
const identifiedLoginMethod = ref('password');
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
const recoverMessage = ref('');
const recoverContactEmail = ref('');
const currentEmployeeRescueLoading = ref(false);
const canShowCurrentEmployeeRescue = computed(() =>
  isOrgLogin.value && String(username.value || '').trim().length > 0
);
const showRememberedGoogleButton = computed(() => {
  if (showPassword.value || needsOrgChoice.value) return false;
  return !!rememberedGoogleLogin.value?.orgSlug;
});

const portalOrganizationIdForIntake = computed(() => {
  const id = loginTheme.value?.agency?.portalOrganizationId;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
});

/** School/program/learning org login: show public intakes before sign-in (no password step required). */
const showIntakesTrigger = computed(() => {
  const t = String(loginTheme.value?.agency?.organizationType || '').toLowerCase();
  return (
    isOrgLogin.value &&
    !needsOrgChoice.value &&
    SCHOOL_PORTAL_ORG_TYPES.includes(t)
  );
});

function pickStaffIntakeForLang(links, langPrefix) {
  const pref = String(langPrefix || '').toLowerCase();
  return (links || []).find((l) => String(l?.language_code || 'en').toLowerCase().startsWith(pref)) || null;
}

const staffIntakeEn = computed(() => pickStaffIntakeForLang(staffIntakeLinks.value, 'en'));
const staffIntakeEs = computed(() => pickStaffIntakeForLang(staffIntakeLinks.value, 'es'));

function staffIntakeUrl(link) {
  const k = String(link?.public_key || '').trim();
  return k ? buildPublicIntakeUrl(k) : '#';
}

async function loadStaffIntakeLinks() {
  const id = portalOrganizationIdForIntake.value;
  if (!id) return;
  staffIntakeLoading.value = true;
  staffIntakeError.value = '';
  try {
    const resp = await api.get(`/public-intake/school/${id}`, { skipGlobalLoading: true, skipAuthRedirect: true });
    const links = Array.isArray(resp.data?.links) ? resp.data.links : resp.data?.link ? [resp.data.link] : [];
    staffIntakeLinks.value = links;
    staffIntakeQr.value = { en: '', es: '' };
    const en = pickStaffIntakeForLang(links, 'en');
    const es = pickStaffIntakeForLang(links, 'es');
    if (en?.public_key) {
      const url = buildPublicIntakeUrl(en.public_key);
      staffIntakeQr.value.en = await QRCode.toDataURL(url, {
        width: 216,
        margin: 1,
        color: { dark: '#1f2937', light: '#ffffffff' }
      });
    }
    if (es?.public_key) {
      const url = buildPublicIntakeUrl(es.public_key);
      staffIntakeQr.value.es = await QRCode.toDataURL(url, {
        width: 216,
        margin: 1,
        color: { dark: '#1f2937', light: '#ffffffff' }
      });
    }
  } catch (e) {
    staffIntakeLinks.value = [];
    staffIntakeQr.value = { en: '', es: '' };
    const st = e?.response?.status;
    if (st !== 404) {
      staffIntakeError.value = e?.response?.data?.error?.message || 'Could not load intake links.';
    }
  } finally {
    staffIntakeLoading.value = false;
  }
}

async function copyStaffIntakeUrl(link, slot) {
  const url = staffIntakeUrl(link);
  if (!url || url === '#') return;
  const key = slot === 'es' ? 'es' : 'en';
  try {
    await navigator.clipboard.writeText(url);
    intakeCopyHint.value = { ...intakeCopyHint.value, [key]: 'Copied!' };
    setTimeout(() => {
      intakeCopyHint.value = { ...intakeCopyHint.value, [key]: '' };
    }, 2200);
  } catch {
    intakeCopyHint.value = { ...intakeCopyHint.value, [key]: 'Copy failed' };
    setTimeout(() => {
      intakeCopyHint.value = { ...intakeCopyHint.value, [key]: '' };
    }, 2200);
  }
}

watch(
  () => [intakesPanelOpen.value, portalOrganizationIdForIntake.value],
  ([open, id]) => {
    if (open && id) loadStaffIntakeLinks();
  }
);

watch(
  () => [loginSlug.value, parentOrgSlug.value],
  () => {
    intakesPanelOpen.value = false;
    staffIntakeLinks.value = [];
    staffIntakeQr.value = { en: '', es: '' };
    intakeCopyHint.value = { en: '', es: '' };
    staffIntakeError.value = '';
  }
);

const continueWithGoogle = () => {
  if (!loginSlug.value) return;
  const base = getBackendBaseUrl();
  window.location.href = `${base}/auth/google/start?orgSlug=${encodeURIComponent(String(loginSlug.value).trim().toLowerCase())}`;
};

const startRememberedGoogleLogin = () => {
  const rememberedOrg = String(rememberedGoogleLogin.value?.orgSlug || '').trim().toLowerCase();
  if (!rememberedOrg) return;
  const base = getBackendBaseUrl();
  window.location.href = `${base}/auth/google/start?orgSlug=${encodeURIComponent(rememberedOrg)}`;
};

const onUsernameInput = () => {
  lastUsernameInputAt.value = Date.now();
};

const resetToUsernameStep = () => {
  showPassword.value = false;
  needsOrgChoice.value = false;
  password.value = '';
  lastErrorCode.value = null;
  lastVerifiedUsername.value = '';
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
    identifiedLoginMethod.value = String(data?.login?.method || 'password').toLowerCase();

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

    const current = isOrgLogin.value && loginSlug.value ? String(loginSlug.value).trim().toLowerCase() : '';
    const isSscLogin = current === 'ssc';

    // SSC: stay on /ssc/login when account is recognized. No slug swap—just show password.
    if (isSscLogin) {
      // Skip redirect; fall through to show password (or Google)
    } else if (resolvedSlug) {
      // If this verification indicates we should be on a different branded login, route there.
      if (!current || current !== resolvedSlug) {
        // Persist before navigation so return visits open /{parent}/{school}/login (e.g. /itsco/rudy/login).
        if (rememberLogin.value && resolvedSlug) {
          setRememberedLogin({
            username: u,
            orgSlug: resolvedSlug,
            parentOrgSlug: resolveParentForNestedLogin(resolvedSlug)
          });
        }
        try {
          sessionStorage.setItem('__pt_login_pending_username__', u);
          sessionStorage.setItem('__pt_login_pending_verify__', '1');
          sessionStorage.setItem('__pt_login_pending_remember__', rememberLogin.value ? '1' : '0');
        } catch {
          // ignore
        }
        const hostImplied = String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase() || null;
        await router.replace({
          path: buildOrgLoginPath(resolvedSlug, resolveParentForNestedLogin(resolvedSlug), hostImplied),
          query: { u }
        });
        return;
      }
    }

    // Remember username + portal path (works from platform /login and org pages like /itsco/login).
    if (rememberLogin.value && resolvedSlug) {
      setRememberedLogin({
        username: u,
        orgSlug: resolvedSlug,
        parentOrgSlug: resolveParentForNestedLogin(resolvedSlug)
      });
    } else if (!rememberLogin.value && reason === 'remembered') {
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
    const currentOrgSlug = String(loginSlug.value || '').trim().toLowerCase();
    const roleNorm = String(authStore.user?.role || '').toLowerCase();
    const verifiedMethod = String(identifiedLoginMethod.value || 'password').toLowerCase();
    const isSchoolStaffPasswordFlow = roleNorm === 'school_staff' && verifiedMethod === 'password' && !!currentOrgSlug;
    if (isSchoolStaffPasswordFlow && rememberLogin.value) {
      setRememberedSchoolStaffPasswordLogin({
        username: String(username.value || '').trim(),
        orgSlug: currentOrgSlug,
        parentOrgSlug: parentOrgSlug.value || null
      });
    } else if (isSchoolStaffPasswordFlow && !rememberLogin.value) {
      clearRememberedSchoolStaffPasswordLogin(currentOrgSlug);
    }

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

    const redirectPath = route.query?.redirect;
    if (redirectPath && typeof redirectPath === 'string' && redirectPath.startsWith('/')) {
      router.push(redirectPath);
      loading.value = false;
      return;
    }

    // Club managers (admin with no agencies) go to Admin - their main interface for creating/managing club
    const agencies = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
    const hasNoAgencies = !Array.isArray(agencies) || agencies.length === 0;
    const isAdmin = String(authStore.user?.role || '').toLowerCase() === 'admin';
    if (isAdmin && hasNoAgencies && loginSlug.value) {
      router.push(`/${loginSlug.value}/admin`);
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
  recoverMessage.value = '';
  recoverContactEmail.value = '';
};

const closeRecoveryModals = () => {
  showForgotPasswordMessage.value = false;
  showForgotUsernameMessage.value = false;
  recoveryLoading.value = false;
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
};

const recoveryRecaptchaSiteKey = String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
let recoveryRecaptchaLoadPromise = null;
const loadRecoveryRecaptcha = async () => {
  if (!recoveryRecaptchaSiteKey) return null;
  if (window.grecaptcha?.execute || window.grecaptcha?.enterprise?.execute) return window.grecaptcha;
  if (!recoveryRecaptchaLoadPromise) {
    recoveryRecaptchaLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-login-recaptcha="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.grecaptcha), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recoveryRecaptchaSiteKey)}`;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-login-recaptcha', 'true');
      script.onload = () => resolve(window.grecaptcha);
      script.onerror = () => reject(new Error('Failed to load reCAPTCHA'));
      document.head.appendChild(script);
    });
  }
  return recoveryRecaptchaLoadPromise;
};

const getRecoveryCaptchaToken = async (action) => {
  if (!recoveryRecaptchaSiteKey) return '';
  try {
    const grecaptcha = await loadRecoveryRecaptcha();
    if (!grecaptcha) return '';
    const enterpriseExecute = grecaptcha?.enterprise?.execute;
    if (typeof enterpriseExecute === 'function') {
      return await enterpriseExecute(recoveryRecaptchaSiteKey, { action });
    }
    const execute = grecaptcha?.execute;
    if (typeof execute === 'function') {
      return await execute(recoveryRecaptchaSiteKey, { action });
    }
    return '';
  } catch {
    return '';
  }
};

const submitForgotPassword = async () => {
  recoveryLoading.value = true;
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
  try {
    const captchaToken = await getRecoveryCaptchaToken('login_password_reset');
    const resp = await api.post('/auth/request-password-reset', {
      email: String(forgotPasswordEmail.value || '').trim(),
      organizationSlug: loginSlug.value || undefined,
      captchaToken: captchaToken || undefined
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

const submitCurrentEmployeeRescue = async () => {
  currentEmployeeRescueLoading.value = true;
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
  try {
    const u = String(username.value || '').trim();
    if (!u) {
      recoveryError.value = 'Enter your username first, then click current employee.';
      return;
    }
    const resp = await api.post('/auth/identify', {
      username: u,
      organizationSlug: loginSlug.value || undefined,
      rescue: true
    }, { skipGlobalLoading: true, skipAuthRedirect: true });

    const method = String(resp?.data?.login?.method || 'password').toLowerCase();
    if (method === 'google') {
      const path = String(resp?.data?.login?.googleStartUrl || '').trim();
      if (path) {
        const base = getBackendBaseUrl();
        window.location.href = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
        return;
      }
      continueWithGoogle();
      return;
    }
    recoveryError.value = 'This account is set to password login. Use reset password or sign in with your password.';
  } catch {
    recoveryError.value = 'We could not route your sign-in right now. Please try again or use reset password.';
  } finally {
    currentEmployeeRescueLoading.value = false;
  }
};

const submitForgotUsername = async () => {
  recoveryLoading.value = true;
  recoveryError.value = '';
  recoverySuccess.value = '';
  recoveryDebug.value = null;
  try {
    const captchaToken = await getRecoveryCaptchaToken('login_recover_username');
    const resp = await api.post('/auth/recover-username', {
      firstName: String(recoverFirstName.value || '').trim(),
      lastName: String(recoverLastName.value || '').trim(),
      role: String(recoverRole.value || '').trim(),
      message: String(recoverMessage.value || '').trim(),
      contactEmail: String(recoverContactEmail.value || '').trim() || undefined,
      organizationSlug: loginSlug.value || undefined,
      captchaToken: captchaToken || undefined
    }, { skipGlobalLoading: true, skipAuthRedirect: true });

    recoverySuccess.value = resp?.data?.message || 'If the information matches our records, admin will follow up shortly.';
    recoveryDebug.value = resp?.data?.debug || null;
  } catch (e) {
    recoverySuccess.value = 'If the information matches our records, admin will follow up shortly.';
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
  padding: 24px 22px;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 400px;
}

.login-card--wide {
  max-width: 640px;
}

.intakes-trigger-row {
  margin: 0 0 10px;
}

.intakes-trigger-btn {
  width: 100%;
}

.intakes-trigger-hint {
  margin: 8px 0 0;
  text-align: center;
}

.staff-intake-panel--standalone {
  margin-bottom: 12px;
}

.login-dual-brand {
  display: flex;
  align-items: stretch;
  justify-content: center;
  margin-bottom: 14px;
  padding: 10px 10px;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
}

.login-dual-brand__col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-width: 0;
  padding: 0 8px;
}

.login-dual-brand__label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
  margin-bottom: 4px;
}

.login-dual-brand__logo {
  max-height: 48px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
  margin-bottom: 4px;
}

.login-dual-brand__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  line-height: 1.35;
}

.login-dual-brand__divider {
  width: 1px;
  align-self: stretch;
  background: var(--border, #e5e7eb);
  margin: 0 4px;
  min-height: 56px;
}

.staff-intake-panel {
  margin: 12px 0 4px;
  padding: 12px 12px;
  background: #f8fafc;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  text-align: left;
}

.staff-intake-panel__title {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}

.staff-intake-panel__lead {
  margin: 0 0 8px 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary, #64748b);
}

.staff-intake-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.staff-intake-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.staff-intake-card__badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--primary-color, var(--primary, #166534));
  margin-bottom: 8px;
}

.staff-intake-card__qr {
  width: 120px;
  height: 120px;
  object-fit: contain;
  margin-bottom: 8px;
}

.staff-intake-card__title {
  margin: 0 0 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  line-height: 1.35;
}

.staff-intake-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  width: 100%;
}

.staff-intake-btn {
  width: auto;
  min-width: 88px;
  margin: 0 !important;
  padding: 8px 12px;
  font-size: 13px;
  text-align: center;
  text-decoration: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.staff-intake-panel__muted,
.staff-intake-panel__empty {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.45;
}

.staff-intake-panel__err {
  font-size: 13px;
  color: var(--error, #b91c1c);
  margin: 0;
}

@media (max-width: 560px) {
  .staff-intake-grid {
    grid-template-columns: 1fr;
  }

  .login-dual-brand {
    flex-direction: column;
  }

  .login-dual-brand__divider {
    width: 100%;
    height: 1px;
    min-height: 0;
    margin: 8px 0;
  }
}

.login-logo {
  margin-bottom: 16px;
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
  margin-bottom: 6px;
  margin-top: 0;
  color: var(--primary-color, var(--primary, #C69A2B));
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: 24px;
  font-family: var(--agency-font-family, var(--font-body));
}

.subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 14px;
  margin-top: 0;
  font-size: 14px;
  line-height: 1.35;
}

.login-form {
  margin-bottom: 12px;
}

.login-credentials-wrap {
  margin-bottom: 0;
}

/* School / program / learning: username + password on one row after verify */
.login-credentials-wrap--school-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 0;
  align-items: end;
  margin-bottom: 12px;
}

.login-credentials-wrap--school-split .login-credentials-username,
.login-credentials-wrap--school-split .login-credentials-password {
  margin-bottom: 0;
}

/* Tighter than global .form-group (24px) for this screen */
.login-form .form-group {
  margin-bottom: 12px;
}

.login-form .form-group label {
  margin-bottom: 5px;
  font-size: 13px;
}

.login-form .form-group input,
.login-form .form-group select {
  padding: 10px 12px;
  font-size: 15px;
}

.login-form .login-credentials-username input#username {
  font-size: 14px;
}

.remember-row {
  margin-top: 2px;
  margin-bottom: 0;
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
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 13px;
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
  margin-top: 6px;
}

.google-quick-login {
  margin-bottom: 8px;
  padding: 10px 14px;
  font-size: 15px;
  line-height: 1.4;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.98);
  color: var(--primary-color, var(--primary, #166534));
  border: 2px solid var(--primary-color, var(--primary, #166534));
  border-radius: 8px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.google-quick-login:hover:not(:disabled) {
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.google-quick-login .google-quick-login-text strong {
  font-weight: 600;
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
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0;
  margin: 10px 0 0;
  font-size: 13px;
}

.help-link {
  color: var(--primary-color, var(--primary, #C69A2B));
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
  white-space: nowrap;
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

.employee-rescue {
  margin-top: 6px;
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
  padding: 8px 10px;
  border-radius: 6px;
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 13px;
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

