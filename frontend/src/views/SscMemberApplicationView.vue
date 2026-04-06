<template>
  <div class="reg-page">
    <!-- Loading -->
    <div v-if="pageLoading" class="reg-loading">
      <div class="spinner"></div>
      <p>Loading…</p>
    </div>

    <!-- Error -->
    <div v-else-if="pageError" class="reg-error-state">
      <div class="error-icon">⚠️</div>
      <h2>{{ pageError }}</h2>
      <p>Check your link or <a :href="`/${orgSlug}/clubs`">browse available clubs</a>.</p>
    </div>

    <!-- Already a member of this club -->
    <div v-else-if="showAlreadyMemberCard" class="reg-info-card">
      <div class="info-icon">✓</div>
      <h1>You're already in this club</h1>
      <p class="info-sub">
        Your account is linked to <strong>{{ clubDisplayName }}</strong>. Open your dashboard to see seasons, workouts, and club activity.
      </p>
      <div class="info-actions">
        <router-link :to="`/${orgSlug}/dashboard`" class="btn btn-primary">Go to my dashboard</router-link>
        <router-link
          v-if="resolvedClubId"
          :to="`/${orgSlug}/clubs/${resolvedClubId}`"
          class="btn btn-secondary"
        >View club page</router-link>
      </div>
    </div>

    <!-- Application already pending (same browser, email check, or signed-in account) -->
    <div v-else-if="joinPendingState" class="reg-pending-card">
      <div class="pending-icon">⏳</div>
      <h1>Application pending review</h1>
      <p class="pending-sub">
        Your request to join <strong>{{ clubDisplayName }}</strong> is waiting for a club manager.
        You do not need to register again.
      </p>
      <ul class="pending-steps">
        <li v-if="!authStore.isAuthenticated"><strong>Next:</strong> sign in with the <em>same email</em> you used on this application.</li>
        <li v-else><strong>Signed in:</strong> open your dashboard — under <em>Applications</em> you can see this request while it’s pending.</li>
        <li>The manager will approve or follow up by email when they’re ready.</li>
      </ul>
      <div class="info-actions">
        <router-link v-if="!authStore.isAuthenticated" :to="`/${orgSlug}/login`" class="btn btn-primary">Sign in</router-link>
        <router-link v-else :to="`/${orgSlug}/dashboard`" class="btn btn-primary">Open my dashboard</router-link>
      </div>
      <p v-if="pendingFromSession" class="pending-foot">
        <button type="button" class="link-btn" @click="clearPendingSessionHint">Not you? Submit a different application</button>
      </p>
    </div>

    <!-- Success -->
    <div v-else-if="submitted" class="reg-success">
      <div class="success-icon">🎉</div>
      <h1>Application Submitted!</h1>
      <p class="success-sub">
        {{ submitMessage || `Your application to ${clubDisplayName} has been received.` }}
      </p>
      <p v-if="verificationRequired" class="success-verify">
        Verify your email to finish activating this account.
        <span v-if="verificationSent"> Check your inbox for the link.</span>
      </p>
      <p v-if="verificationRequired && verificationUrl" class="success-auto">
        Email sending is not configured here, so you can use the verification link directly:
        <a :href="verificationUrl">Verify email</a>
      </p>
      <p v-if="inviteData?.autoApprove && !verificationRequired" class="success-auto">
        You've been automatically approved! <a :href="`/${orgSlug}`">Sign in to get started →</a>
      </p>
      <router-link :to="`/${orgSlug}/login`" class="btn btn-primary">Sign in to your account</router-link>
    </div>

    <!-- Form -->
    <div v-else class="reg-shell">

      <!-- ── Hero banner ─────────────────────────────── -->
      <div class="reg-hero" :style="heroStyle">
        <div class="reg-hero-overlay"></div>

        <!-- Platform brand tier -->
        <div class="reg-hero-platform-bar">
          <img
            v-if="platformLogoUrl"
            :src="platformLogoUrl"
            class="platform-bar-logo"
            alt="Platform logo"
          />
          <span class="platform-bar-name">{{ platformName || SUMMIT_STATS_TEAM_CHALLENGE_NAME }}</span>
        </div>

        <!-- Club tier -->
        <div class="reg-hero-club">
          <img
            v-if="clubLogoUrl"
            :src="clubLogoUrl"
            class="club-hero-logo"
            alt="Club logo"
          />
          <div class="club-hero-text">
            <div class="hero-eyebrow">You're joining</div>
            <h1 class="hero-club-name">{{ clubDisplayName }}</h1>
            <div v-if="inviteData?.label" class="hero-tag">{{ inviteData.label }}</div>
            <div v-if="referralInfo" class="hero-referral">
              Referred by <strong>{{ referralInfo }}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Form card ───────────────────────────────── -->
      <div class="reg-card">
        <form class="reg-form" @submit.prevent="handleSubmit" novalidate>

          <!-- ── Account ──────────────────────────────── -->
          <section v-if="previousApplicationDenied" class="form-section denied-banner">
            <p class="denied-note">
              A previous application for this email was not approved. You can submit a new application below if you’d like to try again.
            </p>
          </section>

          <section class="form-section">
            <h2 class="section-title">Your Account</h2>

            <div class="field-row">
              <div class="field">
                <label>First name <span class="req">*</span></label>
                <input v-model="form.firstName" type="text" autocomplete="given-name" required />
              </div>
              <div class="field">
                <label>Last name <span class="req">*</span></label>
                <input v-model="form.lastName" type="text" autocomplete="family-name" required />
              </div>
            </div>

            <div class="field">
              <label>Email address <span class="req">*</span></label>
              <input
                v-model="form.email"
                type="email"
                autocomplete="email"
                :readonly="!!inviteData?.email"
                @input="handleEmailInput"
                @blur="checkExistingAccount"
                required
              />
              <p v-if="inviteData?.email" class="field-hint">Pre-filled from your invite link</p>
              <p v-else-if="emailStatusLoading" class="field-hint">Checking whether this email already has an account…</p>
            </div>

            <div v-if="existingAccountDetected" class="existing-account-note">
              <strong>Existing account found.</strong>
              We recognized this email in the platform, so this application will use that account.
              No new password is needed here.
              <span v-if="existingAccountSignInMethod === 'sso'"> This looks like an SSO-only account, so they should keep using their current sign-in method.</span>
            </div>

            <div v-else-if="emailLookupDone && form.email.trim()" class="field-hint field-hint-success">
              This email is new to the platform, so we’ll create an SSC account with the password below.
            </div>

            <div class="field">
              <label>Phone number <span class="opt">(optional)</span></label>
              <input v-model="form.phone" type="tel" autocomplete="tel" placeholder="e.g. 555-867-5309" />
            </div>

            <!-- Username section -->
            <div v-if="!existingAccountDetected" class="field">
              <label>Username <span class="opt">(optional)</span></label>
              <div class="username-wrap">
                <input
                  v-model="form.username"
                  type="text"
                  autocomplete="username"
                  placeholder="e.g. speedster42"
                  pattern="[a-zA-Z0-9._\-]+"
                  maxlength="40"
                />
              </div>
              <p class="field-hint">
                Choose a username if you'd like to sign in with something other than your email or phone.
                All three will work once your account is active.
              </p>
            </div>

            <div v-if="!existingAccountDetected" class="field-row field-row--passwords">
              <div class="field">
                <label>Password <span class="req">*</span></label>
                <div class="input-wrap">
                  <input
                    v-model="form.password"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    minlength="6"
                    maxlength="128"
                    required
                  />
                  <button type="button" class="toggle-vis" @click="showPassword = !showPassword" :aria-label="showPassword ? 'Hide password' : 'Show password'">
                    {{ showPassword ? 'Hide' : 'Show' }}
                  </button>
                </div>
                <PasswordStrengthMeter :password="form.password" :confirm-password="form.confirmPassword" />
              </div>
              <div class="field">
                <label>Confirm password <span class="req">*</span></label>
                <div class="input-wrap">
                  <input
                    v-model="form.confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    required
                  />
                  <button type="button" class="toggle-vis" @click="showConfirmPassword = !showConfirmPassword" :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'">
                    {{ showConfirmPassword ? 'Hide' : 'Show' }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- ── Activity Profile ─────────────────────── -->
          <section class="form-section">
            <h2 class="section-title">Activity Profile <span class="section-opt">Optional</span></h2>

            <div class="field-row">
              <!-- Gender — only options configured by the club -->
              <div class="field">
                <label>Gender <span class="opt">(optional)</span></label>
                <select v-model="form.gender">
                  <option value="">Prefer not to say</option>
                  <option
                    v-for="opt in genderOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >{{ opt.label }}</option>
                </select>
              </div>
              <div class="field">
                <label>Date of birth <span class="opt">(optional)</span></label>
                <input v-model="form.dateOfBirth" type="date" />
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label>Weight <span class="opt">(optional)</span></label>
                <div class="input-addon-row">
                  <input v-model.number="form.weightLbs" type="number" min="50" max="800" step="0.5" placeholder="185" />
                  <span class="addon">lbs</span>
                </div>
              </div>
              <div class="field">
                <label>Height <span class="opt">(optional)</span></label>
                <div class="height-row">
                  <div class="input-addon-row">
                    <input v-model.number="form.heightFt" type="number" min="3" max="8" step="1" placeholder="5" />
                    <span class="addon">ft</span>
                  </div>
                  <div class="input-addon-row">
                    <input v-model.number="form.heightIn" type="number" min="0" max="11" step="1" placeholder="10" />
                    <span class="addon">in</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="field">
              <label>Your timezone</label>
              <select v-model="form.timezone">
                <option value="">— Use club default —</option>
                <optgroup v-for="grp in TIMEZONE_GROUPS" :key="grp.label" :label="grp.label">
                  <option v-for="tz in grp.zones" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                </optgroup>
              </select>
              <p class="field-hint">So deadlines display in your local time</p>
            </div>
          </section>

          <section class="form-section">
            <h2 class="section-title">Training Snapshot</h2>

            <div class="field">
              <label>How did you hear of us / who referred you?</label>
              <input
                v-model="form.heardAboutClub"
                type="text"
                placeholder="Friend, coach, social media, running group, etc."
              />
            </div>

            <div class="field">
              <label>Describe your running and fitness background</label>
              <textarea
                v-model="form.runningFitnessBackground"
                rows="4"
                placeholder="Tell us about your history with running, racing, training, sports, or other fitness work."
              ></textarea>
            </div>

            <div class="field-row">
              <div class="field">
                <label>How many miles do you average per week currently?</label>
                <div class="input-addon-row">
                  <input v-model.number="form.averageMilesPerWeek" type="number" min="0" max="500" step="0.1" placeholder="20" />
                  <span class="addon">mi</span>
                </div>
              </div>
              <div class="field">
                <label>How many hours of physical activity do you average per week currently?</label>
                <div class="input-addon-row">
                  <input v-model.number="form.averageHoursPerWeek" type="number" min="0" max="200" step="0.1" placeholder="5" />
                  <span class="addon">hrs</span>
                </div>
                <p class="field-hint">Include running, gym sessions, classes, cross-training, sports, hiking, and similar activity.</p>
              </div>
            </div>

            <div class="field">
              <label>Describe your current running and fitness activities</label>
              <textarea
                v-model="form.currentFitnessActivities"
                rows="4"
                placeholder="What are you doing right now? For example: easy runs, lifting, classes, cycling, hiking, mobility, team sports, etc."
              ></textarea>
            </div>
          </section>

          <section class="form-section">
            <h2 class="section-title">Participation Waiver</h2>
            <div class="waiver-card">
              <p class="waiver-copy">
                By applying to join this club through the {{ SUMMIT_STATS_TEAM_CHALLENGE_NAME }} platform, you understand that your account
                activity, posts, comments, workout submissions, and other participation may be visible within the club experience
                and are tied to your user profile.
              </p>
              <p class="waiver-copy" style="margin-top: 12px;">
                You agree to participate respectfully, follow the club manager's and assistant managers' expectations, and avoid
                harassment, abuse, inappropriate content, false submissions, misuse of platform tools, or attempts to bypass club
                or platform controls. The club manager and assistant managers may reject, remove, or limit applicants or members
                who do not follow club guidelines, and the platform reserves the right to restrict access, remove content, or take
                other protective action when needed.
              </p>
              <p class="waiver-copy" style="margin-top: 12px;">
                You also understand that running, training, and fitness activities carry inherent risks, including falls,
                collisions, weather exposure, overexertion, and medical events. Participation is voluntary, you are responsible
                for using appropriate judgment and seeking medical guidance as needed, and you release the club, its managers,
                captains, volunteers, event organizers, and the platform from claims arising from ordinary participation to the
                fullest extent allowed by law.
              </p>
              <label class="waiver-check">
                <input v-model="form.waiverAccepted" type="checkbox" />
                <span>I have read and agree to the participation waiver and community expectations above.</span>
              </label>
              <div class="field" style="margin-top: 14px;">
                <label>Type your full name to sign <span class="req">*</span></label>
                <input
                  v-model="form.waiverSignatureName"
                  type="text"
                  placeholder="Your full legal name"
                  required
                />
                <p class="field-hint">Your typed name serves as your electronic signature for this waiver.</p>
              </div>
            </div>
          </section>

          <!-- ── Club Custom Fields ───────────────────── -->
          <section v-if="customFields.length" class="form-section">
            <h2 class="section-title">Club Profile Fields</h2>
            <div v-for="field in customFields" :key="field.id" class="field">
              <label>
                {{ field.label }}
                <span v-if="field.is_required" class="req">*</span>
                <span v-else class="opt">(optional)</span>
              </label>
              <input
                v-if="field.field_type === 'text' || field.field_type === 'number'"
                v-model="form.customFields[field.id]"
                :type="field.field_type === 'number' ? 'number' : 'text'"
                :required="!!field.is_required"
              />
              <input
                v-else-if="field.field_type === 'date'"
                v-model="form.customFields[field.id]"
                type="date"
                :required="!!field.is_required"
              />
            </div>
          </section>

          <!-- Error -->
          <section v-if="requiresCaptcha" class="form-section">
            <h2 class="section-title">Human Check</h2>
            <div class="captcha-card">
              <p class="field-hint captcha-intro">Protected by reCAPTCHA. Complete this before submitting your application.</p>
              <div ref="recaptchaWidgetEl" class="recaptcha-widget-shell"></div>
              <p v-if="captchaWidgetFailed" class="form-error captcha-inline-error">Verification widget failed to load. Refresh the page and try again.</p>
              <p v-else-if="captchaError" class="form-error captcha-inline-error">{{ captchaError }}</p>
            </div>
          </section>

          <div v-if="submitError" class="form-error" role="alert">{{ submitError }}</div>

          <!-- Submit -->
          <div class="form-actions">
            <button
              type="submit"
              class="btn btn-primary btn-lg"
              :disabled="submitting || (requiresCaptcha && (!captchaToken || captchaWidgetFailed))"
            >
              {{ submitting ? 'Submitting…' : 'Submit Application' }}
            </button>
            <p class="form-legal">
              By applying you agree to share this information with the club manager.
              Already have an account? <a :href="`/${orgSlug}/login`">Sign in instead</a>.
            </p>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { TIMEZONE_GROUPS, detectLocalTimezone } from '../utils/timezones.js';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter.vue';

const route = useRoute();
const authStore = useAuthStore();
const LOCALHOST_TEST_RECAPTCHA_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

// ── Page state ──────────────────────────────────────────────────────────────
const pageLoading  = ref(true);
const pageError    = ref('');
const submitted    = ref(false);
const submitting   = ref(false);
const submitError  = ref('');
const submitMessage = ref('');
const verificationRequired = ref(false);
const verificationSent = ref(false);
const verificationUrl = ref('');
const emailStatusLoading = ref(false);
const emailLookupDone = ref(false);
const existingAccountDetected = ref(false);
const existingAccountSignInMethod = ref('');
let emailLookupTimeout = null;

const inviteData     = ref(null);
const clubInfo       = ref(null);

/** Join flow: avoid duplicate registration when already pending or already a member */
const applicationStatusFromEmail = ref('');
const pendingFromEmail = ref(false);
const alreadyMemberFromEmail = ref(false);
const pendingFromSession = ref(false);
const pendingFromAuth = ref(false);

const resolvedClubId = computed(() =>
  Number(inviteData.value?.clubId || clubInfo.value?.id || clubIdParam.value || 0) || null
);

const showAlreadyMemberCard = computed(() => alreadyMemberFromEmail.value);

const joinPendingState = computed(() => {
  if (showAlreadyMemberCard.value) return false;
  return pendingFromEmail.value || pendingFromSession.value || pendingFromAuth.value;
});

const previousApplicationDenied = computed(
  () => String(applicationStatusFromEmail.value || '').toLowerCase() === 'denied'
);
const customFields   = ref([]);
const referralInfo   = ref('');

// Branding
const platformLogoUrl = ref('');
const platformName    = ref('');
const clubLogoUrl     = ref('');
const bannerImageUrl  = ref('');
const recaptchaConfig = ref({ siteKey: '', useEnterprise: false, forceWidget: false });
const captchaToken = ref('');
const captchaError = ref('');
const captchaWidgetFailed = ref(false);
const recaptchaWidgetEl = ref(null);
const recaptchaWidgetId = ref(null);
let recaptchaInitPromise = null;
let recaptchaRetryTimer = null;

// Gender options (from club config, defaults to Male/Female)
const rawGenderOptions = ref(['male', 'female']);

// ── Route context ───────────────────────────────────────────────────────────
const orgSlug      = computed(() => route.params.organizationSlug || 'ssc');
const inviteToken  = computed(() => route.query.invite || '');
const referralCode = computed(() => route.query.ref || '');
const clubIdParam  = computed(() => route.query.club || '');

const clubDisplayName = computed(() =>
  inviteData.value?.clubName || clubInfo.value?.name || clubInfo.value?.clubName || 'this club'
);
const requiresCaptcha = computed(() => !!String(recaptchaConfig.value?.siteKey || '').trim());
const isLocalhostRecaptcha = computed(() => ['localhost', '127.0.0.1'].includes(window.location.hostname));
const activeRecaptchaSiteKey = computed(() =>
  isLocalhostRecaptcha.value && requiresCaptcha.value
    ? LOCALHOST_TEST_RECAPTCHA_SITE_KEY
    : String(recaptchaConfig.value?.siteKey || '').trim()
);
const activeRecaptchaMode = computed(() =>
  isLocalhostRecaptcha.value ? 'standard' : (recaptchaConfig.value?.useEnterprise ? 'enterprise' : 'standard')
);

// ── Hero style ──────────────────────────────────────────────────────────────
const heroStyle = computed(() => {
  if (bannerImageUrl.value) {
    return { backgroundImage: `url(${bannerImageUrl.value})` };
  }
  return {};
});

// ── Gender options — normalize stored values to {value, label} ──────────────
const BUILT_IN_GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
  non_binary: 'Non-binary',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say'
};

const genderOptions = computed(() =>
  rawGenderOptions.value.map((v) => ({
    value: v,
    label: BUILT_IN_GENDER_LABELS[v] || v
  }))
);

// ── Form state ──────────────────────────────────────────────────────────────
const showPassword = ref(false);
const showConfirmPassword = ref(false);

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  username: '',
  password: '',
  confirmPassword: '',
  gender: '',
  dateOfBirth: '',
  weightLbs: null,
  heightFt: null,
  heightIn: null,
  timezone: '',
  heardAboutClub: '',
  runningFitnessBackground: '',
  averageMilesPerWeek: null,
  averageHoursPerWeek: null,
  currentFitnessActivities: '',
  waiverAccepted: false,
  waiverSignatureName: '',
  customFields: {}
});

const resetExistingAccountState = () => {
  existingAccountDetected.value = false;
  existingAccountSignInMethod.value = '';
  emailLookupDone.value = false;
  applicationStatusFromEmail.value = '';
  alreadyMemberFromEmail.value = false;
  pendingFromEmail.value = false;
};

const clearPendingSessionHint = () => {
  const cid = resolvedClubId.value;
  try {
    if (cid) sessionStorage.removeItem(`ssc_join_pending_${cid}`);
  } catch {
    /* ignore */
  }
  pendingFromSession.value = false;
};

const clearCaptchaState = () => {
  captchaToken.value = '';
  captchaError.value = '';
};

const heightInches = computed(() => {
  const ft = Number(form.heightFt) || 0;
  const inches = Number(form.heightIn) || 0;
  return ft > 0 || inches > 0 ? ft * 12 + inches : null;
});

// ── Load data on mount ──────────────────────────────────────────────────────
onMounted(async () => {
  form.timezone = detectLocalTimezone();

  // Fetch platform branding
  try {
    const themeRes = await api.get(`/agencies/portal/${orgSlug.value}/login-theme`, { skipAuthRedirect: true });
    const theme = themeRes?.data;
    platformLogoUrl.value = theme?.agency?.logoUrl || theme?.platform?.logoUrl || '';
    platformName.value    = theme?.agency?.name || theme?.platform?.organizationName || '';
  } catch { /* non-fatal */ }

  try {
    if (inviteToken.value) {
      const { data } = await api.get(`/summit-stats/clubs/invite/${inviteToken.value}`, { skipAuthRedirect: true });
      inviteData.value   = data.invite;
      customFields.value = data.customFields || [];
      recaptchaConfig.value = data.recaptcha || recaptchaConfig.value;
      clubInfo.value     = { name: data.invite.clubName, id: data.invite.clubId };
      clubLogoUrl.value  = data.invite.logoUrl || '';
      bannerImageUrl.value = data.invite.bannerImageUrl || '';
      if (data.invite.email) form.email = data.invite.email;
      if (Array.isArray(data.invite.genderOptions) && data.invite.genderOptions.length) {
        rawGenderOptions.value = data.invite.genderOptions;
      }
    } else if (clubIdParam.value) {
      const { data } = await api.get(`/summit-stats/clubs/${clubIdParam.value}/public`, { skipAuthRedirect: true });
      clubInfo.value    = data.club;
      recaptchaConfig.value = data.recaptcha || recaptchaConfig.value;
      clubLogoUrl.value = data.club?.logoUrl || '';
      bannerImageUrl.value = data.club?.publicPageConfig?.bannerImageUrl || '';
      if (Array.isArray(data.club?.publicPageConfig?.genderOptions) && data.club.publicPageConfig.genderOptions.length) {
        rawGenderOptions.value = data.club.publicPageConfig.genderOptions;
      }
      try {
        const cfRes = await api.get(`/summit-stats/clubs/${clubIdParam.value}/custom-fields`, { skipAuthRedirect: true });
        customFields.value = cfRes.data?.fields || [];
      } catch { /* non-fatal */ }
    } else {
      pageError.value = 'No club specified. Please use a valid invite or join link.';
    }
  } catch (e) {
    pageError.value = e?.response?.data?.error?.message || 'Could not load club information.';
  } finally {
    const cid = inviteData.value?.clubId || clubInfo.value?.id || clubIdParam.value;
    if (cid) {
      try {
        if (sessionStorage.getItem(`ssc_join_pending_${cid}`) === '1') {
          pendingFromSession.value = true;
        }
      } catch {
        /* ignore */
      }
    }

    if (authStore.isAuthenticated) {
      try {
        const { data } = await api.get('/summit-stats/my-applications', { skipAuthRedirect: true, skipGlobalLoading: true });
        const apps = data?.applications || [];
        const forClub = apps.find((a) => Number(a.clubId) === Number(cid));
        pendingFromAuth.value = apps.some(
          (a) => Number(a.clubId) === Number(cid) && String(a.status || '').toLowerCase() === 'pending'
        );
        if (pendingFromSession.value && forClub && String(forClub.status || '').toLowerCase() !== 'pending') {
          clearPendingSessionHint();
        }
      } catch {
        pendingFromAuth.value = false;
      }
      const uEmail = String(authStore.user?.email || '').trim();
      if (uEmail) {
        form.email = uEmail;
      }
    }

    if (form.email.trim()) {
      await checkExistingAccount();
    }

    if (alreadyMemberFromEmail.value) {
      clearPendingSessionHint();
      pendingFromAuth.value = false;
      pendingFromEmail.value = false;
    }

    pageLoading.value = false;
    await maybeInitRecaptcha();
    document.addEventListener('visibilitychange', handleVisibilityRecaptchaRetry);
  }
});

onBeforeUnmount(() => {
  if (emailLookupTimeout) clearTimeout(emailLookupTimeout);
  if (recaptchaRetryTimer) clearTimeout(recaptchaRetryTimer);
  document.removeEventListener('visibilitychange', handleVisibilityRecaptchaRetry);
});

const loadRecaptchaScript = async (mode = 'standard', forceReload = false) => {
  if (!activeRecaptchaSiteKey.value) return null;
  if (forceReload) {
    document.querySelectorAll('script[data-ssc-recaptcha]').forEach((el) => el.remove());
    try {
      delete window.grecaptcha;
    } catch {
      window.grecaptcha = undefined;
    }
  }
  const existing = document.querySelector('script[data-ssc-recaptcha]');
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(window.grecaptcha), { once: true });
      if (window.grecaptcha) resolve(window.grecaptcha);
    });
  }
  if (window.grecaptcha) return window.grecaptcha;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = mode === 'enterprise'
      ? 'https://www.google.com/recaptcha/enterprise.js?render=explicit'
      : 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-ssc-recaptcha', 'true');
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error('Failed to load captcha'));
    document.head.appendChild(script);
  });
};

const ensureRecaptchaWidget = async (forceReload = false) => {
  if (!requiresCaptcha.value) return true;
  try {
    const grecaptcha = await loadRecaptchaScript(activeRecaptchaMode.value, forceReload);
    const api = activeRecaptchaMode.value === 'enterprise' ? grecaptcha?.enterprise : grecaptcha;
    const renderFn = api?.render;
    const readyFn = api?.ready;
    if (!renderFn) return false;
    let el = recaptchaWidgetEl.value;
    for (let i = 0; !el && i < 8; i++) {
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 80));
      el = recaptchaWidgetEl.value;
    }
    if (!el) return false;
    if (recaptchaWidgetId.value !== null) return true;
    if (readyFn) {
      await new Promise((resolve) => readyFn(resolve));
    }
    recaptchaWidgetId.value = renderFn(el, {
      sitekey: activeRecaptchaSiteKey.value,
      size: 'normal',
      theme: 'light',
      callback: (token) => {
        captchaToken.value = String(token || '').trim();
        captchaError.value = '';
        captchaWidgetFailed.value = false;
      },
      'expired-callback': () => {
        captchaToken.value = '';
        captchaError.value = 'Captcha expired. Please complete it again.';
      },
      'error-callback': () => {
        captchaToken.value = '';
        captchaError.value = 'Captcha failed to load correctly. Please refresh and try again.';
      }
    });
    return true;
  } catch {
    return false;
  }
};

const maybeInitRecaptcha = async () => {
  if (pageLoading.value || !requiresCaptcha.value) return;
  if (recaptchaInitPromise) {
    await recaptchaInitPromise;
    return;
  }
  recaptchaInitPromise = (async () => {
    await nextTick();
    await nextTick();
    let rendered = false;
    for (let attempt = 0; attempt < 3 && !rendered; attempt++) {
      rendered = await ensureRecaptchaWidget(attempt > 0);
      if (!rendered) {
        await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1)));
      }
    }
    captchaWidgetFailed.value = !rendered;
    if (!rendered && !recaptchaRetryTimer) {
      recaptchaRetryTimer = setTimeout(() => {
        recaptchaRetryTimer = null;
        void maybeInitRecaptcha();
      }, 1200);
    }
  })().finally(() => {
    recaptchaInitPromise = null;
  });
  await recaptchaInitPromise;
};

const handleVisibilityRecaptchaRetry = () => {
  if (document.visibilityState === 'visible' && requiresCaptcha.value && !captchaToken.value) {
    void maybeInitRecaptcha();
  }
};

const resetRecaptchaWidget = async () => {
  clearCaptchaState();
  try {
    const grecaptcha = await loadRecaptchaScript(activeRecaptchaMode.value);
    const api = activeRecaptchaMode.value === 'enterprise' ? grecaptcha?.enterprise : grecaptcha;
    if (api?.reset && recaptchaWidgetId.value !== null) {
      api.reset(recaptchaWidgetId.value);
    }
  } catch {
    // ignore
  }
};

const checkExistingAccount = async () => {
  const normalizedEmail = form.email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    resetExistingAccountState();
    emailStatusLoading.value = false;
    return;
  }

  const clubId = inviteData.value?.clubId || clubInfo.value?.id || clubIdParam.value;
  if (!clubId && !inviteToken.value) return;

  emailStatusLoading.value = true;
  try {
    const { data } = await api.post('/summit-stats/application-email-status', {
      email: normalizedEmail,
      clubId: clubId || null,
      inviteToken: inviteToken.value || null
    }, { skipAuthRedirect: true, skipGlobalLoading: true });

    existingAccountDetected.value = !!data?.existingAccount;
    existingAccountSignInMethod.value = data?.signInMethod || '';
    emailLookupDone.value = true;

    applicationStatusFromEmail.value = String(data?.applicationStatus || '').toLowerCase();
    alreadyMemberFromEmail.value = !!data?.alreadyMember;
    pendingFromEmail.value =
      applicationStatusFromEmail.value === 'pending' && !alreadyMemberFromEmail.value;

    if (applicationStatusFromEmail.value === 'denied') {
      clearPendingSessionHint();
    }

    if (existingAccountDetected.value) {
      form.password = '';
      form.confirmPassword = '';
      form.username = '';
    }
  } catch {
    resetExistingAccountState();
    applicationStatusFromEmail.value = '';
    alreadyMemberFromEmail.value = false;
    pendingFromEmail.value = false;
  } finally {
    emailStatusLoading.value = false;
  }
};

const handleEmailInput = () => {
  submitError.value = '';
  if (emailLookupTimeout) clearTimeout(emailLookupTimeout);
  const normalizedEmail = form.email.trim().toLowerCase();
  if (!normalizedEmail) {
    resetExistingAccountState();
    form.password = '';
    form.confirmPassword = '';
    return;
  }
  emailLookupTimeout = setTimeout(() => {
    checkExistingAccount();
  }, 300);
};

watch([requiresCaptcha, activeRecaptchaSiteKey], ([enabled, siteKey]) => {
  if (!enabled || !siteKey || pageLoading.value) return;
  void maybeInitRecaptcha();
});

// ── Submit ──────────────────────────────────────────────────────────────────
const handleSubmit = async () => {
  submitError.value = '';

  if (!form.firstName.trim() || !form.lastName.trim()) {
    submitError.value = 'First and last name are required.'; return;
  }
  if (!form.email.trim()) {
    submitError.value = 'Email address is required.'; return;
  }
  if (!existingAccountDetected.value) {
    if (!form.password || form.password.length < 8) {
      submitError.value = 'Password must be at least 8 characters.'; return;
    }
    if (form.password !== form.confirmPassword) {
      submitError.value = 'Passwords do not match.'; return;
    }
  }
  if (!form.waiverAccepted) {
    submitError.value = 'You must accept the participation waiver to submit your application.'; return;
  }
  if (!form.waiverSignatureName.trim()) {
    submitError.value = 'Please type your full name to sign the waiver.'; return;
  }
  if (requiresCaptcha.value) {
    if (captchaWidgetFailed.value) {
      submitError.value = 'Captcha failed to load. Please refresh the page and try again.'; return;
    }
    if (!captchaToken.value) {
      submitError.value = 'Please complete the captcha verification before submitting.'; return;
    }
  }

  const clubId = inviteData.value?.clubId || clubInfo.value?.id || clubIdParam.value;
  if (!clubId) { submitError.value = 'Club not identified. Please use a valid join link.'; return; }

  const payload = {
    firstName:    form.firstName.trim(),
    lastName:     form.lastName.trim(),
    email:        form.email.trim().toLowerCase(),
    phone:        form.phone.trim() || null,
    username:     existingAccountDetected.value ? null : (form.username.trim() || null),
    password:     existingAccountDetected.value ? null : form.password,
    gender:       form.gender || null,
    dateOfBirth:  form.dateOfBirth || null,
    weightLbs:    form.weightLbs || null,
    heightInches: heightInches.value,
    timezone:     form.timezone || null,
    heardAboutClub: form.heardAboutClub.trim() || null,
    runningFitnessBackground: form.runningFitnessBackground.trim() || null,
    averageMilesPerWeek: form.averageMilesPerWeek ?? null,
    averageHoursPerWeek: form.averageHoursPerWeek ?? null,
    currentFitnessActivities: form.currentFitnessActivities.trim() || null,
    waiverAccepted: form.waiverAccepted,
    waiverSignatureName: form.waiverSignatureName.trim(),
    customFields: form.customFields,
    referralCode: referralCode.value || null,
    captchaToken: captchaToken.value || null,
    portalSlug: orgSlug.value || 'ssc'
  };

  submitting.value = true;
  try {
    let response;
    if (inviteToken.value) {
      response = await api.post(`/summit-stats/clubs/invite/${inviteToken.value}/apply`, payload, { skipAuthRedirect: true });
    } else {
      response = await api.post(`/summit-stats/clubs/${clubId}/apply-form`, payload, { skipAuthRedirect: true });
    }
    submitMessage.value = response?.data?.message || '';
    verificationRequired.value = !!response?.data?.verificationRequired;
    verificationSent.value = !!response?.data?.verificationSent;
    verificationUrl.value = String(response?.data?.verifyUrl || '').trim();
    await resetRecaptchaWidget();
    submitted.value = true;
    try {
      const sid = inviteData.value?.clubId || clubInfo.value?.id || clubIdParam.value;
      if (sid) sessionStorage.setItem(`ssc_join_pending_${sid}`, '1');
    } catch {
      /* ignore */
    }
  } catch (e) {
    submitError.value = e?.response?.data?.error?.message || 'Something went wrong. Please try again.';
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
/* ── Page shell ─────────────────────────────────────────── */
.reg-page {
  min-height: 100vh;
  background: #f0f4f8;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

/* ── Loading / Error / Success ────────────────────────── */
.reg-loading, .reg-error-state, .reg-success,
.reg-info-card, .reg-pending-card {
  text-align: center;
  padding: 80px 24px;
  max-width: 520px;
  margin: auto;
}
.reg-info-card, .reg-pending-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.08);
  border: 1px solid #e2e8f0;
}
.reg-info-card h1, .reg-pending-card h1 {
  margin: 0 0 12px;
  font-size: 1.5rem;
  color: #0f172a;
}
.info-icon {
  font-size: 48px;
  line-height: 1;
  margin-bottom: 12px;
  color: #16a34a;
}
.pending-icon {
  font-size: 48px;
  line-height: 1;
  margin-bottom: 12px;
}
.info-sub, .pending-sub {
  color: #64748b;
  line-height: 1.6;
  margin: 0 0 16px;
}
.pending-steps {
  text-align: left;
  margin: 0 0 20px;
  padding-left: 1.25rem;
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.55;
}
.pending-steps li {
  margin-bottom: 8px;
}
.info-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.pending-foot {
  margin-top: 20px;
  font-size: 0.88rem;
}
.link-btn {
  background: none;
  border: none;
  color: #1d4ed8;
  text-decoration: underline;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
}
.denied-banner {
  padding: 12px 14px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
}
.denied-note {
  margin: 0;
  color: #92400e;
  font-size: 0.92rem;
  line-height: 1.45;
}
.spinner {
  width: 36px; height: 36px;
  border: 3px solid #e2e8f0;
  border-top-color: #1d4ed8;
  border-radius: 50%;
  animation: spin .7s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-icon, .success-icon { font-size: 52px; margin-bottom: 12px; }
.success-sub { color: #64748b; margin: 8px 0 16px; line-height: 1.6; }
.success-verify { color: #1e3a8a; margin: 0 0 14px; line-height: 1.6; }
.success-auto { margin: 16px 0; padding: 12px 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; color: #166534; font-size: 14px; }

/* ── Shell layout ───────────────────────────────────────── */
.reg-shell {
  width: 100%;
  max-width: 640px;
  padding-bottom: 80px;
}

/* ── Hero ───────────────────────────────────────────────── */
.reg-hero {
  position: relative;
  background: linear-gradient(160deg, #060d24 0%, #0f1f5c 40%, #0e3d9e 100%);
  background-size: cover;
  background-position: center;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.reg-hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom,
    rgba(4, 8, 28, 0.72) 0%,
    rgba(4, 8, 28, 0.45) 50%,
    rgba(4, 8, 28, 0.75) 100%);
  pointer-events: none;
}

/* Platform brand bar (top) */
.reg-hero-platform-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 24px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.30);
  backdrop-filter: blur(8px);
}
.platform-bar-logo {
  height: 28px;
  width: auto;
  object-fit: contain;
  filter: brightness(0) invert(1);
  opacity: 0.90;
  flex-shrink: 0;
}
.platform-bar-name {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .04em;
  color: rgba(255,255,255,0.90);
  text-transform: uppercase;
  white-space: nowrap;
}

/* Club tier (main hero body) */
.reg-hero-club {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 28px 24px 30px;
}
.club-hero-logo {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  object-fit: contain;
  border-radius: 16px;
  background: rgba(255,255,255,0.14);
  border: 1.5px solid rgba(255,255,255,0.22);
  padding: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.40);
}
.club-hero-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hero-eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.65);
}
.hero-club-name {
  margin: 0;
  font-size: clamp(1.55rem, 5vw, 2.2rem);
  font-weight: 900;
  line-height: 1.12;
  letter-spacing: -.02em;
  color: #ffffff;
  text-shadow: 0 2px 20px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.9);
}
.hero-tag {
  margin-top: 8px;
  display: inline-block;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.28);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(255,255,255,0.92);
  backdrop-filter: blur(6px);
  align-self: flex-start;
}
.hero-referral {
  margin-top: 4px;
  font-size: 12.5px;
  color: rgba(255,255,255,0.75);
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
}

/* ── Form card ──────────────────────────────────────────── */
.reg-card {
  background: #fff;
  border-radius: 0 0 16px 16px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.10);
  padding: 0 28px 28px;
}
.reg-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Sections ───────────────────────────────────────────── */
.form-section {
  padding: 24px 0;
  border-bottom: 1px solid #f1f5f9;
}
.form-section:last-of-type { border-bottom: none; }
.section-title {
  margin: 0 0 18px;
  font-size: .95rem;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-opt {
  font-size: 11px;
  font-weight: 500;
  color: #94a3b8;
}

/* ── Fields ─────────────────────────────────────────────── */
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
@media (max-width: 520px) { .field-row { grid-template-columns: 1fr; } }

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 14px;
}
.field:last-child { margin-bottom: 0; }
.field label {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}
.field input, .field select, .field textarea {
  padding: 10px 13px;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  transition: border-color .15s, box-shadow .15s;
  color: #0f172a;
  box-sizing: border-box;
  width: 100%;
}
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.input-wrap input {
  padding-right: 68px;
}
.toggle-vis {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #6366f1;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.toggle-vis:hover { background: #f0f0ff; }
.field-row--passwords { grid-template-columns: 1fr 1fr; align-items: start; }
.field textarea {
  min-height: 112px;
  resize: vertical;
  line-height: 1.5;
}
.field input:focus, .field select:focus, .field textarea:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79,70,229,0.10);
}
.field input[readonly] {
  background: #f8fafc;
  color: #64748b;
  cursor: default;
}
.field-hint {
  font-size: 11.5px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.4;
}
.field-hint-success {
  margin: -6px 0 12px;
  color: #0f766e;
}
.existing-account-note {
  margin: -4px 0 14px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: 12.5px;
  line-height: 1.5;
}

.req { color: #ef4444; margin-left: 2px; }
.opt { font-size: 11px; font-weight: 400; color: #94a3b8; margin-left: 4px; }

/* ── Input addon (lbs / ft / in) ────────────────────────── */
.input-addon-row {
  display: flex;
  align-items: stretch;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  transition: border-color .15s, box-shadow .15s;
}
.input-addon-row:focus-within {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79,70,229,0.10);
}
.input-addon-row input {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 10px 13px;
  box-shadow: none !important;
}
.input-addon-row input:focus { outline: none; }
.addon {
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  background: #f8fafc;
  border-left: 1.5px solid #e2e8f0;
  white-space: nowrap;
  display: flex;
  align-items: center;
}
.height-row {
  display: flex;
  gap: 8px;
}
.height-row .input-addon-row { flex: 1; }

/* ── Username ───────────────────────────────────────────── */
.username-wrap { display: flex; flex-direction: column; gap: 5px; }

/* ── Error + actions ────────────────────────────────────── */
.form-error {
  padding: 12px 16px;
  background: #fef2f2;
  border: 1.5px solid #fca5a5;
  border-radius: 8px;
  color: #991b1b;
  font-size: 14px;
  margin-top: 8px;
}
.form-actions {
  padding-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
}
.captcha-card {
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: #f8fbff;
  padding: 16px;
}
.captcha-intro {
  margin-bottom: 12px;
}
.recaptcha-widget-shell {
  min-height: 78px;
}
.captcha-inline-error {
  margin-top: 12px;
}
.waiver-card {
  border: 1px solid #d7e3f7;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff 0%, #f3f8ff 100%);
  padding: 18px;
}
.waiver-copy {
  margin: 0;
  color: #27415f;
  line-height: 1.65;
  font-size: 13.5px;
}
.waiver-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  font-size: 13.5px;
  color: #0f172a;
}
.waiver-check input {
  margin-top: 3px;
}
.form-legal {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
}
.form-legal a { color: #4f46e5; }

/* ── Buttons ─────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 11px 22px;
  border-radius: 9px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  text-decoration: none;
  transition: opacity .15s, box-shadow .15s;
}
.btn-primary {
  background: #4f46e5;
  color: #fff;
  box-shadow: 0 2px 12px rgba(79,70,229,0.22);
}
.btn-primary:hover { opacity: .92; }
.btn-primary:disabled { opacity: .55; cursor: not-allowed; box-shadow: none; }
.btn-lg { padding: 14px 30px; font-size: 15px; }
</style>
