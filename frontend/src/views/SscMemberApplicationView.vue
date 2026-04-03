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
        <div class="reg-hero-content">
          <!-- Platform logo (SSC/SSTC) -->
          <div class="reg-hero-logos">
            <img
              v-if="platformLogoUrl"
              :src="platformLogoUrl"
              class="hero-logo hero-logo--platform"
              alt="Platform logo"
            />
            <div v-if="platformLogoUrl && clubLogoUrl" class="hero-logo-divider"></div>
            <img
              v-if="clubLogoUrl"
              :src="clubLogoUrl"
              class="hero-logo hero-logo--club"
              alt="Club logo"
            />
          </div>

          <div class="reg-hero-text">
            <div class="hero-eyebrow">You're joining</div>
            <h1 class="hero-club-name">{{ clubDisplayName }}</h1>
            <div v-if="inviteData?.label" class="hero-tag">{{ inviteData.label }}</div>
            <div v-if="referralInfo" class="hero-referral">
              Referred by <strong>{{ referralInfo }}</strong>
            </div>
          </div>
        </div>

        <!-- Platform name strip -->
        <div v-if="platformName" class="reg-hero-platform-strip">
          Powered by {{ platformName }}
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
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1d4ed8 100%);
  background-size: cover;
  background-position: center;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}
.reg-hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(10, 8, 40, 0.70) 0%, rgba(10, 8, 40, 0.55) 100%);
  pointer-events: none;
}
.reg-hero-content {
  position: relative;
  padding: 28px 28px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.reg-hero-logos {
  display: flex;
  align-items: center;
  gap: 14px;
}
.hero-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
  border-radius: 8px;
  background: rgba(255,255,255,0.1);
  padding: 4px;
}
.hero-logo--platform { filter: brightness(0) invert(1); opacity: 0.90; }
.hero-logo--club { background: rgba(255,255,255,0.15); }
.hero-logo-divider {
  width: 1px; height: 32px;
  background: rgba(255,255,255,0.3);
  flex-shrink: 0;
}
.reg-hero-text { color: #fff; }
.hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  opacity: .75;
  margin-bottom: 4px;
}
.hero-club-name {
  margin: 0;
  font-size: clamp(1.4rem, 4vw, 2rem);
  font-weight: 900;
  line-height: 1.15;
  letter-spacing: -.01em;
}
.hero-tag {
  margin-top: 6px;
  display: inline-block;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(6px);
}
.hero-referral {
  margin-top: 6px;
  font-size: 13px;
  opacity: .85;
}
.reg-hero-platform-strip {
  position: relative;
  padding: 8px 28px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .05em;
  color: rgba(255,255,255,0.55);
  background: rgba(0,0,0,0.25);
  backdrop-filter: blur(4px);
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
.field input, .field select {
  padding: 10px 13px;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  transition: border-color .15s, box-shadow .15s;
  color: #0f172a;
}
.field input:focus, .field select:focus {
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
