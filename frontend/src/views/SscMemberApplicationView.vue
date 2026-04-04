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

    <!-- Success -->
    <div v-else-if="submitted" class="reg-success">
      <div class="success-icon">🎉</div>
      <h1>Application Submitted!</h1>
      <p class="success-sub">
        Your application to <strong>{{ clubDisplayName }}</strong> has been received.
        The club manager will review it and you'll be notified once approved.
      </p>
      <p v-if="inviteData?.autoApprove" class="success-auto">
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
          <span class="platform-bar-name">{{ platformName || 'Summit Stats Team Challenge' }}</span>
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
                required
              />
              <p v-if="inviteData?.email" class="field-hint">Pre-filled from your invite link</p>
            </div>

            <div class="field">
              <label>Phone number <span class="opt">(optional)</span></label>
              <input v-model="form.phone" type="tel" autocomplete="tel" placeholder="e.g. 555-867-5309" />
            </div>

            <!-- Username section -->
            <div class="field">
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

            <div class="field-row">
              <div class="field">
                <label>Password <span class="req">*</span></label>
                <input v-model="form.password" type="password" autocomplete="new-password" minlength="8" required />
                <p class="field-hint">At least 8 characters</p>
              </div>
              <div class="field">
                <label>Confirm password <span class="req">*</span></label>
                <input v-model="form.confirmPassword" type="password" autocomplete="new-password" required />
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
                <label>How many hours do you average per week currently?</label>
                <div class="input-addon-row">
                  <input v-model.number="form.averageHoursPerWeek" type="number" min="0" max="200" step="0.1" placeholder="5" />
                  <span class="addon">hrs</span>
                </div>
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
                By applying to join this club through the Summit Stats Team Challenge platform, you understand that your account
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
          <div v-if="submitError" class="form-error" role="alert">{{ submitError }}</div>

          <!-- Submit -->
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg" :disabled="submitting">
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
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { TIMEZONE_GROUPS, detectLocalTimezone } from '../utils/timezones.js';

const route = useRoute();

// ── Page state ──────────────────────────────────────────────────────────────
const pageLoading  = ref(true);
const pageError    = ref('');
const submitted    = ref(false);
const submitting   = ref(false);
const submitError  = ref('');

const inviteData     = ref(null);
const clubInfo       = ref(null);
const customFields   = ref([]);
const referralInfo   = ref('');

// Branding
const platformLogoUrl = ref('');
const platformName    = ref('');
const clubLogoUrl     = ref('');
const bannerImageUrl  = ref('');

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
    pageLoading.value = false;
  }
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
  if (!form.password || form.password.length < 8) {
    submitError.value = 'Password must be at least 8 characters.'; return;
  }
  if (form.password !== form.confirmPassword) {
    submitError.value = 'Passwords do not match.'; return;
  }
  if (!form.waiverAccepted) {
    submitError.value = 'You must accept the participation waiver to submit your application.'; return;
  }
  if (!form.waiverSignatureName.trim()) {
    submitError.value = 'Please type your full name to sign the waiver.'; return;
  }

  const clubId = inviteData.value?.clubId || clubInfo.value?.id || clubIdParam.value;
  if (!clubId) { submitError.value = 'Club not identified. Please use a valid join link.'; return; }

  const payload = {
    firstName:    form.firstName.trim(),
    lastName:     form.lastName.trim(),
    email:        form.email.trim().toLowerCase(),
    phone:        form.phone.trim() || null,
    username:     form.username.trim() || null,
    password:     form.password,
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
    referralCode: referralCode.value || null
  };

  submitting.value = true;
  try {
    if (inviteToken.value) {
      await api.post(`/summit-stats/clubs/invite/${inviteToken.value}/apply`, payload, { skipAuthRedirect: true });
    } else {
      await api.post(`/summit-stats/clubs/${clubId}/apply-form`, payload, { skipAuthRedirect: true });
    }
    submitted.value = true;
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
.reg-loading, .reg-error-state, .reg-success {
  text-align: center;
  padding: 80px 24px;
  max-width: 520px;
  margin: auto;
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
}
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
