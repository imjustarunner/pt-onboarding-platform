<template>
  <div class="app-page">
    <!-- Loading invite/club data -->
    <div v-if="pageLoading" class="app-loading">
      <div class="spinner"></div>
      <p>Loading…</p>
    </div>

    <!-- Error resolving invite / club -->
    <div v-else-if="pageError" class="app-error-state">
      <div class="error-icon">⚠️</div>
      <h2>{{ pageError }}</h2>
      <p>Check your link or <a :href="`/${orgSlug}/clubs`">browse available clubs</a>.</p>
    </div>

    <!-- Success state -->
    <div v-else-if="submitted" class="success-state">
      <div class="success-icon">✅</div>
      <h1>Application Submitted!</h1>
      <p class="success-sub">
        Your application to <strong>{{ clubInfo?.clubName || clubInfo?.name }}</strong> has been received.
        The club manager will review it and you'll be notified when approved.
      </p>
      <p v-if="inviteData?.autoApprove" class="success-auto">
        You've been automatically approved! <a :href="`/${orgSlug}`">Sign in to get started.</a>
      </p>
      <router-link :to="`/${orgSlug}/clubs`" class="btn btn-secondary">Browse Other Clubs</router-link>
    </div>

    <!-- Application form -->
    <div v-else class="app-form-wrap">
      <!-- Club header -->
      <div class="club-header">
        <img v-if="clubLogoUrl" :src="clubLogoUrl" class="club-logo" alt="Club logo" />
        <div class="club-header-text">
          <div class="club-eyebrow">You're joining</div>
          <h1 class="club-name">{{ clubInfo?.clubName || clubInfo?.name }}</h1>
          <div v-if="inviteData?.label" class="invite-label">{{ inviteData.label }}</div>
          <div v-if="referralInfo" class="referral-notice">
            Referred by <strong>{{ referralInfo }}</strong>
          </div>
        </div>
      </div>

      <form class="app-form" @submit.prevent="handleSubmit" novalidate>
        <!-- ── Account ───────────────────────────────────────── -->
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
              :value="inviteData?.email || form.email"
              :readonly="!!inviteData?.email"
              required
            />
          </div>

          <div class="field">
            <label>Phone number <span class="opt">(optional)</span></label>
            <input v-model="form.phone" type="tel" autocomplete="tel" />
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

        <!-- ── Activity Profile ──────────────────────────────── -->
        <section class="form-section">
          <h2 class="section-title">Activity Profile <span class="section-opt">Optional — used for division recognition</span></h2>

          <div class="field-row">
            <div class="field">
              <label>Gender</label>
              <select v-model="form.gender">
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-binary</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="field">
              <label>Date of birth</label>
              <input v-model="form.dateOfBirth" type="date" />
              <p class="field-hint">Used for Masters age-group recognition</p>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label>Weight</label>
              <div class="input-addon-row">
                <input v-model.number="form.weightLbs" type="number" min="50" max="600" step="0.5" placeholder="e.g. 185" />
                <span class="addon">lbs</span>
              </div>
              <p class="field-hint">For Clydesdale / Athena division</p>
            </div>
            <div class="field">
              <label>Height</label>
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

        <!-- ── Club Custom Fields ────────────────────────────── -->
        <section v-if="customFields.length" class="form-section">
          <h2 class="section-title">Club Profile Fields</h2>
          <div
            v-for="field in customFields"
            :key="field.id"
            class="field"
          >
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
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { TIMEZONE_GROUPS, detectLocalTimezone } from '../utils/timezones.js';

const route = useRoute();

// ── Page state ───────────────────────────────────────────────────
const pageLoading  = ref(true);
const pageError    = ref('');
const submitted    = ref(false);
const submitting   = ref(false);
const submitError  = ref('');

const inviteData   = ref(null);   // resolved from ?invite=TOKEN
const clubInfo     = ref(null);   // { clubId, clubName, logoUrl }
const customFields = ref([]);
const referralInfo = ref('');     // display name of referrer (not loaded; just for future use)

// ── Route context ────────────────────────────────────────────────
const orgSlug    = computed(() => route.params.organizationSlug || 'ssc');
const inviteToken = computed(() => route.query.invite || '');
const referralCode = computed(() => route.query.ref || '');
const clubIdParam  = computed(() => route.query.club || '');

// ── Club logo ────────────────────────────────────────────────────
const clubLogoUrl = computed(() => inviteData.value?.logoUrl || clubInfo.value?.logoUrl || null);

// ── Form state ───────────────────────────────────────────────────
const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
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

// Height in inches computed
const heightInches = computed(() => {
  const ft = Number(form.heightFt) || 0;
  const inches = Number(form.heightIn) || 0;
  return ft > 0 || inches > 0 ? ft * 12 + inches : null;
});

// ── Load invite / club data on mount ─────────────────────────────
onMounted(async () => {
  // Auto-detect timezone
  form.timezone = detectLocalTimezone();

  try {
    if (inviteToken.value) {
      // Resolve invite token
      const { data } = await api.get(`/summit-stats/clubs/invite/${inviteToken.value}`, { skipAuthRedirect: true });
      inviteData.value = data.invite;
      customFields.value = data.customFields || [];
      clubInfo.value = { clubName: data.invite.clubName, logoUrl: data.invite.logoUrl, clubId: data.invite.clubId };
      if (data.invite.email) form.email = data.invite.email;
    } else if (clubIdParam.value) {
      // Load from public club stats
      const { data } = await api.get(`/summit-stats/clubs/${clubIdParam.value}/public`, { skipAuthRedirect: true });
      clubInfo.value = data.club;
      // Load custom fields
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

// ── Form submission ───────────────────────────────────────────────
const handleSubmit = async () => {
  submitError.value = '';

  // Basic validation
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

  const clubId = inviteData.value?.clubId || clubInfo.value?.clubId || clubInfo.value?.id || clubIdParam.value;
  if (!clubId) { submitError.value = 'Club not identified. Please use a valid join link.'; return; }

  // Build payload
  const payload = {
    firstName:    form.firstName.trim(),
    lastName:     form.lastName.trim(),
    email:        form.email.trim().toLowerCase(),
    phone:        form.phone.trim() || null,
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
.app-page {
  min-height: 100vh;
  background: var(--surface-bg, #f8fafc);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px 80px;
}

/* ── States ── */
.app-loading, .app-error-state, .success-state {
  text-align: center;
  padding: 80px 24px;
  max-width: 480px;
}
.spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--border, #e2e8f0);
  border-top-color: var(--primary, #1d4ed8);
  border-radius: 50%;
  animation: spin .7s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-icon, .success-icon { font-size: 48px; margin-bottom: 12px; }
.success-sub { color: var(--text-secondary, #64748b); margin-top: 8px; }
.success-auto { margin-top: 12px; padding: 10px 14px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; color: #166534; font-size: 14px; }

/* ── Form wrap ── */
.app-form-wrap {
  width: 100%;
  max-width: 600px;
}

/* ── Club header ── */
.club-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  padding: 20px 24px;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
}
.club-logo {
  width: 56px; height: 56px;
  object-fit: contain;
  border-radius: 8px;
  flex-shrink: 0;
}
.club-eyebrow {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--text-muted, #94a3b8);
  margin-bottom: 2px;
}
.club-name {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 800;
}
.invite-label {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  margin-top: 2px;
}
.referral-notice {
  margin-top: 4px;
  font-size: 12px;
  color: var(--primary, #1d4ed8);
}

/* ── Form ── */
.app-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 24px;
}
.section-title {
  margin: 0 0 18px;
  font-size: 1rem;
  font-weight: 700;
}
.section-opt {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted, #94a3b8);
  margin-left: 6px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
@media (max-width: 480px) { .field-row { grid-template-columns: 1fr; } }

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 14px;
}
.field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #0f172a);
}
.field input, .field select {
  padding: 9px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 7px;
  font-size: 14px;
  background: #fff;
  transition: border-color .15s;
}
.field input:focus, .field select:focus {
  outline: none;
  border-color: var(--primary, #1d4ed8);
}
.field input[readonly] {
  background: var(--surface-2, #f1f5f9);
  color: var(--text-secondary, #64748b);
}
.field-hint {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}
.req { color: #ef4444; margin-left: 2px; }
.opt { font-size: 11px; font-weight: 400; color: var(--text-muted, #94a3b8); margin-left: 4px; }

.input-addon-row {
  display: flex;
  align-items: center;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 7px;
  overflow: hidden;
}
.input-addon-row input {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 9px 12px;
}
.input-addon-row input:focus { outline: none; }
.addon {
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  background: var(--surface-2, #f1f5f9);
  border-left: 1px solid var(--border, #e2e8f0);
  white-space: nowrap;
  height: 100%;
  display: flex;
  align-items: center;
}
.height-row {
  display: flex;
  gap: 8px;
}
.height-row .input-addon-row { flex: 1; }

/* Error + actions */
.form-error {
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #991b1b;
  font-size: 14px;
}
.form-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.form-legal {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; text-decoration: none; transition: opacity .15s; }
.btn-primary { background: var(--primary, #1d4ed8); color: #fff; }
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.btn-secondary { background: var(--surface-2, #f1f5f9); color: var(--text, #0f172a); border: 1px solid var(--border, #e2e8f0); }
.btn-lg { padding: 13px 28px; font-size: 16px; }
</style>
