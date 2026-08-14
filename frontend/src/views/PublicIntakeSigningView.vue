<template>
  <DigitalFormShell
    class="public-intake ai-shell-host"
    :branding="formBranding"
    :program-title-override="shellProgramTitle"
    :form-title-override="shellFormDocumentTitle"
    :form-subtitle="shellFormSubtitle"
    :progress-steps="dfProgressSteps"
    :progress-index="dfProgressIndex"
    :intake-sidebar-steps="dfProgressSteps"
    :intake-sidebar-step-index="dfProgressIndex"
    :cover-mode="step < 1 || loading || !!fatalError"
    :hide-sidebar="isJobApplication && step === -1"
    :wide="(isJobApplication && step === -1) || (isOfficeInDepthIntake && step >= 0.5) || (!isOfficeInDepthIntake && step === 2)"
    :show-language-toggle="hasLinkedLanguageToggle && !loading && !fatalError"
    :language="currentFormLanguage"
    :language-switching="linkedLanguageSwitching"
    :language-disabled="linkedLanguageSwitching"
    :contact-phone-display="splashContactPhone"
    :contact-phone-tel="splashContactTel"
    :contact-email="splashContactEmail"
    :show-contact-support-action="showFullSplashSupport"
    :contact-support-label="t('sendAMessage')"
    :contact-compact="isOfficeInDepthIntake && showCompactSidebarContact"
    :show-intake-sidebar-security="!(isOfficeInDepthIntake && showCompactSidebarContact)"
    :intake-sidebar-max-reachable="isOfficeInDepthIntake ? maxReachedProgressIndex : 0"
    :intake-sidebar-interactive="isOfficeInDepthIntake"
    @update:language="switchLinkedLanguage"
    @contact-support="openSplashSupportModal"
    @select-step="jumpToProgressStep"
  >
    <template #header-left>
      <button
        v-if="showIntakeBackButton"
        type="button"
        class="df-btn df-btn-secondary intake-back-btn"
        @click="goBackPublicPage"
      >
        {{ t('back') }}
      </button>
    </template>
    <div v-if="loading" class="df-loading">{{ loadingText }}</div>
    <div v-else-if="fatalError" class="df-fatal error">{{ fatalError }}</div>

    <div v-else class="intake-card" :class="{ 'intake-card--job-landing': isJobApplication && step === -1 }">
      <!-- Inline recoverable error banner — form stays fully visible and Back works -->
      <div v-if="error" class="intake-inline-error-banner df-banner df-banner--warn">
        <span>{{ error }}</span>
        <button type="button" class="intake-inline-error-dismiss" @click="error = ''">&#10005;</button>
      </div>
      <button
        v-if="isSuperAdmin && !(isJobApplication && step === -1)"
        class="btn btn-secondary btn-sm dev-fill-button"
        type="button"
        @click="fillExample"
      >
        Dev Fill
      </button>
      <template v-if="!(isJobApplication && step === -1) && step >= 1 && publicFormLead">
        <p class="df-form-lead">{{ publicFormLead }}</p>
      </template>
      <div v-if="draftRestoredMessage" class="draft-restored-banner df-banner df-banner--info">{{ draftRestoredMessage }}</div>

      <div v-if="step === -1" class="step cover-step">
        <div v-if="isJobApplication" class="job-landing-shell" :style="{ '--job-landing-accent': jobLandingAccent }">
          <header class="job-landing-header">
            <div class="job-landing-brand">
              <img v-if="jobLandingLogoUrl" :src="jobLandingLogoUrl" :alt="`${jobLandingAgencyName} logo`" />
              <span>{{ jobLandingAgencyName }}</span>
            </div>
            <div class="job-landing-secure">
              <span class="job-landing-secure-icon"><JobLandingIcon name="shield" /></span>
              <span>
                <strong>{{ jobLandingSecureTitle }}</strong>
                <small>{{ jobLandingSecureSubtitle }}</small>
              </span>
            </div>
          </header>

          <main class="job-landing-hero" :class="{ 'job-landing-hero--no-image': !jobLandingHeroImageUrl }">
            <section class="job-landing-copy">
              <div v-if="jobLandingEyebrow" class="job-landing-eyebrow">
                <span><JobLandingIcon name="heart" /></span>
                {{ jobLandingEyebrow }}
              </div>
              <h1>
                <span>{{ jobLandingTitleBase }}</span>
                <span v-if="jobLandingTitleHighlight" class="job-landing-title-highlight">{{ jobLandingTitleHighlight }}</span>
              </h1>
              <div v-if="jobLandingLead" class="job-landing-lead">{{ jobLandingLead }}</div>
              <div v-if="jobLandingDescription && !jobLandingHasDescriptionSections" class="job-landing-accent"></div>
              <p v-if="jobLandingDescription && !jobLandingHasDescriptionSections" class="job-landing-description">{{ jobLandingDescription }}</p>
              <div v-if="jobLandingMetaItems.length" class="job-landing-meta">
                <span v-for="item in jobLandingMetaItems" :key="item.label" class="job-landing-meta-pill">
                  {{ item.label }}
                </span>
              </div>
            </section>
            <figure
              v-if="jobLandingHeroImageUrl"
              class="job-landing-image"
              :class="{
                'job-landing-image--preframed': jobLandingHeroFrameStyle === 'preframed',
                'job-landing-image--organic': jobLandingHeroFrameStyle === 'organic'
              }"
            >
              <div
                v-if="jobLandingShowLeafAccent && jobLandingHeroFrameStyle === 'organic'"
                class="job-landing-leaf-accent"
                aria-hidden="true"
              >
                <span></span><span></span><span></span><span></span><span></span>
              </div>
              <img
                :src="jobLandingHeroImageUrl"
                :alt="jobLandingHeroImageAlt"
                :style="{ objectPosition: jobLandingHeroImagePosition }"
              />
            </figure>
          </main>

          <section v-if="jobLandingFeatureCards.length" class="job-landing-feature-grid" aria-label="Job highlights">
            <article v-for="card in jobLandingFeatureCards" :key="`${card.title}-${card.body}`" class="job-landing-feature-card">
              <div v-if="card.icon && card.icon !== 'none'" class="job-landing-feature-icon"><JobLandingIcon :name="card.icon" /></div>
              <div class="job-landing-feature-copy">
                <h3>{{ card.title }}</h3>
                <p v-if="card.body">{{ card.body }}</p>
              </div>
            </article>
          </section>

          <section v-if="jobLandingHasDescriptionSections" class="job-landing-description-section" aria-label="Role details">
            <JobDescriptionSections
              :sections="jobDescriptionSummary.descriptionSections"
              :title="jobDescriptionSummary.title || 'Job description'"
              :summary="jobDescriptionSummary.descriptionText || ''"
              :role-type="jobDescriptionSummary.roleType || ''"
              :location="[jobDescriptionSummary.city, jobDescriptionSummary.state].filter(Boolean).join(', ')"
              :accent-color="jobLandingAccent"
              :pdf-url="jobLandingPdfUrl"
              :pdf-label="jobLandingPdfLabel"
              compact
            />
          </section>

          <section class="job-landing-start-card">
            <div class="job-landing-start-icon"><JobLandingIcon name="shield" /></div>
            <div class="job-landing-start-body">
              <h2>{{ jobLandingStartHeading }}</h2>
              <p>{{ jobLandingStartSubtitle }}</p>

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

              <button
                class="btn btn-primary job-landing-start-btn"
                type="button"
                :disabled="(requiresCaptchaAtStart && (!showRecaptchaWidget || !captchaToken)) || consentLoading"
                @click="beginIntakeSession"
              >
                <span>{{ jobLandingStartButtonText }}</span>
                <span aria-hidden="true">→</span>
              </button>
              <div v-if="jobLandingStartTimeNote" class="job-landing-start-note">
                <JobLandingIcon name="clock" />
                <span>{{ jobLandingStartTimeNote }}</span>
              </div>
              <div v-if="beginError" class="error" style="margin-top: 10px;">{{ beginError }}</div>
            </div>
          </section>

          <section v-if="jobLandingTrustItems.length" class="job-landing-trust-row" aria-label="Application details">
            <article v-for="item in jobLandingTrustItems" :key="`${item.title}-${item.body}`" class="job-landing-trust-item">
              <div v-if="item.icon && item.icon !== 'none'" class="job-landing-trust-icon"><JobLandingIcon :name="item.icon" /></div>
              <div>
                <strong>{{ item.title }}</strong>
                <small v-if="item.body">{{ item.body }}</small>
              </div>
            </article>
          </section>
        </div>

        <div v-else class="df-cover">
          <div class="df-cover-logos">
            <div v-for="screen in introScreens" :key="screen.key" class="cover-logo">
              <img v-if="screen.logoUrl" :src="screen.logoUrl" :alt="screen.altText" />
            </div>
          </div>
          <p class="df-cover-welcome">{{ t('welcome') || 'Welcome to' }}</p>
          <h1 class="df-cover-program">{{ shellProgramTitle }}</h1>
          <div class="df-heart-divider" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 21s-6.5-4.35-9.33-8.1C.5 9.9 1.1 6.2 4.2 4.7c1.9-.9 4.1-.3 5.4 1.3C10.9 4.4 13.1 3.8 15 4.7c3.1 1.5 3.7 5.2 1.53 8.2C18.5 16.65 12 21 12 21z"/></svg>
          </div>
          <p class="df-cover-lead">
            {{ publicCoverLead }}
          </p>

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

          <DigitalFormActions
            :primary-label="beginIntakeButtonText"
            :primary-disabled="(requiresCaptchaAtStart && (!showRecaptchaWidget || !captchaToken)) || consentLoading"
            :hint="t('pressEnterToContinue')"
            @primary="beginIntakeSession"
          />
          <div v-if="isSchoolScopedIntake" class="df-cover-secondary-actions">
            <button type="button" class="btn btn-secondary df-not-my-school" @click="goToSchoolReferralFinder">
              {{ t('notYourSchool') }}
            </button>
          </div>
          <div v-if="beginError" class="error" style="margin-top: 10px;">{{ beginError }}</div>
        </div>
      </div>

      <div v-else-if="step === 0" class="step cover-step">
        <div class="df-cover">
          <div class="df-cover-logos" v-if="currentIntro?.logoUrl">
            <img :src="currentIntro.logoUrl" :alt="currentIntro.altText" />
          </div>
          <div class="df-cover-program">{{ currentIntro?.displayName || t('welcome') }}</div>
          <div v-if="currentIntro?.subtitle" class="cover-subtitle">{{ currentIntro.subtitle }}</div>
          <div v-if="introIndex === 0" class="cover-subtitle">
            {{ t('formTimeLimit') }}
          </div>
          <div v-if="isJobApplication && introIndex === introScreens.length - 1 && jobDescriptionSummary" class="job-ack-card">
            <JobDescriptionSections
              v-if="jobDescriptionSummary.descriptionSections"
              :sections="jobDescriptionSummary.descriptionSections"
              :title="jobDescriptionSummary.title || 'Job description'"
              :summary="jobDescriptionSummary.descriptionText || ''"
              :role-type="jobDescriptionSummary.roleType || ''"
              :location="[jobDescriptionSummary.city, jobDescriptionSummary.state].filter(Boolean).join(', ')"
              :accent-color="jobLandingAccent || '#1a8c54'"
              :pdf-url="jobDescriptionSummary.fileUrl || ''"
              :pdf-label="jobDescriptionSummary.fileName ? `Download ${jobDescriptionSummary.fileName}` : 'Download full PDF'"
              show-header
            />
            <template v-else>
              <h4>{{ jobDescriptionSummary.title || 'Job description' }}</h4>
              <p v-if="jobDescriptionSummary.descriptionText" class="muted job-ack-text">{{ jobDescriptionSummary.descriptionText }}</p>
              <p v-if="jobDescriptionSummary.fileUrl" style="margin: 12px 0;">
                <a :href="jobDescriptionSummary.fileUrl" target="_blank" rel="noopener noreferrer">
                  Download full PDF{{ jobDescriptionSummary.fileName ? `: ${jobDescriptionSummary.fileName}` : '' }} →
                </a>
              </p>
            </template>
            <label class="checkbox-row" style="margin-top: 16px;">
              <input v-model="jobDescriptionAcknowledged" type="checkbox" />
              <span>I acknowledge that I have read and understand the job description.</span>
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

      <div v-else-if="step === 0.5 && isOfficeInDepthIntake" class="step intake-start-page">
        <div class="intake-start-card">
          <div class="ai-pathway-badge">{{ publicPacketBadge }}</div>
          <h1 class="ai-page-title">{{ t('letsGetIntakeStarted') }}</h1>
          <p class="ai-page-lead">{{ t('letsGetIntakeStartedLead') }}</p>
          <div v-if="whoForError" class="error" style="margin-bottom: 12px;">{{ whoForError }}</div>

          <div class="intake-start-grid">
            <section class="intake-start-col">
              <h2 class="intake-start-col-title">{{ t('whoIsThisForTitle') }}</h2>
              <div class="intake-who-stack">
                <button
                  type="button"
                  class="ai-pathway-card"
                  :class="{ 'ai-pathway-card--selected': intakeForSelf === true }"
                  @click="chooseWhoFor(true)"
                >
                  <span class="intake-who-icon" aria-hidden="true">👤</span>
                  <h3 class="ai-pathway-card-title">{{ t('myself') }}</h3>
                </button>
                <button
                  type="button"
                  class="ai-pathway-card"
                  :class="{ 'ai-pathway-card--selected': intakeForSelf === false }"
                  @click="chooseWhoFor(false)"
                >
                  <span class="intake-who-icon" aria-hidden="true">👨‍👩‍👧</span>
                  <h3 class="ai-pathway-card-title">{{ t('myChildDependent') }}</h3>
                </button>
              </div>
            </section>
            <section class="intake-start-col">
              <h2 class="intake-start-col-title">{{ t('whatYoullNeed') }}</h2>
              <ul class="intake-start-list">
                <li>{{ t('needContactInfo') }}</li>
                <li>{{ t('needInsurance') }}</li>
                <li>{{ t('needSchoolProvider') }}</li>
                <li>{{ t('needConcerns') }}</li>
              </ul>
            </section>
            <section class="intake-start-col">
              <h2 class="intake-start-col-title">{{ t('whatToExpect') }}</h2>
              <ul class="intake-start-list">
                <li>{{ t('expectTime') }}</li>
                <li>{{ t('expectSecure') }}</li>
                <li>{{ t('expectSaveReturn') }}</li>
              </ul>
            </section>
          </div>

          <h2 class="intake-start-basics-title">{{ t('letsStartWithBasics') }}</h2>
          <div class="form-grid intake-identity-grid">
            <div class="form-group form-group--span-4">
              <label>{{ t('yourFirstName') }} <span class="required-indicator">*</span></label>
              <input id="guardianFirstName" v-model="guardianFirstName" type="text" :class="{ 'input-error': !!consentErrors.guardianFirstName }" />
            </div>
            <div class="form-group form-group--span-4">
              <label>{{ t('yourLastName') }} <span class="required-indicator">*</span></label>
              <input id="guardianLastName" v-model="guardianLastName" type="text" :class="{ 'input-error': !!consentErrors.guardianLastName }" />
            </div>
            <div class="form-group form-group--span-4">
              <label>{{ intakeForSelf === false ? t('childDateOfBirth') : t('dateOfBirth') }} <span class="required-indicator">*</span></label>
              <input id="starterDob" v-model="starterDob" type="date" :class="{ 'input-error': !!consentErrors.starterDob }" />
            </div>
            <div class="form-group form-group--span-4">
              <label>{{ t('yourPhone') }} <span class="required-indicator">*</span></label>
              <input id="guardianPhone" v-model="guardianPhone" type="tel" :class="{ 'input-error': !!consentErrors.guardianPhone }" />
            </div>
            <div class="form-group form-group--span-8">
              <label>{{ t('yourEmail') }} <span class="required-indicator">*</span></label>
              <input id="guardianEmail" v-model="guardianEmail" type="email" :class="{ 'input-error': !!consentErrors.guardianEmail }" />
            </div>
            <div v-if="intakeForSelf === false" class="form-group form-group--span-4">
              <label>{{ t('relationship') }} <span class="required-indicator">*</span></label>
              <input id="guardianRelationship" v-model="guardianRelationship" type="text" :placeholder="t('relationshipPlaceholder')" :class="{ 'input-error': !!consentErrors.guardianRelationship }" />
            </div>
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
          :locale="intakeLocale"
          @completed="handleSmartRoiCompleted"
        />
        <SmartDisclosureFlow
          v-else-if="isSmartDisclosure"
          :public-key="publicKey"
          :session-token="sessionToken"
          :submission-id="submissionId"
          :disclosure-context="disclosureContext"
          :link="link"
          :bound-client="boundClient"
          :locale="intakeLocale"
          mode="standalone"
          @completed="handleSmartDisclosureCompleted"
        />
        <div v-else class="intake-step-body" :class="{ 'ai-layout ai-layout--help': isOfficeInDepthIntake }">
        <div :class="{ 'ai-layout-main': isOfficeInDepthIntake }">
        <div v-if="isOfficeInDepthIntake" class="ai-pathway-badge">{{ publicPacketBadge }}</div>
        <h1 v-if="isOfficeInDepthIntake" class="ai-page-title">{{ t('letsStartWithBasics') }}</h1>
        <h3 v-else class="df-section-title">{{ t('questions') || "Welcome! Let's get started" }}</h3>
        <p :class="isOfficeInDepthIntake ? 'ai-page-lead' : 'df-section-help'">{{ t('tellUsAboutYou') }}</p>
        <div v-if="stepError" class="error" style="margin-bottom: 10px;">{{ stepError }}</div>

        <div v-if="showSpanishClarificationBlock" class="spanish-clarification-step field-inputs">
          <h4>{{ spanishClarificationCopy.title }}</h4>
          <p class="muted communications-disclosure">{{ spanishClarificationCopy.intro }}</p>
          <section
            v-for="section in spanishClarificationSections"
            :key="section.key"
            class="communications-campaign-card"
            :class="{ 'required-missing-glow': spanishClarificationMissingKey === section.key }"
            :data-spanish-clarification-key="section.key"
          >
            <h4>{{ section.label }} <span class="required-indicator">*</span></h4>
            <p v-if="section.disclosure" class="communications-disclosure">{{ section.disclosure }}</p>
            <div class="radio-group">
              <label
                v-for="opt in section.options"
                :key="opt.value"
                class="radio-row"
                :class="{ 'input-error': spanishClarificationMissingKey === section.key }"
              >
                <input
                  v-model="intakeResponses.submission.spanishClarification[section.key]"
                  type="radio"
                  :value="opt.value"
                  :name="`spanish_clarification_${section.key}`"
                />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>
        </div>

        <div class="intake-section" :class="{ 'intake-card-section': isOfficeInDepthIntake }">
        <div
          v-if="!isOfficeInDepthIntake && !isMedicalRecordsRequest && !isJobApplication && !isClientBound"
        >
          <h3 class="df-section-title">{{ t('whoIsIntakeFor') }}</h3>
          <div class="df-choice-grid">
            <DigitalFormSelectionCard
              :title="t('myself')"
              :description="t('completingForMyself')"
              icon="👤"
              :selected="intakeForSelf === true"
              @select="intakeForSelf = true"
            />
            <DigitalFormSelectionCard
              :title="t('myDependents')"
              :description="t('completingForDependents')"
              icon="👨‍👩‍👧"
              :selected="intakeForSelf === false"
              @select="intakeForSelf = false"
            />
          </div>
        </div>
        <div class="form-grid intake-identity-grid">
          <div class="form-group form-group--span-4">
            <label>{{ (intakeForSelf || isMedicalRecordsRequest || isJobApplication) ? t('yourFirstName') : t('guardianFirstName') }}</label>
            <input
              id="guardianFirstName"
              v-model="guardianFirstName"
              type="text"
              :class="{ 'input-error': !!consentErrors.guardianFirstName }"
            />
            <div v-if="consentErrors.guardianFirstName" class="error-text">{{ consentErrors.guardianFirstName }}</div>
          </div>
          <div class="form-group form-group--span-4">
            <label>{{ (intakeForSelf || isMedicalRecordsRequest || isJobApplication) ? t('yourLastName') : t('guardianLastName') }}</label>
            <input
              id="guardianLastName"
              v-model="guardianLastName"
              type="text"
              :class="{ 'input-error': !!consentErrors.guardianLastName }"
            />
            <div v-if="consentErrors.guardianLastName" class="error-text">{{ consentErrors.guardianLastName }}</div>
          </div>
          <div class="form-group form-group--span-8">
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
          <div class="form-group form-group--span-4">
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
          <div v-if="isJobApplication" class="form-group form-group--span-12">
            <label>Languages spoken fluently</label>
            <input
              v-model="fluentLanguagesInput"
              type="text"
              placeholder="e.g., English, Spanish, ASL"
            />
            <div class="muted small" style="margin-top:4px;">Add comma-separated languages.</div>
          </div>
          <div v-if="!isMedicalRecordsRequest && !isJobApplication && !intakeForSelf" class="form-group form-group--span-4">
            <label>{{ t('relationship') }}</label>
            <input v-model="guardianRelationship" type="text" :placeholder="t('relationshipPlaceholder')" />
          </div>
        </div>
        </div>

        <div v-if="isClientBound && !isMedicalRecordsRequest && !isJobApplication" class="bound-client-card">
          <div class="bound-client-label">{{ t('client') }}</div>
          <div class="bound-client-name">{{ boundClientDisplayName }}</div>
          <div class="muted">{{ t('signingLinkAssigned') }}</div>
        </div>

        <div v-if="visibleGuardianFields.length" class="custom-fields intake-section">
          <h4>{{ guardianSectionTitle }}</h4>
          <div class="form-grid">
            <div v-for="field in visibleGuardianFields" :key="field.key" class="form-group" :class="intakeFieldGridSpan(field)">
              <div v-if="field.type === 'info'" class="info-block">
                <div class="info-title">{{ txField(field) || t('notice') }}</div>
                <div v-if="field.helperText" class="info-text">{{ txField(field, 'helperText') }}</div>
              </div>
              <template v-else>
              <label>
                {{ txField(field) }}
                <span v-if="field.required" class="required-indicator">*</span>
              </label>
              <div v-if="field.helperText" class="helper-text">{{ txField(field, 'helperText') }}</div>
              <div v-if="field.description" class="helper-text muted">{{ tx(field.description) }}</div>
              <input
                v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
                :type="field.type || 'text'"
                v-model="intakeResponses.guardian[field.key]"
                :required="!!field.required"
                :placeholder="txField(field, 'placeholder') || ''"
                @blur="maybeAutofillGuardianLocation(field)"
              />
              <textarea
                v-else-if="field.type === 'textarea'"
                v-model="intakeResponses.guardian[field.key]"
                :placeholder="txField(field, 'placeholder') || ''"
                rows="3"
              />
              <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                <input v-model="intakeResponses.guardian[field.key]" type="checkbox" />
                <span>{{ txField(field) }}</span>
              </label>
              <select v-else-if="field.type === 'select'" v-model="intakeResponses.guardian[field.key]" @blur="maybeAutofillGuardianLocation(field)">
                <option value="">{{ t('selectOption') }}</option>
                <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                  {{ txOption(opt) }}
                </option>
              </select>
              <div v-else-if="field.type === 'radio'" class="radio-group">
                <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                  <input type="radio" :name="`guardian_${field.key}`" :value="opt.value || opt.label" v-model="intakeResponses.guardian[field.key]" />
                  <span>{{ txOption(opt) }}</span>
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
            <div v-for="field in visibleSubmissionFields" :key="field.key" class="form-group" :class="intakeFieldGridSpan(field)">
              <div v-if="field.type === 'info'" class="info-block">
                <div class="info-title">{{ txField(field) || t('notice') }}</div>
                <div v-if="field.helperText" class="info-text">{{ txField(field, 'helperText') }}</div>
              </div>
              <template v-else>
              <label>
                {{ txField(field) }}
                <span v-if="field.required" class="required-indicator">*</span>
              </label>
              <div v-if="field.helperText" class="helper-text">{{ txField(field, 'helperText') }}</div>
              <div v-if="field.description" class="helper-text muted">{{ tx(field.description) }}</div>
              <input
                v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
                :type="field.type || 'text'"
                v-model="intakeResponses.submission[field.key]"
                :required="!!field.required"
                :placeholder="txField(field, 'placeholder') || ''"
              />
              <textarea
                v-else-if="field.type === 'textarea'"
                v-model="intakeResponses.submission[field.key]"
                :placeholder="txField(field, 'placeholder') || ''"
                rows="3"
              />
              <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                <input v-model="intakeResponses.submission[field.key]" type="checkbox" />
                <span>{{ txField(field) }}</span>
              </label>
              <select v-else-if="field.type === 'select'" v-model="intakeResponses.submission[field.key]">
                <option value="">{{ t('selectOption') }}</option>
                <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                  {{ txOption(opt) }}
                </option>
              </select>
              <div v-else-if="field.type === 'radio'" class="radio-group">
                <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                  <input type="radio" :name="`submission_${field.key}`" :value="opt.value || opt.label" v-model="intakeResponses.submission[field.key]" />
                  <span>{{ txOption(opt) }}</span>
                </label>
              </div>
              <input v-else v-model="intakeResponses.submission[field.key]" type="date" />
              </template>
            </div>
          </div>
        </div>

        <div
          v-if="!isMedicalRecordsRequest && !isJobApplication && !isClientBound && !intakeForSelf"
          class="multi-client-plan-block intake-section"
        >
          <h4 class="df-section-title">{{ t('multiClientPlanTitle') }}</h4>
          <p class="df-section-help multi-client-plan-desc">{{ t('multiClientPlanDesc') }}</p>
          <div class="df-choice-grid">
            <DigitalFormSelectionCard
              :title="t('multiClientPlanOne')"
              :description="tx('Submit information for one child today') || 'Submit information for one child today'"
              icon="🧒"
              :selected="multiClientPlanChoice === 'one'"
              @select="onSelectMultiClientPlan('one')"
            />
            <DigitalFormSelectionCard
              :title="t('multiClientPlanMultiple')"
              :description="tx('Submit for more than one child in this session') || 'Submit for more than one child in this session'"
              icon="👥"
              :selected="multiClientPlanChoice === 'multiple'"
              @select="onSelectMultiClientPlan('multiple')"
            />
          </div>

          <div
            v-if="multiClientConsentDialogOpen"
            class="multi-client-consent-panel"
            role="dialog"
            aria-live="polite"
          >
            <h4>{{ t('multiClientConsentTitle') }}</h4>
            <p>{{ t('multiClientConsentBody') }}</p>
            <ul class="multi-client-consent-bullets">
              <li>{{ t('multiClientConsentBullet1') }}</li>
              <li>{{ t('multiClientConsentBullet2') }}</li>
              <li>{{ t('multiClientConsentBullet3') }}</li>
            </ul>
            <div class="multi-client-consent-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="acceptMultiClientConsent"
              >{{ t('multiClientConsentAccept') }}</button>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                @click="declineMultiClientConsent"
              >{{ t('multiClientConsentDecline') }}</button>
            </div>
          </div>

          <div
            v-if="multiClientConsentDeclined && !multiClientConsentDialogOpen"
            class="multi-client-decline-notice"
            role="status"
            aria-live="polite"
          >
            <p>{{ t('multiClientDeclineNotice') }}</p>
            <button
              type="button"
              class="btn btn-link btn-sm"
              @click="dismissMultiClientDeclineNotice"
            >{{ t('multiClientDeclineDismiss') }}</button>
          </div>

          <div
            v-if="multiClientConsentAccepted && multiClientPlanChoice === 'multiple' && !multiClientConsentDialogOpen"
            class="multi-client-consent-confirmed muted"
            aria-live="polite"
          >
            {{ t('multiClientConsentConfirmed') }}
          </div>
        </div>

        <div v-if="!isMedicalRecordsRequest && !isJobApplication && !isClientBound && !intakeForSelf" class="clients-block intake-section">
          <div class="clients-header">
            <h4>{{ intakeForSelf ? t('client') : t('clients') }}</h4>
          </div>
          <div v-for="(c, idx) in clients" :key="idx" class="client-card" :class="{ 'client-card-alt': idx % 2 === 1 }">
            <div class="client-card-header">
              <strong>{{ intakeForSelf ? t('yourInformation') : (t('clientN') + ' ' + (idx + 1)) }}</strong>
              <button v-if="clients.length > 1" class="btn btn-secondary btn-sm" type="button" @click="removeClient(idx)">{{ t('remove') }}</button>
            </div>
            <div class="form-grid">
                <div v-if="!intakeForSelf" class="form-group form-group--span-4">
                  <label>{{ t('clientFirstName') }}</label>
                  <input
                    :id="`clientFirstName_${idx}`"
                    v-model="c.firstName"
                    type="text"
                    :class="{ 'input-error': idx === 0 && !!consentErrors.clientFirstName }"
                  />
                  <div v-if="idx === 0 && consentErrors.clientFirstName" class="error-text">{{ consentErrors.clientFirstName }}</div>
                </div>
                <div v-if="!intakeForSelf" class="form-group form-group--span-4">
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
              <div v-for="field in visibleClientFields(idx)" :key="`${idx}-${field.key}`" class="form-group" :class="intakeFieldGridSpan(field)">
                <div v-if="field.type === 'info'" class="info-block">
                  <div class="info-title">{{ txField(field) || t('notice') }}</div>
                  <div v-if="field.helperText" class="info-text">{{ txField(field, 'helperText') }}</div>
                </div>
                <template v-else>
                <label>
                  {{ txField(field) }}
                  <span v-if="field.required" class="required-indicator">*</span>
                </label>
                <div v-if="field.helperText" class="helper-text">{{ txField(field, 'helperText') }}</div>
                <div v-if="field.description" class="helper-text muted">{{ tx(field.description) }}</div>
                <input
                  v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
                  :type="field.type || 'text'"
                  v-model="intakeResponses.clients[idx][field.key]"
                  :required="!!field.required"
                  :placeholder="txField(field, 'placeholder') || ''"
                  @blur="maybeAutofillLocation(idx, field)"
                />
                <textarea
                  v-else-if="field.type === 'textarea'"
                  v-model="intakeResponses.clients[idx][field.key]"
                  :placeholder="txField(field, 'placeholder') || ''"
                  rows="3"
                />
                <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                  <input v-model="intakeResponses.clients[idx][field.key]" type="checkbox" />
                  <span>{{ txField(field) }}</span>
                </label>
                <select v-else-if="field.type === 'select'" v-model="intakeResponses.clients[idx][field.key]">
                  <option value="">{{ t('selectOption') }}</option>
                  <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                    {{ txOption(opt) }}
                  </option>
                </select>
                <div v-else-if="field.type === 'radio'" class="radio-group">
                  <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                    <input type="radio" :name="`client_${idx}_${field.key}`" :value="opt.value || opt.label" v-model="intakeResponses.clients[idx][field.key]" />
                    <span>{{ txOption(opt) }}</span>
                  </label>
                </div>
                <input v-else v-model="intakeResponses.clients[idx][field.key]" type="date" />
                </template>
              </div>
              </div>
            </div>
          </div>

          <!--
            The "Add another child" button was previously shown for every
            guardian-led intake, which let parents append sibling profiles even
            when they hadn't declared a multi-client packet up front. That path
            also repeated all of the per-client questions, confused signers,
            and created sibling records before the multi-client signature
            consent was captured. Gate the button on the multi-client plan
            selection + consent so it only appears for parents who explicitly
            opted into packaging multiple children together.
          -->
          <div
            v-if="!intakeForSelf && multiClientPlanChoice === 'multiple' && multiClientConsentAccepted"
            class="clients-footer"
          >
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              :disabled="multiClientConsentDialogOpen"
              @click="onClickAddClient"
            >{{ t('addAnotherChild') }}</button>
            <div class="muted">{{ t('addAnotherDesc') }}</div>
          </div>
        </div>

        <div v-if="visibleStandaloneQuestionFields.length" class="field-inputs">
          <h4>{{ t('additionalQuestions') }}</h4>
          <div class="form-grid">
          <div
            v-for="field in visibleStandaloneQuestionFields"
            :key="field.id"
            class="form-group"
            :class="[intakeFieldGridSpan(field), { 'required-missing-glow': isQuestionFieldMissing(field) }]"
            :data-question-key="field.key"
          >
            <div v-if="field.type === 'info'" class="info-block">
              <div class="info-title">{{ txField(field) || t('notice') }}</div>
              <div v-if="field.helperText" class="info-text">{{ txField(field, 'helperText') }}</div>
            </div>
            <template v-else>
              <label>
                {{ txField(field) }}
                <span v-if="field.required" class="required-indicator">*</span>
              </label>
              <div v-if="field.helperText" class="helper-text">{{ txField(field, 'helperText') }}</div>
              <input
                v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
                v-model="questionValues[field.key]"
                type="text"
                :placeholder="txField(field, 'placeholder') || ''"
                :class="{ 'input-error': isQuestionFieldMissing(field) }"
                @blur="maybeAutofillQuestionLocation(field)"
              />
              <textarea
                v-else-if="field.type === 'textarea'"
                v-model="questionValues[field.key]"
                rows="4"
                :placeholder="txField(field, 'placeholder') || ''"
                :class="{ 'input-error': isQuestionFieldMissing(field) }"
              ></textarea>
              <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
                <input v-model="questionValues[field.key]" type="checkbox" :class="{ 'input-error': isQuestionFieldMissing(field) }" />
                <span>{{ txField(field) }}</span>
              </label>
              <select v-else-if="field.type === 'select'" v-model="questionValues[field.key]" :class="{ 'input-error': isQuestionFieldMissing(field) }">
                <option value="">{{ t('selectOption') }}</option>
                <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                  {{ txOption(opt) }}
                </option>
              </select>
              <div v-else-if="field.type === 'radio'" class="radio-group" :class="{ 'input-error': isQuestionFieldMissing(field) }">
                <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row" :class="{ 'input-error': isQuestionFieldMissing(field) }">
                  <input type="radio" :name="`q_${field.key}`" :value="opt.value || opt.label" v-model="questionValues[field.key]" />
                  <span>{{ txOption(opt) }}</span>
                </label>
              </div>
              <input v-else v-model="questionValues[field.key]" type="date" :class="{ 'input-error': isQuestionFieldMissing(field) }" />
            </template>
          </div>
          </div>
        </div>

        <div class="consent-box">
          <strong>{{ t('esignDisclosureTitle') }}</strong>
          <p>
            {{ t('esignDisclosureBody') }}
          </p>
        </div>
        <div class="muted" style="margin-top: 8px;">
          {{ t('formIdleClearHint') }}
        </div>

        <div class="actions" :class="{ 'intake-secondary-actions': isOfficeInDepthIntake }">
          <button
            v-if="!isOfficeInDepthIntake"
            class="btn btn-primary"
            type="button"
            :disabled="consentLoading"
            @click="submitConsent"
          >
            {{ consentLoading ? t('saving') : t('iConsentContinue') }}
          </button>
          <button class="btn btn-outline" type="button" @click="cancelIntake" :disabled="consentLoading || submitLoading">
            {{ t('cancelDelete') }}
          </button>
          <button class="btn btn-outline" type="button" @click="restartIntake" :disabled="consentLoading || submitLoading">
            {{ t('restart') }}
          </button>
        </div>
        </div>
        <AdaptiveIntakeHelpPanel
          v-if="isOfficeInDepthIntake"
          class="df-desktop-only"
          :blocks="basicsHelpBlocks"
          :aria-label="t('whyWeAsk')"
        />
        </div>
      </div>

        <div v-else-if="step === 2" class="step" :class="{ 'intake-interview-page': isOfficeInDepthIntake }">
        <div :class="{ 'ai-layout ai-layout--help': isOfficeInDepthIntake }">
        <div :class="{ 'ai-layout-main': isOfficeInDepthIntake }">
        <div v-if="isOfficeInDepthIntake" class="ai-pathway-badge">{{ publicPacketBadge }}</div>
        <h1 v-if="isOfficeInDepthIntake" class="ai-page-title">{{ currentInterviewPageTitle }}</h1>
        <h3 v-else>{{ currentInterviewPageTitle }}</h3>
        <p
          v-if="currentChildBanner"
          class="intake-child-banner"
        >{{ currentChildBanner }}</p>
        <p
          v-if="currentFlowStepHelperText"
          class="ai-page-lead"
        >{{ currentFlowStepHelperText }}</p>
        <DigitalFormNotice
          v-if="showClinicalSafetyBanner"
          variant="warn"
          title="If you are in immediate danger, call 911"
          body="If you are having thoughts of suicide or feel unsafe, call or text 988. Your therapist will also be notified so this is not missed."
        />
        <div v-if="stepError" class="error" style="margin-bottom: 10px;">{{ stepError }}</div>
        <div v-if="currentFlowStep?.type === 'school_roi'" class="school-roi-step">
          <SmartSchoolRoiFlow
            :public-key="publicKey"
            :session-token="sessionToken"
            :roi-context="roiContext"
            :link="link"
            :bound-client="boundClient"
            :prefill="embeddedSmartRoiPrefill"
            :locale="intakeLocale"
            mode="embedded"
            @captured="handleEmbeddedSchoolRoiCaptured"
          />
        </div>
        <div
          v-if="currentFlowStep?.type === 'smart_disclosure' || currentFlowStep?.type === 'disclosure'"
          class="smart-disclosure-step"
        >
          <SmartDisclosureFlow
            :public-key="publicKey"
            :session-token="sessionToken"
            :submission-id="submissionId"
            :disclosure-context="disclosureContext"
            :link="link"
            :bound-client="boundClient"
            :locale="intakeLocale"
            mode="embedded"
            @captured="handleEmbeddedDisclosureCaptured"
          />
        </div>
        <div
          v-if="isPacketSectionStepType(currentFlowStep?.type)"
          class="packet-section-step"
        >
          <PacketSectionConsentFlow
            :section-context="packetSectionContextForStep(currentFlowStep)"
            :locale="intakeLocale"
            @captured="handleEmbeddedPacketSectionCaptured"
          />
        </div>
        <div v-if="currentFlowStep?.type === 'upload'" class="upload-step">
          <p class="muted">{{ tx(currentFlowStep?.label) || t('upload') }} ({{ currentFlowStep?.required ? t('required') : t('optional') }})</p>
          <div v-if="isUploadPasteEnabled" class="radio-group" style="margin-bottom: 8px;">
            <label class="radio-row">
              <input v-model="coverLetterInputMode" type="radio" value="upload" />
              <span>{{ tx('Upload file') }}</span>
            </label>
            <label class="radio-row">
              <input v-model="coverLetterInputMode" type="radio" value="paste" />
              <span>{{ tx('Paste text') }}</span>
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
              <button type="button" class="btn btn-secondary btn-xs" @click="removeUploadStepFile(i)">{{ tx('Remove') }}</button>
            </div>
          </div>
        </div>
        <div v-if="currentFlowStep?.type === 'references'" class="references-step">
          <p class="muted">{{ tx(currentFlowStep?.authorizationNotice || defaultReferencesAuthorizationNotice) }}</p>
          <div v-for="(refEntry, idx) in referencesEntries" :key="`ref_${idx}`" class="reference-card">
            <h4>{{ t('reference') }} {{ idx + 1 }}</h4>
            <div class="form-grid">
              <div class="form-group"><label>Name</label><input v-model="refEntry.name" type="text" /></div>
              <div class="form-group"><label>Relationship / Title</label><input v-model="refEntry.relationship" type="text" /></div>
              <div class="form-group"><label>Organization</label><input v-model="refEntry.organization" type="text" /></div>
              <div class="form-group"><label>Phone</label><input v-model="refEntry.phone" type="tel" /></div>
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Email<span v-if="!referencesWaived && idx < referencesRequiredCount"> (required)</span></label>
                <input v-model="refEntry.email" type="email" />
              </div>
            </div>
          </div>
          <label v-if="currentFlowStep?.waivable !== false" class="checkbox-row">
            <input v-model="referencesWaived" type="checkbox" />
            <span>{{ t('waiveProfessionalReferences') }}</span>
          </label>
          <div v-if="!referencesWaived" class="reference-consents muted">
            <label class="checkbox-row">
              <input v-model="referencesDigitalFormConsent" type="checkbox" />
              <span>
                If I am offered an interview or a job, my listed references may receive a confidential digital reference form at that time.
                I understand I will be notified when those forms are sent, when each reference is completed, and by whom.
              </span>
            </label>
            <!-- Subject to legal review: final copy must be approved by counsel before production. -->
            <label class="checkbox-row">
              <input v-model="referenceContentWaiverAcknowledged" type="checkbox" />
              <span>
                I understand reference responses are confidential and I waive any right to access the contents of those reference responses,
                subject to applicable law.
              </span>
            </label>
          </div>
        </div>
        <div v-if="currentFlowStep?.type === 'registration'" class="registration-step">
          <p v-if="currentFlowStep?.description" class="muted">{{ tx(currentFlowStep.description) }}</p>

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
                {{ tx(currentRegistrationOptions[0].summaryText) }}
              </p>
              <p v-if="currentRegistrationOptions[0].description && !currentRegistrationOptions[0].summaryText" class="reg-event-summary muted">
                {{ tx(currentRegistrationOptions[0].description) }}
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
                <strong>{{ txOption(opt) }}</strong>
                <small v-if="opt.startsAtFormatted" class="muted">📅 {{ opt.startsAtFormatted }}</small>
                <small v-else-if="opt.description" class="muted">{{ tx(opt.description) }}</small>
                <small v-if="opt.videoJoinUrl" class="muted">
                  {{ t('video') }}: <a :href="opt.videoJoinUrl" target="_blank" rel="noopener">{{ t('joinLink') }}</a>
                </small>
                <small v-if="opt.displayCost" class="muted">
                  {{ t('cost') }}: {{ opt.displayCost }}
                </small>
                <small v-if="opt.frequencyLabel" class="muted">
                  {{ tx(opt.frequencyLabel) }}
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
        </div>

        <div v-if="currentFlowStep?.type === 'guardian_waiver'" class="guardian-waiver-step">
          <PublicIntakeGuardianWaiverStep
            ref="guardianWaiverStepRef"
            :model-value="guardianWaiverBundleRef"
            :section-keys="currentGuardianWaiverSectionKeys"
            :client-labels="guardianWaiverClientLabels"
            :guardian-default-pickup="guardianDefaultPickup"
            :saved-signature-data="lastSignatureData"
            :signer-display-name="guardianDisplayNameForInsurance"
            :event-waiver-context="eventWaiverContext"
            :pulse-emergency="emergencyPulse"
            :validation-errors="guardianWaiverErrors"
            :translations="stringTranslations"
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
            :saved-signature-data="lastSignatureData"
            :validation-errors="insuranceErrors"
            @update:model-value="(v) => { intakeResponses.submission.insuranceInfo = v; clearInsuranceErrorsOnEdit(v); }"
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
            @skip-acknowledged="onPaymentSkipAcknowledged"
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
                <span>{{ t('no') }}</span>
              </label>
            </div>
          </section>

          <section class="communications-campaign-card">
            <h4>{{ communicationsSmsTitle }} <span class="required-indicator">*</span></h4>
            <p class="communications-disclosure">
              {{ communicationsSmsDisclosure }}
              {{ tx('Terms:') }} <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a>.
              {{ tx('Privacy:') }} <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_sms_preference" value="scheduling_only" v-model="communications.smsPreference" />
                <span>{{ communicationsSmsYesLabel }}</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_sms_preference" value="no" v-model="communications.smsPreference" />
                <span>{{ tx('No - Do not text me') }}</span>
              </label>
            </div>
          </section>

          <section v-if="currentFlowStep?.campaigns?.providerTexting" class="communications-campaign-card">
            <h4>{{ communicationsProviderTextingTitle }} <span class="required-indicator">*</span></h4>
            <!-- Custom intro override replaces the default intro paragraph -->
            <p v-if="communicationsProviderTextingIntro" class="communications-disclosure">
              {{ communicationsProviderTextingIntro }}
            </p>
            <template v-else>
              <p class="communications-disclosure">
                {{ tx('If you choose Yes, you consent to receive service-related text messages through PlotTwistHQ from') }}
                {{ communicationsTenantName }} and, when applicable, your provider/care team (for example,
                {{ tx('follow-up, coordination, and service-related responses). These messages are HIPAA-protected and associated with your care relationship at') }} {{ communicationsTenantName }}.
              </p>
              <p class="communications-disclosure" style="margin-top: 8px;">
                {{ tx('By selecting') }} <strong>{{ t('yes') }}</strong> {{ tx('and opting in, you understand and agree to the following:') }}
              </p>
              <ol class="communications-provider-terms">
                <li>{{ tx('These messages may be viewed by the care team associated with your provider.') }}</li>
                <li>{{ tx('Your provider and our care team are not available for emergencies, and these messages are not monitored in real time. In case of emergency, call 911.') }}</li>
                <li>{{ tx('Your provider will not receive messages outside of their working hours. All messages are confidentially stored within the platform.') }}</li>
                <li>{{ tx('PlotTwistHQ is not responsible for, nor independently aware of, the content of direct communications between you and your provider.') }}</li>
                <li>{{ tx('You agree not to share confidential third-party information in these messages, and understand that this communication channel does not replace nor constitute clinical care or a therapeutic relationship.') }}</li>
              </ol>
            </template>
            <p class="communications-disclosure" style="margin-top: 8px;">
              {{ communicationsProviderTextingClosing || (tx('Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help. Appointment reminders/confirmations are not sent from individual provider numbers. Additional terms apply —')) }}
              {{ tx('Terms:') }} <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a>.
              {{ tx('Privacy:') }} <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_provider_sms" value="yes" v-model="communications.providerTextingOptIn" />
                <span>{{ communicationsProviderTextingYesLabel }}</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_provider_sms" value="no" v-model="communications.providerTextingOptIn" />
                <span>{{ communicationsProviderTextingNoLabel }}</span>
              </label>
            </div>
            <p class="communications-disclosure communications-opt-out-note" style="margin-top: 10px;">
              <strong>{{ tx('Please note:') }}</strong> {{ tx('Your provider/care team sends these messages through PlotTwistHQ, and you receive/reply to them as standard SMS messages on your phone. If you choose to respond to or initiate a text message with your provider or care team via SMS, you acknowledge and agree that the same terms and conditions outlined above apply to that exchange. Additional terms are always available at') }}
              <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a> {{ tx('and') }}
              <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
          </section>


          <section v-if="currentFlowStep?.campaigns?.programUpdates" class="communications-campaign-card">
            <h4>{{ communicationsProgramUpdatesTitle }} <span class="required-indicator">*</span></h4>
            <p class="communications-disclosure">
              <template v-if="communicationsProgramUpdatesDisclosure">{{ communicationsProgramUpdatesDisclosure }}</template>
              <template v-else>{{ tx('If you choose Yes,') }} {{ communicationsTenantName }} {{ tx('may send optional SMS updates through PlotTwistHQ about this agency\'s programs and services (for example, openings, enrollment options, and availability). You may also receive limited updates about relevant affiliate services. Affiliates never receive access to your personal or clinical information through this update channel, and any affiliate program requires its own separate opt-in for communication and registration. Message frequency varies (no more than twice per month). Message and data rates may apply. Reply STOP to unsubscribe. Reply HELP for help.') }}</template>
              {{ tx('Terms:') }} <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a>.
              {{ tx('Privacy:') }} <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_program_sms" value="yes" v-model="communications.programUpdatesOptIn" />
                <span>{{ communicationsProgramUpdatesYesLabel }}</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_program_sms" value="no" v-model="communications.programUpdatesOptIn" />
                <span>{{ communicationsProgramUpdatesNoLabel }}</span>
              </label>
            </div>
          </section>

          <section v-if="currentFlowStep?.campaigns?.internalWorkforce" class="communications-campaign-card">
            <h4>{{ communicationsWorkforceTitle }} <span class="required-indicator">*</span></h4>
            <p class="communications-disclosure">
              <template v-if="communicationsWorkforceDisclosure">{{ communicationsWorkforceDisclosure }}</template>
              <template v-else>{{ tx('By opting in, you agree to receive SMS/text messages from') }} {{ communicationsTenantName }} {{ tx('through PlotTwistHQ for operational notifications and reminders, internal announcements, and optional polls/voting related to your participation on the platform. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help. Support: 833-756-8894 ext. 701 | hq@plottwistco.com.') }}</template>
              {{ tx('Terms:') }} <a :href="platformTermsUrl" target="_blank" rel="noopener noreferrer">{{ platformTermsUrl }}</a>.
              {{ tx('Privacy:') }} <a :href="platformPrivacyUrl" target="_blank" rel="noopener noreferrer">{{ platformPrivacyUrl }}</a>.
            </p>
            <div class="radio-group">
              <label class="radio-row">
                <input type="radio" name="communications_workforce_sms" value="yes" v-model="communications.internalWorkforceOptIn" />
                <span>{{ communicationsWorkforceYesLabel }}</span>
              </label>
              <label class="radio-row">
                <input type="radio" name="communications_workforce_sms" value="no" v-model="communications.internalWorkforceOptIn" />
                <span>{{ communicationsWorkforceNoLabel }}</span>
              </label>
            </div>
          </section>
        </div>

        <!-- Demographics step -->
        <div v-if="currentFlowStep?.type === 'demographics'" class="demographics-step">
          <p class="muted" style="margin-bottom: 16px;">
            {{ tx('Please fill in the following information so we can keep your records up to date.') }}
          </p>
          <div class="demographics-grid">
            <div v-if="currentFlowStep.showDob" class="form-group">
              <label>{{ tx('Date of Birth') }} <span class="required-indicator">*</span></label>
              <input
                type="date"
                v-model="demographicsData.dob"
                :class="{ 'input-error': demographicsErrors.dob }"
              />
              <span v-if="demographicsErrors.dob" class="field-error">{{ tx('Required') }}</span>
            </div>
            <div v-if="currentFlowStep.showGender" class="form-group">
              <label>{{ tx('Gender') }}</label>
              <select v-model="demographicsData.gender">
                <option value="">{{ tx('Prefer not to say') }}</option>
                <option value="male">{{ tx('Male') }}</option>
                <option value="female">{{ tx('Female') }}</option>
                <option value="nonbinary">{{ tx('Non-binary') }}</option>
                <option value="other">{{ tx('Other / self-describe') }}</option>
              </select>
            </div>
            <div v-if="currentFlowStep.showEthnicity" class="form-group">
              <label>{{ tx('Race / Ethnicity') }}</label>
              <select v-model="demographicsData.ethnicity">
                <option value="">{{ tx('Prefer not to say') }}</option>
                <option value="american_indian">{{ tx('American Indian or Alaska Native') }}</option>
                <option value="asian">{{ tx('Asian') }}</option>
                <option value="black">{{ tx('Black or African American') }}</option>
                <option value="hispanic">{{ tx('Hispanic or Latino') }}</option>
                <option value="nhpi">{{ tx('Native Hawaiian or Other Pacific Islander') }}</option>
                <option value="white">{{ tx('White') }}</option>
                <option value="two_or_more">{{ tx('Two or more races') }}</option>
                <option value="other">{{ tx('Other / self-describe') }}</option>
              </select>
            </div>
            <div v-if="currentFlowStep.showPreferredLanguage" class="form-group">
              <label>{{ tx('Preferred Language') }}</label>
              <select v-model="demographicsData.preferredLanguage">
                <option value="">{{ tx('Select…') }}</option>
                <option value="english">{{ tx('English') }}</option>
                <option value="spanish">{{ tx('Spanish') }}</option>
                <option value="french">{{ tx('French') }}</option>
                <option value="mandarin">{{ tx('Mandarin') }}</option>
                <option value="arabic">{{ tx('Arabic') }}</option>
                <option value="other">{{ tx('Other') }}</option>
              </select>
            </div>
            <template v-if="currentFlowStep.showAddress">
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>{{ tx('Street Address') }}</label>
                <input type="text" v-model="demographicsData.addressStreet" placeholder="123 Main St" />
              </div>
              <div class="form-group">
                <label>{{ tx('Apt / Unit (optional)') }}</label>
                <input type="text" v-model="demographicsData.addressApt" placeholder="Apt 4B" />
              </div>
              <div class="form-group">
                <label>{{ tx('Zip Code') }}</label>
                <input
                  type="text"
                  v-model="demographicsData.addressZip"
                  placeholder="80903"
                  maxlength="10"
                  @blur="autofillDemographicsLocation"
                />
              </div>
              <div class="form-group">
                <label>{{ tx('City') }}</label>
                <input type="text" v-model="demographicsData.addressCity" placeholder="Colorado Springs" />
              </div>
              <div class="form-group">
                <label>{{ tx('State') }}</label>
                <input type="text" v-model="demographicsData.addressState" placeholder="CO" maxlength="2" style="max-width: 80px;" />
              </div>
            </template>
          </div>
        </div>

        <!-- Paged interview questions — one intake_steps questions page at a time -->
        <div v-if="currentFlowStep?.type === 'questions'" class="questions-step intake-interview-page">
          <div class="form-grid">
            <template v-for="(row, idx) in currentQuestionRows" :key="row.field?.key || `sec_${idx}`">
              <h4 v-if="row.section" class="df-section-kicker form-group form-group--span-12">{{ row.section }}</h4>
              <div
                v-else-if="row.field"
                class="form-group"
                :class="[intakeFieldGridSpan(row.field), { 'required-missing-glow': isQuestionFieldMissing(row.field) }]"
                :data-question-key="row.field.key"
              >
                <IntakeQuestionField
                  :field="row.field"
                  :model-value="questionValues[row.field.key]"
                  :label="txField(row.field)"
                  :help="txField(row.field, 'helperText')"
                  :placeholder="txField(row.field, 'placeholder')"
                  :options="(row.field.options || []).map((opt) => ({ value: opt.value || opt.label, label: txOption(opt) }))"
                  :required="!!row.field.required"
                  :error="isQuestionFieldMissing(row.field)"
                  name-prefix="q_"
                  @update:model-value="(v) => { questionValues[row.field.key] = v; }"
                />
              </div>
            </template>
          </div>
        </div>

        <!-- Clinical questions step — rendered identically to regular questions but saved separately -->
        <div v-if="currentFlowStep?.type === 'clinical_questions'" class="clinical-questions-step intake-interview-page">
          <p class="muted" style="margin-bottom: 16px; font-size: 13px;">
            {{ tx('The following questions help your provider understand your needs. Your answers are confidential and only visible to your assigned provider.') }}
          </p>
          <div
            v-for="(group, gIdx) in clinicalFieldGroups"
            :key="'cg_' + gIdx"
            class="clinical-field-group"
            :class="{ 'clinical-field-group--shared': !!group.sharedHelper }"
          >
            <div v-if="group.sharedHelper" class="clinical-group-header">
              {{ tx(group.sharedHelper) }}
            </div>
            <div
              v-for="field in group.fields"
              :key="field.key || field.id"
              class="question-field-row"
              :ref="el => fieldRefs[field.key || field.id] = el"
            >
              <IntakeQuestionField
                :field="field"
                :model-value="clinicalResponses[field.key]"
                :label="txField(field)"
                :help="group.sharedHelper ? '' : txField(field, 'helperText')"
                :options="(field.options || []).map((opt) => ({ value: opt.value || opt.label, label: txOption(opt) }))"
                :required="!!field.required"
                :error="isClinicalFieldMissing(field)"
                name-prefix="cq_"
                @update:model-value="(v) => { clinicalResponses[field.key] = v; }"
              />
            </div>
          </div>
        </div>

        <div v-if="currentFlowStep?.type === 'child_review'" class="child-review-step intake-interview-page">
          <p class="df-section-help" v-if="currentChildBanner">{{ currentChildBanner }}</p>
          <div class="child-review-card">
            <h4>{{ currentChildReviewName }}</h4>
            <dl class="child-review-summary">
              <div v-for="row in currentChildReviewRows" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
            <button class="btn btn-outline btn-sm" type="button" @click="editCurrentChildIntake">
              Edit {{ currentChildReviewName }}
            </button>
          </div>
          <div class="child-review-add">
            <p class="df-section-help">Are you signing up another child?</p>
            <div
              v-if="reviewAddConsentOpen"
              class="multi-client-consent-panel"
              role="dialog"
            >
              <h4>{{ t('multiClientConsentTitle') }}</h4>
              <p>{{ t('multiClientConsentBody') }}</p>
              <ul class="multi-client-consent-bullets">
                <li>{{ t('multiClientConsentBullet1') }}</li>
                <li>{{ t('multiClientConsentBullet2') }}</li>
                <li>{{ t('multiClientConsentBullet3') }}</li>
              </ul>
              <div class="multi-client-consent-actions">
                <button type="button" class="btn btn-primary btn-sm" @click="acceptReviewAddChild">
                  {{ t('multiClientConsentAccept') }}
                </button>
                <button type="button" class="btn btn-outline btn-sm" @click="reviewAddConsentOpen = false">
                  {{ t('multiClientConsentDecline') }}
                </button>
              </div>
            </div>
            <button
              v-else
              class="btn btn-secondary"
              type="button"
              @click="addAnotherChildFromReview"
            >+ {{ t('addAnotherChild') }}</button>
            <p class="muted" style="margin-top: 8px;">
              We'll ask the same questions about this child separately so each child has their own intake and care record.
            </p>
          </div>
        </div>

        <div class="doc-nav" v-if="currentFlowStep?.type === 'document'">
          <button class="btn btn-secondary btn-sm" type="button" :disabled="currentDocIndex === 0" @click="goToPrevious">
            {{ t('previous') }}
          </button>
          <div class="doc-meta">
            {{ tx(currentDoc?.name) || t('untitled') }}
            <span v-if="docStatus[currentDoc?.id]" class="badge badge-success" style="margin-left: 8px;">{{ t('completed') }}</span>
          </div>
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            :disabled="!docStatus[currentDoc?.id]"
            :class="{ 'doc-nav-btn--pulse': navPulse }"
            @click="goToNext"
          >
            {{ t('next') }}
          </button>
        </div>
        <div
          v-if="currentFlowStep?.type !== 'school_roi' && currentFlowStep?.type !== 'smart_disclosure' && currentFlowStep?.type !== 'disclosure' && !isPacketSectionStepType(currentFlowStep?.type)"
          class="actions"
          style="margin-top: 10px;"
        >
          <button class="btn btn-outline" type="button" @click="cancelIntake" :disabled="submitLoading">
            {{ t('cancelDelete') }}
          </button>
          <button class="btn btn-outline" type="button" @click="restartIntake" :disabled="submitLoading">
            {{ t('restart') }}
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
            <p class="note">{{ t('reviewDocumentAbove') }}</p>
            <p v-if="checkboxMarkers.length && checkboxDisclaimer" class="note">
              {{ checkboxDisclaimer }}
            </p>
            <div v-if="reviewTotalPages > 1" class="page-notice-actions" style="margin-top: 12px;">
              <button class="btn btn-outline btn-sm" type="button" :class="{ 'doc-nav-btn--pulse': navPulse }" @click="skipToSignaturePage">
                {{ t('skipToSignaturePage') }}
              </button>
            </div>
          </div>
          <div v-else class="muted">{{ t('documentPreviewUnavailable') }}</div>
        </div>

        <div v-if="pageNotice" class="page-notice">{{ pageNotice }}</div>

        <div v-if="currentFlowStep?.type === 'document' && requiredFieldsForList.length" class="field-inputs">
          <h4>{{ t('requiredFields') }}</h4>
          <div v-for="field in requiredFieldsForList" :key="field.id" class="form-group">
            <label>{{ txField(field) || tx(field.type) }}</label>
            <input
              v-if="field.type !== 'date' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio'"
              v-model="currentFieldValues[field.id]"
              :type="field.type === 'ssn' ? 'password' : 'text'"
              :placeholder="field.type === 'ssn' ? t('enterSsn') : t('enterValue')"
              :data-field-id="field.id"
            />
            <label v-else-if="field.type === 'checkbox'" class="checkbox-row" :data-field-id="field.id">
              <input v-model="currentFieldValues[field.id]" type="checkbox" />
              <span>{{ txField({ ...field, label: field.label || 'I agree' }) }}</span>
            </label>
            <select
              v-else-if="field.type === 'select'"
              v-model="currentFieldValues[field.id]"
              :data-field-id="field.id"
            >
              <option value="">{{ t('selectOption') }}</option>
              <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                {{ txOption(opt) }}
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
                <span>{{ txOption(opt) }}</span>
              </label>
            </div>
            <input v-else-if="field.autoToday" v-model="currentFieldValues[field.id]" type="text" disabled />
            <input v-else v-model="currentFieldValues[field.id]" type="date" :data-field-id="field.id" />
          </div>
        </div>

        <div
          v-if="currentFlowStep?.type === 'document' && documentConsentCards.length > 1"
          class="ai-consent-list"
          style="margin: 12px 0 16px;"
        >
          <AdaptiveConsentCard
            v-for="card in documentConsentCards"
            :key="card.id"
            :title="card.title"
            :description="card.description"
            :icon="card.icon"
            :signed="!!docStatus[card.id]"
            :agreed="!!docStatus[card.id] || card.id === currentDoc?.id"
            :can-view="true"
            @view="jumpToDocumentById(card.id)"
            @update:agreed="() => jumpToDocumentById(card.id)"
          />
        </div>

        <div v-if="currentFlowStep?.type === 'document' && currentDoc?.document_action_type === 'signature'" class="signature-block" ref="signatureBlockRef" :class="{ 'signature-block--flash': signatureBlockFlash }">
          <AdaptiveSignatureCapture
            :signer-name="guardianDisplayName || ''"
            :model-value="signatureData || ''"
            :title="t('signature') || 'Digital Signature'"
            @update:model-value="onSigned"
            @signed="(payload) => onSigned(payload?.dataUrl || payload)"
          />
          <div v-if="lastSignatureData && !signatureData" class="signature-reuse-actions" style="margin-top: 12px;">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              @click="onUseSavedSignatureClick"
            >
              {{ t('useSavedSignature') }}
            </button>
          </div>
          <div v-if="signatureData" class="ai-signature-captured" style="margin-top: 6px;">✓ {{ t('signatureReady') }}</div>
          <!-- Keep SignaturePad available as fallback for environments where typed canvas fails -->
          <details class="signature-fallback" style="margin-top: 10px;">
            <summary class="muted" style="cursor: pointer; font-size: 0.85rem;">Prefer classic draw pad</summary>
            <SignaturePad compact @signed="onSigned" />
          </details>
        </div>

        <div v-if="showSavedSigPrompt" class="saved-sig-prompt">
          <p>{{ t('applySavedSignaturePrompt') }}</p>
          <div class="saved-sig-prompt-actions">
            <button type="button" class="btn btn-primary btn-sm" @click="applyPromptedSavedSignature">{{ t('yesApplySignature') }}</button>
            <button type="button" class="btn btn-outline btn-sm" @click="showSavedSigPrompt = false">{{ t('signManuallyInstead') }}</button>
          </div>
        </div>

        <div
          v-if="!isOfficeInDepthIntake && !flowStepOwnsContinue"
          class="actions"
        >
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
        <AdaptiveIntakeHelpPanel
          v-if="isOfficeInDepthIntake"
          class="df-desktop-only"
          :blocks="flowStepHelpBlocks"
          :aria-label="t('whyWeAsk')"
        />
        </div>
      </div>

      <div v-else-if="step === 3" class="step">
        <!--
          Success-page logo row. Parent feedback: "it should show the logos,
          etc" on the completion screen. We reuse the same intro-screen logos
          (agency + organization) already resolved for the cover page so
          families see something familiar after hitting submit instead of a
          bare "Successfully Submitted" line.
        -->
        <div v-if="successLogoScreens.length" class="intake-success-logos">
          <div v-for="screen in successLogoScreens" :key="'success-logo-' + screen.key" class="intake-success-logo-card">
            <img v-if="screen.logoUrl" :src="screen.logoUrl" :alt="screen.altText" />
            <div class="intake-success-logo-name">{{ screen.displayName }}</div>
          </div>
        </div>
        <h3>{{ jobApplicationSubmitted ? 'Application Submitted' : (formTypeKey === 'smart_registration' ? "You're Registered!" : 'Successfully Submitted') }}</h3>
        <p v-if="jobApplicationSubmitted">
          Thank you for your application. We have received your materials and will review them shortly.
        </p>
        <template v-else>
          <!-- Registration success card -->
          <div v-if="formTypeKey === 'smart_registration'" class="reg-success-card">
            <!--
              Top-of-card welcome banner. Parents specifically asked for this
              post-registration — they wanted to see what they registered for
              AND hear that we're excited they chose us. This block replaces
              the previously-silent transition from "filling out the form"
              to "packet downloads", which left registrants wondering whether
              anything actually went through.
            -->
            <div class="reg-thankyou-banner">
              <div class="reg-thankyou-title">
                🎉 You're all set, {{ registrationThankYouName || 'friend' }}!
              </div>
              <p class="reg-thankyou-lead">
                We are so excited you chose
                <strong>{{ registrationThankYouTenantName }}</strong>
                for <span v-if="registeredClientNames.length > 1">your children</span><span v-else>your family</span>.
                Your registration is in — we'll be in touch as soon as possible to welcome you and confirm the next steps.
              </p>
              <ul
                v-if="registeredClientNames.length"
                class="reg-thankyou-registered-for"
                aria-label="Registered"
              >
                <li v-for="name in registeredClientNames" :key="name">
                  <span class="reg-thankyou-registered-check">✓</span>
                  Registered: <strong>{{ name }}</strong>
                </li>
              </ul>
              <p v-if="registrationEmailMessageForBanner" class="reg-thankyou-email">
                {{ registrationEmailMessageForBanner }}
              </p>
            </div>

            <p
              v-if="registrationReturningAutoMatch?.matched && registrationReturningAutoMatch?.initials"
              class="reg-returning-match-notice"
              style="margin: 0 0 12px; padding: 10px 12px; background: #f0f7ff; border-radius: 8px; border: 1px solid #cfe4ff;"
            >
              We matched you to an existing profile for
              <strong>{{ registrationReturningAutoMatch.initials }}</strong>.
            </p>
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

          <!--
            Non-registration intake welcome banner. Mirrors the registration
            flow's "we're excited you chose us" messaging so every completed
            submission ends on the same warm, reassuring note instead of the
            bare "Your documents were completed successfully" line parents
            reported feeling anticlimactic.
          -->
          <div v-if="formTypeKey !== 'smart_registration'" class="intake-thankyou-banner">
            <div class="intake-thankyou-title">
              🎉 Thank you{{ intakeThankYouName ? ', ' + intakeThankYouName : '' }}!
            </div>
            <p class="intake-thankyou-lead">
              We're so glad you chose
              <strong>{{ intakeThankYouTenantName }}</strong>.
              Your submission is in — we'll follow up as soon as possible to welcome you
              and confirm the next steps.
            </p>
            <div v-if="returnToPath" class="intake-thankyou-return" style="margin: 14px 0;">
              <p class="muted" style="margin-bottom: 8px;">
                {{ returnToPath.includes('/packet/')
                  ? 'Return to your coaching onboarding packet to finish the remaining steps.'
                  : 'Return to your secure pre-hire portal (no login needed) to continue tasks or save your personal link.' }}
              </p>
              <a class="btn btn-primary" :href="returnToPath">
                {{ returnToPath.includes('/packet/') ? 'Return to your onboarding packet' : 'Return to your portal' }}
              </a>
            </div>
            <ul
              v-if="intakeRegisteredNames.length"
              class="intake-thankyou-list"
              aria-label="Submitted for"
            >
              <li v-for="name in intakeRegisteredNames" :key="name">
                <span class="intake-thankyou-check">✓</span>
                Submitted for: <strong>{{ name }}</strong>
              </li>
            </ul>
            <!--
              Registration event summary surfaced for ANY intake link that
              also enrolls the family in an event (link.company_event_id
              binding OR an interactive registration step). Previously this
              card was only rendered inside the smart_registration block,
              so school/intake+event flows showed the thank-you copy
              without any "you registered for X on Y" reassurance.
            -->
            <div v-if="registeredEventSummary" class="intake-thankyou-event">
              <div class="intake-thankyou-event-label">You're registered for:</div>
              <div class="intake-thankyou-event-title">{{ registeredEventSummary.title }}</div>
              <div v-if="registeredEventSummary.startsAtFormatted" class="intake-thankyou-event-date">
                📅 {{ registeredEventSummary.startsAtFormatted }}
              </div>
              <div
                v-if="registeredEventSummary.icalUrl || registeredEventSummary.publicEventUrl"
                class="intake-thankyou-event-actions"
              >
                <a
                  v-if="registeredEventSummary.icalUrl"
                  :href="registeredEventSummary.icalUrl"
                  download="event.ics"
                  class="btn btn-outline btn-sm"
                >
                  Add to Calendar
                </a>
                <a
                  v-if="registeredEventSummary.publicEventUrl"
                  :href="registeredEventSummary.publicEventUrl"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-outline btn-sm"
                >
                  View event page →
                </a>
              </div>
            </div>
            <p class="intake-thankyou-email">
              {{ intakeSuccessEmailMessage }}
            </p>
          </div>
        </template>

        <!--
          Download section — always rendered once we're on the success step.
          Parents reported feeling stuck staring at a blank screen while the
          packet PDF rendered (it can take a minute on big registration
          packets), so we now show the success banner immediately and just
          flip the Download buttons into a loading state until the URL is
          ready. A copy still gets emailed even if they don't wait.
        -->
        <!--
          Multi-child submissions deliberately have no combined packet —
          each child gets their own per-child bundle. Hide the
          single-bundle download panel entirely in that case so the parent
          isn't staring at a "Preparing PDF…" spinner that will never
          resolve. Use the per-child list below as the single source of
          truth instead, with a multi-child specific status header.
        -->
        <div v-if="!isMultiChildPostSubmit" class="intake-download-panel">
          <div class="intake-download-meta">
            <div v-if="downloadUrl" class="intake-download-ready-label">✓ Packet ready</div>
            <div v-else class="intake-download-preparing-label">
              <span class="preparing-spinner"></span>
              Preparing your packet… this usually takes under a minute. A copy will also be emailed to you.
            </div>
            <p v-if="downloadUrl" class="muted" style="margin: 6px 0 0;">Download links expire in 7 days.</p>
          </div>
          <div class="actions intake-download-actions">
            <a
              v-if="downloadUrl"
              class="btn btn-primary"
              :href="downloadUrl"
              target="_blank"
              rel="noopener"
            >
              {{
                formTypeKey === 'smart_school_roi'
                  ? 'View Signed ROI'
                  : (jobApplicationSubmitted ? 'View Application Copy' : 'View Packet PDF')
              }}
            </a>
            <button v-else class="btn btn-primary" type="button" disabled>
              <span class="preparing-spinner preparing-spinner--inline"></span>
              Preparing PDF…
            </button>
            <a
              v-if="downloadUrl"
              class="btn btn-secondary"
              :href="downloadUrl"
              download
            >
              {{
                formTypeKey === 'smart_school_roi'
                  ? 'Download Signed ROI'
                  : (jobApplicationSubmitted ? 'Download Application Copy' : 'Download Packet PDF')
              }}
            </a>
            <button v-else class="btn btn-secondary" type="button" disabled>
              <span class="preparing-spinner preparing-spinner--inline"></span>
              Download (preparing)
            </button>
          </div>
        </div>
        <!--
          Multi-child progressive status: shows total expected vs. ready
          and continues to spin in-place while siblings are still being
          built. Replaces the single-packet "Preparing PDF" panel above so
          parents who just submitted 2+ kids aren't confused by a spinner
          that will never resolve into a combined download.
        -->
        <div v-if="isMultiChildPostSubmit" class="multi-child-prep">
          <div v-if="!isMultiChildPacketsAllReady" class="multi-child-prep-header">
            <span class="preparing-spinner"></span>
            <span>
              Preparing {{ expectedChildCount }} packets… ({{ clientBundleLinks.length }} of {{ expectedChildCount }} ready)
              <br />
              <span class="muted small">A copy will also be emailed to you. This can take a couple of minutes for multi-child submissions.</span>
            </span>
          </div>
          <div v-else class="multi-child-prep-header multi-child-prep-header--ready">
            <span class="check-mark">✓</span>
            <span>All {{ expectedChildCount }} packets ready. Download links below expire in 7 days.</span>
          </div>
        </div>
        <div
          v-if="(isMultiChildPostSubmit || (formTypeKey === 'smart_school_roi' && clientBundleLinks.length > 1)) && (clientBundleLinks.length || isMultiChildPostSubmit) && !jobApplicationSubmitted"
          class="bundle-list"
        >
          <div class="bundle-title">{{ formTypeKey === 'smart_school_roi' ? 'Download per-client releases' : 'Download per-child packets' }}</div>
          <div v-for="bundle in clientBundleLinks" :key="bundle.clientId || bundle.filename" class="bundle-item">
            <div class="bundle-name">{{ bundle.clientName || `Client ${bundle.clientId}` }}</div>
            <a class="btn btn-secondary btn-sm" :href="bundle.downloadUrl" target="_blank" rel="noopener">View</a>
            <a class="btn btn-outline btn-sm" :href="bundle.downloadUrl" download>Download</a>
          </div>
          <!-- Pending-child placeholder rows so the parent SEES the kids
               that haven't finished bundling yet, instead of an empty list.
               Drops out automatically once that child's bundle appears. -->
          <div
            v-for="pendingName in pendingChildPlaceholders"
            :key="`pending:${pendingName}`"
            class="bundle-item bundle-item--pending"
          >
            <div class="bundle-name">{{ pendingName }}</div>
            <span class="preparing-spinner preparing-spinner--inline"></span>
            <span class="muted small">Building packet…</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" type="button" @click="endSession">
            End session
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showSplashSupportModal"
      class="splash-support-backdrop"
      @click.self="closeSplashSupportModal"
    >
      <div class="splash-support-modal" role="dialog" aria-modal="true" aria-labelledby="splash-support-title">
        <h3 id="splash-support-title">{{ t('needHelp') }}</h3>
        <p class="muted">{{ t('needHelpModalBody') }}</p>
        <form class="splash-support-form" @submit.prevent="submitSplashSupport">
          <input
            v-model="splashSupportForm.website"
            type="text"
            class="splash-support-honeypot"
            tabindex="-1"
            autocomplete="off"
            aria-hidden="true"
          />
          <label>
            Your name
            <input v-model.trim="splashSupportForm.name" type="text" required maxlength="120" />
          </label>
          <label>
            Email
            <input v-model.trim="splashSupportForm.email" type="email" required maxlength="255" />
          </label>
          <label>
            Message
            <textarea v-model.trim="splashSupportForm.message" rows="4" required maxlength="4000" />
          </label>
          <p v-if="splashSupportError" class="error">{{ splashSupportError }}</p>
          <p v-if="splashSupportSuccess" class="success">{{ splashSupportSuccess }}</p>
          <div class="splash-support-actions">
            <button type="button" class="btn btn-secondary" @click="closeSplashSupportModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="splashSupportSending">
              {{ splashSupportSending ? 'Sending…' : 'Send message' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <template #footer>
      <div v-if="showIntakePagerFooter" class="intake-pager-footer">
        <button
          type="button"
          class="df-btn df-btn-secondary intake-save-later-btn"
          @click="saveAndComeBackLater"
        >
          {{ t('saveAndComeBackLater') }}
        </button>
        <span class="intake-pager-meta">{{ intakePagerLabel }}</span>
        <button
          type="button"
          class="df-btn df-btn-primary intake-continue-btn"
          :disabled="intakePagerPrimaryDisabled"
          @click="handleIntakePagerContinue"
        >
          {{ intakePagerPrimaryLabel }}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </template>
  </DigitalFormShell>

</template>

<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import SignaturePad from '../components/SignaturePad.vue';
import JobDescriptionSections from '../components/careers/JobDescriptionSections.vue';
import SmartSchoolRoiFlow from '../components/public/SmartSchoolRoiFlow.vue';
import SmartDisclosureFlow from '../components/public/SmartDisclosureFlow.vue';
import PacketSectionConsentFlow from '../components/public/PacketSectionConsentFlow.vue';
import PDFPreview from '../components/documents/PDFPreview.vue';
import PublicIntakeGuardianWaiverStep from '../components/public-intake/PublicIntakeGuardianWaiverStep.vue';
import PublicIntakeInsuranceStep from '../components/public-intake/PublicIntakeInsuranceStep.vue';
import PublicIntakePaymentStep from '../components/public-intake/PublicIntakePaymentStep.vue';
import {
  AdaptiveConsentCard,
  AdaptiveIntakeHelpPanel,
  AdaptiveSignatureCapture
} from '../components/adaptive-intake';
import '../styles/adaptive-intake.css';
import {
  DigitalFormShell,
  DigitalFormSelectionCard,
  DigitalFormNotice,
  DigitalFormActions,
  IntakeQuestionField
} from '../components/digital-form';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { getHeroPresetByUrl } from '../utils/careersAssets.js';
import { isMedicaidInsurer } from '../utils/coloradoInsurances';
import {
  EMPTY_SPANISH_CLARIFICATION_RESPONSE,
  firstMissingSpanishClarificationField,
  SPANISH_CLARIFICATION_COPY
} from '../constants/spanishClarificationIntake.js';
import { localizePublicIntakeTitle } from '../utils/publicIntakeTitle.js';
import { publicIntakeDescription } from '../utils/publicIntakeCopy.js';
import {
  matchesShowIf,
  mergeShowIfValues,
  isCheckboxGroupField,
  isClinicalSafetyPositive,
  childAgeFlags
} from '../utils/intakeShowIf.js';
import {
  lookupStructuredIntakeTranslation,
  txFmtStructuredIntake
} from '../constants/structuredIntakeStepSpanish.js';
import { useAuthStore } from '../store/auth';
import {
  resolveSchoolOnboardingSupportEmail,
  resolveSchoolOnboardingSupportPhone
} from '../utils/schoolGroupEmailSuggestions';
import {
  buildSchoolReferralFinderPath,
  resolveHostImpliedPortalSlug
} from '../utils/orgScopedPath';
import { useBrandingStore } from '../store/branding';
import {
  spanishQuestionLabelsEnabledFromLink,
  storedSpanishFieldText,
  isActuallyTranslated
} from '../utils/intakeFieldSpanish.js';
import { groupIntakeFieldsForAdaptiveShell } from '../utils/adaptiveIntakeFieldAdapter.js';

const JOB_LANDING_ICON_PATHS = {
  school: [
    'M4 21V9l8-5 8 5v12',
    'M9 21v-6h6v6',
    'M8 11h.01M12 11h.01M16 11h.01'
  ],
  office: [
    'M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16',
    'M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01',
    'M10 21v-3h4v3'
  ],
  people: [
    'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2',
    'M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    'M21 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75'
  ],
  growth: [
    'M4 19V5',
    'M4 19h16',
    'M7 16v-4M12 16V8M17 16v-7',
    'M8 7l4-4 4 4M12 3v5'
  ],
  heart: [
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z'
  ],
  shield: [
    'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z',
    'M9 12l2 2 4-5'
  ],
  lock: [
    'M7 11V8a5 5 0 0 1 10 0v3',
    'M6 11h12v10H6z',
    'M12 15v2'
  ],
  handshake: [
    'M8 12l3-3 3 3',
    'M3 13l5 5 4-4 4 4 5-5',
    'M7 9l-4 4M17 9l4 4',
    'M11 9l2-2a3 3 0 0 1 4 0l1 1'
  ],
  star: [
    'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3z'
  ],
  clock: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    'M12 6v6l4 2'
  ]
};

const JobLandingIcon = {
  props: {
    name: { type: String, default: 'star' }
  },
  setup(props) {
    return () => {
      const key = String(props.name || '').trim().toLowerCase();
      const paths = JOB_LANDING_ICON_PATHS[key] || JOB_LANDING_ICON_PATHS.star;
      return h(
        'svg',
        {
          class: 'job-landing-icon-svg',
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false'
        },
        paths.map((d) => h('path', {
          d,
          stroke: 'currentColor',
          'stroke-width': '1.9',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        }))
      );
    };
  }
};

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
    previous: 'Previous',
    next: 'Next',
    back: '← Back',
    cancelDelete: 'Cancel & delete',
    restart: 'Restart',
    completed: 'Completed',
    untitled: 'Untitled',
    document: 'Document',
    upload: 'Upload',
    registration: 'Registration',
    guardianWaiversSafety: 'Guardian waivers & safety',
    insuranceInformation: 'Insurance information',
    paymentInformation: 'Payment information',
    communicationPreferences: 'Communication preferences',
    demographics: 'Demographics',
    clinicalQuestions: 'Clinical Questions',
    professionalReferences: 'Professional references',
    documentPreviewUnavailable: 'Document preview not available.',
    reviewDocumentAbove: 'Please review the document above. You must reach the last page before continuing.',
    requiredFields: 'Required Fields',
    signatureReady: 'Signature ready for this document.',
    applySavedSignaturePrompt: "You haven't signed this document yet. Would you like to apply your saved signature?",
    yesApplySignature: 'Yes, apply signature',
    signManuallyInstead: 'Sign manually instead',
    tapNext: 'Tap Next to continue',
    acknowledgeAndContinue: 'Acknowledge & Continue',
    introAgencySubtitle: 'Acknowledging this agency as your service provider.',
    introSchoolSubtitle: 'Acknowledging this school as your partnering organization.',
    introOrgSubtitle: 'Acknowledging this organization as your intake site.',
    questions: 'Questions',
    aboutYou: 'About You',
    tellUsAboutYou: 'Tell us a bit about you so we can prepare the right forms.',
    completingForMyself: 'I am completing this packet for myself.',
    completingForDependents: 'I am a parent or guardian submitting for my child(ren)',
    completingForSomeoneElse: 'I am a parent, guardian, or caregiver completing this for someone else.',
    someoneElse: 'Someone else',
    myChildDependent: 'My child / dependent',
    needSchoolProvider: 'School / provider details',
    continueToIntakePacket: 'Continue to Intake Packet',
    childDateOfBirth: "Child's date of birth",
    whoIsThisForTitle: 'Who is this for?',
    whoIsThisForLead: 'This helps us show the right questions and set up the right kind of account.',
    chooseWhoForToContinue: 'Please choose whether you are completing this for yourself or someone else.',
    letsStartWithBasics: "Let's start with some basics.",
    letsGetIntakeStarted: "Let's get your intake started",
    letsGetIntakeStartedLead: 'This starts a secure intake packet. We only need a few details to create your session.',
    whatYoullNeed: "What you'll need",
    needContactInfo: 'Contact information',
    needInsurance: 'Insurance card (if applicable)',
    needConcerns: 'A brief description of concerns',
    whatToExpect: 'What to expect',
    expectTime: 'About 10–15 minutes to get started',
    expectSecure: 'Secure and confidential',
    expectSaveReturn: 'Save and return anytime',
    dateOfBirth: 'Date of birth',
    yourPhone: 'Phone number',
    inDepthIntakePacket: 'In-Depth Intake Packet',
    whyWeAsk: 'Why we ask',
    whyWeAskWhoFor: 'So we can prepare the right packet — your answers stay private either way.',
    whyWeAskBasics: 'Just the essentials so we can reach you and match the right care.',
    saveAndComeBackLater: 'Save & Come Back Later',
    progressSavedComeBack: 'Progress saved on this device. Use this same link to pick up where you left off.',
    personalizedCare: 'Personalized Care',
    personalizedCareBody: 'Your answers help us match format, timing, and the right clinician.',
    privateAndSecure: 'Private & Secure',
    privateAndSecureBody: 'Your information is encrypted and only shared with your care team.',
    youreInControl: "You're in Control",
    youreInControlBody: 'You can save your progress and return later from this same link.',
    almostThere: 'Almost there',
    almostThereBody: 'A few more pages and you are done. You can save and come back anytime.',
    sectionsInThisPacket: '{count} sections in this packet',
    esignDisclosureTitle: 'ESIGN Act Disclosure',
    esignDisclosureBody: 'By continuing, you consent to electronically sign these documents and receive electronic records. You may request paper copies from the organization.',
    formIdleClearHint: 'Most families complete this in about 15 minutes. To protect your information, the form clears itself after roughly an hour of inactivity and any unsaved entries are removed.',
    sendAMessage: 'Send a message',
    needHelpSendMessage: 'Need help? Send a message',
    needHelp: 'Need help?',
    needHelpModalBody: 'Send a message to our team. We’ll follow up by email.',
    notYourSchool: 'Not your school?',
    intakeAndRegistration: 'Intake & Registration',
    schoolRoi: 'School ROI',
    signingLinkAssigned: 'This signing link is already assigned to this client.',
    releaseOfInformation: 'Release of Information',
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
    multiClientPlanTitle: 'How many children are you submitting today?',
    multiClientPlanDesc: 'Pick this now so you don\'t have to redo any answers later. You can change this anytime before submitting.',
    multiClientPlanOne: 'Just one child',
    multiClientPlanMultiple: 'Two or more children (one shared signing session)',
    multiClientConsentTitle: 'Adding another child',
    multiClientConsentBody: 'Before you add another child to this same packet, please confirm that you understand:',
    multiClientConsentBullet1: 'You will sign each form once. The same signatures and releases will apply to every child you add.',
    multiClientConsentBullet2: 'Each child will get their own signed packet, automatically filled in with that child\'s name, date of birth, and other details.',
    multiClientConsentBullet3: 'You can request changes later by contacting our office.',
    multiClientConsentAccept: 'Yes, the same signatures apply to both children',
    multiClientConsentDecline: 'No, I want to sign separately for each child',
    multiClientConsentConfirmed: 'You agreed that the signatures and releases apply to every child added here.',
    multiClientDeclineNotice: 'No problem. Please finish this child\'s packet first. You can then start a fresh packet from the same link to sign separately for the other child.',
    multiClientDeclineDismiss: 'Got it',
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
    optional: 'Optional',
    reference: 'Reference',
    waiveProfessionalReferences: 'I waive providing professional references.',
    video: 'Video',
    joinLink: 'Join link',
    cost: 'Cost',
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
      'Enroll in an individual program or service from this secure link. This is for becoming a client — not for signing up for a group class or dated event unless your provider included that here.',
    pressEnterToContinue: 'Press Enter ↵ to continue'
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
    previous: 'Anterior',
    next: 'Siguiente',
    back: '← Atrás',
    cancelDelete: 'Cancelar y eliminar',
    restart: 'Reiniciar',
    completed: 'Completado',
    untitled: 'Sin título',
    document: 'Documento',
    upload: 'Carga',
    registration: 'Registro',
    guardianWaiversSafety: 'Autorizaciones y seguridad del tutor',
    insuranceInformation: 'Información del seguro',
    paymentInformation: 'Información de pago',
    communicationPreferences: 'Preferencias de comunicación',
    demographics: 'Datos demográficos',
    clinicalQuestions: 'Preguntas clínicas',
    professionalReferences: 'Referencias profesionales',
    documentPreviewUnavailable: 'La vista previa del documento no está disponible.',
    reviewDocumentAbove: 'Revise el documento anterior. Debe llegar a la última página antes de continuar.',
    requiredFields: 'Campos requeridos',
    signatureReady: 'La firma está lista para este documento.',
    applySavedSignaturePrompt: 'Aún no ha firmado este documento. ¿Desea aplicar su firma guardada?',
    yesApplySignature: 'Sí, aplicar firma',
    signManuallyInstead: 'Firmar manualmente',
    tapNext: 'Toque Siguiente para continuar',
    acknowledgeAndContinue: 'Aceptar y continuar',
    introAgencySubtitle: 'Reconociendo a esta agencia como su proveedor de servicios.',
    introSchoolSubtitle: 'Reconociendo a esta escuela como su organización asociada.',
    introOrgSubtitle: 'Reconociendo a esta organización como su sitio de admisión.',
    questions: 'Preguntas',
    aboutYou: 'Sobre usted',
    tellUsAboutYou: 'Cuéntenos un poco sobre usted para que podamos preparar los formularios correctos.',
    completingForMyself: 'Estoy completando este paquete para mí.',
    completingForDependents: 'Soy padre, madre o tutor y lo envío para mi(s) hijo(s)',
    completingForSomeoneElse: 'Soy padre, madre, tutor o cuidador y lo completo para otra persona.',
    someoneElse: 'Otra persona',
    myChildDependent: 'Mi hijo / dependiente',
    needSchoolProvider: 'Datos de la escuela o del proveedor',
    continueToIntakePacket: 'Continuar al paquete de admisión',
    childDateOfBirth: 'Fecha de nacimiento del niño',
    whoIsThisForTitle: '¿Para quién es esto?',
    whoIsThisForLead: 'Esto nos ayuda a mostrar las preguntas correctas y preparar la cuenta adecuada.',
    chooseWhoForToContinue: 'Elija si lo completa para usted o para otra persona.',
    letsStartWithBasics: 'Empecemos con lo básico.',
    letsGetIntakeStarted: 'Empecemos su admisión',
    letsGetIntakeStartedLead: 'Esto inicia un paquete seguro. Solo necesitamos unos datos para crear su sesión.',
    whatYoullNeed: 'Qué va a necesitar',
    needContactInfo: 'Información de contacto',
    needInsurance: 'Tarjeta de seguro (si aplica)',
    needConcerns: 'Una breve descripción de sus preocupaciones',
    whatToExpect: 'Qué esperar',
    expectTime: 'Unos 10–15 minutos para comenzar',
    expectSecure: 'Seguro y confidencial',
    expectSaveReturn: 'Guarde y vuelva cuando quiera',
    dateOfBirth: 'Fecha de nacimiento',
    yourPhone: 'Número de teléfono',
    inDepthIntakePacket: 'Paquete de admisión completa',
    whyWeAsk: 'Por qué lo preguntamos',
    whyWeAskWhoFor: 'Así preparamos el paquete correcto. Sus respuestas se mantienen privadas.',
    whyWeAskBasics: 'Solo lo esencial para poder contactarle y asignar el cuidado adecuado.',
    saveAndComeBackLater: 'Guardar y volver más tarde',
    progressSavedComeBack: 'Progreso guardado en este dispositivo. Use el mismo enlace para continuar.',
    personalizedCare: 'Cuidado personalizado',
    personalizedCareBody: 'Sus respuestas nos ayudan a elegir formato, horario y el clínico adecuado.',
    privateAndSecure: 'Privado y seguro',
    privateAndSecureBody: 'Su información está cifrada y solo se comparte con su equipo de cuidado.',
    youreInControl: 'Usted tiene el control',
    youreInControlBody: 'Puede guardar su progreso y volver más tarde con el mismo enlace.',
    almostThere: 'Ya casi termina',
    almostThereBody: 'Quedan unas páginas. Puede guardar y volver cuando quiera.',
    sectionsInThisPacket: '{count} secciones en este paquete',
    esignDisclosureTitle: 'Divulgación de la Ley ESIGN',
    esignDisclosureBody: 'Al continuar, usted consiente firmar electrónicamente estos documentos y recibir registros electrónicos. Puede solicitar copias en papel a la organización.',
    formIdleClearHint: 'La mayoría de las familias completan esto en unos 15 minutos. Para proteger su información, el formulario se borra después de aproximadamente una hora de inactividad y se eliminan las entradas no guardadas.',
    sendAMessage: 'Enviar un mensaje',
    needHelpSendMessage: '¿Necesita ayuda? Enviar un mensaje',
    needHelp: '¿Necesita ayuda?',
    needHelpModalBody: 'Envíe un mensaje a nuestro equipo. Le responderemos por correo electrónico.',
    notYourSchool: '¿No es su escuela?',
    intakeAndRegistration: 'Admisión y registro',
    schoolRoi: 'Autorización escolar (ROI)',
    signingLinkAssigned: 'Este enlace de firma ya está asignado a este cliente.',
    releaseOfInformation: 'Autorización de divulgación de información',
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
    multiClientPlanTitle: '¿Cuántos niños va a inscribir hoy?',
    multiClientPlanDesc: 'Elija ahora para no tener que volver a llenar las respuestas más tarde. Puede cambiar esto en cualquier momento antes de enviar.',
    multiClientPlanOne: 'Solo un niño',
    multiClientPlanMultiple: 'Dos o más niños (una sola sesión de firma compartida)',
    multiClientConsentTitle: 'Agregar otro niño',
    multiClientConsentBody: 'Antes de agregar otro niño al mismo paquete, confirme que entiende:',
    multiClientConsentBullet1: 'Firmará cada formulario una sola vez. Las mismas firmas y autorizaciones se aplicarán a cada niño que agregue.',
    multiClientConsentBullet2: 'Cada niño recibirá su propio paquete firmado, completado automáticamente con su nombre, fecha de nacimiento y otros datos.',
    multiClientConsentBullet3: 'Puede solicitar cambios más adelante comunicándose con nuestra oficina.',
    multiClientConsentAccept: 'Sí, las mismas firmas se aplican a ambos niños',
    multiClientConsentDecline: 'No, quiero firmar por separado para cada niño',
    multiClientConsentConfirmed: 'Usted aceptó que las firmas y autorizaciones se aplican a todos los niños agregados aquí.',
    multiClientDeclineNotice: 'No hay problema. Termine primero el paquete de este niño. Luego puede iniciar un paquete nuevo desde el mismo enlace para firmar por separado para el otro niño.',
    multiClientDeclineDismiss: 'Entendido',
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
    optional: 'Opcional',
    reference: 'Referencia',
    waiveProfessionalReferences: 'Renuncio a proporcionar referencias profesionales.',
    video: 'Video',
    joinLink: 'Enlace para unirse',
    cost: 'Costo',
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
    dailyLimitReached: 'Se alcanzó el límite diario de inicio de admisión. Por favor intente mañana.',
    pressEnterToContinue: 'Presione Enter ↵ para continuar'
  }
};

const route = useRoute();
const router = useRouter();
const publicKey = route.params.publicKey;
const returnToPath = computed(() => {
  const raw = String(route.query.returnTo || '').trim();
  if (!raw.startsWith('/')) return '';
  // Only allow same-origin relative paths (no protocol / open redirect)
  if (raw.includes('://') || raw.includes('//')) return '';
  // Pre-hire portal return OR practitioner packet wizard return
  if (raw.startsWith('/pre-hire/')) return raw;
  if (/^\/[^/]+\/packet\/[A-Za-z0-9_-]+/.test(raw)) return raw;
  return '';
});
// Back-compat alias used by thank-you CTA
const prehireReturnTo = returnToPath;
const isLocalhostRecaptcha = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const LOCALHOST_TEST_RECAPTCHA_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
const authStore = useAuthStore();
// Keep link initialized before any computed/translation helpers that read link.value.
// Prevents TDZ crashes in production minified bundles.
const link = ref(null);
const step = ref(1);
const inPageLocale = ref('en');
const intakeSteps = computed(() =>
  Array.isArray(link.value?.intake_steps) ? link.value.intake_steps : []
);
const hasDocumentTranslationMap = computed(() => {
  const map = link.value?.document_translation_map;
  return map != null && typeof map === 'object' && Object.keys(map).length > 0;
});

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const linkedLanguageSwitching = ref(false);

const spanishQuestionLabelsEnabled = computed(() => spanishQuestionLabelsEnabledFromLink(link.value));

/** Agency-published EN/ES masters overlay this school shell — do not live-translate. */
const usesSchoolMaster = computed(() => {
  const l = link.value;
  if (!l) return false;
  if (Number(l.master_form_id || 0) > 0) return true;
  if (Number(l.inherits_school_master || 0) === 1) return true;
  if (l.has_spanish_master === true) return true;
  return false;
});

/** In-page EN/ES switch for document maps and/or admin-saved question labels. */
const hasInPageSpanish = computed(
  () =>
    usesSchoolMaster.value
    || hasDocumentTranslationMap.value
    || spanishQuestionLabelsEnabled.value
    || String(link.value?.form_type || '').toLowerCase() === 'smart_school_roi'
);

const currentFormLanguage = computed(() => {
  if (hasInPageSpanish.value) return inPageLocale.value === 'es' ? 'es' : 'en';
  const code = String(link.value?.language_code || 'en').toLowerCase();
  return code.startsWith('es') ? 'es' : 'en';
});

const linkedLanguageEnglishPublicKey = ref('');

/**
 * Content-addressed translation cache for all inline strings (field labels,
 * descriptions, option text, waiver headings, etc.) that live as JSON inside
 * intake_fields and cannot be addressed via the row-based translations API.
 * keyed by original English text → translated text.
 */
const stringTranslations = ref({});
const stringTranslationsLoading = ref(false);
let stringTranslationRequestId = 0;
const stringTranslationCache = new Map();

// Provide the translation map to all child components (insurance, waiver, etc.)
// so they can translate their own hardcoded strings without prop-drilling.
provide('intakeStringTranslations', stringTranslations);

/** Look up a translated string; returns original if no translation found. */
const tx = (text) => {
  const s = String(text || '');
  if (intakeLocale.value !== 'es') return s;
  return lookupStructuredIntakeTranslation(s, stringTranslations.value);
};

const txFmt = (template, vars = {}) =>
  txFmtStructuredIntake(template, vars, stringTranslations.value, intakeLocale.value);

/** Question label / helper with admin-saved Spanish overrides when enabled. */
const interpolateChildTokens = (str, clientIndex = currentFlowStep.value?.clientIndex) => {
  const name = childDisplayName(clientIndex);
  return String(str || '')
    .replaceAll('{childName}', name)
    .replaceAll('[Child Name]', name);
};

const txField = (field, prop = 'label') => {
  if (!field) return '';
  const stored = storedSpanishFieldText(
    field,
    prop,
    intakeLocale.value,
    spanishQuestionLabelsEnabled.value
  );
  if (stored) return interpolateChildTokens(stored);
  const en =
    prop === 'label' ? String(field.label || field.key || '').trim() : String(field[prop] || '').trim();
  return interpolateChildTokens(tx(en));
};

const txOption = (opt) => {
  if (!opt) return '';
  const stored = String(opt.labelEs || '').trim();
  const en = String(opt.label || opt.value || '').trim();
  if (stored && intakeLocale.value === 'es' && spanishQuestionLabelsEnabled.value && isActuallyTranslated(stored, en)) return stored;
  return tx(en);
};

/**
 * Collect every string that needs translating from the form's intake fields
 * plus static waiver labels and ESIGN text, then batch-translate them all.
 */
async function fetchStringTranslations() {
  const l = link.value;
  const schoolIntakeShell = String(l?.scope_type || '').toLowerCase() === 'school'
    && String(l?.form_type || 'intake').toLowerCase() === 'intake';
  if (usesSchoolMaster.value || schoolIntakeShell) {
    stringTranslationRequestId += 1;
    stringTranslations.value = {};
    return;
  }
  if (intakeLocale.value !== 'es') {
    stringTranslationRequestId += 1;
    stringTranslations.value = {};
    return;
  }
  try {
    const strings = new Set();
    const addString = (value) => {
      const text = String(value || '').trim();
      if (text) strings.add(text);
    };
    const collectDynamicStrings = (value) => {
      if (!value) return;
      if (typeof value === 'string') return;
      if (Array.isArray(value)) {
        for (const item of value) collectDynamicStrings(item);
        return;
      }
      if (typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (['label', 'title', 'description', 'helperText', 'placeholder', 'summaryText', 'authorizationNotice'].includes(key)) {
          addString(child);
        } else if (key === 'options' || key === 'fields' || key === 'groups' || key === 'steps') {
          collectDynamicStrings(child);
        } else if (child && typeof child === 'object') {
          collectDynamicStrings(child);
        }
      }
    };

    // Intake fields (guardian, client, submission scopes).
    addString(link.value?.title);
    addString(link.value?.description);
    const fields = Array.isArray(link.value?.intake_fields) ? link.value.intake_fields : [];
    const useStored = spanishQuestionLabelsEnabled.value;
    for (const f of fields) {
      if (f?.label && !(useStored && isActuallyTranslated(f.labelEs, f.label))) addString(f.label);
      if (f?.description && !(useStored && isActuallyTranslated(f.descriptionEs, f.description))) addString(f.description);
      if (f?.placeholder && !(useStored && isActuallyTranslated(f.placeholderEs, f.placeholder))) addString(f.placeholder);
      if (f?.helperText && !(useStored && isActuallyTranslated(f.helperTextEs, f.helperText))) addString(f.helperText);
      if (Array.isArray(f?.options)) {
        for (const opt of f.options) {
          const optEn = String(opt?.label || opt?.value || '').trim();
          if (opt?.label && !(useStored && isActuallyTranslated(opt.labelEs, optEn))) addString(opt.label);
          if (opt?.value && typeof opt.value === 'string') addString(opt.value);
        }
      }
    }
    collectDynamicStrings(link.value?.intake_steps);

    // Guardian waiver section headings and blurbs.
    const waiverStrings = [
      'Pickup authorization',
      'Walk-home authorization',
      'Emergency contacts',
      'Medical information & allergies',
      'Meals',
      'Use this section ONLY if you authorize your child to walk home alone after this program.',
      'People we may contact if we cannot reach you.',
      'This program does not provide meals. Please plan to bring your own lunch or snacks as needed.',
      'ESIGN Act Disclosure',
      'Most families complete this in about 15 minutes. To protect your information, the form clears itself after roughly an hour of inactivity and any unsaved entries are removed.',
      'The following questions help your provider understand your needs. Your answers are confidential and only visible to your assigned provider.',
      'I agree',
    ];
    for (const l of waiverStrings) strings.add(l);

    // ESIGN disclosure.
    strings.add('ESIGN Act Disclosure');
    strings.add('By continuing, you consent to electronically sign these documents and receive electronic records. You may request paper copies from the organization.');

    // Insurance step strings.
    const insuranceStrings = [
      'I am self-pay',
      '— I don\'t have insurance to bill, or I prefer to pay out of pocket.',
      'Thanks! We\'ll record this as self-pay. You can skip the insurance carrier / member ID fields below and proceed to sign the authorization at the bottom of this page.',
      'Primary Insurance', 'Secondary Insurance',
      'Start by uploading your insurance card images. We will auto-fill what we can, and you can edit anything below.',
      'Insurance Carrier Name',
      'Start typing to search (e.g. Health First Colorado, Aetna…)',
      'Start typing to search…',
      '✓ Medicaid detected — no self-pay cost applies for this program.',
      'If the child has other primary insurance, list that other plan as Primary and add Medicaid under Secondary.',
      'Use My Name', 'Use Guardian Name', 'Use Client 1 Name',
      'Insurance card – front', 'Insurance card – back',
      'Tap to take photo or upload', 'Tap to upload', 'Remove',
      'I do not have my primary insurance card right now',
      'Subscriber Name', 'Child name', 'Parent / Guardian name',
      'For Medicaid-only coverage, this is usually the child.',
      'For private/commercial plans, this is usually the parent/guardian policy holder.',
      'Subscriber ID / Member ID',
      'For Medicaid plans, Member ID is recommended but not required.',
      'Group number (if applicable)', 'Group number',
      'Patient suffix', 'Optional', 'Common on private/commercial plans.',
      'Per-Client Medicaid Member IDs', 'Medicaid Member ID',
      'Enter this client\'s Medicaid ID',
      "Since this intake includes multiple clients, capture each child's Medicaid Member ID so billing is stored correctly per client.",
      'I have secondary insurance to add',
      'This is often where Medicaid is listed when the child also has other primary coverage. TRICARE is generally primary over Medicaid when both are present.',
      'Member ID', 'Subscriber name',
      'Secondary card – front', 'Secondary card – back',
      'Responsible Party (Guarantor)', 'Name: Parent/Guardian',
      'Contact info: captured earlier in intake and used for billing/consent communications.',
      'Please note: Not all insurances are accepted by all providers. If this program or class is not covered by your insurance, we may still submit a claim to your insurer in the event coverage has changed. All payments collected via our web application will be listed as collected outside of our EHR platform and applied to billing claims as necessary. Medicaid (Health First Colorado) clients are enrolled at no cost to the family for eligible programs.',
      'Insurance Authorization & Assignment of Benefits',
      'I authorize', 'to release information to the insurance companies provided on this form in order to submit insurance claims on my behalf.',
      'This authorization extends to the extent necessary to obtain payment for the services provided to me, and includes authorization to release information about mental health, substance use, or HIV diagnoses as required.',
      'In consideration of the services provided to me, I assign all benefits to',
      'I understand that I remain responsible for all amounts due by me, including (but not limited to) copays, coinsurance, deductible amounts, and all services not covered by my insurance plan (including those for which I fail to obtain prior authorization), and mutually agreed-upon services or fees that are deemed not medically necessary.',
      'This is a binding electronic signature. By signing below, you acknowledge that your electronic signature has the same legal effect as a hand-written one. We record your name, the date and time you signed, your IP address, and your browser at finalize time and embed that information in the signed PDF kept on file.',
      'Sign this authorization', 'Apply my signature to this authorization',
      'We\'ll re-use the signature you drew earlier in this session — same legal weight as signing here in pen, and you\'ll see it on the signed PDF.',
      'Signed', 'e-Signature applied', 'source: reused signature from earlier in this session',
      'Sign again',
      'Type your name to sign this authorization', 'Your name',
      '✓ Signed by',
      'You can use whatever name you go by — it does not have to be your legal name. We\'ll capture the date, time, IP, and browser as part of the audit trail.',
    ];
    for (const s of insuranceStrings) strings.add(s);

    // Payment step strings.
    const paymentStrings = [
      'Program cost', 'Payment method',
      'Your payment information is collected securely by',
      'a PCI-compliant payment processor trusted by millions of businesses. Your card details are encrypted and processed directly by this organization\'s payment account. They are never stored unmasked on any server.',
      'Your payment information is stored securely via QuickBooks Payments (Intuit). Card details are encrypted and never stored unmasked on our servers.',
      'You may update or remove your payment method at any time through your guardian portal.',
      'Cardholder name', 'Name as it appears on card', 'Card details',
      'Automatically charge this card at the start of each session (recommended)',
      'If not checked, a Pay & Join step will appear each time before entering a session.',
      'Saving securely…', 'Save payment method',
      'Card number', 'Expiry month', 'Expiry year', 'CVV', 'Billing ZIP code',
    ];
    for (const s of paymentStrings) strings.add(s);

    // Communications step strings.
    const commStrings = [
      'No', 'No - Do not text me',
      'Choose how you would like to receive operational communications. You can update these preferences at any time.',
      'Choose how you would like to receive platform communications. You can update these preferences at any time.',
      'Email Notifications Preference', 'Email Communication Preference',
      'Text Message (SMS) Communication Preference',
      'Please choose what you would like to receive by email from us. If you opt in, we may email you about operational scheduling, internal announcements, and optional platform participation updates. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.',
      'Please choose what you would like to receive emails from us. If you opt in, we may email you about scheduling, appointment reminders, and-if selected-updates about mental health programs and services. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.',
      'Yes - Operational scheduling + internal announcements',
      'Yes - Scheduling + all program communications',
      'Yes - Scheduling only',
      'Yes - Scheduling and appointment reminders',
      'SMS With Your Provider/Care Team',
      'If you choose Yes, you consent to receive service-related text messages through PlotTwistHQ from',
      'follow-up, coordination, and service-related responses). These messages are HIPAA-protected and associated with your care relationship at',
      'and, when applicable, your provider/care team (for example, follow-up, coordination, and service-related responses). These messages are HIPAA-protected and associated with your care relationship at',
      'By selecting', 'Yes', 'and opting in, you understand and agree to the following:',
      'These messages may be viewed by the care team associated with your provider.',
      'Your provider and our care team are not available for emergencies, and these messages are not monitored in real time. In case of emergency, call 911.',
      'Your provider and our care team are', 'not',
      'available for emergencies, and these messages are not monitored in real time. In case of emergency, call 911.',
      'Your provider will not receive messages outside of their working hours. All messages are confidentially stored within the platform.',
      'PlotTwistHQ is not responsible for, nor independently aware of, the content of direct communications between you and your provider.',
      'You agree not to share confidential third-party information in these messages, and understand that this communication channel does not replace nor constitute clinical care or a therapeutic relationship.',
      'You agree not to share confidential third-party information in these messages, and understand that this communication channel does',
      'replace nor constitute clinical care or a therapeutic relationship.',
      'Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help. Appointment reminders/confirmations are not sent from individual provider numbers. Additional terms apply —',
      'Terms:', 'Privacy:',
      'Yes - I opt in to provider/care-team texting and agree to the terms above',
      'No - Keep provider texting off',
      'Please note:',
      'Your provider/care team sends these messages through PlotTwistHQ, and you receive/reply to them as standard SMS messages on your phone. If you choose to respond to or initiate a text message with your provider or care team via SMS, you acknowledge and agree that the same terms and conditions outlined above apply to that exchange. Additional terms are always available at',
      'and',
      'Optional Program & Service Updates',
      'If you choose Yes,',
      'may send optional SMS updates through PlotTwistHQ about this agency\'s programs and services (for example, openings, enrollment options, and availability). You may also receive limited updates about relevant affiliate services. Affiliates never receive access to your personal or clinical information through this update channel, and any affiliate program requires its own separate opt-in for communication and registration. Message frequency is no greater than twice per month. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.',
      'Yes - I want optional updates', 'No - Keep optional updates off',
      'Internal Workforce + School Staff Notifications (Opt-In)',
      'By opting in, you agree to receive SMS/text messages from',
      'through PlotTwistHQ for operational notifications and reminders, internal announcements, and optional polls/voting related to your participation on the platform. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help. Support: 833-756-8894 ext. 701 | hq@plottwistco.com.',
      'Yes - I opt in to internal workforce / school staff SMS notifications',
      'No - Keep internal notifications off',
    ];
    for (const s of commStrings) strings.add(s);

    // Demographics step strings.
    const demoStrings = [
      'Please fill in the following information so we can keep your records up to date.',
      'Date of Birth', 'Gender', 'Race / Ethnicity', 'Preferred Language',
      'Prefer not to say', 'Male', 'Female', 'Non-binary', 'Other / self-describe',
      'American Indian or Alaska Native', 'Asian', 'Black or African American',
      'Hispanic or Latino', 'Native Hawaiian or Other Pacific Islander', 'White',
      'Two or more races', 'Select…', 'English', 'Spanish', 'French', 'Mandarin', 'Arabic', 'Other',
      'Street Address', 'Apt / Unit (optional)', 'Zip Code', 'City', 'State', 'Required',
      'Upload file', 'Paste text',
    ];
    for (const s of demoStrings) strings.add(s);
    [
      communicationsIntroText.value,
      communicationsEmailTitle.value,
      communicationsSmsTitle.value,
      communicationsEmailDisclosure.value,
      communicationsSmsDisclosure.value,
      communicationsEmailAllLabel.value,
      communicationsEmailSchedulingOnlyLabel.value,
      communicationsSmsYesLabel.value,
      communicationsProviderTextingTitle.value,
      communicationsProviderTextingIntro.value,
      communicationsProviderTextingClosing.value,
      communicationsProviderTextingYesLabel.value,
      communicationsProviderTextingNoLabel.value,
      communicationsProgramUpdatesTitle.value,
      communicationsProgramUpdatesDisclosure.value,
      communicationsProgramUpdatesYesLabel.value,
      communicationsProgramUpdatesNoLabel.value,
      communicationsWorkforceTitle.value,
      communicationsWorkforceDisclosure.value,
      communicationsWorkforceYesLabel.value,
      communicationsWorkforceNoLabel.value
    ].forEach(addString);

    const arr = [...strings].filter(Boolean);
    if (!arr.length) {
      stringTranslations.value = {};
      return;
    }

    const cacheKey = arr.join('\u0001');
    const cached = stringTranslationCache.get(cacheKey);
    if (cached) {
      stringTranslations.value = cached;
      return;
    }

    const requestId = ++stringTranslationRequestId;
    stringTranslationsLoading.value = true;
    const resp = await api.post(
      '/public/translations/translate-strings',
      { strings: arr, lang: 'es' },
      { skipGlobalLoading: true }
    );
    if (requestId !== stringTranslationRequestId || intakeLocale.value !== 'es') return;
    const translations = resp?.data?.translations || {};
    stringTranslationCache.set(cacheKey, translations);
    stringTranslations.value = translations;
  } catch {
    // Fail silently — form still works, just untranslated.
  } finally {
    stringTranslationsLoading.value = false;
  }
}

/**
 * Shows the in-page EN/ES toggle when:
 * - Form has a linked Spanish form (old whole-form approach), OR
 * - Form has a document_translation_map (new per-document approach), OR
 * - We are on the Spanish side and know the English key to return to.
 */
const hasLinkedLanguageToggle = computed(() => {
  if (usesSchoolMaster.value) return true;
  if (String(link.value?.form_type || '').toLowerCase() === 'smart_school_roi') return true;
  if (spanishQuestionLabelsEnabled.value) return true;
  if (link.value?.linked_es_form?.public_key) return true;
  if (hasDocumentTranslationMap.value) return true;
  if (currentFormLanguage.value === 'es' && linkedLanguageEnglishPublicKey.value) return true;
  return false;
});

const intakeLocale = computed(() => {
  // In-page locale takes priority for map-based (non-linked-form) Spanish.
  if (hasInPageSpanish.value) return inPageLocale.value;
  const code = String(link.value?.language_code || 'en').toLowerCase();
  return code.startsWith('es') ? 'es' : 'en';
});

provide('intakeLocale', intakeLocale);

const spanishClarificationStep = computed(() => {
  if (intakeLocale.value !== 'es') return null;
  return (intakeSteps.value || []).find((s) => String(s?.type || '').trim() === 'spanish_clarification') || null;
});
const showSpanishClarificationBlock = computed(() => {
  if (step.value !== 1 || intakeLocale.value !== 'es') return false;
  if (spanishClarificationStep.value) return true;
  const scope = String(link.value?.scope_type || '').toLowerCase();
  const formType = String(link.value?.form_type || 'intake').toLowerCase();
  return usesSchoolMaster.value || (scope === 'school' && formType === 'intake');
});
const spanishClarificationCopy = SPANISH_CLARIFICATION_COPY;
const spanishClarificationSections = computed(() => {
  const c = SPANISH_CLARIFICATION_COPY;
  return [
    { key: 'guardianPrefersSpanishOnly', ...c.guardianPrefersSpanishOnly },
    { key: 'clientNeedsSpanishOnly', ...c.clientNeedsSpanishOnly },
    { key: 'interpreterConsent', ...c.interpreterConsent },
    { key: 'sessionPrimaryLanguage', ...c.sessionPrimaryLanguage },
    { key: 'providerLanguagePreference', ...c.providerLanguagePreference },
    { key: 'schoolDayVirtualCoordination', ...c.schoolDayVirtualCoordination },
    { key: 'afterSchoolSpanishVirtual', ...c.afterSchoolSpanishVirtual }
  ];
});
const spanishClarificationMissingKey = ref('');

// Shared intake state must be declared before any watch/computed that reads it.
const clients = ref([
  { firstName: '', lastName: '' }
]);
const intakeResponses = reactive({
  guardian: {},
  submission: {},
  clients: [{}]
});

const ensureSpanishClarificationShape = () => {
  if (!showSpanishClarificationBlock.value) return;
  if (
    !intakeResponses.submission.spanishClarification
    || typeof intakeResponses.submission.spanishClarification !== 'object'
  ) {
    intakeResponses.submission.spanishClarification = { ...EMPTY_SPANISH_CLARIFICATION_RESPONSE };
  }
};

watch(showSpanishClarificationBlock, (show) => {
  if (show) ensureSpanishClarificationShape();
}, { immediate: true });

watch(
  () => intakeResponses.submission?.spanishClarification,
  () => {
    if (!spanishClarificationMissingKey.value) return;
    const missing = firstMissingSpanishClarificationField(intakeResponses.submission?.spanishClarification);
    if (!missing || missing !== spanishClarificationMissingKey.value) {
      spanishClarificationMissingKey.value = missing || '';
    }
  },
  { deep: true }
);

watch(intakeLocale, () => {
  if (usesSchoolMaster.value) return;
  if (String(link.value?.scope_type || '').toLowerCase() === 'school'
    && String(link.value?.form_type || 'intake').toLowerCase() === 'intake') {
    return;
  }
  fetchStringTranslations();
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
  const custom = publicIntakeDescription(customMessages.value?.beginSubtitle, '');
  if (custom) return custom;
  if (formTypeKey.value === 'smart_registration' && isProgramEnrollmentIntake.value) {
    return t('beginSubtitleProgramEnrollment');
  }
  if (formTypeKey.value === 'smart_registration') return t('beginSubtitleRegistration');
  if (formTypeKey.value === 'job_application') return t('beginSubtitleJob');
  if (formTypeKey.value === 'medical_records_request') return t('beginSubtitleMedical');
  return t('beginSubtitle');
});

const publicCoverLead = computed(() =>
  publicIntakeDescription(tx(link.value?.description), beginSubtitleText.value)
);
const publicFormLead = computed(() => publicIntakeDescription(tx(link.value?.description), ''));

const publicPacketBadge = computed(() => {
  const title = String(link.value?.title || '');
  const inherits = Number(link.value?.inherits_office_master || 0) === 1;
  if (inherits || /in-depth/i.test(title)) return t('inDepthIntakePacket');
  return shellFormSubtitle.value || t('intakeAndRegistration');
});

const boundClient = ref(null);
const asksWhoFor = computed(() => {
  if (usesSchoolMaster.value) return false;
  const scope = String(link.value?.scope_type || '').toLowerCase();
  if (scope === 'school') return false;
  const ft = String(link.value?.form_type || '').toLowerCase();
  if (ft === 'medical_records_request' || ft === 'job_application') return false;
  return !boundClient.value?.id;
});

const WHO_FOR_STEP = 0.5;

function goToFirstFormStep() {
  step.value = asksWhoFor.value ? WHO_FOR_STEP : 1;
}
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
const fatalError = ref('');
const error = ref('');
const stepError = ref('');
const beginError = ref('');
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

const interviewShowIfValues = computed(() => {
  const step = currentFlowStep.value;
  const idx = Number.isInteger(step?.clientIndex) ? step.clientIndex : null;
  const clientBag = idx != null ? (intakeResponses.clients?.[idx] || {}) : {};
  const ident = idx != null ? (clients.value?.[idx] || {}) : {};
  const dob = clientBag.child_dob || ident.dob || ident.dateOfBirth;
  return mergeShowIfValues(
    intakeResponses.submission || {},
    intakeResponses.guardian || {},
    clientBag,
    clinicalResponses,
    childAgeFlags(dob, clientBag)
  );
});

const visibleClinicalFields = computed(() => {
  if (currentFlowStep.value?.type !== 'clinical_questions') return [];
  const fields = Array.isArray(currentFlowStep.value?.fields) ? currentFlowStep.value.fields : [];
  const values = interviewShowIfValues.value;
  return fields.filter((f) => {
    if (!f?.key) return false;
    return matchesShowIf(f.showIf, values);
  });
});

const isClinicalFieldMissing = (field) => {
  if (!field?.required || field.type === 'info') return false;
  const v = clinicalResponses[field.key];
  if (isCheckboxGroupField(field)) return !Array.isArray(v) || v.length === 0;
  return v === undefined || v === null || String(v).trim() === '';
};

// Parent request: the PSC-17 / symptom batteries repeat the same helper text on
// every question (e.g. "Please select the answer that best fits your
// dependent:"). Hoist a run of fields that share identical helper text into a
// single header above the group — mirrors how the paper scale prints with one
// instruction and a list of items. Non-repeating helpers fall through and still
// render inline.
const clinicalFieldGroups = computed(() => {
  const fields = visibleClinicalFields.value || [];
  const groups = [];
  let current = null;
  for (const f of fields) {
    const helper = String(f?.helperText || '').trim();
    if (current && current.helperKey === helper) {
      current.fields.push(f);
    } else {
      current = { helperKey: helper, fields: [f] };
      groups.push(current);
    }
  }
  // Only treat a helper as shared when 2+ siblings repeat it.
  return groups.map((g) => ({
    sharedHelper: g.fields.length > 1 ? g.helperKey : '',
    fields: g.fields
  }));
});
const platformTermsUrl = computed(() => currentFlowStep.value?.termsUrlOverride?.trim() || '/terms');
const platformPrivacyUrl = computed(() => currentFlowStep.value?.privacyUrlOverride?.trim() || '/privacypolicy');
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
    ? tx('Choose how you would like to receive operational communications. You can update these preferences at any time.')
    : tx('Choose how you would like to receive platform communications. You can update these preferences at any time.')
);
const communicationsEmailTitle = computed(() => {
  const override = currentFlowStep.value?.campaigns?.content?.scheduling?.emailTitle?.trim();
  if (override) return tx(override);
  return isWorkforceAudience.value ? tx('Email Notifications Preference') : tx('Email Communication Preference');
});
const communicationsSmsTitle = computed(() => {
  const override = currentFlowStep.value?.campaigns?.content?.scheduling?.smsTitle?.trim();
  return tx(override || 'Text Message (SMS) Communication Preference');
});
const communicationsEmailDisclosure = computed(() => {
  const override = currentFlowStep.value?.campaigns?.content?.scheduling?.emailDisclosure?.trim();
  if (override) return tx(override);
  return tx(isWorkforceAudience.value
    ? 'Please choose what you would like to receive by email from us. If you opt in, we may email you about operational scheduling, internal announcements, and optional platform participation updates. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.'
    : 'Please choose what you would like to receive emails from us. If you opt in, we may email you about scheduling, appointment reminders, and-if selected-updates about mental health programs and services. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.');
});
const communicationsTenantName = computed(() => {
  const agencyName = (agencyInfo.value?.official_name || agencyInfo.value?.name || '').trim();
  const orgName = (organizationInfo.value?.official_name || organizationInfo.value?.name || '').trim();
  if (agencyName && orgName && agencyName !== orgName) return `${agencyName} and ${orgName}`;
  return agencyName || orgName || 'This agency';
});
const communicationsSmsDisclosure = computed(() => {
  const override = currentFlowStep.value?.campaigns?.content?.scheduling?.smsDisclosure?.trim();
  if (override) return tx(override);
  const name = communicationsTenantName.value;
  return txFmt(
    '{tenant} utilizes PlotTwistHQ, a platform by PlotTwistCo (PTCo), to facilitate appointment scheduling, reminders, and related communication. All messages you receive are scheduled, coordinated, and established directly by {tenant} — you will never receive any communications from PlotTwistCo (PTCo) directly. Please select your preference for receiving text messages. If you opt in, you may receive messages related to scheduling and appointment reminders. Message frequency varies; typically 7 days before and 24 hours before your appointment. You may be asked to reply with Yes or No regarding your attendance. Message and data rates may apply. Reply STOP to unsubscribe. Reply HELP for help.',
    { tenant: name }
  );
});
const communicationsEmailAllLabel = computed(() => {
  const override = currentFlowStep.value?.campaigns?.content?.scheduling?.emailAllLabel?.trim();
  if (override) return tx(override);
  return tx(isWorkforceAudience.value
    ? 'Yes - Operational scheduling + internal announcements'
    : 'Yes - Scheduling + all program communications');
});
const communicationsEmailSchedulingOnlyLabel = computed(() => {
  const override = currentFlowStep.value?.campaigns?.content?.scheduling?.emailSchedulingOnlyLabel?.trim();
  return tx(override || 'Yes - Scheduling only');
});
const communicationsSmsYesLabel = computed(() => {
  const override = currentFlowStep.value?.campaigns?.content?.scheduling?.smsYesLabel?.trim();
  return tx(override || 'Yes - Scheduling and appointment reminders');
});
// Campaign 2 — Provider/care-team texting
const communicationsProviderTextingTitle = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.providerTexting?.title?.trim() || 'SMS With Your Provider/Care Team')
);
const communicationsProviderTextingIntro = computed(() =>
  currentFlowStep.value?.campaigns?.content?.providerTexting?.disclosure?.trim()
    ? tx(currentFlowStep.value.campaigns.content.providerTexting.disclosure.trim())
    : null
);
const communicationsProviderTextingClosing = computed(() =>
  currentFlowStep.value?.campaigns?.content?.providerTexting?.closingDisclosure?.trim()
    ? tx(currentFlowStep.value.campaigns.content.providerTexting.closingDisclosure.trim())
    : null
);
const communicationsProviderTextingYesLabel = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.providerTexting?.yesLabel?.trim() ||
  'Yes - I opt in to provider/care-team texting and agree to the terms above')
);
const communicationsProviderTextingNoLabel = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.providerTexting?.noLabel?.trim() || 'No - Keep provider texting off')
);
// Campaign 3 — Program updates
const communicationsProgramUpdatesTitle = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.programUpdates?.title?.trim() || 'Optional Program & Service Updates')
);
const communicationsProgramUpdatesDisclosure = computed(() =>
  currentFlowStep.value?.campaigns?.content?.programUpdates?.disclosure?.trim()
    ? tx(currentFlowStep.value.campaigns.content.programUpdates.disclosure.trim())
    : null
);
const communicationsProgramUpdatesYesLabel = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.programUpdates?.yesLabel?.trim() || 'Yes - I want optional updates')
);
const communicationsProgramUpdatesNoLabel = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.programUpdates?.noLabel?.trim() || 'No - Keep optional updates off')
);
// Campaign 4 — Internal workforce
const communicationsWorkforceTitle = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.internalWorkforce?.title?.trim() ||
  'Internal Workforce + School Staff Notifications (Opt-In)')
);
const communicationsWorkforceDisclosure = computed(() =>
  currentFlowStep.value?.campaigns?.content?.internalWorkforce?.disclosure?.trim()
    ? tx(currentFlowStep.value.campaigns.content.internalWorkforce.disclosure.trim())
    : null
);
const communicationsWorkforceYesLabel = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.internalWorkforce?.yesLabel?.trim() ||
  'Yes - I opt in to internal workforce / school staff SMS notifications')
);
const communicationsWorkforceNoLabel = computed(() =>
  tx(currentFlowStep.value?.campaigns?.content?.internalWorkforce?.noLabel?.trim() ||
  'No - Keep internal notifications off')
);
const templates = ref([]);
const agencyInfo = ref(null);
const organizationInfo = ref(null);
const formBranding = ref(null);

const showSplashSupportModal = ref(false);
const splashSupportSending = ref(false);
const splashSupportError = ref('');
const splashSupportSuccess = ref('');
const splashSupportForm = reactive({
  name: '',
  email: '',
  message: '',
  website: ''
});

const referralAgencySlug = computed(() => {
  const fromAgency = String(agencyInfo.value?.slug || agencyInfo.value?.portal_url || '').trim().toLowerCase();
  const agencyType = String(agencyInfo.value?.organization_type || 'agency').toLowerCase();
  if (fromAgency && agencyType === 'agency') return fromAgency.replace(/[^a-z0-9-]/g, '');
  const fromBranding = String(formBranding.value?.slug || formBranding.value?.portalUrl || '').trim().toLowerCase();
  if (fromBranding) return fromBranding.replace(/[^a-z0-9-]/g, '');
  if (fromAgency) return fromAgency.replace(/[^a-z0-9-]/g, '');
  return '';
});

const isSchoolScopedIntake = computed(() => {
  const scope = String(link.value?.scope_type || '').toLowerCase();
  const orgType = String(organizationInfo.value?.organization_type || '').toLowerCase();
  return scope === 'school' || orgType === 'school';
});

const isOfficeInDepthIntake = computed(() => {
  if (isSchoolScopedIntake.value || usesSchoolMaster.value) return false;
  return Number(link.value?.inherits_office_master || 0) === 1
    || String(link.value?.scope_type || '').toLowerCase() === 'agency';
});

const showSchoolSplashSupport = computed(
  () => !isJobApplication.value && !!(referralAgencySlug.value || agencyInfo.value)
);
const showFullSplashSupport = computed(
  () => showSchoolSplashSupport.value && (step.value < 1)
);
const showCompactSidebarContact = computed(
  () => showSchoolSplashSupport.value && step.value >= 1
);

const splashContactPhoneInfo = computed(() => {
  if (isJobApplication.value) return null;
  return resolveSchoolOnboardingSupportPhone({
    slug: referralAgencySlug.value,
    phone: agencyInfo.value?.phone_number || agencyInfo.value?.phone,
    phone_number: agencyInfo.value?.phone_number || agencyInfo.value?.phone,
    phoneExtension: agencyInfo.value?.phone_extension,
    phone_extension: agencyInfo.value?.phone_extension
  });
});
const splashContactPhone = computed(() => splashContactPhoneInfo.value?.display || '');
const splashContactTel = computed(() => String(splashContactPhoneInfo.value?.tel || '').replace(/^tel:/, ''));
const splashContactEmail = computed(() => {
  if (isJobApplication.value) return '';
  return resolveSchoolOnboardingSupportEmail({
    slug: referralAgencySlug.value,
    supportEmail: agencyInfo.value?.onboarding_team_email,
    onboarding_team_email: agencyInfo.value?.onboarding_team_email
  }) || '';
});

const skipBrandingIntro = computed(() => {
  if (isJobApplication.value) return false;
  if (isSchoolScopedIntake.value) return false;
  return Number(link.value?.inherits_office_master || 0) === 1
    || String(link.value?.scope_type || '').toLowerCase() === 'agency';
});

function goToSchoolReferralFinder() {
  const slug = referralAgencySlug.value;
  if (!slug) return;
  const brandingStore = useBrandingStore();
  const path = buildSchoolReferralFinderPath(
    slug,
    resolveHostImpliedPortalSlug(brandingStore)
  );
  router.push(path);
}

function openSplashSupportModal() {
  splashSupportError.value = '';
  splashSupportSuccess.value = '';
  showSplashSupportModal.value = true;
}

function closeSplashSupportModal() {
  showSplashSupportModal.value = false;
}

async function submitSplashSupport() {
  splashSupportError.value = '';
  splashSupportSuccess.value = '';
  const slug = referralAgencySlug.value;
  if (!slug) {
    splashSupportError.value = 'Unable to determine organization for support.';
    return;
  }
  splashSupportSending.value = true;
  try {
    await api.post(`/public/school-referral/${encodeURIComponent(slug)}/support-tickets`, {
      name: splashSupportForm.name,
      email: splashSupportForm.email,
      message: splashSupportForm.message,
      website: splashSupportForm.website,
      schoolName: shellProgramTitle.value,
      schoolOrganizationId: organizationInfo.value?.id || null,
      intakePublicKey: publicKey,
      sourceKey: 'public_school_intake_splash',
      subject: `School intake help — ${shellProgramTitle.value || 'School'}`
    });
    splashSupportSuccess.value = 'Thanks — your message was sent. We will follow up by email.';
    splashSupportForm.message = '';
    setTimeout(() => {
      closeSplashSupportModal();
      splashSupportSuccess.value = '';
    }, 2200);
  } catch (e) {
    splashSupportError.value = e?.response?.data?.error?.message || 'Failed to send message. Please try again.';
  } finally {
    splashSupportSending.value = false;
  }
}

const FLOW_STEP_PROGRESS_LABELS = {
  document: 'Documents',
  upload: 'Uploads',
  registration: 'Registration',
  school_roi: 'School ROI',
  smart_disclosure: 'Disclosure',
  disclosure: 'Disclosure',
  packet_informed_group_consent: 'Informed + Group Consent',
  packet_policy_services: 'Policy & Services',
  packet_hipaa_notice: 'HIPAA Notice',
  guardian_waiver: 'Waivers',
  insurance_info: 'Insurance',
  payment_collection: 'Payment',
  communications: 'Communications',
  references: 'References',
  demographics: 'Demographics',
    questions: 'Questions',
    clinical_questions: 'Clinical',
    child_review: 'Review'
};

const PACKET_SECTION_STEP_TO_KEY = {
  packet_informed_group_consent: 'informed_group_consent',
  packet_policy_services: 'policy_services',
  packet_hipaa_notice: 'hipaa_notice'
};

const isPacketSectionStepType = (type) => Object.prototype.hasOwnProperty.call(
  PACKET_SECTION_STEP_TO_KEY,
  String(type || '').trim().toLowerCase()
);

const shellProgramTitle = computed(() => {
  const branded = String(formBranding.value?.programTitle || '').trim();
  if (branded) return localizePublicIntakeTitle(branded, intakeLocale.value);
  const org = organizationInfo.value?.official_name || organizationInfo.value?.name || '';
  const agency = agencyInfo.value?.official_name || agencyInfo.value?.name || '';
  return localizePublicIntakeTitle(
    String(org || agency || link.value?.title || t('intakeAndRegistration')).trim(),
    intakeLocale.value
  );
});

const shellFormSubtitle = computed(() => {
  const ft = formTypeKey.value;
  if (ft === 'job_application') return t('digitalIntakeJob');
  if (ft === 'smart_school_roi') return t('releaseOfInformation');
  if (ft === 'smart_disclosure') return tx('Disclosure') || 'Disclosure';
  if (ft === 'smart_registration') return t('registration');
  if (ft === 'medical_records_request') return t('digitalIntakeMedical');
  if (ft === 'public_form') return t('information');
  return t('intakeAndRegistration');
});

const shellFormDocumentTitle = computed(() =>
  localizePublicIntakeTitle(link.value?.title || defaultTitle.value, intakeLocale.value)
);

function childDisplayName(idx) {
  const i = Number.isInteger(idx) ? idx : 0;
  const bag = intakeResponses.clients?.[i] || {};
  const ident = clients.value?.[i] || {};
  const name = String(
    bag.child_preferred_name || ident.firstName || bag.child_legal_first || ''
  ).trim();
  return name || 'this child';
}

function isRepeatPerClientStep(s) {
  const audience = String(s?.audience || '').trim().toLowerCase();
  return s?.repeatPerClient === true || audience === 'dependent';
}

const dfProgressSteps = computed(() => {
  const steps = [];
  if (asksWhoFor.value) steps.push({ id: 'who', label: t('letsGetIntakeStarted') });
  const seen = new Set();
  let familyAdded = false;
  const childAdded = new Set();
  for (const s of flowSteps.value || []) {
    const type = String(s?.type || '');
    const audience = String(s?.audience || '').trim().toLowerCase();
    if (audience === 'guardian' || String(s?.id || '').includes('counseling_dep_about_you') || String(s?.id || '').includes('counseling_dep_family_contact') || String(s?.id || '').includes('counseling_dep_custody')) {
      if (!familyAdded && !seen.has('family')) {
        seen.add('family');
        familyAdded = true;
        steps.push({ id: 'family', label: 'Your family' });
      }
      continue;
    }
    if (isRepeatPerClientStep(s) || Number.isInteger(s?.clientIndex)) {
      const i = Number.isInteger(s.clientIndex) ? s.clientIndex : 0;
      const cid = `child_${i}`;
      if (!childAdded.has(i)) {
        childAdded.add(i);
        seen.add(cid);
        steps.push({ id: cid, label: childDisplayName(i) });
      }
      continue;
    }
    const id = String(s?.sourceId || s?.id || `${type}_${steps.length}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const raw = String(s?.label || FLOW_STEP_PROGRESS_LABELS[type] || type || 'Step').trim() || 'Step';
    steps.push({
      id,
      label: interpolateChildTokens(tx(raw) || raw, s?.clientIndex)
    });
  }
  steps.push({ id: 'complete', label: t('completed') });
  return steps;
});

const dfProgressIndex = computed(() => {
  const total = dfProgressSteps.value.length;
  if (!total) return 0;
  if (step.value <= 0) return 0;
  if (step.value === WHO_FOR_STEP) return 0;
  if (step.value === 1) return asksWhoFor.value ? 1 : 0;
  if (step.value === 2) {
    const current = currentFlowStep.value;
    const audience = String(current?.audience || '').trim().toLowerCase();
    const collapsed = dfProgressSteps.value;
    if (audience === 'guardian' || String(current?.id || '').includes('counseling_dep_')) {
      if (Number.isInteger(current?.clientIndex)) {
        const cid = `child_${current.clientIndex}`;
        const idx = collapsed.findIndex((s) => s.id === cid);
        if (idx >= 0) return Math.min(idx, total - 2);
      }
      if (audience === 'guardian') {
        const idx = collapsed.findIndex((s) => s.id === 'family');
        if (idx >= 0) return Math.min(idx, total - 2);
      }
    }
    const sid = String(current?.sourceId || current?.id || '');
    const byId = collapsed.findIndex((s) => s.id === sid);
    if (byId >= 0) return Math.min(byId, total - 2);
    const idx = 1 + Number(currentFlowIndex.value || 0);
    return Math.min(idx, total - 2);
  }
  if (step.value === 3) return total - 1;
  return 0;
});

const maxReachedProgressIndex = ref(0);

function jumpToProgressStep(index) {
  if (!isOfficeInDepthIntake.value) return;
  const steps = dfProgressSteps.value || [];
  const target = steps[index];
  if (!target) return;
  const reachable = Math.max(maxReachedProgressIndex.value, dfProgressIndex.value);
  if (index > reachable) return;
  if (target.id === 'complete') return;
  if (target.id === 'who') {
    step.value = WHO_FOR_STEP;
    return;
  }
  const flowIdx = (flowSteps.value || []).findIndex((s) => {
    const sid = String(s?.sourceId || s?.id || '');
    if (sid === target.id) return true;
    if (target.id === 'family' && (String(s?.audience || '') === 'guardian' || String(s?.id || '').includes('counseling_dep_'))) {
      return !Number.isInteger(s?.clientIndex);
    }
    if (target.id.startsWith('child_') && Number.isInteger(s?.clientIndex)) {
      return `child_${s.clientIndex}` === target.id;
    }
    return false;
  });
  if (flowIdx >= 0) {
    step.value = 2;
    currentFlowIndex.value = flowIdx;
  }
}
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
const hasProgrammedSchoolRoiStep = computed(() =>
  intakeSteps.value.some((step) => String(step?.type || '').trim().toLowerCase() === 'school_roi')
);
const hasProgrammedDisclosureStep = computed(() =>
  intakeSteps.value.some((step) => {
    const type = String(step?.type || '').trim().toLowerCase();
    return type === 'smart_disclosure' || type === 'disclosure';
  })
);
const hasRegistrationStep = computed(() =>
  intakeSteps.value.some((step) => String(step?.type || '').trim().toLowerCase() === 'registration')
);
const DEFAULT_GUARDIAN_WAIVER_SECTION_KEYS = [
  'pickup_authorization',
  'walk_home_authorization',
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
    const filtered = intakeSteps.value
      .filter(
        (s) =>
          s?.type === 'document'
          || s?.type === 'upload'
          || s?.type === 'school_roi'
          || s?.type === 'smart_disclosure'
          || s?.type === 'disclosure'
          || s?.type === 'packet_informed_group_consent'
          || s?.type === 'packet_policy_services'
          || s?.type === 'packet_hipaa_notice'
          || s?.type === 'registration'
          || s?.type === 'guardian_waiver'
          || s?.type === 'insurance_info'
          || s?.type === 'payment_collection'
          || s?.type === 'communications'
          || s?.type === 'references'
          || s?.type === 'demographics'
          || s?.type === 'clinical_questions'
          || s?.type === 'questions'
          || s?.type === 'child_review'
      )
      .filter((s) => {
        // Skip payment_collection when the guardian selected Medicaid coverage
        // or all selected registrations are Medicaid-only.
        if (s?.type === 'payment_collection') {
          if (shouldSkipPaymentCollectionStep()) return false;
        }
        const audience = String(s?.audience || '').trim().toLowerCase();
        if (audience === 'self' && !intakeForSelf.value) return false;
        if ((audience === 'dependent' || audience === 'guardian') && intakeForSelf.value) return false;
        if (!isRepeatPerClientStep(s) && s?.showIf) {
          const bag = mergeShowIfValues(
            intakeResponses.submission || {},
            intakeResponses.guardian || {},
            clinicalResponses
          );
          if (!matchesShowIf(s.showIf, bag)) return false;
        }
        return stepVisible(s);
      });
    const expanded = [];
    for (const s of filtered) {
      if (isRepeatPerClientStep(s) && !intakeForSelf.value) {
        const n = Math.max(clients.value.length, 1);
        for (let i = 0; i < n; i++) {
          const bag = intakeResponses.clients?.[i] || {};
          const ident = clients.value?.[i] || {};
          const flags = childAgeFlags(bag.child_dob || ident.dob || ident.dateOfBirth, bag);
          if (s.showWhen === 'substance_indicated' && flags._substance_indicated !== 'yes') continue;
          if (s.showIf) {
            const values = mergeShowIfValues(
              intakeResponses.submission || {},
              intakeResponses.guardian || {},
              bag,
              flags
            );
            if (!matchesShowIf(s.showIf, values)) continue;
          }
          expanded.push({
            ...s,
            clientIndex: i,
            sourceId: s.id,
            id: `${s.id || s.type}__c${i}`
          });
        }
      } else {
        expanded.push({ ...s, sourceId: s.id });
      }
    }
    return expanded.map((s) => {
        if (s.type === 'upload') return { ...s };
        if (s.type === 'school_roi') return { ...s };
        if (s.type === 'smart_disclosure' || s.type === 'disclosure') return { ...s };
        if (s.type === 'packet_informed_group_consent' || s.type === 'packet_policy_services' || s.type === 'packet_hipaa_notice') return { ...s };
        if (s.type === 'registration') return { ...s };
        if (s.type === 'guardian_waiver') return { ...s };
        if (s.type === 'insurance_info') return { ...s };
        if (s.type === 'payment_collection') return { ...s };
        if (s.type === 'communications') return { ...s };
        if (s.type === 'references') return { ...s };
        if (s.type === 'demographics') return { ...s };
        if (s.type === 'clinical_questions') return { ...s };
        if (s.type === 'questions') return { ...s };
        if (s.type === 'child_review') return { ...s };
        // Swap to the Spanish document template when the user has toggled Spanish
        // and an en→es mapping exists for this step's document.
        let resolvedTemplateId = s.templateId;
        if (intakeLocale.value === 'es' && hasDocumentTranslationMap.value) {
          const map = link.value?.document_translation_map || {};
          const esId = map[String(Number(s.templateId))];
          if (esId) resolvedTemplateId = Number(esId);
        }
        const template = templates.value.find((t) => Number(t.id) === Number(resolvedTemplateId));
        return { ...s, template, resolvedTemplateId };
      });
  }
  return templates.value.map((t) => ({ id: `doc_${t.id}`, type: 'document', template: t }));
});
const currentFlowIndex = ref(0);
const currentFlowStep = computed(() => flowSteps.value[currentFlowIndex.value] || null);
watch(dfProgressIndex, (idx) => {
  const n = Number(idx || 0);
  if (n > maxReachedProgressIndex.value) maxReachedProgressIndex.value = n;
});
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
  'walk_home_authorization',
  'emergency_contacts',
  'allergies_snacks',
  'meal_preferences'
]);
const guardianWaiverSectionLabels = {
  pickup_authorization: 'pickup authorization',
  walk_home_authorization: 'walk-home authorization',
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
  if (sectionKey === 'walk_home_authorization') {
    // The walk-home section is "satisfied" two ways: the parent explicitly
    // declined to authorize walk-home (allowedToWalkHome === false), OR
    // they affirmatively authorized AND filled in the required attestation.
    // The first case still needs a signature (to record the attestation
    // that they refused) only when the section was actually rendered AND
    // the parent flipped a value. We treat "untouched + still false" as
    // skippable so a program that renders the section but the parent
    // never touched it doesn't block submission.
    if (payload.allowedToWalkHome === true) return false;
    if (payload.allowedToWalkHome === false
        && !payload.allowedWindow
        && !payload.route
        && !payload.conditions
        && !payload.attestation) {
      return true;
    }
    return false;
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
// Parent feedback: validation errors for the guardian-waiver step were showing
// up as one banner at the top of the page with no indication of WHICH child
// and WHICH section was incomplete. Track per-section errors here so the
// PublicIntakeGuardianWaiverStep can decorate the right card and the
// sub-field component can highlight the specific missing input.
const guardianWaiverStepRef = ref(null);
const guardianWaiverErrors = reactive({});
function clearGuardianWaiverErrors() {
  for (const k of Object.keys(guardianWaiverErrors)) delete guardianWaiverErrors[k];
}
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
const referencesDigitalFormConsent = ref(false);
const referenceContentWaiverAcknowledged = ref(false);
const jobDescriptionSummary = ref(null);
const jobAckPdfZoom = ref(125);
const jobDescriptionAcknowledged = ref(false);
const defaultReferencesAuthorizationNotice =
  'By submitting this information, you authorize [tenant] to contact the individuals listed and obtain information regarding your employment history, educational background, professional conduct, and qualifications for employment.';

const referencesRequiredCount = computed(() => {
  const s = currentFlowStep.value;
  if (!s || s.type !== 'references') return 3;
  return Math.max(1, Number(s.minReferences || 3) || 3);
});
const embeddedSmartSchoolRoi = ref(null);
const embeddedSmartDisclosure = ref(null);
const embeddedPacketSections = ref({});
const packetSectionContexts = ref(null);
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
const registrationReturningAutoMatch = ref(null);

/**
 * First-name for the top-of-success banner greeting. We prefer whatever the
 * guardian explicitly typed for themselves, falling back to the signer name
 * on the submission. Kept short (first token) so the greeting stays
 * conversational ("You're all set, Michael!" not "You're all set, Michael A
 * Mendez!").
 */
const registrationThankYouName = computed(() => {
  const sources = [
    guardianFirstName.value,
    intakeResponses?.guardian?.firstName,
    intakeResponses?.guardian?.first_name,
    intakeResponses?.submission?.firstName,
    registrationCompletion.value?.signerFirstName,
    registrationCompletion.value?.signerName,
    intakeResponses?.signerInfo?.name
  ];
  for (const raw of sources) {
    const str = String(raw || '').trim();
    if (!str) continue;
    return str.split(/\s+/)[0];
  }
  return '';
});

/**
 * Tenant name for the "we're excited you chose <X>" line. Mirrors the
 * `communicationsTenantName` fallback chain so the wording stays consistent
 * with the rest of the flow.
 */
const registrationThankYouTenantName = computed(() =>
  String(
    agencyInfo.value?.official_name
    || agencyInfo.value?.name
    || organizationInfo.value?.official_name
    || organizationInfo.value?.name
    || 'our team'
  ).trim() || 'our team'
);

/**
 * Names of each client (child) that was registered, pulled from
 * `clientBundleLinks` which the backend returns after finalize. This gives
 * the banner a per-child confirmation line so families with multiple
 * children can see every registration landed.
 */
const registeredClientNames = computed(() => {
  const bundles = Array.isArray(clientBundleLinks.value) ? clientBundleLinks.value : [];
  const names = [];
  const seen = new Set();
  for (const b of bundles) {
    const name = String(b?.clientName || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
});

/**
 * Short email-status line shown inside the banner. We deliberately suppress
 * this while the packet is still being prepared (polling for downloadUrl)
 * so the banner doesn't flash a premature "check your email" message.
 */
const registrationEmailMessageForBanner = computed(() => {
  if (!downloadUrl.value) return '';
  if (emailDeliveryStatus.value?.attempted && emailDeliveryStatus.value?.sent === false) {
    return "We couldn't deliver the confirmation email right now — please use the download buttons below to grab your packet.";
  }
  const email = String(
    registrationCompletion.value?.loginEmail || guardianEmail.value || ''
  ).trim();
  return email
    ? `A confirmation with your registration details has been sent to ${email}.`
    : 'A confirmation with your registration details has been emailed to you.';
});

// ── Intake (non-registration) success-page helpers ──
// Parent feedback: the old "Successfully Submitted" screen had no logo, no
// details, no welcome message — just a bare sentence. The computed props
// below feed the new `.intake-thankyou-banner` and the logo row so every
// form type ends on the same reassuring note. These reuse the same name/
// tenant fallbacks as the registration banner so a tenant that customized
// one gets the benefit of both.
const successLogoScreens = computed(() => {
  const screens = Array.isArray(introScreens.value) ? introScreens.value : [];
  return screens.filter((s) => s?.logoUrl);
});
const intakeThankYouName = computed(() => registrationThankYouName.value);
const intakeThankYouTenantName = computed(() => registrationThankYouTenantName.value);
const intakeRegisteredNames = computed(() => {
  // Prefer the per-client bundle list (always populated after finalize). Fall
  // back to clientDisplayNames when the form is non-registration and bundles
  // aren't returned.
  const fromBundles = registeredClientNames.value;
  if (fromBundles.length) return fromBundles;
  const raw = Array.isArray(clientDisplayNames.value) ? clientDisplayNames.value : [];
  const out = [];
  const seen = new Set();
  for (const name of raw) {
    const s = String(name || '').trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
});
const intakeSuccessEmailMessage = computed(() => {
  if (emailDeliveryStatus.value?.attempted && emailDeliveryStatus.value?.sent === false) {
    return "We couldn't send your confirmation email right now — please use the Download buttons below to save your packet.";
  }
  const email = String(guardianEmail.value || '').trim();
  if (email) return `A confirmation with your completed documents has been emailed to ${email}.`;
  return 'A confirmation with your completed documents has been emailed to you.';
});

const loginHelpSending = ref(false);
const loginHelpMessage = ref('');
const missingRequiredQuestionKeys = ref([]);

/** The event the user just registered for (title, date, iCal link) — derived from selections + catalog. */
const registeredEventSummary = computed(() => {
  // Highest-fidelity source: structured event metadata from the backend
  // (populated when the link is hard-bound to a company_event_id, where
  // the user never went through an interactive selection step). This
  // path gives us title + starts_at + address without depending on the
  // registration catalog being loaded.
  const backendEvent = registrationCompletion.value?.event;
  if (backendEvent && (backendEvent.title || backendEvent.startsAt)) {
    const title = String(backendEvent.title || '').trim();
    const startsAtRaw = backendEvent.startsAt || null;
    const endsAtRaw = backendEvent.endsAt || null;
    const startsAtFormatted = startsAtRaw ? formatIsoDatetime(startsAtRaw) : null;
    const icalUrl = startsAtRaw
      ? buildIcalDataUri({
          title,
          startsAt: startsAtRaw,
          endsAt: endsAtRaw,
          description: String(backendEvent.address || '').trim()
        })
      : null;
    const publicEventUrl = String(backendEvent.publicEventUrl || '').trim() || null;
    return { title, startsAtFormatted, icalUrl, startsAtRaw, endsAtRaw, publicEventUrl };
  }

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
  // Public-event URL prefers backend-supplied path (so it's
  // env-aware), then catalog hint. Best-effort.
  const publicEventUrl = String(
    registrationCompletion.value?.event?.publicEventUrl
    || catRow?.publicUrl
    || (eventSel?.entityId ? `/company-events/${eventSel.entityId}` : '')
    || ''
  ).trim() || null;
  return { title, startsAtFormatted, icalUrl, startsAtRaw, endsAtRaw, publicEventUrl };
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
const roiContext = ref(null);
const disclosureContext = ref(null);
const organizationId = ref('');

const guardianFirstName = ref('');
const guardianLastName = ref('');
const guardianEmail = ref('');
const guardianPhone = ref('');
const starterDob = ref('');
const fluentLanguagesInput = ref('');
const guardianRelationship = ref('');
const downloadUrl = ref('');
const clientBundleLinks = ref([]);
const jobApplicationSubmitted = ref(false);

// Multi-child post-submit UX helpers — used on step 3 ("Successfully
// Submitted") to replace the single "Preparing PDF…" panel with a
// multi-child progressive list. We can't rely solely on
// clientBundleLinks.length to detect multi-child because polling starts
// with an empty list and ramps up, so we capture the expected child count
// from the form state at submit time and keep it stable through polling.
const expectedChildCount = computed(() => {
  const kids = Array.isArray(intakeResponses?.clients)
    ? intakeResponses.clients
    : [];
  return Math.max(1, kids.length || 1);
});
const isMultiChildPostSubmit = computed(() => {
  // Job applications never have multiple "kids", so opt them out cleanly.
  if (jobApplicationSubmitted.value) return false;
  return expectedChildCount.value > 1;
});
const isMultiChildPacketsAllReady = computed(() => {
  if (!isMultiChildPostSubmit.value) return false;
  return Array.isArray(clientBundleLinks.value)
    && clientBundleLinks.value.length >= expectedChildCount.value;
});
// While waiting for siblings to finish bundling, render placeholder rows
// for each child whose name we know but whose packet hasn't appeared in
// clientBundleLinks yet. Falls back to "Child N" labels if we don't have
// a name for some reason. Keeps the parent oriented re: how many packets
// are still being generated so they don't think a kid was dropped.
const pendingChildPlaceholders = computed(() => {
  if (!isMultiChildPostSubmit.value) return [];
  const ready = new Set(
    (clientBundleLinks.value || [])
      .map((b) => String(b?.clientName || `Client ${b?.clientId}` || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const allKids = Array.isArray(intakeResponses?.clients)
    ? intakeResponses.clients
    : [];
  const labels = [];
  allKids.forEach((kid, idx) => {
    const first = String(kid?.firstName || '').trim();
    const last = String(kid?.lastName || '').trim();
    const full = [first, last].filter(Boolean).join(' ').trim() || `Child ${idx + 1}`;
    if (!ready.has(full.toLowerCase())) labels.push(full);
  });
  // If we somehow ended up with more bundles than expected names (race
  // condition on the children array), don't surface bogus placeholders.
  return labels.slice(0, Math.max(0, expectedChildCount.value - (clientBundleLinks.value || []).length));
});
const consentErrors = reactive({
  guardianFirstName: '',
  guardianLastName: '',
  guardianEmail: '',
  guardianPhone: '',
  starterDob: '',
  guardianRelationship: '',
  clientFirstName: '',
  clientLastName: '',
  organizationId: ''
});
const intakeForSelf = ref(null);
const whoForError = ref('');

function chooseWhoFor(isSelf) {
  intakeForSelf.value = !!isSelf;
  whoForError.value = '';
}

function continueWhoFor() {
  if (typeof intakeForSelf.value !== 'boolean') {
    whoForError.value = t('chooseWhoForToContinue');
    return;
  }
  consentErrors.guardianFirstName = guardianFirstName.value.trim() ? '' : t('required');
  consentErrors.guardianLastName = guardianLastName.value.trim() ? '' : t('required');
  consentErrors.guardianEmail = guardianEmail.value.trim() ? '' : t('required');
  consentErrors.guardianPhone = guardianPhone.value.trim() ? '' : t('required');
  consentErrors.starterDob = starterDob.value.trim() ? '' : t('required');
  consentErrors.guardianRelationship = intakeForSelf.value === false && !guardianRelationship.value.trim()
    ? t('required')
    : '';
  if (
    consentErrors.guardianFirstName
    || consentErrors.guardianLastName
    || consentErrors.guardianEmail
    || consentErrors.guardianPhone
    || consentErrors.starterDob
    || consentErrors.guardianRelationship
  ) {
    whoForError.value = t('requiredFields');
    return;
  }
  whoForError.value = '';
  if (intakeForSelf.value) {
    intakeResponses.submission = {
      ...(intakeResponses.submission || {}),
      legal_first_name: guardianFirstName.value,
      legal_last_name: guardianLastName.value,
      date_of_birth: starterDob.value,
      phone_number: guardianPhone.value,
      email_address: guardianEmail.value,
      preferred_name: intakeResponses.submission?.preferred_name || guardianFirstName.value
    };
  } else {
    if (!intakeResponses.clients[0] || typeof intakeResponses.clients[0] !== 'object') {
      intakeResponses.clients[0] = {};
    }
    intakeResponses.clients[0].date_of_birth = starterDob.value;
    intakeResponses.clients[0].child_dob = starterDob.value;
    intakeResponses.clients[0].child_date_of_birth = starterDob.value;
    intakeResponses.guardian = {
      ...(intakeResponses.guardian || {}),
      guardian_legal_first: guardianFirstName.value,
      guardian_legal_last: guardianLastName.value,
      guardian_email: guardianEmail.value,
      guardian_phone: guardianPhone.value,
      guardian_relationship_to_child: guardianRelationship.value
    };
  }
  submitConsent();
}

function saveAndComeBackLater() {
  persistDraftSnapshot();
  draftRestoredMessage.value = t('progressSavedComeBack');
  if (draftRestoredBannerTimer) clearTimeout(draftRestoredBannerTimer);
  draftRestoredBannerTimer = setTimeout(() => {
    draftRestoredMessage.value = '';
  }, 8000);
}

function goBackPublicPage() {
  if (step.value === WHO_FOR_STEP) {
    step.value = (!skipBrandingIntro.value && introScreens.value.length) ? 0 : -1;
    return;
  }
  if (step.value === 1) {
    if (asksWhoFor.value) {
      step.value = WHO_FOR_STEP;
      return;
    }
    step.value = (!skipBrandingIntro.value && introScreens.value.length) ? 0 : -1;
    return;
  }
    if (step.value === 2) {
    if (currentFlowIndex.value > 0) {
      goToPrevious();
      return;
    }
    step.value = asksWhoFor.value ? WHO_FOR_STEP : 1;
  }
}
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
  maxReachedProgressIndex: Number(maxReachedProgressIndex.value || 0),
  intakeForSelf: intakeForSelf.value,
  organizationId: organizationId.value || null,
  guardian: {
    firstName: guardianFirstName.value || '',
    lastName: guardianLastName.value || '',
    email: guardianEmail.value || '',
    phone: guardianPhone.value || '',
    relationship: guardianRelationship.value || '',
    dob: starterDob.value || ''
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
  embeddedSmartSchoolRoi: embeddedSmartSchoolRoi.value || null,
  embeddedSmartDisclosure: embeddedSmartDisclosure.value || null,
  packetSectionContexts: packetSectionContexts.value || null,
  multiClientPlan: {
    choice: multiClientPlanChoice.value || 'one',
    consentAccepted: !!multiClientConsentAccepted.value,
    consentAcceptedAt: multiClientConsentAcceptedAt.value || '',
    upfront: !!multiClientUpfrontPlan.value
  },
  // Document template field values keyed by template id — without these,
  // hitting Back or refreshing wiped every answer a parent typed into PDF
  // field overlays even though the rest of the snapshot was intact.
  fieldValuesByTemplate: (() => {
    const snap = {};
    try {
      Object.keys(fieldValuesByTemplate || {}).forEach((tid) => {
        const vals = fieldValuesByTemplate[tid];
        if (vals && typeof vals === 'object') {
          snap[tid] = { ...vals };
        }
      });
    } catch { /* ignore */ }
    return snap;
  })(),
  docStatus: (() => {
    const snap = {};
    try {
      Object.keys(docStatus || {}).forEach((k) => {
        snap[k] = !!docStatus[k];
      });
    } catch { /* ignore */ }
    return snap;
  })()
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
  if (Number(snapshot.step || 0) >= 0.5) return true;
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
  if (snapshot.embeddedSmartDisclosure && typeof snapshot.embeddedSmartDisclosure === 'object') return true;
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
    // Restore the upfront multi-client plan + consent state so a refresh
    // mid-flow doesn't lose the parent's earlier "yes, multiple kids" answer.
    if (parsed.multiClientPlan && typeof parsed.multiClientPlan === 'object') {
      const mcp = parsed.multiClientPlan;
      if (mcp.choice === 'multiple' || mcp.choice === 'one') {
        multiClientPlanChoice.value = mcp.choice;
      }
      multiClientConsentAccepted.value = !!mcp.consentAccepted;
      multiClientConsentAcceptedAt.value = String(mcp.consentAcceptedAt || '');
      multiClientUpfrontPlan.value = !!mcp.upfront;
    }
    guardianFirstName.value = String(parsed.guardian?.firstName || guardianFirstName.value || '');
    guardianLastName.value = String(parsed.guardian?.lastName || guardianLastName.value || '');
    guardianEmail.value = String(parsed.guardian?.email || guardianEmail.value || '');
    guardianPhone.value = String(parsed.guardian?.phone || guardianPhone.value || '');
    guardianRelationship.value = String(parsed.guardian?.relationship || guardianRelationship.value || '');
    starterDob.value = String(parsed.guardian?.dob || starterDob.value || '');

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
      const savedClinical = intakeResponses.submission?.clinicalResponses;
      if (savedClinical && typeof savedClinical === 'object') {
        Object.keys(clinicalResponses).forEach((k) => { delete clinicalResponses[k]; });
        Object.assign(clinicalResponses, savedClinical);
      }
      const refs = intakeResponses.submission.references;
      if (Array.isArray(refs) && refs.length) {
        while (referencesEntries.value.length < Math.max(refs.length, 3)) {
          referencesEntries.value.push({ name: '', relationship: '', organization: '', phone: '', email: '' });
        }
        refs.forEach((r, i) => {
          if (!referencesEntries.value[i]) return;
          referencesEntries.value[i] = {
            name: String(r?.name || ''),
            relationship: String(r?.relationship || ''),
            organization: String(r?.organization || ''),
            phone: String(r?.phone || ''),
            email: String(r?.email || '')
          };
        });
      }
      referencesWaived.value = !!intakeResponses.submission.referencesWaived;
      const rc = intakeResponses.submission.referencesConsent;
      if (rc && typeof rc === 'object') {
        referencesDigitalFormConsent.value = !!rc.digitalFormAtInterviewOrOffer;
        referenceContentWaiverAcknowledged.value = !!rc.referenceContentWaiverAcknowledged;
      }
    }
    embeddedSmartSchoolRoi.value = parsed.embeddedSmartSchoolRoi || null;
    embeddedSmartDisclosure.value = parsed.embeddedSmartDisclosure || null;
    if (parsed.packetSectionContexts && typeof parsed.packetSectionContexts === 'object') {
      packetSectionContexts.value = {
        ...parsed.packetSectionContexts,
        ...(packetSectionContexts.value || {})
      };
    }
    submissionId.value = parsed.submissionId || submissionId.value || null;
    // Rehydrate document-template field values + per-doc completion status
    // so a parent who hits Back (or refreshes) still sees every PDF field
    // answer they typed on previous steps within the 1-hour TTL window.
    if (parsed.fieldValuesByTemplate && typeof parsed.fieldValuesByTemplate === 'object') {
      try {
        Object.keys(fieldValuesByTemplate || {}).forEach((k) => delete fieldValuesByTemplate[k]);
        Object.keys(parsed.fieldValuesByTemplate).forEach((tid) => {
          const vals = parsed.fieldValuesByTemplate[tid];
          if (vals && typeof vals === 'object') {
            fieldValuesByTemplate[tid] = { ...vals };
          }
        });
      } catch { /* ignore */ }
    }
    if (parsed.docStatus && typeof parsed.docStatus === 'object') {
      try {
        Object.keys(docStatus || {}).forEach((k) => delete docStatus[k]);
        Object.keys(parsed.docStatus).forEach((k) => {
          docStatus[k] = !!parsed.docStatus[k];
        });
      } catch { /* ignore */ }
    }
    if (Number.isFinite(Number(parsed.introIndex))) introIndex.value = Math.max(0, Number(parsed.introIndex));
    if (Number.isFinite(Number(parsed.currentFlowIndex))) currentFlowIndex.value = Math.max(0, Number(parsed.currentFlowIndex));
    if (Number.isFinite(Number(parsed.maxReachedProgressIndex))) {
      maxReachedProgressIndex.value = Math.max(0, Number(parsed.maxReachedProgressIndex));
    }
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
  visibleFieldDefinitions.value.filter((def) => !shouldHideDocumentField(def) && def?.type !== 'signature')
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
  const ft = String(link.value?.form_type || '').toLowerCase();
  if (ft === 'smart_registration' || ft === 'medical_records_request' || ft === 'job_application') return false;
  if (Number(link.value?.inherits_office_master || 0) === 1) return false;
  if (String(link.value?.scope_type || '') === 'agency') return false;
  return false;
});
const isSmartSchoolRoi = computed(() => String(link.value?.form_type || '').toLowerCase() === 'smart_school_roi');
const isSmartDisclosure = computed(() => String(link.value?.form_type || '').toLowerCase() === 'smart_disclosure');
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
const jobApplicationPage = computed(() => {
  const raw = jobDescriptionSummary.value?.applicationPage;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
});
const normalizeJobLandingCards = (items, maxItems) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      icon: String(item?.icon || 'none').trim() || 'none',
      title: String(item?.title || '').trim(),
      body: String(item?.body || '').trim()
    }))
    .filter((item) => item.title || item.body)
    .slice(0, maxItems);
};
const jobLandingLogoUrl = computed(() => {
  const firstWithLogo = (introScreens.value || []).find((screen) => screen?.logoUrl);
  return firstWithLogo?.logoUrl || resolveLogoUrl(agencyInfo.value) || '';
});
const jobLandingAgencyName = computed(() =>
  getDisplayName(agencyInfo.value) || getDisplayName(organizationInfo.value) || 'Application'
);
const jobLandingTitle = computed(() =>
  String(jobDescriptionSummary.value?.title || link.value?.title || defaultTitle.value || '').trim()
);
const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const jobLandingTitleHighlight = computed(() => {
  const configured = String(jobApplicationPage.value?.titleHighlight || '').trim();
  if (configured) return configured;
  const city = String(jobDescriptionSummary.value?.city || '').trim();
  if (city && jobLandingTitle.value.toLowerCase().includes(city.toLowerCase())) return city;
  return '';
});
const jobLandingTitleBase = computed(() => {
  const title = jobLandingTitle.value;
  const highlight = jobLandingTitleHighlight.value;
  if (!highlight) return title;
  const trailingPattern = new RegExp(`\\s*[-–—]?\\s*${escapeRegExp(highlight)}\\s*$`, 'i');
  const base = title.replace(trailingPattern, '').trim();
  return base || title;
});
const jobLandingEyebrow = computed(() => String(jobApplicationPage.value?.eyebrow || '').trim());
const jobLandingLead = computed(() => String(jobApplicationPage.value?.lead || '').trim());
const jobLandingAccent = computed(() => {
  const c = String(jobApplicationPage.value?.accentColor || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#1a8c54';
});
const jobLandingDescription = computed(() =>
  String(jobDescriptionSummary.value?.descriptionText || link.value?.description || '').trim()
);
const jobLandingSecureTitle = computed(() =>
  String(jobApplicationPage.value?.secureTitle || 'Secure & Confidential').trim()
);
const jobLandingSecureSubtitle = computed(() =>
  String(jobApplicationPage.value?.secureSubtitle || 'Your information is always protected').trim()
);
const jobLandingHeroImageUrl = computed(() => {
  const raw = String(jobApplicationPage.value?.heroImageUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/assets/')) return raw;
  return toUploadsUrl(raw) || raw;
});
const jobLandingHeroFrameStyle = computed(() => {
  const explicit = String(jobApplicationPage.value?.heroFrameStyle || '').trim().toLowerCase();
  if (['preframed', 'organic', 'rounded'].includes(explicit)) return explicit;
  const preset = getHeroPresetByUrl(String(jobApplicationPage.value?.heroImageUrl || '').trim());
  return preset?.frameStyle || 'preframed';
});
const jobLandingHeroImagePosition = computed(() =>
  String(jobApplicationPage.value?.heroImagePosition || 'center center').trim()
);
const jobLandingShowLeafAccent = computed(() =>
  jobLandingHeroFrameStyle.value === 'organic' && jobApplicationPage.value?.showLeafAccent !== false
);
const jobLandingHeroImageAlt = computed(() =>
  String(jobApplicationPage.value?.heroImageAlt || jobLandingTitle.value || 'Job application image').trim()
);
const jobLandingStartHeading = computed(() =>
  String(jobApplicationPage.value?.startHeading || 'Ready to take the next step?').trim()
);
const jobLandingStartSubtitle = computed(() =>
  String(jobApplicationPage.value?.startSubtitle || 'Click below to start your application. It only takes a few minutes.').trim()
);
const jobLandingStartButtonText = computed(() =>
  String(jobApplicationPage.value?.startButtonText || beginIntakeButtonText.value || 'Start Application').trim()
);
const jobLandingStartTimeNote = computed(() =>
  String(jobApplicationPage.value?.startTimeNote || 'Takes 3-5 minutes to begin').trim()
);
const jobLandingFeatureCards = computed(() =>
  normalizeJobLandingCards(jobApplicationPage.value?.featureCards, 4)
);
const jobLandingHasDescriptionSections = computed(() => {
  const sections = jobDescriptionSummary.value?.descriptionSections;
  const hasPdf = String(jobDescriptionSummary.value?.fileUrl || '').trim();
  if (!sections || typeof sections !== 'object') return hasPdf;
  const about = String(sections.aboutTheRole || '').trim();
  const lists = ['responsibilities', 'qualifications', 'benefits'].some((key) =>
    Array.isArray(sections[key]) && sections[key].some((item) => String(item || '').trim())
  );
  return about || lists || hasPdf;
});
const jobLandingPdfUrl = computed(() => {
  const raw = String(jobDescriptionSummary.value?.fileUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return toUploadsUrl(raw) || raw;
});
const jobLandingPdfLabel = computed(() => {
  const name = String(jobDescriptionSummary.value?.fileName || '').trim();
  return name ? `Download ${name}` : 'Download full PDF';
});
const jobLandingTrustItems = computed(() =>
  normalizeJobLandingCards(jobApplicationPage.value?.trustItems, 3)
);
const formatEducationLevel = (value) => {
  const raw = String(value || '').trim();
  const map = {
    bachelors: 'Bachelors',
    masters_level_intern: 'Masters level intern',
    masters_or_doctoral: 'Masters/Doctoral level'
  };
  return map[raw] || raw;
};
const formatJobDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return raw;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const jobLandingMetaItems = computed(() => {
  const items = [];
  const cityState = [jobDescriptionSummary.value?.city, jobDescriptionSummary.value?.state]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(', ');
  if (cityState) items.push({ label: cityState });
  const education = formatEducationLevel(jobDescriptionSummary.value?.educationLevel);
  if (education) items.push({ label: education });
  const deadline = formatJobDate(jobDescriptionSummary.value?.applicationDeadline);
  if (deadline) items.push({ label: `Apply by ${deadline}` });
  return items;
});
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
// Parent feedback: some legacy intake fields are worded as "…of the above named
// minor" because they were copied from paper packets where the child's name
// appeared above. In the digital flow the child info sits in a different step
// (usually below this one), so the phrasing reads wrong to guardians. Normalize
// the label client-side so we don't need a DB migration for every tenant that
// seeded the legacy text. Keep this list narrow and regex-safe so we don't
// accidentally mangle a label a tenant actually wants.
const LABEL_NORMALIZATIONS = Object.freeze([
  { pattern: /\babove[\s-]?named\s+minor\b/gi, replacement: 'named minor' },
  { pattern: /\babove[\s-]?named\s+client\b/gi, replacement: 'named client' },
  { pattern: /\babove[\s-]?named\s+dependent\b/gi, replacement: 'named dependent' }
]);
const normalizeIntakeFieldLabel = (raw) => {
  let s = String(raw || '');
  for (const { pattern, replacement } of LABEL_NORMALIZATIONS) {
    s = s.replace(pattern, replacement);
  }
  return s;
};
// A field row is "usable" when it has enough data to render meaningfully.
// This drops ghost rows that got saved with a blank label AND blank key (a known
// side effect of the intake-link builder's "Add field" default state), which
// were rendering as an unlabeled typeable text input in sections like
// "One-time Questions" / "Guardian Questions" on the public form.
const isUsableIntakeField = (f) => {
  if (!f || typeof f !== 'object') return false;
  if (f.type === 'info') return true; // info blocks can legitimately be label-light
  const label = String(f.label ?? '').trim();
  const key = String(f.key ?? '').trim();
  return !!(label || key);
};
const intakeFields = computed(() => {
  const raw = Array.isArray(link.value?.intake_fields) ? link.value.intake_fields : [];
  return raw
    .filter(isUsableIntakeField)
    .map((f) => {
      const label = normalizeIntakeFieldLabel(f?.label);
      return label === f?.label ? f : { ...f, label };
    })
    // Require a non-empty label for anything other than info blocks — otherwise
    // we'd still render an unlabeled input even though the field has a key.
    .filter((f) => f.type === 'info' || String(f.label ?? '').trim().length > 0);
});
const guardianFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'guardian'));
const submissionFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'submission'));
const clientFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'client'));
/** Adaptive shell section grouping for existing intake_fields (presentation helper; storage keys unchanged). */
const adaptiveIntakeFieldGroups = computed(() =>
  groupIntakeFieldsForAdaptiveShell(intakeFields.value || [])
);

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
  const bag = questionValues.value;
  const raw = bag?.[field.key];
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
      const cur = String(bag?.[f.key] || '').trim();
      if (!cur) {
        if (/city|town/.test(k)) bag[f.key] = city;
        else if (/state|province/.test(k)) bag[f.key] = state;
      }
    });
  } catch {
    // ignore lookup errors
  }
};

const isIntakeFieldVisible = (field, values = {}) => {
  return matchesShowIf(field?.showIf, values);
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

/** Grid span for intake dynamic fields — keeps short answers (grade, zip) compact. */
const intakeFieldGridSpan = (field) => {
  if (!field) return 'form-group--span-6';
  const type = String(field.type || 'text').toLowerCase();
  const key = normalizeKey(field.key || field.id || '');
  const label = normalizeKey(field.label || field.labelEn || field.label_es || '');
  const token = `${key} ${label}`;

  if (type === 'textarea' || type === 'info' || type === 'checkbox') {
    return 'form-group--span-12';
  }

  if (type === 'radio') {
    const opts = Array.isArray(field.options) ? field.options : [];
    return opts.length <= 3 ? 'form-group--span-6' : 'form-group--span-12';
  }

  if (token.includes('grade')) return 'form-group--span-3';

  const compactKeys = [
    'zip',
    'postal',
    'state',
    'sex',
    'gender',
    'dob',
    'birth',
    'phone',
    'apt',
    'apartment',
    'unit',
    'suffix',
    'age',
    'county',
    'relationship',
    'language'
  ];
  if (type === 'date' || compactKeys.some((part) => token.includes(part))) {
    return 'form-group--span-4';
  }

  if (token.includes('city')) return 'form-group--span-4';

  if (token.includes('street') || token.includes('address') || token.includes('line1') || token.includes('line2')) {
    return 'form-group--span-8';
  }

  if (
    token.includes('first') ||
    token.includes('last') ||
    token.includes('name') ||
    token.includes('email') ||
    token.includes('middle')
  ) {
    return 'form-group--span-6';
  }

  if (type === 'select' && Array.isArray(field.options) && field.options.length <= 8) {
    return 'form-group--span-4';
  }

  return 'form-group--span-6';
};

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
    let preferredLocale = null;
    try {
      const stored = localStorage.getItem('preferredFormLanguage');
      if (stored === 'es' || stored === 'en') preferredLocale = stored;
    } catch { /* ignore */ }
    const localeHint = usesSchoolMaster.value
      ? (inPageLocale.value === 'es' ? 'es' : 'en')
      : preferredLocale;
    const resp = await api.get(
      `/public-intake/${publicKey}`,
      localeHint ? { params: { locale: localeHint } } : undefined
    );
    link.value = resp.data?.link || null;
    if (link.value?.organization_id && !organizationId.value) {
      organizationId.value = String(link.value.organization_id);
    }
    try {
      const lang = String(link.value?.language_code || 'en').toLowerCase();
      if (lang === 'es') {
        const cached = localStorage.getItem(`intakeEnglishKey:${publicKey}`);
        if (cached) linkedLanguageEnglishPublicKey.value = cached;
      } else if (link.value?.linked_es_form?.public_key) {
        localStorage.setItem(
          `intakeEnglishKey:${link.value.linked_es_form.public_key}`,
          publicKey
        );
      }
      const map = link.value?.document_translation_map;
      const hasMap = map != null && typeof map === 'object' && Object.keys(map).length > 0;
      const hasQuestionLabelsEs = spanishQuestionLabelsEnabledFromLink(link.value);
      const isSmartRoiForm = String(link.value?.form_type || '').toLowerCase() === 'smart_school_roi';
      if (usesSchoolMaster.value) {
        const masterLang = String(link.value?.master_language_code || link.value?.language_code || 'en')
          .toLowerCase()
          .startsWith('es') ? 'es' : 'en';
        inPageLocale.value = preferredLocale || masterLang;
      } else if (hasMap || hasQuestionLabelsEs || isSmartRoiForm) {
        const stored = preferredLocale;
        const linkLang = String(link.value?.language_code || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
        if (stored === 'es' || stored === 'en') {
          inPageLocale.value = stored;
        } else {
          inPageLocale.value = linkLang;
        }
        if (inPageLocale.value === 'es' && (hasMap || hasQuestionLabelsEs)) {
          fetchStringTranslations();
        }
      }
    } catch { /* ignore */ }
    boundClient.value = resp.data?.boundClient || null;
    roiContext.value = resp.data?.roiContext || null;
    disclosureContext.value = resp.data?.disclosureContext
      || resp.data?.link?.disclosureContext
      || link.value?.disclosureContext
      || null;
    packetSectionContexts.value = resp.data?.packetSectionContexts || null;
    templates.value = resp.data?.templates || [];
    agencyInfo.value = resp.data?.agency || null;
    organizationInfo.value = resp.data?.organization || null;
    formBranding.value = resp.data?.branding || null;
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
      && String(link.value?.form_type || '').toLowerCase() !== 'smart_disclosure'
      && String(link.value?.form_type || '').toLowerCase() !== 'smart_registration'
      && !hasProgrammedSchoolRoiStep.value
      && !hasProgrammedDisclosureStep.value
      && !hasRegistrationStep.value
    ) {
      fatalError.value = 'No documents configured for this intake link.';
    } else if (String(link.value?.form_type || '').toLowerCase() === 'smart_school_roi') {
      fatalError.value = '';
    } else if (String(link.value?.form_type || '').toLowerCase() === 'smart_disclosure') {
      fatalError.value = '';
    } else if (hasProgrammedSchoolRoiStep.value || hasProgrammedDisclosureStep.value) {
      fatalError.value = '';
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
    fatalError.value = e.response?.data?.error?.message || 'Failed to load intake link';
  } finally {
    loading.value = false;
  }
};

/**
 * Swap the current form to its linked English/Spanish counterpart.
 * We navigate to the other form's public URL (via router.replace so the
 * browser back button still works as users expect) and persist the user's
 * language choice for future visits via localStorage.
 */
const switchLinkedLanguage = async (target) => {
  const targetLang = String(target || '').toLowerCase().startsWith('es') ? 'es' : 'en';
  if (linkedLanguageSwitching.value) return;

  // Published school masters: stay on this public URL and reload EN/ES content.
  if (usesSchoolMaster.value) {
    if (targetLang === inPageLocale.value && String(link.value?.master_language_code || '') === targetLang) {
      return;
    }
    inPageLocale.value = targetLang;
    try { localStorage.setItem('preferredFormLanguage', targetLang); } catch { /* ignore */ }
    linkedLanguageSwitching.value = true;
    try {
      await loadLink();
    } finally {
      linkedLanguageSwitching.value = false;
    }
    return;
  }

  // In-page locale switch (document map and/or saved question labels — no separate form navigation).
  if (hasInPageSpanish.value) {
    inPageLocale.value = targetLang;
    try { localStorage.setItem('preferredFormLanguage', targetLang); } catch { /* ignore */ }
    return;
  }

  // Legacy whole-form linked approach: navigate to the Spanish form URL.
  if (targetLang === currentFormLanguage.value) return;
  try {
    linkedLanguageSwitching.value = true;
    let destinationKey = null;
    if (targetLang === 'es') {
      destinationKey = link.value?.linked_es_form?.public_key || null;
      if (!destinationKey) {
        const resp = await api.get(`/public-intake/${publicKey}/linked-translation`);
        destinationKey = resp?.data?.link?.public_key || null;
      }
    } else {
      destinationKey = linkedLanguageEnglishPublicKey.value || null;
    }
    if (!destinationKey) {
      error.value = targetLang === 'es'
        ? 'A Spanish version of this form is not yet configured.'
        : 'Unable to switch back to English.';
      return;
    }
    try { localStorage.setItem('preferredFormLanguage', targetLang); } catch { /* ignore */ }
    try {
      if (targetLang === 'es' && publicKey) {
        localStorage.setItem(`intakeEnglishKey:${destinationKey}`, publicKey);
      }
    } catch { /* ignore */ }
    const currentPath = route.path || '';
    const base = currentPath.startsWith('/intake/')
      ? '/intake/'
      : currentPath.startsWith('/preferences-form/')
        ? '/preferences-form/'
        : currentPath.startsWith('/i/')
          ? '/i/'
          : '/intake/';
    await router.replace({ path: `${base}${destinationKey}`, query: { ...route.query, lang: targetLang } });
    window.location.reload();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to switch language.';
  } finally {
    linkedLanguageSwitching.value = false;
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
  consentErrors.guardianLastName = !guardianLastName.value.trim() ? t('required') : '';
  consentErrors.guardianPhone = !guardianPhone.value.trim() ? t('required') : '';
  const clientFirst = intakeForSelf.value ? guardianFirstName.value : clients.value?.[0]?.firstName;
  const clientLast = intakeForSelf.value ? guardianLastName.value : clients.value?.[0]?.lastName;
  const clientNamesLater = step.value === WHO_FOR_STEP && intakeForSelf.value === false;
  consentErrors.clientFirstName = (isJobApplication.value || isClientBound.value || clientNamesLater) ? '' : (String(clientFirst || '').trim() ? '' : t('required'));
  consentErrors.clientLastName = (isJobApplication.value || isClientBound.value || clientNamesLater) ? '' : (String(clientLast || '').trim() ? '' : t('required'));
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
  // Auto-handle the upfront multi-client plan so parents don't get stuck on
  // "how many children are you submitting today?" with no visible error when
  // they tapped "Two or more children" but never clicked Yes/No on the
  // consent panel. Default behaviour: auto-accept the shared-signature
  // consent (they chose "multiple"), which matches the rest of the flow's
  // "keep the user moving" pattern. If the consent panel is somehow still
  // open (race condition), at least scroll it into view instead of silently
  // continuing with an inconsistent state.
  if (
    !intakeForSelf.value
    && !isClientBound.value
    && multiClientPlanChoice.value === 'multiple'
    && !multiClientConsentAccepted.value
    && !multiClientConsentDeclined.value
  ) {
    if (multiClientConsentDialogOpen.value) {
      acceptMultiClientConsent();
    } else {
      multiClientConsentDialogOpen.value = true;
      await nextTick();
      try {
        const el = document.querySelector('.multi-client-plan-block');
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch { /* best-effort */ }
      return;
    }
  }

  if (showSpanishClarificationBlock.value) {
    ensureSpanishClarificationShape();
    const missingKey = firstMissingSpanishClarificationField(intakeResponses.submission.spanishClarification);
    if (missingKey) {
      spanishClarificationMissingKey.value = missingKey;
      stepError.value = 'Por favor complete todas las preguntas de aclaración de idioma.';
      error.value = '';
      await nextTick();
      const el = document.querySelector(`[data-spanish-clarification-key="${CSS.escape(missingKey)}"]`);
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    spanishClarificationMissingKey.value = '';
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
        smartSchoolRoi: embeddedSmartSchoolRoi.value || null,
        smartDisclosure: embeddedSmartDisclosure.value || null
      }
    };
    const resp = await api.post(`/public-intake/${publicKey}/consent`, payload);
    submissionId.value = resp.data?.submission?.id || null;
    if (resp.data?.clientMatch && typeof resp.data.clientMatch === 'object') {
      Object.assign(intakeResponses.submission, resp.data.clientMatch);
    }
    step.value = 2;
  } catch (e) {
    stepError.value = e.response?.data?.error?.message || 'Failed to capture consent';
  } finally {
    consentLoading.value = false;
  }
};

const onSigned = (dataUrl) => {
  const value = typeof dataUrl === 'string' ? dataUrl : dataUrl?.dataUrl || '';
  if (!value) return;
  signatureData.value = value;
  lastSignatureData.value = value;
  showSavedSigPrompt.value = false;
  signatureBlockFlash.value = false;
};

const documentConsentCards = computed(() => {
  const steps = (flowSteps.value || []).filter((s) => s?.type === 'document' && s?.template);
  return steps.map((s, i) => ({
    id: s.template.id,
    title: s.template.name || s.label || `Document ${i + 1}`,
    description: s.template.description || 'Review this document, then sign below when ready.',
    icon: s.template.document_action_type === 'signature' ? '✍️' : '📄'
  }));
});

function jumpToDocumentById(docId) {
  const idx = (flowSteps.value || []).findIndex(
    (s) => s?.type === 'document' && Number(s?.template?.id) === Number(docId)
  );
  if (idx >= 0) {
    currentFlowIndex.value = idx;
    syncDocIndexFromFlow();
    stepError.value = '';
  }
}

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
  if (isCheckboxGroupField(field)) return !Array.isArray(val) || val.length === 0;
  if (field.type === 'checkbox') return val !== true && val !== 'yes';
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
      const focusTarget = container?.querySelector('input, textarea, select, [tabindex], button');
      if (focusTarget?.focus) focusTarget.focus();
    }
    return;
  }
  missingRequiredQuestionKeys.value = [];
  stepError.value = '';
  const stepId = String(currentFlowStep.value?.sourceId || currentFlowStep.value?.id || '');
  if (stepId === 'counseling_self_about_you') {
    const sub = intakeResponses.submission || {};
    if (sub.legal_first_name) guardianFirstName.value = sub.legal_first_name;
    if (sub.legal_last_name) guardianLastName.value = sub.legal_last_name;
    if (sub.email_address) guardianEmail.value = sub.email_address;
    if (sub.phone_number) guardianPhone.value = sub.phone_number;
  }
  if (stepId === 'counseling_dep_about_you') {
    const g = intakeResponses.guardian || {};
    if (g.guardian_legal_first) guardianFirstName.value = g.guardian_legal_first;
    if (g.guardian_legal_last) guardianLastName.value = g.guardian_legal_last;
    if (g.guardian_email) guardianEmail.value = g.guardian_email;
    if (g.guardian_phone) guardianPhone.value = g.guardian_phone;
    if (g.guardian_relationship_to_child) guardianRelationship.value = g.guardian_relationship_to_child;
  }
  const childIdx = currentFlowStep.value?.clientIndex;
  if (Number.isInteger(childIdx)) {
    const bag = intakeResponses.clients[childIdx] || {};
    if (stepId === 'counseling_dep_about_child') {
      if (!clients.value[childIdx]) clients.value[childIdx] = { firstName: '', lastName: '' };
      const first = String(bag.child_preferred_name || bag.child_legal_first || '').trim();
      const last = String(bag.child_legal_last || '').trim();
      if (first) clients.value[childIdx].firstName = first;
      if (last) clients.value[childIdx].lastName = last;
    }
    if (bag.trauma_discuss_privately === 'yes') {
      bag.flagDiscussPrivately = true;
      bag.clinicalPrivateDiscussion = 'Discuss privately during intake appointment.';
    }
    if (bag.discuss_privately === 'yes') {
      bag.flagGuardianPrivateDiscussion = true;
      bag.guardianPrivateDiscussion = 'Guardian requests private discussion.';
    }
    bag.clinicalSafetyAlert = isClinicalSafetyPositive(interviewShowIfValues.value);
  }
  intakeResponses.submission.clinicalSafetyAlert = showClinicalSafetyBanner.value;
  await nextFlowStep();
};

const completeRegistrationStep = async () => {
  const stepMeta = currentFlowStep.value;
  if (!stepMeta || stepMeta.type !== 'registration') return;
  const rules = getCurrentRegistrationRules();
  const selectedIds = getRegistrationSelectionIds(stepMeta.id);
  // If the admin hasn't configured any options for this registration step
  // (or the catalog returned nothing relevant for this guardian), treat
  // Continue as "there's nothing to pick here, move on" rather than
  // dead-ending the parent on "Please select at least one option."
  const availableOptions = Array.isArray(currentRegistrationOptions.value)
    ? currentRegistrationOptions.value.length
    : 0;
  if (availableOptions === 0 && selectedIds.length === 0) {
    stepError.value = '';
    await nextFlowStep();
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
        alreadyInSystem: false,
        lookupField: String(stepMeta.existingLookupField || 'email'),
        lookupValue: ''
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
    stepError.value = tx('Missing waiver data. Please refresh and try again.');
    return;
  }

  clearGuardianWaiverErrors();
  const localizeWaiverMsg = (message, label) => {
    if (typeof message !== 'string') return message;
    if (message.includes('{label}')) return txFmt(message, { label });
    return tx(message);
  };
  // Collect ALL problems up front so each offending card gets a red banner
  // + the specific missing field gets highlighted, instead of just the first
  // one bubbling up to the page-level error.
  let firstErrorRef = null;
  let firstErrorMessage = '';
  const recordError = (cIdx, sectionKey, message, extra) => {
    const label = guardianWaiverClientLabels.value[cIdx] || `${tx('Child')} ${cIdx + 1}`;
    const localized = localizeWaiverMsg(message, label);
    if (!guardianWaiverErrors[cIdx]) guardianWaiverErrors[cIdx] = {};
    guardianWaiverErrors[cIdx][sectionKey] = extra !== undefined ? extra : localized;
    if (!firstErrorRef) {
      firstErrorRef = { cIdx, sectionKey };
      firstErrorMessage = localized;
    }
  };

  // Real US-style phone validation. The previous validator only required a
  // non-empty string, which is how "78899902" (8 digits) made it through.
  const isRealPhone = (v) => {
    const d = String(v ?? '').replace(/\D+/g, '');
    return d.length === 10 || (d.length === 11 && d.startsWith('1'));
  };

  for (let i = 0; i < gw.clients.length; i += 1) {
    const label = guardianWaiverClientLabels.value[i] || `Child ${i + 1}`;
    for (const key of keys) {
      const sec = gw.clients[i].sections?.[key];
      if ((key === 'pickup_authorization' || key === 'walk_home_authorization')
          && isOptionalGuardianWaiverSectionSkipped(key, sec?.payload)) {
        continue;
      }
      if (key === 'pickup_authorization') {
        const puPayload = sec?.payload || {};
        const puRows = Array.isArray(puPayload.authorizedPickups) ? puPayload.authorizedPickups : [];
        const badPhoneRow = puRows.find((row) => {
          const hasAny = hasAnyFilledText([row?.name, row?.relationship, row?.phone]);
          if (!hasAny) return false;
          return !isRealPhone(row?.phone);
        });
        if (badPhoneRow) {
          recordError(
            i,
            key,
            'Please enter a real 10-digit phone number for every pickup contact you list for {label} (we\'ll need to call them at check-out time).'
          );
          continue;
        }
      }
      if (key === 'walk_home_authorization') {
        const whPayload = sec?.payload || {};
        if (whPayload.allowedToWalkHome === true) {
          const fieldErrors = {};
          if (!String(whPayload.allowedWindow || '').trim()) {
            fieldErrors.allowedWindow = 'Required — describe when your child is approved to walk home.';
          }
          if (whPayload.attestation !== true) {
            fieldErrors.attestation = 'Please check the attestation box to confirm you authorize this.';
          }
          if (Object.keys(fieldErrors).length) {
            recordError(
              i,
              key,
              'Please complete the walk-home authorization details for {label}, or change your selection to "I do NOT authorize."',
              fieldErrors
            );
            continue;
          }
        }
      }
      if (key === 'emergency_contacts') {
        const ecPayload = sec?.payload || {};
        if (ecPayload.declineEmergencyContacts === true) continue;
        const ecRows = Array.isArray(ecPayload.contacts) ? ecPayload.contacts : [];
        if (!ecRows.some((row) => hasAnyFilledText([row?.name, row?.relationship, row?.phone]))) {
          recordError(
            i,
            key,
            'Please add at least one emergency contact for {label}, or check "I do not want to list emergency contacts at this time."'
          );
          emergencyPulse.value = true;
          if (emergencyPulseTimer) clearTimeout(emergencyPulseTimer);
          emergencyPulseTimer = setTimeout(() => { emergencyPulse.value = false; }, 2600);
          continue;
        }
        const touchedWithoutPhone = ecRows.find((row) => {
          const name = String(row?.name ?? '').trim();
          const rel = String(row?.relationship ?? '').trim();
          const phone = String(row?.phone ?? '').trim();
          return (name || rel) && !phone;
        });
        if (touchedWithoutPhone) {
          recordError(
            i,
            key,
            'Phone number is required for each emergency contact you list for {label}.'
          );
          emergencyPulse.value = true;
          if (emergencyPulseTimer) clearTimeout(emergencyPulseTimer);
          emergencyPulseTimer = setTimeout(() => { emergencyPulse.value = false; }, 2600);
          continue;
        }
        const badPhoneRow = ecRows.find((row) => {
          const hasAny = hasAnyFilledText([row?.name, row?.relationship, row?.phone]);
          if (!hasAny) return false;
          return !isRealPhone(row?.phone);
        });
        if (badPhoneRow) {
          recordError(
            i,
            key,
            `Please enter a real 10-digit phone number for every emergency contact you list for ${label} — we have to be able to actually reach them.`
          );
          emergencyPulse.value = true;
          if (emergencyPulseTimer) clearTimeout(emergencyPulseTimer);
          emergencyPulseTimer = setTimeout(() => { emergencyPulse.value = false; }, 2600);
          continue;
        }
      }
      if (!sec) {
        recordError(
          i,
          key,
          `Please complete ${guardianWaiverSectionLabels[key] || 'all waiver sections'} for ${label}.`
        );
        continue;
      }
      // IMPORTANT — DO NOT silently auto-apply the saved signature here.
      // The previous version did `sec.signatureData = savedSig` whenever a
      // signature was missing, which let the parent advance through the
      // entire waiver pipeline without ever clicking "Apply my signature
      // to this section". That broke the e-signature audit trail because
      // signatureMeta.{signedAt, sourceMethod} was never recorded for those
      // sections — the kid's waiver looked legally signed but no human had
      // clicked anything to attest. Now we treat a missing signature as a
      // hard block, which is what makes the per-section pulse + click-to-
      // apply UX legitimate.
      if (String(sec.signatureData || '').trim().length < 10) {
        recordError(
          i,
          key,
          `Please click "Apply my signature" on the ${guardianWaiverSectionLabels[key] || 'waiver'} section for ${label} — we don't accept un-signed waivers.`
        );
        continue;
      }
      // Stamp signature metadata even if the signature was applied via the
      // earlier pulsing button — this guarantees every signed section has an
      // audit row at finalize time. (The button's onClick already populates
      // signatureMeta; this is the safety-net for legacy in-flight sessions
      // saved before signatureMeta existed.)
      if (!sec.signatureMeta || typeof sec.signatureMeta !== 'object') {
        sec.signatureMeta = {
          signedAt: new Date().toISOString(),
          signerName:
            [guardianFirstName.value, guardianLastName.value].filter(Boolean).join(' ').trim()
            || null,
          sourceMethod: 'reused_guardian_signature',
          consentAcknowledged: true,
          intentToSign: true,
          sectionKey: key,
          clientIndex: i
        };
      }
      if (key === 'allergies_snacks') {
        const p = sec?.payload || {};
        const filled = (v) => String(v ?? '').trim().length > 0;
        // Per-field structured errors so GwvFieldsAllergies can highlight the
        // exact textarea the guardian missed. Falls back to a single message
        // if every field is blank so we don't spam three identical labels.
        const missing = {};
        if (!filled(p.allergies)) missing.allergies = 'Required — type "None" if not applicable.';
        if (!filled(p.approvedSnacks)) missing.approvedSnacks = 'Required — type "None" if not applicable.';
        if (!filled(p.notes)) missing.notes = 'Required — type "None" if not applicable.';
        if (Object.keys(missing).length) {
          recordError(
            i,
            key,
            `Please complete allergies, approved snacks, and notes for ${label} (use the "No medical info to report" checkbox if none).`,
            missing
          );
          continue;
        }
      }
    }
  }

  if (firstErrorRef) {
    stepError.value = firstErrorMessage;
    // Defer to next tick so freshly-rendered error cards are in the DOM
    // before we try to scroll.
    nextTick(() => {
      guardianWaiverStepRef.value?.scrollToSection?.(
        firstErrorRef.cIdx,
        firstErrorRef.sectionKey
      );
    });
    return;
  }

  stepError.value = '';
  void nextFlowStep();
};

const insuranceStepRef = ref(null);
// Inline error map for the insurance step. Populated by completeInsuranceStep
// whenever Continue is blocked, then passed into PublicIntakeInsuranceStep
// so the parent sees the offending control highlighted in-place instead of
// only seeing a top-of-page banner they have to scroll back up to read.
// Keys: 'card', 'memberId', 'authorization'.
const insuranceErrors = reactive({});
function clearInsuranceErrors() {
  for (const k of Object.keys(insuranceErrors)) delete insuranceErrors[k];
}
function setInsuranceError(anchor, message) {
  insuranceErrors[anchor] = message;
}
// Auto-clear an inline error on the insurance step the moment the user
// edits the related field, so they don't see a stale red banner after
// fixing the issue. Called from the @update:model-value handler.
function clearInsuranceErrorsOnEdit(insBag) {
  if (!insBag || typeof insBag !== 'object') return;
  if (insuranceErrors.card) {
    const hasFront = !!(insBag.primary_front_url || insBag.cardFrontUrl);
    const hasBack = !!(insBag.primary_back_url || insBag.cardBackUrl);
    const noCard = !!insBag.noPrimaryCardAvailable;
    if (hasFront || hasBack || noCard) delete insuranceErrors.card;
  }
  if (insuranceErrors.memberId) {
    const memberId = String(insBag?.primary?.memberId || '').trim();
    const insurer = String(insBag?.primary?.insurerName || '').trim();
    if (memberId || insurer) delete insuranceErrors.memberId;
  }
  if (insuranceErrors.authorization) {
    const hasDrawn = String(insBag.authorizationSignatureData || '').trim().length >= 50;
    const hasTyped = String(insBag.authorizationSignature || '').trim().length >= 2;
    if (hasDrawn || hasTyped) delete insuranceErrors.authorization;
  }
}

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

  // Self-Pay fast path: the dedicated toggle at the top of the insurance step
  // bypasses every insurer-specific requirement (carrier name, member ID, card
  // photos). We still require the Insurance Authorization signature below so
  // there's a paper trail for the assignment-of-benefits language.
  const selfPayDeclared = !!(insInfo.isSelfPay || insuranceEntryState.isSelfPay);
  if (selfPayDeclared) {
    insInfo.isSelfPay = true;
    insInfo.primary.insurerName = 'Self-Pay';
    insInfo.primary.memberId = '';
    insInfo.primary.groupNumber = '';
    insInfo.primary.patientSuffix = '';
    insInfo.primary.isMedicaid = false;
    insInfo.primaryIsMedicaid = false;
    insInfo.hasSecondary = false;
    insInfo.secondary = null;
  } else if (!hasPrimaryCardImage && !noPrimaryCardAvailable) {
    const msg = 'Please upload your primary insurance card, or check "I do not have my primary insurance card right now."';
    stepError.value = msg;
    setInsuranceError('card', msg);
    nextTick(() => insuranceStepRef.value?.scrollToAnchor?.('card'));
    return;
  } else if (!insInfo.primary?.insurerName && memberId) {
    const msg = 'Please select your primary insurance provider before continuing.';
    stepError.value = msg;
    setInsuranceError('memberId', msg);
    nextTick(() => insuranceStepRef.value?.scrollToAnchor?.('memberId'));
    return;
  } else if (noPrimaryCardAvailable && !insurerName && !memberId) {
    insInfo.primary.insurerName = 'Self-Pay / No Insurance';
    insInfo.primary.memberId = '';
    insInfo.primary.groupNumber = String(insInfo.primary.groupNumber || '');
    insInfo.primary.patientSuffix = String(insInfo.primary.patientSuffix || '');
    insInfo.primary.subscriberName = String(insInfo.primary.subscriberName || '');
    insInfo.primary.isMedicaid = false;
    insInfo.primaryIsMedicaid = false;
  } else if (insurerName && !memberId && !medicaidPrimary && !/self.pay|no insurance/i.test(insurerName)) {
    const msg = 'Please enter your primary insurance Member / Policy ID (or choose Medicaid if applicable).';
    stepError.value = msg;
    setInsuranceError('memberId', msg);
    nextTick(() => insuranceStepRef.value?.scrollToAnchor?.('memberId'));
    return;
  } else {
    insInfo.primary.isMedicaid = medicaidPrimary;
    insInfo.primaryIsMedicaid = medicaidPrimary;
  }
  // Require the insurance authorization to be acknowledged. The signature
  // can come from either path:
  //   1) The parent clicked "Apply my signature" — produces
  //      authorizationSignatureData (data URL) + authorizationSignedAt.
  //   2) The parent typed a name (only available when no drawn signature
  //      exists yet) — produces authorizationSignature (>= 2 chars) +
  //      authorizationSignedAt.
  // Either is a legal e-signature; both record signedAt locally and the
  // server stamps ip + user_agent at finalize.
  const authBundle = insuranceStepRef.value?.getAuthorizationSignatureBundle?.() || {};
  const typedName = String(authBundle.authorizationSignature || '').trim();
  const drawnData = String(authBundle.authorizationSignatureData || '').trim();
  const hasDrawn = drawnData.length >= 50;
  const hasTyped = typedName.length >= 2;
  if (!hasDrawn && !hasTyped) {
    const msg = lastSignatureData.value
      ? 'Please click "Apply my signature to this authorization" to sign the Insurance Authorization at the bottom of this step.'
      : 'Please sign the Insurance Authorization acknowledgment at the bottom of this step before continuing.';
    stepError.value = msg;
    setInsuranceError('authorization', msg);
    nextTick(() => insuranceStepRef.value?.scrollToAnchor?.('authorization'));
    return;
  }
  insInfo.authorizationSignature = typedName;
  insInfo.authorizationSignatureData = drawnData;
  insInfo.authorizationSignedAt = String(authBundle.authorizationSignedAt || new Date().toISOString());
  insInfo.authorizationSourceMethod = String(
    authBundle.authorizationSourceMethod
    || (hasDrawn ? 'reused_guardian_signature' : 'typed_full_name')
  );

  clearInsuranceErrors();
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
    stepError.value = tx('Please choose an email communication preference.');
    return;
  }
  if (!communications.smsPreference) {
    stepError.value = tx('Please choose an SMS communication preference.');
    return;
  }
  if (step?.campaigns?.providerTexting && !communications.providerTextingOptIn) {
    stepError.value = tx('Please choose whether to enable provider/care-team texting.');
    return;
  }
  if (step?.campaigns?.programUpdates && !communications.programUpdatesOptIn) {
    stepError.value = tx('Please choose whether to enable optional program updates.');
    return;
  }
  if (step?.campaigns?.internalWorkforce && !communications.internalWorkforceOptIn) {
    stepError.value = tx('Please choose whether to enable internal workforce notifications.');
    return;
  }
  intakeResponses.submission.communicationPreferences = {
    emailPreference: communications.emailPreference,
    smsPreference: communications.smsPreference,
    providerTextingOptIn: step?.campaigns?.providerTexting ? communications.providerTextingOptIn : null,
    programUpdatesOptIn: step?.campaigns?.programUpdates ? communications.programUpdatesOptIn : null,
    internalWorkforceOptIn: step?.campaigns?.internalWorkforce ? communications.internalWorkforceOptIn : null,
    termsUrl: platformTermsUrl.value,
    privacyUrl: platformPrivacyUrl.value
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

// Fired when the guardian confirms "Continue without payment method".
// Auto-advances to the next step so they don't have to click the footer
// Continue button a second time (redundant UX).
const onPaymentSkipAcknowledged = (skipModel) => {
  if (!intakeResponses.submission.paymentInfo) {
    intakeResponses.submission.paymentInfo = {};
  }
  Object.assign(intakeResponses.submission.paymentInfo, skipModel || { skipAcknowledged: true });
  stepError.value = '';
  void nextFlowStep();
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
  intakeResponses.submission.clinicalSafetyAlert = showClinicalSafetyBanner.value;
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
  if (currentFlowStep.value?.type === 'child_review') {
    stepError.value = '';
    return nextFlowStep();
  }
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
  if (currentFlowStep.value?.type === 'questions') return 'Save & continue';
  if (currentFlowStep.value?.type === 'child_review') return t('continue');
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

// Strip heavy fields (large base64 data URLs from insurance card previews,
// signature preview images, etc.) before sending the finalize payload.
// Insurance card photos are uploaded out-of-band as multipart to
// `/insurance-card-photos`; the canonical references that matter for the
// backend are the resulting `*_url` fields, not the in-memory previews.
// Without this, parents who upload high-res phone photos can blow past the
// JSON body limit and get a 413 Content Too Large at /finalize.
const sanitizeFinalizeResponses = (input) => {
  const MAX_INLINE_DATA_URL = 200 * 1024; // 200KB safety cap for any data: URL
  const seen = new WeakSet();
  const PREVIEW_KEYS = new Set([
    'primary_front_preview',
    'primary_back_preview',
    'secondary_front_preview',
    'secondary_back_preview'
  ]);
  const walk = (val) => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') {
      if (val.length > MAX_INLINE_DATA_URL && val.startsWith('data:')) {
        return '';
      }
      return val;
    }
    if (Array.isArray(val)) {
      return val.map(walk);
    }
    if (typeof val === 'object') {
      if (seen.has(val)) return null;
      seen.add(val);
      const out = {};
      for (const [k, v] of Object.entries(val)) {
        if (PREVIEW_KEYS.has(k)) continue;
        out[k] = walk(v);
      }
      return out;
    }
    return val;
  };
  try {
    return walk(input);
  } catch (_e) {
    return input;
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
    const sanitizedResponses = sanitizeFinalizeResponses(intakeResponses || {});
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
        formLocale: intakeLocale.value,
        responses: sanitizedResponses,
        clients: buildClientPayloads(),
        guardian: {
          firstName: guardianFirstName.value,
          lastName: guardianLastName.value,
          email: guardianEmail.value,
          phone: guardianPhone.value,
          relationship: guardianRelationship.value
        },
        approval: approvalContext.value || null,
        // Audit trail for the multi-client signature consent prompt. Only
        // populated when the parent added 2+ clients via the consent flow.
        multiClientSignatureConsent: clients.value.length > 1
          ? {
              accepted: !!multiClientConsentAccepted.value,
              acceptedAt: multiClientConsentAcceptedAt.value || null,
              clientCount: clients.value.length,
              version: 1
            }
          : null,
        smartSchoolRoi: embeddedSmartSchoolRoi.value || null,
        smartDisclosure: embeddedSmartDisclosure.value || null,
        packetSections: Object.keys(embeddedPacketSections.value || {}).length
          ? embeddedPacketSections.value
          : null,
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
        referencesWaived: !!referencesWaived.value,
        referencesConsent: {
          consentVersion: 1,
          digitalFormAtInterviewOrOffer: !!referencesDigitalFormConsent.value,
          referenceContentWaiverAcknowledged: !!referenceContentWaiverAcknowledged.value
        }
      }
    });
    downloadUrl.value = resp.data?.downloadUrl || '';
    emailDeliveryStatus.value = resp.data?.emailDelivery || null;
    clientBundleLinks.value = resp.data?.clientBundles || [];
    if (resp.data?.registrationCompletion) {
      registrationCompletion.value = resp.data.registrationCompletion;
    }
    registrationReturningAutoMatch.value = resp.data?.registrationReturningAutoMatch || null;
    jobApplicationSubmitted.value = !!resp.data?.jobApplicationSubmitted;
    // Multi-child submissions deliberately have no combined download URL —
    // each child's packet is in clientBundles. Treat any per-child bundle as
    // "ready" so the post-submit page stops spinning.
    const hasPerChildPackets = Array.isArray(clientBundleLinks.value) && clientBundleLinks.value.length > 0;
    if (downloadUrl.value || jobApplicationSubmitted.value || hasPerChildPackets) {
      pollingForDownload.value = false;
    }
    step.value = 3;
    clearPersistedDraft();
    if (!downloadUrl.value && !jobApplicationSubmitted.value && !hasPerChildPackets) {
      pollForDownloadUrl();
    }
  } catch (e) {
    pollingForDownload.value = false;
    step.value = previousStep;
    if (e?.response?.status === 413) {
      error.value =
        'Your submission is too large to send (often caused by very high-resolution photo uploads). '
        + 'Try retaking insurance card photos with your camera held closer to the card so the image is smaller, then submit again.';
    } else {
      error.value = e.response?.data?.error?.message || 'Failed to finalize packet';
    }
  } finally {
    submitLoading.value = false;
  }
};

const pollForDownloadUrl = async () => {
  if (downloadUrl.value || jobApplicationSubmitted.value) return;
  pollingForDownload.value = true;
  // Adaptive cadence: poll fast at the start (1s, 2s, 3s, 4s) so single-
  // child finalizes that complete in <10s feel instant. Then settle into a
  // 5s cadence for multi-child / slow-network situations. Still capped at
  // ~5 minutes total wall time so a stuck backend can't hang the UI forever.
  // Previous behaviour was a flat `await sleep(5000)` BEFORE the first
  // request, which meant a fast-finishing single-child run still spun for a
  // minimum of 5 seconds AND a multi-child user staring at the screen had
  // no incremental "child 1's packet is ready" feedback for the first 5s.
  const delays = [1000, 2000, 3000, 4000, 5000];
  // Total ~5 minutes worth of polling (4 × 1-4s + ~58 × 5s ≈ 300s)
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    const wait = delays[Math.min(i, delays.length - 1)];
    await new Promise((r) => setTimeout(r, wait));
    if (downloadUrl.value || step.value !== 3) break;
    try {
      const resp = await api.get(`/public-intake/${publicKey}/status/${submissionId.value}`, {
        // Suppress the global "Loading…" overlay during packet polling —
        // we already render an inline "Preparing N packets… (X of N
        // ready)" header on the success card, so the modal would just
        // spam the screen every 1–5 seconds for the duration of the
        // background bundle build.
        skipGlobalLoading: true
      });
      // Refresh per-child packets every poll so multi-child families see
      // each child's link appear the moment that child's bundle finishes
      // building, instead of waiting for ALL children to be ready.
      if (Array.isArray(resp.data?.clientBundles)) {
        clientBundleLinks.value = resp.data.clientBundles;
      }
      if (resp.data?.emailDelivery) {
        emailDeliveryStatus.value = resp.data.emailDelivery;
      }
      if (resp.data?.registrationCompletion) {
        registrationCompletion.value = resp.data.registrationCompletion;
      }
      if (resp.data?.registrationReturningAutoMatch) {
        registrationReturningAutoMatch.value = resp.data.registrationReturningAutoMatch;
      }
      const hasPerChildPackets = Array.isArray(clientBundleLinks.value) && clientBundleLinks.value.length > 0;
      // Backend now reports packetReady=true once finalize is done AND there
      // is something downloadable (combined OR per-child). Either explicit
      // flag or the presence of bundles ends the poll loop.
      if (resp.data?.downloadUrl || resp.data?.packetReady || hasPerChildPackets) {
        if (resp.data?.downloadUrl) {
          downloadUrl.value = resp.data.downloadUrl;
        }
        // For multi-child, keep polling a couple more times so any siblings
        // still being built show up, but stop blocking the UI.
        const _expectedKids = (intakeResponses?.clients || []).length || 1;
        const haveAllExpected = Array.isArray(clientBundleLinks.value)
          && clientBundleLinks.value.length >= _expectedKids;
        if (resp.data?.downloadUrl || haveAllExpected) {
          break;
        }
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
  registrationReturningAutoMatch.value = null;
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
  referencesDigitalFormConsent.value = false;
  referenceContentWaiverAcknowledged.value = false;
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
  embeddedSmartDisclosure.value = null;
  embeddedPacketSections.value = {};
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
  goToFirstFormStep();
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

// Multi-client signature consent: parents must explicitly agree that their
// signatures and releases will apply to every child added in this session
// before we let them tack a 2nd+ client onto the same packet. Recorded in
// the encrypted intakeData payload so we have an audit trail.
//
// IMPORTANT: this is asked UPFRONT (before per-client questions) so a parent
// who plans to enroll multiple kids doesn't fill out child 1's questions
// only to discover they'd rather sign separately and have to start over.
const multiClientConsentAccepted = ref(false);
const multiClientConsentAcceptedAt = ref('');
const multiClientConsentDeclined = ref(false);
const multiClientConsentDialogOpen = ref(false);
// 'one' | 'multiple' | '' (unset). Drives the upfront radio. When the parent
// switches to 'multiple' we open the consent panel; on accept we pre-create
// the 2nd client slot so they can fill out both at once.
const multiClientPlanChoice = ref('one');
// Tracks whether the upfront prompt drove the consent accept (so removeClient
// doesn't snap them back to a 1-child state and erase that decision).
const multiClientUpfrontPlan = ref(false);

const onSelectMultiClientPlan = (choice) => {
  if (choice === 'one') {
    multiClientPlanChoice.value = 'one';
    multiClientConsentDialogOpen.value = false;
    multiClientConsentDeclined.value = false;
    multiClientUpfrontPlan.value = false;
    // Trim back to a single child if they previously expanded.
    while (clients.value.length > 1) {
      clients.value.pop();
      intakeResponses.clients.pop();
    }
    multiClientConsentAccepted.value = false;
    multiClientConsentAcceptedAt.value = '';
    return;
  }
  // choice === 'multiple'
  multiClientPlanChoice.value = 'multiple';
  multiClientConsentDeclined.value = false;
  if (multiClientConsentAccepted.value) {
    // Already accepted earlier in this session — just make sure there are
    // at least 2 client slots ready to fill out.
    if (clients.value.length < 2) addClient();
    return;
  }
  multiClientConsentDialogOpen.value = true;
};

const onClickAddClient = () => {
  if (multiClientConsentAccepted.value) {
    addClient();
    return;
  }
  // Mind-change path: parent originally said "just one" upfront and is now
  // clicking the bottom "Add another child" button. Re-open the consent
  // panel inside the upfront plan block AND scroll to it so they don't
  // miss the prompt rendered far above their current scroll position.
  multiClientPlanChoice.value = 'multiple';
  multiClientConsentDeclined.value = false;
  multiClientConsentDialogOpen.value = true;
  // Defer until the panel renders, then scroll it into view.
  setTimeout(() => {
    try {
      const el = document.querySelector('.multi-client-plan-block');
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch { /* best-effort */ }
  }, 30);
};

const acceptMultiClientConsent = () => {
  multiClientConsentAccepted.value = true;
  multiClientConsentAcceptedAt.value = new Date().toISOString();
  multiClientConsentDeclined.value = false;
  multiClientConsentDialogOpen.value = false;
  if (multiClientPlanChoice.value === 'multiple') {
    multiClientUpfrontPlan.value = true;
    if (clients.value.length < 2) addClient();
  } else {
    addClient();
  }
};

const declineMultiClientConsent = () => {
  multiClientConsentDeclined.value = true;
  multiClientConsentDialogOpen.value = false;
  // If the upfront radio drove this prompt, snap the choice back to 'one'
  // so the UI reflects the parent's actual plan and they can continue with
  // a single-child packet without confusion.
  if (multiClientPlanChoice.value === 'multiple') {
    multiClientPlanChoice.value = 'one';
  }
};

const dismissMultiClientDeclineNotice = () => {
  multiClientConsentDeclined.value = false;
};

const removeClient = (idx) => {
  clients.value.splice(idx, 1);
  intakeResponses.clients.splice(idx, 1);
  // If they removed everyone except the primary child, drop the consent so
  // the next addition prompts again. (Defense against accidental "yes".)
  if (clients.value.length <= 1) {
    multiClientConsentAccepted.value = false;
    multiClientConsentAcceptedAt.value = '';
    if (multiClientUpfrontPlan.value) {
      multiClientPlanChoice.value = 'one';
      multiClientUpfrontPlan.value = false;
    }
  }
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
  const current = currentFlowStep.value;
  if (current?.type !== 'questions' || !Array.isArray(current.fields)) return [];
  const stepVis = String(current.visibility || 'always').trim().toLowerCase();
  if (stepVis === 'new_client_only' && isExistingClientByMatch.value) return [];
  return (current.fields || []).filter((f) => {
    const key = String(f?.key || '').trim();
    if (!key && f?.type !== 'info') return false;
    const scope = String(f?.scope || 'submission').trim().toLowerCase();
    if (intakeForSelf.value && scope === 'guardian') return false;
    if (intakeForSelf.value && scope === 'client') return false;
    if (!intakeForSelf.value && scope === 'self') return false;
    const collected = new Set([
      'legal_first_name',
      'legal_last_name',
      'date_of_birth',
      'phone_number',
      'email_address',
      'guardian_legal_first',
      'guardian_legal_last',
      'guardian_email',
      'guardian_phone',
      'guardian_relationship_to_child',
      'child_dob',
      'child_date_of_birth'
    ]);
    if (collected.has(key) && (guardianFirstName.value || guardianEmail.value || starterDob.value)) {
      return false;
    }
    return true;
  });
});

const questionValues = computed(() => {
  const step = currentFlowStep.value;
  const idx = step?.clientIndex;
  if (Number.isInteger(idx)) {
    if (!intakeResponses.clients[idx]) intakeResponses.clients[idx] = {};
    return intakeResponses.clients[idx];
  }
  const audience = String(step?.audience || '').trim().toLowerCase();
  const scope = String(step?.fields?.[0]?.scope || step?.scope || '').trim().toLowerCase();
  if (audience === 'guardian' || scope === 'guardian') {
    if (!intakeResponses.guardian || typeof intakeResponses.guardian !== 'object') {
      intakeResponses.guardian = {};
    }
    return intakeResponses.guardian;
  }
  return intakeResponses.submission;
});

const isQuestionVisible = (field, values = {}) => {
  const fv = String(field?.visibility || 'always').trim().toLowerCase();
  if (fv === 'new_client_only' && isExistingClientByMatch.value) return false;
  return matchesShowIf(field?.showIf, values);
};

const visibleQuestionFields = computed(() =>
  stepQuestionFields.value.filter((f) => isQuestionVisible(f, interviewShowIfValues.value))
);

/** Legacy identity-page dump. Paged `questions` steps render on their own flow page. */
const visibleStandaloneQuestionFields = computed(() => []);

const currentQuestionRows = computed(() => {
  const rows = [];
  let lastSection = '';
  for (const field of visibleQuestionFields.value || []) {
    const section = String(field?.section || '').trim();
    if (section && section !== lastSection) {
      rows.push({ section, field: null });
      lastSection = section;
    }
    rows.push({ section: '', field });
  }
  return rows;
});

const currentFlowStepHelperText = computed(() => {
  const raw = currentFlowStep.value?.helperText || currentFlowStep.value?.description || '';
  return raw ? interpolateChildTokens(tx(raw)) : '';
});
const currentFlowStepWhyWeAsk = computed(() => {
  const raw = currentFlowStep.value?.whyWeAsk || '';
  return raw ? interpolateChildTokens(tx(raw)) : '';
});
const currentFlowStepTitle = computed(() => {
  const raw = currentFlowStep.value?.label || '';
  return interpolateChildTokens(tx(raw) || raw);
});

const currentInterviewPageTitle = computed(() => {
  const s = currentFlowStep.value;
  const type = String(s?.type || '');
  if (type === 'document') return t('document');
  if (type === 'upload') return tx(s?.label) || t('upload');
  if (type === 'school_roi') return t('schoolRoi');
  if (type === 'smart_disclosure' || type === 'disclosure') return tx(s?.label) || 'Disclosure';
  if (isPacketSectionStepType(type)) return tx(s?.label) || packetSectionTitleForStep(s);
  if (type === 'registration') return tx(s?.label) || t('registration');
  if (type === 'guardian_waiver') return tx(s?.label) || t('guardianWaiversSafety');
  if (type === 'insurance_info') return tx(s?.label) || t('insuranceInformation');
  if (type === 'payment_collection') return tx(s?.label) || t('paymentInformation');
  if (type === 'communications') return tx(s?.label) || t('communicationPreferences');
  if (type === 'demographics') return tx(s?.label) || t('demographics');
  if (type === 'clinical_questions') return currentFlowStepTitle.value || t('clinicalQuestions');
  if (type === 'references') return tx(s?.label) || t('professionalReferences');
  if (type === 'child_review') return currentFlowStepTitle.value || 'Child Review';
  if (type === 'questions') return currentFlowStepTitle.value || t('questions');
  return currentFlowStepTitle.value || tx(s?.label) || t('questions');
});

const defaultHelpBlocks = computed(() => ([
  { id: 'care', icon: '💚', title: t('personalizedCare'), body: t('personalizedCareBody') },
  { id: 'secure', icon: '🔒', title: t('privateAndSecure'), body: t('privateAndSecureBody') },
  { id: 'control', icon: '🌿', title: t('youreInControl'), body: t('youreInControlBody') }
]));

const whoForHelpBlocks = computed(() => ([
  { id: 'why', icon: '💚', title: t('whyWeAsk'), body: t('whyWeAskWhoFor') },
  ...defaultHelpBlocks.value.slice(1)
]));

const basicsHelpBlocks = computed(() => ([
  { id: 'why', icon: '💚', title: t('whyWeAsk'), body: t('whyWeAskBasics') },
  ...defaultHelpBlocks.value.slice(1)
]));

const flowStepHelpBlocks = computed(() => {
  const why = currentFlowStepWhyWeAsk.value;
  const blocks = why
    ? [{ id: 'why', icon: '💚', title: t('whyWeAsk'), body: why }]
    : [{ id: 'next', icon: '✨', title: t('almostThere'), body: t('almostThereBody') }];
  return [...blocks, defaultHelpBlocks.value[1], defaultHelpBlocks.value[2]];
});

const flowStepOwnsContinue = computed(() => {
  const type = String(currentFlowStep.value?.type || '');
  return type === 'school_roi'
    || type === 'smart_disclosure'
    || type === 'disclosure'
    || isPacketSectionStepType(type);
});

const showIntakePagerFooter = computed(() => {
  if (!isOfficeInDepthIntake.value) return false;
  if (loading.value || fatalError.value) return false;
  if (step.value === WHO_FOR_STEP) return true;
  if (step.value === 1 && !isSmartSchoolRoi.value && !isSmartDisclosure.value) return true;
  if (step.value === 2 && !flowStepOwnsContinue.value) return true;
  return false;
});

const showIntakeBackButton = computed(() =>
  isOfficeInDepthIntake.value
  && (step.value === WHO_FOR_STEP || step.value === 1 || step.value === 2)
);

const intakePagerLabel = computed(() => {
  const steps = dfProgressSteps.value || [];
  const idx = Math.min(dfProgressIndex.value, Math.max(steps.length - 1, 0));
  if (!steps.length) return '';
  return intakeLocale.value === 'es'
    ? `Paso ${idx + 1} de ${steps.length}`
    : `Step ${idx + 1} of ${steps.length}`;
});

const intakePagerPrimaryLabel = computed(() => {
  if (step.value === WHO_FOR_STEP) return t('continueToIntakePacket');
  if (step.value === 1) return consentLoading.value ? t('saving') : t('iConsentContinue');
  if (step.value === 2) return submitLoading.value ? t('submitting') : currentFlowContinueLabel.value;
  return t('continue');
});

const intakePagerPrimaryDisabled = computed(() => {
  if (step.value === WHO_FOR_STEP) return false;
  if (step.value === 1) return consentLoading.value;
  if (step.value === 2) return submitLoading.value || isUploadStepBlockingContinue.value;
  return false;
});

function handleIntakePagerContinue() {
  if (step.value === WHO_FOR_STEP) {
    continueWhoFor();
    return;
  }
  if (step.value === 1) {
    submitConsent();
    return;
  }
  if (step.value === 2) {
    handleCurrentFlowContinue();
  }
}
const currentChildBanner = computed(() => {
  if (!Number.isInteger(currentFlowStep.value?.clientIndex)) return '';
  const i = currentFlowStep.value.clientIndex;
  const total = Math.max(clients.value.length, 1);
  return `Child ${i + 1} of ${total} — ${childDisplayName(i)}`;
});
const reviewAddConsentOpen = ref(false);
const currentChildReviewName = computed(() => {
  const idx = currentFlowStep.value?.clientIndex;
  if (!Number.isInteger(idx)) return 'this child';
  const bag = intakeResponses.clients?.[idx] || {};
  const ident = clients.value?.[idx] || {};
  const first = String(bag.child_preferred_name || ident.firstName || bag.child_legal_first || '').trim();
  const last = String(ident.lastName || bag.child_legal_last || '').trim();
  return `${first} ${last}`.trim() || childDisplayName(idx);
});
const formatReviewValue = (raw) => {
  if (raw == null || raw === '') return '—';
  if (Array.isArray(raw)) return raw.length ? raw.join(', ') : '—';
  return String(raw);
};
const currentChildReviewRows = computed(() => {
  const idx = currentFlowStep.value?.clientIndex;
  const bag = Number.isInteger(idx) ? (intakeResponses.clients?.[idx] || {}) : {};
  return [
    { label: 'Primary concerns', value: formatReviewValue(bag.biggest_concern_now || bag.presenting_concerns) },
    { label: 'Current functioning', value: formatReviewValue(bag.hardest_everyday) },
    { label: 'School', value: formatReviewValue(bag.academics || bag.feel_about_school) },
    { label: 'Medical/developmental', value: formatReviewValue(bag.medical_know || bag.development_noticed || bag.medical_condition) },
    { label: 'Prior treatment', value: formatReviewValue(bag.prior_services_know || bag.received_counseling) },
    { label: 'Safety', value: bag.clinicalSafetyAlert ? 'Needs attention before first appointment' : formatReviewValue(bag.self_harm || bag.talked_wanting_to_die || 'No acute flags recorded') },
    { label: 'Strengths', value: formatReviewValue(bag.child_strengths || bag.enjoys) },
    { label: 'Goals', value: formatReviewValue(bag.three_important_help || bag.actually_helping) },
    { label: 'Questionnaires', value: formatReviewValue([
      bag.psc_1 ? 'PSC-17 started' : null,
      bag.send_child_depression === 'send' ? 'Depression measure: send to child' : null,
      bag.send_child_anxiety === 'send' ? 'Anxiety measure: send to child' : null
    ].filter(Boolean)) },
    { label: 'Provider preferences', value: formatReviewValue(bag.preferred_service_format || bag.provider_good_fit) }
  ];
});
const jumpToChildFirstPage = (clientIndex) => {
  const idx = (flowSteps.value || []).findIndex(
    (s) => s?.clientIndex === clientIndex && String(s?.sourceId || s?.id || '').includes('about_child')
  );
  if (idx >= 0) currentFlowIndex.value = idx;
};
const editCurrentChildIntake = () => {
  const idx = currentFlowStep.value?.clientIndex;
  if (Number.isInteger(idx)) jumpToChildFirstPage(idx);
};
const addAnotherChildFromReview = () => {
  if (!multiClientConsentAccepted.value) {
    reviewAddConsentOpen.value = true;
    multiClientPlanChoice.value = 'multiple';
    return;
  }
  addClient();
  const newIndex = clients.value.length - 1;
  nextTick(() => jumpToChildFirstPage(newIndex));
};
const acceptReviewAddChild = () => {
  acceptMultiClientConsent();
  reviewAddConsentOpen.value = false;
  const newIndex = clients.value.length - 1;
  nextTick(() => jumpToChildFirstPage(newIndex));
};
const showClinicalSafetyBanner = computed(() =>
  isClinicalSafetyPositive(interviewShowIfValues.value)
    || matchesShowIf({ fieldKey: 'unusual_experiences_unsafe', equals: 'yes' }, interviewShowIfValues.value)
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
      params: { email },
      // Suppress the global "Loading…" overlay — this fires on every
      // keystroke in the email field, so the full-page modal felt
      // jarring. The inline `registrationAccountLookupLoading` flag
      // already handles the small per-field spinner.
      skipGlobalLoading: true
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

watch(
  () => currentFlowStep.value?.sourceId || currentFlowStep.value?.id,
  (id) => {
    const stepId = String(id || '');
    if (stepId === 'counseling_self_about_you') {
      const sub = intakeResponses.submission;
      if (!sub || typeof sub !== 'object') return;
      if (!sub.legal_first_name && guardianFirstName.value) sub.legal_first_name = guardianFirstName.value;
      if (!sub.legal_last_name && guardianLastName.value) sub.legal_last_name = guardianLastName.value;
      if (!sub.email_address && guardianEmail.value) sub.email_address = guardianEmail.value;
      if (!sub.phone_number && guardianPhone.value) sub.phone_number = guardianPhone.value;
      return;
    }
    if (stepId === 'counseling_dep_about_you') {
      const g = intakeResponses.guardian;
      if (!g || typeof g !== 'object') return;
      if (!g.guardian_legal_first && guardianFirstName.value) g.guardian_legal_first = guardianFirstName.value;
      if (!g.guardian_legal_last && guardianLastName.value) g.guardian_legal_last = guardianLastName.value;
      if (!g.guardian_email && guardianEmail.value) g.guardian_email = guardianEmail.value;
      if (!g.guardian_phone && guardianPhone.value) g.guardian_phone = guardianPhone.value;
      return;
    }
    if (stepId === 'counseling_dep_about_child') {
      const idx = currentFlowStep.value?.clientIndex;
      if (!Number.isInteger(idx)) return;
      if (!intakeResponses.clients[idx]) intakeResponses.clients[idx] = {};
      const bag = intakeResponses.clients[idx];
      const ident = clients.value[idx] || {};
      if (!bag.child_legal_first && ident.firstName) bag.child_legal_first = ident.firstName;
      if (!bag.child_legal_last && ident.lastName) bag.child_legal_last = ident.lastName;
      if (!bag.child_preferred_name && ident.firstName) bag.child_preferred_name = ident.firstName;
    }
  }
);

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
  goToFirstFormStep();
};

const nextFlowStep = async () => {
  if (currentFlowIndex.value < flowSteps.value.length - 1) {
    currentFlowIndex.value += 1;
    if (currentFlowStep.value?.type === 'upload') {
      uploadStepFiles.value = [];
    }
    // Scroll to the top whenever we advance to a new step. Without this,
    // multi-section steps (e.g. Guardian waivers per child, multi-kid
    // demographics) load with the previous step's scroll position retained,
    // dropping the guardian mid-page on a section that isn't the start of
    // the new step. Use 'auto' (instant) so the new step content is visible
    // before the user starts scrolling/clicking.
    if (typeof window !== 'undefined') {
      try {
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch {
        window.scrollTo(0, 0);
      }
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
  if (!s.required && !usingPasteMode && uploadStepFiles.value.length === 0) {
    stepError.value = '';
    await nextFlowStep();
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
  if (!referencesWaived.value) {
    if (!referencesDigitalFormConsent.value) {
      stepError.value = 'Please confirm consent for digital reference forms before continuing.';
      return;
    }
    if (!referenceContentWaiverAcknowledged.value) {
      stepError.value = 'Please acknowledge the confidentiality statement before continuing.';
      return;
    }
    const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
    const firstMin = provided.slice(0, minimum);
    for (const r of firstMin) {
      if (!emailOk(r.email)) {
        stepError.value = `A valid email is required for each of the first ${minimum} professional references.`;
        return;
      }
    }
  }
  intakeResponses.submission.references = provided;
  intakeResponses.submission.referencesWaived = !!referencesWaived.value;
  intakeResponses.submission.referencesConsent = {
    consentVersion: 1,
    digitalFormAtInterviewOrOffer: !!referencesDigitalFormConsent.value,
    referenceContentWaiverAcknowledged: !!referenceContentWaiverAcknowledged.value
  };
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
  if (!stepId) return;
  if (getRegistrationSelectionIds(stepId).length) return;
  const opts = currentRegistrationOptions.value;
  if (!Array.isArray(opts) || !opts.length) return;
  const ceid = Number(link.value?.company_event_id || 0) || null;
  // Prefer matching the link's locked company_event_id across source types
  // (agency_catalog OR manual options). This was previously only checking the
  // agency_catalog-shaped id ("cat_company_event_<id>"), which left manual
  // single-event registration links with a hidden picker AND no selection —
  // the parent would tap "Next" on the 2nd page and hit
  // "Please select at least one option" even though there was nothing to pick.
  if (ceid) {
    const matchingByEntity = opts.find((o) =>
      ['company_event', 'event'].includes(String(o.entityType || '').toLowerCase())
      && Number(o.entityId) === ceid
    );
    if (matchingByEntity?.id) {
      setRegistrationSelectionIds(stepId, [String(matchingByEntity.id)]);
      return;
    }
  }
  // When the picker would be hidden because only one option exists AND the
  // link is locked to that event, auto-select it so validation never trips.
  if (opts.length === 1 && ceid) {
    setRegistrationSelectionIds(stepId, [String(opts[0].id)]);
  }
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
    } else {
      // Manual-option registration steps also benefit from preselect when the
      // link is locked to a single event. Without this, manual links produced
      // the "please select at least one option" error reported by parents.
      await nextTick();
      preselectLinkedCompanyEvent(step);
    }

    // If, after loading, the registration step still has zero options AND
    // nothing is preselected, auto-advance past it instead of leaving the
    // parent stranded with "Please select at least one option" on a step
    // that has nothing to pick from. This is the behaviour parents reported
    // on multi-child packets where a sibling-bound registration step had
    // no remaining options.
    await nextTick();
    const hasOptions = Array.isArray(currentRegistrationOptions.value)
      && currentRegistrationOptions.value.length > 0;
    const hasSelection = getRegistrationSelectionIds(stepId).length > 0;
    if (!hasOptions && !hasSelection) {
      await nextFlowStep();
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
    embeddedSmartSchoolRoi: embeddedSmartSchoolRoi.value,
    embeddedSmartDisclosure: embeddedSmartDisclosure.value,
    packetSectionContexts: packetSectionContexts.value,
    // Include PDF-template field values + per-doc completion so typing in
    // document field overlays triggers a draft save (previously these were
    // reactive but never watched, so Back/refresh silently lost answers).
    fieldValuesByTemplate,
    docStatus,
    // Multi-client plan selection + consent state — without these, the
    // upfront "how many children" answer wasn't bookmarked between steps,
    // so hitting Back and returning could bounce the parent back to the
    // initial prompt with an empty state.
    multiClientPlanChoice: multiClientPlanChoice.value,
    multiClientConsentAccepted: multiClientConsentAccepted.value,
    multiClientConsentAcceptedAt: multiClientConsentAcceptedAt.value,
    multiClientUpfrontPlan: multiClientUpfrontPlan.value
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
    if (!skipBrandingIntro.value && introScreens.value.length) {
      step.value = 0;
      introIndex.value = 0;
    } else {
      goToFirstFormStep();
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

const handleSmartDisclosureCompleted = ({ submissionId: nextSubmissionId, downloadUrl: nextDownloadUrl, emailDelivery }) => {
  submissionId.value = nextSubmissionId || null;
  downloadUrl.value = nextDownloadUrl || '';
  emailDeliveryStatus.value = emailDelivery || null;
  step.value = 3;
  clearPersistedDraft();
  if (!downloadUrl.value && !jobApplicationSubmitted.value) {
    pollForDownloadUrl();
  }
};

const handleEmbeddedDisclosureCaptured = async ({ smartDisclosure } = {}) => {
  embeddedSmartDisclosure.value = smartDisclosure || null;
  intakeResponses.submission = {
    ...(intakeResponses.submission || {}),
    smartDisclosure: smartDisclosure || null
  };
  stepError.value = '';
  await nextFlowStep();
};

const packetSectionContextForStep = (stepObj) => {
  const key = PACKET_SECTION_STEP_TO_KEY[String(stepObj?.type || '').trim().toLowerCase()];
  if (!key) return null;
  return packetSectionContexts.value?.[key] || null;
};

const packetSectionTitleForStep = (stepObj) => {
  const ctx = packetSectionContextForStep(stepObj);
  if (ctx?.title) return ctx.title;
  const t = String(stepObj?.type || '').trim().toLowerCase();
  if (t === 'packet_informed_group_consent') return 'Informed Consent + Group Consent';
  if (t === 'packet_policy_services') return 'Policy and Services Agreement';
  if (t === 'packet_hipaa_notice') return 'HIPAA Privacy Policy and Notice of Privacy Practices';
  return 'Agreement';
};

const handleEmbeddedPacketSectionCaptured = async (payload = {}) => {
  const key = String(payload?.sectionKey || '').trim();
  if (!key) {
    stepError.value = 'Unable to save this agreement step.';
    return;
  }
  embeddedPacketSections.value = {
    ...(embeddedPacketSections.value || {}),
    [key]: payload
  };
  intakeResponses.submission = {
    ...(intakeResponses.submission || {}),
    packetSections: embeddedPacketSections.value
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
  if (!restoredDraft && !skipBrandingIntro.value && introScreens.value.length) {
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
.preparing-spinner--inline {
  width: 13px;
  height: 13px;
  border-width: 2px;
  margin-right: 6px;
  vertical-align: middle;
  border-color: rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
}
.btn-secondary .preparing-spinner--inline {
  border-color: rgba(15, 23, 42, 0.2);
  border-top-color: var(--primary, #2c3e50);
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
/* ── Intake / non-registration success screen ── */
.intake-success-logos {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  margin-bottom: 18px;
}
.intake-success-logo-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  min-width: 160px;
}
.intake-success-logo-card img {
  max-height: 56px;
  max-width: 180px;
  object-fit: contain;
}
.intake-success-logo-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #475569);
  text-align: center;
}
.intake-thankyou-banner {
  padding: 20px 22px 16px;
  margin: 10px 0 16px;
  background: linear-gradient(135deg, #ecfdf5 0%, #e0f2fe 100%);
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 14px;
}
.intake-thankyou-title {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
  margin-bottom: 6px;
}
.intake-thankyou-lead {
  margin: 0 0 10px;
  font-size: 15px;
  line-height: 1.55;
  color: #0f172a;
}
.intake-thankyou-list {
  list-style: none;
  padding: 0;
  margin: 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.intake-thankyou-list li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14.5px;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.55);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.intake-thankyou-check {
  color: #059669;
  font-weight: 800;
}
.intake-thankyou-email {
  margin: 6px 0 0;
  font-size: 13.5px;
  color: var(--text-secondary, #475569);
}
.intake-thankyou-event {
  margin: 12px 0 6px;
  padding: 10px 12px;
  background: #f0f7ff;
  border: 1px solid #cfe4ff;
  border-radius: 8px;
}
.intake-thankyou-event-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #475569);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.intake-thankyou-event-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}
.intake-thankyou-event-date {
  margin-top: 4px;
  font-size: 13.5px;
  color: var(--text-secondary, #475569);
}
.intake-thankyou-event-actions {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.intake-download-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 12px;
  background: #fff;
}
.intake-download-meta {
  font-size: 13.5px;
  color: var(--text-secondary, #475569);
  margin-bottom: 10px;
}
.intake-download-ready-label {
  color: #059669;
  font-weight: 700;
}
.intake-download-preparing-label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #475569;
}
.intake-download-actions {
  gap: 10px;
}
.intake-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
.intake-inline-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.875rem;
  margin-bottom: 14px;
}
.intake-inline-error-dismiss {
  background: none;
  border: none;
  color: #b91c1c;
  cursor: pointer;
  font-size: 1rem;
  padding: 0 2px;
  flex-shrink: 0;
  line-height: 1;
}
.intake-language-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 12px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 999px;
}
.intake-language-btn {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.88rem;
  padding: 6px 16px;
  border-radius: 999px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.intake-language-btn:disabled {
  cursor: default;
}
/* English button — active = navy blue */
.intake-language-btn--en.intake-language-btn--active {
  background: #1e3a5f;
  color: #fff;
  box-shadow: 0 1px 4px rgba(30, 58, 95, 0.35);
}
/* Spanish button — active = deep green (flag color) */
.intake-language-btn--es.intake-language-btn--active {
  background: #c60b1e;
  color: #fff;
  box-shadow: 0 1px 4px rgba(198, 11, 30, 0.35);
}
/* Inactive hover effects */
.intake-language-btn--en:not(:disabled):hover {
  background: rgba(30, 58, 95, 0.1);
}
.intake-language-btn--es:not(:disabled):hover {
  background: rgba(198, 11, 30, 0.1);
}
.intake-language-status {
  font-size: 0.75rem;
  padding: 0 6px;
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
  gap: 8px;
  margin-bottom: 8px;
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
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.multi-client-plan-block {
  margin: 16px 0;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-left: 4px solid #2c80bc;
  background: #f7fbff;
  border-radius: 10px;
}
.multi-client-plan-block h4 {
  margin: 0 0 4px 0;
  font-size: 15px;
  color: #1d4f73;
}
.multi-client-plan-desc {
  margin: 0 0 10px 0;
  font-size: 13px;
}
.multi-client-consent-panel {
  flex-basis: 100%;
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid #f0c66d;
  background: #fff8e6;
  border-radius: 10px;
}
.multi-client-consent-panel h4 {
  margin: 0 0 6px 0;
  font-size: 15px;
  color: #8a6d1d;
}
.multi-client-consent-panel p {
  margin: 0 0 8px 0;
  color: #5b4a17;
}
.multi-client-consent-bullets {
  margin: 0 0 12px 18px;
  padding: 0;
  color: #5b4a17;
}
.multi-client-consent-bullets li {
  margin: 4px 0;
}
.multi-client-consent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.multi-client-decline-notice {
  flex-basis: 100%;
  margin-top: 6px;
  padding: 12px 14px;
  border: 1px solid #cfd9e3;
  background: #f4f7fb;
  border-radius: 10px;
  color: #2c3e50;
}
.multi-client-decline-notice p {
  margin: 0 0 6px 0;
}
.multi-client-consent-confirmed {
  flex-basis: 100%;
  font-size: 12px;
  font-style: italic;
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
.bundle-item--pending {
  background: var(--bg, #fff);
  border-style: dashed;
  color: var(--muted, #64748b);
}
.multi-child-prep {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}
.multi-child-prep-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
}
.multi-child-prep-header--ready {
  color: var(--success, #166534);
}
.check-mark {
  font-size: 18px;
  line-height: 1;
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
  margin: 8px 0;
  padding: 10px 12px;
  background: #f8f9fa;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.helper-text {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 3px;
  line-height: 1.35;
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
  background: var(--df-primary, var(--primary, #1e4d3b));
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
  color: var(--df-primary, var(--primary, #1e4d3b));
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
  color: var(--df-primary, var(--primary, #1e4d3b));
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
/* Parent-facing "thank you" banner that sits at the top of the
   registration success card. Warm, enthusiastic, but not loud — the goal
   is to reassure a family that clicked "submit" a minute ago that their
   registration actually landed and that we're excited they chose us. */
.reg-thankyou-banner {
  padding: 22px 22px 16px;
  background: linear-gradient(135deg, #ecfdf5 0%, #e0f2fe 100%);
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}
.reg-thankyou-title {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
}
.reg-thankyou-lead {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.55;
  color: #0f172a;
}
.reg-thankyou-registered-for {
  list-style: none;
  padding: 0;
  margin: 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reg-thankyou-registered-for li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14.5px;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.55);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.reg-thankyou-registered-check {
  color: #059669;
  font-weight: 800;
  font-size: 14px;
  line-height: 1;
}
.reg-thankyou-email {
  margin: 10px 0 0;
  font-size: 13.5px;
  color: var(--text-secondary, #475569);
}
.reg-success-event {
  background: var(--df-primary, var(--primary, #1e4d3b));
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
/* Grouped clinical batteries (e.g. PSC-17). When two or more adjacent fields
   share identical helper text, the group is framed as a panel with one
   instruction at the top so parents aren't reading the same sentence on every
   item. */
.clinical-field-group {
  display: grid;
  gap: 14px;
}
.clinical-field-group--shared {
  padding: 14px 16px 8px;
  background: #f6f9ff;
  border: 1px solid #dce7f8;
  border-radius: 12px;
}
.clinical-group-header {
  font-size: 14.5px;
  font-weight: 600;
  color: #1f2937;
  padding-bottom: 10px;
  border-bottom: 1px dashed #cfdcee;
  margin-bottom: 2px;
}

.communications-step {
  margin: 16px 0;
  display: grid;
  gap: 12px;
}
.spanish-clarification-step {
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
.communications-provider-terms {
  margin: 4px 0 0 18px;
  padding: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  max-width: min(360px, 72vw);
  max-height: clamp(140px, 22vh, 200px);
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

/* -----------------------------------------------------------------
   Public intake / digital forms — modern visual refresh.
   Feedback from parents (screenshot 3 + "really don't like how the form
   looks, not modern at all, bulky") was that our public form looked dated:
   heavy borders, thick section boxes, small tap targets, cramped labels,
   and hard 90s-era radio clusters. This block layers a cleaner skin on top
   of the existing structural styles without replacing them, so every
   form-type (smart_registration, smart_school_roi, intake, job_application,
   medical_records) inherits the polish automatically.

   Design goals:
     • Softer neutrals, gentler shadows, larger radii.
     • Generous padding + breathing room for inputs and section cards.
     • Taller, easier-to-tap inputs with a clear focus ring.
     • Unified modern button treatment (pill radius, subtle elevation).
     • Typography tweaks for readability on mobile.
   ----------------------------------------------------------------- */
.intake-card {
  border-radius: 18px;
  padding: 28px 32px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 10px 30px -12px rgba(15, 23, 42, 0.12);
}
.form-grid {
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin-bottom: 8px;
}
.form-group label {
  font-weight: 600;
  font-size: 13.5px;
  letter-spacing: 0.01em;
  color: #0f172a;
  margin-bottom: 6px;
}
.form-group input,
.form-group textarea,
.form-group select,
.field-inputs input,
.field-inputs textarea,
.field-inputs select {
  padding: 8px 11px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: #fff;
  font-size: 14px;
  line-height: 1.35;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.form-group input:hover,
.form-group textarea:hover,
.form-group select:hover,
.field-inputs input:hover,
.field-inputs textarea:hover,
.field-inputs select:hover {
  border-color: rgba(15, 23, 42, 0.24);
}
.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus,
.field-inputs input:focus,
.field-inputs textarea:focus,
.field-inputs select:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}
.form-group input[type='date'],
.field-inputs input[type='date'] {
  min-height: 38px;
}
.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.radio-row {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  /* Parent feedback: the PSC-17 and Yes/No pills were rendering with almost no
     space between the circle and the label — the native <input type="radio">
     hugs the next inline element tighter than the 8px we thought we'd get from
     `gap`. Bump the gap to 12px and give the pill a slightly bigger horizontal
     pad so the circle doesn't look pinned to the very edge. */
  gap: 12px;
  padding: 10px 18px 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: #fff;
  font-size: 14px;
  line-height: 1.25;
  cursor: pointer;
  min-height: 40px;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
/* Keep the radio/checkbox on the vertical center of the pill and guarantee a
   consistent hit area. Also pin `vertical-align: middle` for the rare browsers
   (older Safari) where the native control sits on the baseline and throws the
   label off-center inside narrow grid columns. */
.radio-row input[type='radio'],
.radio-row input[type='checkbox'] {
  accent-color: var(--primary, #2563eb);
  width: 16px;
  height: 16px;
  margin: 0;
  flex: 0 0 16px;
  vertical-align: middle;
  position: relative;
  top: 0;
}
.radio-row > span {
  flex: 1 1 auto;
  min-width: 0;
  /* Was `overflow-wrap: anywhere` which was mid-word-breaking short option
     labels ("Sometimes" → "Sometim" + "es"). `break-word` only breaks words
     that genuinely don't fit, which is what we want inside narrow pills. */
  overflow-wrap: break-word;
  word-break: normal;
  white-space: normal;
  line-height: 1.3;
}
.radio-row:hover {
  border-color: rgba(15, 23, 42, 0.28);
  background: #f8fafc;
}
/* Highlight a selected pill — we can't use :has() reliably everywhere, so
   rely on the radio row sitting on a slightly tinted bg when its input is
   checked. */
.radio-row input:checked + span {
  color: var(--primary, #2563eb);
  font-weight: 600;
}
/* When a pill sits inside a narrow grid column the text can wrap — make sure
   the pill flexes full-width in that case so the circle stays left-aligned
   with the label text instead of stacking on top of it. */
.radio-group .radio-row {
  max-width: 100%;
}
.clients-block {
  gap: 10px;
}
.client-card {
  border-radius: 14px;
  padding: 12px 14px;
  background: #fafbff;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}
.client-card-alt {
  background: #f5f8ff;
}
.client-card-header strong {
  font-size: 15px;
  letter-spacing: 0.01em;
}
.clients-header h4,
.field-inputs h4,
.multi-client-plan-block h4,
.multi-client-consent-panel h4 {
  font-weight: 700;
  letter-spacing: -0.01em;
}
.multi-client-plan-block {
  border-radius: 14px;
  border-color: rgba(44, 128, 188, 0.18);
  background: #f2f8ff;
}
.multi-client-consent-panel {
  border-radius: 14px;
}
.multi-client-decline-notice,
.multi-client-consent-confirmed {
  border-radius: 12px;
}
.bound-client-card {
  border-radius: 14px;
  padding: 16px 18px;
  border-color: rgba(15, 23, 42, 0.08);
  background: #fafbff;
}
.consent-box {
  border-radius: 14px;
  padding: 16px 18px;
  background: #fafbff;
}
.draft-restored-banner {
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13.5px;
}
.intake-inline-error-banner {
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 14px;
}
/* Button polish. Scoped to .btn so we don't fight with library buttons that
   already style themselves. Preserves existing color variants (primary,
   secondary, outline, link) and just updates geometry + elevation. */
.btn {
  border-radius: 10px;
  padding: 10px 18px;
  font-weight: 600;
  letter-spacing: 0.01em;
  font-size: 14px;
  transition: transform 0.05s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.btn.btn-primary {
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 14px -6px rgba(37, 99, 235, 0.45);
}
.btn.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(15, 23, 42, 0.08), 0 10px 22px -8px rgba(37, 99, 235, 0.55);
}
.btn.btn-secondary,
.btn.btn-outline {
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.14);
  color: #0f172a;
}
.btn.btn-secondary:hover,
.btn.btn-outline:hover {
  border-color: rgba(15, 23, 42, 0.28);
  background: #f8fafc;
}
.btn.btn-sm {
  padding: 7px 13px;
  font-size: 13px;
  border-radius: 8px;
}
.btn.btn-xs {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: 8px;
}
.btn:disabled,
.btn[disabled] {
  opacity: 0.55;
  transform: none !important;
  box-shadow: none !important;
  cursor: not-allowed;
}
/* Section headings inside the intake card. */
.intake-card h2,
.intake-card h3,
.intake-card h4 {
  letter-spacing: -0.01em;
}
/* Soft background for the whole surface keeps the card lifted. */
:global(.signing-view-body),
:global(.public-intake-body) {
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}

.intake-card--job-landing {
  width: min(1420px, 100%);
  padding: 0;
  overflow: hidden;
  border-radius: 8px;
  background: #f8fcfa;
}
.intake-card--job-landing .cover-step {
  align-items: stretch;
}
.job-landing-shell {
  width: 100%;
  color: #102033;
}
.job-landing-icon-svg {
  display: block;
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
}
.job-landing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 32px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}
.job-landing-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  font-size: 22px;
  font-weight: 800;
  color: #132033;
}
.job-landing-brand img {
  width: auto;
  height: 58px;
  max-width: 150px;
  object-fit: contain;
}
.job-landing-brand span {
  min-width: 0;
  overflow-wrap: break-word;
}
.job-landing-secure {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #334155;
  text-align: left;
  flex: 0 0 auto;
}
.job-landing-secure-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #e8f7ee;
  color: #258451;
}
.job-landing-secure strong,
.job-landing-secure small {
  display: block;
}
.job-landing-secure strong {
  font-size: 13px;
}
.job-landing-secure small {
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
}
.job-landing-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.78fr);
  gap: 34px;
  align-items: center;
  padding: 48px 68px 28px;
}
.job-landing-hero--no-image {
  grid-template-columns: minmax(0, 820px);
  justify-content: center;
  text-align: center;
}
.job-landing-copy {
  min-width: 0;
}
.job-landing-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border: 1px solid rgba(36, 145, 82, 0.34);
  border-radius: 999px;
  color: #258451;
  background: #f6fff9;
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 20px;
}
.job-landing-eyebrow .job-landing-icon-svg {
  width: 15px;
  height: 15px;
}
.job-landing-copy h1 {
  margin: 0;
  font-size: 56px;
  line-height: 1.05;
  letter-spacing: 0;
  color: #102033;
}
.job-landing-copy h1 span {
  display: block;
}
.job-landing-title-highlight {
  color: #2fa26b;
}
.job-landing-lead {
  margin-top: 22px;
  font-size: 26px;
  line-height: 1.22;
  font-weight: 800;
  color: #18304c;
}
.job-landing-accent {
  width: 86px;
  height: 3px;
  margin: 20px 0 18px;
  border-radius: 999px;
  background: #2fa26b;
}
.job-landing-hero--no-image .job-landing-accent {
  margin-left: auto;
  margin-right: auto;
}
.job-landing-description {
  margin: 0;
  color: #4b5b72;
  font-size: 17px;
  line-height: 1.65;
  white-space: pre-line;
}
.job-landing-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}
.job-landing-hero--no-image .job-landing-meta {
  justify-content: center;
}
.job-landing-meta-pill {
  padding: 7px 12px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}
.job-landing-image {
  position: relative;
  margin: 0;
  align-self: center;
  width: 100%;
}
.job-landing-image img {
  position: relative;
  z-index: 2;
  display: block;
  width: 100%;
  background: transparent;
}
.job-landing-image--preframed img {
  width: 100%;
  max-width: 560px;
  margin-left: auto;
  aspect-ratio: auto;
  object-fit: contain;
  border-radius: 0;
  box-shadow: none;
}
.job-landing-image--organic img {
  aspect-ratio: 1.45 / 1;
  object-fit: cover;
  border-radius: 42% 58% 40% 60% / 48% 40% 55% 45%;
  box-shadow: 0 24px 60px -34px rgba(15, 23, 42, 0.58);
}
.job-landing-image:not(.job-landing-image--preframed):not(.job-landing-image--organic) img {
  aspect-ratio: 1.45 / 1;
  object-fit: cover;
  border-radius: 44px 44px 44px 8px;
  box-shadow: 0 24px 60px -34px rgba(15, 23, 42, 0.58);
}
.job-landing-leaf-accent {
  position: absolute;
  z-index: 1;
  left: -72px;
  bottom: -24px;
  width: 190px;
  height: 190px;
  pointer-events: none;
  opacity: 0.78;
}
.job-landing-leaf-accent::before {
  content: "";
  position: absolute;
  left: 54px;
  bottom: 34px;
  width: 120px;
  height: 68px;
  border-bottom: 3px solid rgba(84, 190, 135, 0.5);
  border-radius: 0 0 90px 90px;
  transform: rotate(10deg);
}
.job-landing-leaf-accent span {
  position: absolute;
  width: 48px;
  height: 28px;
  border-radius: 48px 0 48px 0;
  background: linear-gradient(135deg, rgba(83, 194, 137, 0.18), rgba(83, 194, 137, 0.5));
  transform-origin: 100% 100%;
}
.job-landing-leaf-accent span:nth-child(1) {
  left: 18px;
  bottom: 78px;
  transform: rotate(26deg);
}
.job-landing-leaf-accent span:nth-child(2) {
  left: 48px;
  bottom: 106px;
  transform: rotate(-18deg) scale(0.9);
}
.job-landing-leaf-accent span:nth-child(3) {
  left: 72px;
  bottom: 70px;
  transform: rotate(30deg) scale(0.82);
}
.job-landing-leaf-accent span:nth-child(4) {
  left: 98px;
  bottom: 98px;
  transform: rotate(-28deg) scale(0.68);
}
.job-landing-leaf-accent span:nth-child(5) {
  left: 28px;
  bottom: 42px;
  transform: rotate(8deg) scale(0.72);
}
.job-landing-feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 20px 58px 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.job-landing-feature-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 14px 16px;
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--job-landing-accent, #1a8c54) 28%, #e2e8f0);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 20px -16px rgba(15, 23, 42, 0.35);
}
.job-landing-feature-copy {
  min-width: 0;
}
.job-landing-feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  margin-bottom: 0;
  border-radius: 999px;
  background: #e8f7ee;
  color: #258451;
  font-size: 1.35rem;
}
.job-landing-feature-card h3 {
  margin: 0 0 3px;
  font-size: 0.92rem;
  line-height: 1.25;
  font-weight: 700;
  color: #102033;
}
.job-landing-feature-card p {
  margin: 0;
  color: #64748b;
  line-height: 1.4;
  font-size: 0.82rem;
}
.job-landing-description-section {
  margin: 24px 58px 0;
  padding: 22px 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 10px 28px -18px rgba(15, 23, 42, 0.14);
}
.job-landing-start-card {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 28px;
  width: min(820px, calc(100% - 48px));
  margin: 0 auto;
  padding: 34px 42px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 48px -36px rgba(15, 23, 42, 0.55);
}
.job-landing-hero + .job-landing-start-card {
  margin-top: 16px;
}
.job-landing-feature-grid + .job-landing-start-card {
  margin-top: 16px;
}
.job-landing-description-section + .job-landing-start-card {
  margin-top: 16px;
}
.job-landing-start-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 92px;
  height: 92px;
  border-radius: 999px;
  background: #e8f7ee;
  color: #258451;
  font-size: 42px;
}
.job-landing-start-body h2 {
  margin: 0 0 6px;
  font-size: 26px;
  line-height: 1.2;
  color: #102033;
}
.job-landing-start-body p {
  margin: 0 0 14px;
  color: #64748b;
}
.job-landing-start-card .captcha-block-start {
  align-items: flex-start;
  text-align: left;
  margin: 12px 0;
  padding: 0;
}
.job-landing-start-card .captcha-block-start .recaptcha-widget {
  align-items: flex-start;
}
.job-landing-start-btn {
  width: min(420px, 100%);
  justify-content: center;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  background: #2fa26b;
  border-color: #2fa26b;
}
.job-landing-start-note {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  color: #64748b;
  font-size: 13px;
}
.job-landing-start-note .job-landing-icon-svg {
  width: 15px;
  height: 15px;
  color: #94a3b8;
}
.job-landing-trust-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  width: min(1180px, calc(100% - 72px));
  margin: 18px auto 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
}
.job-landing-trust-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 14px 22px;
  border-right: 1px solid rgba(15, 23, 42, 0.08);
}
.job-landing-trust-item:last-child {
  border-right: 0;
}
.job-landing-trust-icon {
  color: #258451;
  font-size: 24px;
  line-height: 1;
  flex: 0 0 auto;
}
.job-landing-trust-item strong,
.job-landing-trust-item small {
  display: block;
}
.job-landing-trust-item strong {
  color: #334155;
  font-size: 15px;
}
.job-landing-trust-item small {
  margin-top: 3px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.3;
}

@media (max-width: 720px) {
  .intake-card {
    padding: 18px 16px;
    border-radius: 14px;
  }
  .client-card {
    padding: 16px;
    border-radius: 14px;
  }
  .form-group input,
  .form-group textarea,
  .form-group select,
  .field-inputs input,
  .field-inputs textarea,
  .field-inputs select {
    font-size: 16px; /* keeps iOS from zooming the viewport */
  }
  .btn {
    padding: 11px 18px;
    font-size: 14px;
  }
}

@media (max-width: 980px) {
  .job-landing-header {
    padding: 16px 20px;
  }
  .job-landing-hero {
    grid-template-columns: 1fr;
    padding: 34px 24px 22px;
  }
  .job-landing-copy h1 {
    font-size: 44px;
  }
  .job-landing-lead {
    font-size: 23px;
  }
  .job-landing-image--organic img {
    border-radius: 28px 28px 28px 8px;
  }
  .job-landing-image:not(.job-landing-image--preframed):not(.job-landing-image--organic) img {
    border-radius: 28px 28px 28px 8px;
  }
  .job-landing-leaf-accent {
    left: -34px;
    bottom: -18px;
    transform: scale(0.8);
    transform-origin: left bottom;
  }
  .job-landing-feature-grid {
    grid-template-columns: 1fr;
    margin: 16px 24px 0;
  }
  .job-landing-description-section {
    margin: 16px 24px 0;
    padding: 18px 16px;
  }
  .job-landing-start-card {
    width: calc(100% - 32px);
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
    padding: 28px 22px;
  }
  .job-landing-start-card .captcha-block-start,
  .job-landing-start-card .captcha-block-start .recaptcha-widget {
    align-items: center;
    text-align: center;
  }
  .job-landing-trust-row {
    width: calc(100% - 32px);
    grid-template-columns: 1fr;
  }
  .job-landing-trust-item {
    border-right: 0;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }
  .job-landing-trust-item:last-child {
    border-bottom: 0;
  }
}

@media (max-width: 640px) {
  .intake-card--job-landing {
    border-radius: 12px;
  }
  .job-landing-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .job-landing-brand {
    font-size: 18px;
  }
  .job-landing-brand img {
    height: 48px;
    max-width: 120px;
  }
  .job-landing-hero {
    padding: 28px 18px 18px;
  }
  .job-landing-copy h1 {
    font-size: 34px;
  }
  .job-landing-lead {
    font-size: 21px;
  }
  .job-landing-description {
    font-size: 15px;
  }
  .job-landing-leaf-accent {
    display: none;
  }
  .job-landing-feature-grid {
    grid-template-columns: 1fr;
    margin: 0 14px;
  }
  .job-landing-start-card {
    width: calc(100% - 20px);
  }
  .job-landing-start-icon {
    width: 76px;
    height: 76px;
    font-size: 34px;
  }
  .job-landing-start-body h2 {
    font-size: 22px;
  }
}

.df-loading,
.df-fatal {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--df-muted, #5c6b63);
}

.public-intake :deep(.form-group) label,
.public-intake :deep(.form-grid label) {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--df-text, #1a2e24);
}

.public-intake :deep(.form-grid) {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.4rem 0.65rem;
  align-items: start;
}

.public-intake :deep(.form-group--span-12) {
  grid-column: span 12;
}

.public-intake :deep(.form-group--span-8) {
  grid-column: span 8;
}

.public-intake :deep(.form-group--span-6) {
  grid-column: span 6;
}

.public-intake :deep(.form-group--span-4) {
  grid-column: span 4;
}

.public-intake :deep(.form-group--span-3) {
  grid-column: span 3;
}

.intake-step-body {
  width: 100%;
  max-width: 52rem;
  margin: 0 auto;
}

.public-intake :deep(.intake-section) {
  margin-bottom: 1.1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--df-border, #e2e6e3);
}

.public-intake :deep(.intake-section:last-child) {
  border-bottom: none;
  padding-bottom: 0;
}

.public-intake :deep(.custom-fields),
.public-intake :deep(.clients-block),
.public-intake :deep(.multi-client-plan-block) {
  margin-bottom: 1.1rem;
}

.public-intake :deep(.form-group) {
  margin-bottom: 0;
}

.public-intake :deep(.form-group label) {
  margin-bottom: 3px;
}

.public-intake :deep(.field-inputs .form-grid) {
  gap: 0.45rem 0.7rem;
}

.public-intake :deep(.field-inputs h4) {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.public-intake :deep(.radio-group) {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  margin-bottom: 0;
}

.public-intake :deep(.radio-group .radio-row) {
  margin: 0;
}

.public-intake :deep(.client-card),
.public-intake :deep(.bound-client-card),
.public-intake :deep(.multi-client-plan-block),
.public-intake :deep(.multi-client-consent-panel) {
  border: 1px solid var(--df-border, #e2e6e3);
  border-radius: var(--df-radius, 14px);
  padding: 0.75rem 0.9rem;
  background: var(--df-surface, #fff);
  margin-bottom: 0.65rem;
}

.public-intake :deep(.step h3),
.public-intake :deep(.step h4) {
  color: var(--df-primary, #1e4d3b);
}

.public-intake :deep(.custom-fields h4),
.public-intake :deep(.clients-header h4) {
  margin: 0.45rem 0 0.15rem;
  font-size: 1rem;
}

.public-intake :deep(.custom-fields .muted) {
  margin-bottom: 0.35rem !important;
  font-size: 0.82rem;
  line-height: 1.35;
}

@media (max-width: 700px) {
  .intake-step-body {
    max-width: none;
  }

  .public-intake :deep(.form-group--span-3),
  .public-intake :deep(.form-group--span-4),
  .public-intake :deep(.form-group--span-6),
  .public-intake :deep(.form-group--span-8) {
    grid-column: span 12;
  }

  .df-shell--form-mode .df-choice-grid {
    grid-template-columns: 1fr;
  }
}

.df-cover-secondary-actions {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.df-not-my-school {
  min-width: 220px;
}

.df-need-help {
  border: none;
  background: transparent;
  color: var(--df-primary, #1e4d3b);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  padding: 4px 8px;
}

.splash-support-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 80;
  padding: 16px;
}

.splash-support-modal {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}

.splash-support-modal h3 {
  margin: 0 0 6px;
}

.splash-support-form {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.splash-support-form label {
  display: grid;
  gap: 4px;
  font-weight: 600;
  font-size: 0.9rem;
}

.splash-support-form input,
.splash-support-form textarea {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

.splash-support-honeypot {
  position: absolute;
  left: -9999px;
  opacity: 0;
  height: 0;
  width: 0;
}

.splash-support-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.splash-support-modal .success {
  color: #047857;
  margin: 0;
}

.intake-interview-page {
  margin-top: 0.35rem;
}

.df-section-kicker {
  margin: 1.15rem 0 0.35rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--df-primary, #1e4d3b);
  font-weight: 700;
}

.intake-interview-page :deep(.df-field-label) {
  font-size: 0.98rem;
  line-height: 1.4;
}

.intake-child-banner {
  margin: 0 0 0.75rem;
  font-size: 0.92rem;
  font-weight: 650;
  color: var(--df-primary, #1e4d3b);
}

.child-review-card {
  border: 1px solid var(--df-border, #d7e3dc);
  border-radius: 12px;
  padding: 1rem 1.1rem;
  background: var(--df-surface, #fff);
  margin-bottom: 1.25rem;
}

.child-review-summary {
  display: grid;
  gap: 0.65rem;
  margin: 0.75rem 0 1rem;
}

.child-review-summary div {
  display: grid;
  gap: 0.15rem;
}

.child-review-summary dt {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--df-muted, #5b6b63);
}

.child-review-summary dd {
  margin: 0;
  font-size: 0.95rem;
}

.child-review-add {
  margin-top: 0.5rem;
}

.public-intake :deep(.df-notice) {
  margin: 0.35rem 0 1rem;
}

.public-intake :deep(.df-shell--cover-mode:has(.intake-start-page) .df-main-body--cover) {
  max-width: min(1120px, 100%);
  width: 100%;
  align-items: stretch;
  justify-content: flex-start;
  text-align: left;
  padding-top: clamp(0.5rem, 1.5vh, 1.1rem);
}

.intake-start-page {
  width: 100%;
}

.intake-start-card {
  background: #fff;
  border: 1px solid var(--df-border, #dce8e2);
  border-radius: 20px;
  padding: clamp(1.25rem, 3vw, 2rem);
  box-shadow: 0 10px 32px rgba(15, 23, 42, 0.05);
  width: 100%;
}

.intake-start-page .ai-pathway-card {
  min-height: 5.5rem;
  text-align: left;
  padding: 0.9rem 1rem;
}

.intake-start-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.25rem;
  margin: 1.25rem 0 1.75rem;
}

.intake-start-col-title,
.intake-start-basics-title {
  margin: 0 0 0.65rem;
  font-size: 1rem;
  color: var(--df-primary, #1b3d2f);
}

.intake-start-list {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--df-muted, #64748b);
  font-size: 0.92rem;
  line-height: 1.55;
}

.intake-who-stack {
  display: grid;
  gap: 0.65rem;
}

.intake-who-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.intake-who-icon {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  margin-bottom: 0.35rem;
}

.intake-card-section {
  background: #fff;
  border: 1px solid var(--df-border, #dce8e2);
  border-radius: 16px;
  padding: 1.15rem 1.2rem 1.25rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.intake-pager-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.intake-pager-meta {
  color: var(--df-muted, #64748b);
  font-size: 0.85rem;
  font-weight: 600;
}

.intake-continue-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  padding: 0.7rem 1.25rem;
  border-radius: 12px;
}

.intake-save-later-btn,
.intake-back-btn {
  min-height: 2.5rem;
  border-radius: 12px;
}

.intake-secondary-actions {
  margin-top: 1.25rem;
}

@media (max-width: 900px) {
  .intake-start-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .intake-who-grid {
    grid-template-columns: 1fr;
  }

  .intake-pager-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .intake-pager-meta {
    text-align: center;
    order: -1;
  }
}
</style>
