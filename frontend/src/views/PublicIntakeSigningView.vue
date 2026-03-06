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

      <div v-if="step === -1" class="step cover-step">
        <div class="cover-card">
          <div v-for="screen in introScreens" :key="screen.key" class="cover-logo">
            <img v-if="screen.logoUrl" :src="screen.logoUrl" :alt="screen.altText" />
            <div class="cover-title">{{ screen.displayName }}</div>
          </div>
          <div class="cover-subtitle">
            {{ beginSubtitleText }}
          </div>

          <div v-if="recaptchaSiteKey" class="captcha-block captcha-block-start">
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
              :disabled="(recaptchaSiteKey && (!showRecaptchaWidget || !captchaToken)) || consentLoading"
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
          <div class="actions">
            <button class="btn btn-primary" type="button" @click="advanceIntro">
              {{ t('acknowledgeAndContinue') }}
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="step === 1" class="step">
        <h3>{{ t('questions') }}</h3>
        <div v-if="stepError" class="error" style="margin-bottom: 10px;">{{ stepError }}</div>

        <div v-if="!isMedicalRecordsRequest && !isJobApplication" class="form-group">
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
          </div>
          <div class="form-group">
            <label>{{ (intakeForSelf || isMedicalRecordsRequest || isJobApplication) ? t('yourPhoneOptional') : t('guardianPhoneOptional') }}</label>
            <input v-model="guardianPhone" type="tel" />
          </div>
          <div v-if="!isMedicalRecordsRequest && !isJobApplication" class="form-group">
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

        <div v-if="!isMedicalRecordsRequest && !isJobApplication" class="clients-block">
          <div class="clients-header">
            <h4>{{ intakeForSelf ? t('client') : t('clients') }}</h4>
          </div>
          <div v-for="(c, idx) in clients" :key="idx" class="client-card" :class="{ 'client-card-alt': idx % 2 === 1 }">
            <div class="client-card-header">
              <strong>{{ t('clientN') }} {{ idx + 1 }}</strong>
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

            <div v-if="clientFields.length" class="custom-fields">
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
          <div v-for="field in visibleQuestionFields" :key="field.id" class="form-group" :data-question-key="field.key">
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
              />
              <textarea v-else-if="field.type === 'textarea'" v-model="questionValues[field.key]" rows="4"></textarea>
              <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                <input v-model="questionValues[field.key]" type="checkbox" />
                <span>{{ field.label || field.key }}</span>
              </label>
              <select v-else-if="field.type === 'select'" v-model="questionValues[field.key]">
                <option value="">{{ t('selectOption') }}</option>
                <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                  {{ opt.label || opt.value }}
                </option>
              </select>
              <div v-else-if="field.type === 'radio'" class="radio-group">
                <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                  <input type="radio" :name="`q_${field.key}`" :value="opt.value || opt.label" v-model="questionValues[field.key]" />
                  <span>{{ opt.label || opt.value }}</span>
                </label>
              </div>
              <input v-else v-model="questionValues[field.key]" type="date" />
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

        <div v-else-if="step === 2 && currentFlowStep?.type !== 'questions'" class="step">
        <h3 v-if="currentFlowStep?.type === 'document'">Document</h3>
        <h3 v-else-if="currentFlowStep?.type === 'upload'">{{ currentFlowStep?.label || 'Upload' }}</h3>
        <h3 v-else-if="currentFlowStep?.type === 'questions'">Questions</h3>
        <div v-if="stepError" class="error" style="margin-bottom: 10px;">{{ stepError }}</div>
        <div v-if="currentFlowStep?.type === 'upload'" class="upload-step">
          <p class="muted">{{ currentFlowStep?.label || 'Upload' }} ({{ currentFlowStep?.required ? 'required' : 'optional' }})</p>
          <input
            ref="uploadStepInputRef"
            type="file"
            :accept="currentFlowStep?.accept || '.pdf,.doc,.docx'"
            :multiple="(currentFlowStep?.maxFiles || 1) > 1"
            @change="onUploadStepFilesChange"
          />
          <div v-if="uploadStepFiles.length" class="uploaded-files">
            <div v-for="(f, i) in uploadStepFiles" :key="i" class="uploaded-file-row">
              <span>{{ f.name }}</span>
              <button type="button" class="btn btn-secondary btn-xs" @click="removeUploadStepFile(i)">Remove</button>
            </div>
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
            @click="goToNext"
          >
            Next
          </button>
        </div>
        <div class="actions" style="margin-top: 10px;">
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
              <button class="btn btn-outline btn-sm" type="button" @click="skipToSignaturePage">
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

        <div v-if="currentFlowStep?.type === 'document' && currentDoc?.document_action_type === 'signature'" class="signature-block" ref="signatureBlockRef">
          <SignaturePad compact @signed="onSigned" />
          <div v-if="allowSignatureReuseActions && lastSignatureData && !signatureData" class="signature-reuse-actions" style="margin-top: 12px;">
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

        <div class="actions">
          <button
            class="btn btn-primary"
            type="button"
            :disabled="submitLoading || (currentFlowStep?.type === 'upload' && currentFlowStep?.required && uploadStepFiles.length === 0)"
            @click="currentFlowStep?.type === 'document' ? completeCurrentDocument() : (currentFlowStep?.type === 'upload' ? completeUploadStep() : completeQuestionStep())"
          >
            {{ submitLoading ? t('submitting') : (currentFlowStep?.type === 'upload' ? 'Continue' : (currentFlowStep?.type === 'document' ? (currentDoc?.document_action_type === 'signature' ? t('signContinue') : t('markReviewedContinue')) : t('continue'))) }}
          </button>
        </div>

      </div>

      <div v-else-if="step === 3" class="step">
        <h3>{{ jobApplicationSubmitted ? 'Application Submitted' : 'All Set' }}</h3>
        <p v-if="jobApplicationSubmitted">
          Thank you for your application. We have received your materials and will review them shortly.
        </p>
        <p v-else>{{ completionEmailMessage }}</p>
        <p v-if="!jobApplicationSubmitted" class="muted">Download links expire in 14 days. After that, the files are deleted once uploaded to Therapy Notes.</p>
        <div v-if="downloadUrl && !jobApplicationSubmitted" class="actions">
          <a class="btn btn-primary" :href="downloadUrl" target="_blank" rel="noopener">View Packet PDF</a>
          <a class="btn btn-secondary" :href="downloadUrl" download>Download Packet PDF</a>
        </div>
        <div v-if="clientBundleLinks.length && !jobApplicationSubmitted" class="bundle-list">
          <div class="bundle-title">Download per-child packets</div>
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
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import SignaturePad from '../components/SignaturePad.vue';
import PDFPreview from '../components/documents/PDFPreview.vue';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { useAuthStore } from '../store/auth';

const INTAKE_TRANSLATIONS = {
  en: {
    beginSubtitle: 'Begin to start a secure intake session. This link creates a unique session for each person.',
    beginSubtitleJob: 'Start your job application. This link creates a unique session for your application.',
    beginSubtitleMedical: 'Request your medical records. This link creates a unique session for your request.',
    beginIntake: 'Begin intake',
    beginIntakeJob: 'Start job application',
    beginIntakeMedical: 'Start medical records request',
    loadingLink: 'Loading intake link...',
    loadingLinkJob: 'Loading job application...',
    loadingLinkMedical: 'Loading medical records request...',
    digitalIntake: 'Digital Intake',
    digitalIntakeJob: 'Job Application',
    digitalIntakeMedical: 'Medical Records Request',
    welcome: 'Welcome',
    formTimeLimit: 'This form must be completed within 1 hour. Each new page adds 5 minutes. The session is unique and cannot be saved or resumed.',
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
    signerLabelGuardian: 'Guardian',
    signerLabelApplicant: 'Applicant',
    signerLabelRequester: 'Requester',
    applicantInformation: 'Applicant Information',
    requesterInformation: 'Requester Information',
    completionEmailGuardian: 'Your documents were completed successfully. A copy will be emailed to the guardian.',
    completionEmailApplicant: 'Your application was submitted successfully. A copy will be emailed to you.',
    completionEmailRequester: 'Your request was submitted successfully. A copy will be emailed to you.',
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
    dailyLimitReached: 'Daily intake start limit reached. Please try again tomorrow.'
  },
  es: {
    loadingLink: 'Cargando enlace de admisión...',
    loadingLinkJob: 'Cargando solicitud de empleo...',
    loadingLinkMedical: 'Cargando solicitud de registros médicos...',
    digitalIntake: 'Admisión Digital',
    digitalIntakeJob: 'Solicitud de Empleo',
    digitalIntakeMedical: 'Solicitud de Registros Médicos',
    beginSubtitle: 'Comience para iniciar una sesión de admisión segura. Este enlace crea una sesión única para cada persona.',
    beginSubtitleJob: 'Comience su solicitud de empleo. Este enlace crea una sesión única para su solicitud.',
    beginSubtitleMedical: 'Solicite sus registros médicos. Este enlace crea una sesión única para su solicitud.',
    beginIntake: 'Comenzar admisión',
    beginIntakeJob: 'Comenzar solicitud de empleo',
    beginIntakeMedical: 'Comenzar solicitud de registros médicos',
    welcome: 'Bienvenido',
    formTimeLimit: 'Este formulario debe completarse en 1 hora. Cada página nueva agrega 5 minutos. La sesión es única y no se puede guardar ni reanudar.',
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
const authStore = useAuthStore();

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
const beginSubtitleText = computed(() => {
  const custom = customMessages.value?.beginSubtitle;
  if (custom && String(custom).trim()) return String(custom).trim();
  if (formTypeKey.value === 'job_application') return t('beginSubtitleJob');
  if (formTypeKey.value === 'medical_records_request') return t('beginSubtitleMedical');
  return t('beginSubtitle');
});
const beginIntakeButtonText = computed(() => {
  const custom = customMessages.value?.beginIntake;
  if (custom && String(custom).trim()) return String(custom).trim();
  if (formTypeKey.value === 'job_application') return t('beginIntakeJob');
  if (formTypeKey.value === 'medical_records_request') return t('beginIntakeMedical');
  return t('beginIntake');
});
const loadingText = computed(() => {
  if (formTypeKey.value === 'job_application') return t('loadingLinkJob');
  if (formTypeKey.value === 'medical_records_request') return t('loadingLinkMedical');
  return t('loadingLink');
});
const defaultTitle = computed(() => {
  if (formTypeKey.value === 'job_application') return t('digitalIntakeJob');
  if (formTypeKey.value === 'medical_records_request') return t('digitalIntakeMedical');
  return t('digitalIntake');
});
const signerLabel = computed(() => {
  if (formTypeKey.value === 'job_application') return t('signerLabelApplicant');
  if (formTypeKey.value === 'medical_records_request') return t('signerLabelRequester');
  return t('signerLabelGuardian');
});
const completionEmailMessage = computed(() => {
  if (formTypeKey.value === 'job_application') return t('completionEmailApplicant');
  if (formTypeKey.value === 'medical_records_request') return t('completionEmailRequester');
  return t('completionEmailGuardian');
});
const guardianSectionTitle = computed(() => {
  if (formTypeKey.value === 'job_application') return t('applicantInformation');
  if (formTypeKey.value === 'medical_records_request') return t('requesterInformation');
  return t('guardianQuestions');
});

const loading = ref(true);
const error = ref('');
const stepError = ref('');
const beginError = ref('');
const link = ref(null);
const templates = ref([]);
const agencyInfo = ref(null);
const organizationInfo = ref(null);
const introIndex = ref(0);
const recaptchaSiteKey = ref(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '');
const useEnterpriseRecaptcha = ref(
  String(import.meta.env.VITE_RECAPTCHA_USE_ENTERPRISE || '').toLowerCase() === 'true'
);
const captchaToken = ref('');
const captchaError = ref('');
const showRecaptchaWidget = ref(false);
const recaptchaWidgetElStart = ref(null);
const recaptchaWidgetId = ref(null);
const captchaWidgetFailed = ref(false);
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
const flowSteps = computed(() => {
  if (intakeSteps.value.length) {
    return intakeSteps.value
      .filter((s) => s?.type === 'document' || s?.type === 'upload')
      .map((s) => {
        if (s.type === 'upload') return { ...s };
        const template = templates.value.find((t) => Number(t.id) === Number(s.templateId));
        return { ...s, template };
      });
  }
  return templates.value.map((t) => ({ id: `doc_${t.id}`, type: 'document', template: t }));
});
const currentFlowIndex = ref(0);
const currentFlowStep = computed(() => flowSteps.value[currentFlowIndex.value] || null);
const step = ref(1);
const submissionId = ref(null);
const consentLoading = ref(false);
const submitLoading = ref(false);
const currentDocIndex = ref(0);
const signatureBlockRef = ref(null);
const signatureData = ref('');
const lastSignatureData = ref('');
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
const docStatus = reactive({});
const uploadStatus = reactive({});
const uploadStepFiles = ref([]);
const uploadStepInputRef = ref(null);
const fieldValuesByTemplate = reactive({});
const sessionToken = ref(String(route.query?.session || '').trim());
const submissionStorageKey = computed(() =>
  sessionToken.value ? `public_intake_submission_${publicKey}_${sessionToken.value}` : `public_intake_submission_${publicKey}`
);

const signerInitials = ref('');
const clients = ref([
  { firstName: '', lastName: '' }
]);
const organizationId = ref('');

const guardianFirstName = ref('');
const guardianLastName = ref('');
const guardianEmail = ref('');
const guardianPhone = ref('');
const guardianRelationship = ref('');
const intakeResponses = reactive({
  guardian: {},
  submission: {},
  clients: [{}]
});
const downloadUrl = ref('');
const clientBundleLinks = ref([]);
const jobApplicationSubmitted = ref(false);
const consentErrors = reactive({
  guardianFirstName: '',
  guardianLastName: '',
  guardianEmail: '',
  clientFirstName: '',
  clientLastName: '',
  organizationId: ''
});
const intakeForSelf = ref(false);
const guardianDisplayName = computed(() =>
  `${guardianFirstName.value || ''} ${guardianLastName.value || ''}`.trim()
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
  displayedFieldDefinitions.value.filter((field) =>
    !(field?.type === 'checkbox' && field?.x !== undefined && field?.y !== undefined)
  )
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
const requiresOrganizationId = computed(
  () =>
    String(link.value?.scope_type || '') === 'agency' &&
    String(link.value?.form_type || '').toLowerCase() !== 'medical_records_request'
);
const isJobApplication = computed(() => String(link.value?.form_type || '').toLowerCase() === 'job_application');
const isMedicalRecordsRequest = computed(() => String(link.value?.form_type || '').toLowerCase() === 'medical_records_request');
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

const visibleGuardianFields = computed(() =>
  guardianFields.value.filter((f) => isIntakeFieldVisible(f, intakeResponses.guardian))
);

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
    templates.value = resp.data?.templates || [];
    agencyInfo.value = resp.data?.agency || null;
    organizationInfo.value = resp.data?.organization || null;
    const recaptchaConfig = resp.data?.recaptcha || {};
    recaptchaSiteKey.value = String(recaptchaConfig.siteKey || '').trim();
    if (typeof recaptchaConfig.useEnterprise === 'boolean') {
      useEnterpriseRecaptcha.value = recaptchaConfig.useEnterprise;
    }
    if (!templates.value.length) {
      error.value = 'No documents configured for this intake link.';
    }
    if (String(link.value?.form_type || '').toLowerCase() === 'job_application') {
      intakeForSelf.value = true;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load intake link';
  } finally {
    loading.value = false;
  }
};

const loadRecaptchaScript = () => {
  if (!recaptchaSiteKey.value) return Promise.resolve(null);
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
  if (document.querySelector('script[data-recaptcha]')) {
    return new Promise((resolve) => {
      const existing = document.querySelector('script[data-recaptcha]');
      existing?.addEventListener?.('load', () => resolve(window.grecaptcha));
      setTimeout(() => resolve(window.grecaptcha), 2000);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = useEnterpriseRecaptcha.value
      ? 'https://www.google.com/recaptcha/enterprise.js?render=explicit'
      : 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-recaptcha', 'true');
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error('Failed to load captcha'));
    document.head.appendChild(script);
  });
};

const clearCaptchaState = () => {
  captchaToken.value = '';
  captchaError.value = '';
};

const ensureRecaptchaWidget = async () => {
  try {
    const grecaptcha = await loadRecaptchaScript();
    const renderFn = grecaptcha?.enterprise?.render || grecaptcha?.render;
    if (!renderFn) return false;
    const containerId = 'recaptcha-widget-start';
    let el = recaptchaWidgetElStart.value;
    for (let i = 0; !el && i < 12; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      el = recaptchaWidgetElStart.value;
      if (!el) el = document.getElementById(containerId);
    }
    if (!el) {
      console.warn('[recaptcha] widget container not ready');
      return false;
    }
    // reCAPTCHA won't render into zero-size containers; wait for visibility
    for (let i = 0; i < 25 && (!el.offsetParent || el.offsetWidth < 1); i++) {
      await new Promise((r) => setTimeout(r, 80));
      el = document.getElementById(containerId) || el;
    }
    if (recaptchaWidgetId.value !== null) return true;
    const api = grecaptcha.enterprise || grecaptcha;
    // Pass container ID string per reCAPTCHA docs; more reliable than element ref
    const doRender = () => {
      recaptchaWidgetId.value = api.render(containerId, {
        sitekey: recaptchaSiteKey.value,
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
          captchaWidgetFailed.value = true;
        }
      });
    };
    const readyFn = grecaptcha.enterprise?.ready || grecaptcha?.ready;
    if (readyFn) {
      await new Promise((resolve) => readyFn(resolve));
    }
    doRender();
    return true;
  } catch (err) {
    console.warn('[recaptcha] widget init failed', err);
    return false;
  }
};

const resetRecaptchaWidget = async () => {
  clearCaptchaState();
  captchaWidgetFailed.value = false;
  try {
    const grecaptcha = await loadRecaptchaScript();
    const api = grecaptcha?.enterprise || grecaptcha;
    if (api?.reset && recaptchaWidgetId.value !== null) {
      api.reset(recaptchaWidgetId.value);
    }
  } catch {
    // ignore
  }
};

const updateRecaptchaMode = async () => {
  if (!recaptchaSiteKey.value || step.value !== -1) return;
  captchaWidgetFailed.value = false;
  showRecaptchaWidget.value = true;
  try {
    await nextTick();
    await nextTick();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));
    const rendered = await ensureRecaptchaWidget();
    if (!rendered) captchaWidgetFailed.value = true;
  } catch (err) {
    console.warn('[recaptcha] mode init failed', err);
    captchaWidgetFailed.value = true;
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
  const clientFirst = intakeForSelf.value ? guardianFirstName.value : clients.value?.[0]?.firstName;
  const clientLast = intakeForSelf.value ? guardianLastName.value : clients.value?.[0]?.lastName;
  consentErrors.clientFirstName = isJobApplication.value ? '' : (String(clientFirst || '').trim() ? '' : t('required'));
  consentErrors.clientLastName = isJobApplication.value ? '' : (String(clientLast || '').trim() ? '' : t('required'));
  consentErrors.organizationId =
    requiresOrganizationId.value && !String(organizationId.value || '').trim()
      ? t('required')
      : '';

  if (
    consentErrors.guardianFirstName
    || consentErrors.guardianEmail
    || consentErrors.guardianLastName
    || consentErrors.clientFirstName
    || consentErrors.clientLastName
    || consentErrors.organizationId
  ) {
    error.value = consentErrors.organizationId
      ? t('organizationRequired')
      : (formTypeKey.value === 'job_application' ? t('applicantRequired') : formTypeKey.value === 'medical_records_request' ? t('requesterRequired') : t('guardianRequired'));
    stepError.value = '';
    await nextTick();
    const firstMissingId = consentErrors.guardianFirstName
      ? 'guardianFirstName'
      : consentErrors.guardianEmail
        ? 'guardianEmail'
        : consentErrors.guardianLastName
          ? 'guardianLastName'
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
        guardian: {
          firstName: guardianFirstName.value,
          lastName: guardianLastName.value,
          email: guardianEmail.value,
          phone: guardianPhone.value,
          relationship: guardianRelationship.value
        },
        approval: approvalContext.value || null
      }
    };
    const resp = await api.post(`/public-intake/${publicKey}/consent`, payload);
    submissionId.value = resp.data?.submission?.id || null;
    currentFlowIndex.value = 0;
    step.value = 2;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to capture consent';
  } finally {
    consentLoading.value = false;
  }
};

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl;
  lastSignatureData.value = dataUrl;
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
      return;
    }
    if (currentDoc.value.document_action_type === 'signature' && !signatureData.value) {
      stepError.value = t('signatureRequired');
      return;
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
      error.value = t('completeRequiredFields');
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
    error.value = e.response?.data?.error?.message || t('completeRequiredFields');
  } finally {
    submitLoading.value = false;
  }
};

const completeQuestionStep = async () => {
  const missing = visibleQuestionFields.value
    .filter((f) => f.required && f.type !== 'info')
    .filter((f) => {
      const val = questionValues.value[f.key];
      if (f.type === 'checkbox') return val !== true;
      return val === null || val === undefined || String(val).trim() === '';
    });
  if (missing.length) {
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
  stepError.value = '';
  await nextFlowStep();
};

const finalizePacket = async () => {
  try {
    submitLoading.value = true;
    error.value = '';
    stepError.value = '';
    const activeSessionToken = await ensureSessionToken();
    if (!activeSessionToken) {
      error.value = t('unableToStartSession');
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
        approval: approvalContext.value || null
      }
    });
    downloadUrl.value = resp.data?.downloadUrl || '';
    clientBundleLinks.value = resp.data?.clientBundles || [];
    jobApplicationSubmitted.value = !!resp.data?.jobApplicationSubmitted;
    step.value = 3;
    localStorage.removeItem(submissionStorageKey.value);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to finalize packet';
  } finally {
    submitLoading.value = false;
  }
};

const resetIntakeState = () => {
  guardianFirstName.value = '';
  guardianLastName.value = '';
  guardianEmail.value = '';
  guardianPhone.value = '';
  guardianRelationship.value = '';
  jobApplicationSubmitted.value = false;
  signerInitials.value = '';
  clients.value = [{ firstName: '', lastName: '' }];
  intakeResponses.guardian = {};
  intakeResponses.submission = {};
  intakeResponses.clients = [{}];
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
  localStorage.removeItem(submissionStorageKey.value);
  resetIntakeState();
};

const restartIntake = () => {
  const ok = window.confirm(t('restartConfirm'));
  if (!ok) return;
  localStorage.removeItem(submissionStorageKey.value);
  resetIntakeState();
};

const endSession = () => {
  const ok = window.confirm(t('endSessionConfirm'));
  if (!ok) return;
  localStorage.removeItem(submissionStorageKey.value);
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
    return !intakeKeys.has(key);
  });
});

const questionValues = computed(() => intakeResponses.submission);

const isQuestionVisible = (field, values = {}) => {
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

watch(guardianFirstName, (val) => {
  if (String(val || '').trim()) consentErrors.guardianFirstName = '';
});
watch(guardianEmail, (val) => {
  if (String(val || '').trim()) consentErrors.guardianEmail = '';
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
  if (s.required && uploadStepFiles.value.length === 0) {
    stepError.value = 'Please select at least one file to upload.';
    return;
  }
  if (!submissionId.value) {
    stepError.value = 'Session expired. Please start over.';
    return;
  }
  try {
    submitLoading.value = true;
    stepError.value = '';
    const formData = new FormData();
    formData.append('stepId', s.id);
    formData.append('label', s.label || 'Upload');
    uploadStepFiles.value.forEach((f, i) => {
      formData.append('files', f);
    });
    await api.post(`/public-intake/${publicKey}/${submissionId.value}/upload`, formData);
    uploadStatus[s.id] = true;
    uploadStepFiles.value = [];
    await nextFlowStep();
  } catch (e) {
    stepError.value = e.response?.data?.error?.message || 'Upload failed. Please try again.';
  } finally {
    submitLoading.value = false;
  }
};

watch(currentFlowStep, (step) => {
  if (step?.type === 'upload') {
    uploadStepFiles.value = [];
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

const beginIntakeSession = async () => {
  consentLoading.value = true;
  try {
    beginError.value = '';
    if (recaptchaSiteKey.value) {
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
    localStorage.removeItem(submissionStorageKey.value);
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

onMounted(async () => {
  await loadLink();
  if (!sessionToken.value) {
    step.value = -1;
    await nextTick();
    await updateRecaptchaMode();
    return;
  }
  if (introScreens.value.length) {
    step.value = 0;
    introIndex.value = 0;
  }
  initializeFieldValues();
  await loadPdfPreview();
});
</script>

<style scoped>
.intake-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
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
  justify-content: center;
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
  box-shadow: 0 0 0 1px #dc3545;
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
