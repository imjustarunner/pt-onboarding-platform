<template>
  <div class="guardian-dashboard">
    <div class="header">
      <div class="title">
        <div class="name">Guardian portal</div>
        <div class="subtitle">
          A family-facing space for registrations, paperwork, billing, and day-to-day program updates.
        </div>
      </div>

      <div v-if="currentAgencyName" class="header-actions">
        <span class="guardian-header-badge">{{ currentAgencyName }}</span>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading your dashboard…</div>

    <div v-else class="layout guardian-layout">
      <section class="guardian-hero">
        <div class="guardian-hero-copy">
          <div class="guardian-eyebrow">Guardian Portal</div>
          <h1 class="guardian-hero-title">Family dashboard</h1>
          <p class="guardian-hero-subtitle">
            Keep registrations, child details, billing, paperwork, and program updates in one clear place.
          </p>

          <div class="guardian-stat-grid">
            <div class="guardian-stat-card">
              <div class="guardian-stat-value">{{ children.length }}</div>
              <div class="guardian-stat-label">Dependents</div>
            </div>
            <div class="guardian-stat-card">
              <div class="guardian-stat-value">{{ programs.length }}</div>
              <div class="guardian-stat-label">Programs</div>
            </div>
            <div class="guardian-stat-card">
              <div class="guardian-stat-value">{{ totalEnrolledEventCount }}</div>
              <div class="guardian-stat-label">Enrolled events</div>
            </div>
            <div class="guardian-stat-card guardian-stat-card--accent">
              <div class="guardian-stat-value">{{ upcomingRegistrationCount }}</div>
              <div class="guardian-stat-label">Open registrations</div>
            </div>
          </div>
        </div>

        <div class="guardian-hero-side">
          <div class="guardian-toolbar">
            <GuardianProgramSelector :programs="programs" />
            <button class="btn btn-secondary btn-sm" type="button" @click="refreshAll" :disabled="loading">
              Refresh
            </button>
          </div>

          <div class="guardian-spotlight-card">
            <div class="guardian-spotlight-head">
              <div>
                <div class="guardian-spotlight-kicker">Selected child</div>
                <div class="guardian-spotlight-title">
                  {{ selectedChild ? childDisplayName(selectedChild) : 'Choose a child to get started' }}
                </div>
              </div>
              <span v-if="selectedChild" :class="['guardian-tone-pill', docStatusTone(selectedChild.document_status)]">
                {{ formatDocStatus(selectedChild.document_status) }}
              </span>
            </div>
            <p class="guardian-spotlight-copy">
              <template v-if="selectedChild">
                {{ selectedChild.organization_name }} · {{ selectedChild.relationship_title || 'Guardian' }}
              </template>
              <template v-else>
                Your dashboard is ready. Pick a dependent to jump into waivers, notes, and documents.
              </template>
            </p>
            <div class="guardian-hero-actions">
              <button
                v-if="selectedChild"
                type="button"
                class="btn btn-primary btn-sm"
                @click="activePanel = 'child'"
              >
                Open child details
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                @click="activePanel = 'registrations'"
              >
                View registrations
              </button>
              <router-link
                v-if="selectedChild && !selectedChild.guardian_portal_locked"
                class="btn btn-secondary btn-sm"
                :to="guardianWaiversLink"
              >
                Waivers &amp; safety
              </router-link>
              <button
                v-if="learningBillingVisible && selectedChild && !selectedChild.guardian_portal_locked"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="activePanel = 'billing'"
              >
                Billing
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="guardian-alert-grid">
        <button type="button" class="guardian-alert-card guardian-alert-card--warm" @click="activePanel = 'registrations'">
          <div class="guardian-alert-label">Action center</div>
          <div class="guardian-alert-title">
            {{ upcomingRegistrationCount ? `${upcomingRegistrationCount} registration${upcomingRegistrationCount === 1 ? '' : 's'} open now` : 'No open registrations right now' }}
          </div>
          <div class="guardian-alert-copy">
            Review available enrollments and claim spots directly from your dashboard.
          </div>
        </button>

        <button
          type="button"
          class="guardian-alert-card guardian-alert-card--cool"
          :disabled="!selectedChild"
          @click="selectedChild ? activePanel = 'child' : null"
        >
          <div class="guardian-alert-label">Child snapshot</div>
          <div class="guardian-alert-title">
            {{ selectedChild ? formatClientStatus(selectedChild.status) : 'Select a child' }}
          </div>
          <div class="guardian-alert-copy">
            {{ selectedChild
              ? `${childDisplayName(selectedChild)} · ${formatDocStatus(selectedChild.document_status)} documents`
              : 'Choose a dependent to review notes, paperwork, and progress.' }}
          </div>
        </button>

        <button
          type="button"
          class="guardian-alert-card guardian-alert-card--ink"
          :disabled="!totalEnrolledEventCount"
          @click="activePanel = 'overview'"
        >
          <div class="guardian-alert-label">Enrolled programs</div>
          <div class="guardian-alert-title">
            {{ totalEnrolledEventCount ? `${totalEnrolledEventCount} active event${totalEnrolledEventCount === 1 ? '' : 's'}` : 'No active events yet' }}
          </div>
          <div class="guardian-alert-copy">
            Open schedules, event details, and program workspaces from the overview below.
          </div>
        </button>
      </section>

      <div v-if="programs.length === 0 && children.length === 0" class="empty-state">
        <p>No children or programs are linked to this guardian account yet.</p>
        <p class="hint">Ask your organization to add you as a guardian on the child’s record.</p>
      </div>

      <template v-else>
        <div class="guardian-workspace-tabs">
          <button
            v-for="tab in dashboardTabs"
            :key="tab.key"
            type="button"
            class="guardian-tab"
            :class="{ active: activePanel === tab.key }"
            @click="activePanel = tab.key"
          >
            <span class="guardian-tab-label">{{ tab.label }}</span>
            <span class="guardian-tab-meta">{{ tab.meta }}</span>
          </button>

          <router-link
            v-if="selectedChild && !selectedChild.guardian_portal_locked"
            class="guardian-tab guardian-tab-link"
            :to="guardianWaiversLink"
          >
            <span class="guardian-tab-label">Waivers &amp; safety</span>
            <span class="guardian-tab-meta">Forms and pickup details</span>
          </router-link>

          <button type="button" class="guardian-tab guardian-tab-subtle" @click="openComingSoon('contact')">
            <span class="guardian-tab-label">Contact</span>
            <span class="guardian-tab-meta">Coming soon</span>
          </button>
        </div>

        <div class="detail guardian-detail">
          <div class="panel guardian-panel">
            <template v-if="activePanel === 'overview'">
              <div class="panel-head">
                <div class="panel-title">Family overview</div>
                <div class="panel-subtitle">{{ currentProgramSummary }}</div>
              </div>

              <template v-if="selectedInlineEvent">
                <div class="panel-inline-actions">
                  <button type="button" class="btn btn-secondary btn-sm" @click="selectedInlineEvent = null">
                    Back to dashboard
                  </button>
                </div>
                <GuardianSkillBuildersEventView
                  :event-id-prop="selectedInlineEvent.eventId"
                  :program-event-mode="selectedInlineEvent.programMode"
                  :inline="true"
                  :hide-actions="true"
                />
              </template>

              <template v-else>
                <div class="overview-grid">
                  <section class="overview-card overview-card--feature">
                    <div class="overview-card-head">
                      <div>
                        <div class="overview-card-kicker">Quick actions</div>
                        <h3>Everything a guardian needs, right here</h3>
                      </div>
                    </div>
                    <div class="quick-actions-grid">
                      <button type="button" class="quick-action-card" @click="activePanel = 'registrations'">
                        <div class="quick-action-title">Register for programs</div>
                        <div class="quick-action-copy">{{ upcomingRegistrationRailSubtitle }}</div>
                      </button>
                      <button type="button" class="quick-action-card" @click="activePanel = 'documents'">
                        <div class="quick-action-title">Documents</div>
                        <div class="quick-action-copy">Forms, signatures, and required paperwork.</div>
                      </button>
                      <button type="button" class="quick-action-card" @click="activePanel = 'dependents'">
                        <div class="quick-action-title">Dependents</div>
                        <div class="quick-action-copy">Emergency contacts, allergies, and health info.</div>
                      </button>
                      <button type="button" class="quick-action-card" @click="activePanel = 'payment_methods'">
                        <div class="quick-action-title">Payment &amp; insurance</div>
                        <div class="quick-action-copy">Saved cards and insurance details on file.</div>
                      </button>
                    </div>
                  </section>

                  <section class="overview-card">
                    <div class="overview-card-kicker">At a glance</div>
                    <h3>What needs attention</h3>
                    <ul class="guardian-insight-list">
                      <li>
                        <strong>{{ pendingDocumentCount }}</strong>
                        <span>dependent{{ pendingDocumentCount === 1 ? '' : 's' }} not fully approved</span>
                      </li>
                      <li>
                        <strong>{{ sbUpcomingGrouped.length }}</strong>
                        <span>Skill Builders event{{ sbUpcomingGrouped.length === 1 ? '' : 's' }} upcoming</span>
                      </li>
                      <li>
                        <strong>{{ genCurrentEvents.length }}</strong>
                        <span>general program event{{ genCurrentEvents.length === 1 ? '' : 's' }} active</span>
                      </li>
                    </ul>
                  </section>
                </div>

                <section class="overview-section">
                  <div class="overview-section-head">
                    <div>
                      <div class="overview-card-kicker">Dependents</div>
                      <h3>Your family roster</h3>
                    </div>
                  </div>
                  <div class="family-card-grid">
                    <button
                      v-for="c in children"
                      :key="`family-${c.client_id}`"
                      type="button"
                      class="family-card"
                      :class="{ 'family-card--selected': Number(selectedChildId) === Number(c.client_id) }"
                      @click="openChild(c)"
                    >
                      <div class="family-card-head">
                        <div>
                          <div class="family-card-title">{{ childDisplayName(c) }}</div>
                          <div class="family-card-sub">{{ c.organization_name }}</div>
                        </div>
                        <span :class="['guardian-tone-pill', c.guardian_portal_locked ? 'tone-muted' : docStatusTone(c.document_status)]">
                          {{ c.guardian_portal_locked ? '18+ locked' : formatDocStatus(c.document_status) }}
                        </span>
                      </div>
                      <div class="family-card-meta">
                        <span class="guardian-chip">{{ c.relationship_title || 'Guardian' }}</span>
                        <span class="guardian-chip guardian-chip-muted">{{ formatClientStatus(c.status) }}</span>
                        <span v-if="c.initials" class="guardian-chip guardian-chip-muted">{{ c.initials }}</span>
                      </div>
                      <div class="family-card-actions">
                        <span class="family-card-link">Open details</span>
                        <span v-if="!c.guardian_portal_locked" class="family-card-link family-card-link-muted">Waivers available</span>
                      </div>
                    </button>
                  </div>
                </section>

                <section class="overview-section">
                  <div class="overview-section-head">
                    <div>
                      <div class="overview-card-kicker">Programs</div>
                      <h3>Current programs</h3>
                    </div>
                  </div>
                  <div class="program-card-grid">
                    <button
                      v-for="p in programs"
                      :key="`program-${p.id}`"
                      type="button"
                      class="program-card"
                      :class="{ 'program-card--active': isActiveProgram(p) }"
                      @click="openProgramWorkspace(p)"
                    >
                      <div class="program-card-head">
                        <div class="program-card-title">{{ p.name || 'Program' }}</div>
                        <span class="guardian-chip">{{ formatOrgType(p.organization_type) }}</span>
                      </div>
                      <div class="program-card-copy">
                        {{ programChildrenLine(p) || 'Select this program to focus your dashboard.' }}
                      </div>
                    </button>
                  </div>
                </section>

                <section class="overview-section">
                  <div class="overview-section-head">
                    <div>
                      <div class="overview-card-kicker">Enrolled events</div>
                      <h3>Programs and sessions you can open</h3>
                    </div>
                  </div>
                  <div v-if="programOverviewEvents.length" class="event-card-grid">
                    <button
                      v-for="evt in programOverviewEvents"
                      :key="evt.key"
                      type="button"
                      class="event-overview-card"
                      @click="openInlineEventFromWorkspace(evt)"
                    >
                      <div class="event-overview-card-head">
                        <div class="event-overview-title">{{ evt.title }}</div>
                        <span class="guardian-chip guardian-chip-muted">
                          {{ evt.programMode ? 'Program event' : 'Skill Builders' }}
                        </span>
                      </div>
                      <div class="event-overview-meta">{{ evt.metaPrimary }}</div>
                      <div class="event-overview-meta muted">{{ evt.metaSecondary }}</div>
                    </button>
                  </div>
                  <p v-else class="hint">No active or upcoming enrolled events right now.</p>
                </section>

                <section v-if="currentAgencyId" class="overview-section overview-section--catalog">
                  <div class="overview-section-head">
                    <div>
                      <div class="overview-card-kicker">Registration spotlight</div>
                      <h3>Register for upcoming programs</h3>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" :disabled="regCatalogLoading" @click="fetchRegistrationCatalog">
                      {{ regCatalogLoading ? 'Loading…' : 'Refresh' }}
                    </button>
                  </div>
                  <div v-if="regCatalogError" class="error" style="font-size: 13px;">{{ regCatalogError }}</div>
                  <ul v-else-if="registrationPreviewItems.length" class="reg-catalog-list">
                    <li v-for="item in registrationPreviewItems" :key="`${item.kind}-${item.id}`" class="reg-catalog-row">
                      <div class="reg-catalog-meta">
                        <div class="reg-catalog-item-title">{{ item.title }}</div>
                        <div class="muted small">{{ registrationKindLabel(item.kind) }} · {{ formatRegistrationWhen(item) }}</div>
                        <div v-if="item.medicaidEligible || item.cashEligible" class="muted small">
                          {{ registrationPayerLine(item) }}
                        </div>
                      </div>
                      <div class="reg-catalog-actions">
                        <button type="button" class="btn btn-primary btn-sm" @click="openRegistrationEnroll(item)">Register</button>
                      </div>
                    </li>
                  </ul>
                  <div v-else class="hint">Nothing is open for registration right now.</div>
                </section>
              </template>
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
              <DocumentsTab />
            </template>

            <template v-else-if="activePanel === 'child'">
              <div class="panel-head">
                <div class="panel-title">Child</div>
                <div class="panel-subtitle">Details and daily notes for the selected child.</div>
              </div>
              <div v-if="selectedChild" class="child-panel-content">
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
                  </template>
                </div>

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
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="activePanel === 'billing'">
              <div class="panel-head">
                <div class="panel-title">Billing</div>
                <div class="panel-subtitle">Learning-program-only billing for the selected child.</div>
              </div>
              <GuardianBillingTab
                :agency-id="currentAgencyId"
                :client-id="selectedChildId"
              />
            </template>

            <template v-else-if="activePanel === 'dependents'">
              <div class="panel-head">
                <div class="panel-title">Dependents</div>
                <div class="panel-subtitle">Health, allergy, and emergency contact information for each child on your account.</div>
              </div>
              <GuardianDependentsTab
                :agency-id="currentAgencyId"
                :guardian-user-id="authStore.user?.id"
              />
            </template>

            <template v-else-if="activePanel === 'payment_methods'">
              <div class="panel-head">
                <div class="panel-title">Payment &amp; Insurance</div>
                <div class="panel-subtitle">Saved payment methods and insurance information on file.</div>
              </div>
              <GuardianPaymentInsuranceTab
                :agency-id="currentAgencyId"
                :guardian-user-id="authStore.user?.id"
              />
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import DocumentsTab from '../../components/dashboard/DocumentsTab.vue';
import GuardianProgramSelector from '../../components/GuardianProgramSelector.vue';
import GuardianBillingTab from '../../components/guardian/GuardianBillingTab.vue';
import GuardianPaymentInsuranceTab from '../../components/guardian/GuardianPaymentInsuranceTab.vue';
import GuardianDependentsTab from '../../components/guardian/GuardianDependentsTab.vue';
import GuardianSkillBuildersEventView from './GuardianSkillBuildersEventView.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();

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

const activePanel = ref('overview');
const selectedChildId = ref(null);
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

const selectedChildFullName = computed(() => {
  const n = String(selectedChild.value?.full_name || '').trim();
  return n || '';
});

const currentAgencyName = computed(() => String(agencyStore.currentAgency?.name || '').trim() || '');

const dashboardTabs = computed(() => {
  const tabs = [
    { key: 'overview', label: 'Overview', meta: 'Home base' },
    { key: 'registrations', label: 'Registrations', meta: upcomingRegistrationRailSubtitle.value },
    { key: 'documents', label: 'Documents', meta: 'Forms and signatures' }
  ];
  if (selectedChild.value) {
    tabs.push({
      key: 'child',
      label: 'Child details',
      meta: childDisplayName(selectedChild.value)
    });
  }
  if (learningBillingVisible.value) {
    tabs.push({ key: 'billing', label: 'Billing', meta: 'Learning program charges' });
  }
  tabs.push(
    { key: 'dependents', label: 'Dependents', meta: 'Health and emergency info' },
    { key: 'payment_methods', label: 'Payment & insurance', meta: 'Cards and coverage' },
    { key: 'account', label: 'Account', meta: 'Profile and security' }
  );
  return tabs;
});

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
  if (!aid) {
    sbEvents.value = [];
    return;
  }
  sbLoading.value = true;
  sbError.value = '';
  try {
    const resp = await api.get('/guardian-portal/skill-builders/events', {
      params: { agencyId: aid },
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
    const resp = await api.get('/guardian-portal/company-events', { skipGlobalLoading: true });
    genEvents.value = Array.isArray(resp.data?.events) ? resp.data.events : [];
  } catch (err) {
    genError.value = err.response?.data?.error?.message || 'Could not load enrolled events';
    genEvents.value = [];
  } finally {
    genLoading.value = false;
  }
};

const fetchRegistrationCatalog = async () => {
  if (!(programs.value || []).length) {
    regCatalogItems.value = [];
    return;
  }
  regCatalogLoading.value = true;
  regCatalogError.value = '';
  try {
    const resp = await api.get('/guardian-portal/registration/catalog', { skipGlobalLoading: true });
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
  const aid = Number(item?.agencyId || agencyStore.currentAgency?.id || 0);
  if (!aid) return;
  try {
    const resp = await api.get('/guardian-portal/dependents', {
      params: { agencyId: aid },
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
    const resp = await api.get('/guardian-portal/overview');
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

const loadSelectedChildLearningProgress = async () => {
  const clientId = Number(selectedChildId.value || 0);
  if (!clientId || !standardsLearningVisible.value) {
    learningDomainRows.value = [];
    learningGoalRows.value = [];
    learningRecommendationRows.value = [];
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
