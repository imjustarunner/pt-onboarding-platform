<template>
  <div class="wizard-overlay" @click.self="$emit('close')">
    <div class="wizard-panel" role="dialog" aria-modal="true" :aria-label="`Book with ${provider.displayName}`">

      <!-- Close -->
      <button class="wizard-close" type="button" aria-label="Close" @click="$emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <!-- Confirmation screen -->
      <div v-if="submitted" class="wizard-confirm">
        <div class="confirm-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h2>Request submitted!</h2>
        <p>We'll follow up at <strong>{{ form.email }}</strong> to confirm your appointment.</p>
        <div class="confirm-detail">
          <span class="confirm-appt-label">{{ form.hasRecentAssessment === false ? 'Tutoring session (pending eval)' : 'Session' }}</span>
          <span>{{ provider.displayName }}</span>
          <span>{{ formatSlotLabel(form.hasRecentAssessment === false && providerCanEval && form.intakeSlot ? form.intakeSlot : slot) }}</span>
        </div>
        <div v-if="form.hasRecentAssessment === false && form.evalSlot" class="confirm-detail confirm-detail--eval">
          <span class="confirm-appt-label">Evaluation (first appointment)</span>
          <span>{{ evalProviderName }}</span>
          <span>{{ formatSlotLabel(form.evalSlot) }}</span>
        </div>
        <div v-else-if="form.intakeSlot && form.hasRecentAssessment !== false" class="confirm-detail confirm-detail--intake">
          <span class="confirm-appt-label">Intake &amp; evaluation</span>
          <span>{{ provider.displayName }}</span>
          <span>{{ formatSlotLabel(form.intakeSlot) }}</span>
        </div>
        <button class="btn-primary" type="button" @click="$emit('close')">Done</button>
      </div>

      <!-- Wizard steps -->
      <template v-else>
        <!-- Progress bar -->
        <div class="wizard-progress">
          <div class="progress-fill" :style="{ width: `${progressPct}%` }" />
        </div>

        <!-- Step header -->
        <div class="wizard-header">
          <img v-if="provider.profilePhotoUrl" :src="provider.profilePhotoUrl" :alt="provider.displayName" class="wiz-avatar" />
          <div class="wiz-avatar-fallback" v-else>{{ initials(provider.displayName) }}</div>
          <div class="wizard-header-text">
            <h2>{{ currentStep.title }}</h2>
            <p class="wizard-slot-label">{{ provider.displayName }} &bull; {{ formatSlotLabel(slot) }}</p>
          </div>
        </div>

        <!-- Step body -->
        <div class="wizard-body">

          <!-- Step: confirm -->
          <div v-if="currentStep.id === 'confirm'" class="step-confirm">
            <div class="slot-summary">
              <div class="slot-summary-row">
                <svg class="srow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                <span>{{ formatSlotLabel(slot) }}</span>
              </div>
              <div class="slot-summary-row">
                <svg class="srow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.159.69.159 1.006 0z" /></svg>
                <span>{{ slot.programType === 'VIRTUAL' ? 'Virtual' : `In-person${slot.buildingName ? ` — ${slot.buildingName}` : ''}` }}</span>
              </div>
              <div v-if="serviceType === 'counseling' && provider.specialties?.length" class="slot-summary-row">
                <svg class="srow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /></svg>
                <span>{{ provider.specialties.slice(0, 3).join(', ') }}</span>
              </div>
              <div v-if="serviceType === 'tutoring' && provider.tutoringProfile?.subjectAreas?.length" class="slot-summary-row">
                <svg class="srow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                <span>{{ provider.tutoringProfile.subjectAreas.slice(0, 3).join(', ') }}</span>
              </div>
            </div>
          </div>

          <!-- Step: about you -->
          <div v-if="currentStep.id === 'about'" class="step-form">
            <div class="form-row">
              <label class="field">
                <span>Your name <span class="req">*</span></span>
                <input v-model="form.name" type="text" placeholder="Full name" autocomplete="name" />
                <span v-if="fieldError('name')" class="field-error">{{ fieldError('name') }}</span>
              </label>
              <label class="field">
                <span>Your email <span class="req">*</span></span>
                <input v-model="form.email" type="email" placeholder="you@example.com" autocomplete="email" />
                <span v-if="fieldError('email')" class="field-error">{{ fieldError('email') }}</span>
              </label>
            </div>
            <label class="field">
              <span>Your phone</span>
              <input v-model="form.phone" type="tel" placeholder="(555) 000-0000" autocomplete="tel" />
            </label>
            <div class="booking-type-toggle">
              <p class="field-label">Are you a new or existing client?</p>
              <div class="toggle-row">
                <button class="toggle-btn" :class="{ active: form.bookingMode === 'NEW_CLIENT' }" type="button" @click="form.bookingMode = 'NEW_CLIENT'">New client</button>
                <button class="toggle-btn" :class="{ active: form.bookingMode === 'CURRENT_CLIENT' }" type="button" @click="form.bookingMode = 'CURRENT_CLIENT'">Existing client</button>
              </div>
            </div>
          </div>

          <!-- Step: client info (new) -->
          <div v-if="currentStep.id === 'client_new'" class="step-form">
            <p class="step-hint">Please provide information about the person receiving services.</p>
            <div class="form-row">
              <label class="field">
                <span>Client full name <span class="req">*</span></span>
                <input v-model="form.clientFullName" type="text" placeholder="Full name" />
                <span v-if="fieldError('clientFullName')" class="field-error">{{ fieldError('clientFullName') }}</span>
              </label>
            </div>
            <div class="form-row">
              <label class="field">
                <span>Guardian first name <span class="req">*</span></span>
                <input v-model="form.guardianFirstName" type="text" placeholder="First name" />
                <span v-if="fieldError('guardianFirstName')" class="field-error">{{ fieldError('guardianFirstName') }}</span>
              </label>
              <label class="field">
                <span>Guardian last name</span>
                <input v-model="form.guardianLastName" type="text" placeholder="Last name" />
              </label>
            </div>
            <div class="form-row">
              <label class="field">
                <span>Guardian email <span class="req">*</span></span>
                <input v-model="form.guardianEmail" type="email" placeholder="guardian@example.com" />
                <span v-if="fieldError('guardianEmail')" class="field-error">{{ fieldError('guardianEmail') }}</span>
              </label>
              <label class="field">
                <span>Guardian phone</span>
                <input v-model="form.guardianPhone" type="tel" />
              </label>
            </div>
            <label class="field">
              <span>Relationship to client</span>
              <input v-model="form.guardianRelationship" type="text" placeholder="Parent, Guardian…" />
            </label>
          </div>

          <!-- Step: existing client -->
          <div v-if="currentStep.id === 'client_existing'" class="step-form">
            <p class="step-hint">Enter the client's initials so we can match your record.</p>
            <label class="field">
              <span>Client initials <span class="req">*</span></span>
              <input v-model="form.clientInitials" type="text" maxlength="12" placeholder="e.g. JDS" />
              <span v-if="fieldError('clientInitials')" class="field-error">{{ fieldError('clientInitials') }}</span>
            </label>
          </div>

          <!-- Step: tutoring details -->
          <div v-if="currentStep.id === 'tutoring_details'" class="step-form">
            <p class="step-hint">Help us match this session to your student's needs.</p>
            <div class="form-row">
              <label class="field">
                <span>Subject area</span>
                <select v-model="form.subjectArea">
                  <option value="">Select a subject</option>
                  <option v-for="s in subjectOptions" :key="s" :value="s">{{ s }}</option>
                </select>
              </label>
              <label class="field">
                <span>Grade level</span>
                <select v-model="form.clientGradeLevel">
                  <option value="">Select grade level</option>
                  <option v-for="g in gradeLevelOptions" :key="g" :value="g">{{ g }}</option>
                </select>
              </label>
            </div>
            <label class="field">
              <span>Student name</span>
              <input v-model="form.clientFullName" type="text" placeholder="Student's full name" />
            </label>
          </div>

          <!-- Step: notes -->
          <div v-if="currentStep.id === 'notes'" class="step-form">
            <label class="field">
              <span>Additional notes <span class="optional">(optional)</span></span>
              <textarea v-model="form.notes" rows="4" placeholder="Anything you'd like to share before your appointment…" />
            </label>
          </div>

          <!-- Step: assessment check (new tutoring clients only) -->
          <div v-if="currentStep.id === 'assessment_check'" class="step-intake">
            <p class="intake-intro">
              Academic evaluations help us tailor tutoring to your student's current level.
            </p>
            <p class="field-label">Does <strong>{{ form.clientFullName || 'your student' }}</strong> have academic testing or assessments from the <strong>past 3 months</strong>?</p>
            <div class="toggle-row" style="margin-top:0.5rem">
              <button class="toggle-btn" :class="{ active: form.hasRecentAssessment === true }" type="button" @click="setAssessmentAnswer(true)">Yes, they do</button>
              <button class="toggle-btn" :class="{ active: form.hasRecentAssessment === false }" type="button" @click="setAssessmentAnswer(false)">No, evaluation needed</button>
            </div>
            <span v-if="fieldError('assessment_check')" class="field-error" style="font-size:0.8rem">{{ fieldError('assessment_check') }}</span>

            <!-- Eval-required branch -->
            <template v-if="form.hasRecentAssessment === false">
              <div v-if="evalCheckLoading" class="intake-loading"><span class="spinner" /> Checking evaluator availability…</div>
              <template v-else>
                <!-- Provider CAN do evaluations: reuse selected slot as eval, pick new session slot -->
                <div v-if="providerCanEval" class="eval-notice eval-notice--same-provider">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:1.1rem;height:1.1rem;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                  <span><strong>{{ provider.displayName }}</strong> can conduct the evaluation. Your selected time will be used for the evaluation. Please pick a separate time for your first tutoring session below.</span>
                </div>
                <!-- Provider CANNOT do evaluations: show evaluator picker -->
                <div v-else class="eval-notice eval-notice--other">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:1.1rem;height:1.1rem;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                  <span>An evaluator will need to meet with <strong>{{ form.clientFullName || 'your student' }}</strong> before tutoring begins. Please select an evaluator and a time below.</span>
                </div>

                <!-- Evaluator picker (when provider cannot eval) -->
                <template v-if="!providerCanEval">
                  <div v-if="evalProvidersLoading" class="intake-loading"><span class="spinner" /> Loading evaluators…</div>
                  <div v-else-if="evalProvidersError" class="intake-error">{{ evalProvidersError }}</div>
                  <div v-else-if="evalProviders.length === 0" class="intake-empty">No evaluators available at this time. Please contact us directly.</div>
                  <div v-else class="eval-provider-list">
                    <button
                      v-for="ep in evalProviders"
                      :key="ep.providerId"
                      class="eval-provider-card"
                      :class="{ selected: form.evalProviderId === ep.providerId }"
                      type="button"
                      @click="selectEvalProvider(ep)"
                    >
                      <div class="eval-provider-avatar">
                        <img v-if="ep.profilePhotoUrl" :src="ep.profilePhotoUrl" :alt="ep.displayName" />
                        <span v-else>{{ initials(ep.displayName) }}</span>
                      </div>
                      <div class="eval-provider-info">
                        <strong>{{ ep.displayName }}</strong>
                        <span v-if="ep.title" class="muted small">{{ ep.title }}</span>
                      </div>
                    </button>
                  </div>
                </template>

                <!-- Eval slot picker (same provider or separate evaluator) -->
                <template v-if="providerCanEval || form.evalProviderId">
                  <div class="intake-week-nav" style="margin-top:0.75rem">
                    <button class="week-nav-btn" type="button" :disabled="evalWeekIsPast" @click="shiftEvalWeek(-1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
                    </button>
                    <span class="intake-week-label">{{ evalWeekLabel }}</span>
                    <button class="week-nav-btn" type="button" @click="shiftEvalWeek(1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                    </button>
                  </div>
                  <div v-if="evalSlotsLoading" class="intake-loading"><span class="spinner" /> Loading available eval times…</div>
                  <div v-else-if="evalSlotsError" class="intake-error">{{ evalSlotsError }}</div>
                  <div v-else-if="evalSlots.length === 0" class="intake-empty">No availability this week — try a different week.</div>
                  <div v-else class="intake-slots-grid">
                    <button
                      v-for="s in evalSlots"
                      :key="s.startAt"
                      class="intake-slot-chip"
                      :class="{ selected: form.evalSlot?.startAt === s.startAt }"
                      type="button"
                      @click="form.evalSlot = s"
                    >
                      <span class="chip-day">{{ slotDay(s) }}</span>
                      <span class="chip-time">{{ slotTime(s) }}</span>
                      <span class="chip-modality">{{ s.modality === 'VIRTUAL' ? 'Virtual' : 'In-person' }}</span>
                    </button>
                  </div>
                  <p v-if="form.evalSlot" class="intake-selected-summary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1rem;height:1rem;vertical-align:-2px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Evaluation: {{ formatSlotLabel(form.evalSlot) }}
                  </p>
                </template>

                <!-- Second session slot picker (when provider CAN do eval — they need a separate tutor slot) -->
                <template v-if="providerCanEval">
                  <p class="field-label" style="margin-top:1rem">Now pick a time for the tutoring session (different from the evaluation above):</p>
                  <div class="intake-week-nav">
                    <button class="week-nav-btn" type="button" :disabled="intakeWeekIsPast" @click="shiftIntakeWeek(-1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
                    </button>
                    <span class="intake-week-label">{{ intakeWeekLabel }}</span>
                    <button class="week-nav-btn" type="button" @click="shiftIntakeWeek(1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                    </button>
                  </div>
                  <div v-if="intakeSlotsLoading" class="intake-loading"><span class="spinner" /> Loading session times…</div>
                  <div v-else-if="intakeSlotsError" class="intake-error">{{ intakeSlotsError }}</div>
                  <div v-else-if="intakeSlots.length === 0" class="intake-empty">No availability this week — try a different week.</div>
                  <div v-else class="intake-slots-grid">
                    <button
                      v-for="s in intakeSlots"
                      :key="s.startAt"
                      class="intake-slot-chip"
                      :class="{ selected: form.intakeSlot?.startAt === s.startAt }"
                      type="button"
                      @click="form.intakeSlot = s"
                    >
                      <span class="chip-day">{{ slotDay(s) }}</span>
                      <span class="chip-time">{{ slotTime(s) }}</span>
                      <span class="chip-modality">{{ s.modality === 'VIRTUAL' ? 'Virtual' : 'In-person' }}</span>
                    </button>
                  </div>
                  <p v-if="form.intakeSlot" class="intake-selected-summary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1rem;height:1rem;vertical-align:-2px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Session: {{ formatSlotLabel(form.intakeSlot) }}
                  </p>
                </template>
              </template>
            </template>
          </div>

          <!-- Step: intake/evaluation -->
          <div v-if="currentStep.id === 'intake'" class="step-intake">
            <p class="intake-intro">
              An intake or evaluation helps your provider tailor the first session to your needs.
              Would you like to also schedule one?
            </p>
            <div class="toggle-row intake-toggle">
              <button class="toggle-btn" :class="{ active: form.includeIntake === true }" type="button" @click="selectIncludeIntake(true)">Yes, add intake</button>
              <button class="toggle-btn" :class="{ active: form.includeIntake === false }" type="button" @click="selectIncludeIntake(false)">Skip for now</button>
            </div>
            <span v-if="fieldError('intake')" class="field-error" style="font-size:0.8rem">{{ fieldError('intake') }}</span>

            <template v-if="form.includeIntake">
              <!-- Week nav -->
              <div class="intake-week-nav">
                <button class="week-nav-btn" type="button" :disabled="intakeWeekIsPast" @click="shiftIntakeWeek(-1)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
                </button>
                <span class="intake-week-label">{{ intakeWeekLabel }}</span>
                <button class="week-nav-btn" type="button" @click="shiftIntakeWeek(1)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                </button>
              </div>

              <div v-if="intakeSlotsLoading" class="intake-loading">
                <span class="spinner" /> Loading available times…
              </div>
              <div v-else-if="intakeSlotsError" class="intake-error">{{ intakeSlotsError }}</div>
              <div v-else-if="intakeSlots.length === 0" class="intake-empty">No availability this week — try a different week.</div>
              <div v-else class="intake-slots-grid">
                <button
                  v-for="s in intakeSlots"
                  :key="s.startAt"
                  class="intake-slot-chip"
                  :class="{ selected: form.intakeSlot?.startAt === s.startAt }"
                  type="button"
                  @click="form.intakeSlot = s"
                >
                  <span class="chip-day">{{ slotDay(s) }}</span>
                  <span class="chip-time">{{ slotTime(s) }}</span>
                  <span class="chip-modality">{{ s.modality === 'VIRTUAL' ? 'Virtual' : 'In-person' }}</span>
                </button>
              </div>
              <p v-if="form.intakeSlot" class="intake-selected-summary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1rem;height:1rem;vertical-align:-2px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Intake: {{ formatSlotLabel(form.intakeSlot) }}
              </p>
            </template>
          </div>

          <!-- Step: review -->
          <div v-if="currentStep.id === 'review'" class="step-review">
            <p class="review-section-label">Contact</p>
            <div class="review-row"><span class="review-label">Name</span><span>{{ form.name }}</span></div>
            <div class="review-row"><span class="review-label">Email</span><span>{{ form.email }}</span></div>
            <div v-if="form.phone" class="review-row"><span class="review-label">Phone</span><span>{{ form.phone }}</span></div>
            <div v-if="form.bookingMode === 'NEW_CLIENT' && form.clientFullName" class="review-row"><span class="review-label">Client</span><span>{{ form.clientFullName }}</span></div>
            <div v-if="form.bookingMode === 'CURRENT_CLIENT' && form.clientInitials" class="review-row"><span class="review-label">Client initials</span><span>{{ form.clientInitials }}</span></div>
            <div v-if="serviceType === 'tutoring' && form.subjectArea" class="review-row"><span class="review-label">Subject</span><span>{{ form.subjectArea }}</span></div>
            <div v-if="serviceType === 'tutoring' && form.clientGradeLevel" class="review-row"><span class="review-label">Grade level</span><span>{{ form.clientGradeLevel }}</span></div>
            <div v-if="form.notes" class="review-row"><span class="review-label">Notes</span><span>{{ form.notes }}</span></div>

            <p class="review-section-label" style="margin-top:1rem">Appointments requested</p>
            <div v-if="form.hasRecentAssessment === false && form.evalSlot" class="review-appt-block review-appt-block--eval">
              <span class="review-appt-role">Evaluation (first)</span>
              <span>{{ evalProviderName }}</span>
              <span class="review-appt-time">{{ formatSlotLabel(form.evalSlot) }}</span>
            </div>
            <div class="review-appt-block review-appt-block--session">
              <span class="review-appt-role">{{ form.hasRecentAssessment === false ? 'Tutoring session (after eval)' : 'Session' }}</span>
              <span>{{ provider.displayName }}</span>
              <span class="review-appt-time">{{ formatSlotLabel(form.hasRecentAssessment === false && providerCanEval && form.intakeSlot ? form.intakeSlot : slot) }}</span>
            </div>
            <div v-if="form.includeIntake && form.intakeSlot && form.hasRecentAssessment !== false" class="review-appt-block review-appt-block--intake">
              <span class="review-appt-role">Intake &amp; evaluation</span>
              <span>{{ provider.displayName }}</span>
              <span class="review-appt-time">{{ formatSlotLabel(form.intakeSlot) }}</span>
            </div>
            <div v-if="form.includeIntake && !form.intakeSlot && form.hasRecentAssessment !== false" class="review-appt-block review-appt-block--skipped">
              <span class="review-appt-role">Intake &amp; evaluation</span>
              <span style="color:#9ca3af">Not scheduled</span>
            </div>

            <p class="review-disclosure">By submitting, you agree to be contacted to confirm these appointments. No payment is collected at this time.</p>
            <div v-if="submitError" class="submit-error">{{ submitError }}</div>
          </div>
        </div>

        <!-- Step navigation -->
        <div class="wizard-footer">
          <button v-if="currentStepIdx > 0" class="btn-back" type="button" @click="prevStep">Back</button>
          <div class="footer-spacer" />
          <button
            v-if="currentStepIdx < visibleSteps.length - 1"
            class="btn-primary"
            type="button"
            :disabled="!canAdvance"
            @click="nextStep"
          >
            Continue
          </button>
          <button
            v-else
            class="btn-primary btn-submit"
            type="button"
            :disabled="submitting || !canAdvance"
            @click="submit"
          >
            <span v-if="submitting" class="spinner" />
            {{ submitting ? 'Submitting…' : 'Confirm Booking Request' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  provider: { type: Object, required: true },
  slot: { type: Object, required: true },
  agencySlug: { type: String, required: true },
  serviceType: { type: String, default: 'counseling' }
});

const emit = defineEmits(['close', 'submitted']);

const SUBJECT_OPTIONS = ['Math', 'Reading', 'Writing', 'Science', 'History', 'SAT/ACT Prep', 'Spanish', 'English', 'Study Skills', 'Other'];
const GRADE_OPTIONS = ['K–2', '3–5', '6–8', '9–12', 'College'];

const subjectOptions = computed(() => {
  const fromProfile = props.provider?.tutoringProfile?.subjectAreas;
  return Array.isArray(fromProfile) && fromProfile.length ? fromProfile : SUBJECT_OPTIONS;
});
const gradeLevelOptions = computed(() => {
  const fromProfile = props.provider?.tutoringProfile?.gradeLevels;
  return Array.isArray(fromProfile) && fromProfile.length ? fromProfile : GRADE_OPTIONS;
});

const ALL_STEPS = [
  { id: 'confirm', title: 'Confirm your appointment' },
  { id: 'about', title: 'About you' },
  { id: 'client_new', title: 'Client information', forBookingMode: 'NEW_CLIENT' },
  { id: 'client_existing', title: 'Client verification', forBookingMode: 'CURRENT_CLIENT' },
  { id: 'tutoring_details', title: 'Session details', forServiceType: 'tutoring' },
  { id: 'notes', title: 'Additional notes' },
  { id: 'assessment_check', title: 'Assessment check', forNewTutoring: true },
  { id: 'intake', title: 'Intake & evaluation' },
  { id: 'review', title: 'Review & submit' }
];

const form = ref({
  name: '',
  email: '',
  phone: '',
  bookingMode: 'NEW_CLIENT',
  clientFullName: '',
  clientInitials: '',
  guardianFirstName: '',
  guardianLastName: '',
  guardianEmail: '',
  guardianPhone: '',
  guardianRelationship: 'Parent',
  subjectArea: '',
  clientGradeLevel: '',
  notes: '',
  includeIntake: null,
  intakeSlot: null,
  // Evaluation gate fields (migration 868)
  hasRecentAssessment: null, // null = unanswered, true = has assessment, false = needs eval
  evalProviderId: null,      // separate evaluator id (when provider can't eval)
  evalSlot: null             // selected eval slot
});

// Evaluation gate state
const evalCheckLoading = ref(false);
const providerCanEval = ref(false);
const evalProviders = ref([]);
const evalProvidersLoading = ref(false);
const evalProvidersError = ref('');
const evalSlots = ref([]);
const evalSlotsLoading = ref(false);
const evalSlotsError = ref('');
const evalWeekStart = ref(new Date().toISOString().slice(0, 10));
const selectedEvalProvider = ref(null);

const evalWeekIsPast = computed(() => {
  const today = new Date().toISOString().slice(0, 10);
  return evalWeekStart.value <= today;
});

const evalWeekLabel = computed(() => {
  const d = new Date(evalWeekStart.value + 'T12:00:00');
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(d)} – ${fmt(end)}`;
});

const evalProviderName = computed(() => {
  if (providerCanEval.value) return props.provider.displayName;
  return selectedEvalProvider.value?.displayName || 'Evaluator';
});

function shiftEvalWeek(dir) {
  const d = new Date(evalWeekStart.value + 'T12:00:00');
  d.setDate(d.getDate() + dir * 7);
  const today = new Date().toISOString().slice(0, 10);
  const candidate = d.toISOString().slice(0, 10);
  if (dir < 0 && candidate < today) return;
  evalWeekStart.value = candidate;
  loadEvalSlots();
}

async function loadEvalSlots() {
  const pid = providerCanEval.value ? props.provider.providerId : form.value.evalProviderId;
  if (!pid) return;
  evalSlotsLoading.value = true;
  evalSlotsError.value = '';
  try {
    const params = new URLSearchParams({
      weekStart: evalWeekStart.value,
      bookingMode: form.value.bookingMode,
      programType: props.slot.programType || 'IN_PERSON'
    });
    const res = await api.get(
      `/public/agency-services/${encodeURIComponent(props.agencySlug)}/providers/${pid}/slots?${params}`,
      { skipAuthRedirect: true }
    );
    // Exclude the main session slot
    evalSlots.value = (res.data?.slots || []).filter((s) => s.startAt !== props.slot.startAt);
  } catch (e) {
    evalSlotsError.value = e.response?.data?.error?.message || 'Could not load evaluation times.';
  } finally {
    evalSlotsLoading.value = false;
  }
}

async function setAssessmentAnswer(hasAssessment) {
  form.value.hasRecentAssessment = hasAssessment;
  form.value.evalSlot = null;
  form.value.evalProviderId = null;
  selectedEvalProvider.value = null;
  if (!hasAssessment) {
    // Check if the selected tutor is enrolled as an evaluator
    evalCheckLoading.value = true;
    try {
      const res = await api.get(
        `/public/agency-services/${encodeURIComponent(props.agencySlug)}/evaluators?programType=${props.slot.programType || 'IN_PERSON'}`,
        { skipAuthRedirect: true }
      );
      const evals = res.data?.evaluators || [];
      const canEval = evals.some((e) => e.providerId === props.provider.providerId);
      providerCanEval.value = canEval;
      if (canEval) {
        // Reuse existing slot as eval; provider slot picker shows session alternatives
        form.value.evalProviderId = props.provider.providerId;
        form.value.evalSlot = props.slot;
        // Load session alternatives (any slot other than the selected one)
        loadIntakeSlots();
      } else {
        evalProviders.value = evals;
      }
    } catch {
      providerCanEval.value = false;
      evalProviders.value = [];
    } finally {
      evalCheckLoading.value = false;
    }
  }
}

async function selectEvalProvider(ep) {
  form.value.evalProviderId = ep.providerId;
  selectedEvalProvider.value = ep;
  form.value.evalSlot = null;
  evalSlots.value = [];
  await loadEvalSlots();
}

// Intake slot fetching state
const intakeSlots = ref([]);
const intakeSlotsLoading = ref(false);
const intakeSlotsError = ref('');
const intakeWeekStart = ref(new Date().toISOString().slice(0, 10));

const intakeWeekIsPast = computed(() => {
  const today = new Date().toISOString().slice(0, 10);
  return intakeWeekStart.value <= today;
});

const intakeWeekLabel = computed(() => {
  const d = new Date(intakeWeekStart.value + 'T12:00:00');
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(d)} – ${fmt(end)}`;
});

function shiftIntakeWeek(dir) {
  const d = new Date(intakeWeekStart.value + 'T12:00:00');
  d.setDate(d.getDate() + dir * 7);
  const today = new Date().toISOString().slice(0, 10);
  const candidate = d.toISOString().slice(0, 10);
  if (dir < 0 && candidate < today) return;
  intakeWeekStart.value = candidate;
  loadIntakeSlots();
}

async function loadIntakeSlots() {
  if (!form.value.includeIntake) return;
  intakeSlotsLoading.value = true;
  intakeSlotsError.value = '';
  try {
    const params = new URLSearchParams({
      weekStart: intakeWeekStart.value,
      bookingMode: form.value.bookingMode,
      programType: props.slot.programType || 'IN_PERSON'
    });
    const res = await api.get(
      `/public/agency-services/${encodeURIComponent(props.agencySlug)}/providers/${props.provider.providerId}/slots?${params}`,
      { skipAuthRedirect: true }
    );
    // Exclude the already-selected session slot
    intakeSlots.value = (res.data?.slots || []).filter(
      (s) => s.startAt !== props.slot.startAt
    );
  } catch (e) {
    intakeSlotsError.value = e.response?.data?.error?.message || 'Could not load available times.';
  } finally {
    intakeSlotsLoading.value = false;
  }
}

function selectIncludeIntake(val) {
  form.value.includeIntake = val;
  if (!val) {
    form.value.intakeSlot = null;
  } else {
    loadIntakeSlots();
  }
}

const fieldErrors = ref({});
const submitError = ref('');
const submitting = ref(false);
const submitted = ref(false);
const currentStepIdx = ref(0);

const visibleSteps = computed(() => {
  return ALL_STEPS.filter((s) => {
    if (s.forBookingMode) return s.forBookingMode === form.value.bookingMode;
    if (s.forServiceType) return s.forServiceType === props.serviceType;
    // assessment_check: only for new tutoring clients
    if (s.forNewTutoring) return props.serviceType === 'tutoring' && form.value.bookingMode === 'NEW_CLIENT';
    // Hide the old optional intake step when eval path is active (eval-required path handles it)
    if (s.id === 'intake') return !(props.serviceType === 'tutoring' && form.value.bookingMode === 'NEW_CLIENT');
    return true;
  });
});

const currentStep = computed(() => visibleSteps.value[currentStepIdx.value] || visibleSteps.value[0]);
const progressPct = computed(() => Math.round(((currentStepIdx.value + 1) / visibleSteps.value.length) * 100));

function fieldError(key) {
  return fieldErrors.value[key] || null;
}

function validateStep(step) {
  const errs = {};
  if (step.id === 'about') {
    if (!form.value.name.trim()) errs.name = 'Name is required';
    if (!form.value.email.trim() || !/^[^@]+@[^@]+\.[^@]+$/.test(form.value.email)) errs.email = 'Valid email required';
  }
  if (step.id === 'client_new') {
    if (!form.value.clientFullName.trim()) errs.clientFullName = 'Client name is required';
    if (!form.value.guardianFirstName.trim()) errs.guardianFirstName = 'Guardian first name is required';
    if (!form.value.guardianEmail.trim() || !/^[^@]+@[^@]+\.[^@]+$/.test(form.value.guardianEmail)) errs.guardianEmail = 'Valid guardian email required';
  }
  if (step.id === 'client_existing') {
    if (!form.value.clientInitials.trim()) errs.clientInitials = 'Client initials are required';
  }
  if (step.id === 'intake') {
    if (form.value.includeIntake === null) errs.intake = 'Please choose whether to add an intake appointment.';
  }
  if (step.id === 'assessment_check') {
    if (form.value.hasRecentAssessment === null) errs.assessment_check = 'Please answer the assessment question.';
    if (form.value.hasRecentAssessment === false) {
      if (!form.value.evalSlot) errs.assessment_check = 'Please select an evaluation time.';
      else if (!providerCanEval.value && !form.value.evalProviderId) errs.assessment_check = 'Please select an evaluator.';
    }
  }
  fieldErrors.value = errs;
  return Object.keys(errs).length === 0;
}

const canAdvance = computed(() => {
  const step = currentStep.value;
  if (step.id === 'about') return form.value.name.trim() && form.value.email.trim();
  if (step.id === 'client_new') return form.value.clientFullName.trim() && form.value.guardianFirstName.trim() && form.value.guardianEmail.trim();
  if (step.id === 'client_existing') return form.value.clientInitials.trim();
  if (step.id === 'intake') return form.value.includeIntake !== null;
  if (step.id === 'assessment_check') {
    if (form.value.hasRecentAssessment === null) return false;
    if (form.value.hasRecentAssessment === false) {
      if (!form.value.evalSlot) return false;
      if (!providerCanEval.value && !form.value.evalProviderId) return false;
    }
    return true;
  }
  return true;
});

function nextStep() {
  if (!validateStep(currentStep.value)) return;
  if (currentStepIdx.value < visibleSteps.value.length - 1) {
    currentStepIdx.value++;
  }
}

function prevStep() {
  if (currentStepIdx.value > 0) currentStepIdx.value--;
}

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function formatSlotLabel(s) {
  if (!s?.startAt) return '';
  const d = new Date(s.startAt);
  const end = new Date(s.endAt);
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const startTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dateStr}, ${startTime} – ${endTime}`;
}

function slotDay(s) {
  return new Date(s.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function slotTime(s) {
  return new Date(s.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Reload intake slots when the intake step becomes visible
watch(currentStep, (step) => {
  if (step?.id === 'intake' && form.value.includeIntake === true && intakeSlots.value.length === 0) {
    loadIntakeSlots();
  }
});

async function submit() {
  if (!validateStep(currentStep.value)) return;
  submitting.value = true;
  submitError.value = '';
  try {
    const f = form.value;
    const evalRequired = f.hasRecentAssessment === false;
    // When provider CAN eval: main slot = tutoring session (pendingEval), evalSlot = props.slot
    // When provider CANNOT eval: main slot = props.slot (tutoring session), evalSlot = f.evalSlot
    const sessionSlot = (evalRequired && providerCanEval.value && f.intakeSlot) ? f.intakeSlot : props.slot;
    const evalSlotToSend = evalRequired ? (providerCanEval.value ? props.slot : f.evalSlot) : null;

    const payload = {
      serviceType: props.serviceType,
      providerId: props.provider.providerId,
      modality: sessionSlot.modality || (sessionSlot.programType === 'VIRTUAL' ? 'VIRTUAL' : 'IN_PERSON'),
      bookingMode: f.bookingMode,
      programType: sessionSlot.programType || 'IN_PERSON',
      startAt: sessionSlot.startAt,
      endAt: sessionSlot.endAt,
      name: f.name,
      email: f.email,
      phone: f.phone || null,
      notes: f.notes || null,
      clientInitials: f.bookingMode === 'CURRENT_CLIENT' ? f.clientInitials : null,
      clientFullName: f.clientFullName || null,
      guardianFirstName: f.guardianFirstName || null,
      guardianLastName: f.guardianLastName || null,
      guardianEmail: f.guardianEmail || null,
      guardianPhone: f.guardianPhone || null,
      guardianRelationship: f.guardianRelationship || 'Parent',
      subjectArea: props.serviceType === 'tutoring' ? (f.subjectArea || null) : null,
      clientGradeLevel: props.serviceType === 'tutoring' ? (f.clientGradeLevel || null) : null,
      // Evaluation gate fields (migration 868)
      evalRequired,
      evalProviderId: evalRequired ? (providerCanEval.value ? props.provider.providerId : f.evalProviderId) : null,
      evalStartAt: evalSlotToSend?.startAt || null,
      evalEndAt: evalSlotToSend?.endAt || null,
      // Legacy intake (only when no eval required)
      intakeAppointment: !evalRequired && f.includeIntake && f.intakeSlot ? {
        startAt: f.intakeSlot.startAt,
        endAt: f.intakeSlot.endAt,
        modality: f.intakeSlot.modality || (f.intakeSlot.programType === 'VIRTUAL' ? 'VIRTUAL' : 'IN_PERSON')
      } : null
    };
    await api.post(`/public/agency-services/${encodeURIComponent(props.agencySlug)}/requests`, payload, { skipAuthRedirect: true });
    submitted.value = true;
    emit('submitted');
  } catch (e) {
    submitError.value = e.response?.data?.error?.message || e.message || 'Failed to submit. Please try again.';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
/* Overlay */
.wizard-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}
@media (min-width: 640px) {
  .wizard-overlay { align-items: center; }
}
.wizard-panel {
  /* Inherits --agency-primary-color / --agency-accent-color from :root (set by branding store) */
  --wiz-p: var(--agency-primary-color, #4338ca);
  --wiz-a: var(--agency-accent-color, #6366f1);
  --wiz-a-tint: color-mix(in srgb, var(--wiz-a) 14%, white);
  --wiz-a-soft: color-mix(in srgb, var(--wiz-a) 20%, white);
  --wiz-p-dark: color-mix(in srgb, var(--wiz-p) 80%, black);
  position: relative;
  background: #fff;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  border-radius: 1.25rem 1.25rem 0 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
@media (min-width: 640px) {
  .wizard-panel { border-radius: 1.25rem; }
}

.wizard-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 2rem;
  height: 2rem;
  border: none;
  background: #f3f4f6;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.wizard-close svg { width: 1rem; height: 1rem; }

/* Progress bar */
.wizard-progress {
  height: 3px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
  margin: 0;
}
.progress-fill {
  height: 100%;
  background: var(--wiz-a);
  transition: width 0.3s ease;
}

/* Header */
.wizard-header {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1.5rem 1.5rem 0;
}
.wiz-avatar {
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.wiz-avatar-fallback {
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  background: var(--wiz-a-tint);
  color: var(--wiz-p);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.wizard-header-text h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.2rem;
}
.wizard-slot-label {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
}

/* Body */
.wizard-body {
  padding: 1.5rem;
  flex: 1;
  overflow-y: auto;
}

/* Step: confirm */
.slot-summary { display: flex; flex-direction: column; gap: 0.875rem; }
.slot-summary-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.95rem;
  color: #374151;
}
.srow-icon { width: 1.1rem; height: 1.1rem; flex-shrink: 0; color: #6b7280; }

/* Forms */
.step-form { display: flex; flex-direction: column; gap: 1rem; }
.step-hint { font-size: 0.875rem; color: #6b7280; margin: 0 0 0.5rem; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
@media (max-width: 480px) { .form-row { grid-template-columns: 1fr; } }

.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field span { font-size: 0.8125rem; font-weight: 500; color: #374151; }
.field input, .field select, .field textarea {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;
  background: #fff;
}
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--wiz-a); }
.field-label { font-size: 0.8125rem; font-weight: 500; color: #374151; margin: 0 0 0.5rem; }
.field-error { font-size: 0.78rem; color: #dc2626; }
.req { color: #dc2626; }
.optional { color: #9ca3af; font-weight: 400; }

/* Booking type toggle */
.booking-type-toggle { display: flex; flex-direction: column; gap: 0.5rem; }
.toggle-row { display: flex; gap: 0.5rem; }
.toggle-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1.5px solid #d1d5db;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.15s;
}
.toggle-btn.active {
  border-color: var(--wiz-a);
  background: var(--wiz-a-soft);
  color: var(--wiz-p);
}

/* Review */
.step-review { display: flex; flex-direction: column; gap: 0.75rem; }
.review-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  font-size: 0.9rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #f3f4f6;
}
.review-label { font-weight: 500; color: #6b7280; flex-shrink: 0; width: 8rem; }
.review-disclosure { font-size: 0.775rem; color: #9ca3af; margin: 0.5rem 0 0; line-height: 1.5; }
.submit-error { color: #dc2626; font-size: 0.875rem; padding: 0.5rem 0; }

/* Footer */
.wizard-footer {
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem 1.5rem;
  border-top: 1px solid #f3f4f6;
  gap: 0.75rem;
}
.footer-spacer { flex: 1; }
.btn-back {
  padding: 0.625rem 1.25rem;
  border: 1.5px solid #d1d5db;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.btn-primary {
  padding: 0.625rem 1.5rem;
  background: var(--wiz-p);
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) { background: var(--wiz-p-dark); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Confirmation */
.wizard-confirm {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem 2rem;
  text-align: center;
}
.confirm-icon {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background: #dcfce7;
  color: #16a34a;
  display: flex;
  align-items: center;
  justify-content: center;
}
.confirm-icon svg { width: 2rem; height: 2rem; }
.wizard-confirm h2 { font-size: 1.35rem; font-weight: 700; margin: 0; }
.wizard-confirm p { color: #6b7280; margin: 0; font-size: 0.9rem; }
.confirm-detail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 0.875rem 1.5rem;
  font-size: 0.9rem;
  width: 100%;
}
.confirm-detail--intake { background: var(--wiz-a-tint); border-color: color-mix(in srgb, var(--wiz-a) 30%, white); }
.confirm-appt-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--wiz-p); opacity: 0.8; }

/* Intake step */
.step-intake { display: flex; flex-direction: column; gap: 1rem; }
.intake-intro { font-size: 0.9rem; color: #374151; margin: 0; line-height: 1.6; }
.intake-toggle { margin-bottom: 0.5rem; }
.intake-week-nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.5rem 0 0.25rem;
}
.intake-week-label { flex: 1; text-align: center; font-size: 0.875rem; font-weight: 600; color: #111827; }
.week-nav-btn {
  width: 2rem; height: 2rem;
  border: 1.5px solid #d1d5db;
  border-radius: 0.375rem;
  background: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #6b7280;
}
.week-nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.week-nav-btn svg { width: 1rem; height: 1rem; }
.intake-loading, .intake-error, .intake-empty {
  font-size: 0.875rem;
  color: #6b7280;
  padding: 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.intake-error { color: #dc2626; }
.intake-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
  max-height: 280px;
  overflow-y: auto;
}
.intake-slot-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 0.5rem 0.75rem;
  border: 1.5px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.12s, background 0.12s;
}
.intake-slot-chip:hover { border-color: var(--wiz-a); background: var(--wiz-a-tint); }
.intake-slot-chip.selected { border-color: var(--wiz-a); background: var(--wiz-a-soft); }
.chip-day { font-size: 0.75rem; font-weight: 600; color: #111827; }
.chip-time { font-size: 0.875rem; font-weight: 700; color: var(--wiz-p); }
.chip-modality { font-size: 0.7rem; color: #9ca3af; }
.intake-selected-summary {
  font-size: 0.825rem;
  color: #16a34a;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  background: #f0fdf4;
  border-radius: 0.375rem;
}

/* Review section labels */
.review-section-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af;
  margin: 0.75rem 0 0.25rem;
}
.review-appt-block {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}
.review-appt-block--intake { background: var(--wiz-a-tint); border-color: color-mix(in srgb, var(--wiz-a) 30%, white); }
.review-appt-block--eval { background: #fff7ed; border-color: #fed7aa; }
.review-appt-block--skipped { opacity: 0.5; }
.review-appt-role { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--wiz-p); }
.review-appt-time { font-size: 0.8125rem; color: #6b7280; }

/* Evaluation gate */
.eval-notice {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
}
.eval-notice--same-provider { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.eval-notice--other { background: #fff7ed; border: 1px solid #fed7aa; color: #92400e; }
.eval-provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 220px;
  overflow-y: auto;
}
.eval-provider-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  border: 1.5px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.12s, background 0.12s;
}
.eval-provider-card:hover { border-color: var(--wiz-a); background: var(--wiz-a-tint); }
.eval-provider-card.selected { border-color: var(--wiz-a); background: var(--wiz-a-soft); }
.eval-provider-avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--wiz-a-tint);
  color: var(--wiz-p);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}
.eval-provider-avatar img { width: 100%; height: 100%; object-fit: cover; }
.eval-provider-info { display: flex; flex-direction: column; gap: 1px; font-size: 0.875rem; }
.confirm-detail--eval { background: #fff7ed; border-color: #fed7aa; }
</style>
