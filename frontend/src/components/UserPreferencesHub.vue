<template>
  <div class="preferences-content">
    <!-- Section 1: Notification Preferences -->
    <section class="preferences-section">
      <div class="section-header">
        <h2>Notification Preferences</h2>
        <p class="section-description">Control how and when notifications reach you.</p>
        <p v-if="notificationsLocked" class="section-description">
          Agency defaults are enforced and cannot be edited here.
        </p>
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
                <input v-model="prefs.email_enabled" type="checkbox" :disabled="notificationDisabled" />
                Email Notifications
              </label>
            </div>

            <div class="field checkbox">
              <label>
                <input v-model="prefs.sms_enabled" type="checkbox" :disabled="notificationDisabled" />
                SMS Notifications
              </label>
              <div class="field-help">If SMS is off, messages still appear in-app.</div>
            </div>
            <div class="field checkbox" v-if="prefs.sms_enabled">
              <label>
                <input v-model="prefs.sms_forwarding_enabled" type="checkbox" :disabled="notificationDisabled" />
                Forward inbound texts to my phone
              </label>
              <div class="field-help">Used when agencies enable text forwarding rules.</div>
            </div>
            <div class="field checkbox" v-if="prefs.sms_enabled">
              <label>
                <input v-model="prefs.sms_use_own_number_for_reminders" type="checkbox" :disabled="notificationDisabled" />
                Use my assigned number for reminders when agency allows it
              </label>
              <div class="field-help">If off, reminders fall back to agency sender number.</div>
            </div>
            <div class="field checkbox" v-if="prefs.sms_enabled">
              <label>
                <input v-model="prefs.sms_support_mirror_enabled" type="checkbox" :disabled="notificationDisabled" />
                Mirror inbound client texts to support
              </label>
            </div>
            <div class="field" v-if="prefs.sms_enabled && prefs.sms_support_mirror_enabled">
              <label>Support takeover mode</label>
              <select v-model="prefs.sms_support_thread_mode" :disabled="notificationDisabled">
                <option value="respondable">Respondable (provider + support)</option>
                <option value="read_only">Read-only for provider</option>
              </select>
            </div>
            <div class="field checkbox">
              <label>
                <input v-model="prefs.push_notifications_enabled" type="checkbox" :disabled="notificationDisabled" />
                Browser push notifications
              </label>
              <div class="field-help">Show notifications when the app tab is in the background.</div>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Daily Digest</h3>
            <div class="field checkbox">
              <label>
                <input v-model="prefs.daily_digest_enabled" type="checkbox" :disabled="viewOnly" />
                Send me a daily email digest
              </label>
              <div class="field-help">Summarizes new activity in your account.</div>
            </div>
            <div class="field">
              <label>Send time</label>
              <input
                v-model="prefs.daily_digest_time"
                type="time"
                :disabled="viewOnly || !prefs.daily_digest_enabled"
              />
              <div class="field-help">Uses server local time.</div>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Quiet Hours</h3>
            <div class="field checkbox">
              <label>
                <input v-model="prefs.quiet_hours_enabled" type="checkbox" :disabled="notificationDisabled" />
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
                    :disabled="notificationDisabled || !prefs.quiet_hours_enabled"
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
                <input v-model="quietStart" type="time" :disabled="notificationDisabled || !prefs.quiet_hours_enabled" />
              </div>
              <div class="field">
                <label>End Time</label>
                <input v-model="quietEnd" type="time" :disabled="notificationDisabled || !prefs.quiet_hours_enabled" />
              </div>
            </div>

            <div class="field checkbox">
              <label>
                <input v-model="prefs.emergency_override" type="checkbox" :disabled="notificationDisabled" />
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
                <input v-model="prefs.auto_reply_enabled" type="checkbox" :disabled="notificationDisabled" />
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
                :disabled="notificationDisabled || !prefs.auto_reply_enabled"
                placeholder="Thanks for your message. We received it and will respond as soon as we can."
              />
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Categories</h3>

            <div class="category-group">
              <div class="category-title">Messaging</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.messaging_new_inbound_client_text" type="checkbox" :disabled="notificationDisabled" />
                New inbound client text
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.messaging_client_notes" type="checkbox" :disabled="notificationDisabled" />
                Client notes & updates
              </label>
              <label class="field checkbox">
                <input
                  v-model="prefs.notification_categories.messaging_support_safety_net_alerts"
                  type="checkbox"
                  :disabled="notificationDisabled || isSupportRole"
                />
                Support Safety Net alerts <span v-if="isSupportRole" class="required-tag">Required</span>
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.messaging_replies_to_my_messages" type="checkbox" :disabled="notificationDisabled" />
                Replies to my messages
              </label>
            </div>

            <div class="category-group">
              <div class="category-title">Clients</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.client_assignments" type="checkbox" :disabled="notificationDisabled" />
                New client assignments
              </label>
            </div>

            <div class="category-group">
              <div class="category-title">Programs</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.program_reminders" type="checkbox" :disabled="notificationDisabled" />
                Program reminders
              </label>
            </div>

            <div class="category-group">
              <div class="category-title">Scheduling</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.scheduling_room_booking_approved_denied" type="checkbox" :disabled="notificationDisabled" />
                Room booking approved/denied
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.scheduling_schedule_changes" type="checkbox" :disabled="notificationDisabled" />
                Schedule changes
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.scheduling_room_release_requests" type="checkbox" :disabled="notificationDisabled" />
                Room release requests
              </label>
            </div>

            <div class="category-group">
              <div class="category-title">Compliance & Documents</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.compliance_credential_expiration_reminders" type="checkbox" :disabled="notificationDisabled" />
                Credential expiration reminders
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.compliance_access_restriction_warnings" type="checkbox" :disabled="notificationDisabled" />
                Access restriction warnings
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.compliance_payroll_document_availability" type="checkbox" :disabled="notificationDisabled" />
                Payroll document availability
              </label>
              <div class="field-help">Blocking compliance alerts are required and cannot be disabled.</div>
            </div>

            <div class="category-group">
              <div class="category-title">Surveys & Kiosk</div>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.surveys_client_checked_in" type="checkbox" :disabled="notificationDisabled" />
                Client checked in
              </label>
              <label class="field checkbox">
                <input v-model="prefs.notification_categories.surveys_survey_completed" type="checkbox" :disabled="notificationDisabled" />
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
                <input v-model="prefs.notification_categories.system_org_announcements" type="checkbox" :disabled="notificationDisabled" />
                Organization-wide announcements
              </label>
              <div class="field-help">Emergency broadcasts always bypass preferences.</div>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-primary" @click="save" :disabled="viewOnly || saving || sessionLockPinMismatch">
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
              <label>Preferred office location(s)</label>
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

    <!-- Section 4.5: Session Lock (HIPAA-style) - only for users with My Dashboard -->
    <section v-if="hasMyDashboard" class="preferences-section">
      <div class="section-header">
        <h2>Session Lock</h2>
        <p class="section-description">Lock your session after inactivity instead of logging out. Requires a 4-digit PIN to unlock.</p>
      </div>
      <div class="section-content">
        <div class="prefs-grid">
          <div class="card">
            <h3 class="card-title">Session Lock</h3>
            <label class="field checkbox">
              <input v-model="prefs.session_lock_enabled" type="checkbox" :disabled="viewOnly" />
              Enable session lock on inactivity
            </label>
            <div class="field-help">When enabled, after inactivity you'll see a lock screen instead of being logged out. Enter your PIN to continue.</div>

            <div class="field" v-if="prefs.session_lock_enabled">
              <label>Inactivity timeout</label>
              <select v-model.number="prefs.inactivity_timeout_minutes" :disabled="viewOnly">
                <option :value="null">Use default ({{ sessionLockMaxMinutes.agencyMax }} min)</option>
                <option v-for="m in [5, 15, 30, 60].filter(m => m <= sessionLockMaxMinutes.agencyMax)" :key="m" :value="m">
                  {{ m }} minutes
                </option>
              </select>
              <div class="field-help">Platform max: {{ sessionLockMaxMinutes.platformMax }} min. Your agency allows up to {{ sessionLockMaxMinutes.agencyMax }} min.</div>
            </div>

            <div class="field" v-if="prefs.session_lock_enabled">
              <label>4-digit PIN</label>
              <p v-if="prefs.session_lock_pin_set" class="field-help">PIN is set. Enter a new PIN below to change it.</p>
              <p v-else class="field-help">Set a 4-digit PIN to unlock your session.</p>
              <div class="row" style="gap: 12px;">
                <input
                  v-model="sessionLockPinNew"
                  type="password"
                  name="sessionLockPinNew"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="4"
                  autocomplete="one-time-code"
                  autocorrect="off"
                  spellcheck="false"
                  placeholder="New PIN"
                  class="pin-input"
                  :disabled="viewOnly"
                  @input="sessionLockPinNew = ($event.target?.value || '').replace(/\D/g, '').slice(0, 4)"
                />
                <input
                  v-model="sessionLockPinConfirm"
                  type="password"
                  name="sessionLockPinConfirm"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="4"
                  autocomplete="one-time-code"
                  autocorrect="off"
                  spellcheck="false"
                  placeholder="Confirm PIN"
                  class="pin-input"
                  :disabled="viewOnly"
                  @input="sessionLockPinConfirm = ($event.target?.value || '').replace(/\D/g, '').slice(0, 4)"
                />
              </div>
              <p v-if="sessionLockPinMismatch" class="field-help" style="color: var(--danger, #dc3545);">PINs do not match.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 4.6: Kiosk PIN - for staff who clock in/out at kiosks -->
    <section v-if="hasMyDashboard" class="preferences-section">
      <div class="section-header">
        <h2>Kiosk PIN</h2>
        <p class="section-description">Optional 4-digit PIN to identify yourself at clock-in/out kiosks. Use your PIN instead of tapping your name.</p>
      </div>
      <div class="section-content">
        <div class="prefs-grid">
          <div class="card">
            <h3 class="card-title">Kiosk PIN</h3>
            <p v-if="prefs.kiosk_pin_set" class="field-help">PIN is set. Enter a new PIN below to change it, or clear to remove.</p>
            <p v-else class="field-help">Set a 4-digit PIN to clock in/out at kiosks without tapping your name.</p>
            <div class="row" style="gap: 12px; align-items: flex-end;">
              <div class="field" style="margin: 0;">
                <label>4-digit PIN</label>
                <input
                  v-model="kioskPinNew"
                  type="password"
                  name="kioskPinNew"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="4"
                  autocomplete="one-time-code"
                  autocorrect="off"
                  spellcheck="false"
                  placeholder="••••"
                  class="pin-input"
                  :disabled="viewOnly"
                  @input="kioskPinNew = ($event.target?.value || '').replace(/\D/g, '').slice(0, 4)"
                />
              </div>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="viewOnly || !kioskPinValid || savingKioskPin"
                @click="saveKioskPin"
              >
                {{ savingKioskPin ? 'Saving…' : (prefs.kiosk_pin_set ? 'Change PIN' : 'Set PIN') }}
              </button>
              <button
                v-if="prefs.kiosk_pin_set"
                type="button"
                class="btn btn-secondary"
                :disabled="viewOnly || savingKioskPin"
                @click="clearKioskPin"
              >
                Clear PIN
              </button>
            </div>
            <p v-if="kioskPinError" class="field-help" style="color: var(--danger, #dc3545);">{{ kioskPinError }}</p>
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
            <h3 class="card-title">Appearance</h3>
            <label class="field checkbox">
              <input v-model="prefs.dark_mode" type="checkbox" :disabled="viewOnly" />
              Dark mode
            </label>
            <div class="field-help">Use a dark theme for the app.</div>
            <div class="field">
              <label>Layout density</label>
              <select v-model="prefs.layout_density" :disabled="viewOnly">
                <option value="compact">Compact</option>
                <option value="standard">Standard</option>
                <option value="comfortable">Comfortable</option>
              </select>
              <div class="field-help">Controls spacing in tables and lists.</div>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Regional & display</h3>
            <div class="field">
              <label>Timezone</label>
              <select v-model="prefs.timezone" :disabled="viewOnly" class="timezone-select">
                <option :value="null">Browser default</option>
                <optgroup label="US">
                  <option value="America/New_York">Eastern (New York)</option>
                  <option value="America/Chicago">Central (Chicago)</option>
                  <option value="America/Denver">Mountain (Denver)</option>
                  <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
                </optgroup>
                <optgroup label="Other">
                  <option value="America/Toronto">Toronto</option>
                  <option value="America/Vancouver">Vancouver</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Europe/Berlin">Berlin</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                  <option value="Australia/Sydney">Sydney</option>
                </optgroup>
              </select>
              <div class="field-help">Used for dates, times, and digest send time.</div>
            </div>
            <div class="field">
              <label>Date format</label>
              <select v-model="prefs.date_format" :disabled="viewOnly">
                <option value="MM/DD">MM/DD (e.g. 12/31/2025)</option>
                <option value="DD/MM">DD/MM (e.g. 31/12/2025)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2025-12-31)</option>
              </select>
            </div>
            <div class="field">
              <label>Time format</label>
              <select v-model="prefs.time_format" :disabled="viewOnly">
                <option value="12h">12-hour (e.g. 2:30 PM)</option>
                <option value="24h">24-hour (e.g. 14:30)</option>
              </select>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Schedule</h3>
            <div class="field">
              <label>Default schedule view</label>
              <select v-model="prefs.schedule_default_view" :disabled="viewOnly">
                <option value="open_finder">Open finder</option>
                <option value="office_layout">Office layout</option>
              </select>
              <div class="field-help">Initial view when opening your schedule.</div>
            </div>
          </div>

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
            <h3 class="card-title">Helper widget</h3>
            <label class="field checkbox">
              <input v-model="prefs.helper_enabled" type="checkbox" :disabled="viewOnly" />
              Enable the in-app helper
            </label>
            <div class="field-help">If disabled, the helper will stay hidden unless an admin force-enables it.</div>
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
              <div class="field-help">Which tab to show when you open My Dashboard.</div>
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
import { useUserPreferencesStore } from '../store/userPreferences';
import api from '../services/api';
import { refetchSessionLockConfig } from '../utils/activityTracker';
import { setDarkMode } from '../utils/darkMode';
import {
  isPushSupported,
  getPushPermissionState,
  requestPushPermission,
  registerPushSubscription,
  unregisterPushSubscription,
  ensureServiceWorkerRegistered
} from '../utils/pushNotifications';

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
const userPrefsStore = useUserPreferencesStore();

const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');
const agencyNotificationSettings = ref({
  defaults: null,
  userEditable: true,
  enforceDefaults: false
});
const sessionLockMaxMinutes = ref({ platformMax: 30, agencyMax: 30 });
const vapidPublicKey = ref('');

const dayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const defaultCategories = () => ({
  messaging_new_inbound_client_text: false,
  messaging_support_safety_net_alerts: false,
  messaging_replies_to_my_messages: false,
  messaging_client_notes: false,
  client_assignments: true,
  // School Portal feed toggles (default OFF)
  school_portal_client_updates: false,
  school_portal_client_update_org_swaps: false,
  school_portal_client_comments: false,
  school_portal_client_messages: false,
  scheduling_room_booking_approved_denied: false,
  scheduling_schedule_changes: false,
  scheduling_room_release_requests: false,
  compliance_credential_expiration_reminders: false,
  compliance_access_restriction_warnings: false,
  compliance_payroll_document_availability: false,
  surveys_client_checked_in: false,
  surveys_survey_completed: false,
  system_emergency_broadcasts: true,
  system_org_announcements: false,
  program_reminders: false
});

const prefs = ref({
  email_enabled: true,
  sms_enabled: false,
  sms_forwarding_enabled: true,
  sms_use_own_number_for_reminders: true,
  sms_support_mirror_enabled: false,
  sms_support_thread_mode: 'respondable',
  in_app_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_allowed_days: [],
  quiet_hours_start_time: null,
  quiet_hours_end_time: null,
  auto_reply_enabled: false,
  auto_reply_message: '',
  emergency_override: false,
  daily_digest_enabled: false,
  daily_digest_time: '07:00',
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
  dark_mode: false,
  timezone: null,
  schedule_default_view: 'open_finder',
  layout_density: 'standard',
  date_format: 'MM/DD',
  time_format: '12h',
  push_notifications_enabled: false,
  helper_enabled: true,
  default_landing_page: 'dashboard',

  // Session Lock (HIPAA-style)
  session_lock_enabled: false,
  inactivity_timeout_minutes: null,
  session_lock_pin_set: false,

  // Kiosk PIN (for clock in/out at kiosks)
  kiosk_pin_set: false
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

// Session Lock only for users with My Dashboard (not school_staff)
const hasMyDashboard = computed(() => {
  const role = String((props.userId === authStore.user?.id ? authStore.user?.role : props.identity?.role) || '').toLowerCase();
  return role !== 'school_staff';
});

const sessionLockPinNew = ref('');
const sessionLockPinConfirm = ref('');
const sessionLockPinMismatch = computed(() => {
  const a = sessionLockPinNew.value;
  const b = sessionLockPinConfirm.value;
  if (!a && !b) return false;
  return a.length === 4 && b.length === 4 && a !== b;
});

const kioskPinNew = ref('');
const savingKioskPin = ref(false);
const kioskPinError = ref('');
const kioskPinValid = computed(() => /^\d{4}$/.test(String(kioskPinNew.value || '').trim()));

const applyLayoutDensity = (density) => {
  const root = document.documentElement;
  root.removeAttribute('data-layout-density');
  if (density && density !== 'standard') {
    root.setAttribute('data-layout-density', density);
  }
};

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
      prefs.value.sms_support_mirror_enabled = false;
      prefs.value.sms_support_thread_mode = 'respondable';
    }
  }
);

watch(
  () => prefs.value.daily_digest_enabled,
  (enabled) => {
    if (enabled && !prefs.value.daily_digest_time) {
      prefs.value.daily_digest_time = '07:00';
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

const saveKioskPin = async () => {
  if (props.userId !== authStore.user?.id || viewOnly || !kioskPinValid.value) return;
  try {
    savingKioskPin.value = true;
    kioskPinError.value = '';
    await api.put('/users/me/kiosk-pin', { pin: kioskPinNew.value.trim() });
    prefs.value.kiosk_pin_set = true;
    kioskPinNew.value = '';
    saved.value = true;
  } catch (e) {
    kioskPinError.value = e.response?.data?.error?.message || 'Failed to set PIN';
  } finally {
    savingKioskPin.value = false;
  }
};

const clearKioskPin = async () => {
  if (props.userId !== authStore.user?.id || viewOnly) return;
  try {
    savingKioskPin.value = true;
    kioskPinError.value = '';
    await api.put('/users/me/kiosk-pin', { pin: null });
    prefs.value.kiosk_pin_set = false;
    kioskPinNew.value = '';
    saved.value = true;
  } catch (e) {
    kioskPinError.value = e.response?.data?.error?.message || 'Failed to clear PIN';
  } finally {
    savingKioskPin.value = false;
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

    if (data?.agencyNotificationSettings) {
      agencyNotificationSettings.value = {
        defaults: data.agencyNotificationSettings.defaults || null,
        userEditable: data.agencyNotificationSettings.userEditable !== false,
        enforceDefaults: data.agencyNotificationSettings.enforceDefaults === true
      };
    } else {
      agencyNotificationSettings.value = { defaults: null, userEditable: false, enforceDefaults: true };
    }

    if (data?.sessionLockMaxMinutes) {
      sessionLockMaxMinutes.value = data.sessionLockMaxMinutes;
    }
    vapidPublicKey.value = data?.vapidPublicKey || '';

    prefs.value.session_lock_enabled = !!data?.session_lock_enabled;
    prefs.value.inactivity_timeout_minutes = data?.inactivity_timeout_minutes ?? null;
    prefs.value.session_lock_pin_set = !!data?.session_lock_pin_set;
    prefs.value.kiosk_pin_set = !!data?.kiosk_pin_set;
    prefs.value.dark_mode = !!data?.dark_mode;

    // Apply dark mode and sync store when loading own preferences
    if (props.userId === authStore.user?.id) {
      setDarkMode(props.userId, prefs.value.dark_mode);
      userPrefsStore.setFromApi(prefs.value);
      applyLayoutDensity(prefs.value.layout_density);
    }

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

const notificationsLocked = computed(() => agencyNotificationSettings.value.userEditable === false);
const notificationDisabled = computed(() => props.viewOnly || notificationsLocked.value);

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
      sms_forwarding_enabled: !!prefs.value.sms_forwarding_enabled,
      sms_use_own_number_for_reminders: !!prefs.value.sms_use_own_number_for_reminders,
      sms_support_mirror_enabled: !!prefs.value.sms_support_mirror_enabled,
      sms_support_thread_mode: prefs.value.sms_support_mirror_enabled
        ? (prefs.value.sms_support_thread_mode || 'respondable')
        : 'respondable',
      daily_digest_enabled: !!prefs.value.daily_digest_enabled,
      daily_digest_time: prefs.value.daily_digest_enabled
        ? (prefs.value.daily_digest_time || '07:00')
        : null,
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
      dark_mode: !!prefs.value.dark_mode,
      timezone: prefs.value.timezone || null,
      schedule_default_view: prefs.value.schedule_default_view || 'open_finder',
      layout_density: prefs.value.layout_density || 'standard',
      date_format: prefs.value.date_format || 'MM/DD',
      time_format: prefs.value.time_format || '12h',
      push_notifications_enabled: !!prefs.value.push_notifications_enabled,
      helper_enabled: !!prefs.value.helper_enabled,
      default_landing_page: prefs.value.default_landing_page || 'dashboard',

      // Session Lock
      session_lock_enabled: !!prefs.value.session_lock_enabled,
      inactivity_timeout_minutes: prefs.value.session_lock_enabled && prefs.value.inactivity_timeout_minutes != null
        ? prefs.value.inactivity_timeout_minutes
        : null
    };

    if (sessionLockPinNew.value && sessionLockPinConfirm.value && sessionLockPinNew.value === sessionLockPinConfirm.value && sessionLockPinNew.value.length === 4) {
      payload.session_lock_pin = sessionLockPinNew.value;
    }

    if (canEditAdminControlled.value) {
      payload.work_modality = prefs.value.work_modality || null;
      payload.scheduling_preferences = schedulingPrefs.value || null;
    }

    // Handle push notifications: register or unregister before/with save
    if (props.userId === authStore.user?.id && !viewOnly) {
      const pushEnabled = !!payload.push_notifications_enabled;
      if (pushEnabled) {
        const supported = await isPushSupported();
        if (supported && vapidPublicKey.value) {
          const perm = await getPushPermissionState();
          if (perm === 'granted') {
            try {
              await ensureServiceWorkerRegistered();
              await registerPushSubscription(props.userId, vapidPublicKey.value);
            } catch (e) {
              error.value = e?.message || 'Failed to register push notifications';
              saving.value = false;
              return;
            }
          } else if (perm === 'default') {
            const newPerm = await requestPushPermission();
            if (newPerm === 'granted') {
              try {
                await ensureServiceWorkerRegistered();
                await registerPushSubscription(props.userId, vapidPublicKey.value);
              } catch (e) {
                error.value = e?.message || 'Failed to register push notifications';
                saving.value = false;
                return;
              }
            } else {
              payload.push_notifications_enabled = false;
            }
          }
        } else if (supported && !vapidPublicKey.value) {
          error.value = 'Push notifications are not configured. Contact your administrator.';
          payload.push_notifications_enabled = false;
        } else if (!supported) {
          payload.push_notifications_enabled = false;
        }
      } else {
        try {
          await unregisterPushSubscription(props.userId);
        } catch {
          /* ignore */
        }
      }
    }

    await api.put(`/users/${props.userId}/preferences`, payload);
    saved.value = true;
    if (payload.session_lock_pin) {
      sessionLockPinNew.value = '';
      sessionLockPinConfirm.value = '';
      prefs.value.session_lock_pin_set = true;
    }
    if (props.userId === authStore.user?.id && (payload.session_lock_enabled !== undefined || payload.inactivity_timeout_minutes !== undefined || payload.session_lock_pin)) {
      refetchSessionLockConfig();
    }
    if (props.userId === authStore.user?.id && payload.dark_mode !== undefined) {
      setDarkMode(props.userId, payload.dark_mode);
    }
    if (props.userId === authStore.user?.id) {
      userPrefsStore.setFromApi({ ...prefs.value, ...payload });
      if (payload.layout_density !== undefined) applyLayoutDensity(payload.layout_density);
    }
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

.timezone-select {
  min-width: 220px;
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

.pin-input {
  max-width: 120px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.25em;
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

