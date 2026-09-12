<template>
  <div class="portal-root" :style="cssVars">

    <!-- Loading splash -->
    <div v-if="loading" class="portal-splash">
      <div class="splash-spinner"></div>
      <div class="splash-text">Loading your portal…</div>
    </div>

    <!-- Error states -->
    <div v-else-if="errorCode === 'INVALID_TOKEN'" class="portal-splash portal-splash-error">
      <div class="error-icon">🔗</div>
      <h2>This link is invalid or has expired.</h2>
      <p>Please contact your hiring team to receive a new link.</p>
    </div>

    <div v-else-if="errorCode === 'STATUS_ADVANCED'" class="portal-splash portal-splash-done">
      <div v-if="agency?.logoUrl" class="splash-logo"><img :src="agency.logoUrl" :alt="agency.name" /></div>
      <div class="done-icon">✓</div>
      <h2>You're an active team member</h2>
      <p>Your hire portal is complete. Sign in with your work email (username) and the password you created.</p>
      <p class="contact-line">
        If you still need help, contact People Operations — they can re-send access if needed.
      </p>
      <p v-if="agency?.phoneNumber" class="contact-line">Questions? Call us at <strong>{{ agency.phoneNumber }}</strong></p>
    </div>

    <!-- Main portal -->
    <template v-else-if="portalData">

      <div class="portal-shell">
        <!-- Left nav -->
        <aside class="portal-nav" :style="sidebarStyle">
          <div class="portal-nav-brand">
            <img v-if="agency?.logoUrl" :src="agency.logoUrl" :alt="agency.name" class="portal-nav-logo" />
            <div v-else class="portal-nav-logo-fallback">{{ orgInitials }}</div>
            <div class="portal-nav-org">{{ agency?.name || 'Your Organization' }}</div>
          </div>

          <nav class="portal-nav-links">
            <a
              class="portal-nav-link"
              :class="{ 'portal-nav-link--active': activeSection === 'dashboard' }"
              href="#"
              @click.prevent="activeSection = 'dashboard'"
            >
              <span class="portal-nav-icon">▦</span>
              Dashboard
            </a>
            <a
              class="portal-nav-link"
              :class="{ 'portal-nav-link--active': activeSection === 'tasks' }"
              href="#"
              @click.prevent="activeSection = 'tasks'"
            >
              <span class="portal-nav-icon">☑</span>
              My Tasks
            </a>
            <a
              class="portal-nav-link"
              :class="{ 'portal-nav-link--active': activeSection === 'submissions' }"
              href="#"
              @click.prevent="openSubmissions"
            >
              <span class="portal-nav-icon">📄</span>
              My Submissions
            </a>
            <a
              class="portal-nav-link"
              :class="{ 'portal-nav-link--active': activeSection === 'handbook' }"
              href="#"
              @click.prevent="openHandbook"
            >
              <span class="portal-nav-icon">📖</span>
              Workplace handbook
            </a>
          </nav>

          <div class="portal-nav-footer">
            <span class="portal-nav-shield">🛡</span>
            Your data is secure. This portal is protected by encryption.
          </div>
        </aside>

        <!-- Center column -->
        <div class="portal-center">
          <header class="portal-topbar">
            <div class="portal-topbar-spacer"></div>
            <div class="portal-user-chip">
              <div class="portal-user-avatar">{{ candidateInitials }}</div>
              <span>{{ candidate.firstName }} {{ candidate.lastName }}</span>
            </div>
          </header>

          <main class="portal-content">
            <div class="portal-welcome">
              <h1>Welcome, {{ candidate.firstName }}!</h1>
              <p>
                <template v-if="viewingPrehire && candidate.status === 'ONBOARDING'">Your pre-hire package is complete. View your retained submissions or switch to onboarding.</template>
                <template v-else-if="portalPhase === 'account_setup'">
                  Choose your work username to continue joining {{ agency?.name || 'the team' }}.
                </template>
                <template v-else-if="portalPhase === 'finalize_login'">
                  Your required steps are complete. Set your password, then submit onboarding for review.
                </template>
                <template v-else-if="portalPhase === 'review'">
                  Your pre-hire packet is with People Operations for review. You can still view submissions and resources.
                </template>
                <template v-else-if="portalPhase === 'onboarding'">
                  You're in onboarding — complete the steps below to finish joining {{ agency?.name || 'the team' }}.
                </template>
                <template v-else>
                  We're excited to have you join {{ agency?.name || 'the team' }}.
                </template>
              </p>
              <div class="portal-phase-pill">
                {{ phaseLabel }} · {{ progressPct }}% complete
              </div>
            </div>

            <nav class="journey-switch" aria-label="Hire process">
              <button type="button" :class="{ selected: viewingPrehire }" @click="selectedProcess = 'pre_hire'; activeSection = 'dashboard'">
                <strong>1. Pre-hire</strong>
                <span>{{ candidate.status === 'ONBOARDING' ? 'Completed · view package' : candidate.status === 'PREHIRE_REVIEW' ? 'Submitted · under review' : 'Documents & signatures' }}</span>
              </button>
              <button type="button" :disabled="candidate.status !== 'ONBOARDING'" :class="{ selected: !viewingPrehire }" @click="selectedProcess = 'onboarding'; activeSection = 'dashboard'">
                <strong>2. Onboarding</strong>
                <span>{{ portalData?.journey?.onboardingCompletedAt ? 'Completed · awaiting activation' : candidate.status === 'ONBOARDING' ? 'Profile, forms & training' : 'People Operations will start this' }}</span>
              </button>
              <div><strong>3. Active</strong><span>After People Operations review</span></div>
            </nav>
            <section v-if="processClosed" class="journey-review" role="status">
              <strong>{{ viewingPrehire ? 'Your pre-hire package is closed' : 'Your onboarding package is submitted' }}</strong>
              <p>{{ viewingPrehire ? 'Your submissions remain available here. People Operations controls when onboarding starts.' : 'People Operations will review your package and mark you active. Your recorded time has been submitted for payroll review.' }}</p>
              <button type="button" class="portal-link-copy" @click="openSubmissions">View my submissions</button>
            </section>
            <section v-if="candidate.status === 'ONBOARDING' && !viewingPrehire" class="journey-time" role="status">
              <strong>{{ processClosed ? 'Onboarding time submitted' : activity.tracking.value ? 'Recording active onboarding time' : 'Time tracking paused' }}</strong>
              <span>{{ Math.floor((portalData?.journey?.time?.seconds || 0) / 60) }} minutes saved</span>
              <p v-if="activity.error.value" class="cred-warn">{{ activity.error.value }}</p>
              <p v-else>Time is recorded while you work in this portal and its training pages. It pauses when you leave or are idle. Tell People Operations about any work completed outside the portal or missing time.</p>
            </section>

            <!-- Group password: pick work username only (pre-hire) -->
            <section
              v-if="activeSection === 'dashboard' && portalPhase === 'account_setup'"
              class="portal-account-setup"
              aria-label="Choose work username"
            >
              <div class="portal-tasks-head">
                <div>
                  <h2>Choose your work username</h2>
                  <p>
                    Pick an available address at @{{ accountDomain || 'your organization' }}.
                    This becomes your app username and Google Group mailbox.
                    You will set your password after onboarding is complete — recovery always uses your personal email.
                  </p>
                </div>
              </div>
              <div class="cred-card">
                <label>
                  <span>Suggested addresses</span>
                  <select v-model="accountForm.workEmail" class="portal-select">
                    <option disabled value="">Select an email</option>
                    <option v-for="s in accountSuggestions" :key="s.email" :value="s.email">{{ s.email }}</option>
                  </select>
                </label>
                <label>
                  <span>Or type a local part</span>
                  <div class="portal-email-row">
                    <input v-model="accountForm.localPart" type="text" placeholder="firstnameL" @blur="checkTypedEmail" />
                    <span class="portal-email-domain">@{{ accountDomain }}</span>
                  </div>
                </label>
                <p v-if="emailCheckMessage" :class="emailAvailable ? 'cred-ok' : 'cred-warn'">{{ emailCheckMessage }}</p>
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="provisioningAccount || !canProvisionAccount"
                  @click="provisionAccount"
                >
                  {{ provisioningAccount ? 'Creating…' : 'Save my username' }}
                </button>
                <p v-if="accountError" class="cred-warn">{{ accountError }}</p>
              </div>
            </section>

            <!-- End of onboarding: set password + activate login -->
            <section
              v-if="activeSection === 'dashboard' && !viewingPrehire && portalPhase === 'finalize_login'"
              class="portal-account-setup"
              aria-label="Set password and activate account"
            >
              <div class="portal-tasks-head">
                <div>
                  <h2>Set your password</h2>
                  <p>
                    Your username is <strong>{{ candidate.workEmail }}</strong>.
                    Create your password so your login is ready when People Operations activates your employee account.
                    Password recovery goes to {{ candidate.personalEmail || 'your personal email' }}.
                  </p>
                </div>
              </div>
              <div class="cred-card">
                <label>
                  <span>Password (min 8 characters)</span>
                  <input v-model="accountForm.password" type="password" autocomplete="new-password" />
                </label>
                <label>
                  <span>Confirm password</span>
                  <input v-model="accountForm.confirmPassword" type="password" autocomplete="new-password" />
                </label>
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="finalizingPassword || !canFinalizePassword"
                  @click="finalizePassword"
                >
                  {{ finalizingPassword ? 'Saving…' : 'Save my password' }}
                </button>
                <p v-if="accountError" class="cred-warn">{{ accountError }}</p>
                <p v-if="finalizeSuccess" class="cred-ok">{{ finalizeSuccess }}</p>
              </div>
            </section>

            <section v-if="activeSection === 'dashboard' && candidate.workEmail" class="portal-link-card" aria-label="Your work email">
              <div class="portal-link-card-head">
                <strong>Your work email</strong>
              </div>
              <code class="portal-link-url">{{ candidate.workEmail }}</code>
              <p class="portal-link-help">
                This is your work username. You will set a password at the end of onboarding to sign into the app.
                Password recovery will use your personal email.
              </p>
            </section>

            <section
              v-if="activeSection === 'dashboard'"
              class="portal-link-card"
              aria-label="Your personal portal link"
            >
              <div class="portal-link-card-head">
                <strong>Your personal portal link</strong>
                <button type="button" class="portal-link-copy" @click="copyPortalLink">
                  {{ portalLinkCopied ? 'Copied!' : 'Copy link' }}
                </button>
              </div>
              <p class="portal-link-help">
                Bookmark this link. Use it anytime through pre-hire and onboarding — no separate login needed.
              </p>
              <code class="portal-link-url">{{ portalLinkDisplay }}</code>
              <p v-if="tokenExpiresLabel" class="portal-link-expiry">Link valid until {{ tokenExpiresLabel }}</p>
            </section>

            <section
              v-if="activeSection === 'dashboard' && portalPhase !== 'account_setup' && portalPhase !== 'finalize_login'"
              class="portal-link-card"
            >
              <div class="portal-link-card-head"><strong>Your steps</strong></div>
              <p class="portal-link-help">
                {{ viewingPrehire ? 'Background check, job description, documents, and signatures are on My Tasks.' : 'Your profile questionnaires, required forms, and training are on My Tasks.' }}
                Completed pre-hire and onboarding materials are retained in My Submissions and your employee library.
              </p>
              <button type="button" class="btn-primary" @click="activeSection = 'tasks'">
                Go to My Tasks ({{ progressPct }}% complete)
              </button>
            </section>

            <fieldset v-if="viewingPrehire" :disabled="processClosed" class="journey-prehire">
            <section
              v-if="activeSection === 'tasks'"
              class="portal-link-card portal-bg-card"
              aria-label="Authorization for background check"
            >
              <div class="portal-link-card-head">
                <strong>Step: Authorization for Background Check</strong>
              </div>
              <p v-if="backgroundCheck?.signed" class="cred-ok">
                Signed{{ backgroundCheck.signerName ? ` by ${backgroundCheck.signerName}` : '' }}.
                SSN {{ backgroundCheck.ssnMasked || '***' }} · DL {{ backgroundCheck.dlMasked || '***' }}.
                Full numbers are encrypted and are not shown again.
              </p>
              <form v-else class="bg-form" @submit.prevent="submitBackgroundCheck">
                <div class="bg-legal-panel">
                  <h3 class="bg-legal-title">Why we ask</h3>
                  <p>
                    {{ agency?.name || 'This organization' }} uses a consumer reporting agency for employment screening
                    (references, employment history, and criminal records where permitted by law).
                  </p>
                  <ul class="bg-legal-list">
                    <li>Your Social Security number and driver’s license are encrypted in transit and at rest.</li>
                    <li>After you sign, this portal only shows a masked receipt (*** plus the last four digits).</li>
                    <li>People Operations can reveal full values only when needed, and each reveal is logged.</li>
                  </ul>
                </div>
                <div class="bg-form-grid">
                  <label>Legal name <input v-model="bgForm.legalName" type="text" required autocomplete="name" /></label>
                  <label>Date of birth <input v-model="bgForm.dateOfBirth" type="date" required /></label>
                  <label class="bg-span">Current address <input v-model="bgForm.currentAddress" type="text" required autocomplete="street-address" /></label>
                  <label class="bg-span">Previous addresses (optional) <textarea v-model="bgForm.previousAddresses" rows="2" /></label>
                  <label class="bg-span">Other names / aliases (optional) <input v-model="bgForm.aliases" type="text" /></label>
                  <label>Social Security number
                    <input v-model="bgForm.ssn" type="text" inputmode="numeric" autocomplete="off" required placeholder="###-##-####" />
                  </label>
                  <label>Driver’s license number
                    <input v-model="bgForm.driversLicense" type="text" autocomplete="off" required />
                  </label>
                </div>
                <div class="bg-legal-panel bg-legal-panel--ack">
                  <p
                    v-for="(para, i) in backgroundCheckLegalParagraphs"
                    :key="`bg-legal-${i}`"
                    class="bg-legal-para"
                  >
                    {{ para }}
                  </p>
                </div>
                <AdaptiveSignatureCapture
                  v-model="bgForm.signatureData"
                  title="Sign authorization"
                  :signer-name="bgForm.legalName"
                />
                <p v-if="bgError" class="cred-warn">{{ bgError }}</p>
                <button type="submit" class="btn-primary" :disabled="bgSaving">
                  {{ bgSaving ? 'Saving…' : 'Submit authorization' }}
                </button>
              </form>
            </section>

            <section
              v-if="activeSection === 'tasks'"
              class="portal-link-card portal-jd-card"
              aria-label="Job description acknowledgement"
            >
              <div class="portal-link-card-head"><strong>Step: Job description</strong></div>
              <p v-if="jdAcknowledged" class="cred-ok">
                You acknowledged this job description. A signed copy is saved on your hire record.
              </p>
              <template v-else>
                <p class="portal-jd-accountability">
                  Review the role expectations below. By signing, you confirm you have read and understand
                  this job description for {{ jobDescription?.title || 'this role' }} and accept that
                  {{ agency?.name || 'the employer' }} may hold you accountable to these expectations.
                </p>
                <JobDescriptionSections
                  v-if="jobDescription?.descriptionSections"
                  :sections="jobDescription.descriptionSections"
                  :title="jobDescription.title"
                  :schedule="jobDescription.scheduleText"
                  show-header
                  compact
                />
                <div v-else-if="jdPlainParagraphs.length" class="portal-jd-plain">
                  <h3 v-if="jobDescription?.title">{{ jobDescription.title }}</h3>
                  <p v-for="(para, i) in jdPlainParagraphs" :key="`jd-p-${i}`">{{ para }}</p>
                </div>
                <p v-else class="muted">
                  {{ jobDescription?.title || 'Job description will appear here once your hiring team attaches the posting.' }}
                </p>
                <AdaptiveSignatureCapture
                  v-model="jdSignature"
                  title="Acknowledge job description"
                  :signer-name="candidateDisplayName"
                />
                <p v-if="jdError" class="cred-warn">{{ jdError }}</p>
                <button type="button" class="btn-primary" :disabled="jdSaving" @click="acknowledgeJobDescription">
                  {{ jdSaving ? 'Saving…' : 'I acknowledge this job description' }}
                </button>
              </template>
            </section>

            <section
              v-if="activeSection === 'tasks' && prehireDocs.length"
              class="portal-link-card"
              aria-label="Pre-hire documents"
            >
              <div class="portal-link-card-head"><strong>Pre-hire documents</strong></div>
              <ul class="portal-simple-list">
                <li v-for="doc in prehireDocs" :key="doc.id" class="portal-doc-row">
                  <a
                    v-if="doc.kind === 'print_only'"
                    class="portal-doc-title-link"
                    :href="`/pre-hire/${token}/print/${encodeURIComponent(doc.id)}`"
                  >{{ doc.title }}</a>
                  <a
                    v-else-if="doc.kind === 'reference' && doc.url"
                    class="portal-doc-title-link"
                    :href="doc.url"
                    target="_blank"
                    rel="noopener"
                    @click="trackHandbookOpen(`ref:${doc.id}`)"
                  >{{ doc.title }}</a>
                  <a
                    v-else-if="(doc.kind === 'company_document' || doc.kind === 'upload') && (doc.filePath || companyDocFileUrl(doc))"
                    class="portal-doc-title-link"
                    :href="companyDocFileUrl(doc)"
                    target="_blank"
                    rel="noopener"
                  >{{ doc.title }}</a>
                  <strong v-else>{{ doc.title }}</strong>
                  <span class="cred-muted"> · {{ docKindLabel(doc.kind) }}</span>
                  <p v-if="doc.instructions" class="portal-link-help">{{ doc.instructions }}</p>
                  <a
                    v-if="doc.kind === 'print_only'"
                    class="portal-link-copy"
                    :href="`/pre-hire/${token}/print/${encodeURIComponent(doc.id)}`"
                  >Open print page</a>
                  <a
                    v-else-if="doc.kind === 'reference' && doc.url"
                    class="portal-link-copy"
                    :href="doc.url"
                    target="_blank"
                    rel="noopener"
                    @click="trackHandbookOpen(`ref:${doc.id}`)"
                  >Open link</a>
                  <template v-else-if="doc.kind === 'company_document'">
                    <p v-if="doc.signed || companyDocSigned[doc.id]" class="cred-ok">Signed — thank you. Saved on your hire record.</p>
                    <template v-else>
                      <div v-if="doc.filePath" class="portal-doc-embed">
                        <iframe
                          class="portal-doc-frame"
                          title="Company document"
                          :src="companyDocFileUrl(doc)"
                        />
                      </div>
                      <p v-else class="muted">Your hiring team still needs to attach this document file.</p>
                      <AdaptiveSignatureCapture
                        v-model="companyDocSignatures[doc.id]"
                        title="Sign this document"
                        :signer-name="candidateDisplayName"
                      />
                      <p v-if="companyDocError[doc.id]" class="cred-warn">{{ companyDocError[doc.id] }}</p>
                      <button
                        type="button"
                        class="btn-primary"
                        :disabled="!!companyDocBusy[doc.id]"
                        @click="signCompanyDocument(doc)"
                      >
                        {{ companyDocBusy[doc.id] ? 'Saving…' : 'I acknowledge this document' }}
                      </button>
                    </template>
                  </template>
                  <template v-else-if="doc.kind === 'upload'">
                    <a
                      v-if="doc.filePath"
                      class="portal-link-copy"
                      :href="companyDocFileUrl(doc)"
                      target="_blank"
                      rel="noopener"
                    >Download blank form</a>
                    <a
                      v-else-if="doc.url"
                      class="portal-link-copy"
                      :href="doc.url"
                      target="_blank"
                      rel="noopener"
                    >Download blank form</a>
                    <p v-if="uploadDone[doc.id]" class="cred-ok">Uploaded — thank you.</p>
                    <label v-else class="portal-upload-field">
                      <span>{{ uploadBusy[doc.id] ? 'Uploading…' : 'Upload your file' }}</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/*"
                        :disabled="!!uploadBusy[doc.id]"
                        @change="onPrehireDocUpload(doc, $event)"
                      />
                    </label>
                    <p v-if="uploadError[doc.id]" class="cred-warn">{{ uploadError[doc.id] }}</p>
                  </template>
                  <span v-else-if="doc.kind === 'acknowledgement'" class="portal-link-help">
                    Use the Job description section above to review and sign the role expectations.
                  </span>
                </li>
              </ul>
            </section>

            </fieldset>

            <!-- Submissions -->
            <section v-if="activeSection === 'submissions'" class="portal-submissions" aria-label="My submissions">
              <div class="portal-tasks-head">
                <div>
                  <h2>My submissions</h2>
                  <p>Your application materials and completed hire documents.</p>
                </div>
              </div>
              <div v-if="submissionsLoading" class="empty-tasks">Loading…</div>
              <template v-else>
                <div v-for="phase in ['prehire', 'onboarding']" :key="phase" class="cred-card">
                  <h3>{{ phase === 'prehire' ? 'Pre-hire package' : 'Onboarding package' }}</h3>
                  <p>{{ submissions?.journey?.[phase === 'prehire' ? 'prehireCompletedAt' : 'onboardingCompletedAt'] ? 'Completed and retained' : 'In progress or awaiting People Operations' }}</p>
                  <ul class="portal-simple-list">
                    <li v-for="item in submissions?.journey?.[phase]?.tasks || []" :key="item.id">
                      <button v-if="item.taskType === 'document' && item.status === 'completed'" class="portal-doc-title-link portal-doc-title-btn" @click="viewCompletedDocument(item)">{{ item.title }}</button>
                      <span v-else>{{ item.title }}</span> · {{ item.status }}
                    </li>
                  </ul>
                </div>
                <div v-if="submissions?.hiringProfile" class="cred-card">
                  <h3>Application</h3>
                  <p v-if="submissions.hiringProfile.appliedRole"><strong>Role:</strong> {{ submissions.hiringProfile.appliedRole }}</p>
                  <p v-if="submissions.hiringProfile.stage"><strong>Stage:</strong> {{ submissions.hiringProfile.stage }}</p>
                  <p v-if="coverLetterParagraphs.length" class="portal-cover-letter">
                    <span v-for="(para, i) in coverLetterParagraphs" :key="`cl-${i}`">{{ para }}</span>
                  </p>
                </div>
                <div v-if="submissions?.uploadedMaterials?.length" class="cred-card">
                  <h3>Uploaded materials</h3>
                  <ul class="portal-simple-list">
                    <li v-for="d in submissions.uploadedMaterials" :key="d.id">
                      <a
                        v-if="d.fileUrl"
                        class="portal-doc-title-link"
                        :href="submissionFileHref(d)"
                        target="_blank"
                        rel="noopener"
                      >{{ d.title }}</a>
                      <span v-else>{{ d.title }}</span>
                      <span class="cred-muted" v-if="d.category"> · {{ formatSubmissionCategory(d.category) }}</span>
                    </li>
                  </ul>
                </div>
                <div v-if="submissions?.completedDocuments?.length" class="cred-card">
                  <h3>Completed documents</h3>
                  <ul class="portal-simple-list">
                    <li v-for="d in submissions.completedDocuments" :key="d.id">
                      <button type="button" class="portal-doc-title-link portal-doc-title-btn" @click="viewCompletedDocument(d)">
                        {{ d.title }}
                      </button>
                    </li>
                  </ul>
                </div>
                <div v-if="!submissions?.hiringProfile && !submissions?.uploadedMaterials?.length && !submissions?.completedDocuments?.length" class="empty-tasks">
                  Nothing here yet — complete tasks and your application details will appear.
                </div>
              </template>
            </section>

            <!-- Resources / handbook -->
            <section v-if="activeSection === 'handbook'" class="portal-resources" aria-label="Workplace handbook">
              <div class="portal-tasks-head">
                <div>
                  <h2>Workplace handbook</h2>
                  <p>Read your agency’s workplace handbook here.</p>
                </div>
              </div>
              <div v-if="handbookLoading" class="empty-tasks">Loading handbook…</div>
              <div v-else>
                <div class="cred-card handbook-card" v-if="handbookLinks.acknowledgementUrl || handbookLinks.fullUrl">
                  <h3>Workplace handbook</h3>
                  <p v-if="handbookLinks.acknowledgementUrl">
                    <a
                      :href="handbookLinks.acknowledgementUrl"
                      target="_blank"
                      rel="noopener"
                      @click="trackHandbookOpen('ack')"
                    >Employee Handbook acknowledgement</a>
                  </p>
                  <p v-if="handbookLinks.fullUrl">
                    <a
                      :href="handbookLinks.fullUrl"
                      target="_blank"
                      rel="noopener"
                      @click="trackHandbookOpen('full')"
                    >Full Workplace Handbook</a>
                  </p>
                </div>
                <div v-if="!handbook?.available && !handbookLinks.acknowledgementUrl && !handbookLinks.fullUrl" class="empty-tasks">
                  Workplace handbook is not published yet. Check back soon.
                </div>
                <div v-else-if="handbook?.available" class="cred-card handbook-card">
                  <h3>{{ handbook.handbook?.title || 'Workplace Handbook' }}</h3>
                  <article
                    v-for="sec in (handbook.handbook?.sections || [])"
                    :key="sec.id"
                    class="handbook-section"
                  >
                    <h4>{{ sec.title }}</h4>
                    <div class="handbook-body" v-html="sec.bodyHtml"></div>
                  </article>
                </div>
              </div>
            </section>

            <!-- Onboarding credential packet (accounts & access) -->
            <section
              v-if="activeSection === 'tasks' && !viewingPrehire && !processClosed && showCredentialPacket && portalPhase !== 'account_setup'"
              class="portal-credential-packet"
              aria-label="Accounts and access"
            >
              <div class="portal-tasks-head">
                <div>
                  <h2>Accounts &amp; Access</h2>
                  <p>Acknowledge your company email. Phone and TherapyNotes logins appear after onboarding is initiated.</p>
                </div>
              </div>

              <div
                v-for="sys in (credentialPacket?.systems || [])"
                :key="sys.key"
                class="cred-card"
              >
                <h3>{{ sys.label }}</h3>
                <p v-if="sys.username" class="cred-meta"><strong>Username:</strong> {{ sys.username }}</p>
                <p v-if="sys.extension" class="cred-meta"><strong>Extension:</strong> {{ sys.extension }}</p>
                <p v-if="sys.pin" class="cred-meta"><strong>PIN:</strong> {{ sys.pin }}</p>
                <p v-if="!sys.username && sys.key !== 'email'" class="cred-meta cred-muted">
                  People Operations has not published this login yet.
                </p>
                <div class="cred-actions">
                  <button
                    v-if="sys.tempPasswordAvailable"
                    type="button"
                    class="btn-secondary-sm"
                    @click="revealTempPassword(sys.key)"
                  >
                    Reveal temporary password (once)
                  </button>
                  <span v-else-if="sys.tempPasswordConsumed" class="cred-muted">Temp password already revealed</span>
                  <button
                    v-if="!sys.acknowledged"
                    type="button"
                    class="btn-primary"
                    :disabled="ackingSystem === sys.key"
                    @click="ackSystem(sys.key)"
                  >
                    I've logged in
                  </button>
                  <span v-else class="cred-ok">Acknowledged</span>
                </div>
                <p v-if="revealedPasswords[sys.key]" class="cred-secret">
                  Temporary password: <code>{{ revealedPasswords[sys.key] }}</code>
                  <span class="cred-muted"> — copy it now; it won't be shown again.</span>
                </p>
              </div>
            </section>

            <section
              v-if="activeSection === 'tasks'"
              class="portal-tasks-section"
            >
              <div class="portal-tasks-head">
                <div>
                  <h2>Your {{ phaseLabel }} Tasks</h2>
                  <p>{{ completedCount }} of {{ totalCount }} completed</p>
                </div>
                <div class="portal-tasks-progress-wrap">
                  <div class="portal-tasks-progress-bar">
                    <div class="portal-tasks-progress-fill" :style="{ width: progressPct + '%' }"></div>
                  </div>
                  <span class="portal-tasks-progress-pct">{{ progressPct }}%</span>
                </div>
              </div>

              <div v-if="allDone" class="all-done-banner">
                <div class="all-done-icon">🎉</div>
                <div>
                  <strong>All items complete!</strong>
                  <div class="all-done-sub">
                    Your required items are complete. Submit your package when you are ready for People Operations to review it.
                  </div>
                </div>
              </div>

              <div v-if="!allDone && tasks.length === 0" class="empty-tasks">
                No items have been assigned yet. Your hiring team will send them shortly.
              </div>

              <p v-if="portalData?.missingContract && !processClosed" class="cred-warn">People Operations needs to assign your employment agreement before you can submit pre-hire.</p>
              <div class="task-list">
                <article
                  v-for="(task, idx) in tasks"
                  :key="task.id"
                  class="task-card-v2"
                  :class="{ 'task-card-v2--done': task.status === 'completed' }"
                >
                  <div class="task-card-v2-icon" :style="{ background: taskAccentBg(idx), color: taskAccentColor(idx) }">
                    <span v-if="task.status === 'completed'">✓</span>
                    <span v-else-if="task.taskType === 'intake_form'">📝</span>
                    <span v-else-if="task.taskType === 'training'">📋</span>
                    <span v-else-if="task.actionType === 'review'">📋</span>
                    <span v-else>✍️</span>
                  </div>
                  <div class="task-card-v2-body">
                    <div class="task-card-v2-title">{{ idx + 1 }}. {{ task.title }}</div>
                    <div class="task-card-v2-desc">{{ taskDescription(task) }}</div>
                    <div class="task-card-v2-meta">
                      <span class="task-status-badge" :class="task.status === 'completed' ? 'task-status-badge--done' : 'task-status-badge--pending'">
                        {{ task.status === 'completed' ? 'COMPLETED' : 'PENDING' }}
                      </span>
                      <span v-if="task.isRequired" class="task-required-badge">Required</span>
                    </div>
                  </div>
                  <!-- Intake form tasks: open form + mark done -->
                  <template v-if="task.taskType === 'custom' && task.status !== 'completed'">
                    <button type="button" class="task-card-v2-action" :disabled="processClosed" @click="markIntakeFormDone(task)">Mark complete</button>
                  </template>
                  <template v-else-if="task.taskType === 'intake_form' && task.status !== 'completed'">
                    <div class="intake-form-actions">
                      <button
                        type="button"
                        class="task-card-v2-action"
                        :style="{ borderColor: taskAccentColor(idx), color: taskAccentColor(idx) }"
                        :disabled="processClosed" @click="openIntakeForm(task)"
                      >
                        Fill Out Form <span aria-hidden="true">↗</span>
                      </button>
                      <button
                        v-if="intakeFormOpened === task.id"
                        type="button"
                        class="task-card-v2-action task-card-v2-action--confirm"
                        :disabled="intakeFormSubmitting"
                        @click="markIntakeFormDone(task)"
                      >
                        {{ intakeFormSubmitting ? 'Saving…' : "I've submitted this form ✓" }}
                      </button>
                    </div>
                  </template>
                  <!-- Training/module tasks: open the module page -->
                  <template v-else-if="task.taskType === 'training' && task.status !== 'completed'">
                    <div class="intake-form-actions">
                      <button
                        type="button"
                        class="task-card-v2-action"
                        :style="{ borderColor: taskAccentColor(idx), color: taskAccentColor(idx) }"
                        @click="openModuleTask(task)"
                      >
                        Open training / questionnaire <span aria-hidden="true">↗</span>
                      </button>

                    </div>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="task-card-v2-action"
                      :style="{ borderColor: taskAccentColor(idx), color: taskAccentColor(idx) }"
                      :disabled="processClosed && task.status !== 'completed'" @click="task.taskType === 'training' ? openModuleTask(task) : selectTask(task)"
                    >
                      {{ task.status === 'completed' ? 'View' : taskActionLabel(task) }}
                      <span aria-hidden="true">›</span>
                    </button>
                  </template>
                </article>
              </div>

              <div v-if="!processClosed" class="cta-wrap">
                <button class="btn-complete" :disabled="submitting || !allDone" @click="confirmSubmit">
                  {{ submitting ? 'Submitting…' : 'I\'ve completed everything — submit for review' }}
                </button>
                <div class="cta-help">
                  Complete all required items before submitting. Contact People Operations if you need help.
                </div>
              </div>
            </section>

            <section class="portal-help-card">
              <div class="portal-help-icon">💬</div>
              <div class="portal-help-copy">
                <strong>Need help or have questions?</strong>
                <p>Our People Operations team is here to help you through every step.</p>
              </div>
              <button type="button" class="portal-help-btn" @click="focusChat">Chat with People Ops</button>
            </section>
          </main>

          <footer class="portal-page-footer">
            <span>© {{ currentYear }} {{ agency?.name || 'Your Organization' }}. All rights reserved.</span>
            <span class="portal-page-footer-links">Privacy Policy · Terms of Use</span>
          </footer>
        </div>

        <!-- Right chat -->
        <PreHirePortalChat
          ref="chatRef"
          :token="token"
          :portal-api="portalApi"
          :support-team="supportTeam"
          :agency-name="agency?.name || ''"
        />
      </div>

      <!-- Task signing panel (modal-style overlay) -->
      <transition name="panel-slide">
        <div v-if="activeTask" class="task-panel-overlay" @click.self="closePanel">
          <div class="task-panel">
            <div class="task-panel-header">
              <div>
                <div class="task-panel-title">{{ activeTask.title }}</div>
                <div class="task-panel-meta">
                  <span class="task-pill" :class="pillClass(activeTask)">{{ pillLabel(activeTask) }}</span>
                </div>
              </div>
              <button class="panel-close" @click="closePanel">×</button>
            </div>

            <div class="task-panel-body">
              <div v-if="activeTask.status === 'completed'" class="task-done-msg">
                <div class="task-done-check">✓</div>
                <div>This item is complete.
                  <a v-if="activeTaskDetail?.signedFileUrl" :href="submissionFileHref({ fileUrl: activeTaskDetail.signedFileUrl })" target="_blank" rel="noopener">Open retained signed PDF</a>
                  <p>The document preview and signing receipt are below.</p>
                </div>
              </div>

              <div v-if="panelStep === 'consent' && activeTask.status !== 'completed'" class="consent-block">
                <h3>Electronic Signature Disclosure</h3>
                <p>
                  By continuing, you consent to sign this document electronically.
                  Your electronic signature is legally binding and carries the same force as a handwritten signature.
                </p>
                <button class="btn-primary" :disabled="panelLoading" @click="submitConsent">
                  {{ panelLoading ? '…' : 'I consent — continue to the document' }}
                </button>
              </div>

              <div v-if="panelStep !== 'consent' || activeTask.status === 'completed'" class="review-block">
                <div v-if="activeTaskDetail?.document?.htmlContent" class="doc-paper">
                  <div class="doc-preview" v-html="sanitizedHtml"></div>
                  <div v-if="cosigners.length" class="cosign-block">
                    <h4>Internal signatures</h4>
                    <p class="cosign-help">These signatures are attached to the full copy of this agreement.</p>
                    <div v-for="(cs, i) in cosigners" :key="cs.taskId || i" class="cosign-row">
                      <div>
                        <strong>{{ cs.name || 'Signer' }}</strong>
                        <span class="cred-muted"> · {{ cs.roleLabel }}</span>
                      </div>
                      <img v-if="cs.signatureData" :src="cs.signatureData" alt="Signature" class="cosign-img" />
                      <div v-else class="cosign-line">{{ cs.signed ? 'Signed' : 'Signature pending' }}</div>
                    </div>
                  </div>
                </div>
                <div v-if="fillableFields.length && activeTask.status !== 'completed'" class="doc-form-fields">
                  <div v-if="!activeTaskDetail?.document?.htmlContent" class="doc-form-intro">
                    <div class="doc-form-title">{{ activeTask.title }}</div>
                    <p v-if="activeTask.description" class="doc-form-desc">{{ activeTask.description }}</p>
                    <p class="doc-form-hint">Complete the fields below, then proceed to sign.</p>
                  </div>
                  <div
                    v-for="field in fillableFields"
                    :key="field.id"
                    class="doc-field"
                    :data-field-id="field.id"
                  >
                    <label class="doc-field-label">
                      {{ formatFieldLabel(field) }}
                      <span v-if="field.required" class="doc-field-req">*</span>
                    </label>
                    <input
                      v-if="field.type !== 'date' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'textarea'"
                      v-model="fieldValues[field.id]"
                      :type="field.type === 'ssn' ? 'password' : 'text'"
                      :placeholder="field.type === 'ssn' ? 'Enter SSN' : ''"
                      class="doc-field-input"
                    />
                    <textarea
                      v-else-if="field.type === 'textarea'"
                      v-model="fieldValues[field.id]"
                      class="doc-field-input doc-field-textarea"
                      rows="3"
                    />
                    <label v-else-if="field.type === 'checkbox'" class="doc-field-check">
                      <input v-model="fieldValues[field.id]" type="checkbox" />
                      <span>{{ formatFieldLabel(field) }}</span>
                    </label>
                    <select
                      v-else-if="field.type === 'select'"
                      v-model="fieldValues[field.id]"
                      class="doc-field-input"
                    >
                      <option value="">Select an option</option>
                      <option
                        v-for="opt in field.options || []"
                        :key="opt.value || opt.label"
                        :value="opt.value || opt.label"
                      >
                        {{ opt.label || opt.value }}
                      </option>
                    </select>
                    <div v-else-if="field.type === 'radio'" class="doc-field-radio-group">
                      <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="doc-field-radio">
                        <input
                          type="radio"
                          :name="`field_${field.id}`"
                          :value="opt.value || opt.label"
                          v-model="fieldValues[field.id]"
                        />
                        <span>{{ opt.label || opt.value }}</span>
                      </label>
                    </div>
                    <input
                      v-else-if="field.autoToday"
                      v-model="fieldValues[field.id]"
                      type="text"
                      disabled
                      class="doc-field-input"
                    />
                    <input
                      v-else
                      v-model="fieldValues[field.id]"
                      type="date"
                      class="doc-field-input"
                    />
                  </div>
                </div>
                <div v-else-if="!activeTaskDetail?.document?.htmlContent" class="doc-placeholder">
                  <div class="doc-placeholder-icon">📄</div>
                  <div>{{ activeTask.title }}</div>
                  <div class="doc-placeholder-sub">{{ activeTask.description }}</div>
                </div>

                <div v-if="activeTask.status !== 'completed'" class="review-actions">
                  <div v-if="activeTask.actionType === 'review'">
                    <button class="btn-primary" :disabled="panelLoading" @click="submitAcknowledge">
                      {{ panelLoading ? 'Saving…' : 'I have read and acknowledge this document' }}
                    </button>
                  </div>
                  <div v-else-if="panelStep !== 'sign'">
                    <button class="btn-primary" @click="goToSignStep">
                      Continue to signature →
                    </button>
                    <div v-if="fieldValidationError" class="panel-error">{{ fieldValidationError }}</div>
                  </div>
                </div>

                <div v-if="panelStep === 'sign' && activeTask.status !== 'completed'" class="sign-block">
                  <div class="sign-instructions">
                    Draw your signature below using your mouse or finger.
                  </div>
                  <canvas
                    ref="sigCanvas"
                    class="sig-canvas"
                    @mousedown="startDraw" @mousemove="draw" @mouseup="stopDraw" @mouseleave="stopDraw"
                    @touchstart.prevent="touchStart" @touchmove.prevent="touchMove" @touchend="stopDraw"
                  ></canvas>
                  <div class="sign-actions">
                    <button class="btn-secondary-sm" @click="clearCanvas">Clear</button>
                    <button class="btn-back" @click="panelStep = 'review'">← Back</button>
                    <button class="btn-primary" :disabled="!hasSig || panelLoading" @click="submitSign">
                      {{ panelLoading ? 'Signing…' : 'Submit signature' }}
                    </button>
                  </div>
                  <div v-if="panelError" class="panel-error">{{ panelError }}</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </transition>

      <!-- Submit confirmation modal -->
      <div v-if="showSubmitConfirm" class="confirm-overlay" @click.self="showSubmitConfirm = false">
        <div class="confirm-modal">
          <h3>Submit for review?</h3>
          <p v-if="completedCount < totalCount">
            You have <strong>{{ totalCount - completedCount }}</strong> item(s) still pending.
            Complete the required items before submitting your package.
          </p>
          <p v-else>All items are complete. Your documents will be submitted for review.</p>
          <p v-if="submissionError" class="cred-warn">{{ submissionError }}</p>
          <div class="confirm-actions">
            <button class="btn-secondary-sm" @click="showSubmitConfirm = false">Go back</button>
            <button class="btn-primary" :disabled="submitting" @click="submitPortal()">
              {{ submitting ? 'Submitting…' : 'Submit' }}
            </button>
          </div>
        </div>
      </div>

    </template>

  </div>
</template>

<script setup>
import { useOnboardingActivity } from '../composables/useOnboardingActivity.js';
import { ref, computed, onMounted, nextTick, watch, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DOMPurify from 'dompurify';
import axios from 'axios';
import PreHirePortalChat from '../components/prehire/PreHirePortalChat.vue';
import AdaptiveSignatureCapture from '../components/adaptive-intake/AdaptiveSignatureCapture.vue';
import JobDescriptionSections from '../components/careers/JobDescriptionSections.vue';
import { buildFormUrl } from '../utils/publicIntakeUrl.js';
import { learnerFillableFields } from '../utils/documentFieldLayout.js';
import { coverLetterParagraphs as splitCoverLetter } from '../utils/coverLetterDisplay.js';
import '../styles/adaptive-intake.css';
import '../styles/digital-form.css';

const route = useRoute();
const router = useRouter();
const token = computed(() => route.params.token);

// Use a base axios instance (no auth cookies needed — token is in URL)
const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: false
});

// ─── State ────────────────────────────────────────────────────────────────────
const loading = ref(true);
const errorCode = ref('');
const portalData = ref(null);
const portalLinkCopied = ref(false);

const candidate = computed(() => portalData.value?.candidate || {});
const agency = computed(() => portalData.value?.agency || null);
const portalLinkDisplay = computed(() => {
  if (portalData.value?.portalLink) return portalData.value.portalLink;
  if (!token.value) return '';
  return `${window.location.origin}/pre-hire/${token.value}`;
});
const tokenExpiresLabel = computed(() => {
  const raw = portalData.value?.tokenExpiresAt;
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return '';
  }
});

const copyPortalLink = async () => {
  const link = portalLinkDisplay.value;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    portalLinkCopied.value = true;
    setTimeout(() => { portalLinkCopied.value = false; }, 2000);
  } catch {
    window.prompt('Copy your personal portal link:', link);
  }
};
const supportTeam = computed(() => portalData.value?.supportTeam || { label: 'People Operations', members: [] });
const selectedProcess = ref('');
const viewingPrehire = computed(() => selectedProcess.value === 'pre_hire' || candidate.value.status !== 'ONBOARDING');
const processClosed = computed(() => viewingPrehire.value ? ['PREHIRE_REVIEW', 'ONBOARDING'].includes(candidate.value.status) : !!portalData.value?.journey?.onboardingCompletedAt);
const tasks = computed(() => viewingPrehire.value && candidate.value.status === 'ONBOARDING' ? portalData.value?.prehireTasks || [] : portalData.value?.tasks || []);
const activityEnabled = computed(() => candidate.value.status === 'ONBOARDING' && !viewingPrehire.value && !processClosed.value && ['dashboard', 'tasks', 'handbook'].includes(activeSection.value));
const activity = useOnboardingActivity({ enabled: activityEnabled, token, http: portalApi });
const progress = computed(() => portalData.value?.progress || { total: 0, completed: 0, allDone: false });
const portalPhase = computed(() => portalData.value?.portalPhase || 'pre_hire');
const hireAccountMode = computed(() => portalData.value?.hireAccountMode || null);
const credentialPacket = computed(() => portalData.value?.credentialPacket || null);
const showCredentialPacket = computed(() => {
  const status = candidate.value.status;
  return status === 'ONBOARDING' || status === 'PREHIRE_REVIEW' || !!credentialPacket.value;
});
const activeSection = ref('dashboard');
const accountSuggestions = ref([]);
const accountDomain = ref('');
const accountForm = ref({ workEmail: '', localPart: '', password: '', confirmPassword: '' });
const emailAvailable = ref(null);
const emailCheckMessage = ref('');
const provisioningAccount = ref(false);
const finalizingPassword = ref(false);
const finalizeSuccess = ref('');
const accountError = ref('');
const submissions = ref(null);
const submissionsLoading = ref(false);
const handbook = ref(null);
const handbookLoading = ref(false);
const bgSaving = ref(false);
const bgError = ref('');
const bgForm = ref({
  legalName: '',
  dateOfBirth: '',
  currentAddress: '',
  previousAddresses: '',
  aliases: '',
  ssn: '',
  driversLicense: '',
  signatureData: ''
});
const jdSignature = ref('');
const jdSaving = ref(false);
const jdError = ref('');
const jdAcknowledgedLocal = ref(false);
const uploadBusy = ref({});
const uploadDone = ref({});
const uploadError = ref({});
const companyDocSignatures = reactive({});
const companyDocBusy = reactive({});
const companyDocError = reactive({});
const companyDocSigned = reactive({});

const companyDocFileUrl = (doc) => {
  if (!token.value) return '';
  const base = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  if (doc?.adminDocId) {
    return `${base}/prehire-portal/${token.value}/submissions/files/${doc.adminDocId}`;
  }
  if (doc?.fileUrl) {
    return doc.fileUrl.startsWith('http') ? doc.fileUrl : `${base}${doc.fileUrl.startsWith('/') ? '' : '/'}${doc.fileUrl}`;
  }
  if (!doc?.id) return '';
  return `${base}/prehire-portal/${token.value}/documents/${encodeURIComponent(doc.id)}/file`;
};

const signCompanyDocument = async (doc) => {
  const id = doc?.id;
  if (!id) return;
  companyDocError[id] = '';
  const signatureData = companyDocSignatures[id];
  if (!signatureData) {
    companyDocError[id] = 'Please capture your signature.';
    return;
  }
  companyDocBusy[id] = true;
  try {
    await portalApi.post(`/prehire-portal/${token.value}/documents/${encodeURIComponent(id)}/sign`, {
      signatureData,
      signerName: candidateDisplayName.value
    });
    companyDocSigned[id] = true;
    await reloadPortal();
  } catch (e) {
    companyDocError[id] = e?.response?.data?.error?.message || 'Could not save acknowledgement.';
  } finally {
    companyDocBusy[id] = false;
  }
};

const splitPlainParagraphs = (raw) => {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const byBlank = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  const byLine = text.split(/\n/).map((p) => p.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  if (text.length < 280) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    const next = `${buf}${s}`.trim();
    if (buf && next.length > 220) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [text];
};

const docKindLabel = (kind) => {
  switch (String(kind || '').toLowerCase()) {
    case 'print_only': return 'Printable';
    case 'reference': return 'External link';
    case 'upload': return 'Complete & upload';
    case 'company_document': return 'Review & sign';
    case 'acknowledgement': return 'Job description';
    default: return kind || 'Document';
  }
};

const formatSubmissionCategory = (category) => {
  const t = String(category || '').trim().toLowerCase();
  if (!t) return '';
  const labels = {
    resume: 'Resume',
    cover_letter: 'Cover letter',
    reference_release: 'Reference release',
    application_receipt: 'Application receipt',
    application_material: 'Application material',
    job_description_ack: 'Job description',
    job_description_acknowledgement: 'Job description',
    background_check_authorization: 'Background check',
    prehire_company_document_ack: 'Signed document',
    prehire_upload: 'Uploaded copy'
  };
  return labels[t] || t.replace(/_/g, ' ');
};

const onPrehireDocUpload = async (doc, event) => {
  const file = event?.target?.files?.[0];
  const docId = doc?.id;
  if (!file || !docId) return;
  uploadError.value = { ...uploadError.value, [docId]: '' };
  uploadBusy.value = { ...uploadBusy.value, [docId]: true };
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docId', String(docId));
    fd.append('title', String(doc.title || 'Pre-hire upload'));
    await portalApi.post(`/prehire-portal/${token.value}/documents/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    uploadDone.value = { ...uploadDone.value, [docId]: true };
    await reloadPortal();
  } catch (e) {
    uploadError.value = {
      ...uploadError.value,
      [docId]: e?.response?.data?.error?.message || 'Upload failed. Try again.'
    };
  } finally {
    uploadBusy.value = { ...uploadBusy.value, [docId]: false };
    if (event?.target) event.target.value = '';
  }
};

const backgroundCheck = computed(() => portalData.value?.backgroundCheck || { signed: false });
const backgroundCheckLegal = computed(() => portalData.value?.backgroundCheckLegal || null);
const backgroundCheckLegalParagraphs = computed(() => {
  const fromApi = backgroundCheckLegal.value?.paragraphs;
  const signer = String(bgForm.value?.legalName || '').trim();
  if (Array.isArray(fromApi) && fromApi.length) {
    const paras = fromApi.filter((p) => String(p || '').trim());
    if (!signer || !paras[0]) return paras;
    // Keep the opening "I, {name}," line in sync with the legal-name field.
    const updated = [...paras];
    updated[0] = updated[0]
      .replace(/^I,\s*[^,]+,\s*hereby authorize/, `I, ${signer}, hereby authorize`)
      .replace(/^I hereby authorize/, `I, ${signer}, hereby authorize`);
    return updated;
  }
  const company = agency.value?.legalName || agency.value?.officialName || agency.value?.name || 'the employer';
  const iLine = signer
    ? `I, ${signer}, hereby authorize ${company} (the "Company"), and/or its agents`
    : `I hereby authorize ${company} (the "Company"), and/or its agents`;
  return [
    `${iLine} to make investigation of my background, references, character, past employment, consumer reports, education, and criminal history record information which may be in any state or local files, including those maintained by both public and private organizations, and all public records, for the purpose of confirming the information contained on my application and/or obtaining other information which may be material to my qualifications for employment. A telephone facsimile (fax) or xerographic copy of this consent shall be considered as valid as the original consent.`,
    `I hereby consent to the Company's verification of all the information I have provided on my application form. I also agree to execute as a condition of employment or a condition of continued employment any additional written authorization necessary for the Company to obtain access to and copies of records pertaining to this information. I also hereby authorize the Company's access to any medical histories or records pertaining to me (and any other individuals who due to my employment may be covered by any Company medical or other insurance program). With regard to the foregoing disclosures, I hereby agree to release any person, company, or other entity from any and all causes of action that otherwise might arise from supplying the Company with information it may request pursuant to this release. I understand that any false answers or statements, or misrepresentations by omission, made by me on this application or any related document, will be sufficient for rejection of my application or for my immediate discharge should such falsifications or misrepresentations be discovered after I am employed.`
  ];
});
const handbookLinks = computed(() => portalData.value?.handbookLinks || {});
const handbookSideLink = computed(() =>
  handbookLinks.value.fullUrl || handbookLinks.value.acknowledgementUrl || null
);
const jobDescription = computed(() => portalData.value?.jobDescription || null);
const jdPlainParagraphs = computed(() => splitPlainParagraphs(jobDescription.value?.descriptionText));
const prehireDocs = computed(() => portalData.value?.prehireDocs || []);
const checklistItems = computed(() => portalData.value?.checklistItems || []);
const jdAcknowledged = computed(() => jdAcknowledgedLocal.value || !!portalData.value?.jdAcknowledged);
const candidateDisplayName = computed(() => `${candidate.value.firstName || ''} ${candidate.value.lastName || ''}`.trim());

const formatChecklistDate = (raw) => {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleDateString();
  } catch {
    return String(raw);
  }
};

const trackHandbookOpen = async (linkKey) => {
  try {
    await portalApi.post(`/prehire-portal/${token.value}/resources/handbook/open`, { linkKey });
  } catch { /* ignore */ }
};

const submitBackgroundCheck = async () => {
  bgError.value = '';
  if (!bgForm.value.signatureData) {
    bgError.value = 'Please capture your signature.';
    return;
  }
  bgSaving.value = true;
  try {
    const { data } = await portalApi.post(`/prehire-portal/${token.value}/background-check`, {
      legalName: bgForm.value.legalName,
      dateOfBirth: bgForm.value.dateOfBirth,
      currentAddress: bgForm.value.currentAddress,
      previousAddresses: bgForm.value.previousAddresses,
      aliases: bgForm.value.aliases,
      ssn: bgForm.value.ssn,
      driversLicense: bgForm.value.driversLicense,
      signatureData: bgForm.value.signatureData
    });
    bgForm.value.ssn = '';
    bgForm.value.driversLicense = '';
    if (portalData.value) {
      portalData.value.backgroundCheck = {
        signed: true,
        ssnMasked: data.ssnMasked,
        dlMasked: data.dlMasked,
        signerName: data.signerName
      };
    }
  } catch (e) {
    bgError.value = e?.response?.data?.error?.message || 'Could not save authorization.';
  } finally {
    await reloadPortal();
    bgSaving.value = false;
  }
};

const acknowledgeJobDescription = async () => {
  jdError.value = '';
  if (!jdSignature.value) {
    jdError.value = 'Please capture your signature.';
    return;
  }
  jdSaving.value = true;
  try {
    await portalApi.post(`/prehire-portal/${token.value}/job-description/acknowledge`, {
      signatureData: jdSignature.value,
      signerName: candidateDisplayName.value
    });
    jdAcknowledgedLocal.value = true;
    await reloadPortal();
  } catch (e) {
    jdError.value = e?.response?.data?.error?.message || 'Could not save acknowledgement.';
  } finally {
    jdSaving.value = false;
  }
};

const canProvisionAccount = computed(() => {
  const email = accountForm.value.workEmail || (accountForm.value.localPart && accountDomain.value
    ? `${accountForm.value.localPart}@${accountDomain.value}`
    : '');
  if (!email || !String(email).includes('@')) return false;
  if (accountForm.value.localPart && emailAvailable.value === false) return false;
  return true;
});

const canFinalizePassword = computed(() => (
  accountForm.value.password?.length >= 8
  && accountForm.value.password === accountForm.value.confirmPassword
));

const loadAccountSuggestions = async () => {
  try {
    const { data } = await portalApi.get(`/prehire-portal/${token.value}/account/suggestions`);
    if (!data?.enabled) return;
    accountSuggestions.value = data.suggestions || [];
    accountDomain.value = data.domain || '';
    if (accountSuggestions.value[0]?.email) {
      accountForm.value.workEmail = accountSuggestions.value[0].email;
    }
  } catch {
    /* ignore */
  }
};

const checkTypedEmail = async () => {
  const local = String(accountForm.value.localPart || '').trim().toLowerCase();
  if (!local || !accountDomain.value) return;
  const email = `${local}@${accountDomain.value}`;
  accountForm.value.workEmail = email;
  try {
    const { data } = await portalApi.post(`/prehire-portal/${token.value}/account/check-email`, { email });
    emailAvailable.value = !!data.available;
    emailCheckMessage.value = data.available
      ? `${email} is available`
      : data.reason === 'taken_in_directory'
        ? `${email} is already used by a Google user or group`
        : data.reason === 'taken_in_app'
          ? `${email} is already used in the app`
          : `${email} is not available (${data.reason || 'taken'})`;
  } catch (e) {
    emailAvailable.value = false;
    emailCheckMessage.value = e?.response?.data?.error?.message || 'Could not check availability';
  }
};

const provisionAccount = async () => {
  accountError.value = '';
  provisioningAccount.value = true;
  try {
    const workEmail = accountForm.value.workEmail
      || `${accountForm.value.localPart}@${accountDomain.value}`;
    await portalApi.post(`/prehire-portal/${token.value}/account/provision`, {
      workEmail
    });
    await reloadPortal();
    activeSection.value = 'tasks';
  } catch (e) {
    accountError.value = e?.response?.data?.error?.message || 'Could not save username';
  } finally {
    provisioningAccount.value = false;
  }
};

const finalizePassword = async () => {
  accountError.value = '';
  finalizeSuccess.value = '';
  finalizingPassword.value = true;
  try {
    const { data } = await portalApi.post(`/prehire-portal/${token.value}/account/set-password`, {
      password: accountForm.value.password,
      confirmPassword: accountForm.value.confirmPassword
    });
    finalizeSuccess.value = 'Password saved. Submit your onboarding package for People Operations to review.';
    await reloadPortal();
    accountForm.value.password = '';
    accountForm.value.confirmPassword = '';
  } catch (e) {
    accountError.value = e?.response?.data?.error?.message || 'Could not activate account';
  } finally {
    finalizingPassword.value = false;
  }
};

const openSubmissions = async () => {
  activeSection.value = 'submissions';
  submissionsLoading.value = true;
  try {
    const { data } = await portalApi.get(`/prehire-portal/${token.value}/submissions`);
    submissions.value = data;
  } catch {
    submissions.value = null;
  } finally {
    submissionsLoading.value = false;
  }
};

const openHandbook = async () => {
  activeSection.value = 'handbook';
  handbookLoading.value = true;
  try {
    const { data } = await portalApi.get(`/prehire-portal/${token.value}/resources/handbook`);
    handbook.value = data;
  } catch {
    handbook.value = { available: false };
  } finally {
    handbookLoading.value = false;
  }
};

const openResources = openHandbook;

const submissionFileHref = (doc) => {
  if (!doc?.fileUrl) return '';
  const base = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  return doc.fileUrl.startsWith('http') ? doc.fileUrl : `${base}${doc.fileUrl.startsWith('/') ? '' : '/'}${doc.fileUrl}`;
};

const viewCompletedDocument = async (doc) => {
  if (!doc?.id) return;
  selectedDocument.value = { id: doc.id, status: 'completed', title: doc.title, actionType: doc.actionType };
  await selectTask(selectedDocument.value);
};

const coverLetterParagraphs = computed(() =>
  splitCoverLetter(submissions.value?.hiringProfile?.coverLetter || '')
);

const cosigners = computed(() => activeTaskDetail.value?.cosigners || []);

const identityForm = ref({ firstName: '', lastName: '', phone: '' });
const confirmingIdentity = ref(false);
const ackingSystem = ref('');
const revealedPasswords = ref({});

watch(credentialPacket, (pkt) => {
  if (!pkt?.identity) return;
  identityForm.value = {
    firstName: pkt.identity.legalFirstName || '',
    lastName: pkt.identity.legalLastName || '',
    phone: pkt.identity.personalPhone || ''
  };
}, { immediate: true });

const confirmIdentity = async () => {
  confirmingIdentity.value = true;
  try {
    const { data } = await portalApi.post(`/prehire-portal/${token.value}/credential-packet/confirm-identity`, {
      legalFirstName: identityForm.value.firstName,
      legalLastName: identityForm.value.lastName,
      personalPhone: identityForm.value.phone
    });
    if (portalData.value && data?.credentialPacket) {
      portalData.value.credentialPacket = data.credentialPacket;
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Could not confirm identity');
  } finally {
    confirmingIdentity.value = false;
  }
};

const ackSystem = async (systemKey) => {
  ackingSystem.value = systemKey;
  try {
    const { data } = await portalApi.post(
      `/prehire-portal/${token.value}/credential-packet/systems/${systemKey}/acknowledge`
    );
    if (portalData.value && data?.credentialPacket) {
      portalData.value.credentialPacket = data.credentialPacket;
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Could not save acknowledgement');
  } finally {
    ackingSystem.value = '';
  }
};

const revealTempPassword = async (systemKey) => {
  try {
    const { data } = await portalApi.post(
      `/prehire-portal/${token.value}/credential-packet/systems/${systemKey}/reveal-temp-password`
    );
    if (data?.revealed && data.password) {
      revealedPasswords.value = { ...revealedPasswords.value, [systemKey]: data.password };
      // Refresh packet so "available" flips to consumed
      const refresh = await portalApi.get(`/prehire-portal/${token.value}/credential-packet`);
      if (portalData.value && refresh.data?.credentialPacket) {
        portalData.value.credentialPacket = refresh.data.credentialPacket;
      }
    } else {
      alert(data?.reason === 'already_revealed'
        ? 'That temporary password was already revealed and cannot be shown again. Contact People Operations if you need a reset.'
        : 'No temporary password is available yet.');
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Could not reveal password');
  }
};

const chatRef = ref(null);
const currentYear = new Date().getFullYear();

const TASK_ACCENTS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c'];
const taskAccentColor = (idx) => TASK_ACCENTS[idx % TASK_ACCENTS.length];
const taskAccentBg = (idx) => `color-mix(in srgb, ${taskAccentColor(idx)} 12%, white)`;

const candidateInitials = computed(() =>
  `${(candidate.value.firstName || '')[0] || ''}${(candidate.value.lastName || '')[0] || ''}`.toUpperCase() || 'YOU'
);
const orgInitials = computed(() => {
  const name = agency.value?.name || 'Org';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
});

const taskDescription = (task) => {
  if (task.taskType === 'training') return task.description || 'Please complete this form to continue.';
  if (task.description) return task.description;
  if (task.taskType === 'intake_form') return 'Please complete this digital form.';
  if (task.actionType === 'review') return 'Please review and acknowledge this document.';
  return 'Please review and sign this document to continue.';
};
const taskActionLabel = (task) => {
  if (task.taskType === 'intake_form') return 'Fill Out Form';
  if (task.taskType === 'training') return 'Open Form';
  return task.actionType === 'review' ? 'Review & Acknowledge' : 'View & Sign';
};

// ─── Intake form task handling ─────────────────────────────────────────────
const intakeFormSubmitting = ref(false);
const intakeFormOpened = ref(null); // taskId currently open

const openIntakeForm = (task) => {
  const pk = task.metadata?.intakeLinkPublicKey;
  if (!pk) return;
  intakeFormOpened.value = task.id;
  const base = buildFormUrl(pk, task.metadata?.formType || task.metadata?.form_type);
  const returnTo = encodeURIComponent(`/pre-hire/${token.value}`);
  const url = `${base}${base.includes('?') ? '&' : '?'}returnTo=${returnTo}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const markIntakeFormDone = async (task) => {
  intakeFormSubmitting.value = true;
  try {
    await portalApi.post(`/prehire-portal/${token.value}/tasks/${task.id}/complete-form`);
    await reloadPortal();
    intakeFormOpened.value = null;
  } catch {
    /* non-fatal */
  } finally {
    intakeFormSubmitting.value = false;
  }
};

// ─── Training/module task handling ────────────────────────────────────────────
const moduleTaskSubmitting = ref(false);
const moduleTaskOpened = ref(null);

const openModuleTask = (task) => {
  // referenceId is the module ID; stay in the tokened portal (no login required)
  const moduleId = task.referenceId;
  if (!moduleId || !token.value) return;
  moduleTaskOpened.value = task.id;
  router.push(`/pre-hire/${token.value}/module/${moduleId}`);
};

const markModuleTaskDone = async (task) => {
  moduleTaskSubmitting.value = true;
  try {
    // Re-use the complete-form endpoint — it simply marks the task completed
    await portalApi.post(`/prehire-portal/${token.value}/tasks/${task.id}/complete-form`);
    await reloadPortal();
    moduleTaskOpened.value = null;
  } catch {
    /* non-fatal */
  } finally {
    moduleTaskSubmitting.value = false;
  }
};

const focusChat = () => {
  chatRef.value?.expand?.();
  chatRef.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
};

const totalCount = computed(() => {
  const p = progress.value || {};
  return Number(p.total || 0);
});
const completedCount = computed(() => {
  const p = progress.value || {};
  return Number(p.completed || 0);
});
const allDone = computed(() => !!progress.value.allDone);
const progressPct = computed(() => viewingPrehire.value && candidate.value.status === 'ONBOARDING' ? 100 : Number(progress.value.percent || 0));

const isPrehire = computed(() => ['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW'].includes(candidate.value.status));
const isOnboardingPortal = computed(() => candidate.value.status === 'ONBOARDING');
const phaseLabel = computed(() => {
  if (viewingPrehire.value && candidate.value.status === 'ONBOARDING') return 'Pre-hire completed';
  if (portalPhase.value === 'account_setup') return 'Choose username';
  if (portalPhase.value === 'onboarding_review') return 'Onboarding submitted';
  if (portalPhase.value === 'finalize_login') return 'Set password';
  if (portalPhase.value === 'review') return 'Under review';
  if (portalPhase.value === 'onboarding' || isOnboardingPortal.value) return 'Onboarding';
  return 'Pre-Hire';
});
const sectionLabel = computed(() => viewingPrehire.value ? 'PRE-HIRE ITEMS' : 'ONBOARDING CHECKLIST');
const statusLabel = computed(() => {
  const map = {
    PENDING_SETUP: 'Awaiting setup',
    PREHIRE_OPEN: 'Pre-hire in progress',
    PREHIRE_REVIEW: 'Under review',
    ONBOARDING: 'Onboarding'
  };
  return map[candidate.value.status] || candidate.value.status || '';
});

// ─── CSS vars from agency branding ────────────────────────────────────────────
const cssVars = computed(() => {
  const a = agency.value || {};
  const primary = a.primaryColor || '#2563eb';
  const secondary = a.secondaryColor || primary;
  const accent = a.accentColor || secondary;
  return {
    '--primary': primary,
    '--secondary': secondary,
    '--accent': accent,
    '--primary-light': `color-mix(in srgb, ${primary} 12%, white)`,
    '--primary-mid': `color-mix(in srgb, ${primary} 25%, white)`,
    '--primary-soft': `color-mix(in srgb, ${primary} 8%, white)`,
    '--primary-dark': `color-mix(in srgb, ${primary} 55%, #0b192e)`,
    ...(a.fontFamily ? { fontFamily: a.fontFamily } : {})
  };
});

const sidebarStyle = computed(() => {
  const a = agency.value || {};
  const primary = a.primaryColor || '#1d4ed8';
  const bg = a.sidebarColor
    ? `linear-gradient(180deg, color-mix(in srgb, ${primary} 42%, ${a.sidebarColor}) 0%, ${a.sidebarColor} 100%)`
    : `linear-gradient(180deg, color-mix(in srgb, ${primary} 70%, #0b192e) 0%, #0b192e 100%)`;
  return { background: bg };
});

// ─── Task panel ───────────────────────────────────────────────────────────────
const activeTaskId = ref(null);
const selectedDocument = ref(null);
const activeTask = computed(() => tasks.value.find(t => t.id === activeTaskId.value) || selectedDocument.value);
const activeTaskDetail = ref(null);
const panelStep = ref('consent');
const panelLoading = ref(false);
const panelError = ref('');
const consentChecked = ref(false);
const fieldValues = ref({});
const fieldValidationError = ref('');

const sanitizedHtml = computed(() => {
  const html = activeTaskDetail.value?.document?.htmlContent || '';
  return DOMPurify.sanitize(html);
});

const isFieldVisible = (def, values) => {
  const showIf = def?.showIf;
  if (!showIf || !showIf.fieldId) return true;
  const actual = values[showIf.fieldId];
  const expected = showIf.equals;
  if (Array.isArray(expected)) return expected.map(String).includes(String(actual));
  if (expected === '' || expected === null || expected === undefined) return !!actual;
  return String(actual) === String(expected);
};

const fillableFields = computed(() => {
  const defs = activeTaskDetail.value?.document?.fieldDefinitions;
  if (!Array.isArray(defs) || !defs.length) return [];
  return learnerFillableFields(defs).filter((def) => isFieldVisible(def, fieldValues.value));
});

const formatFieldLabel = (field) => field?.label || field?.type || 'Field';

const canProceedToSign = computed(() => {
  if (!fillableFields.value.length) return true;
  return fillableFields.value.every((field) => {
    if (!field.required) return true;
    const val = fieldValues.value[field.id];
    if (field.type === 'checkbox') return !!val;
    return String(val || '').trim().length > 0;
  });
});

function initFieldValues(taskDetail) {
  const defs = taskDetail?.document?.fieldDefinitions;
  const next = {};
  if (Array.isArray(defs)) {
    defs.forEach((field) => {
      if (field?.type === 'checkbox') {
        next[field.id] = !!field.defaultChecked;
      } else if (field?.autoToday) {
        next[field.id] = new Date().toLocaleDateString('en-US');
      } else {
        next[field.id] = field?.defaultValue || '';
      }
    });
  }
  fieldValues.value = next;
  fieldValidationError.value = '';
}

const pillClass = (t) => {
  if (t.status === 'completed') return 'pill-done';
  if (t.taskType === 'training') return 'pill-review';
  if (t.actionType === 'review') return 'pill-review';
  return 'pill-sign';
};
const pillLabel = (t) => {
  if (t.status === 'completed') return 'Done';
  if (t.taskType === 'training') return 'Form to complete';
  if (t.actionType === 'review') return 'Review & acknowledge';
  return 'Signature required';
};

const selectTask = async (task) => {
  activeTaskId.value = task.id;
  panelStep.value = task.status === 'completed' ? 'review' : 'consent';
  panelError.value = '';
  consentChecked.value = false;
  activeTaskDetail.value = null;
  fieldValues.value = {};
  fieldValidationError.value = '';
  try {
    const res = await portalApi.get(`/prehire-portal/${token.value}/tasks/${task.id}`);
    activeTaskDetail.value = res.data;
    initFieldValues(activeTaskDetail.value);
    if (task.status === 'completed' || activeTaskDetail.value?.auditTrail?.portalConsent?.given) {
      panelStep.value = 'review';
    }
  } catch { /* show panel anyway */ }
};

const closePanel = () => {
  activeTaskId.value = null; selectedDocument.value = null;
  clearCanvas();
};

// ─── Consent ──────────────────────────────────────────────────────────────────
const submitConsent = async () => {
  panelLoading.value = true;
  panelError.value = '';
  try {
    await portalApi.post(`/prehire-portal/${token.value}/tasks/${activeTask.value.id}/consent`, {
      consentGiven: true,
      consentTimestamp: new Date().toISOString()
    });
    panelStep.value = 'review';
  } catch (e) {
    panelError.value = e.response?.data?.error?.message || 'Failed to record consent.';
  } finally {
    panelLoading.value = false;
  }
};

// ─── Acknowledge (review-only) ────────────────────────────────────────────────
const goToSignStep = () => {
  if (!canProceedToSign.value) {
    fieldValidationError.value = 'Please complete all required fields before signing.';
    return;
  }
  fieldValidationError.value = '';
  panelStep.value = 'sign';
};

const submitAcknowledge = async () => {
  panelLoading.value = true;
  panelError.value = '';
  try {
    await portalApi.post(`/prehire-portal/${token.value}/tasks/${activeTask.value.id}/acknowledge`);
    await reloadPortal();
    closePanel();
  } catch (e) {
    panelError.value = e.response?.data?.error?.message || 'Failed to save acknowledgment.';
  } finally {
    panelLoading.value = false;
  }
};

// ─── Signature canvas ─────────────────────────────────────────────────────────
const sigCanvas = ref(null);
const hasSig = ref(false);
let isDrawing = false;
let ctx = null;

const initCanvas = async () => {
  await nextTick();
  if (!sigCanvas.value) return;
  const canvas = sigCanvas.value;
  canvas.width = canvas.offsetWidth * window.devicePixelRatio;
  canvas.height = canvas.offsetHeight * window.devicePixelRatio;
  ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

const startDraw = (e) => {
  isDrawing = true;
  ctx?.beginPath();
  const { x, y } = relPos(e);
  ctx?.moveTo(x, y);
};
const draw = (e) => {
  if (!isDrawing || !ctx) return;
  const { x, y } = relPos(e);
  ctx.lineTo(x, y);
  ctx.stroke();
  hasSig.value = true;
};
const stopDraw = () => { isDrawing = false; };

const touchStart = (e) => {
  const t = e.touches[0];
  startDraw({ clientX: t.clientX, clientY: t.clientY });
};
const touchMove = (e) => {
  const t = e.touches[0];
  draw({ clientX: t.clientX, clientY: t.clientY });
};

const relPos = (e) => {
  const rect = sigCanvas.value.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const clearCanvas = () => {
  if (!ctx || !sigCanvas.value) return;
  ctx.clearRect(0, 0, sigCanvas.value.width, sigCanvas.value.height);
  hasSig.value = false;
};

const submitSign = async () => {
  if (!sigCanvas.value) return;
  if (!canProceedToSign.value) {
    fieldValidationError.value = 'Please complete all required fields before signing.';
    panelStep.value = 'review';
    return;
  }
  const dataUrl = sigCanvas.value.toDataURL('image/png');
  panelLoading.value = true;
  panelError.value = '';
  try {
    await portalApi.post(`/prehire-portal/${token.value}/tasks/${activeTask.value.id}/sign`, {
      signatureData: dataUrl,
      fieldValues: fieldValues.value
    });
    await reloadPortal();
    closePanel();
  } catch (e) {
    panelError.value = e.response?.data?.error?.message || 'Failed to submit signature. Please try again.';
  } finally {
    panelLoading.value = false;
  }
};

// Watch panelStep to init canvas when sign step activates
watch(() => panelStep.value, (step) => { if (step === 'sign') initCanvas(); });

// ─── Submit portal (all done) ─────────────────────────────────────────────────
const submitting = ref(false);
const showSubmitConfirm = ref(false);

const confirmSubmit = () => { showSubmitConfirm.value = true; };

const submissionError = ref('');
const submitPortal = async () => {
  submitting.value = true;
  try {
    submissionError.value = '';
    await activity.flush();
    await portalApi.post(`/prehire-portal/${token.value}/complete`);
    showSubmitConfirm.value = false;
    // Reload — will hit STATUS_ADVANCED state
    await loadPortal();
  } catch (e) {
    submissionError.value = e.response?.data?.error?.message || 'Could not submit. Please try again.';
    const errCode = e.response?.data?.error?.code;
    if (errCode === 'TASKS_INCOMPLETE') {
      showSubmitConfirm.value = true;
    }
  } finally {
    submitting.value = false;
  }
};

// ─── Load / reload ────────────────────────────────────────────────────────────
const loadPortal = async () => {
  loading.value = true;
  errorCode.value = '';
  try {
    const res = await portalApi.get(`/prehire-portal/${token.value}`);
    portalData.value = res.data;
    if (!selectedProcess.value) selectedProcess.value = res.data?.candidate?.status === 'ONBOARDING' ? 'onboarding' : 'pre_hire';
    if (!bgForm.value.legalName) {
      bgForm.value.legalName = `${res.data?.candidate?.firstName || ''} ${res.data?.candidate?.lastName || ''}`.trim();
    }
    if (res.data?.portalPhase === 'account_setup' || res.data?.hireAccountMode === 'group_password') {
      await loadAccountSuggestions();
    }
  } catch (e) {
    errorCode.value = e.response?.data?.error?.code || 'UNKNOWN';
    portalData.value = null;
    // Surface agency info from STATUS_ADVANCED error if available
    if (e.response?.data?.agency) {
      portalData.value = { agency: e.response.data.agency };
    }
  } finally {
    loading.value = false;
  }
};

const reloadPortal = async () => {
  try {
    const res = await portalApi.get(`/prehire-portal/${token.value}`);
    portalData.value = res.data;
  } catch { /* ignore reload errors */ }
};

onMounted(async () => {
  await loadPortal();
});
</script>

<style scoped>
.journey-switch { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
.journey-switch button, .journey-switch > div { text-align: left; border: 1px solid #dbe5e1; border-radius: 12px; padding: 16px; background: white; color: #203d35; }
.journey-switch span { display: block; font-size: 12px; margin-top: 7px; }
.journey-switch button.selected { border: 2px solid var(--primary); background: var(--primary-soft); }
.journey-switch button:disabled { opacity: .6; }
.journey-review, .journey-time { padding: 18px; border-radius: 12px; margin: 16px 0; background: #fff8e8; border: 1px solid #f4dfb2; }
.journey-review p, .journey-time p { font-size: 13px; line-height: 1.5; margin: 8px 0; }
.journey-time { background: #ecf7f1; border-color: #cbe8d8; }
.journey-time > span { display: block; margin-top: 6px; }
.journey-prehire { border: 0; padding: 0; margin: 0; min-width: 0; }
@media (max-width: 640px) { .journey-switch { grid-template-columns: 1fr; } }

.portal-root {
  --primary: #2563eb;
  --secondary: #2563eb;
  --accent: #0f766e;
  --primary-light: color-mix(in srgb, var(--primary) 12%, white);
  --primary-mid: color-mix(in srgb, var(--primary) 25%, white);
  --primary-soft: color-mix(in srgb, var(--primary) 8%, white);
  min-height: 100vh;
  background: #f3f4f6;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #0f172a;
}

.portal-shell {
  min-height: 100vh;
  height: 100vh;
  display: flex;
  overflow: hidden;
}

/* ─── Splash / error screens ────────────────────────────────────────────────── */
.portal-splash {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  padding: 40px;
}
.portal-splash-error { background: #fff1f2; }
.portal-splash-done { background: #f0fdf4; }
.splash-spinner {
  width: 40px; height: 40px; border: 3px solid #e2e8f0;
  border-top-color: var(--primary); border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.splash-text { color: #64748b; font-size: 14px; }
.splash-logo img { height: 64px; object-fit: contain; margin-bottom: 10px; }
.done-icon { font-size: 48px; color: #16a34a; }
.error-icon { font-size: 48px; }
.portal-splash h2 { font-size: 24px; font-weight: 700; margin: 0; }
.portal-splash p { font-size: 15px; color: #475569; max-width: 400px; margin: 0; }
.contact-line { font-size: 14px; color: #374151; }

/* ─── Left nav ──────────────────────────────────────────────────────────────── */
.portal-nav {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  color: rgba(255, 255, 255, 0.92);
  padding: 24px 16px;
}

.portal-nav-brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 0 8px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 16px;
}

.portal-nav-logo {
  max-height: 44px;
  max-width: 160px;
  object-fit: contain;
}

.portal-nav-logo-fallback {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
}

.portal-nav-org {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}

.portal-nav-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.portal-nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.72);
  text-decoration: none;
}

.portal-nav-link--active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.portal-nav-link--disabled {
  opacity: 0.45;
  cursor: default;
}

.portal-nav-icon {
  width: 18px;
  text-align: center;
  opacity: 0.9;
}

.portal-nav-footer {
  margin-top: auto;
  padding: 16px 8px 0;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.45);
  display: flex;
  gap: 8px;
}

.portal-nav-shield { flex-shrink: 0; }

/* ─── Center column ─────────────────────────────────────────────────────────── */
.portal-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--primary) 10%, #f8fafc) 0%, #f3f4f6 220px);
}

.portal-topbar {
  height: 64px;
  background: #fff;
  border-bottom: 3px solid var(--primary);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 28px;
}

.portal-user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.portal-user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.portal-content {
  flex: 1;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: 28px 32px 48px;
  box-sizing: border-box;
}

.portal-welcome h1 {
  margin: 0 0 6px;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.portal-welcome p {
  margin: 0 0 12px;
  color: #64748b;
  font-size: 15px;
}

.portal-phase-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 16%, #fff);
  color: var(--primary);
  border: 1px solid color-mix(in srgb, var(--primary) 28%, #fff);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 20px;
}

.portal-select,
.portal-account-setup input[type="text"],
.portal-account-setup input[type="password"],
.portal-account-setup input[type="tel"] {
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font: inherit;
}

.portal-email-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.portal-email-row input {
  flex: 1;
  margin-top: 0;
}

.portal-email-domain {
  color: #64748b;
  font-weight: 600;
  white-space: nowrap;
}

.cred-warn {
  color: #b91c1c;
  font-size: 13px;
  margin: 8px 0 0;
}

.portal-simple-list {
  margin: 8px 0 0;
  padding-left: 18px;
}

.portal-cover-letter {
  white-space: pre-wrap;
  margin-top: 8px;
  color: #334155;
}

.handbook-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.handbook-section h4 {
  margin: 0 0 8px;
}

.handbook-body {
  font-size: 14px;
  line-height: 1.55;
  color: #334155;
}

.item-step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.portal-link-card {
  margin: 0 0 18px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #dce6e1;
  background: #fff;
}

.portal-link-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.portal-link-help {
  margin: 0 0 8px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
}

.portal-link-url {
  display: block;
  font-size: 12px;
  word-break: break-all;
  color: #0f172a;
}

.portal-link-expiry {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
}

.bg-form { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
.bg-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.bg-form-grid label,
.bg-form > label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.82rem;
  font-weight: 650;
  color: #334155;
}
.bg-span { grid-column: 1 / -1; }
.bg-form input,
.bg-form textarea {
  border: 1px solid #d0d7e2;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.95rem;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.bg-form input:focus,
.bg-form textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
}
.bg-legal-panel {
  padding: 14px 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 0.88rem;
  line-height: 1.55;
}
.bg-legal-panel--ack {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #065f46;
}
.bg-legal-para {
  margin: 0 0 0.85rem;
}
.bg-legal-para:last-child {
  margin-bottom: 0;
}
.bg-legal-title {
  margin: 0 0 6px;
  font-size: 0.92rem;
  font-weight: 750;
  color: #0f172a;
}
.bg-legal-list {
  margin: 8px 0 0;
  padding-left: 1.15rem;
}
.bg-legal-list li { margin-bottom: 4px; }
.portal-jd-plain {
  text-align: left;
  margin: 8px 0 16px;
  padding: 14px 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.portal-jd-plain h3 {
  margin: 0 0 10px;
  font-size: 1.15rem;
  color: var(--primary);
}
.portal-jd-plain p {
  margin: 0 0 0.75rem;
  line-height: 1.6;
  color: #334155;
  text-align: left;
}
.portal-jd-plain p:last-child { margin-bottom: 0; }
.portal-jd-accountability {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e3a8a;
  font-size: 0.9rem;
  line-height: 1.5;
}
.portal-doc-embed {
  margin: 10px 0 12px;
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.portal-doc-frame {
  width: 100%;
  min-height: 420px;
  border: 0;
  display: block;
  background: #f8fafc;
}
.portal-jd-card :deep(.jds),
.portal-jd-card :deep(.ai-signature-panel) {
  text-align: left;
}
.portal-upload-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  font-size: 0.82rem;
  font-weight: 650;
}
.portal-upload-field input[type="file"] {
  font-size: 0.85rem;
}
.portal-doc-row {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}
.portal-doc-row:last-child {
  border-bottom: 0;
  margin-bottom: 0;
  padding-bottom: 0;
}
.portal-bg-card :deep(.ai-signature-tabs),
.portal-jd-card :deep(.ai-signature-tabs) {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}
.portal-bg-card :deep(.ai-signature-tab),
.portal-jd-card :deep(.ai-signature-tab) {
  border: 0;
  background: transparent;
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 0.82rem;
  font-weight: 650;
  color: #64748b;
  cursor: pointer;
}
.portal-bg-card :deep(.ai-signature-tab--active),
.portal-jd-card :deep(.ai-signature-tab--active) {
  background: #fff;
  color: var(--primary);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.portal-bg-card :deep(.ai-signature-type-input),
.portal-jd-card :deep(.ai-signature-type-input) {
  width: 100%;
  border: 1px solid #d0d7e2;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 1.05rem;
  font-family: "Segoe Script", "Bradley Hand", cursive;
}
@media (max-width: 640px) {
  .bg-form-grid { grid-template-columns: 1fr; }
}

.portal-link-copy {
  border: 1px solid rgba(37, 99, 235, 0.35);
  background: #fff;
  color: #1d4ed8;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.portal-link-copy:hover {
  background: rgba(37, 99, 235, 0.08);
}

.portal-credential-packet {
  margin: 20px 0 8px;
}
.cred-card {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, #e2e8f0);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 12px;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--primary) 8%, transparent);
}
.cred-card h3 {
  margin: 0 0 10px;
  font-size: 15px;
}
.cred-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.cred-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
}
.cred-grid input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  color: #0f172a;
}
.cred-meta { margin: 4px 0; font-size: 13px; color: #334155; }
.cred-muted { color: #94a3b8; font-size: 12px; }
.cred-ok { color: #16a34a; font-size: 13px; font-weight: 600; margin-top: 8px; }
.cred-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}
.cred-secret {
  margin-top: 10px;
  padding: 10px;
  background: #fef3c7;
  border-radius: 8px;
  font-size: 13px;
}
.cred-secret code {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.portal-tasks-section {
  background: transparent;
}

.portal-tasks-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}

.portal-tasks-head h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
}

.portal-tasks-head p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.portal-tasks-progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 180px;
}

.portal-tasks-progress-bar {
  flex: 1;
  height: 8px;
  background: #e5e7eb;
  border-radius: 99px;
  overflow: hidden;
}

.portal-tasks-progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 99px;
  transition: width 0.35s ease;
}

.portal-tasks-progress-pct {
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
  min-width: 36px;
  text-align: right;
}

.all-done-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.all-done-icon { font-size: 28px; }
.all-done-sub { font-size: 13px; color: #374151; margin-top: 3px; }

.empty-tasks {
  font-size: 14px;
  color: #94a3b8;
  padding: 24px 0;
  text-align: center;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.task-card-v2 {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 18px 20px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.task-card-v2--done { opacity: 0.72; }

.task-card-v2-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.task-card-v2-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 4px;
}

.task-card-v2-desc {
  font-size: 13px;
  color: #64748b;
  line-height: 1.45;
  margin-bottom: 8px;
}

.task-card-v2-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.task-status-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border-radius: 999px;
}

.task-status-badge--pending {
  background: #f1f5f9;
  color: #64748b;
}

.task-status-badge--done {
  background: #dcfce7;
  color: #166534;
}

.task-required-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
}

.task-card-v2-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: 1.5px solid;
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.task-card-v2-action:hover {
  background: var(--primary-soft);
}

.task-card-v2-done {
  font-size: 13px;
  font-weight: 700;
  color: #16a34a;
  padding: 0 8px;
}

.intake-form-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}
.task-card-v2-action--confirm {
  background: #dcfce7;
  color: #16a34a !important;
  border-color: #16a34a !important;
  font-size: 12px;
}

.cta-wrap { padding-top: 18px; }
.btn-complete {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  padding: 12px 24px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transition: all 0.15s;
}
.btn-complete:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.btn-complete:disabled { opacity: 0.5; cursor: not-allowed; }
.cta-help { font-size: 12px; color: #94a3b8; margin-top: 6px; }

.portal-help-card {
  margin-top: 28px;
  display: flex;
  align-items: center;
  gap: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 18px 20px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.portal-help-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.portal-help-copy {
  flex: 1;
  min-width: 0;
}

.portal-help-copy strong {
  display: block;
  font-size: 15px;
  margin-bottom: 2px;
}

.portal-help-copy p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.portal-help-btn {
  border: 1.5px solid var(--primary);
  background: #fff;
  color: var(--primary);
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.portal-help-btn:hover {
  background: var(--primary-soft);
}

.portal-page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 32px 24px;
  font-size: 12px;
  color: #94a3b8;
}

.portal-page-footer-links {
  white-space: nowrap;
}

/* Pills (task panel) */
.task-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 20px; }
.pill-done { background: #dcfce7; color: #166534; }
.pill-sign { background: var(--primary-light); color: var(--primary); }
.pill-review { background: #f1f5f9; color: #475569; }

/* ─── Task panel (centered contract) ────────────────────────────────────────── */
.task-panel-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
  display: flex; align-items: center; justify-content: center; z-index: 70;
  padding: 20px 12px;
}

.task-panel {
  width: min(920px, 96vw); max-height: 92vh; background: white;
  display: flex; flex-direction: column; border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.28);
}

.task-panel-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 20px 22px 16px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
  background: var(--primary); color: white;
}
.task-panel-title { font-size: 17px; font-weight: 700; }
.task-panel-meta { margin-top: 6px; }
.panel-close { border: none; background: transparent; font-size: 24px; cursor: pointer; color: rgba(255,255,255,0.8); line-height: 1; }

.task-panel-body { flex: 1; overflow-y: auto; padding: 22px; }

.task-done-msg { display: flex; align-items: center; gap: 14px; font-size: 15px; color: #16a34a; font-weight: 600; padding: 20px 0; }
.task-done-check { font-size: 28px; }

.consent-block { display: flex; flex-direction: column; gap: 16px; max-width: 720px; margin: 0 auto 8px; }
.consent-block h3 { font-size: 16px; font-weight: 700; margin: 0; color: #0f172a; }
.consent-block p { font-size: 14px; color: #475569; line-height: 1.65; margin: 0; }
.consent-check-row { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; cursor: pointer; }
.consent-check-row input { margin-top: 3px; cursor: pointer; }

.review-block { display: flex; flex-direction: column; gap: 16px; }
.doc-paper {
  max-width: 800px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
  padding: 28px 32px 20px;
}
.doc-preview { font-size: 14px; color: #0f172a; line-height: 1.7; max-height: none; overflow: visible; border: 0; border-radius: 0; padding: 0; background: transparent; }
.cosign-block { margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e7eb; }
.cosign-block h4 { margin: 0 0 6px; font-size: 15px; }
.cosign-help { margin: 0 0 12px; font-size: 13px; color: #64748b; }
.cosign-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px dashed #e5e7eb; }
.cosign-img { height: 48px; max-width: 220px; object-fit: contain; }
.cosign-line { min-width: 180px; border-bottom: 1px solid #0f172a; text-align: center; font-size: 12px; color: #64748b; padding-bottom: 4px; }
.portal-doc-title-link {
  color: var(--primary);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.portal-doc-title-btn {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.portal-cover-letter span { display: block; margin-bottom: 10px; white-space: pre-wrap; line-height: 1.55; }
.doc-form-fields { display: flex; flex-direction: column; gap: 14px; margin-top: 4px; }
.doc-form-intro { margin-bottom: 4px; }
.doc-form-title { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
.doc-form-desc { font-size: 13px; color: #64748b; margin: 0 0 6px; line-height: 1.5; }
.doc-form-hint { font-size: 12px; color: #94a3b8; margin: 0; }
.doc-field { display: flex; flex-direction: column; gap: 6px; }
.doc-field-label { font-size: 13px; font-weight: 600; color: #334155; }
.doc-field-req { color: #dc2626; margin-left: 2px; }
.doc-field-input { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #0f172a; background: #fff; }
.doc-field-textarea { resize: vertical; min-height: 72px; }
.doc-field-check, .doc-field-radio { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; color: #334155; }
.doc-field-radio-group { display: flex; flex-direction: column; gap: 8px; }
.doc-placeholder { text-align: center; padding: 40px 20px; }
.doc-placeholder-icon { font-size: 40px; margin-bottom: 12px; }
.doc-placeholder-sub { font-size: 13px; color: #94a3b8; margin-top: 6px; }
.review-actions { padding-top: 8px; }

.sign-block { display: flex; flex-direction: column; gap: 14px; }
.sign-instructions { font-size: 13px; color: #475569; }
.sig-canvas {
  width: 100%; height: 160px; border: 2px solid #e2e8f0; border-radius: 10px;
  background: #fafafa; cursor: crosshair; touch-action: none; display: block;
}
.sign-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.panel-error { font-size: 13px; color: #dc2626; background: #fef2f2; border-radius: 8px; padding: 8px 12px; }

.btn-primary {
  background: var(--primary); color: white; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 600; padding: 10px 20px; cursor: pointer;
  transition: all 0.15s;
}
.btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary-sm {
  background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; font-weight: 600; padding: 8px 16px; cursor: pointer;
}
.btn-secondary-sm:hover { background: #e2e8f0; }
.btn-back { background: transparent; color: #64748b; border: none; font-size: 13px; cursor: pointer; padding: 8px 12px; }

.confirm-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 80;
}
.confirm-modal {
  background: white; border-radius: 14px; padding: 28px 28px 22px;
  max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.confirm-modal h3 { font-size: 18px; font-weight: 700; margin: 0 0 12px; }
.confirm-modal p { font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px; }
.confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }

.panel-slide-enter-active,
.panel-slide-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.panel-slide-enter-from,
.panel-slide-leave-to { opacity: 0; transform: translateY(12px); }

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1100px) {
  .portal-shell { flex-direction: column; }
  .portal-nav {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    padding: 12px 16px;
  }
  .portal-nav-brand {
    flex-direction: row;
    align-items: center;
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
  .portal-nav-links { display: flex; flex-direction: row; width: 100%; overflow-x: auto; gap: 4px; margin-top: 10px; }
  .portal-nav-link { flex-shrink: 0; white-space: nowrap; padding: 9px 10px; font-size: 12px; }
  .portal-nav-footer { display: none; }
  .portal-content { padding: 20px 16px; }
  .portal-help-card { flex-direction: column; align-items: flex-start; }
  .task-card-v2 {
    grid-template-columns: auto 1fr;
  }
  .task-card-v2-action,
  .task-card-v2-done {
    grid-column: 1 / -1;
    justify-self: start;
  }
  .task-panel { width: min(920px, 100vw); max-height: 100vh; border-radius: 0; }
}
</style>
