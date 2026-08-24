<template>
  <div class="so-shell" :style="shellVars">
    <aside class="so-sidebar">
      <div class="so-brand">
        <img v-if="agencyLogo" :src="agencyLogo" alt="" class="so-brand-logo" />
        <div v-else class="so-brand-mark">{{ agencyInitial }}</div>
        <div>
          <div class="so-brand-name">{{ agencyName }}</div>
          <div class="so-brand-tag">School portal onboarding</div>
        </div>
      </div>

      <nav class="so-nav" aria-label="Onboarding steps">
        <button
          type="button"
          class="so-nav-item"
          :class="{ active: currentStep === 'home' }"
          @click="go('home')"
        >
          Onboarding Home
        </button>
        <button
          v-for="step in steps"
          :key="step.key"
          type="button"
          class="so-nav-item"
          :class="{ active: currentStep === step.key, done: progress[step.key] === 'complete' }"
          @click="go(step.key)"
        >
          {{ step.label }}
        </button>
      </nav>

      <div class="so-help">
        <strong>Need help?</strong>
        <p class="muted">Questions about setup? Reach out to the team that invited you.</p>
        <a v-if="supportEmail" class="so-help-link" :href="`mailto:${supportEmail}`">Email support</a>
        <a v-if="supportPhone" class="so-help-link" :href="supportPhoneTel">{{ supportPhone }}</a>
      </div>
    </aside>

    <div class="so-main">
      <header class="so-top">
        <div>
          <div class="so-school">{{ invite?.schoolName || 'Your school' }}</div>
          <div class="muted tiny">
            Invited by:
            {{ invite?.invitedByName || 'Admin' }}
            <span v-if="agencyName">({{ agencyName }})</span>
          </div>
        </div>
        <div class="so-avatar" aria-hidden="true">{{ schoolInitials }}</div>
      </header>

      <div class="so-main-body">
      <div v-if="loading" class="so-panel muted">Loading your onboarding…</div>
      <div v-else-if="error" class="so-panel error-box">{{ error }}</div>
      <template v-else-if="invite">
        <section v-if="invite.submitted" class="so-thanks" aria-live="polite">
          <div class="so-thanks-confetti" aria-hidden="true">
            <span
              v-for="i in 24"
              :key="i"
              class="so-thanks-confetti-piece"
              :style="confettiStyle(i)"
            />
          </div>
          <div class="so-thanks-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <h2 class="so-thanks-title">Thank You!</h2>
          <p class="so-thanks-sub">Your School Portal has been created.</p>

          <div class="so-thanks-info-cards">
            <article class="so-thanks-info-card">
              <div class="so-thanks-info-icon" aria-hidden="true">🛡</div>
              <p>
                We will verify your information and ensure you are ready within
                <strong>24 hours</strong> to begin submitting referrals through the system digitally.
              </p>
            </article>
            <article v-if="requestedPaperPackets" class="so-thanks-info-card">
              <div class="so-thanks-info-icon" aria-hidden="true">✉</div>
              <p>
                Paper referral packets will appear in the <strong>Documents</strong> section of your school portal
                within <strong>72 hours</strong>. Print from the English or Spanish Google Document links there —
                please do not save copies, as these are living documents we update from time to time.
              </p>
            </article>
          </div>

          <div class="so-thanks-access">
            <h3>Your School Portal Access</h3>
            <div class="so-thanks-access-row">
              <div class="so-thanks-access-icon" aria-hidden="true">🌐</div>
              <div class="so-thanks-access-body">
                <span class="so-thanks-access-label">Quick Link</span>
                <strong class="so-thanks-access-value so-thanks-link">{{ loginDisplayHost }}</strong>
              </div>
              <a class="btn ghost so-thanks-btn" :href="loginHref" target="_blank" rel="noopener noreferrer">
                Open Link
              </a>
            </div>
            <div class="so-thanks-access-row">
              <div class="so-thanks-access-icon" aria-hidden="true">👤</div>
              <div class="so-thanks-access-body">
                <span class="so-thanks-access-label">Username</span>
                <strong class="so-thanks-access-value">{{ displayUsername }}</strong>
              </div>
              <div class="so-thanks-row-actions">
                <button type="button" class="btn ghost so-thanks-btn" @click="copyText(displayUsername, 'Username')">
                  Copy
                </button>
              </div>
            </div>
            <div class="so-thanks-access-row">
              <div class="so-thanks-access-icon" aria-hidden="true">🔒</div>
              <div class="so-thanks-access-body">
                <span class="so-thanks-access-label">Password</span>
                <strong v-if="personalPasswordForThankYou" class="so-thanks-access-value">
                  {{ showThankYouPassword ? personalPasswordForThankYou : '•••••••••' }}
                </strong>
                <strong v-else class="so-thanks-access-value muted">
                  The personal password you created
                </strong>
              </div>
              <div class="so-thanks-row-actions">
                <button
                  v-if="personalPasswordForThankYou"
                  type="button"
                  class="btn ghost so-thanks-btn"
                  @click="showThankYouPassword = !showThankYouPassword"
                >
                  {{ showThankYouPassword ? 'Hide' : 'View' }}
                </button>
                <button
                  v-if="personalPasswordForThankYou"
                  type="button"
                  class="btn ghost so-thanks-btn"
                  @click="copyText(personalPasswordForThankYou, 'Password')"
                >
                  Copy
                </button>
              </div>
            </div>
            <p class="muted tiny so-thanks-login-hint">
              After you leave this page, go to your school portal login, sign in with your username and password,
              and keep your password private — do not share it with others.
            </p>
            <p v-if="copyFeedback" class="ok so-thanks-copy-feedback">{{ copyFeedback }}</p>
          </div>

          <div class="so-thanks-welcome">
            Welcome to the <strong>{{ agencyName }}</strong> community. We’re excited to partner with you!
          </div>
          <button type="button" class="btn primary so-thanks-got-it" @click="goToLogin">
            Got It
          </button>
        </section>

        <template v-else>
          <!-- Home -->
          <section v-if="currentStep === 'home'" class="so-home">
            <div class="so-hero-banner">
              <div class="so-hero-text">
                <p class="so-hero-eyebrow">School portal onboarding</p>
                <h1>Welcome to {{ agencyName }}, {{ invite.contactFirstName }}</h1>
                <p class="so-hero-sub">
                  Follow the steps below to complete your school portal setup. Progress saves automatically.
                </p>
              </div>
              <img v-if="agencyLogo" :src="agencyLogo" alt="" class="so-hero-logo" />
              <div v-else class="so-hero-mark" aria-hidden="true">{{ agencyInitial }}</div>
            </div>

            <div class="so-stepper">
              <template v-for="(step, idx) in steps" :key="step.key">
                <button
                  type="button"
                  class="so-step"
                  :class="{
                    active: firstIncomplete === step.key,
                    done: progress[step.key] === 'complete'
                  }"
                  @click="go(step.key)"
                >
                  <span class="so-step-num">{{ idx + 1 }}</span>
                  <span>{{ step.label }}</span>
                </button>
                <span v-if="idx < steps.length - 1" class="so-step-chevron" aria-hidden="true">›</span>
              </template>
            </div>

            <div class="so-home-grid">
              <article class="so-card">
                <h2>{{ startHereGuide.title }}</h2>
                <p>{{ startHereGuide.description }}</p>
                <ul class="so-checklist">
                  <li v-for="(item, idx) in startHereGuide.bullets" :key="idx">{{ item }}</li>
                </ul>
                <button type="button" class="btn primary" @click="go(firstIncomplete)">
                  {{ startCta }} →
                </button>
              </article>

              <article class="so-card">
                <h2>Your progress</h2>
                <p>{{ invite.completedSteps }} of {{ invite.totalSteps }} steps complete.</p>
                <div class="so-progress-bar">
                  <div class="so-progress-fill" :style="{ width: `${progressPct}%` }" />
                </div>
                <ul class="so-progress-list">
                  <li v-for="step in steps" :key="step.key">
                    <span>{{ step.label }}</span>
                    <span class="muted tiny">{{ statusLabel(progress[step.key]) }}</span>
                  </li>
                </ul>
              </article>
            </div>

            <div class="so-info-row">
              <article class="so-info">
                <h3>Your data is secure</h3>
                <p class="muted">Only your school team and {{ agencyName }} can access portal information.</p>
              </article>
              <article class="so-info">
                <h3>Save &amp; continue later</h3>
                <p class="muted">Use this invite link anytime before it expires — progress is saved.</p>
              </article>
              <article class="so-info">
                <h3>See a portal in action</h3>
                <p class="muted">Browse the real Hogwarts school portal (view-only) before you submit.</p>
                <button type="button" class="linkish" @click="openDemo">Preview demo</button>
              </article>
            </div>
          </section>

          <!-- School information -->
          <section v-else-if="currentStep === 'school_information'" class="so-panel">
            <h2>School information</h2>
            <form class="so-form" @submit.prevent="attemptSaveSchoolInfo">
              <div
                v-if="showSchoolInfoValidation && schoolInfoBlankFields.length"
                class="so-incomplete-warning"
                role="alert"
              >
                <strong>{{ schoolInfoBlankFields.length }} field{{ schoolInfoBlankFields.length === 1 ? '' : 's' }} still blank</strong>
                <p>
                  Highlighted fields below are empty. You can continue to the next step, but this section
                  <strong>will not be marked complete</strong> and blank answers <strong>will not be saved</strong>.
                </p>
                <ul class="so-missing-list">
                  <li v-for="field in schoolInfoBlankFields" :key="field.key">{{ field.label }}</li>
                </ul>
                <div class="so-warning-actions">
                  <button
                    type="button"
                    class="btn primary"
                    :disabled="saving"
                    @click="continueSchoolInfoWithoutFinishing"
                  >
                    {{ saving ? 'Continuing…' : 'Continue to next step' }}
                  </button>
                  <button type="button" class="btn ghost" :disabled="saving" @click="keepSchoolInfoInProgress">
                    Keep section in progress
                  </button>
                </div>
              </div>

              <div class="so-grid">
                <label
                  class="span-2"
                  :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('schoolName') }"
                >
                  School name
                  <input v-model.trim="schoolForm.schoolName" />
                </label>
                <div
                  class="span-2 so-group-email"
                  :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('itscoEmail') }"
                >
                  <span class="so-field-label">Preferred school group email</span>
                  <p class="so-field-hint muted">
                    Used when {{ agencyName }} needs to reach your school team by email.
                    Examples: Rudy Elementary → <code>rudy@{{ groupEmailDomain }}</code>,
                    Cheyenne Mountain Middle → <code>cms@{{ groupEmailDomain }}</code>.
                  </p>
                  <div class="so-email-compose">
                    <input
                      v-model="groupEmailLocal"
                      type="text"
                      inputmode="email"
                      autocomplete="off"
                      placeholder="e.g. riverdale"
                    />
                    <span class="so-email-domain">@{{ groupEmailDomain }}</span>
                  </div>
                  <div v-if="groupEmailSuggestions.length" class="so-email-suggestions">
                    <span class="so-suggest-label">
                      Suggestions for {{ schoolForm.schoolName || 'your school' }}:
                    </span>
                    <div class="so-suggest-chips">
                      <button
                        v-for="suggestion in groupEmailSuggestions"
                        :key="suggestion.email"
                        type="button"
                        class="so-suggest-chip"
                        :class="{ selected: schoolForm.itscoEmail === suggestion.email }"
                        :title="suggestion.reason"
                        @click="selectGroupEmailSuggestion(suggestion.email)"
                      >
                        {{ suggestion.email }}
                      </button>
                    </div>
                  </div>
                </div>
                <label :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('districtName') }">
                  District
                  <input v-model.trim="schoolForm.districtName" />
                </label>
                <label :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('schoolNumber') }">
                  School number
                  <input v-model.trim="schoolForm.schoolNumber" />
                </label>
                <label
                  class="span-2"
                  :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('schoolAddress') }"
                >
                  School address
                  <input v-model.trim="schoolForm.schoolAddress" />
                </label>
                <label :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('academicYear') }">
                  Academic year
                  <input v-model.trim="schoolForm.academicYear" placeholder="e.g. 2026–2027" />
                </label>
                <label :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('gradeLevels') }">
                  Grade levels
                  <input v-model.trim="schoolForm.gradeLevels" placeholder="e.g. K–12" />
                </label>
                <label
                  :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('primaryContactName') }"
                >
                  Primary contact name
                  <input v-model.trim="schoolForm.primaryContactName" />
                </label>
                <label
                  :class="{ 'so-field-missing': showSchoolInfoValidation && isSchoolInfoFieldBlank('primaryContactEmail') }"
                >
                  Primary contact email
                  <input v-model.trim="schoolForm.primaryContactEmail" type="email" />
                </label>
              </div>
              <p v-if="actionError" class="error">{{ actionError }}</p>
              <div class="so-actions">
                <button type="submit" class="btn primary" :disabled="saving">
                  {{ saving ? 'Completing…' : 'Mark complete & continue' }}
                </button>
              </div>
            </form>
          </section>

          <!-- School staff -->
          <section v-else-if="currentStep === 'school_staff'" class="so-panel">
            <h2>Add school staff</h2>
            <p class="muted">
              Add colleagues with their school email and choose each person’s access role.
              <strong>Standard / School Admin</strong> accounts can be selected for Smart School ROI.
              <strong>Scheduler</strong> accounts stay limited/own-only and are not added to ROI assignment lists.
            </p>

            <label class="block so-staff-password">
              <span>Shared temporary password for staff accounts</span>
              <span class="muted tiny">
                This is a <strong>temporary password only</strong> — it is <strong>not</strong> each staff
                member’s real password. They will log in with this once, then set their own password.
                You may type something simple at your discretion, or click below to generate a stronger one.
                Keep it private. You will create <em>your</em> personal password on the final step (separate from
                this shared temp password).
              </span>
              <div class="so-staff-password-row">
                <input
                  v-model="sharedTempPassword"
                  type="text"
                  autocomplete="off"
                  placeholder="Set one temporary password for all staff"
                />
                <button type="button" class="btn ghost" @click="useAutogeneratedStaffPassword">
                  {{ sharedTempPassword ? 'Generate another password' : 'Use autogenerated password' }}
                </button>
              </div>
              <span class="so-expiry-note">
                Staff must log in and set their own password within
                <strong>{{ staffTempPasswordExpiryLabel }}</strong>.
                As school admin, you can reset a password or create another temporary password later from the portal.
              </span>
            </label>

            <div v-for="(row, idx) in staffRows" :key="idx" class="so-staff-card">
              <label class="block">
                Full name
                <input v-model.trim="row.fullName" placeholder="Full name" />
              </label>
              <label class="block">
                School email
                <input v-model.trim="row.email" type="email" placeholder="School email" />
                <span class="muted tiny">
                  This will be their <strong>username</strong> when logging in to your school portal.
                </span>
              </label>
              <label class="block" :class="{ 'so-field-missing': staffRowNeedsRole(row) }">
                Access role
                <select v-model="row.accessRole" :disabled="!staffRowIdentityReady(row)">
                  <option value="" disabled>Select access role…</option>
                  <option value="standard">Standard (ROI-eligible)</option>
                  <option value="school_admin">School Admin (ROI-eligible)</option>
                  <option value="scheduler">Scheduler (not on ROI lists)</option>
                  <option value="school_admin_scheduler">School Admin + Scheduler</option>
                </select>
                <span class="muted tiny">
                  Choose this <strong>after</strong> entering their name and school email. You must select a role —
                  it determines whether they can appear on Smart School ROI for students or their parents to sign.
                </span>
              </label>
              <p class="muted tiny">{{ roleHelper(row.accessRole) }}</p>
              <button type="button" class="linkish danger" @click="staffRows.splice(idx, 1)">Remove</button>
            </div>
            <button
              type="button"
              class="btn ghost"
              @click="staffRows.push({ fullName: '', email: '', accessRole: '' })"
            >
              + Add another
            </button>
            <p class="muted tiny" style="margin-top:0.75rem;">
              You can continue with no additional staff — you are already School Admin for this portal.
            </p>

            <div v-if="showStaffRoiConfirm" class="so-roi-confirm" role="alertdialog" aria-labelledby="so-roi-confirm-title">
              <h3 id="so-roi-confirm-title">Confirm Smart School ROI access</h3>
              <p>
                Are you sure you want
                <strong>{{ roiConfirmStaffLabel }}</strong>
                to be on the ROI for students or their parents to sign?
              </p>
              <p class="muted tiny">
                If not, please change their access role to <strong>Scheduler</strong> or
                <strong>School Admin + Scheduler</strong> to limit what they are able to see.
              </p>
              <div class="so-warning-actions">
                <button type="button" class="btn primary" :disabled="saving" @click="confirmSaveStaff">
                  {{ saving ? 'Continuing…' : 'Yes, continue' }}
                </button>
                <button type="button" class="btn ghost" :disabled="saving" @click="cancelStaffRoiConfirm">
                  Go back and review roles
                </button>
              </div>
            </div>

            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div v-if="!showStaffRoiConfirm" class="so-actions">
              <button type="button" class="btn primary" :disabled="saving" @click="saveStaff">
                {{ saving ? 'Completing…' : 'Mark complete & continue' }}
              </button>
            </div>
          </section>

          <!-- Preferred days -->
          <section v-else-if="currentStep === 'preferred_days'" class="so-panel">
            <h2>Preferred days &amp; settings</h2>
            <p class="muted">Which days work best for services at your school?</p>
            <div class="so-days">
              <label v-for="day in weekDays" :key="day" class="so-day">
                <input v-model="preferredDays" type="checkbox" :value="day" />
                {{ day }}
              </label>
            </div>
            <label class="block">
              Notes
              <textarea v-model.trim="preferredNotes" rows="3" placeholder="Bell schedule, blackout days, etc." />
            </label>
            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div class="so-actions">
              <button type="button" class="btn primary" :disabled="saving" @click="savePreferredDays">
                {{ saving ? 'Completing…' : 'Mark complete & continue' }}
              </button>
            </div>
          </section>

          <!-- Welcome materials -->
          <section v-else-if="currentStep === 'welcome_materials'" class="so-panel">
            <h2>Welcome materials</h2>
            <p class="muted">
              Every new school receives a small <strong>welcome package</strong> with a few starter items.
              Let us know if you’d like anything extra, and how you’d like to handle paper referral packets
              alongside your digital intake links.
            </p>

            <div class="so-materials-block">
              <h3>Additional materials (optional)</h3>
              <p class="muted tiny">Select anything you’d like included beyond the welcome package.</p>
              <div class="so-materials-options">
                <label v-for="opt in materialOptions" :key="opt.key" class="so-material-opt">
                  <input v-model="materialsSelected" type="checkbox" :value="opt.key" />
                  {{ opt.label }}
                </label>
              </div>
              <label v-if="materialsSelected.includes('other')" class="block" style="margin-top:0.75rem;">
                Other materials
                <input v-model.trim="materialsOther" type="text" maxlength="500" placeholder="Tell us what you’d like" />
              </label>
            </div>

            <div class="so-materials-block">
              <h3>Paper referral packets</h3>
              <p class="muted tiny">
                You’ll have digital links for referrals. Paper referral packets will also be added to the
                <strong>Documents</strong> section of your school portal. You can print directly from the linked
                Google Documents (English and Spanish versions) — we update these occasionally as living documents.
              </p>
              <p class="muted tiny so-paper-living-docs">
                If you print from those links, please <strong>do not save a copy</strong> to your computer.
                Always use the latest version in your portal so you have the most current forms.
              </p>
              <p class="muted tiny">
                Would you also like us to prepare paper packets for your school? This takes up to
                <strong>72 hours</strong> to create and upload into your portal profile.
              </p>
              <div class="so-paper-choices">
                <label class="so-paper-choice" :class="{ selected: requestPaperPackets === true }">
                  <input v-model="requestPaperPackets" type="radio" :value="true" />
                  Yes, please add paper packets to my portal
                </label>
                <label class="so-paper-choice" :class="{ selected: requestPaperPackets === false }">
                  <input v-model="requestPaperPackets" type="radio" :value="false" />
                  No thanks — digital links are enough
                </label>
              </div>
            </div>

            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div class="so-actions">
              <button type="button" class="btn primary" :disabled="saving" @click="saveWelcomeMaterials">
                {{ saving ? 'Completing…' : 'Mark complete & continue' }}
              </button>
            </div>
          </section>

          <!-- Explore demo -->
          <section v-else-if="currentStep === 'explore_demo'" class="so-panel">
            <h2>Explore the demo</h2>
            <p>
              Open the <strong>real Hogwarts school portal</strong> (no login, view-only) so you can see exactly what schools get.
              It’s a browse-only copy — no real accounts or permissions.
            </p>
            <p class="muted">
              Open the demo to browse, then click <strong>Continue to review</strong> when you’re done.
              Or choose skip if you want to come back later.
            </p>
            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div class="so-actions">
              <button type="button" class="btn primary" :disabled="saving" @click="openDemo">
                {{ saving ? 'Opening…' : 'Open Hogwarts demo' }}
              </button>
              <button
                type="button"
                class="btn ghost"
                :disabled="saving"
                @click="markDemoCompleteAndContinue"
              >
                Skip for now →
              </button>
              <button
                v-if="progress.explore_demo === 'complete'"
                type="button"
                class="btn ghost"
                @click="go('review_submit')"
              >
                Continue to review →
              </button>
            </div>
          </section>

          <!-- Review & submit -->
          <section v-else-if="currentStep === 'review_submit'" class="so-panel">
            <h2>Review &amp; submit</h2>
            <p class="muted">
              Confirm each step below looks correct, then create your login password to activate your school portal.
            </p>
            <ul class="so-progress-list">
              <li v-for="step in steps.filter((s) => s.key !== 'review_submit')" :key="step.key">
                <span>{{ step.label }}</span>
                <span :class="progress[step.key] === 'complete' ? 'ok' : 'warn'">
                  {{ statusLabel(progress[step.key]) }}
                </span>
              </li>
            </ul>

            <div v-if="!invite.passwordSet" class="so-password-final">
              <h3>Confirm who you are &amp; create your login password</h3>
              <p class="muted tiny">
                {{
                  invite.source === 'qr'
                    ? 'You started from a QR link — please confirm your details below, then choose your personal password.'
                    : 'This invitation was sent to you — confirm your details match, then choose your personal password.'
                }}
              </p>
              <p class="muted tiny so-password-privacy">
                This is <strong>your</strong> login password — not the shared staff temporary password.
                Do <strong>not</strong> share it. After you finish, sign in at your school portal link with your
                username (email) and this password.
              </p>
              <div class="so-grid so-identity-grid">
                <label>
                  Your first name
                  <input v-model.trim="identityForm.contactFirstName" autocomplete="given-name" />
                </label>
                <label>
                  Your last name
                  <input v-model.trim="identityForm.contactLastName" autocomplete="family-name" />
                </label>
                <label class="span-2">
                  Your school email (username)
                  <input v-model.trim="identityForm.contactEmail" type="email" autocomplete="email" />
                </label>
                <label class="span-2">
                  School name
                  <input v-model.trim="identityForm.schoolName" />
                </label>
              </div>
              <label class="so-identity-confirm">
                <input v-model="identityForm.confirmed" type="checkbox" />
                <span>
                  I confirm that I am
                  <strong>{{ identityDisplayName }}</strong>
                  at <strong>{{ identityForm.schoolName || invite.schoolName }}</strong>
                  and this is my school email:
                  <strong>{{ identityForm.contactEmail || invite.contactEmail }}</strong>.
                </span>
              </label>
              <div class="so-grid so-password-grid">
                <label>
                  Your personal password
                  <input v-model="password" type="password" minlength="10" autocomplete="new-password" />
                </label>
                <label>
                  Confirm your personal password
                  <input v-model="passwordConfirm" type="password" minlength="10" autocomplete="new-password" />
                </label>
              </div>
            </div>
            <div v-else class="so-password-done">
              <h3>Login password</h3>
              <p class="muted ok">Password created for {{ invite.username || invite.contactEmail }}.</p>
              <p class="muted tiny">
                Keep this password private. You’ll use it with your username to sign in at your school portal link.
              </p>
            </div>

            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div class="so-actions">
              <button type="button" class="btn primary" :disabled="saving || !canSubmit" @click="submit">
                {{ saving ? 'Submitting…' : 'Submit & activate portal' }}
              </button>
            </div>
          </section>
        </template>
      </template>

      <footer class="so-footer muted">
        Questions? Contact
        <a v-if="supportEmail" :href="`mailto:${supportEmail}`">{{ supportEmail }}</a>
        <span v-if="supportEmail && supportPhone"> or </span>
        <span v-if="supportPhone">{{ supportPhone }}</span>
        <span v-if="!supportEmail && !supportPhone">your {{ agencyName }} contact</span>.
      </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import {
  buildSchoolGroupEmail,
  parseSchoolGroupEmailLocal,
  resolveSchoolGroupEmailDomain,
  resolveSchoolOnboardingSupportEmail,
  resolveSchoolOnboardingSupportPhone,
  suggestSchoolGroupEmails
} from '../../utils/schoolGroupEmailSuggestions.js';
import {
  formatStaffTempPasswordExpiry,
  generateStaffTempPassword,
  SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS
} from '../../utils/schoolStaffTempPassword.js';
import { buildOrgLoginPath } from '../../utils/orgLoginPath.js';
import { resolveHostImpliedPortalSlug } from '../../utils/orgScopedPath.js';
import { checkPasswordBasics } from '../../utils/passwordPolicy.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const steps = [
  { key: 'school_information', label: 'School Information' },
  { key: 'school_staff', label: 'Add School Staff' },
  { key: 'preferred_days', label: 'Preferred Days' },
  { key: 'welcome_materials', label: 'Welcome Materials' },
  { key: 'explore_demo', label: 'Explore Demo' },
  { key: 'review_submit', label: 'Review & Submit' }
];
const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const materialOptions = [
  { key: 'trifolds', label: 'Trifolds' },
  { key: 'stress_balls', label: 'Stress balls' },
  { key: 'pens', label: 'Pens' },
  { key: 'other', label: 'Other' }
];

const SCHOOL_INFO_FIELDS = [
  { key: 'schoolName', label: 'School name' },
  { key: 'itscoEmail', label: 'Preferred school group email' },
  { key: 'districtName', label: 'District' },
  { key: 'schoolNumber', label: 'School number' },
  { key: 'schoolAddress', label: 'School address' },
  { key: 'academicYear', label: 'Academic year' },
  { key: 'gradeLevels', label: 'Grade levels' },
  { key: 'primaryContactName', label: 'Primary contact name' },
  { key: 'primaryContactEmail', label: 'Primary contact email' }
];

const token = computed(() => String(route.params.token || '').trim());
const RESERVED_TOKENS = new Set(['login', 'start', 'demo']);
const currentStep = computed(() => {
  const s = String(route.params.step || 'home').trim();
  if (!s || s === 'home') return 'home';
  return steps.some((x) => x.key === s) ? s : 'home';
});

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const actionError = ref('');
const invite = ref(null);
const password = ref('');
const passwordConfirm = ref('');
const identityForm = reactive({
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
  schoolName: '',
  confirmed: false
});
const preferredDays = ref([]);
const preferredNotes = ref('');
const materialsSelected = ref([]);
const materialsOther = ref('');
const requestPaperPackets = ref(null);
const sharedTempPassword = ref('');
const staffRows = ref([{ fullName: '', email: '', accessRole: '' }]);
const showStaffRoiConfirm = ref(false);
const showSchoolInfoValidation = ref(false);
const personalPasswordForThankYou = ref('');
const showThankYouPassword = ref(false);
const copyFeedback = ref('');
let copyFeedbackTimer = null;
const schoolForm = reactive({
  schoolName: '',
  itscoEmail: '',
  districtName: '',
  schoolNumber: '',
  schoolAddress: '',
  academicYear: '',
  gradeLevels: '',
  primaryContactName: '',
  primaryContactEmail: ''
});

const progress = computed(() => invite.value?.stepProgress || {});
const firstIncomplete = computed(() => {
  for (const s of steps) {
    if (progress.value[s.key] !== 'complete') return s.key;
  }
  return 'review_submit';
});
const startHereGuide = computed(() => {
  const key = firstIncomplete.value;
  if (key === 'school_information') {
    return {
      title: 'Start here',
      description: 'Add your school profile, contact details, and preferred group email.',
      bullets: [
        'School profile and contact details',
        'Preferred school group email for communications',
        'Academic year and grade levels'
      ]
    };
  }
  if (key === 'school_staff') {
    return {
      title: 'Add your team',
      description: 'Invite school staff who will use the portal.',
      bullets: [
        'Colleague names and school emails',
        'Access role for each person',
        'Shared temporary password for staff (separate from your own login)'
      ]
    };
  }
  if (key === 'preferred_days') {
    return {
      title: 'Preferred days',
      description: 'Tell us which weekdays work best for services at your school.',
      bullets: ['Select preferred service days', 'Add scheduling notes if needed']
    };
  }
  if (key === 'welcome_materials') {
    return {
      title: 'Welcome materials',
      description: 'Tell us about optional swag and whether you want paper referral packets.',
      bullets: [
        'You’ll receive a small welcome package',
        'Optional extras: trifolds, stress balls, pens',
        'Paper packets in Documents (print from Google Docs)'
      ]
    };
  }
  if (key === 'explore_demo') {
    return {
      title: 'Explore the demo',
      description: 'Browse a view-only copy of the school portal before you submit.',
      bullets: ['Open the Hogwarts demo portal', 'Click continue when you are done exploring']
    };
  }
  return {
    title: 'Almost done',
    description: 'Review your answers, create your personal password, and submit to activate your school portal.',
    bullets: [
      'Confirm each step looks correct',
      'Create your private login password',
      'Submit when you are ready'
    ]
  };
});
const startCta = computed(() => {
  const key = firstIncomplete.value;
  const step = steps.find((s) => s.key === key);
  return step ? `Start ${step.label}` : 'Continue';
});
const agencyName = computed(() => invite.value?.agency?.name || 'Your partner');
const agencyLogo = computed(() => invite.value?.agency?.logoUrl || null);
const agencyInitial = computed(() => (agencyName.value || 'S').charAt(0).toUpperCase());
const supportEmail = computed(
  () =>
    invite.value?.agency?.supportEmail || resolveSchoolOnboardingSupportEmail(invite.value?.agency || {})
);
const staffTempPasswordExpiryLabel = computed(() =>
  formatStaffTempPasswordExpiry(
    invite.value?.staffTempPasswordExpiresHours || SCHOOL_STAFF_TEMP_PASSWORD_EXPIRY_HOURS
  )
);
const identityDisplayName = computed(() => {
  const name = `${identityForm.contactFirstName} ${identityForm.contactLastName}`.trim();
  return name || 'the primary contact';
});
const identityReady = computed(() => {
  if (!identityForm.confirmed) return false;
  if (
    !identityForm.contactFirstName.trim() ||
    !identityForm.contactLastName.trim() ||
    !identityForm.contactEmail.trim() ||
    !identityForm.schoolName.trim()
  ) {
    return false;
  }
  const inviteEmail = String(invite.value?.contactEmail || '').trim().toLowerCase();
  return identityForm.contactEmail.trim().toLowerCase() === inviteEmail;
});
const supportPhoneInfo = computed(() =>
  resolveSchoolOnboardingSupportPhone({
    ...(invite.value?.agency || {}),
    phone: invite.value?.agency?.phone,
    phoneExtension: invite.value?.agency?.phoneExtension,
  })
);
const supportPhone = computed(() => supportPhoneInfo.value.display || null);
const supportPhoneTel = computed(() => supportPhoneInfo.value.tel || null);
const groupEmailDomain = computed(() =>
  invite.value?.agency?.schoolGroupEmailDomain || resolveSchoolGroupEmailDomain(invite.value?.agency || {})
);
const groupEmailLocal = computed({
  get() {
    return parseSchoolGroupEmailLocal(schoolForm.itscoEmail, groupEmailDomain.value);
  },
  set(local) {
    const cleaned = String(local || '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    schoolForm.itscoEmail = cleaned ? buildSchoolGroupEmail(cleaned, groupEmailDomain.value) : '';
  }
});
const groupEmailSuggestions = computed(() => {
  if (!schoolForm.schoolName.trim()) return [];
  return suggestSchoolGroupEmails(schoolForm.schoolName, groupEmailDomain.value);
});
const schoolInfoBlankFields = computed(() =>
  SCHOOL_INFO_FIELDS.filter((field) => isSchoolInfoFieldBlank(field.key))
);
const schoolInitials = computed(() => {
  const name = invite.value?.schoolName || 'SC';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'SC';
});
const progressPct = computed(() => {
  const total = invite.value?.totalSteps || steps.length;
  const done = invite.value?.completedSteps || 0;
  return Math.round((done / total) * 100);
});
const canSubmit = computed(() => {
  const stepsComplete = [
    'school_information',
    'school_staff',
    'preferred_days',
    'welcome_materials',
    'explore_demo'
  ].every((k) => progress.value[k] === 'complete');
  if (!stepsComplete) return false;
  if (invite.value?.passwordSet) return true;
  if (!identityReady.value) return false;
  return password.value.length >= 6 && password.value === passwordConfirm.value;
});
const loginPath = computed(() => {
  const schoolSlug = invite.value?.schoolSlug || invite.value?.school?.slug;
  const agencySlug = invite.value?.agency?.slug;
  const hostImplied = resolveHostImpliedPortalSlug(brandingStore);
  return buildOrgLoginPath(schoolSlug, agencySlug, hostImplied);
});
const loginHref = computed(() => {
  if (typeof window === 'undefined') return loginPath.value;
  return `${window.location.origin}${loginPath.value}`;
});
const loginDisplayHost = computed(() => {
  try {
    const url = new URL(loginHref.value);
    const host = url.host.replace(/^www\./i, '');
    const path = url.pathname.replace(/\/login\/?$/i, '').replace(/^\//, '');
    return path ? `${host}/${path}` : host;
  } catch {
    return loginHref.value.replace(/^https?:\/\//i, '').replace(/\/login\/?$/i, '');
  }
});
const displayUsername = computed(
  () => invite.value?.username || invite.value?.contactEmail || identityForm.contactEmail || ''
);
const requestedPaperPackets = computed(() => {
  const raw = invite.value?.stepPayload?.welcome_materials?.requestPaperPackets;
  return raw === true;
});

const shellVars = computed(() => {
  const palette = invite.value?.agency?.colorPalette || {};
  const primary = palette.primary || palette.primaryColor || '#2d6a4f';
  const secondary = palette.secondary || palette.secondaryColor || primary;
  const accent = palette.accent || palette.accentColor || secondary;
  return {
    '--so-primary': primary,
    '--so-secondary': secondary,
    '--so-accent': accent,
    '--so-primary-dark': `color-mix(in srgb, ${primary} 72%, #0f172a)`,
    '--so-primary-soft': `color-mix(in srgb, ${primary} 14%, #fff)`,
    '--so-primary-softer': `color-mix(in srgb, ${primary} 7%, #fff)`,
    '--so-primary-muted': `color-mix(in srgb, ${primary} 22%, #fff)`,
    '--so-shell-bg': `linear-gradient(145deg, color-mix(in srgb, ${primary} 9%, #fff) 0%, color-mix(in srgb, ${accent} 6%, #f8fafc) 42%, #ffffff 100%)`,
    '--so-sidebar-bg': `linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, ${primary} 8%, #fff) 100%)`,
    '--so-hero-bg': `linear-gradient(125deg, ${primary} 0%, color-mix(in srgb, ${primary} 70%, ${secondary}) 55%, color-mix(in srgb, ${primary} 55%, #0f172a) 100%)`
  };
});

function statusLabel(s) {
  if (s === 'complete') return 'Complete';
  if (s === 'in_progress') return 'In progress';
  return 'Not started';
}

function roleHelper(accessRole) {
  const role = String(accessRole || '').trim().toLowerCase();
  if (!role) {
    return 'Select an access role after entering their name and school email.';
  }
  if (role === 'school_admin') {
    return 'Can manage staff and role assignments. Eligible for Smart School ROI.';
  }
  if (role === 'scheduler') {
    return 'Limited/own-only access. Will not appear in Smart School ROI assignment lists.';
  }
  if (role === 'school_admin_scheduler') {
    return 'Manages staff but also uses scheduler ROI limits (not on Smart ROI lists).';
  }
  return 'Default portal account. Eligible to receive ROI access from clients via Smart School ROI.';
}

function staffRowIdentityReady(row) {
  return !!String(row?.fullName || '').trim() && !!String(row?.email || '').trim();
}

function staffRowNeedsRole(row) {
  return staffRowIdentityReady(row) && !String(row?.accessRole || '').trim();
}

function isRoiEligibleRole(accessRole) {
  const role = String(accessRole || '').trim().toLowerCase();
  return role === 'standard' || role === 'school_admin';
}

function buildStaffPayload() {
  return staffRows.value
    .filter((r) => r.email || r.fullName)
    .map((r) => ({
      fullName: r.fullName,
      email: r.email,
      accessRole: r.accessRole || ''
    }));
}

function roiEligibleStaff(staff) {
  return (staff || []).filter((row) => isRoiEligibleRole(row.accessRole));
}

function formatStaffNameList(names) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

const roiConfirmStaffLabel = computed(() => {
  const names = roiEligibleStaff(buildStaffPayload()).map((row) => {
    const name = String(row.fullName || '').trim();
    const email = String(row.email || '').trim();
    return name || email;
  });
  return formatStaffNameList(names);
});

function go(stepKey) {
  const path =
    !stepKey || stepKey === 'home'
      ? `/school-onboarding/${token.value}`
      : `/school-onboarding/${token.value}/${stepKey}`;
  router.push(path);
}

async function loadInvite() {
  if (!token.value || RESERVED_TOKENS.has(token.value.toLowerCase())) {
    error.value = 'Invite not found';
    invite.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public/school-onboarding/${token.value}`, { skipAuthRedirect: true });
    invite.value = res.data;
    hydrateForms();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to load this onboarding link';
    invite.value = null;
  } finally {
    loading.value = false;
  }
}

function hydrateForms() {
  const inv = invite.value;
  if (!inv) return;
  const info = inv.stepPayload?.school_information || {};
  schoolForm.schoolName = info.schoolName || inv.schoolName || '';
  schoolForm.itscoEmail = info.itscoEmail || inv.schoolProfile?.itsco_email || '';
  schoolForm.districtName = info.districtName || inv.schoolProfile?.district_name || '';
  schoolForm.schoolNumber = info.schoolNumber || inv.schoolProfile?.school_number || '';
  schoolForm.schoolAddress = info.schoolAddress || inv.schoolProfile?.school_address || '';
  schoolForm.academicYear = info.academicYear || '';
  schoolForm.gradeLevels = info.gradeLevels || '';
  schoolForm.primaryContactName =
    info.primaryContactName ||
    inv.schoolProfile?.primary_contact_name ||
    `${inv.contactFirstName || ''} ${inv.contactLastName || ''}`.trim();
  schoolForm.primaryContactEmail =
    info.primaryContactEmail || inv.schoolProfile?.primary_contact_email || inv.contactEmail || '';

  identityForm.contactFirstName = inv.contactFirstName || '';
  identityForm.contactLastName = inv.contactLastName || '';
  identityForm.contactEmail = inv.contactEmail || '';
  identityForm.schoolName = inv.schoolName || '';
  identityForm.confirmed = false;

  const days = inv.stepPayload?.preferred_days || {};
  preferredDays.value = Array.isArray(days.preferredDays) ? [...days.preferredDays] : [];
  preferredNotes.value = days.notes || '';

  const materials = inv.stepPayload?.welcome_materials || {};
  materialsSelected.value = Array.isArray(materials.materials) ? [...materials.materials] : [];
  materialsOther.value = materials.materialsOther || '';
  if (materials.requestPaperPackets === true || materials.requestPaperPackets === false) {
    requestPaperPackets.value = materials.requestPaperPackets;
  }

  const staff = inv.stepPayload?.school_staff?.staff;
  if (Array.isArray(staff) && staff.length) {
    staffRows.value = staff.map((s) => ({
      fullName: s.fullName || s.name || '',
      email: s.email || '',
      accessRole: s.accessRole || 'standard'
    }));
  }
}

function confettiStyle(i) {
  const colors = [
    'var(--so-primary)',
    'var(--so-accent)',
    'var(--so-secondary)',
    '#94a3b8',
    '#fbbf24',
    '#38bdf8'
  ];
  return {
    left: `${(i / 24) * 100}%`,
    animationDelay: `${(i * 0.12) % 2.2}s`,
    background: colors[i % colors.length]
  };
}

async function copyText(value, label = 'Value') {
  const text = String(value || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyFeedback.value = `${label} copied.`;
  } catch {
    copyFeedback.value = text;
  }
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = setTimeout(() => {
    copyFeedback.value = '';
  }, 2500);
}

function goToLogin() {
  router.push(loginPath.value);
}

async function ensurePasswordBeforeSubmit() {
  if (invite.value?.passwordSet) return true;
  if (!identityReady.value) {
    actionError.value = 'Please confirm your name, school, and email before setting your password';
    return false;
  }
  if (password.value !== passwordConfirm.value) {
    actionError.value = 'Passwords do not match';
    return false;
  }
  const basics = checkPasswordBasics(password.value);
  if (!basics.valid) {
    actionError.value = basics.message;
    return false;
  }
  const res = await api.post(
    `/public/school-onboarding/${token.value}/password`,
    {
      password: password.value,
      identityConfirmed: true,
      contactFirstName: identityForm.contactFirstName.trim(),
      contactLastName: identityForm.contactLastName.trim(),
      contactEmail: identityForm.contactEmail.trim(),
      schoolName: identityForm.schoolName.trim()
    },
    { skipAuthRedirect: true }
  );
  if (res.data?.token && res.data?.user) {
    authStore.setAuth(res.data.token, res.data.user, res.data.sessionId);
    if (Array.isArray(res.data.agencies)) {
      try {
        localStorage.setItem('userAgencies', JSON.stringify(res.data.agencies));
      } catch {
        // ignore
      }
    }
  }
  if (password.value) {
    personalPasswordForThankYou.value = password.value;
  }
  await loadInvite();
  return !!invite.value?.passwordSet;
}

async function submit() {
  actionError.value = '';
  saving.value = true;
  try {
    if (password.value) {
      personalPasswordForThankYou.value = password.value;
    }
    const ready = await ensurePasswordBeforeSubmit();
    if (!ready) return;
    const res = await api.post(`/public/school-onboarding/${token.value}/submit`, {}, { skipAuthRedirect: true });
    invite.value = {
      ...(res.data?.invite || invite.value || {}),
      submitted: true
    };
    showThankYouPassword.value = false;
    go('home');
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Unable to submit';
  } finally {
    saving.value = false;
  }
}

async function saveStep(stepKey, payload, nextStep, markComplete = true) {
  actionError.value = '';
  saving.value = true;
  try {
    const res = await api.put(`/public/school-onboarding/${token.value}/steps/${stepKey}`, {
      payload,
      markComplete
    });
    invite.value = res.data?.invite || invite.value;
    hydrateForms();
    if (nextStep) go(nextStep);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

function schoolInfoFieldValue(key) {
  return String(schoolForm[key] || '').trim();
}

function isSchoolInfoFieldBlank(key) {
  return !schoolInfoFieldValue(key);
}

function pickFilledSchoolInfoPayload() {
  const payload = {};
  for (const field of SCHOOL_INFO_FIELDS) {
    const value = schoolInfoFieldValue(field.key);
    if (value) payload[field.key] = value;
  }
  return payload;
}

function attemptSaveSchoolInfo() {
  actionError.value = '';
  if (schoolInfoBlankFields.value.length) {
    showSchoolInfoValidation.value = true;
    return;
  }
  showSchoolInfoValidation.value = false;
  return saveStep('school_information', { ...schoolForm }, 'school_staff', true);
}

function keepSchoolInfoInProgress() {
  showSchoolInfoValidation.value = false;
  actionError.value = '';
}

function continueSchoolInfoWithoutFinishing() {
  showSchoolInfoValidation.value = false;
  return saveStep('school_information', pickFilledSchoolInfoPayload(), 'school_staff', false);
}

function selectGroupEmailSuggestion(email) {
  schoolForm.itscoEmail = email;
}

function useAutogeneratedStaffPassword() {
  sharedTempPassword.value = generateStaffTempPassword({
    schoolName: schoolForm.schoolName || invite.value?.schoolName || '',
    schoolAddress: schoolForm.schoolAddress,
    schoolNumber: schoolForm.schoolNumber,
    academicYear: schoolForm.academicYear
  });
}

function saveStaff() {
  actionError.value = '';
  showStaffRoiConfirm.value = false;
  const staff = buildStaffPayload();
  if (staff.length && !String(sharedTempPassword.value || '').trim()) {
    actionError.value = 'Set a shared temporary password for the staff accounts.';
    return;
  }
  const missingRole = staff.find((row) => !String(row.accessRole || '').trim());
  if (missingRole) {
    actionError.value = 'Select an access role for each staff member after entering their name and school email.';
    return;
  }
  if (roiEligibleStaff(staff).length > 0) {
    showStaffRoiConfirm.value = true;
    return;
  }
  return persistStaffStep(staff);
}

function cancelStaffRoiConfirm() {
  showStaffRoiConfirm.value = false;
  actionError.value = '';
}

function confirmSaveStaff() {
  const staff = buildStaffPayload();
  return persistStaffStep(staff);
}

function persistStaffStep(staff) {
  showStaffRoiConfirm.value = false;
  return saveStep(
    'school_staff',
    { staff, sharedTempPassword: sharedTempPassword.value },
    'preferred_days'
  );
}

function savePreferredDays() {
  return saveStep(
    'preferred_days',
    { preferredDays: preferredDays.value, notes: preferredNotes.value },
    'welcome_materials'
  );
}

function saveWelcomeMaterials() {
  if (requestPaperPackets.value !== true && requestPaperPackets.value !== false) {
    actionError.value = 'Please tell us whether you want paper referral packets printed.';
    return;
  }
  return saveStep(
    'welcome_materials',
    {
      welcomePackageAcknowledged: true,
      materials: [...materialsSelected.value],
      materialsOther: materialsOther.value,
      requestPaperPackets: requestPaperPackets.value
    },
    'explore_demo'
  );
}

async function markDemoCompleteAndContinue() {
  return saveStep('explore_demo', { skipped: true }, 'review_submit');
}

function openDemo() {
  actionError.value = '';
  router.push(`/school-onboarding/${token.value}/demo`);
}

watch(
  () => route.params.token,
  () => {
    if (token.value) loadInvite();
  }
);

watch(currentStep, () => {
  showSchoolInfoValidation.value = false;
  showStaffRoiConfirm.value = false;
});

watch(
  schoolForm,
  () => {
    if (showSchoolInfoValidation.value && schoolInfoBlankFields.value.length === 0) {
      showSchoolInfoValidation.value = false;
    }
  },
  { deep: true }
);

onMounted(() => {
  if (token.value) loadInvite();
});
</script>

<style scoped>
.so-shell {
  --so-primary: #2d6a4f;
  --so-secondary: #2d6a4f;
  --so-accent: #40916c;
  --so-primary-dark: #1b4332;
  --so-primary-soft: #e8f3ec;
  --so-primary-softer: #f4f9f6;
  --so-primary-muted: #d8e9df;
  --so-shell-bg: linear-gradient(145deg, #f4f9f6 0%, #f8fafc 42%, #ffffff 100%);
  --so-sidebar-bg: linear-gradient(180deg, #ffffff 0%, #f4f9f6 100%);
  --so-hero-bg: linear-gradient(125deg, #2d6a4f 0%, #40916c 55%, #1b4332 100%);
  min-height: 100vh;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
  background: var(--so-shell-bg);
  color: #0f172a;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.so-sidebar {
  background: var(--so-sidebar-bg);
  border-right: 1px solid color-mix(in srgb, var(--so-primary) 16%, #e2e8f0);
  padding: 1.5rem 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  box-shadow: inset -1px 0 0 color-mix(in srgb, var(--so-primary) 8%, transparent);
}
.so-brand {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  padding: 0.35rem 0.25rem 0.85rem;
  border-bottom: 1px solid color-mix(in srgb, var(--so-primary) 12%, #e2e8f0);
}
.so-brand-logo,
.so-brand-mark {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--so-primary) 18%, transparent);
}
.so-brand-mark {
  display: grid;
  place-items: center;
  font-weight: 800;
  color: #fff;
  background: var(--so-primary);
}
.so-brand-name { font-weight: 700; font-size: 1.08rem; color: #0f172a; }
.so-brand-tag { font-size: 0.76rem; color: color-mix(in srgb, var(--so-primary) 55%, #64748b); font-weight: 500; }
.so-nav { display: flex; flex-direction: column; gap: 5px; }
.so-nav-item {
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 0.62rem 0.8rem;
  cursor: pointer;
  font: inherit;
  color: #334155;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.so-nav-item:hover {
  background: color-mix(in srgb, var(--so-primary) 8%, #fff);
  color: var(--so-primary-dark);
}
.so-nav-item.active {
  background: var(--so-primary-soft);
  color: var(--so-primary-dark);
  box-shadow: inset 4px 0 0 var(--so-primary);
  font-weight: 600;
}
.so-nav-item.done { color: color-mix(in srgb, var(--so-primary) 70%, #0f766e); }
.so-help {
  margin-top: auto;
  background: #fff;
  border-radius: 14px;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--so-primary) 14%, #e2e8f0);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--so-primary) 8%, transparent);
}
.so-help-link {
  display: block;
  margin-top: 0.35rem;
  color: var(--so-primary);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
}
.so-help-link:hover { text-decoration: underline; }
.so-main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
  width: 100%;
}
.so-main-body {
  flex: 1;
  width: 100%;
  padding: 1.35rem 2rem 2rem;
  display: flex;
  flex-direction: column;
}
.so-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  margin-bottom: 0;
  background: color-mix(in srgb, #fff 88%, var(--so-primary-soft));
  border-bottom: 1px solid color-mix(in srgb, var(--so-primary) 14%, #e2e8f0);
  backdrop-filter: blur(8px);
}
.so-school { font-weight: 700; font-size: 1.02rem; color: #0f172a; }
.so-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--so-hero-bg);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--so-primary) 35%, transparent);
}
.so-home {
  width: 100%;
}
.so-hero-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  margin: -1.35rem -2rem 1.5rem;
  padding: 2rem 2.25rem;
  background: var(--so-hero-bg);
  color: #fff;
  box-shadow: 0 10px 30px color-mix(in srgb, var(--so-primary) 28%, transparent);
}
.so-hero-text {
  min-width: 0;
  flex: 1;
}
.so-hero-eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  opacity: 0.9;
}
.so-hero-banner h1 {
  margin: 0 0 0.5rem;
  font-size: clamp(1.65rem, 2.8vw, 2.35rem);
  line-height: 1.15;
}
.so-hero-sub {
  margin: 0;
  max-width: 52rem;
  font-size: 1.02rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.92);
}
.so-hero-logo,
.so-hero-mark {
  width: 84px;
  height: 84px;
  border-radius: 18px;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.95);
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
}
.so-hero-mark {
  display: grid;
  place-items: center;
  font-size: 2rem;
  font-weight: 800;
  color: var(--so-primary);
}
.so-stepper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 1.35rem;
  padding: 0.85rem 1rem;
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--so-primary) 12%, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 2px 12px color-mix(in srgb, var(--so-primary) 6%, transparent);
}
.so-step {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid color-mix(in srgb, var(--so-primary) 10%, #e2e8f0);
  background: var(--so-primary-softer);
  border-radius: 999px;
  padding: 0.4rem 0.8rem;
  font: inherit;
  font-size: 0.86rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.so-step:hover {
  border-color: color-mix(in srgb, var(--so-primary) 35%, #e2e8f0);
}
.so-step.active {
  border-color: var(--so-primary);
  background: var(--so-primary-soft);
  color: var(--so-primary-dark);
  font-weight: 600;
}
.so-step.done {
  border-color: color-mix(in srgb, var(--so-primary) 35%, #99f6e4);
  background: color-mix(in srgb, var(--so-primary) 8%, #f0fdfa);
}
.so-step-num {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--so-primary) 12%, #e2e8f0);
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  font-weight: 700;
}
.so-step.active .so-step-num { background: var(--so-primary); color: #fff; }
.so-step.done .so-step-num {
  background: color-mix(in srgb, var(--so-primary) 75%, #14b8a6);
  color: #fff;
}
.so-step-chevron { color: color-mix(in srgb, var(--so-primary) 35%, #94a3b8); }
.so-home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  gap: 1.15rem;
}
.so-card, .so-panel, .so-info {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--so-primary) 12%, #e2e8f0);
  border-radius: 16px;
  padding: 1.35rem 1.45rem;
  box-shadow: 0 4px 18px color-mix(in srgb, var(--so-primary) 7%, rgba(15, 23, 42, 0.05));
}
.so-card {
  border-top: 4px solid var(--so-primary);
}
.so-panel {
  width: 100%;
  border-top: 4px solid color-mix(in srgb, var(--so-primary) 75%, var(--so-accent));
}
.so-card h2, .so-panel h2 { margin: 0 0 0.55rem; color: #0f172a; }
.so-checklist { padding-left: 1.1rem; color: #334155; }
.so-checklist li { margin: 0.4rem 0; }
.so-checklist li::marker { color: var(--so-primary); }
.so-progress-bar {
  height: 10px;
  background: color-mix(in srgb, var(--so-primary) 8%, #e2e8f0);
  border-radius: 999px;
  overflow: hidden;
  margin: 0.75rem 0 1rem;
}
.so-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--so-primary), color-mix(in srgb, var(--so-accent) 70%, var(--so-primary)));
  border-radius: 999px;
}
.so-progress-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.so-progress-list li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--so-primary) 6%, #f1f5f9);
}
.so-info-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.15rem;
}
.so-info {
  border-top: 3px solid color-mix(in srgb, var(--so-primary) 55%, var(--so-accent));
  background: linear-gradient(180deg, #fff 0%, var(--so-primary-softer) 100%);
}
.so-info h3 { margin: 0 0 0.4rem; font-size: 1rem; color: var(--so-primary-dark); }
.so-password-final,
.so-password-done {
  margin-top: 1.25rem;
  padding-top: 1.15rem;
  border-top: 1px solid color-mix(in srgb, var(--so-primary) 12%, #e2e8f0);
}
.so-password-final h3,
.so-password-done h3 {
  margin: 0 0 0.45rem;
  font-size: 1.05rem;
  color: var(--so-primary-dark);
}
.so-password-grid {
  margin-top: 0.75rem;
}
.so-identity-grid {
  margin-top: 0.75rem;
}
.so-identity-confirm {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-top: 0.85rem;
  font-size: 0.9rem;
  line-height: 1.45;
}
.so-identity-confirm input {
  margin-top: 0.2rem;
}
.so-staff-password-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.35rem;
}
.so-staff-password-row input {
  flex: 1;
  min-width: 220px;
}
.so-expiry-note {
  display: block;
  margin-top: 0.45rem;
  font-size: 0.82rem;
  color: #b45309;
}
.so-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 0.75rem;
}
.so-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.so-grid label, .so-form > label, .block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.span-2 { grid-column: span 2; }
.so-field-label {
  font-size: 0.9rem;
}
.so-field-hint {
  margin: 0.15rem 0 0.45rem;
  font-size: 0.82rem;
  line-height: 1.45;
}
.so-field-hint code {
  font-size: 0.8rem;
  background: #f1f5f9;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}
.so-email-compose {
  display: flex;
  align-items: stretch;
  gap: 0;
}
.so-email-compose input {
  flex: 1;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}
.so-email-domain {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-left: none;
  border-radius: 0 8px 8px 0;
  background: #f8fafc;
  color: #475569;
  font-size: 0.9rem;
  white-space: nowrap;
}
.so-email-suggestions {
  margin-top: 0.55rem;
}
.so-suggest-label {
  display: block;
  font-size: 0.8rem;
  color: #64748b;
  margin-bottom: 0.35rem;
}
.so-suggest-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.so-suggest-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}
.so-suggest-chip:hover {
  border-color: var(--so-primary);
  color: var(--so-primary);
}
.so-suggest-chip.selected {
  border-color: var(--so-primary);
  background: color-mix(in srgb, var(--so-primary) 12%, white);
  color: var(--so-primary);
  font-weight: 600;
}
.so-incomplete-warning {
  border: 1px solid #fbbf24;
  background: #fffbeb;
  border-radius: 12px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.25rem;
}
.so-incomplete-warning p {
  margin: 0.45rem 0 0.65rem;
  font-size: 0.9rem;
  line-height: 1.45;
}
.so-missing-list {
  margin: 0 0 0.75rem;
  padding-left: 1.15rem;
  font-size: 0.88rem;
}
.so-warning-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.so-field-missing > .so-field-label,
.so-field-missing:not(.so-group-email) {
  color: #b91c1c;
}
.so-field-missing input,
.so-field-missing .so-email-compose input {
  border-color: #f87171;
  background: #fef2f2;
  box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.35);
}
.so-field-missing .so-email-domain {
  border-color: #f87171;
  background: #fee2e2;
  color: #991b1b;
}
input, textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}
.so-days {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin: 0.75rem 0;
}
.so-day {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
}
.so-staff-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem;
  margin: 0.65rem 0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.so-roi-confirm {
  margin-top: 1rem;
  border: 1px solid color-mix(in srgb, var(--so-primary) 22%, #fbbf24);
  background: #fffbeb;
  border-radius: 14px;
  padding: 1rem 1.1rem;
}
.so-roi-confirm h3 {
  margin: 0 0 0.45rem;
  font-size: 1rem;
  color: #92400e;
}
.so-roi-confirm p {
  margin: 0.35rem 0 0;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #334155;
}
.so-staff-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}
.so-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1rem;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  font: inherit;
  cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.primary {
  background: var(--so-hero-bg);
  color: #fff;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--so-primary) 30%, transparent);
}
.btn.primary:hover:not(:disabled) {
  filter: brightness(1.05);
}
.btn.ghost {
  background: var(--so-primary-softer);
  color: var(--so-primary-dark);
  border: 1px solid color-mix(in srgb, var(--so-primary) 18%, #e2e8f0);
}
.linkish {
  background: none;
  border: none;
  color: var(--so-primary);
  cursor: pointer;
  font: inherit;
  padding: 0;
}
.linkish.danger { color: #b91c1c; }
.muted { color: #64748b; }
.tiny { font-size: 0.82rem; }
.error { color: #b91c1c; margin: 0; }
.error-box { color: #991b1b; background: #fef2f2; border-color: #fecaca; }
.success-box { background: #f0fdf4; border-color: #bbf7d0; }
.ok { color: #047857; font-size: 0.85rem; }
.warn { color: #b45309; font-size: 0.85rem; }
.so-password-privacy {
  margin: 0.55rem 0 0;
  line-height: 1.45;
}
.so-materials-block {
  margin-top: 1.15rem;
  padding: 1rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--so-primary) 14%, #e2e8f0);
  border-radius: 14px;
  background: var(--so-primary-softer);
}
.so-materials-block h3 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  color: var(--so-primary-dark);
}
.so-materials-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.65rem;
}
.so-material-opt {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--so-primary) 16%, #e2e8f0);
  border-radius: 999px;
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
}
.so-paper-choices {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-top: 0.75rem;
}
.so-paper-choice {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--so-primary) 14%, #e2e8f0);
  border-radius: 12px;
  padding: 0.75rem 0.9rem;
  cursor: pointer;
}
.so-paper-choice.selected {
  border-color: var(--so-primary);
  background: color-mix(in srgb, var(--so-primary) 8%, #fff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--so-primary) 25%, transparent);
}
.so-paper-living-docs {
  margin: 0.55rem 0 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--so-primary) 6%, #fff);
  border: 1px solid color-mix(in srgb, var(--so-primary) 12%, #e2e8f0);
  line-height: 1.45;
}
.so-thanks {
  position: relative;
  overflow: hidden;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--so-primary) 12%, #e2e8f0);
  border-radius: 20px;
  padding: 2rem 1.5rem 1.75rem;
  box-shadow: 0 10px 36px color-mix(in srgb, var(--so-primary) 10%, rgba(15, 23, 42, 0.06));
}
.so-thanks-confetti {
  position: absolute;
  inset: 0 0 auto 0;
  height: 180px;
  pointer-events: none;
  overflow: hidden;
}
.so-thanks-confetti-piece {
  position: absolute;
  top: -12px;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  animation: soThanksConfettiFall 2.4s ease-in both infinite;
}
@keyframes soThanksConfettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(190px) rotate(360deg); opacity: 0; }
}
.so-thanks-check {
  width: 72px;
  height: 72px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--so-hero-bg);
  box-shadow:
    0 0 0 12px color-mix(in srgb, var(--so-primary) 14%, transparent),
    0 8px 24px color-mix(in srgb, var(--so-primary) 28%, transparent);
}
.so-thanks-title {
  margin: 0;
  font-size: clamp(1.8rem, 3vw, 2.35rem);
  color: var(--so-primary-dark);
}
.so-thanks-sub {
  margin: 0.35rem 0 1.35rem;
  color: #475569;
  font-size: 1.05rem;
}
.so-thanks-info-cards {
  display: grid;
  gap: 0.75rem;
  text-align: left;
  margin-bottom: 1.25rem;
}
.so-thanks-info-card {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  padding: 0.95rem 1rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--so-primary) 9%, #fff);
  border: 1px solid color-mix(in srgb, var(--so-primary) 12%, #e2e8f0);
}
.so-thanks-info-card p {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #334155;
}
.so-thanks-info-icon {
  flex-shrink: 0;
  font-size: 1.25rem;
  line-height: 1;
}
.so-thanks-access {
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--so-primary) 14%, #e2e8f0);
  border-radius: 16px;
  padding: 1rem 1.1rem 1.15rem;
  margin-bottom: 1.15rem;
}
.so-thanks-access h3 {
  margin: 0 0 0.85rem;
  text-align: center;
  font-size: 1.05rem;
  color: var(--so-primary-dark);
}
.so-thanks-access-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0;
  border-top: 1px solid color-mix(in srgb, var(--so-primary) 8%, #f1f5f9);
}
.so-thanks-access-row:first-of-type {
  border-top: none;
}
.so-thanks-access-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--so-primary);
  color: #fff;
  flex-shrink: 0;
  font-size: 0.95rem;
}
.so-thanks-access-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.so-thanks-access-label {
  font-size: 0.78rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.so-thanks-access-value {
  font-size: 0.98rem;
  color: #0f172a;
  word-break: break-word;
}
.so-thanks-link {
  color: var(--so-primary);
}
.so-thanks-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  flex-shrink: 0;
}
.so-thanks-btn {
  padding: 0.4rem 0.7rem;
  font-size: 0.82rem;
}
.so-thanks-login-hint {
  margin: 0.75rem 0 0;
  line-height: 1.45;
}
.so-thanks-copy-feedback {
  margin: 0.5rem 0 0;
}
.so-thanks-welcome {
  margin: 0 0 1.15rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: var(--so-primary-soft);
  color: var(--so-primary-dark);
  font-size: 0.95rem;
}
.so-thanks-got-it {
  min-width: 180px;
  padding: 0.75rem 1.5rem;
  font-weight: 700;
}
.so-footer {
  margin-top: auto;
  padding-top: 2rem;
  text-align: center;
  font-size: 0.9rem;
}
.so-footer a { color: var(--so-primary); font-weight: 500; }
@media (max-width: 900px) {
  .so-shell { grid-template-columns: 1fr; }
  .so-sidebar {
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--so-primary) 14%, #e2e8f0);
    min-height: auto;
  }
  .so-main-body { padding: 1rem 1rem 1.5rem; }
  .so-top { padding: 0.85rem 1rem; }
  .so-hero-banner {
    margin: -1rem -1rem 1.25rem;
    padding: 1.35rem 1.15rem;
    flex-direction: column;
    align-items: flex-start;
  }
  .so-hero-logo, .so-hero-mark { width: 64px; height: 64px; }
  .so-home-grid, .so-info-row, .so-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
  .so-staff-row { grid-template-columns: 1fr; }
}
@media (min-width: 1600px) {
  .so-main-body { padding: 1.5rem 2.5rem 2.5rem; }
  .so-hero-banner { margin: -1.5rem -2.5rem 1.75rem; padding: 2.25rem 2.5rem; }
  .so-home-grid { gap: 1.35rem; }
}
</style>
