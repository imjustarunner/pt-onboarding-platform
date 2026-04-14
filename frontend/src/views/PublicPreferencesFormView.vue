<template>
  <div class="pref-form-container">
    <!-- Header -->
    <div class="pref-form-header">
      <div class="pref-form-logo" v-if="agencyName">{{ agencyName }}</div>
      <h1 class="pref-form-title">Communication &amp; Notification Preferences</h1>
      <p class="pref-form-subtitle">Update your personal notification and communication settings below.</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="pref-loading">
      <span class="pref-spinner" />
      <span>Loading&hellip;</span>
    </div>

    <!-- Error -->
    <div v-else-if="fatalError" class="pref-error-card">
      <p>{{ fatalError }}</p>
    </div>

    <!-- Step 1: Identify -->
    <div v-else-if="step === 'identify'" class="pref-card">
      <h2>Identify Yourself</h2>
      <p class="pref-muted">Enter the email address associated with your account and we'll load your current preferences.</p>
      <div class="pref-field">
        <label for="pref-email">Work Email <span class="req">*</span></label>
        <input
          id="pref-email"
          v-model="emailInput"
          type="email"
          placeholder="you@example.com"
          autocomplete="email"
          @keydown.enter="identify"
        />
      </div>
      <p v-if="identifyError" class="pref-inline-error">{{ identifyError }}</p>
      <button class="btn btn-primary pref-btn" :disabled="identifying" @click="identify">
        <span v-if="identifying" class="pref-spinner-sm" />
        {{ identifying ? 'Looking up…' : 'Continue' }}
      </button>
    </div>

    <!-- Step 2: Preferences form -->
    <div v-else-if="step === 'form'" class="pref-card">
      <div class="pref-welcome-row">
        <span class="pref-avatar">{{ initials }}</span>
        <div>
          <p class="pref-welcome-name">{{ fullName }}</p>
          <p class="pref-muted" style="font-size:0.85rem;">Editing preferences for this account</p>
        </div>
      </div>

      <!-- Section: Core Channels -->
      <section class="pref-section">
        <h3>Notification Channels</h3>
        <p class="pref-muted">Choose which channels you'd like to receive notifications through.</p>

        <div class="pref-toggle-row">
          <div class="pref-toggle-info">
            <strong>Email Notifications</strong>
            <span class="pref-muted">Receive updates and alerts via email.</span>
          </div>
          <label class="pref-toggle">
            <input type="checkbox" v-model="prefs.email_enabled" />
            <span class="pref-toggle-track" />
          </label>
        </div>

        <div class="pref-toggle-row">
          <div class="pref-toggle-info">
            <strong>SMS / Text Notifications</strong>
            <span class="pref-muted">Receive scheduling and operational reminders by text.</span>
          </div>
          <label class="pref-toggle">
            <input type="checkbox" v-model="prefs.sms_enabled" />
            <span class="pref-toggle-track" />
          </label>
        </div>

        <div class="pref-toggle-row">
          <div class="pref-toggle-info">
            <strong>In-App Notifications</strong>
            <span class="pref-muted">Always on — required for platform alerts.</span>
          </div>
          <label class="pref-toggle pref-toggle-disabled">
            <input type="checkbox" checked disabled />
            <span class="pref-toggle-track" />
          </label>
        </div>

        <div class="pref-toggle-row">
          <div class="pref-toggle-info">
            <strong>Notification Sounds</strong>
            <span class="pref-muted">Play a sound when a new in-app notification arrives.</span>
          </div>
          <label class="pref-toggle">
            <input type="checkbox" v-model="prefs.notification_sound_enabled" />
            <span class="pref-toggle-track" />
          </label>
        </div>
      </section>

      <!-- Section: Campaign 4 — Internal Workforce SMS -->
      <section class="pref-section">
        <h3>Internal Workforce SMS Notifications</h3>
        <p class="pref-muted">
          This preference applies to your participating tenant accounts below.
        </p>
        <div class="pref-tenant-disclosures">
          <div v-for="tenant in campaign4Tenants" :key="tenant.key" class="pref-tenant-block">
            <p class="pref-muted pref-tenant-disclosure">
              By opting in, you agree to receive recurring SMS/text messages from {{ tenant.name }} through PlotTwistHQ for
              operational notifications and reminders, internal announcements, and optional polls/voting related to your participation
              on the platform. Message frequency varies. Message and data rates may apply. Text HELP for help. Text STOP to opt-out.
              Carriers are not liable for delayed or undelivered messages.
            </p>
            <div class="pref-radio-group pref-radio-group-tenant">
              <label class="pref-radio-row">
                <input
                  type="radio"
                  :name="`tenant-opt-${tenant.key}`"
                  :checked="tenantOptInValue(tenant.key) === 'yes'"
                  @change="setTenantOptIn(tenant.key, 'yes')"
                />
                <span>Yes – I opt in to internal workforce SMS notifications for {{ tenant.name }}</span>
              </label>
              <label class="pref-radio-row">
                <input
                  type="radio"
                  :name="`tenant-opt-${tenant.key}`"
                  :checked="tenantOptInValue(tenant.key) === 'no'"
                  @change="setTenantOptIn(tenant.key, 'no')"
                />
                <span>No – Keep internal notifications off for {{ tenant.name }}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Section: Quiet Hours -->
      <section class="pref-section">
        <h3>Quiet Hours</h3>
        <p class="pref-muted">When quiet hours are active, non-urgent notifications will be held until the window ends.</p>

        <div class="pref-toggle-row">
          <div class="pref-toggle-info">
            <strong>Enable Quiet Hours</strong>
          </div>
          <label class="pref-toggle">
            <input type="checkbox" v-model="prefs.quiet_hours_enabled" />
            <span class="pref-toggle-track" />
          </label>
        </div>

        <div v-if="prefs.quiet_hours_enabled" class="pref-quiet-block">
          <div class="pref-field-row">
            <div class="pref-field">
              <label>Start Time</label>
              <input type="time" v-model="prefs.quiet_hours_start_time" />
            </div>
            <div class="pref-field">
              <label>End Time</label>
              <input type="time" v-model="prefs.quiet_hours_end_time" />
            </div>
          </div>
          <div class="pref-field">
            <label>Active Days</label>
            <div class="pref-day-chips">
              <label
                v-for="day in allDays"
                :key="day"
                class="pref-day-chip"
                :class="{ active: quietDaysSelected.includes(day) }"
              >
                <input type="checkbox" :value="day" v-model="quietDaysSelected" />
                {{ day.slice(0, 3) }}
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Section: Display -->
      <section class="pref-section">
        <h3>Display Preferences</h3>

        <div class="pref-toggle-row">
          <div class="pref-toggle-info">
            <strong>Dark Mode</strong>
            <span class="pref-muted">Switch the platform to a dark color scheme.</span>
          </div>
          <label class="pref-toggle">
            <input type="checkbox" v-model="prefs.dark_mode" />
            <span class="pref-toggle-track" />
          </label>
        </div>

        <div class="pref-field">
          <label>Timezone</label>
          <select v-model="prefs.timezone">
            <option value="">System Default</option>
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Chicago">Central Time (CT)</option>
            <option value="America/Denver">Mountain Time (MT)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="America/Anchorage">Alaska Time (AKT)</option>
            <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
          </select>
        </div>

        <div class="pref-field">
          <label>Layout Density</label>
          <select v-model="prefs.layout_density">
            <option value="standard">Standard</option>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </div>
      </section>

      <!-- Save error -->
      <p v-if="saveError" class="pref-inline-error">{{ saveError }}</p>

      <button class="btn btn-primary pref-btn" :disabled="saving" @click="save">
        <span v-if="saving" class="pref-spinner-sm" />
        {{ saving ? 'Saving…' : 'Save My Preferences' }}
      </button>
    </div>

    <!-- Step 3: Success -->
    <div v-else-if="step === 'done'" class="pref-card pref-success-card">
      <div class="pref-success-icon">&#10003;</div>
      <h2>Preferences Saved</h2>
      <p>Your notification and communication preferences have been updated. These changes are now live in your account.</p>
      <p class="pref-muted" style="margin-top: 12px; font-size: 0.85rem;">
        You can update your preferences again any time you receive this link, or by logging in to your account.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const publicKey = computed(() => route.params.publicKey);

const step = ref('identify');
const loading = ref(true);
const fatalError = ref('');
const agencyName = ref('');
const tenantOptions = ref([]);

const emailInput = ref('');
const identifyError = ref('');
const identifying = ref(false);

const userId = ref(null);
const firstName = ref('');
const lastName = ref('');
const fullName = computed(() => [firstName.value, lastName.value].filter(Boolean).join(' '));
const initials = computed(() =>
  [firstName.value?.[0], lastName.value?.[0]].filter(Boolean).join('').toUpperCase()
);
const campaign4Tenants = computed(() => {
  if (Array.isArray(tenantOptions.value) && tenantOptions.value.length) {
    return tenantOptions.value
      .map((t) => ({
        key: String(t?.id || '').trim() || String(t?.name || '').trim().toLowerCase().replace(/\s+/g, '_'),
        name: String(t?.name || '').trim()
      }))
      .filter((t) => t.key && t.name);
  }
  const fallbackName = agencyName.value || 'your agency';
  return [{ key: 'default', name: fallbackName }];
});

const internalWorkforceByTenant = ref({});

const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const quietDaysSelected = ref([]);

const prefs = reactive({
  email_enabled: true,
  sms_enabled: false,
  in_app_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start_time: null,
  quiet_hours_end_time: null,
  quiet_hours_allowed_days: [],
  notification_categories: {},
  notification_sound_enabled: true,
  push_notifications_enabled: false,
  dark_mode: false,
  timezone: '',
  layout_density: 'standard',
  show_read_receipts: false,
  allow_staff_step_in: true,
});

const saving = ref(false);
const saveError = ref('');

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

const tenantOptInValue = (tenantKey) => {
  const raw = internalWorkforceByTenant.value?.[tenantKey];
  return raw === 'yes' ? 'yes' : 'no';
};

const setTenantOptIn = (tenantKey, value) => {
  internalWorkforceByTenant.value = {
    ...(internalWorkforceByTenant.value || {}),
    [tenantKey]: value === 'yes' ? 'yes' : 'no',
  };
};

const loadLinkMeta = async () => {
  try {
    const resp = await api.get(`/public-intake/${publicKey.value}`);
    const link = resp.data?.link;
    if (!link || String(link.form_type || '') !== 'internal_preferences') {
      fatalError.value = 'This link is not a valid Internal Preferences form.';
      return;
    }
    agencyName.value =
      resp.data?.agency?.official_name ||
      resp.data?.agency?.name ||
      resp.data?.organization?.official_name ||
      resp.data?.organization?.name ||
      '';
  } catch {
    fatalError.value = 'Unable to load this preferences form. The link may be invalid or expired.';
  } finally {
    loading.value = false;
  }
};

const identify = async () => {
  identifyError.value = '';
  const email = emailInput.value.trim();
  if (!email) {
    identifyError.value = 'Please enter your email address.';
    return;
  }
  identifying.value = true;
  try {
    const resp = await api.post(`/public-intake/${publicKey.value}/preferences/identify`, { email });
    const data = resp.data;
    userId.value = data.userId;
    firstName.value = data.firstName || '';
    lastName.value = data.lastName || '';
    tenantOptions.value = Array.isArray(data.tenants)
      ? data.tenants
        .map((t) => ({
          id: Number(t?.id || 0) || null,
          name: String(t?.name || '').trim(),
        }))
        .filter((t) => t.name)
      : [];

    // Hydrate local prefs
    const p = data.preferences || {};
    Object.assign(prefs, {
      email_enabled: p.email_enabled ?? true,
      sms_enabled: p.sms_enabled ?? false,
      in_app_enabled: p.in_app_enabled ?? true,
      quiet_hours_enabled: p.quiet_hours_enabled ?? false,
      quiet_hours_start_time: p.quiet_hours_start_time || null,
      quiet_hours_end_time: p.quiet_hours_end_time || null,
      quiet_hours_allowed_days: p.quiet_hours_allowed_days || [],
      notification_categories: p.notification_categories || {},
      notification_sound_enabled: p.notification_sound_enabled ?? true,
      push_notifications_enabled: p.push_notifications_enabled ?? false,
      dark_mode: p.dark_mode ?? false,
      timezone: p.timezone || '',
      layout_density: p.layout_density || 'standard',
      show_read_receipts: p.show_read_receipts ?? false,
      allow_staff_step_in: p.allow_staff_step_in ?? true,
    });
    quietDaysSelected.value = Array.isArray(p.quiet_hours_allowed_days) ? [...p.quiet_hours_allowed_days] : [];

    // Detect Campaign 4 opt-in from notification_categories
    const cats = p.notification_categories || {};
    const byTenant = (cats.internal_workforce_sms_by_tenant && typeof cats.internal_workforce_sms_by_tenant === 'object')
      ? cats.internal_workforce_sms_by_tenant
      : {};
    const defaultOpt = cats.internal_workforce_sms === true ? 'yes' : 'no';
    const nextByTenant = {};
    for (const tenant of campaign4Tenants.value) {
      const explicit = byTenant[tenant.key];
      nextByTenant[tenant.key] = explicit === true ? 'yes' : explicit === false ? 'no' : defaultOpt;
    }
    internalWorkforceByTenant.value = nextByTenant;

    step.value = 'form';
  } catch (err) {
    identifyError.value =
      err?.response?.data?.error?.message ||
      'We could not find an account with that email. Please check and try again.';
  } finally {
    identifying.value = false;
  }
};

const save = async () => {
  saveError.value = '';
  saving.value = true;
  try {
    // Merge Campaign 4 opt-in into notification_categories
    const categories = { ...(prefs.notification_categories || {}) };
    const perTenant = {};
    let anyOptedIn = false;
    for (const tenant of campaign4Tenants.value) {
      const enabled = tenantOptInValue(tenant.key) === 'yes';
      perTenant[tenant.key] = enabled;
      if (enabled) anyOptedIn = true;
    }
    categories.internal_workforce_sms_by_tenant = perTenant;
    categories.internal_workforce_sms = anyOptedIn;

    const payload = {
      ...prefs,
      quiet_hours_allowed_days: quietDaysSelected.value,
      notification_categories: categories,
    };

    await api.put(`/public-intake/${publicKey.value}/preferences/save`, {
      userId: userId.value,
      preferences: payload,
    });
    step.value = 'done';
  } catch (err) {
    saveError.value =
      err?.response?.data?.error?.message ||
      'Something went wrong saving your preferences. Please try again.';
  } finally {
    saving.value = false;
  }
};

onMounted(loadLinkMeta);
</script>

<style scoped>
.pref-form-container {
  min-height: 100vh;
  background: var(--bg-page, #f8fafc);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px 64px;
}

.pref-form-header {
  text-align: center;
  margin-bottom: 28px;
  max-width: 560px;
  width: 100%;
}
.pref-form-logo {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primary, #4f46e5);
  margin-bottom: 10px;
}
.pref-form-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
  margin: 0 0 8px;
}
.pref-form-subtitle {
  color: var(--text-secondary, #6b7280);
  font-size: 0.95rem;
  margin: 0;
}

.pref-card {
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 32px;
  max-width: 560px;
  width: 100%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.pref-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary, #6b7280);
  padding: 48px;
}

.pref-error-card {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 24px 28px;
  color: #b91c1c;
  max-width: 480px;
  width: 100%;
  text-align: center;
}

.pref-muted {
  color: var(--text-secondary, #6b7280);
  font-size: 0.9rem;
}

.pref-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.pref-field label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}
.pref-field input,
.pref-field select {
  padding: 9px 12px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  font-size: 0.95rem;
  background: #fff;
  color: var(--text-primary, #111827);
}
.pref-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.pref-tenant-disclosures {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pref-tenant-block {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff;
}
.pref-tenant-disclosure {
  margin: 0;
}
.pref-radio-group-tenant {
  margin-top: 10px;
}
.req { color: #dc2626; }

.pref-inline-error {
  color: #dc2626;
  font-size: 0.875rem;
  margin: -4px 0 12px;
}

.pref-btn {
  margin-top: 8px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Toggle */
.pref-toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; }
.pref-toggle input { opacity: 0; width: 0; height: 0; }
.pref-toggle-track {
  position: absolute; inset: 0;
  background: #d1d5db;
  border-radius: 999px;
  transition: background 0.2s;
}
.pref-toggle input:checked + .pref-toggle-track { background: var(--color-primary, #4f46e5); }
.pref-toggle-track::after {
  content: '';
  position: absolute;
  width: 18px; height: 18px;
  background: #fff;
  border-radius: 50%;
  top: 3px; left: 3px;
  transition: transform 0.2s;
}
.pref-toggle input:checked + .pref-toggle-track::after { transform: translateX(20px); }
.pref-toggle-disabled { opacity: 0.45; cursor: not-allowed; }

.pref-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border, #f0f0f0);
  gap: 16px;
}
.pref-toggle-row:last-child { border-bottom: none; }
.pref-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pref-toggle-info strong { font-size: 0.9rem; color: var(--text-primary, #111827); }
.pref-toggle-info .pref-muted { font-size: 0.82rem; }

/* Section */
.pref-section {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.pref-section h3 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
  margin: 0 0 6px;
}

/* Radio group */
.pref-radio-group { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.pref-radio-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
  cursor: pointer;
}
.pref-radio-row input[type="radio"] { accent-color: var(--color-primary, #4f46e5); }

/* Quiet hours */
.pref-quiet-block { padding: 16px 0 0; }
.pref-day-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.pref-day-chip {
  padding: 5px 12px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 20px;
  font-size: 0.8rem;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
}
.pref-day-chip input { display: none; }
.pref-day-chip.active { background: var(--color-primary, #4f46e5); color: #fff; border-color: var(--color-primary, #4f46e5); }

/* Welcome row */
.pref-welcome-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  margin-bottom: 4px;
}
.pref-avatar {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: var(--color-primary, #4f46e5);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pref-welcome-name { font-weight: 700; font-size: 1rem; margin: 0; color: var(--text-primary, #111827); }

/* Success */
.pref-success-card { text-align: center; }
.pref-success-icon {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: #d1fae5;
  color: #065f46;
  font-size: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
}

/* Spinners */
.pref-spinner {
  width: 28px; height: 28px;
  border: 3px solid #e5e7eb;
  border-top-color: var(--color-primary, #4f46e5);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
.pref-spinner-sm {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
