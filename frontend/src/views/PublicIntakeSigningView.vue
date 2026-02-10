<template>
  <div class="public-intake container">
    <div v-if="loading" class="loading">Loading intake link...</div>
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
      <h2>{{ link?.title || 'Digital Intake' }}</h2>
      <p v-if="link?.description" class="muted">{{ link.description }}</p>

      <div v-if="step === -1" class="step cover-step">
        <div class="cover-card">
          <div v-for="screen in introScreens" :key="screen.key" class="cover-logo">
            <img v-if="screen.logoUrl" :src="screen.logoUrl" :alt="screen.altText" />
            <div class="cover-title">{{ screen.displayName }}</div>
          </div>
          <div class="cover-subtitle">
            Begin to start a secure intake session. This link creates a unique session for each person.
          </div>
          <div class="actions">
            <button class="btn btn-primary" type="button" @click="beginIntakeSession">
              Begin intake
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
          <div class="cover-title">{{ currentIntro?.displayName || 'Welcome' }}</div>
          <div v-if="currentIntro?.subtitle" class="cover-subtitle">{{ currentIntro.subtitle }}</div>
          <div class="cover-subtitle">
            This form must be completed within 30 minutes. Each new page adds 5 minutes. The session is unique and cannot be saved or resumed.
          </div>
          <div class="actions">
            <button class="btn btn-primary" type="button" @click="advanceIntro">
              Next
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="step === 1" class="step">
        <h3>Questions</h3>
        <div v-if="stepError" class="error" style="margin-bottom: 10px;">{{ stepError }}</div>
        <div class="form-group">
          <label>Who is this intake for?</label>
          <div class="radio-group">
            <label class="radio-row">
              <input type="radio" name="intakeForSelf" :value="true" v-model="intakeForSelf" />
              <span>Myself</span>
            </label>
            <label class="radio-row">
              <input type="radio" name="intakeForSelf" :value="false" v-model="intakeForSelf" />
              <span>My dependent(s)</span>
            </label>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>{{ intakeForSelf ? 'Your first name' : 'Guardian first name' }}</label>
            <input
              id="guardianFirstName"
              v-model="guardianFirstName"
              type="text"
              :class="{ 'input-error': !!consentErrors.guardianFirstName }"
            />
            <div v-if="consentErrors.guardianFirstName" class="error-text">{{ consentErrors.guardianFirstName }}</div>
          </div>
          <div class="form-group">
            <label>{{ intakeForSelf ? 'Your last name' : 'Guardian last name' }}</label>
            <input v-model="guardianLastName" type="text" />
          </div>
          <div class="form-group">
            <label>{{ intakeForSelf ? 'Your email' : 'Guardian email' }}</label>
            <input
              id="guardianEmail"
              v-model="guardianEmail"
              type="email"
              :class="{ 'input-error': !!consentErrors.guardianEmail }"
            />
            <div v-if="consentErrors.guardianEmail" class="error-text">{{ consentErrors.guardianEmail }}</div>
          </div>
          <div class="form-group">
            <label>{{ intakeForSelf ? 'Your phone (optional)' : 'Guardian phone (optional)' }}</label>
            <input v-model="guardianPhone" type="tel" />
          </div>
          <div class="form-group">
            <label>Relationship</label>
            <input v-model="guardianRelationship" type="text" placeholder="e.g., Parent" />
          </div>
        </div>

        <div v-if="visibleGuardianFields.length" class="custom-fields">
          <h4>Guardian Questions</h4>
          <div class="form-grid">
            <div v-for="field in visibleGuardianFields" :key="field.key" class="form-group">
              <div v-if="field.type === 'info'" class="info-block">
                <div class="info-title">{{ field.label || 'Notice' }}</div>
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
                <option value="">Select an option</option>
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
          <h4>One-time Questions</h4>
          <div class="muted" style="margin-bottom: 10px;">
            These questions are asked once for the whole intake.
          </div>
          <div class="form-grid">
            <div v-for="field in visibleSubmissionFields" :key="field.key" class="form-group">
              <div v-if="field.type === 'info'" class="info-block">
                <div class="info-title">{{ field.label || 'Notice' }}</div>
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
                <option value="">Select an option</option>
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

        <div class="clients-block">
          <div class="clients-header">
            <h4>{{ intakeForSelf ? 'Client' : 'Clients' }}</h4>
          </div>
          <div v-for="(c, idx) in clients" :key="idx" class="client-card" :class="{ 'client-card-alt': idx % 2 === 1 }">
            <div class="client-card-header">
              <strong>Client {{ idx + 1 }}</strong>
              <button v-if="clients.length > 1" class="btn btn-secondary btn-sm" type="button" @click="removeClient(idx)">Remove</button>
            </div>
            <div class="form-grid">
                <div v-if="!intakeForSelf" class="form-group">
                  <label>Client first name</label>
                  <input
                    :id="`clientFirstName_${idx}`"
                    v-model="c.firstName"
                    type="text"
                    :class="{ 'input-error': idx === 0 && !!consentErrors.clientFirstName }"
                  />
                  <div v-if="idx === 0 && consentErrors.clientFirstName" class="error-text">{{ consentErrors.clientFirstName }}</div>
                </div>
                <div v-if="!intakeForSelf" class="form-group">
                  <label>Client last name</label>
                  <input
                    :id="`clientLastName_${idx}`"
                    v-model="c.lastName"
                    type="text"
                    :class="{ 'input-error': idx === 0 && !!consentErrors.clientLastName }"
                  />
                  <div v-if="idx === 0 && consentErrors.clientLastName" class="error-text">{{ consentErrors.clientLastName }}</div>
                </div>
                <div v-else class="form-group">
                  <div class="muted">Client name will use your first and last name.</div>
                </div>
              <div v-if="requiresOrganizationId" class="form-group">
                <label>Organization ID</label>
              <input id="organizationId" v-model="organizationId" type="number" :class="{ 'input-error': !!consentErrors.organizationId }" />
              <div v-if="consentErrors.organizationId" class="error-text">{{ consentErrors.organizationId }}</div>
              </div>
            </div>

            <div v-if="clientFields.length" class="custom-fields">
              <h4>Client Questions</h4>
              <div class="muted" style="margin-bottom: 10px;">
                These questions repeat for each client.
              </div>
              <div class="form-grid">
              <div v-for="field in visibleClientFields(idx)" :key="`${idx}-${field.key}`" class="form-group">
                <div v-if="field.type === 'info'" class="info-block">
                  <div class="info-title">{{ field.label || 'Notice' }}</div>
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
                  <option value="">Select an option</option>
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
            <button class="btn btn-secondary btn-sm" type="button" @click="addClient">Add another child</button>
            <div class="muted">Add another client or continue below.</div>
          </div>
        </div>

        <div v-if="visibleQuestionFields.length" class="field-inputs">
          <h4>Additional Questions</h4>
          <div v-for="field in visibleQuestionFields" :key="field.id" class="form-group" :data-question-key="field.key">
            <div v-if="field.type === 'info'" class="info-block">
              <div class="info-title">{{ field.label || 'Notice' }}</div>
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
                <option value="">Select an option</option>
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

        <div v-if="recaptchaSiteKey" class="captcha-block">
          <div class="muted">Protected by reCAPTCHA</div>
          <div v-if="captchaError" class="error">{{ captchaError }}</div>
          <div v-if="showRecaptchaWidget" class="recaptcha-widget">
            <div ref="recaptchaWidgetEl" />
            <div v-if="!captchaToken" class="muted" style="margin-top: 6px;">
              Please complete the verification above to continue.
            </div>
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
          <button class="btn btn-primary" type="button" :disabled="consentLoading" @click="submitConsent">
            {{ consentLoading ? 'Saving...' : 'I Consent and Continue' }}
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
        <h3 v-else-if="currentFlowStep?.type === 'questions'">Questions</h3>
        <div v-if="stepError" class="error" style="margin-bottom: 10px;">{{ stepError }}</div>
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
          </div>
          <div v-else class="muted">Document preview not available.</div>
        </div>

        <div v-if="currentFlowStep?.type === 'document' && requiredFieldsForList.length" class="field-inputs">
          <h4>Required Fields</h4>
          <div v-for="field in requiredFieldsForList" :key="field.id" class="form-group">
            <label>{{ field.label || field.type }}</label>
            <input
              v-if="field.type !== 'date' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio'"
              v-model="currentFieldValues[field.id]"
              :type="field.type === 'ssn' ? 'password' : 'text'"
              :placeholder="field.type === 'ssn' ? 'Enter SSN' : 'Enter value'"
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
          <div class="signature-summary">
            <div v-if="guardianDisplayName" class="summary-row">
              <strong>Guardian:</strong>
              <span>{{ guardianDisplayName }}</span>
            </div>
            <div v-if="guardianEmail" class="summary-row">
              <strong>Email:</strong>
              <span>{{ guardianEmail }}</span>
            </div>
            <div v-if="guardianRelationship" class="summary-row">
              <strong>Relationship:</strong>
              <span>{{ guardianRelationship }}</span>
            </div>
            <div v-if="clientDisplayNames.length" class="summary-row">
              <strong>Client{{ clientDisplayNames.length > 1 ? 's' : '' }}:</strong>
              <span>{{ clientDisplayNames.join(', ') }}</span>
            </div>
          </div>
          <SignaturePad @signed="onSigned" />
          <label
            v-if="allowSignatureReuseActions && lastSignatureData && !signatureData"
            class="checkbox-row signature-confirm"
          >
            <input v-model="reuseSignatureConfirmed" type="checkbox" />
            <span>I approve to sign, save, and reuse the signature.</span>
          </label>
          <div v-if="signatureData" class="muted" style="margin-top: 6px;">Signature ready for this document.</div>
        </div>

        <div v-if="pageNotice" class="page-notice">{{ pageNotice }}</div>
        <div v-if="showSkipToSignature" class="page-notice-actions">
          <button class="btn btn-primary btn-sm" type="button" @click="skipToSignaturePage">
            Skip to signature page
          </button>
          <button class="btn btn-outline btn-sm" type="button" @click="dismissSkipNotice">
            Continue reviewing pages
          </button>
        </div>

        <div class="actions">
          <button v-if="currentFlowStep?.type === 'document' && displayedFieldDefinitions.length" class="btn btn-secondary" type="button" @click="focusNextField">
            Next Field
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="submitLoading"
            @click="currentFlowStep?.type === 'document' ? completeCurrentDocument() : completeQuestionStep()"
          >
            {{ submitLoading ? 'Submitting...' : (currentFlowStep?.type === 'document' ? (currentDoc?.document_action_type === 'signature' ? 'Sign & Continue' : 'Mark Reviewed & Continue') : 'Continue') }}
          </button>
        </div>

      </div>

      <div v-else-if="step === 3" class="step">
        <h3>All Set</h3>
        <p>Your documents were completed successfully. A copy will be emailed to the guardian.</p>
        <p class="muted">Download links expire in 14 days. After that, the files are deleted once uploaded to the EHR.</p>
        <div v-if="downloadUrl" class="actions">
          <a class="btn btn-primary" :href="downloadUrl" target="_blank" rel="noopener">Download Packet PDF</a>
        </div>
        <div v-if="clientBundleLinks.length" class="bundle-list">
          <div class="bundle-title">Download per-child packets</div>
          <div v-for="bundle in clientBundleLinks" :key="bundle.clientId || bundle.filename" class="bundle-item">
            <div class="bundle-name">{{ bundle.clientName || `Client ${bundle.clientId}` }}</div>
            <a class="btn btn-secondary btn-sm" :href="bundle.downloadUrl" target="_blank" rel="noopener">Download</a>
          </div>
        </div>
        <div v-if="clients.length" class="bundle-list">
          <div class="bundle-title">Intake answers and clinical summary</div>
          <div v-for="(clientEntry, idx) in clients" :key="`intake-copy-${idx}`" class="bundle-item">
            <div class="bundle-name">
              {{ buildClientDisplayName(clientEntry, idx) }}
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="openAnswerModal(idx)">
              Intake answers
            </button>
            <button class="btn btn-secondary btn-sm" type="button" @click="openSummaryModal(idx)">
              Clinical summary
            </button>
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

  <div v-if="answerModalIndex !== null" class="modal-overlay" @click.self="closeAnswerModal">
    <div class="modal">
      <div class="modal-header">
        <strong>Intake answers</strong>
        <button class="btn btn-secondary btn-sm" type="button" @click="closeAnswerModal">Close</button>
      </div>
      <div class="modal-body">
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="copyAllAnswers">Copy all</button>
        </div>
        <div v-for="section in answerSections" :key="section.title" class="answer-section">
          <div class="answer-title">{{ section.title }}</div>
          <div v-for="line in section.lines" :key="line.key" class="answer-row">
            <div class="answer-label">{{ line.label }}</div>
            <div class="answer-value">{{ line.value }}</div>
            <button class="btn btn-secondary btn-xs" type="button" @click="copyText(`${line.label}: ${line.value}`)">
              Copy
            </button>
          </div>
          <div v-if="!section.lines.length" class="muted">No answers captured.</div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="summaryModalIndex !== null" class="modal-overlay" @click.self="closeSummaryModal">
    <div class="modal">
      <div class="modal-header">
        <strong>Clinical summary</strong>
        <button class="btn btn-secondary btn-sm" type="button" @click="closeSummaryModal">Close</button>
      </div>
      <div class="modal-body">
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="copyClinicalSummary">Copy summary</button>
        </div>
        <pre class="summary-text">{{ activeClinicalSummary }}</pre>
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

const route = useRoute();
const router = useRouter();
const publicKey = route.params.publicKey;
const authStore = useAuthStore();

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

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
const recaptchaWidgetEl = ref(null);
const recaptchaWidgetId = ref(null);
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
      .filter((s) => s?.type === 'document')
      .map((s) => {
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
const reuseSignatureConfirmed = ref(false);
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
const showSkipToSignature = ref(false);
let pageNoticeTimer = null;
const docStatus = reactive({});
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
const consentErrors = reactive({
  guardianFirstName: '',
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
  const agencyName = getDisplayName(agencyInfo.value);
  if (agencyName) {
    screens.push({
      key: 'agency',
      displayName: agencyName,
      logoUrl: resolveLogoUrl(agencyInfo.value),
      altText: `${agencyName} logo`,
      subtitle: 'Tap Next to continue'
    });
  }

  const orgName = getDisplayName(organizationInfo.value);
  if (orgName && organizationInfo.value?.id !== agencyInfo.value?.id) {
    screens.push({
      key: 'organization',
      displayName: orgName,
      logoUrl: resolveLogoUrl(organizationInfo.value),
      altText: `${orgName} logo`,
      subtitle: 'Tap Next to continue'
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
const requiresOrganizationId = computed(() => String(link.value?.scope_type || '') === 'agency');
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
const formatAnswerValue = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
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
  return String(val);
};

const buildAnswerLinesForScope = (fields, responses) =>
  (fields || [])
    .filter((field) => field?.key && field?.type !== 'info')
    .filter((field) => isIntakeFieldVisible(field, responses))
    .map((field) => {
      const value = responses?.[field.key];
      if (!hasValue(value)) return null;
      return {
        key: field.key,
        label: String(field?.label || field?.key || '').trim() || String(field?.key || '').trim(),
        value: formatAnswerValue(value)
      };
    })
    .filter(Boolean);

const buildClientDisplayName = (clientEntry, idx) => {
  const name = `${String(clientEntry?.firstName || '').trim()} ${String(clientEntry?.lastName || '').trim()}`.trim();
  if (name) return name;
  return `Client ${idx + 1}`;
};

const answerModalIndex = ref(null);
const summaryModalIndex = ref(null);

const buildIntakeAnswerSections = (clientIndex) => {
  const sections = [];
  const guardianInfo = [
    { key: 'guardian_first', label: 'Guardian first name', value: guardianFirstName.value },
    { key: 'guardian_last', label: 'Guardian last name', value: guardianLastName.value },
    { key: 'guardian_email', label: 'Guardian email', value: guardianEmail.value },
    { key: 'guardian_phone', label: 'Guardian phone', value: guardianPhone.value },
    { key: 'relationship', label: 'Relationship', value: guardianRelationship.value }
  ].filter((line) => hasValue(line.value))
    .map((line) => ({ ...line, value: formatAnswerValue(line.value) }));

  sections.push({ title: 'Guardian Information', lines: guardianInfo });

  const guardianLines = buildAnswerLinesForScope(guardianFields.value, intakeResponses.guardian || {});
  sections.push({ title: 'Guardian Questions', lines: guardianLines });

  const submissionLines = buildAnswerLinesForScope(submissionFields.value, intakeResponses.submission || {});
  sections.push({ title: 'One-Time Questions', lines: submissionLines });

  const clientLines = buildAnswerLinesForScope(
    clientFields.value,
    intakeResponses.clients?.[clientIndex] || {}
  );
  sections.push({ title: `Client ${clientIndex + 1} Questions`, lines: clientLines });
  return sections;
};

const parsePscScore = (value) => {
  if (!hasValue(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(2, Math.round(value)));
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(2, Math.round(numeric)));
  }
  const normalized = raw.toLowerCase();
  if (normalized.includes('never') || normalized.includes('not at all')) return 0;
  if (normalized.includes('sometimes') || normalized.includes('somewhat')) return 1;
  if (normalized.includes('often') || normalized.includes('very')) return 2;
  return null;
};

const summaryExcludePattern = /insurance|member id|policy|subscriber|payer|medicaid|medicare|coverage|group|plan|billing|ssn|social security|address|street|city|state|zip|postal|phone|email|contact|relationship|guardian first|guardian last|client first|client last|full name|middle name|date of birth|birthdate|dob|grade|school/i;

const buildClinicalSummaryText = (clientIndex) => {
  const sections = [];
  const clientName = buildClientDisplayName(clients.value?.[clientIndex], clientIndex);
  sections.push('Clinical Intake Summary');
  sections.push('=======================');
  sections.push(`Client: ${clientName}`);
  sections.push('');

  const clientResponses = intakeResponses.clients?.[clientIndex] || {};
  const pscItems = [];
  for (let i = 1; i <= 17; i += 1) {
    const key = `psc_${i}`;
    const raw = clientResponses?.[key];
    if (!hasValue(raw)) continue;
    const score = parsePscScore(raw);
    const field = intakeFields.value.find((f) => f?.key === key);
    const label = String(field?.label || key).trim() || key;
    pscItems.push({ index: i, label, value: formatAnswerValue(raw), score });
  }

  if (pscItems.length) {
    const attentionKeys = [1, 3, 7, 13, 17];
    const internalKeys = [2, 6, 9, 11, 15];
    const externalKeys = [4, 5, 8, 10, 12, 14, 16];
    const sumScores = (keys) =>
      keys.reduce((acc, idx) => {
        const item = pscItems.find((entry) => entry.index === idx);
        return acc + (item?.score ?? 0);
      }, 0);
    const totalScore = pscItems.reduce((acc, entry) => acc + (entry?.score ?? 0), 0);
    const answered = pscItems.filter((entry) => entry.score !== null).length;
    sections.push('PSC-17 Results');
    sections.push('--------------');
    sections.push(`Total score: ${totalScore} (${answered} of 17 answered)`);
    sections.push(`Attention: ${sumScores(attentionKeys)}`);
    sections.push(`Internalizing: ${sumScores(internalKeys)}`);
    sections.push(`Externalizing: ${sumScores(externalKeys)}`);
    sections.push('');
    sections.push('PSC-17 Item Responses');
    sections.push('---------------------');
    pscItems
      .sort((a, b) => a.index - b.index)
      .forEach((entry) => {
        const scoreLabel = entry.score === null ? 'n/a' : entry.score;
        sections.push(`${entry.index}. ${entry.label}: ${entry.value} (score ${scoreLabel})`);
      });
    sections.push('');
  }

  const clinicalLines = [
    ...buildAnswerLinesForScope(guardianFields.value, intakeResponses.guardian || {}),
    ...buildAnswerLinesForScope(submissionFields.value, intakeResponses.submission || {}),
    ...buildAnswerLinesForScope(clientFields.value, clientResponses)
  ].filter((line) => !/^psc_\d+$/i.test(line.key || ''));

  if (clinicalLines.length) {
    sections.push('Clinical Responses');
    sections.push('------------------');
    clinicalLines.forEach((line) => {
      if (summaryExcludePattern.test(line.label)) return;
      sections.push(`${line.label}: ${line.value}`);
    });
  } else if (!pscItems.length) {
    sections.push('No clinical responses captured.');
  }

  return sections.join('\n').trim();
};

const answerSections = computed(() => {
  if (answerModalIndex.value === null) return [];
  return buildIntakeAnswerSections(answerModalIndex.value);
});

const activeClinicalSummary = computed(() => {
  if (summaryModalIndex.value === null) return '';
  return buildClinicalSummaryText(summaryModalIndex.value);
});

const copyText = async (text) => {
  const value = String(text || '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
};

const copyAllAnswers = () => {
  const sections = answerSections.value || [];
  const lines = [];
  sections.forEach((section) => {
    lines.push(section.title);
    lines.push('-'.repeat(section.title.length));
    if (section.lines.length) {
      section.lines.forEach((line) => lines.push(`${line.label}: ${line.value}`));
    } else {
      lines.push('No answers captured.');
    }
    lines.push('');
  });
  copyText(lines.join('\n').trim());
};

const copyClinicalSummary = () => {
  copyText(activeClinicalSummary.value);
};

const openAnswerModal = (idx) => {
  answerModalIndex.value = idx;
};

const closeAnswerModal = () => {
  answerModalIndex.value = null;
};

const openSummaryModal = (idx) => {
  summaryModalIndex.value = idx;
};

const closeSummaryModal = () => {
  summaryModalIndex.value = null;
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
    if (recaptchaConfig.siteKey) {
      recaptchaSiteKey.value = recaptchaConfig.siteKey;
    }
    if (typeof recaptchaConfig.useEnterprise === 'boolean') {
      useEnterpriseRecaptcha.value = recaptchaConfig.useEnterprise;
    }
    console.info('[recaptcha] config', {
      hasSiteKey: !!recaptchaSiteKey.value,
      useEnterprise: useEnterpriseRecaptcha.value
    });
    await updateRecaptchaMode();
    if (!templates.value.length) {
      error.value = 'No documents configured for this intake link.';
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
      ? `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(recaptchaSiteKey.value)}`
      : `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey.value)}`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-recaptcha', 'true');
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error('Failed to load captcha'));
    document.head.appendChild(script);
  });
};

const ensureRecaptchaWidget = async () => {
  try {
    const grecaptcha = await loadRecaptchaScript();
    if (!grecaptcha?.enterprise?.render) return false;
    if (!recaptchaWidgetEl.value) return false;
    if (recaptchaWidgetId.value !== null) return true;
    recaptchaWidgetId.value = grecaptcha.enterprise.render(recaptchaWidgetEl.value, {
      sitekey: recaptchaSiteKey.value,
      callback: (token) => {
        captchaToken.value = String(token || '').trim();
        console.info('[recaptcha] widget token', { hasToken: !!captchaToken.value, length: captchaToken.value.length });
      },
      'expired-callback': () => {
        captchaToken.value = '';
      },
      'error-callback': () => {
        captchaToken.value = '';
      }
    });
    return true;
  } catch (err) {
    console.warn('[recaptcha] widget init failed', err);
    return false;
  }
};

const updateRecaptchaMode = async () => {
  if (!recaptchaSiteKey.value) return;
  try {
    const grecaptcha = await loadRecaptchaScript();
    if (!grecaptcha) return;
    const hasExecute = !!(grecaptcha.enterprise?.execute || grecaptcha.execute);
    const hasRender = !!grecaptcha.enterprise?.render;
    // Enterprise challenge/checkbox keys don't expose execute(); they require a rendered widget.
    if (useEnterpriseRecaptcha.value && !hasExecute && hasRender) {
      showRecaptchaWidget.value = true;
      await nextTick();
      await ensureRecaptchaWidget();
    }
  } catch (err) {
    console.warn('[recaptcha] mode init failed', err);
  }
};

watch(step, async (val) => {
  if (val !== 1) return;
  await nextTick();
  await updateRecaptchaMode();
});

const getRecaptchaToken = async () => {
  if (!recaptchaSiteKey.value) return '';
  try {
    const grecaptcha = await loadRecaptchaScript();
    if (!grecaptcha) return '';
    console.info('[recaptcha] availability', {
      hasEnterprise: !!grecaptcha.enterprise,
      hasEnterpriseExecute: !!grecaptcha.enterprise?.execute,
      hasEnterpriseRender: !!grecaptcha.enterprise?.render,
      hasStandardExecute: !!grecaptcha.execute
    });
    if (useEnterpriseRecaptcha.value && grecaptcha.enterprise?.execute) {
      if (grecaptcha.enterprise?.ready) {
        await new Promise((resolve) => grecaptcha.enterprise.ready(resolve));
      }
      try {
        const token = await grecaptcha.enterprise.execute(recaptchaSiteKey.value, { action: 'public_intake_consent' });
        if (token) return token;
        await new Promise((resolve) => setTimeout(resolve, 400));
        const retryToken = await grecaptcha.enterprise.execute(recaptchaSiteKey.value, { action: 'public_intake_consent' });
        if (retryToken) return retryToken;
      } catch (err) {
        console.warn('[recaptcha] enterprise execute failed', err);
      }
    }
    // Enterprise widget mode (challenge/checkbox keys): no execute() available.
    if (useEnterpriseRecaptcha.value && grecaptcha.enterprise?.render) {
      showRecaptchaWidget.value = true;
      await nextTick();
      await ensureRecaptchaWidget();
      return String(captchaToken.value || '').trim();
    }
    if (!grecaptcha?.execute) return '';
    if (grecaptcha?.ready) {
      await new Promise((resolve) => grecaptcha.ready(resolve));
    }
    return await grecaptcha.execute(recaptchaSiteKey.value, { action: 'public_intake_consent' });
  } catch (err) {
    console.warn('[recaptcha] token error', err);
    return '';
  }
};

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
  if (sessionToken.value) return sessionToken.value;
  try {
    const resp = await api.post(`/public-intake/${publicKey}/session`);
    const token = String(resp.data?.sessionToken || '').trim();
    if (!token) return '';
    sessionToken.value = token;
    await router.replace({ query: { ...route.query, session: token } });
    return token;
  } catch {
    return '';
  }
};

const submitConsent = async () => {
  consentErrors.guardianFirstName = guardianFirstName.value.trim() ? '' : 'Required';
  consentErrors.guardianEmail = guardianEmail.value.trim() ? '' : 'Required';
  const clientFirst = intakeForSelf.value ? guardianFirstName.value : clients.value?.[0]?.firstName;
  const clientLast = intakeForSelf.value ? guardianLastName.value : clients.value?.[0]?.lastName;
  consentErrors.clientFirstName = String(clientFirst || '').trim() ? '' : 'Required';
  consentErrors.clientLastName = String(clientLast || '').trim() ? '' : 'Required';
  consentErrors.organizationId =
    requiresOrganizationId.value && !String(organizationId.value || '').trim()
      ? 'Required'
      : '';

  if (
    consentErrors.guardianFirstName
    || consentErrors.guardianEmail
    || consentErrors.clientFirstName
    || consentErrors.clientLastName
    || consentErrors.organizationId
  ) {
    error.value = consentErrors.organizationId
      ? 'Organization is required.'
      : 'Guardian name and guardian email are required.';
    stepError.value = '';
    await nextTick();
    const firstMissingId = consentErrors.guardianFirstName
      ? 'guardianFirstName'
      : consentErrors.guardianEmail
        ? 'guardianEmail'
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
  if (recaptchaSiteKey.value) {
    // If we're in widget-mode, the token only exists after user interaction.
    if (showRecaptchaWidget.value) {
      const token = String(captchaToken.value || '').trim();
      console.info('[recaptcha] token', { hasToken: !!token, length: token.length });
      if (!token) {
        error.value = 'Please complete the captcha verification above.';
        captchaError.value = error.value;
        return;
      }
    } else {
      const token = await getRecaptchaToken();
      captchaToken.value = token;
      console.info('[recaptcha] token', {
        hasToken: !!token,
        length: token ? String(token).length : 0
      });
      if (!token) {
        error.value = 'Captcha verification failed. Please try again.';
        captchaError.value = error.value;
        return;
      }
    }
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
    if (recaptchaSiteKey.value) {
      payload.captchaToken = captchaToken.value || '';
    }
    const resp = await api.post(`/public-intake/${publicKey}/consent`, payload);
    submissionId.value = resp.data?.submission?.id || null;
    currentFlowIndex.value = 0;
    step.value = 2;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to capture consent';
    captchaToken.value = '';
  } finally {
    consentLoading.value = false;
  }
};

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl;
  lastSignatureData.value = dataUrl;
};

const dismissSkipNotice = () => {
  showSkipToSignature.value = false;
};

const skipToSignaturePage = () => {
  const page = signaturePageNumber.value;
  if (!page) return;
  if (pdfPreviewRef.value?.goToPage) {
    pdfPreviewRef.value.goToPage(page);
  }
  showSkipToSignature.value = false;
};

const completeCurrentDocument = async () => {
  try {
    submitLoading.value = true;
    error.value = '';
    stepError.value = '';
    if (!currentDoc.value) {
      stepError.value = 'No document selected.';
      return;
    }
    if (currentDoc.value.template_type === 'pdf' && !canProceed.value) {
      pageNotice.value = signaturePageNumber.value
        ? 'Please review all pages before continuing. You can skip to the signature page if needed.'
        : 'Please review all pages before continuing.';
      showSkipToSignature.value = !!signaturePageNumber.value;
      if (pageNoticeTimer) clearTimeout(pageNoticeTimer);
      pageNoticeTimer = setTimeout(() => {
        pageNotice.value = '';
      }, 2500);
      return;
    }
    if (currentDoc.value.document_action_type === 'signature' && !signatureData.value) {
      if (allowSignatureReuseActions.value && lastSignatureData.value) {
        if (!reuseSignatureConfirmed.value) {
          stepError.value = 'Please confirm signature reuse to continue.';
          return;
        }
        signatureData.value = lastSignatureData.value;
      } else {
        stepError.value = 'Signature is required.';
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
      error.value = 'Please complete all required fields before continuing.';
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
    error.value = e.response?.data?.error?.message || 'Failed to submit document';
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
    stepError.value = 'Please complete all required fields before continuing.';
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
    await ensureSessionToken();
    const resp = await api.post(`/public-intake/${publicKey}/${submissionId.value}/finalize`, {
      submissionId: submissionId.value,
      sessionToken: sessionToken.value || null,
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
  signerInitials.value = '';
  clients.value = [{ firstName: '', lastName: '' }];
  intakeResponses.guardian = {};
  intakeResponses.submission = {};
  intakeResponses.clients = [{}];
  signatureData.value = '';
  submissionId.value = null;
  docStatus && Object.keys(docStatus).forEach((k) => delete docStatus[k]);
  error.value = '';
  captchaError.value = '';
  captchaToken.value = '';
  currentDocIndex.value = 0;
  currentFlowIndex.value = 0;
  step.value = 1;
  Object.keys(fieldValuesByTemplate || {}).forEach((k) => delete fieldValuesByTemplate[k]);
};

const cancelIntake = () => {
  const ok = window.confirm(
    'Cancel and delete all entered information? This data will not be saved due to the sensitive nature of the intake.'
  );
  if (!ok) return;
  localStorage.removeItem(submissionStorageKey.value);
  resetIntakeState();
};

const restartIntake = () => {
  const ok = window.confirm('Restart this intake and clear all fields?');
  if (!ok) return;
  localStorage.removeItem(submissionStorageKey.value);
  resetIntakeState();
};

const endSession = () => {
  const ok = window.confirm('End this session and clear this intake from this browser?');
  if (!ok) return;
  localStorage.removeItem(submissionStorageKey.value);
  resetIntakeState();
  window.location.reload();
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
  showSkipToSignature.value = false;
};

const handlePageChange = ({ currentPage, totalPages }) => {
  reviewPage.value = currentPage || 1;
  reviewTotalPages.value = totalPages || reviewTotalPages.value;
  canProceed.value = reviewTotalPages.value > 0 && reviewPage.value >= reviewTotalPages.value;
  if (canProceed.value) {
    showSkipToSignature.value = false;
  }
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
  } else {
    await finalizePacket();
  }
};

watch(currentDoc, async () => {
  reviewPage.value = 1;
  reviewTotalPages.value = 0;
  canProceed.value = currentDoc.value?.template_type !== 'pdf';
  signatureData.value = '';
  reuseSignatureConfirmed.value = false;
  pageNotice.value = '';
  syncClientNamesToResponses();
  initializeFieldValues();
  await loadPdfPreview();
});

const beginIntakeSession = async () => {
  consentLoading.value = true;
  try {
    beginError.value = '';
    const token = await ensureSessionToken();
    if (!token) {
      beginError.value = 'Unable to start a new intake session. Please try again.';
      return;
    }
    localStorage.removeItem(submissionStorageKey.value);
    if (introScreens.value.length) {
      step.value = 0;
      introIndex.value = 0;
    } else {
      step.value = 1;
    }
    initializeFieldValues();
    await loadPdfPreview();
  } finally {
    consentLoading.value = false;
  }
};

onMounted(async () => {
  await loadLink();
  if (!sessionToken.value) {
    step.value = -1;
    return;
  }
  if (introScreens.value.length) {
    step.value = 0;
    introIndex.value = 0;
  }
  initializeFieldValues();
  await loadPdfPreview();
  if (recaptchaSiteKey.value) {
    await nextTick();
  }
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
