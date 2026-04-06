<template>
  <div class="login-page" :class="{ 'login-page--ssc': isSSCLogin, 'login-page--app-like': isAppLike }">
    <div v-if="showAppPreviewToggle" class="app-preview-toggle-group" aria-label="Local preview mode">
      <button
        type="button"
        class="app-preview-toggle"
        :class="{ active: appPreviewMode === 'off' }"
        @click="setAppPreviewMode('off')"
        title="Show web login preview"
      >
        Preview: Web
      </button>
      <button
        type="button"
        class="app-preview-toggle"
        :class="{ active: appPreviewMode === 'phone' }"
        @click="setAppPreviewMode('phone')"
        title="Show phone app preview"
      >
        Preview: App
      </button>
      <button
        type="button"
        class="app-preview-toggle"
        :class="{ active: appPreviewMode === 'ipad' }"
        @click="setAppPreviewMode('ipad')"
        title="Show iPad app preview"
      >
        Preview: iPad
      </button>
    </div>
    <div class="login-container" :class="{ 'login-container--app': isAppLike, 'login-container--ipad': isIpadPreviewMode }" :style="loginContainerStyle">
      <div class="login-card" :class="{ 'login-card--wide': intakesPanelOpen && showIntakesTrigger, 'login-card--app': isAppLike, 'login-card--ipad': isIpadPreviewMode }">
        <div v-if="isIpadPreviewMode && !loginParentBranding" class="ipad-hero-panel">
          <img
            v-if="displayLogoUrl"
            :src="displayLogoUrl"
            :alt="SUMMIT_STATS_TEAM_CHALLENGE_NAME"
            class="ipad-hero-logo"
            @error="handleLogoError"
          />
          <div class="ipad-hero-copy">
            <p class="subtitle">{{ primaryLoginSubtitle }}</p>
          </div>
        </div>
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

        <!-- Summit Stats + club dual-brand split (shown after username verify when we know the club context) -->
        <div
          v-else-if="isSSCLogin && sscClubBranding && (sscClubBranding.logoUrl || sscClubBranding.name)"
          class="login-dual-brand login-dual-brand--ssc"
        >
          <div class="login-dual-brand__col">
            <span class="login-dual-brand__label">Main App</span>
            <img
              v-if="displayLogoUrl"
              :src="displayLogoUrl"
              :alt="sscTenantDisplayName"
              class="login-dual-brand__logo login-dual-brand__logo--ssc"
              @error="handleLogoError"
            />
            <div v-else class="login-dual-brand__fallback login-dual-brand__fallback--ssc">
              {{ sscTenantInitials }}
            </div>
            <div class="login-dual-brand__name">{{ sscTenantDisplayName }}</div>
          </div>
          <div class="login-dual-brand__divider" aria-hidden="true" />
          <div class="login-dual-brand__col">
            <span class="login-dual-brand__label">Your Club</span>
            <img
              v-if="sscClubBranding.logoUrl"
              :src="sscClubBranding.logoUrl"
              alt=""
              class="login-dual-brand__logo login-dual-brand__logo--club"
              @error="handleLogoError"
            />
            <div v-else class="login-dual-brand__fallback login-dual-brand__fallback--club">
              {{ sscClubInitials }}
            </div>
            <div class="login-dual-brand__name">{{ sscClubDisplayName }}</div>
          </div>
        </div>

        <div v-else-if="!isIpadPreviewMode" class="login-logo">
          <img :src="displayLogoUrl" alt="Logo" class="logo-image" @error="handleLogoError" v-if="displayLogoUrl" />
        </div>
        <h2 v-if="!isAppLike && !isSSCLogin && loginParentBranding">{{ portalLoginHeadline }}</h2>
        <h2 v-else-if="!isAppLike && !isSSCLogin">{{ primaryLoginTitle }}</h2>
        <p v-if="!isAppLike && !isSSCLogin && loginParentBranding" class="subtitle">{{ portalLoginSubtitle }}</p>
        <p v-else-if="!isAppLike" class="subtitle">{{ primaryLoginSubtitle }}</p>
        
        <div v-if="error" class="error" v-html="formatError(error)"></div>
        <div v-if="showSignupSuggestion" class="login-signup-suggestion">
          <p class="login-signup-suggestion__text">
            No account was found for <strong>{{ suggestedSignupEmail }}</strong>. Create an account first, then apply for a club.
          </p>
          <div class="login-signup-suggestion__actions">
            <router-link :to="participantSignupPath" class="btn btn-primary">Create Account</router-link>
            <router-link :to="clubsPath" class="btn btn-secondary">Browse Clubs</router-link>
          </div>
        </div>
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
            Digital forms load after this page finishes loading.
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
              No active English or Spanish intake is configured yet. Your administrator can publish them under Digital Forms for this school or program.
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

        <div :class="{ 'app-auth-panel': isAppLike, 'ipad-auth-panel': isIpadPreviewMode }">
          <form @submit.prevent="handleSubmit" class="login-form">
            <div
              class="login-credentials-wrap"
              :class="{ 'login-credentials-wrap--school-split': schoolPortalCredentialsRow }"
            >
              <div class="form-group login-credentials-username">
                <label for="username">{{ usernameFieldLabel }}</label>
                <input
                  id="username"
                  name="username"
                  v-model="username"
                  type="text"
                  required
                  :placeholder="usernameFieldPlaceholder"
                  autocomplete="username"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                  inputmode="email"
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
                <div class="password-input-wrap">
                  <input
                    id="password"
                    name="password"
                    v-model="password"
                    :type="passwordVisible ? 'text' : 'password'"
                    required
                    placeholder="Enter your password"
                    autocomplete="current-password"
                    autocapitalize="none"
                    autocorrect="off"
                    spellcheck="false"
                    :disabled="loading"
                  />
                  <button
                    type="button"
                    class="password-toggle-btn"
                    :aria-label="passwordVisible ? 'Hide password' : 'Show password'"
                    @click="passwordVisible = !passwordVisible"
                  >
                    {{ passwordVisible ? 'Hide' : 'Show' }}
                  </button>
                </div>
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
            <template v-if="showClubLinks && !isAppLike">
              <span class="help-separator">|</span>
              <router-link :to="participantSignupPath" class="help-link">Sign up</router-link>
              <span class="help-separator">|</span>
              <router-link :to="clubsPath" class="help-link">Browse Clubs</router-link>
              <span class="help-separator">|</span>
              <router-link :to="clubManagerSignupPath" class="help-link">Start My Club</router-link>
            </template>
            <template v-else-if="showClubLinks && isAppLike">
              <span class="help-separator">|</span>
              <button type="button" class="help-link help-link-button" @click="showAppMoreLinks = !showAppMoreLinks">
                {{ showAppMoreLinks ? 'Hide options' : 'More options' }}
              </button>
            </template>
          </div>
          <div v-if="showClubLinks && isAppLike && showAppMoreLinks" class="app-login-links">
            <router-link :to="participantSignupPath" class="app-login-link-btn">Sign up</router-link>
            <router-link :to="clubsPath" class="app-login-link-btn">Browse Clubs</router-link>
            <router-link :to="clubManagerSignupPath" class="app-login-link-btn app-login-link-btn--secondary">Start My Club</router-link>
          </div>
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
    <PoweredByFooter v-if="!isAppLike" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';
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
const APP_PREVIEW_STORAGE_KEY = '__pt_local_app_preview__';
const showAppPreviewToggle = import.meta.env.DEV;
const APP_PREVIEW_MODES = new Set(['off', 'phone', 'ipad']);
const appPreviewMode = ref('off');
const showAppMoreLinks = ref(false);

const browserIsStandalone = () => {
  if (typeof window === 'undefined') return false;
  const mediaStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = typeof window.navigator !== 'undefined' && window.navigator.standalone === true;
  return Boolean(mediaStandalone || iosStandalone);
};

const applyAppPreviewMode = (mode) => {
  try {
    const root = document.documentElement;
    if (!root) return;
    const normalized = APP_PREVIEW_MODES.has(String(mode || '').toLowerCase())
      ? String(mode || '').toLowerCase()
      : 'off';
    if (normalized !== 'off') {
      root.classList.add('is-standalone-pwa');
      root.setAttribute('data-display-mode', 'standalone');
      root.setAttribute('data-pt-app-preview', '1');
      root.setAttribute('data-pt-app-preview-mode', normalized);
      root.setAttribute('data-preview-viewport', normalized === 'ipad' ? 'tablet' : 'mobile');
      root.setAttribute('data-preview-nav', 'hamburger');
      return;
    }
    root.removeAttribute('data-pt-app-preview');
    root.removeAttribute('data-pt-app-preview-mode');
    root.removeAttribute('data-preview-viewport');
    root.removeAttribute('data-preview-nav');
    if (!browserIsStandalone()) {
      root.classList.remove('is-standalone-pwa');
      root.setAttribute('data-display-mode', 'browser');
    }
  } catch {
    // ignore
  }
};

const setAppPreviewMode = (mode) => {
  if (!showAppPreviewToggle) return;
  appPreviewMode.value = APP_PREVIEW_MODES.has(String(mode || '').toLowerCase())
    ? String(mode || '').toLowerCase()
    : 'off';
  applyAppPreviewMode(appPreviewMode.value);
  try {
    localStorage.setItem(APP_PREVIEW_STORAGE_KEY, appPreviewMode.value);
  } catch {
    // ignore
  }
};

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
// - affiliation (direct club login), OR agency that hosts clubs (e.g. Summit Stats Team Challenge)
const showClubLinks = computed(() => !!loginTheme.value?.agency?.showClubLinks);
const suggestedSignupEmail = computed(() => String(username.value || '').trim());
const showSignupSuggestion = computed(() => {
  if (!showClubLinks.value) return false;
  if (!suggestedSignupEmail.value.includes('@')) return false;
  const message = String(error.value || '').toLowerCase();
  return message.includes('user not found') || message.includes("doesn't have an account") || message.includes('does not have an account');
});
const normalizeSummitTenantSlug = (value) => String(value || '').trim().toLowerCase();
const isSummitTenantSlug = (value) => {
  const slug = normalizeSummitTenantSlug(value);
  return slug === 'ssc' || slug === 'sstc' || slug === 'summit-stats';
};
const buildInitials = (value, fallback = 'SS') => {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return fallback;
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
};

/** Summit Stats tenants (SSC / SSTC / alias): phone number is an accepted login identifier. */
const isSSCLogin = computed(() => {
  return isSummitTenantSlug(loginSlug.value);
});
const isAppPreviewMode = computed(() => appPreviewMode.value !== 'off');
const isIpadPreviewMode = computed(() => appPreviewMode.value === 'ipad');
const isAppLike = computed(() => isAppPreviewMode.value || browserIsStandalone());
const primaryLoginTitle = computed(() => (isSSCLogin.value ? SUMMIT_STATS_TEAM_CHALLENGE_NAME : displayTitle.value));
const primaryLoginSubtitle = computed(() =>
  isSSCLogin.value ? 'Sign in to continue' : defaultLoginSubtitle.value
);
const loginContainerStyle = computed(() => {
  if (isAppLike.value) {
    return {
      background: 'linear-gradient(180deg, #0b2447 0%, #16315f 28%, #0f172a 100%)'
    };
  }
  return { background: loginBackground.value };
});
const usernameFieldLabel = computed(() => (isSSCLogin.value ? 'Email, username, or phone number' : 'Username'));
const usernameFieldPlaceholder = computed(() =>
  isSSCLogin.value ? 'Email, username, or phone (e.g. 555-867-5309)' : 'Enter your username'
);

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
const sscTenantDisplayName = computed(() => {
  const themedName = String(loginTheme.value?.agency?.name || '').trim();
  return themedName || SUMMIT_STATS_TEAM_CHALLENGE_NAME;
});
const sscTenantInitials = computed(() => buildInitials(sscTenantDisplayName.value, 'SS'));
const sscClubDisplayName = computed(() => {
  const name = String(sscClubBranding.value?.name || '').trim();
  return name || 'Your Club';
});
const sscClubInitials = computed(() => buildInitials(sscClubDisplayName.value, 'CL'));

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

    // Summit-family logins serve on the tenant slug directly. Child orgs redirect to the parent tenant login.
    const canonical = (data?.agency?.canonicalLoginSlug || '').toString().trim().toLowerCase();
    const current = (portalUrl || '').toString().trim().toLowerCase();
    if (canonical && current && canonical !== current) {
      if (isSummitTenantSlug(canonical)) {
        router.replace({ path: `/${canonical}/login`, query: route.query });
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
  if (showAppPreviewToggle) {
    try {
      const raw = String(localStorage.getItem(APP_PREVIEW_STORAGE_KEY) || '').trim().toLowerCase();
      // Back-compat: older toggle stored "1"/"0"
      appPreviewMode.value = raw === '1'
        ? 'phone'
        : (raw === '0' ? 'off' : (APP_PREVIEW_MODES.has(raw) ? raw : 'off'));
    } catch {
      appPreviewMode.value = 'off';
    }
    applyAppPreviewMode(appPreviewMode.value);
  }

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
    // Summit-family logins: when username is pre-filled from URL, auto-verify to show password immediately.
    const currentSlugForAuto = String(loginSlug.value || '').trim().toLowerCase();
    if (restored && isSummitTenantSlug(currentSlugForAuto)) {
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
const passwordVisible = ref(false);
const showPassword = ref(false);
const needsOrgChoice = ref(false);
const orgOptions = ref([]);
const selectedOrgSlug = ref('');
const rememberLogin = ref(false);
const rememberedGoogleLogin = ref(null);
const sscClubBranding = ref(null); // populated after identify on Summit-family logins when we know the club context
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
  sscClubBranding.value = null;
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
    const isSummitLogin = isSummitTenantSlug(current);

    // Summit-family logins stay on the tenant login the user chose.
    // This prevents /ssc from snapping over to unrelated org portals like /itsco or /rudy.
    if (isSummitLogin) {
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
      // When we're already on the correct branded login (e.g. /ssc/login), always store the
      // current canonical loginSlug rather than the internal org alias ('summit-stats').
      // This prevents the partner-hub redirect from building /ssc/summit-stats/login on the
      // next visit and trapping the user in the two-step nested flow.
      const slugToStore = (isSummitLogin && loginSlug.value) ? loginSlug.value : resolvedSlug;
      setRememberedLogin({
        username: u,
        orgSlug: slugToStore,
        parentOrgSlug: resolveParentForNestedLogin(slugToStore)
      });
    } else if (!rememberLogin.value && reason === 'remembered') {
      clearRememberedLogin();
    }

    // Capture SSC club branding for the dual-brand split panel
    sscClubBranding.value =
      data?.affiliationBranding && (data.affiliationBranding.logoUrl || data.affiliationBranding.name)
        ? data.affiliationBranding
        : null;

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

.app-preview-toggle-group {
  position: fixed;
  top: 12px;
  right: 10px;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-preview-toggle {
  border: 1px solid #1d4ed8;
  background: #ffffff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 7px 11px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.16);
}

.app-preview-toggle.active {
  background: #1d4ed8;
  color: #ffffff;
}

.login-signup-suggestion {
  margin: 12px 0 0;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  background: rgba(239, 246, 255, 0.96);
}

.login-signup-suggestion__text {
  margin: 0;
  color: #1e3a8a;
  font-size: 14px;
  line-height: 1.5;
}

.login-signup-suggestion__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

@media (max-width: 520px) {
  .login-signup-suggestion__actions {
    flex-direction: column;
  }

  .login-signup-suggestion__actions .btn {
    width: 100%;
    justify-content: center;
  }
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

.login-container--app {
  align-items: flex-start;
  padding: 24px 14px 16px;
  position: relative;
}

.login-container--ipad {
  padding: 36px 26px 24px;
}

:global(html[data-pt-app-preview="1"]) .login-page {
  max-width: 430px;
  margin: 0 auto;
  min-height: 100dvh;
  background: #081a36;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05), 0 8px 30px rgba(0, 0, 0, 0.35);
}

:global(html[data-pt-app-preview-mode="ipad"]) .login-page {
  width: min(1024px, 96vw);
  height: min(768px, 88vh);
  min-height: 0;
  max-height: 768px;
  max-width: 1024px;
  border-radius: 24px;
  overflow: hidden;
  margin: auto;
  background: #06152f;
  box-shadow: 0 20px 44px rgba(2, 6, 23, 0.35);
}

:global(html.is-standalone-pwa) .login-page {
  max-width: 430px;
  margin: 0 auto;
  min-height: 100dvh;
  background: #081a36;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05), 0 8px 30px rgba(0, 0, 0, 0.35);
}

:global(html[data-pt-app-preview="1"]) .login-container {
  align-items: flex-start;
  padding: 20px 12px 10px;
  background: transparent !important;
}

:global(html[data-pt-app-preview-mode="ipad"]) .login-container {
  height: 100%;
  padding: 22px 28px;
  justify-content: center !important;
  align-items: center !important;
  background: radial-gradient(120% 140% at 0% 0%, #0f4e95 0%, #0b2f62 42%, #071a3b 100%) !important;
}

:global(html.is-standalone-pwa) .login-container {
  align-items: flex-start;
  padding: 20px 12px 10px;
  background: transparent !important;
}

:global(html[data-pt-app-preview="1"]) .login-card {
  border-radius: 22px;
  padding: 22px 18px 14px;
  margin-top: 10px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 22px 46px rgba(2, 6, 23, 0.4);
}

:global(html[data-pt-app-preview-mode="ipad"]) .login-card {
  width: min(92%, 860px);
  max-width: 860px;
  padding: 0 0 0;
  margin-top: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
  border: none;
  box-shadow: none;
}

:global(html.is-standalone-pwa) .login-card {
  border-radius: 22px;
  padding: 22px 18px 14px;
  margin-top: 10px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 22px 46px rgba(2, 6, 23, 0.4);
}

:global(html[data-pt-app-preview="1"]) .login-logo .logo-image,
:global(html.is-standalone-pwa) .login-logo .logo-image {
  height: 128px;
  max-height: 128px;
}

:global(html[data-pt-app-preview-mode="ipad"]) .login-logo .logo-image {
  height: 168px;
  max-height: 168px;
}

:global(html[data-pt-app-preview="1"]) .login-card h2,
:global(html.is-standalone-pwa) .login-card h2 {
  font-size: 31px;
  line-height: 1.1;
  margin-bottom: 6px;
}

:global(html[data-pt-app-preview-mode="ipad"]) .login-card h2 {
  font-size: 40px;
}

:global(html[data-pt-app-preview="1"]) .subtitle,
:global(html.is-standalone-pwa) .subtitle {
  font-size: 20px;
  margin-bottom: 16px;
}

:global(html[data-pt-app-preview-mode="ipad"]) .subtitle {
  font-size: 22px;
  margin-bottom: 20px;
}

:global(html[data-pt-app-preview="1"]) .login-help,
:global(html.is-standalone-pwa) .login-help {
  margin-top: 14px;
}

:global(html[data-pt-app-preview-mode="ipad"]) .login-help {
  margin-top: 18px;
}

.login-card {
  background: white;
  padding: 24px 22px;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 400px;
}

.login-page--ssc .login-card {
  background: transparent;
  border: none;
  box-shadow: none;
}

.login-page--ssc:not(.login-page--app-like) .login-card {
  width: min(92vw, 560px);
  max-width: 560px;
}

.login-page--ssc .login-logo {
  margin-bottom: 14px;
}

.login-page--ssc .login-logo .logo-image {
  height: 176px;
  max-height: 176px;
}

.login-page--ssc:not(.login-page--app-like) .login-logo .logo-image {
  height: 300px;
  max-height: 300px;
}

.login-page--ssc .subtitle {
  color: #0b1f3d;
  margin-bottom: 14px;
  font-weight: 600;
}

.login-page--ssc:not(.login-page--app-like) .subtitle {
  font-size: 18px;
  margin-bottom: 18px;
}

.login-page--ssc .login-form .form-group label {
  color: #0f172a;
  font-weight: 700;
}

.login-page--ssc:not(.login-page--app-like) .login-form .form-group label {
  font-size: 14px;
}

.login-page--ssc .login-form .form-group input,
.login-page--ssc .login-form .form-group select {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.48);
  color: #0f172a;
}

.login-page--ssc:not(.login-page--app-like) .login-form .form-group input,
.login-page--ssc:not(.login-page--app-like) .login-form .form-group select {
  min-height: 58px;
  font-size: 16px;
}

.login-page--ssc .login-form .form-group input::placeholder,
.login-page--ssc .login-form .form-group select::placeholder {
  color: #64748b;
}

.login-page--ssc .remember-me {
  color: #0f172a;
}

.login-page--ssc:not(.login-page--app-like) .remember-me {
  font-size: 20px;
}

.login-page--ssc .btn-primary {
  background: linear-gradient(180deg, #67adf0 0%, #3f8fdb 100%);
  border: 1px solid #69b3fc;
  box-shadow: 0 8px 20px rgba(16, 72, 133, 0.2);
}

.login-page--ssc:not(.login-page--app-like) .btn-primary {
  min-height: 60px;
  font-size: 24px;
  font-weight: 700;
}

.login-page--ssc .help-link,
.login-page--ssc .help-link-button {
  color: #0f172a;
  font-weight: 600;
}

.login-page--ssc .help-link:hover,
.login-page--ssc .help-link-button:hover {
  color: #0b3a75;
}

.login-page--ssc .help-separator {
  color: rgba(15, 23, 42, 0.45);
}

.login-page--ssc:not(.login-page--app-like) .login-help {
  font-size: 15px;
}

.login-card--app :deep(.btn-primary),
.login-card--app .btn-primary {
  border-radius: 12px;
  min-height: 50px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.01em;
  background: linear-gradient(180deg, #4f97e1 0%, #2f7fce 100%);
  border: 1px solid #2c74bd;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.login-card--app .login-form .form-group input,
.login-card--app .login-form .form-group select {
  min-height: 50px;
  border-radius: 12px;
  border-color: #d1d5db;
}

.login-card--app .login-form .form-group label {
  color: #d9e9ff;
}

.login-card--app .remember-me {
  color: #d9e9ff;
}

.login-card--app .help-link,
.login-card--app .help-link-button {
  color: #8ecbff;
}

.login-card--app .help-separator {
  color: rgba(216, 232, 255, 0.55);
}

.login-card--app .login-form .form-group input:focus,
.login-card--app .login-form .form-group select:focus {
  border-color: #4f97e1;
  box-shadow: 0 0 0 3px rgba(79, 151, 225, 0.15);
}

.login-card--app .remember-me {
  font-size: 16px;
}

.login-card--app .help-link {
  font-size: 13px;
}

.login-card--wide {
  max-width: 640px;
}

.login-card--ipad {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.login-card--app {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.login-card--ipad .ipad-hero-panel {
  margin: 0 0 16px;
  padding: 8px 8px 10px;
  background: transparent;
  border: none;
  border-radius: 0;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.ipad-hero-logo {
  width: 100%;
  max-width: 300px;
  height: auto;
  object-fit: contain;
  justify-self: center;
  filter: drop-shadow(0 6px 18px rgba(2, 6, 23, 0.35));
}

.login-card--ipad .ipad-hero-copy .subtitle {
  margin: 2px 0 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 24px;
  text-align: center;
  font-weight: 500;
  line-height: 1.2;
}

.login-card--ipad .login-form {
  border-top: none;
  padding-top: 0;
}

.login-card--ipad .login-form .form-group input,
.login-card--ipad .login-form .form-group select {
  min-height: 56px;
  font-size: 18px;
  background: rgba(8, 19, 43, 0.52);
  color: #f8fbff;
  border: 1px solid rgba(194, 222, 255, 0.45);
}

.login-card--ipad .login-form .form-group label {
  font-size: 16px;
  color: #d9e9ff;
  font-weight: 700;
}

.login-card--ipad .remember-me {
  font-size: 18px;
  color: #d9e9ff;
}

.login-card--ipad .remember-me input[type="checkbox"] {
  width: 22px;
  height: 22px;
}

.login-card--ipad :deep(.btn-primary),
.login-card--ipad .btn-primary {
  min-height: 56px;
  font-size: 22px;
}

.login-card--ipad .login-help {
  margin-top: 14px;
  font-size: 16px;
}

.login-card--ipad .ipad-auth-panel {
  background: transparent;
  border-radius: 0;
  border: none;
  box-shadow: none;
  padding: 6px 8px 8px;
}

.login-card--app .app-auth-panel {
  background: transparent;
  border-radius: 0;
  border: none;
  box-shadow: none;
  padding: 6px 8px 8px;
}

.login-card--ipad .help-link,
.login-card--ipad .help-link-button {
  color: #8ecbff;
}

.login-card--ipad .help-separator {
  color: rgba(216, 232, 255, 0.55);
}

.login-card--ipad .login-form .form-group input::placeholder,
.login-card--ipad .login-form .form-group select::placeholder {
  color: rgba(236, 245, 255, 0.72);
}

.login-card--ipad .login-form .form-group input:focus,
.login-card--ipad .login-form .form-group select:focus {
  border-color: #8ecbff;
  box-shadow: 0 0 0 3px rgba(142, 203, 255, 0.22);
}

.login-card--ipad .remember-me input[type="checkbox"] {
  accent-color: #8ecbff;
}

.login-card--ipad :deep(.btn-primary),
.login-card--ipad .btn-primary {
  color: #ffffff;
  background: linear-gradient(180deg, #67adf0 0%, #3f8fdb 100%);
  border: 1px solid #69b3fc;
  box-shadow: 0 8px 20px rgba(16, 72, 133, 0.3);
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

/* SSC-specific variant: transparent background to blend with the SSC card */
.login-page--ssc .login-dual-brand--ssc {
  gap: 6px;
  padding: 12px 12px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(238, 247, 255, 0.98) 52%, rgba(241, 255, 247, 0.96) 100%);
  border-color: rgba(162, 197, 255, 0.46);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(10px);
}

.login-dual-brand__logo--ssc {
  max-height: 72px !important;
  width: auto;
}

.login-dual-brand__logo--club {
  max-height: 64px !important;
  max-width: 130px !important;
  width: auto;
}

.login-dual-brand__fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin-bottom: 4px;
  border-radius: 22px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #0f172a;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.login-dual-brand__fallback--ssc {
  background: linear-gradient(135deg, rgba(51, 122, 255, 0.16) 0%, rgba(28, 189, 126, 0.18) 100%);
}

.login-dual-brand__fallback--club {
  background: linear-gradient(135deg, rgba(255, 196, 72, 0.18) 0%, rgba(255, 123, 84, 0.2) 100%);
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
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
  margin-bottom: 6px;
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
  background: linear-gradient(180deg, rgba(203, 213, 225, 0) 0%, rgba(148, 163, 184, 0.85) 50%, rgba(203, 213, 225, 0) 100%);
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

@media (max-width: 760px) {
  .login-card--ipad .ipad-hero-panel {
    grid-template-columns: 1fr;
    text-align: center;
    padding-top: 16px;
  }

  .login-card--ipad .ipad-hero-copy h2,
  .login-card--ipad .ipad-hero-copy .subtitle {
    text-align: center;
  }

  .ipad-hero-logo {
    max-width: 180px;
  }
}

@media (max-height: 760px) {
  :global(html[data-pt-app-preview-mode="ipad"]) .login-page {
    height: min(700px, 92vh);
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
.password-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.password-input-wrap input {
  flex: 1;
  padding-right: 60px;
}
.password-toggle-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--primary, #0f766e);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 2px;
  line-height: 1;
  user-select: none;
}
.password-toggle-btn:focus-visible {
  outline: 2px solid var(--primary, #0f766e);
  border-radius: 3px;
}

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

.help-link-button {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
}

.app-login-links {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 10px;
}

.app-login-link-btn {
  display: block;
  width: 100%;
  text-align: center;
  text-decoration: none;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1d4ed8;
  background: #f8fafc;
}

.app-login-link-btn--secondary {
  color: #334155;
  background: #ffffff;
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
