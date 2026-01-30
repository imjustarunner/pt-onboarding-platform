<template>
  <div class="preferences-content">
    <!-- Section 1: Notification Preferences -->
    <section class="preferences-section">
      <div class="section-header">
        <h2>Notification Preferences</h2>
        <p class="section-description">Control how and when notifications reach you.</p>
      </div>
      <div class="section-content">
        <div v-if="error" class="error-box">{{ error }}</div>
        <div v-else-if="loading" class="loading">Loading...</div>

        <div v-else class="prefs-grid">
          <div class="card">
            <h3 class="card-title">Channels</h3>
            <div class="field checkbox disabled">
              <label>
                <input type="checkbox" checked disabled />
                In-App Notifications <span class="required-tag">Required</span>
              </label>
              <div class="field-help">Always enabled for safety and audit integrity.</div>
            </div>

            <div class="field checkbox">
              <label>
                <input v-model="prefs.email_enabled" type="checkbox" :disabled="viewOnly" />
                Email Notifications
              </label>
            </div>

            <div class="field checkbox">
              <label>
                <input v-model="prefs.sms_enabled" type="checkbox" :disabled="viewOnly" />
                SMS Notifications
              </label>
              <div class="field-help">If SMS is off, messages still appear in-app.</div>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Quiet Hours</h3>
            <div class="field checkbox">
              <label>
                <input v-model="prefs.quiet_hours_enabled" type="checkbox" :disabled="viewOnly" />
                Enable Quiet Hours
              </label>
              <div class="field-help">
                Outside your selected window: in-app only (except emergency broadcasts and blocking compliance alerts).
              </div>
            </div>

            <div class="field">
              <label>Allowed Days</label>
              <div class="days">
                <label v-for="d in dayOptions" :key="d" class="day">
                  <input
                    type="checkbox"
                    :disabled="viewOnly || !prefs.quiet_hours_enabled"
                    :checked="prefs.quiet_hours_allowed_days.includes(d)"
                    @change="toggleDay(d)"
                  />
                  {{ d }}
                </label>
              </div>
            </div>

            <div class="row">
              <div class="field">
                <label>Start Time</label>
                <input v-model="quietStart" type="time" :disabled="viewOnly || !prefs.quiet_hours_enabled" />
              </div>
              <div class="field">
                <label>End Time</label>
                <input v-model="quietEnd" type="time" :disabled="viewOnly || !prefs.quiet_hours_enabled" />
              </div>
            </div>

            <div class="field checkbox">
              <label>
                <input v-model="prefs.emergency_override" type="checkbox" :disabled="viewOnly" />
                Emergency Override
              </label>
              <div class="field-help">
                If enabled, urgent notifications can bypass Quiet Hours (channel toggles still apply).
              </div>
            </div>
          </div>

          <div class="card" v-if="prefs.sms_enabled">
            <h3 class="card-title">After-Hours Auto-Responder</h3>
            <div class="field checkbox">
              <label>
                <input v-model="prefs.auto_reply_enabled" type="checkbox" :disabled="viewOnly" />
                Enable Auto-Reply
              </label>
              <div class="field-help">
                Sends once per client every 4 hours. Messages are still logged and support still sees alerts.
              </div>
            </div>
            <div class="field">
              <label>Auto-Reply Message</label>
              <textarea
                v-model="prefs.auto_reply_message"
                rows="4"
                :disabled="viewOnly || !prefs.auto_reply_enabled"
                placeholder="Thanks for your message. We received it and will respond as soon as we can."
              />
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Categories</h3>

            <div class="category-group">
              <div class="category-title">Messaging</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.messaging_new_inbound_client_text" type="checkbox" :disabled="viewOnly" />
                New inbound client text
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.messaging_client_notes" type="checkbox" :disabled="viewOnly" />
                Client notes & updates
              </label>
              <label class="field checkbox">
                <input
                  v-model="prefs.notification_categories.messaging_support_safety_net_alerts"
                  type="checkbox"
                  :disabled="viewOnly || isSupportRole"
                />
                Support Safety Net alerts <span v-if="isSupportRole" class="required-tag">Required</span>
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.messaging_replies_to_my_messages" type="checkbox" :disabled="viewOnly" />
                Replies to my messages
              </label>
            </div>

            <div class="category-group">
              <div class="category-title">Scheduling</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.scheduling_room_booking_approved_denied" type="checkbox" :disabled="viewOnly" />
                Room booking approved/denied
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.scheduling_schedule_changes" type="checkbox" :disabled="viewOnly" />
                Schedule changes
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.scheduling_room_release_requests" type="checkbox" :disabled="viewOnly" />
                Room release requests
              </label>
            </div>

            <div class="category-group">
              <div class="category-title">Compliance & Documents</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.compliance_credential_expiration_reminders" type="checkbox" :disabled="viewOnly" />
                Credential expiration reminders
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.compliance_access_restriction_warnings" type="checkbox" :disabled="viewOnly" />
                Access restriction warnings
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.compliance_payroll_document_availability" type="checkbox" :disabled="viewOnly" />
                Payroll document availability
              </label>
              <div class="field-help">Blocking compliance alerts are required and cannot be disabled.</div>
            </div>

            <div class="category-group">
              <div class="category-title">Surveys & Kiosk</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.surveys_client_checked_in" type="checkbox" :disabled="viewOnly" />
                Client checked in
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.surveys_survey_completed" type="checkbox" :disabled="viewOnly" />
                Survey completed
              </label>
            </div>

            <div class="category-group">
              <div class="category-title">System & Broadcasts</div>
              <label class="field checkbox disabled">
                <input type="checkbox" checked disabled />
                Emergency broadcasts <span class="required-tag">Required</span>
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.system_org_announcements" type="checkbox" :disabled="viewOnly" />
                Organization-wide announcements
              </label>
              <div class="field-help">Emergency broadcasts always bypass preferences.</div>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-primary" @click="save" :disabled="viewOnly || saving">
              {{ saving ? 'Saving...' : 'Save Preferences' }}
            </button>
            <div v-if="saved" class="saved">Saved</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 2: Availability & Work Style -->
    <section class="preferences-section">
      <div class="section-header">
        <h2>Availability & Work Style</h2>
        <p class="section-description">Configure your working context and scheduling defaults.</p>
      </div>
      <div class="section-content">
        <div class="prefs-grid">
          <div class="card">
            <h3 class="card-title">Schedule Appearance</h3>
            <div class="field-help" style="margin-bottom: 10px;">
              Customize the colors used in schedule blocks (applies everywhere you view schedules).
            </div>

            <div class="color-grid">
              <div class="field">
                <label>Pending request</label>
                <input v-model="scheduleColors.request" type="color" :disabled="viewOnly" />
              </div>
              <div class="field">
                <label>School assigned</label>
                <input v-model="scheduleColors.school" type="color" :disabled="viewOnly" />
              </div>
              <div class="field">
                <label>Supervision</label>
                <input v-model="scheduleColors.supervision" type="color" :disabled="viewOnly" />
              </div>
              <div class="field">
                <label>Office assigned</label>
                <input v-model="scheduleColors.office_assigned" type="color" :disabled="viewOnly" />
              </div>
              <div class="field">
                <label>Office temporary</label>
                <input v-model="scheduleColors.office_temporary" type="color" :disabled="viewOnly" />
              </div>
              <div class="field">
                <label>Office booked</label>
                <input v-model="scheduleColors.office_booked" type="color" :disabled="viewOnly" />
              </div>
              <div class="field">
                <label>Google busy</label>
                <input v-model="scheduleColors.google_busy" type="color" :disabled="viewOnly" />
              </div>
              <div class="field">
                <label>EHR busy</label>
                <input v-model="scheduleColors.ehr_busy" type="color" :disabled="viewOnly" />
              </div>
            </div>

            <div style="display:flex; gap: 10px; margin-top: 10px;">
              <button class="btn btn-secondary" type="button" @click="resetScheduleColors" :disabled="viewOnly">
                Reset colors
              </button>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Work Modality</h3>
            <div class="field">
              <label>Work modality</label>
              <select v-model="prefs.work_modality" :disabled="viewOnly || !canEditAdminControlled">
                <option :value="null">Not set</option>
                <option value="in_person">In-Person</option>
                <option value="telehealth">Telehealth-Only</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <div class="field-help">
                Informational only. Scheduling access is not restricted by this.
                <span v-if="!canEditAdminControlled"> Managed by an admin.</span>
              </div>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Scheduling Preferences</h3>
            <div class="field">
              <label>Default booking duration</label>
              <select v-model.number="schedulingPrefs.default_duration_minutes" :disabled="viewOnly || !canEditAdminControlled">
                <option :value="30">30 minutes</option>
                <option :value="60">60 minutes</option>
                <option :value="90">90 minutes</option>
                <option :value="120">120 minutes</option>
              </select>
            </div>

            <div class="field">
              <label>Preferred building(s)</label>
              <select
                v-model="schedulingPrefs.preferred_location_ids"
                multiple
                :disabled="viewOnly || !canEditAdminControlled"
                class="multi"
              >
                <option v-for="l in scheduleLocations" :key="l.id" :value="l.id">{{ l.name }}</option>
              </select>
              <div class="field-help">Optional. Used only as a default filter in scheduling.</div>
            </div>

            <div class="field checkbox">
              <label>
                <input v-model="schedulingPrefs.allow_auto_approval_recurring" type="checkbox" :disabled="viewOnly || !canEditAdminControlled" />
                Allow auto-approval for recurring slots (if CPA allows)
              </label>
              <div class="field-help">This never overrides CPA approval rules.</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 3: Communication Preferences (non-notification) -->
    <section class="preferences-section">
      <div class="section-header">
        <h2>Communication Preferences</h2>
        <p class="section-description">Tune how you present yourself and how support can assist.</p>
      </div>
      <div class="section-content">
        <div class="prefs-grid">
          <div class="card">
            <h3 class="card-title">Messaging Behavior</h3>
            <label class="field checkbox">
              <input v-model="prefs.show_read_receipts" type="checkbox" :disabled="viewOnly" />
              Show read receipts to clients (if allowed)
            </label>

            <label class="field checkbox">
              <input v-model="prefs.allow_staff_step_in" type="checkbox" :disabled="viewOnly" />
              Allow support staff to step in if I don’t respond within…
            </label>

            <div class="field" v-if="prefs.allow_staff_step_in">
              <label>Minutes</label>
              <input v-model.number="prefs.staff_step_in_after_minutes" type="number" min="1" max="240" :disabled="viewOnly" />
              <div class="field-help">Safety Net stays enabled regardless; this only tunes when support is invited to help.</div>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">After-Hours Boundary (Display)</h3>
            <div class="field">
              <label>Quiet Hours window</label>
              <div class="readonly">
                <span v-if="prefs.quiet_hours_enabled">
                  {{ (prefs.quiet_hours_allowed_days || []).join(', ') || 'No days selected' }} — {{ quietStart || '—' }} to {{ quietEnd || '—' }}
                </span>
                <span v-else>Quiet Hours are disabled</span>
              </div>
            </div>
            <div class="field">
              <label>Auto-reply message</label>
              <div class="readonly">
                <span v-if="prefs.auto_reply_enabled && prefs.auto_reply_message">{{ prefs.auto_reply_message }}</span>
                <span v-else>Auto-reply is disabled</span>
              </div>
            </div>
            <div class="field-help">Messages received after hours are still monitored by the support team.</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 4: Privacy & Display -->
    <section class="preferences-section">
      <div class="section-header">
        <h2>Privacy & Display</h2>
        <p class="section-description">Control how your name appears across internal surfaces.</p>
      </div>
      <div class="section-content">
        <div class="prefs-grid">
          <div class="card">
            <h3 class="card-title">Name display</h3>
            <label class="field checkbox">
              <input v-model="prefs.show_full_name_on_schedules" type="checkbox" :disabled="viewOnly" />
              Show my full name on internal schedules
            </label>
            <label class="field checkbox">
              <input v-model="prefs.show_initials_only_on_boards" type="checkbox" :disabled="viewOnly" />
              Show initials only on hallway boards
            </label>
            <label class="field checkbox">
              <input v-model="prefs.allow_name_in_pdfs" type="checkbox" :disabled="viewOnly" />
              Allow my name to appear in exported PDFs
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 5: Accessibility & UI Preferences -->
    <section class="preferences-section">
      <div class="section-header">
        <h2>Accessibility & UI Preferences</h2>
        <p class="section-description">Non-clinical, quality-of-life settings.</p>
      </div>
      <div class="section-content">
        <div class="prefs-grid">
          <div class="card">
            <h3 class="card-title">Accessibility</h3>
            <label class="field checkbox">
              <input v-model="prefs.reduced_motion" type="checkbox" :disabled="viewOnly" />
              Reduced motion
            </label>
            <label class="field checkbox">
              <input v-model="prefs.high_contrast_mode" type="checkbox" :disabled="viewOnly" />
              High-contrast mode
            </label>
            <label class="field checkbox">
              <input v-model="prefs.larger_text" type="checkbox" :disabled="viewOnly" />
              Larger text
            </label>
          </div>

          <div class="card">
            <h3 class="card-title">Default landing page</h3>
            <div class="field">
              <label>When I log in, take me to…</label>
              <select v-model="prefs.default_landing_page" :disabled="viewOnly">
                <option value="dashboard">Dashboard</option>
                <option value="clients">Clients</option>
                <option value="schedule">Schedule</option>
              </select>
              <div class="field-help">Stored now; we’ll apply this redirect behavior next.</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 6: Account & Identity -->
    <section class="preferences-section">
      <div class="section-header">
        <h2>Account & Identity</h2>
        <p class="section-description">Read-only overview of your identity and org membership.</p>
      </div>
      <div class="section-content">
        <div class="prefs-grid">
          <div class="card">
            <h3 class="card-title">Identity</h3>
            <div class="kv"><div class="k">Name</div><div class="v">{{ identityName }}</div></div>
            <div class="kv"><div class="k">Email</div><div class="v">{{ identityEmail }}</div></div>
            <div class="kv"><div class="k">Role</div><div class="v">{{ identityRole }}</div></div>
            <div class="kv"><div class="k">Organizations</div><div class="v">{{ identityOrganizations }}</div></div>
            <div class="field-help">Password/MFA settings live in Account Info.</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../store/auth';
import api from '../services/api';

const props = defineProps({
  userId: { type: Number, required: true },
  viewOnly: { type: Boolean, default: false },
  // If true, treat admin-controlled fields as editable (admin profile tab).
  allowAdminControlledEdits: { type: Boolean, default: false },
  // Optional identity payload to display (useful in admin profile view).
  identity: { type: Object, default: null },
  organizations: { type: Array, default: () => [] }
});

const authStore = useAuthStore();

const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');

const dayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const defaultCategories = () => ({
  messaging_new_inbound_client_text: true,
  messaging_support_safety_net_alerts: true,
  messaging_replies_to_my_messages: true,
  messaging_client_notes: true,
  scheduling_room_booking_approved_denied: true,
  scheduling_schedule_changes: true,
  scheduling_room_release_requests: true,
  compliance_credential_expiration_reminders: true,
  compliance_access_restriction_warnings: true,
  compliance_payroll_document_availability: true,
  surveys_client_checked_in: true,
  surveys_survey_completed: true,
  system_emergency_broadcasts: true,
  system_org_announcements: true
});

const prefs = ref({
  email_enabled: true,
  sms_enabled: false,
  in_app_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_allowed_days: [],
  quiet_hours_start_time: null,
  quiet_hours_end_time: null,
  auto_reply_enabled: false,
  auto_reply_message: '',
  emergency_override: false,
  notification_categories: defaultCategories(),

  // Sections 2–5 fields (from user_preferences)
  work_modality: null,
  scheduling_preferences: null,
  schedule_color_overrides: null,
  show_read_receipts: false,
  allow_staff_step_in: true,
  staff_step_in_after_minutes: 15,
  show_full_name_on_schedules: true,
  show_initials_only_on_boards: true,
  allow_name_in_pdfs: true,
  reduced_motion: false,
  high_contrast_mode: false,
  larger_text: false,
  default_landing_page: 'dashboard'
});

const defaultScheduleColors = () => ({
  request: '#F2C94C',
  school: '#2D9CDB',
  supervision: '#9B51E0',
  office_assigned: '#27AE60',
  office_temporary: '#9B51E0',
  office_booked: '#EB5757',
  google_busy: '#111827',
  ehr_busy: '#F2994A'
});
const scheduleColors = ref(defaultScheduleColors());
const resetScheduleColors = () => {
  scheduleColors.value = defaultScheduleColors();
};

const schedulingPrefs = ref({
  preferred_location_ids: [],
  default_duration_minutes: 60,
  allow_auto_approval_recurring: false
});

const isSupportRole = computed(() => authStore.user?.role === 'support');
const canEditAdminControlled = computed(() => !!props.allowAdminControlledEdits);

const normalizeTimeForInput = (t) => {
  if (!t) return '';
  if (typeof t === 'string') return t.slice(0, 5);
  return '';
};

const quietStart = ref('');
const quietEnd = ref('');

watch(
  () => prefs.value.quiet_hours_enabled,
  (enabled) => {
    if (!enabled) {
      prefs.value.quiet_hours_allowed_days = [];
      quietStart.value = '';
      quietEnd.value = '';
    }
  }
);

watch(
  () => prefs.value.sms_enabled,
  (enabled) => {
    if (!enabled) {
      prefs.value.auto_reply_enabled = false;
      prefs.value.auto_reply_message = '';
    }
  }
);

watch(
  () => prefs.value.allow_staff_step_in,
  (enabled) => {
    if (!enabled) {
      prefs.value.staff_step_in_after_minutes = null;
    } else if (!prefs.value.staff_step_in_after_minutes) {
      prefs.value.staff_step_in_after_minutes = 15;
    }
  }
);

const toggleDay = (day) => {
  const set = new Set(prefs.value.quiet_hours_allowed_days || []);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  prefs.value.quiet_hours_allowed_days = Array.from(set);
};

const scheduleLocations = ref([]);
const loadScheduleLocations = async () => {
  try {
    const resp = await api.get('/office-schedule/locations');
    scheduleLocations.value = resp.data || [];
  } catch {
    scheduleLocations.value = [];
  }
};

const parseJsonMaybe = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    saved.value = false;

    const resp = await api.get(`/users/${props.userId}/preferences`);
    const data = resp.data || {};

    const categories = parseJsonMaybe(data.notification_categories) || {};
    const allowedDays = Array.isArray(data.quiet_hours_allowed_days)
      ? data.quiet_hours_allowed_days
      : (parseJsonMaybe(data.quiet_hours_allowed_days) || []);

    const sched = parseJsonMaybe(data.scheduling_preferences);
    const colors = parseJsonMaybe(data.schedule_color_overrides);

    prefs.value = {
      ...prefs.value,
      ...data,
      in_app_enabled: true,
      quiet_hours_allowed_days: Array.isArray(allowedDays) ? allowedDays : [],
      notification_categories: { ...defaultCategories(), ...categories }
    };

    // Required toggles
    prefs.value.notification_categories.system_emergency_broadcasts = true;
    if (isSupportRole.value) {
      prefs.value.notification_categories.messaging_support_safety_net_alerts = true;
    }

    schedulingPrefs.value = {
      ...schedulingPrefs.value,
      ...(sched || {})
    };

    scheduleColors.value = { ...defaultScheduleColors(), ...(colors || {}) };

    quietStart.value = normalizeTimeForInput(prefs.value.quiet_hours_start_time);
    quietEnd.value = normalizeTimeForInput(prefs.value.quiet_hours_end_time);

    await loadScheduleLocations();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load preferences';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  try {
    saving.value = true;
    error.value = '';
    saved.value = false;

    const categories = { ...(prefs.value.notification_categories || {}) };
    categories.system_emergency_broadcasts = true;
    if (isSupportRole.value) categories.messaging_support_safety_net_alerts = true;

    const payload = {
      // Notifications
      email_enabled: !!prefs.value.email_enabled,
      sms_enabled: !!prefs.value.sms_enabled,
      quiet_hours_enabled: !!prefs.value.quiet_hours_enabled,
      quiet_hours_allowed_days: prefs.value.quiet_hours_enabled ? (prefs.value.quiet_hours_allowed_days || []) : [],
      quiet_hours_start_time: prefs.value.quiet_hours_enabled && quietStart.value ? quietStart.value : null,
      quiet_hours_end_time: prefs.value.quiet_hours_enabled && quietEnd.value ? quietEnd.value : null,
      emergency_override: !!prefs.value.emergency_override,
      auto_reply_enabled: prefs.value.sms_enabled ? !!prefs.value.auto_reply_enabled : false,
      auto_reply_message: prefs.value.sms_enabled && prefs.value.auto_reply_enabled ? (prefs.value.auto_reply_message || '') : null,
      notification_categories: categories,
      schedule_color_overrides: scheduleColors.value || null,

      // Sections 2–5
      show_read_receipts: !!prefs.value.show_read_receipts,
      allow_staff_step_in: !!prefs.value.allow_staff_step_in,
      staff_step_in_after_minutes: prefs.value.allow_staff_step_in ? Number(prefs.value.staff_step_in_after_minutes || 15) : null,
      show_full_name_on_schedules: !!prefs.value.show_full_name_on_schedules,
      show_initials_only_on_boards: !!prefs.value.show_initials_only_on_boards,
      allow_name_in_pdfs: !!prefs.value.allow_name_in_pdfs,
      reduced_motion: !!prefs.value.reduced_motion,
      high_contrast_mode: !!prefs.value.high_contrast_mode,
      larger_text: !!prefs.value.larger_text,
      default_landing_page: prefs.value.default_landing_page || 'dashboard'
    };

    if (canEditAdminControlled.value) {
      payload.work_modality = prefs.value.work_modality || null;
      payload.scheduling_preferences = schedulingPrefs.value || null;
    }

    await api.put(`/users/${props.userId}/preferences`, payload);
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save preferences';
  } finally {
    saving.value = false;
  }
};

const identityName = computed(() => {
  if (props.identity) return `${props.identity.first_name || ''} ${props.identity.last_name || ''}`.trim() || '—';
  const u = authStore.user;
  if (!u) return '—';
  return `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || u.email || '—';
});
const identityEmail = computed(() => props.identity?.email || authStore.user?.email || '—');
const identityRole = computed(() => props.identity?.role || authStore.user?.role || '—');
const identityOrganizations = computed(() => {
  const orgs = props.organizations || [];
  if (orgs.length === 0) return '—';
  return orgs.map((o) => o.name).join(', ');
});

onMounted(load);
</script>

<style scoped>
.preferences-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.preferences-section {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border);
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 600;
}

.section-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.prefs-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}

.card-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  color: var(--text-primary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0;
}

.field.checkbox {
  flex-direction: column;
}

.field.checkbox label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
}

.field.checkbox.disabled {
  opacity: 0.85;
}

.field-help {
  color: var(--text-secondary);
  font-size: 12px;
}

.required-tag {
  display: inline-block;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.days {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.day {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}

textarea {
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

input, select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.multi {
  min-height: 110px;
}

.category-group {
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.category-group:first-child {
  padding-top: 0;
  border-top: none;
}

.category-title {
  font-weight: 600;
  color: var(--text-primary);
  margin: 8px 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.saved {
  color: var(--text-secondary);
  font-size: 13px;
}

.loading {
  color: var(--text-secondary);
}

.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.readonly {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt);
  color: var(--text-primary);
}

.kv {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.kv:last-child { border-bottom: none; }
.k { color: var(--text-secondary); font-size: 13px; }
.v { color: var(--text-primary); }
</style>

