<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3 style="margin: 0;">{{ title }}</h3>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <fieldset class="lam-fields" :disabled="viewOnly">
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="error" class="error">{{ error }}</div>

        <!-- Agency new-client intake -->
        <div v-else-if="actionKey === 'agency_intake'" class="lam-agency">
          <div class="lam-status-list">
            <div class="lam-status-item">
              <span class="lam-status-icon" aria-hidden="true">📄</span>
              <div class="lam-status-body">
                <span class="lam-status-label">Packet</span>
                <span class="lam-status-pill">{{ agencyDerived.packetTypeLabel || '—' }}</span>
              </div>
            </div>
            <div class="lam-status-item">
              <span class="lam-status-icon" aria-hidden="true">⏳</span>
              <div class="lam-status-body">
                <span class="lam-status-label">Intake status</span>
                <span class="lam-status-pill" :class="agencyDerived.agencyIntakeComplete ? 'ok' : 'pending'">
                  {{ agencyDerived.agencyIntakeComplete ? 'Complete' : 'In progress' }}
                </span>
              </div>
            </div>
            <div class="lam-status-item">
              <span class="lam-status-icon" aria-hidden="true">👤</span>
              <div class="lam-status-body">
                <span class="lam-status-label">Provider assigned</span>
                <span class="lam-status-pill" :class="agencyDerived.hasProvider ? 'ok' : 'warn'">
                  {{ agencyDerived.hasProvider ? (agencyDerived.providerLabel || 'Yes') : 'Not yet assigned' }}
                </span>
              </div>
            </div>
            <div class="lam-status-item">
              <span class="lam-status-icon" aria-hidden="true">📅</span>
              <div class="lam-status-body">
                <span class="lam-status-label">Assigned day</span>
                <span class="lam-status-pill" :class="assignedDayLabel !== 'Not yet assigned' ? 'ok' : 'warn'">
                  {{ assignedDayLabel }}
                </span>
              </div>
            </div>
            <div class="lam-status-item">
              <span class="lam-status-icon" aria-hidden="true">🏳️</span>
              <div class="lam-status-body">
                <span class="lam-status-label">Waitlist status</span>
                <span class="lam-status-pill" :class="agency.waitlisted ? 'waitlist' : 'neutral'">
                  {{ agency.waitlisted ? 'Waitlisted' : 'Not waitlisted' }}
                </span>
              </div>
            </div>
          </div>

          <p v-if="agencyDerived.pendingLabels?.length && !agency.waitlisted" class="lam-pending-note">
            Still needed: {{ agencyDerived.pendingLabels.join(' · ') }}
          </p>

          <section class="lam-section">
            <h4 class="lam-section-title">Required items</h4>
            <div v-if="agencyDerived.isPaper" class="lam-check-card">
              <label class="lam-check-row">
                <input v-model="agency.paperComplete" type="checkbox" />
                <span class="lam-check-copy">
                  <strong>Paper packet complete</strong>
                  <span class="lam-check-sub">Documents and signatures received</span>
                </span>
              </label>
              <textarea
                v-if="!agency.paperComplete"
                v-model="agency.missingItemsText"
                class="input textarea lam-missing"
                rows="2"
                placeholder="Missing items (one per line)"
              />
            </div>
            <div class="lam-check-card">
              <label class="lam-check-row">
                <input v-model="agency.insuranceReviewed" type="checkbox" />
                <span class="lam-check-copy">
                  <strong>Insurance / eligibility reviewed</strong>
                  <span class="lam-check-sub">Verify coverage and eligibility</span>
                </span>
              </label>
            </div>
            <div class="lam-check-card">
              <label class="lam-check-row">
                <input v-model="agency.ehrTransferred" type="checkbox" />
                <span class="lam-check-copy">
                  <strong>EHR transfer complete</strong>
                  <span class="lam-check-sub">Confirm full EHR data transfer</span>
                </span>
              </label>
            </div>
          </section>

          <section class="lam-section" :class="{ 'lam-section--muted': agency.waitlisted }">
            <h4 class="lam-section-title">Assignments</h4>
            <p class="lam-section-hint">
              <template v-if="agency.waitlisted">
                Waitlist is active — provider and day are optional. You can still note who or which day they are waiting for.
              </template>
              <template v-else>
                Assign a provider and/or weekday. Only days with open slots at this school are shown.
              </template>
            </p>
            <div v-if="loadingAssignmentOptions" class="muted">Loading providers…</div>
            <div v-else-if="assignmentOptionsError" class="error">{{ assignmentOptionsError }}</div>
            <div v-else-if="!assignmentProviderOptions.length" class="lam-section-hint warn">
              No providers at this school yet. Open the <strong>Providers</strong> tab → Add Provider to affiliate
              someone and set their day/slots.
            </div>
            <div v-else class="lam-assign-grid">
              <div class="lam-assign-field">
                <label :for="providerSelectId">Assign provider</label>
                <select
                  :id="providerSelectId"
                  v-model="assignment.providerUserId"
                  class="input"
                  @change="onAssignmentProviderChange"
                >
                  <option value="">Select provider</option>
                  <option
                    v-for="prov in assignmentProviderOptions"
                    :key="prov.provider_user_id"
                    :value="String(prov.provider_user_id)"
                  >
                    {{ providerOptionLabel(prov) }}
                  </option>
                </select>
              </div>
              <div class="lam-assign-field">
                <label :for="daySelectId">Assign day</label>
                <select
                  :id="daySelectId"
                  v-model="assignment.serviceDay"
                  class="input"
                  :disabled="!assignment.providerUserId"
                >
                  <option value="">Select day</option>
                  <option
                    v-for="day in assignmentDayOptions"
                    :key="day.day_of_week"
                    :value="day.day_of_week"
                  >
                    {{ dayOptionLabel(day) }}
                  </option>
                </select>
              </div>
            </div>
          </section>

          <section class="lam-section">
            <h4 class="lam-section-title">Waitlist status</h4>
            <div class="lam-check-card lam-check-card--waitlist">
              <label class="lam-check-row">
                <input v-model="agency.waitlisted" type="checkbox" @change="onWaitlistToggle" />
                <span class="lam-check-copy">
                  <strong>Waitlist (true barrier)</strong>
                  <span class="lam-check-sub">
                    Waitlist overrides provider/day requirements. A client may wait for a spot on a day,
                    for a day with a provider, or without either.
                  </span>
                </span>
              </label>
              <input
                v-if="agency.waitlisted"
                v-model="agency.waitlistReason"
                class="input"
                placeholder="Waitlist reason (optional)"
              />
            </div>
          </section>

          <div class="lam-info-banner">
            <span class="lam-info-icon" aria-hidden="true">ℹ️</span>
            <p>
              Action items depend on eligibility review and EHR transfer. Provider/day assignment and waitlist
              are managed here — waitlist takes priority when checked.
            </p>
          </div>
        </div>

        <!-- Fall reassignment after provider pushback -->
        <div v-else-if="actionKey === 'fall_reassignment'" class="lam-agency">
          <p class="hint">
            The provider sent this client back (unable to reach or similar). Reassign provider and day,
            confirm disclosure and insurance, then the client moves to Ready to Schedule — or mark
            waitlist if there is no slot yet. Schools still see Fall Confirmation Pending until
            reassignment is complete (waitlist shows as Waitlist).
          </p>

          <section class="lam-section" :class="{ 'lam-section--muted': agency.waitlisted }">
            <h4 class="lam-section-title">Assignments</h4>
            <p class="lam-section-hint">
              <template v-if="agency.waitlisted">
                Waitlist is active — provider and day are optional. You can still note who or which day they are waiting for.
              </template>
              <template v-else>
                Assign a provider and weekday. Only days with open slots at this school are shown.
              </template>
            </p>
            <div v-if="loadingAssignmentOptions" class="muted">Loading providers…</div>
            <div v-else-if="assignmentOptionsError" class="error">{{ assignmentOptionsError }}</div>
            <div v-else-if="!assignmentProviderOptions.length" class="lam-section-hint warn">
              No providers at this school yet. Open the <strong>Providers</strong> tab → Add Provider.
            </div>
            <div v-else class="lam-assign-grid">
              <div class="lam-assign-field">
                <label :for="providerSelectId">Assign provider</label>
                <select
                  :id="providerSelectId"
                  v-model="assignment.providerUserId"
                  class="input"
                  @change="onAssignmentProviderChange"
                >
                  <option value="">Select provider</option>
                  <option
                    v-for="prov in assignmentProviderOptions"
                    :key="prov.provider_user_id"
                    :value="String(prov.provider_user_id)"
                  >
                    {{ providerOptionLabel(prov) }}
                  </option>
                </select>
              </div>
              <div class="lam-assign-field">
                <label :for="daySelectId">Assign day</label>
                <select
                  :id="daySelectId"
                  v-model="assignment.serviceDay"
                  class="input"
                  :disabled="!assignment.providerUserId"
                >
                  <option value="">Select day</option>
                  <option
                    v-for="day in assignmentDayOptions"
                    :key="day.day_of_week"
                    :value="day.day_of_week"
                  >
                    {{ dayOptionLabel(day) }}
                  </option>
                </select>
              </div>
            </div>
          </section>

          <section class="lam-section">
            <h4 class="lam-section-title">Waitlist status</h4>
            <div class="lam-check-card lam-check-card--waitlist">
              <label class="lam-check-row">
                <input v-model="agency.waitlisted" type="checkbox" @change="onWaitlistToggle" />
                <span class="lam-check-copy">
                  <strong>Waitlist (true barrier)</strong>
                  <span class="lam-check-sub">
                    Use when no provider/day slot is available yet. Waitlist overrides the reassignment
                    requirements — optional provider/day notes who or what they are waiting for.
                  </span>
                </span>
              </label>
              <input
                v-if="agency.waitlisted"
                v-model="agency.waitlistReason"
                class="input"
                placeholder="Waitlist reason (optional)"
              />
            </div>
          </section>

          <section v-if="!agency.waitlisted" class="lam-section">
            <h4 class="lam-section-title">Clearance</h4>
            <label class="check-row" :class="{ muted: disclosurePrechecked }">
              <input v-model="clearance.disclosureOk" type="checkbox" :disabled="disclosurePrechecked" />
              <span>
                Assigned provider on disclosure (or same provider as last year)
                <template v-if="disclosurePrechecked"> — pre-checked for continuing clients</template>
              </span>
            </label>
            <label class="check-row">
              <input v-model="clearance.insuranceOk" type="checkbox" />
              <span>Insurance / eligibility clear</span>
            </label>
          </section>
        </div>

        <!-- Waitlist resolution -->
        <div v-else-if="actionKey === 'waitlist_resolution'" class="lam-agency">
          <p class="hint">
            Client is waitlisted. Update the reason, assign provider/day if a slot opens, complete any
            remaining clearance or intake steps, then remove from waitlist when ready — or save updates
            while keeping them waitlisted.
          </p>

          <section class="lam-section">
            <h4 class="lam-section-title">Waitlist reason</h4>
            <input
              v-model="agency.waitlistReason"
              class="input"
              placeholder="Why are they waitlisted? (optional)"
            />
          </section>

          <section class="lam-section">
            <h4 class="lam-section-title">Assignments</h4>
            <p class="lam-section-hint">
              Optional while waitlisted — note who or which day they are waiting for, or assign when a slot opens.
            </p>
            <div v-if="loadingAssignmentOptions" class="muted">Loading providers…</div>
            <div v-else-if="assignmentOptionsError" class="error">{{ assignmentOptionsError }}</div>
            <div v-else-if="!assignmentProviderOptions.length" class="lam-section-hint warn">
              No providers at this school yet. Open the <strong>Providers</strong> tab → Add Provider.
            </div>
            <div v-else class="lam-assign-grid">
              <div class="lam-assign-field">
                <label :for="providerSelectId">Assign provider</label>
                <select
                  :id="providerSelectId"
                  v-model="assignment.providerUserId"
                  class="input"
                  @change="onAssignmentProviderChange"
                >
                  <option value="">Select provider</option>
                  <option
                    v-for="prov in assignmentProviderOptions"
                    :key="prov.provider_user_id"
                    :value="String(prov.provider_user_id)"
                  >
                    {{ providerOptionLabel(prov) }}
                  </option>
                </select>
              </div>
              <div class="lam-assign-field">
                <label :for="daySelectId">Assign day</label>
                <select
                  :id="daySelectId"
                  v-model="assignment.serviceDay"
                  class="input"
                  :disabled="!assignment.providerUserId"
                >
                  <option value="">Select day</option>
                  <option
                    v-for="day in assignmentDayOptions"
                    :key="day.day_of_week"
                    :value="day.day_of_week"
                  >
                    {{ dayOptionLabel(day) }}
                  </option>
                </select>
              </div>
            </div>
          </section>

          <section v-if="waitlistShowIntake" class="lam-section">
            <h4 class="lam-section-title">Agency intake items</h4>
            <p v-if="agencyDerived.pendingLabels?.length" class="lam-pending-note">
              Still needed: {{ agencyDerived.pendingLabels.join(' · ') }}
            </p>
            <div v-if="agencyDerived.isPaper" class="lam-check-card">
              <label class="lam-check-row">
                <input v-model="agency.paperComplete" type="checkbox" />
                <span class="lam-check-copy">
                  <strong>Paper packet complete</strong>
                </span>
              </label>
            </div>
            <div class="lam-check-card">
              <label class="lam-check-row">
                <input v-model="agency.insuranceReviewed" type="checkbox" />
                <span class="lam-check-copy">
                  <strong>Insurance / eligibility reviewed</strong>
                </span>
              </label>
            </div>
            <div class="lam-check-card">
              <label class="lam-check-row">
                <input v-model="agency.ehrTransferred" type="checkbox" />
                <span class="lam-check-copy">
                  <strong>EHR transfer complete</strong>
                </span>
              </label>
            </div>
          </section>

          <section v-if="waitlistShowClearance" class="lam-section">
            <h4 class="lam-section-title">Clearance</h4>
            <p class="lam-section-hint">Required when removing from waitlist if fall reassignment clearance is still owed.</p>
            <label class="check-row" :class="{ muted: disclosurePrechecked }">
              <input v-model="clearance.disclosureOk" type="checkbox" :disabled="disclosurePrechecked" />
              <span>
                Assigned provider on disclosure (or same provider as last year)
                <template v-if="disclosurePrechecked"> — pre-checked for continuing clients</template>
              </span>
            </label>
            <label class="check-row">
              <input v-model="clearance.insuranceOk" type="checkbox" />
              <span>Insurance / eligibility clear</span>
            </label>
          </section>

          <section class="lam-section">
            <h4 class="lam-section-title">Remove from waitlist</h4>
            <div class="lam-check-card lam-check-card--waitlist">
              <label class="lam-check-row">
                <input
                  v-model="waitlistRemoveFromWaitlist"
                  type="checkbox"
                  :disabled="waitlistClearAllAndMarkActive"
                  @change="onWaitlistRemoveToggle"
                />
                <span class="lam-check-copy">
                  <strong>Remove from waitlist</strong>
                  <span class="lam-check-sub">
                    Check when the barrier is resolved (or no longer applies). Client moves to the appropriate
                    next status — Fall reassignment, Ready to Schedule, or intake in progress.
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section class="lam-section">
            <h4 class="lam-section-title">Override</h4>
            <div class="lam-check-card lam-check-card--force">
              <label class="lam-check-row">
                <input
                  v-model="waitlistClearAllAndMarkActive"
                  type="checkbox"
                  @change="onWaitlistClearAllToggle"
                />
                <span class="lam-check-copy">
                  <strong>Clear all and mark active</strong>
                  <span class="lam-check-sub">
                    Requires provider and day assigned above. Clears waitlist, marks intake and clearance complete,
                    and pushes the client to Ready to Schedule when possible.
                  </span>
                </span>
              </label>
            </div>
          </section>
        </div>

        <!-- Agency clearance (returning) — disclosure + insurance gate Ready to Schedule -->
        <div v-else-if="actionKey === 'agency_clearance'" class="form-grid">
          <p class="hint">
            Ready to Schedule waits on disclosure + insurance only. ROI renewal is tracked separately and does not hold this step.
            Same provider as last year is treated as disclosure-ok automatically.
          </p>
          <label class="check-row" :class="{ muted: disclosurePrechecked }">
            <input v-model="clearance.disclosureOk" type="checkbox" :disabled="disclosurePrechecked" />
            <span>
              Assigned provider on disclosure (or same provider as last year)
              <template v-if="disclosurePrechecked"> — pre-checked for continuing clients</template>
            </span>
          </label>
          <label class="check-row">
            <input v-model="clearance.insuranceOk" type="checkbox" />
            <span>Insurance / eligibility clear</span>
          </label>
        </div>

        <div v-else-if="actionKey === 'roi_followup'" class="form-grid">
          <p class="hint">
            ROI is expired or limited in the system. This does not block Ready to Schedule — it is a follow-up action item
            while school document access stays paused for expired ROIs.
          </p>
          <label class="check-row">
            <input v-model="clearance.roiNoted" type="checkbox" />
            <span>Noted — ROI renewal is in progress / tracked</span>
          </label>
        </div>

        <!-- Spring Update -->
        <div v-else-if="actionKey === 'spring_update'" class="form-grid">
          <div class="form-group">
            <label>Spring outcome</label>
            <select v-model="spring.springOutcome" class="input">
              <option value="">—</option>
              <option value="returning">Returning</option>
              <option value="not_returning">Not Returning</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div v-if="spring.springOutcome === 'returning' || spring.springOutcome === 'unknown'" class="form-group">
            <label>Summer plan (optional notes)</label>
            <textarea v-model="spring.summerNotes" class="input textarea" rows="2" />
            <label style="margin-top: 8px;">Fall plan</label>
            <select v-model="spring.fallPlanKnown" class="input">
              <option value="known">Known</option>
              <option value="unknown">Unknown</option>
            </select>
            <textarea
              v-if="spring.fallPlanKnown === 'known'"
              v-model="spring.fallNotes"
              class="input textarea"
              rows="2"
              placeholder="Fall plan details"
            />
          </div>
        </div>

        <!-- Fall confirmation -->
        <div v-else-if="actionKey === 'fall_confirmation'" class="form-grid">
          <div v-if="needsPriorYearAttest" ref="attestBoxRef" class="form-group attest-box">
            <p class="hint warn" style="margin-bottom: 8px;">
              This client has not been marked as confirmed from last year. Attest that you saw them last year
              to close out the prior year, then complete this fall update.
            </p>
            <label class="check-row">
              <input v-model="fall.attestSawLastYear" type="checkbox" />
              <span>I attest I saw this client last year</span>
            </label>
          </div>
          <div class="form-group">
            <label>Fall confirmation</label>
            <select v-model="fall.fallOutcome" class="input">
              <option value="">—</option>
              <option value="confirmed_returning">Confirmed Returning</option>
              <option value="unable_to_reach">Unable to Reach</option>
              <option value="recommend_termination">Will Not Continue / Recommend Termination</option>
              <option value="other_transfer">Other / Transfer Needed</option>
            </select>
            <p class="hint">
              Confirmed Returning still needs agency insurance clearance after 8/16.
              Through 8/16, continuing clients can move to Ready to Schedule without that insurance block.
            </p>
          </div>

          <div v-if="fall.fallOutcome === 'confirmed_returning'" class="form-group">
            <label>Assigned day</label>
            <p class="hint">Only days on your work schedule at this school are shown, with hours and open slots.</p>
            <div v-if="loadingWorkDays" class="muted">Loading your schedule days…</div>
            <div v-else-if="workDaysError" class="error">{{ workDaysError }}</div>
            <div v-else-if="!selectableDays.length" class="error">
              No work days on your schedule at this school yet. Confirm your days and hours in Provider Schedule first.
            </div>
            <div v-else class="day-grid" role="group" aria-label="Assigned days of the week">
              <button
                v-for="day in selectableDays"
                :key="day.day_of_week"
                type="button"
                class="day-chip"
                :class="{ active: isDaySelected(day.day_of_week) }"
                :title="dayTitle(day)"
                @click="toggleWorkDay(day.day_of_week)"
              >
                <span class="day-short">{{ shortDay(day.day_of_week) }}</span>
                <span v-if="dayHours(day)" class="day-meta">{{ dayHours(day) }}</span>
                <span v-if="daySlots(day)" class="day-slots">{{ daySlots(day) }}</span>
              </button>
            </div>
          </div>

          <div v-if="fall.fallOutcome === 'unable_to_reach'" class="form-group">
            <label>Number of contact attempts</label>
            <input v-model.number="fall.contactAttempts" type="number" min="1" max="99" class="input" />
          </div>

          <div v-if="fall.fallOutcome === 'other_transfer'" class="form-group">
            <label>Other reason</label>
            <select v-model="fall.otherReasonKey" class="input">
              <option value="">—</option>
              <option value="patient_discontinued_services">Patient Discontinued Services with Provider</option>
              <option value="custom">Other (private note — not shown to school)</option>
            </select>
          </div>

          <div v-if="fall.fallOutcome && fall.fallOutcome !== 'confirmed_returning'" class="form-group">
            <label>Private comment (admin/support)</label>
            <textarea v-model="fall.privateComment" class="input textarea" rows="3" required />
            <label class="check-row">
              <input v-model="fall.supportFollowUp" type="checkbox" />
              <span>Request support follow-up ticket (only creates a ticket if checked)</span>
            </label>
            <label class="check-row">
              <input v-model="fall.removeFromAssignment" type="checkbox" />
              <span>Remove from my assignment</span>
            </label>
          </div>

          <div v-if="fall.fallOutcome === 'other_transfer'" class="form-group">
            <label class="check-row">
              <input v-model="fall.recommendTerminate" type="checkbox" />
              <span>Recommend / initiate termination</span>
            </label>
          </div>

          <div
            v-if="fall.fallOutcome === 'recommend_termination' || (fall.fallOutcome === 'other_transfer' && fall.recommendTerminate)"
            class="form-group"
          >
            <label>Termination note (school staff can see this on hover)</label>
            <textarea
              v-model="fall.schoolVisibleNote"
              class="input textarea"
              rows="2"
              placeholder="Shown to school staff when they hover Terminated"
            />
            <p class="hint warn">
              School staff will see this termination note when they hover the Terminated status.
            </p>
          </div>
        </div>

        <!-- Confirm returning client is being seen -->
        <div v-else-if="actionKey === 'confirm_services_started'" class="form-grid">
          <p class="hint">
            This returning client is on the schedule. Confirm you are seeing them this year to mark status as Being Seen.
          </p>
          <div class="form-group">
            <label>Date being seen (this year)</label>
            <div class="input-with-today">
              <input v-model="services.serviceDate" type="date" class="input" />
              <button type="button" class="btn-today" @click="services.serviceDate = todayYmd()">Today</button>
            </div>
          </div>
        </div>

        <div v-else class="muted">No action available.</div>
      </fieldset>
      </div>
      <div ref="modalFooterRef" class="modal-footer">
        <div v-if="saveError" class="error save-error">{{ saveError }}</div>
        <div class="actions">
          <button v-if="!viewOnly" class="btn btn-primary" type="button" :disabled="saving || loading" @click="save">
            {{ saving ? 'Saving…' : saveButtonLabel }}
          </button>
          <button class="btn btn-secondary" type="button" :disabled="saving" @click="$emit('close')">
            {{ viewOnly ? 'Close' : 'Cancel' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { needsFallReassignmentClearance } from '../../utils/schoolClientStatusDisplay.js';

const props = defineProps({
  client: { type: Object, required: true },
  actionKey: { type: String, required: true },
  actionLabel: { type: String, default: '' },
  viewOnly: { type: Boolean, default: false },
  schoolYear: { type: String, default: '' },
  apiBase: { type: String, default: '' },
  actorUserId: { type: [Number, String], default: 0 }
});
const emit = defineEmits(['close', 'saved']);
const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const saveError = ref('');
const modalFooterRef = ref(null);
const attestBoxRef = ref(null);
const workDays = ref([]);
const loadingWorkDays = ref(false);
const workDaysError = ref('');

const agency = reactive({
  paperComplete: false,
  missingItemsText: '',
  insuranceReviewed: false,
  ehrTransferred: false,
  waitlisted: false,
  waitlistReason: ''
});
const agencyDerived = reactive({
  packetType: '',
  packetTypeLabel: '',
  isPaper: false,
  hasProvider: false,
  providerLabel: '',
  providerUserIds: [],
  agencyIntakeComplete: false,
  pendingLabels: []
});
const assignment = reactive({
  providerUserId: '',
  serviceDay: ''
});
const assignmentProviders = ref([]);
const loadingAssignmentOptions = ref(false);
const assignmentOptionsError = ref('');
const providerSelectId = `lam-provider-${Math.random().toString(36).slice(2, 9)}`;
const daySelectId = `lam-day-${Math.random().toString(36).slice(2, 9)}`;
const clearance = reactive({
  disclosureOk: false,
  insuranceOk: false,
  roiNoted: false
});
const spring = reactive({
  springOutcome: '',
  summerNotes: '',
  fallPlanKnown: 'unknown',
  fallNotes: ''
});
const fall = reactive({
  fallOutcome: '',
  privateComment: '',
  supportFollowUp: false,
  removeFromAssignment: false,
  contactAttempts: 1,
  otherReasonKey: '',
  recommendTerminate: false,
  schoolVisibleNote: '',
  attestSawLastYear: false,
  serviceDays: []
});
const services = reactive({ serviceDate: '' });
const waitlistRemoveFromWaitlist = ref(false);
const waitlistClearAllAndMarkActive = ref(false);

const hasWaitlistAssignmentSelection = computed(() => {
  const pid = Number(assignment.providerUserId || 0);
  const day = String(assignment.serviceDay || '').trim();
  if (pid && day && day.toLowerCase() !== 'unknown') return true;
  const existingDay = String(props.client?.service_day || '').trim();
  const hasDay = existingDay
    && existingDay.toLowerCase() !== 'unknown'
    && /(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(existingDay);
  const hasProvider = Number(props.client?.provider_id) > 0
    || String(props.client?.provider_ids || '').split(',').some((s) => parseInt(s, 10) > 0)
    || !!String(props.client?.provider_name || '').trim();
  return hasProvider && hasDay;
});

const waitlistClientShape = computed(() => ({
  client_type: 'school',
  organization_id: props.client?.organization_id,
  client_status_key: props.client?.client_status_key,
  fall_outcome: props.client?.fall_outcome,
  fall_completed_at: props.client?.fall_completed_at,
  fall_remove_from_assignment: props.client?.fall_remove_from_assignment,
  agency_cleared_at: props.client?.agency_cleared_at
}));
const waitlistShowClearance = computed(() => needsFallReassignmentClearance(waitlistClientShape.value));
const waitlistShowIntake = computed(() => {
  if (agencyDerived.agencyIntakeComplete) return false;
  if (agencyDerived.pendingLabels?.length) return true;
  const key = String(props.client?.client_status_key || '').toLowerCase();
  return ['received', 'packet', 'pending_corrections', 'in_process'].includes(key) || !!props.client?.agency_intake_json;
});
const isWaitlistAssignmentMode = computed(() => {
  if (props.actionKey === 'waitlist_resolution') return true;
  if (props.actionKey === 'fall_reassignment' && agency.waitlisted) return true;
  return String(props.client?.client_status_key || '').toLowerCase() === 'waitlist';
});

const isFallUpdate = computed(() =>
  props.actionKey === 'fall_confirmation'
  && (!!props.client?.fall_completed_at || String(props.actionLabel || '').toLowerCase() === 'update')
);
const title = computed(() => {
  if (props.viewOnly) {
    if (props.actionKey === 'fall_confirmation') return 'View fall confirmation';
    if (props.actionKey === 'spring_update') return 'View spring update';
    if (props.actionKey === 'agency_intake') return 'View agency action items';
    return props.actionLabel || 'View submission';
  }
  if (props.actionKey === 'fall_confirmation' && isFallUpdate.value) {
    return props.actionLabel || 'Update fall confirmation';
  }
  if (props.actionKey === 'agency_intake') {
    return props.actionLabel || 'Complete agency action items';
  }
  if (props.actionKey === 'fall_reassignment') {
    return props.actionLabel || 'Fall reassignment – Action Needed';
  }
  if (props.actionKey === 'waitlist_resolution') {
    return props.actionLabel || 'Waitlist – Action Needed';
  }
  return props.actionLabel || 'Next Step';
});
const saveButtonLabel = computed(() => {
  if (props.actionKey === 'agency_intake') return 'Save updates';
  if (isFallUpdate.value) return 'Update';
  if (props.actionKey === 'waitlist_resolution' && waitlistClearAllAndMarkActive.value) {
    return 'Clear all and mark active';
  }
  return 'Save';
});
const schoolOrganizationId = computed(() => Number(props.client?.organization_id || 0));
const assignedDayLabel = computed(() => {
  const day = String(props.client?.service_day || '').trim();
  if (day && day.toLowerCase() !== 'unknown') return day;
  const pairs = String(props.client?.provider_day_pairs || '');
  const match = pairs.match(/:(Monday|Tuesday|Wednesday|Thursday|Friday)/i);
  if (match?.[1]) return match[1];
  return 'Not yet assigned';
});
const assignmentProviderOptions = computed(() => assignmentProviders.value || []);
const assignmentDayOptions = computed(() => {
  const pid = Number(assignment.providerUserId || 0);
  if (!pid) return [];
  const prov = assignmentProviderOptions.value.find((p) => Number(p.provider_user_id) === pid);
  const assignedDay = String(assignment.serviceDay || assignedDayLabel.value || '');
  const days = prov?.days || [];
  if (isWaitlistAssignmentMode.value) {
    return days.filter((d) => String(d.day_of_week || ''));
  }
  return days.filter((d) => {
    const day = String(d.day_of_week || '');
    if (assignedDay && day === assignedDay) return true;
    const avail = d.slots_available;
    if (avail == null) return false;
    return Number(avail) > 0;
  });
});

function providerOptionLabel(prov) {
  const name = [prov?.first_name, prov?.last_name].filter(Boolean).join(' ').trim();
  const allDays = (prov?.days || []).filter((d) => String(d.day_of_week || ''));
  const openDays = allDays.filter((d) => {
    const avail = d.slots_available;
    return avail == null || Number(avail) > 0;
  }).length;
  if (isWaitlistAssignmentMode.value) {
    if (prov?.schedule_inactive && !allDays.length) {
      return `${name || `Provider ${prov?.provider_user_id}`} (schedule inactive — add day in Providers tab)`;
    }
    if (!allDays.length) {
      return `${name || `Provider ${prov?.provider_user_id}`} (no schedule days)`;
    }
    if (!openDays) {
      return `${name || `Provider ${prov?.provider_user_id}`} (no slots remaining)`;
    }
    return `${name || `Provider ${prov?.provider_user_id}`} (${openDays} day${openDays === 1 ? '' : 's'} with slots)`;
  }
  if (prov?.schedule_inactive && !openDays) {
    return `${name || `Provider ${prov?.provider_user_id}`} (schedule inactive — add day in Providers tab)`;
  }
  const suffix = openDays ? ` (${openDays} day${openDays === 1 ? '' : 's'} open)` : ' (no slots remaining)';
  return `${name || `Provider ${prov?.provider_user_id}`}${suffix}`;
}

function dayOptionLabel(day) {
  const label = String(day?.day_of_week || '');
  const hours = dayHours(day);
  const avail = day?.slots_available;
  if (isWaitlistAssignmentMode.value) {
    if (avail != null && Number(avail) <= 0) {
      return `${label}${hours ? ` (${hours})` : ''} · no slots remaining (+1 waitlist)`;
    }
    const open = avail == null ? '' : ` · ${avail} slot${Number(avail) === 1 ? '' : 's'} remaining`;
    return `${label}${hours ? ` (${hours})` : ''}${open}`;
  }
  const open = avail == null ? '' : ` · ${avail} open`;
  return `${label}${hours ? ` (${hours})` : ''}${open}`;
}

function onAssignmentProviderChange() {
  const allowed = new Set(assignmentDayOptions.value.map((d) => String(d.day_of_week)));
  if (assignment.serviceDay && !allowed.has(String(assignment.serviceDay))) {
    assignment.serviceDay = '';
  }
}

function onWaitlistToggle() {
  if (agency.waitlisted) return;
  // Keep selections when un-waitlisting so staff can finish assignment.
}

function onWaitlistClearAllToggle() {
  if (waitlistClearAllAndMarkActive.value) {
    waitlistRemoveFromWaitlist.value = true;
    clearance.disclosureOk = true;
    clearance.insuranceOk = true;
    agency.insuranceReviewed = true;
    agency.ehrTransferred = true;
    if (agencyDerived.isPaper) agency.paperComplete = true;
  }
}

function onWaitlistRemoveToggle() {
  if (waitlistRemoveFromWaitlist.value) {
    waitlistClearAllAndMarkActive.value = false;
  }
}

async function loadAssignmentOptions() {
  const orgId = schoolOrganizationId.value;
  if (!orgId) {
    assignmentProviders.value = [];
    assignmentOptionsError.value = 'School context missing — cannot load providers.';
    return;
  }
  loadingAssignmentOptions.value = true;
  assignmentOptionsError.value = '';
  try {
    const r = await api.get(`/school-portal/${orgId}/providers/scheduling`, { skipGlobalLoading: true });
    const list = Array.isArray(r.data) ? r.data : [];
    assignmentProviders.value = list
      .map((prov) => {
        const days = (Array.isArray(prov?.assignments) ? prov.assignments : [])
          .map((a) => ({
            day_of_week: String(a.day_of_week || ''),
            slots_available: a.slots_available_calculated ?? a.slots_available,
            slots_total: a.slots_total,
            waitlist_holds: Number(a.waitlist_holds || 0),
            start_time: a.start_time || null,
            end_time: a.end_time || null,
            is_active: a.is_active !== false
          }))
          .filter((d) => {
            if (!d.day_of_week) return false;
            if (isWaitlistAssignmentMode.value) return d.is_active !== false;
            const avail = d.slots_available;
            if (avail == null) return d.is_active === false;
            return Number(avail) > 0;
          });
        return {
          provider_user_id: Number(prov.provider_user_id),
          first_name: prov.first_name || '',
          last_name: prov.last_name || '',
          schedule_inactive: !!prov.schedule_inactive,
          days
        };
      })
      .filter((p) => p.provider_user_id)
      .sort((a, b) =>
        String(a?.last_name || '').localeCompare(String(b?.last_name || ''))
        || String(a?.first_name || '').localeCompare(String(b?.first_name || ''))
      );
    if (!assignmentProviders.value.length) {
      assignmentOptionsError.value = 'No providers affiliated with this school yet. Add a provider from the Providers tab first.';
    }
    syncAssignmentSelections();
  } catch (e) {
    assignmentProviders.value = [];
    assignmentOptionsError.value = e?.response?.data?.error?.message || 'Failed to load school providers';
  } finally {
    loadingAssignmentOptions.value = false;
  }
}

function syncAssignmentSelections() {
  const currentProvider = Number(assignment.providerUserId || 0);
  const hintIds = [
    Number(props.client?.provider_id || 0),
    ...(Array.isArray(agencyDerived.providerUserIds) ? agencyDerived.providerUserIds : [])
  ].filter((n) => n > 0);
  if (!currentProvider && hintIds.length) {
    const match = hintIds.find((id) => assignmentProviderOptions.value.some((p) => Number(p.provider_user_id) === id));
    if (match) assignment.providerUserId = String(match);
  }
  const day = String(props.client?.service_day || '').trim();
  if (!assignment.serviceDay && day && day.toLowerCase() !== 'unknown') {
    assignment.serviceDay = day;
  }
  onAssignmentProviderChange();
}

async function saveAgencyAssignments(clientId) {
  const orgId = schoolOrganizationId.value;
  const providerId = Number(assignment.providerUserId || 0);
  const serviceDay = String(assignment.serviceDay || '').trim();
  if (!orgId || !providerId) return;

  if (serviceDay) {
    await api.post(
      `/school-portal/${orgId}/clients/${clientId}/assigned-day`,
      { providerUserId: providerId, serviceDay, assigned: true },
      { skipGlobalLoading: true }
    );
    return;
  }

  await api.post(`/clients/${clientId}/provider-assignments`, {
    organization_id: orgId,
    provider_user_id: providerId,
    service_day: 'Unknown',
    is_primary: true
  });
}
const clientId = computed(() => Number(props.client?.id || 0));
const actorId = computed(() => Number(props.actorUserId || authStore.user?.id || 0));
function reqOpts(extra = {}) {
  return props.apiBase
    ? { skipAuthRedirect: true, skipGlobalLoading: true, ...extra }
    : extra;
}
function clientApiPath(suffix) {
  const id = clientId.value;
  if (props.apiBase) return `${props.apiBase}/clients/${id}${suffix}`;
  return `/clients/${id}${suffix}`;
}
const disclosurePrechecked = computed(() => {
  const key = String(props.client?.client_status_key || '').toLowerCase();
  const newIntake = ['received', 'packet', 'pending_corrections', 'in_process', 'screener', 'ready_to_schedule'].includes(key);
  return !newIntake && String(props.client?.client_type || 'school').toLowerCase() === 'school';
});
const needsPriorYearAttest = computed(() => {
  const key = String(props.client?.client_status_key || '').toLowerCase();
  if (['ready_to_schedule', 'received', 'packet', 'screener', 'terminated'].includes(key)) return false;
  return !props.client?.parents_contacted_at || !(props.client?.first_service_at || props.client?.services_started_at);
});
const selectableDays = computed(() =>
  (Array.isArray(workDays.value) ? workDays.value : []).filter((d) => d?.day_of_week)
);

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDay(day) {
  const map = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' };
  return map[String(day)] || String(day || '').slice(0, 3);
}

function formatTime(t) {
  const s = String(t || '').slice(0, 8);
  const m = s.match(/^(\d{2}):(\d{2})/);
  if (!m) return '';
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${mm} ${ampm}`;
}

function dayHours(day) {
  const a = formatTime(day?.start_time);
  const b = formatTime(day?.end_time);
  if (a && b) return `${a}–${b}`;
  return '';
}

function daySlots(day) {
  if (day?.slots_available == null && day?.slots_total == null) return '';
  const open = day?.slots_available == null ? null : Number(day.slots_available);
  const total = day?.slots_total == null ? null : Number(day.slots_total);
  if (open != null && total != null) return `${open} of ${total} slots open`;
  if (open != null) return `${open} slot${open === 1 ? '' : 's'} open`;
  return '';
}

function dayTitle(day) {
  const hours = dayHours(day);
  const slots = daySlots(day);
  return [day?.day_of_week, hours, slots].filter(Boolean).join(' · ');
}

function isDaySelected(day) {
  return (fall.serviceDays || []).includes(String(day));
}

function toggleWorkDay(day) {
  const d = String(day || '');
  if (!d) return;
  if (!selectableDays.value.some((item) => String(item.day_of_week) === d)) return;
  const current = Array.isArray(fall.serviceDays) ? [...fall.serviceDays] : [];
  const idx = current.indexOf(d);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(d);
  fall.serviceDays = current;
}

async function fetchWorkDays() {
  const orgId = Number(props.client?.organization_id || 0);
  const cid = clientId.value;
  const providerId = actorId.value;
  if (!orgId || !cid || !providerId) {
    workDays.value = [];
    return;
  }
  loadingWorkDays.value = true;
  workDaysError.value = '';
  try {
    const r = props.apiBase
      ? await api.get(`${props.apiBase}/clients/${cid}/day-assignment-context`, {
          params: { providerUserId: providerId, schoolId: orgId },
          ...reqOpts()
        })
      : await api.get(`/school-portal/${orgId}/clients/${cid}/day-assignment-context`, {
          params: { providerUserId: providerId },
          skipGlobalLoading: true
        });
    const providers = Array.isArray(r.data?.providers) ? r.data.providers : [];
    const match = providers.find((p) => Number(p.provider_user_id) === providerId);
    workDays.value = Array.isArray(match?.work_days)
      ? match.work_days
      : (Array.isArray(r.data?.work_days) ? r.data.work_days : []);
    const assigned = Array.isArray(match?.assigned_days)
      ? match.assigned_days
      : (Array.isArray(r.data?.assigned_days) ? r.data.assigned_days : []);
    const allowed = new Set(workDays.value.map((d) => String(d?.day_of_week || '')));
    if (assigned.length && !fall.serviceDays.length) {
      fall.serviceDays = assigned.filter((d) => allowed.has(String(d)));
    }
  } catch (e) {
    workDays.value = [];
    workDaysError.value = e?.response?.data?.error?.message || 'Could not load schedule days';
  } finally {
    loadingWorkDays.value = false;
  }
}

async function assignFallDays() {
  const orgId = Number(props.client?.organization_id || 0);
  const cid = clientId.value;
  const providerId = actorId.value;
  const days = fall.serviceDays || [];
  if (!cid || !providerId || !days.length) return;
  for (const serviceDay of days) {
    if (props.apiBase) {
      await api.post(
        `${props.apiBase}/clients/${cid}/assigned-day`,
        { providerUserId: providerId, serviceDay, assigned: true, schoolId: orgId },
        reqOpts()
      );
    } else if (orgId) {
      await api.post(
        `/school-portal/${orgId}/clients/${cid}/assigned-day`,
        { providerUserId: providerId, serviceDay, assigned: true },
        { skipGlobalLoading: true }
      );
    }
  }
}

onMounted(async () => {
  if (!clientId.value) return;
  if (props.actionKey === 'agency_clearance' && disclosurePrechecked.value) {
    clearance.disclosureOk = true;
  }
  if (props.actionKey === 'fall_reassignment') {
    if (disclosurePrechecked.value) clearance.disclosureOk = true;
    loading.value = true;
    try {
      await loadAssignmentOptions();
      syncAssignmentSelections();
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to load reassignment options';
    } finally {
      loading.value = false;
    }
  }
  if (props.actionKey === 'waitlist_resolution') {
    if (disclosurePrechecked.value) clearance.disclosureOk = true;
    loading.value = true;
    try {
      const orgId = schoolOrganizationId.value;
      if (orgId) {
        try {
          const { data: noteData } = await api.get(
            `/school-portal/${orgId}/clients/${clientId.value}/waitlist-note`,
            { skipGlobalLoading: true }
          );
          agency.waitlistReason = String(noteData?.message || noteData?.note || '').trim();
        } catch {
          // ignore missing note
        }
      }
      try {
        const { data } = await api.get(`/clients/${clientId.value}/agency-intake`);
        const intake = data?.intake || {};
        const derived = data?.derived || {};
        agencyDerived.packetType = derived.packetType || intake.packetType || '';
        agencyDerived.packetTypeLabel = derived.packetTypeLabel || '';
        agencyDerived.isPaper = !!derived.isPaper;
        agencyDerived.hasProvider = !!derived.hasProvider;
        agencyDerived.providerLabel = derived.providerLabel || '';
        agencyDerived.agencyIntakeComplete = !!derived.agencyIntakeComplete;
        agencyDerived.pendingLabels = Array.isArray(derived.pendingLabels) ? derived.pendingLabels : [];
        agency.paperComplete = derived.paperComplete === true || intake.paperComplete === true;
        agency.insuranceReviewed = !!intake.insuranceReviewed;
        agency.ehrTransferred = !!intake.ehrTransferred;
        if (!agency.waitlistReason) agency.waitlistReason = intake.waitlistReason || '';
      } catch {
        // intake optional for returning-client waitlists
      }
      await loadAssignmentOptions();
      syncAssignmentSelections();
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to load waitlist details';
    } finally {
      loading.value = false;
    }
  }
  if (props.actionKey === 'agency_intake') {
    loading.value = true;
    try {
      const { data } = await api.get(`/clients/${clientId.value}/agency-intake`);
      const intake = data?.intake || {};
      const derived = data?.derived || {};
      agencyDerived.packetType = derived.packetType || intake.packetType || '';
      agencyDerived.packetTypeLabel = derived.packetTypeLabel || '';
      agencyDerived.isPaper = !!derived.isPaper;
      agencyDerived.hasProvider = !!derived.hasProvider;
      agencyDerived.providerLabel = derived.providerLabel || '';
      agencyDerived.providerUserIds = String(props.client?.provider_ids || '')
        .split(',')
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      agencyDerived.agencyIntakeComplete = !!derived.agencyIntakeComplete;
      agencyDerived.pendingLabels = Array.isArray(derived.pendingLabels) ? derived.pendingLabels : [];
      agency.paperComplete = derived.paperComplete === true || intake.paperComplete === true;
      agency.missingItemsText = Array.isArray(intake.missingItems) ? intake.missingItems.join('\n') : '';
      agency.insuranceReviewed = !!intake.insuranceReviewed;
      agency.ehrTransferred = !!intake.ehrTransferred;
      agency.waitlisted = !!derived.waitlisted || String(data?.clientStatusKey || '').toLowerCase() === 'waitlist';
      agency.waitlistReason = intake.waitlistReason || '';
      await loadAssignmentOptions();
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to load agency intake';
    } finally {
      loading.value = false;
    }
  }
  if (props.actionKey === 'confirm_services_started') {
    services.serviceDate = todayYmd();
  }
  if (props.actionKey === 'fall_confirmation') {
    const prior = String(props.client?.fall_outcome || '').trim();
    if (prior && !fall.fallOutcome) fall.fallOutcome = prior;
    fetchWorkDays();
    loading.value = true;
    try {
      const params = {};
      if (props.schoolYear) params.schoolYear = props.schoolYear;
      const { data } = await api.get(clientApiPath('/year-disposition'), {
        params,
        ...reqOpts()
      });
      const disp = data?.disposition || {};
      if (disp.fall_outcome) fall.fallOutcome = disp.fall_outcome;
      if (disp.fall_comment) fall.privateComment = disp.fall_comment;
      fall.supportFollowUp = !!(disp.fall_support_follow_up === 1 || disp.fall_support_follow_up === true);
      fall.removeFromAssignment = !!(disp.fall_remove_from_assignment === 1 || disp.fall_remove_from_assignment === true);
    } catch {
      // keep roster preload
    } finally {
      loading.value = false;
    }
  }
  if (props.actionKey === 'spring_update') {
    loading.value = true;
    try {
      const params = {};
      if (props.schoolYear) params.schoolYear = props.schoolYear;
      const { data } = await api.get(clientApiPath('/year-disposition'), {
        params,
        ...reqOpts()
      });
      const disp = data?.disposition || {};
      spring.springOutcome = disp.spring_outcome || '';
      const summer = typeof disp.summer_plan_json === 'string'
        ? JSON.parse(disp.summer_plan_json || '{}')
        : (disp.summer_plan_json || {});
      const fallPlan = typeof disp.fall_plan_json === 'string'
        ? JSON.parse(disp.fall_plan_json || '{}')
        : (disp.fall_plan_json || {});
      spring.summerNotes = summer.notes || summer.summerNotes || '';
      const known = fallPlan.known === true || fallPlan.known === 'known' || fallPlan.status === 'known';
      spring.fallPlanKnown = known ? 'known' : 'unknown';
      spring.fallNotes = fallPlan.notes || fallPlan.fallNotes || '';
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to load spring update';
    } finally {
      loading.value = false;
    }
  }
});

watch(
  () => fall.fallOutcome,
  (outcome) => {
    if (outcome === 'confirmed_returning') fetchWorkDays();
  }
);

async function revealSaveError(message, { focusAttest = false } = {}) {
  saveError.value = message;
  await nextTick();
  if (focusAttest && attestBoxRef.value) {
    attestBoxRef.value.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  modalFooterRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function save() {
  saveError.value = '';
  saving.value = true;
  try {
    const id = clientId.value;
    if (props.actionKey === 'agency_intake') {
      if (
        !agency.waitlisted
        && !agencyDerived.hasProvider
        && !Number(assignment.providerUserId || 0)
      ) {
        await revealSaveError('Select a provider, assign a day, or mark waitlist before saving.');
        return;
      }
      if (Number(assignment.providerUserId || 0)) {
        await saveAgencyAssignments(id);
      }
      await api.put(`/clients/${id}/agency-intake`, {
        paperComplete: agencyDerived.isPaper ? !!agency.paperComplete : true,
        missingItems: String(agency.missingItemsText || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        insuranceReviewed: !!agency.insuranceReviewed,
        ehrTransferred: !!agency.ehrTransferred,
        waitlisted: !!agency.waitlisted,
        waitlistReason: agency.waitlistReason || ''
      });
    } else if (props.actionKey === 'fall_reassignment') {
      if (agency.waitlisted) {
        if (Number(assignment.providerUserId || 0)) {
          await saveAgencyAssignments(id);
        }
        await api.put(`/clients/${id}/fall-reassignment`, {
          waitlisted: true,
          waitlistReason: agency.waitlistReason || ''
        });
      } else {
        if (!Number(assignment.providerUserId || 0) || !String(assignment.serviceDay || '').trim()) {
          await revealSaveError('Select a provider and assign a day, or mark waitlist before saving.');
          return;
        }
        if (!clearance.disclosureOk || !clearance.insuranceOk) {
          await revealSaveError('Disclosure and insurance checks are required');
          return;
        }
        await saveAgencyAssignments(id);
        await api.put(`/clients/${id}/agency-clearance`, {
          clearance: {
            disclosureOk: !!clearance.disclosureOk,
            insuranceOk: !!clearance.insuranceOk
          }
        });
      }
    } else if (props.actionKey === 'waitlist_resolution') {
      if (waitlistClearAllAndMarkActive.value) {
        if (!hasWaitlistAssignmentSelection.value) {
          await revealSaveError('Select a provider and assign a day before using Clear all and mark active.');
          return;
        }
        await saveAgencyAssignments(id);
        await api.put(`/clients/${id}/waitlist-resolution`, {
          waitlistReason: agency.waitlistReason || '',
          removeFromWaitlist: true,
          clearAllAndMarkActive: true
        });
      } else {
        if (waitlistRemoveFromWaitlist.value && waitlistShowClearance.value) {
          if (!clearance.disclosureOk || !clearance.insuranceOk) {
            await revealSaveError('Disclosure and insurance checks are required when removing from waitlist with fall reassignment still owed.');
            return;
          }
        }
        if (Number(assignment.providerUserId || 0)) {
          await saveAgencyAssignments(id);
        }
        const intakePatch = waitlistShowIntake.value
          ? {
              insuranceReviewed: !!agency.insuranceReviewed,
              ehrTransferred: !!agency.ehrTransferred,
              paperComplete: agencyDerived.isPaper ? !!agency.paperComplete : undefined,
              missingItems: String(agency.missingItemsText || '')
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            }
          : null;
        await api.put(`/clients/${id}/waitlist-resolution`, {
          waitlistReason: agency.waitlistReason || '',
          removeFromWaitlist: !!waitlistRemoveFromWaitlist.value,
          clearance: waitlistShowClearance.value
            ? { disclosureOk: !!clearance.disclosureOk, insuranceOk: !!clearance.insuranceOk }
            : null,
          intake: intakePatch
        });
      }
    } else if (props.actionKey === 'agency_clearance') {
      if (!clearance.disclosureOk || !clearance.insuranceOk) {
        await revealSaveError('Disclosure and insurance checks are required');
        return;
      }
      await api.put(`/clients/${id}/agency-clearance`, {
        clearance: {
          disclosureOk: !!clearance.disclosureOk,
          insuranceOk: !!clearance.insuranceOk
        }
      });
    } else if (props.actionKey === 'roi_followup') {
      if (!clearance.roiNoted) {
        await revealSaveError('Mark ROI noted to dismiss this action item');
        return;
      }
      await api.put(`/clients/${id}/roi-followup`, {});
    } else if (props.actionKey === 'spring_update') {
      await api.put(clientApiPath('/spring-update'), {
        springOutcome: spring.springOutcome,
        summerPlan: { notes: spring.summerNotes || '' },
        fallPlan: {
          known: spring.fallPlanKnown === 'known',
          notes: spring.fallNotes || ''
        }
      }, reqOpts());
    } else if (props.actionKey === 'fall_confirmation') {
      if (!fall.fallOutcome) {
        await revealSaveError('Select a fall confirmation outcome');
        return;
      }
      if (needsPriorYearAttest.value && !fall.attestSawLastYear) {
        await revealSaveError(
          'Check the box above to attest you saw this client last year, then save again.',
          { focusAttest: true }
        );
        return;
      }
      if (fall.fallOutcome !== 'confirmed_returning' && !String(fall.privateComment || '').trim()) {
        await revealSaveError('A private comment for admin/support is required');
        return;
      }
      if (fall.fallOutcome === 'confirmed_returning' && !(fall.serviceDays || []).length) {
        await revealSaveError(
          selectableDays.value.length
            ? 'Select at least one assigned day'
            : 'No work days on your schedule at this school. Confirm your days in Provider Schedule first.'
        );
        return;
      }
      if (fall.fallOutcome === 'unable_to_reach' && !(Number(fall.contactAttempts) > 0)) {
        await revealSaveError('Enter how many contact attempts were made');
        return;
      }
      if (fall.fallOutcome === 'other_transfer' && !fall.otherReasonKey) {
        await revealSaveError('Select an other reason');
        return;
      }
      const recommendTerminate =
        fall.fallOutcome === 'recommend_termination' || !!fall.recommendTerminate;
      if (fall.fallOutcome === 'confirmed_returning') {
        await assignFallDays();
      }
      await api.put(clientApiPath('/fall-confirmation'), {
        fallOutcome: fall.fallOutcome,
        privateComment: fall.privateComment,
        supportFollowUp: !!fall.supportFollowUp,
        removeFromAssignment: !!fall.removeFromAssignment || recommendTerminate,
        recommendTerminate,
        contactAttempts: fall.fallOutcome === 'unable_to_reach' ? Number(fall.contactAttempts) : null,
        otherReasonKey: fall.fallOutcome === 'other_transfer' ? fall.otherReasonKey : null,
        schoolVisibleNote: recommendTerminate ? String(fall.schoolVisibleNote || '').trim() : null,
        attestSawLastYear: !!fall.attestSawLastYear,
        serviceDays: fall.serviceDays || []
      }, reqOpts());
    } else if (props.actionKey === 'confirm_services_started') {
      await api.post(`/clients/${id}/confirm-services-started`, {
        serviceDate: services.serviceDate || todayYmd()
      });
    }
    emit('saved');
    emit('close');
  } catch (e) {
    await revealSaveError(e.response?.data?.error?.message || e.message || 'Save failed');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12000;
  padding: 16px;
}
.modal {
  background: #fff;
  border-radius: 12px;
  width: min(620px, 100%);
  max-height: min(90vh, calc(100dvh - 32px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.modal-body {
  padding: 16px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.modal-footer {
  flex-shrink: 0;
  padding: 12px 16px 16px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
}
.save-error {
  margin: 0 0 10px;
}
.form-grid { display: grid; gap: 12px; }
.form-group { display: grid; gap: 6px; }
.input, .textarea {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.check-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
}
.hint { font-size: 12px; color: #6b7280; margin: 0; }
.hint.warn { color: #92400e; }
.error { color: #b91c1c; font-size: 13px; }
.muted { color: #6b7280; }
.actions { display: flex; gap: 8px; }
.input-with-today { display: flex; gap: 8px; align-items: center; }
.btn-today {
  border: 1px solid #d1d5db;
  background: #f9fafb;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
}
.day-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.day-chip {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 108px;
}
.day-chip.active {
  border-color: var(--primary, #2f6f4e);
  background: rgba(47, 111, 78, 0.12);
  font-weight: 700;
}
.day-short { font-weight: 700; }
.day-meta, .day-slots {
  font-size: 11px;
  font-weight: 500;
  color: #4b5563;
}
.attest-box {
  padding: 10px 12px;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  background: #fffbeb;
}
.status-card {
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
  display: grid;
  gap: 8px;
}
.status-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  font-size: 14px;
}
.status-label {
  color: #4b5563;
  font-weight: 600;
}
.status-value {
  color: #111827;
  text-align: right;
}
.status-value.ok { color: #166534; font-weight: 600; }
.status-value.pending { color: #92400e; font-weight: 600; }
.lam-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}

/* Agency action items modal */
.lam-agency {
  display: grid;
  gap: 18px;
}
.lam-status-list {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f8fafc;
}
.lam-status-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lam-status-icon {
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}
.lam-status-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.lam-status-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.lam-status-pill {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
  white-space: nowrap;
}
.lam-status-pill.ok {
  background: #dcfce7;
  color: #166534;
}
.lam-status-pill.pending {
  background: #fef3c7;
  color: #92400e;
}
.lam-status-pill.warn {
  background: #fee2e2;
  color: #b91c1c;
}
.lam-status-pill.waitlist {
  background: #ede9fe;
  color: #5b21b6;
}
.lam-status-pill.neutral {
  background: #f3f4f6;
  color: #6b7280;
}
.lam-pending-note {
  margin: 0;
  font-size: 12px;
  color: #92400e;
}
.lam-section {
  display: grid;
  gap: 10px;
}
.lam-section--muted {
  opacity: 0.92;
}
.lam-section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #111827;
}
.lam-section-hint {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.45;
}
.lam-section-hint.warn {
  color: #92400e;
}
.lam-check-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff;
  display: grid;
  gap: 8px;
}
.lam-check-card--waitlist {
  border-color: #ddd6fe;
  background: #faf5ff;
}
.lam-check-card--force {
  border-color: #fcd34d;
  background: #fffbeb;
}
.lam-check-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  cursor: pointer;
}
.lam-check-copy {
  display: grid;
  gap: 2px;
}
.lam-check-copy strong {
  font-size: 14px;
  color: #111827;
}
.lam-check-sub {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}
.lam-missing {
  margin-top: 4px;
}
.lam-assign-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.lam-assign-field {
  display: grid;
  gap: 6px;
}
.lam-assign-field label {
  font-size: 12px;
  font-weight: 700;
  color: #4b5563;
}
.lam-info-banner {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}
.lam-info-banner p {
  margin: 0;
  font-size: 12px;
  color: #1e40af;
  line-height: 1.45;
}
.lam-info-icon {
  flex-shrink: 0;
}
@media (max-width: 520px) {
  .lam-assign-grid {
    grid-template-columns: 1fr;
  }
}
</style>
