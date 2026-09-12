<template>
  <FamilyPortalShell :brand-name="currentAgencyName || tenantAgencyName" :brand-subtitle="dualBranding ? tenantAgencyName : ''" :logo-url="programLogoUrl || tenantAgencyLogoUrl || brandingStore.displayLogoUrl" :primary-color="brandingStore.primaryColor" :title="portalTitle" :subtitle="portalSubtitle" :user-name="userName" :navigation="portalNavigation" :active="activePanel" @navigate="navigatePortal">
    <PlatformPreviewBanner
      v-if="isSuperadminPreview"
      :title="`Previewing ${currentAgencyName || 'tenant'} guardian portal`"
      subtitle="This platform preview keeps guardian-linked private data hidden while preserving the tenant portal shell."
    />
    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading your dashboard…</div>

    <div v-else class="layout guardian-layout">
      <section class="portal-client-summary">
        <div class="portal-client-identity"><span class="client-portrait">{{ selectedChild ? initialsFromLabel(childDisplayName(selectedChild)) : '—' }}</span><div><h2>{{ selectedChild ? childDisplayName(selectedChild) : 'Your family' }}</h2><p>{{ selectedChild?.organization_name || currentAgencyName }}</p><span v-if="selectedChild" class="client-status">{{ formatClientStatus(selectedChild.status) }} · {{ selectedChild.relationship_title || 'Linked client' }}</span></div></div>
        <label class="portal-client-picker">Viewing client<select v-model="selectedChildId"><option :value="null" disabled>Select a client</option><option v-for="child in children" :key="child.client_id" :value="child.client_id">{{ childDisplayName(child) }}</option></select></label>
        <div class="portal-program-picker"><GuardianProgramSelector :programs="programs" /><button class="btn btn-secondary btn-sm" @click="refreshAll" :disabled="loading">Refresh</button></div>
      </section>

      <div v-if="programs.length === 0 && children.length === 0 && !['account','messages','payment_methods','billing'].includes(activePanel)" class="empty-state">
        <p>No children or programs are linked to this guardian account yet.</p>
        <p class="hint">Ask your organization to add you as a guardian on the child’s record.</p>
      </div>

      <template v-else>
        <div class="detail guardian-detail">
          <div class="panel guardian-panel">
            <template v-if="activePanel === 'tutoring'">
              <GuardianTutoringDashboard embedded
                :key="`${currentAgencyId}-${selectedChildId}`"
                v-if="selectedChildId"
                :client-id="selectedChildId"
                :student-name="selectedChild ? childDisplayName(selectedChild) : 'your student'"
                :guardian-first-name="String(authStore.user?.first_name || '').trim()"
                :organization-slug="guardianPathSlug"
              />
              <p v-else class="hint">Select a child to view their tutoring dashboard.</p>
            </template>
            <template v-else-if="activePanel === 'overview'">
              <template v-if="selectedInlineEvent"><button class="btn btn-secondary" @click="selectedInlineEvent = null">Back to dashboard</button><GuardianSkillBuildersEventView :event-id-prop="selectedInlineEvent.eventId" :program-event-mode="selectedInlineEvent.programMode" :inline="true" :hide-actions="true" /></template>
              <FamilyPortalHome v-else :agency-id="currentAgencyId" :client-id="selectedChildId" :show-plan="portalPlanAllowed" :learning="standardsLearningVisible" :preview="isSuperadminPreview" :events="programOverviewEvents" :programs="programs" @navigate="navigatePortal" @event="openInlineEventFromWorkspace" @program="openProgramWorkspace" />
            </template>
            <template v-else-if="activePanel === 'plan'">
              <GuardianPlanProgressPanel v-if="portalPlanAllowed" :client-id="selectedChildId" :agency-id="selectedChildAgencyId" :client-type="selectedChildClientType" />
              <p v-else class="hint">Plan access is not available for this relationship. Contact your care team to review permissions.</p>
            </template>
            <template v-else-if="activePanel === 'registrations'">
              <div class="panel-head">
                <div class="panel-title">Upcoming registrations</div>
                <div class="panel-subtitle">Internal registration links available to guardian accounts.</div>
              </div>
              <div class="reg-catalog-head">
                <div>
                  <div class="reg-catalog-title">Open events and enrollments</div>
                  <p class="reg-catalog-sub muted">
                    Tap <strong>Register</strong> to continue. If an event has a linked digital form, you will be routed directly to it.
                  </p>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="regCatalogLoading" @click="fetchRegistrationCatalog">
                  {{ regCatalogLoading ? 'Loading…' : 'Refresh' }}
                </button>
              </div>
              <div v-if="regCatalogError" class="error" style="font-size: 13px;">{{ regCatalogError }}</div>
              <ul v-else-if="regCatalogItems.length" class="reg-catalog-list">
                <li v-for="item in regCatalogItems" :key="`panel-${item.kind}-${item.id}`" class="reg-catalog-row">
                  <div class="reg-catalog-meta">
                    <div class="reg-catalog-item-title">{{ item.title }}</div>
                    <div class="muted small">{{ registrationKindLabel(item.kind) }} · {{ formatRegistrationWhen(item) }}</div>
                    <div v-if="item.medicaidEligible || item.cashEligible" class="muted small">
                      {{ registrationPayerLine(item) }}
                    </div>
                    <div v-if="item.linkedIntakeTitle && item.kind === 'company_event'" class="muted small">
                      Form: {{ item.linkedIntakeTitle }}
                    </div>
                  </div>
                  <div class="reg-catalog-actions">
                    <button type="button" class="btn btn-primary btn-sm" @click="openRegistrationEnroll(item)">Register</button>
                  </div>
                </li>
              </ul>
              <p v-else-if="!regCatalogLoading" class="hint" style="margin: 0;">Nothing is open for registration right now.</p>
            </template>
            <template v-else-if="activePanel === 'documents'">
              <div class="panel-head">
                <div class="panel-title">Documents</div>
                <div class="panel-subtitle">Documents are scoped to your selected program.</div>
              </div>
              <div v-if="isSuperadminPreview" class="guardian-preview-surface">
                <p class="hint" style="margin: 0;">
                  In the live guardian portal, this panel lists program-scoped documents and signatures. Platform preview does
                  not load guardian document queues.
                </p>
              </div>
              <DocumentsTab v-else />
            </template>

            <template v-else-if="activePanel === 'child'">
              <div class="panel-head">
                <div class="panel-title">Child</div>
                <div class="panel-subtitle">Details and daily notes for the selected child.</div>
              </div>
              <div v-if="!selectedChild" class="guardian-preview-surface">
                <p class="hint" style="margin: 0;">
                  {{ isSuperadminPreview
                    ? 'Platform preview does not include linked children. In production, pick a dependent to open notes, intake PDFs, and learning progress.'
                    : 'Select a child from the overview above to open this panel.' }}
                </p>
              </div>
              <div v-else-if="selectedChild" class="child-panel-content">
                <div v-if="selectedChild.guardian_portal_locked" class="locked-banner">
                  This client is 18 or older. Guardian-managed waivers, intake documents, and related guardian actions are
                  not available for privacy and compliance.
                </div>
                <div class="child-details">
                  <div v-if="selectedChildFullName" class="row">
                    <div class="label">Name</div>
                    <div class="value">{{ selectedChildFullName }}</div>
                  </div>
                  <div class="row">
                    <div class="label">Initials</div>
                    <div class="value">{{ selectedChild.initials }}</div>
                  </div>
                  <div class="row">
                    <div class="label">Program</div>
                    <div class="value">{{ selectedChild.organization_name }}</div>
                  </div>
                  <div class="row">
                    <div class="label">Relationship</div>
                    <div class="value">{{ selectedChild.relationship_title || 'Guardian' }}</div>
                  </div>
                  <div class="row">
                    <div class="label">Status</div>
                    <div class="value">{{ formatClientStatus(selectedChild.status) }}</div>
                  </div>
                  <div class="row">
                    <div class="label">Docs</div>
                    <div class="value">{{ formatDocStatus(selectedChild.document_status) }}</div>
                  </div>
                </div>

                <div v-if="standardsLearningVisible" class="learning-progress-block">
                  <div class="learning-progress-head">
                    <h4 style="margin: 0;">Learning progress</h4>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="learningProgressLoading || !selectedChildId"
                      @click="loadSelectedChildLearningProgress"
                    >
                      {{ learningProgressLoading ? 'Loading…' : 'Refresh' }}
                    </button>
                  </div>
                  <p class="hint" style="margin: 6px 0 10px;">
                    Standards-aligned goals and trends for {{ childDisplayName(selectedChild) }}.
                  </p>
                  <div v-if="learningProgressError" class="error" style="font-size: 13px;">{{ learningProgressError }}</div>
                  <div v-else-if="learningProgressLoading" class="hint">Loading learning progress…</div>
                  <template v-else>
                    <div class="learning-progress-grid">
                      <div class="learning-progress-card">
                        <div class="learning-progress-card-title">Domain trends</div>
                        <ul v-if="learningDomainRows.length" class="learning-progress-list">
                          <li v-for="row in learningDomainRows" :key="`d-${row.domain_id}`">
                            <strong>{{ row.domain_title || row.domain_code || `Domain ${row.domain_id}` }}</strong>
                            <span class="muted small">
                              · {{ Number(row.evidence_count || 0) }} data points
                              <template v-if="row.avg_score != null"> · avg {{ formatLearningScore(row.avg_score) }}</template>
                            </span>
                          </li>
                        </ul>
                        <p v-else class="hint" style="margin: 0;">No domain data yet.</p>
                      </div>
                      <div class="learning-progress-card">
                        <div class="learning-progress-card-title">Active goals</div>
                        <ul v-if="learningGoalRows.length" class="learning-progress-list">
                          <li v-for="g in learningGoalRows.slice(0, 5)" :key="`g-${g.id}`">
                            <strong>{{ g.skill_title || `Skill ${g.skill_id}` }}</strong>
                            <span class="muted small"> · {{ g.status }} · target {{ formatLearningDate(g.target_date) }}</span>
                          </li>
                        </ul>
                        <p v-else class="hint" style="margin: 0;">No goals set yet.</p>
                      </div>
                    </div>
                    <div class="learning-progress-card" style="margin-top: 10px;">
                      <div class="learning-progress-card-title">Recommended next skills</div>
                      <ul v-if="learningRecommendationRows.length" class="learning-progress-list">
                        <li v-for="r in learningRecommendationRows.slice(0, 4)" :key="`r-${r.domain_id}-${r.skill_id}`">
                          <strong>{{ r.skill_title || `Skill ${r.skill_id}` }}</strong>
                          <span class="muted small">
                            · {{ r.domain_title || `Domain ${r.domain_id}` }}
                            · {{ r.recommended_difficulty_shift }}
                          </span>
                        </li>
                      </ul>
                      <p v-else class="hint" style="margin: 0;">No recommendations yet.</p>
                    </div>

                    <!-- Book sessions card -->
                    <div v-if="tutoringProvider" class="learning-progress-card book-sessions-card" style="margin-top: 10px;">
                      <div class="learning-progress-card-title">Book tutoring sessions</div>
                      <div class="book-sessions-body">
                        <div>
                          <div class="book-sessions-provider">{{ tutoringProvider.providerName }}</div>
                          <div class="book-sessions-meta muted small">
                            <span v-if="tutoringProvider.sessionRateCents">
                              ${{ Math.round(tutoringProvider.sessionRateCents / 100) }} / session ·
                            </span>
                            <span v-if="tutoringProvider.minSessionPackage > 1">
                              Min package: {{ tutoringProvider.minSessionPackage }} sessions ·
                            </span>
                            <span>{{ tutoringProvider.paymentPolicy === 'PREPAY' ? 'Prepay required' : 'Pay after session' }}</span>
                          </div>
                        </div>
                        <button class="btn btn-primary btn-sm" @click="bookingDrawerOpen = true">
                          Request session
                        </button>
                      </div>
                    </div>

                    <!-- Upcoming tutoring sessions -->
                    <div class="learning-progress-card upcoming-sessions-card" style="margin-top: 10px;">
                      <div class="learning-progress-card-title">
                        Upcoming tutoring sessions
                        <span v-if="upcomingTutoringSessions.length" class="upcoming-count-badge">{{ upcomingTutoringSessions.length }}</span>
                      </div>
                      <ul v-if="upcomingTutoringSessions.length" class="learning-progress-list upcoming-list">
                        <li
                          v-for="session in upcomingTutoringSessions"
                          :key="`up-${session.id}`"
                          class="upcoming-session-row"
                        >
                          <div class="upcoming-session-info">
                            <strong>{{ session.title || 'Tutoring Session' }}</strong>
                            <span v-if="session.provider_name" class="muted small"> · {{ session.provider_name }}</span>
                          </div>
                          <div class="upcoming-session-meta muted small">
                            {{ fmtUpcomingDate(session.starts_at) }}
                            <span v-if="session.delivery_context === 'in_person'"> · In-person</span>
                            <span v-else> · Virtual</span>
                          </div>
                          <button
                            type="button"
                            class="btn btn-primary btn-sm upcoming-launch-btn"
                            @click="router.push(session.session_url)"
                          >
                            Join session
                          </button>
                        </li>
                      </ul>
                      <p v-else class="hint" style="margin: 0;">
                        No upcoming sessions scheduled. Once a tutoring session is confirmed, it will appear here with a launch button.
                      </p>
                    </div>

                    <div class="learning-progress-card" style="margin-top: 10px;">
                      <div class="learning-progress-card-title">Recent tutoring sessions</div>
                      <p class="hint" style="margin: 0 0 10px;">
                        AI-generated summaries, standards mastered (CAS + CCSS / US DoE), branded homework, completed in-person tutoring materials, and any shared tutoring whiteboards.
                      </p>
                      <ul v-if="tutoringSummaries.length" class="learning-progress-list">
                        <li
                          v-for="summary in tutoringSummaries"
                          :key="`ts-${summary.sessionId}`"
                          style="display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);"
                        >
                          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                            <strong>{{ summary.title }}</strong>
                            <span class="muted small">{{ formatLearningDate(summary.date) }}</span>
                          </div>
                          <div class="muted small">{{ summary.summary }}</div>
                          <div
                            v-if="summary.standardsMastered.length || summary.standardsNeedingReview.length"
                            style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;"
                          >
                            <span
                              v-for="(s, i) in summary.standardsMastered.slice(0, 3)"
                              :key="`m-${summary.sessionId}-${i}`"
                              class="tutoring-chip tutoring-chip-success"
                            >
                              Mastered: {{ formatStandardChip(s) }}
                            </span>
                            <span
                              v-for="(s, i) in summary.standardsNeedingReview.slice(0, 3)"
                              :key="`r-${summary.sessionId}-${i}`"
                              class="tutoring-chip tutoring-chip-warn"
                            >
                              Review: {{ formatStandardChip(s) }}
                            </span>
                          </div>
                          <div style="display: flex; gap: 8px; margin-top: 6px;">
                            <button type="button" class="btn btn-secondary btn-sm" @click="openTutoringSession(summary)">
                              Open session
                            </button>
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              :disabled="!summary.homeworkUrl"
                              @click="downloadBrandedHomework(summary)"
                            >
                              {{ summary.homeworkUrl ? 'Download homework' : 'Homework pending' }}
                            </button>
                          </div>
                        </li>
                      </ul>
                      <p v-else class="hint" style="margin: 0;">
                        No tutoring sessions yet. Once a session ends, AI summaries and branded homework will appear here.
                      </p>
                    </div>

                    <div class="learning-progress-card" style="margin-top: 10px;">
                      <div class="learning-progress-card-title">Published progress reports</div>
                      <ul v-if="losPublishedReports.length" class="learning-progress-list">
                        <li v-for="r in losPublishedReports" :key="`pr-${r.id}`" style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
                          <div style="display: flex; justify-content: space-between; gap: 8px;">
                            <strong>{{ r.title }}</strong>
                            <span class="muted small">{{ formatLearningDate(r.publishedAt) }}</span>
                          </div>
                          <div class="muted small">{{ r.subjectLabel }} · {{ r.reportType }}</div>
                          <p v-if="r.previewText" class="hint" style="margin: 6px 0 0;">{{ r.previewText }}</p>
                        </li>
                      </ul>
                      <p v-else class="hint" style="margin: 0;">No published tutoring progress reports yet.</p>
                    </div>

                    <div class="learning-progress-card" style="margin-top: 10px;">
                      <div class="learning-progress-card-title">Practice / homework</div>
                      <ul v-if="losPractice.length" class="learning-progress-list">
                        <li v-for="a in losPractice" :key="`pa-${a.id}`" style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
                          <div style="display: flex; justify-content: space-between; gap: 8px;">
                            <strong>{{ a.title }}</strong>
                            <span class="muted small">{{ a.status }}</span>
                          </div>
                          <div class="muted small">{{ a.subjectLabel }}</div>
                          <p v-if="a.instructions" class="hint" style="margin: 6px 0 0;">{{ a.instructions }}</p>
                          <ol v-if="a.items?.length" style="margin: 6px 0 0; padding-left: 1.2rem;">
                            <li v-for="(item, idx) in a.items.slice(0, 5)" :key="idx">{{ item.prompt || item }}</li>
                          </ol>
                        </li>
                      </ul>
                      <p v-else class="hint" style="margin: 0;">No practice assignments yet.</p>
                    </div>

                    <div v-if="losParentUpdates.length" class="learning-progress-card" style="margin-top: 10px;">
                      <div class="learning-progress-card-title">After-session updates</div>
                      <ul class="learning-progress-list">
                        <li v-for="u in losParentUpdates" :key="`pu-${u.id}`" style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
                          <div style="display: flex; justify-content: space-between; gap: 8px;">
                            <strong>{{ u.subjectLabel }}</strong>
                            <span class="muted small">{{ formatLearningDate(u.at) }}</span>
                          </div>
                          <p class="hint" style="margin: 6px 0 0; white-space: pre-wrap;">{{ u.text }}</p>
                        </li>
                      </ul>
                    </div>
                  </template>
                </div>

                <GuardianPlanProgressPanel
                  :visible="planProgressVisible && portalPlanAllowed"
                  :client-id="selectedChildId"
                  :agency-id="selectedChildAgencyId"
                  :client-type="selectedChildClientType"
                />

                <div v-if="!selectedChild.guardian_portal_locked" class="intake-docs-block">
                  <h4 style="margin: 20px 0 8px;">Intake documents</h4>
                  <p class="hint" style="margin-bottom: 10px;">
                    PDFs you signed on a digital intake form for this child (when the submission is tied to your guardian
                    account).
                  </p>
                  <div v-if="intakeDocsLoading" class="hint">Loading…</div>
                  <ul v-else-if="intakeSignedDocs.length" class="intake-docs-list">
                    <li v-for="d in intakeSignedDocs" :key="d.id" class="intake-docs-row">
                      <div>
                        <div class="intake-doc-title">{{ d.document_template_name || 'Document' }}</div>
                        <div class="muted small">{{ d.intake_link_title || 'Intake' }} · {{ formatIntakeSignedAt(d.signed_at) }}</div>
                      </div>
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="intakeDocOpeningId === d.id"
                        @click="openIntakeSignedDoc(d)"
                      >
                        {{ intakeDocOpeningId === d.id ? 'Opening…' : 'View' }}
                      </button>
                    </li>
                  </ul>
                  <p v-else class="hint">No intake-signed documents found for this child yet.</p>
                </div>

                <div class="guardian-checkin-hint">
                  <p class="hint" style="margin: 0; padding: 8px 10px; background: var(--bg-muted, #f0f4f8); border-radius: 6px;">
                    <strong>Program check-in:</strong> Use the kiosk at the front desk when you drop off or pick up.
                  </p>
                </div>
                <div class="guardian-daily-notes">
                  <h4 style="margin: 16px 0 8px;">Daily Notes</h4>
                  <p class="hint" style="margin-bottom: 10px;">Staff notes for {{ selectedChild.initials }}. Use initials only.</p>
                  <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 10px;">
                    <label>Date</label>
                    <input v-model="guardianNoteDate" type="date" class="input" style="max-width: 160px;" @change="loadGuardianDailyNotes" />
                  </div>
                  <div v-if="guardianNotesLoading" class="hint">Loading…</div>
                  <div v-else-if="guardianDailyNotes.length > 0" class="guardian-notes-list">
                    <div v-for="n in guardianDailyNotes" :key="n.id" class="guardian-note-item">
                      <span class="guardian-note-initials">[{{ n.author_initials || '?' }}]</span>
                      <span class="guardian-note-message">{{ n.message }}</span>
                      <span class="guardian-note-time">{{ formatNoteTime(n.created_at) }}</span>
                    </div>
                  </div>
                  <div v-else-if="guardianNoteDate" class="hint">No notes for this date.</div>
                </div>
              </div>
              <div v-else class="hint">Select a child from the overview above.</div>
            </template>

            <template v-else-if="activePanel === 'messages'">
              <GuardianMessagesPanel v-if="!isSuperadminPreview" />
              <div v-else class="hint">Guardian messaging is hidden in platform preview.</div>
            </template>

            <template v-else-if="activePanel === 'account'">
              <div class="panel-head">
                <div class="panel-title">Your Account</div>
                <div class="panel-subtitle">Basic account details.</div>
              </div>
              <div class="child-details">
                <div class="row">
                  <div class="label">Name</div>
                  <div class="value">{{ userName }}</div>
                </div>
                <div class="row">
                  <div class="label">Email</div>
                  <div class="value">{{ userEmail }}</div>
                </div>
                <div class="row">
                  <div class="label">Password</div>
                  <div class="value">
                    <router-link class="link" :to="changePasswordTo">Change password</router-link>
                    <button class="btn btn-secondary" type="button" @click="authStore.logout()">Sign out</button>
                  </div>
                </div>
              </div>
              <ClinicalDisclosurePanel v-if="!isSuperadminPreview" :agency-id="currentAgencyId" />
            </template>

            <template v-else-if="activePanel === 'billing'">
              <div v-if="isSuperadminPreview" class="guardian-preview-surface">
                <p class="hint" style="margin: 0;">
                  Guardians with a selected child see session charges, balances, and learning billing here when the program has
                  billing enabled. This preview does not load ledger data.
                </p>
              </div>
              <template v-else>
                <FamilyLedgerPanel :agency-id="currentAgencyId" :client-id="selectedChildId" />
                <GuardianBillingTab v-if="learningBillingVisible" :agency-id="currentAgencyId" :client-id="selectedChildId" />
              </template>
            </template>

            <template v-else-if="activePanel === 'dependents'">
              <div class="panel-head">
                <div class="panel-title">Dependents</div>
                <div class="panel-subtitle">Health, allergy, and emergency contact information for each child on your account.</div>
              </div>
              <div v-if="isSuperadminPreview" class="guardian-preview-surface">
                <p class="hint" style="margin: 0;">
                  Dependent health and emergency contacts load here for real guardian accounts. Preview keeps this area empty so
                  tenant PHI is not shown.
                </p>
              </div>
              <GuardianDependentsTab
                v-else
                :agency-id="currentAgencyId"
                :guardian-user-id="authStore.user?.id"
              />
            </template>

            <template v-else-if="activePanel === 'payment_methods'">
              <div v-if="isSuperadminPreview" class="guardian-preview-surface">
                <p class="hint" style="margin: 0;">
                  Saved cards (processor tokens) and insurance profiles from enrollment appear here for guardians. Preview does
                  not query payment or coverage records.
                </p>
              </div>
              <GuardianPaymentInsuranceTab
                v-else
                :agency-id="currentAgencyId"
                :guardian-user-id="authStore.user?.id"
              />
            </template>

            <template v-else-if="activePanel === 'contact'">
              <div class="panel-head">
                <div class="panel-title">Reminder contacts</div>
                <div class="panel-subtitle">
                  Add people who should get appointment reminders for
                  {{ selectedChild ? childDisplayName(selectedChild) : 'your child' }} without portal access.
                </div>
              </div>
              <div v-if="isSuperadminPreview" class="guardian-preview-surface">
                <p class="hint" style="margin: 0;">
                  Contact management is available for real guardian accounts. Preview keeps this empty.
                </p>
              </div>
              <ClientAffiliatedContactsPanel
                v-else-if="selectedChildId"
                mode="guardian"
                :client-id="selectedChildId"
                :client-initials="selectedChildInitials"
                title="Appointment reminder contacts"
              />
              <p v-else class="hint">Select a child to manage reminder contacts.</p>
            </template>

            <template v-else>
              <div class="panel-head">
                <div class="panel-title">{{ panelTitle }}</div>
                <div class="panel-subtitle">Coming soon.</div>
              </div>
              <div class="hint">This section is planned but not available yet.</div>
            </template>
          </div>
        </div>
      </template>
      </div>

    <div v-if="comingSoonKey" class="modal-overlay" @click.self="closeComingSoon">
      <div class="modal">
        <div class="modal-header">
          <h3 style="margin:0;">Coming soon</h3>
          <button class="btn-close" type="button" @click="closeComingSoon">×</button>
        </div>
        <div class="modal-body">
          {{ comingSoonMessage }}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" @click="closeComingSoon">Close</button>
        </div>
      </div>
    </div>

    <div v-if="registrationEnrollOpen" class="modal-overlay" @click.self="closeRegistrationEnroll">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h3 style="margin:0;">Register</h3>
          <button class="btn-close" type="button" @click="closeRegistrationEnroll">×</button>
        </div>
        <div class="modal-body">
          <p v-if="registrationEnrollTarget" class="muted" style="margin-top:0;">
            <strong>{{ registrationEnrollTarget.title }}</strong>
            · {{ registrationEnrollTarget ? registrationKindLabel(registrationEnrollTarget.kind) : '' }}
          </p>
          <div v-if="registrationEnrollError" class="error" style="font-size: 13px; margin-bottom: 10px;">{{ registrationEnrollError }}</div>
          <p v-if="!registrationEnrollDependents.length" class="hint">No dependents linked for this agency. Ask your organization to link a child or use intake to add one.</p>
          <template v-else>
            <div class="form-group" style="margin-bottom: 12px;">
              <div class="lbl">Select child(ren)</div>
              <div v-for="d in registrationEnrollDependents" :key="d.clientId" class="reg-enroll-check">
                <label>
                  <input v-model="registrationEnrollSelected" type="checkbox" :value="d.clientId" />
                  {{ d.fullName || d.initials || `Client #${d.clientId}` }}
                </label>
              </div>
            </div>
            <div v-if="registrationPayerChoiceNeeded" class="form-group">
              <label class="lbl">Coverage / payer</label>
              <select v-model="registrationEnrollPayerType" class="input">
                <option value="">Choose…</option>
                <option v-if="registrationEnrollTarget?.medicaidEligible" value="medicaid">Medicaid</option>
                <option v-if="registrationEnrollTarget?.cashEligible" value="cash">Cash / self-pay</option>
              </select>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" @click="closeRegistrationEnroll">Cancel</button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="registrationEnrollSaving || !registrationEnrollDependents.length || !registrationEnrollSelected.length || (registrationPayerChoiceNeeded && !registrationEnrollPayerType)"
            @click="submitRegistrationEnroll"
          >
            {{ registrationEnrollSaving ? 'Saving…' : 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </FamilyPortalShell>

  <!-- Booking drawer (teleports to body) -->
  <GuardianSessionBookingDrawer
    v-if="tutoringProvider"
    :open="bookingDrawerOpen"
    :agency-slug="guardianPathSlug"
    :provider-id="tutoringProvider.providerId"
    :provider-name="tutoringProvider.providerName"
    :child-id="selectedChildId ? Number(selectedChildId) : null"
    :child-name="selectedChild ? (selectedChild.first_name + ' ' + selectedChild.last_name) : ''"
    :session-rate-cents="tutoringProvider.sessionRateCents"
    :min-session-package="tutoringProvider.minSessionPackage"
    :payment-policy="tutoringProvider.paymentPolicy"
    @close="bookingDrawerOpen = false"
    @submitted="bookingDrawerOpen = false"
  />
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import FamilyPortalShell from '../../components/portal/FamilyPortalShell.vue';
import FamilyPortalHome from '../../components/portal/FamilyPortalHome.vue';
import { useBrandingStore } from '../../store/branding';
const brandingStore = useBrandingStore();
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useGuardianStore } from '../../store/guardian';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import DocumentsTab from '../../components/dashboard/DocumentsTab.vue';
import GuardianProgramSelector from '../../components/GuardianProgramSelector.vue';
import PlatformPreviewBanner from '../../components/admin/PlatformPreviewBanner.vue';
import ClinicalDisclosurePanel from '../../components/billing/ClinicalDisclosurePanel.vue';
import FamilyLedgerPanel from '../../components/billing/FamilyLedgerPanel.vue';
import GuardianBillingTab from '../../components/guardian/GuardianBillingTab.vue';
import GuardianPaymentInsuranceTab from '../../components/guardian/GuardianPaymentInsuranceTab.vue';
import GuardianDependentsTab from '../../components/guardian/GuardianDependentsTab.vue';
import GuardianPlanProgressPanel from '../../components/guardian/GuardianPlanProgressPanel.vue';
import GuardianSkillBuildersEventView from './GuardianSkillBuildersEventView.vue';
import GuardianSessionBookingDrawer from '../../components/guardian/GuardianSessionBookingDrawer.vue';
import GuardianMessagesPanel from '../../components/guardian/GuardianMessagesPanel.vue';
import GuardianTutoringDashboard from '../../components/guardian/GuardianTutoringDashboard.vue';
import ClientAffiliatedContactsPanel from '../../components/client/ClientAffiliatedContactsPanel.vue';
import { fetchGuardianLearningFeed } from '../../services/tutoringLearningOs';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const guardianStore = useGuardianStore();
const route = useRoute();
const router = useRouter();
const isSuperadminPreview = computed(() => {
  return String(authStore.user?.role || '').trim().toLowerCase() === 'super_admin' &&
    String(route.query?.previewMode || '').trim().toLowerCase() === 'superadmin';
});
const previewAgencyId = computed(() => {
  return Number(route.query?.previewAgencyId || agencyStore.currentAgency?.id || 0) || null;
});
const previewParams = computed(() => {
  if (!isSuperadminPreview.value) return {};
  return {
    previewMode: 'superadmin',
    ...(previewAgencyId.value ? { previewAgencyId: previewAgencyId.value } : {})
  };
});

const loading = ref(false);
const error = ref('');
const overview = ref({ children: [], programs: [] });

const sbEvents = ref([]);
const sbLoading = ref(false);
const sbError = ref('');
const showPastSbEvents = ref(false);

const genEvents = ref([]);
const genLoading = ref(false);
const genError = ref('');

const regCatalogItems = ref([]);
const regCatalogLoading = ref(false);
const regCatalogError = ref('');
const registrationEnrollOpen = ref(false);
const registrationEnrollTarget = ref(null);
const registrationEnrollDependents = ref([]);
const registrationEnrollSelected = ref([]);
const registrationEnrollPayerType = ref('');
const registrationEnrollSaving = ref(false);
const registrationEnrollError = ref('');

const activePanel = ref(['overview','tutoring','registrations','documents','child','billing','payment_methods','messages','account','dependents','contact','plan'].includes(route.query.panel) ? route.query.panel : 'overview');
const selectedChildId = computed({
  get: () => guardianStore.selectedChildId,
  set: (v) => guardianStore.setSelectedChild(v)
});
const comingSoonKey = ref('');
const selectedInlineEvent = ref(null); // { eventId:number, programMode:boolean } | null

const formatDocStatus = (s) => {
  const m = { NONE: 'None', UPLOADED: 'Uploaded', PACKET: 'Packet', APPROVED: 'Approved', REJECTED: 'Rejected' };
  return m[s] || s || '-';
};

const formatClientStatus = (s) => {
  const m = {
    PENDING_REVIEW: 'Pending',
    ACTIVE: 'Current',
    ON_HOLD: 'Waitlist',
    DECLINED: 'Declined',
    ARCHIVED: 'Archived',
    PACKET: 'Packet',
    SCREENER: 'Screener',
    RETURNING: 'Returning'
  };
  return m[s] || s || '-';
};

const formatOrgType = (t) => {
  const k = String(t || '').toLowerCase();
  if (!k) return 'Org';
  if (k === 'school') return 'School';
  if (k === 'program') return 'Program';
  if (k === 'learning') return 'Learning';
  return k;
};

const programs = computed(() => Array.isArray(overview.value?.programs) ? overview.value.programs : []);
const children = computed(() => Array.isArray(overview.value?.children) ? overview.value.children : []);
const currentAgencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);
const dashboardAgencyId = computed(() => previewAgencyId.value || currentAgencyId.value || null);
const totalEnrolledEventCount = computed(() => sbUpcomingGrouped.value.length + genCurrentEvents.value.length);
const pendingDocumentCount = computed(() => {
  return (children.value || []).filter((child) => String(child?.document_status || '').toUpperCase() !== 'APPROVED').length;
});
const registrationPreviewItems = computed(() => (regCatalogItems.value || []).slice(0, 3));
const learningBillingVisible = computed(() => {
  const orgType = String(agencyStore.currentAgency?.organization_type || '').toLowerCase();
  if (orgType !== 'learning') return false;
  const flags = agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags || {};
  return Boolean(flags?.learningProgramBillingEnabled === true);
});

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
};

const standardsLearningVisible = computed(() => {
  const orgType = String(agencyStore.currentAgency?.organization_type || '').toLowerCase();
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags);
  return orgType === 'learning' || flags.standardsLearningEnabled === true;
});

const selectedChild = computed(() => {
  const id = Number(selectedChildId.value);
  if (!id) return null;
  return (children.value || []).find((c) => Number(c?.client_id) === id) || null;
});

const selectedChildAgencyId = computed(() => {
  const fromChild = Number(selectedChild.value?.agency_id || 0);
  if (fromChild) return fromChild;
  return Number(agencyStore.currentAgency?.id || 0) || null;
});

const selectedChildClientType = computed(() => {
  const explicit = String(selectedChild.value?.client_type || '').toLowerCase();
  if (explicit) return explicit;
  const orgType = String(
    selectedChild.value?.organization_type || agencyStore.currentAgency?.organization_type || ''
  ).toLowerCase();
  if (orgType === 'learning' || orgType === 'clinical') return orgType;
  return '';
});

const planProgressVisible = computed(() => {
  if (!selectedChildId.value) return false;
  const t = selectedChildClientType.value;
  const orgType = String(
    selectedChild.value?.organization_type || agencyStore.currentAgency?.organization_type || ''
  ).toLowerCase();
  return t === 'learning' || t === 'clinical' || orgType === 'learning' || orgType === 'clinical';
});

const selectedChildFullName = computed(() => {
  const n = String(selectedChild.value?.full_name || '').trim();
  return n || '';
});

const currentAgencyName = computed(() => String(agencyStore.currentAgency?.name || '').trim() || '');

const currentProgramRow = computed(() => {
  const id = Number(agencyStore.currentAgency?.id || 0);
  return (programs.value || []).find((p) => Number(p?.id) === id) || null;
});

const programLogoUrl = computed(() => {
  const fromStore = String(agencyStore.currentAgency?.logo_url || agencyStore.currentAgency?.logoUrl || '').trim();
  if (fromStore) return fromStore;
  return String(currentProgramRow.value?.logo_url || '').trim() || null;
});

const tenantAgencyName = computed(() => String(currentProgramRow.value?.billing_agency_name || '').trim());

const tenantAgencyLogoUrl = computed(() => String(currentProgramRow.value?.billing_agency_logo_url || '').trim() || null);

function initialsFromLabel(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0] || '';
  const b = parts[parts.length - 1][0] || '';
  return `${a}${b}`.toUpperCase() || '?';
}

const tenantAgencyInitials = computed(() => initialsFromLabel(tenantAgencyName.value) || 'A');

const programAgencyInitials = computed(() => initialsFromLabel(currentAgencyName.value) || 'P');

const dualBranding = computed(() => {
  const progId = Number(agencyStore.currentAgency?.id || 0);
  const billId = Number(currentProgramRow.value?.billing_agency_id || 0);
  return Boolean(progId && billId && billId !== progId);
});

const dashboardTabs = computed(() => {
  const preview = isSuperadminPreview.value;
  const pm = (normal, shell) => (preview ? shell : normal);

  const tabs = [];
  if (standardsLearningVisible.value) {
    tabs.push({
      key: 'tutoring',
      label: 'Dashboard',
      meta: pm('Tutoring progress & practice', 'Tutoring dashboard')
    });
  }
  tabs.push(
    { key: 'overview', label: standardsLearningVisible.value ? 'Family' : 'Overview', meta: pm('Home base', 'Preview shell') },
    { key: 'registrations', label: 'Registrations', meta: upcomingRegistrationRailSubtitle.value },
    { key: 'documents', label: 'Documents', meta: pm('Forms and signatures', 'Where forms live') }
  );
  if (selectedChild.value) {
    tabs.push({
      key: 'child',
      label: standardsLearningVisible.value ? 'My Student' : 'Child details',
      meta: childDisplayName(selectedChild.value)
    });
  } else if (preview) {
    tabs.push({ key: 'child', label: 'Child details', meta: 'Hidden in preview' });
  }
  {
    tabs.push({
      key: 'billing',
      label: 'Billing',
      meta: pm('Payers, payments and coverage', 'Billing shell')
    });
  }
  tabs.push(
    { key: 'messages', label: 'Messages', meta: pm('Provider chat', 'Messaging shell') },
    { key: 'dependents', label: 'Dependents', meta: pm('Health and emergency info', 'Health shell (preview)') },
    {
      key: 'payment_methods',
      label: 'Payment & insurance',
      meta: pm('Cards and coverage', 'Cards & coverage (live data)')
    },
    { key: 'account', label: 'Account', meta: pm('Profile and security', 'Profile and security shell') }
  );
  return tabs;
});

const portalGrants = ref([]);
let portalGrantRequest = 0;
const portalPlanAllowed = computed(() => !isSuperadminPreview.value && !!selectedChildId.value && (standardsLearningVisible.value || selectedChild.value?.relationship_type === 'self' || portalGrants.value.some(g => Number(g.clientId) === Number(selectedChildId.value) && Number(g.guardianUserId) === Number(authStore.user?.id) && g.scopes?.includes('treatment_plan'))));
const portalNavigation = computed(() => {
  const icons = {overview:'dashboard',tutoring:'dashboard',registrations:'sessions',documents:'tasks',child:'child',dependents:'child',billing:'billing',payment_methods:'shield',account:'account',messages:'messages'};
  const labels = {overview:standardsLearningVisible.value ? 'Family overview' : 'Dashboard',documents:'Tasks & documents',billing:'Invoices & receipts',payment_methods:'Insurance & payments',child:selectedChild.value?.relationship_type === 'self' ? 'My profile' : 'My client'};
  const items = dashboardTabs.value.map(t => ({...t,label:labels[t.key] || t.label,icon:icons[t.key]}));
  if (portalPlanAllowed.value) items.splice(3,0,{key:'plan',label:standardsLearningVisible.value?'Learning plan':'Treatment plan',icon:'plan'});
  if(selectedChild.value && !selectedChild.value.guardian_portal_locked && !isSuperadminPreview.value && authStore.user?.role==='client_guardian')items.push({key:'waivers',label:'Waivers & safety',icon:'documents'});
  items.push({key:'contact',label:'Reminder contacts',icon:'support'});
  return items;
});
const portalTitle = computed(() => ['overview','tutoring'].includes(activePanel.value) ? `Welcome${authStore.user?.first_name ? ', ' + authStore.user.first_name : ''}!` : portalNavigation.value.find(t => t.key === activePanel.value)?.label || 'Your portal');
const portalSubtitle = computed(() => ['overview','tutoring'].includes(activePanel.value) ? `Your ${standardsLearningVisible.value ? 'learning' : 'care'} journey, appointments, and next steps in one place.` : ({billing:'Your assigned balances, payment plans, and downloadable receipts.',payment_methods:'Manage your private insurance coverage and payment methods.',plan:'Review the goals and progress shared with your account.',documents:'Complete forms, review documents, and stay up to date.',messages:'A private connection with your team.'}[activePanel.value] || 'Manage the information shared with your account.'));
function navigatePortal(key) { if(!portalNavigation.value.some(item => item.key === key))return;if(key==='waivers'){router.push(guardianWaiversLink.value);return;}activePanel.value=key;selectedInlineEvent.value=null;router.replace({query:{...route.query,panel:key}}); }
watch(() => route.query.panel, key => { if(portalNavigation.value.some(item => item.key === key))activePanel.value=key; });
watch(() => [currentAgencyId.value,selectedChildId.value,isSuperadminPreview.value], async () => {
  const request=++portalGrantRequest;portalGrants.value=[];
  if(!currentAgencyId.value||isSuperadminPreview.value)return;
  try {const {data}=await api.get('/family-billing/clinical-access',{params:{agencyId:currentAgencyId.value}});if(request===portalGrantRequest)portalGrants.value=data.grants||[];}catch{/* Clinical panels stay hidden until access is confirmed. */}
},{immediate:true});

const registrationPayerChoiceNeeded = computed(() => {
  const t = registrationEnrollTarget.value;
  if (!t) return false;
  return !!(t.medicaidEligible && t.cashEligible);
});

const docStatusTone = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'APPROVED') return 'tone-good';
  if (normalized === 'REJECTED') return 'tone-bad';
  if (!normalized || normalized === 'NONE') return 'tone-muted';
  return 'tone-warn';
};

const userName = computed(() => {
  const u = authStore.user || {};
  const n = `${String(u.first_name || '').trim()} ${String(u.last_name || '').trim()}`.trim();
  return n || '—';
});

const userEmail = computed(() => String(authStore.user?.email || '').trim() || '—');

const changePasswordTo = computed(() => {
  const slug = String(route.params.organizationSlug || '').trim();
  return slug ? `/${slug}/change-password` : '/change-password';
});

/** Slug for guardian-prefixed routes (URL or first program). */
const guardianPathSlug = computed(() => {
  const p = String(route.params.organizationSlug || '').trim();
  if (p) return p;
  const list = programs.value || [];
  const cur = list.find((x) => Number(x?.id) === Number(agencyStore.currentAgency?.id));
  const pick = cur || list[0];
  return String(pick?.slug || pick?.portal_url || '').trim() || '';
});

const guardianWaiversLink = computed(() => {
  const slug = guardianPathSlug.value;
  if (slug) return `/${slug}/guardian/waivers`;
  return '/guardian/waivers';
});

const highlightEventId = computed(() => {
  const n = Number(route.query.highlight || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

function formatEnrolledAt(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '';
  }
}

function isRecentlyEnrolledGroup(g) {
  if (!g?.enrolledAt) return false;
  const t = new Date(g.enrolledAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 48 * 60 * 60 * 1000;
}

function sbCardShouldPulse(g) {
  if (highlightEventId.value && highlightEventId.value === g.companyEventId) return true;
  return isRecentlyEnrolledGroup(g);
}

const sbGrouped = computed(() => {
  const map = new Map();
  for (const e of sbEvents.value || []) {
    const id = Number(e.companyEventId);
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        companyEventId: id,
        agencyId: Number(e.agencyId),
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        schoolName: e.schoolName,
        schoolSlug: e.schoolSlug,
        enrolledAt: e.enrolledAt || null,
        children: []
      });
    } else {
      const row = map.get(id);
      const next = e.enrolledAt ? new Date(e.enrolledAt).getTime() : 0;
      const cur = row.enrolledAt ? new Date(row.enrolledAt).getTime() : 0;
      if (Number.isFinite(next) && (!Number.isFinite(cur) || next > cur)) {
        row.enrolledAt = e.enrolledAt;
      }
    }
    map.get(id).children.push({ clientId: e.clientId, initials: e.clientInitials });
  }
  return [...map.values()].sort((a, b) => {
    const tb = new Date(b.endsAt || b.startsAt || 0).getTime();
    const ta = new Date(a.endsAt || a.startsAt || 0).getTime();
    return tb - ta;
  });
});

function sbEndMs(g) {
  const t = g?.endsAt ? new Date(g.endsAt).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

const sbUpcomingGrouped = computed(() => {
  const now = Date.now();
  return sbGrouped.value.filter((g) => !sbEndMs(g) || sbEndMs(g) >= now);
});

const sbPastGrouped = computed(() => {
  const now = Date.now();
  return sbGrouped.value.filter((g) => sbEndMs(g) > 0 && sbEndMs(g) < now);
});

function genEndMs(g) {
  const t = g?.endsAt ? new Date(g.endsAt).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

const genCurrentEvents = computed(() => {
  const now = Date.now();
  return (genEvents.value || []).filter((g) => {
    const t = genEndMs(g);
    return !t || t >= now;
  });
});

function formatSbCardWhen(g) {
  const a = g?.startsAt ? new Date(g.startsAt) : null;
  const b = g?.endsAt ? new Date(g.endsAt) : null;
  if (a && Number.isFinite(a.getTime())) {
    try {
      const opt = { dateStyle: 'medium' };
      const end = b && Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, opt) : '';
      return end ? `${a.toLocaleDateString(undefined, opt)} – ${end}` : a.toLocaleDateString(undefined, opt);
    } catch {
      return '';
    }
  }
  return '';
}

function childDisplayName(c) {
  const n = String(c?.full_name || '').trim();
  if (n) return n;
  if (c?.initials) return `Child (${c.initials})`;
  return 'Child';
}

const selectedChildInitials = computed(() => {
  const c = selectedChild.value;
  if (!c) return '';
  if (c.initials) return String(c.initials).toUpperCase();
  const name = String(c.full_name || '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
});

function programChildrenLine(p) {
  const parts = (p?.children || []).map((c) => {
    const n = String(c?.full_name || '').trim();
    return n || String(c?.initials || '').trim();
  }).filter(Boolean);
  return parts.length ? `Child: ${parts.join(', ')}` : '';
}

function childLabels(g) {
  const byId = new Map((children.value || []).map((c) => [Number(c.client_id), c]));
  const parts = (g.children || []).map((ch) => {
    const row = byId.get(Number(ch.clientId));
    if (row) return childDisplayName(row);
    return String(ch.initials || `#${ch.clientId}`).trim();
  }).filter(Boolean);
  return parts.length ? parts.join(', ') : 'Your child';
}

function registrationKindLabel(kind) {
  const k = String(kind || '');
  if (k === 'company_event') return 'Skill Builders event';
  if (k === 'learning_class') return 'Learning class';
  return k || 'Offering';
}

function formatRegistrationWhen(item) {
  const a = item?.startsAt ? new Date(item.startsAt) : null;
  const b = item?.endsAt ? new Date(item.endsAt) : null;
  if (a && Number.isFinite(a.getTime())) {
    try {
      const opt = { dateStyle: 'medium' };
      const end = b && Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, opt) : '';
      return end ? `${a.toLocaleDateString(undefined, opt)} – ${end}` : a.toLocaleDateString(undefined, opt);
    } catch {
      return '';
    }
  }
  return '';
}

function registrationPayerLine(item) {
  const bits = [];
  if (item?.medicaidEligible) bits.push('Medicaid');
  if (item?.cashEligible) bits.push('Cash / self-pay');
  return bits.length ? `Enrollment: ${bits.join(' · ')}` : '';
}

async function openLearningClassWorkspace(item) {
  const classId = Number(item?.id || 0);
  if (!classId) return;
  try {
    const resp = await api.get(`/learning-class-sessions/classes/${classId}/join-resolve`, { skipGlobalLoading: true });
    const joinPath = String(resp.data?.joinPath || '').trim();
    const sessionId = Number(resp.data?.preferredSessionId || 0);
    if (joinPath) {
      if (sessionId > 0) {
        router.push(`${joinPath}?sessionId=${sessionId}`);
      } else {
        router.push(joinPath);
      }
      return;
    }
  } catch {
    // fallback to local slug resolution
  }
  const slug =
    String(route.params.organizationSlug || '').trim().toLowerCase() ||
    String(agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || '').trim().toLowerCase();
  router.push(slug ? `/${slug}/learning/classes/${classId}` : `/learning/classes/${classId}`);
}

const panelTitle = computed(() => {
  if (activePanel.value === 'overview') return 'Family overview';
  if (activePanel.value === 'billing') return 'Billing';
  if (activePanel.value === 'messages') return 'Messages';
  if (activePanel.value === 'notifications') return 'Notifications';
  if (activePanel.value === 'policy') return 'Policy & Procedures';
  return 'My Dashboard';
});

const currentProgramSummary = computed(() => {
  const programName = String(agencyStore.currentAgency?.name || '').trim() || 'Selected program';
  return `Open cards below to view active enrolled events for ${programName}.`;
});

const upcomingRegistrationCount = computed(() => (regCatalogItems.value || []).length);
const upcomingRegistrationRailSubtitle = computed(() => {
  const n = Number(upcomingRegistrationCount.value || 0);
  if (!n) return 'No open internal registrations';
  if (n === 1) return '1 event open now';
  return `${n} events open now`;
});

const programOverviewEvents = computed(() => {
  const skillRows = sbUpcomingGrouped.value.map((g) => ({
    key: `sb-${g.companyEventId}`,
    eventId: Number(g.companyEventId),
    programMode: false,
    title: g.title || `Event #${g.companyEventId}`,
    metaPrimary: formatSbCardWhen(g) || 'Skill Builders event',
    metaSecondary: `${g.schoolName || 'School'} · ${childLabels(g)}`
  }));
  const programRows = genCurrentEvents.value.map((g) => ({
    key: `pg-${g.companyEventId}`,
    eventId: Number(g.companyEventId),
    programMode: true,
    title: g.title || `Event #${g.companyEventId}`,
    metaPrimary: g.programName || g.agencyName || 'Program event',
    metaSecondary: (g.myClients || []).map((c) => c.initials || c.fullName || `#${c.clientId}`).join(', ') || 'Your child'
  }));
  return [...skillRows, ...programRows];
});

function openInlineSkillBuilderEvent(g) {
  const id = Number(g?.companyEventId || 0);
  if (!id) return;
  activePanel.value = 'overview';
  selectedInlineEvent.value = { eventId: id, programMode: false };
}

function openInlineProgramEvent(g) {
  const id = Number(g?.companyEventId || 0);
  if (!id) return;
  activePanel.value = 'overview';
  selectedInlineEvent.value = { eventId: id, programMode: true };
}

function openInlineEventFromWorkspace(evt) {
  const id = Number(evt?.eventId || 0);
  if (!id) return;
  activePanel.value = 'overview';
  selectedInlineEvent.value = { eventId: id, programMode: !!evt?.programMode };
}

const comingSoonMessage = computed(() => {
  const key = String(comingSoonKey.value || '');
  const map = {
    contact: 'A contact card will list assigned providers and support team contacts.',
    booking: 'A booking card will let you request and manage sessions.',
    add_child: 'Add Child will allow you to link additional children to this account.',
    additional_programs: 'Additional programs enrollment will be available here.'
  };
  return map[key] || 'This feature is coming soon.';
});

const resolveTargetSlug = (program) => {
  const slug = String(program?.slug || program?.portal_url || '').trim();
  return slug || null;
};

const isActiveProgram = (p) => Number(agencyStore.currentAgency?.id || 0) === Number(p?.id || 0);

const selectProgram = async (program) => {
  if (!program?.id) return;
  agencyStore.setCurrentAgency(program);

  const slug = resolveTargetSlug(program);
  if (!slug) return;

  if (route.params.organizationSlug) {
    const nextParams = { ...route.params, organizationSlug: slug };
    await router.push({ name: route.name, params: nextParams, query: route.query });
    return;
  }
  await router.push(`/${slug}/guardian`);
};

const openProgramWorkspace = async (program) => {
  await selectProgram(program);
  activePanel.value = 'overview';
  selectedInlineEvent.value = null;
};

const initProgramContext = async () => {
  const list = programs.value || [];
  if (list.length === 0) return;

  const routeSlug = String(route.params.organizationSlug || '').trim().toLowerCase();
  const match = routeSlug ? list.find((p) => String(resolveTargetSlug(p) || '').toLowerCase() === routeSlug) : null;
  if (match) {
    agencyStore.setCurrentAgency(match);
    return;
  }

  const curId = Number(agencyStore.currentAgency?.id || 0);
  const hasCur = curId && list.some((p) => Number(p?.id) === curId);
  if (!hasCur) {
    agencyStore.setCurrentAgency(list[0]);
  }
};

const fetchSkillBuilderEvents = async () => {
  const aid = Number(agencyStore.currentAgency?.id || 0);
  const effectiveAgencyId = Number(dashboardAgencyId.value || 0);
  if (!effectiveAgencyId) {
    sbEvents.value = [];
    return;
  }
  sbLoading.value = true;
  sbError.value = '';
  try {
    const resp = await api.get('/guardian-portal/skill-builders/events', {
      params: { agencyId: effectiveAgencyId, ...previewParams.value },
      skipGlobalLoading: true
    });
    sbEvents.value = Array.isArray(resp.data?.events) ? resp.data.events : [];
  } catch (err) {
    sbError.value = err.response?.data?.error?.message || 'Could not load Skill Builders events';
    sbEvents.value = [];
  } finally {
    sbLoading.value = false;
  }
};

const fetchGenEvents = async () => {
  genLoading.value = true;
  genError.value = '';
  try {
    const resp = await api.get('/guardian-portal/company-events', {
      params: previewParams.value,
      skipGlobalLoading: true
    });
    genEvents.value = Array.isArray(resp.data?.events) ? resp.data.events : [];
  } catch (err) {
    genError.value = err.response?.data?.error?.message || 'Could not load enrolled events';
    genEvents.value = [];
  } finally {
    genLoading.value = false;
  }
};

const fetchRegistrationCatalog = async () => {
  if (!(programs.value || []).length && !dashboardAgencyId.value) {
    regCatalogItems.value = [];
    return;
  }
  regCatalogLoading.value = true;
  regCatalogError.value = '';
  try {
    const resp = await api.get('/guardian-portal/registration/catalog', {
      params: {
        ...(dashboardAgencyId.value ? { agencyId: dashboardAgencyId.value } : {}),
        ...previewParams.value
      },
      skipGlobalLoading: true
    });
    regCatalogItems.value = Array.isArray(resp.data?.items) ? resp.data.items : [];
  } catch (err) {
    regCatalogError.value = err.response?.data?.error?.message || 'Could not load registration catalog';
    regCatalogItems.value = [];
  } finally {
    regCatalogLoading.value = false;
  }
};

const openRegistrationEnroll = async (item) => {
  if (item?.kind === 'company_event') {
    const key = String(item?.linkedIntakePublicKey || '').trim();
    if (key) {
      const url = buildPublicIntakeUrl(key);
      if (url) {
        window.location.assign(url);
        return;
      }
    }
  }
  registrationEnrollTarget.value = item;
  registrationEnrollSelected.value = [];
  registrationEnrollPayerType.value = '';
  registrationEnrollError.value = '';
  const aid = Number(item?.agencyId || dashboardAgencyId.value || 0);
  if (!aid) return;
  try {
    const resp = await api.get('/guardian-portal/dependents', {
      params: { agencyId: aid, ...previewParams.value },
      skipGlobalLoading: true
    });
    registrationEnrollDependents.value = Array.isArray(resp.data?.dependents) ? resp.data.dependents : [];
  } catch {
    registrationEnrollDependents.value = [];
  }
  if (item?.medicaidEligible && !item?.cashEligible) registrationEnrollPayerType.value = 'medicaid';
  else if (!item?.medicaidEligible && item?.cashEligible) registrationEnrollPayerType.value = 'cash';
  registrationEnrollOpen.value = true;
};

const closeRegistrationEnroll = () => {
  registrationEnrollOpen.value = false;
  registrationEnrollTarget.value = null;
  registrationEnrollDependents.value = [];
  registrationEnrollSelected.value = [];
  registrationEnrollPayerType.value = '';
  registrationEnrollError.value = '';
};

const submitRegistrationEnroll = async () => {
  const target = registrationEnrollTarget.value;
  const aid = Number(target?.agencyId || agencyStore.currentAgency?.id || 0);
  const ids = (registrationEnrollSelected.value || []).map((x) => Number(x)).filter((n) => n > 0);
  if (!aid || !target || !ids.length) return;
  if (registrationPayerChoiceNeeded.value && !registrationEnrollPayerType.value) return;
  registrationEnrollSaving.value = true;
  registrationEnrollError.value = '';
  try {
    const body = {
      agencyId: aid,
      clientIds: ids,
      ...(registrationEnrollPayerType.value ? { payerType: registrationEnrollPayerType.value } : {})
    };
    let resp;
    if (target.kind === 'company_event') {
      resp = await api.post(`/guardian-portal/registration/company-events/${target.id}/enroll`, body);
    } else if (target.kind === 'learning_class') {
      resp = await api.post(`/guardian-portal/registration/learning-classes/${target.id}/enroll`, body);
    } else {
      registrationEnrollError.value = 'Unknown offering type';
      return;
    }
    const results = Array.isArray(resp.data?.results) ? resp.data.results : [];
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      registrationEnrollError.value = failed.map((r) => r.error || 'Failed').join('; ');
      return;
    }
    closeRegistrationEnroll();
    await fetchRegistrationCatalog();
    await fetchSkillBuilderEvents();
    if (target.kind === 'company_event') await fetchGenEvents();
  } catch (err) {
    registrationEnrollError.value = err.response?.data?.error?.message || err.message || 'Enrollment failed';
  } finally {
    registrationEnrollSaving.value = false;
  }
};

const fetchOverview = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/guardian-portal/overview', {
      params: previewParams.value
    });
    overview.value = resp.data || { children: [], programs: [] };
    const firstChildId = Number(overview.value?.children?.[0]?.client_id || 0) || null;
    const currentChildStillExists = (overview.value?.children || []).some((child) => Number(child?.client_id) === Number(selectedChildId.value || 0));
    if (!currentChildStillExists) {
      selectedChildId.value = firstChildId;
    }
    await initProgramContext();
    await fetchSkillBuilderEvents();
    await fetchRegistrationCatalog();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load guardian dashboard';
    overview.value = { children: [], programs: [] };
  } finally {
    loading.value = false;
  }
};

const refreshAll = async () => {
  await fetchOverview();
  await fetchGenEvents();
};

watch(
  () => agencyStore.currentAgency?.id,
  () => {
    fetchSkillBuilderEvents();
    fetchRegistrationCatalog();
  }
);

const openChild = (c) => {
  selectedChildId.value = Number(c?.client_id) || null;
  activePanel.value = 'child';
};

const intakeSignedDocs = ref([]);
const intakeDocsLoading = ref(false);
const intakeDocOpeningId = ref(null);

const formatIntakeSignedAt = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
};

const loadIntakeSignedDocumentsForChild = async () => {
  const id = Number(selectedChildId.value);
  if (!id) {
    intakeSignedDocs.value = [];
    return;
  }
  const ch = (children.value || []).find((c) => Number(c.client_id) === id);
  if (ch?.guardian_portal_locked) {
    intakeSignedDocs.value = [];
    return;
  }
  intakeDocsLoading.value = true;
  try {
    const { data } = await api.get(`/guardian-portal/clients/${id}/intake-documents`);
    intakeSignedDocs.value = Array.isArray(data?.documents) ? data.documents : [];
  } catch {
    intakeSignedDocs.value = [];
  } finally {
    intakeDocsLoading.value = false;
  }
};

const openIntakeSignedDoc = async (d) => {
  const cid = Number(selectedChildId.value);
  if (!cid || !d?.id) return;
  intakeDocOpeningId.value = d.id;
  try {
    const { data } = await api.get(`/guardian-portal/clients/${cid}/intake-documents/${d.id}/download-url`);
    const url = data?.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  } finally {
    intakeDocOpeningId.value = null;
  }
};

const guardianNoteDate = ref('');
const guardianDailyNotes = ref([]);
const guardianNotesLoading = ref(false);
const learningProgressLoading = ref(false);
const learningProgressError = ref('');
const learningDomainRows = ref([]);
const learningGoalRows = ref([]);
const learningRecommendationRows = ref([]);

// New for virtual tutoring dashboard integration
const tutoringSessions = ref([]);
const tutoringSummaries = ref([]);
const upcomingTutoringSessions = ref([]);
const losPublishedReports = ref([]);
const losPractice = ref([]);
const losParentUpdates = ref([]);

// Book sessions drawer
const bookingDrawerOpen = ref(false);
const tutoringProvider = ref(null); // { providerId, providerName, sessionRateCents, minSessionPackage, paymentPolicy }

const formatLearningScore = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(1);
};

const formatLearningDate = (value) => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return String(value);
  }
};

const fmtUpcomingDate = (value) => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return String(value);
  }
};

const loadSelectedChildLearningProgress = async () => {
  const clientId = Number(selectedChildId.value || 0);
  if (!clientId || !standardsLearningVisible.value) {
    learningDomainRows.value = [];
    learningGoalRows.value = [];
    learningRecommendationRows.value = [];
    tutoringSessions.value = [];
    upcomingTutoringSessions.value = [];
    losPublishedReports.value = [];
    losPractice.value = [];
    losParentUpdates.value = [];
    return;
  }
  learningProgressLoading.value = true;
  learningProgressError.value = '';
  try {
    const [domainsRes, goalsRes, recommendationsRes] = await Promise.all([
      api.get(`/learning-progress/students/${clientId}/domains`, { skipGlobalLoading: true }),
      api.get(`/learning-progress/students/${clientId}/goals`, { skipGlobalLoading: true }),
      api.get(`/learning-recommendations/students/${clientId}`, { skipGlobalLoading: true })
    ]);
    learningDomainRows.value = Array.isArray(domainsRes.data?.domains) ? domainsRes.data.domains : [];
    learningGoalRows.value = Array.isArray(goalsRes.data?.goals) ? goalsRes.data.goals : [];
    learningRecommendationRows.value = Array.isArray(recommendationsRes.data?.recommendations)
      ? recommendationsRes.data.recommendations
      : [];
  } catch (err) {
    learningProgressError.value = err.response?.data?.error?.message || 'Could not load learning progress';
    learningDomainRows.value = [];
    learningGoalRows.value = [];
    learningRecommendationRows.value = [];
  } finally {
    learningProgressLoading.value = false;
  }

  // Tutoring sessions load independently so a 404 here cannot wipe the learning panel.
  try {
    const [pastRes, upcomingRes] = await Promise.all([
      api.get(`/learning-progress/students/${clientId}/tutoring-sessions`, { skipGlobalLoading: true }),
      api.get(`/learning-progress/students/${clientId}/tutoring-sessions?upcoming=1`, { skipGlobalLoading: true })
    ]);
    tutoringSessions.value = Array.isArray(pastRes.data?.sessions) ? pastRes.data.sessions : [];
    upcomingTutoringSessions.value = Array.isArray(upcomingRes.data?.sessions) ? upcomingRes.data.sessions : [];

    // Derive the linked provider for the "Book sessions" card
    const linkedProviderId = upcomingTutoringSessions.value[0]?.provider_user_id
      || tutoringSessions.value[0]?.provider_user_id
      || null;
    if (linkedProviderId && guardianPathSlug.value) {
      try {
        const pRes = await api.get(
          `/public/agency-services/${encodeURIComponent(guardianPathSlug.value)}/tutoring-profiles/${linkedProviderId}`,
          { skipGlobalLoading: true }
        );
        const p = pRes.data?.profile;
        if (p) {
          tutoringProvider.value = {
            providerId: linkedProviderId,
            providerName: upcomingTutoringSessions.value[0]?.provider_name || tutoringSessions.value[0]?.provider_name || 'Your tutor',
            sessionRateCents: p.sessionRateCents || null,
            minSessionPackage: p.minSessionPackage || 1,
            paymentPolicy: p.paymentPolicy || 'POST_SESSION'
          };
        }
      } catch { tutoringProvider.value = null; }
    }
  } catch {
    tutoringSessions.value = [];
    upcomingTutoringSessions.value = [];
  }

  try {
    const feed = await fetchGuardianLearningFeed(clientId);
    const subjects = Array.isArray(feed?.subjects) ? feed.subjects : [];
    const reports = [];
    const practice = [];
    const updates = [];
    for (const row of subjects) {
      const subjectLabel = row.subject?.subject_label || row.subject?.subject_key || 'Subject';
      for (const r of row.publishedReports || []) {
        const content = r.content || {};
        reports.push({
          id: r.id,
          title: r.title,
          reportType: r.reportType || r.report_type,
          publishedAt: r.publishedAt || r.published_at,
          subjectLabel,
          previewText:
            content.parentFriendlySummary ||
            content.summary ||
            (r.contentHtml ? String(r.contentHtml).replace(/<[^>]+>/g, ' ').slice(0, 180) : '')
        });
      }
      for (const a of row.practice || []) {
        practice.push({
          id: a.id,
          title: a.title,
          status: a.status,
          instructions: a.instructions,
          subjectLabel,
          items: a.practiceItems || a.practice_items_json || []
        });
      }
      for (const u of row.recentParentUpdates || []) {
        updates.push({
          id: u.id,
          at: u.at,
          text: u.text,
          subjectLabel
        });
      }
    }
    losPublishedReports.value = reports.slice(0, 12);
    losPractice.value = practice.filter((a) => a.status !== 'cancelled').slice(0, 12);
    losParentUpdates.value = updates.slice(0, 8);
  } catch {
    losPublishedReports.value = [];
    losPractice.value = [];
    losParentUpdates.value = [];
  }

  tutoringSummaries.value = tutoringSessions.value.map((s) => {
    const ai = s.ai_summary_json || {};
    return {
      sessionId: s.id,
      title: s.title || 'Virtual Tutoring Session',
      date: s.ends_at || s.starts_at,
      summary: ai.summary || `AI analysis: ${ai.keyConceptsCovered?.join(', ') || 'concepts covered'}. Standards-aligned homework generated.`,
      strengths: Array.isArray(ai.strengths) ? ai.strengths : [],
      needsWork: Array.isArray(ai.needsWork) ? ai.needsWork : [],
      progress: Number.isFinite(Number(ai.overallProgress)) ? Number(ai.overallProgress) : null,
      standardsMastered: Array.isArray(ai.standardsMastered) ? ai.standardsMastered : [],
      standardsNeedingReview: Array.isArray(ai.standardsNeedingReview) ? ai.standardsNeedingReview : [],
      homeworkUrl: s.primary_assignment_id
        ? `/api/learning-assignments/${s.primary_assignment_id}/download?branded=true`
        : null,
      sessionUrl: String(s.delivery_context || '').toLowerCase() === 'in_person'
        ? `/in-person-tutoring-session/${s.id}`
        : `/tutoring-session/${s.id}`
    };
  });
};

const openTutoringSession = (summary) => {
  if (!summary?.sessionUrl) return;
  router.push(summary.sessionUrl);
};

const downloadBrandedHomework = (summary) => {
  if (!summary?.homeworkUrl) {
    alert('Homework is still being generated by the AI tutor. It will appear here as soon as the session analysis completes.');
    return;
  }
  window.open(summary.homeworkUrl, '_blank');
};

const formatStandardChip = (s) => {
  if (!s) return '';
  if (typeof s === 'string') return s;
  const parts = [];
  if (s.cas) parts.push(`CAS ${s.cas}`);
  if (s.ccss) parts.push(s.ccss);
  if (s.usdoe && !parts.length) parts.push(s.usdoe);
  return parts.join(' · ');
};

const loadGuardianDailyNotes = async () => {
  const clientId = selectedChildId.value;
  const date = guardianNoteDate.value;
  if (!clientId || !date) {
    guardianDailyNotes.value = [];
    return;
  }
  guardianNotesLoading.value = true;
  try {
    const { data } = await api.get(`/clients/${clientId}/daily-notes`, { params: { note_date: date } });
    guardianDailyNotes.value = data?.notes ?? [];
  } catch {
    guardianDailyNotes.value = [];
  } finally {
    guardianNotesLoading.value = false;
  }
};
const formatNoteTime = (dt) => {
  if (!dt) return '';
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

watch(selectedChildId, (id) => {
  void loadIntakeSignedDocumentsForChild();
  void loadSelectedChildLearningProgress();
  if (id) {
    guardianNoteDate.value = new Date().toISOString().slice(0, 10);
    loadGuardianDailyNotes();
  } else {
    guardianDailyNotes.value = [];
  }
}, { immediate: true });

watch(
  dashboardTabs,
  (tabs) => {
    const allowedKeys = new Set((tabs || []).map((tab) => String(tab?.key || '')));
    // Extra panels outside dashboardTabs
    allowedKeys.add('contact');
    allowedKeys.add('billing');
    allowedKeys.add('payment_methods');
    allowedKeys.add('dependents');
    allowedKeys.add('messages');
    allowedKeys.add('account');
    if (!allowedKeys.has(activePanel.value)) {
      activePanel.value = standardsLearningVisible.value && allowedKeys.has('tutoring')
        ? 'tutoring'
        : 'overview';
    }
  },
  { immediate: true }
);

watch(
  standardsLearningVisible,
  (visible) => {
    if (visible && activePanel.value === 'overview') {
      activePanel.value = 'tutoring';
    }
  },
  { immediate: true }
);

const openComingSoon = (key) => {
  comingSoonKey.value = String(key || '');
};

const closeComingSoon = () => {
  comingSoonKey.value = '';
};

onMounted(async () => {
  await fetchOverview();
  fetchGenEvents();
});

watch(
  () => agencyStore.currentAgency?.id,
  () => {
    void loadSelectedChildLearningProgress();
  }
);
</script>

<style scoped>
.portal-client-summary{display:flex;align-items:center;gap:28px;padding:26px;background:white;border:1px solid #e2eaf4;border-radius:12px;margin-bottom:24px;box-shadow:0 3px 14px #193e7310;flex-wrap:wrap}.portal-client-identity{display:flex;align-items:center;gap:20px;flex:1;min-width:220px}.client-portrait{width:78px;height:78px;border-radius:50%;background:var(--portal-tint);color:var(--portal-accent);display:grid;place-items:center;font-size:27px;font-weight:700;flex-shrink:0}.portal-client-identity h2{font-size:23px;letter-spacing:-.5px;margin:0}.portal-client-identity p{color:#596d87;margin:5px 0 10px}.client-status{font-size:12px;padding:5px 10px;background:#edf5f2;color:#24614e;border-radius:20px}.portal-client-picker{font-size:12px;color:#526784;display:grid;gap:7px}.portal-client-picker select{padding:10px 12px;border:1px solid #d7e2ee;border-radius:7px;max-width:250px;color:#233957;background:white;font:inherit;font-size:14px}.portal-program-picker{display:grid;gap:10px;max-width:220px;min-width:0}.portal-program-picker :deep(.program-selector){min-width:0;width:100%}.portal-program-picker :deep(.selector-group){min-width:0;width:100%}.portal-program-picker :deep(select){min-width:0;max-width:100%;width:100%}.guardian-layout{display:block!important}.guardian-detail{display:block!important}.guardian-panel{border:0!important;background:transparent!important;padding:0!important;box-shadow:none!important}.guardian-panel :deep(.family-billing),.guardian-panel :deep(.family-ledger){color:#233653}.guardian-panel :deep(h3){color:#162b4b}.guardian-panel :deep(.billing-card){border-color:#e2eaf4;border-radius:12px;box-shadow:0 3px 14px #193e7310}.guardian-panel :deep(button){border-radius:8px}.guardian-panel :deep(.btn-primary){background:var(--portal-accent);color:var(--portal-on-accent);border-color:var(--portal-accent)}
@media(max-width:760px){.portal-client-summary{padding:18px;gap:18px}.portal-client-identity{min-width:0;flex-basis:100%}.client-portrait{width:60px;height:60px;font-size:22px}.portal-client-identity h2{font-size:21px}.portal-client-picker{flex:1;min-width:0}.portal-client-picker select{width:100%;max-width:100%}.portal-program-picker{max-width:100%;flex:1;min-width:130px}}

.guardian-dashboard {
  padding: 20px;
}

.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.name {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.guardian-brand-cluster {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.guardian-brand-unit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 6px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(244, 114, 65, 0.16);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  max-width: min(320px, 100%);
}

.guardian-brand-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
  flex-shrink: 0;
}

.guardian-brand-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(249, 115, 22, 0.12);
  color: #9a3412;
  font-weight: 800;
  font-size: 13px;
  flex-shrink: 0;
}

.guardian-brand-label {
  font-weight: 700;
  font-size: 13px;
  color: #7c2d12;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guardian-brand-sep {
  width: 1px;
  height: 28px;
  background: rgba(148, 163, 184, 0.45);
  flex-shrink: 0;
}

.guardian-preview-surface {
  margin-top: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.loading {
  color: var(--text-secondary);
}

.error {
  color: #b91c1c;
}

.layout {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.guardian-header-badge {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(244, 114, 65, 0.16);
  color: #7c2d12;
  font-weight: 700;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.guardian-layout {
  gap: 18px;
}

.guardian-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr);
  gap: 18px;
  padding: 28px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.95), transparent 40%),
    linear-gradient(135deg, #fff4e8 0%, #ffe1dc 42%, #eef6ff 100%);
  border: 1px solid rgba(244, 114, 65, 0.16);
  box-shadow: 0 28px 50px rgba(15, 23, 42, 0.09);
}

.guardian-eyebrow,
.overview-card-kicker,
.guardian-alert-label,
.guardian-spotlight-kicker {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 800;
  color: #c2410c;
}

.guardian-hero-title {
  margin: 10px 0 8px;
  font-size: clamp(2rem, 3vw, 3rem);
  line-height: 1;
  color: #1f2a44;
}

.guardian-hero-subtitle {
  max-width: 620px;
  margin: 0;
  color: #52607a;
  font-size: 15px;
}

.guardian-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.guardian-stat-card {
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.guardian-stat-card--accent {
  background: linear-gradient(135deg, rgba(251, 146, 60, 0.16), rgba(255, 255, 255, 0.92));
  border-color: rgba(249, 115, 22, 0.22);
}

.guardian-stat-value {
  font-size: 28px;
  font-weight: 800;
  color: #1f2a44;
}

.guardian-stat-label {
  margin-top: 6px;
  color: #667085;
  font-size: 13px;
}

.guardian-hero-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.guardian-toolbar,
.guardian-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.guardian-spotlight-card,
.overview-card,
.overview-section,
.guardian-alert-card {
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
}

.guardian-spotlight-card {
  padding: 20px;
}

.guardian-spotlight-head,
.overview-card-head,
.overview-section-head,
.family-card-head,
.program-card-head,
.event-overview-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.guardian-spotlight-title,
.overview-section h3,
.overview-card h3 {
  margin: 6px 0 0;
  color: #1f2a44;
  font-size: 22px;
}

.guardian-spotlight-copy {
  margin: 10px 0 0;
  color: #52607a;
}

.guardian-alert-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.guardian-alert-card {
  padding: 18px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.guardian-alert-card:hover,
.quick-action-card:hover,
.family-card:hover,
.program-card:hover,
.event-overview-card:hover,
.guardian-tab:hover {
  transform: translateY(-2px);
  box-shadow: 0 22px 34px rgba(15, 23, 42, 0.1);
}

.guardian-alert-card--warm {
  background: linear-gradient(135deg, rgba(255, 237, 213, 0.95), rgba(255, 255, 255, 0.98));
}

.guardian-alert-card--cool {
  background: linear-gradient(135deg, rgba(224, 242, 254, 0.95), rgba(255, 255, 255, 0.98));
}

.guardian-alert-card--ink {
  background: linear-gradient(135deg, rgba(238, 242, 255, 0.96), rgba(255, 255, 255, 0.98));
}

.guardian-alert-title {
  margin-top: 10px;
  font-size: 20px;
  font-weight: 800;
  color: #1f2a44;
}

.guardian-alert-copy {
  margin-top: 8px;
  color: #52607a;
  font-size: 14px;
}

.guardian-workspace-tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.guardian-tab {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.88);
  color: inherit;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.guardian-tab.active {
  border-color: rgba(59, 130, 246, 0.3);
  background: linear-gradient(135deg, rgba(219, 234, 254, 0.92), rgba(255, 255, 255, 0.96));
}

.guardian-tab-subtle {
  background: rgba(248, 250, 252, 0.9);
}

.guardian-tab-label {
  font-weight: 800;
  color: #1f2a44;
}

.guardian-tab-meta {
  font-size: 12px;
  color: #667085;
}

.guardian-detail,
.guardian-panel {
  width: 100%;
}

.guardian-panel {
  padding: 22px;
  border-radius: 26px;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
  gap: 14px;
}

.overview-card,
.overview-section {
  padding: 18px;
}

.quick-actions-grid,
.family-card-grid,
.program-card-grid,
.event-card-grid {
  display: grid;
  gap: 12px;
}

.quick-actions-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 14px;
}

.family-card-grid,
.program-card-grid,
.event-card-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.quick-action-card,
.family-card,
.program-card,
.event-overview-card {
  width: 100%;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(248, 250, 252, 0.94);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.quick-action-title,
.family-card-title,
.program-card-title,
.event-overview-title {
  font-weight: 800;
  color: #1f2a44;
}

.quick-action-copy,
.family-card-sub,
.program-card-copy,
.event-overview-meta {
  margin-top: 6px;
  color: #52607a;
  font-size: 14px;
}

.family-card--selected,
.program-card--active {
  border-color: rgba(59, 130, 246, 0.35);
  background: linear-gradient(135deg, rgba(219, 234, 254, 0.88), rgba(255, 255, 255, 0.96));
}

.family-card-meta,
.family-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.family-card-link {
  font-size: 13px;
  font-weight: 700;
  color: #2563eb;
}

.family-card-link-muted {
  color: #667085;
}

.guardian-chip,
.guardian-tone-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.guardian-chip {
  background: rgba(241, 245, 249, 0.92);
  color: #475467;
}

.guardian-chip-muted {
  background: rgba(248, 250, 252, 1);
  color: #667085;
}

.guardian-tone-pill {
  border: 1px solid transparent;
}

.tone-good {
  background: rgba(220, 252, 231, 0.95);
  color: #166534;
  border-color: rgba(34, 197, 94, 0.2);
}

.tone-warn {
  background: rgba(254, 243, 199, 0.96);
  color: #92400e;
  border-color: rgba(245, 158, 11, 0.2);
}

.tone-bad {
  background: rgba(254, 226, 226, 0.96);
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.2);
}

.tone-muted {
  background: rgba(241, 245, 249, 0.95);
  color: #667085;
  border-color: rgba(148, 163, 184, 0.2);
}

.guardian-insight-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.guardian-insight-list li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.guardian-insight-list strong {
  font-size: 22px;
  color: #1f2a44;
}

.overview-section {
  margin-top: 14px;
}

.empty-state {
  color: var(--text-secondary);
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.hint {
  font-size: 13px;
}

.learning-progress-block {
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-alt);
}

.learning-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.learning-progress-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.learning-progress-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}

.upcoming-sessions-card {
  border-color: rgba(99, 102, 241, 0.35);
  background: rgba(99, 102, 241, 0.03);
}

.book-sessions-card {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.03);
}

.book-sessions-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.book-sessions-provider {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.book-sessions-meta {
  margin-top: 2px;
}

.upcoming-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #6366f1;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 6px;
  vertical-align: middle;
}

.upcoming-list {
  padding-left: 0;
  list-style: none;
}

.upcoming-session-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(99, 102, 241, 0.15);
}

.upcoming-session-row:last-child {
  border-bottom: none;
}

.upcoming-session-info {
  font-size: 14px;
}

.upcoming-session-meta {
  font-size: 12px;
  color: #6b7280;
}

.upcoming-launch-btn {
  align-self: flex-start;
  margin-top: 6px;
  background: #6366f1;
  border-color: #6366f1;
  color: #fff;
}

.upcoming-launch-btn:hover {
  background: #4f46e5;
  border-color: #4f46e5;
}

.learning-progress-card-title {
  font-weight: 700;
  margin-bottom: 6px;
}

.learning-progress-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tutoring-chip {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.tutoring-chip-success {
  background: rgba(16, 185, 129, 0.12);
  color: #065f46;
  border-color: rgba(16, 185, 129, 0.35);
}

.tutoring-chip-warn {
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
  border-color: rgba(245, 158, 11, 0.35);
}

.top-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.top-card--full {
  grid-column: 1 / -1;
}

.reg-events-summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reg-events-summary-link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  text-decoration: none;
  color: inherit;
  background: var(--bg-alt);
  transition: border-color 0.15s ease;
}
button.reg-events-summary-link {
  width: 100%;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.reg-events-summary-link:hover {
  border-color: var(--primary);
}

.re-title {
  font-weight: 700;
  font-size: 14px;
}

.re-meta {
  font-size: 12px;
}

.re-enrolled {
  font-size: 11px;
}

@keyframes sb-card-pulse-glow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.35);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.12);
  }
}

.sb-g-card--pulse {
  animation: sb-card-pulse-glow 2s ease-in-out infinite;
  border-color: var(--primary);
}

@media (prefers-reduced-motion: reduce) {
  .sb-g-card--pulse {
    animation: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  }
}
.sb-g-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sb-g-card {
  display: block;
  text-decoration: none;
  color: inherit;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-alt);
  transition: border-color 0.15s ease;
}
button.sb-g-card {
  width: 100%;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.sb-g-card:hover {
  border-color: var(--primary);
}
.sb-g-card-past {
  opacity: 0.92;
}
.sb-g-title {
  font-weight: 800;
  font-size: 14px;
}
.sb-g-meta {
  font-size: 12px;
  margin-top: 2px;
}
.sb-g-past {
  margin-top: 10px;
}
.sb-g-past-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary);
}
@media (max-width: 900px) {
  .guardian-hero,
  .overview-grid {
    grid-template-columns: 1fr;
  }

  .guardian-stat-grid,
  .guardian-alert-grid,
  .quick-actions-grid {
    grid-template-columns: 1fr 1fr;
  }

  .top-cards {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .guardian-dashboard {
    padding: 14px;
  }

  .header {
    align-items: flex-start;
  }

  .guardian-hero {
    padding: 20px;
    border-radius: 22px;
  }

  .guardian-stat-grid,
  .guardian-alert-grid,
  .quick-actions-grid,
  .guardian-workspace-tabs {
    grid-template-columns: 1fr;
  }
}

.top-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.top-card-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.top-card-desc {
  color: var(--text-secondary);
}

.panel-inline-actions {
  margin-bottom: 10px;
}

.guardian-checkin-hint {
  margin-top: 12px;
}

.guardian-daily-notes {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}

.guardian-notes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.guardian-note-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  font-size: 13px;
  background: var(--bg-muted, #f8f9fa);
  border-radius: 6px;
}

.guardian-note-initials {
  font-weight: 700;
  color: var(--primary);
  flex-shrink: 0;
}

.guardian-note-message {
  flex: 1;
}

.guardian-note-time {
  color: var(--text-secondary);
  font-size: 12px;
  flex-shrink: 0;
  font-size: 13px;
}

.main {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 14px;
  align-items: start;
}

.rail {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  box-shadow: var(--shadow-sm);
}

.rail-section + .rail-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.rail-heading {
  font-weight: 800;
  color: var(--text-primary);
  font-size: 12px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.rail-card {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 12px;
  padding: 10px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 8px;
}

a.rail-card {
  display: block;
  text-decoration: none;
  color: inherit;
  box-sizing: border-box;
}

.rail-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.rail-card.active {
  border-color: var(--primary);
  background: rgba(79, 70, 229, 0.06);
}

.rail-card--pulse {
  animation: sb-card-pulse-glow 2s ease-in-out infinite;
}

.rail-card--locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.locked-banner {
  padding: 10px 12px;
  background: var(--bg-muted, #f1f5f9);
  border-radius: 8px;
  margin-bottom: 14px;
  font-size: 14px;
  line-height: 1.45;
}

.intake-docs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intake-docs-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.intake-doc-title {
  font-weight: 600;
  font-size: 14px;
}

.rail-card-coming-soon {
  opacity: 0.92;
}

.rail-card-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.rail-card-sub {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  font-size: 12px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 8px;
  color: var(--text-secondary);
}

.pill-muted {
  background: var(--bg-alt);
}

.detail .panel {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.panel-head {
  margin-bottom: 12px;
}

.panel-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.panel-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.child-details {
  display: grid;
  gap: 10px;
}

.row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px;
  align-items: baseline;
}

.label {
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.value {
  color: var(--text-primary);
  font-weight: 600;
}

.link {
  color: var(--primary);
  font-weight: 700;
  text-decoration: none;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 50;
}

.modal {
  width: 100%;
  max-width: 560px;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.btn-close {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 14px;
  color: var(--text-secondary);
}

.modal-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-wide {
  max-width: 640px;
}

.reg-catalog-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.reg-catalog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.reg-catalog-title {
  font-weight: 800;
  font-size: 15px;
  color: var(--text-primary);
}

.reg-catalog-sub {
  font-size: 13px;
  margin: 4px 0 0;
}

.reg-catalog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reg-catalog-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}

.reg-catalog-item-title {
  font-weight: 700;
  font-size: 14px;
}

.reg-catalog-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.reg-self-stub {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.reg-self-title {
  font-weight: 700;
  font-size: 14px;
}

.reg-enroll-check {
  margin: 6px 0;
  font-size: 14px;
}

.reg-enroll-check label {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 980px) {
  .main {
    grid-template-columns: 1fr;
  }
}
</style>
