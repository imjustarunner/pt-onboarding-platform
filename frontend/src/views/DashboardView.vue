<template>
  <div class="container" :class="{ 'container-wide': activeTab === 'my_schedule' }">
    <!-- Dashboard Header with Logo (shown in preview mode) -->
    <div v-if="previewMode" class="dashboard-header-preview">
      <div class="header-content">
        <BrandingLogo v-if="previewAgencyLogoUrl" size="large" class="dashboard-logo" :logo-url="previewAgencyLogoUrl" />
        <div>
          <h1 data-tour="dash-header-title">{{ isPending ? 'Pre-Hire Checklist' : 'My Dashboard' }}</h1>
        </div>
      </div>
    </div>
    <div v-else class="dashboard-header-user">
      <h1 data-tour="dash-header-title">{{ isPending ? 'Pre-Hire Checklist' : 'My Dashboard' }}</h1>
      <span class="badge badge-user">Personal</span>
      <span v-if="tierBadgeText" class="badge badge-tier" :class="tierBadgeKind">{{ tierBadgeText }}</span>
      <button
        type="button"
        class="btn btn-secondary btn-sm tutorial-toggle"
        :class="{ active: tutorialStore.enabled }"
        :aria-pressed="tutorialStore.enabled ? 'true' : 'false'"
        @click="tutorialStore.setEnabled(!tutorialStore.enabled)"
        title="Turn tutorials on/off"
      >
        Tutorial {{ tutorialStore.enabled ? 'On' : 'Off' }}
      </button>
    </div>

    <!-- Agency announcement banner (Dashboard) -->
    <div v-if="!previewMode && dashboardBannerTexts.length > 0" class="agency-announcement-banner">
      <div class="agency-announcement-inner">
        <div class="agency-announcement-track" aria-label="Agency announcements banner">
          <span v-for="(t, idx) in dashboardBannerTexts" :key="`${idx}-${t.slice(0, 16)}`" class="agency-announcement-item">
            {{ t }}
            <span class="sep" aria-hidden="true"> • </span>
          </span>
          <!-- Repeat once to ensure continuous scroll -->
          <span v-for="(t, idx) in dashboardBannerTexts" :key="`r-${idx}-${t.slice(0, 16)}`" class="agency-announcement-item">
            {{ t }}
            <span class="sep" aria-hidden="true"> • </span>
          </span>
        </div>
      </div>
    </div>

    <div v-if="!previewMode && isOnboardingComplete && companyEvents.length > 0" class="company-events-strip">
      <div class="company-events-head">
        <strong>Upcoming company events</strong>
        <small class="hint">Targeted to you</small>
      </div>
      <div class="company-events-list">
        <article v-for="event in companyEvents" :key="`event-${event.id}`" class="company-event-card">
          <div class="company-event-title">
            {{ event.title }}
            <span v-if="event.eventType === 'direct_notice'" class="hint"> · Direct message</span>
          </div>
          <div class="company-event-when">{{ formatCompanyEventWhen(event) }}</div>
          <div v-if="event.splashContent" class="company-event-copy">{{ event.splashContent }}</div>
          <div v-if="event.votingConfig?.enabled" class="company-event-rsvp">
            <div class="hint">
              {{ event.votingConfig?.question || 'RSVP' }}
              <span v-if="event.myResponse"> — Your response: {{ event.myResponse.responseLabel }}</span>
              <span v-if="event.votingClosedAt"> (closed)</span>
            </div>
            <div v-if="!event.votingClosedAt" class="company-event-rsvp-actions">
              <button
                v-for="opt in (event.votingConfig?.options || [])"
                :key="`${event.id}-${opt.key}`"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="respondToCompanyEvent(event, opt.key)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div v-if="event.eventType !== 'direct_notice'" class="company-event-actions">
            <a v-if="event.googleCalendarUrl" :href="event.googleCalendarUrl" target="_blank" rel="noopener">Add to Google</a>
            <span v-if="event.googleCalendarUrl"> · </span>
            <a :href="event.icsUrl">Download ICS</a>
          </div>
        </article>
      </div>
    </div>

    <div
      v-if="!previewMode && isOnboardingComplete && optionalSupervisionPrompts.length > 0"
      class="supervision-invite-strip"
    >
      <div class="supervision-invite-head">
        <strong>Optional Group Supervision</strong>
        <small class="hint">You can dismiss these reminders.</small>
      </div>
      <div class="supervision-invite-list">
        <article v-for="prompt in optionalSupervisionPrompts" :key="`supv-opt-${prompt.id}`" class="supervision-invite-card">
          <div class="invite-title">{{ prompt.sessionTypeLabel }} with {{ prompt.supervisorName || 'Supervisor' }}</div>
          <div class="invite-time">{{ prompt.timeLabel }}</div>
          <div class="invite-actions">
            <button type="button" class="btn btn-primary btn-sm" @click="joinSupervisionPrompt(prompt)">Join</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="dismissOptionalSupervisionPrompt(prompt.id)">Dismiss</button>
          </div>
        </article>
      </div>
    </div>

    <div
      v-if="!previewMode && isOnboardingComplete && presenterAssignmentsNeedingAttention.length > 0"
      class="supervision-invite-strip"
    >
      <div class="supervision-invite-head">
        <strong>Presenter Assignments</strong>
        <small class="hint">You will be reminded 3 times.</small>
      </div>
      <div class="supervision-invite-list">
        <article v-for="item in presenterAssignmentsNeedingAttention" :key="`presenter-${item.presenterAssignmentId}`" class="supervision-invite-card">
          <div class="invite-title">
            {{ item.sessionTypeLabel }} presenter ({{ item.presenterRoleLabel }})
          </div>
          <div class="invite-time">
            {{ item.timeLabel }}<span v-if="item.reminderLabel"> • {{ item.reminderLabel }}</span>
          </div>
          <div class="invite-actions">
            <button type="button" class="btn btn-primary btn-sm" @click="joinSupervisionPrompt(item)">View session</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="dismissPresenterAssignment(item.presenterAssignmentId)">Dismiss</button>
          </div>
        </article>
      </div>
    </div>
    
    <!-- Pending Completion Button -->
    <div v-if="isPending && pendingCompletionStatus?.allComplete && !pendingCompletionStatus?.accessLocked && (userStatus === 'PREHIRE_OPEN' || userStatus === 'pending')" class="pending-completion-banner">
      <div class="completion-content">
        <strong>✓ All Items Complete</strong>
        <p>You have completed all required pre-hire tasks. Mark the hiring process as complete when you're ready.</p>
        <PendingCompletionButton v-if="!previewMode" @completed="handlePendingCompleted" />
      </div>
    </div>
    
    <!-- Ready for Review Banner -->
    <div v-if="userStatus === 'PREHIRE_REVIEW' || userStatus === 'ready_for_review'" class="ready-for-review-banner">
      <div class="review-content">
        <strong>✓ Pre-Hire Process Complete</strong>
        <p>You have completed all required pre-hire tasks. Your account is now ready for review by your administrator. You will be notified when your account is activated.</p>
        <p><em>Your access to this portal has been locked. An administrator will review your information and activate your account.</em></p>
      </div>
    </div>
    
    <!-- Onboarding Status Banner -->
    <div v-if="userStatus === 'ONBOARDING'" class="onboarding-banner">
      <div class="onboarding-content">
        <strong>📚 Onboarding in Progress</strong>
        <p>You are currently completing your onboarding training. Continue working through your assigned modules and documents.</p>
      </div>
    </div>
    
    <!-- Status Warning Banner (for legacy completed status) -->
    <div v-if="(userStatus === 'ACTIVE_EMPLOYEE' || userStatus === 'completed') && daysRemaining !== null" class="status-warning-banner">
      <div class="warning-content">
        <strong>⚠️ Onboarding Complete</strong>
        <p v-if="daysRemaining > 0">
          You have {{ daysRemaining }} day{{ daysRemaining !== 1 ? 's' : '' }} remaining to download your finalized onboarding document.
        </p>
        <p v-else>
          Your access has expired. Please contact your agency for assistance.
        </p>
        <p class="warning-note">
          Once your checklist is marked as completed, you will have approximately 7 days to download your finalized onboarding document, though it will be accessible via the agency's website.
        </p>
      </div>
      <button 
        v-if="daysRemaining > 0"
        @click="!previewMode && downloadOnboardingDocument()" 
        class="btn btn-primary"
        :disabled="downloading || previewMode"
      >
        {{ downloading ? 'Generating...' : 'Download Onboarding Document' }}
      </button>
    </div>
    
    <!-- Onboarding Checklist Card -->
    <div v-if="onboardingCompletion < 100" class="onboarding-card" data-tour="dash-onboarding-card">
      <div class="onboarding-header">
        <h2>Onboarding Checklist</h2>
        <span class="completion-badge">{{ onboardingCompletion }}% Complete</span>
      </div>
      <div class="onboarding-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: onboardingCompletion + '%' }"></div>
        </div>
      </div>
      <p class="onboarding-description">Complete your onboarding tasks to get started.</p>
      <router-link v-if="!previewMode" to="/onboarding" class="btn btn-primary">View Checklist</router-link>
      <button v-else class="btn btn-primary" disabled>View Checklist</button>
    </div>
    
    <!-- Top row: My Snapshot + My Status + Your Team (saves vertical space) -->
    <div
      v-if="!previewMode && isOnboardingComplete && !isSchoolStaff && (providerSurfacesEnabled || canSeePresenceWidget || (currentAgencyId && canSeeKudosWidget))"
      class="top-snapshot-row"
    >
      <!-- Provider top summary card -->
      <div
        v-if="!isPending && providerSurfacesEnabled"
        class="top-snapshot-wrap top-snapshot-cell"
        data-tour="dash-snapshot"
      >
        <div class="top-snapshot-head">
          <div class="top-snapshot-title">My Snapshot</div>
          <button type="button" class="btn btn-secondary btn-sm top-snapshot-toggle" @click="toggleTopCardCollapsed">
            {{ topCardCollapsed ? 'Expand' : 'Collapse' }}
          </button>
        </div>
        <ProviderTopSummaryCard v-if="!topCardCollapsed" @open-last-paycheck="openLastPaycheckModal" />
      </div>

      <!-- My Status + Your Team stacked (compact column beside My Snapshot) -->
      <div
        v-if="canSeePresenceWidget || (currentAgencyId && canSeeKudosWidget)"
        class="top-snapshot-status-team-stack"
      >
        <div
          v-if="canSeePresenceWidget"
          class="top-snapshot-wrap"
          data-tour="dash-presence-status"
        >
          <PresenceStatusWidget />
        </div>
        <div
          v-if="currentAgencyId && canSeeKudosWidget"
          class="top-snapshot-wrap"
          data-tour="dash-staff-card"
        >
          <StaffCard
            :agency-id="Number(currentAgencyId)"
            :icon-url="brandingStore.getDashboardCardIconUrl('staff', cardIconOrgOverride)"
          />
        </div>
      </div>
    </div>

    <!-- Social & feeds (collapsible block) – super_admin only until full release -->
    <div
      v-if="!previewMode && isOnboardingComplete && !isSchoolStaff && authStore.user?.role === 'super_admin' && dashboardSocialFeeds.length > 0"
      class="top-snapshot-wrap"
      data-tour="dash-social-feeds"
    >
      <div class="top-snapshot-head">
        <div class="top-snapshot-title">Social &amp; feeds</div>
        <button type="button" class="btn btn-secondary btn-sm top-snapshot-toggle" @click="toggleSocialFeedsCollapsed">
          {{ socialFeedsCollapsed ? 'Expand' : 'Collapse' }}
        </button>
      </div>
      <div v-if="!socialFeedsCollapsed" class="social-feeds-block-grid">
        <button
          v-for="f in dashboardSocialFeeds"
          :key="f.id"
          type="button"
          class="social-feed-block-card"
          @click="openSocialFeedInDetail(f)"
        >
          <span class="social-feed-block-icon" :aria-label="f.type">{{ platformIconLabel(f.type) }}</span>
          <span class="social-feed-block-label">{{ f.label }}</span>
        </button>
      </div>
    </div>

    <!-- Dashboard Shell: left rail + right detail -->
    <div class="dashboard-shell" :class="{ 'schedule-focus': activeTab === 'my_schedule' }">
      <div
        data-tour="dash-rail"
        class="dashboard-rail"
        :class="{ disabled: previewMode, 'rail-collapsed': railCollapsedMode, 'rail-pulse': railPulse }"
        role="navigation"
        aria-label="Dashboard sections"
      >
        <div
          v-for="card in railCards"
          :key="card.id"
          class="rail-card-row"
        >
          <button
            type="button"
            class="rail-card"
            :style="{ '--rail-accent': cardHue(card.id) }"
            :data-card-id="card.id"
            :data-tour="`dash-rail-card-${String(card.id)}`"
            :class="{
              active: (card.kind === 'content' && activeTab === card.id),
              'rail-card-submit': card.id === 'submit'
            }"
            :aria-current="(card.kind === 'content' && activeTab === card.id) ? 'page' : undefined"
            :disabled="previewMode"
            :title="card.label"
            :data-label="card.label"
            @click="handleCardClick(card)"
          >
            <div class="rail-card-left">
              <div class="rail-card-icon">
                <img
                  v-if="card.iconUrl && !failedRailIconIds.has(String(card.id))"
                  :src="card.iconUrl"
                  :alt="`${card.label} icon`"
                  class="rail-card-icon-img"
                  @error="(e) => onRailIconError(card, e)"
                />
                <div v-else class="rail-card-icon-fallback" aria-hidden="true">
                  {{ railIconFallback(card) }}
                </div>
              </div>
              <div class="rail-card-text">
                <div class="rail-card-title">{{ card.label }}</div>
              </div>
            </div>
            <div class="rail-card-meta">
              <span v-if="card.badgeCount > 0" class="rail-card-badge">{{ card.badgeCount }}</span>
              <span class="rail-card-cta">{{ card.kind === 'link' || card.kind === 'modal' ? 'Open' : (card.kind === 'action' ? 'Open' : 'View') }}</span>
            </div>
          </button>
          <div v-if="tutorialStore.enabled && railCardDescriptor(card.id)" class="rail-card-help">
            <button
              type="button"
              class="rail-card-help-btn"
              :title="`About ${card.label}`"
              :aria-label="`About ${card.label}`"
              :aria-expanded="openCardDescriptorId === String(card.id) ? 'true' : 'false'"
              @click.stop="toggleCardDescriptor(card.id)"
            >
              i
            </button>
            <div
              v-if="openCardDescriptorId === String(card.id)"
              class="rail-card-help-popover"
              role="dialog"
              :aria-label="`About ${card.label}`"
            >
              <div class="rail-card-help-title">{{ railCardDescriptor(card.id).title }}</div>
              <div class="rail-card-help-desc">{{ railCardDescriptor(card.id).description }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-detail">
        <!-- Card Content (for content cards) -->
        <div class="card-content" :class="{ 'card-content-schedule': activeTab === 'my_schedule' }">
          <TrainingFocusTab
            v-if="!previewMode && activeTab === 'training' && !isPending"
            @update-count="updateTrainingCount"
          />
          
          <DocumentsTab
            v-if="!previewMode && activeTab === 'documents'"
            @update-count="updateDocumentsCount"
          />
          
          <MomentumListTab
            v-if="!previewMode && momentumListEnabled && activeTab === 'checklist'"
            :program-id="route.query?.programId ? parseInt(route.query.programId, 10) : null"
            :agency-id="currentAgencyId"
            :kudos-enabled="canSeeKudosWidget"
            @update-count="updateChecklistCount"
          />
          <UnifiedChecklistTab
            v-if="!previewMode && !momentumListEnabled && activeTab === 'checklist'"
            :program-id="route.query?.programId ? parseInt(route.query.programId, 10) : null"
            :agency-id="currentAgencyId"
            @update-count="updateChecklistCount"
          />

          <!-- My Schedule (full-width focus panel) -->
          <div
            v-if="!previewMode && isOnboardingComplete && !isSchoolStaff && activeTab === 'my_schedule'"
            class="my-panel my-schedule-panel"
            data-tour="dash-my-schedule-panel"
          >
            <div ref="myScheduleStageRef" class="my-schedule-stage">
              <div class="section-header">
                <h2 style="margin: 0;">My Schedule</h2>
                <div style="display:flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
                  <button type="button" class="btn btn-secondary btn-sm" @click="toggleScheduleFullscreen">
                    {{ scheduleFullscreenActive ? 'Exit full screen' : 'Show full screen' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="openScheduleInNewWindow">
                    Show full screen in new window
                  </button>
                  <button
                    v-if="isSkillBuilderEligible"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="showSkillBuilderModal = true"
                  >
                    Skill Builder availability
                  </button>
                </div>
              </div>
              <div
                v-if="isSupervisor(authStore.user)"
                class="schedule-supervisor-toolbar"
              >
                <div class="schedule-view-toggle">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :class="{ active: scheduleViewMode === 'self' }"
                    @click="scheduleViewMode = 'self'"
                  >
                    My schedule
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :class="{ active: scheduleViewMode === 'supervisee' }"
                    @click="scheduleViewMode = 'supervisee'"
                  >
                    Supervisee schedules
                  </button>
                </div>

                <template v-if="scheduleViewMode === 'supervisee'">
                  <div class="schedule-inline-controls">
                    <select v-model="superviseeSortKey" class="input compact-input" title="Sort supervisees by">
                      <option value="name">Name</option>
                      <option value="agency">Agency</option>
                    </select>
                    <select v-model="superviseeSortDir" class="input compact-input" title="Sort order">
                      <option value="asc">A → Z</option>
                      <option value="desc">Z → A</option>
                    </select>
                    <input
                      v-model="superviseeQuery"
                      class="input compact-input supervisee-search-input"
                      placeholder="Search supervisees..."
                      title="Search supervisees by name or agency"
                    />
                  </div>
                  <div class="supervisee-chip-row">
                    <button
                      type="button"
                      class="supervisee-chip all-chip"
                      :class="{ active: selectedSuperviseeId === 0 }"
                      :disabled="superviseesLoading"
                      @click="selectedSuperviseeId = 0"
                    >
                      All supervisees
                    </button>
                    <button
                      v-for="s in superviseesFilteredSorted"
                      :key="`sup-chip-${s.id}`"
                      type="button"
                      class="supervisee-chip"
                      :class="{ active: selectedSuperviseeId === s.id }"
                      :title="s.label"
                      :disabled="superviseesLoading"
                      @click="selectedSuperviseeId = s.id"
                    >
                      <span class="supervisee-chip-avatar" :class="{ 'has-photo': !!superviseePhotoUrl(s) }">
                        <img v-if="superviseePhotoUrl(s)" :src="superviseePhotoUrl(s)" :alt="superviseeName(s)" />
                        <span v-else>{{ superviseeInitials(s) }}</span>
                      </span>
                      <span class="supervisee-chip-name">{{ superviseeName(s) }}</span>
                    </button>
                  </div>
                </template>
              </div>
              <div v-if="superviseesError" class="error" style="margin-top: 8px;">{{ superviseesError }}</div>
              <div v-if="!providerSurfacesEnabled" class="hint" style="margin-top: 8px;">
                Scheduling is disabled for this organization.
              </div>
              <div v-else-if="scheduleViewMode !== 'self' && !currentAgencyId" class="hint" style="margin-top: 8px;">
                Select an organization to view your schedule.
              </div>
              <div v-else-if="isSupervisor(authStore.user) && scheduleViewMode === 'supervisee' && superviseeScheduleUsers.length === 0" class="hint" style="margin-top: 8px;">
                No supervisees match the current filter.
              </div>
              <ScheduleMultiUserOverlayGrid
                v-else-if="scheduleViewMode === 'supervisee' && selectedSuperviseeId === 0 && superviseeScheduleUsers.length"
                :user-ids="allSuperviseeUserIds"
                :user-label-by-id="superviseeLabelById"
                :agency-ids="[Number(currentAgencyId)]"
                :week-start-ymd="activeScheduleWeekStartYmd || null"
                @update:weekStartYmd="onScheduleWeekStartUpdate"
              />
              <ScheduleAvailabilityGrid
                v-else-if="authStore.user?.id && scheduleGridUserId"
                :user-id="scheduleGridUserId"
                :agency-id="scheduleViewMode === 'self' ? null : Number(currentAgencyId)"
                :mode="scheduleGridMode"
                :week-start-ymd="activeScheduleWeekStartYmd || null"
                @update:weekStartYmd="onScheduleWeekStartUpdate"
              />
            </div>
          </div>

          <div v-if="!previewMode && isOnboardingComplete && !isSchoolStaff && activeTab === 'clients'" class="my-panel">
            <ProviderClientsTab @update:needsAttentionCount="clientsNeedsAttentionCount = $event" />
          </div>

          <!-- Submit (right panel) -->
          <div
            v-if="!previewMode && isOnboardingComplete && !isSchoolStaff && providerSurfacesEnabled && activeTab === 'submit'"
            class="my-panel"
            data-tour="dash-submit-panel"
          >
            <div class="section-header">
              <h2 style="margin: 0;">Submit</h2>
              <button v-if="submitPanelView !== 'root'" type="button" class="btn btn-secondary btn-sm" @click="submitPanelView = 'root'">
                Back
              </button>
            </div>

            <div v-if="submitPanelView === 'root'">
              <div class="fields-grid" style="margin-top: 12px;">
                <button v-if="inSchoolEnabled && hasAssignedSchools" type="button" class="dash-card dash-card-submit" @click="openInSchoolClaims">
                  <div class="dash-card-title">In-School Claims</div>
                  <div class="dash-card-desc">School Mileage and Med Cancel.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card dash-card-submit" @click="openAdditionalAvailability">
                  <div class="dash-card-title">Additional Availability</div>
                  <div class="dash-card-desc">Office or school availability + supervised 2-week confirmations.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card dash-card-submit" @click="openVirtualWorkingHours">
                  <div class="dash-card-title">Virtual Working Hours</div>
                  <div class="dash-card-desc">Set weekly virtual hours (not tied to a room/office).</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('mileage')">
                  <div class="dash-card-title">Mileage</div>
                  <div class="dash-card-desc">Submit other mileage.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('reimbursement')">
                  <div class="dash-card-title">Reimbursement</div>
                  <div class="dash-card-desc">Upload a receipt and submit for approval.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('pto')">
                  <div class="dash-card-title">PTO</div>
                  <div class="dash-card-desc">Request Sick Leave or Training PTO.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button
                  v-if="authStore.user?.companyCardEnabled"
                  type="button"
                  class="dash-card"
                  @click="goToSubmission('company_card_expense')"
                >
                  <div class="dash-card-title">Submit Expense (Company Card)</div>
                  <div class="dash-card-desc">Submit company card purchases for tracking/review.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="openTimeClaims">
                  <div class="dash-card-title">Time Claim</div>
                  <div class="dash-card-desc">Attendance, holiday/excess time, service corrections.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>
              </div>
            </div>

            <div v-else-if="submitPanelView === 'time'">
              <div class="hint" style="margin-top: 6px;">Time Claims</div>
              <div class="submit-grid-2" style="margin-top: 12px;">
                <button type="button" class="dash-card" @click="goToSubmission('time_meeting_training')">
                  <div class="dash-card-title">Meeting / Training Attendance</div>
                  <div class="dash-card-desc">Log meeting/training minutes.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('time_excess_holiday')">
                  <div class="dash-card-title">Excess / Holiday Time</div>
                  <div class="dash-card-desc">Submit direct/indirect minutes for review.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('time_service_correction')">
                  <div class="dash-card-title">Service Correction</div>
                  <div class="dash-card-desc">Request correction review for a service.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button type="button" class="dash-card" @click="goToSubmission('time_overtime_evaluation')">
                  <div class="dash-card-title">Overtime Evaluation</div>
                  <div class="dash-card-desc">Submit overtime evaluation details.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>
              </div>
            </div>

            <div v-else-if="submitPanelView === 'in_school'">
              <div class="hint" style="margin-top: 6px;">In-School Claims</div>
              <div class="submit-grid-2" style="margin-top: 12px;">
                <button v-if="hasAssignedSchools" type="button" class="dash-card" @click="goToSubmission('school_mileage')">
                  <div class="dash-card-title">School Mileage</div>
                  <div class="dash-card-desc">Home ↔ School minus Home ↔ Office (auto).</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>

                <button
                  v-if="authStore.user?.medcancelEnabled && medcancelEnabledForAgency && hasAssignedSchools"
                  type="button"
                  class="dash-card"
                  @click="goToSubmission('medcancel')"
                >
                  <div class="dash-card-title">Med Cancel</div>
                  <div class="dash-card-desc">Missed Medicaid sessions.</div>
                  <div class="dash-card-meta">
                    <span class="dash-card-cta">Open</span>
                  </div>
                </button>
              </div>
            </div>

            <div v-else-if="submitPanelView === 'availability'">
              <div class="hint" style="margin-top: 6px;">Additional Availability</div>
              <AdditionalAvailabilitySubmit v-if="currentAgencyId" :agency-id="Number(currentAgencyId)" />
            </div>

            <div v-else-if="submitPanelView === 'virtual_hours'">
              <div class="hint" style="margin-top: 6px;">Virtual Working Hours</div>
              <VirtualWorkingHoursEditor v-if="currentAgencyId" :agency-id="Number(currentAgencyId)" />
            </div>
          </div>

          <div v-if="!previewMode && isOnboardingComplete && activeTab === 'payroll'" class="my-panel">
            <MyPayrollTab />
          </div>

          <div v-if="!previewMode && isOnboardingComplete && !isSchoolStaff && activeTab === 'program_shifts'" class="my-panel">
            <ProgramShiftsTab />
          </div>

          <!-- On-Demand Training (right panel) -->
          <div v-if="!previewMode && isOnboardingComplete && activeTab === 'on_demand_training'" class="my-panel">
            <OnDemandTrainingLibraryView />
          </div>

          <!-- Social feeds (right panel) – super_admin only until full release -->
          <div v-if="!previewMode && isOnboardingComplete && authStore.user?.role === 'super_admin' && activeTab === 'social_feeds'" class="my-panel">
            <SocialFeedsPanel
              :agency-id="currentAgencyId"
              :selected-feed-id-from-parent="selectedSocialFeedId"
            />
          </div>

          <div v-if="!previewMode && isOnboardingComplete && activeTab === 'supervision'" class="my-panel">
            <SupervisionModal />
          </div>

          <div v-if="!previewMode && isOnboardingComplete && activeTab === 'providers'" class="my-panel">
            <ProvidersPanel />
          </div>

          <!-- My Account (nested inside dashboard) -->
          <div
            v-if="!previewMode && isOnboardingComplete && activeTab === 'my'"
            class="my-panel"
          >
            <div class="my-subnav" data-tour="dash-my-subnav">
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'account' }"
                @click="setMyTab('account')"
              >
                Account Info
              </button>
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'credentials' }"
                @click="setMyTab('credentials')"
              >
                My Credentials
              </button>
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'preferences' }"
                @click="setMyTab('preferences')"
              >
                My Preferences
              </button>
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'payroll' }"
                @click="setMyTab('payroll')"
              >
                My Payroll
              </button>
              <button
                type="button"
                class="subtab"
                :class="{ active: myTab === 'compensation' }"
                @click="setMyTab('compensation')"
              >
                My Compensation
              </button>
              <button
                v-if="canSeeKudosWidget"
                type="button"
                class="subtab"
                :class="{ active: myTab === 'kudos' }"
                @click="setMyTab('kudos')"
              >
                My Kudos
              </button>
            </div>

            <div v-show="myTab === 'account'">
              <AccountInfoView />
            </div>
            <div v-show="myTab === 'credentials'">
              <CredentialsView />
            </div>
            <div v-show="myTab === 'preferences'">
              <div class="preferences-header">
                <h1>My Preferences</h1>
                <p class="preferences-subtitle">Manage your personal settings and preferences</p>
              </div>
              <UserPreferencesHub v-if="authStore.user?.id" :userId="authStore.user.id" />
            </div>
            <div v-show="myTab === 'payroll'">
              <MyPayrollTab />
            </div>
            <div v-show="myTab === 'compensation'">
              <MyCompensationTab />
            </div>
            <div v-show="myTab === 'kudos'">
              <MyKudosTab :agency-id="Number(currentAgencyId)" />
            </div>
          </div>
          
          <!-- Preview mode placeholder content -->
          <div v-if="previewMode" class="preview-tab-content">
            <p v-if="activeTab === 'checklist'" class="preview-text">Checklist content preview</p>
            <p v-if="activeTab === 'training'" class="preview-text">Training content preview</p>
            <p v-if="activeTab === 'documents'" class="preview-text">Documents content preview</p>
            <p v-if="activeTab === 'my'" class="preview-text">My account content preview</p>
            <p v-if="activeTab === 'submit'" class="preview-text">Submit content preview</p>
            <p v-if="activeTab === 'on_demand_training'" class="preview-text">On-demand training content preview</p>
            <p v-if="activeTab === 'social_feeds'" class="preview-text">Social feeds content preview</p>
            <p v-if="activeTab === 'supervision'" class="preview-text">Supervision content preview</p>
            <p v-if="activeTab === 'providers'" class="preview-text">Providers content preview</p>
          </div>
        </div>
      </div>
    </div>

    <SkillBuilderAvailabilityModal
      v-if="showSkillBuilderModal"
      :agency-id="currentAgencyId"
      :lock-open="isSkillBuilderConfirmRequired"
      @close="showSkillBuilderModal = false"
      @confirmed="onSkillBuilderConfirmed"
    />
    <SkillBuildersAvailabilityModal
      v-if="showSkillBuildersAvailabilityModal"
      :agency-id="currentAgencyId"
      @close="showSkillBuildersAvailabilityModal = false"
    />
    <LastPaycheckModal
      v-if="showLastPaycheckModal"
      :agency-id="Number(currentAgencyId)"
      :payroll-period-id="lastPaycheckPayrollPeriodId"
      @close="closeLastPaycheckModal"
    />

    <div
      v-if="currentSplashAnnouncement && !mandatorySupervisionPrompt"
      class="blocking-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Announcement splash"
    >
      <div class="blocking-splash-card">
        <div class="blocking-splash-head">
          <BrandingLogo size="medium" class="blocking-splash-logo" />
          <div class="blocking-splash-brand">{{ brandingStore.displayName || currentAgency?.name || 'Organization' }}</div>
        </div>
        <h3 class="blocking-splash-title">
          {{ splashTitleText }}
        </h3>
        <p class="blocking-splash-message">
          {{ currentSplashAnnouncement.message || '' }}
        </p>
        <div class="blocking-splash-meta" v-if="currentSplashAnnouncement.ends_at">
          Visible until {{ formatSplashEndsAt(currentSplashAnnouncement.ends_at) }}
        </div>
        <div class="blocking-splash-actions">
          <button type="button" class="btn btn-primary" @click="dismissCurrentSplash">
            Dismiss
          </button>
        </div>
      </div>
    </div>

    <div v-if="mandatorySupervisionPrompt" class="supervision-splash" role="dialog" aria-modal="true" aria-label="Join group supervision">
      <div class="supervision-splash-card">
        <h3>Join Group Supervision Now</h3>
        <p>
          {{ mandatorySupervisionPrompt.sessionTypeLabel }} with {{ mandatorySupervisionPrompt.supervisorName || 'your supervisor' }} is active.
          ({{ mandatorySupervisionPrompt.timeLabel }})
        </p>
        <div class="supervision-splash-actions">
          <button type="button" class="btn btn-secondary btn-sm" @click="activeTab = 'my_schedule'">Open Schedule</button>
          <button type="button" class="btn btn-primary btn-sm" @click="joinSupervisionPrompt(mandatorySupervisionPrompt)">Join now</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useUserPreferencesStore } from '../store/userPreferences';
import { useBrandingStore } from '../store/branding';
import { useTutorialStore } from '../store/tutorial';
import api from '../services/api';
import TrainingFocusTab from '../components/dashboard/TrainingFocusTab.vue';
import DocumentsTab from '../components/dashboard/DocumentsTab.vue';
import MomentumListTab from '../components/dashboard/MomentumListTab.vue';
import UnifiedChecklistTab from '../components/dashboard/UnifiedChecklistTab.vue';
import { useMomentumListAddon } from '../composables/useMomentumListAddon';
import ProviderTopSummaryCard from '../components/dashboard/ProviderTopSummaryCard.vue';
import PendingCompletionButton from '../components/PendingCompletionButton.vue';
import BrandingLogo from '../components/BrandingLogo.vue';
import UserPreferencesHub from '../components/UserPreferencesHub.vue';
import AdditionalAvailabilitySubmit from '../components/AdditionalAvailabilitySubmit.vue';
import VirtualWorkingHoursEditor from '../components/availability/VirtualWorkingHoursEditor.vue';
import ScheduleAvailabilityGrid from '../components/schedule/ScheduleAvailabilityGrid.vue';
import ScheduleMultiUserOverlayGrid from '../components/schedule/ScheduleMultiUserOverlayGrid.vue';
import CredentialsView from './CredentialsView.vue';
import AccountInfoView from './AccountInfoView.vue';
import MyPayrollTab from '../components/dashboard/MyPayrollTab.vue';
import MyKudosTab from '../components/dashboard/MyKudosTab.vue';
import ProgramShiftsTab from '../components/dashboard/ProgramShiftsTab.vue';
import MyCompensationTab from '../components/dashboard/MyCompensationTab.vue';
import OnDemandTrainingLibraryView from './OnDemandTrainingLibraryView.vue';
import ProviderClientsTab from '../components/dashboard/ProviderClientsTab.vue';
import SupervisionModal from '../components/supervision/SupervisionModal.vue';
import ProvidersPanel from '../components/supervision/ProvidersPanel.vue';
import SkillBuilderAvailabilityModal from '../components/availability/SkillBuilderAvailabilityModal.vue';
import SkillBuildersAvailabilityModal from '../components/availability/SkillBuildersAvailabilityModal.vue';
import LastPaycheckModal from '../components/dashboard/LastPaycheckModal.vue';
import SocialFeedsPanel from '../components/dashboard/SocialFeedsPanel.vue';
import PresenceStatusWidget from '../components/dashboard/PresenceStatusWidget.vue';
import StaffCard from '../components/dashboard/StaffCard.vue';
import { isSupervisor } from '../utils/helpers.js';
import { getDashboardRailCardDescriptors } from '../tutorial/tours/dashboard.tour';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { setRememberedGoogleLogin } from '../utils/loginRemember';

const props = defineProps({
  previewMode: {
    type: Boolean,
    default: false
  },
  previewStatus: {
    type: String,
    default: null
  },
  previewData: {
    type: Object,
    default: null
  }
});

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const userPrefsStore = useUserPreferencesStore();
const brandingStore = useBrandingStore();
const tutorialStore = useTutorialStore();
const activeTab = ref('checklist');
const myTab = ref('account'); // 'account' | 'credentials' | 'preferences' | 'payroll'
const onboardingCompletion = ref(100);
const trainingCount = ref(0);
const documentsCount = ref(0);
const checklistCount = ref(0);
const userStatus = ref('active');
const daysRemaining = ref(null);
const downloading = ref(false);
const isPending = ref(false);
const pendingCompletionStatus = ref(null);
const tierBadgeText = ref('');
const tierBadgeKind = ref(''); // 'tier-current' | 'tier-grace' | 'tier-ooc'

const clientsNeedsAttentionCount = ref(0);
const showSkillBuilderModal = ref(false);
const showSkillBuildersAvailabilityModal = ref(false);

const railCollapsedMode = ref(false);
const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const railPulse = ref(!prefersReducedMotion);
const RAIL_PULSE_DURATION_MS = 2500;
const showLastPaycheckModal = ref(false);
const lastPaycheckPayrollPeriodId = ref(null);
const railCardDescriptors = getDashboardRailCardDescriptors();
const openCardDescriptorId = ref('');

const railCardDescriptor = (cardId) => railCardDescriptors[String(cardId)] || null;
const closeCardDescriptor = () => {
  openCardDescriptorId.value = '';
};
const toggleCardDescriptor = (cardId) => {
  const next = String(cardId || '');
  openCardDescriptorId.value = openCardDescriptorId.value === next ? '' : next;
};

const isSkillBuilderEligible = computed(() => {
  const u = authStore.user || {};
  return u.skill_builder_eligible === true || u.skill_builder_eligible === 1 || u.skill_builder_eligible === '1';
});

const isSkillBuilderCoordinator = computed(() => {
  const u = authStore.user || {};
  return (
    u.has_skill_builder_coordinator_access === true ||
    u.has_skill_builder_coordinator_access === 1 ||
    u.has_skill_builder_coordinator_access === '1'
  );
});

const isSkillBuilderConfirmRequired = computed(() => {
  const u = authStore.user || {};
  return (
    u.skill_builder_confirm_required_next_login === true ||
    u.skill_builder_confirm_required_next_login === 1 ||
    u.skill_builder_confirm_required_next_login === '1'
  );
});

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
}

function isTruthyFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

const agencyFlags = computed(() => parseFeatureFlags(agencyStore.currentAgency?.feature_flags));
const portalVariant = computed(() => String(agencyFlags.value?.portalVariant || 'healthcare_provider'));
const providerSurfacesEnabled = computed(
  () =>
    portalVariant.value !== 'employee' ||
    isTruthyFlag(agencyFlags.value?.submitEnabledForEmployeePortal)
);
const inSchoolEnabled = computed(() => agencyFlags.value?.inSchoolSubmissionsEnabled !== false);
const medcancelEnabledForAgency = computed(() => inSchoolEnabled.value && agencyFlags.value?.medcancelEnabled !== false);
const clinicalNoteGeneratorEnabledForAgency = computed(() => {
  // Clinical notes/billing are only for agencies with a clinical organization attached
  const hasClinicalOrg = agencyStore.currentAgency?.hasClinicalOrg === true;
  if (!hasClinicalOrg) return false;
  const base =
    isTruthyFlag(agencyFlags.value?.noteAidEnabled) || isTruthyFlag(agencyFlags.value?.clinicalNoteGeneratorEnabled);
  if (base) return true;
  // For providers/interns: default to showing Tools & Aids when feature flags are not explicitly disabled
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'provider' || role === 'intern') {
    const flags = agencyFlags.value;
    if (!flags || (flags.noteAidEnabled === undefined && flags.clinicalNoteGeneratorEnabled === undefined)) return true;
    if (flags.noteAidEnabled === false && flags.clinicalNoteGeneratorEnabled === false) return false;
    return true;
  }
  return false;
});
const shiftProgramsEnabledForAgency = computed(() => isTruthyFlag(agencyFlags.value?.shiftProgramsEnabled));

// Presence widget: super_admin always; staff/admin when agency has presenceEnabled
const canSeePresenceWidget = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  if (!['staff', 'admin'].includes(role)) return false;
  return isTruthyFlag(agencyFlags.value?.presenceEnabled);
});

// Kudos / Staff card: when agency has kudosEnabled
const canSeeKudosWidget = computed(() => isTruthyFlag(agencyFlags.value?.kudosEnabled));

const onSkillBuilderConfirmed = () => {
  // Modal refreshes user; if requirement cleared, close it.
  if (!isSkillBuilderConfirmRequired.value) {
    showSkillBuilderModal.value = false;
  }
};

watch(
  isSkillBuilderConfirmRequired,
  (required) => {
    if (props.previewMode) return;
    if (!required) return;
    if (!isSkillBuilderEligible.value) return;
    showSkillBuilderModal.value = true;
    // Bring the user to the scheduling surface where the button normally lives.
    activeTab.value = 'my_schedule';
    try {
      router.replace({ query: { ...route.query, tab: 'my_schedule' } });
    } catch {
      // ignore
    }
  },
  { immediate: true }
);

const openLastPaycheckModal = ({ payrollPeriodId } = {}) => {
  const agencyId = Number(currentAgencyId.value || 0);
  const pid = Number(payrollPeriodId || 0);
  if (!agencyId || !pid) return;
  lastPaycheckPayrollPeriodId.value = pid;
  showLastPaycheckModal.value = true;
};

const closeLastPaycheckModal = () => {
  showLastPaycheckModal.value = false;
  lastPaycheckPayrollPeriodId.value = null;
};

// Supervisor schedule picker (inside My Schedule card)
const scheduleViewMode = ref('self'); // 'self' | 'supervisee'
const myScheduleStageRef = ref(null);
const scheduleFullscreenActive = ref(false);
const superviseesLoading = ref(false);
const superviseesError = ref('');
const supervisees = ref([]); // [{ id, firstName, lastName, agencyName, profilePhotoUrl }]
const selectedSuperviseeId = ref(0); // 0 = all supervisees
const superviseeSortKey = ref('name'); // 'name' | 'agency'
const superviseeSortDir = ref('asc'); // 'asc' | 'desc'
const superviseeQuery = ref('');
const selfScheduleWeekStartYmd = ref('');
const superviseeScheduleWeekStartYmd = ref('');
const SCHEDULE_VIEW_PREF_PREFIX = 'dashboard.scheduleViewPref.v1';

// If an icon URL 404s (or otherwise fails to load), show a simple fallback glyph.
const failedRailIconIds = ref(new Set());
const onRailIconError = (card, event) => {
  try {
    failedRailIconIds.value.add(String(card?.id));
    // best-effort debugging
    console.warn('[Dashboard] Icon failed to load', {
      cardId: card?.id,
      label: card?.label,
      src: event?.target?.src
    });
  } catch {
    // ignore
  }
};
const railIconFallback = (card) => {
  const label = String(card?.label || '').trim();
  if (!label) return '•';
  return label.slice(0, 1).toUpperCase();
};

const CARD_HUE_PRESETS = {
  checklist: 168,
  training: 289,
  documents: 207,
  my_schedule: 122,
  program_shifts: 300,
  clients: 34,
  tools_aids: 264,
  submit: 196,
  payroll: 261,
  my: 42,
  on_demand_training: 87,
  social_feeds: 334,
  communications: 334,
  chats: 188,
  notifications: 2,
  supervision: 19,
  skill_builders_availability: 154
};

const hashHue = (value) => {
  const input = String(value || '').trim().toLowerCase();
  if (!input) return 210;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
};

const cardHue = (cardId) => {
  const key = String(cardId || '').trim();
  const hue = Number.isFinite(CARD_HUE_PRESETS[key]) ? CARD_HUE_PRESETS[key] : hashHue(key);
  return `hsla(${hue}, 68%, 48%, 0.55)`;
};

const dashboardBannerLoading = ref(false);
const dashboardBannerError = ref('');
const dashboardBanner = ref(null); // { type, message, agencyId, names } | null
const scheduledBannerItems = ref([]);
const companyEvents = ref([]);

const dashboardBannerTexts = computed(() => {
  const scheduled = Array.isArray(scheduledBannerItems.value) ? scheduledBannerItems.value : [];
  const scheduledTexts = scheduled
    .filter((a) => String(a?.display_type || 'announcement').trim().toLowerCase() !== 'splash')
    .map((a) => {
      const title = String(a?.title || '').trim();
      const msg = String(a?.message || '').trim();
      const base = title && title.toLowerCase() !== 'announcement' ? `${title}: ${msg}` : msg;
      return String(base || '').trim();
    })
    .filter(Boolean);
  const birthdayText = String(dashboardBanner.value?.message || '').trim();
  return [...scheduledTexts, birthdayText].filter(Boolean).slice(0, 10);
});

const SPLASH_DISMISS_STORAGE_PREFIX = 'dashboardSplashDismissed.v1';
const splashDismissVersion = ref(0);

const splashAnnouncements = computed(() => {
  const scheduled = Array.isArray(scheduledBannerItems.value) ? scheduledBannerItems.value : [];
  return scheduled
    .filter((a) => String(a?.display_type || 'announcement').trim().toLowerCase() === 'splash')
    .sort((a, b) => {
      const aTime = new Date(a?.starts_at || 0).getTime();
      const bTime = new Date(b?.starts_at || 0).getTime();
      return aTime - bTime;
    });
});

const splashDismissKey = (item) => {
  const userId = Number(authStore.user?.id || 0);
  const orgId = Number(announcementAgencyId.value || 0);
  const splashId = Number(item?.id || 0);
  if (!userId || !orgId || !splashId) return null;
  return `${SPLASH_DISMISS_STORAGE_PREFIX}:${userId}:${orgId}:${splashId}`;
};

const isSplashDismissed = (item) => {
  const key = splashDismissKey(item);
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const untilTs = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(untilTs) || untilTs <= Date.now()) {
      localStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const openSplashAnnouncements = computed(() => {
  // Reactive bump when local dismissal state changes.
  void splashDismissVersion.value;
  return splashAnnouncements.value.filter((item) => !isSplashDismissed(item));
});
const currentSplashAnnouncement = computed(() => openSplashAnnouncements.value[0] || null);
const splashTitleText = computed(() => {
  const title = String(currentSplashAnnouncement.value?.title || '').trim();
  if (title && title.toLowerCase() !== 'announcement') return title;
  return 'Important announcement';
});

const formatSplashEndsAt = (dateLike) => {
  const dt = new Date(dateLike || 0);
  if (!Number.isFinite(dt.getTime())) return '';
  return dt.toLocaleString();
};

const dismissCurrentSplash = () => {
  const item = currentSplashAnnouncement.value;
  if (!item) return;
  const key = splashDismissKey(item);
  if (!key) return;
  const endTs = new Date(item?.ends_at || 0).getTime();
  const fallbackTs = Date.now() + (24 * 60 * 60 * 1000);
  const persistUntil = Number.isFinite(endTs) ? endTs : fallbackTs;
  try {
    localStorage.setItem(key, String(persistUntil));
  } catch {
    // ignore persistence errors; user can still continue in-memory
  }
  splashDismissVersion.value += 1;
};

const formatCompanyEventWhen = (event) => {
  const startsAt = new Date(event?.nextOccurrenceStart || event?.startsAt || 0);
  if (!Number.isFinite(startsAt.getTime())) return 'Time TBD';
  const recurrence = String(event?.recurrence?.frequency || 'none');
  const recurrenceLabel = recurrence === 'weekly' ? 'Weekly' : (recurrence === 'monthly' ? 'Monthly' : 'One-time');
  return `${startsAt.toLocaleString()} (${recurrenceLabel})`;
};

const respondToCompanyEvent = async (event, responseKey) => {
  if (!event?.id || !responseKey) return;
  try {
    await api.post(`/me/company-events/${event.id}/respond`, { responseKey });
    await loadMyCompanyEvents();
  } catch (e) {
    const msg = e?.response?.data?.error?.message || 'Could not save your response.';
    window.alert(msg);
  }
};

const currentAgency = computed(() => agencyStore.currentAgency?.value || agencyStore.currentAgency || null);

const currentAgencyId = computed(() => {
  return currentAgency.value?.id || null;
});

const { momentumListEnabled } = useMomentumListAddon(currentAgencyId);

const announcementAgencyId = computed(() => {
  const org = currentAgency.value;
  if (!org) return null;

  const orgType = String(org.organization_type || org.organizationType || 'agency').toLowerCase();
  const parentFromCurrent = Number(org.affiliated_agency_id || org.affiliatedAgencyId || 0);
  if (['school', 'program', 'learning', 'clinical'].includes(orgType) && parentFromCurrent > 0) {
    return parentFromCurrent;
  }

  // Fallback: sometimes currentAgency is a partial record; try matching against loaded user organizations.
  const orgId = Number(org.id || 0);
  if (orgId > 0) {
    const match = (agencyStore.userAgencies || []).find((item) => Number(item?.id || 0) === orgId);
    const parentFromList = Number(match?.affiliated_agency_id || match?.affiliatedAgencyId || 0);
    if (['school', 'program', 'learning', 'clinical'].includes(orgType) && parentFromList > 0) {
      return parentFromList;
    }
  }

  return Number(org.id || 0) || null;
});

const supervisionPromptRows = ref([]);
const dismissedOptionalSupervisionPromptIds = ref(new Set());
const presenterAssignmentRows = ref([]);
const dismissedPresenterAssignmentIds = ref(new Set());
const supervisionPromptPollMs = 30000;
let supervisionPromptTimer = null;

const sessionTypeLabel = (type) => {
  const t = String(type || 'individual').toLowerCase();
  if (t === 'group') return 'Group Supervision';
  if (t === 'triadic') return 'Triadic Supervision';
  return 'Individual Supervision';
};

const promptTimeLabel = (row) => {
  try {
    const start = new Date(row.startAt || 0);
    const end = new Date(row.endAt || 0);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'Now';
    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return 'Now';
  }
};

const mandatorySupervisionPrompt = computed(() => {
  const rows = Array.isArray(supervisionPromptRows.value) ? supervisionPromptRows.value : [];
  const required = rows.filter((r) => r?.isRequired);
  if (!required.length) return null;
  const first = required.slice().sort((a, b) => new Date(a?.startAt || 0).getTime() - new Date(b?.startAt || 0).getTime())[0];
  return {
    ...first,
    sessionTypeLabel: sessionTypeLabel(first?.sessionType),
    timeLabel: promptTimeLabel(first)
  };
});

const optionalSupervisionPrompts = computed(() => {
  if (mandatorySupervisionPrompt.value) return [];
  const rows = Array.isArray(supervisionPromptRows.value) ? supervisionPromptRows.value : [];
  const dismissed = dismissedOptionalSupervisionPromptIds.value || new Set();
  return rows
    .filter((r) => !r?.isRequired && !dismissed.has(Number(r?.id || 0)))
    .slice(0, 4)
    .map((row) => ({
      ...row,
      sessionTypeLabel: sessionTypeLabel(row?.sessionType),
      timeLabel: promptTimeLabel(row)
    }));
});

const presenterRoleLabel = (role) => {
  const r = String(role || 'primary').toLowerCase();
  return r === 'secondary' ? 'Secondary' : 'Primary';
};

const presenterReminderLabel = (stage) => {
  const s = String(stage || '');
  if (s === 'd7') return 'Reminder: 7 days';
  if (s === 'h24') return 'Reminder: 24 hours';
  if (s === 'h1') return 'Reminder: 1 hour';
  return '';
};

const presenterAssignmentsNeedingAttention = computed(() => {
  const dismissed = dismissedPresenterAssignmentIds.value || new Set();
  const rows = Array.isArray(presenterAssignmentRows.value) ? presenterAssignmentRows.value : [];
  return rows
    .filter((r) => !dismissed.has(Number(r?.presenterAssignmentId || 0)))
    .filter((r) => {
      const mins = Number(r?.startsInMinutes);
      return Number.isFinite(mins) && mins <= (7 * 24 * 60) && mins >= -120;
    })
    .slice(0, 5)
    .map((r) => ({
      ...r,
      sessionTypeLabel: sessionTypeLabel(r?.sessionType),
      presenterRoleLabel: presenterRoleLabel(r?.presenterRole),
      timeLabel: promptTimeLabel(r),
      reminderLabel: presenterReminderLabel(r?.reminderStage)
    }));
});

const dismissOptionalSupervisionPrompt = (sessionId) => {
  const sid = Number(sessionId || 0);
  if (!sid) return;
  dismissedOptionalSupervisionPromptIds.value = new Set([...(dismissedOptionalSupervisionPromptIds.value || new Set()), sid]);
};

const dismissPresenterAssignment = (assignmentId) => {
  const id = Number(assignmentId || 0);
  if (!id) return;
  dismissedPresenterAssignmentIds.value = new Set([...(dismissedPresenterAssignmentIds.value || new Set()), id]);
};

const joinSupervisionPrompt = (prompt) => {
  const link = String(prompt?.googleMeetLink || '').trim();
  if (link) {
    window.open(link, '_blank', 'noreferrer');
    return;
  }
  activeTab.value = 'my_schedule';
  router.replace({ query: { ...route.query, tab: 'my_schedule' } });
};

const loadSupervisionPrompts = async () => {
  if (props.previewMode || !isOnboardingComplete.value || !authStore.user?.id) {
    supervisionPromptRows.value = [];
    return;
  }
  try {
    const params = {};
    if (currentAgencyId.value) params.agencyId = Number(currentAgencyId.value);
    const resp = await api.get('/supervision/my-prompts', {
      params,
      skipGlobalLoading: true
    });
    supervisionPromptRows.value = Array.isArray(resp.data?.prompts) ? resp.data.prompts : [];
  } catch {
    supervisionPromptRows.value = [];
  }
};

const loadPresenterAssignments = async () => {
  if (props.previewMode || !isOnboardingComplete.value || !authStore.user?.id) {
    presenterAssignmentRows.value = [];
    return;
  }
  try {
    const params = {};
    if (currentAgencyId.value) params.agencyId = Number(currentAgencyId.value);
    const resp = await api.get('/supervision/my-presenter-assignments', {
      params,
      skipGlobalLoading: true
    });
    presenterAssignmentRows.value = Array.isArray(resp.data?.assignments) ? resp.data.assignments : [];
  } catch {
    presenterAssignmentRows.value = [];
  }
};

const updateScheduleFullscreenState = () => {
  const root = myScheduleStageRef.value;
  const fs = document.fullscreenElement;
  scheduleFullscreenActive.value = !!(fs && root && (fs === root || root.contains(fs)));
};

const toggleScheduleFullscreen = async () => {
  try {
    const root = myScheduleStageRef.value;
    if (!root) return;
    if (document.fullscreenElement && (document.fullscreenElement === root || root.contains(document.fullscreenElement))) {
      await document.exitFullscreen();
      return;
    }
    await root.requestFullscreen();
  } catch {
    // Ignore browser restrictions.
  }
};

const openScheduleInNewWindow = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', 'my_schedule');
  const w = Math.max(1200, window.screen?.availWidth || window.innerWidth || 1200);
  const h = Math.max(800, window.screen?.availHeight || window.innerHeight || 800);
  window.open(url.toString(), '_blank', `noopener,noreferrer,width=${w},height=${h}`);
};

const fetchSuperviseesForSchedule = async () => {
  try {
    superviseesError.value = '';
    const myId = Number(authStore.user?.id || 0);
    if (!myId) return;
    if (!isSupervisor(authStore.user)) return;

    superviseesLoading.value = true;
    const resp = await api.get(`/supervisor-assignments/supervisor/${myId}`);

    const rows = Array.isArray(resp.data) ? resp.data : [];
    supervisees.value = rows
      .map((r) => ({
        id: Number(r?.supervisee_id || 0),
        firstName: String(r?.supervisee_first_name || '').trim(),
        lastName: String(r?.supervisee_last_name || '').trim(),
        agencyName: String(r?.agency_name || '').trim(),
        profilePhotoUrl: String(r?.supervisee_profile_photo_url || '').trim() || null
      }))
      .filter((s) => Number.isFinite(s.id) && s.id > 0);

    if (scheduleViewMode.value === 'supervisee' && selectedSuperviseeId.value > 0) {
      const exists = supervisees.value.some((s) => Number(s.id) === Number(selectedSuperviseeId.value));
      if (!exists) selectedSuperviseeId.value = 0;
    }
  } catch (e) {
    supervisees.value = [];
    const msg = e?.response?.data?.error?.message || e?.message || 'Failed to load supervisees';
    superviseesError.value = msg;
  } finally {
    superviseesLoading.value = false;
  }
};

const scheduleViewPrefKey = computed(() => {
  const userId = Number(authStore.user?.id || 0);
  if (!userId) return '';
  return `${SCHEDULE_VIEW_PREF_PREFIX}:${userId}`;
});

const loadScheduleViewPrefs = () => {
  const key = String(scheduleViewPrefKey.value || '');
  if (!key) return;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const mode = String(parsed?.mode || '').toLowerCase();
    if (mode === 'self' || mode === 'supervisee') scheduleViewMode.value = mode;
    const sid = Number(parsed?.superviseeId ?? 0);
    selectedSuperviseeId.value = Number.isFinite(sid) && sid >= 0 ? sid : 0;
    const sortKey = String(parsed?.sortKey || '').toLowerCase();
    if (sortKey === 'name' || sortKey === 'agency') superviseeSortKey.value = sortKey;
    const sortDir = String(parsed?.sortDir || '').toLowerCase();
    if (sortDir === 'asc' || sortDir === 'desc') superviseeSortDir.value = sortDir;
    superviseeQuery.value = String(parsed?.query || '');
    const selfWeek = String(parsed?.selfWeekStartYmd || '').slice(0, 10);
    const superviseeWeek = String(parsed?.superviseeWeekStartYmd || '').slice(0, 10);
    selfScheduleWeekStartYmd.value = /^\d{4}-\d{2}-\d{2}$/.test(selfWeek) ? selfWeek : '';
    superviseeScheduleWeekStartYmd.value = /^\d{4}-\d{2}-\d{2}$/.test(superviseeWeek) ? superviseeWeek : '';
  } catch {
    // ignore malformed local preferences
  }
};

const saveScheduleViewPrefs = () => {
  const key = String(scheduleViewPrefKey.value || '');
  if (!key || !isSupervisor(authStore.user)) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      mode: scheduleViewMode.value,
      superviseeId: Number(selectedSuperviseeId.value || 0),
      sortKey: superviseeSortKey.value,
      sortDir: superviseeSortDir.value,
      query: superviseeQuery.value,
      selfWeekStartYmd: selfScheduleWeekStartYmd.value || null,
      superviseeWeekStartYmd: superviseeScheduleWeekStartYmd.value || null
    }));
  } catch {
    // ignore storage limits/private mode
  }
};

const superviseeName = (s) => {
  const first = String(s?.firstName || '').trim();
  const last = String(s?.lastName || '').trim();
  return `${first} ${last}`.trim() || `User ${Number(s?.id || 0)}`;
};

const superviseeInitials = (s) => {
  const first = String(s?.firstName || '').trim();
  const last = String(s?.lastName || '').trim();
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase() || '?';
};

const superviseePhotoUrl = (s) => {
  const raw = String(s?.profilePhotoUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) return toUploadsUrl(raw);
  return raw;
};

const superviseeLabel = (s) => {
  const name = `${String(s?.lastName || '').trim()}, ${String(s?.firstName || '').trim()}`.replace(/^,\s*/, '').trim();
  const agency = String(s?.agencyName || '').trim();
  return agency ? `${name} (${agency})` : name;
};

const superviseesFilteredSorted = computed(() => {
  const q = String(superviseeQuery.value || '').trim().toLowerCase();
  const key = String(superviseeSortKey.value || 'name');
  const dir = String(superviseeSortDir.value || 'asc') === 'desc' ? -1 : 1;

  const normNameKey = (s) => `${String(s?.lastName || '').toLowerCase()}|${String(s?.firstName || '').toLowerCase()}`;
  const normAgencyKey = (s) => `${String(s?.agencyName || '').toLowerCase()}|${normNameKey(s)}`;

  return (supervisees.value || [])
    .filter((s) => {
      if (!q) return true;
      const hay = `${s.firstName} ${s.lastName} ${s.agencyName}`.toLowerCase();
      return hay.includes(q);
    })
    .slice()
    .sort((a, b) => {
      const ka = key === 'agency' ? normAgencyKey(a) : normNameKey(a);
      const kb = key === 'agency' ? normAgencyKey(b) : normNameKey(b);
      return dir * ka.localeCompare(kb);
    })
    .map((s) => ({ ...s, label: superviseeLabel(s) }));
});

const scheduleGridUserId = computed(() => {
  if (scheduleViewMode.value === 'self') return Number(authStore.user?.id || 0);
  if (scheduleViewMode.value === 'supervisee') return Number(selectedSuperviseeId.value || 0);
  return 0;
});

const superviseeScheduleUsers = computed(() => {
  const rows = superviseesFilteredSorted.value || [];
  const selectedId = Number(selectedSuperviseeId.value || 0);
  if (scheduleViewMode.value !== 'supervisee') return [];
  if (selectedId <= 0) return rows;
  return rows.filter((s) => Number(s.id) === selectedId);
});

const allSuperviseeUserIds = computed(() =>
  (superviseeScheduleUsers.value || [])
    .map((s) => Number(s.id || 0))
    .filter((n) => Number.isFinite(n) && n > 0)
);

const superviseeLabelById = computed(() => {
  const out = {};
  for (const s of (superviseeScheduleUsers.value || [])) {
    const id = Number(s?.id || 0);
    if (!id) continue;
    out[id] = superviseeName(s);
  }
  return out;
});

const activeScheduleWeekStartYmd = computed(() => (
  scheduleViewMode.value === 'supervisee'
    ? String(superviseeScheduleWeekStartYmd.value || '').trim()
    : String(selfScheduleWeekStartYmd.value || '').trim()
));

const onScheduleWeekStartUpdate = (nextYmd) => {
  const next = String(nextYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
  if (scheduleViewMode.value === 'supervisee') {
    superviseeScheduleWeekStartYmd.value = next;
  } else {
    selfScheduleWeekStartYmd.value = next;
  }
};

const scheduleGridMode = computed(() => (scheduleViewMode.value === 'self' ? 'self' : 'admin'));

const tabs = computed(() => [
  { id: 'checklist', label: momentumListEnabled.value ? 'Momentum List' : 'Checklist', badgeCount: checklistCount.value },
  { id: 'training', label: 'Training', badgeCount: trainingCount.value },
  { id: 'documents', label: 'Documents', badgeCount: documentsCount.value }
]);

const isOnboardingComplete = computed(() => {
  // Privileged roles should always have access to the "My" area (account + payroll),
  // even if their lifecycle status doesn't match the employee workflow.
  const role = authStore.user?.role;
  if (role === 'super_admin' || role === 'admin' || role === 'support') return true;

  const st = userStatus.value;
  // Approved employees should always be able to access on-demand + prefs.
  if (authStore.user?.type === 'approved_employee') return true;
  const lower = String(st || '').toLowerCase();
  return (
    lower === 'active_employee' ||
    lower === 'active' ||
    lower === 'completed' ||
    lower === 'terminated_pending' ||
    lower === 'terminated'
  );
});

// Agency logo URL for preview mode
const previewAgencyLogoUrl = computed(() => {
  if (!props.previewMode) return null;
  return agencyStore.currentAgency?.logo_url || null;
});

const filteredTabs = computed(() => {
  // PREHIRE_OPEN, PREHIRE_REVIEW, and ONBOARDING users see limited tabs
  if (isPending.value || userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ONBOARDING' || 
      userStatus.value === 'ready_for_review') {
    // Pre-hire and onboarding users only see checklist and documents (no training tab)
    return tabs.value.filter(tab => tab.id !== 'training');
  }
  // ACTIVE_EMPLOYEE and TERMINATED_PENDING users see all tabs
  return tabs.value;
});

const isSchoolStaff = computed(() => String(authStore.user?.role || '').toLowerCase() === 'school_staff');
const isAgencyDashboardContext = computed(() => {
  const currentType = String(
    agencyStore.currentAgency?.organization_type ||
    agencyStore.currentAgency?.organizationType ||
    'agency'
  ).toLowerCase();
  return currentType === 'agency';
});
const canAccessToolsAids = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  // Keep role access aligned with router permissions for /admin/tools-aids.
  if (!isAgencyDashboardContext.value) return false;
  return ['admin', 'super_admin', 'support', 'provider', 'staff', 'clinical_practice_assistant', 'provider_plus', 'supervisor'].includes(role);
});

const isAgencyOrgType = (org) => String(org?.organization_type || org?.organizationType || 'agency').toLowerCase() === 'agency';
const portalShortTitle = (org) => {
  return String(
    org?.portal_short_title ||
      org?.portalShortTitle ||
      org?.short_title ||
      org?.shortTitle ||
      org?.portal_url ||
      org?.portalUrl ||
      org?.slug ||
      org?.name ||
      'Portal'
  ).trim();
};
const portalLogoUrl = (org) => {
  const candidates = [
    org?.logo_path,
    org?.logoPath,
    org?.icon_file_path,
    org?.iconFilePath,
    org?.logo_url,
    org?.logoUrl,
    org?.icon_url,
    org?.iconUrl
  ];
  const raw = candidates.find((v) => String(v || '').trim());
  if (!raw) return null;
  const value = String(raw).trim();
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/uploads/') || value.startsWith('uploads/')) return toUploadsUrl(value);
  return value;
};
const providerPortalCards = computed(() => {
  const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  return list
    .filter((org) => !isAgencyOrgType(org))
    .map((org) => {
      const slug = String(org?.slug || org?.portal_url || org?.portalUrl || '').trim();
      if (!slug) return null;
      const label = portalShortTitle(org);
      return {
        id: `portal_org_${String(org?.id || slug)}`,
        label,
        kind: 'link',
        to: `/${slug}/dashboard`,
        badgeCount: 0,
        iconUrl:
          portalLogoUrl(org) ||
          brandingStore.getDashboardCardIconUrl('my_schedule', org) ||
          brandingStore.getDashboardCardIconUrl('my', org) ||
          brandingStore.getDashboardCardIconUrl('my_schedule'),
        description: `Open ${String(org?.name || label)} portal.`
      };
    })
    .filter(Boolean);
});
const shouldCollapseSchoolPortalCards = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'admin' || role === 'support' || role === 'super_admin';
});
const schoolPortalCardsExpanded = ref(false);
const schoolPortalToggleCard = computed(() => {
  const count = providerPortalCards.value.length;
  if (!count || !shouldCollapseSchoolPortalCards.value) return null;
  return {
    id: 'show_all_school_portals',
    label: schoolPortalCardsExpanded.value ? 'Hide School Portals' : 'Show All School Portals',
    kind: 'action',
    badgeCount: count,
    iconUrl:
      brandingStore.getDashboardCardIconUrl('my_schedule') ||
      brandingStore.getDashboardCardIconUrl('my'),
    description: schoolPortalCardsExpanded.value
      ? 'Collapse portal cards.'
      : 'Expand all school/program/learning portal cards.'
  };
});
const visibleProviderPortalCards = computed(() => {
  if (!providerPortalCards.value.length) return [];
  if (!shouldCollapseSchoolPortalCards.value) return providerPortalCards.value;
  return schoolPortalCardsExpanded.value ? providerPortalCards.value : [];
});

const dashboardCards = computed(() => {
  const u = authStore.user;
  const role = String(u?.role || '').toLowerCase();
  const caps = u?.capabilities || {};
  const isTrueAdmin = role === 'admin' || role === 'super_admin';
  const isProvider = role === 'provider';
  const isSup = isSupervisor(u);
  const isLimitedAccessNonProvider = !isTrueAdmin && !isProvider && (isSup || !!caps?.canManageHiring || !!caps?.canManagePayroll);

  // Use the current organization (when selected) for icon overrides.
  // If none is selected, we fall back to platform branding inside `getDashboardCardIconUrl`.
  const cardIconOrgOverride = undefined;
  const cards = filteredTabs.value.map((t) => ({
    ...t,
    kind: 'content',
    iconUrl: brandingStore.getDashboardCardIconUrl(
      t.id === 'checklist' && momentumListEnabled.value ? 'momentum_list' : t.id,
      cardIconOrgOverride
    ),
    description:
      t.id === 'checklist'
        ? (momentumListEnabled.value ? 'Your focus digest, checklist, and actionable items.' : 'Training, documents, and custom checklist items.')
        : t.id === 'training'
          ? 'Assigned training modules and progress.'
          : 'Documents that need review or signature.'
  }));

  // Post-onboarding cards
  if (isOnboardingComplete.value) {
    // School staff should not see payroll/claims submission surfaces.
    if (!isSchoolStaff.value) {
      // My Schedule is personal and should be visible to everyone using the dashboard.
      cards.push({
        id: 'my_schedule',
        label: 'My Schedule',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('my_schedule', cardIconOrgOverride),
        description: 'View weekly schedule and request availability from the grid.'
      });
      if (schoolPortalToggleCard.value) cards.push(schoolPortalToggleCard.value);
      cards.push(...visibleProviderPortalCards.value);

      // Provider-only surfaces: hide these for limited-access non-provider users.
      if (!isLimitedAccessNonProvider) {
        cards.push({
          id: 'clients',
          label: 'Clients',
          kind: 'content',
          badgeCount: clientsNeedsAttentionCount.value || 0,
          iconUrl: brandingStore.getDashboardCardIconUrl('clients', cardIconOrgOverride),
          description: 'Your caseload by school with psychotherapy fiscal-year totals.'
        });
        if (providerSurfacesEnabled.value) {
          cards.push({
            id: 'submit',
            label: 'Submit',
            kind: 'content',
            badgeCount: 0,
            iconUrl: brandingStore.getDashboardCardIconUrl('submit', cardIconOrgOverride),
            description: 'Submit mileage, in-school claims, and more.'
          });
        }
        cards.push({
          id: 'payroll',
          label: 'Payroll',
          kind: 'content',
          badgeCount: 0,
          iconUrl: brandingStore.getDashboardCardIconUrl('payroll', cardIconOrgOverride),
          description: 'Your payroll history by pay period.'
        });
        if (shiftProgramsEnabledForAgency.value) {
          cards.push({
            id: 'program_shifts',
            label: 'My Shifts',
            kind: 'content',
            badgeCount: 0,
            iconUrl: brandingStore.getDashboardCardIconUrl('my_schedule', cardIconOrgOverride),
            description: 'Program shift schedule, sign up, and call-off.'
          });
        }
      }
      // Show Tools & Aids for eligible roles. Privileged roles (admin/super_admin/support) always see it
      // even when no agency is selected; others require the feature flag on current agency.
      const showToolsAids =
        canAccessToolsAids.value &&
        (clinicalNoteGeneratorEnabledForAgency.value ||
          ['admin', 'super_admin', 'support'].includes(role));
      if (showToolsAids) {
        const slug = route.params?.organizationSlug;
        cards.push({
          id: 'tools_aids',
          label: 'Tools & Aids',
          kind: 'link',
          to: typeof slug === 'string' && slug ? `/${slug}/admin/tools-aids` : '/admin/tools-aids',
          badgeCount: 0,
          iconUrl: brandingStore.getDashboardCardIconUrl('tools_aids', cardIconOrgOverride),
          description: 'Note Aid and upcoming clinical tools.'
        });
      }
      // My Shifts: also show for staff/facilitator/intern (shift program participants) when agency has flag
      if (shiftProgramsEnabledForAgency.value && ['staff', 'facilitator', 'intern'].includes(role)) {
        if (!cards.some((c) => c?.id === 'program_shifts')) {
          cards.push({
            id: 'program_shifts',
            label: 'My Shifts',
            kind: 'content',
            badgeCount: 0,
            iconUrl: brandingStore.getDashboardCardIconUrl('my_schedule', cardIconOrgOverride),
            description: 'Program shift schedule, sign up, and call-off.'
          });
        }
      }
    }
    cards.push({
      id: 'my',
      label: 'My Account',
      kind: 'content',
      badgeCount: 0,
      iconUrl: brandingStore.getDashboardCardIconUrl('my', cardIconOrgOverride),
      description: 'Account info, credentials, and personal preferences.'
    });
    cards.push({
      id: 'on_demand_training',
      label: 'On-Demand Training',
      kind: 'content',
      badgeCount: 0,
      iconUrl: brandingStore.getDashboardCardIconUrl('on_demand_training', cardIconOrgOverride),
      description: 'Always available after onboarding is complete.'
    });
    // Social feeds – super_admin only until full release
    if (role === 'super_admin') {
      cards.push({
        id: 'social_feeds',
        label: 'Social feeds',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('social_feeds', cardIconOrgOverride),
        description: 'Social and school feeds from your organization.'
      });
    }

    // Communications surfaces (separate pages)
    if (!isLimitedAccessNonProvider) {
      cards.push({
        id: 'communications',
        label: 'Communications',
        kind: 'link',
        to: '/admin/communications/sms',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('communications', cardIconOrgOverride),
        description: 'SMS inbox, calls, and delivery automation workspace.'
      });
      cards.push({
        id: 'chats',
        label: 'Chats',
        kind: 'link',
        to: '/admin/communications/chats',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('chats', cardIconOrgOverride),
        description: 'Direct messages in the platform.'
      });
      cards.push({
        id: 'contacts',
        label: 'Contacts',
        kind: 'link',
        to: '/admin/contacts',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('contacts', cardIconOrgOverride),
        description: 'Agency contacts for mass communications and outreach.'
      });
    }

    // Notifications: show for all users and route to the unified hub.
    cards.push({
      id: 'notifications',
      label: 'Notifications',
      kind: 'link',
      to: '/notifications',
      badgeCount: 0,
      iconUrl: brandingStore.getDashboardCardIconUrl('notifications', cardIconOrgOverride),
      description: 'Your recent notifications.'
    });
    // Supervision card (supervisors only)
    if (isSupervisor(authStore.user)) {
      cards.push({
        id: 'supervision',
        label: 'Supervision',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('supervision', cardIconOrgOverride),
        description: 'View and support your supervisees.'
      });
    }
    // Providers card (provider_plus only) – view all providers as though supervising them
    if (String(u?.role || '').toLowerCase() === 'provider_plus') {
      cards.push({
        id: 'providers',
        label: 'Providers',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('supervision', cardIconOrgOverride),
        description: 'View and support all providers in your organization.'
      });
    }

    // Skill Builders availability (coordinator access)
    if (isSkillBuilderCoordinator.value) {
      const orgOverride = agencyStore.currentAgency?.value || agencyStore.currentAgency || null;
      cards.push({
        id: 'skill_builders_availability',
        label: 'Skill Builders',
        kind: 'modal',
        badgeCount: 0,
        iconUrl: brandingStore.getAdminQuickActionIconUrl('skill_builders_availability', orgOverride),
        description: 'Review Skill Builder availability submissions.'
      });
    }
  }

  return cards;
});

const railCards = computed(() => {
  const cards = (dashboardCards.value || []).slice();
  const hasMy = cards.some((c) => String(c?.id) === 'my');

  const orderIndex = (id) => {
    const k = String(id || '');
    if (k === 'show_all_school_portals') return hasMy ? 2 : 4;
    if (hasMy && k.startsWith('portal_org_')) return 2;
    if (!hasMy && k.startsWith('portal_org_')) return 4;
    // Stable rail order:
    // - If My Account exists (post-onboarding), keep it first and Checklist second.
    // - If My Account doesn't exist yet (during onboarding), Checklist stays first.
    if (hasMy) {
      return ({
        my: 0,
        my_schedule: 1,
        program_shifts: 2,
        skill_builders_availability: 3,
        clients: 4,
        tools_aids: 5,
        checklist: 6,
        training: 7,
        documents: 8,
        submit: 9,
        payroll: 10,
        on_demand_training: 11,
        social_feeds: 12,
        communications: 13,
        chats: 14,
        notifications: 15,
        supervision: 16,
        providers: 17
      })[k] ?? 999;
    }
    return ({
      checklist: 0,
      documents: 1,
      training: 2,
      my_schedule: 3,
      program_shifts: 4,
      skill_builders_availability: 5,
      clients: 6,
      tools_aids: 6,
      submit: 7,
      payroll: 8,
      my: 9,
      on_demand_training: 10,
      social_feeds: 11,
      communications: 12,
      chats: 13,
        notifications: 14,
        supervision: 15,
        providers: 16
    })[k] ?? 999;
  };

  return cards.sort((a, b) => {
    const da = orderIndex(a?.id);
    const db = orderIndex(b?.id);
    if (da !== db) return da - db;
    return String(a?.label || '').localeCompare(String(b?.label || ''));
  });
});

const topCardCollapsed = ref(false);

const SOCIAL_FEEDS_COLLAPSE_KEY = 'dashboard.socialFeedsCollapsed.v1';
const socialFeedsCollapsed = ref(false);
const dashboardSocialFeeds = ref([]);
const selectedSocialFeedId = ref(null);
const toggleTopCardCollapsed = () => {
  topCardCollapsed.value = !topCardCollapsed.value;
};

const loadSocialFeedsCollapsed = () => {
  try {
    const v = window?.localStorage?.getItem?.(SOCIAL_FEEDS_COLLAPSE_KEY);
    socialFeedsCollapsed.value = v === '1';
  } catch {
    socialFeedsCollapsed.value = false;
  }
};
const toggleSocialFeedsCollapsed = () => {
  socialFeedsCollapsed.value = !socialFeedsCollapsed.value;
  try {
    window?.localStorage?.setItem?.(SOCIAL_FEEDS_COLLAPSE_KEY, socialFeedsCollapsed.value ? '1' : '0');
  } catch {
    // ignore
  }
};

async function loadDashboardSocialFeeds() {
  if (!currentAgencyId.value || !isOnboardingComplete.value || authStore.user?.role !== 'super_admin') {
    dashboardSocialFeeds.value = [];
    return;
  }
  try {
    const res = await api.get('/dashboard/social-feeds', { params: { agencyId: currentAgencyId.value } });
    dashboardSocialFeeds.value = Array.isArray(res.data?.feeds) ? res.data.feeds : [];
  } catch {
    dashboardSocialFeeds.value = [];
  }
}

function platformIconLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'instagram') return 'IG';
  if (t === 'facebook') return 'FB';
  if (t === 'rss') return 'RSS';
  if (t === 'embed') return 'Widget';
  return 'Link';
}

function openSocialFeedInDetail(feed) {
  selectedSocialFeedId.value = feed.id;
  activeTab.value = 'social_feeds';
  router.replace({ query: { ...route.query, tab: 'social_feeds' } });
}

const handleCardClick = (card) => {
  closeCardDescriptor();
  if (props.previewMode) return;
  if (card.kind === 'link' && card.to) {
    router.push(String(card.to));
    return;
  }
  if (card.id === 'show_all_school_portals') {
    schoolPortalCardsExpanded.value = !schoolPortalCardsExpanded.value;
    return;
  }
  if (card.id === 'skill_builders_availability') {
    showSkillBuildersAvailabilityModal.value = true;
    return;
  }
  if (card.id === 'submit') {
    submitPanelView.value = 'root';
    activeTab.value = 'submit';
    loadMyAssignedSchools();
    router.replace({ query: { ...route.query, tab: 'submit' } });
    return;
  }
  if (card.id === 'on_demand_training') {
    activeTab.value = 'on_demand_training';
    router.replace({ query: { ...route.query, tab: 'on_demand_training' } });
    return;
  }
  activeTab.value = card.id;
  if (props.previewMode) return;
  if (card.id === 'my') {
    router.replace({ query: { ...route.query, tab: 'my', my: myTab.value } });
  } else {
    router.replace({ query: { ...route.query, tab: card.id } });
  }
};

const setMyTab = (tab) => {
  myTab.value = tab;
  activeTab.value = 'my';
  if (props.previewMode) return;
  router.replace({ query: { ...route.query, tab: 'my', my: tab } });
};

const syncFromQuery = () => {
  if (props.previewMode) return;
  const qTab = route.query?.tab;
  if (typeof qTab === 'string') {
    const allowed = new Set((railCards.value || []).map((c) => String(c?.id || '')).filter(Boolean));
    if (allowed.has(qTab)) activeTab.value = qTab;
  }

  const qMy = route.query?.my;
  if (typeof qMy === 'string' && ['account', 'credentials', 'preferences', 'payroll', 'compensation', 'kudos'].includes(qMy)) {
    myTab.value = qMy;
  }

  if (String(qTab || '') === 'my_schedule') {
    const qScheduleMode = String(route.query?.scheduleMode || '').toLowerCase();
    if (qScheduleMode === 'self') scheduleViewMode.value = 'self';
    if (qScheduleMode === 'supervisee') {
      scheduleViewMode.value = 'supervisee';
      const qSuperviseeRaw = String(route.query?.superviseeId || '').trim().toLowerCase();
      if (qSuperviseeRaw === 'all') {
        selectedSuperviseeId.value = 0;
      } else {
        const qSuperviseeId = Number.parseInt(qSuperviseeRaw, 10);
        if (Number.isFinite(qSuperviseeId) && qSuperviseeId > 0) {
          selectedSuperviseeId.value = qSuperviseeId;
        }
      }
    }
  }
};

const submitPanelView = ref('root'); // 'root' | 'in_school' | 'time' | 'availability' | 'virtual_hours'

const handleDocumentPointerDown = (event) => {
  if (!openCardDescriptorId.value) return;
  const target = event?.target;
  if (target instanceof Element && target.closest('.rail-card-help')) return;
  closeCardDescriptor();
};

const handleDocumentKeydown = (event) => {
  if (event?.key !== 'Escape') return;
  closeCardDescriptor();
};

const openTimeClaims = () => {
  submitPanelView.value = 'time';
};

const openAdditionalAvailability = () => {
  if (!currentAgencyId.value) {
    window.alert('Select an organization first.');
    return;
  }
  submitPanelView.value = 'availability';
};

const openVirtualWorkingHours = () => {
  if (!currentAgencyId.value) {
    window.alert('Select an organization first.');
    return;
  }
  submitPanelView.value = 'virtual_hours';
};

const assignedSchools = ref([]);
const assignedSchoolsLoading = ref(false);
const hasAssignedSchools = computed(() => (assignedSchools.value || []).length > 0);

const loadMyAssignedSchools = async () => {
  if (props.previewMode) return;
  if (!currentAgencyId.value) {
    assignedSchools.value = [];
    return;
  }
  try {
    assignedSchoolsLoading.value = true;
    const api = (await import('../services/api')).default;
    const resp = await api.get('/payroll/me/assigned-schools', { params: { agencyId: currentAgencyId.value } });
    assignedSchools.value = resp.data || [];
  } catch {
    assignedSchools.value = [];
  } finally {
    assignedSchoolsLoading.value = false;
  }
};

const openInSchoolClaims = () => {
  if (!inSchoolEnabled.value) {
    window.alert('In-School submissions are disabled for this organization.');
    return;
  }
  if (!hasAssignedSchools.value) {
    window.alert('You do not have any assigned school locations, so In-School Claims are not available.');
    return;
  }
  submitPanelView.value = 'in_school';
};

const goToSubmission = (kind) => {
  // Use My -> My Payroll as the actual submission surface (it already has the modals/forms).
  submitPanelView.value = 'root';
  setMyTab('payroll');
  router.replace({ query: { ...route.query, tab: 'my', my: 'payroll', submission: kind } });
};

const updateTrainingCount = (count) => {
  trainingCount.value = count;
};

const updateDocumentsCount = (count) => {
  documentsCount.value = count;
};

const updateChecklistCount = (count) => {
  checklistCount.value = count;
};

const fetchOnboardingStatus = async () => {
  // In preview mode, use mock data
  if (props.previewMode) {
    if (props.previewData) {
      onboardingCompletion.value = props.previewData.onboardingCompletion || 0;
      trainingCount.value = props.previewData.trainingCount || 0;
      documentsCount.value = props.previewData.documentsCount || 0;
      checklistCount.value = props.previewData.checklistCount || 0;
      daysRemaining.value = props.previewData.daysRemaining || null;
      pendingCompletionStatus.value = props.previewData.pendingCompletionStatus || null;
    }
    if (props.previewStatus) {
      userStatus.value = props.previewStatus;
      isPending.value = props.previewStatus === 'PREHIRE_OPEN' || props.previewStatus === 'PENDING_SETUP';
    }
    return;
  }
  
  try {
    const api = (await import('../services/api')).default;
    const userId = authStore.user?.id;
    if (userId) {
      const [checklistResponse, userResponse] = await Promise.all([
        api.get(`/users/${userId}/onboarding-checklist`),
        api.get(`/users/${userId}`)
      ]);
      onboardingCompletion.value = checklistResponse.data.completionPercentage || 100;
      userStatus.value = userResponse.data.status || 'ACTIVE_EMPLOYEE';
      isPending.value = userStatus.value === 'PREHIRE_OPEN' || userStatus.value === 'PENDING_SETUP' || userStatus.value === 'pending';
      
      // Fetch pending completion status if user is in pre-hire status
      if (isPending.value || userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ready_for_review') {
        try {
          const statusResponse = await api.get(`/users/${userId}/pending/status`);
          pendingCompletionStatus.value = statusResponse.data;
        } catch (err) {
          console.error('Error fetching pending completion status:', err);
          // If user is PREHIRE_REVIEW, set accessLocked to true
          if (userStatus.value === 'PREHIRE_REVIEW' || userStatus.value === 'ready_for_review') {
            pendingCompletionStatus.value = { accessLocked: true, allComplete: true };
          }
        }
      }
      
      // Calculate days remaining
      if (userResponse.data.status_expires_at) {
        const expiresAt = new Date(userResponse.data.status_expires_at);
        const now = new Date();
        const diffTime = expiresAt - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysRemaining.value = diffDays > 0 ? diffDays : 0;
      } else {
        daysRemaining.value = null;
      }
    }
  } catch (err) {
    // If checklist doesn't exist or error, assume complete
    onboardingCompletion.value = 100;
  }
};

const loadCurrentTier = async () => {
  if (props.previewMode) return;
  if (!isOnboardingComplete.value) return;
  if (!currentAgencyId.value) return;
  try {
    const api = (await import('../services/api')).default;
    const resp = await api.get('/payroll/me/current-tier', { params: { agencyId: currentAgencyId.value } });
    const t = resp.data?.tier || null;
    const label = String(t?.label || '').trim();
    const status = String(t?.status || '').trim().toLowerCase();
    tierBadgeText.value = label || '';
    if (!tierBadgeText.value) {
      tierBadgeKind.value = '';
      return;
    }
    tierBadgeKind.value =
      status === 'grace' ? 'tier-grace'
        : status === 'current' ? 'tier-current'
          : 'tier-ooc';
  } catch {
    tierBadgeText.value = '';
    tierBadgeKind.value = '';
  }
};

const handlePendingCompleted = () => {
  if (props.previewMode) return; // Disable in preview mode
  // Redirect to completion view
  router.push('/pending-completion');
};

const downloadOnboardingDocument = async () => {
  try {
    downloading.value = true;
    const api = (await import('../services/api')).default;
    const userId = authStore.user?.id;
    
    const response = await api.get(`/users/${userId}/onboarding-document`, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `onboarding-document-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download onboarding document');
  } finally {
    downloading.value = false;
  }
};

// Watch for preview status/data changes
watch(() => [props.previewStatus, props.previewData], () => {
  if (props.previewMode) {
    fetchOnboardingStatus();
  }
}, { deep: true });

watch(() => [route.query?.tab, route.query?.my, route.query?.scheduleMode, route.query?.superviseeId], () => {
  syncFromQuery();
});

watch([
  scheduleViewMode,
  selectedSuperviseeId,
  superviseeSortKey,
  superviseeSortDir,
  superviseeQuery,
  selfScheduleWeekStartYmd,
  superviseeScheduleWeekStartYmd
], () => {
  saveScheduleViewPrefs();
});

watch([activeTab, scheduleViewMode, selectedSuperviseeId], () => {
  if (props.previewMode) return;
  if (activeTab.value !== 'my_schedule') return;
  const nextQuery = { ...route.query, tab: 'my_schedule' };
  if (scheduleViewMode.value === 'supervisee') {
    nextQuery.scheduleMode = 'supervisee';
    nextQuery.superviseeId = Number(selectedSuperviseeId.value || 0) > 0
      ? String(Number(selectedSuperviseeId.value || 0))
      : 'all';
  } else {
    delete nextQuery.scheduleMode;
    delete nextQuery.superviseeId;
  }
  const currentMode = String(route.query?.scheduleMode || '');
  const currentId = String(route.query?.superviseeId || '');
  const nextMode = String(nextQuery.scheduleMode || '');
  const nextId = String(nextQuery.superviseeId || '');
  if (currentMode === nextMode && currentId === nextId) return;
  router.replace({ query: nextQuery });
});

watch(
  () => tutorialStore.enabled,
  (enabled) => {
    if (!enabled) closeCardDescriptor();
  }
);

const loadAgencyDashboardBanner = async () => {
  if (props.previewMode) {
    dashboardBanner.value = null;
    scheduledBannerItems.value = [];
    return;
  }
  if (!announcementAgencyId.value) {
    dashboardBanner.value = null;
    scheduledBannerItems.value = [];
    return;
  }
  try {
    dashboardBannerLoading.value = true;
    dashboardBannerError.value = '';
    const [birthdayResp, scheduledResp] = await Promise.allSettled([
      api.get(`/agencies/${announcementAgencyId.value}/dashboard-banner`),
      api.get(`/agencies/${announcementAgencyId.value}/announcements/banner`)
    ]);

    if (birthdayResp.status === 'fulfilled') {
      dashboardBanner.value = birthdayResp.value?.data?.banner || null;
    } else {
      dashboardBanner.value = null;
    }

    if (scheduledResp.status === 'fulfilled') {
      scheduledBannerItems.value = Array.isArray(scheduledResp.value?.data) ? scheduledResp.value.data : [];
    } else {
      scheduledBannerItems.value = [];
    }

    if (birthdayResp.status === 'rejected' || scheduledResp.status === 'rejected') {
      const err = birthdayResp.status === 'rejected' ? birthdayResp.reason : scheduledResp.reason;
      dashboardBannerError.value = err?.response?.data?.error?.message || err?.message || 'Failed to load banner';
    }
  } catch (e) {
    // Non-blocking; don't break dashboard if this fails.
    dashboardBanner.value = null;
    scheduledBannerItems.value = [];
    dashboardBannerError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load banner';
  } finally {
    dashboardBannerLoading.value = false;
  }
};

const loadMyCompanyEvents = async () => {
  if (props.previewMode || !isOnboardingComplete.value) {
    companyEvents.value = [];
    return;
  }
  try {
    const resp = await api.get('/me/company-events');
    const rows = Array.isArray(resp.data) ? resp.data : [];
    const sorted = rows
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a?.nextOccurrenceStart || a?.startsAt || 0).getTime();
        const bTime = new Date(b?.nextOccurrenceStart || b?.startsAt || 0).getTime();
        return aTime - bTime;
      })
      .slice(0, 8);
    companyEvents.value = sorted;
  } catch {
    companyEvents.value = [];
  }
};

onMounted(async () => {
  if (!props.previewMode && authStore.isAuthenticated) {
    api.post('/auth/activity-log', { actionType: 'dashboard_view' }).catch(() => {});
  }
  // Remember Google quick-login only after a successful OAuth callback hit dashboard.
  if (String(route.query?.sso || '') === '1') {
    const orgSlug = String(route.params?.organizationSlug || '').trim().toLowerCase();
    const username = String(authStore.user?.username || authStore.user?.email || '').trim();
    if (orgSlug && username) {
      setRememberedGoogleLogin({ username, orgSlug });
    }
    const nextQuery = { ...route.query };
    delete nextQuery.sso;
    router.replace({ query: nextQuery }).catch(() => {});
  }

  // Always start expanded on each visit so users do not lose visibility.
  topCardCollapsed.value = false;
  loadSocialFeedsCollapsed();
  await fetchOnboardingStatus();
  loadScheduleViewPrefs();
  syncFromQuery();
  // When no tab in URL, apply default_landing_page preference or fall back to existing logic.
  if (!route.query?.tab && !route.query?.my) {
    const landing = userPrefsStore.defaultLandingPage || 'dashboard';
    const allowed = new Set((railCards.value || []).map((c) => String(c?.id || '')).filter(Boolean));
    if (landing === 'clients' && allowed.has('clients')) {
      activeTab.value = 'clients';
      router.replace({ query: { ...route.query, tab: 'clients' } });
    } else if (landing === 'schedule' && allowed.has('my_schedule')) {
      // Defer schedule tab so dashboard shell renders first; schedule loads in background
      const defer = () => {
        activeTab.value = 'my_schedule';
        router.replace({ query: { ...route.query, tab: 'my_schedule' } });
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(defer, { timeout: 100 });
      } else {
        setTimeout(defer, 0);
      }
    } else if (landing === 'dashboard' || !allowed.has(landing)) {
      // Default: My Account when onboarding complete, else first content card
      if (onboardingCompletion.value >= 100 && isOnboardingComplete.value) {
        activeTab.value = 'my';
        myTab.value = 'account';
      }
    }
  }
  // Run secondary loads in parallel (was sequential, causing slow dashboard load)
  await Promise.all([
    loadCurrentTier(),
    loadAgencyDashboardBanner(),
    loadMyCompanyEvents(),
    loadSupervisionPrompts(),
    loadPresenterAssignments(),
    loadDashboardSocialFeeds()
  ]);

  updateRailCollapsedMode();
  railMediaQuery = typeof window !== 'undefined' && window.matchMedia('(max-width: 980px)');
  if (railMediaQuery) railMediaQuery.addEventListener('change', updateRailCollapsedMode);
  railPulseTimer = setTimeout(() => { railPulse.value = false; }, RAIL_PULSE_DURATION_MS);
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeydown);
  document.addEventListener('fullscreenchange', updateScheduleFullscreenState);
  supervisionPromptTimer = setInterval(() => {
    loadSupervisionPrompts();
    loadPresenterAssignments();
  }, supervisionPromptPollMs);
});
watch(activeTab, updateRailCollapsedMode);

// If available cards change (role/status), keep activeTab on a valid content card.
watch(dashboardCards, () => {
  const cards = dashboardCards.value || [];
  const activeId = String(activeTab.value || '');
  const activeCard = cards.find((c) => String(c.id) === activeId) || null;
  if (activeCard && activeCard.kind === 'content') return;
  const firstContent = cards.find((c) => c.kind === 'content') || null;
  if (firstContent?.id) activeTab.value = firstContent.id;
}, { deep: true });

watch([currentAgencyId, isOnboardingComplete], async () => {
  await Promise.all([
    loadCurrentTier(),
    loadMyAssignedSchools(),
    loadAgencyDashboardBanner(),
    loadMyCompanyEvents(),
    loadSupervisionPrompts(),
    loadPresenterAssignments(),
    loadDashboardSocialFeeds()
  ]);
});

// Supervisor: load supervisees for schedule sorting/selection.
watch([activeTab, currentAgencyId, () => authStore.user?.id], async () => {
  if (props.previewMode) return;
  if (activeTab.value !== 'my_schedule') return;
  if (!isOnboardingComplete.value) return;
  if (!isSupervisor(authStore.user)) return;
  await fetchSuperviseesForSchedule();
}, { immediate: true });

// Collapse rail to icon-only when schedule needs more width or viewport is narrow.
function updateRailCollapsedMode() {
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 980px)').matches;
  railCollapsedMode.value = narrow || activeTab.value === 'my_schedule';
}
let railPulseTimer = null;
let railMediaQuery = null;
onUnmounted(() => {
  if (railMediaQuery) railMediaQuery.removeEventListener('change', updateRailCollapsedMode);
  if (railPulseTimer) clearTimeout(railPulseTimer);
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeydown);
  document.removeEventListener('fullscreenchange', updateScheduleFullscreenState);
  if (supervisionPromptTimer) clearInterval(supervisionPromptTimer);
});
</script>

<style scoped>
/* Tighter grid for In-School Claims options */
.submit-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 720px) {
  .submit-grid-2 {
    grid-template-columns: 1fr;
  }
}
h1 {
  margin-bottom: 30px;
  color: var(--text-primary);
}

.onboarding-card {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 32px;
  box-shadow: var(--shadow-lg);
}

.onboarding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.onboarding-header h2 {
  margin: 0;
  color: white;
  font-size: 24px;
}

.completion-badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 14px;
}

.onboarding-progress {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 12px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: white;
  transition: width 0.3s ease;
  border-radius: 6px;
}

.onboarding-description {
  margin: 0 0 16px 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.onboarding-card .btn {
  background: white;
  color: var(--primary);
  border: none;
}

.onboarding-card .btn:hover {
  background: rgba(255, 255, 255, 0.9);
}

.top-snapshot-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.top-snapshot-cell {
  flex: 1 1 200px;
  min-width: 0;
}
.top-snapshot-status-team-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 0 1 260px;
  min-width: 0;
}
.top-snapshot-row .top-snapshot-wrap {
  margin-bottom: 0;
}
.top-snapshot-status-team-stack .top-snapshot-wrap {
  margin-bottom: 0;
}
.top-snapshot-wrap {
  margin-bottom: 16px;
}
.top-snapshot-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.top-snapshot-title {
  font-weight: 800;
  color: var(--text-primary);
}
.top-snapshot-toggle {
  /* Some global `.btn` rules make buttons stretch full-width. Keep this one compact. */
  width: auto !important;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  white-space: nowrap;
  padding: 4px 10px;
}

.social-feeds-block-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.social-feed-block-card {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  background: var(--bg-card, #fff);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
.social-feed-block-card:hover {
  border-color: var(--primary, #3498db);
  background: var(--bg-hover, #f8f9fa);
}
.social-feed-block-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--bg-muted, #eee);
  font-size: 11px;
  font-weight: 600;
}
.social-feed-block-label {
  font-weight: 500;
}

/* Split view: rail + detail */
.dashboard-shell {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  margin-bottom: 16px;
}

/* My Schedule focus mode: maximize schedule space */
.container-wide {
  max-width: none;
  width: 100%;
}
.dashboard-shell.schedule-focus {
  grid-template-columns: 88px minmax(0, 1fr);
}
.dashboard-shell.schedule-focus .dashboard-rail {
  max-height: calc(100vh - 24px);
  overflow: auto;
}
.dashboard-shell.schedule-focus .rail-card-row {
  width: 100%;
}
.card-content.card-content-schedule {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
}
.my-schedule-stage {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  padding: 14px;
}
.schedule-supervisor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-alt) 84%, white);
}
.schedule-view-toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  flex: 0 0 auto;
}
.schedule-view-toggle .btn.active {
  background: color-mix(in srgb, var(--primary) 16%, var(--bg-alt));
  border-color: color-mix(in srgb, var(--primary) 60%, var(--border));
  color: var(--primary);
}
.schedule-inline-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 320px;
  min-width: 260px;
}
.compact-input {
  min-height: 34px;
  padding: 6px 9px;
}
.schedule-inline-controls .compact-input {
  width: auto;
  min-width: 120px;
}
.supervisee-search-input {
  flex: 1 1 220px;
  min-width: 160px;
}
.supervisee-chip-row {
  width: 100%;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
}
.supervisee-chip {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.supervisee-chip.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 50%, transparent);
  background: color-mix(in srgb, var(--primary) 14%, var(--bg-alt));
}
.supervisee-chip.all-chip {
  font-weight: 700;
}
.supervisee-chip-avatar {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 28%, var(--bg-alt));
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  overflow: hidden;
}
.supervisee-chip-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.supervisee-chip-name {
  max-width: 130px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.supervisee-schedule-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.supervisee-schedule-section {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: var(--bg-alt);
}
.supervisee-schedule-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.supervisee-schedule-name {
  font-weight: 800;
  color: var(--text-primary);
}
@media (max-width: 900px) {
  .schedule-supervisor-toolbar {
    padding: 8px;
  }
  .schedule-inline-controls {
    flex: 1 1 100%;
    min-width: 0;
  }
  .schedule-inline-controls .compact-input {
    min-width: 0;
  }
}

.dashboard-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 12px;
  align-self: start;
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding-right: 2px; /* avoids scrollbar overlaying focus rings */
}

.rail-card-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.dashboard-rail.rail-collapsed {
  width: 84px;
  min-width: 84px;
  overflow: visible;
}
.dashboard-rail.rail-collapsed .rail-card {
  padding: 8px 6px;
  justify-content: center;
  border-left-width: 2px;
  position: relative;
}
.dashboard-rail.rail-collapsed .rail-card-left {
  justify-content: center;
}
.dashboard-rail.rail-collapsed .rail-card-text,
.dashboard-rail.rail-collapsed .rail-card-cta {
  display: none;
}
.dashboard-rail.rail-collapsed .rail-card-meta {
  position: absolute;
  top: 4px;
  right: 4px;
}
.dashboard-rail.rail-collapsed .rail-card-badge {
  min-width: 18px;
  height: 18px;
  font-size: 11px;
  padding: 0 5px;
}
.dashboard-rail.rail-collapsed .rail-card-help {
  display: none;
}
.dashboard-rail.rail-collapsed .rail-card::after {
  content: attr(data-label);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: var(--shadow);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 30;
}
.dashboard-rail.rail-collapsed .rail-card:hover::after,
.dashboard-rail.rail-collapsed .rail-card:focus-visible::after {
  opacity: 1;
}

/* Pulse animation for rail cards (draws attention on load) */
@keyframes rail-card-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(198, 154, 43, 0.25); }
  50% { box-shadow: 0 0 0 8px rgba(198, 154, 43, 0); }
}
.dashboard-rail.rail-pulse .rail-card {
  animation: rail-card-pulse 0.9s ease-in-out 3;
}
@media (prefers-reduced-motion: reduce) {
  .dashboard-rail.rail-pulse .rail-card {
    animation: none;
  }
}

.rail-card {
  flex: 1 1 auto;
  text-align: left;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.5);
  border-left: 3px solid var(--rail-accent, rgba(198, 154, 43, 0.6));
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
[data-theme="dark"] .rail-card {
  background: rgba(37, 40, 44, 0.75);
  border-color: rgba(255,255,255,0.08);
}

.rail-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
  background: rgba(255, 255, 255, 0.9);
}
[data-theme="dark"] .rail-card:hover {
  background: rgba(37, 40, 44, 0.95);
}

.rail-card:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.rail-card.active {
  border-color: var(--accent);
  box-shadow: var(--shadow);
  background: rgba(243, 246, 250, 0.95);
}
[data-theme="dark"] .rail-card.active {
  background: rgba(51, 65, 85, 0.6);
}

.rail-card-submit {
  background: color-mix(in srgb, var(--primary-light) 18%, var(--bg-card));
  border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
}
.rail-card-submit .rail-card-title,
.rail-card-submit .rail-card-cta {
  color: var(--primary);
}

.rail-card-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.rail-card-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.rail-card-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.rail-card-icon-fallback {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 12px;
  color: var(--text-secondary);
}

.rail-card-text {
  min-width: 0;
}

.rail-card-title {
  font-weight: 800;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rail-card-meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
}

.rail-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 80%, #7f1d1d);
  color: var(--bg-card);
  font-size: 12px;
  font-weight: 800;
}

.rail-card-cta {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.rail-card-help {
  position: relative;
  flex: 0 0 auto;
  align-self: center;
}

.rail-card-help-btn {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.rail-card-help-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.rail-card-help-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: min(320px, 78vw);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  padding: 10px 12px;
  z-index: 30;
}

.rail-card-help-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.rail-card-help-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.dashboard-detail {
  min-width: 0;
}

.dashboard-rail.disabled {
  opacity: 0.85;
}

.dashboard-rail :deep(button:focus-visible),
.dashboard-detail :deep(button:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.dashboard-rail :deep(button:focus-visible) {
  border-radius: 12px;
}

@media (max-width: 980px) {
  .dashboard-shell {
    grid-template-columns: 72px minmax(0, 1fr);
  }
  .dashboard-rail {
    width: 72px;
    min-width: 72px;
  }
  .rail-card {
    min-width: 0;
  }
}

.dashboard-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.dash-card {
  text-align: left;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.dash-card-submit {
  background: color-mix(in srgb, var(--primary-light) 18%, var(--bg-card));
  border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
}
.dash-card-submit .dash-card-title {
  color: var(--primary);
}
.dash-card-submit .dash-card-cta {
  color: var(--primary);
}

.dash-card-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.dash-card-icon-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.dash-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.dash-card:disabled {
  cursor: default;
  opacity: 0.7;
}

.dash-card.active {
  border-color: var(--accent);
}

.dash-card-title {
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.dash-card-desc {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 10px;
}

.dash-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dash-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 80%, #7f1d1d);
  color: var(--bg-card);
  font-size: 12px;
  font-weight: 700;
}

.dash-card-cta {
  font-size: 12px;
  color: var(--text-secondary);
}

.card-content {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.my-subnav {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.my-subnav .subtab {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}

.my-subnav .subtab.active {
  border-color: var(--accent);
  background: var(--bg-card);
}

.my-panel :deep(.container) {
  padding: 0;
}

.my-panel :deep(.page-header),
.my-panel :deep(.preferences-header) {
  margin-bottom: 16px;
  padding-bottom: 12px;
}

.status-warning-banner {
  background: color-mix(in srgb, var(--primary-light) 14%, var(--bg-card));
  border-left: 4px solid var(--primary);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.agency-announcement-banner {
  background: color-mix(in srgb, var(--primary-light) 16%, var(--bg-card));
  border-left: 4px solid var(--primary);
  border-radius: 8px;
  padding: 8px 0;
  margin-bottom: 20px;
  overflow: hidden;
}

.agency-announcement-inner {
  overflow: hidden;
  width: 100%;
}

.agency-announcement-track {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  padding-left: 100%;
  animation: agencyBannerMarquee 28s linear infinite;
  white-space: nowrap;
  color: var(--primary);
  font-weight: 600;
}

.agency-announcement-item .sep {
  opacity: 0.6;
}

.agency-announcement-banner:hover .agency-announcement-track {
  animation-play-state: paused;
}

.company-events-strip {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
  background: var(--surface-secondary);
}

.company-events-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.company-events-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.company-event-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  background: var(--surface-primary);
}

.company-event-title {
  font-weight: 600;
}

.company-event-when {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 3px;
}

.company-event-copy {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.company-event-rsvp {
  margin-top: 8px;
}

.company-event-rsvp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.company-event-actions {
  margin-top: 8px;
  font-size: 13px;
}

.supervision-invite-strip {
  border: 1px solid color-mix(in srgb, var(--primary) 34%, transparent);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
  background: color-mix(in srgb, var(--primary-light) 18%, var(--bg-card));
}

.supervision-invite-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.supervision-invite-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.supervision-invite-card {
  border: 1px solid color-mix(in srgb, var(--primary) 42%, transparent);
  border-radius: 8px;
  background: var(--bg-card);
  padding: 10px;
  animation: supervisionInvitePulse 1.3s ease-in-out infinite;
}

@keyframes supervisionInvitePulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 30%, transparent); }
  50% { box-shadow: 0 0 0 8px transparent; }
}

.invite-title {
  font-weight: 700;
  margin-bottom: 4px;
}

.invite-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.invite-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.supervision-splash {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.55);
  display: grid;
  place-items: center;
  padding: 20px;
}

.supervision-splash-card {
  width: min(560px, 94vw);
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  padding: 18px;
  box-shadow: var(--shadow-lg);
}

.supervision-splash-card h3 {
  margin: 0 0 8px 0;
  color: var(--primary);
}

.supervision-splash-card p {
  margin: 0;
}

.supervision-splash-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.blocking-splash {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(15, 23, 42, 0.7);
  display: grid;
  place-items: center;
  padding: 20px;
}

.blocking-splash-card {
  width: min(700px, 96vw);
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  padding: 20px;
  box-shadow: var(--shadow-lg);
}

.blocking-splash-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.blocking-splash-brand {
  font-weight: 800;
  color: var(--text-secondary);
}

.blocking-splash-title {
  margin: 0 0 8px 0;
  color: var(--primary);
  font-size: 28px;
}

.blocking-splash-message {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  line-height: 1.4;
  white-space: pre-wrap;
}

.blocking-splash-meta {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.blocking-splash-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

@keyframes agencyBannerMarquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

.warning-content {
  flex: 1;
}

.warning-content strong {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-size: 16px;
}

.warning-content p {
  margin: 4px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.warning-note {
  margin-top: 12px !important;
  font-size: 12px !important;
  font-style: italic;
  color: var(--text-secondary) !important;
}

.pending-completion-banner {
  background: color-mix(in srgb, var(--primary-light) 14%, var(--bg-card));
  border-left: 4px solid var(--primary);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.completion-content strong {
  display: block;
  color: var(--primary);
  font-size: 18px;
  margin-bottom: 12px;
}

.completion-content p {
  margin: 8px 0;
  color: var(--text-secondary);
}

.ready-for-review-banner {
  background: color-mix(in srgb, var(--primary-light) 12%, var(--bg-card));
  border-left: 4px solid var(--primary);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.review-content strong {
  display: block;
  color: var(--primary);
  font-size: 18px;
  margin-bottom: 12px;
}

.review-content p {
  margin: 8px 0;
  color: var(--text-secondary);
}

.review-content em {
  color: var(--text-secondary);
  font-size: 14px;
}

.preview-tab-content {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.preview-text {
  font-size: 16px;
  margin: 0;
}

.dashboard-header-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.dashboard-header-preview .header-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.dashboard-header-preview .dashboard-logo {
  flex-shrink: 0;
}

.dashboard-header-preview h1 {
  margin: 0;
  color: var(--primary);
}

.dashboard-header-user {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border);
}

.dashboard-header-user h1 {
  margin: 0;
  color: var(--text-primary);
}

.tutorial-toggle {
  margin-left: auto;
  white-space: nowrap;
}

.badge-user {
  display: inline-block;
  padding: 4px 12px;
  background: var(--bg-alt);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-tier {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-secondary);
}
.badge-tier.tier-current {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.35);
  color: #166534;
}
.badge-tier.tier-grace {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #92400e;
}
.badge-tier.tier-ooc {
  background: rgba(239, 68, 68, 0.10);
  border-color: rgba(239, 68, 68, 0.35);
  color: #991b1b;
}

.dash-card:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
</style>
