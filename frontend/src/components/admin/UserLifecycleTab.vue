<template>
  <div class="user-lifecycle-tab">
    <div class="lc-header">
      <h2>Lifecycle Management</h2>
      <p class="lc-subtitle">Onboarding and offboarding checklist, dates, and progress.</p>
    </div>

    <div v-if="loading" class="lc-loading">Loading lifecycle data…</div>
    <div v-else-if="error" class="lc-error">{{ error }}</div>

    <template v-else-if="data">
      <!-- ─── Employee Summary Bar ─────────────────────────────────────── -->
      <div class="lc-summary-bar">
        <div class="lc-summary-field">
          <div class="lc-summary-label">Employee Status</div>
          <span :class="['status-badge', statusBadgeClass]">{{ statusLabel }}</span>
        </div>
        <div class="lc-summary-field">
          <div class="lc-summary-label">Start Date</div>
          <div class="lc-summary-value">{{ fmtDate(data.summary.startDate) || '—' }}</div>
        </div>
        <div class="lc-summary-field">
          <div class="lc-summary-label">First Client Date</div>
          <div class="lc-summary-value">{{ fmtDate(data.summary.firstClientDate) || '—' }}</div>
        </div>
        <div class="lc-summary-field">
          <div class="lc-summary-label">Supervisor</div>
          <div class="lc-summary-value">{{ data.summary.supervisorName || '—' }}</div>
        </div>
        <div class="lc-summary-field">
          <div class="lc-summary-label">Last Day Worked</div>
          <div class="lc-summary-value">{{ fmtDate(data.summary.lastDayWorked) || '—' }}</div>
        </div>
        <div class="lc-summary-field">
          <div class="lc-summary-label">Termination Date</div>
          <div class="lc-summary-value">{{ fmtDate(data.summary.terminationDate) || '—' }}</div>
        </div>
        <div class="lc-summary-field">
          <div class="lc-summary-label">Offboarding Status</div>
          <div class="lc-summary-value">{{ data.summary.offboardingStatus }}</div>
        </div>
        <div v-if="data.summary.dateOfBirth" class="lc-summary-field">
          <div class="lc-summary-label">Date of Birth</div>
          <div class="lc-summary-value">{{ fmtDate(data.summary.dateOfBirth) }}</div>
          <div class="lc-summary-note">Edit in Clinical Information</div>
        </div>
        <div v-if="data.summary.leave?.isOnLeave || data.summary.leave?.departureDate" class="lc-summary-field">
          <div class="lc-summary-label">Leave of Absence</div>
          <div class="lc-summary-value">
            <span v-if="data.summary.leave.isOnLeave" class="lc-leave-badge">{{ data.summary.leave.leaveLabel || 'On leave' }}</span>
            <span v-else class="lc-summary-value-muted">Scheduled</span>
          </div>
          <div class="lc-summary-note">
            {{ fmtDate(data.summary.leave.departureDate) }} – {{ fmtDate(data.summary.leave.returnDate) }}<br/>
            Edit via header button
          </div>
        </div>
      </div>

      <!-- Status management crosslink note -->
      <div class="lc-crosslink-note">
        Status transitions (Mark Active, Mark Terminated, Promote to Onboarding, etc.) are managed in the
        <strong>Account</strong> tab → Status Management.
      </div>

      <!-- ─── Two-column layout ────────────────────────────────────────── -->
      <div class="lc-columns">

        <!-- ══ ONBOARDING COLUMN ══════════════════════════════════════════ -->
        <section id="lifecycle-onboarding" class="lc-onboarding lc-section-anchor">
          <h3 class="lc-section-title">Onboarding</h3>

          <!-- Progress -->
          <div class="lc-progress-block">
            <div class="lc-progress-header">
              <span class="lc-progress-pct">{{ data.onboarding.progress }}% Complete</span>
            </div>
            <div class="lc-progress-bar-track">
              <div class="lc-progress-bar-fill" :style="{ width: data.onboarding.progress + '%' }"></div>
            </div>

            <div v-if="data.onboarding.missingItems.length" class="lc-missing-box">
              <button
                type="button"
                class="lc-missing-title"
                :aria-expanded="missingItemsExpanded"
                @click="missingItemsExpanded = !missingItemsExpanded"
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" class="lc-warn-icon">
                  <path d="M10 2L2 18h16L10 2z" fill="#d97706" stroke="none"/>
                  <path d="M10 8v4M10 14h.01" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span>Missing Items</span>
                <span class="lc-missing-count">({{ data.onboarding.missingItems.length }})</span>
                <span class="lc-missing-chevron" :class="{ 'lc-missing-chevron--open': missingItemsExpanded }">›</span>
              </button>
              <ul v-show="missingItemsExpanded" class="lc-missing-list">
                <li v-for="item in data.onboarding.missingItems" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>

          <!-- Key Dates Timeline -->
          <div v-if="data.onboarding.timeline.length" class="lc-timeline-block">
            <h4 class="lc-block-title">Key Dates Timeline</h4>
            <div class="lc-timeline">
              <div
                v-for="ev in data.onboarding.timeline"
                :key="ev.label"
                :class="['lc-timeline-item', ev.status === 'upcoming' ? 'lc-timeline-upcoming' : 'lc-timeline-past']"
              >
                <div class="lc-timeline-dot"></div>
                <div class="lc-timeline-content">
                  <span class="lc-timeline-date">{{ fmtDate(ev.date) }}</span>
                  <span class="lc-timeline-label">{{ ev.label }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Employment Dates -->
          <div class="lc-dates-block">
            <h4 class="lc-block-title">Employment Dates</h4>
            <div class="lc-dates-grid">
              <div class="lc-date-field">
                <label class="lc-date-label">Offer Accepted Date</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="datesForm.offer_accepted_date"
                  :disabled="viewOnly"
                  @change="datesForm.offer_accepted_date = $event.target.value"
                  @blur="saveDates"
                />
              </div>
              <div class="lc-date-field">
                <label class="lc-date-label">Start Date</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="datesForm.start_date"
                  :disabled="viewOnly"
                  @change="datesForm.start_date = $event.target.value"
                  @blur="saveDates"
                />
              </div>
              <div class="lc-date-field">
                <label class="lc-date-label">Orientation Date</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="datesForm.orientation_date"
                  :disabled="viewOnly"
                  @change="datesForm.orientation_date = $event.target.value"
                  @blur="saveDates"
                />
              </div>
              <div class="lc-date-field">
                <label class="lc-date-label">First Client Date</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="datesForm.first_client_date"
                  :disabled="viewOnly"
                  @change="datesForm.first_client_date = $event.target.value"
                  @blur="saveDates"
                />
              </div>
              <div class="lc-date-field">
                <label class="lc-date-label">First Payroll Submission</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="datesForm.first_payroll_submission_date"
                  :disabled="viewOnly"
                  @change="datesForm.first_payroll_submission_date = $event.target.value"
                  @blur="saveDates"
                />
              </div>
              <div class="lc-date-field">
                <label class="lc-date-label">TherapyNotes Training Date</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="datesForm.therapy_notes_training_date"
                  :disabled="viewOnly"
                  @change="datesForm.therapy_notes_training_date = $event.target.value"
                  @blur="saveDates"
                />
              </div>
              <div class="lc-date-field">
                <label class="lc-date-label">Probation End Date</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="datesForm.probation_end_date"
                  :disabled="viewOnly"
                  @change="datesForm.probation_end_date = $event.target.value"
                  @blur="saveDates"
                />
              </div>
            </div>

            <!-- Read-only pipeline dates -->
            <div class="lc-readonly-dates" v-if="data.onboarding.employmentDates.hiredAt || data.onboarding.employmentDates.completedAt">
              <div v-if="data.onboarding.employmentDates.hiredAt" class="lc-readonly-date-row">
                <span class="lc-readonly-label">Moved to Pre-Hire</span>
                <span class="lc-readonly-value">{{ fmtDate(data.onboarding.employmentDates.hiredAt) }}</span>
                <span class="lc-readonly-note">Stamped by hiring pipeline</span>
              </div>
              <div v-if="data.onboarding.employmentDates.completedAt" class="lc-readonly-date-row">
                <span class="lc-readonly-label">Became Active Employee</span>
                <span class="lc-readonly-value">{{ fmtDate(data.onboarding.employmentDates.completedAt) }}</span>
                <span class="lc-readonly-note">Set on Mark Active</span>
              </div>
            </div>

            <!-- Anniversary note -->
            <p class="lc-hint lc-anniversary-note">
              Work anniversary banners use <strong>First Client Date</strong> above.
              Editing Start Date here also updates the tenure field used in Provider Management.
            </p>

            <p v-if="datesSaved" class="lc-save-confirm">Saved.</p>
            <p v-if="datesError" class="lc-save-error">{{ datesError }}</p>
          </div>

          <!-- First supervision session (read-only, from Supervision tab) -->
          <div v-if="data.onboarding.firstSupervisionDate" class="lc-readonly-dates lc-supervision-note">
            <div class="lc-readonly-date-row">
              <span class="lc-readonly-label">First Supervision Session</span>
              <span class="lc-readonly-value">{{ fmtDate(data.onboarding.firstSupervisionDate) }}</span>
              <span class="lc-readonly-note">Full history in Supervision tab</span>
            </div>
          </div>

          <!-- Onboarding Checklist Groups -->
          <div v-if="attachmentError" class="lc-attachment-error">{{ attachmentError }}</div>
          <p v-if="!data.onboarding.groups?.length" class="lc-hint lc-empty-scope">
            No onboarding checklist items are in scope yet. Items appear here when a pre-hire or onboarding
            package is assigned, or when a tagged document task is sent to this person.
          </p>

          <!-- Gear issuance (always available; Equipment checklist may also appear below) -->
          <section
            v-if="!hasEquipmentGroup"
            id="lifecycle-equipment"
            class="lc-checklist-group lc-section-anchor"
          >
            <h4 class="lc-block-title">Equipment</h4>
            <LifecycleGearPanel
              :user-id="userId"
              :agency-id="agencyId"
              :view-only="viewOnly"
              @changed="onGearChanged"
            />
          </section>

          <template v-for="group in data.onboarding.groups" :key="group.category">
            <div
              v-if="activeGroupItems(group).length || group.category === 'equipment'"
              class="lc-checklist-group"
              :class="{ 'lc-section-anchor': group.category === 'equipment' }"
              :id="group.category === 'equipment' ? 'lifecycle-equipment' : undefined"
            >
              <h4 class="lc-block-title">{{ group.label }}</h4>
              <LifecycleGearPanel
                v-if="group.category === 'equipment'"
                :user-id="userId"
                :agency-id="agencyId"
                :view-only="viewOnly"
                @changed="onGearChanged"
              />
              <template v-if="activeGroupItems(group).length">
              <div class="lc-checklist-table">
                <div
                  :class="[
                    'lc-checklist-head',
                    group.category === 'compliance_documents' ? 'lc-checklist-head-docs' : '',
                    !viewOnly ? 'lc-checklist-head-actions' : ''
                  ]"
                >
                  <span>Item</span>
                  <span>Complete</span>
                  <span>Date</span>
                  <span v-if="group.category === 'compliance_documents'">Doc</span>
                  <span v-if="!viewOnly" class="lc-col-action"> </span>
                </div>
                <div
                  v-for="item in activeGroupItems(group)"
                  :key="item.definitionId"
                  :class="[
                    'lc-checklist-row',
                    group.category === 'compliance_documents' ? 'lc-checklist-row-docs' : '',
                    !viewOnly ? 'lc-checklist-row-actions' : ''
                  ]"
                >
                  <span class="lc-item-label">{{ item.label }}</span>
                  <span class="lc-item-check">
                    <input
                      type="checkbox"
                      :checked="item.isCompleted"
                      :disabled="viewOnly"
                      :title="item.completionMethod === 'auto' ? 'Auto-completed from app data' : ''"
                      @change="toggleItem(item, $event.target.checked)"
                    />
                    <span v-if="item.completionMethod === 'auto'" class="lc-auto-badge" title="Auto-completed from app data">auto</span>
                  </span>
                  <span class="lc-item-date">
                    <input
                      v-if="item.isCompleted && !viewOnly"
                      type="date"
                      class="lc-item-date-input"
                      :value="toYmd(item.completedAt)"
                      @change="updateItemDate(item, $event.target.value)"
                      title="Override completion date"
                    />
                    <span v-else>{{ fmtDate(item.completedAt) || (item.isCompleted ? '✓' : '—') }}</span>
                  </span>
                  <span v-if="group.category === 'compliance_documents'" class="lc-item-doc">
                    <!-- Signed document from onboarding flow -->
                    <a
                      v-if="item.documentTaskId"
                      :href="`/api/document-signing/${item.documentTaskId}/download`"
                      target="_blank"
                      class="lc-doc-action lc-doc-download"
                      :title="item.hasSignedDocument ? 'View / download signed document' : 'View document record'"
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 3v9m0 0l-3-3m3 3l3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      </svg>
                    </a>
                    <!-- Retroactive encrypted upload -->
                    <template v-else-if="item.supportsAttachment">
                      <button
                        v-if="item.attachment?.hasAttachment"
                        type="button"
                        class="lc-doc-action lc-doc-download"
                        :title="`Download ${item.attachment.originalName || 'document'}`"
                        @click="downloadAttachment(item)"
                      >
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M10 3v9m0 0l-3-3m3 3l3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                      </button>
                      <button
                        v-if="!viewOnly"
                        type="button"
                        class="lc-doc-action lc-doc-upload"
                        :disabled="attachmentUploadingId === item.definitionId"
                        :title="item.attachment?.hasAttachment ? 'Replace document (PDF)' : 'Upload document (PDF)'"
                        @click="triggerAttachmentUpload(item)"
                      >
                        <svg v-if="attachmentUploadingId !== item.definitionId" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                        </svg>
                        <span v-else class="lc-doc-spinner">…</span>
                      </button>
                    </template>
                  </span>
                  <span v-if="!viewOnly" class="lc-item-action">
                    <button
                      type="button"
                      class="lc-remove-btn"
                      title="Not needed for this person — exclude from completion"
                      @click="setItemNotApplicable(item, true)"
                    >Remove</button>
                  </span>
                </div>
              </div>
              </template>
            </div>
          </template>

          <div v-if="removedOnboardingItems.length" class="lc-removed-block">
            <button
              type="button"
              class="lc-removed-toggle"
              :aria-expanded="removedItemsExpanded"
              @click="removedItemsExpanded = !removedItemsExpanded"
            >
              Not needed for this person ({{ removedOnboardingItems.length }})
              <span class="lc-missing-chevron" :class="{ 'lc-missing-chevron--open': removedItemsExpanded }">›</span>
            </button>
            <div v-show="removedItemsExpanded" class="lc-removed-list">
              <div
                v-for="item in removedOnboardingItems"
                :key="`na-${item.definitionId}`"
                class="lc-removed-row"
              >
                <span class="lc-removed-label">{{ item.label }}</span>
                <button
                  v-if="!viewOnly"
                  type="button"
                  class="lc-restore-btn"
                  @click="setItemNotApplicable(item, false)"
                >Restore</button>
              </div>
            </div>
          </div>
        </section>
        
        <!-- ══ OFFBOARDING COLUMN ═════════════════════════════════════════ -->
        <section
          id="lifecycle-offboarding"
          class="lc-section-anchor"
          :class="['lc-offboarding', !data.offboarding.enabled && 'lc-offboarding-disabled']"
        >
          <h3 class="lc-section-title">
            Offboarding
            <span v-if="!data.offboarding.enabled" class="lc-offboard-note">(only active when termination date is set)</span>
          </h3>

          <!-- Termination Date -->
          <div class="lc-dates-block">
            <h4 class="lc-block-title">Termination Date</h4>
            <input
              type="date"
              class="lc-date-input"
              :value="separationForm.terminationDate"
              :disabled="viewOnly"
              @change="onTerminationDateChange"
            />
            <p class="lc-hint">Once a termination date is set, offboarding tasks will become active.</p>
            <p v-if="sepSaved" class="lc-save-confirm">Termination date saved — offboarding is now active.</p>
            <p v-if="sepError" class="lc-save-error">{{ sepError }}</p>
            <div v-if="data.offboarding.terminatedAt || data.offboarding.statusExpiresAt" class="lc-readonly-dates" style="margin-top: 8px;">
              <div v-if="data.offboarding.terminatedAt" class="lc-readonly-date-row">
                <span class="lc-readonly-label">Terminated On</span>
                <span class="lc-readonly-value">{{ fmtDate(data.offboarding.terminatedAt) }}</span>
                <span class="lc-readonly-note">When "Mark Terminated" was pressed</span>
              </div>
              <div v-if="data.offboarding.statusExpiresAt" class="lc-readonly-date-row">
                <span class="lc-readonly-label">Access Expires</span>
                <span class="lc-readonly-value">{{ fmtDate(data.offboarding.statusExpiresAt) }}</span>
                <span class="lc-readonly-note">7-day grace period end</span>
              </div>
            </div>
          </div>

          <!-- Separable Information -->
          <div :class="['lc-sep-block', !data.offboarding.enabled && 'lc-sep-disabled']">
            <h4 class="lc-block-title">Separable Information</h4>
            <div class="lc-sep-grid">
              <div class="lc-sep-field">
                <label class="lc-date-label">Last Day Worked</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="separationForm.lastDayWorked"
                  :disabled="viewOnly || !data.offboarding.enabled"
                  @change="separationForm.lastDayWorked = $event.target.value"
                  @blur="saveSeparation"
                />
              </div>
              <div class="lc-sep-field">
                <label class="lc-date-label">Voluntary / Involuntary</label>
                <select
                  class="lc-select"
                  :value="separationForm.separationType"
                  :disabled="viewOnly || !data.offboarding.enabled"
                  @change="separationForm.separationType = $event.target.value; saveSeparation()"
                >
                  <option value="">— Select —</option>
                  <option value="voluntary">Voluntary</option>
                  <option value="involuntary">Involuntary</option>
                </select>
              </div>
              <div class="lc-sep-field">
                <label class="lc-date-label">Resignation Received</label>
                <input
                  type="date"
                  class="lc-date-input"
                  :value="separationForm.resignationReceivedDate"
                  :disabled="viewOnly || !data.offboarding.enabled"
                  @change="separationForm.resignationReceivedDate = $event.target.value"
                  @blur="saveSeparation"
                />
              </div>
              <div class="lc-sep-field lc-sep-check-field">
                <label class="lc-check-label">
                  <input
                    type="checkbox"
                    :checked="separationForm.rehireEligible"
                    :disabled="viewOnly || !data.offboarding.enabled"
                    @change="separationForm.rehireEligible = $event.target.checked; saveSeparation()"
                  />
                  Rehire Eligible
                </label>
              </div>
              <div class="lc-sep-field lc-sep-check-field">
                <label class="lc-check-label">
                  <input
                    type="checkbox"
                    :checked="separationForm.exitInterviewCompleted"
                    :disabled="viewOnly || !data.offboarding.enabled"
                    @change="separationForm.exitInterviewCompleted = $event.target.checked; saveSeparation()"
                  />
                  Exit Interview Completed
                </label>
              </div>
            </div>
          </div>

          <!-- Offboarding Checklist Groups -->
          <template v-for="group in data.offboarding.groups" :key="group.category">
            <div v-if="activeGroupItems(group).length" :class="['lc-checklist-group', !data.offboarding.enabled && 'lc-sep-disabled']">
              <h4 class="lc-block-title">{{ group.label }}</h4>
              <div class="lc-checklist-table">
                <div :class="['lc-checklist-head', !viewOnly && data.offboarding.enabled ? 'lc-checklist-head-actions' : '']">
                  <span>Item</span>
                  <span>Complete</span>
                  <span>Date</span>
                  <span v-if="!viewOnly && data.offboarding.enabled" class="lc-col-action"> </span>
                </div>
                <div
                  v-for="item in activeGroupItems(group)"
                  :key="item.definitionId"
                  :class="['lc-checklist-row', !viewOnly && data.offboarding.enabled ? 'lc-checklist-row-actions' : '']"
                >
                  <span class="lc-item-label">{{ item.label }}</span>
                  <span class="lc-item-check">
                    <input
                      type="checkbox"
                      :checked="item.isCompleted"
                      :disabled="viewOnly || !data.offboarding.enabled"
                      @change="toggleItem(item, $event.target.checked)"
                    />
                  </span>
                  <span class="lc-item-date">
                    <input
                      v-if="item.isCompleted && !viewOnly"
                      type="date"
                      class="lc-item-date-input"
                      :value="toYmd(item.completedAt)"
                      @change="updateItemDate(item, $event.target.value)"
                      title="Override completion date"
                    />
                    <span v-else>{{ fmtDate(item.completedAt) || (item.isCompleted ? '✓' : '—') }}</span>
                  </span>
                  <span v-if="!viewOnly && data.offboarding.enabled" class="lc-item-action">
                    <button
                      type="button"
                      class="lc-remove-btn"
                      title="Not needed for this person — exclude from completion"
                      @click="setItemNotApplicable(item, true)"
                    >Remove</button>
                  </span>
                </div>
              </div>
            </div>
          </template>

          <div v-if="removedOffboardingItems.length" class="lc-removed-block">
            <button
              type="button"
              class="lc-removed-toggle"
              :aria-expanded="removedOffboardExpanded"
              @click="removedOffboardExpanded = !removedOffboardExpanded"
            >
              Not needed for this person ({{ removedOffboardingItems.length }})
              <span class="lc-missing-chevron" :class="{ 'lc-missing-chevron--open': removedOffboardExpanded }">›</span>
            </button>
            <div v-show="removedOffboardExpanded" class="lc-removed-list">
              <div
                v-for="item in removedOffboardingItems"
                :key="`na-off-${item.definitionId}`"
                class="lc-removed-row"
              >
                <span class="lc-removed-label">{{ item.label }}</span>
                <button
                  v-if="!viewOnly && data.offboarding.enabled"
                  type="button"
                  class="lc-restore-btn"
                  @click="setItemNotApplicable(item, false)"
                >Restore</button>
              </div>
            </div>
          </div>

          <!-- Offboarding Notes -->
          <div :class="['lc-notes-block', !data.offboarding.enabled && 'lc-sep-disabled']">
            <h4 class="lc-block-title">Offboarding Notes</h4>
            <p class="lc-hint">Visible to HR and Admin only.</p>
            <textarea
              class="lc-notes-area"
              :value="separationForm.offboardingNotes"
              :disabled="viewOnly || !data.offboarding.enabled"
              rows="4"
              placeholder="Reason for departure, performance notes, exit interview summary, rehire recommendations, etc."
              @input="separationForm.offboardingNotes = $event.target.value"
              @blur="saveSeparation"
            ></textarea>
            <p v-if="sepSaved" class="lc-save-confirm">Saved.</p>
            <p v-if="sepError" class="lc-save-error">{{ sepError }}</p>
          </div>
        </section>
      </div>
    </template>

    <input
      ref="attachmentFileInput"
      type="file"
      accept="application/pdf"
      style="display:none;"
      @change="onAttachmentFileSelected"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import LifecycleGearPanel from './LifecycleGearPanel.vue';

const props = defineProps({
  userId: { type: [Number, String], required: true },
  viewOnly: { type: Boolean, default: false },
  user: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null },
});

// ─── State ────────────────────────────────────────────────────────────────────
const loading = ref(false);
const error = ref('');
const data = ref(null);
const datesSaved = ref(false);
const datesError = ref('');
const sepSaved = ref(false);
const sepError = ref('');
const missingItemsExpanded = ref(false);
const removedItemsExpanded = ref(false);
const removedOffboardExpanded = ref(false);
const attachmentFileInput = ref(null);
const attachmentUploadTarget = ref(null);
const attachmentUploadingId = ref(null);
const attachmentError = ref('');

const datesForm = ref({
  offer_accepted_date: null,
  start_date: null,
  orientation_date: null,
  therapy_notes_training_date: null,
  first_client_date: null,
  first_payroll_submission_date: null,
  probation_end_date: null,
});

const separationForm = ref({
  terminationDate: null,
  lastDayWorked: null,
  separationType: '',
  resignationReceivedDate: null,
  rehireEligible: false,
  exitInterviewCompleted: false,
  offboardingNotes: '',
});

// ─── Computed ─────────────────────────────────────────────────────────────────
const statusLabel = computed(() => {
  const status = data.value?.summary?.employeeStatus;
  const isActive = data.value?.summary?.isActive;
  if (!isActive) return 'Inactive';
  const labels = {
    PROSPECTIVE: 'Prospective',
    PENDING_SETUP: 'Pending Setup',
    PREHIRE_OPEN: 'Pre-Hire',
    PREHIRE_REVIEW: 'Ready for Review',
    ONBOARDING: 'Onboarding',
    ACTIVE_EMPLOYEE: 'Active',
    TERMINATED_PENDING: 'Terminated (Grace Period)',
    INACTIVE_EMPLOYEE: 'Inactive (offboarded)',
    ARCHIVED: 'Archived',
  };
  return labels[status] || String(status || '—');
});

const statusBadgeClass = computed(() => {
  const status = data.value?.summary?.employeeStatus;
  const map = {
    PROSPECTIVE: 'badge-info',
    PENDING_SETUP: 'badge-warning',
    PREHIRE_OPEN: 'badge-warning',
    PREHIRE_REVIEW: 'badge-primary',
    ONBOARDING: 'badge-info',
    ACTIVE_EMPLOYEE: 'badge-success',
    TERMINATED_PENDING: 'badge-danger',
    INACTIVE_EMPLOYEE: 'badge-secondary',
    ARCHIVED: 'badge-secondary',
  };
  return map[status] || 'badge-secondary';
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Normalize API dates to YYYY-MM-DD for <input type="date">. */
function toYmd(val) {
  if (val == null || val === '') return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(val) {
  const ymd = toYmd(val);
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function populateForms() {
  const d = data.value;
  if (!d) return;
  const ed = d.onboarding.employmentDates;
  datesForm.value = {
    offer_accepted_date: toYmd(ed.offerAcceptedDate),
    start_date: toYmd(ed.startDate),
    orientation_date: toYmd(ed.orientationDate),
    therapy_notes_training_date: toYmd(ed.therapyNotesTrainingDate),
    first_client_date: toYmd(ed.firstClientDate),
    first_payroll_submission_date: toYmd(ed.firstPayrollSubmissionDate),
    probation_end_date: toYmd(ed.probationEndDate),
  };
  const sep = d.offboarding.separation;
  separationForm.value = {
    terminationDate: toYmd(d.offboarding.terminationDate),
    lastDayWorked: toYmd(sep.lastDayWorked),
    separationType: sep.separationType || '',
    resignationReceivedDate: toYmd(sep.resignationReceivedDate),
    rehireEligible: !!sep.rehireEligible,
    exitInterviewCompleted: !!sep.exitInterviewCompleted,
    offboardingNotes: sep.offboardingNotes || '',
  };
}

// ─── Data loading ─────────────────────────────────────────────────────────────
async function fetchLifecycle() {
  const uid = props.userId;
  if (!uid) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/users/${uid}/lifecycle`);
    data.value = resp.data;
    populateForms();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load lifecycle data';
  } finally {
    loading.value = false;
  }
}

// ─── Save handlers ────────────────────────────────────────────────────────────
async function saveDates() {
  if (props.viewOnly) return;
  datesSaved.value = false;
  datesError.value = '';
  try {
    await api.patch(`/users/${props.userId}/lifecycle/dates`, datesForm.value);
    datesSaved.value = true;
    setTimeout(() => { datesSaved.value = false; }, 2500);
    // Refresh to update timeline + progress
    await fetchLifecycle();
  } catch (e) {
    datesError.value = e?.response?.data?.error?.message || 'Failed to save dates';
  }
}

async function onTerminationDateChange(event) {
  separationForm.value.terminationDate = event?.target?.value || '';
  await saveTerminationDate();
}

async function saveTerminationDate() {
  if (props.viewOnly) return;
  const val = toYmd(separationForm.value.terminationDate) || null;
  if (!val && !toYmd(data.value?.offboarding?.terminationDate)) return;
  sepSaved.value = false;
  sepError.value = '';
  try {
    // Persist users.termination_date — this is what enables offboarding in the Lifecycle API.
    await api.patch(`/users/${props.userId}/lifecycle/separation`, {
      terminationDate: val,
      lastDayWorked: toYmd(separationForm.value.lastDayWorked) || null,
      separationType: separationForm.value.separationType || null,
      resignationReceivedDate: toYmd(separationForm.value.resignationReceivedDate) || null,
      rehireEligible: separationForm.value.rehireEligible,
      exitInterviewCompleted: separationForm.value.exitInterviewCompleted,
      offboardingNotes: separationForm.value.offboardingNotes || null,
    });
    // Unlock immediately so Separable Info / checklist aren't stuck disabled
    // while we refresh (and so a date-format bug can't leave UI locked).
    if (data.value?.offboarding) {
      data.value.offboarding.enabled = !!val;
      data.value.offboarding.terminationDate = val;
    }
    sepSaved.value = true;
    setTimeout(() => { sepSaved.value = false; }, 2500);
    await fetchLifecycle();
  } catch (e) {
    sepError.value = e?.response?.data?.error?.message || 'Failed to save termination date';
  }
}

async function saveSeparation() {
  if (props.viewOnly) return;
  if (!data.value?.offboarding?.enabled) return;
  sepSaved.value = false;
  sepError.value = '';
  try {
    await api.patch(`/users/${props.userId}/lifecycle/separation`, {
      lastDayWorked: separationForm.value.lastDayWorked || null,
      separationType: separationForm.value.separationType || null,
      resignationReceivedDate: separationForm.value.resignationReceivedDate || null,
      rehireEligible: separationForm.value.rehireEligible,
      exitInterviewCompleted: separationForm.value.exitInterviewCompleted,
      offboardingNotes: separationForm.value.offboardingNotes || null,
    });
    sepSaved.value = true;
    setTimeout(() => { sepSaved.value = false; }, 2500);
  } catch (e) {
    sepError.value = e?.response?.data?.error?.message || 'Failed to save';
  }
}

async function toggleItem(item, checked) {
  if (props.viewOnly) return;
  const prev = item.isCompleted;
  // Optimistic update
  item.isCompleted = checked;
  item.completedAt = checked ? new Date().toISOString() : null;
  try {
    await api.post(`/users/${props.userId}/lifecycle/checklist/${item.definitionId}/toggle`, {
      completed: checked,
    });
    await fetchLifecycle();
  } catch {
    // Revert
    item.isCompleted = prev;
    item.completedAt = prev ? item.completedAt : null;
  }
}

async function updateItemDate(item, dateStr) {
  if (props.viewOnly || !item.isCompleted) return;
  if (!dateStr) return;
  const prevDate = item.completedAt;
  item.completedAt = new Date(`${dateStr}T12:00:00Z`).toISOString();
  try {
    await api.post(`/users/${props.userId}/lifecycle/checklist/${item.definitionId}/toggle`, {
      completed: true,
      completedAt: item.completedAt,
    });
    await fetchLifecycle();
  } catch {
    item.completedAt = prevDate;
  }
}

function activeGroupItems(group) {
  return (group?.items || []).filter((item) => !item.isNotApplicable);
}

const hasEquipmentGroup = computed(() =>
  (data.value?.onboarding?.groups || []).some((g) => g.category === 'equipment')
);

async function onGearChanged() {
  await fetchLifecycle();
}

const removedOnboardingItems = computed(() =>
  (data.value?.onboarding?.groups || []).flatMap((g) =>
    (g.items || []).filter((item) => item.isNotApplicable)
  )
);

const removedOffboardingItems = computed(() =>
  (data.value?.offboarding?.groups || []).flatMap((g) =>
    (g.items || []).filter((item) => item.isNotApplicable)
  )
);

async function setItemNotApplicable(item, notApplicable) {
  if (props.viewOnly) return;
  try {
    await api.post(`/users/${props.userId}/lifecycle/checklist/${item.definitionId}/not-applicable`, {
      notApplicable: !!notApplicable,
    });
    await fetchLifecycle();
  } catch (e) {
    // Surface via existing attachment error strip if present
    attachmentError.value = e?.response?.data?.error?.message
      || (notApplicable ? 'Failed to remove item' : 'Failed to restore item');
  }
}

function triggerAttachmentUpload(item) {
  if (props.viewOnly) return;
  attachmentError.value = '';
  attachmentUploadTarget.value = item;
  attachmentFileInput.value?.click();
}

async function onAttachmentFileSelected(event) {
  const file = event?.target?.files?.[0];
  const item = attachmentUploadTarget.value;
  attachmentUploadTarget.value = null;
  try {
    if (event?.target) event.target.value = '';
  } catch {
    // ignore
  }
  if (!file || !item) return;

  if (file.type !== 'application/pdf') {
    attachmentError.value = 'Only PDF files are allowed.';
    return;
  }

  attachmentUploadingId.value = item.definitionId;
  attachmentError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    await api.post(
      `/users/${props.userId}/lifecycle/checklist/${item.definitionId}/attachment`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    await fetchLifecycle();
  } catch (e) {
    attachmentError.value = e?.response?.data?.error?.message || 'Failed to upload document.';
  } finally {
    attachmentUploadingId.value = null;
  }
}

async function downloadAttachment(item) {
  attachmentError.value = '';
  try {
    const res = await api.get(
      `/users/${props.userId}/lifecycle/checklist/${item.definitionId}/attachment`,
      { responseType: 'blob' }
    );
    const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.attachment?.originalName || `${item.itemKey || 'document'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    attachmentError.value = e?.response?.data?.error?.message || 'Failed to download document.';
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────
watch(() => props.userId, () => {
  missingItemsExpanded.value = false;
  fetchLifecycle();
}, { immediate: true });
</script>

<style scoped>
.user-lifecycle-tab {
  padding: 0 0 40px;
}

/* Header */
.lc-header { margin-bottom: 20px; }
.lc-header h2 { margin: 0 0 4px; font-size: 1.25rem; }
.lc-subtitle { margin: 0; color: #6b7280; font-size: 0.875rem; }

/* Summary Bar */
.lc-summary-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding: 16px 20px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 24px;
}
.lc-summary-field { min-width: 100px; }
.lc-summary-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
.lc-summary-value { font-size: 0.9rem; font-weight: 500; color: #111827; }

/* Status badges (from global classes) */
.status-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
.badge-success { background: #dcfce7; color: #166534; }
.badge-warning { background: #fef3c7; color: #92400e; }
.badge-danger  { background: #fee2e2; color: #991b1b; }
.badge-info    { background: #dbeafe; color: #1e40af; }
.badge-primary { background: #ede9fe; color: #5b21b6; }
.badge-secondary { background: #f3f4f6; color: #374151; }

/* Two-column layout */
.lc-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  align-items: start;
}
@media (max-width: 900px) {
  .lc-columns { grid-template-columns: 1fr; }
}

/* Section titles */
.lc-section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e5e7eb;
  color: #111827;
}
.lc-offboard-note { font-size: 0.75rem; font-weight: 400; color: #9ca3af; margin-left: 8px; }
.lc-block-title { font-size: 0.875rem; font-weight: 600; margin: 0 0 10px; color: #374151; }

/* Progress */
.lc-progress-block { margin-bottom: 20px; }
.lc-progress-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
.lc-progress-pct { font-weight: 600; font-size: 0.9rem; }
.lc-progress-bar-track {
  height: 10px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 12px;
}
.lc-progress-bar-fill {
  height: 100%;
  background: #16a34a;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.lc-missing-box {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 10px 14px;
}
.lc-missing-title {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font-weight: 600;
  font-size: 0.8rem;
  color: #92400e;
  cursor: pointer;
  text-align: left;
}
.lc-missing-title:hover { color: #78350f; }
.lc-missing-count {
  font-weight: 500;
  opacity: 0.85;
}
.lc-missing-chevron {
  margin-left: auto;
  font-size: 1rem;
  line-height: 1;
  transition: transform 0.15s ease;
  transform: rotate(0deg);
}
.lc-missing-chevron--open {
  transform: rotate(90deg);
}
.lc-warn-icon { flex-shrink: 0; }
.lc-missing-list { margin: 8px 0 0; padding-left: 18px; font-size: 0.82rem; color: #92400e; }
.lc-missing-list li { margin-bottom: 2px; }

/* Timeline */
.lc-timeline-block { margin-bottom: 20px; }
.lc-timeline { display: flex; flex-direction: column; gap: 0; }
.lc-timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
  position: relative;
}
.lc-timeline-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 20px;
  bottom: -6px;
  width: 2px;
  background: #d1d5db;
}
.lc-timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 3px;
}
.lc-timeline-past .lc-timeline-dot { background: #16a34a; }
.lc-timeline-upcoming .lc-timeline-dot { background: #fbbf24; }
.lc-timeline-content { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.lc-timeline-date { font-size: 0.8rem; color: #6b7280; min-width: 80px; }
.lc-timeline-label { font-size: 0.85rem; font-weight: 500; color: #111827; }

/* Employment Dates */
.lc-dates-block { margin-bottom: 20px; }
.lc-dates-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}
.lc-date-field { display: flex; flex-direction: column; gap: 4px; }
.lc-date-label { font-size: 0.78rem; color: #6b7280; }
.lc-date-input {
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #111827;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
.lc-date-input:disabled { background: #f9fafb; color: #9ca3af; cursor: not-allowed; }
.lc-hint { font-size: 0.78rem; color: #9ca3af; margin: 4px 0 0; }
.lc-save-confirm { font-size: 0.8rem; color: #16a34a; margin: 4px 0 0; }
.lc-save-error { font-size: 0.8rem; color: #dc2626; margin: 4px 0 0; }

/* Checklist Tables */
.lc-checklist-group { margin-bottom: 20px; }
.lc-section-anchor {
  scroll-margin-top: 96px;
}
.lc-checklist-table { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
.lc-checklist-head {
  display: grid;
  grid-template-columns: 1fr 52px 135px;
  padding: 6px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.72rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lc-checklist-row {
  display: grid;
  grid-template-columns: 1fr 52px 135px;
  padding: 7px 12px;
  align-items: center;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.83rem;
}
.lc-checklist-row:last-child { border-bottom: none; }
.lc-checklist-row:nth-child(even) { background: #fafafa; }
.lc-checklist-head-actions,
.lc-checklist-row-actions { grid-template-columns: 1fr 52px 135px 64px; }
.lc-checklist-head-docs { grid-template-columns: 1fr 52px 135px 56px !important; }
.lc-checklist-row-docs { grid-template-columns: 1fr 52px 135px 56px !important; }
.lc-checklist-head-docs.lc-checklist-head-actions,
.lc-checklist-row-docs.lc-checklist-row-actions { grid-template-columns: 1fr 52px 135px 56px 64px !important; }
.lc-item-label { color: #111827; }
.lc-item-check { display: flex; align-items: center; gap: 4px; }
.lc-item-check input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; }
.lc-item-action { display: flex; justify-content: flex-end; }
.lc-remove-btn {
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
}
.lc-remove-btn:hover { color: #b91c1c; }
.lc-removed-block {
  margin: 8px 0 16px;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fafafa;
}
.lc-removed-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
  cursor: pointer;
}
.lc-removed-list { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.lc-removed-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
}
.lc-removed-label { color: #9ca3af; text-decoration: line-through; }
.lc-restore-btn {
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  cursor: pointer;
}
.lc-restore-btn:hover { border-color: #9ca3af; }
.lc-item-check input[type="checkbox"]:disabled { cursor: not-allowed; opacity: 0.6; }
.lc-attachment-error {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 0.82rem;
}
.lc-doc-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}
.lc-doc-upload { color: #6b7280; }
.lc-doc-upload:hover:not(:disabled) { color: #1a5c38; }
.lc-doc-upload:disabled { opacity: 0.5; cursor: not-allowed; }
.lc-doc-spinner { font-size: 12px; color: #6b7280; }
.lc-auto-badge {
  font-size: 0.65rem;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 3px;
  padding: 1px 4px;
  font-weight: 600;
  line-height: 1.2;
}
.lc-item-date { font-size: 0.78rem; color: #6b7280; }
.lc-item-date-input {
  padding: 2px 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #111827;
  background: transparent;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
}
.lc-item-date-input:hover, .lc-item-date-input:focus {
  border-color: #d1d5db;
  background: #fff;
  cursor: text;
}
.lc-item-doc { display: flex; align-items: center; justify-content: center; gap: 2px; }
.lc-doc-download {
  color: #1a5c38;
  display: flex;
  align-items: center;
  opacity: 0.85;
  transition: opacity 0.15s;
  text-decoration: none;
}
.lc-doc-download:hover { opacity: 1; }

/* Offboarding */
.lc-offboarding-disabled .lc-section-title { color: #9ca3af; }
.lc-sep-disabled { opacity: 0.45; pointer-events: none; user-select: none; }

.lc-sep-block { margin-bottom: 20px; }
.lc-sep-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}
.lc-sep-field { display: flex; flex-direction: column; gap: 4px; }
.lc-sep-check-field { justify-content: flex-end; padding-bottom: 2px; }
.lc-select {
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.85rem;
  background: #fff;
  color: #111827;
}
.lc-select:disabled { background: #f9fafb; color: #9ca3af; cursor: not-allowed; }
.lc-check-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.83rem;
  color: #374151;
  cursor: pointer;
}
.lc-check-label input[type="checkbox"] { width: 15px; height: 15px; }

.lc-notes-block { margin-bottom: 20px; }
.lc-notes-area {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #111827;
  resize: vertical;
}
.lc-notes-area:disabled { background: #f9fafb; color: #9ca3af; cursor: not-allowed; }

/* Read-only pipeline dates */
.lc-readonly-dates {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lc-readonly-date-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.82rem;
  flex-wrap: wrap;
}
.lc-readonly-label { color: #6b7280; min-width: 160px; }
.lc-readonly-value { font-weight: 600; color: #111827; }
.lc-readonly-note { color: #9ca3af; font-size: 0.75rem; }
.lc-supervision-note { margin-bottom: 16px; }

/* Anniversary note */
.lc-anniversary-note { margin-top: 8px; color: #6b7280; }

/* Summary bar extras */
.lc-summary-note { font-size: 0.72rem; color: #9ca3af; margin-top: 2px; }
.lc-summary-value-muted { color: #9ca3af; font-size: 0.85rem; }
.lc-leave-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

/* Cross-tab note */
.lc-crosslink-note {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 0.82rem;
  color: #1e40af;
  margin-bottom: 20px;
}

/* Loading / error */
.lc-loading { padding: 40px; text-align: center; color: #9ca3af; }
.lc-error { padding: 16px; background: #fee2e2; color: #991b1b; border-radius: 6px; }
</style>
