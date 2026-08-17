<template>
  <DigitalFormShell
    class="pref-form"
    :branding="formBranding"
    :program-title-override="agencyName || 'Communication Preferences'"
    form-subtitle="Communication & Notification Preferences"
    :progress-steps="progressSteps"
    :progress-index="progressIndex"
    :cover-mode="loading || !!fatalError || step === 'done'"
  >
    <div v-if="loading" class="df-loading">Loading…</div>

    <div v-else-if="fatalError" class="df-banner df-banner--warn">{{ fatalError }}</div>

    <!-- Step 1: Identify -->
    <form v-else-if="step === 'identify'" @submit.prevent="identify">
      <h1 class="df-title">Identify Yourself</h1>
      <p class="df-subtitle">
        Enter the email address associated with your account and we'll load your current preferences.
      </p>
      <DigitalFormField
        v-model="emailInput"
        type="email"
        label="Work Email"
        placeholder="you@example.com"
        required
        :error="identifyError"
      />
      <div class="df-actions df-actions--end">
        <button type="submit" class="df-btn df-btn-primary" :disabled="identifying">
          {{ identifying ? 'Looking up…' : 'Continue' }}
          <span v-if="!identifying" aria-hidden="true">→</span>
        </button>
      </div>
    </form>

    <!-- Step 2: Preferences form -->
    <div v-else-if="step === 'form'" class="pref-form-body">
      <div class="pref-welcome-row">
        <span class="pref-avatar">{{ initials }}</span>
        <div>
          <p class="pref-welcome-name">{{ fullName }}</p>
          <p class="df-subtitle" style="margin: 0; font-size: 0.85rem;">Editing preferences for this account</p>
        </div>
      </div>

      <section class="pref-section">
        <h3 class="df-section-title">Notification Channels</h3>
        <p class="df-section-help">Choose which channels you'd like to receive notifications through.</p>

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

      <section class="pref-section">
        <h3 class="df-section-title">Internal Workforce SMS Notifications</h3>
        <p class="df-section-help">This preference applies to your participating tenant accounts below.</p>
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

      <section class="pref-section">
        <h3 class="df-section-title">Quiet Hours</h3>
        <p class="df-section-help">When quiet hours are active, non-urgent notifications will be held until the window ends.</p>

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
              <input type="time" v-model="prefs.quiet_hours_start_time" class="df-input" />
            </div>
            <div class="pref-field">
              <label>End Time</label>
              <input type="time" v-model="prefs.quiet_hours_end_time" class="df-input" />
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

      <section class="pref-section">
        <h3 class="df-section-title">Display Preferences</h3>

        <div class="pref-field">
          <label for="pref-appearance">Appearance</label>
          <select id="pref-appearance" v-model="prefs.theme_preference" class="df-select">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">Match device</option>
          </select>
          <span class="pref-muted">Match device follows your phone or computer light/dark setting.</span>
        </div>

        <div class="pref-field">
          <label for="pref-timezone">Timezone</label>
          <select id="pref-timezone" v-model="prefs.timezone" class="df-select">
            <option v-for="opt in timezoneOptions" :key="opt.value || 'default'" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="pref-field">
          <label for="pref-density">Layout Density</label>
          <select id="pref-density" v-model="prefs.layout_density" class="df-select">
            <option v-for="opt in densityOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </section>

      <p v-if="saveError" class="pref-inline-error">{{ saveError }}</p>

      <DigitalFormActions
        :primary-label="saving ? 'Saving…' : 'Save My Preferences'"
        :primary-disabled="saving"
        :show-arrow="!saving"
        @primary="save"
      />
    </div>

    <!-- Step 3: Success -->
    <DigitalFormSuccess
      v-else-if="step === 'done'"
      title="Preferences Saved"
      body="Your notification and communication preferences have been updated. These changes are now live in your account. You can update your preferences again any time you receive this link, or by logging in to your account."
    />
  </DigitalFormShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import {
  DigitalFormShell,
  DigitalFormField,
  DigitalFormActions,
  DigitalFormSuccess
} from '../components/digital-form';

const route = useRoute();
const publicKey = computed(() => route.params.publicKey);

const step = ref('identify');
const loading = ref(true);
const fatalError = ref('');
const agencyName = ref('');
const formBranding = ref(null);
const tenantOptions = ref([]);

const progressSteps = [
  { id: 'identify', label: 'Identify' },
  { id: 'form', label: 'Preferences' },
  { id: 'done', label: 'Done' }
];
const progressIndex = computed(() => {
  if (step.value === 'form') return 1;
  if (step.value === 'done') return 2;
  return 0;
});

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

const timezoneOptions = [
  { value: '', label: 'System Default' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' }
];

const densityOptions = [
  { value: 'standard', label: 'Standard' },
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' }
];

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
  theme_preference: 'light',
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
    formBranding.value = resp.data?.branding || null;
    agencyName.value =
      resp.data?.branding?.agencyName ||
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
      theme_preference: p.theme_preference || (p.dark_mode ? 'dark' : 'light'),
      timezone: p.timezone || '',
      layout_density: p.layout_density || 'standard',
      show_read_receipts: p.show_read_receipts ?? false,
      allow_staff_step_in: p.allow_staff_step_in ?? true,
    });
    quietDaysSelected.value = Array.isArray(p.quiet_hours_allowed_days) ? [...p.quiet_hours_allowed_days] : [];

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

    const theme = String(prefs.theme_preference || (prefs.dark_mode ? 'dark' : 'light')).toLowerCase();
    const payload = {
      ...prefs,
      theme_preference: ['light', 'dark', 'system'].includes(theme) ? theme : 'light',
      dark_mode: theme === 'dark',
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
.df-loading {
  padding: 2rem 0;
  color: var(--df-muted);
  text-align: center;
}

.pref-muted {
  color: var(--df-muted);
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
  color: var(--df-text);
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
  border: 1px solid var(--df-border, #e5e7eb);
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

.pref-inline-error {
  color: #dc2626;
  font-size: 0.875rem;
  margin: -4px 0 12px;
}

.pref-toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; }
.pref-toggle input { opacity: 0; width: 0; height: 0; }
.pref-toggle-track {
  position: absolute; inset: 0;
  background: #d1d5db;
  border-radius: 999px;
  transition: background 0.2s;
}
.pref-toggle input:checked + .pref-toggle-track { background: var(--df-primary); }
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
  border-bottom: 1px solid var(--df-border, #f0f0f0);
  gap: 16px;
}
.pref-toggle-row:last-child { border-bottom: none; }
.pref-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pref-toggle-info strong { font-size: 0.9rem; color: var(--df-text); }
.pref-toggle-info .pref-muted { font-size: 0.82rem; }

.pref-section {
  margin-top: 28px;
  padding-top: 8px;
}

.pref-radio-group { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.pref-radio-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
  cursor: pointer;
}
.pref-radio-row input[type="radio"] { accent-color: var(--df-primary); }

.pref-quiet-block { padding: 16px 0 0; }
.pref-day-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.pref-day-chip {
  padding: 5px 12px;
  border: 1px solid var(--df-border, #d1d5db);
  border-radius: 20px;
  font-size: 0.8rem;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
}
.pref-day-chip input { display: none; }
.pref-day-chip.active {
  background: var(--df-primary);
  color: #fff;
  border-color: var(--df-primary);
}

.pref-welcome-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--df-border, #e5e7eb);
  margin-bottom: 4px;
}
.pref-avatar {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: var(--df-primary);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pref-welcome-name { font-weight: 700; font-size: 1rem; margin: 0; color: var(--df-text); }
</style>
