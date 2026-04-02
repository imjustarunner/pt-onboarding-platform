<template>
  <div class="public-intake container">
    <div v-if="loading" class="loading">{{ loadingText }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="intake-card">
      <button
        v-if="isSuperAdmin"
        class="btn btn-secondary btn-sm dev-fill-button"
        type="button"
        @click="fillExample"
      >
        Dev Fill
      </button>
      <h2>{{ link?.title || defaultTitle }}</h2>
      <p v-if="link?.description" class="muted">{{ link.description }}</p>
      <div v-if="draftRestoredMessage" class="draft-restored-banner">{{ draftRestoredMessage }}</div>

      <div v-if="step === -1" class="step cover-step">
        <div class="cover-card">
          <div v-for="screen in introScreens" :key="screen.key" class="cover-logo">
            <img v-if="screen.logoUrl" :src="screen.logoUrl" :alt="screen.altText" />
            <div class="cover-title">{{ screen.displayName }}</div>
          </div>
          <div class="cover-subtitle">
            {{ beginSubtitleText }}
          </div>

          <div v-if="showCaptchaGate" class="captcha-block captcha-block-start">
            <div class="muted">{{ t('protectedByRecaptcha') }}</div>
            <div v-if="showRecaptchaWidget" class="recaptcha-verify-first">
              {{ t('verifyHumanFirst') }}
            </div>
            <div v-if="captchaError" class="error">{{ captchaError }}</div>
            <div class="recaptcha-widget">
              <div id="recaptcha-widget-start" ref="recaptchaWidgetElStart" />
              <div v-if="captchaWidgetFailed" class="muted" style="margin-top: 6px; color: var(--warning, #b8860b);">
                Verification widget failed to load. Please refresh the page.
              </div>
              <div v-else-if="!captchaToken" class="muted" style="margin-top: 6px;">
                {{ t('completeCaptchaToContinue') }}
              </div>
            </div>
          </div>

          <div class="actions">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="(requiresCaptchaAtStart && (!showRecaptchaWidget || !captchaToken)) || consentLoading"
              @click="beginIntakeSession"
            >
              {{ beginIntakeButtonText }}
            </button>
          </div>
          <div v-if="beginError" class="error" style="margin-top: 10px;">{{ beginError }}</div>
        </div>
      </div>

      <div v-else-if="step === 0" class="step cover-step">
        <div class="cover-card">
          <div class="cover-logo" v-if="currentIntro?.logoUrl">
            <img :src="currentIntro.logoUrl" :alt="currentIntro.altText" />
          </div>
          <div class="cover-title">{{ currentIntro?.displayName || t('welcome') }}</div>
          <div v-if="currentIntro?.subtitle" class="cover-subtitle">{{ currentIntro.subtitle }}</div>
          <div v-if="introIndex === 0" class="cover-subtitle">
            {{ t('formTimeLimit') }}
          </div>
          <div v-if="isJobApplication && introIndex === introScreens.length - 1 && jobDescriptionSummary" class="job-ack-card">
            <h4>{{ jobDescriptionSummary.title || 'Job description' }}</h4>
            <p v-if="jobDescriptionSummary.descriptionText" class="muted job-ack-text">{{ jobDescriptionSummary.descriptionText }}</p>
            <div v-if="jobDescriptionSummary.fileUrl" class="job-ack-file">
              <div class="muted small" style="margin-bottom: 8px;">
                Attached description{{ jobDescriptionSummary.fileName ? `: ${jobDescriptionSummary.fileName}` : '' }}
              </div>
              <div class="job-ack-zoom-controls">
                <button type="button" class="btn btn-secondary btn-xs" @click="decreaseJobAckPdfZoom">-</button>
                <span class="muted small">Zoom {{ jobAckPdfZoom }}%</span>
                <button type="button" class="btn btn-secondary btn-xs" @click="increaseJobAckPdfZoom">+</button>
              </div>
              <iframe
                class="job-ack-pdf"
                :src="jobAckPdfViewerUrl"
                title="Job description PDF"
              />
              <div style="margin-top: 8px;">
                <a :href="jobDescriptionSummary.fileUrl" target="_blank" rel="noopener noreferrer">Open full PDF</a>
              </div>
            </div>
            <label class="checkbox-row">
              <input v-model="jobDescriptionAcknowledged" type="checkbox" />
              <span>I have read and acknowledge this job description.</span>
            </label>
          </div>
          <div class="actions">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="isJobApplication && introIndex === introScreens.length - 1 && !jobDescriptionAcknowledged"
              @click="advanceIntro"
            >
              {{ t('acknowledgeAndContinue') }}
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="step === 1" class="step">
        <SmartSchoolRoiFlow
          v-if="isSmartSchoolRoi"
          :public-key="publicKey"
          :session-token="sessionToken"
          :roi-context="roiContext"
          :link="link"
          :bound-client="boundClient"
          @completed="handleSmartRoiCompleted"
        />
        <div v-else>
        <h3>{{ t('questions') }}</h3>
        <div v-if="stepError" class="error" style="margin-bottom: 10px;">{{ stepError }}</div>

        <div v-if="!isMedicalRecordsRequest && !isJobApplication && !isClientBound" class="form-group">
          <label>{{ t('whoIsIntakeFor') }}</label>
          <div class="radio-group">
            <label class="radio-row">
              <input type="radio" name="intakeForSelf" :value="true" v-model="intakeForSelf" />
              <span>{{ t('myself') }}</span>
            </label>
            <label class="radio-row">
              <input type="radio" name="intakeForSelf" :value="false" v-model="intakeForSelf" />
              <span>{{ t('myDependents') }}</span>
            </label>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>{{ (intakeForSelf || isMedicalRecordsRequest || isJobApplication) ? t('yourFirstName') : t('guardianFirstName') }}</label>
            <input
              id="guardianFirstName"
              v-model="guardianFirstName"
              type="text"
              :class="{ 'input-error': !!consentErrors.guardianFirstName }"
            />
            <div v-if="consentErrors.guardianFirstName" class="error-text">{{ consentErrors.guardianFirstName }}</div>
          </div>
          <div class="form-group">
            <label>{{ (intakeForSelf || isMedicalRecordsRequest || isJobApplication) ? t('yourLastName') : t('guardianLastName') }}</label>
            <input
              id="guardianLastName"
              v-model="guardianLastName"
              type="text"
              :class="{ 'input-error': !!consentErrors.guardianLastName }"
            />
            <div v-if="consentErrors.guardianLastName" class="error-text">{{ consentErrors.guardianLastName }}</div>
          </div>
          <div class="form-group">
            <label>{{ (intakeForSelf || isMedicalRecordsRequest || isJobApplication) ? t('yourEmail') : t('guardianEmail') }}</label>
            <input
              id="guardianEmail"
              v-model="guardianEmail"
              type="email"
              :class="{ 'input-error': !!consentErrors.guardianEmail }"
            />
            <div v-if="consentErrors.guardianEmail" class="error-text">{{ consentErrors.guardianEmail }}</div>
            <div v-if="usesRegistrationFeatures && registrationAccountLookupChecked && registrationAccountExists" class="muted" style="margin-top:4px;">
              Existing account found. This form will use a shorter path for returning users.
            </div>
            <div v-else-if="usesRegistrationFeatures && registrationAccountLookupChecked && !registrationAccountExists" class="muted" style="margin-top:4px;">
              No existing account found. You will complete the full new-user steps.
            </div>
            <div v-if="usesRegistrationFeatures && isExistingClientByMatch" class="muted" style="margin-top:4px;">
              Existing client record matched for this school (initials + affiliation). Some steps may be shortened.
            </div>
          </div>
          <div class="form-group">
            <label>
              {{
                isJobApplication
                  ? 'Applicant phone'
                  : ((intakeForSelf || isMedicalRecordsRequest) ? t('yourPhoneOptional') : t('guardianPhoneOptional'))
              }}
            </label>
            <input
              id="guardianPhone"
              v-model="guardianPhone"
              type="tel"
              :class="{ 'input-error': !!consentErrors.guardianPhone }"
            />
            <div v-if="consentErrors.guardianPhone" class="error-text">{{ consentErrors.guardianPhone }}</div>
          </div>
          <div v-if="isJobApplication" class="form-group" style="grid-column: 1 / -1;">
            <label>Languages spoken fluently</label>
            <input
              v-model="fluentLanguagesInput"
              type="text"
              placeholder="e.g., English, Spanish, ASL"
            />
            <div class="muted small" style="margin-top:4px;">Add comma-separated languages.</div>
          </div>
          <div v-if="!isMedicalRecordsRequest && !isJobApplication && !intakeForSelf" class="form-group">
            <label>{{ t('relationship') }}</label>
            <input v-model="guardianRelationship" type="text" :placeholder="t('relationshipPlaceholder')" />
          </div>
        </div>

        <div v-if="visibleGuardianFields.length" class="custom-fields">
          <h4>{{ guardianSectionTitle }}</h4>
          <div class="form-grid">
            <div v-for="field in visibleGuardianFields" :key="field.key" class="form-group">
              <div v-if="field.type === 'info'" class="info-block">
                <div class="info-title">{{ field.label || t('notice') }}</div>
                <div v-if="field.helperText" class="info-text">{{ field.helperText }}</div>
              </div>
              <template v-else>
              <label>
                {{ field.label }}
                <span v-if="field.required" class="required-indicator">*</span>
              </label>
              <div v-if="field.helperText" class="helper-text">{{ field.helperText }}</div>
              <input
                v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
                :type="field.type || 'text'"
                v-model="intakeResponses.guardian[field.key]"
                :required="!!field.required"
                :placeholder="field.placeholder || ''"
                @blur="maybeAutofillGuardianLocation(field)"
              />
              <textarea
                v-else-if="field.type === 'textarea'"
                v-model="intakeResponses.guardian[field.key]"
                :placeholder="field.placeholder || ''"
                rows="3"
              />
              <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                <input v-model="intakeResponses.guardian[field.key]" type="checkbox" />
                <span>{{ field.label }}</span>
              </label>
              <select v-else-if="field.type === 'select'" v-model="intakeResponses.guardian[field.key]" @blur="maybeAutofillGuardianLocation(field)">
                <option value="">{{ t('selectOption') }}</option>
                <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                  {{ opt.label || opt.value }}
                </option>
              </select>
              <div v-else-if="field.type === 'radio'" class="radio-group">
                <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                  <input type="radio" :name="`guardian_${field.key}`" :value="opt.value || opt.label" v-model="intakeResponses.guardian[field.key]" />
                  <span>{{ opt.label || opt.value }}</span>
                </label>
              </div>
              <input v-else v-model="intakeResponses.guardian[field.key]" type="date" @blur="maybeAutofillGuardianLocation(field)" />
              </template>
            </div>
          </div>
        </div>

        <div v-if="visibleSubmissionFields.length" class="custom-fields">
          <h4>{{ t('oneTimeQuestions') }}</h4>
          <div class="muted" style="margin-bottom: 10px;">
            {{ t('oneTimeQuestionsDesc') }}
          </div>
          <div class="form-grid">
            <div v-for="field in visibleSubmissionFields" :key="field.key" class="form-group">
              <div v-if="field.type === 'info'" class="info-block">
                <div class="info-title">{{ field.label || t('notice') }}</div>
                <div v-if="field.helperText" class="info-text">{{ field.helperText }}</div>
              </div>
              <template v-else>
              <label>
                {{ field.label }}
                <span v-if="field.required" class="required-indicator">*</span>
              </label>
              <div v-if="field.helperText" class="helper-text">{{ field.helperText }}</div>
              <input
                v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
                :type="field.type || 'text'"
                v-model="intakeResponses.submission[field.key]"
                :required="!!field.required"
                :placeholder="field.placeholder || ''"
              />
              <textarea
                v-else-if="field.type === 'textarea'"
                v-model="intakeResponses.submission[field.key]"
                :placeholder="field.placeholder || ''"
                rows="3"
              />
              <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                <input v-model="intakeResponses.submission[field.key]" type="checkbox" />
                <span>{{ field.label }}</span>
              </label>
              <select v-else-if="field.type === 'select'" v-model="intakeResponses.submission[field.key]">
                <option value="">{{ t('selectOption') }}</option>
                <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                  {{ opt.label || opt.value }}
                </option>
              </select>
              <div v-else-if="field.type === 'radio'" class="radio-group">
                <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                  <input type="radio" :name="`submission_${field.key}`" :value="opt.value || opt.label" v-model="intakeResponses.submission[field.key]" />
                  <span>{{ opt.label || opt.value }}</span>
                </label>
              </div>
              <input v-else v-model="intakeResponses.submission[field.key]" type="date" />
              </template>
            </div>
          </div>
        </div>

        <div v-if="isClientBound && !isMedicalRecordsRequest && !isJobApplication" class="bound-client-card">
          <div class="bound-client-label">Client</div>
          <div class="bound-client-name">{{ boundClientDisplayName }}</div>
          <div class="muted">This signing link is already assigned to this client.</div>
        </div>

        <div v-if="!isMedicalRecordsRequest && !isJobApplication && !isClientBound && !intakeForSelf" class="clients-block">
          <div class="clients-header">
            <h4>{{ intakeForSelf ? t('client') : t('clients') }}</h4>
          </div>
          <div v-for="(c, idx) in clients" :key="idx" class="client-card" :class="{ 'client-card-alt': idx % 2 === 1 }">
            <div class="client-card-header">
              <strong>{{ intakeForSelf ? t('yourInformation') : (t('clientN') + ' ' + (idx + 1)) }}</strong>
              <button v-if="clients.length > 1" class="btn btn-secondary btn-sm" type="button" @click="removeClient(idx)">{{ t('remove') }}</button>
            </div>
            <div class="form-grid">
                <div v-if="!intakeForSelf" class="form-group">
                  <label>{{ t('clientFirstName') }}</label>
                  <input
                    :id="`clientFirstName_${idx}`"
                    v-model="c.firstName"
                    type="text"
                    :class="{ 'input-error': idx === 0 && !!consentErrors.clientFirstName }"
                  />
                  <div v-if="idx === 0 && consentErrors.clientFirstName" class="error-text">{{ consentErrors.clientFirstName }}</div>
                </div>
                <div v-if="!intakeForSelf" class="form-group">
                  <label>{{ t('clientLastName') }}</label>
                  <input
                    :id="`clientLastName_${idx}`"
                    v-model="c.lastName"
                    type="text"
                    :class="{ 'input-error': idx === 0 && !!consentErrors.clientLastName }"
                  />
                  <div v-if="idx === 0 && consentErrors.clientLastName" class="error-text">{{ consentErrors.clientLastName }}</div>
                </div>
                <div v-else class="form-group">
                  <div class="muted">{{ t('clientNameUsesYours') }}</div>
                </div>
              <div v-if="requiresOrganizationId" class="form-group">
                <label>{{ t('organizationId') }}</label>
              <input id="organizationId" v-model="organizationId" type="number" :class="{ 'input-error': !!consentErrors.organizationId }" />
              <div v-if="consentErrors.organizationId" class="error-text">{{ consentErrors.organizationId }}</div>
              </div>
            </div>

            <div v-if="clientFields.length && !intakeForSelf" class="custom-fields">
              <h4>{{ t('clientQuestions') }}</h4>
              <div class="muted" style="margin-bottom: 10px;">
                {{ t('clientQuestionsDesc') }}
              </div>
              <div class="form-grid">
              <div v-for="field in visibleClientFields(idx)" :key="`${idx}-${field.key}`" class="form-group">
                <div v-if="field.type === 'info'" class="info-block">
                  <div class="info-title">{{ field.label || t('notice') }}</div>
                  <div v-if="field.helperText" class="info-text">{{ field.helperText }}</div>
                </div>
                <template v-else>
                <label>
                  {{ field.label }}
                  <span v-if="field.required" class="required-indicator">*</span>
                </label>
                <div v-if="field.helperText" class="helper-text">{{ field.helperText }}</div>
                <input
                  v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
                  :type="field.type || 'text'"
                  v-model="intakeResponses.clients[idx][field.key]"
                  :required="!!field.required"
                  :placeholder="field.placeholder || ''"
                  @blur="maybeAutofillLocation(idx, field)"
                />
                <textarea
                  v-else-if="field.type === 'textarea'"
                  v-model="intakeResponses.clients[idx][field.key]"
                  :placeholder="field.placeholder || ''"
                  rows="3"
                />
                <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                  <input v-model="intakeResponses.clients[idx][field.key]" type="checkbox" />
                  <span>{{ field.label }}</span>
                </label>
                <select v-else-if="field.type === 'select'" v-model="intakeResponses.clients[idx][field.key]">
                  <option value="">{{ t('selectOption') }}</option>
                  <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                    {{ opt.label || opt.value }}
                  </option>
                </select>
                <div v-else-if="field.type === 'radio'" class="radio-group">
                  <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                    <input type="radio" :name="`client_${idx}_${field.key}`" :value="opt.value || opt.label" v-model="intakeResponses.clients[idx][field.key]" />
                    <span>{{ opt.label || opt.value }}</span>
                  </label>
                </div>
                <input v-else v-model="intakeResponses.clients[idx][field.key]" type="date" />
                </template>
              </div>
              </div>
            </div>
          </div>

          <div v-if="!intakeForSelf" class="clients-footer">
            <button class="btn btn-secondary btn-sm" type="button" @click="addClient">{{ t('addAnotherChild') }}</button>
            <div class="muted">{{ t('addAnotherDesc') }}</div>
          </div>
        </div>

        <div v-if="visibleQuestionFields.length" class="field-inputs">
          <h4>{{ t('additionalQuestions') }}</h4>
          <div
            v-for="field in visibleQuestionFields"
            :key="field.id"
            class="form-group"
            :class="{ 'required-missing-glow': isQuestionFieldMissing(field) }"
            :data-question-key="field.key"
          >
            <div v-if="field.type === 'info'" class="info-block">
              <div class="info-title">{{ field.label || t('notice') }}</div>
              <div v-if="field.helperText" class="info-text">{{ field.helperText }}</div>
            </div>
            <template v-else>
              <label>
                {{ field.label || field.key }}
                <span v-if="field.required" class="required-indicator">*</span>
              </label>
              <div v-if="field.helperText" class="helper-text">{{ field.helperText }}</div>
              <input
                v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
                v-model="questionValues[field.key]"
                type="text"
                :class="{ 'input-error': isQuestionFieldMissing(field) }"
                @blur="maybeAutofillQuestionLocation(field)"
              />
              <textarea
                v-else-if="field.type === 'textarea'"
                v-model="questionValues[field.key]"
                rows="4"
                :class="{ 'input-error': isQuestionFieldMissing(field) }"
              ></textarea>
              <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                <input v-model="questionValues[field.key]" type="checkbox" :class="{ 'input-error': isQuestionFieldMissing(field) }" />
                <span>{{ field.label || field.key }}</span>
              </label>
              <select v-else-if="field.type === 'select'" v-model="questionValues[field.key]" :class="{ 'input-error': isQuestionFieldMissing(field) }">
                <option value="">{{ t('selectOption') }}</option>
                <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                  {{ opt.label || opt.value }}
                </option>
              </select>
              <div v-else-if="field.type === 'radio'" class="radio-group" :class="{ 'input-error': isQuestionFieldMissing(field) }">
                <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row" :class="{ 'input-error': isQuestionFieldMissing(field) }">
                  <input type="radio" :name="`q_${field.key}`" :value="opt.value || opt.label" v-model="questionValues[field.key]" />
                  <span>{{ opt.label || opt.value }}</span>
                </label>
              </div>
              <input v-else v-model="questionValues[field.key]" type="date" :class="{ 'input-error': isQuestionFieldMissing(field) }" />
            </template>
          </div>
        </div>

        <div class="consent-box">
          <strong>ESIGN Act Disclosure</strong>
          <p>
            By continuing, you consent to electronically sign these documents and receive electronic records.
            You may request paper copies from the organization.
          </p>
        </div>
        <div class="muted" style="margin-top: 8px;">
          This session expires after approximately {{ sessionExpiryMinutes }} minutes of inactivity. Unsaved data is deleted.
        </div>

        <div class="actions">
          <button
            class="btn btn-primary"
            type="button"
            :disabled="consentLoading"
            @click="submitConsent"
          >
            {{ consentLoading ? t('saving') : t('iConsentContinue') }}
          </button>
          <button class="btn btn-outline" type="button" @click="cancelIntake" :disabled="consentLoading || submitLoading">
            Cancel & delete
          </button>
          <button class="btn btn-outline" type="button" @click="restartIntake" :disabled="consentLoading || submitLoading">
            Restart
          </button>
        </div>
        </div>
      </div>

        <div v-else-if="step === 2 && currentFlowStep?.type !== 'questions'" class="step">
        <h3 v-if="currentFlowStep?.type === 'document'">Document</h3>
        <h3 v-else-if="currentFlowStep?.type === 'upload'">{{ currentFlowStep?.label || 'Upload' }}</h3>
        <h3 v-else-if="currentFlowStep?.type === 'school_roi'">School ROI</h3>
        <h3 v-else-if="currentFlowStep?.type === 'registration'">{{ currentFlowStep?.label || 'Registration' }}</h3>
        <h3 v-else-if="currentFlowStep?.type === 'guardian_waiver'">
          {{ currentFlowStep?.label || 'Guardian waivers & safety' }}
        </h3>
        <h3 v-else-if="currentFlowStep?.type === 'insurance_info'">
          {{ currentFlowStep?.label || 'Insurance information' }}
        </h3>
        <h3 v-else-if="currentFlowStep?.type === 'payment_collection'">
          {{ currentFlowStep?.label || 'Payment information' }}
        </h3>
        <h3 v-else-if="currentFlowStep?.type === 'communications'">
          {{ currentFlowStep?.label || 'Communication preferences' }}
        </h3>
        <h3 v-else-if="currentFlowStep?.type === 'demographics'">
          {{ currentFlowStep?.label || 'Demographics' }}
        </h3>
        <h3 v-else-if="currentFlowStep?.type === 'clinical_questions'">
          {{ currentFlowStep?.label || 'Clinical Questions' }}
        </h3>
        <h3 v-else-if="currentFlowStep?.type === 'references'">
          {{ currentFlowStep?.label || 'Professional references' }}
        </h3>
        <h3 v-else-if="currentFlowStep?.type === 'questions'">Questions</h3>
        <div v-if="stepError" class="error" style="margin-bottom: 10px;">{{ stepError }}</div>
        <div v-if="currentFlowStep?.type === 'school_roi'" class="school-roi-step">
          <SmartSchoolRoiFlow
            :public-key="publicKey"
            :session-token="sessionToken"
            :roi-context="roiContext"
            :link="link"
            :bound-client="boundClient"
            :prefill="embeddedSmartRoiPrefill"
            mode="embedded"
            @captured="handleEmbeddedSchoolRoiCaptured"
          />
        </div>
        <div v-if="currentFlowStep?.type === 'upload'" class="upload-step">
          <p class="muted">{{ currentFlowStep?.label || 'Upload' }} ({{ currentFlowStep?.required ? 'required' : 'optional' }})</p>
          <div v-if="isUploadPasteEnabled" class="radio-group" style="margin-bottom: 8px;">
            <label class="radio-row">
              <input v-model="coverLetterInputMode" type="radio" value="upload" />
              <span>Upload file</span>
            </label>
            <label class="radio-row">
              <input v-model="coverLetterInputMode" type="radio" value="paste" />
              <span>Paste text</span>
            </label>
          </div>
          <input
            v-if="!isUploadPasteEnabled || coverLetterInputMode === 'upload'"
            ref="uploadStepInputRef"
            type="file"
            :accept="currentFlowStep?.accept || '.pdf,.doc,.docx'"
            :multiple="(currentFlowStep?.maxFiles || 1) > 1"
            @change="onUploadStepFilesChange"
          />
          <textarea
            v-if="isUploadPasteEnabled && coverLetterInputMode === 'paste'"
            v-model="coverLetterPastedText"
            rows="8"
            class="textarea"
            :placeholder="uploadPastePlaceholder"
          />
          <div v-if="uploadStepFiles.length" class="uploaded-files">
            <div v-for="(f, i) in uploadStepFiles" :key="i" class="uploaded-file-row">
              <span>{{ f.name }}</span>
              <button type="button" class="btn btn-secondary btn-xs" @click="removeUploadStepFile(i)">Remove</button>
            </div>
          </div>
        </div>
        <div v-if="currentFlowStep?.type === 'references'" class="references-step">
          <p class="muted">{{ currentFlowStep?.authorizationNotice || defaultReferencesAuthorizationNotice }}</p>
          <div v-for="(refEntry, idx) in referencesEntries" :key="`ref_${idx}`" class="reference-card">
            <h4>Reference {{ idx + 1 }}</h4>
            <div class="form-grid">
              <div class="form-group"><label>Name</label><input v-model="refEntry.name" type="text" /></div>
              <div class="form-group"><label>Relationship / Title</label><input v-model="refEntry.relationship" type="text" /></div>
              <div class="form-group"><label>Organization</label><input v-model="refEntry.organization" type="text" /></div>
              <div class="form-group"><label>Phone</label><input v-model="refEntry.phone" type="tel" /></div>
              <div class="form-group" style="grid-column: 1 / -1;"><label>Email</label><input v-model="refEntry.email" type="email" /></div>
            </div>
          </div>
          <label v-if="currentFlowStep?.waivable !== false" class="checkbox-row">
            <input v-model="referencesWaived" type="checkbox" />
            <span>I waive my right to view these references.</span>
          </label>
        </div>
        <div v-if="currentFlowStep?.type === 'registration'" class="registration-step">
          <p v-if="currentFlowStep?.description" class="muted">{{ currentFlowStep.description }}</p>

          <!-- Rich event card for locked / single event -->
          <div v-if="hideRegistrationOptionsPicker && currentRegistrationOptions[0]" class="reg-event-card">
            <div class="reg-event-banner">
              <img
                v-if="currentRegistrationOptions[0].imageUrl"
                :src="currentRegistrationOptions[0].imageUrl"
                class="reg-event-img"
                alt="Event image"
              />
              <div v-else class="reg-event-img-placeholder">🎉</div>
            </div>
            <div class="reg-event-body">
              <h4 class="reg-event-title">{{ currentRegistrationOptions[0].label }}</h4>
              <p v-if="currentRegistrationOptions[0].startsAtFormatted" class="reg-event-date">
                📅 {{ currentRegistrationOptions[0].startsAtFormatted }}
                <span v-if="currentRegistrationOptions[0].endsAtFormatted"> – {{ currentRegistrationOptions[0].endsAtFormatted }}</span>
              </p>
              <p v-if="currentRegistrationOptions[0].summaryText" class="reg-event-summary muted">
                {{ currentRegistrationOptions[0].summaryText }}
              </p>
              <p v-if="currentRegistrationOptions[0].description && !currentRegistrationOptions[0].summaryText" class="reg-event-summary muted">
                {{ currentRegistrationOptions[0].description }}
              </p>
              <p v-if="currentRegistrationOptions[0].frequencyLabel" class="reg-event-meta">
                🗓 {{ currentRegistrationOptions[0].frequencyLabel }}
              </p>
              <p v-if="currentRegistrationOptions[0].termsSummary" class="reg-event-meta muted">
                {{ currentRegistrationOptions[0].termsSummary }}
              </p>
              <p v-if="currentRegistrationOptions[0].displayCost" class="reg-event-cost">
                💵 Cost: {{ currentRegistrationOptions[0].displayCost }}
              </p>
              <div v-if="currentRegistrationOptions[0].medicaidEligible || currentRegistrationOptions[0].cashEligible" class="reg-event-eligibility">
                <span v-if="currentRegistrationOptions[0].medicaidEligible" class="reg-eligibility-badge">✅ Medicaid eligible</span>
                <span v-if="currentRegistrationOptions[0].cashEligible" class="reg-eligibility-badge">💳 Cash / self-pay</span>
              </div>
              <a v-if="currentRegistrationOptions[0].videoJoinUrl" :href="currentRegistrationOptions[0].videoJoinUrl" target="_blank" rel="noopener" class="reg-event-link">
                📹 Join link
              </a>
              <a v-if="currentRegistrationOptions[0].paymentLinkUrl" :href="currentRegistrationOptions[0].paymentLinkUrl" target="_blank" rel="noopener" class="reg-event-link">
                💳 Payment link
              </a>
            </div>
            <div class="reg-event-confirm-note">
              Confirm your spot below — tap <strong>Continue</strong> to complete your registration.
            </div>
          </div>

          <!-- Multi-option picker -->
          <div v-else-if="currentRegistrationOptions.length" class="registration-options">
            <label v-for="opt in currentRegistrationOptions" :key="opt.id" class="registration-option">
              <input
                v-if="isCurrentRegistrationMulti"
                type="checkbox"
                :checked="isRegistrationOptionSelected(currentFlowStep?.id, opt.id)"
                @change="toggleRegistrationOption(currentFlowStep?.id, opt.id)"
              />
              <input
                v-else
                type="radio"
                :name="`registration_${currentFlowStep?.id}`"
                :checked="isRegistrationOptionSelected(currentFlowStep?.id, opt.id)"
                @change="selectSingleRegistrationOption(currentFlowStep?.id, opt.id)"
              />
              <span>
                <strong>{{ opt.label }}</strong>
                <small v-if="opt.startsAtFormatted" class="muted">📅 {{ opt.startsAtFormatted }}</small>
                <small v-else-if="opt.description" class="muted">{{ opt.description }}</small>
                <small v-if="opt.videoJoinUrl" class="muted">
                  Video: <a :href="opt.videoJoinUrl" target="_blank" rel="noopener">Join link</a>
                </small>
                <small v-if="opt.displayCost" class="muted">
                  Cost: {{ opt.displayCost }}
                </small>
                <small v-if="opt.frequencyLabel" class="muted">
                  {{ opt.frequencyLabel }}
                </small>
              </span>
            </label>
          </div>

          <div v-else class="muted">No registration options are configured for this step.</div>

          <div v-if="currentRegistrationScheduleBlocks.length" class="registration-schedule-blocks" style="margin-top: 12px;">
            <div v-for="sb in currentRegistrationScheduleBlocks" :key="sb.id" class="registration-schedule-item">
              <strong>{{ sb.label || 'Scheduled Session' }}</strong>
              <small class="muted">{{ formatScheduleBlock(sb) }}</small>
            </div>
          </div>

          <div class="form-group" style="margin-top: 12px; margin-bottom: 0;">
            <label class="checkbox">
              <input
                type="checkbox"
                :checked="isCurrentRegistrationExistingParticipant"
                @change="setCurrentRegistrationExistingParticipant($event?.target?.checked)"
              />
              I am already in your system
            </label>
            <input
              v-if="isCurrentRegistrationExistingParticipant"
              v-model="currentRegistrationLookupValue"
              :placeholder="currentRegistrationLookupPlaceholder"
              type="text"
              style="margin-top: 6px;"
            />
          </div>
        </div>

        <div v-if="currentFlowStep?.type === 'guardian_waiver'" class="guardian-waiver-step">
          <PublicIntakeGuardianWaiverStep
            :model-value="guardianWaiverBundleRef"
            :section-keys="currentGuardianWaiverSectionKeys"
            :client-labels="guardianWaiverClientLabels"
            :guardian-default-pickup="guardianDefaultPickup"
            :saved-signature-data="lastSignatureData"
            :event-waiver-context="eventWaiverContext"
            :pulse-emergency="emergencyPulse"
          />
        </div>

        <div v-if="currentFlowStep?.type === 'insurance_info'" class="insurance-step">
          <PublicIntakeInsuranceStep
            ref="insuranceStepRef"
            :model-value="intakeResponses.submission.insuranceInfo || {}"
            :step-config="currentFlowStep"
            :guardian-name="guardianDisplayNameForInsurance"
            :guardian-relationship="guardianRelationship"
            :guardian-phone="guardianPhone"
            :client-names="insuranceClientNames"
            :intake-for-self="intakeForSelf"
            :agency-name="agencyInfo?.official_name || agencyInfo?.name || ''"
            @update:model-value="(v) => { intakeResponses.submission.insuranceInfo = v; }"
            @medicaid-change="(isMedicaid) => { if (intakeResponses.submission.insuranceInfo) intakeResponses.submission.insuranceInfo.primaryIsMedicaid = isMedicaid; }"
          />
        </div>

        <div v-if="currentFlowStep?.type === 'payment_collection'" class="payment-step">
          <PublicIntakePaymentStep
            :model-value="intakeResponses.submission.paymentInfo || {}"
            :step-config="currentFlowStep"
            :public-key="publicKey"
            :submission-id="submissionId"
            :cost-display="paymentCostDisplay"
            @update:model-value="(v) => { intakeResponses.submission.paymentInfo = v; }"
            @card-saved="onPaymentCardSaved"
          />
        </div>

        <div v-if="currentFlowStep?.type === 'communications'" class="communications-step">
          <p class="muted">
            {{ communicationsIntroText }}
          </p>

          <section class="communications-campaign-card">
            <h4>{{ communicationsEmailTitle }} <span class="required-indicator">*</span></h4>
            <p class="communications-disclosure">
              {{ communicationsEmailDisclosure }}
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_email_preference" value="all" v-model="communications.emailPreference" />
                <span>{{ communicationsEmailAllLabel }}</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_email_preference" value="scheduling_only" v-model="communications.emailPreference" />
                <span>{{ communicationsEmailSchedulingOnlyLabel }}</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_email_preference" value="no" v-model="communications.emailPreference" />
                <span>No</span>
              </label>
            </div>
          </section>

          <section class="communications-campaign-card">
            <h4>{{ communicationsSmsTitle }} <span class="required-indicator">*</span></h4>
            <p class="communications-disclosure">
              {{ communicationsSmsDisclosure }}
              Terms: <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a>.
              Privacy: <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_sms_preference" value="all" v-model="communications.smsPreference" />
                <span>{{ communicationsSmsAllLabel }}</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_sms_preference" value="scheduling_only" v-model="communications.smsPreference" />
                <span>{{ communicationsSmsSchedulingOnlyLabel }}</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_sms_preference" value="no" v-model="communications.smsPreference" />
                <span>No - Do not text me</span>
              </label>
            </div>
          </section>

          <section v-if="currentFlowStep?.campaigns?.providerTexting" class="communications-campaign-card">
            <h4>SMS With Your Provider/Care Team <span class="required-indicator">*</span></h4>
            <p class="communications-disclosure">
              If you choose Yes, we may text you for service-related communication with your provider/care team
              (for example, responding to your questions and coordinating care). Message frequency varies.
              Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
              Appointment reminders/confirmations are not sent from individual provider numbers.
              Terms: <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a>.
              Privacy: <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_provider_sms" value="yes" v-model="communications.providerTextingOptIn" />
                <span>Yes - I opt in to provider/care-team texting</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_provider_sms" value="no" v-model="communications.providerTextingOptIn" />
                <span>No - Keep provider texting off</span>
              </label>
            </div>
          </section>

          <section v-if="currentFlowStep?.campaigns?.programUpdates" class="communications-campaign-card">
            <h4>Optional Program &amp; Service Updates <span class="required-indicator">*</span></h4>
            <p class="communications-disclosure">
              If you choose Yes, we may text you updates about programs/services you requested (for example,
              openings, enrollment options, and availability). Message frequency varies and is limited based on your
              preferences. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
              Terms: <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a>.
              Privacy: <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_program_sms" value="yes" v-model="communications.programUpdatesOptIn" />
                <span>Yes - I want optional updates</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_program_sms" value="no" v-model="communications.programUpdatesOptIn" />
                <span>No - Keep optional updates off</span>
              </label>
            </div>
          </section>

          <section v-if="currentFlowStep?.campaigns?.internalWorkforce" class="communications-campaign-card">
            <h4>Internal Workforce + School Staff Notifications (Opt-In) <span class="required-indicator">*</span></h4>
            <p class="communications-disclosure">
              By opting in, you agree to receive SMS/text messages from PlotTwistHQ for operational notifications and reminders,
              internal announcements, and optional polls/voting related to your participation on the platform. Message frequency varies.
              Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
              Support: 833-756-8894 ext. 701 | hq@plottwistco.com.
              Terms: <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a>.
              Privacy: <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_workforce_sms" value="yes" v-model="communications.internalWorkforceOptIn" />
                <span>Yes - I opt in to internal workforce / school staff SMS notifications</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_workforce_sms" value="no" v-model="communications.internalWorkforceOptIn" />
                <span>No - Keep internal notifications off</span>
              </label>
            </div>
          </section>
        </div>

        <!-- Demographics step -->
        <div v-if="currentFlowStep?.type === 'demographics'" class="demographics-step">
          <p class="muted" style="margin-bottom: 16px;">
            Please fill in the following information so we can keep your records up to date.
          </p>
          <div class="demographics-grid">
            <div v-if="currentFlowStep.showDob" class="form-group">
              <label>Date of Birth <span class="required-indicator">*</span></label>
              <input
                type="date"
                v-model="demographicsData.dob"
                :class="{ 'input-error': demographicsErrors.dob }"
              />
              <span v-if="demographicsErrors.dob" class="field-error">Required</span>
            </div>
            <div v-if="currentFlowStep.showGender" class="form-group">
              <label>Gender</label>
              <select v-model="demographicsData.gender">
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="nonbinary">Non-binary</option>
                <option value="other">Other / self-describe</option>
              </select>
            </div>
            <div v-if="currentFlowStep.showEthnicity" class="form-group">
              <label>Race / Ethnicity</label>
              <select v-model="demographicsData.ethnicity">
                <option value="">Prefer not to say</option>
                <option value="american_indian">American Indian or Alaska Native</option>
                <option value="asian">Asian</option>
                <option value="black">Black or African American</option>
                <option value="hispanic">Hispanic or Latino</option>
                <option value="nhpi">Native Hawaiian or Other Pacific Islander</option>
                <option value="white">White</option>
                <option value="two_or_more">Two or more races</option>
                <option value="other">Other / self-describe</option>
              </select>
            </div>
            <div v-if="currentFlowStep.showPreferredLanguage" class="form-group">
              <label>Preferred Language</label>
              <select v-model="demographicsData.preferredLanguage">
                <option value="">Select…</option>
                <option value="english">English</option>
                <option value="spanish">Spanish</option>
                <option value="french">French</option>
                <option value="mandarin">Mandarin</option>
                <option value="arabic">Arabic</option>
                <option value="other">Other</option>
              </select>
            </div>
            <template v-if="currentFlowStep.showAddress">
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Street Address</label>
                <input type="text" v-model="demographicsData.addressStreet" placeholder="123 Main St" />
              </div>
              <div class="form-group">
                <label>Apt / Unit (optional)</label>
                <input type="text" v-model="demographicsData.addressApt" placeholder="Apt 4B" />
              </div>
              <div class="form-group">
                <label>Zip Code</label>
                <input
                  type="text"
                  v-model="demographicsData.addressZip"
                  placeholder="80903"
                  maxlength="10"
                  @blur="autofillDemographicsLocation"
                />
              </div>
              <div class="form-group">
                <label>City</label>
                <input type="text" v-model="demographicsData.addressCity" placeholder="Colorado Springs" />
              </div>
              <div class="form-group">
                <label>State</label>
                <input type="text" v-model="demographicsData.addressState" placeholder="CO" maxlength="2" style="max-width: 80px;" />
              </div>
            </template>
          </div>
        </div>

        <!-- Clinical questions step — rendered identically to regular questions but saved separately -->
        <div v-if="currentFlowStep?.type === 'clinical_questions'" class="clinical-questions-step">
          <p class="muted" style="margin-bottom: 16px; font-size: 13px;">
            The following questions help your provider understand your needs. Your answers are confidential and only visible to your assigned provider.
          </p>
          <div v-for="field in visibleClinicalFields" :key="field.key || field.id" class="question-field-row" :ref="el => fieldRefs[field.key || field.id] = el">
            <label :class="{ 'required-label': field.required }">
              {{ field.label }}
              <span v-if="field.required" class="required-indicator">*</span>
            </label>
            <div v-if="field.helperText" class="helper-text">{{ field.helperText }}</div>
            <select
              v-if="field.type === 'select'"
              v-model="clinicalResponses[field.key]"
              :class="{ 'input-error': isClinicalFieldMissing(field) }"
            >
              <option value="">Select…</option>
              <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <div v-else-if="field.type === 'radio'" class="radio-group">
              <label v-for="opt in field.options" :key="opt.value" class="radio-row">
                <input type="radio" :name="'cq_' + field.key" :value="opt.value" v-model="clinicalResponses[field.key]" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <div v-else-if="field.type === 'checkbox'" class="checkbox-group">
              <label class="checkbox-row">
                <input type="checkbox" v-model="clinicalResponses[field.key]" :true-value="'yes'" :false-value="'no'" />
                <span>{{ field.label }}</span>
              </label>
            </div>
            <textarea
              v-else-if="field.type === 'textarea'"
              v-model="clinicalResponses[field.key]"
              rows="3"
              :class="{ 'input-error': isClinicalFieldMissing(field) }"
            />
            <input
              v-else
              v-model="clinicalResponses[field.key]"
              type="text"
              :class="{ 'input-error': isClinicalFieldMissing(field) }"
            />
          </div>
        </div>

        <div class="doc-nav" v-if="currentFlowStep?.type === 'document'">
          <button class="btn btn-secondary btn-sm" type="button" :disabled="currentDocIndex === 0" @click="goToPrevious">
            Previous
          </button>
          <div class="doc-meta">
            {{ currentDoc?.name || 'Untitled' }}
            <span v-if="docStatus[currentDoc?.id]" class="badge badge-success" style="margin-left: 8px;">Completed</span>
          </div>
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            :disabled="!docStatus[currentDoc?.id]"
            :class="{ 'doc-nav-btn--pulse': navPulse }"
            @click="goToNext"
          >
            Next
          </button>
        </div>
        <div v-if="currentFlowStep?.type !== 'school_roi'" class="actions" style="margin-top: 10px;">
          <button class="btn btn-outline" type="button" @click="cancelIntake" :disabled="submitLoading">
            Cancel & delete
          </button>
          <button class="btn btn-outline" type="button" @click="restartIntake" :disabled="submitLoading">
            Restart
          </button>
        </div>

        <div v-if="currentFlowStep?.type === 'document' && currentDoc?.document_action_type === 'signature'" class="signature-summary signature-summary-top">
          <span v-if="guardianDisplayName">{{ signerLabel }}: {{ guardianDisplayName }}</span>
          <span v-if="clientDisplayNames.length && !isJobApplication"> · Client{{ clientDisplayNames.length > 1 ? 's' : '' }}: {{ clientDisplayNames.join(', ') }}</span>
        </div>

        <div class="doc-preview" v-if="currentFlowStep?.type === 'document'">
          <div v-if="currentDoc?.template_type === 'html'" v-html="currentDoc.html_content" class="html-preview"></div>
          <div v-else-if="pdfUrl" class="pdf-preview-container">
            <PDFPreview
              ref="pdfPreviewRef"
              :pdf-url="pdfUrl"
              :markers="checkboxMarkers"
              :active-marker-id="activeMarkerId"
              @loaded="handlePdfLoaded"
              @page-change="handlePageChange"
              @marker-click="handleMarkerClick"
            />
            <p class="note">Please review the document above. You must reach the last page before continuing.</p>
            <p v-if="checkboxMarkers.length && checkboxDisclaimer" class="note">
              {{ checkboxDisclaimer }}
            </p>
            <div v-if="reviewTotalPages > 1" class="page-notice-actions" style="margin-top: 12px;">
              <button class="btn btn-outline btn-sm" type="button" :class="{ 'doc-nav-btn--pulse': navPulse }" @click="skipToSignaturePage">
                {{ t('skipToSignaturePage') }}
              </button>
            </div>
          </div>
          <div v-else class="muted">Document preview not available.</div>
        </div>

        <div v-if="pageNotice" class="page-notice">{{ pageNotice }}</div>

        <div v-if="currentFlowStep?.type === 'document' && requiredFieldsForList.length" class="field-inputs">
          <h4>Required Fields</h4>
          <div v-for="field in requiredFieldsForList" :key="field.id" class="form-group">
            <label>{{ field.label || field.type }}</label>
            <input
              v-if="field.type !== 'date' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio'"
              v-model="currentFieldValues[field.id]"
              :type="field.type === 'ssn' ? 'password' : 'text'"
              :placeholder="field.type === 'ssn' ? t('enterSsn') : t('enterValue')"
              :data-field-id="field.id"
            />
            <label v-else-if="field.type === 'checkbox'" class="checkbox-row" :data-field-id="field.id">
              <input v-model="currentFieldValues[field.id]" type="checkbox" />
              <span>{{ field.label || 'I agree' }}</span>
            </label>
            <select
              v-else-if="field.type === 'select'"
              v-model="currentFieldValues[field.id]"
              :data-field-id="field.id"
            >
              <option value="">Select an option</option>
              <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                {{ opt.label || opt.value }}
              </option>
            </select>
            <div v-else-if="field.type === 'radio'" class="radio-group" :data-field-id="field.id">
              <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                <input
                  type="radio"
                  :name="`field_${field.id}`"
                  :value="opt.value || opt.label"
                  v-model="currentFieldValues[field.id]"
                />
                <span>{{ opt.label || opt.value }}</span>
              </label>
            </div>
            <input v-else-if="field.autoToday" v-model="currentFieldValues[field.id]" type="text" disabled />
            <input v-else v-model="currentFieldValues[field.id]" type="date" :data-field-id="field.id" />
          </div>
        </div>

        <div v-if="currentFlowStep?.type === 'document' && currentDoc?.document_action_type === 'signature'" class="signature-block" ref="signatureBlockRef" :class="{ 'signature-block--flash': signatureBlockFlash }">
          <SignaturePad compact @signed="onSigned" />
          <div v-if="lastSignatureData && !signatureData" class="signature-reuse-actions" style="margin-top: 12px;">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              @click="onUseSavedSignatureClick"
            >
              {{ t('useSavedSignature') }}
            </button>
          </div>
          <div v-if="signatureData" class="muted" style="margin-top: 6px;">Signature ready for this document.</div>
        </div>

        <div v-if="showSavedSigPrompt" class="saved-sig-prompt">
          <p>You haven't signed this document yet. Would you like to apply your saved signature?</p>
          <div class="saved-sig-prompt-actions">
            <button type="button" class="btn btn-primary btn-sm" @click="applyPromptedSavedSignature">Yes, apply signature</button>
            <button type="button" class="btn btn-outline btn-sm" @click="showSavedSigPrompt = false">Sign manually instead</button>
          </div>
        </div>

        <div v-if="currentFlowStep?.type !== 'school_roi'" class="actions">
          <button
            v-if="currentFlowIndex > 0"
            class="btn btn-outline"
            type="button"
            :disabled="submitLoading"
            @click="goToPrevious"
          >
            ← Back
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="submitLoading || isUploadStepBlockingContinue"
            @click="handleCurrentFlowContinue"
          >
            {{ submitLoading ? t('submitting') : currentFlowContinueLabel }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 3" class="step">
        <h3>{{ jobApplicationSubmitted ? 'Application Submitted' : (formTypeKey === 'smart_registration' ? "You're Registered!" : 'Successfully Submitted') }}</h3>
        <p v-if="jobApplicationSubmitted">
          Thank you for your application. We have received your materials and will review them shortly.
        </p>
        <template v-else>
          <!-- Registration success card -->
          <div v-if="formTypeKey === 'smart_registration'" class="reg-success-card">
            <div v-if="registeredEventSummary" class="reg-success-event">
              <div class="reg-success-event-title">{{ registeredEventSummary.title }}</div>
              <div v-if="registeredEventSummary.startsAtFormatted" class="reg-success-event-date">
                📅 {{ registeredEventSummary.startsAtFormatted }}
              </div>
              <div class="reg-success-actions">
                <a
                  v-if="registeredEventSummary.icalUrl"
                  :href="registeredEventSummary.icalUrl"
                  download="event.ics"
                  class="btn btn-outline btn-sm"
                >
                  Add to Calendar
                </a>
              </div>
            </div>
            <div class="reg-success-account">
              <div class="reg-success-account-label">Your account</div>
              <div v-if="registrationCompletion?.loginEmail || guardianEmail" class="reg-success-username">
                {{ registrationCompletion?.loginEmail || guardianEmail }}
              </div>
              <div v-if="registrationCompletion?.portalLoginUrl" class="reg-success-account-actions" style="margin-top: 10px;">
                <a
                  :href="registrationCompletion.portalLoginUrl"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-primary btn-sm"
                >
                  Sign in to your portal →
                </a>
              </div>
              <div class="reg-success-account-hint" style="margin-top: 8px;">
                <span v-if="registrationCompletion?.newGuardianAccount">
                  A sign-in link has been emailed to you (valid 72 hours). After signing in you will set your password.
                </span>
                <span v-else-if="registrationCompletion?.loginEmail">
                  Use the button above to sign in to your guardian portal. Check your email if you need a sign-in link.
                </span>
                <span v-else>
                  Check your email for a sign-in link to access your guardian portal.
                </span>
              </div>
              <div v-if="guardianEmail" class="muted" style="font-size: 12px; margin-top: 4px;">
                Email: {{ guardianEmail }}
              </div>
              <div style="margin-top: 10px;">
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  :disabled="loginHelpSending"
                  @click="sendPublicIntakeLoginHelp"
                >
                  {{ loginHelpSending ? 'Sending…' : 'Need help signing in? Notify staff' }}
                </button>
                <span v-if="loginHelpMessage" class="muted" style="margin-left: 8px;">{{ loginHelpMessage }}</span>
              </div>
            </div>
          </div>

          <p v-if="!downloadUrl && pollingForDownload" class="preparing-message">
            <span class="preparing-spinner"></span>
            Your documents are being prepared. A copy will be emailed to the address you provided once ready.
          </p>
          <p v-else-if="downloadUrl">{{ completionEmailMessage }}</p>
          <p v-else-if="formTypeKey !== 'smart_registration'">{{ completionEmailMessage }}</p>
        </template>
        <p v-if="downloadUrl" class="muted">Download links expire in 7 days.</p>
        <div v-if="downloadUrl" class="actions">
          <a class="btn btn-primary" :href="downloadUrl" target="_blank" rel="noopener">
            {{
              formTypeKey === 'smart_school_roi'
                ? 'View Signed ROI'
                : (jobApplicationSubmitted ? 'View Application Copy' : 'View Packet PDF')
            }}
          </a>
          <a class="btn btn-secondary" :href="downloadUrl" download>
            {{
              formTypeKey === 'smart_school_roi'
                ? 'Download Signed ROI'
                : (jobApplicationSubmitted ? 'Download Application Copy' : 'Download Packet PDF')
            }}
          </a>
        </div>
        <div v-if="clientBundleLinks.length && !jobApplicationSubmitted" class="bundle-list">
          <div class="bundle-title">{{ formTypeKey === 'smart_school_roi' ? 'Download per-client releases' : 'Download per-child packets' }}</div>
          <div v-for="bundle in clientBundleLinks" :key="bundle.clientId || bundle.filename" class="bundle-item">
            <div class="bundle-name">{{ bundle.clientName || `Client ${bundle.clientId}` }}</div>
            <a class="btn btn-secondary btn-sm" :href="bundle.downloadUrl" target="_blank" rel="noopener">View</a>
            <a class="btn btn-outline btn-sm" :href="bundle.downloadUrl" download>Download</a>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" type="button" @click="endSession">
            End session
          </button>
        </div>
      </div>
    </div>
  </div>

</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import SignaturePad from '../components/SignaturePad.vue';
import SmartSchoolRoiFlow from '../components/public/SmartSchoolRoiFlow.vue';
import PDFPreview from '../components/documents/PDFPreview.vue';
import PublicIntakeGuardianWaiverStep from '../components/public-intake/PublicIntakeGuardianWaiverStep.vue';
import PublicIntakeInsuranceStep from '../components/public-intake/PublicIntakeInsuranceStep.vue';
import PublicIntakePaymentStep from '../components/public-intake/PublicIntakePaymentStep.vue';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { isMedicaidInsurer } from '../utils/coloradoInsurances';
import { useAuthStore } from '../store/auth';

const INTAKE_TRANSLATIONS = {
  en: {
    beginSubtitle: 'Begin to start a secure intake session. This link creates a unique session for each person.',
    beginSubtitleSmartRoi: 'Begin to start a secure school release session. This link creates a unique signing session for each person.',
    beginSubtitleJob: 'Start your job application. This link creates a unique session for your application.',
    beginSubtitleMedical: 'Request your medical records. This link creates a unique session for your request.',
    beginIntake: 'Begin intake',
    beginIntakeSmartRoi: 'Begin release',
    beginIntakeRegistration: 'Begin registration',
    beginIntakeJob: 'Start job application',
    beginIntakeMedical: 'Start medical records request',
    loadingLink: 'Loading intake link...',
    loadingLinkJob: 'Loading job application...',
    loadingLinkMedical: 'Loading medical records request...',
    loadingLinkRegistration: 'Loading registration...',
    digitalIntake: 'Digital Intake',
    digitalIntakeJob: 'Job Application',
    digitalIntakeMedical: 'Medical Records Request',
    digitalIntakeRegistration: 'Smart Registration',
    welcome: 'Welcome',
    formTimeLimit: 'This form must be completed within 1 hour. Each new page adds 5 minutes. In-progress answers are saved in this browser session for up to 1 hour in case you accidentally navigate away.',
    next: 'Next',
    tapNext: 'Tap Next to continue',
    acknowledgeAndContinue: 'Acknowledge & Continue',
    introAgencySubtitle: 'Acknowledging this agency as your service provider.',
    introSchoolSubtitle: 'Acknowledging this school as your partnering organization.',
    introOrgSubtitle: 'Acknowledging this organization as your intake site.',
    questions: 'Questions',
    whoIsIntakeFor: 'Who is this intake for?',
    myself: 'Myself',
    myDependents: 'My dependent(s)',
    yourFirstName: 'Your first name',
    guardianFirstName: 'Guardian first name',
    yourLastName: 'Your last name',
    guardianLastName: 'Guardian last name',
    yourEmail: 'Your email',
    guardianEmail: 'Guardian email',
    yourPhoneOptional: 'Your phone (optional)',
    guardianPhoneOptional: 'Guardian phone (optional)',
    relationship: 'Relationship',
    relationshipPlaceholder: 'e.g., Parent',
    notice: 'Notice',
    guardianQuestions: 'Guardian Questions',
    yourQuestions: 'Your Questions',
    oneTimeQuestions: 'One-time Questions',
    oneTimeQuestionsDesc: 'These questions are asked once for the whole intake.',
    selectOption: 'Select an option',
    client: 'Client',
    clients: 'Clients',
    clientFirstName: 'Client first name',
    clientLastName: 'Client last name',
    clientNameUsesYours: 'Client name will use your first and last name.',
    organizationId: 'Organization ID',
    clientQuestions: 'Client Questions',
    clientQuestionsDesc: 'These questions repeat for each client.',
    addAnotherChild: 'Add another child',
    addAnotherDesc: 'Add another client or continue below.',
    additionalQuestions: 'Additional Questions',
    remove: 'Remove',
    clientN: 'Client',
    yourInformation: 'Your Information',
    information: 'Information',
    iConsentContinue: 'I Consent and Continue',
    saving: 'Saving...',
    enterSsn: 'Enter SSN',
    enterValue: 'Enter value',
    signContinue: 'Sign & Continue',
    markReviewedContinue: 'Mark Reviewed & Continue',
    continue: 'Continue',
    submitting: 'Submitting...',
    protectedByRecaptcha: 'Protected by reCAPTCHA',
    verifyHumanFirst: 'Please verify you\'re human first, then fill out the form below.',
    completeCaptchaToContinue: 'Complete the verification above to continue.',
    captchaExpiryHint: 'Verification expires after 2 minutes. If the form takes longer, complete it again before submitting.',
    captchaRetry: 'Verification expired or failed. Please complete the captcha again.',
    guardianInfo: 'Guardian Information',
    yourInformation: 'Your Information',
    guardianFirst: 'Guardian first name',
    guardianLast: 'Guardian last name',
    guardianPhone: 'Guardian phone',
    yes: 'Yes',
    no: 'No',
    clinicalIntakeSummary: 'Clinical Intake Summary',
    clinicalResponses: 'Clinical Responses',
    noClinicalResponses: 'No clinical responses captured.',
    noAnswersCaptured: 'No answers captured.',
    required: 'Required',
    organizationRequired: 'Organization is required.',
    guardianRequired: 'Guardian name and guardian email are required.',
    applicantRequired: 'Name and email are required.',
    requesterRequired: 'Name and email are required.',
    registrantRequired: 'Name and email are required.',
    signerLabelGuardian: 'Guardian',
    signerLabelSelf: 'Signing as',
    signerLabelApplicant: 'Applicant',
    signerLabelRequester: 'Requester',
    signerLabelRegistrant: 'Registrant',
    applicantInformation: 'Applicant Information',
    requesterInformation: 'Requester Information',
    registrantInformation: 'Registrant Information',
    completionEmailGuardian: 'Your documents were completed successfully. A copy will be emailed to the guardian.',
    completionEmailSmartRoi: 'Your release of information has been signed successfully. A copy will be emailed to you.',
    completionEmailApplicant: 'Your application was submitted successfully. A copy will be emailed to you.',
    completionEmailRequester: 'Your request was submitted successfully. A copy will be emailed to you.',
    completionEmailRegistrant: 'Your registration was submitted successfully. A copy will be emailed to you.',
    completionEmailFailed: 'Your documents were completed, but we could not send the confirmation email. Please use the download buttons below.',
    completeCaptcha: 'Please complete the captcha verification above.',
    captchaFailed: 'Captcha verification failed. Please complete the captcha again and try again.',
    noDocumentSelected: 'No document selected.',
    reviewAllPages: 'Please review all pages before continuing.',
    reviewAllPagesSkip: 'Please review all pages before continuing. You can skip to the signature page if needed.',
    skipToSignaturePage: 'Go to last page',
    useSavedSignature: 'Use Saved Signature to Sign this Document',
    reviewAllPagesBeforeSigning: 'Please click Next on the document to review all pages before signing.',
    confirmSignatureReuse: 'Please confirm signature reuse to continue.',
    signatureRequired: 'Signature is required.',
    completeRequiredFields: 'Please complete all required fields before continuing.',
    cancelDeleteConfirm: 'Cancel and delete all entered information? This data will not be saved due to the sensitive nature of the intake.',
    restartConfirm: 'Restart this intake and clear all fields?',
    endSessionConfirm: 'End this session and clear this intake from this browser?',
    unableToStartSession: 'Unable to start a new intake session. Please try again.',
    dailyLimitReached: 'Daily intake start limit reached. Please try again tomorrow.',
    draftRestored: 'Draft restored from this browser session (saved within the last hour).',
    beginSubtitleRegistration: 'Register for one program, class, or event from this secure link. Some links let you choose from multiple options.',
    beginSubtitleProgramEnrollment:
      'Enroll in an individual program or service from this secure link. This is for becoming a client — not for signing up for a group class or dated event unless your provider included that here.'
  },
  es: {
    loadingLink: 'Cargando enlace de admisión...',
    loadingLinkJob: 'Cargando solicitud de empleo...',
    loadingLinkMedical: 'Cargando solicitud de registros médicos...',
    loadingLinkRegistration: 'Cargando registro...',
    digitalIntake: 'Admisión Digital',
    digitalIntakeJob: 'Solicitud de Empleo',
    digitalIntakeMedical: 'Solicitud de Registros Médicos',
    digitalIntakeRegistration: 'Registro Inteligente',
    beginSubtitle: 'Comience para iniciar una sesión de admisión segura. Este enlace crea una sesión única para cada persona.',
    beginSubtitleSmartRoi: 'Comience para iniciar una sesión segura de autorización escolar. Este enlace crea una sesión única de firma para cada persona.',
    beginSubtitleJob: 'Comience su solicitud de empleo. Este enlace crea una sesión única para su solicitud.',
    beginSubtitleMedical: 'Solicite sus registros médicos. Este enlace crea una sesión única para su solicitud.',
    beginSubtitleRegistration: 'Regístrese para un programa, clase o evento desde este enlace seguro. Algunos enlaces permiten elegir entre varias opciones.',
    beginSubtitleProgramEnrollment:
      'Inscríbase en un programa o servicio individual desde este enlace seguro. Esto es para convertirse en cliente — no para inscribirse en una clase grupal o un evento con fecha, a menos que su proveedor lo haya incluido aquí.',
    beginIntake: 'Comenzar admisión',
    beginIntakeSmartRoi: 'Comenzar autorización',
    beginIntakeRegistration: 'Comenzar registro',
    beginIntakeJob: 'Comenzar solicitud de empleo',
    beginIntakeMedical: 'Comenzar solicitud de registros médicos',
    welcome: 'Bienvenido',
    formTimeLimit: 'Este formulario debe completarse en 1 hora. Cada página nueva agrega 5 minutos. Las respuestas en progreso se guardan en esta sesión del navegador por hasta 1 hora por si sale accidentalmente.',
    next: 'Siguiente',
    tapNext: 'Toque Siguiente para continuar',
    acknowledgeAndContinue: 'Aceptar y continuar',
    introAgencySubtitle: 'Reconociendo a esta agencia como su proveedor de servicios.',
    introSchoolSubtitle: 'Reconociendo a esta escuela como su organización asociada.',
    introOrgSubtitle: 'Reconociendo a esta organización como su sitio de admisión.',
    questions: 'Preguntas',
    whoIsIntakeFor: '¿Para quién es esta admisión?',
    myself: 'Para mí',
    myDependents: 'Mi(s) dependiente(s)',
    yourFirstName: 'Su nombre',
    guardianFirstName: 'Nombre del tutor',
    yourLastName: 'Su apellido',
    guardianLastName: 'Apellido del tutor',
    yourEmail: 'Su correo electrónico',
    guardianEmail: 'Correo electrónico del tutor',
    yourPhoneOptional: 'Su teléfono (opcional)',
    guardianPhoneOptional: 'Teléfono del tutor (opcional)',
    relationship: 'Parentesco',
    relationshipPlaceholder: 'ej., Padre, Madre',
    notice: 'Aviso',
    guardianQuestions: 'Preguntas del tutor',
    yourQuestions: 'Sus preguntas',
    oneTimeQuestions: 'Preguntas únicas',
    oneTimeQuestionsDesc: 'Estas preguntas se hacen una vez para toda la admisión.',
    selectOption: 'Seleccione una opción',
    client: 'Cliente',
    clients: 'Clientes',
    clientFirstName: 'Nombre del cliente',
    clientLastName: 'Apellido del cliente',
    clientNameUsesYours: 'El nombre del cliente usará su nombre y apellido.',
    organizationId: 'ID de organización',
    clientQuestions: 'Preguntas del cliente',
    clientQuestionsDesc: 'Estas preguntas se repiten para cada cliente.',
    addAnotherChild: 'Agregar otro hijo',
    addAnotherDesc: 'Agregue otro cliente o continúe abajo.',
    additionalQuestions: 'Preguntas adicionales',
    remove: 'Eliminar',
    clientN: 'Cliente',
    yourInformation: 'Su información',
    information: 'Información',
    iConsentContinue: 'Acepto y continúo',
    saving: 'Guardando...',
    enterSsn: 'Ingrese SSN',
    enterValue: 'Ingrese valor',
    signContinue: 'Firmar y continuar',
    markReviewedContinue: 'Marcar revisado y continuar',
    continue: 'Continuar',
    submitting: 'Enviando...',
    protectedByRecaptcha: 'Protegido por reCAPTCHA',
    verifyHumanFirst: 'Por favor verifique que es humano primero, luego complete el formulario a continuación.',
    completeCaptchaToContinue: 'Complete la verificación arriba para continuar.',
    captchaExpiryHint: 'La verificación expira después de 2 minutos. Si el formulario tarda más, complétela nuevamente antes de enviar.',
    captchaRetry: 'La verificación expiró o falló. Por favor complete el captcha nuevamente.',
    guardianInfo: 'Información del tutor',
    yourInformation: 'Su información',
    guardianFirst: 'Nombre del tutor',
    guardianLast: 'Apellido del tutor',
    guardianPhone: 'Teléfono del tutor',
    completionEmailFailed: 'Sus documentos se completaron, pero no pudimos enviar el correo de confirmación. Use los botones de descarga a continuación.',
    draftRestored: 'Borrador restaurado desde esta sesión del navegador (guardado dentro de la última hora).',
    yes: 'Sí',
    no: 'No',
    clinicalIntakeSummary: 'Resumen de admisión clínica',
    clinicalResponses: 'Respuestas clínicas',
    noClinicalResponses: 'No se capturaron respuestas clínicas.',
    noAnswersCaptured: 'No se capturaron respuestas.',
    required: 'Requerido',
    organizationRequired: 'Se requiere la organización.',
    guardianRequired: 'Se requieren el nombre del tutor y el correo electrónico del tutor.',
    completeCaptcha: 'Por favor complete la verificación de captcha arriba.',
    captchaFailed: 'La verificación de captcha falló. Por favor complete el captcha nuevamente e intente de nuevo.',
    noDocumentSelected: 'No se seleccionó ningún documento.',
    reviewAllPages: 'Por favor revise todas las páginas antes de continuar.',
    reviewAllPagesSkip: 'Por favor revise todas las páginas antes de continuar. Puede saltar a la página de firma si es necesario.',
    skipToSignaturePage: 'Ir a la última página',
    useSavedSignature: 'Usar firma guardada para firmar este documento',
    reviewAllPagesBeforeSigning: 'Por favor haga clic en Siguiente en el documento para revisar todas las páginas antes de firmar.',
    signatureRequired: 'Se requiere firma.',
    completeRequiredFields: 'Por favor complete todos los campos requeridos antes de continuar.',
    cancelDeleteConfirm: '¿Cancelar y eliminar toda la información ingresada? Estos datos no se guardarán debido a la naturaleza sensible de la admisión.',
    restartConfirm: '¿Reiniciar esta admisión y borrar todos los campos?',
    endSessionConfirm: '¿Terminar esta sesión y borrar esta admisión de este navegador?',
    unableToStartSession: 'No se pudo iniciar una nueva sesión de admisión. Por favor intente de nuevo.',
    dailyLimitReached: 'Se alcanzó el límite diario de inicio de admisión. Por favor intente mañana.'
  }
};

const route = useRoute();
const router = useRouter();
const publicKey = route.params.publicKey;
const isLocalhostRecaptcha = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const LOCALHOST_TEST_RECAPTCHA_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
const authStore = useAuthStore();
// Keep link initialized before any computed/translation helpers that read link.value.
// Prevents TDZ crashes in production minified bundles.
const link = ref(null);

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const intakeLocale = computed(() => {
  const code = String(link.value?.language_code || 'en').toLowerCase();
  return code.startsWith('es') ? 'es' : 'en';
});
const customMessages = computed(() => link.value?.custom_messages || null);
const t = (key) => {
  const custom = customMessages.value?.[key];
  if (custom && String(custom).trim()) return String(custom).trim();
  return INTAKE_TRANSLATIONS[intakeLocale.value]?.[key] ?? INTAKE_TRANSLATIONS.en[key] ?? key;
};

const formTypeKey = computed(() => String(link.value?.form_type || '').toLowerCase());
/** Intake link scoped to a learning class enrollment (not a company event). */
const isProgramEnrollmentIntake = computed(() => {
  const lc = Number(link.value?.learning_class_id || 0);
  const ce = Number(link.value?.company_event_id || 0);
  return lc > 0 && !ce;
});
const beginSubtitleText = computed(() => {
  if (formTypeKey.value === 'smart_school_roi') return t('beginSubtitleSmartRoi');
  const custom = customMessages.value?.beginSubtitle;
  if (custom && String(custom).trim()) return String(custom).trim();
  if (formTypeKey.value === 'smart_registration' && isProgramEnrollmentIntake.value) {
    return t('beginSubtitleProgramEnrollment');
  }
  if (formTypeKey.value === 'smart_registration') return t('beginSubtitleRegistration');
  if (formTypeKey.value === 'job_application') return t('beginSubtitleJob');
  if (formTypeKey.value === 'medical_records_request') return t('beginSubtitleMedical');
  return t('beginSubtitle');
});
const beginIntakeButtonText = computed(() => {
  if (formTypeKey.value === 'smart_school_roi') return t('beginIntakeSmartRoi');
  const custom = customMessages.value?.beginIntake;
  if (custom && String(custom).trim()) return String(custom).trim();
  if (formTypeKey.value === 'smart_registration') return t('beginIntakeRegistration');
  if (formTypeKey.value === 'job_application') return t('beginIntakeJob');
  if (formTypeKey.value === 'medical_records_request') return t('beginIntakeMedical');
  return t('beginIntake');
});
const loadingText = computed(() => {
  if (formTypeKey.value === 'job_application') return t('loadingLinkJob');
  if (formTypeKey.value === 'medical_records_request') return t('loadingLinkMedical');
  if (formTypeKey.value === 'smart_registration') return t('loadingLinkRegistration');
  return t('loadingLink');
});
const defaultTitle = computed(() => {
  if (formTypeKey.value === 'job_application') return t('digitalIntakeJob');
  if (formTypeKey.value === 'medical_records_request') return t('digitalIntakeMedical');
  if (formTypeKey.value === 'smart_registration') return t('digitalIntakeRegistration');
  return t('digitalIntake');
});
const signerLabel = computed(() => {
  if (intakeForSelf.value) return t('signerLabelSelf');
  if (formTypeKey.value === 'job_application') return t('signerLabelApplicant');
  if (formTypeKey.value === 'medical_records_request') return t('signerLabelRequester');
  if (formTypeKey.value === 'smart_registration') return t('signerLabelRegistrant');
  return t('signerLabelGuardian');
});
const emailDeliveryStatus = ref(null);
const completionEmailMessage = computed(() => {
  if (emailDeliveryStatus.value?.attempted && emailDeliveryStatus.value?.sent === false) {
    return t('completionEmailFailed');
  }
  if (formTypeKey.value === 'job_application') return t('completionEmailApplicant');
  if (formTypeKey.value === 'medical_records_request') return t('completionEmailRequester');
  if (formTypeKey.value === 'smart_registration') return t('completionEmailRegistrant');
  if (formTypeKey.value === 'smart_school_roi') return t('completionEmailSmartRoi');
  return t('completionEmailGuardian');
});
const guardianSectionTitle = computed(() => {
  if (intakeForSelf.value) return t('yourQuestions');
  if (formTypeKey.value === 'job_application') return t('applicantInformation');
  if (formTypeKey.value === 'medical_records_request') return t('requesterInformation');
  if (formTypeKey.value === 'smart_registration') return t('registrantInformation');
  return t('guardianQuestions');
});

const loading = ref(true);
const error = ref('');
const stepError = ref('');
const beginError = ref('');
// Declare shared intake state early so setup-time computed/watch evaluation
// cannot hit temporal dead zone errors in production bundles.
const clients = ref([
  { firstName: '', lastName: '' }
]);
const intakeResponses = reactive({
  guardian: {},
  submission: {},
  clients: [{}]
});
const communications = reactive({
  emailPreference: '',
  smsPreference: '',
  providerTextingOptIn: '',
  programUpdatesOptIn: '',
  internalWorkforceOptIn: ''
});

// Demographics step state
const demographicsData = reactive({
  dob: '',
  gender: '',
  ethnicity: '',
  preferredLanguage: '',
  addressStreet: '',
  addressApt: '',
  addressCity: '',
  addressState: '',
  addressZip: ''
});
const demographicsErrors = reactive({ dob: false });

const autofillDemographicsLocation = async () => {
  const zip = String(demographicsData.addressZip || '').replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) return;
  try {
    const resp = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    if (!place) return;
    if (!demographicsData.addressCity) demographicsData.addressCity = place['place name'] || '';
    if (!demographicsData.addressState) demographicsData.addressState = place['state abbreviation'] || place['state'] || '';
  } catch { /* ignore */ }
};

// Clinical questions step state
const clinicalResponses = reactive({});

const visibleClinicalFields = computed(() => {
  if (currentFlowStep.value?.type !== 'clinical_questions') return [];
  const fields = Array.isArray(currentFlowStep.value?.fields) ? currentFlowStep.value.fields : [];
  return fields.filter((f) => {
    if (!f?.key) return false;
    const showIf = f.showIf;
    if (showIf?.fieldKey && showIf.equals !== undefined) {
      return String(clinicalResponses[showIf.fieldKey] || '') === String(showIf.equals || '');
    }
    return true;
  });
});

const isClinicalFieldMissing = (field) => {
  if (!field?.required) return false;
  const v = clinicalResponses[field.key];
  return v === undefined || v === null || String(v).trim() === '';
};
const platformTermsUrl = '/terms';
const platformPrivacyUrl = '/privacypolicy';
const communicationsAudience = computed(() => {
  const explicit = String(currentFlowStep.value?.audience || '').trim().toLowerCase();
  if (['guardian_client', 'workforce', 'school_staff'].includes(explicit)) return explicit;
  if (formTypeKey.value === 'job_application') return 'workforce';
  return 'guardian_client';
});
const isWorkforceAudience = computed(() =>
  communicationsAudience.value === 'workforce' || communicationsAudience.value === 'school_staff'
);
const communicationsIntroText = computed(() =>
  isWorkforceAudience.value
    ? 'Choose how you would like to receive operational communications. You can update these preferences at any time.'
    : 'Choose how you would like to receive platform communications. You can update these preferences at any time.'
);
const communicationsEmailTitle = computed(() =>
  isWorkforceAudience.value ? 'Email Notifications Preference' : 'Email Communication Preference'
);
const communicationsSmsTitle = computed(() =>
  isWorkforceAudience.value ? 'Text Message (SMS) Notifications Preference' : 'Text Message (SMS) Communication Preference'
);
const communicationsEmailDisclosure = computed(() =>
  isWorkforceAudience.value
    ? 'Please choose what you would like to receive by email from us. If you opt in, we may email you about operational scheduling, internal announcements, and optional platform participation updates. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.'
    : 'Please choose what you would like to receive emails from us. If you opt in, we may email you about scheduling, appointment reminders, and-if selected-updates about mental health programs and services. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.'
);
const communicationsSmsDisclosure = computed(() =>
  isWorkforceAudience.value
    ? 'Please choose what you would like to receive by text message from us. If you opt in, we may text you about operational scheduling, internal announcements, and optional participation updates. Message and data rates may apply. Reply STOP to opt out at any time and HELP for assistance.'
    : 'Please choose what you would like to receive text messages from us. If you opt in, we may text you about scheduling, appointment reminders, and-if selected-updates about mental health programs and services. Message and data rates may apply. Reply STOP to opt out at any time and HELP for assistance.'
);
const communicationsEmailAllLabel = computed(() =>
  isWorkforceAudience.value
    ? 'Yes - Operational scheduling + internal announcements'
    : 'Yes - Scheduling + all program communications'
);
const communicationsEmailSchedulingOnlyLabel = computed(() =>
  isWorkforceAudience.value ? 'Yes - Scheduling only' : 'Yes - Scheduling only'
);
const communicationsSmsAllLabel = computed(() =>
  isWorkforceAudience.value
    ? 'Yes - Operational scheduling + internal announcements'
    : 'Yes - Scheduling + all program communications'
);
const communicationsSmsSchedulingOnlyLabel = computed(() =>
  isWorkforceAudience.value ? 'Yes - Scheduling only' : 'Yes - Scheduling only'
);
const templates = ref([]);
const agencyInfo = ref(null);
const organizationInfo = ref(null);
const introIndex = ref(0);
const recaptchaSiteKey = ref(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '');
const useEnterpriseRecaptcha = ref(
  String(import.meta.env.VITE_RECAPTCHA_USE_ENTERPRISE || '').toLowerCase() === 'true'
);
const recaptchaForceWidget = ref(false);
const captchaToken = ref('');
const pollingForDownload = ref(false);
const captchaError = ref('');
const showRecaptchaWidget = ref(false);
const recaptchaWidgetElStart = ref(null);
const recaptchaWidgetId = ref(null);
const captchaWidgetFailed = ref(false);
let recaptchaInitPromise = null;
const activeRecaptchaSiteKey = computed(() =>
  isLocalhostRecaptcha && recaptchaSiteKey.value
    ? LOCALHOST_TEST_RECAPTCHA_SITE_KEY
    : recaptchaSiteKey.value
);
const activeRecaptchaMode = computed(() =>
  isLocalhostRecaptcha ? 'standard' : (useEnterpriseRecaptcha.value ? 'enterprise' : 'standard')
);
const requiresCaptchaAtStart = computed(() =>
  !!recaptchaSiteKey.value
  && recaptchaForceWidget.value === true
  && !isLocalhostRecaptcha
);
const recaptchaLanguageCode = computed(() => (intakeLocale.value === 'es' ? 'es' : 'en'));
const showCaptchaGate = computed(() => requiresCaptchaAtStart.value);
const sessionExpiryMinutes = computed(() => 30 + Math.max(0, Number(templates.value.length || 0)) * 5);
const approvalContext = computed(() => {
  const mode = String(route.query?.mode || '').trim();
  const staffLastName = String(route.query?.staff_last_name || '').trim();
  const clientFirstName = String(route.query?.client_first_name || '').trim();
  const approvedAt = String(route.query?.approved_at || '').trim();
  if (!mode && !staffLastName && !clientFirstName) return null;
  return {
    mode: mode || 'staff_assisted',
    staffLastName: staffLastName || null,
    clientFirstName: clientFirstName || null,
    approvedAt: approvedAt || null
  };
});
const intakeSteps = computed(() =>
  Array.isArray(link.value?.intake_steps) ? link.value.intake_steps : []
);
const hasProgrammedSchoolRoiStep = computed(() =>
  intakeSteps.value.some((step) => String(step?.type || '').trim().toLowerCase() === 'school_roi')
);
const hasRegistrationStep = computed(() =>
  intakeSteps.value.some((step) => String(step?.type || '').trim().toLowerCase() === 'registration')
);
const DEFAULT_GUARDIAN_WAIVER_SECTION_KEYS = [
  'pickup_authorization',
  'emergency_contacts',
  'allergies_snacks',
  'meal_preferences'
];

const FLOW_STEP_VISIBILITY = new Set(['always', 'new_client_only', 'existing_client_only']);

const shouldSkipPaymentCollectionStep = () => {
  const insInfo = intakeResponses.submission?.insuranceInfo;
  if (insInfo?.primaryIsMedicaid) return true;

  const selections = Array.isArray(intakeResponses.submission?.registrationSelections)
    ? intakeResponses.submission.registrationSelections
    : [];
  if (!selections.length) return false;

  const hasOnlyMedicaidSelections = selections.every((sel) => {
    const medicaidEligible = sel?.medicaidEligible === true || sel?.medicaidEligible === 1;
    const cashEligible = sel?.cashEligible === true || sel?.cashEligible === 1;
    return medicaidEligible && !cashEligible;
  });
  return hasOnlyMedicaidSelections;
};

const flowSteps = computed(() => {
  // Keep this independent from later-declared computed refs to avoid setup TDZ.
  const forceRegistrationStepVisible =
    formTypeKey.value === 'smart_registration'
    || (formTypeKey.value === 'intake' && hasRegistrationStep.value);
  const isExisting =
    String(intakeResponses.submission?.registration_client_match || '').trim().toLowerCase() === 'existing';
  const stepVisible = (s) => {
    if (!s) return true;
    // Registration (event / enrollment) is always part of the session for smart registration — same as starting other intakes.
    // "Skip for existing" applies to questions, documents, and uploads via their visibility, not by hiding registration.
    if (forceRegistrationStepVisible && s.type === 'registration') return true;
    const vis = (String(s.visibility ?? '').trim().toLowerCase() || 'always');
    if (!FLOW_STEP_VISIBILITY.has(vis) || vis === 'always') return true;
    if (vis === 'new_client_only') return !isExisting;
    if (vis === 'existing_client_only') return isExisting;
    return true;
  };
  if (intakeSteps.value.length) {
    return intakeSteps.value
      .filter(
        (s) =>
          s?.type === 'document'
          || s?.type === 'upload'
          || s?.type === 'school_roi'
          || s?.type === 'registration'
          || s?.type === 'guardian_waiver'
          || s?.type === 'insurance_info'
          || s?.type === 'payment_collection'
          || s?.type === 'communications'
          || s?.type === 'references'
          || s?.type === 'demographics'
          || s?.type === 'clinical_questions'
      )
      .filter((s) => {
        // Skip payment_collection when the guardian selected Medicaid coverage
        // or all selected registrations are Medicaid-only.
        if (s?.type === 'payment_collection') {
          if (shouldSkipPaymentCollectionStep()) return false;
        }
        return stepVisible(s);
      })
      .map((s) => {
        if (s.type === 'upload') return { ...s };
        if (s.type === 'school_roi') return { ...s };
        if (s.type === 'registration') return { ...s };
        if (s.type === 'guardian_waiver') return { ...s };
        if (s.type === 'insurance_info') return { ...s };
        if (s.type === 'payment_collection') return { ...s };
        if (s.type === 'communications') return { ...s };
        if (s.type === 'references') return { ...s };
        if (s.type === 'demographics') return { ...s };
        if (s.type === 'clinical_questions') return { ...s };
        const template = templates.value.find((t) => Number(t.id) === Number(s.templateId));
        return { ...s, template };
      });
  }
  return templates.value.map((t) => ({ id: `doc_${t.id}`, type: 'document', template: t }));
});
const currentFlowIndex = ref(0);
const currentFlowStep = computed(() => flowSteps.value[currentFlowIndex.value] || null);
const isUploadPasteEnabled = computed(() => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'upload') return false;
  const label = String(step.label || '').toLowerCase();
  return !!step.allowPasteText || label.includes('cover') || label.includes('resume') || label.includes('cv');
});
const isCoverLetterStep = computed(() => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'upload') return false;
  const label = String(step.label || '').toLowerCase();
  return label.includes('cover');
});
const isResumeStep = computed(() => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'upload') return false;
  const label = String(step.label || '').toLowerCase();
  return label.includes('resume') || label.includes('cv');
});
const uploadPastePlaceholder = computed(() => {
  if (isResumeStep.value) return 'Paste your resume here';
  if (isCoverLetterStep.value) return 'Paste your cover letter here';
  return 'Paste your text here';
});
const isUploadStepBlockingContinue = computed(() => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'upload' || !step.required) return false;
  if (isUploadPasteEnabled.value && coverLetterInputMode.value === 'paste') {
    return String(coverLetterPastedText.value || '').trim().length === 0;
  }
  return uploadStepFiles.value.length === 0;
});

const currentGuardianWaiverSectionKeys = computed(() => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'guardian_waiver') return DEFAULT_GUARDIAN_WAIVER_SECTION_KEYS;
  const keys = Array.isArray(step.sectionKeys)
    ? step.sectionKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  return keys.length ? keys : DEFAULT_GUARDIAN_WAIVER_SECTION_KEYS;
});
const GUARDIAN_WAIVER_RENDERABLE_SECTION_KEYS = new Set([
  'pickup_authorization',
  'emergency_contacts',
  'allergies_snacks',
  'meal_preferences'
]);
const guardianWaiverSectionLabels = {
  pickup_authorization: 'pickup authorization',
  emergency_contacts: 'emergency contacts',
  allergies_snacks: 'medical information & allergies',
  meal_preferences: 'meals'
};
const guardianWaiverValidationKeys = computed(() => {
  const ctx = eventWaiverContext.value || {};
  const keys = [...new Set(currentGuardianWaiverSectionKeys.value)];
  return keys.filter((key) => {
    if (!GUARDIAN_WAIVER_RENDERABLE_SECTION_KEYS.has(key)) return false;
    if (key === 'meal_preferences' && ctx.mealsAvailable === false) return false;
    return true;
  });
});

function hasAnyFilledText(values = []) {
  return values.some((v) => String(v ?? '').trim().length > 0);
}

function isOptionalGuardianWaiverSectionSkipped(sectionKey, payload) {
  if (!payload || typeof payload !== 'object') return true;
  if (sectionKey === 'pickup_authorization') {
    if (payload.declinePickupAuthorization === true) return true;
    const rows = Array.isArray(payload.authorizedPickups) ? payload.authorizedPickups : [];
    return !rows.some((row) =>
      hasAnyFilledText([row?.name, row?.relationship, row?.phone])
    );
  }
  if (sectionKey === 'emergency_contacts') {
    if (payload.declineEmergencyContacts === true) return true;
    const rows = Array.isArray(payload.contacts) ? payload.contacts : [];
    return !rows.some((row) =>
      hasAnyFilledText([row?.name, row?.relationship, row?.phone])
    );
  }
  return false;
}

const guardianWaiverClientLabels = computed(() => {
  const list = clients.value || [];
  return list.map((c, i) => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return name || `Child ${i + 1}`;
  });
});
const guardianDisplayNameForInsurance = computed(() =>
  [guardianFirstName.value, guardianLastName.value].filter(Boolean).join(' ').trim()
);
const insuranceClientNames = computed(() => guardianWaiverClientLabels.value);
const guardianDefaultPickup = computed(() => ({
  name: guardianDisplayNameForInsurance.value,
  relationship: String(guardianRelationship.value || '').trim() || 'Parent/Guardian',
  phone: String(guardianPhone.value || '').trim()
}));

function ensureGuardianWaiverIntakeShape() {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'guardian_waiver') return;
  if (!intakeResponses.submission || typeof intakeResponses.submission !== 'object') {
    intakeResponses.submission = {};
  }
  if (
    !intakeResponses.submission.guardianWaiverIntake
    || typeof intakeResponses.submission.guardianWaiverIntake !== 'object'
  ) {
    intakeResponses.submission.guardianWaiverIntake = { clients: [] };
  }
  const gw = intakeResponses.submission.guardianWaiverIntake;
  gw.stepId = step.id || null;
  const n = Math.max(1, clients.value.length);
  while (gw.clients.length < n) {
    gw.clients.push({ sections: {} });
  }
  while (gw.clients.length > n) {
    gw.clients.pop();
  }
}

const guardianWaiverBundleRef = computed(() => {
  void clients.value.length;
  ensureGuardianWaiverIntakeShape();
  const sub = intakeResponses.submission;
  if (!sub?.guardianWaiverIntake) {
    return { clients: [] };
  }
  return sub.guardianWaiverIntake;
});

watch(
  flowSteps,
  (steps) => {
    if (!steps.length) {
      currentFlowIndex.value = 0;
      return;
    }
    if (currentFlowIndex.value > steps.length - 1) {
      currentFlowIndex.value = Math.max(0, steps.length - 1);
    }
  },
  { flush: 'post' }
);

watch(
  () => [currentFlowStep.value?.id, currentFlowStep.value?.type],
  () => {
    if (currentFlowStep.value?.type !== 'communications') return;
    const stored = intakeResponses.submission?.communicationPreferences || {};
    communications.emailPreference = String(stored.emailPreference || communications.emailPreference || '');
    communications.smsPreference = String(stored.smsPreference || communications.smsPreference || '');
    communications.providerTextingOptIn = String(stored.providerTextingOptIn || communications.providerTextingOptIn || '');
    communications.programUpdatesOptIn = String(stored.programUpdatesOptIn || communications.programUpdatesOptIn || '');
    communications.internalWorkforceOptIn = String(stored.internalWorkforceOptIn || communications.internalWorkforceOptIn || '');
  },
  { immediate: true }
);

const getCurrentRegistrationRules = () => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'registration') return { allowMultiple: false, minSelections: 1, maxSelections: 1 };
  const allowMultiple = !!step?.selectionRules?.allowMultiple;
  const minRaw = Number(step?.selectionRules?.minSelections ?? 1);
  const maxRaw = Number(step?.selectionRules?.maxSelections ?? (allowMultiple ? 0 : 1));
  return {
    allowMultiple,
    minSelections: Math.max(0, Number.isFinite(minRaw) ? Math.trunc(minRaw) : 1),
    maxSelections: allowMultiple
      ? (Number.isFinite(maxRaw) && maxRaw > 0 ? Math.trunc(maxRaw) : null)
      : 1
  };
};

/** When intake_links.company_event_id is set, narrow options to that event (and hide picker in UI). */
const filterRegistrationOptionsByLinkedEvent = (options) => {
  const lockId = Number(link.value?.company_event_id || 0) || null;
  if (!lockId || !Array.isArray(options)) return options;
  const narrowed = options.filter((o) =>
    ['company_event', 'event'].includes(String(o.entityType || '').toLowerCase())
    && Number(o.entityId) === lockId
  );
  return narrowed.length ? narrowed : [];
};

const currentRegistrationOptions = computed(() => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'registration') return [];
  if (String(step.sourceType || '') === 'agency_catalog') {
    const rows = Array.isArray(agencyRegistrationCatalog.value) ? agencyRegistrationCatalog.value : [];
    const mapped = rows
      .filter((it) => it && typeof it === 'object')
      .map((it) => {
        const kind = String(it.kind || '').trim().toLowerCase();
        const id = Number(it.id || 0) || null;
        const entityType = kind === 'company_event' ? 'company_event' : 'class';
        const title = String(it.title || '').trim() || (kind === 'company_event' ? `Event ${id}` : `Class ${id}`);
        const summaryText = String(it.summary || '').trim();
        const startsAtFormatted = formatIsoDatetime(it.startsAt);
        const endsAtFormatted = formatIsoDatetime(it.endsAt);
        const dollars = Math.max(0, Number(step?.selfPay?.costDollars || 0) || 0);
        return {
          id: `cat_${kind}_${id}`,
          label: title,
          description: [summaryText, startsAtFormatted ? `Starts: ${startsAtFormatted}` : ''].filter(Boolean).join(' · '),
          summaryText,
          startsAtFormatted,
          endsAtFormatted,
          startsAtRaw: it.startsAt || null,
          endsAtRaw: it.endsAt || null,
          imageUrl: String(it.imageUrl || it.image_url || '').trim(),
          entityType,
          entityId: id,
          videoJoinUrl: String(step.defaultVideoUrl || '').trim(),
          paymentLinkUrl: String(step?.selfPay?.paymentLinkUrl || '').trim(),
          costDollars: dollars,
          providerUserIdsCsv: String(step.providerUserIdsCsv || '').trim(),
          medicaidEligible: !!it.medicaidEligible,
          cashEligible: !!it.cashEligible,
          scheduleBlocks: [],
          frequencyLabel: null,
          termsSummary: null,
          displayCost: dollars > 0 ? `$${dollars.toFixed(2)}` : ''
        };
      })
      .filter((opt) => opt.id && opt.label && opt.entityId);
    return filterRegistrationOptionsByLinkedEvent(mapped);
  }
  const raw = Array.isArray(step.options)
    ? step.options
    : (Array.isArray(step.sourceConfig?.options) ? step.sourceConfig.options : []);
  const mappedManual = raw
    .filter((opt) => opt && typeof opt === 'object')
    .map((opt) => ({
      id: String(opt.id || opt.value || opt.label || '').trim(),
      label: String(opt.label || opt.value || '').trim(),
      description: String(opt.description || '').trim(),
      entityType: String(opt.entityType || step.sourceType || 'manual').trim().toLowerCase(),
      entityId: Number(opt.entityId || 0) || null,
      videoJoinUrl: String(opt.videoJoinUrl || step.defaultVideoUrl || '').trim(),
      paymentLinkUrl: String(opt.paymentLinkUrl || step?.selfPay?.paymentLinkUrl || '').trim(),
      costDollars: Math.max(0, Number(opt.costDollars || step?.selfPay?.costDollars || 0) || 0),
      providerUserIdsCsv: String(opt.providerUserIdsCsv || step.providerUserIdsCsv || '').trim(),
      medicaidEligible: !!opt.medicaidEligible,
      cashEligible: !!opt.cashEligible,
      scheduleBlocks: Array.isArray(opt.scheduleBlocks)
        ? opt.scheduleBlocks
          .filter((sb) => sb && typeof sb === 'object')
          .map((sb) => ({
            id: String(sb.id || ''),
            label: String(sb.label || '').trim(),
            startDate: String(sb.startDate || '').trim(),
            endDate: String(sb.endDate || '').trim(),
            startTime: String(sb.startTime || '').trim(),
            endTime: String(sb.endTime || '').trim(),
            sequenceDays: Math.max(1, Number(sb.sequenceDays || 1) || 1)
          }))
        : [],
      frequencyLabel: String(opt.frequencyLabel || '').trim(),
      termsSummary: String(opt.termsSummary || '').trim(),
      displayCost: (() => {
        const dollars = Math.max(0, Number(opt.costDollars || step?.selfPay?.costDollars || 0) || 0);
        return dollars > 0 ? `$${dollars.toFixed(2)}` : '';
      })()
    }))
    .filter((opt) => opt.id && opt.label);
  return filterRegistrationOptionsByLinkedEvent(mappedManual);
});

const hideRegistrationOptionsPicker = computed(() => {
  const lockId = Number(link.value?.company_event_id || 0) || null;
  if (!lockId || currentFlowStep.value?.type !== 'registration') return false;
  const opts = currentRegistrationOptions.value;
  if (opts.length !== 1) return false;
  const o = opts[0];
  return ['company_event', 'event'].includes(String(o.entityType || '').toLowerCase())
    && Number(o.entityId) === lockId;
});
const isCurrentRegistrationMulti = computed(() => getCurrentRegistrationRules().allowMultiple);
const currentRegistrationScheduleBlocks = computed(() => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'registration') return [];
  return (Array.isArray(step.scheduleBlocks) ? step.scheduleBlocks : [])
    .filter((sb) => sb && typeof sb === 'object')
    .map((sb) => ({
      id: String(sb.id || ''),
      label: String(sb.label || '').trim(),
      startDate: String(sb.startDate || '').trim(),
      endDate: String(sb.endDate || '').trim(),
      startTime: String(sb.startTime || '').trim(),
      endTime: String(sb.endTime || '').trim(),
      sequenceDays: Math.max(1, Number(sb.sequenceDays || 1) || 1)
    }));
});
const step = ref(1);
const submissionId = ref(null);
const consentLoading = ref(false);
const submitLoading = ref(false);
const currentDocIndex = ref(0);
const signatureBlockRef = ref(null);
const signatureBlockFlash = ref(false);
const signatureData = ref('');
const lastSignatureData = ref('');
const showSavedSigPrompt = ref(false);
const signatureDocFlowIndexes = computed(() =>
  flowSteps.value
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => s?.type === 'document' && s?.template?.document_action_type === 'signature')
    .map(({ idx }) => idx)
);
const firstSignatureFlowIndex = computed(() =>
  signatureDocFlowIndexes.value.length ? signatureDocFlowIndexes.value[0] : -1
);
const allowSignatureReuseActions = computed(() => {
  const first = firstSignatureFlowIndex.value;
  if (first < 0) return false;
  return currentFlowIndex.value > first;
});
const pdfUrl = ref(null);
const pdfPreviewRef = ref(null);
const reviewPage = ref(1);
const reviewTotalPages = ref(0);
const canProceed = ref(true);
const pageNotice = ref('');
let pageNoticeTimer = null;
const navPulse = ref(false);
let navPulseTimer = null;
const emergencyPulse = ref(false);
let emergencyPulseTimer = null;
const docStatus = reactive({});
const uploadStatus = reactive({});
const uploadStepFiles = ref([]);
const uploadStepInputRef = ref(null);
const coverLetterInputMode = ref('upload');
const coverLetterPastedText = ref('');
const referencesEntries = ref([
  { name: '', relationship: '', organization: '', phone: '', email: '' },
  { name: '', relationship: '', organization: '', phone: '', email: '' },
  { name: '', relationship: '', organization: '', phone: '', email: '' }
]);
const referencesWaived = ref(false);
const jobDescriptionSummary = ref(null);
const jobAckPdfZoom = ref(125);
const jobDescriptionAcknowledged = ref(false);
const defaultReferencesAuthorizationNotice =
  'By submitting this information, you authorize [tenant] to contact the individuals listed and obtain information regarding your employment history, educational background, professional conduct, and qualifications for employment.';
const embeddedSmartSchoolRoi = ref(null);
const agencyRegistrationCatalog = ref([]);

/**
 * Derive snack/meal config for the guardian waiver step from whichever company event
 * the guardian selected in the registration step. Falls back to "snacks yes, no meals"
 * when no catalog event is found.
 */
const eventWaiverContext = computed(() => {
  const sels = intakeResponses.submission?.registrationSelections;
  const selArr = Array.isArray(sels) ? sels : [];
  // Find first selection that references a company event
  for (const sel of selArr) {
    if (sel.entityType === 'company_event' && sel.entityId) {
      const catalogItem = agencyRegistrationCatalog.value.find(
        (item) => item.kind === 'company_event' && Number(item.id) === Number(sel.entityId)
      );
      if (catalogItem) {
        return {
          snacksAvailable: catalogItem.snacksAvailable !== false,
          snackOptions: Array.isArray(catalogItem.snackOptions) ? catalogItem.snackOptions : [],
          mealsAvailable: !!catalogItem.mealsAvailable,
          mealOptions: Array.isArray(catalogItem.mealOptions) ? catalogItem.mealOptions : []
        };
      }
    }
  }
  // If the link is locked to a specific event, look for it in the catalog too
  const linkedEventId = Number(link.value?.company_event_id || 0);
  if (linkedEventId) {
    const catalogItem = agencyRegistrationCatalog.value.find(
      (item) => item.kind === 'company_event' && Number(item.id) === linkedEventId
    );
    if (catalogItem) {
      return {
        snacksAvailable: catalogItem.snacksAvailable !== false,
        snackOptions: Array.isArray(catalogItem.snackOptions) ? catalogItem.snackOptions : [],
        mealsAvailable: !!catalogItem.mealsAvailable,
        mealOptions: Array.isArray(catalogItem.mealOptions) ? catalogItem.mealOptions : []
      };
    }
  }
  return { snacksAvailable: true, snackOptions: [], mealsAvailable: false, mealOptions: [] };
});

const registrationCompletion = ref(null);
const loginHelpSending = ref(false);
const loginHelpMessage = ref('');
const missingRequiredQuestionKeys = ref([]);

/** The event the user just registered for (title, date, iCal link) — derived from selections + catalog. */
const registeredEventSummary = computed(() => {
  const selections = Array.isArray(intakeResponses.submission?.registrationSelections)
    ? intakeResponses.submission.registrationSelections
    : [];
  // Prefer catalog-backed event
  const eventSel = selections.find((s) => {
    const et = String(s?.entityType || s?.type || '').toLowerCase();
    return et === 'company_event' || et === 'event';
  }) || selections[0] || null;
  if (!eventSel) {
    // Fall back to eventSummary hint from backend (available after polling)
    const hint = String(registrationCompletion.value?.eventSummary || '').trim();
    if (hint) return { title: hint, startsAtFormatted: null, icalUrl: null, startsAtRaw: null, endsAtRaw: null };
    return null;
  }
  // Try to match in catalog rows for rich data
  const catalog = Array.isArray(agencyRegistrationCatalog.value) ? agencyRegistrationCatalog.value : [];
  const catRow = catalog.find((r) => Number(r.id) === Number(eventSel.entityId));
  const title = String(catRow?.title || eventSel.label || '').trim();
  const startsAtRaw = catRow?.startsAt || null;
  const endsAtRaw = catRow?.endsAt || null;
  const startsAtFormatted = formatIsoDatetime(startsAtRaw);
  const icalUrl = buildIcalDataUri({
    title,
    startsAt: startsAtRaw,
    endsAt: endsAtRaw,
    description: String(catRow?.summary || '').trim()
  });
  return { title, startsAtFormatted, icalUrl, startsAtRaw, endsAtRaw };
});
const fieldValuesByTemplate = reactive({});
const sessionToken = ref(String(route.query?.session || '').trim());
const submissionStorageKey = computed(() =>
  sessionToken.value ? `public_intake_submission_${publicKey}_${sessionToken.value}` : `public_intake_submission_${publicKey}`
);
const draftStorageKey = computed(() => `public_intake_draft_${publicKey}`);
const DRAFT_STORAGE_VERSION = 1;
const DRAFT_TTL_MS = 60 * 60 * 1000;
const isRestoringDraft = ref(false);
const draftRestoredMessage = ref('');
let draftPersistTimer = null;
let draftRestoredBannerTimer = null;

const signerInitials = ref('');
const boundClient = ref(null);
const roiContext = ref(null);
const organizationId = ref('');

const guardianFirstName = ref('');
const guardianLastName = ref('');
const guardianEmail = ref('');
const guardianPhone = ref('');
const fluentLanguagesInput = ref('');
const guardianRelationship = ref('');
const downloadUrl = ref('');
const clientBundleLinks = ref([]);
const jobApplicationSubmitted = ref(false);
const consentErrors = reactive({
  guardianFirstName: '',
  guardianLastName: '',
  guardianEmail: '',
  guardianPhone: '',
  clientFirstName: '',
  clientLastName: '',
  organizationId: ''
});
const intakeForSelf = ref(false);
const registrationAccountLookupChecked = ref(false);
const registrationAccountLookupLoading = ref(false);
const registrationAccountExists = ref(false);
let registrationLookupTimer = null;
const ensureRegistrationMaps = () => {
  if (!intakeResponses.submission || typeof intakeResponses.submission !== 'object') {
    intakeResponses.submission = {};
  }
  if (!intakeResponses.submission.registrationSelectionIdsByStep || typeof intakeResponses.submission.registrationSelectionIdsByStep !== 'object') {
    intakeResponses.submission.registrationSelectionIdsByStep = {};
  }
  if (!intakeResponses.submission.registrationSelectionsByStep || typeof intakeResponses.submission.registrationSelectionsByStep !== 'object') {
    intakeResponses.submission.registrationSelectionsByStep = {};
  }
  if (!intakeResponses.submission.registrationParticipantByStep || typeof intakeResponses.submission.registrationParticipantByStep !== 'object') {
    intakeResponses.submission.registrationParticipantByStep = {};
  }
};
const getRegistrationSelectionIds = (stepId) => {
  ensureRegistrationMaps();
  const key = String(stepId || '').trim();
  if (!key) return [];
  const list = intakeResponses.submission.registrationSelectionIdsByStep[key];
  return Array.isArray(list) ? list.map((id) => String(id)).filter(Boolean) : [];
};
const setRegistrationSelectionIds = (stepId, ids = []) => {
  ensureRegistrationMaps();
  const key = String(stepId || '').trim();
  if (!key) return;
  intakeResponses.submission.registrationSelectionIdsByStep[key] =
    Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean)));
};
const isRegistrationOptionSelected = (stepId, optionId) => {
  const id = String(optionId || '').trim();
  if (!id) return false;
  return getRegistrationSelectionIds(stepId).includes(id);
};
const getRegistrationParticipant = (stepId) => {
  ensureRegistrationMaps();
  const key = String(stepId || '').trim();
  if (!key) return { alreadyInSystem: false, lookupField: 'email', lookupValue: '' };
  const p = intakeResponses.submission.registrationParticipantByStep[key];
  if (!p || typeof p !== 'object') return { alreadyInSystem: false, lookupField: 'email', lookupValue: '' };
  return {
    alreadyInSystem: !!p.alreadyInSystem,
    lookupField: ['email', 'phone', 'client_id'].includes(String(p.lookupField || '')) ? String(p.lookupField) : 'email',
    lookupValue: String(p.lookupValue || '').trim()
  };
};
const setRegistrationParticipant = (stepId, patch = {}) => {
  ensureRegistrationMaps();
  const key = String(stepId || '').trim();
  if (!key) return;
  const curr = getRegistrationParticipant(key);
  intakeResponses.submission.registrationParticipantByStep[key] = {
    ...curr,
    ...patch
  };
};
const isCurrentRegistrationExistingParticipant = computed(() => {
  const stepId = String(currentFlowStep.value?.id || '').trim();
  if (!stepId || currentFlowStep.value?.type !== 'registration') return false;
  return !!getRegistrationParticipant(stepId).alreadyInSystem;
});
const setCurrentRegistrationExistingParticipant = (checked) => {
  const stepId = String(currentFlowStep.value?.id || '').trim();
  if (!stepId || currentFlowStep.value?.type !== 'registration') return;
  setRegistrationParticipant(stepId, { alreadyInSystem: !!checked });
};
const currentRegistrationLookupValue = computed({
  get: () => {
    const stepId = String(currentFlowStep.value?.id || '').trim();
    if (!stepId || currentFlowStep.value?.type !== 'registration') return '';
    return getRegistrationParticipant(stepId).lookupValue;
  },
  set: (value) => {
    const stepId = String(currentFlowStep.value?.id || '').trim();
    if (!stepId || currentFlowStep.value?.type !== 'registration') return;
    setRegistrationParticipant(stepId, { lookupValue: String(value || '').trim() });
  }
});
const currentRegistrationLookupPlaceholder = computed(() => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'registration') return 'Lookup value';
  const lookupField = ['email', 'phone', 'client_id'].includes(String(step.existingLookupField || ''))
    ? String(step.existingLookupField)
    : 'email';
  if (lookupField === 'phone') return 'Enter your phone';
  if (lookupField === 'client_id') return 'Enter your client ID';
  return 'Enter your email';
});
const formatScheduleBlock = (sb) => {
  const parts = [];
  if (sb.startDate && sb.endDate) parts.push(`${sb.startDate} to ${sb.endDate}`);
  else if (sb.startDate) parts.push(sb.startDate);
  if (sb.startTime || sb.endTime) parts.push(`${sb.startTime || '--:--'} - ${sb.endTime || '--:--'}`);
  if (sb.sequenceDays && Number(sb.sequenceDays) > 1) parts.push(`${Number(sb.sequenceDays)} day sequence`);
  return parts.join(' | ') || 'Schedule details pending';
};
const selectSingleRegistrationOption = (stepId, optionId) => {
  const id = String(optionId || '').trim();
  if (!id) return;
  setRegistrationSelectionIds(stepId, [id]);
};
const toggleRegistrationOption = (stepId, optionId) => {
  const id = String(optionId || '').trim();
  if (!id) return;
  const existing = getRegistrationSelectionIds(stepId);
  if (existing.includes(id)) {
    setRegistrationSelectionIds(stepId, existing.filter((x) => x !== id));
  } else {
    const rules = getCurrentRegistrationRules();
    const next = [...existing, id];
    if (rules.maxSelections && next.length > rules.maxSelections) return;
    setRegistrationSelectionIds(stepId, next);
  }
};
const clearPersistedDraft = () => {
  try {
    localStorage.removeItem(submissionStorageKey.value);
    localStorage.removeItem(draftStorageKey.value);
  } catch {
    // ignore browser storage errors
  }
};

const buildDraftSnapshot = () => ({
  version: DRAFT_STORAGE_VERSION,
  savedAt: new Date().toISOString(),
  sessionToken: String(sessionToken.value || '').trim() || null,
  submissionId: submissionId.value || null,
  step: Number(step.value || 0),
  introIndex: Number(introIndex.value || 0),
  currentFlowIndex: Number(currentFlowIndex.value || 0),
  intakeForSelf: intakeForSelf.value,
  organizationId: organizationId.value || null,
  guardian: {
    firstName: guardianFirstName.value || '',
    lastName: guardianLastName.value || '',
    email: guardianEmail.value || '',
    phone: guardianPhone.value || '',
    relationship: guardianRelationship.value || ''
  },
  clients: Array.isArray(clients.value)
    ? clients.value.map((client) => ({
        firstName: client?.firstName || '',
        lastName: client?.lastName || ''
      }))
    : [],
  intakeResponses: {
    guardian: intakeResponses.guardian || {},
    submission: intakeResponses.submission || {},
    clients: intakeResponses.clients || []
  },
  embeddedSmartSchoolRoi: embeddedSmartSchoolRoi.value || null
});

const persistDraftSnapshot = () => {
  if (isRestoringDraft.value) return;
  try {
    const payload = JSON.stringify(buildDraftSnapshot());
    localStorage.setItem(submissionStorageKey.value, payload);
    localStorage.setItem(draftStorageKey.value, payload);
  } catch {
    // ignore browser storage errors
  }
};

const queueDraftPersist = () => {
  if (isRestoringDraft.value) return;
  if (draftPersistTimer) clearTimeout(draftPersistTimer);
  draftPersistTimer = setTimeout(() => {
    persistDraftSnapshot();
  }, 150);
};

const persistDraftOnPageExit = () => {
  // Flush immediately when user backgrounds/leaves to avoid losing recent input.
  persistDraftSnapshot();
};

const handleVisibilityDraftPersist = () => {
  if (document.visibilityState === 'hidden') {
    persistDraftSnapshot();
  }
};

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 900px)').matches;

const syncMobileStepScroll = async () => {
  if (!isMobileViewport()) return;
  await nextTick();

  const isDocStep = step.value === 2 && currentFlowStep.value?.type === 'document';
  if (isDocStep) {
    // Keep doc nav + preview in view so reviewing/next actions are immediately accessible.
    const nav = document.querySelector('.doc-nav');
    if (nav?.scrollIntoView) {
      nav.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const preview = document.querySelector('.doc-preview');
    if (preview?.scrollIntoView) {
      preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const hasMeaningfulDraftSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (Number(snapshot.step || 0) > 1) return true;
  if (snapshot.submissionId) return true;
  const guardian = snapshot.guardian || {};
  if (
    String(guardian.firstName || '').trim()
    || String(guardian.lastName || '').trim()
    || String(guardian.email || '').trim()
    || String(guardian.phone || '').trim()
    || String(guardian.relationship || '').trim()
  ) return true;
  if (Array.isArray(snapshot.clients) && snapshot.clients.some((c) =>
    String(c?.firstName || '').trim() || String(c?.lastName || '').trim()
  )) return true;
  if (snapshot.embeddedSmartSchoolRoi && typeof snapshot.embeddedSmartSchoolRoi === 'object') return true;
  return false;
};

const showDraftRestoredBanner = () => {
  draftRestoredMessage.value = t('draftRestored');
  if (draftRestoredBannerTimer) clearTimeout(draftRestoredBannerTimer);
  draftRestoredBannerTimer = setTimeout(() => {
    draftRestoredMessage.value = '';
  }, 7000);
};

const restoreDraftSnapshot = () => {
  const tryRead = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  let parsed = tryRead(submissionStorageKey.value) || tryRead(draftStorageKey.value);
  if (!parsed || parsed.version !== DRAFT_STORAGE_VERSION) return false;
  if (!hasMeaningfulDraftSnapshot(parsed)) {
    clearPersistedDraft();
    return false;
  }
  const savedAtMs = parsed?.savedAt ? new Date(parsed.savedAt).getTime() : 0;
  if (!savedAtMs || Number.isNaN(savedAtMs) || (Date.now() - savedAtMs) > DRAFT_TTL_MS) {
    clearPersistedDraft();
    return false;
  }
  if (!sessionToken.value && String(parsed.sessionToken || '').trim()) {
    sessionToken.value = String(parsed.sessionToken).trim();
    router.replace({ query: { ...route.query, session: sessionToken.value } }).catch(() => {});
  }
  isRestoringDraft.value = true;
  try {
    if (typeof parsed.intakeForSelf === 'boolean') intakeForSelf.value = parsed.intakeForSelf;
    if (parsed.organizationId !== null && parsed.organizationId !== undefined) {
      organizationId.value = parsed.organizationId;
    }
    guardianFirstName.value = String(parsed.guardian?.firstName || guardianFirstName.value || '');
    guardianLastName.value = String(parsed.guardian?.lastName || guardianLastName.value || '');
    guardianEmail.value = String(parsed.guardian?.email || guardianEmail.value || '');
    guardianPhone.value = String(parsed.guardian?.phone || guardianPhone.value || '');
    guardianRelationship.value = String(parsed.guardian?.relationship || guardianRelationship.value || '');

    if (Array.isArray(parsed.clients) && parsed.clients.length) {
      clients.value = parsed.clients.map((client) => ({
        firstName: String(client?.firstName || ''),
        lastName: String(client?.lastName || '')
      }));
    }
    if (parsed.intakeResponses && typeof parsed.intakeResponses === 'object') {
      intakeResponses.guardian = parsed.intakeResponses.guardian || {};
      intakeResponses.submission = parsed.intakeResponses.submission || {};
      intakeResponses.clients = Array.isArray(parsed.intakeResponses.clients)
        ? parsed.intakeResponses.clients
        : [{}];
    }
    embeddedSmartSchoolRoi.value = parsed.embeddedSmartSchoolRoi || null;
    submissionId.value = parsed.submissionId || submissionId.value || null;
    if (Number.isFinite(Number(parsed.introIndex))) introIndex.value = Math.max(0, Number(parsed.introIndex));
    if (Number.isFinite(Number(parsed.currentFlowIndex))) currentFlowIndex.value = Math.max(0, Number(parsed.currentFlowIndex));
    if (Number.isFinite(Number(parsed.step))) step.value = Number(parsed.step);
    return true;
  } finally {
    isRestoringDraft.value = false;
  }
};

const guardianDisplayName = computed(() =>
  `${guardianFirstName.value || ''} ${guardianLastName.value || ''}`.trim()
);
const isClientBound = computed(() => !!boundClient.value?.id);
const boundClientDisplayName = computed(() =>
  String(boundClient.value?.full_name || '').trim()
  || clientDisplayNames.value[0]
  || 'Assigned client'
);
const clientDisplayNames = computed(() =>
  (clients.value || [])
    .map((c) => `${String(c?.firstName || '').trim()} ${String(c?.lastName || '').trim()}`.trim())
    .filter(Boolean)
);
const getDocumentFieldFallbackValue = (field) => {
  const normalize = (val) =>
    String(val || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ');
  const label = normalize(field?.label || field?.id || '');
  if (!label) return '';
  if (label.includes('printed client name') || label.includes('client name')) {
    return clientDisplayNames.value[0] || '';
  }
  if (label.includes('relationship')) {
    return guardianRelationship.value || '';
  }
  return '';
};

const splitClientName = (fullName) => {
  const raw = String(fullName || '').trim();
  if (!raw) return { firstName: '', lastName: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
};

const resolveLogoUrl = (org) => {
  if (!org) return null;
  if (org.logo_path) return toUploadsUrl(org.logo_path);
  if (org.logo_url) return org.logo_url;
  return null;
};

const getDisplayName = (org) => {
  if (!org) return null;
  return org.official_name || org.name || null;
};

const introScreens = computed(() => {
  const screens = [];
  const scopeType = String(link.value?.scope_type || '').toLowerCase();
  const agencyName = getDisplayName(agencyInfo.value);
  if (agencyName) {
    screens.push({
      key: 'agency',
      displayName: agencyName,
      logoUrl: resolveLogoUrl(agencyInfo.value),
      altText: `${agencyName} logo`,
      subtitle: t('introAgencySubtitle')
    });
  }

  const orgName = getDisplayName(organizationInfo.value);
  if (orgName && organizationInfo.value?.id !== agencyInfo.value?.id) {
    screens.push({
      key: 'organization',
      displayName: orgName,
      logoUrl: resolveLogoUrl(organizationInfo.value),
      altText: `${orgName} logo`,
      subtitle: scopeType === 'school' ? t('introSchoolSubtitle') : t('introOrgSubtitle')
    });
  }

  return screens;
});

const currentIntro = computed(() => introScreens.value[introIndex.value] || null);

const currentDoc = computed(() => {
  if (currentFlowStep.value?.type === 'document') {
    return currentFlowStep.value.template || null;
  }
  return templates.value[currentDocIndex.value] || null;
});
const currentFieldDefinitions = computed(() => {
  const raw = currentDoc.value?.field_definitions || [];
  try {
    return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
});
const isFieldVisible = (def, values) => {
  const showIf = def?.showIf;
  if (!showIf || !showIf.fieldId) return true;
  const actual = values[showIf.fieldId];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map(String).includes(String(actual));
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '') === String(expected ?? '');
};
const visibleFieldDefinitions = computed(() =>
  currentFieldDefinitions.value.filter((def) => isFieldVisible(def, currentFieldValues.value))
);
const shouldHideDocumentField = (field) => {
  const normalize = (val) =>
    String(val || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '_');
  const key = normalize(resolvePrefillKey(field));
  const label = normalize(field?.label);
  const id = normalize(field?.id);
  const hiddenKeys = new Set(['client_first', 'client_last', 'relationship']);
  if (hiddenKeys.has(key)) return true;
  if (hiddenKeys.has(label)) return true;
  if (hiddenKeys.has(id)) return true;
  return false;
};
const displayedFieldDefinitions = computed(() =>
  visibleFieldDefinitions.value.filter((def) => !shouldHideDocumentField(def))
);
const currentFieldValues = computed(() => {
  const id = currentDoc.value?.id;
  if (!id) return {};
  if (!fieldValuesByTemplate[id]) {
    fieldValuesByTemplate[id] = {};
  }
  return fieldValuesByTemplate[id];
});
const checkboxDisclaimer = computed(() =>
  String(currentFlowStep.value?.checkboxDisclaimer || '').trim()
);
const activeMarkerId = ref(null);
const checkboxMarkers = computed(() =>
  displayedFieldDefinitions.value
    .filter((field) => field?.type === 'checkbox' && field?.x !== undefined && field?.y !== undefined)
    .map((field) => ({
      id: field.id,
      label: field.label || 'I agree',
      type: 'checkbox',
      checked: currentFieldValues.value?.[field.id] === true,
      page: Number(field.page || 1),
      x: Number(field.x),
      y: Number(field.y),
      width: Number(field.width || 18),
      height: Number(field.height || 18)
    }))
);
const requiredFieldsForList = computed(() =>
  displayedFieldDefinitions.value.filter((field) => {
    if (field?.type === 'checkbox' && field?.x !== undefined && field?.y !== undefined) return false;
    if (field?.type === 'date' && field?.autoToday) return false;
    return true;
  })
);

const signaturePageNumber = computed(() => {
  const raw = Number(currentDoc.value?.signature_page || currentDoc.value?.signaturePage || 0);
  if (!raw || !Number.isFinite(raw)) return null;
  const maxPage = Number(reviewTotalPages.value || 0);
  if (maxPage > 0) return Math.min(Math.max(raw, 1), maxPage);
  return Math.max(raw, 1);
});

const handleMarkerClick = (marker) => {
  if (!marker || marker.type !== 'checkbox') return;
  const id = marker.id;
  if (!id) return;
  currentFieldValues.value[id] = currentFieldValues.value[id] !== true;
  activeMarkerId.value = id;
};
const requiresOrganizationId = computed(() => {
  const scope = String(link.value?.scope_type || '');
  const ft = String(link.value?.form_type || '').toLowerCase();
  // smart_registration forms are tied to a company event which already carries the
  // organization context — the user should never need to type an org ID.
  if (ft === 'smart_registration' || ft === 'medical_records_request' || ft === 'job_application') return false;
  return scope === 'agency';
});
const isSmartSchoolRoi = computed(() => String(link.value?.form_type || '').toLowerCase() === 'smart_school_roi');
const isSmartRegistration = computed(() => String(link.value?.form_type || '').toLowerCase() === 'smart_registration');
/** Catalog, account lookup, client match, enrollment — Smart Registration or Intake that includes a Registration step. */
const usesRegistrationFeatures = computed(
  () =>
    isSmartRegistration.value
    || (String(link.value?.form_type || '').toLowerCase() === 'intake' && hasRegistrationStep.value)
);
const isExistingClientByMatch = computed(() =>
  String(intakeResponses.submission?.registration_client_match || '').trim().toLowerCase() === 'existing'
);
const isJobApplication = computed(() => String(link.value?.form_type || '').toLowerCase() === 'job_application');
const isMedicalRecordsRequest = computed(() => String(link.value?.form_type || '').toLowerCase() === 'medical_records_request');
const jobAckPdfViewerUrl = computed(() => {
  const base = String(jobDescriptionSummary.value?.fileUrl || '').trim();
  if (!base) return '';
  const withoutFragment = base.split('#')[0];
  return `${withoutFragment}#zoom=${Math.max(75, Math.min(250, Number(jobAckPdfZoom.value || 125) || 125))}`;
});
const increaseJobAckPdfZoom = () => {
  jobAckPdfZoom.value = Math.min(250, Number(jobAckPdfZoom.value || 125) + 25);
};
const decreaseJobAckPdfZoom = () => {
  jobAckPdfZoom.value = Math.max(75, Number(jobAckPdfZoom.value || 125) - 25);
};
const intakeFields = computed(() => Array.isArray(link.value?.intake_fields) ? link.value.intake_fields : []);
const guardianFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'guardian'));
const submissionFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'submission'));
const clientFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'client'));

const normalizeKey = (val) => String(val || '').trim().toLowerCase();
const normalizeTokens = (val) =>
  String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const matchesToken = (field, pattern) => {
  const key = normalizeTokens(field?.key);
  const label = normalizeTokens(field?.label);
  return pattern.test(key) || pattern.test(label);
};

const hasValue = (val) => val !== null && val !== undefined && (typeof val !== 'string' || val.trim() !== '');
/** Format YYYY-MM-DD as MM/DD/YYYY for display. */
const formatDateForDisplay = (val) => {
  const s = String(val || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [, yyyy, mm, dd] = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return `${mm}/${dd}/${yyyy}`;
};
/** Format an ISO datetime string to a friendly local string like "Monday, April 13, 2026 at 4:00 PM". */
const formatIsoDatetime = (val) => {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return null;
  }
};
/** Build a data-URI for a minimal .ics file so users can add an event to their calendar. */
const buildIcalDataUri = ({ title, startsAt, endsAt, description = '', location = '' }) => {
  if (!title || !startsAt) return null;
  try {
    const toIcsDate = (iso) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    };
    const dtStart = toIcsDate(startsAt);
    if (!dtStart) return null;
    const dtEnd = endsAt ? (toIcsDate(endsAt) || dtStart) : dtStart;
    const safe = (s) => String(s || '').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PTOnboardingApp//EN',
      'BEGIN:VEVENT',
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${safe(title)}`,
      description ? `DESCRIPTION:${safe(description)}` : '',
      location ? `LOCATION:${safe(location)}` : '',
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines)}`;
  } catch {
    return null;
  }
};
const formatAnswerValue = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? t('yes') : t('no');
  if (Array.isArray(val)) {
    return val.map((entry) => formatAnswerValue(entry)).filter(Boolean).join(', ');
  }
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  const str = String(val);
  const formatted = formatDateForDisplay(str);
  if (formatted) return formatted;
  return str;
};

const guardianLocationKeys = computed(() => {
  const fields = guardianFields.value || [];
  const matches = (pattern) =>
    fields
      .filter((f) => matchesToken(f, pattern))
      .map((f) => f.key)
      .filter(Boolean);
  return {
    city: matches(/\bcity\b/),
    state: matches(/\bstate\b|\bprovince\b/),
    zip: matches(/\bzip\b|\bpostal\b/)
  };
});

const clientLocationKeys = computed(() => {
  const fields = clientFields.value || [];
  const matches = (pattern) =>
    fields
      .filter((f) => matchesToken(f, pattern))
      .map((f) => f.key)
      .filter(Boolean);
  return {
    city: matches(/\bcity\b/),
    state: matches(/\bstate\b|\bprovince\b/),
    zip: matches(/\bzip\b|\bpostal\b/)
  };
});

const zipLookupCache = reactive({});

const maybeAutofillGuardianLocation = async (field) => {
  const zipKeys = guardianLocationKeys.value.zip || [];
  if (!field?.key || (!zipKeys.includes(field.key) && !/zip|postal/.test(normalizeKey(field.key)))) return;
  const raw = intakeResponses.guardian?.[field.key];
  const zip = String(raw || '').replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) return;
  if (zipLookupCache.guardian === zip) return;
  zipLookupCache.guardian = zip;

  try {
    const resp = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    if (!place) return;
    const city = place['place name'] || '';
    const state = place['state abbreviation'] || place['state'] || '';
    const setIfEmpty = (key, value) => {
      if (!key || !value) return;
      const current = intakeResponses.guardian?.[key];
      if (!String(current || '').trim()) {
        intakeResponses.guardian[key] = value;
      }
    };
    (guardianLocationKeys.value.city || []).forEach((key) => setIfEmpty(key, city));
    (guardianLocationKeys.value.state || []).forEach((key) => setIfEmpty(key, state));
  } catch {
    // ignore lookup errors
  }
};

const maybeAutofillLocation = async (idx, field) => {
  const zipKeys = clientLocationKeys.value.zip || [];
  if (!field?.key || (!zipKeys.includes(field.key) && !/zip|postal/.test(normalizeKey(field.key)))) return;
  const raw = intakeResponses.clients?.[idx]?.[field.key];
  const zip = String(raw || '').replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) return;
  if (zipLookupCache[`${idx}`] === zip) return;
  zipLookupCache[`${idx}`] = zip;

  try {
    const resp = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    if (!place) return;
    const city = place['place name'] || '';
    const state = place['state abbreviation'] || place['state'] || '';
    const setIfEmpty = (key, value) => {
      if (!key || !value) return;
      const current = intakeResponses.clients?.[idx]?.[key];
      if (!String(current || '').trim()) {
        intakeResponses.clients[idx][key] = value;
      }
    };
    (clientLocationKeys.value.city || []).forEach((key) => setIfEmpty(key, city));
    (clientLocationKeys.value.state || []).forEach((key) => setIfEmpty(key, state));
  } catch {
    // ignore lookup errors
  }
};

const maybeAutofillQuestionLocation = async (field) => {
  if (!field?.key || !/zip|postal/i.test(normalizeKey(field.key))) return;
  const raw = intakeResponses.submission?.[field.key];
  const zip = String(raw || '').replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) return;
  const cacheKey = `q_${field.key}`;
  if (zipLookupCache[cacheKey] === zip) return;
  zipLookupCache[cacheKey] = zip;
  try {
    const resp = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    if (!place) return;
    const city = place['place name'] || '';
    const state = place['state abbreviation'] || place['state'] || '';
    (visibleQuestionFields.value || []).forEach((f) => {
      if (!f?.key || f.key === field.key) return;
      const k = normalizeKey(f.key);
      const cur = String(intakeResponses.submission?.[f.key] || '').trim();
      if (!cur) {
        if (/city|town/.test(k)) intakeResponses.submission[f.key] = city;
        else if (/state|province/.test(k)) intakeResponses.submission[f.key] = state;
      }
    });
  } catch {
    // ignore lookup errors
  }
};

const isIntakeFieldVisible = (field, values = {}) => {
  const showIf = field?.showIf;
  if (!showIf || !showIf.fieldKey) return true;
  const actual = values[showIf.fieldKey];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map((v) => String(v).trim().toLowerCase()).includes(String(actual).trim().toLowerCase());
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '').trim().toLowerCase() === String(expected ?? '').trim().toLowerCase();
};

const visibleGuardianFields = computed(() => {
  // Self-intake should not render guardian-only prompts.
  if (intakeForSelf.value) return [];
  return guardianFields.value.filter((f) => isIntakeFieldVisible(f, intakeResponses.guardian));
});

const visibleSubmissionFields = computed(() =>
  submissionFields.value.filter((f) => isIntakeFieldVisible(f, intakeResponses.submission))
);

const reservedClientKeys = new Set(['client_first', 'client_last', 'client_full_name', 'client_name']);
const visibleClientFields = (idx) =>
  clientFields.value
    .filter((f) => !reservedClientKeys.has(normalizeKey(f?.key)))
    .filter((f) => isIntakeFieldVisible(f, intakeResponses.clients[idx] || {}));

const pickOption = (field) => {
  const options = Array.isArray(field?.options) ? field.options : [];
  if (!options.length) return '';
  return options[0].value ?? options[0].label ?? '';
};

const fillValueByField = (field) => {
  const key = normalizeKey(field?.key);
  const label = normalizeKey(field?.label);
  const token = `${key} ${label}`;
  if (field?.type === 'checkbox') return true;
  if (field?.type === 'select' || field?.type === 'radio') return pickOption(field);
  if (field?.type === 'date') return '2012-01-01';
  if (token.includes('zip') || token.includes('postal')) return '80202';
  if (token.includes('city')) return 'Denver';
  if (token.includes('state')) return 'CO';
  if (token.includes('email')) return 'test.parent@example.com';
  if (token.includes('phone')) return '3035550123';
  if (token.includes('dob') || token.includes('birth')) return '2012-01-01';
  return 'Example';
};

const fillFields = (fields, target) => {
  (fields || []).forEach((field) => {
    if (!field || field.type === 'info') return;
    if (target[field.key]) return;
    target[field.key] = fillValueByField(field);
  });
};

const fillExample = () => {
  if (step.value === 1) {
    guardianFirstName.value = guardianFirstName.value || 'Alex';
    guardianLastName.value = guardianLastName.value || 'Jordan';
    guardianEmail.value = guardianEmail.value || 'alex.jordan@example.com';
    guardianPhone.value = guardianPhone.value || '3035550123';
    guardianRelationship.value = guardianRelationship.value || 'Parent';
    if (!clients.value.length) {
      clients.value = [{ firstName: '', lastName: '' }];
      intakeResponses.clients = [{}];
    }
    if (!intakeForSelf.value) {
      clients.value.forEach((c, idx) => {
        c.firstName = c.firstName || `Client${idx + 1}`;
        c.lastName = c.lastName || 'Example';
      });
    }
    fillFields(visibleGuardianFields.value, intakeResponses.guardian);
    fillFields(visibleSubmissionFields.value, intakeResponses.submission);
    clients.value.forEach((_, idx) => {
      fillFields(visibleClientFields(idx), intakeResponses.clients[idx]);
    });
  } else if (step.value === 2) {
    if (currentFlowStep.value?.type === 'questions') {
      fillFields(visibleQuestionFields.value, questionValues.value);
    } else if (currentFlowStep.value?.type === 'document') {
      fillFields(visibleFieldDefinitions.value, currentFieldValues.value);
    }
  }
};
const loadPdfPreview = async () => {
  if (!currentDoc.value || currentDoc.value.template_type !== 'pdf') {
    pdfUrl.value = null;
    return;
  }
  try {
    if (pdfUrl.value) {
      URL.revokeObjectURL(pdfUrl.value);
      pdfUrl.value = null;
    }
    const resp = await api.get(
      `/public-intake/${publicKey}/document/${currentDoc.value.id}/preview`,
      { responseType: 'blob' }
    );
    pdfUrl.value = URL.createObjectURL(resp.data);
  } catch (e) {
    pdfUrl.value = null;
    error.value = 'Failed to load document preview';
  }
};

const loadLink = async () => {
  try {
    loading.value = true;
    const resp = await api.get(`/public-intake/${publicKey}`);
    link.value = resp.data?.link || null;
    boundClient.value = resp.data?.boundClient || null;
    roiContext.value = resp.data?.roiContext || null;
    templates.value = resp.data?.templates || [];
    agencyInfo.value = resp.data?.agency || null;
    organizationInfo.value = resp.data?.organization || null;
    jobDescriptionSummary.value = resp.data?.jobDescription || null;
    const recaptchaConfig = resp.data?.recaptcha || {};
    recaptchaSiteKey.value = String(recaptchaConfig.siteKey || '').trim();
    recaptchaForceWidget.value = recaptchaConfig.forceWidget === true;
    if (typeof recaptchaConfig.useEnterprise === 'boolean') {
      useEnterpriseRecaptcha.value = !!recaptchaConfig.useEnterprise;
    }
    if (
      !templates.value.length
      && !intakeSteps.value.length
      && String(link.value?.form_type || '').toLowerCase() !== 'smart_school_roi'
      && String(link.value?.form_type || '').toLowerCase() !== 'smart_registration'
      && !hasProgrammedSchoolRoiStep.value
      && !hasRegistrationStep.value
    ) {
      error.value = 'No documents configured for this intake link.';
    } else if (String(link.value?.form_type || '').toLowerCase() === 'smart_school_roi') {
      error.value = '';
    } else if (hasProgrammedSchoolRoiStep.value) {
      error.value = '';
    }
    if (String(link.value?.form_type || '').toLowerCase() === 'job_application') {
      intakeForSelf.value = true;
      jobDescriptionAcknowledged.value = false;
    }
    if (boundClient.value?.id) {
      const nameParts = splitClientName(boundClient.value.full_name);
      clients.value = [{
        firstName: nameParts.firstName,
        lastName: nameParts.lastName
      }];
      intakeResponses.clients = [{
        client_first: nameParts.firstName || '',
        client_last: nameParts.lastName || ''
      }];
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load intake link';
  } finally {
    loading.value = false;
  }
};

const clearRecaptchaScript = () => {
  document.querySelectorAll('script[data-recaptcha]').forEach((el) => el.remove());
  try {
    delete window.grecaptcha;
  } catch {
    window.grecaptcha = undefined;
  }
};

const waitForRecaptchaApi = async (mode = 'standard') => {
  for (let i = 0; i < 40; i++) {
    const hasModeApi = mode === 'enterprise'
      ? !!window.grecaptcha?.enterprise?.render
      : !!window.grecaptcha?.render;
    if (hasModeApi) {
      return window.grecaptcha;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return window.grecaptcha;
};

const loadRecaptchaScript = async (mode = 'standard', forceReload = false) => {
  if (!activeRecaptchaSiteKey.value) return Promise.resolve(null);
  if (forceReload) {
    clearRecaptchaScript();
  }
  const existing = document.querySelector('script[data-recaptcha]');
  const currentMode = existing?.getAttribute('data-recaptcha-mode');
  if (existing && currentMode && currentMode !== mode) {
    clearRecaptchaScript();
  }
  if (window.grecaptcha) {
    const hasModeApi = mode === 'enterprise'
      ? !!window.grecaptcha?.enterprise?.render
      : !!window.grecaptcha?.render;
    if (hasModeApi) return window.grecaptcha;
  }
  if (document.querySelector('script[data-recaptcha]')) {
    return new Promise((resolve) => {
      const current = document.querySelector('script[data-recaptcha]');
      current?.addEventListener?.('load', () => {
        waitForRecaptchaApi(mode).then(resolve);
      });
      waitForRecaptchaApi(mode).then(resolve);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const languageParam = `&hl=${encodeURIComponent(recaptchaLanguageCode.value)}`;
    script.src = mode === 'enterprise'
      ? `https://www.google.com/recaptcha/enterprise.js?render=explicit${languageParam}`
      : `https://www.google.com/recaptcha/api.js?render=explicit${languageParam}`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-recaptcha', 'true');
    script.setAttribute('data-recaptcha-mode', mode);
    script.onload = () => {
      waitForRecaptchaApi(mode).then(resolve);
    };
    script.onerror = () => reject(new Error('Failed to load captcha'));
    document.head.appendChild(script);
  });
};

const clearCaptchaState = () => {
  captchaToken.value = '';
  captchaError.value = '';
};

const ensureRecaptchaWidget = async (mode = 'standard', forceReload = false) => {
  try {
    const grecaptcha = await loadRecaptchaScript(mode, forceReload);
    const renderFn = mode === 'enterprise' ? grecaptcha?.enterprise?.render : grecaptcha?.render;
    if (!renderFn) return false;
    let el = recaptchaWidgetElStart.value;
    for (let i = 0; !el && i < 12; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      el = recaptchaWidgetElStart.value;
      if (!el) el = document.getElementById('recaptcha-widget-start');
    }
    if (!el) {
      console.warn('[recaptcha] widget container not ready');
      return false;
    }
    // reCAPTCHA won't render into zero-size containers; wait for visibility
    for (let i = 0; i < 25 && (!el.offsetParent || el.offsetWidth < 1); i++) {
      await new Promise((r) => setTimeout(r, 80));
      el = recaptchaWidgetElStart.value || document.getElementById('recaptcha-widget-start') || el;
    }
    if (recaptchaWidgetId.value !== null) {
      return true;
    }
    const api = mode === 'enterprise' ? grecaptcha?.enterprise : grecaptcha;
    const readyFn = mode === 'enterprise' ? grecaptcha?.enterprise?.ready : grecaptcha?.ready;
    if (readyFn) {
      await new Promise((resolve) => readyFn(resolve));
    }
    recaptchaWidgetId.value = api.render(el, {
      sitekey: activeRecaptchaSiteKey.value,
      size: 'normal',
      theme: 'light',
      callback: (token) => {
        const t = String(token || '').trim();
        captchaToken.value = t;
        captchaError.value = '';
        captchaWidgetFailed.value = false;
      },
      'expired-callback': () => {
        captchaToken.value = '';
        captchaError.value = t('completeCaptchaToContinue');
      },
      'error-callback': () => {
        captchaToken.value = '';
        captchaError.value = t('captchaFailed');
      }
    });
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (el.querySelector('iframe, textarea[g-recaptcha-response], .grecaptcha-badge')) {
        return true;
      }
    }
    recaptchaWidgetId.value = null;
    return false;
  } catch (err) {
    console.warn('[recaptcha] widget init failed', err);
    return false;
  }
};

const resetRecaptchaWidget = async () => {
  clearCaptchaState();
  captchaWidgetFailed.value = false;
  try {
    const grecaptcha = await loadRecaptchaScript(activeRecaptchaMode.value);
    const api = activeRecaptchaMode.value === 'enterprise' ? grecaptcha?.enterprise : grecaptcha;
    if (api?.reset && recaptchaWidgetId.value !== null) {
      api.reset(recaptchaWidgetId.value);
    }
  } catch {
    // ignore
  }
};

const updateRecaptchaMode = async () => {
  if (!recaptchaSiteKey.value || step.value !== -1) return;
  if (recaptchaInitPromise) {
    await recaptchaInitPromise;
    return;
  }
  captchaWidgetFailed.value = false;
  showRecaptchaWidget.value = true;
  recaptchaInitPromise = (async () => {
    await nextTick();
    await nextTick();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));
    const rendered = await ensureRecaptchaWidget(activeRecaptchaMode.value);
    if (!rendered) captchaWidgetFailed.value = true;
  })().catch((err) => {
    console.warn('[recaptcha] mode init failed', err);
    captchaWidgetFailed.value = true;
  }).finally(() => {
    recaptchaInitPromise = null;
  });
  await recaptchaInitPromise;
};

const maybeInitRecaptchaForCover = async () => {
  if (loading.value) return;
  if (step.value !== -1) return;
  if (!showCaptchaGate.value) return;
  if (!activeRecaptchaSiteKey.value) return;
  await nextTick();
  await updateRecaptchaMode();
  // One guarded retry helps when script/container timing races on first page load.
  if (captchaWidgetFailed.value) {
    await new Promise((r) => setTimeout(r, 180));
    const rendered = await ensureRecaptchaWidget(activeRecaptchaMode.value, true);
    captchaWidgetFailed.value = !rendered;
  }
};

watch(step, async (val, prev) => {
  if (prev !== undefined && prev !== val) {
    recaptchaWidgetId.value = null;
    clearCaptchaState();
  }
  if (val === -1 && recaptchaSiteKey.value) {
    await nextTick();
    await updateRecaptchaMode();
  }
});

watch(
  () => [loading.value, step.value, showCaptchaGate.value, activeRecaptchaSiteKey.value, activeRecaptchaMode.value],
  async ([isLoading, stepVal, showGate, siteKey]) => {
    if (isLoading) return;
    if (stepVal !== -1) return;
    if (!showGate || !siteKey) return;
    await maybeInitRecaptchaForCover();
  },
  { flush: 'post' }
);

const deriveClientInitials = (firstName, lastName) => {
  const formatTri = (value) => {
    const cleaned = String(value || '').replace(/[^a-zA-Z]/g, '').slice(0, 3);
    if (!cleaned) return '';
    const lower = cleaned.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };
  return `${formatTri(firstName)}${formatTri(lastName)}`.trim();
};

const buildClientPayloads = () =>
  clients.value.map((c) => {
    const rawFirst = String(c?.firstName || '').trim();
    const rawLast = String(c?.lastName || '').trim();
    const firstName = intakeForSelf.value ? String(guardianFirstName.value || '').trim() : rawFirst;
    const lastName = intakeForSelf.value ? String(guardianLastName.value || '').trim() : rawLast;
    const fullName = `${firstName} ${lastName}`.trim();
    return {
      firstName,
      lastName,
      fullName,
      initials: deriveClientInitials(firstName, lastName)
    };
  });

const isLikelyDobKey = (key) => {
  const token = String(key || '').trim().toLowerCase();
  return token.includes('dob') || token.includes('birth');
};

const normalizeDateForRoiPrefill = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const mm = String(slashDate[1]).padStart(2, '0');
    const dd = String(slashDate[2]).padStart(2, '0');
    return `${slashDate[3]}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const resolveClientDobForSmartRoi = () => {
  const direct = normalizeDateForRoiPrefill(boundClient.value?.date_of_birth || roiContext.value?.client?.dateOfBirth || '');
  if (direct) return direct;
  const sources = [
    intakeResponses.clients?.[0] || {},
    intakeResponses.submission || {},
    intakeResponses.guardian || {}
  ];
  for (const source of sources) {
    const entry = Object.entries(source || {}).find(([key, val]) => isLikelyDobKey(key) && String(val || '').trim());
    if (entry) return normalizeDateForRoiPrefill(entry[1]);
  }
  return '';
};

const embeddedSmartRoiPrefill = computed(() => {
  const firstClient = clients.value?.[0] || {};
  const signerFirst = String(guardianFirstName.value || '').trim();
  const signerLast = String(guardianLastName.value || '').trim();
  const clientFirst = intakeForSelf.value ? signerFirst : String(firstClient.firstName || '').trim();
  const clientLast = intakeForSelf.value ? signerLast : String(firstClient.lastName || '').trim();
  const fullName = `${clientFirst} ${clientLast}`.trim();
  const relationship = intakeForSelf.value === true
    ? 'Self'
    : String(guardianRelationship.value || '').trim();
  return {
    intakeForSelf: typeof intakeForSelf.value === 'boolean' ? intakeForSelf.value : null,
    clientFullName: fullName,
    clientDateOfBirth: resolveClientDobForSmartRoi(),
    signerFirstName: signerFirst,
    signerLastName: signerLast,
    signerEmail: String(guardianEmail.value || '').trim(),
    signerPhone: String(guardianPhone.value || '').trim(),
    signerRelationship: relationship
  };
});

const syncClientNamesToResponses = () => {
  if (!Array.isArray(intakeResponses.clients)) {
    intakeResponses.clients = [];
  }
  while (intakeResponses.clients.length < clients.value.length) {
    intakeResponses.clients.push({});
  }
  clients.value.forEach((client, idx) => {
    const response = intakeResponses.clients[idx] || {};
    const firstName = intakeForSelf.value
      ? String(guardianFirstName.value || '').trim()
      : String(client?.firstName || '').trim();
    const lastName = intakeForSelf.value
      ? String(guardianLastName.value || '').trim()
      : String(client?.lastName || '').trim();
    if (firstName && (!response.client_first || !String(response.client_first).trim())) {
      response.client_first = firstName;
    }
    if (lastName && (!response.client_last || !String(response.client_last).trim())) {
      response.client_last = lastName;
    }
    intakeResponses.clients[idx] = response;
  });
};

const ensureSessionToken = async () => {
  return String(sessionToken.value || '').trim();
};

const submitConsent = async () => {
  consentErrors.guardianFirstName = guardianFirstName.value.trim() ? '' : t('required');
  consentErrors.guardianEmail = guardianEmail.value.trim() ? '' : t('required');
  consentErrors.guardianLastName = isJobApplication.value && !guardianLastName.value.trim() ? t('required') : '';
  consentErrors.guardianPhone = isJobApplication.value && !guardianPhone.value.trim() ? t('required') : '';
  const clientFirst = intakeForSelf.value ? guardianFirstName.value : clients.value?.[0]?.firstName;
  const clientLast = intakeForSelf.value ? guardianLastName.value : clients.value?.[0]?.lastName;
  consentErrors.clientFirstName = (isJobApplication.value || isClientBound.value) ? '' : (String(clientFirst || '').trim() ? '' : t('required'));
  consentErrors.clientLastName = (isJobApplication.value || isClientBound.value) ? '' : (String(clientLast || '').trim() ? '' : t('required'));
  consentErrors.organizationId =
    requiresOrganizationId.value && !String(organizationId.value || '').trim()
      ? t('required')
      : '';

  if (
    consentErrors.guardianFirstName
    || consentErrors.guardianEmail
    || consentErrors.guardianLastName
    || consentErrors.guardianPhone
    || consentErrors.clientFirstName
    || consentErrors.clientLastName
    || consentErrors.organizationId
  ) {
    error.value = consentErrors.organizationId
      ? t('organizationRequired')
      : (
        formTypeKey.value === 'job_application'
          ? t('applicantRequired')
          : formTypeKey.value === 'medical_records_request'
            ? t('requesterRequired')
            : formTypeKey.value === 'smart_registration'
              ? t('registrantRequired')
              : t('guardianRequired')
      );
    stepError.value = '';
    await nextTick();
    const firstMissingId = consentErrors.guardianFirstName
      ? 'guardianFirstName'
      : consentErrors.guardianEmail
        ? 'guardianEmail'
        : consentErrors.guardianLastName
          ? 'guardianLastName'
          : consentErrors.guardianPhone
            ? 'guardianPhone'
          : consentErrors.clientFirstName
            ? (intakeForSelf.value ? 'guardianFirstName' : 'clientFirstName_0')
            : consentErrors.clientLastName
              ? (intakeForSelf.value ? 'guardianLastName' : 'clientLastName_0')
              : consentErrors.organizationId
                ? 'organizationId'
                : null;
    if (firstMissingId) {
      const el = document.getElementById(firstMissingId);
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (el?.focus) el.focus();
    }
    return;
  }
  try {
    consentLoading.value = true;
    error.value = '';
    stepError.value = '';
    syncClientNamesToResponses();
    ensureRegistrationMaps();
    if (organizationId.value) {
      intakeResponses.submission.organizationId = Number(organizationId.value) || organizationId.value;
    }
    if (isJobApplication.value) {
      intakeResponses.submission.fluentLanguages = String(fluentLanguagesInput.value || '')
        .split(',')
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 30);
    }
    const clientPayloads = buildClientPayloads();
    const payload = {
      sessionToken: sessionToken.value || null,
      signerName: `${guardianFirstName.value} ${guardianLastName.value}`.trim(),
      signerInitials: clientPayloads?.[0]?.initials || null,
      signerEmail: guardianEmail.value,
      signerPhone: guardianPhone.value,
      intakeData: {
        responses: intakeResponses || {},
        clients: clientPayloads || [],
        intakeForSelf: intakeForSelf.value,
        guardian: {
          firstName: guardianFirstName.value,
          lastName: guardianLastName.value,
          email: guardianEmail.value,
          phone: guardianPhone.value,
          relationship: intakeForSelf.value ? 'Self' : guardianRelationship.value
        },
        approval: approvalContext.value || null,
        smartSchoolRoi: embeddedSmartSchoolRoi.value || null
      }
    };
    const resp = await api.post(`/public-intake/${publicKey}/consent`, payload);
    submissionId.value = resp.data?.submission?.id || null;
    if (resp.data?.clientMatch && typeof resp.data.clientMatch === 'object') {
      Object.assign(intakeResponses.submission, resp.data.clientMatch);
    }
    currentFlowIndex.value = 0;
    step.value = 2;
  } catch (e) {
    stepError.value = e.response?.data?.error?.message || 'Failed to capture consent';
  } finally {
    consentLoading.value = false;
  }
};

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl;
  lastSignatureData.value = dataUrl;
  showSavedSigPrompt.value = false;
  signatureBlockFlash.value = false;
};

const onUseSavedSignatureClick = () => {
  if (!canProceed.value) {
    stepError.value = t('reviewAllPagesBeforeSigning');
    return;
  }
  if (lastSignatureData.value) {
    signatureData.value = lastSignatureData.value;
    stepError.value = '';
  }
};

const applyPromptedSavedSignature = () => {
  if (lastSignatureData.value) {
    signatureData.value = lastSignatureData.value;
    stepError.value = '';
  }
  showSavedSigPrompt.value = false;
};

const skipToSignaturePage = () => {
  const page = signaturePageNumber.value || reviewTotalPages.value;
  if (!page) return;
  if (pdfPreviewRef.value?.goToPage) {
    pdfPreviewRef.value.goToPage(page);
  }
};

const completeCurrentDocument = async () => {
  try {
    submitLoading.value = true;
    error.value = '';
    stepError.value = '';
    if (!currentDoc.value) {
      stepError.value = t('noDocumentSelected');
      return;
    }
    if (currentDoc.value.template_type === 'pdf' && !canProceed.value) {
      pageNotice.value = t('reviewAllPagesSkip');
      if (pageNoticeTimer) clearTimeout(pageNoticeTimer);
      pageNoticeTimer = setTimeout(() => {
        pageNotice.value = '';
      }, 2500);
      navPulse.value = true;
      if (navPulseTimer) clearTimeout(navPulseTimer);
      navPulseTimer = setTimeout(() => { navPulse.value = false; }, 2600);
      return;
    }
    if (currentDoc.value.document_action_type === 'signature' && !signatureData.value) {
      if (lastSignatureData.value) {
        // Auto-apply saved signature so the user can proceed in one click.
        signatureData.value = lastSignatureData.value;
        stepError.value = '';
        showSavedSigPrompt.value = false;
        // Fall through to continue.
      } else {
        stepError.value = t('signatureRequired');
        signatureBlockFlash.value = true;
        import('vue').then(({ nextTick }) => {
          nextTick(() => {
            signatureBlockRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        });
        setTimeout(() => { signatureBlockFlash.value = false; }, 2600);
        return;
      }
    }

    const missingFields = displayedFieldDefinitions.value.filter((f) => {
      if (!f.required) return false;
      if (f.type === 'date' && f.autoToday) return false;
      if (f.type === 'checkbox') {
        return currentFieldValues.value[f.id] !== true;
      }
      if (f.type === 'select' || f.type === 'radio') {
        const options = Array.isArray(f.options) ? f.options : [];
        const optionValues = options.map((opt) => String(opt.value ?? opt.label ?? '')).filter(Boolean);
        const selected = currentFieldValues.value[f.id];
        return !selected || (optionValues.length > 0 && !optionValues.includes(String(selected)));
      }
      const val = currentFieldValues.value[f.id];
      return val === null || val === undefined || String(val).trim() === '';
    });
    if (missingFields.length > 0) {
      stepError.value = t('completeRequiredFields');
      await nextTick();
      focusNextField();
      return;
    }

    const resp = await api.post(
      `/public-intake/${publicKey}/${submissionId.value}/document/${currentDoc.value.id}/sign`,
      {
        signatureData: signatureData.value || '',
        fieldValues: currentFieldValues.value || {}
      }
    );

    docStatus[currentDoc.value.id] = true;
    signatureData.value = '';

    await nextFlowStep();
  } catch (e) {
    stepError.value = e.response?.data?.error?.message || t('completeRequiredFields');
  } finally {
    submitLoading.value = false;
  }
};

const isQuestionFieldMissing = (field) => {
  if (!field || !field.required || field.type === 'info') return false;
  const key = String(field.key || '').trim();
  if (!key) return false;
  return missingRequiredQuestionKeys.value.includes(key);
};

const isQuestionValueMissing = (field) => {
  if (!field || !field.required || field.type === 'info') return false;
  const val = questionValues.value[field.key];
  if (field.type === 'checkbox') return val !== true;
  return val === null || val === undefined || String(val).trim() === '';
};

const completeQuestionStep = async () => {
  const missing = visibleQuestionFields.value
    .filter((f) => isQuestionValueMissing(f));
  if (missing.length) {
    missingRequiredQuestionKeys.value = missing.map((f) => String(f.key || '').trim()).filter(Boolean);
    stepError.value = t('completeRequiredFields');
    await nextTick();
    const firstKey = missing[0]?.key;
    if (firstKey) {
      const container = document.querySelector(`[data-question-key="${CSS.escape(firstKey)}"]`);
      if (container?.scrollIntoView) container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusTarget = container?.querySelector('input, textarea, select, [tabindex]');
      if (focusTarget?.focus) focusTarget.focus();
    }
    return;
  }
  missingRequiredQuestionKeys.value = [];
  stepError.value = '';
  await nextFlowStep();
};

const completeRegistrationStep = async () => {
  const stepMeta = currentFlowStep.value;
  if (!stepMeta || stepMeta.type !== 'registration') return;
  const rules = getCurrentRegistrationRules();
  const selectedIds = getRegistrationSelectionIds(stepMeta.id);
  const participant = getRegistrationParticipant(stepMeta.id);
  if (participant.alreadyInSystem && !participant.lookupValue) {
    stepError.value = `Please enter your ${String(stepMeta.existingLookupField || 'email').replace('_', ' ')}.`;
    return;
  }
  if (selectedIds.length < rules.minSelections) {
    stepError.value = rules.minSelections > 1
      ? `Please select at least ${rules.minSelections} options.`
      : 'Please select at least one option.';
    return;
  }
  if (rules.maxSelections && selectedIds.length > rules.maxSelections) {
    stepError.value = `Please select no more than ${rules.maxSelections} options.`;
    return;
  }
  ensureRegistrationMaps();
  const byId = new Map(currentRegistrationOptions.value.map((opt) => [String(opt.id), opt]));
  const selected = selectedIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((opt) => ({
      stepId: String(stepMeta.id || ''),
      optionId: String(opt.id),
      label: opt.label,
      description: opt.description || '',
      entityType: opt.entityType || 'manual',
      entityId: opt.entityId || null,
      videoJoinUrl: opt.videoJoinUrl || String(stepMeta.defaultVideoUrl || '').trim() || null,
      providerUserIds: String(opt.providerUserIdsCsv || stepMeta.providerUserIdsCsv || '')
        .split(',')
        .map((v) => Number(String(v || '').trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
      selfPay: {
        enabled: !!stepMeta?.selfPay?.enabled,
        paymentProvider: 'quickbooks',
        costDollars: Number(opt.costDollars || stepMeta?.selfPay?.costDollars || 0) || 0,
        paymentLinkUrl: String(opt.paymentLinkUrl || stepMeta?.selfPay?.paymentLinkUrl || '').trim() || null
      },
      scheduleBlocks: (Array.isArray(opt.scheduleBlocks) && opt.scheduleBlocks.length
        ? opt.scheduleBlocks
        : (Array.isArray(stepMeta.scheduleBlocks) ? stepMeta.scheduleBlocks : []))
        .map((sb) => ({
          id: String(sb?.id || ''),
          label: String(sb?.label || ''),
          startDate: String(sb?.startDate || ''),
          endDate: String(sb?.endDate || ''),
          startTime: String(sb?.startTime || ''),
          endTime: String(sb?.endTime || ''),
          sequenceDays: Math.max(1, Number(sb?.sequenceDays || 1) || 1)
        })),
      frequencyLabel: String(opt.frequencyLabel || '').trim() || null,
      termsSummary: String(opt.termsSummary || '').trim() || null,
      participant: {
        mode: String(stepMeta.participantMode || 'any'),
        alreadyInSystem: !!participant.alreadyInSystem,
        lookupField: String(stepMeta.existingLookupField || 'email'),
        lookupValue: participant.alreadyInSystem ? String(participant.lookupValue || '') : ''
      },
      medicaidEligible: !!opt.medicaidEligible,
      cashEligible: !!opt.cashEligible,
      selectedAt: new Date().toISOString()
    }));
  intakeResponses.submission.registrationSelectionsByStep[String(stepMeta.id || '')] = selected;
  intakeResponses.submission.registrationSelections = Object.values(
    intakeResponses.submission.registrationSelectionsByStep
  ).flat();
  stepError.value = '';
  await nextFlowStep();
};

const completeGuardianWaiverStep = () => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'guardian_waiver') return;
  ensureGuardianWaiverIntakeShape();
  const keys = guardianWaiverValidationKeys.value;
  const savedSig = String(lastSignatureData.value || '').trim();
  const gw = intakeResponses.submission.guardianWaiverIntake;
  if (!gw?.clients?.length) {
    stepError.value = 'Missing waiver data. Please refresh and try again.';
    return;
  }
  for (let i = 0; i < gw.clients.length; i += 1) {
    const label = guardianWaiverClientLabels.value[i] || `Child ${i + 1}`;
    for (const key of keys) {
      const sec = gw.clients[i].sections?.[key];
      if (key === 'pickup_authorization' && isOptionalGuardianWaiverSectionSkipped(key, sec?.payload)) {
        continue;
      }
      if (key === 'emergency_contacts') {
        const ecPayload = sec?.payload || {};
        if (ecPayload.declineEmergencyContacts === true) continue;
        const ecRows = Array.isArray(ecPayload.contacts) ? ecPayload.contacts : [];
        if (!ecRows.some((row) => hasAnyFilledText([row?.name, row?.relationship, row?.phone]))) {
          stepError.value = `Please add at least one emergency contact for ${label}, or check "I do not want to list emergency contacts at this time."`;
          emergencyPulse.value = true;
          if (emergencyPulseTimer) clearTimeout(emergencyPulseTimer);
          emergencyPulseTimer = setTimeout(() => { emergencyPulse.value = false; }, 2600);
          return;
        }
      }
      if (!sec) {
        stepError.value = `Please complete ${guardianWaiverSectionLabels[key] || 'all waiver sections'} for ${label}.`;
        return;
      }
      if (String(sec.signatureData || '').trim().length < 10 && savedSig) {
        sec.signatureData = savedSig;
      }
      if (String(sec.signatureData || '').trim().length < 10) {
        stepError.value = `Please apply your saved signature to the ${guardianWaiverSectionLabels[key] || 'waiver'} section for ${label}.`;
        return;
      }
    }
  }
  stepError.value = '';
  void nextFlowStep();
};

const insuranceStepRef = ref(null);

const completeInsuranceStep = async () => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'insurance_info') return;
  if (!intakeResponses.submission.insuranceInfo || typeof intakeResponses.submission.insuranceInfo !== 'object') {
    intakeResponses.submission.insuranceInfo = {};
  }
  const insInfo = intakeResponses.submission.insuranceInfo;
  if (!insInfo.primary || typeof insInfo.primary !== 'object') {
    insInfo.primary = {
      insurerName: '',
      memberId: '',
      groupNumber: '',
      patientSuffix: '',
      subscriberName: '',
      isMedicaid: false
    };
  }
  // If photos are present, upload them now before advancing.
  const photoFiles = insuranceStepRef.value?.getPhotoFiles?.();
  const insuranceEntryState = insuranceStepRef.value?.getInsuranceEntryState?.() || {};
  if (photoFiles) {
    const slots = Object.entries(photoFiles).filter(([, f]) => f instanceof File);
    if (slots.length && submissionId.value && publicKey) {
      try {
        const fd = new FormData();
        for (const [slot, file] of slots) {
          fd.append(slot, file, file.name);
        }
        const resp = await api.post(
          `/public-intake/${publicKey}/${submissionId.value}/insurance-card-photos`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        const urls = resp.data?.urls || {};
        if (!intakeResponses.submission.insuranceInfo) intakeResponses.submission.insuranceInfo = {};
        Object.assign(intakeResponses.submission.insuranceInfo, urls);
        const extracted = resp.data?.extracted || {};
        if (extracted?.primary && intakeResponses.submission.insuranceInfo?.primary) {
          const primary = intakeResponses.submission.insuranceInfo.primary;
          const extPrimary = extracted.primary;
          if (!String(primary.insurerName || '').trim() && String(extPrimary.insurerName || '').trim()) {
            primary.insurerName = String(extPrimary.insurerName || '').trim();
          }
          if (!String(primary.memberId || '').trim() && String(extPrimary.memberId || '').trim()) {
            primary.memberId = String(extPrimary.memberId || '').trim();
          }
          if (!String(primary.groupNumber || '').trim() && String(extPrimary.groupNumber || '').trim()) {
            primary.groupNumber = String(extPrimary.groupNumber || '').trim();
          }
          if (!String(primary.subscriberName || '').trim() && String(extPrimary.subscriberName || '').trim()) {
            primary.subscriberName = String(extPrimary.subscriberName || '').trim();
          }
          primary.isMedicaid = isMedicaidInsurer(primary.insurerName);
          intakeResponses.submission.insuranceInfo.primaryIsMedicaid = primary.isMedicaid;
        }
      } catch {
        // Non-blocking: continue even if photo upload fails
      }
    }
  }
  const hasPrimaryCardImage = Boolean(
    insuranceEntryState.hasPrimaryCardPhoto
    || insInfo.primary_front_url
    || insInfo.primary_back_url
  );
  const noPrimaryCardAvailable = Boolean(insuranceEntryState.noPrimaryCardAvailable || insInfo.noPrimaryCardAvailable);
  const insurerName = String(insInfo.primary?.insurerName || '').trim();
  const memberId = String(insInfo.primary?.memberId || '').trim();
  const medicaidPrimary = isMedicaidInsurer(insurerName);

  if (!hasPrimaryCardImage && !noPrimaryCardAvailable) {
    stepError.value = 'Please upload your primary insurance card, or check "I do not have my primary insurance card right now."';
    return;
  }
  if (!insInfo.primary?.insurerName && memberId) {
    stepError.value = 'Please select your primary insurance provider before continuing.';
    return;
  }
  if (noPrimaryCardAvailable && !insurerName && !memberId) {
    insInfo.primary.insurerName = 'Self-Pay / No Insurance';
    insInfo.primary.memberId = '';
    insInfo.primary.groupNumber = String(insInfo.primary.groupNumber || '');
    insInfo.primary.patientSuffix = String(insInfo.primary.patientSuffix || '');
    insInfo.primary.subscriberName = String(insInfo.primary.subscriberName || '');
    insInfo.primary.isMedicaid = false;
    insInfo.primaryIsMedicaid = false;
  } else if (insurerName && !memberId && !medicaidPrimary && !/self.pay|no insurance/i.test(insurerName)) {
    stepError.value = 'Please enter your primary insurance Member / Policy ID (or choose Medicaid if applicable).';
    return;
  } else {
    insInfo.primary.isMedicaid = medicaidPrimary;
    insInfo.primaryIsMedicaid = medicaidPrimary;
  }
  // Require the insurance authorization to be acknowledged.
  const authSig = insuranceStepRef.value?.getAuthorizationSignature?.();
  if (!authSig || String(authSig).trim().length < 2) {
    stepError.value = 'Please sign the Insurance Authorization acknowledgment at the bottom of this step before continuing.';
    return;
  }
  insInfo.authorizationSignature = String(authSig).trim();

  stepError.value = '';
  void nextFlowStep();
};

const completePaymentStep = () => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'payment_collection') return;
  const payInfo = intakeResponses.submission.paymentInfo;
  if (!payInfo?.cardSaved && !payInfo?.skipAcknowledged) {
    stepError.value = 'Please save a payment method, or acknowledge and continue without one.';
    return;
  }
  stepError.value = '';
  void nextFlowStep();
};

const completeCommunicationsStep = () => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'communications') return;
  if (!communications.emailPreference) {
    stepError.value = 'Please choose an email communication preference.';
    return;
  }
  if (!communications.smsPreference) {
    stepError.value = 'Please choose an SMS communication preference.';
    return;
  }
  if (step?.campaigns?.providerTexting && !communications.providerTextingOptIn) {
    stepError.value = 'Please choose whether to enable provider/care-team texting.';
    return;
  }
  if (step?.campaigns?.programUpdates && !communications.programUpdatesOptIn) {
    stepError.value = 'Please choose whether to enable optional program updates.';
    return;
  }
  if (step?.campaigns?.internalWorkforce && !communications.internalWorkforceOptIn) {
    stepError.value = 'Please choose whether to enable internal workforce notifications.';
    return;
  }
  intakeResponses.submission.communicationPreferences = {
    emailPreference: communications.emailPreference,
    smsPreference: communications.smsPreference,
    providerTextingOptIn: step?.campaigns?.providerTexting ? communications.providerTextingOptIn : null,
    programUpdatesOptIn: step?.campaigns?.programUpdates ? communications.programUpdatesOptIn : null,
    internalWorkforceOptIn: step?.campaigns?.internalWorkforce ? communications.internalWorkforceOptIn : null,
    termsUrl: platformTermsUrl,
    privacyUrl: platformPrivacyUrl
  };
  stepError.value = '';
  void nextFlowStep();
};

const onPaymentCardSaved = (cardInfo) => {
  if (!intakeResponses.submission.paymentInfo) {
    intakeResponses.submission.paymentInfo = {};
  }
  Object.assign(intakeResponses.submission.paymentInfo, { cardSaved: true, ...cardInfo });
};

const paymentCostDisplay = computed(() => {
  // Build a cost display string from the event's pricing config if available.
  const reg = intakeResponses.submission?.registrationSelections;
  if (!reg) return '';
  const firstSel = Array.isArray(reg) ? reg[0] : null;
  if (!firstSel) return '';
  if (firstSel.programCostBillingMode === 'per_session' && firstSel.perSessionCostDollars) {
    return `$${Number(firstSel.perSessionCostDollars).toFixed(2)} per session`;
  }
  if (firstSel.programCostDollars) {
    return `$${Number(firstSel.programCostDollars).toFixed(2)} (total program cost)`;
  }
  return '';
});

const completeDemographicsStep = () => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'demographics') return;
  demographicsErrors.dob = false;
  if (step.showDob && !demographicsData.dob) {
    demographicsErrors.dob = true;
    stepError.value = 'Please enter a date of birth.';
    return;
  }
  intakeResponses.submission.demographicsInfo = {
    dob: demographicsData.dob || null,
    gender: demographicsData.gender || null,
    ethnicity: demographicsData.ethnicity || null,
    preferredLanguage: demographicsData.preferredLanguage || null,
    addressStreet: demographicsData.addressStreet || null,
    addressApt: demographicsData.addressApt || null,
    addressCity: demographicsData.addressCity || null,
    addressState: demographicsData.addressState || null,
    addressZip: demographicsData.addressZip || null
  };
  stepError.value = '';
  void nextFlowStep();
};

const completeClinicalQuestionsStep = () => {
  const step = currentFlowStep.value;
  if (!step || step.type !== 'clinical_questions') return;
  const missingRequired = (visibleClinicalFields.value || []).some((f) => isClinicalFieldMissing(f));
  if (missingRequired) {
    stepError.value = 'Please answer all required clinical questions before continuing.';
    return;
  }
  intakeResponses.submission.clinicalResponses = { ...clinicalResponses };
  stepError.value = '';
  void nextFlowStep();
};

const handleCurrentFlowContinue = () => {
  if (currentFlowStep.value?.type === 'document') return completeCurrentDocument();
  if (currentFlowStep.value?.type === 'upload') return completeUploadStep();
  if (currentFlowStep.value?.type === 'registration') return completeRegistrationStep();
  if (currentFlowStep.value?.type === 'references') return completeReferencesStep();
  if (currentFlowStep.value?.type === 'guardian_waiver') return completeGuardianWaiverStep();
  if (currentFlowStep.value?.type === 'insurance_info') return completeInsuranceStep();
  if (currentFlowStep.value?.type === 'payment_collection') return completePaymentStep();
  if (currentFlowStep.value?.type === 'communications') return completeCommunicationsStep();
  if (currentFlowStep.value?.type === 'demographics') return completeDemographicsStep();
  if (currentFlowStep.value?.type === 'clinical_questions') return completeClinicalQuestionsStep();
  return completeQuestionStep();
};
const currentFlowContinueLabel = computed(() => {
  if (currentFlowStep.value?.type === 'upload') return 'Continue';
  if (currentFlowStep.value?.type === 'references') return 'Save references & continue';
  if (currentFlowStep.value?.type === 'guardian_waiver') return t('continue');
  if (currentFlowStep.value?.type === 'insurance_info') return 'Save & continue';
  if (currentFlowStep.value?.type === 'payment_collection') return 'Continue';
  if (currentFlowStep.value?.type === 'communications') return 'Save preferences & continue';
  if (currentFlowStep.value?.type === 'demographics') return 'Save & continue';
  if (currentFlowStep.value?.type === 'clinical_questions') return 'Save & continue';
  if (currentFlowStep.value?.type === 'document') {
    return currentDoc.value?.document_action_type === 'signature' ? t('signContinue') : t('markReviewedContinue');
  }
  return t('continue');
});

const sendPublicIntakeLoginHelp = async () => {
  if (loginHelpSending.value || !publicKey) return;
  loginHelpMessage.value = '';
  loginHelpSending.value = true;
  try {
    await api.post(`/public-intake/${publicKey}/login-help`, {
      submissionId: submissionId.value || null,
      signerEmail: String(guardianEmail.value || '').trim() || null,
      message: 'Public intake login help requested after registration'
    });
    loginHelpMessage.value = 'Thanks — we logged your request.';
  } catch {
    loginHelpMessage.value = 'Could not send request. Please contact the school or agency directly.';
  } finally {
    loginHelpSending.value = false;
  }
};

const finalizePacket = async () => {
  const previousStep = step.value;
  try {
    submitLoading.value = true;
    error.value = '';
    stepError.value = '';
    step.value = 3;
    pollingForDownload.value = true;
    const activeSessionToken = await ensureSessionToken();
    if (!activeSessionToken) {
      error.value = t('unableToStartSession');
      pollingForDownload.value = false;
      step.value = previousStep;
      return;
    }
    const resp = await api.post(`/public-intake/${publicKey}/${submissionId.value}/finalize`, {
      submissionId: submissionId.value,
      sessionToken: activeSessionToken || null,
      organizationId: organizationId.value,
      clients: buildClientPayloads(),
      guardian: {
        firstName: guardianFirstName.value,
        lastName: guardianLastName.value,
        email: guardianEmail.value,
        phone: guardianPhone.value,
        relationship: guardianRelationship.value
      },
      intakeData: {
        responses: intakeResponses || {},
        clients: buildClientPayloads(),
        guardian: {
          firstName: guardianFirstName.value,
          lastName: guardianLastName.value,
          email: guardianEmail.value,
          phone: guardianPhone.value,
          relationship: guardianRelationship.value
        },
        approval: approvalContext.value || null,
        smartSchoolRoi: embeddedSmartSchoolRoi.value || null,
        coverLetterText: String(coverLetterPastedText.value || '').trim() || null,
        referencesJson: referencesEntries.value
          .map((r) => ({
            name: String(r?.name || '').trim(),
            relationship: String(r?.relationship || '').trim(),
            organization: String(r?.organization || '').trim(),
            phone: String(r?.phone || '').trim(),
            email: String(r?.email || '').trim()
          }))
          .filter((r) => r.name || r.email || r.phone || r.organization || r.relationship),
        jobDescriptionAcknowledged: !!jobDescriptionAcknowledged.value,
        referencesWaived: !!referencesWaived.value
      }
    });
    downloadUrl.value = resp.data?.downloadUrl || '';
    emailDeliveryStatus.value = resp.data?.emailDelivery || null;
    clientBundleLinks.value = resp.data?.clientBundles || [];
    if (resp.data?.registrationCompletion) {
      registrationCompletion.value = resp.data.registrationCompletion;
    }
    jobApplicationSubmitted.value = !!resp.data?.jobApplicationSubmitted;
    if (downloadUrl.value || jobApplicationSubmitted.value) {
      pollingForDownload.value = false;
    }
    step.value = 3;
    clearPersistedDraft();
    if (!downloadUrl.value && !jobApplicationSubmitted.value) {
      pollForDownloadUrl();
    }
  } catch (e) {
    pollingForDownload.value = false;
    step.value = previousStep;
    error.value = e.response?.data?.error?.message || 'Failed to finalize packet';
  } finally {
    submitLoading.value = false;
  }
};

const pollForDownloadUrl = async () => {
  if (downloadUrl.value || jobApplicationSubmitted.value) return;
  pollingForDownload.value = true;
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (downloadUrl.value || step.value !== 3) break;
    try {
      const resp = await api.get(`/public-intake/${publicKey}/status/${submissionId.value}`);
      if (resp.data?.downloadUrl) {
        downloadUrl.value = resp.data.downloadUrl;
        if (Array.isArray(resp.data?.clientBundles)) {
          clientBundleLinks.value = resp.data.clientBundles;
        }
        if (resp.data?.emailDelivery) {
          emailDeliveryStatus.value = resp.data.emailDelivery;
        }
        if (resp.data?.registrationCompletion) {
          registrationCompletion.value = resp.data.registrationCompletion;
        }
        break;
      }
    } catch {
      // continue polling
    }
  }
  pollingForDownload.value = false;
};

const resetIntakeState = () => {
  agencyRegistrationCatalog.value = [];
  registrationCompletion.value = null;
  loginHelpMessage.value = '';
  guardianFirstName.value = '';
  guardianLastName.value = '';
  guardianEmail.value = '';
  guardianPhone.value = '';
  fluentLanguagesInput.value = '';
  guardianRelationship.value = '';
  jobApplicationSubmitted.value = false;
  coverLetterInputMode.value = 'upload';
  coverLetterPastedText.value = '';
  referencesWaived.value = false;
  referencesEntries.value = [
    { name: '', relationship: '', organization: '', phone: '', email: '' },
    { name: '', relationship: '', organization: '', phone: '', email: '' },
    { name: '', relationship: '', organization: '', phone: '', email: '' }
  ];
  jobDescriptionAcknowledged.value = false;
  jobAckPdfZoom.value = 125;
  signerInitials.value = '';
  clients.value = [{ firstName: '', lastName: '' }];
  intakeResponses.guardian = {};
  intakeResponses.submission = {};
  intakeResponses.clients = [{}];
  embeddedSmartSchoolRoi.value = null;
  jobDescriptionSummary.value = null;
  downloadUrl.value = '';
  emailDeliveryStatus.value = null;
  clientBundleLinks.value = [];
  signatureData.value = '';
  submissionId.value = null;
  docStatus && Object.keys(docStatus).forEach((k) => delete docStatus[k]);
  error.value = '';
  clearCaptchaState();
  captchaWidgetFailed.value = false;
  sessionToken.value = '';
  router.replace({ query: { ...route.query, session: undefined } }).catch(() => {});
  currentDocIndex.value = 0;
  currentFlowIndex.value = 0;
  step.value = -1;
  Object.keys(fieldValuesByTemplate || {}).forEach((k) => delete fieldValuesByTemplate[k]);
};

const cancelIntake = () => {
  const ok = window.confirm(t('cancelDeleteConfirm'));
  if (!ok) return;
  clearPersistedDraft();
  resetIntakeState();
};

const restartIntake = () => {
  const ok = window.confirm(t('restartConfirm'));
  if (!ok) return;
  clearPersistedDraft();
  resetIntakeState();
};

const endSession = () => {
  const ok = window.confirm(t('endSessionConfirm'));
  if (!ok) return;
  clearPersistedDraft();
  resetIntakeState();
};

const returnToIntakeInfo = () => {
  stepError.value = '';
  step.value = 1;
};

const focusNextField = () => {
  const fields = displayedFieldDefinitions.value;
  if (!fields.length) return;
  let targetId = null;
  for (const field of fields) {
    if (!field.required) continue;
    if (field.type === 'date' && field.autoToday) continue;
    if (field.type === 'checkbox') {
      if (currentFieldValues.value[field.id] !== true) {
        targetId = field.id;
        break;
      }
      continue;
    }
    if (field.type === 'select' || field.type === 'radio') {
      const options = Array.isArray(field.options) ? field.options : [];
      const optionValues = options.map((opt) => String(opt.value ?? opt.label ?? '')).filter(Boolean);
      const selected = currentFieldValues.value[field.id];
      if (!selected || (optionValues.length > 0 && !optionValues.includes(String(selected)))) {
        targetId = field.id;
        break;
      }
      continue;
    }
    const val = currentFieldValues.value[field.id];
    if (val === null || val === undefined || String(val).trim() === '') {
      targetId = field.id;
      break;
    }
  }
  if (!targetId) return;
  const el = document.querySelector(`[data-field-id="${targetId}"]`);
  if (el) {
    const focusEl = el.querySelector?.('input, select, textarea') || el;
    if (typeof focusEl.focus === 'function') {
      focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusEl.focus();
    }
  }
};

const syncDocIndexFromFlow = () => {
  if (!flowSteps.value.length) return;
  if (currentFlowStep.value?.type === 'upload') return;
  const templateId = currentFlowStep.value?.template?.id;
  if (!templateId) return;
  const idx = templates.value.findIndex((t) => Number(t.id) === Number(templateId));
  if (idx >= 0) currentDocIndex.value = idx;
};

const goToPrevious = () => {
  if (flowSteps.value.length) {
    if (currentFlowIndex.value > 0) {
      currentFlowIndex.value -= 1;
      syncDocIndexFromFlow();
    }
    return;
  }
  if (currentDocIndex.value > 0) currentDocIndex.value -= 1;
};

const goToNext = () => {
  if (flowSteps.value.length) {
    if (currentFlowIndex.value < flowSteps.value.length - 1) {
      currentFlowIndex.value += 1;
      syncDocIndexFromFlow();
    }
    return;
  }
  if (currentDocIndex.value < templates.value.length - 1) currentDocIndex.value += 1;
};

const handlePdfLoaded = ({ totalPages }) => {
  reviewTotalPages.value = totalPages || 0;
  reviewPage.value = 1;
  canProceed.value = reviewTotalPages.value <= 1;
};

const handlePageChange = ({ currentPage, totalPages }) => {
  reviewPage.value = currentPage || 1;
  reviewTotalPages.value = totalPages || reviewTotalPages.value;
  canProceed.value = reviewTotalPages.value > 0 && reviewPage.value >= reviewTotalPages.value;
};

const addClient = () => {
  clients.value.push({ firstName: '', lastName: '' });
  intakeResponses.clients.push({});
};

const removeClient = (idx) => {
  clients.value.splice(idx, 1);
  intakeResponses.clients.splice(idx, 1);
};

const initializeFieldValues = () => {
  if (!currentDoc.value) return;
  const values = currentFieldValues.value;
  const prefill = getPrefillMap();
  currentFieldDefinitions.value.forEach((field) => {
    const prefillKey = resolvePrefillKey(field);
    const prefillValue = prefillKey ? prefill[prefillKey] : undefined;
    const existing = values[field.id];
    const isEmpty = existing === undefined || existing === null || existing === '';
    const fallbackValue = getDocumentFieldFallbackValue(field);
    if (isEmpty && prefillValue !== undefined && prefillValue !== null && prefillValue !== '') {
      if (field.type === 'checkbox') {
        values[field.id] = prefillValue === true || prefillValue === 'true' || prefillValue === 1;
      } else if (field.type === 'select' || field.type === 'radio') {
        const options = Array.isArray(field.options) ? field.options : [];
        const optionValues = options.map((opt) => String(opt.value ?? opt.label ?? '')).filter(Boolean);
        const stringVal = String(prefillValue);
        values[field.id] = optionValues.length === 0 || optionValues.includes(stringVal) ? stringVal : '';
      } else {
        values[field.id] = String(prefillValue);
      }
      return;
    }
    if (isEmpty && fallbackValue) {
      values[field.id] = String(fallbackValue);
      return;
    }
    const keyNorm = String(prefillKey || '').trim().toLowerCase();
    if (field.type === 'date' && (field.autoToday || keyNorm === 'date')) {
      values[field.id] = new Date().toISOString().slice(0, 10);
    } else if (field.type === 'checkbox') {
      if (!(field.id in values)) values[field.id] = field.defaultChecked === true;
    } else if (field.type === 'select' || field.type === 'radio') {
      if (!(field.id in values)) values[field.id] = '';
    } else if (!(field.id in values)) {
      values[field.id] = '';
    }
  });
};

const stepQuestionFields = computed(() => {
  if (!intakeSteps.value.length) return [];
  const fields = [];
  intakeSteps.value.forEach((step) => {
    if (step?.type !== 'questions' || !Array.isArray(step.fields)) return;
    const stepVis = String(step.visibility || 'always').trim().toLowerCase();
    if (stepVis === 'new_client_only' && isExistingClientByMatch.value) return;
    fields.push(...step.fields);
  });
  if (!fields.length) return [];
  const intakeKeys = new Set(
    (intakeFields.value || [])
      .map((f) => String(f?.key || '').trim())
      .filter(Boolean)
  );
  return fields.filter((f) => {
    const key = String(f?.key || '').trim();
    if (!key) return false;
    const scope = String(f?.scope || 'submission').trim().toLowerCase();
    if (intakeForSelf.value && scope === 'guardian') return false;
    if (intakeForSelf.value && scope === 'client') return false;
    if (!intakeForSelf.value && scope === 'self') return false;
    // 'self'-scoped fields are never rendered by any legacy section, so bypass
    // the deduplication check — they would otherwise be silently hidden because
    // buildPayloadFromSteps also flattens them into intake_fields.
    if (scope === 'self') return true;
    return !intakeKeys.has(key);
  });
});

const questionValues = computed(() => intakeResponses.submission);

const isQuestionVisible = (field, values = {}) => {
  const fv = String(field?.visibility || 'always').trim().toLowerCase();
  if (fv === 'new_client_only' && isExistingClientByMatch.value) return false;
  const showIf = field?.showIf;
  if (!showIf || !showIf.fieldKey) return true;
  const actual = values[showIf.fieldKey];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map((v) => String(v).trim().toLowerCase()).includes(String(actual).trim().toLowerCase());
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '').trim().toLowerCase() === String(expected ?? '').trim().toLowerCase();
};

const visibleQuestionFields = computed(() =>
  stepQuestionFields.value.filter((f) => isQuestionVisible(f, questionValues.value))
);

const applyRegistrationAccountState = (exists) => {
  ensureRegistrationMaps();
  intakeResponses.submission.registration_account_state = exists ? 'existing' : 'new';
  intakeResponses.submission.registration_has_account = !!exists;
};

const lookupRegistrationAccount = async (emailRaw) => {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!usesRegistrationFeatures.value || !email || !email.includes('@')) {
    registrationAccountLookupChecked.value = false;
    registrationAccountExists.value = false;
    return;
  }
  registrationAccountLookupLoading.value = true;
  try {
    const resp = await api.get(`/public-intake/${publicKey}/account-lookup`, {
      params: { email }
    });
    const exists = !!resp.data?.exists;
    registrationAccountExists.value = exists;
    registrationAccountLookupChecked.value = true;
    applyRegistrationAccountState(exists);
    if (exists) {
      const first = String(resp.data?.profile?.firstName || '').trim();
      const last = String(resp.data?.profile?.lastName || '').trim();
      if (first && !String(guardianFirstName.value || '').trim()) guardianFirstName.value = first;
      if (last && !String(guardianLastName.value || '').trim()) guardianLastName.value = last;
    }
  } catch {
    registrationAccountLookupChecked.value = false;
  } finally {
    registrationAccountLookupLoading.value = false;
  }
};

watch(guardianFirstName, (val) => {
  if (String(val || '').trim()) consentErrors.guardianFirstName = '';
});
watch(guardianEmail, (val) => {
  if (String(val || '').trim()) consentErrors.guardianEmail = '';
  if (!usesRegistrationFeatures.value) return;
  if (registrationLookupTimer) clearTimeout(registrationLookupTimer);
  const email = String(val || '').trim();
  if (!email || !email.includes('@')) {
    registrationAccountLookupChecked.value = false;
    registrationAccountExists.value = false;
    return;
  }
  registrationLookupTimer = setTimeout(() => {
    lookupRegistrationAccount(email);
  }, 350);
});
watch(guardianPhone, (val) => {
  if (String(val || '').trim()) consentErrors.guardianPhone = '';
});
watch(usesRegistrationFeatures, (val) => {
  if (!val) return;
  applyRegistrationAccountState(false);
  const email = String(guardianEmail.value || '').trim();
  if (email && email.includes('@')) lookupRegistrationAccount(email);
});
watch(
  () => clients.value?.[0]?.firstName,
  (val) => {
    if (intakeForSelf.value) return;
    if (String(val || '').trim()) consentErrors.clientFirstName = '';
  }
);
watch(
  () => clients.value?.[0]?.lastName,
  (val) => {
    if (intakeForSelf.value) return;
    if (String(val || '').trim()) consentErrors.clientLastName = '';
  }
);

watch(intakeForSelf, (val) => {
  if (!val) return;
  clients.value = [{ firstName: '', lastName: '' }];
  intakeResponses.clients = [{}];
  consentErrors.clientFirstName = '';
  consentErrors.clientLastName = '';
});

watch(isMedicalRecordsRequest, (val) => {
  if (val) intakeForSelf.value = true;
});

const buildQuestionPrefillMap = () => {
  const map = {};
  intakeSteps.value.forEach((step) => {
    if (step?.type !== 'questions' || !Array.isArray(step.fields)) return;
    step.fields.forEach((field) => {
      const documentKey = String(field?.documentKey || '').trim();
      const questionKey = field?.key;
      if (!documentKey || !questionKey) return;
      const scope = String(field?.scope || 'submission').toLowerCase();
      const clientValues = intakeResponses.clients?.[0] || {};
      const guardianValues = intakeResponses.guardian || {};
      const submissionValues = intakeResponses.submission || {};
      const value =
        scope === 'client'
          ? clientValues?.[questionKey]
          : scope === 'guardian'
            ? guardianValues?.[questionKey]
            : submissionValues?.[questionKey];
      if (value !== undefined && value !== null && value !== '') {
        map[documentKey] = value;
      }
      if (scope === 'client' && intakeForSelf.value && !map[documentKey]) {
        if (questionKey === 'client_first' && guardianFirstName.value) {
          map[documentKey] = guardianFirstName.value;
        }
        if (questionKey === 'client_last' && guardianLastName.value) {
          map[documentKey] = guardianLastName.value;
        }
      }
    });
  });
  return map;
};

const getPrefillMap = () => {
  const map = {};
  const submission = intakeResponses.submission || {};
  const guardianResponses = intakeResponses.guardian || {};
  const clientResponses = intakeResponses.clients?.[0] || {};
  const intakeKeys = new Set(
    (intakeFields.value || [])
      .map((f) => String(f?.key || '').trim())
      .filter(Boolean)
  );
  const shouldSetRelationship = intakeKeys.has('relationship');
  Object.keys(submission).forEach((key) => {
    if (submission[key] !== undefined && submission[key] !== null && submission[key] !== '') {
      map[key] = submission[key];
    }
  });
  if (guardianFirstName.value) map.guardian_first = guardianFirstName.value;
  if (guardianLastName.value) map.guardian_last = guardianLastName.value;
  if (guardianRelationship.value) map.relationship = guardianRelationship.value;
  if (!map.relationship && guardianResponses.relationship) map.relationship = guardianResponses.relationship;
  if (!map.relationship && shouldSetRelationship) {
    const relKey = Object.keys(guardianResponses).find((k) => normalizeKey(k).includes('relationship'));
    if (relKey && guardianResponses[relKey]) map.relationship = guardianResponses[relKey];
  }
  if (guardianResponses.guardian_first && !map.guardian_first) map.guardian_first = guardianResponses.guardian_first;
  if (guardianResponses.guardian_last && !map.guardian_last) map.guardian_last = guardianResponses.guardian_last;
  if (guardianResponses.guardian_email) map.guardian_email = guardianResponses.guardian_email;
  if (guardianResponses.guardian_phone) map.guardian_phone = guardianResponses.guardian_phone;
  const firstClient = clients.value?.[0] || {};
  const clientFirst = String(firstClient.firstName || '').trim();
  const clientLast = String(firstClient.lastName || '').trim();
  if (clientFirst && !map.client_first) map.client_first = clientFirst;
  if (clientLast && !map.client_last) map.client_last = clientLast;
  if (clientResponses.client_first && !map.client_first) map.client_first = clientResponses.client_first;
  if (clientResponses.client_last && !map.client_last) map.client_last = clientResponses.client_last;
  const questionMap = buildQuestionPrefillMap();
  Object.keys(questionMap).forEach((key) => {
    if (questionMap[key] !== undefined && questionMap[key] !== null && questionMap[key] !== '') {
      map[key] = questionMap[key];
    }
  });
  return map;
};

const resolvePrefillKey = (field) => field?.prefillKey || field?.prefill_key || field?.id || '';

const advanceIntro = () => {
  if (introIndex.value < introScreens.value.length - 1) {
    introIndex.value += 1;
    return;
  }
  step.value = 1;
};

const nextFlowStep = async () => {
  if (currentFlowIndex.value < flowSteps.value.length - 1) {
    currentFlowIndex.value += 1;
    if (currentFlowStep.value?.type === 'upload') {
      uploadStepFiles.value = [];
    }
  } else {
    await finalizePacket();
  }
};

const onUploadStepFilesChange = (e) => {
  const files = Array.from(e.target?.files || []);
  const step = currentFlowStep.value;
  if (!step || step.type !== 'upload') return;
  const max = Math.max(1, step.maxFiles || 1);
  uploadStepFiles.value = files.slice(0, max);
  if (uploadStepInputRef.value) uploadStepInputRef.value.value = '';
};

const removeUploadStepFile = (idx) => {
  uploadStepFiles.value = uploadStepFiles.value.filter((_, i) => i !== idx);
};

const completeUploadStep = async () => {
  const s = currentFlowStep.value;
  if (!s || s.type !== 'upload') return;
  const usingPasteMode = isUploadPasteEnabled.value && coverLetterInputMode.value === 'paste';
  if (s.required && !usingPasteMode && uploadStepFiles.value.length === 0) {
    stepError.value = 'Please select at least one file to upload.';
    return;
  }
  if (s.required && usingPasteMode && !String(coverLetterPastedText.value || '').trim()) {
    stepError.value = isResumeStep.value
      ? 'Please paste your resume text before continuing.'
      : 'Please paste your text before continuing.';
    return;
  }
  if (!submissionId.value) {
    stepError.value = 'Session expired. Please start over.';
    return;
  }
  try {
    submitLoading.value = true;
    stepError.value = '';
    if (!usingPasteMode) {
      const formData = new FormData();
      formData.append('stepId', s.id);
      formData.append('label', s.label || 'Upload');
      uploadStepFiles.value.forEach((f) => {
        formData.append('files', f);
      });
      await api.post(`/public-intake/${publicKey}/${submissionId.value}/upload`, formData);
      uploadStatus[s.id] = true;
    } else {
      uploadStatus[s.id] = true;
      const pastedText = String(coverLetterPastedText.value || '').trim();
      if (!intakeResponses.submission.uploadTextByStep || typeof intakeResponses.submission.uploadTextByStep !== 'object') {
        intakeResponses.submission.uploadTextByStep = {};
      }
      intakeResponses.submission.uploadTextByStep[s.id] = pastedText;
      if (isCoverLetterStep.value) intakeResponses.submission.coverLetterText = pastedText;
      if (isResumeStep.value) intakeResponses.submission.resumeText = pastedText;
    }
    uploadStepFiles.value = [];
    await nextFlowStep();
  } catch (e) {
    stepError.value = e.response?.data?.error?.message || 'Upload failed. Please try again.';
  } finally {
    submitLoading.value = false;
  }
};

const completeReferencesStep = () => {
  const s = currentFlowStep.value;
  if (!s || s.type !== 'references') return;
  const minimum = Math.max(1, Number(s.minReferences || 3) || 3);
  const provided = referencesEntries.value
    .map((r) => ({
      name: String(r?.name || '').trim(),
      relationship: String(r?.relationship || '').trim(),
      organization: String(r?.organization || '').trim(),
      phone: String(r?.phone || '').trim(),
      email: String(r?.email || '').trim()
    }))
    .filter((r) => r.name || r.email || r.phone || r.organization || r.relationship);
  if (!referencesWaived.value && provided.length < minimum) {
    stepError.value = `Please provide at least ${minimum} professional references, or select the waiver option.`;
    return;
  }
  intakeResponses.submission.references = provided;
  intakeResponses.submission.referencesWaived = !!referencesWaived.value;
  stepError.value = '';
  void nextFlowStep();
};

const loadAgencyRegistrationCatalog = async () => {
  if (!usesRegistrationFeatures.value || !publicKey) return;
  try {
    const r = await api.get(`/public-intake/${publicKey}/registration-catalog`);
    agencyRegistrationCatalog.value = Array.isArray(r.data?.items) ? r.data.items : [];
  } catch {
    agencyRegistrationCatalog.value = [];
  }
};

const preselectLinkedCompanyEvent = (regStep) => {
  const stepId = String(regStep?.id || '').trim();
  const ceid = Number(link.value?.company_event_id || 0);
  if (!stepId || !ceid) return;
  const optId = `cat_company_event_${ceid}`;
  const opts = currentRegistrationOptions.value;
  if (!opts.some((o) => String(o.id) === optId)) return;
  if (getRegistrationSelectionIds(stepId).length) return;
  setRegistrationSelectionIds(stepId, [optId]);
};

watch(currentFlowStep, async (step) => {
  if (step?.type === 'upload') {
    uploadStepFiles.value = [];
    coverLetterInputMode.value = 'upload';
    coverLetterPastedText.value = '';
  }
  if (step?.type === 'registration') {
    ensureRegistrationMaps();
    const stepId = String(step?.id || '').trim();
    if (!stepId) return;
    const lookupField = ['email', 'phone', 'client_id'].includes(String(step?.existingLookupField || ''))
      ? String(step.existingLookupField)
      : 'email';
    const participant = getRegistrationParticipant(stepId);
    setRegistrationParticipant(stepId, { lookupField: participant.lookupField || lookupField });
    const hasIds = Array.isArray(intakeResponses.submission.registrationSelectionIdsByStep?.[stepId]);
    if (!hasIds) {
      const existingSelections = Array.isArray(intakeResponses.submission.registrationSelectionsByStep?.[stepId])
        ? intakeResponses.submission.registrationSelectionsByStep[stepId]
        : [];
      const ids = existingSelections.map((s) => String(s?.optionId || '')).filter(Boolean);
      if (ids.length) {
        intakeResponses.submission.registrationSelectionIdsByStep[stepId] = ids;
      }
    }
    if (String(step.sourceType || '') === 'agency_catalog') {
      if (!agencyRegistrationCatalog.value.length) {
        await loadAgencyRegistrationCatalog();
      }
      await nextTick();
      preselectLinkedCompanyEvent(step);
    }
  }
});

watch(currentDoc, async () => {
  reviewPage.value = 1;
  reviewTotalPages.value = 0;
  canProceed.value = currentDoc.value?.template_type !== 'pdf';
  signatureData.value = '';
  pageNotice.value = '';
  syncClientNamesToResponses();
  initializeFieldValues();
  await loadPdfPreview();
});

watch(
  questionValues,
  () => {
    if (!missingRequiredQuestionKeys.value.length) return;
    const stillMissing = new Set(
      visibleQuestionFields.value
        .filter((field) => isQuestionValueMissing(field))
        .map((field) => String(field.key || '').trim())
        .filter(Boolean)
    );
    missingRequiredQuestionKeys.value = missingRequiredQuestionKeys.value.filter((key) => stillMissing.has(key));
  },
  { deep: true }
);

watch(
  () => [step.value, currentFlowIndex.value, currentDocIndex.value],
  () => {
    if (!(step.value === 2 && currentFlowStep.value?.type === 'questions')) {
      missingRequiredQuestionKeys.value = [];
    }
    syncMobileStepScroll();
  }
);

watch(
  () => ({
    sessionToken: sessionToken.value,
    submissionId: submissionId.value,
    step: step.value,
    introIndex: introIndex.value,
    currentFlowIndex: currentFlowIndex.value,
    intakeForSelf: intakeForSelf.value,
    organizationId: organizationId.value,
    guardianFirstName: guardianFirstName.value,
    guardianLastName: guardianLastName.value,
    guardianEmail: guardianEmail.value,
    guardianPhone: guardianPhone.value,
    guardianRelationship: guardianRelationship.value,
    clients: clients.value,
    intakeResponses,
    embeddedSmartSchoolRoi: embeddedSmartSchoolRoi.value
  }),
  () => {
    queueDraftPersist();
  },
  { deep: true }
);

const beginIntakeSession = async () => {
  consentLoading.value = true;
  try {
    beginError.value = '';
    if (requiresCaptchaAtStart.value) {
      if (captchaWidgetFailed.value) {
        beginError.value = t('captchaFailed');
        return;
      }
      const captchaTokenToSend = String(captchaToken.value || '').trim();
      if (!captchaTokenToSend) {
        beginError.value = t('completeCaptchaToContinue');
        return;
      }
    }
    const resp = await api.post(`/public-intake/${publicKey}/session`, {
      captchaToken: String(captchaToken.value || '').trim() || undefined
    });
    const token = String(resp.data?.sessionToken || '').trim();
    if (!token) {
      beginError.value = t('unableToStartSession');
      return;
    }
    sessionToken.value = token;
    await router.replace({ query: { ...route.query, session: token } });
    await resetRecaptchaWidget();
    if (introScreens.value.length) {
      step.value = 0;
      introIndex.value = 0;
    } else {
      step.value = 1;
    }
    initializeFieldValues();
    await loadPdfPreview();
  } catch (e) {
    beginError.value = e.response?.data?.error?.message || t('unableToStartSession');
  } finally {
    consentLoading.value = false;
  }
};

const handleSmartRoiCompleted = ({ submissionId: nextSubmissionId, downloadUrl: nextDownloadUrl, emailDelivery, clientBundles }) => {
  submissionId.value = nextSubmissionId || null;
  downloadUrl.value = nextDownloadUrl || '';
  emailDeliveryStatus.value = emailDelivery || null;
  clientBundleLinks.value = Array.isArray(clientBundles) ? clientBundles : [];
  step.value = 3;
  clearPersistedDraft();
  if (!downloadUrl.value && !jobApplicationSubmitted.value) {
    pollForDownloadUrl();
  }
};

const handleEmbeddedSchoolRoiCaptured = async ({ smartSchoolRoi } = {}) => {
  embeddedSmartSchoolRoi.value = smartSchoolRoi || null;
  intakeResponses.submission = {
    ...(intakeResponses.submission || {}),
    smartSchoolRoi: smartSchoolRoi || null
  };
  stepError.value = '';
  await nextFlowStep();
};

onMounted(async () => {
  window.addEventListener('beforeunload', persistDraftOnPageExit);
  window.addEventListener('pagehide', persistDraftOnPageExit);
  document.addEventListener('visibilitychange', handleVisibilityDraftPersist);

  await loadLink();
  const restoredDraft = restoreDraftSnapshot();
  if (restoredDraft) {
    showDraftRestoredBanner();
  }
  if (!sessionToken.value) {
    step.value = -1;
    await maybeInitRecaptchaForCover();
    return;
  }
  if (!restoredDraft && introScreens.value.length) {
    step.value = 0;
    introIndex.value = 0;
  }
  initializeFieldValues();
  await loadPdfPreview();
  await syncMobileStepScroll();
});

onBeforeUnmount(() => {
  if (draftPersistTimer) {
    clearTimeout(draftPersistTimer);
    draftPersistTimer = null;
  }
  if (draftRestoredBannerTimer) {
    clearTimeout(draftRestoredBannerTimer);
    draftRestoredBannerTimer = null;
  }
  window.removeEventListener('beforeunload', persistDraftOnPageExit);
  window.removeEventListener('pagehide', persistDraftOnPageExit);
  document.removeEventListener('visibilitychange', handleVisibilityDraftPersist);
  persistDraftSnapshot();

  if (registrationLookupTimer) {
    clearTimeout(registrationLookupTimer);
    registrationLookupTimer = null;
  }
});
</script>

<style scoped>
.preparing-message {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
}
.preparing-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--primary, #2c3e50);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.intake-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
.draft-restored-banner {
  margin: 8px 0 12px;
  padding: 10px 12px;
  border: 1px solid #86efac;
  border-radius: 8px;
  background: #f0fdf4;
  color: #166534;
  font-size: 13px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.bound-client-card {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.bound-client-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.bound-client-name {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}
.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
}
.form-group input,
.form-group textarea,
.field-inputs input,
.field-inputs textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}
.form-group input[type='date'],
.field-inputs input[type='date'] {
  min-height: 40px;
  line-height: 1.2;
  -webkit-appearance: none;
}
.clients-block {
  display: grid;
  gap: 12px;
  margin-bottom: 12px;
}
.clients-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.clients-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}
.client-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-alt);
  display: grid;
  gap: 10px;
}
.client-card-alt {
  background: #f3f6fb;
}
.client-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.consent-box {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 10px;
  margin: 12px 0;
}
.captcha-block {
  margin: 12px 0;
}
.captcha-block-top {
  margin-bottom: 20px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}
.captcha-block-start {
  margin: 16px 0 20px;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.captcha-block-start .recaptcha-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.recaptcha-verify-first {
  margin-bottom: 8px;
  font-weight: 500;
}
.recaptcha-widget > div:first-child {
  min-height: 78px;
}
.bundle-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}
.bundle-title {
  font-weight: 600;
}
.bundle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}
.actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
}
.doc-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 12px 0;
}
.doc-nav-bottom {
  margin-top: 18px;
}
.doc-preview {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg);
  min-height: 320px;
}
.pdf-preview-container {
  width: 100%;
  display: flex;
  flex-direction: column;
}
.page-notice {
  margin: 12px 0 4px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fff4e5;
  border: 1px solid #f5c27a;
  color: #7a4b00;
  font-size: 13px;
}
.page-notice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  justify-content: flex-end;
}
.note {
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 12px;
}
.field-inputs {
  margin: 16px 0;
  padding: 16px;
  background: #f8f9fa;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.helper-text {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 6px;
}
.input-error {
  border-color: #dc3545;
  box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.55), 0 0 10px rgba(220, 53, 69, 0.35);
}
.required-missing-glow {
  border: 1px solid rgba(220, 53, 69, 0.55);
  border-radius: 10px;
  padding: 10px;
  background: rgba(220, 53, 69, 0.04);
  box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.2), 0 0 14px rgba(220, 53, 69, 0.22);
  animation: requiredPulse 1.2s ease-in-out infinite;
}
.required-missing-glow .radio-group,
.required-missing-glow .checkbox-row {
  border-radius: 8px;
}
@keyframes requiredPulse {
  0% { box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.18), 0 0 10px rgba(220, 53, 69, 0.14); }
  50% { box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.28), 0 0 18px rgba(220, 53, 69, 0.3); }
  100% { box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.18), 0 0 10px rgba(220, 53, 69, 0.14); }
}
.error-text {
  color: #dc3545;
  font-size: 12px;
  margin-top: 4px;
}
.required-indicator {
  color: #dc3545;
  margin-left: 4px;
  font-weight: 600;
}
.intake-card {
  position: relative;
}
.dev-fill-button {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 5;
}
.btn.btn-outline {
  background: transparent;
  border: 1px solid var(--border);
}
.public-intake .btn {
  padding: 8px 12px;
  font-size: 14px;
}
.public-intake .btn.btn-sm {
  padding: 6px 10px;
  font-size: 13px;
}

.info-block {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt);
}

.info-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.info-text {
  color: var(--text-secondary);
  font-size: 13px;
}

.field-inputs select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-top: 6px;
}

.radio-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  padding-left: 2px;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.upload-step {
  margin: 16px 0;
}
.job-ack-card {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #f8fbff;
}
.job-ack-text {
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  margin-bottom: 10px;
}
.job-ack-file {
  margin-bottom: 10px;
}
.job-ack-zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}
.job-ack-pdf {
  width: 100%;
  min-height: 420px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #fff;
}
.reference-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
  background: #fff;
}
.registration-step {
  margin: 16px 0;
}

/* ── Registration event card (intake step) ── */
.reg-event-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  margin-bottom: 16px;
}
.reg-event-banner {
  width: 100%;
  background: var(--color-primary, #4db6ac);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}
.reg-event-img {
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  display: block;
}
.reg-event-img-placeholder {
  font-size: 56px;
  padding: 24px;
  line-height: 1;
}
.reg-event-body {
  padding: 16px 18px 8px;
}
.reg-event-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}
.reg-event-date {
  margin: 0 0 6px;
  font-weight: 600;
  color: var(--color-primary, #4db6ac);
  font-size: 14px;
}
.reg-event-summary {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.45;
}
.reg-event-cost {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.reg-event-link {
  font-size: 13px;
  color: var(--color-primary, #4db6ac);
  display: inline-block;
  margin-bottom: 4px;
}
.reg-event-meta {
  margin: 0 0 6px;
  font-size: 13px;
}
.reg-event-eligibility {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.reg-eligibility-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}
.reg-event-confirm-note {
  background: var(--bg-alt);
  border-top: 1px solid var(--border);
  padding: 12px 18px;
  font-size: 14px;
  color: var(--text-secondary);
}

/* ── Registration success card (step 3) ── */
.reg-success-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  margin-bottom: 20px;
}
.reg-success-event {
  background: var(--color-primary, #4db6ac);
  color: #fff;
  padding: 20px 20px 16px;
}
.reg-success-event-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 6px;
}
.reg-success-event-date {
  font-size: 14px;
  opacity: 0.92;
  margin-bottom: 14px;
}
.reg-success-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.reg-success-account {
  padding: 16px 20px 20px;
}
.reg-success-account-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.reg-success-username {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-all;
  margin-bottom: 8px;
}
.reg-success-account-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
  line-height: 1.45;
}
.reg-success-account-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.demographics-step {
  margin: 16px 0;
}
.demographics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
@media (max-width: 600px) {
  .demographics-grid {
    grid-template-columns: 1fr;
  }
}
.demographics-grid .form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.demographics-grid .form-group label {
  font-weight: 600;
  font-size: 14px;
}
.field-error {
  color: var(--color-danger, #dc2626);
  font-size: 12px;
  margin-top: 2px;
}

.clinical-questions-step {
  margin: 16px 0;
  display: grid;
  gap: 16px;
}

.communications-step {
  margin: 16px 0;
  display: grid;
  gap: 12px;
}
.communications-campaign-card {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
}
.communications-campaign-card h4 {
  margin: 0 0 8px;
}
.communications-disclosure {
  margin: 0 0 8px;
  color: var(--text-secondary);
  line-height: 1.45;
  font-size: 14px;
}
.registration-options {
  display: grid;
  gap: 8px;
}
.registration-schedule-blocks {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}
.registration-schedule-item {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
}
.registration-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt);
}
.registration-option small {
  display: block;
  margin-top: 2px;
}
.upload-step input[type="file"] {
  margin: 10px 0;
  padding: 8px;
}
.uploaded-files {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.uploaded-file-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-alt);
  border-radius: 8px;
  font-size: 14px;
}
.signature-block {
  margin-top: 16px;
  border-radius: 8px;
  transition: box-shadow 0.2s;
}
.signature-block--flash {
  animation: signatureFlash 0.55s ease-in-out 0s 4 alternate;
}
@keyframes signatureFlash {
  0%   { box-shadow: 0 0 0 0px rgba(239,68,68,0); }
  100% { box-shadow: 0 0 0 6px rgba(239,68,68,0.55), 0 0 18px rgba(239,68,68,0.3); }
}
.doc-nav-btn--pulse {
  animation: navBtnPulse 0.55s ease-in-out 0s 4 alternate;
}
@keyframes navBtnPulse {
  0%   { box-shadow: 0 0 0 0px rgba(234,137,12,0); transform: scale(1); }
  100% { box-shadow: 0 0 0 6px rgba(234,137,12,0.45), 0 0 14px rgba(234,137,12,0.25); transform: scale(1.04); }
}
.signature-confirm {
  margin-top: 10px;
  font-weight: 600;
}
.signature-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.signature-reuse-prompt {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}
.signature-reuse-text {
  font-weight: 600;
  color: var(--text-primary, #1f2933);
}
.signature-reuse-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.saved-sig-prompt {
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-alt, #f8fafc);
}
.saved-sig-prompt p {
  margin: 0 0 10px;
  font-size: 14px;
}
.saved-sig-prompt-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.signature-summary-top {
  font-size: 13px;
  padding: 8px 12px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
  color: var(--text-secondary);
}
.signature-summary {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-alt);
  margin-bottom: 10px;
}
.signature-summary .summary-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 14px;
}
.html-preview {
  max-height: 480px;
  overflow: auto;
}
.pdf-iframe {
  width: 100%;
  min-height: 480px;
  border: none;
}
.muted {
  color: var(--text-secondary);
}

.cover-step {
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-card {
  width: 100%;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  text-align: center;
  display: grid;
  gap: 12px;
  justify-items: center;
}

.cover-logo img {
  max-width: 240px;
  max-height: 140px;
  object-fit: contain;
}

.cover-title {
  font-size: 22px;
  font-weight: 700;
}

.cover-subtitle {
  color: var(--text-secondary);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 3000;
}

.modal {
  background: #fff;
  width: min(780px, 95vw);
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.modal-body {
  padding: 12px 16px 16px;
  overflow: auto;
  display: grid;
  gap: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.answer-section {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px;
  background: var(--bg-alt);
}

.answer-title {
  font-weight: 600;
}

.answer-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 2fr) auto;
  gap: 8px;
  align-items: start;
  font-size: 14px;
}

.answer-label {
  font-weight: 600;
}

.answer-value {
  white-space: pre-wrap;
}

.summary-text {
  white-space: pre-wrap;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  font-size: 13px;
}

@media (max-width: 720px) {
  .public-intake.container {
    padding: 12px;
  }
  .intake-card {
    padding: 16px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .clients-header,
  .client-card-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .doc-nav {
    flex-direction: column;
    align-items: stretch;
  }
  .doc-meta {
    text-align: center;
  }
  .doc-preview {
    padding: 8px;
    min-height: 240px;
  }
  .html-preview {
    max-height: 60vh;
  }
  .actions {
    flex-direction: column;
  }
  .actions .btn,
  .actions a.btn {
    width: 100%;
  }
}
</style>
