<template>
  <Teleport to="body">
    <div v-if="modelValue" class="sb-ce-modal-overlay" @click.self="close">
      <div class="sb-ce-modal" role="dialog" aria-modal="true" aria-labelledby="sb-ce-edit-title" @click.stop>
        <div class="sb-ce-modal-header">
          <h2 id="sb-ce-edit-title" class="sb-ce-modal-title">Edit event</h2>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="close">Close</button>
        </div>
        <div class="sb-ce-modal-body">
          <div v-if="loadError" class="error-box sb-ce-msg">{{ loadError }}</div>
          <div v-else-if="loading" class="muted sb-ce-msg">Loading event…</div>
          <template v-else>
            <div v-if="formError" class="error-box sb-ce-msg">{{ formError }}</div>
            <div class="sb-ce-grid">
              <div class="form-group">
                <label class="sb-ce-lbl">Event category</label>
                <select v-model="selectedEventCategory" class="input" @change="applyEventCategory">
                  <option v-for="opt in EVENT_CATEGORY_OPTIONS" :key="`cat-${opt.value}`" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Event preset</label>
                <select v-model="selectedPreset" class="input" @change="applyPreset">
                  <option value="">Custom</option>
                  <option v-for="p in EVENT_TYPE_PRESETS" :key="p.value" :value="p.value">{{ p.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Title</label>
                <input v-model.trim="draft.title" class="input" maxlength="255" />
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Event type</label>
                <select v-model="eventTypeSelection" class="input" @change="applyEventTypeSelection">
                  <option v-for="opt in EVENT_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  <option value="__custom__">Custom</option>
                </select>
                <input
                  v-if="eventTypeSelection === '__custom__'"
                  v-model.trim="draft.eventType"
                  class="input sb-ce-custom-event-type"
                  maxlength="64"
                  placeholder="e.g. custom_type"
                />
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Program (optional)</label>
                <select v-model.number="draft.organizationId" class="input">
                  <option :value="0">Agency-wide (all programs)</option>
                  <option v-for="o in affiliateProgramOrgs" :key="o.id" :value="o.id">{{ o.name }}</option>
                </select>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Active</label>
                <select v-model="draft.isActive" class="input">
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Timezone</label>
                <select v-model="draft.timezone" class="input">
                  <option v-for="tz in TIMEZONE_OPTIONS" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                </select>
                <p class="muted small sb-ce-tz-hint">
                  {{ selectedTimezoneOffsetLabel }}. Start/end times use this IANA timezone (not your computer clock alone).
                </p>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Start</label>
                <input v-model="draft.startsAtLocal" class="input" type="datetime-local" />
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">End</label>
                <input v-model="draft.endsAtLocal" class="input" type="datetime-local" />
              </div>
              <template v-if="!isSkillsGroupIntegrated">
                <div class="form-group">
                  <label class="sb-ce-lbl">Recurrence</label>
                  <select v-model="draft.recurrence.frequency" class="input">
                    <option value="none">One-time</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Interval</label>
                  <input v-model.number="draft.recurrence.interval" class="input" type="number" min="1" max="24" />
                </div>
              </template>
            </div>

            <div v-if="isSkillsGroupIntegrated" class="sb-ce-section muted small sb-ce-sg-recur-info">
              <p class="sb-ce-sg-recur-p">
                <strong>Integrated Skill Builders group:</strong> the start/end fields above are the <em>program date
                span</em>. Recurring weekdays and times are the <strong>program week pattern</strong> (below). The system
                generates <strong>scheduled sessions</strong> from that pattern for kiosk and attendance.
              </p>
            </div>

            <div v-if="isSkillsGroupIntegrated && canEditProgramWeekPattern" class="sb-ce-section sb-ce-pwm-wrap">
              <SkillBuildersEventProgramMeetingsCard
                :agency-id="agencyId"
                :event-id="eventId"
                :initial-meetings="skillsGroupMeetingsPreview"
                @saved="onProgramMeetingsSaved"
              />
            </div>
            <div v-else-if="isSkillsGroupIntegrated && skillsGroupMeetingsPreview.length" class="sb-ce-section">
              <strong class="sb-ce-subhead">Program week pattern</strong>
              <ul class="sb-ce-pattern-list">
                <li v-for="(m, i) in skillsGroupMeetingsPreview" :key="i">
                  {{ m.weekday }} · {{ formatHm(m.startTime) }}–{{ formatHm(m.endTime) }}
                </li>
              </ul>
            </div>

            <div v-if="!isSkillsGroupIntegrated && draft.recurrence.frequency === 'weekly'" class="form-group">
              <label class="sb-ce-lbl">Weekdays</label>
              <div class="sb-ce-chips">
                <label v-for="d in weekdayOptions" :key="d.value" class="sb-ce-chip">
                  <input
                    type="checkbox"
                    :checked="draft.recurrence.byWeekday.includes(d.value)"
                    @change="toggleWeekday(d.value, $event.target.checked)"
                  />
                  <span>{{ d.label }}</span>
                </label>
              </div>
            </div>

            <div v-if="!isSkillsGroupIntegrated && draft.recurrence.frequency === 'monthly'" class="form-group">
              <label class="sb-ce-lbl">Day of month</label>
              <input v-model.number="draft.recurrence.byMonthDay" class="input" type="number" min="1" max="31" />
            </div>

            <div v-if="!isSkillsGroupIntegrated && draft.recurrence.frequency !== 'none'" class="form-group">
              <label class="sb-ce-lbl">Repeat until (optional)</label>
              <input v-model="draft.recurrence.untilDate" class="input" type="date" />
            </div>

            <div class="form-group">
              <label class="sb-ce-lbl">Description</label>
              <textarea v-model.trim="draft.description" class="input" rows="2" />
            </div>
            <div class="form-group">
              <label class="sb-ce-lbl">Splash content</label>
              <textarea v-model.trim="draft.splashContent" class="input" rows="2" />
            </div>

            <div class="form-group">
              <label class="sb-ce-lbl">Skill Builders — direct hours (payroll)</label>
              <input v-model.number="draft.skillBuilderDirectHours" class="input" type="number" min="0" step="0.25" />
            </div>

            <div v-if="isSkillsGroupIntegrated" class="sb-ce-section">
              <strong class="sb-ce-subhead">Family-facing times</strong>
              <p class="muted small sb-ce-pattern-lead">
                Shown to guardians for drop-off and pickup (wall-clock times, not payroll punches).
              </p>
              <div class="sb-ce-grid">
                <div class="form-group">
                  <label class="sb-ce-lbl">Client check-in (display)</label>
                  <input v-model="draft.clientCheckInDisplayTime" class="input" type="time" step="60" />
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Client check-out (display)</label>
                  <input v-model="draft.clientCheckOutDisplayTime" class="input" type="time" step="60" />
                </div>
              </div>
            </div>

            <div v-if="isSkillsGroupIntegrated" class="sb-ce-section">
              <strong class="sb-ce-subhead">Virtual sessions (join links)</strong>
              <p class="muted small sb-ce-pattern-lead">
                Turn this off to hide the <strong>Virtual sessions</strong> card on the Skill Builders event portal
                (no video join UI). Session rows and URLs in admin are unchanged; turn this back on anytime.
              </p>
              <div class="form-group">
                <label class="sb-ce-lbl">Show virtual join card on event portal</label>
                <select v-model="draft.virtualSessionsEnabled" class="input">
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
            </div>

            <div v-if="isSkillsGroupIntegrated" class="sb-ce-section">
              <strong class="sb-ce-subhead">Program staff</strong>
              <p class="muted small sb-ce-pattern-lead">
                Staff on this list can use the station kiosk for this program and appear on the program roster. Per-session
                assignments on specific dates are still managed from the event portal.
              </p>
              <div v-if="rosterLoading" class="muted small sb-ce-msg">Loading program staff…</div>
              <div v-else-if="rosterError" class="error-box sb-ce-msg">{{ rosterError }}</div>
              <template v-else-if="roster.skillsGroupId">
                <ul v-if="roster.assignedProviders.length" class="sb-ce-roster-list">
                  <li v-for="p in roster.assignedProviders" :key="p.id" class="sb-ce-roster-row">
                    <span class="sb-ce-roster-name">{{ p.lastName }}, {{ p.firstName }}</span>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="rosterSaving"
                      @click="removeRosterProvider(p.id)"
                    >
                      Remove
                    </button>
                  </li>
                </ul>
                <p v-else class="muted small">No staff assigned yet. Add providers below.</p>
                <p v-if="sdpPromoteNotice" class="muted small sb-ce-sdp-notice">{{ sdpPromoteNotice }}</p>
                <div class="sb-ce-roster-add">
                  <label class="sb-ce-lbl sb-ce-roster-lbl">Skill Development Program eligible</label>
                  <div class="sb-ce-roster-row-inner">
                    <select v-model="providerToAdd" class="input sb-ce-roster-select" :disabled="rosterSaving">
                      <option value="">Choose provider…</option>
                      <option v-for="p in addableProviders" :key="`e-${p.id}`" :value="String(p.id)">
                        {{ p.lastName }}, {{ p.firstName }}
                      </option>
                    </select>
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="!providerToAdd || rosterSaving"
                      @click="addRosterProvider(false)"
                    >
                      {{ rosterSaving ? 'Saving…' : 'Add' }}
                    </button>
                  </div>
                  <p class="muted small sb-ce-roster-hint">
                    Only people with <strong>Skill Development Program eligible</strong> turned on in their account appear
                    here.
                  </p>
                </div>
                <div class="sb-ce-roster-expand">
                  <button
                    type="button"
                    class="btn btn-link btn-sm sb-ce-roster-expand-btn"
                    @click="showExpandedAgencyProviders = !showExpandedAgencyProviders"
                  >
                    Don&rsquo;t see who you&rsquo;re looking for? Add additional provider.
                  </button>
                  <div v-show="showExpandedAgencyProviders" class="sb-ce-roster-expanded">
                    <label class="sb-ce-lbl">All agency providers</label>
                    <p class="muted small sb-ce-roster-hint">
                      Choose anyone on this agency. If they aren&rsquo;t Skill Development Program eligible yet,
                      we&rsquo;ll turn that on in their account when you add them.
                    </p>
                    <div class="sb-ce-roster-row-inner">
                      <select
                        v-model="providerToAddExpanded"
                        class="input sb-ce-roster-select"
                        :disabled="rosterSaving"
                      >
                        <option value="">Choose provider…</option>
                        <option
                          v-for="p in addableAllAgencyProviders"
                          :key="`a-${p.id}`"
                          :value="String(p.id)"
                        >
                          {{ p.lastName }}, {{ p.firstName
                          }}<template v-if="!p.skillDevelopmentProgramEligible"> — will enable SDP</template>
                        </option>
                      </select>
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        :disabled="!providerToAddExpanded || rosterSaving"
                        @click="addRosterProvider(true)"
                      >
                        {{ rosterSaving ? 'Saving…' : 'Add' }}
                      </button>
                    </div>
                  </div>
                </div>
              </template>
              <p v-else class="muted small">No integrated skills group is linked to this event.</p>
            </div>

            <div class="sb-ce-section">
              <strong class="sb-ce-subhead">Event providers &amp; roles</strong>
              <p class="muted small sb-ce-pattern-lead">
                Add providers/staff from this agency, customize their event role title, and set virtual-session access
                (<strong>participant</strong>, <strong>presenter</strong>, or <strong>co-presenter</strong>). Mark one person
                as <strong>primary access</strong> for lead ownership.
              </p>
              <div v-if="eventProviderLoading" class="muted small sb-ce-msg">Loading event providers…</div>
              <div v-else-if="eventProviderError" class="error-box sb-ce-msg">{{ eventProviderError }}</div>
              <template v-else>
                <div class="sb-ce-roster-add">
                  <label class="sb-ce-lbl">Add provider from agency</label>
                  <div class="sb-ce-roster-row-inner">
                    <select v-model="eventProviderToAdd" class="input sb-ce-roster-select" :disabled="eventProviderSaving">
                      <option value="">Choose provider…</option>
                      <option v-for="p in eventProviderAddOptions" :key="`evp-${p.id}`" :value="String(p.id)">
                        {{ p.lastName }}, {{ p.firstName }}
                      </option>
                    </select>
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="!eventProviderToAdd || eventProviderSaving"
                      @click="addEventProvider"
                    >
                      {{ eventProviderSaving ? 'Saving…' : 'Add' }}
                    </button>
                  </div>
                </div>
                <ul v-if="eventProviderAssignments.length" class="sb-ce-roster-list" style="margin-top: 10px;">
                  <li v-for="p in eventProviderAssignments" :key="`assign-${p.id}`" class="sb-ce-event-prov-row">
                    <div class="sb-ce-event-prov-name">
                      <strong>{{ p.lastName }}, {{ p.firstName }}</strong>
                      <span v-if="p.email" class="muted small"> · {{ p.email }}</span>
                    </div>
                    <div class="sb-ce-event-prov-grid">
                      <div class="form-group">
                        <label class="sb-ce-lbl">Role title (custom)</label>
                        <input v-model.trim="p.assignmentRoleTitle" class="input" type="text" placeholder="e.g. Lead facilitator" />
                      </div>
                      <div class="form-group">
                        <label class="sb-ce-lbl">Role key</label>
                        <input v-model.trim="p.assignmentRoleKey" class="input" type="text" placeholder="e.g. lead_facilitator" />
                      </div>
                      <div class="form-group">
                        <label class="sb-ce-lbl">Virtual access role</label>
                        <select v-model="p.virtualAccessRole" class="input">
                          <option value="participant">Participant</option>
                          <option value="co_presenter">Co-presenter</option>
                          <option value="presenter">Presenter</option>
                        </select>
                      </div>
                      <label class="sb-ce-check-row">
                        <input v-model="p.isPrimaryAccess" type="checkbox" />
                        <span>Primary access for this event</span>
                      </label>
                    </div>
                    <div class="sb-ce-event-prov-actions">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="eventProviderSaving"
                        @click="saveEventProviderAssignment(p)"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="eventProviderSaving"
                        @click="removeEventProviderAssignment(p.id)"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                </ul>
                <p v-else class="muted small" style="margin-top: 10px;">No event providers assigned yet.</p>
              </template>
            </div>

            <div v-if="isSkillsGroupIntegrated" class="sb-ce-section">
              <strong class="sb-ce-subhead">Program station kiosk</strong>
              <p class="muted small sb-ce-pattern-lead">
                At the station, staff open your portal link, enter this program’s <strong>6-digit station PIN</strong>, then
                their personal <strong>4-digit kiosk PIN</strong> (from profile preferences). Each station PIN must be unique
                across Skill Builders programs for this agency.
              </p>
              <p v-if="kioskEntryUrl" class="muted small sb-ce-kiosk-url">
                <strong>Station link:</strong> <code class="sb-ce-code">{{ kioskEntryUrl }}</code>
              </p>
              <p v-else class="muted small">Set the agency portal slug so this link is complete.</p>

              <div class="sb-ce-pin-status" role="status">
                <template v-if="draft.kioskEventPinSet">
                  <p class="sb-ce-pin-status-line"><strong>Station PIN:</strong> already saved (6 digits)</p>
                  <p class="muted small sb-ce-pin-status-note">
                    The code is stored securely and cannot be shown again. Share it with staff separately, or set a new PIN
                    below to replace it.
                  </p>
                </template>
                <template v-else>
                  <p class="sb-ce-pin-status-line"><strong>Station PIN:</strong> not set yet</p>
                  <p class="muted small sb-ce-pin-status-note">
                    Add a 6-digit PIN so the station can unlock this program. Providers will still use their own 4-digit PIN
                    after that step.
                  </p>
                </template>
              </div>

              <div class="form-group">
                <label class="sb-ce-lbl">{{
                  draft.kioskEventPinSet ? 'New 6-digit station PIN (replace existing)' : '6-digit station PIN'
                }}</label>
                <input
                  v-model="draft.kioskEventPinNew"
                  class="input sb-ce-pin-input"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  autocomplete="off"
                  :placeholder="draft.kioskEventPinSet ? 'Leave empty to keep the current PIN' : 'e.g. 123456'"
                  :disabled="draft.kioskEventPinClear"
                />
              </div>
              <div class="sb-ce-kiosk-remove">
                <label class="sb-ce-check-row">
                  <input v-model="draft.kioskEventPinClear" type="checkbox" :disabled="kioskPinNewDigitCount > 0" />
                  <span>
                    <strong>Remove station PIN</strong> — turn off kiosk unlock for this program until you set a new PIN.
                    (Clear the “new PIN” field above if you want to use this option.)
                  </span>
                </label>
              </div>
            </div>

            <div v-if="isSkillsGroupIntegrated" class="sb-ce-section">
              <strong class="sb-ce-subhead">Staff report / departure (payroll context)</strong>
              <p class="muted small sb-ce-pattern-lead">
                Expected on-site arrival and departure times of day (separate from the recurring program pattern).
              </p>
              <div class="sb-ce-grid">
                <div class="form-group">
                  <label class="sb-ce-lbl">Employee report time</label>
                  <input v-model="draft.employeeReportTime" class="input" type="time" step="60" />
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Employee departure time</label>
                  <input v-model="draft.employeeDepartureTime" class="input" type="time" step="60" />
                </div>
              </div>
            </div>

            <div class="sb-ce-section">
              <strong>Guardian registration catalog</strong>
              <p class="muted small sb-ce-pattern-lead">
                Set <strong>Registration eligible</strong> to <strong>Yes</strong> for the event to appear on public marketing
                hubs and public program listings (you still need an active <strong>Smart Registration</strong> intake link locked
                to this event).
              </p>
              <div class="sb-ce-grid sb-ce-grid-tight">
                <div class="form-group">
                  <label class="sb-ce-lbl">Registration eligible</label>
                  <select v-model="draft.registrationEligible" class="input">
                    <option :value="false">No</option>
                    <option :value="true">Yes</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Medicaid eligible</label>
                  <select v-model="draft.medicaidEligible" class="input">
                    <option :value="false">No</option>
                    <option :value="true">Yes</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Cash / self-pay</label>
                  <select v-model="draft.cashEligible" class="input">
                    <option :value="false">No</option>
                    <option :value="true">Yes</option>
                  </select>
                </div>
              </div>
              <div v-if="draft.cashEligible" class="sb-ce-pricing-block">
                <p class="muted small sb-ce-pattern-lead">
                  Set both cash/self-pay price options if needed. Families can choose a full-series package or pay per session.
                </p>
                <div class="sb-ce-grid sb-ce-grid-tight">
                  <div class="form-group">
                    <label class="sb-ce-lbl">Default checkout option</label>
                    <select v-model="draft.programCostBillingMode" class="input">
                      <option value="total">Series package (pay upfront)</option>
                      <option value="per_session">Per session</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">Total program cost ($)</label>
                    <input
                      v-model.number="draft.programCostDollars"
                      class="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 450.00"
                    />
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">Cost per session ($)</label>
                    <input
                      v-model.number="draft.perSessionCostDollars"
                      class="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 35.00"
                    />
                  </div>
                </div>
                <p class="muted small sb-ce-pattern-lead" style="margin-top: 2px;">
                  Leave either field blank to offer only that one payment method.
                </p>
              </div>
            </div>

            <!-- Snacks & meals -->
            <div class="sb-ce-section">
              <strong>Snacks &amp; meals</strong>
              <p class="muted small sb-ce-pattern-lead">
                Configure what food is available at this program. These options appear in the guardian waiver so
                families can pre-approve snacks and meal preferences for their child.
              </p>
              <div class="sb-ce-grid sb-ce-grid-tight">
                <div class="form-group">
                  <label class="sb-ce-lbl">Snacks provided</label>
                  <select v-model="draft.snacksAvailable" class="input">
                    <option :value="true">Yes — snacks available</option>
                    <option :value="false">No — families bring their own</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Meals provided</label>
                  <select v-model="draft.mealsAvailable" class="input">
                    <option :value="false">No — families pack their own lunch</option>
                    <option :value="true">Yes — meals available</option>
                  </select>
                </div>
              </div>
              <!-- Snack options builder -->
              <div v-if="draft.snacksAvailable" class="sb-ce-food-options">
                <label class="sb-ce-lbl">Snack options <span class="muted">(guardians choose from these in the waiver)</span></label>
                <div v-for="(opt, idx) in draft.snackOptions" :key="idx" class="sb-ce-food-row">
                  <input v-model="draft.snackOptions[idx]" class="input" type="text" placeholder="e.g. Goldfish crackers" />
                  <button type="button" class="sb-ce-food-remove" @click="draft.snackOptions.splice(idx, 1)">✕</button>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 6px;" @click="draft.snackOptions.push('')">
                  + Add snack option
                </button>
              </div>
              <!-- Meal options builder -->
              <div v-if="draft.mealsAvailable" class="sb-ce-food-options" style="margin-top: 10px;">
                <label class="sb-ce-lbl">Meal options <span class="muted">(guardians choose from these in the waiver)</span></label>
                <div v-for="(opt, idx) in draft.mealOptions" :key="idx" class="sb-ce-food-row">
                  <input v-model="draft.mealOptions[idx]" class="input" type="text" placeholder="e.g. Peanut-free lunch provided" />
                  <button type="button" class="sb-ce-food-remove" @click="draft.mealOptions.splice(idx, 1)">✕</button>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 6px;" @click="draft.mealOptions.push('')">
                  + Add meal option
                </button>
              </div>
            </div>

            <div class="sb-ce-section">
              <strong>Public registration page</strong>
              <p class="muted small sb-ce-pattern-lead">
                Shown on the agency public events listing when this event is registration-eligible and has an active
                Smart Registration intake link locked to this event.
              </p>
              <div class="sb-ce-grid sb-ce-grid-tight">
                <div class="form-group">
                  <label class="sb-ce-lbl">Card/primary photo URL</label>
                  <input
                    v-model.trim="draft.eventImageUrl"
                    class="input"
                    type="url"
                    placeholder="https://…"
                  />
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Registration form URL (optional)</label>
                  <input
                    v-model.trim="draft.registrationFormUrl"
                    class="input"
                    type="url"
                    placeholder="https://forms…"
                  />
                </div>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Hero image URL</label>
                <input v-model.trim="draft.publicHeroImageUrl" class="input" type="url" placeholder="https://…" />
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Upload photo(s)</label>
                <input type="file" accept="image/*" multiple @change="onPhotoUpload" />
                <p class="muted small sb-ce-pattern-lead" style="margin-top: 6px;">
                  Tip: choose one banner image (hero) and keep multiple album images below.
                </p>
              </div>
              <div v-if="draft.eventImageUrls.length" class="sb-ce-tag-list">
                <span v-for="(url, idx) in draft.eventImageUrls" :key="`img-${idx}`" class="sb-ce-tag">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm sb-ce-tag-move"
                    :disabled="idx === 0"
                    title="Move left"
                    @click="moveEventImageLeft(idx)"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm sb-ce-tag-move"
                    :disabled="idx === draft.eventImageUrls.length - 1"
                    title="Move right"
                    @click="moveEventImageRight(idx)"
                  >
                    →
                  </button>
                  <span class="sb-ce-tag-url">{{ shortUrl(url) }}</span>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm sb-ce-tag-banner"
                    :title="draft.publicHeroImageUrl === url ? 'Current banner image' : 'Set as banner image'"
                    @click="setBannerFromAlbum(url)"
                  >
                    {{ draft.publicHeroImageUrl === url ? 'Banner' : 'Set banner' }}
                  </button>
                  <button type="button" class="sb-ce-tag-remove" @click="removeEventImage(idx)">x</button>
                </span>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Extra public details</label>
                <textarea
                  v-model.trim="draft.publicListingDetails"
                  class="input"
                  rows="3"
                  placeholder="What families should know (logistics, what to bring, links as plain text)…"
                />
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">In person (show venue on public page)</label>
                <select v-model="draft.inPersonPublic" class="input">
                  <option :value="false">No</option>
                  <option :value="true">Yes</option>
                </select>
              </div>
              <div v-if="draft.inPersonPublic" class="form-group">
                <label class="sb-ce-lbl">Venue address</label>
                <textarea
                  v-model.trim="draft.publicLocationAddress"
                  class="input"
                  rows="2"
                  placeholder="Full address for maps and driving-distance search"
                />
              </div>
              <div class="sb-ce-grid sb-ce-grid-tight">
                <div class="form-group">
                  <label class="sb-ce-lbl">Public listing — minimum age</label>
                  <input
                    v-model.trim="draft.publicAgeMin"
                    class="input"
                    type="text"
                    inputmode="numeric"
                    placeholder="Any (leave blank)"
                    maxlength="3"
                  />
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Public listing — maximum age</label>
                  <input
                    v-model.trim="draft.publicAgeMax"
                    class="input"
                    type="text"
                    inputmode="numeric"
                    placeholder="Any (leave blank)"
                    maxlength="3"
                  />
                </div>
              </div>
              <p class="muted small sb-ce-pattern-lead" style="margin-top: -4px;">
                Shown on public event pages. Leave both blank for “any age.”
              </p>
              <div class="form-group">
                <label class="sb-ce-lbl">Session label (public)</label>
                <input
                  v-model.trim="draft.publicSessionLabel"
                  class="input"
                  maxlength="128"
                  placeholder="e.g. Session 1"
                />
                <p class="muted small sb-ce-pattern-lead" style="margin-top: 4px;">
                  Families see this on marketing hub listings. Use the same label across sites to enable “show all Session 1
                  locations.”
                </p>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Session date range (public)</label>
                <input
                  v-model.trim="draft.publicSessionDateRange"
                  class="input"
                  maxlength="255"
                  placeholder="e.g. June 1 – June 12, 2026"
                />
              </div>
            </div>

            <div v-if="!isServiceProgramEventType" class="sb-ce-section">
              <strong>RSVP / voting</strong>
              <div class="sb-ce-grid sb-ce-grid-tight">
                <div class="form-group">
                  <label class="sb-ce-lbl">Mode</label>
                  <select v-model="draft.rsvpMode" class="input">
                    <option value="none">Disabled</option>
                    <option value="yes_no_maybe">Yes/No/Maybe</option>
                    <option value="custom_vote">Custom vote</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Voting enabled</label>
                  <select v-model="draft.votingConfig.enabled" class="input">
                    <option :value="false">No</option>
                    <option :value="true">Yes</option>
                  </select>
                </div>
              </div>
              <template v-if="draft.votingConfig.enabled">
                <div class="sb-ce-grid">
                  <div class="form-group">
                    <label class="sb-ce-lbl">Question</label>
                    <input v-model.trim="draft.votingConfig.question" class="input" />
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">SMS voting</label>
                    <select v-model="draft.votingConfig.viaSms" class="input">
                      <option :value="false">No</option>
                      <option :value="true">Yes</option>
                    </select>
                  </div>
                  <div v-if="draft.votingConfig.viaSms" class="form-group">
                    <label class="sb-ce-lbl">SMS code</label>
                    <input v-model.trim="draft.smsCode" class="input" maxlength="32" />
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">Voting closes (optional)</label>
                    <input v-model="draft.votingClosedAtLocal" class="input" type="datetime-local" />
                  </div>
                </div>
                <div
                  v-for="(opt, idx) in draft.votingConfig.options"
                  :key="`opt-${idx}`"
                  class="sb-ce-opt-row form-group"
                >
                  <label class="sb-ce-lbl">Option {{ idx + 1 }}</label>
                  <div class="sb-ce-opt-pair">
                    <input v-model.trim="opt.key" class="input sb-ce-opt-key" maxlength="8" />
                    <input v-model.trim="opt.label" class="input" maxlength="64" />
                  </div>
                </div>
                <div class="sb-ce-grid">
                  <div class="form-group">
                    <label class="sb-ce-lbl">Reminders</label>
                    <select v-model="draft.reminderConfig.enabled" class="input">
                      <option :value="false">No</option>
                      <option :value="true">Yes</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">Reminder offsets (hours, comma)</label>
                    <input v-model="draft.reminderOffsetsRaw" class="input" placeholder="24,2" />
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">SMS channel</label>
                    <select v-model="draft.reminderConfig.channels.sms" class="input">
                      <option :value="false">No</option>
                      <option :value="true">Yes</option>
                    </select>
                  </div>
                </div>
              </template>
            </div>

            <p class="muted small sb-ce-hint">
              Audience targeting is unchanged here. To edit who sees this event, use Agency → Company events.
            </p>

            <div class="sb-ce-actions">
              <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
                {{ saving ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';
import SkillBuildersEventProgramMeetingsCard from './SkillBuildersEventProgramMeetingsCard.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  agencyId: { type: Number, required: true },
  eventId: { type: Number, required: true },
  /** Portal slug for branded links (same as route `/:organizationSlug`). */
  portalSlug: { type: String, default: '' },
  /** When true, show the full week-pattern editor (otherwise read-only list for integrated groups). */
  canEditProgramWeekPattern: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'saved']);

const loading = ref(false);
const loadError = ref('');
const formError = ref('');
const saving = ref(false);
const affiliateProgramOrgs = ref([]);
/** Linked skills_group_meetings rows for display (from GET company-event-edit). */
const skillsGroupMeetingsPreview = ref([]);

const rosterLoading = ref(false);
const rosterError = ref('');
const rosterSaving = ref(false);
const roster = ref({
  skillsGroupId: null,
  organizationId: null,
  assignedProviders: [],
  eligibleProviders: [],
  allAgencyProviders: []
});
const providerToAdd = ref('');
const providerToAddExpanded = ref('');
const showExpandedAgencyProviders = ref(false);
const sdpPromoteNotice = ref('');
const eventProviderLoading = ref(false);
const eventProviderSaving = ref(false);
const eventProviderError = ref('');
const eventProviderToAdd = ref('');
const eventProviderAssignments = ref([]);
const eventProviderDirectory = ref([]);

const rosterAssignedIds = computed(() => new Set((roster.value.assignedProviders || []).map((p) => p.id)));
const addableProviders = computed(() =>
  (roster.value.eligibleProviders || []).filter((p) => !rosterAssignedIds.value.has(p.id))
);
const addableAllAgencyProviders = computed(() =>
  (roster.value.allAgencyProviders || []).filter((p) => !rosterAssignedIds.value.has(p.id))
);
const eventAssignedProviderIds = computed(
  () => new Set((eventProviderAssignments.value || []).map((p) => Number(p.id)).filter(Boolean))
);
const eventProviderAddOptions = computed(() =>
  (eventProviderDirectory.value || []).filter((p) => !eventAssignedProviderIds.value.has(Number(p.id)))
);

const isSkillsGroupIntegrated = computed(
  () => String(draft.value.eventType || '').toLowerCase() === 'skills_group'
);
const isServiceProgramEventType = computed(() => {
  const t = String(draft.value.eventType || '').trim().toLowerCase();
  return t === 'guardian_program_class' || t === 'program_event' || t.startsWith('program_');
});

const kioskEntryUrl = computed(() => {
  const s = String(props.portalSlug || '').trim();
  if (!s || typeof window === 'undefined') return '';
  return `${window.location.origin}/${encodeURI(s)}/kiosk`;
});

const weekdayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

const EVENT_CATEGORY_OPTIONS = [
  { value: 'company_event', label: 'Company Event' },
  { value: 'program_event', label: 'Program Event' },
  { value: 'staff_event', label: 'Staff/Internal Event' },
  { value: 'custom', label: 'Custom Type' }
];

const EVENT_TYPE_PRESETS = [
  { value: 'program_orientation', label: 'Program Orientation', eventType: 'program_orientation', title: 'Program Orientation' },
  { value: 'program_workshop', label: 'Program Workshop', eventType: 'program_workshop', title: 'Program Workshop' },
  { value: 'program_open_house', label: 'Program Open House', eventType: 'program_open_house', title: 'Program Open House' },
  { value: 'guardian_program_class', label: 'Guardian Program Class', eventType: 'guardian_program_class', title: 'Guardian Program Class' },
  { value: 'staff_get_together', label: 'Staff Get-Together', eventType: 'staff_get_together', title: 'Staff Get-Together' },
  { value: 'team_training', label: 'Team Training', eventType: 'team_training', title: 'Team Training Session' },
  { value: 'celebration', label: 'Team Celebration', eventType: 'team_celebration', title: 'Team Celebration' },
  { value: 'retreat', label: 'Team Retreat', eventType: 'team_retreat', title: 'Team Retreat' }
];

const EVENT_TYPE_OPTIONS = [
  { value: 'company_event', label: 'Company Event' },
  { value: 'program_event', label: 'Program Event' },
  { value: 'guardian_program_class', label: 'Guardian Program Class' },
  { value: 'program_orientation', label: 'Program Orientation' },
  { value: 'program_workshop', label: 'Program Workshop' },
  { value: 'program_open_house', label: 'Program Open House' },
  { value: 'skills_group', label: 'Skills Group (Integrated)' },
  { value: 'staff_event', label: 'Staff Event' },
  { value: 'staff_get_together', label: 'Staff Get-Together' },
  { value: 'team_training', label: 'Team Training' },
  { value: 'team_celebration', label: 'Team Celebration' },
  { value: 'team_retreat', label: 'Team Retreat' }
];

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'UTC', label: 'UTC' }
];

function emptyDraft() {
  return {
    title: '',
    description: '',
    eventType: 'company_event',
    splashContent: '',
    timezone: 'UTC',
    isActive: true,
    organizationId: 0,
    startsAtLocal: '',
    endsAtLocal: '',
    votingClosedAtLocal: '',
    recurrence: {
      frequency: 'none',
      interval: 1,
      byWeekday: [],
      byMonthDay: null,
      untilDate: ''
    },
    rsvpMode: 'none',
    smsCode: '',
    votingConfig: {
      enabled: false,
      viaSms: false,
      question: '',
      options: [
        { key: '1', label: 'Yes' },
        { key: '2', label: 'No' },
        { key: '3', label: 'Maybe' }
      ]
    },
    reminderConfig: {
      enabled: false,
      offsetsHours: [24, 2],
      channels: { inApp: true, sms: false }
    },
    reminderOffsetsRaw: '24,2',
    audience: { userIds: [], groupIds: [], roleKeys: [] },
    skillBuilderDirectHours: null,
    registrationEligible: false,
    medicaidEligible: false,
    cashEligible: false,
    programCostBillingMode: 'total',
    programCostDollars: null,
    perSessionCostDollars: null,
    snacksAvailable: true,
    snackOptions: [],
    mealsAvailable: false,
    mealOptions: [],
    eventImageUrl: '',
    eventImageUrls: [],
    publicHeroImageUrl: '',
    registrationFormUrl: '',
    publicListingDetails: '',
    inPersonPublic: false,
    publicLocationAddress: '',
    publicAgeMin: '',
    publicAgeMax: '',
    publicSessionLabel: '',
    publicSessionDateRange: '',
    clientCheckInDisplayTime: '',
    clientCheckOutDisplayTime: '',
    employeeReportTime: '',
    employeeDepartureTime: '',
    virtualSessionsEnabled: true,
    kioskEventPinSet: false,
    kioskEventPinNew: '',
    kioskEventPinClear: false
  };
}

function wallTimeToInput(v) {
  if (v == null || v === '') return '';
  const s = String(v).slice(0, 8);
  return s.length >= 5 ? s.slice(0, 5) : '';
}

const draft = ref(emptyDraft());
const selectedPreset = ref('');
const selectedEventCategory = ref('company_event');
const eventTypeSelection = ref('company_event');
const baselineSnapshot = ref('');
const selectedTimezoneOffsetLabel = computed(() => {
  const tz = String(draft.value.timezone || 'UTC').trim() || 'UTC';
  if (!isValidTimeZone(tz)) return 'Timezone offset unavailable';
  const year = new Date().getUTCFullYear();
  const jan = new Date(Date.UTC(year, 0, 15, 12, 0, 0));
  const jul = new Date(Date.UTC(year, 6, 15, 12, 0, 0));
  const janOffset = Math.round(-getTimeZoneOffsetMs(jan, tz) / 60000);
  const julOffset = Math.round(-getTimeZoneOffsetMs(jul, tz) / 60000);
  if (janOffset === julOffset) return `Current offset: ${formatOffsetMinutes(janOffset)}`;
  const labels = [formatOffsetMinutes(janOffset), formatOffsetMinutes(julOffset)].sort();
  return `Seasonal offsets: ${labels.join(' / ')}`;
});

const kioskPinNewDigitCount = computed(() => String(draft.value.kioskEventPinNew || '').replace(/\D/g, '').length);
const hasUnsavedChanges = computed(() => {
  if (!props.modelValue || loading.value) return false;
  return serializeModalState() !== baselineSnapshot.value;
});

function serializeModalState() {
  const assignments = (eventProviderAssignments.value || [])
    .map((p) => ({
      id: Number(p.id || 0),
      assignmentRoleTitle: String(p.assignmentRoleTitle || '').trim(),
      assignmentRoleKey: String(p.assignmentRoleKey || '').trim(),
      virtualAccessRole: String(p.virtualAccessRole || 'participant'),
      isPrimaryAccess: !!p.isPrimaryAccess
    }))
    .sort((a, b) => a.id - b.id);
  return JSON.stringify({
    draft: draft.value,
    selectedPreset: selectedPreset.value,
    selectedEventCategory: selectedEventCategory.value,
    eventTypeSelection: eventTypeSelection.value,
    eventProviderAssignments: assignments
  });
}

function markClean() {
  baselineSnapshot.value = serializeModalState();
}

function confirmDiscardIfNeeded() {
  if (!hasUnsavedChanges.value) return true;
  return window.confirm('You have unsaved changes. Close this editor and discard them?');
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

function isValidTimeZone(tz) {
  const s = String(tz || '').trim();
  if (!s) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const asUtc = new Date(
    Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    )
  );
  return date.getTime() - asUtc.getTime();
}

function formatOffsetMinutes(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${h}:${m}`;
}

/** Format an instant as yyyy-MM-ddTHH:mm in the given IANA zone (for datetime-local inputs). */
function instantToDatetimeLocalInZone(dateLike, timeZone) {
  const date = new Date(dateLike || 0);
  if (!Number.isFinite(date.getTime())) return '';
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  if (tz === 'UTC') {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
  }
  if (!isValidTimeZone(tz)) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = fmt.formatToParts(date);
    const m = {};
    for (const p of parts) {
      if (p.type !== 'literal') m[p.type] = p.value;
    }
    return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
  } catch {
    return '';
  }
}

/** Parse datetime-local string as wall time in IANA zone → ISO UTC. */
function datetimeLocalInZoneToIso(localStr, timeZone) {
  const raw = String(localStr || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const h = Number(match[4]);
  const mi = Number(match[5]);
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  if (tz === 'UTC') {
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
    return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
  }
  if (!isValidTimeZone(tz)) return null;
  let guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(guess, tz);
    guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0) + offset);
  }
  return guess.toISOString();
}

/** Stored UTC on integrated events is misleading in the UI; prefer a real zone or the browser zone. */
function resolveEditTimeZone(event) {
  const raw = String(event?.timezone || '').trim();
  if (raw && raw.toUpperCase() !== 'UTC' && isValidTimeZone(raw)) return raw;
  return browserTimeZone();
}

function populateFromEvent(event) {
  if (!event) {
    draft.value = emptyDraft();
    return;
  }
  const editTz = resolveEditTimeZone(event);
  draft.value = {
    title: event.title || '',
    description: event.description || '',
    eventType: event.eventType || 'company_event',
    splashContent: event.splashContent || '',
    timezone: editTz,
    isActive: event.isActive !== false,
    organizationId:
      event.organizationId != null && event.organizationId !== '' && Number(event.organizationId) > 0
        ? Number(event.organizationId)
        : 0,
    startsAtLocal: instantToDatetimeLocalInZone(event.startsAt, editTz),
    endsAtLocal: instantToDatetimeLocalInZone(event.endsAt, editTz),
    votingClosedAtLocal: instantToDatetimeLocalInZone(event.votingClosedAt, editTz),
    recurrence: {
      frequency: String(event.recurrence?.frequency || 'none'),
      interval: Number(event.recurrence?.interval || 1),
      byWeekday: Array.isArray(event.recurrence?.byWeekday) ? event.recurrence.byWeekday.map((x) => Number(x)) : [],
      byMonthDay: event.recurrence?.byMonthDay ?? null,
      untilDate: event.recurrence?.untilDate || ''
    },
    rsvpMode: event.rsvpMode || 'none',
    smsCode: event.smsCode || '',
    votingConfig: {
      enabled: !!event.votingConfig?.enabled,
      viaSms: !!event.votingConfig?.viaSms,
      question: event.votingConfig?.question || '',
      options: Array.isArray(event.votingConfig?.options) && event.votingConfig.options.length
        ? event.votingConfig.options.map((o) => ({ key: String(o.key || ''), label: String(o.label || '') }))
        : [
            { key: '1', label: 'Yes' },
            { key: '2', label: 'No' },
            { key: '3', label: 'Maybe' }
          ]
    },
    reminderConfig: {
      enabled: !!event.reminderConfig?.enabled,
      offsetsHours: Array.isArray(event.reminderConfig?.offsetsHours)
        ? event.reminderConfig.offsetsHours.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
        : [24, 2],
      channels: {
        inApp: event.reminderConfig?.channels?.inApp !== false,
        sms: !!event.reminderConfig?.channels?.sms
      }
    },
    reminderOffsetsRaw: Array.isArray(event.reminderConfig?.offsetsHours) && event.reminderConfig.offsetsHours.length
      ? event.reminderConfig.offsetsHours.join(',')
      : '24,2',
    audience: {
      userIds: Array.isArray(event.audience?.userIds) ? event.audience.userIds.map((id) => Number(id)) : [],
      groupIds: Array.isArray(event.audience?.groupIds) ? event.audience.groupIds.map((id) => Number(id)) : [],
      roleKeys: Array.isArray(event.audience?.roleKeys) ? event.audience.roleKeys.map((k) => String(k)) : []
    },
    skillBuilderDirectHours:
      event.skillBuilderDirectHours != null && event.skillBuilderDirectHours !== ''
        ? Number(event.skillBuilderDirectHours)
        : null,
    registrationEligible: !!event.registrationEligible,
    medicaidEligible: !!event.medicaidEligible,
    cashEligible: !!event.cashEligible,
    snacksAvailable: event.snacksAvailable === undefined ? true : !!event.snacksAvailable,
    snackOptions: Array.isArray(event.snackOptions) ? [...event.snackOptions] : [],
    mealsAvailable: !!event.mealsAvailable,
    mealOptions: Array.isArray(event.mealOptions) ? [...event.mealOptions] : [],
    programCostBillingMode: String(event.programCostBillingMode || 'total').trim(),
    programCostDollars: event.programCostDollars != null ? Number(event.programCostDollars) : null,
    perSessionCostDollars: event.perSessionCostDollars != null ? Number(event.perSessionCostDollars) : null,
    publicHeroImageUrl: String(event.publicHeroImageUrl || '').trim(),
    eventImageUrl: String(event.eventImageUrl || '').trim(),
    eventImageUrls: Array.isArray(event.eventImageUrls) ? [...event.eventImageUrls] : [],
    registrationFormUrl: String(event.registrationFormUrl || '').trim(),
    publicListingDetails: String(event.publicListingDetails || '').trim(),
    inPersonPublic: !!event.inPersonPublic,
    publicLocationAddress: String(event.publicLocationAddress || '').trim(),
    publicAgeMin:
      event.publicAgeMin != null && event.publicAgeMin !== '' ? String(Number(event.publicAgeMin)) : '',
    publicAgeMax:
      event.publicAgeMax != null && event.publicAgeMax !== '' ? String(Number(event.publicAgeMax)) : '',
    publicSessionLabel: String(event.publicSessionLabel || '').trim(),
    publicSessionDateRange: String(event.publicSessionDateRange || '').trim(),
    clientCheckInDisplayTime: wallTimeToInput(event.clientCheckInDisplayTime),
    clientCheckOutDisplayTime: wallTimeToInput(event.clientCheckOutDisplayTime),
    employeeReportTime: wallTimeToInput(event.employeeReportTime),
    employeeDepartureTime: wallTimeToInput(event.employeeDepartureTime),
    virtualSessionsEnabled: event.virtualSessionsEnabled !== false,
    kioskEventPinSet: !!event.kioskEventPinSet,
    kioskEventPinNew: '',
    kioskEventPinClear: false
  };
  selectedPreset.value = '';
  selectedEventCategory.value = deriveCategoryFromEventType(draft.value.eventType);
  syncEventTypeSelection();
}

function deriveCategoryFromEventType(rawType) {
  const t = String(rawType || '').trim().toLowerCase();
  if (!t || t === 'company_event') return 'company_event';
  if (t === 'program_event' || t.startsWith('program_') || t === 'guardian_program_class') return 'program_event';
  if (t === 'staff_event' || t.startsWith('staff_') || t.startsWith('team_')) return 'staff_event';
  return 'custom';
}

function syncEventTypeSelection() {
  const t = String(draft.value.eventType || '').trim().toLowerCase();
  const known = EVENT_TYPE_OPTIONS.some((opt) => String(opt.value || '').toLowerCase() === t);
  eventTypeSelection.value = known ? t : '__custom__';
}

function applyEventTypeSelection() {
  if (eventTypeSelection.value === '__custom__') return;
  draft.value.eventType = String(eventTypeSelection.value || 'company_event').trim().toLowerCase();
  selectedEventCategory.value = deriveCategoryFromEventType(draft.value.eventType);
}

function applyEventCategory() {
  const cat = String(selectedEventCategory.value || '').trim().toLowerCase();
  if (cat === 'custom') return;
  draft.value.eventType = cat;
  selectedPreset.value = '';
  syncEventTypeSelection();
}

function applyPreset() {
  const preset = EVENT_TYPE_PRESETS.find((p) => p.value === selectedPreset.value);
  if (!preset) return;
  draft.value.eventType = String(preset.eventType || '').trim().toLowerCase();
  selectedEventCategory.value = deriveCategoryFromEventType(draft.value.eventType);
  if (!draft.value.title) draft.value.title = String(preset.title || '').trim();
  syncEventTypeSelection();
}

async function onPhotoUpload(event) {
  const files = Array.from(event?.target?.files || []);
  if (!files.length) return;
  formError.value = '';
  try {
    for (const file of files) {
      const fd = new FormData();
      fd.append('logo', file);
      // eslint-disable-next-line no-await-in-loop
      const resp = await api.post('/logos/upload', fd, { skipGlobalLoading: true });
      const url = String(resp.data?.url || '').trim();
      if (!url) continue;
      if (!draft.value.eventImageUrl) draft.value.eventImageUrl = url;
      if (!draft.value.publicHeroImageUrl) draft.value.publicHeroImageUrl = url;
      draft.value.eventImageUrls = [...(draft.value.eventImageUrls || []), url];
    }
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Photo upload failed';
  } finally {
    if (event?.target) event.target.value = '';
  }
}

function removeEventImage(idx) {
  const removed = (draft.value.eventImageUrls || [])[idx];
  draft.value.eventImageUrls = (draft.value.eventImageUrls || []).filter((_, i) => i !== idx);
  if (removed && draft.value.publicHeroImageUrl === removed) {
    draft.value.publicHeroImageUrl = draft.value.eventImageUrls[0] || '';
  }
}

function setBannerFromAlbum(url) {
  draft.value.publicHeroImageUrl = String(url || '').trim();
}

function moveEventImageLeft(idx) {
  const list = Array.isArray(draft.value.eventImageUrls) ? [...draft.value.eventImageUrls] : [];
  if (idx <= 0 || idx >= list.length) return;
  const tmp = list[idx - 1];
  list[idx - 1] = list[idx];
  list[idx] = tmp;
  draft.value.eventImageUrls = list;
}

function moveEventImageRight(idx) {
  const list = Array.isArray(draft.value.eventImageUrls) ? [...draft.value.eventImageUrls] : [];
  if (idx < 0 || idx >= list.length - 1) return;
  const tmp = list[idx + 1];
  list[idx + 1] = list[idx];
  list[idx] = tmp;
  draft.value.eventImageUrls = list;
}

function shortUrl(value) {
  const s = String(value || '');
  if (s.length <= 42) return s;
  return `${s.slice(0, 36)}...`;
}

function normalizeRecurrenceForPayload(recurrence = {}) {
  const frequency = String(recurrence.frequency || 'none');
  const payload = { frequency };
  if (frequency === 'none') return payload;
  payload.interval = Math.max(1, Number.parseInt(String(recurrence.interval || 1), 10) || 1);
  if (frequency === 'weekly') {
    payload.byWeekday = Array.isArray(recurrence.byWeekday)
      ? recurrence.byWeekday.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
      : [];
  }
  if (frequency === 'monthly') {
    const monthDay = Number.parseInt(String(recurrence.byMonthDay || ''), 10);
    if (Number.isFinite(monthDay) && monthDay >= 1 && monthDay <= 31) payload.byMonthDay = monthDay;
  }
  if (recurrence.untilDate) payload.untilDate = recurrence.untilDate;
  return payload;
}

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

function onProgramMeetingsSaved(next) {
  skillsGroupMeetingsPreview.value = Array.isArray(next) ? next.map((x) => ({ ...x })) : [];
  emit('saved');
}

function toggleWeekday(weekday, checked) {
  const set = new Set(draft.value.recurrence.byWeekday);
  if (checked) set.add(Number(weekday));
  else set.delete(Number(weekday));
  draft.value.recurrence.byWeekday = [...set].sort((a, b) => a - b);
}

async function loadSkillsGroupRoster(options = {}) {
  const silent = !!options.silent;
  rosterError.value = '';
  if (!props.eventId || !props.agencyId) return;
  if (!silent) rosterLoading.value = true;
  try {
    const res = await api.get(`/skill-builders/events/${props.eventId}/skills-group-roster`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    roster.value = {
      skillsGroupId: res.data?.skillsGroupId ?? null,
      organizationId: res.data?.organizationId ?? null,
      assignedProviders: Array.isArray(res.data?.assignedProviders) ? res.data.assignedProviders : [],
      eligibleProviders: Array.isArray(res.data?.eligibleProviders) ? res.data.eligibleProviders : [],
      allAgencyProviders: Array.isArray(res.data?.allAgencyProviders) ? res.data.allAgencyProviders : []
    };
    providerToAdd.value = '';
    providerToAddExpanded.value = '';
  } catch (e) {
    rosterError.value = e.response?.data?.error?.message || e.message || 'Failed to load program staff';
    roster.value = {
      skillsGroupId: null,
      organizationId: null,
      assignedProviders: [],
      eligibleProviders: [],
      allAgencyProviders: []
    };
  } finally {
    if (!silent) rosterLoading.value = false;
  }
}

async function addRosterProvider(fromExpanded) {
  const id = Number(fromExpanded ? providerToAddExpanded.value : providerToAdd.value);
  if (!id || rosterSaving.value) return;
  rosterSaving.value = true;
  rosterError.value = '';
  sdpPromoteNotice.value = '';
  try {
    const res = await api.post(
      `/skill-builders/events/${props.eventId}/skills-group-roster`,
      { agencyId: props.agencyId, providerUserId: id, action: 'add' },
      { skipGlobalLoading: true }
    );
    if (res.data?.skillDevelopmentProgramEligibleUpdated) {
      sdpPromoteNotice.value =
        'Skill Development Program eligibility was turned on for this provider in their account.';
    }
    await loadSkillsGroupRoster({ silent: true });
    providerToAdd.value = '';
    providerToAddExpanded.value = '';
  } catch (e) {
    rosterError.value = e.response?.data?.error?.message || e.message || 'Could not add provider';
  } finally {
    rosterSaving.value = false;
  }
}

async function removeRosterProvider(userId) {
  const id = Number(userId);
  if (!id || rosterSaving.value) return;
  rosterSaving.value = true;
  rosterError.value = '';
  try {
    await api.post(
      `/skill-builders/events/${props.eventId}/skills-group-roster`,
      { agencyId: props.agencyId, providerUserId: id, action: 'remove' },
      { skipGlobalLoading: true }
    );
    await loadSkillsGroupRoster({ silent: true });
  } catch (e) {
    rosterError.value = e.response?.data?.error?.message || e.message || 'Could not remove provider';
  } finally {
    rosterSaving.value = false;
  }
}

async function loadAffiliateProgramOrgs() {
  affiliateProgramOrgs.value = [];
  if (!props.agencyId) return;
  try {
    const res = await api.get('/availability/admin/skill-builders/options', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const orgs = Array.isArray(res.data?.organizations) ? res.data.organizations : [];
    affiliateProgramOrgs.value = orgs.filter((o) => String(o.organizationType || '').toLowerCase() !== 'school');
  } catch {
    affiliateProgramOrgs.value = [];
  }
}

async function loadEventProviderAssignments() {
  eventProviderError.value = '';
  eventProviderLoading.value = true;
  eventProviderToAdd.value = '';
  try {
    const res = await api.get(`/skill-builders/events/${props.eventId}/provider-assignments`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    eventProviderAssignments.value = Array.isArray(res.data?.assignedProviders)
      ? res.data.assignedProviders.map((p) => ({
          ...p,
          assignmentRoleTitle: String(p.assignmentRoleTitle || '').trim(),
          assignmentRoleKey: String(p.assignmentRoleKey || '').trim(),
          virtualAccessRole: String(p.virtualAccessRole || 'participant'),
          isPrimaryAccess: !!p.isPrimaryAccess
        }))
      : [];
    eventProviderDirectory.value = Array.isArray(res.data?.allAgencyProviders) ? res.data.allAgencyProviders : [];
  } catch (e) {
    eventProviderError.value = e.response?.data?.error?.message || e.message || 'Failed to load event providers';
    eventProviderAssignments.value = [];
    eventProviderDirectory.value = [];
  } finally {
    eventProviderLoading.value = false;
  }
}

async function saveEventProviderAssignment(provider) {
  const pid = Number(provider?.id || 0);
  if (!pid || eventProviderSaving.value) return;
  eventProviderSaving.value = true;
  eventProviderError.value = '';
  try {
    await api.put(
      `/skill-builders/events/${props.eventId}/provider-assignments/${pid}`,
      {
        agencyId: props.agencyId,
        roleTitle: String(provider.assignmentRoleTitle || '').trim() || null,
        roleKey: String(provider.assignmentRoleKey || '').trim() || null,
        isPrimaryAccess: !!provider.isPrimaryAccess,
        virtualAccessRole: String(provider.virtualAccessRole || 'participant')
      },
      { skipGlobalLoading: true }
    );
    await loadEventProviderAssignments();
  } catch (e) {
    eventProviderError.value = e.response?.data?.error?.message || e.message || 'Could not save provider assignment';
  } finally {
    eventProviderSaving.value = false;
  }
}

async function addEventProvider() {
  const pid = Number(eventProviderToAdd.value || 0);
  if (!pid || eventProviderSaving.value) return;
  const profile = (eventProviderDirectory.value || []).find((p) => Number(p.id) === pid) || null;
  const fallbackRoleTitle = String(profile?.title || '').trim() || null;
  await saveEventProviderAssignment({
    id: pid,
    assignmentRoleTitle: fallbackRoleTitle,
    assignmentRoleKey: null,
    virtualAccessRole: 'participant',
    isPrimaryAccess: false
  });
  eventProviderToAdd.value = '';
}

async function removeEventProviderAssignment(providerUserId) {
  const pid = Number(providerUserId || 0);
  if (!pid || eventProviderSaving.value) return;
  eventProviderSaving.value = true;
  eventProviderError.value = '';
  try {
    await api.delete(`/skill-builders/events/${props.eventId}/provider-assignments/${pid}`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    await loadEventProviderAssignments();
  } catch (e) {
    eventProviderError.value = e.response?.data?.error?.message || e.message || 'Could not remove provider assignment';
  } finally {
    eventProviderSaving.value = false;
  }
}

async function loadEditBundle() {
  loadError.value = '';
  loading.value = true;
  try {
    const [evRes] = await Promise.all([
      api.get(`/skill-builders/events/${props.eventId}/company-event-edit`, {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      }),
      loadAffiliateProgramOrgs(),
      loadSkillsGroupRoster(),
      loadEventProviderAssignments()
    ]);
    skillsGroupMeetingsPreview.value = Array.isArray(evRes.data?.skillsGroupMeetings)
      ? evRes.data.skillsGroupMeetings.map((x) => ({ ...x }))
      : [];
    populateFromEvent(evRes.data?.event);
    markClean();
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Failed to load event';
    skillsGroupMeetingsPreview.value = [];
    draft.value = emptyDraft();
  } finally {
    loading.value = false;
  }
}

function close() {
  if (saving.value) return;
  if (!confirmDiscardIfNeeded()) return;
  emit('update:modelValue', false);
}

async function save() {
  formError.value = '';
  const tz = String(draft.value.timezone || '').trim();
  if (!isValidTimeZone(tz)) {
    formError.value = 'Enter a valid IANA timezone (e.g. America/Chicago).';
    return;
  }
  const startsAtIso = datetimeLocalInZoneToIso(draft.value.startsAtLocal, tz);
  const endsAtIso = datetimeLocalInZoneToIso(draft.value.endsAtLocal, tz);
  const startsAt = startsAtIso ? new Date(startsAtIso) : null;
  const endsAt = endsAtIso ? new Date(endsAtIso) : null;
  if (!draft.value.title.trim()) {
    formError.value = 'Title is required.';
    return;
  }
  if (!startsAt || !endsAt || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    formError.value = 'Start and end dates are required.';
    return;
  }
  if (endsAt <= startsAt) {
    formError.value = 'End time must be after start time.';
    return;
  }
  const pam = parseInt(String(draft.value.publicAgeMin || '').trim(), 10);
  const pax = parseInt(String(draft.value.publicAgeMax || '').trim(), 10);
  const hasMin = Number.isFinite(pam) && pam >= 0;
  const hasMax = Number.isFinite(pax) && pax >= 0;
  if (hasMin && hasMax && pam > pax) {
    formError.value = 'Minimum age cannot be greater than maximum age.';
    return;
  }
  let votingClosedAt = null;
  if (draft.value.votingClosedAtLocal) {
    votingClosedAt = datetimeLocalInZoneToIso(draft.value.votingClosedAtLocal, tz);
  }

  saving.value = true;
  try {
    const payload = {
      title: draft.value.title,
      description: draft.value.description,
      eventType: draft.value.eventType || 'company_event',
      splashContent: draft.value.splashContent,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      timezone: tz,
      isActive: !!draft.value.isActive,
      recurrence: normalizeRecurrenceForPayload(draft.value.recurrence),
      rsvpMode: draft.value.rsvpMode,
      smsCode: draft.value.smsCode || null,
      votingClosedAt,
      votingConfig: {
        enabled: !!draft.value.votingConfig.enabled,
        viaSms: !!draft.value.votingConfig.viaSms,
        question: String(draft.value.votingConfig.question || '').trim(),
        options: (Array.isArray(draft.value.votingConfig.options) ? draft.value.votingConfig.options : [])
          .map((o) => ({
            key: String(o.key || '').trim(),
            label: String(o.label || '').trim()
          }))
          .filter((o) => o.key && o.label)
      },
      reminderConfig: {
        enabled: !!draft.value.reminderConfig.enabled,
        offsetsHours: String(draft.value.reminderOffsetsRaw || '')
          .split(',')
          .map((n) => Number.parseInt(String(n).trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0),
        channels: {
          inApp: true,
          sms: !!draft.value.reminderConfig.channels.sms
        }
      },
      audience: {
        userIds: draft.value.audience.userIds,
        groupIds: draft.value.audience.groupIds,
        roleKeys: draft.value.audience.roleKeys
      },
      skillBuilderDirectHours:
        draft.value.skillBuilderDirectHours === '' || draft.value.skillBuilderDirectHours == null
          ? null
          : Number(draft.value.skillBuilderDirectHours),
      organizationId:
        draft.value.organizationId && Number(draft.value.organizationId) > 0
          ? Number(draft.value.organizationId)
          : null,
      registrationEligible: !!draft.value.registrationEligible,
      medicaidEligible: !!draft.value.medicaidEligible,
      cashEligible: !!draft.value.cashEligible,
      programCostBillingMode: draft.value.cashEligible
        ? (
            draft.value.programCostBillingMode ||
            (draft.value.programCostDollars != null && draft.value.programCostDollars !== '' ? 'total' : 'per_session')
          )
        : null,
      programCostDollars: draft.value.cashEligible
        ? (draft.value.programCostDollars != null && draft.value.programCostDollars !== ''
            ? Number(draft.value.programCostDollars)
            : null)
        : null,
      perSessionCostDollars: draft.value.cashEligible
        ? (draft.value.perSessionCostDollars != null && draft.value.perSessionCostDollars !== ''
            ? Number(draft.value.perSessionCostDollars)
            : null)
        : null,
      publicHeroImageUrl: String(draft.value.publicHeroImageUrl || '').trim() || null,
      eventImageUrl: String(draft.value.eventImageUrl || '').trim() || null,
      eventImageUrls: Array.isArray(draft.value.eventImageUrls) ? [...draft.value.eventImageUrls] : [],
      registrationFormUrl: String(draft.value.registrationFormUrl || '').trim() || null,
      publicListingDetails: String(draft.value.publicListingDetails || '').trim() || null,
      inPersonPublic: !!draft.value.inPersonPublic,
      publicLocationAddress: draft.value.inPersonPublic
        ? String(draft.value.publicLocationAddress || '').trim() || null
        : null,
      publicAgeMin: (() => {
        const s = String(draft.value.publicAgeMin || '').trim();
        if (!s) return null;
        const n = parseInt(s, 10);
        return Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
      })(),
      publicAgeMax: (() => {
        const s = String(draft.value.publicAgeMax || '').trim();
        if (!s) return null;
        const n = parseInt(s, 10);
        return Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
      })(),
      publicSessionLabel: String(draft.value.publicSessionLabel || '').trim().slice(0, 128) || null,
      publicSessionDateRange: String(draft.value.publicSessionDateRange || '').trim().slice(0, 255) || null,
      clientCheckInDisplayTime: draft.value.clientCheckInDisplayTime || null,
      clientCheckOutDisplayTime: draft.value.clientCheckOutDisplayTime || null,
      employeeReportTime: draft.value.employeeReportTime || null,
      employeeDepartureTime: draft.value.employeeDepartureTime || null,
      virtualSessionsEnabled: !!draft.value.virtualSessionsEnabled,
      snacksAvailable: !!draft.value.snacksAvailable,
      snackOptions: draft.value.snacksAvailable
        ? (draft.value.snackOptions || []).map((s) => String(s || '').trim()).filter(Boolean)
        : [],
      mealsAvailable: !!draft.value.mealsAvailable,
      mealOptions: draft.value.mealsAvailable
        ? (draft.value.mealOptions || []).map((s) => String(s || '').trim()).filter(Boolean)
        : []
    };

    const pinNew = String(draft.value.kioskEventPinNew || '').replace(/\D/g, '').slice(0, 6);
    if (pinNew.length === 6) {
      payload.kioskEventPin = pinNew;
    } else if (draft.value.kioskEventPinClear) {
      payload.kioskEventPinClear = true;
    }

    await api.put(
      `/skill-builders/events/${props.eventId}/company-event-edit`,
      { agencyId: props.agencyId, ...payload },
      { skipGlobalLoading: true }
    );
    markClean();
    emit('update:modelValue', false);
    emit('saved');
  } catch (e) {
    formError.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      formError.value = '';
      loadEditBundle();
    } else {
      loadError.value = '';
      skillsGroupMeetingsPreview.value = [];
      draft.value = emptyDraft();
      rosterError.value = '';
      roster.value = {
        skillsGroupId: null,
        organizationId: null,
        assignedProviders: [],
        eligibleProviders: [],
        allAgencyProviders: []
      };
      providerToAdd.value = '';
      providerToAddExpanded.value = '';
      showExpandedAgencyProviders.value = false;
      sdpPromoteNotice.value = '';
      eventProviderError.value = '';
      eventProviderToAdd.value = '';
      eventProviderAssignments.value = [];
      eventProviderDirectory.value = [];
      baselineSnapshot.value = '';
    }
  },
  { immediate: true }
);

watch(
  () => draft.value.kioskEventPinClear,
  (cleared) => {
    if (cleared) draft.value.kioskEventPinNew = '';
  }
);

watch(
  () => draft.value.kioskEventPinNew,
  () => {
    if (kioskPinNewDigitCount.value > 0) draft.value.kioskEventPinClear = false;
  }
);

watch(
  () => draft.value.eventType,
  () => {
    selectedEventCategory.value = deriveCategoryFromEventType(draft.value.eventType);
    syncEventTypeSelection();
    if (!isServiceProgramEventType.value) return;
    draft.value.rsvpMode = 'none';
    draft.value.votingConfig.enabled = false;
    draft.value.reminderConfig.enabled = false;
    draft.value.registrationEligible = true;
  },
  { immediate: true }
);
</script>

<style scoped>
.sb-ce-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 12px;
  overflow-y: auto;
}
.sb-ce-pwm-wrap {
  padding: 0;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
}
.sb-ce-modal {
  width: min(720px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
  border: 1px solid var(--border, #e2e8f0);
}
.sb-ce-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sb-ce-modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sb-ce-modal-body {
  padding: 16px 18px 20px;
  overflow-y: auto;
}
.sb-ce-msg {
  margin-bottom: 12px;
}
.sb-ce-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sb-ce-grid-tight {
  margin-top: 8px;
}
.sb-ce-lbl {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-secondary, #475569);
}
.sb-ce-code {
  display: inline-block;
  margin-top: 4px;
  word-break: break-all;
  font-size: 0.8rem;
}
.sb-ce-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.88rem;
  cursor: pointer;
}
.sb-ce-check-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  cursor: pointer;
}
.sb-ce-check-row input[type='checkbox'] {
  margin-top: 3px;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.sb-ce-kiosk-remove {
  margin-top: 4px;
}
.sb-ce-pin-status {
  padding: 10px 12px;
  margin: 10px 0 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.sb-ce-pin-status-line {
  margin: 0 0 6px;
  font-size: 0.9rem;
}
.sb-ce-pin-status-note {
  margin: 0;
  line-height: 1.4;
}
.sb-ce-pin-input {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
  max-width: 12rem;
}
.sb-ce-roster-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sb-ce-roster-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.sb-ce-event-prov-row {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sb-ce-event-prov-name {
  font-size: 0.92rem;
}
.sb-ce-event-prov-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(160px, 1fr));
  gap: 8px;
}
.sb-ce-event-prov-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sb-ce-roster-name {
  font-size: 0.92rem;
}
.sb-ce-roster-add {
  margin-top: 4px;
}
.sb-ce-roster-lbl {
  margin-bottom: 6px;
}
.sb-ce-roster-row-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sb-ce-roster-hint {
  margin: 8px 0 0;
  line-height: 1.4;
}
.sb-ce-roster-expand {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border, #e2e8f0);
}
.sb-ce-roster-expand-btn {
  padding: 0 !important;
  height: auto !important;
  font-weight: 600;
  text-align: left;
  white-space: normal;
  line-height: 1.35;
}
.sb-ce-roster-expanded {
  margin-top: 10px;
}
.sb-ce-sdp-notice {
  margin: 8px 0 0;
  padding: 8px 10px;
  background: #ecfdf5;
  border-radius: 8px;
  border: 1px solid #a7f3d0;
  color: #065f46;
}
.sb-ce-roster-select {
  flex: 1;
  min-width: 200px;
  max-width: 420px;
}
.sb-ce-kiosk-url {
  margin: 8px 0 0;
}
.sb-ce-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.sb-ce-subhead {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 6px;
  color: var(--primary, #0f766e);
}
.sb-ce-pricing-block {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}
.sb-ce-food-options {
  margin-top: 10px;
}
.sb-ce-food-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.sb-ce-food-row .input {
  flex: 1;
}
.sb-ce-custom-event-type {
  margin-top: 6px;
}
.sb-ce-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 2px;
}
.sb-ce-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 999px;
  padding: 4px 8px;
  max-width: 100%;
  background: #f8fafc;
}
.sb-ce-tag-url {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
}
.sb-ce-tag-move {
  padding: 0 6px;
  line-height: 1.2;
}
.sb-ce-tag-banner {
  white-space: nowrap;
}
.sb-ce-tag-remove {
  border: none;
  background: none;
  color: var(--danger, #dc2626);
  cursor: pointer;
  font-weight: 700;
  line-height: 1;
}
.sb-ce-food-remove {
  background: none;
  border: none;
  color: var(--danger, #dc2626);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
}
.sb-ce-pattern-lead {
  margin: 0 0 10px;
  line-height: 1.45;
}
.sb-ce-pattern-list {
  margin: 0;
  padding-left: 1.2rem;
  line-height: 1.5;
}
.sb-ce-recur-note {
  margin: 0 0 12px;
  line-height: 1.45;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.sb-ce-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sb-ce-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  border: 1px solid var(--border, #e2e8f0);
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.85rem;
}
.sb-ce-opt-pair {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
}
.sb-ce-opt-key {
  text-transform: uppercase;
}
.sb-ce-hint {
  margin: 12px 0 0;
  line-height: 1.4;
}
.sb-ce-tz-hint {
  margin: 6px 0 0;
  line-height: 1.35;
}
.sb-ce-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.error-box {
  color: #b91c1c;
  padding: 10px 12px;
  background: #fef2f2;
  border-radius: 8px;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.small {
  font-size: 0.8rem;
}
@media (max-width: 640px) {
  .sb-ce-grid {
    grid-template-columns: 1fr;
  }
}
</style>
