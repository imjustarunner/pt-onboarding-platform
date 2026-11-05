<template>
  <div class="supervision-modal supervision-panel" role="region" aria-labelledby="supervision-modal-title">
    <div class="supervision-modal-header">
      <button
        v-if="selectedSupervisee"
        type="button"
        class="supervision-modal-back"
        aria-label="Back to supervisees"
        @click="selectedSupervisee = null"
      >
        Back to supervisees
      </button>
      <span class="auricwell-supervision-brand"><img src="/auricwell/mark.svg" alt="" />AuricWell · Supervision</span>
      <h2 id="supervision-modal-title">
        {{ selectedSupervisee ? selectedSuperviseeDisplayName : 'Supervision' }}
      </h2>
    </div>
    <div class="supervision-modal-body">
        <!-- Step 1: List of supervisees -->
        <template v-if="!selectedSupervisee">
          <div v-if="loading" class="supervision-loading">Loading supervisees…</div>
          <div v-else-if="error" class="supervision-error">{{ error }}</div>
          <div v-else-if="supervisees.length === 0" class="supervision-empty">
            <p>No supervisees assigned. Contact an administrator to assign supervisees.</p>
          </div>
          <div v-else class="supervision-groups">
            <section
              v-for="group in groupedSupervisees"
              :key="group.key"
              class="supervision-group"
            >
              <header class="supervision-group-header">
                <span class="supervision-group-swatch" :style="group.headerStyle" />
                <h3 class="supervision-group-name">{{ group.name }}</h3>
                <span class="supervision-group-count">{{ group.items.length }}</span>
              </header>
              <div class="supervision-grid">
                <button
                  v-for="s in group.items"
                  :key="superviseeKey(s)"
                  type="button"
                  class="supervision-card"
                  :style="superviseeCardStyle(s)"
                  @click="selectedSupervisee = s"
                >
                  <div class="supervision-card-avatar" :class="{ 'has-photo': s.supervisee_profile_photo_url }">
                    <img v-if="s.supervisee_profile_photo_url" :src="toUploadsUrl(s.supervisee_profile_photo_url)" :alt="superviseeDisplayName(s)" class="supervision-card-avatar-img" />
                    <span v-else class="supervision-card-avatar-initial">{{ avatarInitial(s) }}</span>
                  </div>
                  <div class="supervision-card-info">
                    <span class="supervision-card-name">{{ superviseeDisplayName(s) }}</span>
                    <span class="supervision-card-meta">{{ s.supervisee_email || s.agency_name || '' }}</span>
                  </div>
                </button>
              </div>
            </section>
          </div>
        </template>

        <!-- Step 2: Supervisee detail (hero card + at-a-glance + sections) -->
        <template v-else>
          <div class="supervision-detail">
            <section class="supervision-hero">
              <div class="supervision-hero-avatar" :class="{ 'has-photo': selectedSupervisee?.supervisee_profile_photo_url }">
                <img v-if="selectedSupervisee?.supervisee_profile_photo_url" :src="toUploadsUrl(selectedSupervisee.supervisee_profile_photo_url)" :alt="selectedSuperviseeDisplayName" class="supervision-hero-avatar-img" />
                <span v-else class="supervision-hero-avatar-initial">{{ selectedSupervisee ? avatarInitial(selectedSupervisee) : '' }}</span>
              </div>
              <div class="supervision-hero-info">
                <h2 class="supervision-hero-name">{{ selectedSuperviseeDisplayName }}</h2>
                <p v-if="selectedSupervisee?.supervisee_email" class="supervision-hero-meta">{{ selectedSupervisee.supervisee_email }}</p>
                <p v-if="selectedSupervisee?.agency_name" class="supervision-hero-meta">{{ selectedSupervisee.agency_name }}</p>
              </div>
            <div class="hero-actions"><RouterLink :to="superviseeFullScheduleLink" class="btn btn-secondary">View schedule</RouterLink><button type="button" class="btn btn-primary" @click="openSupervisionScheduler">Schedule supervision</button></div></section>

            <div class="supervision-workspace">
              <nav class="supervision-navigation" aria-label="Supervisee workspace">
                <div v-for="group in navigationGroups" :key="group.label" class="workspace-nav-group">
                  <span class="workspace-nav-label">{{ group.label }}</span>
                  <button v-for="item in group.items" :key="item.id" type="button"
                    :class="['workspace-nav-button', { active: activeSection === item.id }]"
                    :aria-current="activeSection === item.id ? 'page' : undefined"
                    :aria-controls="`supervision-content-${selectedSupervisee.supervisee_id}`"
                    @click="selectSection(item.id)">
                    <component :is="item.icon" :size="18" aria-hidden="true" />
                    <span>{{ item.label }}</span><span v-if="sectionCount(item.id) != null" class="nav-count">{{ sectionCount(item.id) }}</span>
                  </button>
                </div>
              </nav>
              <main :id="`supervision-content-${selectedSupervisee.supervisee_id}`" class="supervision-content" tabindex="-1">
                <header class="workspace-heading"><div><span class="workspace-eyebrow">{{ selectedSuperviseeDisplayName }} · Supervision</span><h3>{{ activeSectionLabel }}</h3></div>
                  <button v-if="['overview','sessions','clients','schedule','schools','documents','training'].includes(activeSection)" type="button" class="workspace-refresh" :disabled="summaryLoading || sessionHistoryLoading" @click="refreshCurrentSection"><RefreshCw :size="16" aria-hidden="true" /> Refresh</button>
                </header>
                <section v-show="activeSection === 'overview'" class="supervision-overview">
                  <div class="overview-facts" aria-label="Supervision attendance overview">
                    <button class="overview-fact fact-blue" type="button" @click="showSessions('all')"><span>{{ overallAttendanceSummary ? 'Supervision sessions' : 'Loaded sessions' }}</span><strong>{{ sessionHistoryLoading ? '…' : sessionHistoryError ? '—' : attendanceCounts.total }}</strong><small>Open session history</small></button>
                    <button class="overview-fact fact-green" type="button" @click="showSessions('attended')"><span>Attended</span><strong>{{ sessionHistoryLoading ? '…' : sessionHistoryError ? '—' : attendanceCounts.attended }}</strong><small>{{ supervisionSessionHours == null ? 'Hours unavailable' : `${fmtNum(supervisionSessionHours)} recorded hours` }}</small></button>
                    <button class="overview-fact fact-red" type="button" @click="showSessions('missed')"><span>Missed</span><strong>{{ sessionHistoryLoading ? '…' : sessionHistoryError ? '—' : attendanceCounts.missed }}</strong><small>Documented absences</small></button>
                    <button class="overview-fact fact-amber" type="button" @click="showSessions('unknown')"><span>Needs attendance review</span><strong>{{ sessionHistoryLoading ? '…' : sessionHistoryError ? '—' : attendanceCounts.unknown }}</strong><small>Zero time without a recorded outcome</small></button>
                  </div>
                  <p v-if="sessionHistoryError" role="alert" class="supervision-error-inline">{{ sessionHistoryError }}</p>
                  <div class="upcoming-card">
                    <div class="upcoming-card-heading"><CalendarDays :size="22" aria-hidden="true" /><div><h4>Upcoming supervision</h4><p>This week · {{ upcomingSessions.length }} upcoming</p></div><RouterLink :to="superviseeFullScheduleLink" class="btn btn-secondary btn-sm">Full schedule</RouterLink></div>
                    <p v-if="scheduleLoading" role="status">Loading upcoming sessions…</p><p v-else-if="scheduleError" role="alert">{{ scheduleError }}</p>
                    <p v-else-if="!upcomingSessions.length">No upcoming supervision sessions this week.</p>
                    <article v-for="session in upcomingSessions" :key="session.id" class="upcoming-session-row"><div><strong>{{ formatSessionDate(session.startAt) }}</strong><p>Until {{ formatSessionDate(session.endAt) }} · {{ session.sessionType || 'Supervision' }}<template v-if="session.modality"> · {{ session.modality }}</template></p></div><div class="supervision-actions-row"><a v-if="session.googleMeetLink" :href="session.googleMeetLink" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">Open Meet</a><button v-if="session.googleMeetLink" type="button" class="btn btn-secondary btn-sm" :disabled="meetingTrackerSaving" @click="startTrackedMeeting(session)">Start tracked Meet</button><button type="button" class="btn btn-primary btn-sm" @click="startAppVideoMeeting(session)">Join session</button><button type="button" class="btn btn-secondary btn-sm" @click="openAgendaForSession(session.id)">Agenda</button></div></article>
                  </div>
                </section>
                <SuperviseeWorkPanel v-if="selectedSuperviseeAgencyId" v-show="['overview', 'performance'].includes(activeSection)" :key="`performance-${superviseeKey(selectedSupervisee)}`" :agency-id="Number(selectedSuperviseeAgencyId)" :provider-id="Number(selectedSupervisee.supervisee_id)" mode="performance" />
                <section v-show="activeSection === 'overview'" class="supervision-overview-secondary">
                  <div class="overview-shortcuts"><button type="button" @click="selectSection('clients')"><Users :size="20" /><strong>Client caseload</strong><span>{{ clientsLoading ? 'Loading…' : clientsError ? 'Caseload unavailable' : `${clientsList.length} assigned clients` }}</span><ArrowUpRight :size="18" /></button><button type="button" @click="selectSection('queue')"><ClipboardList :size="20" /><strong>Documentation to review</strong><span>Notes, plans &amp; requested changes</span><ArrowUpRight :size="18" /></button></div>
            <details class="snapshot-details"><summary>Hours, payroll &amp; compliance details</summary>

              <button type="button" class="btn btn-secondary btn-sm" :disabled="summaryLoading" @click="refreshSupervisionLog">Refresh hours</button>
              <div v-if="summaryLoading" class="supervision-placeholder">Loading snapshot…</div>
              <div v-else-if="summaryError" class="supervision-error-inline">{{ summaryError }}</div>
              <div v-else-if="summary" class="supervision-summary-grid">
                <div class="summary-cell">
                  <span class="summary-label">Last pay period</span>
                  <span class="summary-value">{{ summary.lastPaycheck ? `${summary.lastPaycheck.periodStart} → ${summary.lastPaycheck.periodEnd}` : '—' }}</span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">Incomplete notes (last period)</span>
                  <span class="summary-value">{{ fmtNum(summary.unpaidNotes?.lastPayPeriod?.totalUnits ?? 0) }} units</span>
                  <span class="summary-meta">No Note {{ fmtNum(summary.unpaidNotes?.lastPayPeriod?.noNoteUnits ?? 0) }} · Draft {{ fmtNum(summary.unpaidNotes?.lastPayPeriod?.draftUnits ?? 0) }}</span>
                </div>
                <div class="summary-cell" v-if="showRatio && summary.directIndirect?.last">
                  <span class="summary-label">Direct/Indirect ratio</span>
                  <span class="summary-value" :class="`pill-${summary.directIndirect.last.kind}`">Last: {{ fmtPct(summary.directIndirect.last.ratio) }}</span>
                  <span class="summary-value" v-if="summary.directIndirect.avg90" :class="`pill-${summary.directIndirect.avg90.kind}`">90-day: {{ fmtPct(summary.directIndirect.avg90.ratio) }}</span>
                </div>
                <div class="summary-cell" v-if="summary.supervision?.enabled && summary.supervision?.isPrelicensed">
                  <span class="summary-label">Supervision hours (toward 100)</span>
                  <span class="summary-value">{{ fmtNum(summary.supervision.totalHours) }} / {{ fmtNum((summary.supervision.requiredIndividualHours || 0) + (summary.supervision.requiredGroupHours || 0) || 100) }} total</span>
                  <span class="summary-meta">
                    Individual {{ fmtNum(summary.supervision.individualHours) }}/{{ fmtNum(summary.supervision.requiredIndividualHours) }}
                    · Group {{ fmtNum(summary.supervision.groupHours) }}/{{ fmtNum(summary.supervision.requiredGroupHours) }}
                  </span>
                  <span
                    v-if="supervisionSessionHours != null"
                    class="summary-meta"
                  >
                    Recorded attendance {{ fmtNum(supervisionSessionHours) }} hrs
                    <template v-if="supervisionSessionCount != null"> · {{ supervisionSessionCount }} session(s)</template>
                    — {{ fmtNum(supervisionAttendanceIndividualHours) }} individual · {{ fmtNum(supervisionAttendanceGroupHours) }} group
                    <br>Requirement totals above include eligible session attendance and previously recorded hours.
                  </span>
                </div>
                <div class="summary-cell" v-else-if="supervisionSessionHours != null">
                  <span class="summary-label">Supervision attendance</span>
                  <span class="summary-value">{{ fmtNum(supervisionSessionHours) }} hrs</span>
                  <span class="summary-meta">Individual {{ fmtNum(supervisionAttendanceIndividualHours) }} · Group {{ fmtNum(supervisionAttendanceGroupHours) }}</span>
                  <span class="summary-meta" v-if="supervisionSessionCount != null">{{ supervisionSessionCount }} session(s) attended</span>
                </div>
                <div class="summary-cell" v-if="compliance24Plus.length > 0">
                  <span class="summary-label">Clients with 24+ sessions</span>
                  <span class="summary-value">{{ compliance24Plus.join(', ') }}</span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">PTO</span>
                  <span class="summary-meta">Sick: {{ fmtNum(summary.pto?.balances?.sickHours ?? 0) }} hrs · Training: {{ fmtNum(summary.pto?.balances?.trainingHours ?? 0) }} hrs</span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">Supervisor</span>
                  <span class="summary-value">{{ summary.supervisor?.name || '—' }}</span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">Clients added · {{ snapshotYear }} calendar year</span>
                  <span v-if="clientsLoading" class="summary-meta">Loading…</span>
                  <span v-else-if="clientsError" class="summary-meta">Unavailable</span>
                  <template v-else>
                    <span class="summary-value">{{ yearlyClientCounts.office }} office · {{ yearlyClientCounts.school }} school</span>
                    <span class="summary-meta">Current caseload assigned Jan 1–Dec 31; archived clients excluded.<template v-if="yearlyClientCounts.other"> {{ yearlyClientCounts.other }} other/unclassified.</template><template v-if="yearlyClientCounts.unknown"> {{ yearlyClientCounts.unknown }} without a recorded assignment date.</template></span>
                  </template>
                </div>
                <div v-if="summary.schoolMileageYear" class="summary-cell">
                  <span class="summary-label">School mileage · {{ summary.schoolMileageYear.year }} calendar year</span>
                  <span class="summary-value">{{ summary.schoolMileageYear.claimCount }} claims · {{ fmtNum(summary.schoolMileageYear.miles) }} eligible miles</span>
                  <span class="summary-meta">Jan 1–Dec 31 trip dates; submitted, approved and paid, excluding rejected claims.</span>
                </div>
              </div>
            </details>
                </section>
                <section v-if="selectedSuperviseeAgencyId" v-show="['overview', 'sessions'].includes(activeSection)" class="sessions-workspace">
                  <div class="session-section-heading"><h4>Supervision sessions</h4><button type="button" class="btn btn-secondary btn-sm" @click="showManualEntry = !showManualEntry">{{ showManualEntry ? 'Hide manual entry' : 'Log supervision outside the app' }}</button></div>
                  <ManualSupervisionPanel v-if="showManualEntry && selectedSuperviseeAgencyId" :agency-id="Number(selectedSuperviseeAgencyId)" :user-id="selectedSupervisee.supervisee_id" :sessions="sessionHistory" @saved="refreshSupervisionLog" />
                  <p v-if="sessionHistoryError" role="alert" class="supervision-error-inline">{{ sessionHistoryError }}</p>
                  <SuperviseeSessionHistory v-if="selectedSuperviseeAgencyId" ref="historyPanel" :key="superviseeKey(selectedSupervisee)" :agency-id="Number(selectedSuperviseeAgencyId)" :provider-id="Number(selectedSupervisee.supervisee_id)" :sessions="sessionHistory" :has-more-sessions="historyHasMore" :attendance-summary="overallAttendanceSummary" v-model:attendance-filter="sessionFilter" @refreshed="onHistoryRefreshed" @changed="refreshSupervisionLog" />
                </section>
            <section v-show="activeSection === 'clients'" class="supervision-detail-section">
              <h3 id="supervision-clients">Clients (caseload)</h3>
              <p class="summary-meta">Feedback shows scores from client check-ins and questionnaires, not an evaluation of the supervisee.</p>
              <div v-if="clientsLoading" class="supervision-placeholder">Loading clients…</div>
              <div v-else-if="clientsError" class="supervision-error-inline">{{ clientsError }}</div>
              <div v-else-if="clientsList?.length" class="supervision-readonly-summary">
                <p><strong>{{ clientsList.length }}</strong> assigned clients. Open a quick view or the full client record.</p>
                <p v-if="feedbackError" role="alert">{{ feedbackError }}</p><CaseloadFeedbackSummary :by-client="feedbackByClient" />
                <div class="caseload-table-wrap">
                  <table class="caseload-table">
                    <thead>
                      <tr>
                        <th><button type="button" class="caseload-sort-btn" @click="setCaseloadSort('client')">Client {{ caseloadSortIndicator('client') }}</button></th>
                        <th><button type="button" class="caseload-sort-btn" @click="setCaseloadSort('school')">School {{ caseloadSortIndicator('school') }}</button></th>
                        <th><button type="button" class="caseload-sort-btn" @click="setCaseloadSort('assigned')">Assigned {{ caseloadSortIndicator('assigned') }}</button></th>
                        <th><button type="button" class="caseload-sort-btn" @click="setCaseloadSort('status')">Status {{ caseloadSortIndicator('status') }}</button></th>
                        <th>Feedback</th><th><button type="button" class="caseload-sort-btn" @click="setCaseloadSort('missing')">Missing checklist {{ caseloadSortIndicator('missing') }}</button></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="client in sortedClientsList" :key="client.id || `${client.initials || ''}-${client.identifier_code || ''}`">
                        <td class="caseload-cell-client">
                          <button
                            type="button"
                            class="client-quick-button"
                            :disabled="schoolClientModalLoading"
                            @click="openCaseloadClientModal(client)"
                          >
                            {{ clientDisplayLabel(client) }}
                          </button>
                          <RouterLink class="client-full-link" :to="fullClientLink(client)">Open full record ↗</RouterLink>
                        </td>
                        <td>{{ clientSchoolName(client) || '—' }}</td>
                        <td>{{ caseloadAssignedDate(client) }}</td>
                        <td>{{ caseloadStatus(client) }}</td><td><ClientFeedbackSummary :summaries="feedbackByClient[client.id]" :loading="feedbackLoading" :unavailable="!!feedbackError" /></td>
                        <td>
                          <span v-if="caseloadMissingChecklist(client).length" class="client-item-missing">
                            {{ caseloadMissingChecklist(client).join(', ') }}
                          </span>
                          <span v-else class="summary-meta">—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-if="schoolClientModalError" class="supervision-error-inline" style="margin-top: 8px;">
                  {{ schoolClientModalError }}
                </div>
              </div>
              <p v-else class="supervision-placeholder">No clients assigned for this agency.</p>
            </section>

                <section v-show="activeSection === 'schedule'" class="supervision-detail-section schedule-launch-card"><CalendarDays :size="36" aria-hidden="true" /><h3>{{ selectedSuperviseeDisplayName }}’s schedule</h3><p>Use the same My Schedule workspace, with this supervisee selected, to see office visits, school work and supervision together.</p><RouterLink :to="superviseeFullScheduleLink" class="btn btn-primary">View schedule</RouterLink></section>
                <section v-show="activeSection === 'schools'" class="supervision-detail-section"><h3>School &amp; program portals</h3><p>Open a school’s portal to view its roster and the client information your supervisor access permits. Client charts remain available from the Caseload tab.</p><p v-if="affiliatedPortalsLoading">Loading schools…</p><p v-else-if="affiliatedPortalsError" role="alert">{{ affiliatedPortalsError }}</p><p v-else-if="!affiliatedPortals.length">No school or program affiliations.</p><div class="school-portal-grid"><a v-for="portal in affiliatedPortals" :key="portal.id" :href="`/${portal.slug}/dashboard`" target="_blank" rel="noopener noreferrer" class="school-portal-card"><img v-if="portal.icon_url || portal.icon_file_path || portal.logo_url" :src="toUploadsUrl(portal.icon_url || portal.icon_file_path || portal.logo_url)" alt="" /><span v-else class="school-icon-fallback" aria-hidden="true"><School :size="24" /></span><div><strong>{{ portal.name }}</strong><span>View school, roster &amp; client information</span></div><ArrowUpRight :size="18" /></a></div></section>
            <section v-show="activeSection === 'training'" class="supervision-detail-section">
              <h3>Training &amp; onboarding</h3><p>Live checklist progress from the training and document systems.</p><button type="button" class="btn btn-primary" @click="showModulePicker = true">Assign training module</button>
              <div v-if="checklistLoading" class="supervision-placeholder">Loading checklist…</div>
              <div v-else-if="checklistError" class="supervision-error-inline">{{ checklistError }}</div>
              <div v-else-if="checklistData" class="supervision-checklist-readonly">
                <div v-if="checklistData.trainingItems?.length" class="checklist-group">
                  <strong>Current training (modules)</strong>
                  <ul>
                    <li v-for="item in checklistData.trainingItems" :key="item.id">{{ item.title }} — {{ item.is_completed ? 'Complete' : 'Incomplete' }}</li>
                  </ul>
                </div>
                <div v-if="checklistData.documentItems?.length" class="checklist-group">
                  <strong>Documents</strong>
                  <ul>
                    <li v-for="item in checklistData.documentItems" :key="item.id">{{ item.title }} — {{ item.is_completed ? 'Complete' : 'Incomplete' }}</li>
                  </ul>
                </div>
                <div v-if="checklistData.trainingFocusesWithItems?.length" class="checklist-group">
                  <strong>Training focus items</strong>
                  <ul>
                    <li v-for="f in checklistData.trainingFocusesWithItems" :key="f.trainingFocusId">
                      {{ f.trainingFocusName }}: {{ (f.modules || []).flatMap(m => m.checklistItems || []).length }} item(s)
                    </li>
                  </ul>
                </div>
                <p v-if="!checklistData.trainingItems?.length && !checklistData.documentItems?.length && !checklistData.trainingFocusesWithItems?.length" class="supervision-placeholder">No checklist items.</p>
              </div>
            </section>
            <section v-show="activeSection === 'documents'" class="supervision-detail-section">
              <h3 id="supervision-documents">Documents</h3>
              <p class="summary-meta" style="margin-bottom: 0.5rem;">Current and completed document assignments from the task system for this organization. Document content follows your existing assignment permissions. Assign a PDF for signature or review below.</p>
              <div v-if="documentsLoading" class="supervision-placeholder">Loading documents…</div>
              <div v-else-if="documentsError" class="supervision-error-inline">{{ documentsError }}</div>
              <ul v-else-if="documentsList?.length" class="supervision-docs-list">
                <li v-for="doc in documentsList" :key="doc.id">
                  <span>{{ doc.task_title || doc.document_title || `Document ${doc.id}` }}</span>
                  <span class="summary-meta"> — {{ formatTaskStatusLabel(doc.task_status) }}</span>
                </li>
              </ul>
              <p v-else class="supervision-placeholder">No document assignments in this organization.</p>
              <p v-if="documentsTotal > documentsList.length" class="summary-meta">Showing {{ documentsList.length }} of {{ documentsTotal }} assignments.</p>
              <div style="margin-top: 0.75rem;">
                <button type="button" class="btn btn-primary btn-sm" @click="showUploadDocumentDialog = true">Assign document (upload PDF, choose type &amp; review/signature)</button>
              </div>
            </section>

                <SupervisionDocumentationPanel v-for="section in documentationSections.filter(item => visitedSections.has(item.id))" v-show="activeSection === section.id" :key="`${superviseeKey(selectedSupervisee)}-${section.id}`" :agency-id="Number(selectedSuperviseeAgencyId)" :provider-id="Number(selectedSupervisee.supervisee_id)" :mode="section.mode" />
                <SuperviseeWorkPanel v-if="selectedSuperviseeAgencyId" :key="`counts-${superviseeKey(selectedSupervisee)}-${countsRevision}`" :agency-id="Number(selectedSuperviseeAgencyId)" :provider-id="Number(selectedSupervisee.supervisee_id)" mode="counts" @counts="updateWorkCounts" />
                <div v-show="activeSection === 'communications'" class="communications-launch"><RouterLink :to="chatsLink" class="btn btn-primary"><MessagesSquare :size="18" /> Message {{ selectedSuperviseeDisplayName }}</RouterLink></div>
                <SuperviseeWorkPanel v-for="section in workSections.filter(item => visitedSections.has(item))" v-show="activeSection === section" :key="`${superviseeKey(selectedSupervisee)}-${section}`" :agency-id="Number(selectedSuperviseeAgencyId)" :provider-id="Number(selectedSupervisee.supervisee_id)" :mode="section" @counts="updateWorkCounts" />
              </main>
            </div>
            <!-- Module picker for assign training -->
            <div v-if="showModulePicker" class="supervision-modal-overlay" style="z-index: 10000;" @click.self="showModulePicker = false">
              <div class="supervision-modal" style="max-width: 400px;">
                <div class="supervision-modal-header">
                  <h2>Assign module</h2>
                  <button type="button" class="supervision-modal-close" aria-label="Close" @click="showModulePicker = false">&times;</button>
                </div>
                <div class="supervision-modal-body">
                  <div class="form-group">
                    <label>Select module</label>
                    <select v-model="selectedModuleForAssign" class="input" style="width: 100%;">
                      <option value="">— Select module —</option>
                      <option v-for="m in assignableModules" :key="m.id" :value="m.id">{{ m.title }}</option>
                    </select>
                  </div>
                  <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button type="button" class="btn btn-secondary" @click="showModulePicker = false">Cancel</button>
                    <button type="button" class="btn btn-primary" :disabled="!selectedModuleForAssign" @click="openModuleAssignmentDialog">
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <ModuleAssignmentDialog
              v-if="showModuleAssignmentDialog && selectedModuleForAssignObj"
              :module="selectedModuleForAssignObj"
              :pre-selected-user-id="selectedSupervisee?.supervisee_id"
              :agency-id="Number(selectedSuperviseeAgencyId)"
              @close="showModuleAssignmentDialog = false; selectedModuleForAssign = ''"
              @assigned="onTrainingAssigned"
            />
            <!-- Assign document: upload-only. Sync with main document section when that feature is fixed. -->
            <UserSpecificDocumentUploadDialog
              v-if="showUploadDocumentDialog && selectedSupervisee?.supervisee_id"
              :user-id="selectedSupervisee.supervisee_id"
              :agency-id="Number(selectedSuperviseeAgencyId)"
              @close="showUploadDocumentDialog = false"
              @uploaded="onDocumentUploaded"
            />

          </div>
        </template>
    </div>
    <Teleport to="body">
      <aside v-if="quickViewClient" class="supervision-client-quick-view" role="dialog" aria-modal="false" aria-labelledby="supervision-client-quick-title" @keydown.esc="quickViewClient = null">
        <header><div><span>Client quick view</span><h3 id="supervision-client-quick-title">{{ clientDisplayLabel(quickViewClient) }}</h3></div><button type="button" ref="quickViewClose" class="btn btn-secondary btn-sm" @click="quickViewClient = null">Close</button></header>
        <dl><dt>School / location</dt><dd>{{ clientSchoolName(quickViewClient) || '—' }}</dd><dt>Status</dt><dd>{{ caseloadStatus(quickViewClient) }}</dd><dt>Assigned</dt><dd>{{ caseloadAssignedDate(quickViewClient) }}</dd><dt>Missing checklist</dt><dd>{{ caseloadMissingChecklist(quickViewClient).join(', ') || 'None reported' }}</dd></dl>
        <ClientFeedbackSummary :summaries="feedbackByClient[quickViewClient.id]" :loading="feedbackLoading" :unavailable="!!feedbackError" />
        <button type="button" class="btn btn-primary" @click="openClientChart(quickViewClient)">Expand client chart</button><RouterLink :to="fullClientLink(quickViewClient)" class="btn btn-secondary">Open full client record ↗</RouterLink>
        <p>Chart tools follow your existing client permissions.</p>
      </aside>
      <ClientDetailPanel v-if="chartClient" :client="chartClient" :school-organization-id="chartClient.organization_type === 'school' ? chartClient.organization_id : null" @close="chartClient = null" @updated="onClientUpdated" @vue:mounted="focusClientChart" />
    </Teleport>
    <div v-if="showAgendaPanel && agendaSessionId" class="supervision-agenda-overlay" @click.self="showAgendaPanel = false">
      <MeetingAgendaPanel
        :meeting-type="'supervision_session'"
        :meeting-id="agendaSessionId"
        :can-add-item="true"
        @close="showAgendaPanel = false"
        @updated="() => {}"
      />
    </div>
    <div v-if="showAppVideoModal && appVideoToken" class="supervision-agenda-overlay supervision-video-overlay" style="z-index: 10001;">
      <div class="supervision-modal supervision-video-modal" :class="{ 'video-modal-fullscreen': appVideoFullscreen }">
        <div class="supervision-modal-header supervision-video-header">
          <div class="supervision-video-header-brand">
            <BrandingLogo size="medium" class="supervision-video-logo" />
            <h2>AuricWell · Supervision</h2>
          </div>
          <div class="supervision-video-header-actions">
            <a
              v-if="organizationSlug && appVideoSessionId"
              :href="`/${organizationSlug}/join/supervision/${appVideoSessionId}`"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-ghost btn-sm"
            >
              Open in new tab
            </a>
            <button type="button" class="btn btn-secondary btn-sm" aria-label="Toggle fullscreen" @click="appVideoFullscreen = !appVideoFullscreen">
              {{ appVideoFullscreen ? 'Exit fullscreen' : 'Fullscreen' }}
            </button>
            <button type="button" class="supervision-modal-close" aria-label="Close" @click="closeAppVideoModal">&times;</button>
          </div>
        </div>
        <div class="supervision-modal-body supervision-video-body">
          <p class="summary-meta" style="margin-bottom: 12px;">Attendance is tracked automatically when you join and leave.</p>
          <SupervisionVideoLobbyPanel
            :session-id="appVideoSessionId"
            :is-supervisor="appVideoIsSupervisor"
            theme="dark"
            :overlay="appVideoFullscreen || roomVideoFullscreen"
          />
          <SupervisionVideoRoom
            supervision-diagnostics
            :token="appVideoToken"
            :room-name="appVideoRoomName"
            :vonage-session-id="appVideoVonageSessionId"
            :room-sid="appVideoVonageSessionId"
            :application-id="appVideoApplicationId"
            :api-key="appVideoApplicationId"
            :session-title="appVideoSessionTitle"
            :session-id="appVideoSessionId"
            :is-host="appVideoIsSupervisor"
            :diagnostics="appVideoDiagnostics"
            @update:video-fullscreen="roomVideoFullscreen = $event"
            @disconnected="closeAppVideoModal"
          />
        </div>
      </div>
    </div>
    <div v-if="appVideoError" class="supervision-agenda-overlay" style="z-index: 10002;" @click.self="appVideoError = ''">
      <div class="supervision-modal" style="max-width: 400px;">
        <div class="supervision-modal-header">
          <h2>Could not join</h2>
          <button type="button" class="supervision-modal-close" aria-label="Close" @click="appVideoError = ''">&times;</button>
        </div>
        <div class="supervision-modal-body">
          <p class="supervision-error-inline">{{ appVideoError }}</p>
          <p v-if="appVideoError.includes('not configured')" class="summary-meta">Video must be configured by your administrator. Use the Google Meet link instead if available.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import ClientFeedbackSummary from '../kiosk/ClientFeedbackSummary.vue';
import CaseloadFeedbackSummary from '../kiosk/CaseloadFeedbackSummary.vue';
import { useClientFeedbackSummaries } from '../../composables/useClientFeedbackSummaries.js';

const SupervisionDocumentationPanel = defineAsyncComponent(() => import('./SupervisionDocumentationPanel.vue'));
import { ref, computed, onMounted, onUnmounted, onActivated, onDeactivated, watch, defineAsyncComponent, nextTick } from 'vue';
import { LayoutDashboard, Video, Users, ClipboardList, ListChecks, Inbox, CalendarDays, MapPin, School, Files, GraduationCap, MessagesSquare, ChartNoAxesCombined, Clock, Settings, ArrowUpRight, RefreshCw } from '@lucide/vue';
import { supervisionSessionCounts } from '../../utils/superviseeSessionHistory.js';
const SuperviseeSessionHistory = defineAsyncComponent(() => import('./SuperviseeSessionHistory.vue'));
const SuperviseeWorkPanel = defineAsyncComponent(() => import('./SuperviseeWorkPanel.vue'));
const ClientDetailPanel = defineAsyncComponent(() => import('../admin/ClientDetailPanel.vue'));
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import supervisionApi from '../../services/api';
// Detail reads paint local states without covering the dashboard with its legacy loader.
const api = { get: (url, config = {}) => supervisionApi.get(url, { ...config, skipGlobalLoading: true }), post: (...args) => supervisionApi.post(...args) };
import { onSupervisionHoursChanged } from '../../utils/supervisionHoursRefresh.js';
import { toUploadsUrl } from '../../utils/uploadsUrl';
const ModuleAssignmentDialog = defineAsyncComponent(() => import('../admin/ModuleAssignmentDialog.vue'));
const UserSpecificDocumentUploadDialog = defineAsyncComponent(() => import('../documents/UserSpecificDocumentUploadDialog.vue'));
const ManualSupervisionPanel = defineAsyncComponent(() => import('./ManualSupervisionPanel.vue'));
const MeetingAgendaPanel = defineAsyncComponent(() => import('../meetings/MeetingAgendaPanel.vue'));
import BrandingLogo from '../BrandingLogo.vue';
const SupervisionVideoRoom = defineAsyncComponent(() => import('./SupervisionVideoRoom.vue'));
const SupervisionVideoLobbyPanel = defineAsyncComponent(() => import('./SupervisionVideoLobbyPanel.vue'));
import { suspendInactivityTimeout, resumeInactivityTimeout } from '../../utils/activityTracker';

const route = useRoute();
const router = useRouter();

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(true);
const error = ref('');
const supervisees = ref([]);
const selectedSupervisee = ref(null);
const showAgendaPanel = ref(false);
const agendaSessionId = ref(null);
const summary = ref(null);
const summaryLoading = ref(false);
const summaryError = ref('');
const supervisionSessionHours = ref(null);
const supervisionSessionCount = ref(null);
const supervisionAttendanceIndividualHours = ref(null);
const supervisionAttendanceGroupHours = ref(null);
const compliance24Plus = ref([]);
const scheduleSummary = ref(null);
const scheduleLoading = ref(false);
const scheduleError = ref('');
const checklistData = ref(null);
const checklistLoading = ref(false);
const checklistError = ref('');
const documentsList = ref([]);
const documentsTotal = ref(null);
const documentsLoading = ref(false);
const documentsError = ref('');
const clientsList = ref([]);
const snapshotYear = new Date().getFullYear();
const yearlyClientCounts = computed(() => {
  const counts = { office: 0, school: 0, other: 0, unknown: 0 };
  const seen = new Set();
  for (const client of clientsList.value) {
    if (seen.has(client.id)) continue;
    seen.add(client.id);
    const date = String(client.provider_assigned_at || client.assigned_at || client.date_assigned || '').slice(0, 10);
    if (!date) { counts.unknown++; continue; }
    if (date < `${snapshotYear}-01-01` || date >= `${snapshotYear + 1}-01-01`) continue;
    const type = String(client.organization_type || '').toLowerCase();
    if (type === 'school') counts.school++;
    else if (['agency', 'office'].includes(type)) counts.office++;
    else counts.other++;
  }
  return counts;
});
const clientsLoading = ref(false);
const clientsError = ref('');
const compliancePendingList = ref([]);
const compliancePendingLoading = ref(false);
const compliancePendingError = ref('');
const schoolClientModalLoading = ref(false);
const schoolClientModalError = ref('');
const affiliatedPortals = ref([]);
const affiliatedPortalsLoading = ref(false);
const affiliatedPortalsError = ref('');
const caseloadSortKey = ref('school');
const caseloadSortDir = ref('asc');
const showModulePicker = ref(false);
const showUploadDocumentDialog = ref(false);
const selectedModuleForAssign = ref('');
const assignableModules = ref([]);
const showModuleAssignmentDialog = ref(false);
const meetingTrackerSaving = ref(false);
const trackedMeetingWindow = ref(null);
const trackedMeetingPoll = ref(null);
const trackedMeetingSessionId = ref(null);
const trackedMeetingClientSessionKey = ref('');
const showAppVideoModal = ref(false);
const appVideoToken = ref('');
const appVideoRoomName = ref('');
const appVideoVonageSessionId = ref('');
const appVideoApplicationId = ref('');
const appVideoDiagnostics = ref(null);
const appVideoSessionTitle = ref('');
const appVideoSessionId = ref(null);
const appVideoIsSupervisor = ref(false);
const appVideoFullscreen = ref(false);
const roomVideoFullscreen = ref(false);
const appVideoLoading = ref(false);
const appVideoError = ref('');
const sessionHistory = ref([]);
const sessionHistoryLoading = ref(false);
const sessionHistoryError = ref('');

const activeSection = ref('overview');
const visitedSections = ref(new Set(['overview']));
const showManualEntry = ref(false);
const sessionFilter = ref('all');
const historyPanel = ref(null);
const historyHasMore = ref(false);
const overallAttendanceSummary = ref(null);
const quickViewClient = ref(null);
const quickViewClose = ref(null);
let quickViewTrigger = null;
watch(quickViewClient, async client => { if (client) { quickViewTrigger = document.activeElement; await nextTick(); quickViewClose.value?.focus(); } else if (!chartClient.value) { quickViewTrigger?.focus?.(); quickViewTrigger = null; } });
const chartClient = ref(null);
let chartTrigger = null;
watch(chartClient, client => { if (!client) { chartTrigger?.focus?.(); chartTrigger = null; quickViewTrigger = null; } });
function focusClientChart() { document.querySelector('.cdp-chart-overlay .btn-close')?.focus(); }
const workCounts = ref({});
const countsRevision = ref(0);
const workSections = ['tasks', 'work', 'communications', 'assignments'];
const documentationSections = [{id:'cases',mode:'cases'},{id:'queue',mode:'queue'},{id:'review-time',mode:'time'},{id:'settings',mode:'settings'}];
const navigationGroups = [
  { label: 'Supervision', items: [
    {id:'overview',label:'Overview',icon:LayoutDashboard},{id:'sessions',label:'Sessions',icon:Video},
    {id:'queue',label:'Documentation to review',icon:ClipboardList},{id:'cases',label:'Case review',icon:Files}
  ]},
  { label: 'Provider workspace', items: [
    {id:'clients',label:'Caseload',icon:Users},{id:'tasks',label:'Task list',icon:ListChecks},{id:'work',label:'My Work',icon:Inbox},
    {id:'schedule',label:'Schedule',icon:CalendarDays},{id:'assignments',label:'Assignments',icon:MapPin},
    {id:'schools',label:'Schools & programs',icon:School},{id:'documents',label:'Documents',icon:Files},
    {id:'training',label:'Training',icon:GraduationCap},{id:'communications',label:'Communications',icon:MessagesSquare}
  ]},
  { label: 'Management', items: [
    {id:'performance',label:'Response & note timing',icon:ChartNoAxesCombined},{id:'review-time',label:'Review time',icon:Clock},
    {id:'settings',label:'Oversight settings',icon:Settings}
  ]}
];
const navigationItems = navigationGroups.flatMap(group => group.items);
const activeSectionLabel = computed(() => navigationItems.find(item => item.id === activeSection.value)?.label || 'Overview');
const attendanceCounts = computed(() => overallAttendanceSummary.value || supervisionSessionCounts(sessionHistory.value));
function sectionCount(section) {
  if (['tasks','work'].includes(section)) return workCounts.value[section] ?? null;
  if (section === 'clients') return clientsLoading.value || clientsError.value ? null : clientsList.value.length;
  if (section === 'sessions') return sessionHistoryLoading.value || sessionHistoryError.value ? null : overallAttendanceSummary.value?.total ?? sessionHistory.value.length;
  if (section === 'documents') return visitedSections.value.has('documents') && !documentsError.value && !documentsLoading.value ? documentsTotal.value : null;
  return null;
}
function updateWorkCounts(counts) { workCounts.value = { ...workCounts.value, ...counts }; }
function persistWorkspace() {
  if (!router.replace) return;
  const query = { ...route.query };
  if (selectedSupervisee.value) {
    query.supervisionProvider = String(selectedSupervisee.value.supervisee_id);
    query.supervisionAgency = String(selectedSuperviseeAgencyId.value);
    query.supervisionSection = activeSection.value;
  } else {
    delete query.supervisionProvider; delete query.supervisionAgency; delete query.supervisionSection;
  }
  if (JSON.stringify(query) !== JSON.stringify(route.query)) void router.replace({ query });
}
function selectSection(section) {
  if (!navigationItems.some(item => item.id === section)) return;
  activeSection.value = section;
  visitedSections.value = new Set([...visitedSections.value, section]);
  persistWorkspace();
  void loadSection(section);
}
async function loadSection(section, force = false) {
  if (!selectedSupervisee.value) return;
  if (section === 'training' && (force || !checklistData.value) && !checklistLoading.value) await fetchChecklist();
  if (section === 'documents' && (force || !documentsLoaded.value) && !documentsLoading.value) await fetchDocuments();
  if (['schools','clients'].includes(section) && (force || !portalsLoaded.value) && !affiliatedPortalsLoading.value) void fetchAffiliatedPortals();
  if (section === 'clients' && (force || !complianceLoaded.value) && !compliancePendingLoading.value) void fetchCompliancePending();
}
function showSessions(filter) { sessionFilter.value = filter; selectSection('sessions'); }
function onHistoryRefreshed(rows, meta = {}) { sessionHistory.value = rows; if (meta.hasMore != null) historyHasMore.value = meta.hasMore; if (meta.attendanceSummary) overallAttendanceSummary.value = meta.attendanceSummary; }
async function refreshCurrentSection() {
  if (['overview','sessions'].includes(activeSection.value)) return refreshSupervisionLog();
  if (activeSection.value === 'clients') await fetchClients();
  if (activeSection.value === 'schedule') await fetchScheduleSummary();
  await loadSection(activeSection.value, true);
}
const documentsLoaded = ref(false), portalsLoaded = ref(false), complianceLoaded = ref(false);
let workspaceActive = true;
onActivated(() => { workspaceActive = true; if (selectedSupervisee.value) persistWorkspace(); });
onDeactivated(() => { workspaceActive = false; });

const organizationSlug = computed(() => route.params?.organizationSlug || '');

// Link to user's own dashboard; chat drawer will open a thread with the supervisee via openChatWith/agencyId (avoids admin-only chats page).
const chatsLink = computed(() => {
  const slug = route.params?.organizationSlug || '';
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  const base = slug ? `/${slug}/dashboard` : '/dashboard';
  const params = new URLSearchParams();
  params.set('tab', 'chats');
  if (s?.supervisee_id) params.set('openChatWith', String(s.supervisee_id));
  if (agencyId) params.set('agencyId', String(agencyId));
  if (selectedSuperviseeDisplayName.value) params.set('openChatWithName', selectedSuperviseeDisplayName.value);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
});

function openSupervisionScheduler() {
  const slug = route.params?.organizationSlug || '';
  router.push({ path: slug ? `/${slug}/dashboard` : '/dashboard', query: {
    tab: 'my_schedule', scheduleAction: 'supervision',
    scheduleSuperviseeId: String(selectedSupervisee.value?.supervisee_id || ''),
    scheduleAgencyId: String(selectedSuperviseeAgencyId.value || '')
  }});
}

const superviseeFullScheduleLink = computed(() => {
  const slug = route.params?.organizationSlug || '';
  const s = selectedSupervisee.value;
  const base = slug ? `/${slug}/dashboard` : '/dashboard';
  const params = new URLSearchParams();
  params.set('tab', 'my_schedule');
  if (s?.supervisee_id) {
    params.set('scheduleMode', 'supervisee');
    params.set('superviseeId', String(s.supervisee_id));
  }
  if (selectedSuperviseeAgencyId.value) params.set('agencyId', String(selectedSuperviseeAgencyId.value));
  return `${base}?${params.toString()}`;
});


const upcomingSessions = computed(() => {
  const list = scheduleSummary.value?.supervisionSessions || [];
  const now = new Date();
  return list
    .filter((s) => s.role === 'supervisee' && new Date(s.endAt || s.startAt || 0) >= now)
    .slice(0, 10);
});

/**
 * Format session timestamps for display.
 * Supervision start/end are stored as UTC MySQL DATETIME and often arrive as ISO with Z
 * (or naive UTC). Parse as real instants so Mountain noon does not show as 6:00 PM.
 */
function formatSessionDate(iso) {
  if (!iso) return '—';
  try {
    const raw = String(iso).trim();
    let d;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/i.test(raw)
      || /[+-]\d{2}:?\d{2}$/.test(raw)
      || raw.includes('T')) {
      d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
    } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(raw)) {
      // Naive MySQL UTC datetime from API — treat as UTC.
      d = new Date(raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z'));
    } else {
      d = new Date(raw);
    }
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function clearTrackedMeetingPoll() {
  if (trackedMeetingPoll.value) {
    clearInterval(trackedMeetingPoll.value);
    trackedMeetingPoll.value = null;
  }
}

async function logMeetingLifecycle(sessionId, eventType) {
  const sid = Number(sessionId || 0);
  if (!sid) return;
  await api.post(`/supervision/sessions/${sid}/meeting-lifecycle`, {
    eventType,
    clientSessionKey: trackedMeetingClientSessionKey.value || undefined
  });
}

async function endTrackedMeeting() {
  if (!trackedMeetingSessionId.value) return;
  try {
    meetingTrackerSaving.value = true;
    const sid = Number(trackedMeetingSessionId.value || 0);
    clearTrackedMeetingPoll();
    await logMeetingLifecycle(sid, 'closed');
    if (trackedMeetingWindow.value && !trackedMeetingWindow.value.closed) {
      try { trackedMeetingWindow.value.close(); } catch { /* ignore */ }
    }
  } catch {
    // best-effort lifecycle close
  } finally {
    trackedMeetingWindow.value = null;
    trackedMeetingSessionId.value = null;
    trackedMeetingClientSessionKey.value = '';
    meetingTrackerSaving.value = false;
  }
}

async function startAppVideoMeeting(session) {
  const sid = Number(session?.id || 0);
  if (!sid) return;
  // Full join route owns transcript capture, lobby, and workspace. The in-modal
  // video-only path never started SpeechRecognition for the supervisee.
  const slug = String(
    organizationSlug.value
    || agencyStore.currentAgency?.slug
    || agencyStore.currentAgency?.portal_url
    || ''
  ).trim();
  if (slug) {
    router.push(`/${slug}/join/supervision/${sid}`).catch(() => {});
    return;
  }
  appVideoLoading.value = true;
  appVideoSessionId.value = sid;
  appVideoError.value = '';
  try {
    const resp = await api.get(`/supervision/sessions/${sid}/video-token`);
    const data = resp?.data || {};
    const tok = (data.token || data.data?.token || data.result?.token || '').trim();
    const rn = data.roomName || data.room_name || data.data?.roomName || `supervision-${sid}`;
    const vonageSid = String(data.sessionId || data.roomSid || '').trim();
    const appId = String(data.applicationId || data.apiKey || '').trim();
    if (!tok || !vonageSid || !appId) {
      console.warn('[SupervisionModal] video-token incomplete:', { status: resp?.status, data });
      appVideoError.value = data?.error?.message || data?.error || 'Video credentials were incomplete.';
      return;
    }
    appVideoToken.value = tok;
    appVideoRoomName.value = rn;
    appVideoVonageSessionId.value = vonageSid;
    appVideoApplicationId.value = appId;
    appVideoDiagnostics.value = data.diagnostics || null;
    appVideoSessionTitle.value = data.sessionTitle || data.session_title || '';
    appVideoIsSupervisor.value = !!data.isSupervisor;
    appVideoFullscreen.value = true;
    showAppVideoModal.value = true;
  } catch (err) {
    appVideoError.value = err?.response?.data?.error?.message || err?.message || 'Failed to join video room';
  } finally {
    appVideoLoading.value = false;
    if (!showAppVideoModal.value) appVideoSessionId.value = null;
  }
}

function closeAppVideoModal() {
  showAppVideoModal.value = false;
  appVideoToken.value = '';
  appVideoRoomName.value = '';
  appVideoVonageSessionId.value = '';
  appVideoApplicationId.value = '';
  appVideoDiagnostics.value = null;
  appVideoSessionTitle.value = '';
  appVideoSessionId.value = null;
  appVideoIsSupervisor.value = false;
  appVideoFullscreen.value = false;
}

watch([showAppVideoModal, appVideoToken], ([show, tok], [prevShow, prevTok]) => {
  const active = !!(show && String(tok || '').trim());
  const wasActive = !!(prevShow && String(prevTok || '').trim());
  if (active && !wasActive) suspendInactivityTimeout();
  else if (!active && wasActive) resumeInactivityTimeout();
});

async function startTrackedMeeting(session) {
  const sid = Number(session?.id || 0);
  const meetLink = String(session?.googleMeetLink || '').trim();
  if (!sid || !meetLink) return;
  try {
    meetingTrackerSaving.value = true;
    clearTrackedMeetingPoll();
    trackedMeetingSessionId.value = sid;
    trackedMeetingClientSessionKey.value = `web-${sid}-${Number(authStore.user?.id || 0)}-${Date.now()}`;
    await logMeetingLifecycle(sid, 'opened');
    const popup = window.open(meetLink, '_blank', 'noopener,noreferrer,width=1200,height=850');
    if (!popup) throw new Error('Pop-up blocked');
    trackedMeetingWindow.value = popup;
    trackedMeetingPoll.value = setInterval(() => {
      if (!trackedMeetingWindow.value || trackedMeetingWindow.value.closed) {
        void endTrackedMeeting();
      }
    }, 1200);
  } catch {
    // Ignore and allow regular link usage
    trackedMeetingSessionId.value = null;
    trackedMeetingClientSessionKey.value = '';
  } finally {
    meetingTrackerSaving.value = false;
  }
}

function openAgendaForSession(sessionId) {
  agendaSessionId.value = Number(sessionId || 0);
  showAgendaPanel.value = !!agendaSessionId.value;
}

const selectedModuleForAssignObj = computed(() => {
  const id = selectedModuleForAssign.value ? parseInt(selectedModuleForAssign.value, 10) : null;
  if (!id) return null;
  return (assignableModules.value || []).find((m) => Number(m.id) === id) || null;
});

const currentAgencyId = computed(() => {
  const a = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  return a?.id ?? null;
});

const selectedSuperviseeAgencyId = computed(() => {
  const selectedAgencyId = selectedSupervisee.value?.agency_id;
  return selectedAgencyId || currentAgencyId.value || null;
});

const affiliatedPortalsByOrgId = computed(() => {
  const map = new Map();
  for (const portal of affiliatedPortals.value || []) {
    const orgId = Number(portal?.id || 0);
    if (orgId) map.set(orgId, portal);
  }
  return map;
});

const complianceByClientId = computed(() => {
  const map = new Map();
  for (const row of compliancePendingList.value || []) {
    const cid = Number(row?.client_id || 0);
    if (cid) map.set(cid, row);
  }
  return map;
});

const sortedClientsList = computed(() => {
  const rows = [...(clientsList.value || [])];
  const dir = caseloadSortDir.value === 'desc' ? -1 : 1;
  const key = caseloadSortKey.value;
  rows.sort((a, b) => {
    const av = caseloadSortValue(a, key);
    const bv = caseloadSortValue(b, key);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return String(clientDisplayLabel(a)).localeCompare(String(clientDisplayLabel(b)));
  });
  return rows;
});

const groupedSupervisees = computed(() => {
  const groups = new Map();
  const rows = Array.isArray(supervisees.value) ? supervisees.value : [];
  for (const item of rows) {
    const key = `${Number(item?.agency_id || 0)}:${String(item?.agency_name || '').trim().toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: String(item?.agency_name || '').trim() || 'Unassigned agency',
        color: parseAgencyPrimaryColor(item?.agency_color_palette),
        items: []
      });
    }
    groups.get(key).items.push(item);
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      headerStyle: group.color ? { backgroundColor: group.color } : {}
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

function portalSlugForOrgId(orgId) {
  const oid = Number(orgId || 0);
  if (oid && affiliatedPortalsByOrgId.value.has(oid)) {
    return affiliatedPortalsByOrgId.value.get(oid)?.slug || '';
  }
  return (affiliatedPortals.value?.[0]?.slug || '').trim();
}

function portalNameForOrgId(orgId) {
  const oid = Number(orgId || 0);
  if (oid && affiliatedPortalsByOrgId.value.has(oid)) {
    return String(affiliatedPortalsByOrgId.value.get(oid)?.name || '').trim();
  }
  return '';
}

function clientDisplayLabel(client) {
  const initials = String(client?.initials || '').trim();
  const fullName = String(client?.full_name || '').trim();
  const code = String(client?.identifier_code || '').trim();
  if (initials) return initials;
  if (fullName) return fullName;
  if (code) return code;
  return `Client ${client?.id || ''}`.trim();
}

function clientSchoolName(client) {
  const direct = String(client?.organization_name || '').trim();
  if (direct) return direct;
  return portalNameForOrgId(client?.organization_id);
}

function formatTaskStatusLabel(status) {
  const raw = String(status || '').trim();
  if (!raw) return 'Pending';
  const normalized = raw.toLowerCase();
  const map = {
    completed: 'Complete',
    pending: 'Pending',
    pending_review: 'Pending review',
    pending_signature: 'Pending signature',
    in_progress: 'In progress',
    rejected: 'Rejected',
    declined: 'Declined'
  };
  if (map[normalized]) return map[normalized];
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatAssignedDate(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  } catch {
    return String(value);
  }
}

function caseloadAssignedDate(client) {
  const fromClient = client?.assigned_at || client?.date_assigned || client?.created_at || null;
  if (fromClient) return formatAssignedDate(fromClient);
  const row = complianceByClientId.value.get(Number(client?.id || 0));
  if (!row) return '—';
  const days = Number(row?.days_since_assigned || 0);
  if (!days) return 'Today';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function caseloadStatus(client) {
  const status = client?.status || client?.task_status || '';
  if (status) return formatTaskStatusLabel(status);
  const row = complianceByClientId.value.get(Number(client?.id || 0));
  if (row) return 'Pending compliance';
  return 'Active';
}

function caseloadMissingChecklist(client) {
  const fromClient = Array.isArray(client?.missing_checklist) ? client.missing_checklist : [];
  if (fromClient.length) return fromClient;
  const row = complianceByClientId.value.get(Number(client?.id || 0));
  const fromCompliance = Array.isArray(row?.missing_checklist) ? row.missing_checklist : [];
  return fromCompliance;
}

function caseloadSortValue(client, key) {
  if (key === 'school') return String(clientSchoolName(client) || '').toLowerCase();
  if (key === 'status') return String(caseloadStatus(client) || '').toLowerCase();
  if (key === 'missing') return caseloadMissingChecklist(client).length;
  if (key === 'assigned') return caseloadAssignedDateSortValue(client);
  return String(clientDisplayLabel(client) || '').toLowerCase();
}

function caseloadAssignedDateSortValue(client) {
  const fromClient = client?.assigned_at || client?.date_assigned || client?.created_at || null;
  if (fromClient) {
    const ts = new Date(fromClient).getTime();
    return Number.isNaN(ts) ? 0 : ts;
  }
  const row = complianceByClientId.value.get(Number(client?.id || 0));
  const days = Number(row?.days_since_assigned || 0);
  if (!Number.isFinite(days)) return 0;
  return Date.now() - (days * 24 * 60 * 60 * 1000);
}

function setCaseloadSort(key) {
  if (caseloadSortKey.value === key) {
    caseloadSortDir.value = caseloadSortDir.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  caseloadSortKey.value = key;
  caseloadSortDir.value = key === 'missing' ? 'desc' : 'asc';
}

function caseloadSortIndicator(key) {
  if (caseloadSortKey.value !== key) return '';
  return caseloadSortDir.value === 'asc' ? '▲' : '▼';
}

function resolveClientOrgId(client) {
  const direct = Number(client?.organization_id || 0);
  if (direct) return direct;
  const slug = String(client?.organization_slug || '').trim().toLowerCase();
  if (slug) {
    const bySlug = (affiliatedPortals.value || []).find((p) => String(p?.slug || '').trim().toLowerCase() === slug);
    const slugOrgId = Number(bySlug?.id || 0);
    if (slugOrgId) return slugOrgId;
  }
  if ((affiliatedPortals.value || []).length === 1) {
    const only = Number(affiliatedPortals.value?.[0]?.id || 0);
    if (only) return only;
  }
  return null;
}

function fullClientLink(client) {
  const prefix = organizationSlug.value ? `/${organizationSlug.value}` : '';
  return `${prefix}/admin/clients/${Number(client.id)}`;
}
function openCaseloadClientModal(client) { quickViewClient.value = client; }
async function openClientChart(client) {
  const expectedId = Number(client.id);
  chartTrigger = quickViewTrigger || document.activeElement;
  chartClient.value = { ...client };
  quickViewClient.value = null;
  try {
    const { data } = await api.get(`/clients/${expectedId}`);
    if (chartClient.value?.id === expectedId && data) chartClient.value = { ...client, ...data };
  } catch (err) {
    if (chartClient.value?.id === expectedId) { chartClient.value = null; schoolClientModalError.value = err.response?.data?.error?.message || 'Unable to open client chart.'; }
  }
}
function onClientUpdated(payload) { if (!payload?.client) { void fetchClients(); if (visitedSections.value.has('clients')) void fetchCompliancePending(); return; } if (payload?.client) { chartClient.value = { ...payload.client }; clientsList.value = clientsList.value.map(client => Number(client.id) === Number(payload.client.id) ? { ...client, ...payload.client } : client); } }

function superviseeDisplayName(s) {
  const first = (s.supervisee_first_name || '').trim();
  const last = (s.supervisee_last_name || '').trim();
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return s.supervisee_email || `User ${s.supervisee_id}`;
}

const selectedSuperviseeDisplayName = computed(() => {
  const s = selectedSupervisee.value;
  return s ? superviseeDisplayName(s) : '';
});

function avatarInitial(s) {
  const first = (s.supervisee_first_name || '').trim().slice(0, 1);
  const last = (s.supervisee_last_name || '').trim().slice(0, 1);
  if (first && last) return (first + last).toUpperCase();
  if (first) return first.toUpperCase();
  if (s.supervisee_email) return s.supervisee_email.slice(0, 1).toUpperCase();
  return '?';
}

function superviseeKey(s) {
  return `${s.supervisee_id}-${s.agency_id || ''}-${s.id || ''}`;
}

function parseAgencyPrimaryColor(raw) {
  if (!raw) return '';
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return '';
  const candidates = [
    parsed.primary,
    parsed.primaryColor,
    parsed.primary_color,
    parsed.brandPrimary,
    parsed.brand_primary
  ];
  for (const value of candidates) {
    const color = String(value || '').trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  }
  return '';
}

function superviseeCardStyle(s) {
  const color = parseAgencyPrimaryColor(s?.agency_color_palette);
  if (!color) return {};
  return {
    borderLeft: `4px solid ${color}`
  };
}

async function fetchSupervisees() {
  const userId = authStore.user?.id;
  if (!userId) {
    error.value = 'Not signed in.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get(`/supervisor-assignments/supervisor/${userId}`);
    const rows = Array.isArray(response.data) ? response.data : [];
    supervisees.value = rows;
    const providerId = Number(route.query?.supervisionProvider);
    const agencyId = Number(route.query?.supervisionAgency);
    const restored = rows.find(row => Number(row.supervisee_id) === providerId && Number(row.agency_id) === agencyId);
    if (restored && !selectedSupervisee.value) selectedSupervisee.value = restored;
  } catch (err) {
    console.error('Failed to fetch supervisees:', err);
    error.value = err?.response?.data?.error?.message || 'Failed to load supervisees.';
    supervisees.value = [];
  } finally {
    loading.value = false;
  }
}

const showRatio = computed(() => {
  const s = summary.value?.directIndirect;
  return s && !s.disabled && (s.last || s.avg90);
});

function fmtNum(n) {
  if (n == null || n === '') return '0';
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(n);
}
function fmtPct(ratio) {
  if (ratio == null) return '—';
  if (!Number.isFinite(ratio)) return '∞';
  return (ratio * 100).toFixed(1) + '%';
}

let supervisionRefresh = null;
async function refreshSupervisionLog({ includeHistory = true } = {}) {
  const selected = selectedSupervisee.value;
  if (!selected) return;
  if (supervisionRefresh?.selected === selected) {
    supervisionRefresh.historyRequested ||= includeHistory;
    return supervisionRefresh.promise;
  }
  const entry = { selected, historyRequested: includeHistory, promise: null };
  supervisionRefresh = entry;
  entry.promise = (async () => {
    if (includeHistory) await Promise.all([fetchSessionHistory(), fetchSuperviseeExtras()]);
    else await fetchSuperviseeExtras();
    if (!includeHistory && entry.historyRequested && selectedSupervisee.value === selected) await fetchSessionHistory();
    if (selectedSupervisee.value === selected) await fetchSuperviseeSummary();
  })().finally(() => { if (supervisionRefresh === entry) supervisionRefresh = null; });
  return entry.promise;
}

async function fetchSuperviseeSummary() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id || !agencyId) {
    summary.value = null;
    return;
  }
  summaryLoading.value = true;
  summaryError.value = '';
  try {
    const response = await api.get(`/payroll/supervisee/${s.supervisee_id}/dashboard-summary`, { params: { agencyId } });
    if (selectedSupervisee.value !== s || selectedSuperviseeAgencyId.value !== agencyId) return;
    summary.value = response.data;
  } catch (err) {
    if (selectedSupervisee.value !== s) return;
    console.error('Failed to fetch supervisee summary:', err);
    summaryError.value = err?.response?.data?.error?.message || 'Failed to load snapshot.';
    summary.value = null;
  } finally {
    if (selectedSupervisee.value === s) summaryLoading.value = false;
  }
}

async function fetchSuperviseeExtras() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id || !agencyId) return;
  supervisionSessionHours.value = null;
  supervisionSessionCount.value = null;
  supervisionAttendanceIndividualHours.value = null;
  supervisionAttendanceGroupHours.value = null;
  compliance24Plus.value = [];
  try {
    const [hoursRes, complianceRes] = await Promise.all([
      api.get(`/supervision/supervisee/${s.supervisee_id}/hours-summary`, { params: { agencyId } }).catch(() => ({ data: null })),
      api.get(`/psychotherapy-compliance/supervisee/${s.supervisee_id}/clients-24-plus`, { params: { agencyId } }).catch(() => ({ data: null }))
    ]);
    if (selectedSupervisee.value !== s || selectedSuperviseeAgencyId.value !== agencyId) return;
    if (hoursRes?.data?.ok) {
      supervisionSessionHours.value = hoursRes.data.totalHours;
      supervisionSessionCount.value = hoursRes.data.sessionCount;
      supervisionAttendanceIndividualHours.value = hoursRes.data.individualHours;
      supervisionAttendanceGroupHours.value = hoursRes.data.groupHours;
    }
    if (complianceRes?.data?.clientAbbrevs) {
      compliance24Plus.value = complianceRes.data.clientAbbrevs;
    }
  } catch {
    // ignore
  }
}

async function fetchSessionHistory() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id || !agencyId) {
    sessionHistory.value = [];
    return;
  }
  sessionHistoryLoading.value = true;
  sessionHistoryError.value = '';
  try {
    const pages = Math.max(1, Math.ceil(sessionHistory.value.length / 50));
    const rows = [];
    let hasMore = false;
    for (let page = 1; page <= pages; page++) {
      const { data } = await api.get(`/supervision/supervisee/${s.supervisee_id}/sessions`, { params: { agencyId, page, pageSize: 50 } });
      if (selectedSupervisee.value !== s) return;
      if (data?.attendanceSummary) overallAttendanceSummary.value = data.attendanceSummary;
      const incoming = Array.isArray(data?.sessions) ? data.sessions : [];
      rows.push(...incoming);
      hasMore = data?.hasMore ?? incoming.length === 50;
      if (!hasMore) break;
    }
    historyHasMore.value = hasMore;
    sessionHistory.value = [...new Map(rows.map(row => [Number(row.id), row])).values()];
  } catch (err) {
    if (selectedSupervisee.value !== s) return;
    sessionHistoryError.value = err?.response?.data?.error?.message || 'Failed to load session history.';
    sessionHistory.value = [];
  } finally {
    if (selectedSupervisee.value === s) sessionHistoryLoading.value = false;
  }
}

async function fetchScheduleSummary() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id) return;
  scheduleLoading.value = true;
  scheduleError.value = '';
  scheduleSummary.value = null;
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,'0')}-${String(weekStart.getDate()).padStart(2,'0')}`;
    const response = await api.get(`/users/${s.supervisee_id}/schedule-summary`, {
      params: { agencyId: agencyId || undefined, weekStart: weekStartStr }
    });
    if (selectedSupervisee.value !== s) return;
    scheduleSummary.value = response.data;
  } catch (err) {
    if (selectedSupervisee.value !== s) return;
    scheduleError.value = err?.response?.data?.error?.message || 'Failed to load schedule.';
  } finally {
    if (selectedSupervisee.value === s) scheduleLoading.value = false;
  }
}

async function fetchChecklist() {
  const s = selectedSupervisee.value;
  if (!s?.supervisee_id) return;
  checklistLoading.value = true;
  checklistError.value = '';
  checklistData.value = null;
  try {
    const response = await api.get(`/users/${s.supervisee_id}/unified-checklist`);
    if (selectedSupervisee.value !== s) return;
    checklistData.value = response.data;
  } catch (err) {
    if (selectedSupervisee.value !== s) return;
    checklistError.value = err?.response?.data?.error?.message || 'Failed to load checklist.';
  } finally {
    if (selectedSupervisee.value === s) checklistLoading.value = false;
  }
}

async function fetchDocuments() {
  const s = selectedSupervisee.value;
  if (!s?.supervisee_id) return;
  documentsLoading.value = true;
  documentsError.value = '';
  documentsList.value = [];
  try {
    const response = await api.get(`/supervision/supervisee/${s.supervisee_id}/workspace`, { params: { agencyId: selectedSuperviseeAgencyId.value, section: 'documents' } });
    if (selectedSupervisee.value !== s) return;
    documentsList.value = Array.isArray(response.data?.items) ? response.data.items : [];
    documentsTotal.value = Number(response.data?.total ?? documentsList.value.length);
    documentsLoaded.value = true;
  } catch (err) {
    if (selectedSupervisee.value !== s) return;
    documentsError.value = err?.response?.data?.error?.message || 'Failed to load documents.';
  } finally {
    if (selectedSupervisee.value === s) documentsLoading.value = false;
  }
}

const { byClient: feedbackByClient, loading: feedbackLoading, error: feedbackError } = useClientFeedbackSummaries(clientsList, () => selectedSupervisee.value?.supervisee_id);

async function fetchClients() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id || !agencyId) {
    clientsList.value = [];
    return;
  }
  clientsLoading.value = true;
  clientsError.value = '';
  clientsList.value = [];
  try {
    const response = await api.get(`/clients/for-user/${s.supervisee_id}`, { params: { agencyId } });
    if (selectedSupervisee.value !== s) return;
    clientsList.value = Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    if (selectedSupervisee.value !== s) return;
    clientsError.value = err?.response?.data?.error?.message || 'Failed to load clients.';
    clientsList.value = [];
  } finally {
    if (selectedSupervisee.value === s) clientsLoading.value = false;
  }
}

async function fetchCompliancePending() {
  const s = selectedSupervisee.value;
  if (!s?.supervisee_id) {
    compliancePendingList.value = [];
    return;
  }
  compliancePendingLoading.value = true;
  compliancePendingError.value = '';
  compliancePendingList.value = [];
  try {
    const response = await api.get('/compliance-corner/pending-clients', {
      params: { providerUserId: s.supervisee_id }
    });
    if (selectedSupervisee.value !== s) return;
    compliancePendingList.value = Array.isArray(response.data?.results) ? response.data.results : [];
    complianceLoaded.value = true;
  } catch (err) {
    if (selectedSupervisee.value !== s) return;
    compliancePendingError.value = err?.response?.data?.error?.message || 'Failed to load compliance list.';
  } finally {
    if (selectedSupervisee.value === s) compliancePendingLoading.value = false;
  }
}

async function fetchAffiliatedPortals() {
  const s = selectedSupervisee.value;
  if (!s?.supervisee_id) {
    affiliatedPortals.value = [];
    return;
  }
  affiliatedPortalsLoading.value = true;
  affiliatedPortalsError.value = '';
  affiliatedPortals.value = [];
  try {
    const response = await api.get(`/users/${s.supervisee_id}/affiliated-portals`);
    if (selectedSupervisee.value !== s) return;
    affiliatedPortals.value = Array.isArray(response.data?.portals) ? response.data.portals : [];
    portalsLoaded.value = true;
  } catch (err) {
    if (selectedSupervisee.value !== s) return;
    affiliatedPortalsError.value = err?.response?.data?.error?.message || 'Failed to load portals.';
    affiliatedPortals.value = [];
  } finally {
    if (selectedSupervisee.value === s) affiliatedPortalsLoading.value = false;
  }
}

function onDocumentUploaded() {
  showUploadDocumentDialog.value = false;
  countsRevision.value++;
  void fetchDocuments();
}
function onTrainingAssigned() {
  showModuleAssignmentDialog.value = false; selectedModuleForAssign.value = '';
  countsRevision.value++;
  void fetchChecklist();
}

async function fetchAssignableModules() {
  try {
    const response = await api.get('/modules');
    assignableModules.value = Array.isArray(response.data) ? response.data : [];
  } catch {
    assignableModules.value = [];
  }
}

function openModuleAssignmentDialog() {
  if (!selectedModuleForAssignObj.value) return;
  showModulePicker.value = false;
  showModuleAssignmentDialog.value = true;
}

watch(showModulePicker, (v) => {
  if (v) fetchAssignableModules();
});

watch(selectedSupervisee, (v) => {
  quickViewClient.value = null; chartClient.value = null;
  documentsLoaded.value = false; portalsLoaded.value = false; complianceLoaded.value = false;
  workCounts.value = {}; documentsTotal.value = null; showManualEntry.value = false; sessionFilter.value = 'all'; historyHasMore.value = false; overallAttendanceSummary.value = null;
  const restoreSection = Number(route.query?.supervisionProvider) === Number(v?.supervisee_id) && Number(route.query?.supervisionAgency) === Number(v?.agency_id) ? String(route.query?.supervisionSection || 'overview') : 'overview';
  activeSection.value = navigationItems.some(item => item.id === restoreSection) ? restoreSection : 'overview';
  visitedSections.value = new Set(['overview', activeSection.value]);
  summary.value = null;
  summaryError.value = '';
  supervisionSessionHours.value = null;
  supervisionSessionCount.value = null;
  compliance24Plus.value = [];
  scheduleLoading.value = false; checklistLoading.value = false; documentsLoading.value = false; clientsLoading.value = false; compliancePendingLoading.value = false; affiliatedPortalsLoading.value = false;
  scheduleSummary.value = null;
  scheduleError.value = '';
  checklistData.value = null;
  checklistError.value = '';
  documentsList.value = [];
  documentsError.value = '';
  clientsList.value = [];
  clientsError.value = '';
  compliancePendingList.value = [];
  compliancePendingError.value = '';
  affiliatedPortals.value = [];
  affiliatedPortalsError.value = '';
  showModulePicker.value = false;
  showModuleAssignmentDialog.value = false;
  showUploadDocumentDialog.value = false;
  selectedModuleForAssign.value = '';
  sessionHistory.value = [];
  sessionHistoryError.value = '';
  if (v) {
    void refreshSupervisionLog();
    fetchScheduleSummary();
    fetchClients();
    void loadSection(activeSection.value);
    persistWorkspace();
  } else {
    summaryLoading.value = false;
    persistWorkspace();
  }
});

watch(() => [route.query?.supervisionProvider, route.query?.supervisionAgency, route.query?.supervisionSection], ([providerId, agencyId, section]) => {
  if (!providerId) return;
  const assignment = supervisees.value.find(row => Number(row.supervisee_id) === Number(providerId) && Number(row.agency_id) === Number(agencyId));
  if (!assignment) return;
  if (superviseeKey(selectedSupervisee.value || {}) !== superviseeKey(assignment)) selectedSupervisee.value = assignment;
  else if (section && section !== activeSection.value && navigationItems.some(item => item.id === section)) {
    activeSection.value = section; visitedSections.value = new Set([...visitedSections.value, section]); void loadSection(section);
  }
});

let stopHoursRefresh;
const refreshVisibleSupervision = ({ includeHistory = false } = {}) => {
  if (workspaceActive && selectedSupervisee.value && document.visibilityState !== 'hidden') void refreshSupervisionLog({ includeHistory });
};
onMounted(() => {
  fetchSupervisees();
  stopHoursRefresh = onSupervisionHoursChanged(event => {
    if (Number(event.detail?.agencyId) === Number(selectedSuperviseeAgencyId.value)) refreshVisibleSupervision({ includeHistory: true });
  });
  window.addEventListener('focus', refreshVisibleSupervision);
});

onUnmounted(() => {
  stopHoursRefresh?.();
  window.removeEventListener('focus', refreshVisibleSupervision);
  if (showAppVideoModal.value && String(appVideoToken.value || '').trim()) {
    resumeInactivityTimeout();
  }
  clearTrackedMeetingPoll();
});
</script>

<style scoped>
.supervision-agenda-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.supervision-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.supervision-modal {
  background: var(--bg, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  width: 90vw;
  max-width: 720px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.supervision-panel {
  width: 100%;
  max-width: none;
  max-height: none;
  min-height: 60vh;
  box-shadow: none;
  border: 1px solid var(--border, #e5e7eb);
}
.supervision-modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border, #e5e7eb);
  flex-shrink: 0;
}
.supervision-modal-back {
  background: none;
  border: none;
  font-size: 0.9rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 0.25rem 0;
}
.supervision-modal-back:hover {
  color: var(--text, #111);
}
.supervision-modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  flex: 1;
}
.supervision-modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  padding: 0.25rem;
}
.supervision-modal-close:hover {
  color: var(--text, #111);
}
.supervision-modal-body {
  padding: 1.25rem;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.supervision-loading,
.supervision-error,
.supervision-empty {
  padding: 1rem 0;
  color: var(--text-secondary, #6b7280);
}
.supervision-error {
  color: var(--danger, #b91c1c);
}
.supervision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}
.form-hint {
  margin: 6px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
}
.supervision-groups {
  display: grid;
  gap: 1rem;
}
.supervision-group {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 0.75rem;
  background: #fff;
}
.supervision-group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.supervision-group-swatch {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--primary, #2563eb);
}
.supervision-group-name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text, #111);
}
.supervision-group-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 999px;
  padding: 2px 7px;
}
.supervision-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: var(--bg-alt, #f9fafb);
  text-align: left;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.supervision-card:hover {
  background: #fff;
  border-color: var(--primary, #2563eb);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.12);
}
.supervision-card-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary, #2563eb) 0%, #1d4ed8 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.1rem;
  flex-shrink: 0;
  overflow: hidden;
}
.supervision-card-avatar.has-photo {
  background: transparent;
}
.supervision-card-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.supervision-card-avatar-initial {
  line-height: 1;
}
.supervision-card-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.supervision-card-name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text, #111);
}
.supervision-card-meta {
  font-size: 0.85rem;
  color: var(--text-secondary, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.caseload-table-wrap {
  width: 100%;
  overflow-x: auto;
}
.caseload-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.caseload-table thead th {
  text-align: left;
  border-bottom: 1px solid var(--border, #e5e7eb);
  padding: 6px 8px;
  white-space: nowrap;
}
.caseload-table tbody td {
  border-bottom: 1px solid var(--border, #f1f5f9);
  padding: 7px 8px;
  vertical-align: middle;
  white-space: nowrap;
}
.caseload-cell-client {
  min-width: 120px;
}
.caseload-sort-btn {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
}
.client-item-missing {
  font-size: 12px;
  color: #b91c1c;
  font-weight: 700;
  margin-top: 2px;
}
.summary-link-button {
  border: none;
  background: none;
  padding: 0;
  color: var(--primary, #2563eb);
  cursor: pointer;
  text-decoration: underline;
}
.summary-link-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.supervision-activity-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.supervision-activity-content {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.activity-item {
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-secondary, #f3f4f6);
  font-size: 13px;
}
.activity-sender {
  font-weight: 600;
  margin-right: 6px;
}
.activity-time {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Supervisee detail hero (photo + name) */
.supervision-hero {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem 1.25rem;
  border-radius: 14px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid var(--border, #e2e8f0);
  margin-bottom: 0.25rem;
}
.supervision-hero-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary, #2563eb) 0%, #1d4ed8 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 2rem;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.25);
}
.supervision-hero-avatar.has-photo {
  background: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}
.supervision-hero-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.supervision-hero-avatar-initial {
  line-height: 1;
}
.supervision-hero-info {
  flex: 1;
  min-width: 0;
}
.supervision-hero-name {
  margin: 0 0 0.35rem 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text, #111);
  letter-spacing: -0.02em;
}
.supervision-hero-meta {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #64748b);
}
.supervision-hero-meta + .supervision-hero-meta {
  margin-top: 0.15rem;
}
.supervision-detail {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.supervision-detail-section h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text, #111);
}
.supervision-placeholder {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #6b7280);
}
.supervision-error-inline {
  color: var(--danger, #b91c1c);
  font-size: 0.9rem;
}
.supervision-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem 1rem;
}
.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.summary-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-secondary, #6b7280);
}
.summary-value {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text, #111);
}
.summary-value.pill-green { color: #166534; }
.summary-value.pill-yellow { color: #92400e; }
.summary-value.pill-red { color: #991b1b; }
.summary-meta {
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
}
.supervision-checklist-readonly .checklist-group {
  margin-bottom: 0.75rem;
}
.supervision-checklist-readonly .checklist-group ul {
  margin: 0.25rem 0 0 1rem;
  padding: 0;
}
.supervision-docs-list {
  margin: 0;
  padding-left: 1.25rem;
}
.supervision-docs-list li {
  margin-bottom: 0.25rem;
}
.supervision-history-list {
  list-style: none;
  padding-left: 0;
}
.supervision-jump-links { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px 0; }
.supervision-detail [id] { scroll-margin-top: 100px; }
.supervision-history-item {
  margin-bottom: 0.55rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}
.supervision-history-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.supervision-history-toggle:hover {
  background: #f8fafc;
}
.supervision-history-main {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.25rem;
}
.supervision-history-detail {
  padding: 0 0.75rem 0.75rem;
  border-top: 1px solid var(--border, #e5e7eb);
}
.supervision-history-notes {
  margin: 0.4rem 0;
  white-space: pre-wrap;
  font-size: 0.9rem;
}
.supervision-history-workspace {
  margin: 0.5rem 0;
  padding: 0.6rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  background: #f8fafc;
}
.supervision-workspace-list {
  margin: 0.25rem 0 0;
  padding-left: 0;
  list-style: none;
  display: grid;
  gap: 4px;
  font-size: 0.9rem;
}
.supervision-workspace-list li {
  display: flex;
  gap: 8px;
}
.supervision-artifact-box {
  margin-top: 0.5rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 0.6rem;
  background: #fafafa;
}
.supervision-artifact-box .form-group {
  margin-bottom: 0.4rem;
}
.supervision-artifact-box .input {
  width: 100%;
}
.supervision-actions-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.supervision-portal-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.supervision-form .form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.supervision-form .form-group {
  margin-bottom: 0.75rem;
}
.supervision-form .form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}
.supervision-form .input {
  width: 100%;
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
}

/* Supervision video modal – larger, with logo and fullscreen */
.supervision-video-overlay .supervision-video-modal {
  width: min(95vw, 1400px);
  max-width: min(95vw, 1400px);
  max-height: 90vh;
}
.supervision-video-overlay .supervision-video-modal.video-modal-fullscreen {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  z-index: 10002;
}
.supervision-video-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.supervision-video-header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.supervision-video-logo {
  flex-shrink: 0;
}
.supervision-video-header-brand h2 {
  flex: 0 1 auto;
}
.supervision-video-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.supervision-video-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.supervision-overview-secondary { margin-top: 1rem; }
.communications-launch { margin: .5rem 0 1rem; }
/* Supervisor workspace: navigation remains within reach while a tab owns its content. */
.supervision-panel { overflow: visible; color: #20344d; background: #f6f8fc; border-color: #d7e0ed; }
.supervision-panel > .supervision-modal-header { background: #fff; flex-wrap: wrap; }
.supervision-modal-back { padding: .55rem .8rem; border: 1px solid #c4d1e1; border-radius: 8px; color: #284667; font-weight: 650; }
.supervision-panel > .supervision-modal-body { overflow: visible; padding: 1.1rem; }
.supervision-hero { padding: 1rem 1.2rem; margin-bottom: 1rem; gap: 1rem; background: #fff; border-color: #d7e0ed; }
.supervision-hero-avatar { width: 66px; height: 66px; }
.supervision-hero-name { font-size: 1.35rem; color: #172c49; }
.supervision-hero-meta { color: #536780; font-size: .86rem; margin-top: .25rem; }
.hero-actions { margin-left: auto; display: flex; flex-wrap: wrap; gap: .5rem; }
.supervision-workspace { display: grid; grid-template-columns: 222px minmax(0, 1fr); gap: 1.1rem; align-items: start; }
.supervision-navigation { position: sticky; top: 1rem; max-height: calc(100vh - 3rem); overflow-y: auto; background: #fff; border: 1px solid #d7e0ed; padding: .6rem; border-radius: 12px; }
.workspace-nav-group + .workspace-nav-group { margin-top: .65rem; padding-top: .65rem; border-top: 1px solid #e3e9f2; }
.workspace-nav-label { display: block; color: #5a6d86; font-size: .68rem; font-weight: 750; text-transform: uppercase; letter-spacing: .09em; padding: .4rem .5rem; }
.workspace-nav-button { width: 100%; border: 0; background: transparent; color: #3e526e; display: flex; align-items: center; gap: .6rem; padding: .7rem .6rem; font: inherit; font-size: .84rem; line-height: 1.3; border-radius: 8px; text-align: left; cursor: pointer; }
.workspace-nav-button > svg { flex-shrink: 0; }
.workspace-nav-button:hover { background: #eef3fb; color: #163d75; }
.workspace-nav-button.active { background: #e7efff; color: #1a4b94; font-weight: 750; box-shadow: inset 3px 0 #3166c7; }
.nav-count { margin-left: auto; background: #e9edf4; color: #3e526e; border-radius: 6px; padding: .12rem .4rem; font-size: .73rem; font-weight: 700; }
.workspace-nav-button.active .nav-count { background: #fff; color: #1a4b94; }
.supervision-content { min-width: 0; background: #fff; border: 1px solid #d7e0ed; border-radius: 12px; padding: 1.25rem; min-height: 600px; }
.workspace-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.1rem; }
.workspace-eyebrow { color: #61728a; font-size: .73rem; }
.workspace-heading h3 { margin: .3rem 0 0; color: #152b48; font-size: 1.4rem; }
.workspace-refresh { display: inline-flex; align-items: center; gap: .4rem; border: 1px solid #c9d4e3; color: #3d536f; background: white; padding: .5rem .7rem; border-radius: 8px; cursor: pointer; }
.overview-facts { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: .7rem; margin-bottom: 1rem; }
.overview-fact { display: flex; flex-direction: column; align-items: flex-start; gap: .5rem; padding: 1rem; border: 1px solid; border-radius: 10px; text-align: left; cursor: pointer; font-family: inherit; }
.overview-fact > span { font-size: .78rem; font-weight: 700; }
.overview-fact > strong { font-size: 2rem; line-height: 1; }
.overview-fact > small { font-size: .71rem; line-height: 1.4; }
.fact-blue { color: #184989; background: #eff5ff; border-color: #ccdcf8; }
.fact-green { color: #17634d; background: #effaf6; border-color: #c9e6d9; }
.fact-red { color: #9b3040; background: #fff2f3; border-color: #f2cfd4; }
.fact-amber { color: #885211; background: #fff8ec; border-color: #efdcb7; }
.upcoming-card { border: 1px solid #c6d7ef; border-left: 4px solid #3166c7; background: #f7faff; border-radius: 10px; padding: 1rem; margin: 1rem 0; }
.upcoming-card-heading { display: flex; gap: .75rem; align-items: center; color: #244e87; }
.upcoming-card-heading h4 { margin: 0; color: #153b6d; font-size: 1.05rem; }
.upcoming-card-heading p { margin: .2rem 0 0; font-size: .78rem; color: #506684; }
.upcoming-card-heading a { margin-left: auto; }
.upcoming-session-row { display: flex; gap: 1rem; align-items: center; justify-content: space-between; border-top: 1px solid #dce6f5; padding-top: .85rem; margin-top: .85rem; }
.upcoming-session-row p { font-size: .8rem; color: #52667f; margin: .3rem 0 0; }
.overview-shortcuts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .75rem; }
.overview-shortcuts button { display: grid; grid-template-columns: 22px 1fr 18px; gap: .4rem .6rem; border: 1px solid #d7e0ed; background: white; color: #29496f; border-radius: 10px; padding: 1rem; text-align: left; cursor: pointer; }
.overview-shortcuts button span { grid-row: 2; grid-column: 2; font-size: .76rem; color: #586d87; }
.overview-shortcuts button svg:last-child { grid-column: 3; grid-row: 1; }
.snapshot-details { border: 1px solid #d7e0ed; border-radius: 10px; padding: .85rem 1rem; margin-top: 1rem; color: #344c6c; }
.snapshot-details > summary { cursor: pointer; font-weight: 650; }
.snapshot-details .supervision-summary-grid { grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); margin-top: .8rem; }
.summary-cell { padding: .7rem; background: #f7f9fc; border-radius: 8px; }
.summary-label { color: #526780; font-size: .7rem; }
.summary-value { color: #253d5b; }
.summary-meta { color: #526780; }
.sessions-workspace { margin-top: 1.5rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
.session-section-heading { display: flex; align-items: center; justify-content: space-between; gap: .7rem; margin-bottom: .7rem; }
.session-section-heading h4 { font-size: 1.1rem; margin: 0; color: #173a68; }
.supervision-detail { gap: 0; }
.supervision-detail-section { margin: 0; color: #263e5c; }
.supervision-detail-section h3 { color: #183957; font-size: 1.05rem; margin-top: .5rem; }
.supervision-detail-section p { color: #516680; font-size: .86rem; line-height: 1.6; }
.supervision-panel :deep(.documentation-panel), .supervision-panel :deep(.supervisee-work-panel) { margin-top: 0; }
.supervision-panel .btn { text-decoration: none; border-radius: 8px; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: .4rem; font-size: .82rem; padding: .5rem .8rem; }
.supervision-panel .btn-primary { background: #285bae; color: #fff; border: 1px solid #285bae; }
.supervision-panel .btn-secondary { background: #fff; color: #304f74; border: 1px solid #c1cfe1; }
.school-portal-grid { display: grid; gap: .8rem; margin-top: 1rem; }
.school-portal-card { display: flex; align-items: center; gap: .9rem; padding: 1rem; border: 1px solid #d5dfed; border-radius: 10px; text-decoration: none; color: #1f3e65; }
.school-portal-card:hover { background: #f2f6fd; border-color: #729bd6; }
.school-portal-card img, .school-icon-fallback { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; background: #eff3fa; padding: 5px; }
.school-icon-fallback { display: grid; place-items: center; }
.school-portal-card div { display: grid; gap: .4rem; flex: 1; }
.school-portal-card div span { color: #566c87; font-size: .8rem; }
.schedule-launch-card { padding: 2.5rem 1rem; text-align: center; max-width: 580px; margin: auto; }
.schedule-launch-card > svg { color: #3267b9; }
.caseload-table { font-size: .82rem; color: #2e4562; }
.caseload-table th { color: #4b617f; background: #f5f8fc; }
.client-quick-button { background: #edf4ff; border: 1px solid #cadaf2; color: #235490; font: inherit; font-weight: 700; padding: .45rem .6rem; border-radius: 6px; cursor: pointer; }
.client-full-link { display: block; margin-top: .45rem; color: #2b5b9c; font-size: .72rem; }
.supervision-client-quick-view { position: fixed; inset: 0 0 0 auto; width: min(440px,100vw); z-index: 10000; padding: 1.5rem; box-sizing: border-box; overflow-y: auto; background: #fff; box-shadow: -10px 0 50px #18385935; border-left: 1px solid #c9d7e9; color: #263e5c; display: flex; flex-direction: column; gap: .8rem; }
.supervision-client-quick-view header { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
.supervision-client-quick-view header span, .supervision-client-quick-view p { font-size: .8rem; color: #58708e; }
.supervision-client-quick-view h3 { margin: .35rem 0; color: #183957; }
.supervision-client-quick-view dl { display: grid; gap: .45rem; }
.supervision-client-quick-view dt { font-size: .75rem; color: #58708e; margin-top: .5rem; }
.supervision-client-quick-view dd { margin: 0; font-size: .92rem; }
.supervision-client-quick-view .btn { text-decoration: none; padding: .7rem; border-radius: 8px; }
.workspace-nav-button:focus-visible, .overview-fact:focus-visible, .client-quick-button:focus-visible, .school-portal-card:focus-visible { outline: 3px solid #6b93cf; outline-offset: 2px; }
@media (max-width: 1050px) {
  .supervision-workspace { grid-template-columns: 190px minmax(0,1fr); gap: .7rem; }
  .supervision-content { padding: 1rem; }
  .overview-facts { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media (max-width: 760px) {
  .supervision-panel > .supervision-modal-body { padding: .6rem; }
  .supervision-workspace { display: block; }
  .supervision-navigation { position: sticky; top: .4rem; z-index: 10; display: flex; gap: .4rem; overflow-x: auto; white-space: nowrap; max-height: none; margin-bottom: .75rem; padding: .5rem; }
  .workspace-nav-group { display: contents; }
  .workspace-nav-label { display: none; }
  .workspace-nav-button { width: auto; flex-shrink: 0; font-size: .8rem; padding: .7rem; }
  .workspace-nav-button.active { box-shadow: inset 0 -3px #3166c7; }
  .supervision-hero { flex-wrap: wrap; padding: .8rem; }
  .supervision-hero-avatar { width: 48px; height: 48px; }
  .supervision-hero-name { font-size: 1.1rem; }
  .hero-actions { margin-left: 0; width: 100%; }
  .supervision-content { padding: .8rem; min-height: 400px; }
  .overview-fact { padding: .75rem; }
  .overview-shortcuts { grid-template-columns: 1fr; }
  .workspace-heading { align-items: flex-start; }
  .workspace-heading h3 { font-size: 1.15rem; }
  .upcoming-session-row, .session-section-heading { align-items: flex-start; flex-direction: column; }
  .upcoming-card-heading { flex-wrap: wrap; }
  .upcoming-card-heading a { margin-left: 0; }
  .supervision-panel > .supervision-modal-header { gap: .5rem; padding: .8rem; }
  .auricwell-supervision-brand { font-size: .72rem; }
}

</style>

<style scoped>
.auricwell-supervision-brand { display:inline-flex; align-items:center; gap:6px; color:#52776c; font-size:12px; font-weight:700; letter-spacing:.06em; }
.auricwell-supervision-brand img { width:22px; height:26px; }

/* Supervisor workspace: navigation remains within reach while a tab owns its content. */
.supervision-panel { color: #20344d; background: #f6f8fc; border-color: #d7e0ed; }
.supervision-panel > .supervision-modal-header { background: #fff; flex-wrap: wrap; }
.supervision-modal-back { padding: .55rem .8rem; border: 1px solid #c4d1e1; border-radius: 8px; color: #284667; font-weight: 650; }
.supervision-panel > .supervision-modal-body { overflow: visible; padding: 1.1rem; }
.supervision-hero { padding: 1rem 1.2rem; margin-bottom: 1rem; gap: 1rem; background: #fff; border-color: #d7e0ed; }
.supervision-hero-avatar { width: 66px; height: 66px; }
.supervision-hero-name { font-size: 1.35rem; color: #172c49; }
.supervision-hero-meta { color: #536780; font-size: .86rem; margin-top: .25rem; }
.hero-actions { margin-left: auto; display: flex; flex-wrap: wrap; gap: .5rem; }
.supervision-workspace { display: grid; grid-template-columns: 222px minmax(0, 1fr); gap: 1.1rem; align-items: start; }
.supervision-navigation { position: sticky; top: 1rem; max-height: calc(100vh - 3rem); overflow-y: auto; background: #fff; border: 1px solid #d7e0ed; padding: .6rem; border-radius: 12px; }
.workspace-nav-group + .workspace-nav-group { margin-top: .65rem; padding-top: .65rem; border-top: 1px solid #e3e9f2; }
.workspace-nav-label { display: block; color: #5a6d86; font-size: .68rem; font-weight: 750; text-transform: uppercase; letter-spacing: .09em; padding: .4rem .5rem; }
.workspace-nav-button { width: 100%; border: 0; background: transparent; color: #3e526e; display: flex; align-items: center; gap: .6rem; padding: .7rem .6rem; font: inherit; font-size: .84rem; line-height: 1.3; border-radius: 8px; text-align: left; cursor: pointer; }
.workspace-nav-button > svg { flex-shrink: 0; }
.workspace-nav-button:hover { background: #eef3fb; color: #163d75; }
.workspace-nav-button.active { background: #e7efff; color: #1a4b94; font-weight: 750; box-shadow: inset 3px 0 #3166c7; }
.nav-count { margin-left: auto; background: #e9edf4; color: #3e526e; border-radius: 6px; padding: .12rem .4rem; font-size: .73rem; font-weight: 700; }
.workspace-nav-button.active .nav-count { background: #fff; color: #1a4b94; }
.supervision-content { min-width: 0; background: #fff; border: 1px solid #d7e0ed; border-radius: 12px; padding: 1.25rem; min-height: 600px; }
.workspace-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.1rem; }
.workspace-eyebrow { color: #61728a; font-size: .73rem; }
.workspace-heading h3 { margin: .3rem 0 0; color: #152b48; font-size: 1.4rem; }
.workspace-refresh { display: inline-flex; align-items: center; gap: .4rem; border: 1px solid #c9d4e3; color: #3d536f; background: white; padding: .5rem .7rem; border-radius: 8px; cursor: pointer; }
.overview-facts { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: .7rem; margin-bottom: 1rem; }
.overview-fact { display: flex; flex-direction: column; align-items: flex-start; gap: .5rem; padding: 1rem; border: 1px solid; border-radius: 10px; text-align: left; cursor: pointer; font-family: inherit; }
.overview-fact > span { font-size: .78rem; font-weight: 700; }
.overview-fact > strong { font-size: 2rem; line-height: 1; }
.overview-fact > small { font-size: .71rem; line-height: 1.4; }
.fact-blue { color: #184989; background: #eff5ff; border-color: #ccdcf8; }
.fact-green { color: #17634d; background: #effaf6; border-color: #c9e6d9; }
.fact-red { color: #9b3040; background: #fff2f3; border-color: #f2cfd4; }
.fact-amber { color: #885211; background: #fff8ec; border-color: #efdcb7; }
.upcoming-card { border: 1px solid #c6d7ef; border-left: 4px solid #3166c7; background: #f7faff; border-radius: 10px; padding: 1rem; margin: 1rem 0; }
.upcoming-card-heading { display: flex; gap: .75rem; align-items: center; color: #244e87; }
.upcoming-card-heading h4 { margin: 0; color: #153b6d; font-size: 1.05rem; }
.upcoming-card-heading p { margin: .2rem 0 0; font-size: .78rem; color: #506684; }
.upcoming-card-heading a { margin-left: auto; }
.upcoming-session-row { display: flex; gap: 1rem; align-items: center; justify-content: space-between; border-top: 1px solid #dce6f5; padding-top: .85rem; margin-top: .85rem; }
.upcoming-session-row p { font-size: .8rem; color: #52667f; margin: .3rem 0 0; }
.overview-shortcuts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .75rem; }
.overview-shortcuts button { display: grid; grid-template-columns: 22px 1fr 18px; gap: .4rem .6rem; border: 1px solid #d7e0ed; background: white; color: #29496f; border-radius: 10px; padding: 1rem; text-align: left; cursor: pointer; }
.overview-shortcuts button span { grid-row: 2; grid-column: 2; font-size: .76rem; color: #586d87; }
.overview-shortcuts button svg:last-child { grid-column: 3; grid-row: 1; }
.snapshot-details { border: 1px solid #d7e0ed; border-radius: 10px; padding: .85rem 1rem; margin-top: 1rem; color: #344c6c; }
.snapshot-details > summary { cursor: pointer; font-weight: 650; }
.snapshot-details .supervision-summary-grid { grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); margin-top: .8rem; }
.summary-cell { padding: .7rem; background: #f7f9fc; border-radius: 8px; }
.summary-label { color: #526780; font-size: .7rem; }
.summary-value { color: #253d5b; }
.summary-meta { color: #526780; }
.sessions-workspace { margin-top: 1.5rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
.session-section-heading { display: flex; align-items: center; justify-content: space-between; gap: .7rem; margin-bottom: .7rem; }
.session-section-heading h4 { font-size: 1.1rem; margin: 0; color: #173a68; }
.supervision-detail { gap: 0; }
.supervision-detail-section { margin: 0; color: #263e5c; }
.supervision-detail-section h3 { color: #183957; font-size: 1.05rem; margin-top: .5rem; }
.supervision-detail-section p { color: #516680; font-size: .86rem; line-height: 1.6; }
.supervision-panel :deep(.documentation-panel), .supervision-panel :deep(.supervisee-work-panel) { margin-top: 0; }
.supervision-panel .btn { text-decoration: none; border-radius: 8px; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: .4rem; font-size: .82rem; padding: .5rem .8rem; }
.supervision-panel .btn-primary { background: #285bae; color: #fff; border: 1px solid #285bae; }
.supervision-panel .btn-secondary { background: #fff; color: #304f74; border: 1px solid #c1cfe1; }
.school-portal-grid { display: grid; gap: .8rem; margin-top: 1rem; }
.school-portal-card { display: flex; align-items: center; gap: .9rem; padding: 1rem; border: 1px solid #d5dfed; border-radius: 10px; text-decoration: none; color: #1f3e65; }
.school-portal-card:hover { background: #f2f6fd; border-color: #729bd6; }
.school-portal-card img, .school-icon-fallback { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; background: #eff3fa; padding: 5px; }
.school-icon-fallback { display: grid; place-items: center; }
.school-portal-card div { display: grid; gap: .4rem; flex: 1; }
.school-portal-card div span { color: #566c87; font-size: .8rem; }
.schedule-launch-card { padding: 2.5rem 1rem; text-align: center; max-width: 580px; margin: auto; }
.schedule-launch-card > svg { color: #3267b9; }
.caseload-table { font-size: .82rem; color: #2e4562; }
.caseload-table th { color: #4b617f; background: #f5f8fc; }
.client-quick-button { background: #edf4ff; border: 1px solid #cadaf2; color: #235490; font: inherit; font-weight: 700; padding: .45rem .6rem; border-radius: 6px; cursor: pointer; }
.client-full-link { display: block; margin-top: .45rem; color: #2b5b9c; font-size: .72rem; }
.supervision-client-quick-view { position: fixed; inset: 0 0 0 auto; width: min(440px,100vw); z-index: 10000; padding: 1.5rem; box-sizing: border-box; overflow-y: auto; background: #fff; box-shadow: -10px 0 50px #18385935; border-left: 1px solid #c9d7e9; color: #263e5c; display: flex; flex-direction: column; gap: .8rem; }
.supervision-client-quick-view header { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
.supervision-client-quick-view header span, .supervision-client-quick-view p { font-size: .8rem; color: #58708e; }
.supervision-client-quick-view h3 { margin: .35rem 0; color: #183957; }
.supervision-client-quick-view dl { display: grid; gap: .45rem; }
.supervision-client-quick-view dt { font-size: .75rem; color: #58708e; margin-top: .5rem; }
.supervision-client-quick-view dd { margin: 0; font-size: .92rem; }
.supervision-client-quick-view .btn { text-decoration: none; padding: .7rem; border-radius: 8px; }
.workspace-nav-button:focus-visible, .overview-fact:focus-visible, .client-quick-button:focus-visible, .school-portal-card:focus-visible { outline: 3px solid #6b93cf; outline-offset: 2px; }
@media (max-width: 1050px) {
  .supervision-workspace { grid-template-columns: 190px minmax(0,1fr); gap: .7rem; }
  .supervision-content { padding: 1rem; }
  .overview-facts { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media (max-width: 760px) {
  .supervision-panel > .supervision-modal-body { padding: .6rem; }
  .supervision-workspace { display: block; }
  .supervision-navigation { position: static; display: flex; gap: .4rem; overflow-x: auto; white-space: nowrap; max-height: none; margin-bottom: .75rem; padding: .5rem; }
  .workspace-nav-group { display: contents; }
  .workspace-nav-label { display: none; }
  .workspace-nav-button { width: auto; flex-shrink: 0; font-size: .8rem; padding: .7rem; }
  .workspace-nav-button.active { box-shadow: inset 0 -3px #3166c7; }
  .supervision-hero { flex-wrap: wrap; padding: .8rem; }
  .supervision-hero-avatar { width: 48px; height: 48px; }
  .supervision-hero-name { font-size: 1.1rem; }
  .hero-actions { margin-left: 0; width: 100%; }
  .supervision-content { padding: .8rem; min-height: 400px; }
  .overview-fact { padding: .75rem; }
  .overview-shortcuts { grid-template-columns: 1fr; }
  .workspace-heading { align-items: flex-start; }
  .workspace-heading h3 { font-size: 1.15rem; }
  .upcoming-session-row, .session-section-heading { align-items: flex-start; flex-direction: column; }
  .upcoming-card-heading { flex-wrap: wrap; }
  .upcoming-card-heading a { margin-left: 0; }
  .supervision-panel > .supervision-modal-header { gap: .5rem; padding: .8rem; }
  .auricwell-supervision-brand { font-size: .72rem; }
}

</style>
