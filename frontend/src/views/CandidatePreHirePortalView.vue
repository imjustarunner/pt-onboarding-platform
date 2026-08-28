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
      <p>Your hire portal is complete. Sign in with your work email and password (or Google SSO if enabled for your account).</p>
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
              :class="{ 'portal-nav-link--active': activeSection === 'resources' }"
              href="#"
              @click.prevent="openResources"
            >
              <span class="portal-nav-icon">📚</span>
              Resources
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
                <template v-if="portalPhase === 'account_setup'">
                  Set up your work email and password to continue joining {{ agency?.name || 'the team' }}.
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
              <div v-if="progress.percent != null" class="portal-phase-pill">
                {{ phaseLabel }} · {{ progress.percent || progressPct }}% complete
              </div>
            </div>

            <!-- Group password account setup -->
            <section
              v-if="activeSection === 'dashboard' && portalPhase === 'account_setup'"
              class="portal-account-setup"
              aria-label="Choose work email"
            >
              <div class="portal-tasks-head">
                <div>
                  <h2>Choose your work email</h2>
                  <p>
                    Pick an available address at @{{ accountDomain || 'your organization' }}.
                    Mail is delivered to a Google Group; you'll sign in to this app with the password you set (SSO stays on for others).
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
                    <input v-model="accountForm.localPart" type="text" placeholder="firstname.lastname" @blur="checkTypedEmail" />
                    <span class="portal-email-domain">@{{ accountDomain }}</span>
                  </div>
                </label>
                <p v-if="emailCheckMessage" :class="emailAvailable ? 'cred-ok' : 'cred-warn'">{{ emailCheckMessage }}</p>
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
                  :disabled="provisioningAccount || !canProvisionAccount"
                  @click="provisionAccount"
                >
                  {{ provisioningAccount ? 'Creating…' : 'Create my account' }}
                </button>
                <p v-if="accountError" class="cred-warn">{{ accountError }}</p>
              </div>
            </section>

            <section v-if="activeSection === 'dashboard' && candidate.workEmail" class="portal-link-card" aria-label="Your work email">
              <div class="portal-link-card-head">
                <strong>Your work email</strong>
              </div>
              <code class="portal-link-url">{{ candidate.workEmail }}</code>
              <p class="portal-link-help">Use this address and your password when you eventually sign in outside this portal.</p>
            </section>

            <section
              v-if="activeSection === 'dashboard' || activeSection === 'tasks'"
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
                <div v-if="submissions?.hiringProfile" class="cred-card">
                  <h3>Application</h3>
                  <p v-if="submissions.hiringProfile.appliedRole"><strong>Role:</strong> {{ submissions.hiringProfile.appliedRole }}</p>
                  <p v-if="submissions.hiringProfile.stage"><strong>Stage:</strong> {{ submissions.hiringProfile.stage }}</p>
                  <p v-if="submissions.hiringProfile.coverLetter" class="portal-cover-letter">{{ submissions.hiringProfile.coverLetter }}</p>
                </div>
                <div v-if="submissions?.uploadedMaterials?.length" class="cred-card">
                  <h3>Uploaded materials</h3>
                  <ul class="portal-simple-list">
                    <li v-for="d in submissions.uploadedMaterials" :key="d.id">{{ d.title }} <span class="cred-muted">{{ d.category || '' }}</span></li>
                  </ul>
                </div>
                <div v-if="submissions?.completedDocuments?.length" class="cred-card">
                  <h3>Completed documents</h3>
                  <ul class="portal-simple-list">
                    <li v-for="d in submissions.completedDocuments" :key="d.id">{{ d.title }}</li>
                  </ul>
                </div>
                <div v-if="!submissions?.hiringProfile && !submissions?.uploadedMaterials?.length && !submissions?.completedDocuments?.length" class="empty-tasks">
                  Nothing here yet — complete tasks and your application details will appear.
                </div>
              </template>
            </section>

            <!-- Resources / handbook -->
            <section v-if="activeSection === 'resources'" class="portal-resources" aria-label="Resources">
              <div class="portal-tasks-head">
                <div>
                  <h2>Resources</h2>
                  <p>Limited agency information available during hire and onboarding.</p>
                </div>
              </div>
              <div v-if="handbookLoading" class="empty-tasks">Loading handbook…</div>
              <div v-else-if="!handbook?.available" class="empty-tasks">
                Workplace handbook is not published yet. Check back soon.
              </div>
              <div v-else class="cred-card handbook-card">
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
            </section>

            <!-- Onboarding credential packet (accounts & access) -->
            <section
              v-if="(activeSection === 'dashboard' || activeSection === 'tasks') && showCredentialPacket && portalPhase !== 'account_setup'"
              class="portal-credential-packet"
              aria-label="Accounts and access"
            >
              <div class="portal-tasks-head">
                <div>
                  <h2>Accounts &amp; Access</h2>
                  <p>Confirm your identity and acknowledge system logins. Temporary passwords are shown once.</p>
                </div>
              </div>

              <div class="cred-card">
                <h3>Identity &amp; contact</h3>
                <div class="cred-grid">
                  <label>
                    <span>Legal first name</span>
                    <input v-model="identityForm.firstName" type="text" />
                  </label>
                  <label>
                    <span>Legal last name</span>
                    <input v-model="identityForm.lastName" type="text" />
                  </label>
                  <label>
                    <span>Personal phone</span>
                    <input v-model="identityForm.phone" type="tel" />
                  </label>
                </div>
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="confirmingIdentity"
                  @click="confirmIdentity"
                >
                  {{ credentialPacket?.identity?.confirmed ? 'Update &amp; confirm' : 'Confirm identity' }}
                </button>
                <p v-if="credentialPacket?.identity?.confirmed" class="cred-ok">Identity confirmed</p>
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
              v-if="(activeSection === 'dashboard' || activeSection === 'tasks') && portalPhase !== 'account_setup'"
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
                    Your documents are under review. Save your personal link above so you can return anytime
                    for verification or to add another copy of a task — no login required.
                  </div>
                </div>
              </div>

              <div v-if="!allDone && tasks.length === 0" class="empty-tasks">
                No items have been assigned yet. Your hiring team will send them shortly.
              </div>

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
                  <template v-if="task.taskType === 'intake_form' && task.status !== 'completed'">
                    <div class="intake-form-actions">
                      <button
                        type="button"
                        class="task-card-v2-action"
                        :style="{ borderColor: taskAccentColor(idx), color: taskAccentColor(idx) }"
                        @click="openIntakeForm(task)"
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
                        Open Form <span aria-hidden="true">↗</span>
                      </button>
                      <button
                        v-if="moduleTaskOpened === task.id"
                        type="button"
                        class="task-card-v2-action task-card-v2-action--confirm"
                        :disabled="moduleTaskSubmitting"
                        @click="markModuleTaskDone(task)"
                      >
                        {{ moduleTaskSubmitting ? 'Saving…' : "I've completed this form ✓" }}
                      </button>
                    </div>
                  </template>
                  <!-- Standard document tasks -->
                  <template v-else-if="task.status !== 'completed'">
                    <button
                      type="button"
                      class="task-card-v2-action"
                      :style="{ borderColor: taskAccentColor(idx), color: taskAccentColor(idx) }"
                      @click="selectTask(task)"
                    >
                      {{ taskActionLabel(task) }}
                      <span aria-hidden="true">›</span>
                    </button>
                  </template>
                  <div v-else class="task-card-v2-done">Done</div>
                </article>
              </div>

              <div v-if="tasks.length > 0 && !allDone" class="cta-wrap">
                <button class="btn-complete" :disabled="submitting" @click="confirmSubmit">
                  {{ submitting ? 'Submitting…' : 'I\'ve completed everything — submit for review' }}
                </button>
                <div class="cta-help">
                  You can also submit before all items are done if you need assistance.
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
              <!-- Already completed -->
              <div v-if="activeTask.status === 'completed'" class="task-done-msg">
                <div class="task-done-check">✓</div>
                <div>This item is complete.</div>
              </div>

              <!-- HTML document content -->
              <template v-else>
                <!-- Consent step -->
                <div v-if="panelStep === 'consent'" class="consent-block">
                  <h3>Electronic Signature Disclosure</h3>
                  <p>
                    By checking the box below, you consent to sign this document electronically.
                    Your electronic signature is legally binding and carries the same force as a handwritten signature.
                  </p>
                  <label class="consent-check-row">
                    <input type="checkbox" v-model="consentChecked" />
                    <span>I consent to sign this document electronically.</span>
                  </label>
                  <button class="btn-primary" :disabled="!consentChecked || panelLoading" @click="submitConsent">
                    {{ panelLoading ? '…' : 'Continue' }}
                  </button>
                </div>

                <!-- Document / review step -->
                <div v-else-if="panelStep === 'review'" class="review-block">
                  <div v-if="activeTaskDetail?.document?.htmlContent" class="doc-preview" v-html="sanitizedHtml"></div>
                  <div v-if="fillableFields.length" class="doc-form-fields">
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

                  <div class="review-actions">
                    <div v-if="activeTask.actionType === 'review'">
                      <!-- Review only — just acknowledge -->
                      <button class="btn-primary" :disabled="panelLoading" @click="submitAcknowledge">
                        {{ panelLoading ? 'Saving…' : 'I have read and acknowledge this document' }}
                      </button>
                    </div>
                    <div v-else>
                      <button class="btn-primary" @click="goToSignStep">
                        Proceed to sign →
                      </button>
                      <div v-if="fieldValidationError" class="panel-error">{{ fieldValidationError }}</div>
                    </div>
                  </div>
                </div>

                <!-- Signature step -->
                <div v-else-if="panelStep === 'sign'" class="sign-block">
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
              </template>
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
            You can still submit, but your team may reach out to complete remaining items.
          </p>
          <p v-else>All items are complete. Your documents will be submitted for review.</p>
          <div class="confirm-actions">
            <button class="btn-secondary-sm" @click="showSubmitConfirm = false">Go back</button>
            <button class="btn-primary" :disabled="submitting" @click="submitPortal(true)">
              {{ submitting ? 'Submitting…' : 'Submit' }}
            </button>
          </div>
        </div>
      </div>

    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DOMPurify from 'dompurify';
import axios from 'axios';
import PreHirePortalChat from '../components/prehire/PreHirePortalChat.vue';
import { buildFormUrl } from '../utils/publicIntakeUrl.js';
import { learnerFillableFields } from '../utils/documentFieldLayout.js';

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
const tasks = computed(() => portalData.value?.tasks || []);
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
const accountError = ref('');
const submissions = ref(null);
const submissionsLoading = ref(false);
const handbook = ref(null);
const handbookLoading = ref(false);

const canProvisionAccount = computed(() => {
  const email = accountForm.value.workEmail || (accountForm.value.localPart && accountDomain.value
    ? `${accountForm.value.localPart}@${accountDomain.value}`
    : '');
  return (
    email
    && accountForm.value.password?.length >= 8
    && accountForm.value.password === accountForm.value.confirmPassword
  );
});

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
      workEmail,
      password: accountForm.value.password,
      confirmPassword: accountForm.value.confirmPassword
    });
    await reloadPortal();
    activeSection.value = 'tasks';
  } catch (e) {
    accountError.value = e?.response?.data?.error?.message || 'Could not create account';
  } finally {
    provisioningAccount.value = false;
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

const openResources = async () => {
  activeSection.value = 'resources';
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

// Use required-only progress when any tasks are flagged required; otherwise all tasks
const totalCount = computed(() => progress.value.requiredTotal || progress.value.total);
const completedCount = computed(() => progress.value.requiredCompleted ?? progress.value.completed);
const allDone = computed(() => progress.value.allDone);
const progressPct = computed(() => totalCount.value > 0 ? Math.round((completedCount.value / totalCount.value) * 100) : 0);

const isPrehire = computed(() => ['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW'].includes(candidate.value.status));
const isOnboardingPortal = computed(() => candidate.value.status === 'ONBOARDING');
const phaseLabel = computed(() => {
  if (portalPhase.value === 'account_setup') return 'Account setup';
  if (portalPhase.value === 'review') return 'Under review';
  if (portalPhase.value === 'onboarding' || isOnboardingPortal.value) return 'Onboarding';
  return 'Pre-Hire';
});
const sectionLabel = computed(() => isOnboardingPortal.value ? 'ONBOARDING CHECKLIST' : 'PRE-HIRE ITEMS');
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
    ...(a.fontFamily ? { fontFamily: a.fontFamily } : {})
  };
});

const sidebarStyle = computed(() => {
  const a = agency.value || {};
  const bg = a.sidebarColor || '#0b192e';
  return { background: bg };
});

// ─── Task panel ───────────────────────────────────────────────────────────────
const activeTaskId = ref(null);
const activeTask = computed(() => tasks.value.find(t => t.id === activeTaskId.value) || null);
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
  if (task.status === 'completed') return;
  activeTaskId.value = task.id;
  panelStep.value = 'consent';
  panelError.value = '';
  consentChecked.value = false;
  activeTaskDetail.value = null;
  fieldValues.value = {};
  fieldValidationError.value = '';
  try {
    const res = await portalApi.get(`/prehire-portal/${token.value}/tasks/${task.id}`);
    activeTaskDetail.value = res.data;
    initFieldValues(activeTaskDetail.value);
    if (activeTaskDetail.value?.auditTrail?.portalConsent?.given) {
      panelStep.value = 'review';
    }
  } catch { /* show panel anyway */ }
};

const closePanel = () => {
  activeTaskId.value = null;
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

const submitPortal = async (force = false) => {
  submitting.value = true;
  try {
    await portalApi.post(`/prehire-portal/${token.value}/complete`, { force });
    showSubmitConfirm.value = false;
    // Reload — will hit STATUS_ADVANCED state
    await loadPortal();
  } catch (e) {
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
}

.portal-topbar {
  height: 64px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
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
  padding: 28px 32px 20px;
  max-width: 920px;
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
  background: color-mix(in srgb, var(--primary) 12%, #fff);
  color: var(--primary);
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
  border: 1px solid rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.06);
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
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 12px;
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

/* ─── Task panel (slide-in) ─────────────────────────────────────────────────── */
.task-panel-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: stretch; justify-content: flex-end; z-index: 70;
}

.task-panel {
  width: 560px; max-width: 95vw; background: white;
  display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,0.15);
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

.consent-block { display: flex; flex-direction: column; gap: 16px; }
.consent-block h3 { font-size: 16px; font-weight: 700; margin: 0; color: #0f172a; }
.consent-block p { font-size: 14px; color: #475569; line-height: 1.65; margin: 0; }
.consent-check-row { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; cursor: pointer; }
.consent-check-row input { margin-top: 3px; cursor: pointer; }

.review-block { display: flex; flex-direction: column; gap: 16px; }
.doc-preview { font-size: 14px; color: #0f172a; line-height: 1.7; max-height: 55vh; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fafafa; }
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
.panel-slide-leave-active { transition: transform 0.25s ease; }
.panel-slide-enter-from,
.panel-slide-leave-to { transform: translateX(100%); }

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
  .portal-nav-links,
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
  .task-panel { width: 100vw; }
}
</style>
