<template>
  <div class="sbep-wrap">
    <div class="sbep-main">
      <div v-if="loading" class="sbep-state muted">Loading event…</div>
      <div v-else-if="error" class="sbep-state error-box">{{ error }}</div>
      <template v-else-if="detail">
        <SkillBuildersEventPortalLayout
          :title="detail.event?.title || 'Skill Builders event'"
          :subtitle="headerSubtitle"
          kicker="Program event · Skill Builders"
        >
          <template #actions>
            <nav v-if="crumbProgramLabel" class="sbep-crumb muted" aria-label="Breadcrumb">
              <router-link v-if="programEventsHref" :to="programEventsHref">{{ crumbProgramLabel }}</router-link>
              <template v-else>{{ crumbProgramLabel }}</template>
              <span class="sbep-crumb-sep" aria-hidden="true">·</span>
              <span>Event</span>
            </nav>
            <router-link v-if="programEventsHref" class="btn btn-secondary btn-sm" :to="programEventsHref">
              All program events
            </router-link>
            <p
              v-else-if="detail.programPortal && !detail.programPortal.slug"
              class="sbep-nav-hint muted"
            >
              Add a portal slug on the program organization to enable the public events list link.
            </p>
            <router-link v-if="dashboardHref" class="btn btn-secondary btn-sm" :to="dashboardHref">My dashboard</router-link>
            <router-link v-if="scheduleHubHref" class="btn btn-secondary btn-sm" :to="scheduleHubHref">
              Schedule hub
            </router-link>
            <router-link
              v-if="skillBuildersEventsOverlayHref"
              class="btn btn-secondary btn-sm"
              :to="skillBuildersEventsOverlayHref"
            >
              Programs &amp; events
            </router-link>
            <button
              v-if="canEditEventInPortal"
              type="button"
              class="btn btn-primary btn-sm"
              @click="editEventModalOpen = true"
            >
              Edit event
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="goBack">Back</button>
          </template>

          <div v-show="dashHubMode && eventRailItems.length" class="sbep-hub">
            <p class="sbep-hub-tagline muted small">Choose a section — pick one to open the sidebar layout.</p>
            <div class="sbep-hub-grid" role="navigation" aria-label="Event sections">
              <button
                v-for="item in eventRailItems"
                :key="item.id"
                type="button"
                class="sbep-hub-card"
                @click="selectRailSection(item.id)"
              >
                <span class="sbep-hub-ico-wrap">
                  <img v-if="item.iconUrl" :src="item.iconUrl" alt="" class="sbep-hub-ico" />
                </span>
                <span class="sbep-hub-card-title">{{ item.label }}</span>
                <span class="sbep-hub-card-hint">Open <span aria-hidden="true">→</span></span>
              </button>
            </div>
          </div>

          <div v-show="!dashHubMode" class="sbep-dash-layout">
            <div class="sbep-rail-column">
              <button type="button" class="sbep-hub-back" @click="openDashHub">
                <span class="sbep-hub-back-arr" aria-hidden="true">←</span>
                All sections
              </button>
              <nav v-if="eventRailItems.length" class="sbep-rail" aria-label="Event sections">
                <button
                  v-for="item in eventRailItems"
                  :key="item.id"
                  type="button"
                  class="sbep-rail-item"
                  :class="{ active: railActive === item.id }"
                  :aria-current="railActive === item.id ? 'true' : undefined"
                  @click="selectRailSection(item.id)"
                >
                  <span class="sbep-rail-ico-wrap">
                    <img v-if="item.iconUrl" :src="item.iconUrl" alt="" class="sbep-rail-ico" />
                  </span>
                  <span class="sbep-rail-lbl">{{ item.shortLabel }}</span>
                </button>
              </nav>
            </div>
            <div class="sbep-rail-content">
              <div class="sbep-portal-grid sbep-dash">
            <SkillBuildersEventDashboardSection
              v-show="railActive === 'home'"
              rail-mode
              section-id="home"
              title="Home"
              :icon-url="sectionIconUrl('home')"
            >
              <p class="muted small sbep-card-lead">
                Overview of this Skill Builders program event. Use the icons on the left to jump to schedule, client
                management, work schedule, and more.
              </p>
              <ul v-if="detail.skillsGroup" class="sbep-list muted small sbep-home-meta">
                <li>
                  <strong>{{ detail.skillsGroup.name }}</strong>
                  · {{ detail.skillsGroup.schoolName }}
                </li>
                <li>Program dates: {{ formatDateOnly(detail.skillsGroup.startDate) }} – {{ formatDateOnly(detail.skillsGroup.endDate) }}</li>
              </ul>
              <p class="muted small">{{ headerSubtitle }}</p>
              <div v-if="programEventsHref || dashboardHref" class="sbep-inline-actions sbep-home-links">
                <router-link v-if="programEventsHref" class="btn btn-secondary btn-sm" :to="programEventsHref">
                  All program events
                </router-link>
                <router-link v-if="dashboardHref" class="btn btn-secondary btn-sm" :to="dashboardHref">My dashboard</router-link>
              </div>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-show="railActive === 'schedule'"
              rail-mode
              section-id="schedule"
              title="Schedule"
              :icon-url="sectionIconUrl('schedule')"
            >
              <div v-if="detail.calendar && (detail.calendar.googleCalendarUrl || detail.calendar.icsUrl)" class="sbep-sched-block">
                <p class="sbep-subh">Add to calendar</p>
                <p v-if="detail.calendar.note" class="muted small sbep-card-lead">{{ detail.calendar.note }}</p>
                <div class="sbep-calendar-actions">
                  <a
                    v-if="detail.calendar.googleCalendarUrl"
                    class="btn btn-primary btn-sm"
                    :href="detail.calendar.googleCalendarUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Calendar
                  </a>
                  <a v-if="detail.calendar.icsUrl" class="btn btn-secondary btn-sm" :href="detail.calendar.icsUrl">
                    Download ICS
                  </a>
                  <button
                    v-if="detail.calendar.googleCalendarUrl"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="copyGoogleCalendarLink"
                  >
                    Copy Google link
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="copyShareBlurb">Copy share text</button>
                </div>
                <p v-if="copyHint" class="muted small sbep-copy-hint">{{ copyHint }}</p>
              </div>

              <div v-if="detail.skillsGroup" class="sbep-sched-block">
                <p class="sbep-subh">Program window &amp; times</p>
                <p class="muted small sbep-card-lead">
                  Program window: {{ formatDateOnly(detail.skillsGroup?.startDate) }} – {{ formatDateOnly(detail.skillsGroup?.endDate) }} ·
                  {{ detail.skillsGroup?.schoolName }} — {{ detail.skillsGroup?.name }}
                </p>
                <p v-if="detail.event?.clientCheckInDisplayTime || detail.event?.clientCheckOutDisplayTime" class="muted small">
                  <strong>Family-facing times:</strong>
                  check-in {{ formatDisplayTime(detail.event?.clientCheckInDisplayTime) }} · check-out
                  {{ formatDisplayTime(detail.event?.clientCheckOutDisplayTime) }}
                </p>
                <p v-if="detail.event?.employeeReportTime || detail.event?.employeeDepartureTime" class="muted small">
                  <strong>Staff planned window:</strong>
                  {{ formatDisplayTime(detail.event?.employeeReportTime) }} –
                  {{ formatDisplayTime(detail.event?.employeeDepartureTime) }}
                </p>
                <p v-if="detail.meetings?.length" class="muted small sbep-card-lead">Weekly pattern</p>
                <ul v-if="detail.meetings?.length" class="sbep-list">
                  <li v-for="(m, i) in detail.meetings" :key="i">
                    {{ m.weekday }} · {{ wallHmToDisplay(formatHm(m.startTime)) }}–{{ wallHmToDisplay(formatHm(m.endTime)) }}
                  </li>
                </ul>
              </div>

              <div v-if="detail.skillsGroup" class="sbep-sched-block">
                <p class="sbep-subh">Dates &amp; locations</p>
                <p class="muted small sbep-card-lead">
                  Each scheduled occurrence; coordinators can set location and modality in the admin session tools (API).
                </p>
                <div v-if="sessionsLoading" class="muted">Loading sessions…</div>
                <div v-else-if="sessions.length" class="sbep-sessions-table-wrap">
                  <table class="sbep-sessions-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Location</th>
                        <th>Modality</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="s in sessionsTableRows" :key="`d-${s.id}`">
                        <td>{{ formatSessionDateDisplay(s.sessionDate) }}</td>
                        <td>{{ wallHmToDisplay(formatHm(s.startTime)) }}–{{ wallHmToDisplay(formatHm(s.endTime)) }}</td>
                        <td>{{ s.locationLabel || s.locationAddress || '—' }}</td>
                        <td>{{ s.modality || '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="muted">No materialized sessions in range.</p>
              </div>

              <div v-if="detail.skillsGroup && agencyId && eventId" class="sbep-sched-block">
                <p class="sbep-subh">Session curriculum (PDFs)</p>
                <p class="muted small sbep-card-lead">
                  Program library PDFs attach per session — same tools as <strong>Materials</strong>. Open Materials to
                  upload to the shared program library, attach from the library, or upload directly to a session row.
                </p>
                <button type="button" class="btn btn-primary btn-sm" @click="selectRailSection('materials')">
                  Open Materials &amp; PDFs
                </button>
              </div>

              <div
                v-if="detail.skillsGroup && sessions.length && detail.event?.virtualSessionsEnabled !== false"
                class="sbep-sched-block"
              >
                <p class="sbep-subh">Join links (virtual / hybrid)</p>
                <p class="muted small sbep-card-lead">Join opens 10 minutes before start and stays available through the scheduled end.</p>
                <ul class="sbep-join-list">
                  <li v-for="s in sessions" :key="`vj-${s.id}`" class="sbep-join-li">
                    <span>{{ formatSessionDateDisplay(s.sessionDate) }} · {{ wallHmToDisplay(formatHm(s.startTime)) }}–{{ wallHmToDisplay(formatHm(s.endTime)) }}</span>
                    <a
                      v-if="sessionJoinVisible(s)"
                      class="btn btn-primary btn-sm"
                      :href="s.joinUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Join
                    </a>
                    <span v-else-if="s.joinUrl && (s.modality === 'virtual' || s.modality === 'hybrid')" class="muted small">Not yet open</span>
                    <span v-else class="muted small">—</span>
                  </li>
                </ul>
              </div>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="(detail.providers || []).length"
              v-show="railActive === 'providers'"
              rail-mode
              section-id="providers"
              title="Providers"
              :icon-url="sectionIconUrl('providers')"
              :badge="`${detail.providers?.length || 0} on roster`"
            >
              <p class="muted small sbep-card-lead">
                Assigned providers — profile and photo from your agency directory (same kind of info as the school portal;
                no scheduling details here).
              </p>
              <SkillBuildersEventProvidersGrid :providers="detail.providers || []" />
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="(detail.clients || []).length"
              v-show="railActive === 'clients'"
              rail-mode
              section-id="clients"
              title="Client Management"
              :icon-url="sectionIconUrl('clients')"
              :badge="`${detail.clients?.length || 0}`"
            >
              <p class="muted small sbep-card-lead">
                Clients on this program roster — mark attendance here. H2014 session notes and copy-aid notes live under
                <strong>Clinical Aid</strong> (same list style as the program hub Notes tab).
              </p>

              <div v-if="canEditClientAttendance && sessions.length" class="sbep-client-mgmt-session-bar">
                <label class="sbep-label">Session</label>
                <select v-model.number="clientAttSessionId" class="input sbep-kiosk-field">
                  <option v-for="s in sessions" :key="`ca-s-${s.id}`" :value="s.id">
                    {{ formatSessionKioskLabel(s) }}
                  </option>
                </select>
              </div>

              <div v-if="canEditClientAttendance && sessions.length" class="sbep-client-mgmt-attendance-only">
                <p class="sbep-subh">Attendance</p>
                <div class="sbep-client-att-picker">
                  <div class="sbep-client-att-picker-head">
                    <span class="sbep-label sbep-label-inline">Clients</span>
                    <div class="sbep-client-att-picker-actions">
                      <button type="button" class="btn btn-link btn-sm" @click="selectAllClientsForAttendance">
                        Select all
                      </button>
                      <button type="button" class="btn btn-link btn-sm" @click="clearClientsForAttendance">Clear</button>
                    </div>
                  </div>
                  <div class="sbep-client-att-checkboxes" role="group" aria-label="Clients to mark attended">
                    <label v-for="c in detail.clients || []" :key="`ca-c-${c.id}`" class="sbep-client-att-row">
                      <input v-model="clientAttSelectedClientIds" type="checkbox" :value="Number(c.id)" />
                      <span>{{ clientLabelForRow(c) }}</span>
                    </label>
                  </div>
                  <p v-if="!(detail.clients || []).length" class="muted small">No clients on this roster.</p>
                </div>
                <p class="muted small sbep-manual-att-times-note">
                  Time in / time out use the <strong>session date</strong> from above; defaults match this session’s start
                  and end times.
                </p>
                <label class="sbep-label">Time in</label>
                <input v-model="clientAttTimeIn" type="time" class="input sbep-kiosk-field" />
                <label class="sbep-label">Time out</label>
                <input v-model="clientAttTimeOut" type="time" class="input sbep-kiosk-field" />
                <label class="sbep-label">Signature / attestation (optional)</label>
                <input v-model="clientAttSig" class="input sbep-kiosk-field" maxlength="512" placeholder="Typed name or short note" />
                <div class="sbep-inline-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="clientAttSaving || !clientAttSessionId || !clientAttSelectedClientIds.length"
                    @click="saveClientAttendance"
                  >
                    {{
                      clientAttSaving
                        ? 'Saving…'
                        : `Save attendance${clientAttSelectedCount ? ` (${clientAttSelectedCount})` : ''}`
                    }}
                  </button>
                </div>
              </div>
              <p v-else-if="canEditClientAttendance && !sessions.length" class="muted small">
                Session dates are still loading or none were generated for this program window.
              </p>

              <div v-if="(detail.clients || []).length" class="sbep-roster-summary-block">
                <p class="sbep-subh sbep-roster-summary-heading">Roster &amp; attendance</p>
                <div class="sbep-roster-table-wrap">
                  <table class="sbep-roster-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Docs</th>
                        <th>Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="c in detail.clients || []" :key="`rs-${c.id}`">
                        <td>
                          <router-link
                            v-if="rosterClientLinkTo(c)"
                            :to="rosterClientLinkTo(c)"
                            class="sbep-roster-client-link"
                          >
                            {{ clientLabelForRow(c) }}
                          </router-link>
                          <template v-else>{{ clientLabelForRow(c) }}</template>
                        </td>
                        <td class="sbep-roster-docs">
                          {{ c.paperworkStatusLabel || c.documentStatus || '—' }}
                        </td>
                        <td class="sbep-roster-att muted small">
                          <template v-if="attendanceRowsForClient(c.id).length">
                            <div v-for="row in attendanceRowsForClient(c.id)" :key="`att-${row.sessionId}-${row.clientId}`">
                              {{ formatSessionDateDisplay(row.sessionDate) }}
                              <span v-if="row.checkInAt"> · In {{ formatPostTime(row.checkInAt) }}</span>
                              <span v-if="row.checkOutAt"> · Out {{ formatPostTime(row.checkOutAt) }}</span>
                              <span v-if="row.signatureText"> · Signature on file</span>
                            </div>
                          </template>
                          <span v-else class="sbep-roster-missing">—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-show="railActive === 'materials'"
              rail-mode
              section-id="materials"
              title="Materials"
              :icon-url="sectionIconUrl('materials')"
            >
              <SkillBuildersSessionCurriculumMaterials
                v-if="agencyId && eventId"
                :agency-id="agencyId"
                :event-id="eventId"
                :sessions="sessions"
                :sessions-loading="sessionsLoading"
                :format-session-label="formatSessionKioskLabel"
                :viewer-caps="viewerCaps"
                :program-documents-library-route="programDocumentsLibraryRoute"
                @refresh-sessions="loadSessions"
              />
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.skillsGroup && clinicalNotesEnabled"
              v-show="railActive === 'clinical_notes'"
              rail-mode
              section-id="clinical_notes"
              title="Clinical Aid"
              :icon-url="sectionIconUrl('clinical_notes')"
            >
              <p class="muted small sbep-card-lead">
                H2014 copy-aid notes for this event (encrypted; expire after 14 days — warning in the last 2 days). Matches the
                program hub <strong>Notes</strong> tab.
              </p>
              <SkillBuildersClinicalNotesHubPanel
                v-if="agencyId && eventId"
                :agency-id="agencyId"
                :event-id="eventId"
                :event-title="clinicalNotesContextEventTitle"
                :sessions="sessions"
                :clients="detail?.clients || []"
                :viewer-caps="viewerCaps"
                :format-session-label="formatSessionKioskLabel"
                :client-label-for-row="clientLabelForRow"
                @refresh-sessions="loadSessions"
              />
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.event?.registrationEligible"
              v-show="railActive === 'registrations'"
              rail-mode
              section-id="registrations"
              title="Registrations"
              :icon-url="sectionIconUrl('registrations')"
              badge="Open"
            >
              <p class="muted small sbep-card-lead">
                This program is included in the <strong>guardian registration catalog</strong> when the window is open.
                Families enroll eligible dependents from the guardian portal.
              </p>
              <p v-if="registrationPayerLines.length" class="muted small">
                <strong>Payer options:</strong> {{ registrationPayerLines.join(' · ') }}
              </p>
              <p v-else class="muted small">Set Medicaid / cash eligibility under <strong>Edit event</strong> (registration catalog).</p>
              <p v-if="guardianRegistrationHref" class="muted small">
                <router-link :to="guardianRegistrationHref">Open guardian portal</router-link>
                <span> — Registration section</span>
              </p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.skillsGroup"
              v-show="railActive === 'work-schedule'"
              rail-mode
              section-id="work-schedule"
              title="Event Assignments"
              :icon-url="sectionIconUrl('work-schedule')"
            >
              <p class="muted small sbep-card-lead">
                One row per program day that matches your week pattern. Assign expected staff per session; kiosk clock
                in/out times for this event appear in the <strong>Kiosk time</strong> column when a session was
                selected on the punch. Past dates are collapsed — expand to see full history.
              </p>
              <div
                v-if="viewerCaps.canManageTeamSchedules || viewerCaps.isAssignedProvider"
                class="sbep-inline-actions sbep-assign-export"
              >
                <button type="button" class="btn btn-secondary btn-sm" @click="exportEventClockCsv">
                  Export clock in/out (CSV)
                </button>
              </div>
              <p v-if="sessionStaffFlash" class="sbep-flash-ok" role="status">{{ sessionStaffFlash }}</p>
              <div v-if="sessionsLoading" class="muted">Loading sessions…</div>
              <p v-else-if="sessionsLoadError" class="error-box sbep-sessions-err">{{ sessionsLoadError }}</p>
              <p v-else-if="!sessions.length && sessionsLoadAttempted" class="muted">
                No sessions in the program window for this date range. If you just set the week pattern, use
                <strong>Save week pattern</strong> once so scheduled days are generated. Past program dates should still
                appear here. If this stays empty after saving, contact your agency administrator — they may need to enable
                Skill Builders session scheduling for this environment.
              </p>
              <template v-else-if="sessions.length">
                <div v-if="eventAssignmentsUpcoming.length" class="sbep-sessions-table-wrap">
                  <p class="sbep-subh">Upcoming &amp; today</p>
                  <table class="sbep-sessions-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Scheduled time</th>
                        <th>Staff assignment</th>
                        <th>Kiosk time</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="s in eventAssignmentsUpcoming" :key="`up-${s.id}`">
                        <td class="sbep-sessions-date">{{ formatSessionDateDisplay(s.sessionDate) }}</td>
                        <td>{{ s.weekday }}</td>
                        <td class="sbep-sessions-time">
                          {{ wallHmToDisplay(formatHm(s.startTime)) }}–{{ wallHmToDisplay(formatHm(s.endTime)) }}
                        </td>
                        <td class="sbep-sessions-staff-cell">
                          <template v-if="viewerCaps.canManageTeamSchedules && rosterProviderOptions.length">
                            <div class="sbep-staff-compact">
                              <div class="sbep-staff-chips">
                                <span
                                  v-for="pid in sessionStaffDraft[s.id] || []"
                                  :key="`${s.id}-${pid}`"
                                  class="sbep-staff-chip"
                                >
                                  {{ providerNameById(pid) }}
                                  <button
                                    type="button"
                                    class="sbep-staff-chip-remove"
                                    :disabled="sessionStaffSavingId === s.id"
                                    title="Remove from this session"
                                    @click="removeSessionStaff(s.id, pid)"
                                  >
                                    ×
                                  </button>
                                </span>
                              </div>
                              <div class="sbep-staff-add-row">
                                <select
                                  class="input sbep-staff-add-select"
                                  :disabled="sessionStaffSavingId === s.id"
                                  aria-label="Add staff to this session"
                                  @change="addSessionStaffFromSelect(s.id, $event)"
                                >
                                  <option value="">Add staff…</option>
                                  <option
                                    v-for="p in rosterProviderOptions"
                                    :key="`add-${s.id}-${p.id}`"
                                    :value="p.id"
                                    :disabled="(sessionStaffDraft[s.id] || []).includes(p.id)"
                                  >
                                    {{ p.firstName }} {{ p.lastName }}
                                  </option>
                                </select>
                                <button
                                  type="button"
                                  class="btn btn-primary btn-sm sbep-session-staff-save"
                                  :disabled="sessionStaffSavingId === s.id"
                                  @click="saveSessionStaff(s.id)"
                                >
                                  {{ sessionStaffSavingId === s.id ? 'Saving…' : 'Save' }}
                                </button>
                              </div>
                            </div>
                          </template>
                          <span v-else class="sbep-sessions-staff-read">{{ formatSessionAssignedStaff(s) }}</span>
                        </td>
                        <td class="sbep-kiosk-cell">
                          <ul v-if="sessionKioskPunchLines(s.id).length" class="sbep-kiosk-cell-list">
                            <li v-for="(ln, idx) in sessionKioskPunchLines(s.id)" :key="`k-${s.id}-${idx}`">
                              <span class="sbep-kiosk-name">{{ ln.name }}</span>
                              <span v-if="ln.inAt" class="muted small">In {{ ln.inAt }}</span>
                              <span v-if="ln.outAt" class="muted small"> · Out {{ ln.outAt }}</span>
                              <span v-if="ln.payrollId" class="muted small"> · Payroll #{{ ln.payrollId }}</span>
                            </li>
                          </ul>
                          <span v-else class="muted small">—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="muted small">No upcoming sessions in the loaded range.</p>

                <details v-if="eventAssignmentsPast.length" class="sbep-assign-past">
                  <summary class="sbep-assign-past-summary">
                    Past sessions ({{ eventAssignmentsPast.length }}) — tap to expand
                  </summary>
                  <div class="sbep-sessions-table-wrap sbep-assign-past-table">
                    <table class="sbep-sessions-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Day</th>
                          <th>Scheduled time</th>
                          <th>Staff assignment</th>
                          <th>Kiosk time</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="s in eventAssignmentsPast" :key="`past-${s.id}`">
                          <td class="sbep-sessions-date">{{ formatSessionDateDisplay(s.sessionDate) }}</td>
                          <td>{{ s.weekday }}</td>
                          <td class="sbep-sessions-time">
                            {{ wallHmToDisplay(formatHm(s.startTime)) }}–{{ wallHmToDisplay(formatHm(s.endTime)) }}
                          </td>
                          <td class="sbep-sessions-staff-cell">
                            <template v-if="viewerCaps.canManageTeamSchedules && rosterProviderOptions.length">
                              <div class="sbep-staff-compact">
                                <div class="sbep-staff-chips">
                                  <span
                                    v-for="pid in sessionStaffDraft[s.id] || []"
                                    :key="`p-${s.id}-${pid}`"
                                    class="sbep-staff-chip"
                                  >
                                    {{ providerNameById(pid) }}
                                    <button
                                      type="button"
                                      class="sbep-staff-chip-remove"
                                      :disabled="sessionStaffSavingId === s.id"
                                      title="Remove from this session"
                                      @click="removeSessionStaff(s.id, pid)"
                                    >
                                      ×
                                    </button>
                                  </span>
                                </div>
                                <div class="sbep-staff-add-row">
                                  <select
                                    class="input sbep-staff-add-select"
                                    :disabled="sessionStaffSavingId === s.id"
                                    aria-label="Add staff to this session"
                                    @change="addSessionStaffFromSelect(s.id, $event)"
                                  >
                                    <option value="">Add staff…</option>
                                    <option
                                      v-for="p in rosterProviderOptions"
                                      :key="`ap-${s.id}-${p.id}`"
                                      :value="p.id"
                                      :disabled="(sessionStaffDraft[s.id] || []).includes(p.id)"
                                    >
                                      {{ p.firstName }} {{ p.lastName }}
                                    </option>
                                  </select>
                                  <button
                                    type="button"
                                    class="btn btn-primary btn-sm sbep-session-staff-save"
                                    :disabled="sessionStaffSavingId === s.id"
                                    @click="saveSessionStaff(s.id)"
                                  >
                                    {{ sessionStaffSavingId === s.id ? 'Saving…' : 'Save' }}
                                  </button>
                                </div>
                              </div>
                            </template>
                            <span v-else class="sbep-sessions-staff-read">{{ formatSessionAssignedStaff(s) }}</span>
                          </td>
                          <td class="sbep-kiosk-cell">
                            <ul v-if="sessionKioskPunchLines(s.id).length" class="sbep-kiosk-cell-list">
                              <li v-for="(ln, idx) in sessionKioskPunchLines(s.id)" :key="`pk-${s.id}-${idx}`">
                                <span class="sbep-kiosk-name">{{ ln.name }}</span>
                                <span v-if="ln.inAt" class="muted small">In {{ ln.inAt }}</span>
                                <span v-if="ln.outAt" class="muted small"> · Out {{ ln.outAt }}</span>
                                <span v-if="ln.payrollId" class="muted small"> · Payroll #{{ ln.payrollId }}</span>
                              </li>
                            </ul>
                            <span v-else class="muted small">—</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>

                <div v-if="orphanKioskPunchLines.length" class="sbep-orphan-punches">
                  <p class="sbep-subh">Kiosk punches without a session</p>
                  <p class="muted small">Clock in/out did not use a scheduled session row (general punch).</p>
                  <ul class="sbep-kiosk-cell-list">
                    <li v-for="(ln, idx) in orphanKioskPunchLines" :key="`orph-${idx}`">
                      <span class="sbep-kiosk-name">{{ ln.name }}</span>
                      <span v-if="ln.inAt" class="muted small">In {{ ln.inAt }}</span>
                      <span v-if="ln.outAt" class="muted small"> · Out {{ ln.outAt }}</span>
                      <span v-if="ln.payrollId" class="muted small"> · Payroll #{{ ln.payrollId }}</span>
                    </li>
                  </ul>
                </div>
              </template>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="viewerCaps.isAssignedProvider && agencyId"
              v-show="railActive === 'my-work'"
              rail-mode
              section-id="my-work"
              title="My work schedule"
              :icon-url="sectionIconUrl('my-work')"
            >
              <p class="muted small sbep-card-lead">Your Skill Builder availability, group meetings, and assigned program events.</p>
              <SkillBuildersWorkSchedulePanel
                :agency-id="agencyId"
                :highlight-event-id="eventId"
                :program-session-summaries="sessionsForWorkSchedulePanel"
                mode="provider"
              />
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="viewerCaps.isAssignedProvider || viewerCaps.canManageTeamSchedules"
              v-show="railActive === 'attendance'"
              rail-mode
              section-id="attendance"
              title="Provider attendance"
              :icon-url="sectionIconUrl('attendance')"
            >
              <p v-if="viewerCaps.isAssignedProvider" class="muted small sbep-card-lead">Your kiosk punches for this event.</p>
              <p v-else class="muted small sbep-card-lead">Provider punches recorded for this event.</p>
              <ul v-if="providerAttendance.length" class="sbep-att-list">
                <li v-for="(p, idx) in providerAttendance" :key="`pa-${idx}`">
                  {{ p.punchType }} · {{ formatPostTime(p.punchedAt) }}
                  <span v-if="p.sessionId" class="muted"> · session #{{ p.sessionId }}</span>
                </li>
              </ul>
              <p v-else class="muted">No punches recorded yet.</p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.showKioskClockActions"
              v-show="railActive === 'kiosk'"
              rail-mode
              section-id="kiosk"
              title="Kiosk / time"
              :icon-url="sectionIconUrl('kiosk')"
            >
              <p class="muted sbep-card-lead">
                Direct hours: <strong>{{ detail.event?.skillBuilderDirectHours ?? '—' }}</strong>
              </p>
              <template v-if="sessions.length">
                <label class="sbep-label">Scheduled session</label>
                <select v-model.number="kioskSessionId" class="input sbep-kiosk-field">
                  <option :value="0">General (not tied to a generated session)</option>
                  <option v-for="s in kioskSessionChoices" :key="s.id" :value="s.id">
                    {{ formatSessionKioskLabel(s) }}
                  </option>
                </select>
              </template>
              <label class="sbep-label">Client on this punch (optional)</label>
              <select v-model.number="kioskClientId" class="input sbep-kiosk-field">
                <option :value="0">—</option>
                <option v-for="c in detail.clients || []" :key="c.id" :value="c.id">
                  {{ c.initials || c.identifierCode || `Client #${c.id}` }}
                </option>
              </select>
              <div class="sbep-inline-actions sbep-kiosk-actions">
                <button type="button" class="btn btn-primary btn-sm" :disabled="clockBusy" @click="clockIn">
                  Clock in
                </button>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="clockBusy" @click="clockOut">
                  Clock out
                </button>
              </div>
              <p v-if="clockMessage" class="muted sbep-clock-msg">{{ clockMessage }}</p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.event?.learningProgramClassId"
              v-show="railActive === 'learning'"
              rail-mode
              section-id="learning"
              title="Learning"
              :icon-url="sectionIconUrl('learning')"
              class="muted"
            >
              Linked learning class ID {{ detail.event.learningProgramClassId }} — open class features from Learning when wired in the admin UI.
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-show="railActive === 'event-chat'"
              rail-mode
              section-id="event-chat"
              title="Event chat"
              :icon-url="sectionIconUrl('event-chat')"
            >
              <p class="muted small sbep-card-lead">Linked to your agency chat. Everyone with event access can post here.</p>
              <div v-if="chatLoading" class="muted">Loading chat…</div>
              <div v-else-if="chatError" class="error-box">{{ chatError }}</div>
              <template v-else>
                <ul class="sbep-chat-msgs">
                  <li v-for="m in chatMessages" :key="m.id" class="sbep-chat-li">
                    <div class="sbep-chat-meta">
                      {{ m.sender_first_name }} {{ m.sender_last_name }} · {{ formatPostTime(m.created_at) }}
                    </div>
                    <div class="sbep-chat-body">{{ m.body }}</div>
                  </li>
                </ul>
                <textarea v-model="chatDraft" class="input" rows="3" placeholder="Message the event group…" />
                <button
                  type="button"
                  class="btn btn-primary btn-sm sbep-chat-send"
                  :disabled="!chatDraft.trim() || chatSending"
                  @click="sendChat"
                >
                  {{ chatSending ? 'Sending…' : 'Send' }}
                </button>
              </template>
            </SkillBuildersEventDashboardSection>
              </div>
            </div>
          </div>
        </SkillBuildersEventPortalLayout>
        <SkillBuildersEventEditModal
          v-if="agencyId && eventId"
          v-model="editEventModalOpen"
          :agency-id="agencyId"
          :event-id="eventId"
          :portal-slug="String(route.params.organizationSlug || '')"
          :can-edit-program-week-pattern="viewerCaps.canManageTeamSchedules"
          @saved="loadDetail"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive, nextTick } from 'vue';
import { useRoute, useRouter, isNavigationFailure } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import SkillBuildersEventPortalLayout from '../../components/skillBuilders/SkillBuildersEventPortalLayout.vue';
import SkillBuildersEventDashboardSection from '../../components/skillBuilders/SkillBuildersEventDashboardSection.vue';
import SkillBuildersWorkSchedulePanel from '../../components/availability/SkillBuildersWorkSchedulePanel.vue';
import SkillBuildersSessionCurriculumMaterials from '../../components/skillBuilders/SkillBuildersSessionCurriculumMaterials.vue';
import SkillBuildersEventEditModal from '../../components/skillBuilders/SkillBuildersEventEditModal.vue';
import SkillBuildersEventProvidersGrid from '../../components/skillBuilders/SkillBuildersEventProvidersGrid.vue';
import SkillBuildersClinicalNotesHubPanel from '../../components/skillBuilders/SkillBuildersClinicalNotesHubPanel.vue';
import { useBrandingStore } from '../../store/branding';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const loading = ref(false);
const error = ref('');
const detail = ref(null);
const editEventModalOpen = ref(false);
const sessions = ref([]);
const sessionsLoading = ref(false);
const sessionsLoadAttempted = ref(false);
const sessionsLoadError = ref('');
const kioskSessionId = ref(0);
const kioskClientId = ref(0);

/** @type {Record<number, number[]>} */
const sessionStaffDraft = reactive({});
const sessionStaffSavingId = ref(null);
const sessionStaffFlash = ref('');
let sessionStaffFlashTimer = null;

const eventId = computed(() => Number(route.params.eventId));
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());

const programEventsHref = computed(() => {
  const ag = detail.value?.agencyPortalSlug;
  const ps = detail.value?.programPortal?.slug;
  if (!ag || !ps) return null;
  return `/${ag}/programs/${ps}/events`;
});

const dashboardHref = computed(() => {
  const s = organizationSlug.value;
  if (!s) return null;
  return `/${s}/dashboard`;
});

/** Link to guardian home (registration catalog lives there). */
const guardianRegistrationHref = computed(() => {
  const s = organizationSlug.value;
  if (!s) return null;
  return `/${s}/guardian`;
});

const registrationPayerLines = computed(() => {
  const e = detail.value?.event;
  if (!e?.registrationEligible) return [];
  const parts = [];
  if (e.medicaidEligible) parts.push('Medicaid');
  if (e.cashEligible) parts.push('Cash / self-pay');
  return parts;
});

const crumbProgramLabel = computed(() => detail.value?.programPortal?.name || '');

const clinicalNotesEnabled = computed(() => {
  const raw = agencyStore.currentAgency?.feature_flags;
  let flags = {};
  if (raw && typeof raw === 'object') flags = raw;
  else if (typeof raw === 'string') {
    try {
      flags = JSON.parse(raw) || {};
    } catch {
      flags = {};
    }
  }
  return !!(flags.noteAidEnabled || flags.clinicalNoteGeneratorEnabled);
});

/** Shown in Clinical Aid hub + H2014 curriculum context (event title or skills group name). */
const clinicalNotesContextEventTitle = computed(() => {
  const d = detail.value;
  return String(d?.event?.title || d?.skillsGroup?.name || '').trim();
});

const viewerCaps = computed(() => {
  const v = detail.value?.viewerCapabilities;
  if (v && typeof v === 'object') {
    return {
      isAssignedProvider: !!v.isAssignedProvider,
      canManageTeamSchedules: !!v.canManageTeamSchedules,
      canManageCompanyEvent: !!v.canManageCompanyEvent,
      canPostEventDiscussion: v.canPostEventDiscussion !== false
    };
  }
  return {
    isAssignedProvider: !!detail.value?.showKioskClockActions,
    canManageTeamSchedules: !!detail.value?.canManageCompanyEvent,
    canManageCompanyEvent: !!detail.value?.canManageCompanyEvent,
    canPostEventDiscussion: true
  };
});

/** Opens coordinator Skill Builders hub → Program documents (library upload + attach by date/session). */
const programDocumentsLibraryRoute = computed(() => {
  const s = organizationSlug.value;
  const oid = detail.value?.programPortal?.organizationId;
  if (!s || !Number.isFinite(Number(oid)) || Number(oid) <= 0) return null;
  if (!viewerCaps.value.canManageCompanyEvent && !viewerCaps.value.canManageTeamSchedules) return null;
  const name = String(detail.value?.programPortal?.name || '').trim();
  return {
    path: `/${s}/dashboard`,
    query: {
      programHub: '1',
      programHubOrgId: String(oid),
      programHubSection: 'documents',
      ...(name ? { programHubOrgName: name } : {})
    }
  };
});

/** Raw `section` from Vue Router only (no URL-bar fallback). */
function sectionParamFromRoute() {
  const raw = route.query.section;
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

/** Parse `section` from the real location bar (handles router/query desync). */
function sectionParamFromUrl() {
  if (typeof window === 'undefined') return '';
  try {
    return String(new URLSearchParams(window.location.search).get('section') || '').trim();
  } catch {
    return '';
  }
}

/**
 * Same-path `?section=` updates don't always re-run computeds in the same tick as `route.query`
 * (and `window.location` is not reactive). Set this on click so hub/rail/panels update immediately.
 */
const optimisticSection = ref('');

watch(
  () => String(route.query.section || '').trim(),
  (sec) => {
    if (sec === 'clinical_notes') optimisticSection.value = 'clinical_notes';
  },
  { immediate: true }
);

/** Prefer router query; if missing, use `?section=` from `location` so hub vs rail matches the visible URL. */
const sectionQuery = computed(() => {
  const o = optimisticSection.value;
  const fromRoute = sectionParamFromRoute();
  if (o) {
    if (fromRoute === o) return fromRoute;
    return o;
  }
  if (fromRoute) return fromRoute;
  return sectionParamFromUrl();
});

/** No `?section=`, or `?section=home` → centered hub of cards; any other section → left rail + panel. */
const dashHubMode = computed(() => {
  const q = sectionQuery.value;
  return !q || q === 'home';
});

/**
 * Active section for rail + panels — derived from the URL and allowed rail ids.
 * (The old ref + watch could stay empty while ?section= updated, so the hub hid but no panel showed.)
 */
const railActive = computed(() => {
  const q = sectionQuery.value;
  const items = eventRailItems.value;
  if (!q) return '';
  if (q === 'home') return 'home';
  // While items are briefly empty (e.g. detail reload) keep URL-driven section so panels stay visible.
  if (!items.length) return q;
  return items.some((i) => String(i.id) === String(q)) ? q : '';
});

/** Uses My Dashboard / School Portal icon keys (agency overrides in branding). */
function sectionIconUrl(sectionKey) {
  if (sectionKey === 'providers') {
    const school = brandingStore.getSchoolPortalCardIconUrl('providers');
    return school || brandingStore.getDashboardCardIconUrl('staff');
  }
  if (sectionKey === 'clinical_notes') {
    return brandingStore.getDashboardCardIconUrl('supervision', agencyId.value);
  }
  const map = {
    home: 'my',
    schedule: 'my_schedule',
    calendar: 'my_schedule',
    clients: 'clients',
    materials: 'documents',
    'session-details': 'my_schedule',
    'session-virtual': 'communications',
    details: 'checklist',
    'work-schedule': 'momentum_list',
    'my-work': 'my_schedule',
    attendance: 'payroll',
    kiosk: 'payroll',
    'event-chat': 'chats',
    learning: 'training',
    registrations: 'submit'
  };
  const id = map[sectionKey];
  return id ? brandingStore.getDashboardCardIconUrl(id) : '';
}

const eventRailItems = computed(() => {
  const d = detail.value;
  if (!d) return [];
  const v = viewerCaps.value;
  const items = [];
  const push = (id, label, shortLabel, iconKey, ok) => {
    if (!ok) return;
    items.push({
      id,
      label,
      shortLabel: shortLabel || label,
      iconUrl: sectionIconUrl(iconKey)
    });
  };

  push('home', 'Home', 'Home', 'home', true);

  const cal = d.calendar;
  const hasCal = !!(cal && (cal.googleCalendarUrl || cal.icsUrl));
  push('schedule', 'Schedule', 'Schedule', 'schedule', hasCal || !!d.skillsGroup);

  const nProv = (d.providers || []).length;
  push('providers', 'Providers', 'Providers', 'providers', nProv > 0);

  const nCli = (d.clients || []).length;
  push('clients', 'Client Management', 'Clients', 'clients', nCli > 0);

  const role = String(authStore.user?.role || '').toLowerCase();
  const isGuardianPortalUser = role === 'guardian' || role === 'client_guardian';
  const showClinicalAidCard =
    !isGuardianPortalUser &&
    clinicalNotesEnabled.value &&
    !!d.skillsGroup &&
    !!(v.isAssignedProvider || v.canManageTeamSchedules || v.canManageCompanyEvent);
  push('clinical_notes', 'Clinical Aid', 'Aid', 'clinical_notes', showClinicalAidCard);

  push('materials', 'Materials', 'Materials', 'materials', true);

  if (d.event?.registrationEligible) {
    push('registrations', 'Registrations', 'Registrations', 'registrations', true);
  }

  if (d.skillsGroup) {
    push('work-schedule', 'Event Assignments', 'Assign', 'work-schedule', true);
  }

  if (v.isAssignedProvider && agencyId.value) {
    push('my-work', 'My work schedule', 'My work', 'my-work', true);
  }
  if (v.isAssignedProvider || v.canManageTeamSchedules) {
    push('attendance', 'Provider attendance', 'Attendance', 'attendance', true);
  }
  if (d.showKioskClockActions) {
    push('kiosk', 'Kiosk / time', 'Kiosk', 'kiosk', true);
  }

  if (d.event?.learningProgramClassId) {
    push('learning', 'Learning', 'Learning', 'learning', true);
  }

  push('event-chat', 'Event chat', 'Chat', 'event-chat', true);

  return items;
});

/** Keep the current path (params are already in it); only the query changes — avoids named-route param quirks. */
function replaceEventPortalQuery(nextQuery) {
  return router.replace({ path: route.path, query: nextQuery });
}

// When the address bar still has `?section=` but `route.query` lost it (org/bootstrap navigations, etc.), sync router state.
watch(
  () => route.fullPath,
  () => {
    const fromUrl = sectionParamFromUrl();
    const routeS = sectionParamFromRoute();
    if (fromUrl && !routeS) {
      replaceEventPortalQuery({ ...route.query, section: fromUrl });
    }
  },
  { flush: 'post', immediate: true }
);

async function openDashHub() {
  optimisticSection.value = '';
  const next = { ...route.query };
  delete next.section;
  try {
    await replaceEventPortalQuery(next);
  } catch (e) {
    if (!isNavigationFailure(e)) throw e;
  } finally {
    await nextTick();
  }
}

async function selectRailSection(id) {
  const section = String(id ?? '').trim();
  optimisticSection.value = section;
  try {
    await replaceEventPortalQuery({ ...route.query, section });
  } catch (e) {
    if (!isNavigationFailure(e)) throw e;
  } finally {
    await nextTick();
    if (sectionParamFromRoute() === section) {
      optimisticSection.value = '';
    }
  }
}

const legacyRailSection = {
  calendar: 'schedule',
  'session-details': 'schedule',
  details: 'schedule',
  'session-virtual': 'schedule',
  'team-schedule': 'work-schedule',
  discussion: 'event-chat'
};

watch(
  () => [eventRailItems.value, sectionQuery.value],
  () => {
    const items = eventRailItems.value;
    const q = sectionQuery.value;
    const mapped = legacyRailSection[q];
    if (mapped && mapped !== q) {
      replaceEventPortalQuery({ ...route.query, section: mapped });
      return;
    }
    if (!items.length) return;
    if (!q || q === 'home') return;
    if (!items.some((i) => String(i.id) === String(q))) {
      const next = { ...route.query };
      delete next.section;
      replaceEventPortalQuery(next);
    }
  },
  { immediate: true }
);

const canEditClientAttendance = computed(
  () => viewerCaps.value.isAssignedProvider || viewerCaps.value.canManageTeamSchedules
);

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

/** Combine session calendar date (YYYY-MM-DD) + time input value (HH:mm) → ISO UTC for API */
function combineSessionDateAndWallTime(sessionDateYmd, hhmm) {
  const ymd = String(sessionDateYmd || '').trim().slice(0, 10);
  const wall = String(hhmm || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const m = wall.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const [y, mo, d] = ymd.split('-').map(Number);
  if (![y, mo, d].every((n) => Number.isFinite(n))) return null;
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

function syncClientAttTimesFromSelectedSession() {
  const sid = clientAttSessionId.value;
  const s = sessions.value.find((x) => Number(x.id) === Number(sid));
  if (!s) {
    clientAttTimeIn.value = '';
    clientAttTimeOut.value = '';
    return;
  }
  const tIn = formatHm(s.startTime);
  const tOut = formatHm(s.endTime);
  clientAttTimeIn.value = tIn && tIn !== '—' ? tIn : '';
  clientAttTimeOut.value = tOut && tOut !== '—' ? tOut : '';
}

function formatSessionDateDisplay(raw) {
  const s = String(raw || '').trim();
  if (!s) return '—';
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, mo, da] = ymd.split('-').map(Number);
    const d = new Date(y, mo - 1, da);
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return ymd;
  }
  const t = new Date(s);
  if (Number.isFinite(t.getTime())) {
    return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return s;
}

function formatDateOnly(d) {
  if (d == null || d === '') return '—';
  return formatSessionDateDisplay(d);
}

const SESSIONS_TABLE_LIMIT = 50;

const sessionsTableRows = computed(() => sessions.value.slice(0, SESSIONS_TABLE_LIMIT));

const eventAssignmentsUpcoming = computed(() => {
  const today = ymdToday();
  return sessions.value
    .filter((s) => String(s.sessionDate || '').slice(0, 10) >= today)
    .sort((a, b) => String(a.sessionDate || '').localeCompare(String(b.sessionDate || '')));
});

const eventAssignmentsPast = computed(() => {
  const today = ymdToday();
  return sessions.value
    .filter((s) => String(s.sessionDate || '').slice(0, 10) < today)
    .sort((a, b) => String(b.sessionDate || '').localeCompare(String(a.sessionDate || '')));
});

const rosterProviderOptions = computed(() => {
  const list = detail.value?.providers;
  return Array.isArray(list) ? list : [];
});

function providerNameById(pid) {
  const p = rosterProviderOptions.value.find((x) => Number(x.id) === Number(pid));
  return p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() || `#${pid}` : `#${pid}`;
}

function addSessionStaffFromSelect(sessionId, ev) {
  const el = ev?.target;
  if (!el) return;
  const vid = Number(el.value);
  if (!Number.isFinite(vid) || vid <= 0) {
    el.value = '';
    return;
  }
  const cur = sessionStaffDraft[sessionId] ? [...sessionStaffDraft[sessionId]] : [];
  if (!cur.includes(vid)) {
    sessionStaffDraft[sessionId] = [...cur, vid];
  }
  el.value = '';
}

function removeSessionStaff(sessionId, pid) {
  const cur = sessionStaffDraft[sessionId] || [];
  sessionStaffDraft[sessionId] = cur.filter((x) => Number(x) !== Number(pid));
}

const kioskSessionChoices = computed(() => sessions.value.slice(0, 120));

/** Upcoming materialized sessions for this event (Phase 3 — work schedule context). */
const sessionsForWorkSchedulePanel = computed(() => {
  if (!detail.value?.skillsGroup || !sessions.value.length) return [];
  const today = ymdToday();
  return sessions.value
    .filter((s) => String(s.sessionDate || '') >= today)
    .slice(0, 24)
    .map((s) => ({
      sessionDate: s.sessionDate,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      assignedSummary: formatSessionAssignedStaff(s)
    }));
});

function formatSessionAssignedStaff(s) {
  const ap = s?.assignedProviders;
  if (!Array.isArray(ap) || !ap.length) return '—';
  return ap.map((p) => `${p.firstName || ''} ${p.lastName || ''}`.trim() || `#${p.id}`).join(', ');
}

function syncSessionStaffDraft() {
  for (const key of Object.keys(sessionStaffDraft)) {
    delete sessionStaffDraft[key];
  }
  for (const s of sessions.value) {
    const ids = Array.isArray(s.assignedProviders)
      ? s.assignedProviders.map((p) => p.id).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    sessionStaffDraft[s.id] = [...ids];
  }
}

async function saveSessionStaff(sessionId) {
  if (!agencyId.value || !eventId.value) return;
  sessionStaffSavingId.value = sessionId;
  try {
    const raw = sessionStaffDraft[sessionId];
    const providerUserIds = Array.isArray(raw)
      ? raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const res = await api.put(
      `/skill-builders/events/${eventId.value}/sessions/${sessionId}/providers`,
      { agencyId: agencyId.value, providerUserIds },
      { skipGlobalLoading: true }
    );
    const next = res.data?.assignedProviders;
    const idx = sessions.value.findIndex((x) => x.id === sessionId);
    if (idx >= 0 && Array.isArray(next)) {
      sessions.value[idx] = { ...sessions.value[idx], assignedProviders: next };
    }
    syncSessionStaffDraft();
    sessionStaffFlash.value = 'Event assignments saved for this session.';
    if (sessionStaffFlashTimer) window.clearTimeout(sessionStaffFlashTimer);
    sessionStaffFlashTimer = window.setTimeout(() => {
      sessionStaffFlash.value = '';
      sessionStaffFlashTimer = null;
    }, 5000);
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to save staff');
  } finally {
    sessionStaffSavingId.value = null;
  }
}

function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdAddDays(ymd, delta) {
  const [y, mo, da] = String(ymd || '').split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (!Number.isFinite(dt.getTime())) return ymdToday();
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

async function loadSessions() {
  sessionsLoadError.value = '';
  if (!agencyId.value || !eventId.value || !detail.value?.skillsGroup) {
    sessions.value = [];
    sessionsLoadAttempted.value = false;
    return;
  }
  sessionsLoading.value = true;
  sessionsLoadAttempted.value = true;
  try {
    const sg = detail.value.skillsGroup;
    let from = ymdAddDays(ymdToday(), -7);
    let to = ymdAddDays(ymdToday(), 365);
    const sd = sg?.startDate != null ? String(sg.startDate).slice(0, 10) : '';
    const ed = sg?.endDate != null ? String(sg.endDate).slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(sd) && sd < from) from = sd;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ed) && ed > to) to = ed;
    const res = await api.get(`/skill-builders/events/${eventId.value}/sessions`, {
      params: { agencyId: agencyId.value, from, to },
      skipGlobalLoading: true
    });
    sessions.value = Array.isArray(res.data?.sessions) ? res.data.sessions : [];
    syncSessionStaffDraft();
  } catch (e) {
    sessions.value = [];
    syncSessionStaffDraft();
    const msg = e.response?.data?.error?.message || e.message || '';
    sessionsLoadError.value = msg
      ? `Could not load sessions: ${msg}`
      : 'Could not load sessions. Check your connection or try again.';
  } finally {
    sessionsLoading.value = false;
  }
}

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_ABBR = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun'
};

function wallHmToDisplay(hm) {
  const s = String(hm || '').slice(0, 5);
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s === '—' ? '' : s;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s;
  const d = new Date(2000, 0, 1, h, mi, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDisplayTime(t) {
  if (t == null || t === '') return '—';
  return wallHmToDisplay(formatHm(String(t)));
}

/** Kiosk / attendance session dropdown: short local date + 12-hour wall times (no ISO / military). */
function formatSessionKioskLabel(s) {
  if (!s) return '';
  const datePart = formatSessionDateDisplay(s.sessionDate);
  const dayAbbr = String(s.weekday || '').slice(0, 3);
  const st = wallHmToDisplay(formatHm(s.startTime));
  const et = wallHmToDisplay(formatHm(s.endTime));
  const timePart = `${dayAbbr} ${st}–${et}`;
  if (s.sessionLabel) {
    return `${s.sessionLabel} · ${datePart} · ${timePart}`;
  }
  return `${datePart} · ${timePart}`;
}

function formatWeekdayList(days) {
  const uniq = [...new Set((days || []).map((d) => String(d || '').trim()).filter(Boolean))];
  uniq.sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
  return uniq.map((d) => WEEKDAY_ABBR[d] || d.slice(0, 3)).join(' & ');
}

/** Compact "Tue & Thu 3:15 PM–4:15 PM" lines for the page subtitle. */
function summarizeMeetingsSubtitle(meetings) {
  if (!Array.isArray(meetings) || !meetings.length) return '';
  const bySlot = new Map();
  for (const row of meetings) {
    const st = formatHm(row.startTime);
    const et = formatHm(row.endTime);
    const key = `${st}-${et}`;
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key).push(row.weekday);
  }
  const chunks = [];
  for (const [key, days] of bySlot.entries()) {
    const dashIdx = key.indexOf('-');
    const st = key.slice(0, dashIdx);
    const et = key.slice(dashIdx + 1);
    const dayStr = formatWeekdayList(days);
    const range = `${wallHmToDisplay(st)}–${wallHmToDisplay(et)}`;
    chunks.push(`${dayStr} ${range}`);
  }
  return chunks.join('; ');
}

const headerSubtitle = computed(() => {
  const parts = [];
  const d = detail.value;
  const ev = d?.event;
  const sg = d?.skillsGroup;
  const meetings = d?.meetings;

  if (sg && ev?.startsAt) {
    const tz = String(ev.timezone || '').trim();
    const a = new Date(ev.startsAt);
    const b = new Date(ev.endsAt || 0);
    if (Number.isFinite(a.getTime())) {
      let dateSpan = '';
      try {
        if (tz) {
          const df = new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: 'medium' });
          dateSpan = `${df.format(a)} – ${Number.isFinite(b.getTime()) ? df.format(b) : ''}`;
        } else {
          dateSpan = `${a.toLocaleDateString(undefined, { dateStyle: 'medium' })} – ${Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}`;
        }
      } catch {
        dateSpan = `${a.toLocaleDateString(undefined, { dateStyle: 'medium' })} – ${Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}`;
      }
      if (dateSpan) parts.push(`Program ${dateSpan}`);
    }
    const weekly = summarizeMeetingsSubtitle(meetings);
    if (weekly) parts.push(weekly);
  } else if (ev?.startsAt) {
    const a = new Date(ev.startsAt);
    const b = new Date(ev.endsAt || 0);
    if (Number.isFinite(a.getTime())) {
      const opt = { dateStyle: 'medium', timeStyle: 'short' };
      try {
        parts.push(
          `${a.toLocaleString(undefined, opt)} – ${Number.isFinite(b.getTime()) ? b.toLocaleString(undefined, opt) : ''}`
        );
      } catch {
        parts.push(String(ev.startsAt || ''));
      }
    }
  }

  if (sg) {
    parts.push(`${sg.schoolName} · ${sg.name}`);
  }

  return parts.filter(Boolean).join(' · ');
});

const roleLower = computed(() => String(authStore.user?.role || '').toLowerCase());

/** Matches `SCHEDULE_HUB_ROLES` (buildings / full schedule chooser). */
const canOpenScheduleHub = computed(() =>
  ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff', 'provider_plus'].includes(roleLower.value)
);

/** Matches dashboard “open Skill Builders programs” from schedule (coordinator, staff, eligible provider, etc.). */
const canOpenSkillBuildersEventsOverlay = computed(() => {
  const r = roleLower.value;
  if (['super_admin', 'admin', 'staff', 'support'].includes(r)) return true;
  const coord =
    authStore.user?.has_skill_builder_coordinator_access === true ||
    authStore.user?.has_skill_builder_coordinator_access === 1 ||
    authStore.user?.has_skill_builder_coordinator_access === '1';
  if (coord) return true;
  const elig =
    authStore.user?.skill_builder_eligible === true ||
    authStore.user?.skill_builder_eligible === 1 ||
    authStore.user?.skill_builder_eligible === '1';
  const providerLike = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(r);
  return !!(elig && providerLike);
});

const scheduleHubHref = computed(() => {
  const s = organizationSlug.value;
  if (!s || !canOpenScheduleHub.value) return null;
  return `/${s}/schedule`;
});

const skillBuildersEventsOverlayHref = computed(() => {
  const s = organizationSlug.value;
  if (!s || !canOpenSkillBuildersEventsOverlay.value) return null;
  return `/${s}/admin/skill-builders-program-events`;
});

const canEditEventInPortal = computed(
  () => !!detail.value?.canManageCompanyEvent && agencyId.value > 0 && eventId.value > 0
);

const copyHint = ref('');

function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
    return;
  }
  if (dashboardHref.value) router.push(dashboardHref.value);
  else if (programEventsHref.value) router.push(programEventsHref.value);
}
const clockBusy = ref(false);
const clockMessage = ref('');

const chatThreadId = ref(null);
const chatLoading = ref(false);
const chatError = ref('');
const chatMessages = ref([]);
const chatDraft = ref('');
const chatSending = ref(false);

const providerAttendance = ref([]);
const clientAttendance = ref([]);
const clientAttSessionId = ref(0);
/** Selected roster client ids for manual attendance (checkbox group) */
const clientAttSelectedClientIds = ref([]);
/** Wall times (HH:mm) combined with selected session’s sessionDate when saving */
const clientAttTimeIn = ref('');
const clientAttTimeOut = ref('');
const clientAttSig = ref('');
const clientAttSaving = ref(false);
/** After roster first loads, avoid auto “select all” again if the user cleared selection */
const clientAttDidInitSelection = ref(false);

const clientAttSelectedCount = computed(() => clientAttSelectedClientIds.value.length);

const joinNowTick = ref(0);
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    joinNowTick.value += 1;
  }, 15000);
}

function sessionJoinVisible(s) {
  void joinNowTick.value;
  if (!s?.joinUrl) return false;
  const mod = String(s.modality || '').toLowerCase();
  if (mod !== 'virtual' && mod !== 'hybrid') return false;
  const st = new Date(s.startsAt);
  const en = new Date(s.endsAt);
  if (!Number.isFinite(st.getTime()) || !Number.isFinite(en.getTime())) return false;
  const t = Date.now();
  return t >= st.getTime() - 10 * 60 * 1000 && t <= en.getTime();
}

function formatWhen(startsAt, endsAt) {
  const a = new Date(startsAt || 0);
  const b = new Date(endsAt || 0);
  if (!Number.isFinite(a.getTime())) return '';
  const opt = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    return `${a.toLocaleString(undefined, opt)} – ${Number.isFinite(b.getTime()) ? b.toLocaleString(undefined, opt) : ''}`;
  } catch {
    return String(startsAt || '');
  }
}

function formatPostTime(t) {
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(t || '');
  }
}

/** Pair clock_in / clock_out rows per user for Skill Builders kiosk punches. */
function pairKioskPunchesByUser(punchList) {
  const sorted = [...(punchList || [])].sort(
    (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime()
  );
  const byUser = new Map();
  for (const p of sorted) {
    const uid = Number(p.userId);
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(p);
  }
  const lines = [];
  for (const [uid, pts] of byUser) {
    const name = providerNameById(uid);
    let openIn = null;
    for (const p of pts) {
      const t = String(p.punchType || '').toLowerCase();
      if (t === 'clock_in') {
        openIn = p;
      } else if (t === 'clock_out') {
        lines.push({
          name,
          inAt: openIn ? formatPostTime(openIn.punchedAt) : null,
          outAt: formatPostTime(p.punchedAt),
          payrollId: p.payrollTimeClaimId != null ? Number(p.payrollTimeClaimId) : null
        });
        openIn = null;
      }
    }
    if (openIn) {
      lines.push({
        name,
        inAt: formatPostTime(openIn.punchedAt),
        outAt: null,
        payrollId: null
      });
    }
  }
  return lines;
}

function sessionKioskPunchLines(sessionId) {
  const sid = Number(sessionId);
  const list = (providerAttendance.value || []).filter((p) => Number(p.sessionId) === sid);
  return pairKioskPunchesByUser(list);
}

const orphanKioskPunchLines = computed(() => {
  const list = (providerAttendance.value || []).filter((p) => !p.sessionId || Number(p.sessionId) === 0);
  return pairKioskPunchesByUser(list);
});

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sessionDateLabelForPunch(sessionId) {
  if (!sessionId) return '';
  const s = sessions.value.find((x) => Number(x.id) === Number(sessionId));
  return s?.sessionDate ? String(s.sessionDate).slice(0, 10) : '';
}

function exportEventClockCsv() {
  const title = detail.value?.event?.title || 'Skill Builders event';
  const rows = [
    ['Event', 'UserId', 'Provider', 'PunchType', 'PunchedAt', 'SessionId', 'SessionDate', 'PayrollClaimId']
  ];
  for (const p of providerAttendance.value || []) {
    rows.push([
      title,
      p.userId,
      providerNameById(p.userId),
      p.punchType,
      p.punchedAt ? new Date(p.punchedAt).toISOString() : '',
      p.sessionId ?? '',
      sessionDateLabelForPunch(p.sessionId),
      p.payrollTimeClaimId ?? ''
    ]);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skill-builders-event-${eventId.value}-clock-punches.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function absoluteUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function copyGoogleCalendarLink() {
  const url = detail.value?.calendar?.googleCalendarUrl;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copyHint.value = 'Google Calendar link copied.';
  } catch {
    copyHint.value = 'Could not copy—select the link manually.';
  }
  window.setTimeout(() => {
    copyHint.value = '';
  }, 4000);
}

async function copyShareBlurb() {
  const title = detail.value?.event?.title || 'Skill Builders event';
  const when = formatWhen(detail.value?.event?.startsAt, detail.value?.event?.endsAt);
  const g = detail.value?.calendar?.googleCalendarUrl || '';
  const ics = detail.value?.calendar?.icsUrl ? absoluteUrl(detail.value.calendar.icsUrl) : '';
  const lines = [title, when, g ? `Google Calendar: ${g}` : null, ics ? `ICS: ${ics}` : null].filter(Boolean);
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    copyHint.value = 'Share text copied (title, times, calendar links).';
  } catch {
    copyHint.value = 'Could not copy.';
  }
  window.setTimeout(() => {
    copyHint.value = '';
  }, 4000);
}

async function loadAttendance() {
  if (!agencyId.value || !eventId.value) return;
  try {
    const [pr, cr] = await Promise.all([
      api.get(`/skill-builders/events/${eventId.value}/attendance/providers`, {
        params: { agencyId: agencyId.value },
        skipGlobalLoading: true
      }),
      api.get(`/skill-builders/events/${eventId.value}/attendance/clients`, {
        params: { agencyId: agencyId.value },
        skipGlobalLoading: true
      })
    ]);
    providerAttendance.value = Array.isArray(pr.data?.punches) ? pr.data.punches : [];
    clientAttendance.value = Array.isArray(cr.data?.attendance) ? cr.data.attendance : [];
  } catch {
    providerAttendance.value = [];
    clientAttendance.value = [];
  }
}

function clientLabelForRow(c) {
  if (!c) return '';
  return c.initials || c.identifierCode || `Client #${c.id}`;
}

/**
 * Deep-link from the event roster: agency staff / coordinators go straight to Client management (Events / groups).
 * Providers and others use the school portal client view when we know the school slug.
 */
function rosterClientLinkTo(c) {
  const cid = Number(c?.id || 0);
  if (!Number.isFinite(cid) || cid <= 0) return null;

  const r = roleLower.value;
  const staffLike = ['super_admin', 'admin', 'staff', 'support'].includes(r);
  const coord =
    authStore.user?.has_skill_builder_coordinator_access === true ||
    authStore.user?.has_skill_builder_coordinator_access === 1 ||
    String(authStore.user?.has_skill_builder_coordinator_access || '').toLowerCase() === 'true';
  const preferAgencyClientUi = staffLike || coord;

  const agencyPortal = String(detail.value?.agencyPortalSlug || '')
    .trim()
    .toLowerCase();
  const schoolSlug = String(detail.value?.skillsGroup?.schoolSlug || '')
    .trim()
    .toLowerCase();
  const cur = String(organizationSlug.value || '')
    .trim()
    .toLowerCase();

  const adminClientsQuery = { clientId: String(cid), tab: 'skill-builders' };

  if (preferAgencyClientUi) {
    if (agencyPortal) {
      return { path: `/${agencyPortal}/admin/clients`, query: adminClientsQuery };
    }
    return { path: '/admin/clients', query: adminClientsQuery };
  }

  if (schoolSlug) {
    return { path: `/${schoolSlug}/dashboard`, query: { clientId: String(cid) } };
  }
  if (agencyPortal) {
    return { path: `/${agencyPortal}/admin/clients`, query: { clientId: String(cid) } };
  }
  if (cur) {
    return { path: `/${cur}/dashboard`, query: { clientId: String(cid) } };
  }
  return { path: '/admin/clients', query: { clientId: String(cid) } };
}

function attendanceRowsForClient(cid) {
  return clientAttendance.value.filter((a) => Number(a.clientId) === Number(cid));
}

function selectAllClientsForAttendance() {
  const list = detail.value?.clients;
  if (!Array.isArray(list) || !list.length) return;
  clientAttSelectedClientIds.value = list.map((c) => Number(c.id)).filter((id) => Number.isFinite(id) && id > 0);
}

function clearClientsForAttendance() {
  clientAttSelectedClientIds.value = [];
}

async function saveClientAttendance() {
  const clientIds = clientAttSelectedClientIds.value
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!agencyId.value || !eventId.value || !clientAttSessionId.value || !clientIds.length) return;
  clientAttSaving.value = true;
  try {
    const sess = sessions.value.find((x) => Number(x.id) === Number(clientAttSessionId.value));
    const base = {
      agencyId: agencyId.value,
      manualEntry: true
    };
    if (sess?.sessionDate && clientAttTimeIn.value) {
      const isoIn = combineSessionDateAndWallTime(sess.sessionDate, clientAttTimeIn.value);
      if (isoIn) base.checkInAt = isoIn;
    }
    if (sess?.sessionDate && clientAttTimeOut.value) {
      const isoOut = combineSessionDateAndWallTime(sess.sessionDate, clientAttTimeOut.value);
      if (isoOut) base.checkOutAt = isoOut;
    }
    if (clientAttSig.value.trim()) base.signatureText = clientAttSig.value.trim();

    const errors = [];
    for (const clientId of clientIds) {
      try {
        await api.put(
          `/skill-builders/events/${eventId.value}/sessions/${clientAttSessionId.value}/client-attendance`,
          { ...base, clientId },
          { skipGlobalLoading: true }
        );
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message || 'Failed';
        errors.push({ clientId, msg });
      }
    }
    await loadAttendance();
    if (errors.length) {
      const detailMsg = errors.map((e) => `#${e.clientId}: ${e.msg}`).join('\n');
      window.alert(
        `Saved ${clientIds.length - errors.length} of ${clientIds.length}.\n\n` + detailMsg
      );
    }
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to save');
  } finally {
    clientAttSaving.value = false;
  }
}

async function loadDetail() {
  if (!agencyId.value || !eventId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/skill-builders/events/${eventId.value}/detail`, {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    detail.value = res.data;
    await loadSessions();
    await loadAttendance();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    detail.value = null;
    sessions.value = [];
  } finally {
    loading.value = false;
  }
}

async function clockIn() {
  if (!agencyId.value || !eventId.value) return;
  clockBusy.value = true;
  clockMessage.value = '';
  try {
    const body = { agencyId: agencyId.value };
    if (kioskSessionId.value) body.sessionId = kioskSessionId.value;
    if (kioskClientId.value) body.clientId = kioskClientId.value;
    await api.post(`/skill-builders/events/${eventId.value}/kiosk/clock-in`, body, { skipGlobalLoading: true });
    clockMessage.value = 'Clocked in. Your punch is recorded for this event.';
    await loadAttendance();
  } catch (e) {
    clockMessage.value = e.response?.data?.error?.message || e.message || 'Failed';
  } finally {
    clockBusy.value = false;
  }
}

async function clockOut() {
  if (!agencyId.value || !eventId.value) return;
  clockBusy.value = true;
  clockMessage.value = '';
  try {
    const res = await api.post(
      `/skill-builders/events/${eventId.value}/kiosk/clock-out`,
      { agencyId: agencyId.value },
      { skipGlobalLoading: true }
    );
    const d = res.data?.directHours;
    const ind = res.data?.indirectHours;
    const wh = res.data?.workedHours;
    const claimId = res.data?.payrollTimeClaimId || '';
    const parts = [
      'Clocked out successfully.',
      claimId ? `Time submitted to payroll (claim #${claimId}).` : 'Payroll claim pending.',
      `Direct ${d ?? '—'}h · indirect ${ind ?? '—'}h`,
      wh != null && wh !== '' ? ` · worked ${wh}h` : ''
    ];
    clockMessage.value = parts.filter(Boolean).join(' ');
    await loadAttendance();
  } catch (e) {
    clockMessage.value = e.response?.data?.error?.message || e.message || 'Failed';
  } finally {
    clockBusy.value = false;
  }
}

async function ensureChatAndLoad() {
  if (!agencyId.value || !eventId.value) return;
  chatLoading.value = true;
  chatError.value = '';
  try {
    const r = await api.get(`/skill-builders/events/${eventId.value}/chat-thread`, {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    chatThreadId.value = r.data?.threadId ? Number(r.data.threadId) : null;
    if (!chatThreadId.value) {
      chatError.value = 'Chat thread not available';
      chatMessages.value = [];
      return;
    }
    const m = await api.get(`/chat/threads/${chatThreadId.value}/messages`, {
      params: { limit: 120 },
      skipGlobalLoading: true
    });
    chatMessages.value = Array.isArray(m.data) ? m.data : [];
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || e.message || 'Chat unavailable';
    chatMessages.value = [];
  } finally {
    chatLoading.value = false;
  }
}

async function sendChat() {
  const tid = chatThreadId.value;
  const body = String(chatDraft.value || '').trim();
  if (!tid || !body) return;
  chatSending.value = true;
  try {
    await api.post(`/chat/threads/${tid}/messages`, { body }, { skipGlobalLoading: true });
    chatDraft.value = '';
    const m = await api.get(`/chat/threads/${tid}/messages`, { params: { limit: 120 }, skipGlobalLoading: true });
    chatMessages.value = Array.isArray(m.data) ? m.data : [];
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || e.message || 'Send failed';
  } finally {
    chatSending.value = false;
  }
}

watch(
  () => [agencyId.value, eventId.value],
  () => {
    kioskSessionId.value = 0;
    kioskClientId.value = 0;
    clientAttSessionId.value = 0;
    clientAttSelectedClientIds.value = [];
    clientAttDidInitSelection.value = false;
    clientAttTimeIn.value = '';
    clientAttTimeOut.value = '';
    clientAttSig.value = '';
    loadDetail();
    ensureChatAndLoad();
  },
  { immediate: true }
);

watch(
  sessions,
  (list) => {
    if (Array.isArray(list) && list.length && !clientAttSessionId.value) {
      clientAttSessionId.value = list[0].id;
    }
  },
  { immediate: true }
);

watch(
  () => [clientAttSessionId.value, sessions.value],
  () => {
    syncClientAttTimesFromSelectedSession();
  },
  { immediate: true }
);

watch(
  () => detail.value?.clients,
  (list) => {
    if (!Array.isArray(list) || !list.length) {
      clientAttSelectedClientIds.value = [];
      clientAttDidInitSelection.value = false;
      return;
    }
    const validIds = list.map((c) => Number(c.id)).filter((id) => Number.isFinite(id) && id > 0);
    const valid = new Set(validIds);
    clientAttSelectedClientIds.value = clientAttSelectedClientIds.value.filter((id) => valid.has(Number(id)));
    if (!clientAttDidInitSelection.value && clientAttSelectedClientIds.value.length === 0) {
      clientAttSelectedClientIds.value = validIds.slice();
      clientAttDidInitSelection.value = true;
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.sbep-wrap {
  min-height: calc(100vh - 48px);
}
.sbep-main {
  width: 100%;
  min-width: 0;
}
.sbep-state {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 16px;
}
.sbep-hub {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 8px 16px 32px;
}
.sbep-hub-tagline {
  text-align: center;
  margin: 0 0 16px;
  max-width: 28rem;
  margin-left: auto;
  margin-right: auto;
}
.sbep-hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 14px;
  justify-content: center;
}
.sbep-hub-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 18px 14px 16px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  font: inherit;
  color: var(--text-primary, #0f172a);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;
}
.sbep-hub-card:hover {
  border-color: rgba(15, 118, 110, 0.45);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
  transform: translateY(-2px);
}
.sbep-hub-card:focus-visible {
  outline: 2px solid var(--primary, #0f766e);
  outline-offset: 2px;
}
.sbep-hub-ico-wrap {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(15, 118, 110, 0.08);
  border: 1px solid var(--border, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sbep-hub-ico {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.sbep-hub-card-title {
  font-weight: 800;
  font-size: 0.88rem;
  line-height: 1.25;
  color: var(--primary, #0f766e);
}
.sbep-hub-card-hint {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}
.sbep-rail-column {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.sbep-hub-back {
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--primary, #0f766e);
  cursor: pointer;
  width: 100%;
  max-width: 104px;
  line-height: 1.2;
  transition: background 0.15s ease;
}
.sbep-hub-back:hover {
  background: #f8fafc;
}
.sbep-hub-back-arr {
  margin-right: 4px;
}
.sbep-home-meta {
  margin: 0 0 12px;
  padding-left: 1.1rem;
}
.sbep-home-links {
  margin-top: 12px;
}

.sbep-dash-layout {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 2px 24px;
}
.sbep-rail {
  flex: 0 0 88px;
  position: sticky;
  top: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-radius: 16px;
  background: rgba(15, 118, 110, 0.08);
  border: 1px solid var(--border, #e2e8f0);
}
.sbep-rail-item {
  border: none;
  background: transparent;
  padding: 0;
  border-radius: 10px;
  cursor: pointer;
  display: grid;
  gap: 4px;
  place-items: center;
  width: 100%;
  color: var(--text-secondary, #64748b);
  transition: color 0.15s ease, transform 0.12s ease;
}
.sbep-rail-item:hover {
  color: var(--primary, #0f766e);
  transform: translateY(-1px);
}
.sbep-rail-item.active {
  color: var(--primary, #0f766e);
  transform: none;
}
.sbep-rail-ico-wrap {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.sbep-rail-item.active .sbep-rail-ico-wrap {
  border-color: rgba(15, 118, 110, 0.45);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.sbep-rail-ico {
  width: 30px;
  height: 30px;
  object-fit: contain;
}
.sbep-rail-lbl {
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
  max-width: 84px;
  padding: 0 2px;
}
.sbep-rail-content {
  flex: 1;
  min-width: 0;
}
.sbep-portal-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  max-width: 880px;
  margin: 0 auto;
  padding: 0 2px 24px;
}
.sbep-portal-grid.sbep-dash {
  max-width: none;
  margin: 0;
  padding: 0;
}
@media (min-width: 1100px) {
  .sbep-portal-grid.sbep-dash {
    max-width: none;
  }
}
@media (max-width: 560px) {
  .sbep-hub-grid {
    grid-template-columns: 1fr;
  }
  .sbep-dash-layout {
    flex-direction: column;
  }
  .sbep-rail-column {
    flex-direction: row;
    flex-wrap: wrap;
    width: 100%;
    justify-content: flex-start;
    align-items: flex-start;
  }
  .sbep-hub-back {
    max-width: none;
    width: auto;
  }
  .sbep-rail {
    position: static;
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    width: 100%;
    justify-content: flex-start;
    gap: 8px;
    padding: 8px;
  }
  .sbep-rail-item {
    flex: 0 0 auto;
    min-width: 64px;
  }
  .sbep-rail-lbl {
    font-size: 0.6rem;
    max-width: 72px;
  }
}
.sbep-span-2 {
  grid-column: 1 / -1;
}
.sbep-portal-card {
  padding: 18px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.sbep-portal-card:hover {
  border-color: rgba(15, 118, 110, 0.35);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.sbep-card-title {
  margin: 0 0 8px;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sbep-card-lead {
  margin: 0 0 12px;
  line-height: 1.45;
}
.sbep-inline-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sbep-clock-msg {
  margin-top: 10px;
}
.sbep-post-btn {
  margin-top: 8px;
}
.sbep-sessions-table-wrap {
  overflow-x: auto;
}
.sbep-sessions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.sbep-sessions-table th,
.sbep-sessions-table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  vertical-align: middle;
}
.sbep-sessions-date {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.sbep-sessions-time {
  white-space: nowrap;
}
.sbep-sessions-table th {
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.sbep-sessions-staff-cell {
  min-width: 180px;
}
.sbep-staff-compact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 420px;
}
.sbep-staff-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.sbep-staff-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  font-size: 0.8rem;
  line-height: 1.25;
  background: #f0fdfa;
  border: 1px solid rgba(15, 118, 110, 0.35);
  border-radius: 999px;
  color: var(--primary, #0f766e);
}
.sbep-staff-chip-remove {
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 2px;
}
.sbep-staff-chip-remove:hover:not(:disabled) {
  color: #b91c1c;
}
.sbep-staff-add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.sbep-staff-add-select {
  flex: 1;
  min-width: 140px;
  max-width: 220px;
  font-size: 0.82rem;
  padding: 4px 8px;
}
.sbep-session-staff-save {
  flex-shrink: 0;
}
.sbep-roster-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 560px) {
  .sbep-roster-cols {
    grid-template-columns: 1fr;
  }
}
.sbep-roster-sub {
  margin: 0 0 6px;
  font-size: 0.82rem;
  font-weight: 700;
}
.sbep-roster-list {
  margin-top: 0;
}
.sbep-sessions-staff-read {
  font-size: 0.86rem;
  line-height: 1.35;
}
.sbep-crumb {
  font-size: 0.85rem;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.sbep-crumb a {
  color: var(--primary, #0f766e);
  font-weight: 600;
  text-decoration: none;
}
.sbep-crumb a:hover {
  text-decoration: underline;
}
.sbep-crumb-sep {
  opacity: 0.55;
}
.sbep-nav-hint {
  margin: 0;
  font-size: 0.8rem;
  max-width: 260px;
  line-height: 1.35;
}
.sbep-calendar-card .sbep-card-title {
  margin-top: 0;
}
.sbep-calendar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.sbep-copy-hint {
  margin: 10px 0 0;
}
.sbep-chat-msgs {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: min(40vh, 320px);
  overflow-y: auto;
}
.sbep-chat-li {
  padding: 8px 0;
  border-bottom: 1px solid #e2e8f0;
}
.sbep-chat-meta {
  font-size: 0.72rem;
  color: var(--text-secondary, #64748b);
}
.sbep-chat-body {
  margin-top: 4px;
  white-space: pre-wrap;
  font-size: 0.88rem;
}
.sbep-chat-send {
  margin-top: 8px;
}
.sbep-list {
  margin: 8px 0 16px;
  padding-left: 1.2rem;
}
.sbep-posts {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}
.sbep-post {
  padding: 10px 0;
  border-bottom: 1px solid #e2e8f0;
}
.sbep-post-meta {
  font-size: 0.8rem;
  color: var(--text-secondary, #64748b);
}
.sbep-post-body {
  margin-top: 4px;
  white-space: pre-wrap;
}
.sbep-label {
  display: block;
  font-size: 0.85rem;
  margin-bottom: 6px;
}
.sbep-join-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sbep-join-li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
  font-size: 0.9rem;
}
.sbep-att-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.88rem;
}
.sbep-att-list li {
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
}
.sbep-client-li {
  margin-bottom: 10px;
}
.sbep-client-att-sub {
  list-style: disc;
  margin: 6px 0 0 1rem;
  padding: 0;
}
.sbep-manual-att {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed var(--border, #e2e8f0);
}
.sbep-manual-att-times-note {
  margin: 0 0 10px;
  line-height: 1.4;
}
.sbep-client-att-picker {
  margin-bottom: 12px;
}
.sbep-client-att-picker-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.sbep-label-inline {
  margin: 0;
}
.sbep-client-att-picker-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sbep-client-att-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: #fafafa;
}
.sbep-client-att-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  font-size: 0.88rem;
  line-height: 1.35;
  margin: 0;
}
.sbep-client-att-row input {
  margin-top: 3px;
  flex-shrink: 0;
}
.sbep-roster-client-link {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.sbep-roster-client-link:hover,
.sbep-roster-client-link:focus-visible {
  text-decoration: none;
  color: inherit;
  opacity: 0.88;
}
.sbep-sched-block {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.sbep-sched-block:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
.sbep-client-mgmt-session-bar {
  margin: 4px 0 14px;
  max-width: min(100%, 420px);
}
.sbep-roster-summary-block {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.sbep-roster-summary-heading {
  margin-bottom: 8px;
}
.sbep-client-mgmt-attendance-only {
  margin-top: 0;
  max-width: min(100%, 520px);
}
.sbep-roster-table-wrap {
  overflow: auto;
  margin-top: 6px;
}
.sbep-roster-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.sbep-roster-table th,
.sbep-roster-table td {
  border-bottom: 1px solid var(--border, #e5e7eb);
  padding: 8px 8px 8px 0;
  text-align: left;
  vertical-align: top;
}
.sbep-roster-table th {
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  font-size: 0.82rem;
}
.sbep-roster-docs {
  color: var(--primary, #0f766e);
  font-weight: 600;
  white-space: nowrap;
}
.sbep-roster-att {
  line-height: 1.45;
}
.sbep-roster-missing {
  opacity: 0.45;
}
.sbep-subh {
  margin: 0 0 10px;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}
.muted {
  color: var(--text-secondary, #64748b);
}
.error-box {
  color: #b91c1c;
  padding: 12px;
  background: #fef2f2;
  border-radius: 8px;
}
.sbep-assign-export {
  margin-bottom: 10px;
}
.sbep-flash-ok {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #ecfdf5;
  border: 1px solid rgba(15, 118, 110, 0.35);
  color: #0f766e;
  font-size: 0.88rem;
  font-weight: 600;
}
.sbep-assign-past {
  margin-top: 18px;
  padding: 12px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #f8fafc;
}
.sbep-assign-past-summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--primary, #0f766e);
  list-style: none;
}
.sbep-assign-past-summary::-webkit-details-marker {
  display: none;
}
.sbep-assign-past[open] .sbep-assign-past-summary {
  margin-bottom: 12px;
}
.sbep-assign-past-table {
  margin-top: 8px;
}
.sbep-kiosk-cell {
  min-width: 160px;
  max-width: 280px;
  font-size: 0.82rem;
  vertical-align: top;
}
.sbep-kiosk-cell-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sbep-kiosk-cell-list li + li {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border, #e2e8f0);
}
.sbep-kiosk-name {
  font-weight: 600;
  display: block;
  margin-bottom: 2px;
}
.sbep-orphan-punches {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px dashed var(--border, #e2e8f0);
}
</style>
